// === start-tunnel.js — One-command internet deployment ===
// Starts: Backend → BE Tunnel → Frontend (with BE URL injected) → FE Tunnel
// Usage: node start-tunnel.js

const { spawn, execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const FE_PORT = 9808;  // Online FE port (dev uses 3000)
const BE_PORT = 9807;  // Online BE port (dev uses 3500) — 9.8 m/s² 🪐
let beUrl = null;
let feUrl = null;

const IS_MAC = process.platform === 'darwin';
const IS_WIN = process.platform === 'win32';

// Find cloudflared binary — may not be in PATH on Windows/macOS
function findCloudflared() {
    // Try PATH first
    try { execSync('cloudflared --version', { stdio: 'ignore' }); return 'cloudflared'; } catch { }
    // Common install locations per OS
    const paths = IS_WIN
        ? [
            'C:\\Program Files (x86)\\cloudflared\\cloudflared.exe',
            'C:\\Program Files\\cloudflared\\cloudflared.exe',
        ]
        : [
            '/opt/homebrew/bin/cloudflared',   // Apple Silicon Homebrew
            '/usr/local/bin/cloudflared',       // Intel Homebrew
        ];
    for (const p of paths) {
        if (fs.existsSync(p)) return IS_WIN ? `"${p}"` : p;
    }
    return null;
}
const CLOUDFLARED = findCloudflared();

function log(tag, msg) {
    const colors = { BE: '\x1b[36m', FE: '\x1b[35m', 'TUN-BE': '\x1b[32m', 'TUN-FE': '\x1b[33m', '*': '\x1b[1m' };
    const reset = '\x1b[0m';
    console.log(`${colors[tag] || ''}[${tag}]${reset} ${msg}`);
}

// Extract Cloudflare tunnel URL from process output
function extractTunnelUrl(text) {
    // Strip all whitespace/newlines to handle URL being split across lines
    const stripped = text.replace(/\s+/g, '');
    // Require at least one hyphen in subdomain — real tunnel URLs are like
    // "willing-keeps-listen-perform.trycloudflare.com", not "api.trycloudflare.com"
    const match = stripped.match(/(https:\/\/[a-z0-9]+-[a-z0-9-]+\.trycloudflare\.com)/);
    return match ? match[1] : null;
}

// Start a process and return it
function startProcess(name, cmd, args, opts = {}) {
    const proc = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'], shell: true, ...opts });
    proc.stdout?.on('data', d => d.toString().split('\n').filter(l => l.trim()).forEach(l => log(name, l.trim())));
    proc.stderr?.on('data', d => d.toString().split('\n').filter(l => l.trim()).forEach(l => log(name, l.trim())));
    proc.on('exit', code => log(name, `exited with code ${code}`));
    return proc;
}

async function main() {
    // Check cloudflared first
    if (!CLOUDFLARED) {
        console.log('\n\x1b[31m  ❌ cloudflared not found!\x1b[0m');
        const installCmd = IS_MAC
            ? 'brew install cloudflared'
            : 'winget install cloudflare.cloudflared';
        console.log(`  Install: ${installCmd}\n`);
        process.exit(1);
    }
    log('*', `Using cloudflared: ${CLOUDFLARED}`);

    // Generate a random auth key for this session
    const crypto = require('crypto');
    const authKey = process.env.AUTH_KEY || crypto.randomBytes(16).toString('hex');

    console.log('\n\x1b[1m  🚀 AntigravityChat — Starting with Cloudflare Tunnel\x1b[0m');
    console.log(`  🔑 Auth Key: \x1b[33m${authKey}\x1b[0m\n`);

    // Step 1: Start backend on online port (quiet polling to reduce log noise)
    log('*', `Starting backend on port ${BE_PORT}...`);
    const be = startProcess('BE', 'node', ['server.js'], {
        cwd: __dirname,
        env: { ...process.env, PORT: String(BE_PORT), AUTH_KEY: authKey, QUIET_POLL: '1' }
    });

    // Wait for backend to be ready
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Step 2: Start backend tunnel
    log('*', 'Starting Cloudflare tunnel for backend...');
    const tunBe = spawn(CLOUDFLARED, ['tunnel', '--url', `http://localhost:${BE_PORT}`], {
        stdio: ['ignore', 'pipe', 'pipe'], shell: true
    });

    // Capture backend tunnel URL
    beUrl = await new Promise((resolve) => {
        const timeout = setTimeout(() => {
            log('*', '⚠️  Timed out waiting for backend tunnel URL');
            resolve(null);
        }, 30000);

        let buffer = '';
        const handler = (data) => {
            const text = data.toString();
            buffer += text;
            text.split('\n').filter(l => l.trim()).forEach(l => log('TUN-BE', l.trim()));
            const url = extractTunnelUrl(buffer);
            if (url) {
                clearTimeout(timeout);
                resolve(url);
            }
        };
        tunBe.stdout?.on('data', handler);
        tunBe.stderr?.on('data', handler);
    });

    if (!beUrl) {
        log('*', '❌ Failed to get backend tunnel URL');
        process.exit(1);
    }

    log('*', `✅ Backend tunnel: ${beUrl}`);

    // Step 3: Start frontend with backend URL injected
    log('*', `Starting frontend on port ${FE_PORT}...`);
    const fe = startProcess('FE', 'npx', ['next', 'dev', '--port', String(FE_PORT)], {
        cwd: path.join(__dirname, 'frontend'),
        env: { ...process.env, NEXT_PUBLIC_BACKEND_URL: beUrl, BACKEND_PORT: String(BE_PORT), NEXT_PUBLIC_BACKEND_PORT: String(BE_PORT) }
    });

    // Wait for frontend to be ready
    await new Promise(resolve => setTimeout(resolve, 8000));

    // Step 4: Start frontend tunnel
    log('*', 'Starting Cloudflare tunnel for frontend...');
    const tunFe = spawn(CLOUDFLARED, ['tunnel', '--url', `http://localhost:${FE_PORT}`], {
        stdio: ['ignore', 'pipe', 'pipe'], shell: true
    });

    // Capture frontend tunnel URL
    feUrl = await new Promise((resolve) => {
        const timeout = setTimeout(() => {
            log('*', '⚠️  Timed out waiting for frontend tunnel URL');
            resolve(null);
        }, 30000);

        let buffer = '';
        const handler = (data) => {
            const text = data.toString();
            buffer += text;
            text.split('\n').filter(l => l.trim()).forEach(l => log('TUN-FE', l.trim()));
            const url = extractTunnelUrl(buffer);
            if (url) {
                clearTimeout(timeout);
                resolve(url);
            }
        };
        tunFe.stdout?.on('data', handler);
        tunFe.stderr?.on('data', handler);
    });

    // Build the auto-auth URL with key embedded
    const qrUrl = feUrl ? `${feUrl}?key=${authKey}` : null;

    if (feUrl) {
        console.log('\n' + '='.repeat(60));
        console.log('\x1b[1m\x1b[32m  🌐 READY! Open this URL on any device:\x1b[0m');
        console.log(`\x1b[1m  👉 ${feUrl}\x1b[0m`);
        console.log(`  🔑 Key: \x1b[33m${authKey}\x1b[0m`);
        console.log('='.repeat(60));
        console.log(`  Backend API: ${beUrl}`);
        console.log(`  Local:       http://localhost:${FE_PORT}`);
        console.log('='.repeat(60));

        // Print QR code — scan to open with auto-auth
        console.log('\n\x1b[1m  📱 Scan this QR code to open (auto-login):\x1b[0m\n');
        try {
            const qrcode = require('qrcode-terminal');
            qrcode.generate(qrUrl, { small: true }, (qr) => {
                // Indent each line for nicer display
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

    // Write tunnel info to file (readable even when terminal is garbled)
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
    tunBe.stdout?.on('data', d => d.toString().split('\n').filter(l => l.trim()).forEach(l => log('TUN-BE', l.trim())));
    tunBe.stderr?.on('data', d => d.toString().split('\n').filter(l => l.trim()).forEach(l => log('TUN-BE', l.trim())));
    tunFe.stdout?.on('data', d => d.toString().split('\n').filter(l => l.trim()).forEach(l => log('TUN-FE', l.trim())));
    tunFe.stderr?.on('data', d => d.toString().split('\n').filter(l => l.trim()).forEach(l => log('TUN-FE', l.trim())));

    // Graceful shutdown
    const cleanup = () => {
        log('*', 'Shutting down...');
        [be, fe, tunBe, tunFe].forEach(p => { try { p.kill(); } catch { } });
        process.exit(0);
    };
    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);
}

main().catch(e => { console.error(e); process.exit(1); });
