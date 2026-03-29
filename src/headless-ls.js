// === Headless Language Server Manager ===
// Launch LS instances without the IDE UI, reusing extension server auth from a running IDE.
const net = require('net');
const path = require('path');
const os = require('os');
const fs = require('fs');
const crypto = require('crypto');
const { exec, spawn } = require('child_process');
const { promisify } = require('util');
const http = require('http');
const https = require('https');
const { lsInstances, platform } = require('./config');

const execAsync = promisify(exec);

// Track headless processes for cleanup: pid → { child, pipeServer, pipePath }
const headlessProcesses = new Map();

async function detectLsBinaryFromProcess() {
    try {
        if (platform === 'win32') {
            const ps = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
            const cmd = `Get-CimInstance Win32_Process | Where-Object { $_.Name -like '*language_server*' } | Select-Object -First 1 -ExpandProperty ExecutablePath`;
            const result = await execAsync(`"${ps}" -NoProfile -Command "${cmd}"`, { encoding: 'utf8', timeout: 10000 });
            const detected = (result.stdout || '').trim();
            if (detected && fs.existsSync(detected)) return detected;
        } else {
            const result = await execAsync(`ps aux | grep 'language_server' | grep -v grep | head -1`, { encoding: 'utf8', timeout: 5000 });
            const out = (result.stdout || '').trim();
            const match = out.match(/(\/\S*language_server\S*)/);
            if (match && fs.existsSync(match[1])) return match[1];
        }
    } catch { }
    return null;
}

function getStaticLsBinaryPath() {
    const binRelPath = ['resources', 'app', 'extensions', 'antigravity', 'bin'];

    if (platform === 'win32') {
        const localAppData = process.env.LOCALAPPDATA || path.join(os.homedir(), 'AppData', 'Local');
        const programFiles = process.env.PROGRAMFILES || 'C:\\Program Files';
        const candidates = [
            path.join(localAppData, 'Programs', 'Antigravity', ...binRelPath, 'language_server_windows_x64.exe'),
            path.join(programFiles, 'Antigravity', ...binRelPath, 'language_server_windows_x64.exe'),
            path.join(localAppData, 'Programs', 'Antigravity', ...binRelPath, 'language_server.exe'),
            path.join(localAppData, 'Programs', 'Windsurf', ...binRelPath, 'language_server_windows_x64.exe'),
            path.join(localAppData, 'Programs', 'Windsurf', ...binRelPath, 'language_server.exe'),
        ];
        for (const p of candidates) {
            if (fs.existsSync(p)) return p;
        }
        return candidates[0];
    } else if (platform === 'darwin') {
        const candidates = [
            ...['language_server_macos_arm', 'language_server_macos_x64', 'language_server'].map(
                bin => path.join('/Applications/Antigravity.app/Contents/Resources/app/extensions/antigravity/bin', bin)
            ),
            ...['language_server_macos_arm', 'language_server_macos_x64', 'language_server'].map(
                bin => path.join('/Applications/Windsurf.app/Contents/Resources/app/extensions/antigravity/bin', bin)
            ),
        ];
        for (const p of candidates) {
            if (fs.existsSync(p)) return p;
        }
        return candidates[0];
    } else {
        const home = os.homedir();
        const candidates = [
            path.join(home, '.local', 'share', 'Antigravity', ...binRelPath, 'language_server'),
            '/usr/share/antigravity/resources/app/extensions/antigravity/bin/language_server',
            path.join(home, '.local', 'share', 'Windsurf', ...binRelPath, 'language_server'),
            '/usr/share/windsurf/resources/app/extensions/antigravity/bin/language_server',
        ];
        for (const p of candidates) {
            if (fs.existsSync(p)) return p;
        }
        return candidates[0];
    }
}

async function getLsBinaryPath() {
    const { getSettings } = require('./config');
    const settings = getSettings();
    if (settings.lsBinaryPath && fs.existsSync(settings.lsBinaryPath)) {
        return settings.lsBinaryPath;
    }

    const detected = await detectLsBinaryFromProcess();
    if (detected) return detected;

    return getStaticLsBinaryPath();
}

// Extension path (for protobuf metadata)
function getExtensionPath(lsBin) {
    return path.dirname(path.dirname(lsBin)); // up from bin/ to antigravity/
}

