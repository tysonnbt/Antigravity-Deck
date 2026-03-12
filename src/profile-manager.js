// === Profile Manager — swap Antigravity IDE Google accounts by renaming 3 data folders ===
const os = require('os');
const fs = require('fs');
const path = require('path');
const { exec, spawn } = require('child_process');
const { getSettings, saveSettings } = require('./config');

const PS_PATH = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');

// 3 folders that hold account-specific data (OAuth, Gemini cache, extensions)
const SWAP_FOLDERS = [
    { name: 'Antigravity', source: () => path.join(process.env.APPDATA || '', 'Antigravity') },
    { name: '.gemini', source: () => path.join(os.homedir(), '.gemini') },
    { name: '.antigravity', source: () => path.join(os.homedir(), '.antigravity') },
];

let _swapping = false; // mutex to prevent concurrent swaps

// Move directory: try rename first, fallback to robocopy+delete for locked dirs
function moveDirSync(src, dst) {
    try {
        fs.renameSync(src, dst);
    } catch (err) {
        if (err.code === 'EXDEV' || err.code === 'EPERM' || err.code === 'EBUSY') {
            // Fallback: copy then delete (handles locked files better)
            fs.mkdirSync(dst, { recursive: true });
            fs.cpSync(src, dst, { recursive: true, force: true });
            fs.rmSync(src, { recursive: true, force: true, maxRetries: 3, retryDelay: 1000 });
            return;
        }
        throw err;
    }
}

// Move directory with retry (handles EPERM from lingering file locks)
async function moveDirWithRetry(src, dst, maxRetries = 5) {
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
            moveDirSync(src, dst);
            return;
        } catch (err) {
            if ((err.code === 'EPERM' || err.code === 'EBUSY') && attempt < maxRetries) {
                const delay = 2000 + attempt * 2000;
                console.log(`[!] Profile swap: ${err.code} on "${path.basename(src)}", retry ${attempt + 1}/${maxRetries} in ${delay / 1000}s...`);
                await killJavaZombies();
                await new Promise(r => setTimeout(r, delay));
                continue;
            }
            throw err;
        }
    }
}

function getProfilesDir() {
    const settings = getSettings();
    return settings.profilesDir || path.join(process.env.APPDATA || os.homedir(), 'AntigravityDeck', 'profiles');
}

// --- List all profile directories ---
function listProfiles() {
    const dir = getProfilesDir();
    if (!fs.existsSync(dir)) return [];
    return fs.readdirSync(dir, { withFileTypes: true })
        .filter(d => d.isDirectory())
        .map(d => d.name)
        .sort();
}

// --- Current active profile from settings ---
function getActiveProfile() {
    return getSettings().activeProfile || null;
}

// --- Run PowerShell command, return stdout ---
function runPs(cmd, timeout = 10000) {
    return new Promise((resolve, reject) => {
        exec(`"${PS_PATH}" -NoProfile -Command "${cmd}"`, { timeout }, (err, stdout, stderr) => {
            if (err) return reject(new Error(stderr || err.message));
            resolve(stdout.trim());
        });
    });
}

