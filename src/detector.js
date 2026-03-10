// === Language Server Auto-Detection ===
const { exec } = require('child_process');
const https = require('https');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { lsConfig, lsInstances, platform } = require('./config');

// Auto-detect Language Server process (macOS/Linux/Windows)
async function detectLanguageServers() {
    return new Promise((resolve) => {
        let cmd;
        if (platform === 'win32') {
            const tmpScript = path.join(os.tmpdir(), '_ls_detect.ps1');
            fs.writeFileSync(tmpScript,
                "Get-CimInstance Win32_Process | Where-Object { $_.Name -like '*language_server*' } | Select-Object ProcessId, CommandLine | Format-List\n"
            );
            // Use full path — powershell may not be in PATH (e.g. Git Bash, some RDP sessions)
            const ps = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
            cmd = `"${ps}" -ExecutionPolicy Bypass -NoProfile -File "${tmpScript}"`;
        } else {
            cmd = `ps aux | grep 'language_server' | grep -v grep`;
        }

        exec(cmd, { timeout: 10000 }, (err, stdout) => {
            if (err || !stdout.trim()) {
                console.log('[!] Language server not found');
                resolve([]);
                return;
            }

            const instances = [];

            if (platform === 'win32') {
                const blocks = stdout.split(/\r?\n\r?\n/);
                for (const block of blocks) {
                    if (!block.trim()) continue;
                    const pidMatch = block.match(/ProcessId\s*:\s*(\d+)/);
                    const csrfMatch = block.match(/--csrf_token\s+([a-f0-9-]+)/);
                    const wsMatch = block.match(/--workspace_id\s+(\S+)/);
                    if (pidMatch && csrfMatch) {
                        instances.push({
                            pid: pidMatch[1],
                            csrfToken: csrfMatch[1],
                            workspaceId: wsMatch ? wsMatch[1] : null
                        });
                    }
                }
            } else {
                stdout.split('\n').forEach(line => {
                    if (!line.trim()) return;
                    const pidMatch = line.match(/\S+\s+(\d+)/);
                    const csrfMatch = line.match(/--csrf_token\s+([a-f0-9-]+)/);
                    const wsMatch = line.match(/--workspace_id\s+(\S+)/);
                    if (pidMatch && csrfMatch) {
                        instances.push({
                            pid: pidMatch[1],
                            csrfToken: csrfMatch[1],
                            workspaceId: wsMatch ? wsMatch[1] : null
                        });
                    }
                });
            }

            console.log(`[*] Found ${instances.length} language server instance(s)`);
            instances.forEach(inst => {
                console.log(`    PID: ${inst.pid}, CSRF: ${inst.csrfToken.substring(0, 8)}..., workspace: ${inst.workspaceId || 'none'}`);
            });
            resolve(instances);
        });
    });
}

async function detectPorts(pid) {
    return new Promise((resolve) => {
        let cmd;
        if (platform === 'win32') {
            cmd = `netstat -ano | findstr "${pid}" | findstr "LISTENING"`;
        } else {
            cmd = `lsof -iTCP -sTCP:LISTEN -P -n -p ${pid} 2>/dev/null`;
        }

        exec(cmd, { timeout: 5000 }, (err, stdout) => {
            if (err || !stdout.trim()) { resolve([]); return; }
            const ports = [];
            stdout.split('\n').forEach(line => {
                if (!line.trim()) return;
                if (platform === 'win32') {
                    const m = line.match(/:(\d+)\s+.*LISTENING/);
                    if (m) ports.push(parseInt(m[1]));
                } else {
                    const cols = line.trim().split(/\s+/);
                    if (cols.length >= 2 && cols[1] === String(pid)) {
                        const m = line.match(/:(\d+)\s+\(LISTEN\)/);
                        if (m) ports.push(parseInt(m[1]));
                    }
                }
            });
            ports.sort((a, b) => a - b);
            resolve(ports);
        });
    });
}

// Try HTTPS first (LS typically uses self-signed cert), then fall back to HTTP
async function findApiPort(ports, csrfToken) {
    if (!ports || !ports.length || !csrfToken) return null;
    const headers = { 'Content-Type': 'application/json', 'Connect-Protocol-Version': '1', 'X-Codeium-Csrf-Token': csrfToken };
    for (const port of ports) {
        try {
            const agent = new https.Agent({ rejectUnauthorized: false });
            const res = await fetch(`https://127.0.0.1:${port}/exa.language_server_pb.LanguageServerService/GetUserStatus`, {
                method: 'POST', headers, body: '{}', signal: AbortSignal.timeout(3000), agent
            });
            if (res.ok) { console.log(`[✓] API responding on port ${port} (HTTPS)`); return { port, useTls: true }; }
        } catch (e) { }
        try {
            const res = await fetch(`http://localhost:${port}/exa.language_server_pb.LanguageServerService/GetUserStatus`, {
                method: 'POST', headers, body: '{}', signal: AbortSignal.timeout(3000)
            });
            if (res.ok) { console.log(`[✓] API responding on port ${port} (HTTP)`); return { port, useTls: false }; }
        } catch (e) { }
    }
    return null;
}