// --- Get existing headless extension server port — ASYNC ---
async function getExtensionServer() {
    try {
        let out = '';
        if (platform === 'win32') {
            const ps = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'WindowsPowerShell', 'v1.0', 'powershell.exe');
            const cmd = `Get-CimInstance Win32_Process | Where-Object { $_.Name -like '*language_server*' }  | Select-Object -First 1 -ExpandProperty CommandLine`;
            const result = await execAsync(`"${ps}" -NoProfile -Command "${cmd}"`, { encoding: 'utf8', timeout: 10000 });
            out = (result.stdout || '').trim();
        } else {
            const result = await execAsync(`ps aux | grep 'language_server' | grep -v grep | head -1`, { encoding: 'utf8', timeout: 5000 });
            out = (result.stdout || '').trim();
        }

        const portMatch = out.match(/--extension_server_port\s+(\d+)/);
        const csrfMatch = out.match(/--extension_server_csrf_token\s+([\w-]+)/);
        if (portMatch && csrfMatch) {
            return {
                port: parseInt(portMatch[1], 10),
                csrf: csrfMatch[1]
            };
        }
    } catch { }
    return null;
};

// --- Protobuf hand-encoder (proto3 wire format) ---
function encStr(fieldNum, val) {
    if (!val) return Buffer.alloc(0);
    const buf = Buffer.from(val, 'utf8');
    const parts = [];
    let tag = (fieldNum << 3) | 2; // wire type 2 = length-delimited
    while (tag > 127) { parts.push((tag & 0x7f) | 0x80); tag >>>= 7; }
    parts.push(tag & 0x7f);
    let len = buf.length;
    while (len > 127) { parts.push((len & 0x7f) | 0x80); len >>>= 7; }
    parts.push(len & 0x7f);
    return Buffer.concat([Buffer.from(parts), buf]);
}

function buildMetadata(extensionPath) {
    let ideVersion = '1.0.0';
    try {
        const appRoot = path.dirname(path.dirname(extensionPath));
        const pkgPath = path.join(appRoot, 'package.json');
        if (fs.existsSync(pkgPath)) {
            const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
            if (pkg.version) ideVersion = pkg.version;
        }
    } catch { }

    return Buffer.concat([
        encStr(1, 'Antigravity'),           // ideName
        encStr(2, ideVersion),              // ideVersion
        encStr(3, 'Antigravity'),           // extensionName
        encStr(4, extensionPath),           // extensionPath
        encStr(5, 'en'),                    // locale
        encStr(6, crypto.randomUUID()),     // deviceFingerprint
        encStr(7, ideVersion),              // extensionVersion (same as ideVersion)
    ]);
}

// --- Encode workspace path → workspace_id arg ---
function pathToWorkspaceId(folderPath) {
    // C:\Users\zacka\Projects\hello → file_c_3A_Users_zacka_Projects_hello
    const normalized = folderPath.replace(/\\/g, '/');
    return 'file_' + normalized.replace(/:/g, '_3A').replace(/\//g, '_');
}

// --- Construct file:// URI from path ---
function pathToFileUri(fsPath) {
    const normalized = fsPath.replace(/\\/g, '/');
    return normalized.startsWith('/')
        ? 'file://' + normalized
        : 'file:///' + normalized;
}

// --- Wait for LS to bind ports ---
async function waitForPorts(pid, timeoutMs = 15000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
        try {
            let ports = [];
            if (platform === 'win32') {
                const { stdout } = await execAsync(`netstat -ano`, { encoding: 'utf8', timeout: 5000 });
                const pidStr = String(pid);
                for (const line of stdout.split('\n')) {
                    if (!line.trim()) continue;
                    const parts = line.trim().split(/\s+/);
                    if (parts.length >= 4 && parts[parts.length - 1] === pidStr) {
                        const addrPort = parts[1];
                        if (addrPort) {
                            const port = parseInt(addrPort.split(':').pop(), 10);
                            if (!isNaN(port)) ports.push(port);
                        }
                    }
                }
            } else {
                const { stdout } = await execAsync(`lsof -iTCP -sTCP:LISTEN -a -p ${pid} -Fn 2>/dev/null | grep '^n' | sed 's/^n.*://'`, { encoding: 'utf8', timeout: 5000 });
                const out = (stdout || '').trim();
                if (out) ports = out.split('\n').map(p => p.trim()).filter(Boolean);
            }
            if (ports.length >= 2) return ports; // LS opens 2 ports: HTTPS + HTTP
            if (ports.length === 1) return ports; // Sometimes only 1
        } catch { }
        await new Promise(r => setTimeout(r, 1000));
    }
    return [];
}

