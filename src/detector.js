// === Language Server Auto-Detection (Antigravity 2.0.11 "hub" model) ===
//
// Antigravity 2.0.11 no longer spawns one language_server per workspace folder.
// It runs a SINGLE standalone "hub" language server:
//   language_server.exe --standalone --subclient_type hub ... --csrf_token <uuid>
// with NO --workspace_id. Workspaces are tracked on the hub via AddTrackedWorkspace
// and listed by GetWorkspaceInfos (workspace_infos[].workspace_uri). Cascades are
// global (GetAllCascadeTrajectories returns all, each tagged with its workspace URI).
//
// We keep the rest of the app unchanged by modelling each tracked workspace as a
// "virtual" LS instance that SHARES the hub's connection (pid/port/csrf/useTls) but
// carries its own workspaceName + workspaceFolderUri. getInstanceByName / lsInstances
// keep their old shape and contract — only the way we POPULATE them changed.
const { exec } = require('child_process');
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { lsConfig, lsInstances, platform } = require('./config');

// Node 18+ native fetch() (Undici) silently ignores https.Agent — rejectUnauthorized
// never takes effect. Use http/https.request() directly so self-signed certs work.
function connectPost(url, headers, body, timeoutMs = 3000) {
    return new Promise((resolve, reject) => {
        const parsed = new URL(url);
        const isHttps = parsed.protocol === 'https:';
        const transport = isHttps ? https : http;
        const opts = {
            hostname: parsed.hostname.replace(/^\[|\]$/g, ''), // strip IPv6 brackets
            port: parsed.port,
            path: parsed.pathname,
            method: 'POST',
            headers: { ...headers, 'Content-Length': Buffer.byteLength(body) },
            timeout: timeoutMs,
        };
        if (isHttps) opts.rejectUnauthorized = false;

        const req = transport.request(opts, (res) => {
            const chunks = [];
            res.on('data', c => chunks.push(c.toString()));
            res.on('end', () => {
                resolve({
                    ok: res.statusCode >= 200 && res.statusCode < 300,
                    status: res.statusCode,
                    statusText: res.statusMessage,
                    text: () => Promise.resolve(chunks.join('')),
                    json: () => Promise.resolve(JSON.parse(chunks.join(''))),
                });
            });
        });
        req.on('error', reject);
        req.on('timeout', () => { req.destroy(); reject(new Error('TimeoutError')); });
        req.write(body);
        req.end();
    });
}

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
            // macOS/Linux fallback: if 'language_server' not found, try 'csrf_token'
            // (Antigravity uses binary name 'antigravity_tools', not 'language_server')
            if (platform !== 'win32' && (err || !stdout.trim())) {
                exec(`ps aux | grep 'csrf_token' | grep -v grep`, { timeout: 10000 }, (err2, stdout2) => {
                    if (err2 || !stdout2.trim()) {
                        console.log('[!] Language server not found');
                        resolve([]);
                        return;
                    }
                    parseAndResolve(stdout2);
                });
                return;
            }

            if (err || !stdout.trim()) {
                console.log('[!] Language server not found');
                resolve([]);
                return;
            }

            parseAndResolve(stdout);
        });

        function parseAndResolve(stdout) {

            const instances = [];

            // Antigravity 2.0.11 launches the hub with double-dash space-separated
            // flags: "--csrf_token <uuid>" (NOT single-dash or "=" form). Keep this
            // regex in sync with the real process command line.
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

            console.log(`[*] Found ${instances.length} language server process(es)`);
            instances.forEach(inst => {
                console.log(`    PID: ${inst.pid}, CSRF: ${inst.csrfToken.substring(0, 8)}..., workspace: ${inst.workspaceId || 'none (hub)'}`);
            });
            resolve(instances);
        }
    });
}