// Helper: get workspace name + category + folderUri from LS instance via GetWorkspaceInfos API
async function getWorkspaceInfo(port, csrfToken, useTls, workspaceId) {
    try {
        const protocol = useTls ? 'https' : 'http';
        const host = useTls ? '127.0.0.1' : 'localhost';
        const opts = {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Connect-Protocol-Version': '1', 'X-Codeium-Csrf-Token': csrfToken },
            body: '{}',
            signal: AbortSignal.timeout(5000)
        };
        if (useTls) opts.agent = new https.Agent({ rejectUnauthorized: false });
        const res = await fetch(`${protocol}://${host}:${port}/exa.language_server_pb.LanguageServerService/GetWorkspaceInfos`, opts);
        if (!res.ok) return { name: 'unknown', category: 'workspace', folderUri: null };
        const data = await res.json();
        const uris = (data.workspaceInfos || []).map(w => w.workspaceUri);
        if (uris.length > 0) {
            const uri = uris[0];
            const decoded = decodeURIComponent(uri);
            const parts = decoded.replace(/\/$/, '').split('/');
            const name = parts[parts.length - 1] || 'unknown';
            const isPlayground = decoded.includes('antigravity/playground') || decoded.includes('ag_skills');
            return { name, category: isPlayground ? 'playground' : 'workspace', folderUri: uri };
        }
    } catch { }

    // Fallback: derive URI from workspaceId process arg
    // Windows: "file_c_3A_Users_johndoe_Projects_MyProject" → "file:///c:/Users/johndoe/Projects/MyProject"
    // macOS:   "file__Users_johndoe_Projects_MyProject"     → "file:///Users/johndoe/Projects/MyProject"
    if (workspaceId) {
        let decoded;
        if (/_3A_/.test(workspaceId)) {
            // Windows-style: has drive letter encoding
            decoded = workspaceId
                .replace(/^file_/, 'file:///')
                .replace(/_3A_/, ':/')
                .replace(/_/g, '/');
        } else {
            // macOS/Linux-style: no drive letter
            decoded = workspaceId
                .replace(/^file_/, 'file://')
                .replace(/_/g, '/');
        }
        const parts = decoded.replace(/\/$/, '').split('/');
        const name = parts[parts.length - 1] || 'unknown';
        const isPlayground = decoded.includes('antigravity/playground') || decoded.includes('ag_skills');
        return { name, category: isPlayground ? 'playground' : 'workspace', folderUri: decoded };
    }

    return { name: 'unknown', category: 'workspace', folderUri: null };
}

// Initialize: detect ALL LS instances, resolve ports, connect to first one
async function init(onReady) {
    console.log(`[*] Detecting Language Server on ${platform}...`);
    const instances = await detectLanguageServers();

    if (!instances.length) {
        console.log('[!] No language server instances found');
        return;
    }

    // Resolve ports for ALL instances and store them (dedup by workspaceFolderUri)
    lsInstances.length = 0;
    const seenFolderUris = new Set();
    for (const inst of instances) {
        const ports = await detectPorts(inst.pid);
        if (!ports.length) continue;

        const result = await findApiPort(ports, inst.csrfToken);
        if (result) {
            const { name, category, folderUri } = await getWorkspaceInfo(result.port, inst.csrfToken, result.useTls, inst.workspaceId);
            // Skip instances with no workspace folder (idle/detached LS processes)
            if (!folderUri) {
                console.log(`[~] Skipping detached LS (no workspace): PID ${inst.pid}`);
                continue;
            }
            // Skip duplicate folder URIs (e.g. two LS processes for same workspace)
            if (seenFolderUris.has(folderUri)) {
                console.log(`[~] Skipping duplicate workspace: ${name} (PID: ${inst.pid}, same folder as existing)`);
                continue;
            }
            if (folderUri) seenFolderUris.add(folderUri);
            lsInstances.push({
                pid: inst.pid,
                csrfToken: inst.csrfToken,
                workspaceId: inst.workspaceId,
                workspaceName: name,
                workspaceFolderUri: folderUri,
                category,
                port: result.port,
                useTls: result.useTls,
                active: false
            });
        }
    }

    if (lsInstances.length === 0) {
        console.log('[!] Could not find working API port on any instance');
        return;
    }

    // Activate first instance
    switchToInstance(0);
    if (onReady) onReady();
}