// --- Call LS API (for workspace binding) ---
// Fix #86: use http/https.request() — native fetch() ignores https.Agent
function callLsApi(port, csrfToken, useTls, method, body = {}) {
    return new Promise((resolve, reject) => {
        const host = useTls ? '127.0.0.1' : 'localhost';
        const data = JSON.stringify(body);
        const transport = useTls ? https : http;
        const req = transport.request({
            hostname: host, port,
            path: `/exa.language_server_pb.LanguageServerService/${method}`,
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Connect-Protocol-Version': '1',
                'X-Codeium-Csrf-Token': csrfToken,
                'Content-Length': Buffer.byteLength(data),
            },
            timeout: 5000,
            rejectUnauthorized: false,
        }, (res) => {
            const chunks = [];
            res.on('data', c => chunks.push(c.toString()));
            res.on('end', () => {
                if (res.statusCode >= 400) { reject(new Error(`API ${method} failed: ${res.statusCode}`)); return; }
                try { resolve(JSON.parse(chunks.join(''))); }
                catch (e) { reject(new Error(`API parse error: ${e.message}`)); }
            });
        });
        req.on('error', reject);
        req.on('timeout', () => { req.destroy(); reject(new Error(`API ${method} timeout`)); });
        req.write(data);
        req.end();
    });
}

// --- Find which port is the API port (HTTPS or HTTP) ---
// Fix #86: use http/https.request() — native fetch() ignores https.Agent
function findApiPort(ports, csrfToken) {
    const headers = { 'Content-Type': 'application/json', 'Connect-Protocol-Version': '1', 'X-Codeium-Csrf-Token': csrfToken };
    const endpoint = '/exa.language_server_pb.LanguageServerService/GetUserStatus';

    function probe(url, timeoutMs = 3000) {
        return new Promise((resolve, reject) => {
            const parsed = new URL(url);
            const isHttps = parsed.protocol === 'https:';
            const transport = isHttps ? https : http;
            const data = '{}';
            const req = transport.request({
                hostname: parsed.hostname.replace(/^\[|\]$/g, ''), port: parsed.port, path: parsed.pathname,
                method: 'POST',
                headers: { ...headers, 'Content-Length': Buffer.byteLength(data) },
                timeout: timeoutMs,
                rejectUnauthorized: false,
            }, (res) => {
                res.resume();
                resolve({ ok: res.statusCode >= 200 && res.statusCode < 300 });
            });
            req.on('error', reject);
            req.on('timeout', () => { req.destroy(); reject(new Error('timeout')); });
            req.write(data);
            req.end();
        });
    }

    return (async () => {
        for (const port of ports) {
            try {
                const res = await probe(`https://127.0.0.1:${port}${endpoint}`);
                if (res.ok) return { port, useTls: true };
            } catch { }
            try {
                const res = await probe(`http://localhost:${port}${endpoint}`);
                if (res.ok) return { port, useTls: false };
            } catch { }
        }
        return null;
    })();
}