// Try HTTPS first (LS typically uses self-signed cert), then fall back to HTTP
async function detectPorts(pid) {
    return new Promise((resolve) => {
        let cmd;
        if (platform === 'win32') {
            // netstat -ano: ~29ms vs PowerShell ~1250ms
            cmd = `netstat -ano`;
        } else {
            cmd = `lsof -iTCP -sTCP:LISTEN -P -n -p ${pid} 2>/dev/null`;
        }

        const { exec } = require('child_process');
        exec(cmd, { timeout: 5000 }, (err, stdout) => {
            if (err || !stdout.trim()) { resolve([]); return; }
            const ports = [];
            const pidStr = String(pid);
            stdout.split('\n').forEach(line => {
                if (!line.trim()) return;
                if (platform === 'win32') {
                    // "  TCP    0.0.0.0:42150    0.0.0.0:0    LISTENING    12345"
                    // Or on some locales: "  TCP    0.0.0.0:42150    0.0.0.0:0    ĐANG NGHE    12345"
                    // We just split by whitespace and check if the last token matches the PID
                    const parts = line.trim().split(/\s+/);
                    if (parts.length >= 4 && parts[parts.length - 1] === pidStr) {
                        const addrPort = parts[1]; // "0.0.0.0:42150"
                        if (addrPort) {
                           const port = parseInt(addrPort.split(':').pop(), 10);
                           if (!isNaN(port)) ports.push(port);
                        }
                    }
                } else {
                    const cols = line.trim().split(/\s+/);
                    if (cols.length >= 2 && cols[1] === String(pid)) {
                        const m = line.match(/:(\d+)\s+\(LISTEN\)/);
                        if (m) ports.push(parseInt(m[1]));
                    }
                }
            });
            ports.sort((a, b) => a - b);
            resolve([...new Set(ports)]); // Return unique ports only
        });
    });
}

// Try Connect protocol (gRPC-Web/JSON) on all address variants.
// Fix for issue #68: Windows LS may bind ::1 (IPv6) instead of 127.0.0.1 (IPv4).
// Fix for issue #86: Uses connectPost() instead of fetch() — native fetch() silently
// ignores https.Agent so rejectUnauthorized never took effect on self-signed certs.
async function findApiPort(ports, csrfToken) {
    if (!ports || !ports.length || !csrfToken) return null;
    const headers = { 'Content-Type': 'application/json', 'Connect-Protocol-Version': '1', 'X-Codeium-Csrf-Token': csrfToken };
    const endpoint = '/exa.language_server_pb.LanguageServerService/GetUserStatus';

    const probes = [
        { label: 'HTTPS/IPv4',    url: (p) => `https://127.0.0.1:${p}${endpoint}`,  tls: true },
        { label: 'HTTP/localhost', url: (p) => `http://localhost:${p}${endpoint}`,    tls: false },
        { label: 'HTTPS/IPv6',    url: (p) => `https://[::1]:${p}${endpoint}`,       tls: true },
        { label: 'HTTP/IPv6',     url: (p) => `http://[::1]:${p}${endpoint}`,        tls: false },
    ];

    for (const port of ports) {
        console.log(`[~] Probing port ${port} (${probes.length} strategies)...`);
        for (const probe of probes) {
            try {
                const res = await connectPost(probe.url(port), headers, '{}', 3000);
                if (res.ok) {
                    console.log(`[✓] API on port ${port} (${probe.label})`);
                    return { port, useTls: probe.tls };
                }
                console.log(`[~] Port ${port} ${probe.label}: responded ${res.status} ${res.statusText}`);
            } catch (err) {
                const reason = err?.cause?.code || err?.code || err?.message || String(err);
                console.log(`[~] Port ${port} ${probe.label}: ${reason}`);
            }
        }
    }
    return null;
}

// === Hub state & virtual workspace instances ===

// The single hub connection: { pid, csrfToken, port, useTls }. null when no hub.
let hubInstance = null;
// Guard so init() and rescanNow() never mutate hub state concurrently.
let scanInProgress = false;

// Derive a workspace display name + category from a file:// workspace URI.
function deriveWorkspaceFromUri(uri) {
    const decoded = decodeURIComponent(uri || '');
    const parts = decoded.replace(/\/+$/, '').split('/');
    const name = parts[parts.length - 1] || 'workspace';
    const isPlayground = decoded.includes('antigravity/playground') || decoded.includes('ag_skills');
    return { name, category: isPlayground ? 'playground' : 'workspace' };
}

// Build a virtual LS instance for a workspace URI, backed by the hub's connection.
// uri === null produces an untagged hub instance (used when no workspace is selected).
function virtualInstance(hub, uri, active = false) {
    const { name, category } = uri
        ? deriveWorkspaceFromUri(uri)
        : { name: `Hub-${hub.pid}`, category: 'workspace' };
    return {
        pid: hub.pid,
        csrfToken: hub.csrfToken,
        workspaceId: null,
        workspaceName: name,
        workspaceFolderUri: uri || `detached://${hub.pid}`,
        category,
        port: hub.port,
        useTls: hub.useTls,
        isHub: true,
        active,
    };
}