// --- Graceful close IDE via CloseMainWindow(), capture exe path ---
// CRITICAL: NEVER force kill — it destroys OAuth tokens (DPAPI flush interrupted)
async function gracefulCloseIde() {
    // Capture exe path before closing
    let exePath = null;
    try {
        exePath = await runPs(
            `(Get-Process -Name Antigravity -ErrorAction SilentlyContinue | Where-Object { $_.Path }).Path | Select-Object -First 1`
        );
    } catch { /* process may not be running */ }

    // Check if IDE is running at all
    let processCount = 0;
    try {
        const cnt = await runPs(`(Get-Process -Name Antigravity -ErrorAction SilentlyContinue).Count`);
        processCount = parseInt(cnt) || 0;
    } catch { /* OK */ }

    if (processCount === 0) {
        console.log('[*] Profile swap: IDE not running, skipping close');
        return exePath;
    }

    // Step 1: Send WM_CLOSE via CloseMainWindow (graceful)
    console.log(`[*] Profile swap: sending graceful close to ${processCount} Antigravity processes...`);
    try {
        await runPs(
            `Get-Process -Name Antigravity -ErrorAction SilentlyContinue | Where-Object { $_.MainWindowHandle -ne 0 } | ForEach-Object { $_.CloseMainWindow() } | Out-Null`
        );
    } catch { /* no processes found is OK */ }

    // Step 2: Poll until all exit (up to 30s — must be patient for token flush)
    const deadline = Date.now() + 30000;
    while (Date.now() < deadline) {
        try {
            const remaining = await runPs(`(Get-Process -Name Antigravity -ErrorAction SilentlyContinue).Count`);
            if (!remaining || remaining === '0') {
                console.log('[*] Profile swap: IDE closed gracefully');
                await new Promise(r => setTimeout(r, 1000)); // extra wait for file handle release
                return exePath;
            }
        } catch { break; }
        await new Promise(r => setTimeout(r, 1000));
    }

    // Step 3: If still alive after 30s → FAIL, don't force kill
    let stillAlive = 0;
    try {
        const cnt = await runPs(`(Get-Process -Name Antigravity -ErrorAction SilentlyContinue).Count`);
        stillAlive = parseInt(cnt) || 0;
    } catch { /* OK */ }

    if (stillAlive > 0) {
        throw new Error(
            `IDE did not close within 30s (${stillAlive} processes remaining). ` +
            `Please close Antigravity IDE manually (Ctrl+Q or click X), then try again. ` +
            `Force killing would destroy your login tokens.`
        );
    }

    await new Promise(r => setTimeout(r, 1000));
    return exePath;
}

// --- Kill Java zombie processes that hold locks on .antigravity/ ---
async function killJavaZombies() {
    try {
        await runPs(
            `Get-CimInstance Win32_Process -Filter "Name='java.exe'" | Where-Object { $_.CommandLine -match '\\.antigravity' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }`,
            5000
        );
    } catch { /* no zombies = OK */ }
    // Also try broader match for java processes in antigravity directory
    try {
        await runPs(
            `Get-CimInstance Win32_Process -Filter "Name='java.exe'" | Where-Object { $_.CommandLine -match 'antigravity' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }`,
            5000
        );
    } catch { /* OK */ }
}

// --- Swap 3 folders between current state and profile dirs, with rollback ---
async function swapFolders(currentProfile, targetProfile) {
    const profilesDir = getProfilesDir();
    const currentDir = path.join(profilesDir, currentProfile);
    const targetDir = path.join(profilesDir, targetProfile);

    // Ensure current profile dir exists for saving
    fs.mkdirSync(currentDir, { recursive: true });

    // Ensure target profile dir exists
    if (!fs.existsSync(targetDir)) {
        throw new Error(`Target profile "${targetProfile}" not found in profiles directory`);
    }

    // Phase A: move current folders → currentProfile dir (save current state)
    const movedToCurrent = [];
    try {
        for (const f of SWAP_FOLDERS) {
            const src = f.source();
            const dst = path.join(currentDir, f.name);
            if (fs.existsSync(src)) {
                await moveDirWithRetry(src, dst);
                movedToCurrent.push({ src, dst });
            }
        }
    } catch (err) {
        // Rollback phase A
        for (const m of movedToCurrent) {
            try { moveDirSync(m.dst, m.src); } catch { /* best effort */ }
        }
        throw new Error(`Failed saving current profile: ${err.message}`);
    }

    // Phase B: move target folders → original locations (restore target state)
    const movedFromTarget = [];
    try {
        for (const f of SWAP_FOLDERS) {
            const src = path.join(targetDir, f.name);
            const dst = f.source();
            if (fs.existsSync(src)) {
                await moveDirWithRetry(src, dst);
                movedFromTarget.push({ src, dst });
            }
        }
    } catch (err) {
        // Rollback phase B
        for (const m of movedFromTarget) {
            try { moveDirSync(m.dst, m.src); } catch { /* best effort */ }
        }
        // Also rollback phase A
        for (const m of movedToCurrent) {
            try { moveDirSync(m.dst, m.src); } catch { /* best effort */ }
        }
        throw new Error(`Failed restoring target profile: ${err.message}`);
    }
}

// --- Relaunch Antigravity IDE ---
function relaunchIde(exePath) {
    const fallback = path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Antigravity', 'Antigravity.exe');
    const exe = (exePath && fs.existsSync(exePath)) ? exePath : fallback;
    if (!fs.existsSync(exe)) {
        console.warn('[!] Profile swap: IDE exe not found, skipping relaunch');
        return false;
    }
    spawn(exe, [], { detached: true, stdio: 'ignore' }).unref();
    return true;
}