// ====================================================================
//  MAIN: Launch a headless LS for a given workspace folder
// ====================================================================
async function launchHeadlessLS(folderPath) {
    // 1. Validate LS binary exists (async — detects from running process first)
    const lsBin = await getLsBinaryPath();
    if (!fs.existsSync(lsBin)) {
        throw new Error(`LS binary not found: ${lsBin}`);
    }

    // 2. Get extension server from running IDE
    const extServer = await getExtensionServer();
    if (!extServer) {
        throw new Error('No running Antigravity IDE found. Extension server is required for auth. Please open at least one workspace in Antigravity IDE first.');
    }

    // 3. Ensure folder exists
    if (!fs.existsSync(folderPath)) {
        fs.mkdirSync(folderPath, { recursive: true });
        console.log(`[Headless] Created workspace folder: ${folderPath}`);
    }

    // 4. Check if already launched as headless for this folder
    const folderUri = pathToFileUri(folderPath);
    const existingIdx = lsInstances.findIndex(i => i.workspaceFolderUri === folderUri && i.headless);
    if (existingIdx >= 0) {
        const existing = lsInstances[existingIdx];
        console.log(`[Headless] Already running for ${folderPath} (PID: ${existing.pid})`);
        return {
            created: false,
            alreadyRunning: true,
            workspace: {
                pid: existing.pid,
                port: existing.port,
                workspaceName: existing.workspaceName,
                workspaceFolderUri: existing.workspaceFolderUri,
            }
        };
    }

    // 5. Create mock parent pipe (required for LS to bind ports)
    const pipeName = platform === 'win32'
        ? `\\\\.\\pipe\\headless_ls_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`
        : path.join(os.tmpdir(), `headless_ls_${Date.now()}.sock`);

    const pipeServer = net.createServer((conn) => {
        conn.on('data', () => { }); // accept and ignore
        conn.on('error', () => { });
    });

    await new Promise((resolve, reject) => {
        pipeServer.listen(pipeName, resolve);
        pipeServer.on('error', reject);
    });

    // 6. Build args
    const csrfToken = crypto.randomUUID();
    const workspaceId = pathToWorkspaceId(folderPath);
    const args = [
        '--enable_lsp',
        '--csrf_token', csrfToken,
        '--workspace_id', workspaceId,
        '--cloud_code_endpoint', 'https://daily-cloudcode-pa.googleapis.com',
        '--app_data_dir', 'antigravity',
        '--parent_pipe_path', pipeName,
        '--extension_server_port', extServer.port,
        '--extension_server_csrf_token', extServer.csrf,
    ];

    // 7. Spawn LS
    const metadata = buildMetadata(getExtensionPath(lsBin));
    const child = spawn(lsBin, args, { stdio: ['pipe', 'pipe', 'pipe'] });
    child.stdin.write(metadata);
    child.stdin.end();

    console.log(`[Headless] Launched PID: ${child.pid}, CSRF: ${csrfToken.substring(0, 8)}...`);

    // Track stderr for debugging
    child.stderr.on('data', (d) => {
        const s = d.toString().trim();
        if (s.length < 300 && !s.includes('WARN') && !s.includes('DEBUG')) {
            console.log(`[Headless:${child.pid}] ${s}`);
        }
    });

    // Track for cleanup
    headlessProcesses.set(String(child.pid), { child, pipeServer, pipePath: pipeName });

    // Handle unexpected exit
    child.on('exit', (code) => {
        console.log(`[Headless] PID ${child.pid} exited (code: ${code})`);
        headlessProcesses.delete(String(child.pid));
        pipeServer.close();
        // Remove from lsInstances
        const idx = lsInstances.findIndex(i => i.pid === String(child.pid));
        if (idx >= 0) {
            lsInstances.splice(idx, 1);
            try {
                const { broadcastAll } = require('./ws');
                broadcastAll({ type: 'conversations_updated' });
            } catch { }
        }
    });

    // 8. Wait for ports
    const ports = await waitForPorts(child.pid);
    if (!ports.length) {
        child.kill();
        pipeServer.close();
        headlessProcesses.delete(String(child.pid));
        throw new Error('Headless LS failed to bind ports within timeout');
    }

    // 9. Find the API port (HTTPS vs HTTP)
    const apiResult = await findApiPort(ports, csrfToken);
    if (!apiResult) {
        child.kill();
        pipeServer.close();
        headlessProcesses.delete(String(child.pid));
        throw new Error('Headless LS ports found but API not responding');
    }

    // 10. Bind workspace folder via AddTrackedWorkspace
    //     This is CRITICAL — without this, cascades route to wrong workspace
    const plainPath = folderPath.replace(/\\/g, '/');
    try {
        await callLsApi(apiResult.port, csrfToken, apiResult.useTls, 'AddTrackedWorkspace', {
            workspace: plainPath
        });
        console.log(`[Headless] Bound workspace: ${plainPath}`);
    } catch (e) {
        console.log(`[Headless] AddTrackedWorkspace failed: ${e.message} — cascades may not route correctly`);
    }

    // 11. Verify workspace binding — wait a moment then check GetWorkspaceInfos
    await new Promise(r => setTimeout(r, 1500));
    let verifiedName = path.basename(folderPath);
    let verifiedUri = folderUri;
    try {
        const wsInfo = await callLsApi(apiResult.port, csrfToken, apiResult.useTls, 'GetWorkspaceInfos', {});
        const infos = wsInfo.workspaceInfos || [];
        if (infos.length > 0) {
            const firstUri = infos[0].workspaceUri;
            if (firstUri) {
                verifiedUri = firstUri;
                const decoded = decodeURIComponent(firstUri);
                const parts = decoded.replace(/\/$/, '').split('/');
                verifiedName = parts[parts.length - 1] || verifiedName;
                console.log(`[Headless] Workspace verified: ${verifiedName} (${verifiedUri})`);
            }
        }
    } catch (e) {
        console.log(`[Headless] GetWorkspaceInfos check: ${e.message}`);
    }

    // 12. Register into lsInstances (same shape as IDE-detected instances)
    const instance = {
        pid: String(child.pid),
        csrfToken,
        workspaceId,
        workspaceName: verifiedName,
        workspaceFolderUri: verifiedUri,
        category: 'workspace',
        port: apiResult.port,
        useTls: apiResult.useTls,
        active: false,
        headless: true, // Tag to distinguish from IDE instances
    };

    lsInstances.push(instance);

    console.log(`\n========================================`);
    console.log(`  HEADLESS LS READY`);
    console.log(`  Workspace: ${verifiedName}`);
    console.log(`  Port: ${apiResult.port} (${apiResult.useTls ? 'HTTPS' : 'HTTP'})`);
    console.log(`  PID: ${child.pid}`);
    console.log(`  CSRF: ${csrfToken.substring(0, 8)}...`);
    console.log(`  ExtSrv: port=${extServer.port}`);
    console.log(`  FolderURI: ${verifiedUri}`);
    console.log(`========================================\n`);

    // Notify frontend
    try {
        const { broadcastAll } = require('./ws');
        broadcastAll({ type: 'conversations_updated' });
    } catch { }

    return {
        created: true,
        workspace: {
            pid: String(child.pid),
            port: apiResult.port,
            workspaceName: verifiedName,
            workspaceFolderUri: verifiedUri,
            headless: true,
        }
    };
}