// Query the hub for the list of currently tracked workspace URIs (GetWorkspaceInfos).
async function getTrackedWorkspaceUris(hub) {
    try {
        const protocol = hub.useTls ? 'https' : 'http';
        const host = hub.useTls ? '127.0.0.1' : 'localhost';
        const headers = { 'Content-Type': 'application/json', 'Connect-Protocol-Version': '1', 'X-Codeium-Csrf-Token': hub.csrfToken };
        const url = `${protocol}://${host}:${hub.port}/exa.language_server_pb.LanguageServerService/GetWorkspaceInfos`;
        const res = await connectPost(url, headers, '{}', 5000);
        if (!res.ok) return [];
        const data = await res.json();
        return (data.workspaceInfos || []).map(w => w.workspaceUri).filter(Boolean);
    } catch {
        return [];
    }
}

// Locate the hub process among detected LS processes and resolve its API port.
async function locateHub() {
    const procs = await detectLanguageServers();
    for (const proc of procs) {
        const ports = await detectPorts(proc.pid);
        if (!ports.length) continue;
        const result = await findApiPort(ports, proc.csrfToken);
        if (result) {
            return { pid: proc.pid, csrfToken: proc.csrfToken, port: result.port, useTls: result.useTls };
        }
    }
    return null;
}

// Rebuild lsInstances (virtual workspaces) from a list of tracked workspace URIs.
// Preserves the previously-active workspace by name when possible.
function rebuildInstances(hub, uris) {
    const prevActiveName = (lsInstances.find(i => i.active) || {}).workspaceName;
    // Dedup URIs case-insensitively (hub may report duplicates)
    const seen = new Set();
    const unique = [];
    for (const uri of uris) {
        const key = decodeURIComponent(uri).toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        unique.push(uri);
    }
    lsInstances.length = 0;
    for (const uri of unique) lsInstances.push(virtualInstance(hub, uri, false));

    // Restore active selection (or default to the first workspace)
    let activeIdx = prevActiveName
        ? lsInstances.findIndex(i => i.workspaceName === prevActiveName)
        : -1;
    if (activeIdx < 0 && lsInstances.length > 0) activeIdx = 0;
    if (activeIdx >= 0) lsInstances[activeIdx].active = true;
}

function setHub(hub) {
    hubInstance = hub;
    lsConfig.port = hub.port;
    lsConfig.csrfToken = hub.csrfToken;
    lsConfig.useTls = hub.useTls;
    lsConfig.detected = true;
}

function clearHub() {
    hubInstance = null;
    lsInstances.length = 0;
    lsConfig.port = null;
    lsConfig.csrfToken = null;
    lsConfig.detected = false;
}

function getHub() { return hubInstance; }

// Initialize: detect the hub, resolve its port, and enumerate tracked workspaces.
async function init(onReady) {
    console.log(`[*] Detecting Antigravity language server (hub model) on ${platform}...`);
    scanInProgress = true;
    try {
        const hub = await locateHub();
        if (hub) {
            // Populate virtual instances BEFORE publishing the hub, so observers
            // never see a hub with a half-built workspace list.
            const uris = await getTrackedWorkspaceUris(hub);
            rebuildInstances(hub, uris);
            setHub(hub);
            console.log(`[✓] Hub on port ${hub.port} (PID: ${hub.pid}) — ${lsInstances.length} tracked workspace(s)`);
            lastDetectedState = true;
            // Broadcast detection status (clients may have connected before init finished)
            try {
                const { broadcastAll } = require('./ws');
                broadcastAll({ type: 'status', detected: true, port: hub.port });
            } catch { }
        } else {
            console.log('[!] No language server hub found');
        }
    } finally {
        scanInProgress = false;
    }
    if (onReady) onReady();
}

// Switch active workspace selection (keeps lsConfig pointed at the hub connection).
function switchToInstance(index) {
    if (index < 0 || index >= lsInstances.length) return false;
    lsInstances.forEach(i => i.active = false);
    const inst = lsInstances[index];
    inst.active = true;
    lsConfig.port = inst.port;
    lsConfig.csrfToken = inst.csrfToken;
    lsConfig.detected = true;
    lsConfig.useTls = inst.useTls;
    console.log(`[✓] Active workspace: ${inst.workspaceName} (hub PID: ${inst.pid}, Port: ${inst.port})`);
    return true;
}

// Periodic re-scan for hub presence + tracked-workspace changes (Adaptive)
const NORMAL_RESCAN_INTERVAL = 10000;
const FAST_RESCAN_INTERVAL = 2000;
let rescanTimer = null;
let lastDetectedState = false; // track detection state transitions

function startAutoRescan() {
    if (rescanTimer) clearTimeout(rescanTimer);
    rescanTimer = setTimeout(rescanLoop, hubInstance ? NORMAL_RESCAN_INTERVAL : FAST_RESCAN_INTERVAL);
}

async function rescanLoop() {
    await rescanNow();
    rescanTimer = setTimeout(rescanLoop, hubInstance ? NORMAL_RESCAN_INTERVAL : FAST_RESCAN_INTERVAL);
}

