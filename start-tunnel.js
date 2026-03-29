// === start-tunnel.js — Production launcher for Antigravity Deck ===
// Usage:
//   node start-tunnel.js           → build + start + tunnels (cloudflared or ngrok)
//   node start-tunnel.js --local   → build + start locally (no tunnels)
//   node start-tunnel.js --build   → force rebuild even if .next exists
//   node start-tunnel.js --ngrok   → force ngrok even if cloudflared is available

const { spawn, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// === Port configuration (single source of truth) ===
const FE_PORT = 9808;  // Production FE port (dev uses 3000)
const BE_PORT = 9807;  // Production BE port (dev uses 3500) — 9.8 m/s² 🪐

const IS_MAC = process.platform === 'darwin';
const IS_WIN = process.platform === 'win32';
const LOCAL_MODE = process.argv.includes('--local');
const FORCE_BUILD = process.argv.includes('--build');
const FORCE_NGROK = process.argv.includes('--ngrok');
const QUIET = process.env.QUIET === '1' || process.argv.includes('--quiet');

let beUrl = null;
let feUrl = null;
const allProcs = []; // Track all spawned processes for cleanup

// Find cloudflared binary — may not be in PATH on Windows/macOS
function findCloudflared() {
    try { execSync('cloudflared --version', { stdio: 'ignore' }); return 'cloudflared'; } catch { }
    const paths = IS_WIN
        ? ['C:\\Program Files (x86)\\cloudflared\\cloudflared.exe', 'C:\\Program Files\\cloudflared\\cloudflared.exe']
        : ['/opt/homebrew/bin/cloudflared', '/usr/local/bin/cloudflared'];
    for (const p of paths) {
        if (fs.existsSync(p)) return IS_WIN ? `"${p}"` : p;
    }
    return null;
}

// Find ngrok binary — fallback tunnel provider
function findNgrok() {
    try { execSync('ngrok version', { stdio: 'ignore' }); return 'ngrok'; } catch { }
    const paths = IS_WIN
        ? [path.join(process.env.USERPROFILE || '', 'ngrok.exe'), 'C:\\ngrok\\ngrok.exe']
        : ['/usr/local/bin/ngrok', '/opt/homebrew/bin/ngrok', '/snap/bin/ngrok'];
    for (const p of paths) {
        if (fs.existsSync(p)) return IS_WIN ? `"${p}"` : p;
    }
    return null;
}

// === Tunnel provider detection (priority: cloudflared → ngrok) ===
const CLOUDFLARED = FORCE_NGROK ? null : findCloudflared();
const NGROK = findNgrok();
const TUNNEL_PROVIDER = CLOUDFLARED ? 'cloudflared' : (NGROK ? 'ngrok' : null);
const TUNNEL_BIN = CLOUDFLARED || NGROK;

function log(tag, msg) {
    if (QUIET) return;
    const colors = { BE: '\x1b[36m', FE: '\x1b[35m', 'TUN-BE': '\x1b[32m', 'TUN-FE': '\x1b[33m', '*': '\x1b[1m' };
    const reset = '\x1b[0m';
    console.log(`${colors[tag] || ''}[${tag}]${reset} ${msg}`);
}

function progress(msg) {
    if (QUIET) process.stdout.write(`\r\x1b[K  ${msg}`);
}

// Extract tunnel URL from process output (provider-aware)
function extractTunnelUrl(text) {
    if (TUNNEL_PROVIDER === 'cloudflared') {
        const stripped = text.replace(/\s+/g, '');
        const match = stripped.match(/(https:\/\/[a-z0-9]+-[a-z0-9-]+\.trycloudflare\.com)/);
        return match ? match[1] : null;
    }
    // ngrok URL patterns
    const ngrokMatch = text.match(/(https:\/\/[a-z0-9-]+\.ngrok-free\.app)/);
    if (ngrokMatch) return ngrokMatch[1];
    const ngrokOld = text.match(/(https:\/\/[a-z0-9]+\.ngrok\.io)/);
    if (ngrokOld) return ngrokOld[1];
    return null;
}

// Spawn a tunnel process for the given port (provider-aware)
function spawnTunnel(port) {
    if (TUNNEL_PROVIDER === 'cloudflared') {
        return spawn(TUNNEL_BIN, ['tunnel', '--url', `http://localhost:${port}`], {
            stdio: ['ignore', 'pipe', 'pipe'], shell: true
        });
    }
    // ngrok: --log stdout ensures URL appears in stdout
    return spawn(TUNNEL_BIN, ['http', String(port), '--log', 'stdout'], {
        stdio: ['ignore', 'pipe', 'pipe'], shell: true
    });
}

// Check if tunnel output indicates rate limiting
function isRateLimited(text) {
    if (TUNNEL_PROVIDER === 'cloudflared') {
        return text.includes('429') || text.includes('Too Many Requests') || text.includes('error code: 1015');
    }
    return text.includes('ERR_NGROK_') && (text.includes('rate') || text.includes('limit'));
}

// Check if ngrok authtoken is missing from output
function isNgrokAuthMissing(text) {
    return text.includes('ERR_NGROK_105') || text.includes('authtoken') && text.includes('invalid') ||
           text.includes('sign up') || text.includes('ERR_NGROK_100');
}

// Start a process, track it for cleanup
function startProcess(name, cmd, args, opts = {}) {
    const childStdio = QUIET ? ['ignore', 'ignore', 'ignore'] : ['ignore', 'pipe', 'pipe'];
    const proc = spawn(cmd, args, { stdio: childStdio, shell: true, ...opts });
    if (!QUIET) {
        proc.stdout?.on('data', d => d.toString().split('\n').filter(l => l.trim()).forEach(l => log(name, l.trim())));
        proc.stderr?.on('data', d => d.toString().split('\n').filter(l => l.trim()).forEach(l => log(name, l.trim())));
    }
    proc.on('exit', code => log(name, `exited with code ${code}`));
    allProcs.push(proc);
    return proc;
}

// Kill any processes listening on the given ports (cross-platform)
function killStaleProcesses(ports) {
    for (const port of ports) {
        try {
            if (IS_WIN) {
                // Find PIDs listening on the port and kill them
                const out = execSync(`netstat -ano | findstr :${port} | findstr LISTENING`, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] });
                const pids = [...new Set(out.split('\n').map(l => l.trim().split(/\s+/).pop()).filter(p => p && p !== '0'))];
                for (const pid of pids) {
                    log('*', `Killing stale process on port ${port} (PID ${pid})`);
                    try { execSync(`taskkill /PID ${pid} /T /F`, { stdio: 'ignore' }); } catch {}
                }
            } else {
                const out = execSync(`lsof -ti :${port}`, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] });
                const pids = out.trim().split('\n').filter(Boolean);
                for (const pid of pids) {
                    log('*', `Killing stale process on port ${port} (PID ${pid})`);
                    try { execSync(`kill -9 ${pid}`, { stdio: 'ignore' }); } catch {}
                }
            }
        } catch { /* No process on this port — normal */ }
    }
}