// --- Validate profile name ---
function validateProfileName(name) {
    if (!name || typeof name !== 'string') throw new Error('Profile name is required');
    if (!/^[a-zA-Z0-9_-]+$/.test(name)) throw new Error('Invalid profile name (only alphanumeric, dash, underscore)');
    if (name.length > 50) throw new Error('Profile name too long (max 50 chars)');
}

// --- Main orchestrator: swap to a target profile ---
async function swapProfile(targetProfile) {
    if (_swapping) throw new Error('Profile swap already in progress');
    validateProfileName(targetProfile);

    let currentProfile = getActiveProfile();

    // If no active profile (we're in "adding" state after startAddAccount),
    // the current IDE has unsaved account data — need to save it first
    if (!currentProfile) {
        throw new Error('No active profile. You are in "Add Account" mode — save the current account first before swapping.');
    }

    if (currentProfile === targetProfile) throw new Error(`Already on profile "${targetProfile}"`);

    const profiles = listProfiles();
    if (!profiles.includes(targetProfile)) throw new Error(`Profile "${targetProfile}" not found`);

    _swapping = true;
    try {
        console.log(`[*] Profile swap: ${currentProfile} → ${targetProfile}`);
        // Broadcast swapping state BEFORE closing IDE so frontend shows swap UI
        try {
            const { broadcastAll } = require('./ws');
            broadcastAll({ type: 'status', detected: false, swapping: true, from: currentProfile, to: targetProfile });
            console.log('[WS] status broadcast: swapping=true');
        } catch { }
        const exePath = await gracefulCloseIde();
        await killJavaZombies();
        await swapFolders(currentProfile, targetProfile);
        saveSettings({ activeProfile: targetProfile });
        const relaunched = relaunchIde(exePath);
        console.log(`[*] Profile swap complete: now on "${targetProfile}" (relaunch: ${relaunched})`);
        // Broadcast swap done so frontend clears swap UI once IDE re-detected
        try {
            const { broadcastAll } = require('./ws');
            broadcastAll({ type: 'swap_complete', profile: targetProfile });
        } catch { }
        return { success: true, previousProfile: currentProfile, activeProfile: targetProfile, relaunched };
    } finally {
        _swapping = false;
    }
}

// --- Check if an email is already saved under another profile ---
function findProfileByEmail(email) {
    if (!email) return null;
    const profiles = listProfiles();
    for (const p of profiles) {
        const meta = getProfileMetadata(p);
        if (meta && meta.email && meta.email.toLowerCase() === email.toLowerCase()) return p;
    }
    return null;
}

// --- Save current IDE state as a named profile (copies 3 folders + metadata) ---
function createProfile(name, metadata = null, { force = false } = {}) {
    validateProfileName(name);
    const dir = path.join(getProfilesDir(), name);
    if (fs.existsSync(dir)) throw new Error(`Profile "${name}" already exists`);

    // Duplicate account detection
    if (!force && metadata?.email) {
        const existing = findProfileByEmail(metadata.email);
        if (existing) throw new Error(`Account "${metadata.email}" is already saved as profile "${existing}". Use force=true to save anyway.`);
    }

    fs.mkdirSync(dir, { recursive: true });

    // Copy current 3 folders into profile (snapshot current account)
    // Skip cache/temp dirs that are locked by running IDE
    const SKIP_DIRS = new Set(['Network', 'GPUCache', 'GrShaderCache', 'ShaderCache', 'Service Worker', 'Cache_Data', 'Code Cache']);
    const filterCopy = (src) => {
        const base = path.basename(src);
        return !SKIP_DIRS.has(base);
    };

    let copied = 0;
    for (const f of SWAP_FOLDERS) {
        const src = f.source();
        if (fs.existsSync(src)) {
            try {
                fs.cpSync(src, path.join(dir, f.name), { recursive: true, filter: filterCopy });
            } catch (err) {
                // If filter didn't help, try copy with error tolerance (skip locked files)
                if (err.code === 'EPERM' || err.code === 'EBUSY' || err.code === 'EPIPE') {
                    console.warn(`[!] Profile create: partial copy of ${f.name} (some files locked by IDE)`);
                    // Partial copy is OK — essential auth data is in Local State + Cookies, not in cache dirs
                } else {
                    throw err;
                }
            }
            copied++;
        }
    }

    // Block save when no folders were copied
    if (copied === 0) {
        fs.rmSync(dir, { recursive: true, force: true });
        throw new Error('No IDE data folders found to save. Make sure Antigravity IDE has been opened at least once.');
    }

    // Save account metadata for display
    if (metadata) {
        fs.writeFileSync(path.join(dir, 'profile.json'), JSON.stringify(metadata, null, 2), 'utf-8');
    }

    saveSettings({ activeProfile: name });
    return { created: true, copied, message: `Saved current account as "${name}"` };
}

