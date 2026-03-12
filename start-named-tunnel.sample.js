// === start-named-tunnel.sample.js — Fixed URL deployment via Named Cloudflare Tunnel ===
// Copy this file to start-named-tunnel.js and fill in your values.
//
// Setup (one-time):
//   1. brew install cloudflared
//   2. cloudflared tunnel login
//   3. cloudflared tunnel create <your-tunnel-name>
//   4. cloudflared tunnel route dns <your-tunnel-name> <fe-subdomain>.<your-domain>
//   5. cloudflared tunnel route dns <your-tunnel-name> <be-subdomain>.<your-domain>
//   6. Create ~/.cloudflared/config.yml (see README)
//   7. Copy this file → start-named-tunnel.js, fill in values below
//   8. npm run online:fixed
//
// Usage: node start-named-tunnel.js

const { spawn, execSync } = require('child_process');
const path = require('path');
const crypto = require('crypto');

const FE_PORT = 9808;
const BE_PORT = 9807;

// ====== FILL IN YOUR VALUES ======
const TUNNEL_NAME = 'your-tunnel-name';                          // from step 3
const BE_URL = 'https://your-be-subdomain.yourdomain.com';      // from step 5
const FE_URL = 'https://your-fe-subdomain.yourdomain.com';      // from step 4
// =================================

function findCloudflared() {
    try { execSync('cloudflared --version', { stdio: 'ignore' }); return 'cloudflared'; } catch { }
    const paths = process.platform === 'darwin'
        ? ['/opt/homebrew/bin/cloudflared', '/usr/local/bin/cloudflared']
        : ['C:\\Program Files (x86)\\cloudflared\\cloudflared.exe', 'C:\\Program Files\\cloudflared\\cloudflared.exe'];
    const fs = require('fs');
    for (const p of paths) { if (fs.existsSync(p)) return p; }
    return null;
}

function log(tag, msg) {
    const colors = { BE: '\x1b[36m', FE: '\x1b[35m', TUNNEL: '\x1b[32m', '*': '\x1b[1m' };
    console.log(`${colors[tag] || ''}[${tag}]\x1b[0m ${msg}`);
}

function startProcess(name, cmd, args, opts = {}) {
    const proc = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'], shell: true, ...opts });
    proc.stdout?.on('data', d => d.toString().split('\n').filter(l => l.trim()).forEach(l => log(name, l.trim())));
    proc.stderr?.on('data', d => d.toString().split('\n').filter(l => l.trim()).forEach(l => log(name, l.trim())));
    proc.on('exit', code => log(name, `exited with code ${code}`));
    return proc;
}