// Build frontend (production)
function buildFrontend(extraEnv = {}) {
    const buildEnv = { ...process.env, BACKEND_PORT: String(BE_PORT), ...extraEnv };
    progress('Building frontend...');
    log('*', 'Building frontend (production)...');
    try {
        execSync('npx next build', {
            cwd: path.join(__dirname, 'frontend'),
            env: buildEnv,
            stdio: QUIET ? 'ignore' : 'inherit'
        });
        log('*', '✅ Frontend build complete');
    } catch (e) {
        console.error('\x1b[31m  ❌ Frontend build failed\x1b[0m');
        process.exit(1);
    }
}

// Graceful shutdown — kill all spawned processes + port listeners
function cleanup() {
    log('*', 'Shutting down...');
    for (const p of allProcs) { try { p.kill(); } catch {} }

    // Kill tunnel provider processes
    if (IS_WIN) {
        try { execSync(`taskkill /F /FI "IMAGENAME eq cloudflared.exe"`, { stdio: 'ignore' }); } catch {}
        try { execSync(`taskkill /F /FI "IMAGENAME eq ngrok.exe"`, { stdio: 'ignore' }); } catch {}
    } else {
        try { execSync(`pkill -f "cloudflared.*tunnel.*localhost"`, { stdio: 'ignore' }); } catch {}
        try { execSync(`pkill -f "ngrok.*http"`, { stdio: 'ignore' }); } catch {}
    }

    for (const port of [BE_PORT, FE_PORT]) {
        try {
            if (IS_WIN) {
                const out = execSync(`netstat -ano | findstr :${port} | findstr LISTENING`, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] });
                const pids = [...new Set(out.split('\n').map(l => l.trim().split(/\s+/).pop()).filter(p => p && p !== '0'))];
                for (const pid of pids) { try { execSync(`taskkill /PID ${pid} /F`, { stdio: 'ignore' }); } catch {} }
            } else {
                execSync(`lsof -ti :${port} | xargs kill -9`, { stdio: 'ignore' });
            }
        } catch {}
    }

    console.log('  All processes stopped.');
    process.exit(0);
}

