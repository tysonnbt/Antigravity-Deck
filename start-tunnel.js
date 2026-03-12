// === start-tunnel.js — Production launcher for Antigravity Deck ===
// Usage:
//   node start-tunnel.js           → build + start + Cloudflare tunnels
//   node start-tunnel.js --local   → build + start locally (no tunnels)
//   node start-tunnel.js --build   → force rebuild even if .next exists

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
const CLOUDFLARED = findCloudflared();

function log(tag, msg) {
    if (QUIET) return;
    const colors = { BE: '\x1b[36m', FE: '\x1b[35m', 'TUN-BE': '\x1b[32m', 'TUN-FE': '\x1b[33m', '*': '\x1b[1m' };
    const reset = '\x1b[0m';
    console.log(`${colors[tag] || ''}[${tag}]${reset} ${msg}`);
}

function progress(msg) {
    if (QUIET) process.stdout.write(`\r\x1b[K  ${msg}`);
}

// Extract Cloudflare tunnel URL from process output
function extractTunnelUrl(text) {
    const stripped = text.replace(/\s+/g, '');
    const match = stripped.match(/(https:\/\/[a-z0-9]+-[a-z0-9-]+\.trycloudflare\.com)/);
    return match ? match[1] : null;
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

    // Kill anything still on our ports
    if (IS_WIN) {
        try { execSync(`taskkill /F /FI "IMAGENAME eq cloudflared.exe"`, { stdio: 'ignore' }); } catch {}
    } else {
        try { execSync(`pkill -f "cloudflared.*tunnel.*localhost"`, { stdio: 'ignore' }); } catch {}
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

    // Build if needed
    const nextDir = path.join(__dirname, 'frontend', '.next');
    if (FORCE_BUILD || !fs.existsSync(nextDir)) {
        buildFrontend();
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
    if (!CLOUDFLARED) {
        console.log('\n\x1b[31m  ❌ cloudflared not found!\x1b[0m');
        const installCmd = IS_MAC ? 'brew install cloudflared' : 'winget install cloudflare.cloudflared';
        console.log(`  Install: ${installCmd}\n`);
        process.exit(1);
    }
    log('*', `Using cloudflared: ${CLOUDFLARED}`);

    // Kill stale processes
    killStaleProcesses([BE_PORT, FE_PORT]);

    const crypto = require('crypto');
    const authKey = process.env.AUTH_KEY || crypto.randomBytes(16).toString('hex');

    if (!QUIET) {
        console.log('\n\x1b[1m  🚀 Antigravity Deck — Starting with Cloudflare Tunnel\x1b[0m');
        console.log(`  🔑 Auth Key: \x1b[33m${authKey}\x1b[0m\n`);
    }

    // Step 1: Start backend
    progress('Starting backend...');
    log('*', `Starting backend on port ${BE_PORT}...`);
    const be = startProcess('BE', 'node', ['server.js'], {
        cwd: __dirname,
        env: { ...process.env, PORT: String(BE_PORT), AUTH_KEY: authKey, QUIET_POLL: '1', NODE_ENV: 'production' }
    });
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Step 2: Start backend tunnel
    progress('Starting backend tunnel...');
    log('*', 'Starting Cloudflare tunnel for backend...');
    const tunBe = spawn(CLOUDFLARED, ['tunnel', '--url', `http://localhost:${BE_PORT}`], {
        stdio: ['ignore', 'pipe', 'pipe'], shell: true
    });
    allProcs.push(tunBe);

    beUrl = await new Promise((resolve) => {
        const timeout = setTimeout(() => { log('*', '⚠️  Timed out waiting for backend tunnel URL'); resolve(null); }, 30000);
        let buffer = '';
        const handler = (data) => {
            const text = data.toString();
            buffer += text;
            text.split('\n').filter(l => l.trim()).forEach(l => log('TUN-BE', l.trim()));
            // Detect Cloudflare rate limit
            if (buffer.includes('429') || buffer.includes('Too Many Requests') || buffer.includes('error code: 1015')) {
                clearTimeout(timeout);
                resolve('RATE_LIMITED');
                return;
            }
            const url = extractTunnelUrl(buffer);
            if (url) { clearTimeout(timeout); resolve(url); }
        };
        tunBe.stdout?.on('data', handler);
        tunBe.stderr?.on('data', handler);
    });

    if (beUrl === 'RATE_LIMITED') {
        console.error('\n\x1b[33m  ⚠️  Cloudflare rate limit (429 Too Many Requests)\x1b[0m');
        console.error('  You have created too many Quick Tunnels in a short time.');
        console.error('  Please wait 5-10 minutes and try again.');
        console.error('  Or use local mode: \x1b[1mnode start-tunnel.js --local\x1b[0m\n');
        process.exit(1);
    }
    if (!beUrl) { log('*', '❌ Failed to get backend tunnel URL'); process.exit(1); }
    log('*', `✅ Backend tunnel: ${beUrl}`);

    // Step 3: Build frontend (always — needs NEXT_PUBLIC_BACKEND_URL baked in)
    buildFrontend({ NEXT_PUBLIC_BACKEND_URL: beUrl, NEXT_PUBLIC_BACKEND_PORT: String(BE_PORT) });

    // Step 4: Start frontend
    progress('Starting frontend...');
    log('*', `Starting frontend on port ${FE_PORT}...`);
    const fe = startProcess('FE', 'npx', ['next', 'start', '--port', String(FE_PORT)], {
        cwd: path.join(__dirname, 'frontend'),
        env: { ...process.env, NEXT_PUBLIC_BACKEND_URL: beUrl, BACKEND_PORT: String(BE_PORT), NODE_ENV: 'production' }
    });
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Step 5: Start frontend tunnel
    progress('Starting frontend tunnel...');
    log('*', 'Starting Cloudflare tunnel for frontend...');
    const tunFe = spawn(CLOUDFLARED, ['tunnel', '--url', `http://localhost:${FE_PORT}`], {
        stdio: ['ignore', 'pipe', 'pipe'], shell: true
    });
    allProcs.push(tunFe);

    feUrl = await new Promise((resolve) => {
        const timeout = setTimeout(() => { log('*', '⚠️  Timed out waiting for frontend tunnel URL'); resolve(null); }, 30000);
        let buffer = '';
        const handler = (data) => {
            const text = data.toString();
            buffer += text;
            text.split('\n').filter(l => l.trim()).forEach(l => log('TUN-FE', l.trim()));
            // Detect Cloudflare rate limit
            if (buffer.includes('429') || buffer.includes('Too Many Requests') || buffer.includes('error code: 1015')) {
                clearTimeout(timeout);
                console.error('\n\x1b[33m  ⚠️  Cloudflare rate limit on frontend tunnel (429)\x1b[0m');
                console.error('  Backend tunnel is working. Wait 5-10 min and try again.\n');
                resolve(null);
                return;
            }
            const url = extractTunnelUrl(buffer);
            if (url) { clearTimeout(timeout); resolve(url); }
        };
        tunFe.stdout?.on('data', handler);
        tunFe.stderr?.on('data', handler);
    });

    const qrUrl = feUrl ? `${feUrl}?key=${authKey}` : null;
    if (QUIET) process.stdout.write('\r\x1b[K');

    if (feUrl) {
        console.log('\n' + '='.repeat(60));
        console.log('\x1b[1m\x1b[32m  🌐 READY! Open this URL on any device:\x1b[0m');
        console.log(`\x1b[1m  👉 ${feUrl}\x1b[0m`);
        console.log(`  🔑 Key: \x1b[33m${authKey}\x1b[0m`);
        console.log('='.repeat(60));
        console.log(`  Backend API: ${beUrl}`);
        console.log(`  Local:       http://localhost:${FE_PORT}`);
        console.log('='.repeat(60));

        console.log('\n\x1b[1m  📱 Scan this QR code to open (auto-login):\x1b[0m\n');
        try {
            const qrcode = require('qrcode-terminal');
            qrcode.generate(qrUrl, { small: true }, (qr) => {
                console.log(qr.split('\n').map(l => '    ' + l).join('\n'));
                console.log(`\n  🔗 ${qrUrl}\n`);
            });
        } catch {
            console.log(`  (qrcode-terminal not installed — scan URL manually)`);
            console.log(`  🔗 ${qrUrl}\n`);
        }
    } else {
        log('*', '⚠️  Frontend tunnel failed, but local access still works');
        console.log(`  Local: http://localhost:${FE_PORT}`);
    }

    // Write tunnel info file
    const infoFile = path.join(__dirname, '.tunnel-info.txt');
    const info = [
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
        tunBe.stdout?.on('data', d => d.toString().split('\n').filter(l => l.trim()).forEach(l => log('TUN-BE', l.trim())));
        tunBe.stderr?.on('data', d => d.toString().split('\n').filter(l => l.trim()).forEach(l => log('TUN-BE', l.trim())));
        tunFe.stdout?.on('data', d => d.toString().split('\n').filter(l => l.trim()).forEach(l => log('TUN-FE', l.trim())));
        tunFe.stderr?.on('data', d => d.toString().split('\n').filter(l => l.trim()).forEach(l => log('TUN-FE', l.trim())));
    }

    console.log('\n  Press Ctrl+C to stop\n');
}

// === Entry point ===
(LOCAL_MODE ? runLocal() : runTunnel()).catch(e => { console.error(e); process.exit(1); });