// --- Read profile metadata ---
function getProfileMetadata(name) {
    const metaPath = path.join(getProfilesDir(), name, 'profile.json');
    if (!fs.existsSync(metaPath)) return null;
    try { return JSON.parse(fs.readFileSync(metaPath, 'utf-8')); } catch { return null; }
}

// --- Delete a profile ---
function deleteProfile(name) {
    const active = getActiveProfile();
    if (name === active) throw new Error('Cannot delete the active profile. Swap to another first.');
    const dir = path.join(getProfilesDir(), name);
    if (!fs.existsSync(dir)) throw new Error(`Profile "${name}" not found`);
    fs.rmSync(dir, { recursive: true, force: true });
    return { deleted: true, message: `Profile "${name}" deleted` };
}

// --- Start "Add New Account" flow: save current → clear folders → launch fresh IDE ---
async function startAddAccount() {
    if (_swapping) throw new Error('Profile operation already in progress');
    const currentProfile = getActiveProfile();
    if (!currentProfile) throw new Error('No active profile set. Save your current account first.');

    _swapping = true;
    try {
        console.log(`[*] Add account: saving "${currentProfile}" → launching fresh IDE`);
        const exePath = await gracefulCloseIde();
        await killJavaZombies();

        // Save current folders to active profile dir
        const profilesDir = getProfilesDir();
        const currentDir = path.join(profilesDir, currentProfile);
        fs.mkdirSync(currentDir, { recursive: true });
        for (const f of SWAP_FOLDERS) {
            const src = f.source();
            const dst = path.join(currentDir, f.name);
            if (fs.existsSync(src)) {
                if (fs.existsSync(dst)) fs.rmSync(dst, { recursive: true, force: true });
                await moveDirWithRetry(src, dst);
            }
        }

        // Now folders are empty — IDE will launch fresh (ask for Google login)
        const relaunched = relaunchIde(exePath);
        saveSettings({ activeProfile: null }); // no profile active — in "adding" state
        console.log(`[*] Add account: IDE launched fresh, waiting for user login`);
        return { success: true, previousProfile: currentProfile, relaunched, message: 'IDE launched with fresh state. Log into your new Google account, then click "Save Account".' };
    } finally {
        _swapping = false;
    }
}

// --- Cancel add account: restore previous profile ---
async function cancelAddAccount(previousProfile) {
    if (!previousProfile) throw new Error('No previous profile to restore');
    const profilesDir = getProfilesDir();
    const prevDir = path.join(profilesDir, previousProfile);
    if (!fs.existsSync(prevDir)) throw new Error(`Previous profile "${previousProfile}" not found`);

    _swapping = true;
    try {
        const exePath = await gracefulCloseIde();
        await killJavaZombies();

        // Remove any fresh-login folders
        for (const f of SWAP_FOLDERS) {
            const p = f.source();
            if (fs.existsSync(p)) fs.rmSync(p, { recursive: true, force: true });
        }

        // Restore previous profile
        for (const f of SWAP_FOLDERS) {
            const src = path.join(prevDir, f.name);
            const dst = f.source();
            if (fs.existsSync(src)) {
                moveDirSync(src, dst);
            }
        }

        saveSettings({ activeProfile: previousProfile });
        const relaunched = relaunchIde(exePath);
        return { success: true, activeProfile: previousProfile, relaunched };
    } finally {
        _swapping = false;
    }
}

function isSwapping() { return _swapping; }

module.exports = { listProfiles, getActiveProfile, swapProfile, createProfile, deleteProfile, getProfileMetadata, findProfileByEmail, startAddAccount, cancelAddAccount, isSwapping };