async function main() {
    const CLOUDFLARED = findCloudflared();
    if (!CLOUDFLARED) {
        console.log('\n\x1b[31m  ❌ cloudflared not found!\x1b[0m');
        console.log('  Install: brew install cloudflared\n');
        process.exit(1);
    }

    if (TUNNEL_NAME === 'your-tunnel-name') {
        console.log('\n\x1b[31m  ❌ Please edit start-named-tunnel.js and fill in your tunnel config!\x1b[0m\n');
        process.exit(1);
    }

    const authKey = process.env.AUTH_KEY || crypto.randomBytes(16).toString('hex');

    console.log('\n\x1b[1m  🚀 AntigravityChat — Named Tunnel (Fixed URL)\x1b[0m');

    // Step 1: Start backend
    log('*', `Starting backend on port ${BE_PORT}...`);
    const be = startProcess('BE', 'node', ['server.js'], {
        cwd: __dirname,
        env: { ...process.env, PORT: String(BE_PORT), AUTH_KEY: authKey, QUIET_POLL: '1' }
    });
    await new Promise(r => setTimeout(r, 3000));

    // Step 2: Start frontend with backend URL
    log('*', `Starting frontend on port ${FE_PORT}...`);
    const fe = startProcess('FE', 'npx', ['next', 'dev', '--port', String(FE_PORT)], {
        cwd: path.join(__dirname, 'frontend'),
        env: {
            ...process.env,
            NEXT_PUBLIC_BACKEND_URL: BE_URL,
            BACKEND_PORT: String(BE_PORT),
            NEXT_PUBLIC_BACKEND_PORT: String(BE_PORT)
        }
    });
    await new Promise(r => setTimeout(r, 5000));

    // Step 3: Start named tunnel (uses ~/.cloudflared/config.yml)
    log('*', 'Starting Cloudflare Named Tunnel...');
    const tunnel = startProcess('TUNNEL', CLOUDFLARED, ['tunnel', 'run', TUNNEL_NAME]);

    // Wait a bit then print info
    await new Promise(r => setTimeout(r, 5000));

    // --- Reusable QR generation function (OTP — AUTH_KEY never in URL) ---
    async function generateAndPrintQR() {
        let qrUrl = null;
        try {
            const http = require('http');
            const otpResp = await new Promise((resolve, reject) => {
                const req = http.request(`http://localhost:${BE_PORT}/api/auth/create-otp`, {
                    method: 'POST', headers: { 'Content-Type': 'application/json' }, timeout: 5000,
                }, (res) => {
                    let body = '';
                    res.on('data', c => body += c);
                    res.on('end', () => { try { resolve(JSON.parse(body)); } catch { reject(new Error('Invalid JSON')); } });
                });
                req.on('error', reject);
                req.end();
            });
            qrUrl = `${FE_URL}?otp=${otpResp.otp}`;
            log('*', `✅ New OTP generated (expires in ${otpResp.expiresIn}s)`);
        } catch (e) {
            log('*', `⚠️  OTP generation failed: ${e.message} — falling back to key URL`);
            qrUrl = `${FE_URL}?key=${authKey}`;
        }
        console.log('\n\x1b[1m  📱 Scan QR (auto-login, expires 60s):\x1b[0m\n');
        try {
            const qrcode = require('qrcode-terminal');
            qrcode.generate(qrUrl, { small: true }, (qr) => {
                console.log(qr.split('\n').map(l => '    ' + l).join('\n'));
                console.log(`\n  🔗 ${qrUrl}`);
                console.log('\n  Press \x1b[1mR\x1b[0m to generate a new QR code, Ctrl+C to stop\n');
            });
        } catch {
            console.log(`  🔗 ${qrUrl}`);
            console.log('\n  Press \x1b[1mR\x1b[0m to generate a new QR code, Ctrl+C to stop\n');
        }
    }

    console.log('\n' + '='.repeat(60));
    console.log('\x1b[1m\x1b[32m  🌐 READY! Fixed URLs (never change):\x1b[0m');
    console.log(`\x1b[1m  👉 Frontend: ${FE_URL}\x1b[0m`);
    console.log(`\x1b[1m  🔗 Backend:  ${BE_URL}\x1b[0m`);
    console.log('='.repeat(60));
    console.log(`  Local FE: http://localhost:${FE_PORT}`);
    console.log(`  Local BE: http://localhost:${BE_PORT}`);
    console.log('='.repeat(60));

    await generateAndPrintQR();

    // Listen for R key to regenerate QR
    if (process.stdin.isTTY) {
        process.stdin.setRawMode(true);
        process.stdin.resume();
        process.stdin.on('data', async (data) => {
            const key = data.toString().toLowerCase();
            if (key === 'r') {
                await generateAndPrintQR();
            } else if (key === '\x03') { // Ctrl+C
                cleanup();
            }
        });
    }

    // Graceful shutdown
    const cleanup = () => {
        log('*', 'Shutting down...');
        [be, fe, tunnel].forEach(p => { try { p.kill(); } catch { } });
        process.exit(0);
    };
    process.on('SIGINT', cleanup);
    process.on('SIGTERM', cleanup);
}

main().catch(e => { console.error(e); process.exit(1);});