process.on('SIGINT', cleanup);
process.on('SIGTERM', cleanup);

// ============================================================
// LOCAL MODE: build → start backend → start frontend
// ============================================================
async function runLocal() {
    console.log('\n\x1b[1m  🚀 Antigravity Deck — Starting (production)\x1b[0m\n');

    // Kill stale processes
    killStaleProcesses([BE_PORT, FE_PORT]);

    // Build if needed — detect stale builds from dev mode or different port
    const nextDir = path.join(__dirname, 'frontend', '.next');
    const portFile = path.join(nextDir, '.backend-port');
    let needBuild = FORCE_BUILD || !fs.existsSync(nextDir);
    if (!needBuild) {
        // Check if the build was done with the correct backend port
        try {
            const builtPort = fs.readFileSync(portFile, 'utf8').trim();
            if (builtPort !== String(BE_PORT)) {
                log('*', `⚠️  Build was for port ${builtPort}, need port ${BE_PORT} — rebuilding...`);
                needBuild = true;
            }
        } catch {
            // No port file = dev mode build or old build — rebuild
            log('*', '⚠️  No build port marker found — rebuilding...');
            needBuild = true;
        }
    }
    if (needBuild) {
        buildFrontend();
        // Save the port this build was made for
        try { fs.writeFileSync(portFile, String(BE_PORT)); } catch { }
    } else {
        log('*', '✅ Frontend already built (use --build to force rebuild)');
    }

    // Start backend
    progress('Starting backend...');
    log('*', `Starting backend on port ${BE_PORT}...`);
    const be = startProcess('BE', 'node', ['server.js'], {
        cwd: __dirname,
        env: { ...process.env, PORT: String(BE_PORT), NODE_ENV: 'production' }
    });
    await new Promise(resolve => setTimeout(resolve, 2000));

    // Start frontend
    progress('Starting frontend...');
    log('*', `Starting frontend on port ${FE_PORT}...`);
    const fe = startProcess('FE', 'npx', ['next', 'start', '--port', String(FE_PORT)], {
        cwd: path.join(__dirname, 'frontend'),
        env: { ...process.env, BACKEND_PORT: String(BE_PORT), NODE_ENV: 'production' }
    });
    await new Promise(resolve => setTimeout(resolve, 2000));

    if (QUIET) process.stdout.write('\r\x1b[K');

    console.log('\n' + '='.repeat(60));
    console.log('\x1b[1m\x1b[32m  ✅ READY!\x1b[0m');
    console.log('='.repeat(60));
    console.log(`  Backend:  http://localhost:${BE_PORT}`);
    console.log(`  Frontend: http://localhost:${FE_PORT}`);
    console.log('='.repeat(60));
    console.log('\n  Press Ctrl+C to stop\n');
}