async function rescanNow() {
    if (scanInProgress) return; // don't overlap with init() or another rescan
    scanInProgress = true;
    try {
        const hub = await locateHub();

        // Hub gone — clear everything and broadcast disconnect
        if (!hub) {
            const wasDetected = !!hubInstance;
            clearHub();
            if (wasDetected) {
                try {
                    const { cleanupAll } = require('./cleanup');
                    cleanupAll();
                } catch { }
                lastDetectedState = false;
                try {
                    const { broadcastAll } = require('./ws');
                    const { isSwapping } = require('./profile-manager');
                    const msg = { type: 'status', detected: false, port: null };
                    if (isSwapping()) msg.swapping = true;
                    broadcastAll(msg);
                    console.log('[WS] status broadcast: detected=false (hub gone)');
                } catch { }
            }
            return;
        }

        const hubChanged = !hubInstance ||
            hubInstance.pid !== hub.pid ||
            hubInstance.port !== hub.port ||
            hubInstance.csrfToken !== hub.csrfToken;

        // Refresh the tracked-workspace list and rebuild virtual instances.
        // Compare by URI (globally unique) not display name, then publish the hub.
        const prevUris = lsInstances.map(i => i.workspaceFolderUri).sort().join('\n');
        const uris = await getTrackedWorkspaceUris(hub);
        rebuildInstances(hub, uris);
        setHub(hub);
        const newUris = lsInstances.map(i => i.workspaceFolderUri).sort().join('\n');

        if (hubChanged || prevUris !== newUris) {
            try {
                const { broadcastAll } = require('./ws');
                broadcastAll({ type: 'conversations_updated' });
            } catch { }
        }

        // Broadcast detection status when state transitions (not detected → detected)
        if (lastDetectedState !== true) {
            lastDetectedState = true;
            try {
                const { broadcastAll } = require('./ws');
                broadcastAll({ type: 'status', detected: true, port: hub.port });
                console.log('[WS] status broadcast: detected=true (hub up)');
            } catch { }
        }
    } catch { } finally {
        scanInProgress = false;
    }
}

// === Workspace tracking (used by the create/open routes) ===

// Track a workspace folder on the hub (AddTrackedWorkspace) and register it as a
// virtual instance. Returns the resulting instance, or null if no hub is present.
async function ensureWorkspaceTracked(folderPath) {
    if (!hubInstance) return null;
    const plainPath = folderPath.replace(/\\/g, '/');
    const { callApiOnInstance } = require('./api');
    await callApiOnInstance(hubInstance, 'AddTrackedWorkspace', { workspace: plainPath });
    // Re-read the hub's tracked list so our URI matches the hub's own formatting
    const uris = await getTrackedWorkspaceUris(hubInstance);
    rebuildInstances(hubInstance, uris);
    // Match by URI (globally unique) — basenames collide across different parent dirs
    const toUri = p => (p.startsWith('/') ? 'file://' + p : 'file:///' + p);
    const norm = u => decodeURIComponent(u || '').toLowerCase().replace(/\/+$/, '');
    const want = norm(toUri(plainPath));
    return lsInstances.find(i => norm(i.workspaceFolderUri) === want) || null;
}

// Stop tracking a workspace folder on the hub (RemoveTrackedWorkspace).
async function untrackWorkspace(folderPath) {
    if (!hubInstance) return false;
    const plainPath = folderPath.replace(/\\/g, '/');
    const { callApiOnInstance } = require('./api');
    try {
        await callApiOnInstance(hubInstance, 'RemoveTrackedWorkspace', { workspace: plainPath });
        const uris = await getTrackedWorkspaceUris(hubInstance);
        rebuildInstances(hubInstance, uris);
        return true;
    } catch {
        return false;
    }
}

// --- Instance resolution helpers ---

function getInstanceByName(name) {
    const { lsInstances } = require('./config');
    if (!name) return null;
    return lsInstances.find(i => i.workspaceName.toLowerCase() === String(name).toLowerCase()) || null;
}

function getFirstActiveInstance() {
    const { lsInstances } = require('./config');
    const found = lsInstances.find(i => i.active) || lsInstances[0];
    if (found) return found;
    // No tracked workspace but the hub is up — return an untagged hub instance so
    // global calls (models, user status, untargeted cascades) keep working.
    if (hubInstance) return virtualInstance(hubInstance, null, false);
    return null;
}

module.exports = {
    detectLanguageServers, detectPorts, findApiPort, init, switchToInstance,
    startAutoRescan, getInstanceByName, getFirstActiveInstance,
    getHub, ensureWorkspaceTracked, untrackWorkspace,
};