// Switch active connection to a different LS instance
function switchToInstance(index) {
    if (index < 0 || index >= lsInstances.length) return false;

    // Deactivate all
    lsInstances.forEach(i => i.active = false);

    // Activate selected
    const inst = lsInstances[index];
    inst.active = true;
    lsConfig.port = inst.port;
    lsConfig.csrfToken = inst.csrfToken;
    lsConfig.detected = true;
    lsConfig.useTls = inst.useTls;

    console.log(`[✓] Switched to: ${inst.workspaceName} (PID: ${inst.pid}, Port: ${inst.port})`);
    return true;
}

// Periodic re-scan for new LS instances (every 10s)
const RESCAN_INTERVAL = 10000;
let rescanTimer = null;

function startAutoRescan() {
    if (rescanTimer) clearInterval(rescanTimer);
    rescanTimer = setInterval(rescanNow, RESCAN_INTERVAL);
}

async function rescanNow() {
    try {
        const instances = await detectLanguageServers();
        const knownPids = new Set(lsInstances.map(i => i.pid));
        let changed = false;

        for (const inst of instances) {
            if (knownPids.has(inst.pid)) continue; // already known

            const ports = await detectPorts(inst.pid);
            if (!ports.length) continue;

            const result = await findApiPort(ports, inst.csrfToken);
            if (result) {
                const { name, category, folderUri } = await getWorkspaceInfo(result.port, inst.csrfToken, result.useTls, inst.workspaceId);
                // Skip instances with no workspace folder (idle/detached LS processes)
                if (!folderUri) {
                    console.log(`[~] Skipping detached LS (no workspace): PID ${inst.pid}`);
                    continue;
                }
                // Dedup: if same workspaceFolderUri already exists, replace the old one (PID may have changed after restart)
                const existingIdx = folderUri ? lsInstances.findIndex(i => i.workspaceFolderUri === folderUri && i.pid !== inst.pid) : -1;
                if (existingIdx >= 0) {
                    const old = lsInstances[existingIdx];
                    console.log(`[~] Replacing stale workspace: ${old.workspaceName} (PID: ${old.pid} → ${inst.pid})`);
                    const wasActive = old.active;
                    lsInstances[existingIdx] = {
                        pid: inst.pid,
                        csrfToken: inst.csrfToken,
                        workspaceId: inst.workspaceId,
                        workspaceName: name,
                        workspaceFolderUri: folderUri,
                        category,
                        port: result.port,
                        useTls: result.useTls,
                        active: wasActive
                    };
                    if (wasActive) switchToInstance(existingIdx);
                    changed = true;
                } else {
                    lsInstances.push({
                        pid: inst.pid,
                        csrfToken: inst.csrfToken,
                        workspaceId: inst.workspaceId,
                        workspaceName: name,
                        workspaceFolderUri: folderUri,
                        category,
                        port: result.port,
                        useTls: result.useTls,
                        active: false
                    });
                    changed = true;
                    console.log(`[+] New workspace detected: ${name} (PID: ${inst.pid}, Port: ${result.port})`);
                }
            }
        }

        // Also remove instances whose PID no longer exists
        for (let i = lsInstances.length - 1; i >= 0; i--) {
            if (!instances.find(inst => inst.pid === lsInstances[i].pid)) {
                const removed = lsInstances[i];
                console.log(`[-] Workspace gone: ${removed.workspaceName} (PID: ${removed.pid})`);
                // If this was the active instance, switch to another
                if (removed.active && lsInstances.length > 1) {
                    const nextIdx = i === 0 ? 1 : 0;
                    switchToInstance(nextIdx > i ? nextIdx - 1 : nextIdx);
                }
                lsInstances.splice(i, 1);
                changed = true;
            }
        }

        // Notify frontend when workspace list changes
        if (changed) {
            try {
                const { broadcastAll } = require('./ws');
                broadcastAll({ type: 'conversations_updated' });
            } catch { }
        }
    } catch { }
}

// --- Instance resolution helpers ---

function getInstanceByName(name) {
    const { lsInstances } = require('./config');
    return lsInstances.find(i => i.workspaceName.toLowerCase() === name.toLowerCase()) || null;
}

function getFirstActiveInstance() {
    const { lsInstances } = require('./config');
    return lsInstances.find(i => i.active) || lsInstances[0] || null;
}

module.exports = { detectLanguageServers, detectPorts, findApiPort, init, switchToInstance, startAutoRescan, getInstanceByName, getFirstActiveInstance };