// ============================================================
// TUNNEL MODE: backend → tunnel → build (with URL) → frontend → tunnel
// ============================================================
async function runTunnel() {
    if (!TUNNEL_PROVIDER) {
        console.log('\n\x1b[31m  ❌ No tunnel provider found! Install one of:\x1b[0m');
        const cfCmd = IS_MAC ? 'brew install cloudflared' : 'winget install cloudflare.cloudflared';
        console.log(`  • cloudflared: ${cfCmd}`);
        console.log(`  • ngrok:       https://ngrok.com/download`);
        console.log(`\n  Then run: \x1b[1mnpm run online\x1b[0m\n`);
        process.exit(1);
    }

    const providerName = TUNNEL_PROVIDER === 'cloudflared' ? 'Cloudflare Tunnel' : 'ngrok';
    log('*', `Using tunnel provider: ${providerName} (${TUNNEL_BIN})`);

    // Kill stale processes
    killStaleProcesses([BE_PORT, FE_PORT]);

    const crypto = require('crypto');
    const authKey = process.env.AUTH_KEY || crypto.randomBytes(16).toString('hex');

    if (!QUIET) {
        console.log(`\n\x1b[1m  🚀 Antigravity Deck — Starting with ${providerName}\x1b[0m`);
        console.log(`  🔑 Auth Key: \x1b[33m${authKey}\x1b[0m\n`);
    }

    // === CLOUDFLARED PATH: dual-tunnel (BE tunnel + FE tunnel) ===
    if (TUNNEL_PROVIDER === 'cloudflared') {
        await _runCloudflaredTunnel(authKey);
    }
    // === NGROK PATH: single-tunnel (FE only — Next.js proxies /api/* to BE) ===
    else {
        await _runNgrokTunnel(authKey);
    }

    console.log('\n  Press Ctrl+C to stop\n');
}

// --- CLOUDFLARED: dual-tunnel mode (original behavior) ---
async function _runCloudflaredTunnel(authKey) {
    // Step 1: Start backend
    progress('Starting backend...');
    log('*', `Starting backend on port ${BE_PORT}...`);
    startProcess('BE', 'node', ['server.js'], {
        cwd: __dirname,
        env: { ...process.env, PORT: String(BE_PORT), AUTH_KEY: authKey, QUIET_POLL: '1', NODE_ENV: 'production' }
    });
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Step 2: Start backend tunnel
    progress('Starting backend tunnel...');
    log('*', 'Starting Cloudflare tunnel for backend...');
    const tunBe = spawnTunnel(BE_PORT);
    allProcs.push(tunBe);

    beUrl = await _waitForTunnelUrl(tunBe, 'TUN-BE');

    if (beUrl === 'RATE_LIMITED') {
        console.error('\n\x1b[33m  ⚠️  Cloudflare rate limit (429 Too Many Requests)\x1b[0m');
        console.error('  You have created too many Quick Tunnels in a short time.');
        console.error('  Please wait 5-10 minutes and try again.');
        console.error('  Or use local mode: \x1b[1mnode start-tunnel.js --local\x1b[0m\n');
        process.exit(1);
    }
    if (!beUrl) { log('*', '❌ Failed to get backend tunnel URL'); process.exit(1); }
    log('*', `✅ Backend tunnel: ${beUrl}`);

    // Step 3: Build frontend (needs NEXT_PUBLIC_BACKEND_URL baked in)
    buildFrontend({ NEXT_PUBLIC_BACKEND_URL: beUrl, NEXT_PUBLIC_BACKEND_PORT: String(BE_PORT) });
    try { fs.writeFileSync(path.join(__dirname, 'frontend', '.next', '.backend-port'), String(BE_PORT)); } catch { }

    // Step 4: Start frontend
    progress('Starting frontend...');
    log('*', `Starting frontend on port ${FE_PORT}...`);
    startProcess('FE', 'npx', ['next', 'start', '--port', String(FE_PORT)], {
        cwd: path.join(__dirname, 'frontend'),
        env: { ...process.env, NEXT_PUBLIC_BACKEND_URL: beUrl, BACKEND_PORT: String(BE_PORT), NODE_ENV: 'production' }
    });
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Step 5: Start frontend tunnel
    progress('Starting frontend tunnel...');
    log('*', 'Starting Cloudflare tunnel for frontend...');
    const tunFe = spawnTunnel(FE_PORT);
    allProcs.push(tunFe);

    feUrl = await _waitForTunnelUrl(tunFe, 'TUN-FE');

    if (feUrl === 'RATE_LIMITED') {
        console.error('\n\x1b[33m  ⚠️  Cloudflare rate limit on frontend tunnel\x1b[0m');
        console.error('  Backend tunnel is working. Wait 5-10 min and try again.\n');
        feUrl = null;
    }

    _printResults(authKey, tunBe, tunFe);
}