// ====================================================================
//  Kill a headless LS instance
// ====================================================================
function killHeadlessLS(pid) {
    const pidStr = String(pid);
    const proc = headlessProcesses.get(pidStr);

    // Also validate it's actually a headless instance
    const idx = lsInstances.findIndex(i => i.pid === pidStr && i.headless);
    if (idx < 0) {
        throw new Error(`PID ${pid} is not a known headless LS instance`);
    }

    if (proc) {
        try { proc.child.kill(); } catch { }
        try { proc.pipeServer.close(); } catch { }
        headlessProcesses.delete(pidStr);
    } else {
        // Process tracked in lsInstances but not in headlessProcesses — force kill
        try {
            if (platform === 'win32') {
                execSync(`taskkill /PID ${pidStr} /F`, { timeout: 5000 });
            } else {
                execSync(`kill -9 ${pidStr}`, { timeout: 5000 });
            }
        } catch { }
    }

    // Remove from lsInstances
    const removed = lsInstances.splice(idx, 1)[0];
    console.log(`[Headless] Killed: ${removed.workspaceName} (PID: ${pidStr})`);

    // Notify frontend
    try {
        const { broadcastAll } = require('./ws');
        broadcastAll({ type: 'conversations_updated' });
    } catch { }

    return { killed: true, workspace: removed.workspaceName };
}

// ====================================================================
//  List headless instances
// ====================================================================
function getHeadlessInstances() {
    return lsInstances
        .filter(i => i.headless)
        .map(i => ({
            pid: i.pid,
            port: i.port,
            workspaceName: i.workspaceName,
            workspaceFolderUri: i.workspaceFolderUri,
            useTls: i.useTls,
        }));
}

// ====================================================================
//  Check if a PID is a headless instance (for detector dedup)
// ====================================================================
function isHeadlessPid(pid) {
    return headlessProcesses.has(String(pid));
}

// ====================================================================
//  Cleanup all headless instances (on server shutdown)
// ====================================================================
function cleanupAll() {
    for (const [pid, proc] of headlessProcesses) {
        try { proc.child.kill(); } catch { }
        try { proc.pipeServer.close(); } catch { }
        console.log(`[Headless] Cleanup: killed PID ${pid}`);
    }
    headlessProcesses.clear();
}

// Cleanup on process exit
process.on('exit', cleanupAll);
process.on('SIGINT', () => { cleanupAll(); process.exit(); });
process.on('SIGTERM', () => { cleanupAll(); process.exit(); });

module.exports = {
    launchHeadlessLS,
    killHeadlessLS,
    getHeadlessInstances,
    getExtensionServer,
    isHeadlessPid,
    cleanupAll,
};