// --- NGROK: single-tunnel mode (tunnel FE only, Next.js proxies /api/*) ---
async function _runNgrokTunnel(authKey) {
    // Step 1: Start backend (localhost only — no tunnel needed)
    progress('Starting backend...');
    log('*', `Starting backend on port ${BE_PORT}...`);
    startProcess('BE', 'node', ['server.js'], {
        cwd: __dirname,
        env: { ...process.env, PORT: String(BE_PORT), AUTH_KEY: authKey, ALLOW_LOCALHOST_BYPASS: 'true', QUIET_POLL: '1', NODE_ENV: 'production' }
    });
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Step 2: Build frontend (NO NEXT_PUBLIC_BACKEND_URL — uses relative /api/* proxy)
    const nextDir = path.join(__dirname, 'frontend', '.next');
    const portFile = path.join(nextDir, '.backend-port');
    let needBuild = FORCE_BUILD || !fs.existsSync(nextDir);
    if (!needBuild) {
        try {
            const builtPort = fs.readFileSync(portFile, 'utf8').trim();
            if (builtPort !== String(BE_PORT)) needBuild = true;
        } catch { needBuild = true; }
    }
    if (needBuild) {
        buildFrontend({ BACKEND_PORT: String(BE_PORT) });
        try { fs.writeFileSync(portFile, String(BE_PORT)); } catch { }
    } else {
        log('*', '✅ Frontend already built (use --build to force rebuild)');
    }

    // Step 3: Start frontend
    progress('Starting frontend...');
    log('*', `Starting frontend on port ${FE_PORT}...`);
    startProcess('FE', 'npx', ['next', 'start', '--port', String(FE_PORT)], {
        cwd: path.join(__dirname, 'frontend'),
        env: { ...process.env, BACKEND_PORT: String(BE_PORT), NODE_ENV: 'production' }
    });
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Step 4: Single tunnel pointing to frontend
    progress('Starting ngrok tunnel...');
    log('*', `Starting ngrok tunnel for frontend (port ${FE_PORT})...`);
    const tunFe = spawnTunnel(FE_PORT);
    allProcs.push(tunFe);

    feUrl = await _waitForTunnelUrl(tunFe, 'TUN-FE');
    beUrl = feUrl; // Same URL — all API calls go through FE proxy

    if (feUrl === 'RATE_LIMITED') {
        console.error('\n\x1b[33m  ⚠️  ngrok rate limit\x1b[0m');
        console.error('  Please wait and try again, or use local mode: \x1b[1mnode start-tunnel.js --local\x1b[0m\n');
        process.exit(1);
    }
    if (feUrl === 'AUTH_MISSING') {
        console.error('\n\x1b[31m  ❌ ngrok authtoken not configured!\x1b[0m');
        console.error('  Sign up for free at: \x1b[36mhttps://dashboard.ngrok.com/signup\x1b[0m');
        console.error('  Then run: \x1b[1mngrok config add-authtoken YOUR_TOKEN\x1b[0m\n');
        process.exit(1);
    }
    if (!feUrl) { log('*', '❌ Failed to get ngrok tunnel URL'); process.exit(1); }

    _printResults(authKey, null, tunFe);
}

// --- Wait for tunnel URL from process output ---
async function _waitForTunnelUrl(tunnelProc, logTag) {
    return new Promise((resolve) => {
        const timeout = setTimeout(() => { log('*', `⚠️  Timed out waiting for ${logTag} tunnel URL`); resolve(null); }, 30000);
        let buffer = '';
        const handler = (data) => {
            const text = data.toString();
            buffer += text;
            text.split('\n').filter(l => l.trim()).forEach(l => log(logTag, l.trim()));
            if (isRateLimited(buffer)) {
                clearTimeout(timeout);
                resolve('RATE_LIMITED');
                return;
            }
            if (TUNNEL_PROVIDER === 'ngrok' && isNgrokAuthMissing(buffer)) {
                clearTimeout(timeout);
                resolve('AUTH_MISSING');
                return;
            }
            const url = extractTunnelUrl(buffer);
            if (url) { clearTimeout(timeout); resolve(url); }
        };
        tunnelProc.stdout?.on('data', handler);
        tunnelProc.stderr?.on('data', handler);
    });
}

// --- Print results and QR code ---
function _printResults(authKey, tunBe, tunFe) {
    const qrUrl = feUrl ? `${feUrl}?key=${authKey}` : null;
    if (QUIET) process.stdout.write('\r\x1b[K');

    if (feUrl) {
        const providerLabel = TUNNEL_PROVIDER === 'cloudflared' ? 'Cloudflare' : 'ngrok';
        console.log('\n' + '='.repeat(60));
        console.log(`\x1b[1m\x1b[32m  🌐 READY! (${providerLabel}) Open this URL on any device:\x1b[0m`);
        console.log(`\x1b[1m  👉 ${feUrl}\x1b[0m`);
        console.log(`  🔑 Key: \x1b[33m${authKey}\x1b[0m`);
        console.log('='.repeat(60));
        if (beUrl && beUrl !== feUrl) console.log(`  Backend API: ${beUrl}`);
        console.log(`  Local:       http://localhost:${FE_PORT}`);
        console.log('='.repeat(60));

        console.log('\n\x1b[1m  📱 Scan this QR code to open (auto-login):\x1b[0m\n');
        try {
            const qrcode = require('qrcode-terminal');
            qrcode.generate(qrUrl, { small: true }, (qr) => {
                console.log(qr.split('\n').map(l => '    ' + l).join('\n'));
                console.log(`\n  🔗 ${qrUrl}`);
                console.log(`  💻 Local: \x1b[36mhttp://localhost:${FE_PORT}/?key=${authKey}\x1b[0m\n`);
            });
        } catch {
            console.log(`  (qrcode-terminal not installed — scan URL manually)`);
            console.log(`  🔗 ${qrUrl}`);
            console.log(`  💻 Local: \x1b[36mhttp://localhost:${FE_PORT}/?key=${authKey}\x1b[0m\n`);
        }
    } else {
        log('*', '⚠️  Frontend tunnel failed, but local access still works');
        console.log(`  Local: http://localhost:${FE_PORT}`);
    }

    // Write tunnel info file
    const infoFile = path.join(__dirname, '.tunnel-info.txt');
    const info = [
        `Provider: ${TUNNEL_PROVIDER}`,
        `Frontend: ${feUrl || 'FAILED'}`,
        `Backend:  ${beUrl || 'FAILED'}`,
        `Auth Key: ${authKey}`,
        `QR URL:   ${qrUrl || 'N/A'}`,
        `Local FE: http://localhost:${FE_PORT}`,
        `Local BE: http://localhost:${BE_PORT}`,
        `Started:  ${new Date().toISOString()}`,
    ].join('\n');
    fs.writeFileSync(infoFile, info);
    log('*', `Tunnel info written to ${infoFile}`);

    // Keep remaining output flowing
    if (!QUIET) {
        if (tunBe) {
            tunBe.stdout?.on('data', d => d.toString().split('\n').filter(l => l.trim()).forEach(l => log('TUN-BE', l.trim())));
            tunBe.stderr?.on('data', d => d.toString().split('\n').filter(l => l.trim()).forEach(l => log('TUN-BE', l.trim())));
        }
        if (tunFe) {
            tunFe.stdout?.on('data', d => d.toString().split('\n').filter(l => l.trim()).forEach(l => log('TUN-FE', l.trim())));
            tunFe.stderr?.on('data', d => d.toString().split('\n').filter(l => l.trim()).forEach(l => log('TUN-FE', l.trim())));
        }
    }
}

// === Entry point ===
(LOCAL_MODE ? runLocal() : runTunnel()).catch(e => { console.error(e); process.exit(1); });
