# Ngrok Remote Access — Complete Guide

> **Purpose**: Access Antigravity Deck from any device (phone, tablet, another laptop) over the internet using ngrok as a secure tunnel provider.

---

## Table of Contents

1. [Overview](#overview)
2. [Architecture](#architecture)
3. [Prerequisites](#prerequisites)
4. [Quick Start](#quick-start)
5. [How It Works — Deep Dive](#how-it-works--deep-dive)
6. [Configuration Reference](#configuration-reference)
7. [Mobile-Specific Behavior](#mobile-specific-behavior)
8. [Troubleshooting](#troubleshooting)
9. [Security Model](#security-model)
10. [Provider Comparison: Cloudflared vs Ngrok](#provider-comparison-cloudflared-vs-ngrok)
11. [Files Modified](#files-modified)
12. [Known Limitations](#known-limitations)

---

## Overview

Antigravity Deck supports two tunnel providers for remote access:

| Provider      | Priority | Account Required | Tunnels Used | Best For                    |
|---------------|----------|------------------|--------------|-----------------------------|
| **cloudflared** | 1st (default) | No (anonymous)  | 2 (BE + FE)  | Zero-setup, dual-tunnel     |
| **ngrok**       | 2nd (fallback) | Yes (free tier) | 1 (FE only)  | When cloudflared unavailable |

The system auto-detects which provider is installed. If both are present, cloudflared is preferred unless `--ngrok` is passed.

### Why ngrok as a fallback?

Cloudflare's Quick Tunnels are anonymous and ephemeral but can hit aggressive rate limits (HTTP 429 / error 1015) after repeated restarts. When this happens, ngrok provides immediate, reliable fallback access with a free-tier account.

---

## Architecture

### Cloudflared Mode (Dual Tunnel)

```
┌─────────────────────────────────────────────────────────────────┐
│                      Your Machine (localhost)                    │
│                                                                 │
│  ┌──────────┐       ┌──────────┐                               │
│  │ Backend  │:9807  │ Frontend │:9808                           │
│  │ Express  │◄──────│ Next.js  │                               │
│  │ server.js│       │          │                               │
│  └────┬─────┘       └─────┬────┘                               │
│       │                   │                                     │
└───────┼───────────────────┼─────────────────────────────────────┘
        │                   │
   ┌────┴────┐         ┌────┴────┐
   │Cloudflare│        │Cloudflare│
   │Tunnel BE │        │Tunnel FE │
   └────┬────┘         └────┬────┘
        │                   │
   https://xxx-yyy       https://aaa-bbb
   .trycloudflare.com   .trycloudflare.com
                   ▲
                   │
              📱 Mobile
```

**Flow**: Two independent tunnels. Frontend build bakes the backend tunnel URL into `NEXT_PUBLIC_BACKEND_URL` at compile time. WebSocket connects directly to backend tunnel.

### Ngrok Mode (Single Tunnel) ← New

```
┌──────────────────────────────────────────────────────────────────┐
│                      Your Machine (localhost)                     │
│                                                                  │
│  ┌──────────┐  localhost:9807  ┌──────────────┐                 │
│  │ Backend  │◄────────────────│   Frontend    │:9808            │
│  │ Express  │  (Next.js proxy  │   Next.js     │                │
│  │ server.js│   /api/* → BE)   │ next.config.ts│                │
│  │          │  (/ws/* → BE)    │               │                │
│  └──────────┘                  └───────┬───────┘                │
│                                        │                         │
└────────────────────────────────────────┼─────────────────────────┘
                                         │
                                    ┌────┴────┐
                                    │  ngrok  │
                                    │ Tunnel  │
                                    └────┬────┘
                                         │
                                 https://xxxx-yy-zz
                                 .ngrok-free.app
                                         ▲
                                         │
                                    📱 Mobile
```

**Flow**: Single tunnel to frontend port 9808. Next.js reverse-proxy forwards:
- `/api/*` → `http://localhost:9807/api/*` (HTTP REST)
- `/ws/*` → `http://localhost:9807/ws/*` (WebSocket upgrade)

The backend never needs its own tunnel. It sets `ALLOW_LOCALHOST_BYPASS=true` to accept unauthenticated requests from the Next.js proxy on localhost.

---

## Prerequisites

### 1. Install ngrok

**Windows (winget):**
```powershell
winget install ngrok.ngrok
```

**Windows (manual):**
1. Download from https://ngrok.com/download
2. Extract `ngrok.exe` to your PATH or user profile

**macOS:**
```bash
brew install ngrok
```

**Linux:**
```bash
sudo snap install ngrok   # or download from ngrok.com
```

### 2. Create a Free Account & Configure Auth Token

1. Sign up at https://dashboard.ngrok.com/signup (free)
2. Copy your authtoken from https://dashboard.ngrok.com/get-started/your-authtoken
3. Run:

```bash
ngrok config add-authtoken YOUR_TOKEN_HERE
```

This is a **one-time setup** — the token persists in ngrok's config file.

### 3. Verify Installation

```bash
ngrok version
# ngrok version 3.x.x
```

---

## Quick Start

### Option A: Auto-detect (recommended)

```bash
npm run online
```

This detects available providers in order: cloudflared → ngrok → error.

### Option B: Force ngrok

```bash
npm run online:ngrok
```

Forces ngrok even if cloudflared is installed.

### What Happens

1. Backend starts on `localhost:9807`
2. Frontend builds (if needed) and starts on `localhost:9808`
3. Ngrok tunnel opens to port 9808
4. Terminal displays:
   - 🌐 Public URL (e.g., `https://xxxx-yy-zz.ngrok-free.app`)
   - 🔑 Auth Key (32-char hex string)
   - 📱 QR code (auto-login URL with key embedded)
5. Tunnel info written to `.tunnel-info.txt`

### Connect from Mobile

**Method 1 — QR Code (fastest):**
Scan the QR code displayed in your terminal. The URL includes the auth key so you're logged in automatically.

**Method 2 — Manual URL:**
1. Open the ngrok URL in your mobile browser
2. On first visit, ngrok shows a "Visit Site" interstitial — tap through
3. Enter the auth key when prompted (or append `?key=YOUR_KEY` to the URL)

### Stop

Press `Ctrl+C` in the terminal. All processes (backend, frontend, ngrok) are cleaned up automatically.

---

## How It Works — Deep Dive

### Startup Sequence (`start-tunnel.js`)

```
1. Kill stale processes on ports 9807, 9808
2. Generate random AUTH_KEY (or use AUTH_KEY env var)
3. Start backend:
     node server.js
     env: PORT=9807, AUTH_KEY=<key>, ALLOW_LOCALHOST_BYPASS=true, NODE_ENV=production
4. Wait 3 seconds for backend to initialize
5. Check if frontend build is needed:
     - Missing .next directory? → rebuild
     - .next/.backend-port doesn't match 9807? → rebuild
     - --build flag? → rebuild
6. Build frontend (if needed):
     npx next build
     env: BACKEND_PORT=9807
7. Start frontend:
     npx next start --port 9808
     env: BACKEND_PORT=9807, NODE_ENV=production
8. Wait 3 seconds for frontend to initialize
9. Start ngrok tunnel:
     ngrok http 9808 --log stdout
10. Parse tunnel URL from ngrok stdout
11. Display URL, QR code, write .tunnel-info.txt
12. Keep running until Ctrl+C
```

### Next.js Reverse Proxy (`frontend/next.config.ts`)

The frontend's `rewrites()` configuration is the linchpin of single-tunnel mode:

```typescript
async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `http://localhost:${BE_PORT}/api/:path*`,
      },
      {
        source: '/ws/:path*',
        destination: `http://localhost:${BE_PORT}/ws/:path*`,
      },
    ];
  },
```

- **`/api/*`**: All REST API calls from the browser → Next.js → backend. This includes conversation CRUD, workspace management, step fetching, cascade control, etc.
- **`/ws/*`**: WebSocket upgrade requests from the browser → Next.js → backend. This enables real-time streaming of AI responses, status updates, and live workspace monitoring.

### WebSocket Routing (`server.js`)

The backend Express server handles WebSocket upgrades on four explicit paths:

```javascript
server.on('upgrade', (req, socket, head) => {
  const { pathname } = new URL(req.url, 'http://localhost');
  if (pathname === '/ws/orchestrator') { /* orchestrator WS */ }
  else if (pathname === '/ws/agent')   { /* agent WS */ }
  else if (pathname === '/ws/ui' || pathname === '/') { /* UI WS */ }
  else { socket.destroy(); }
});
```

The frontend `ws-service.ts` connects to `/ws/ui` which Next.js proxies to the backend.

### Auth Flow (`frontend/lib/auth.ts`)

```
1. User opens ngrok URL with ?key=<auth_key>
2. Frontend extracts key from URL query parameter
3. Key stored in BOTH:
   - localStorage ('antigravity_auth_key')
   - Cookie ('ag_auth_key', 30-day expiry, SameSite=Strict)
4. All API requests include X-Auth-Key header
5. WebSocket URL includes ?auth_key=<key> query param
```

**Why dual storage?** Mobile browsers (especially iOS Safari) can purge localStorage when killing background tabs under memory pressure. Cookies survive this, so the auth key is always recoverable.

### Localhost Bypass (`ALLOW_LOCALHOST_BYPASS`)

When ngrok mode is active, the backend environment includes `ALLOW_LOCALHOST_BYPASS=true`. This tells the backend auth middleware:

> "If the request comes from 127.0.0.1 / localhost, skip auth key validation."

This is necessary because Next.js proxy requests appear to originate from localhost, but they don't carry the `X-Auth-Key` header (that's a browser-to-Next.js concern, not a Next.js-to-backend concern). Without this bypass, every proxied API call would return 401 Unauthorized.

### WebSocket URL Resolution (`frontend/lib/config.ts`)

The frontend resolves the WebSocket URL at runtime (not build time):

```typescript
async function _resolveWsUrl(): Promise<string> {
    const isLocal = hostname === 'localhost' || ...;

    // Always try /api/ws-url first
    const { wsPort } = await fetch('/api/ws-url').then(r => r.json());

    if (isLocal) {
        return `ws://${hostname}:${wsPort}`;  // Direct to backend
    }

    // Remote: try same host (works if WS upgrade is supported)
    return `${protocol}://${window.location.host}`;
}
```

For ngrok mode, the WS URL resolves to `wss://xxxx.ngrok-free.app`, and the `ws-service.ts` appends `/ws/ui` to get `wss://xxxx.ngrok-free.app/ws/ui`. This is proxied by Next.js rewrites to `http://localhost:9807/ws/ui`.

### State Persistence for Mobile Resume

Mobile browsers aggressively kill background tabs. When the user returns to the app:

1. **Cached detected state**: `localStorage('antigravity-cached-detected')` — prevents flash of "Launch Antigravity" onboarding screen
2. **Cached steps**: Last 30 conversation steps cached in localStorage — instant content display before WS reconnects
3. **Cached WS URL**: `localStorage('antigravity-ws-url')` — no HTTP round-trip needed on cold reload
4. **Grace period**: 5-second reconnect grace suppresses disconnect indicators after mount

### Headless Language Server (`src/headless-ls.js`)

When connecting remotely, the user can't launch the Antigravity IDE GUI. Instead, the backend spawns a **headless Language Server** process:

```
1. Detect LS binary from running IDE process or known install paths
2. Get extension server auth (port + CSRF) from running IDE
3. Create mock parent pipe (Windows named pipe / Unix socket)
4. Spawn LS with args:
     --enable_lsp
     --csrf_token <random>
     --workspace_id <encoded_path>
     --parent_pipe_path <pipe>
     --extension_server_port <port>
     --extension_server_csrf_token <token>
5. Wait for LS to bind HTTP/HTTPS ports
6. Call AddTrackedWorkspace API to bind workspace folder
7. Register in lsInstances array
8. Frontend sees new workspace via conversations_updated broadcast
```

**Important**: The headless LS requires at least one Antigravity IDE window to be open on the host machine (for extension server auth). It cannot run standalone.

---

## Configuration Reference

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `AUTH_KEY` | Random 32-hex | Override the generated auth key |
| `ALLOW_LOCALHOST_BYPASS` | `false` | Skip auth for localhost requests (set automatically in ngrok mode) |
| `BACKEND_PORT` | `9807` (prod) / `3500` (dev) | Backend port |
| `QUIET_POLL` | `0` | Suppress LS polling logs |
| `NODE_ENV` | — | Set to `production` by tunnel launcher |

### CLI Flags (`start-tunnel.js`)

| Flag | Description |
|------|-------------|
| `--ngrok` | Force ngrok even if cloudflared is available |
| `--local` | No tunnels — local-only mode |
| `--build` | Force frontend rebuild (even if `.next` exists) |
| `--quiet` | Minimal output |

### NPM Scripts

| Script | Command | Description |
|--------|---------|-------------|
| `npm run online` | `node start-tunnel.js` | Auto-detect provider (cloudflared → ngrok) |
| `npm run online:ngrok` | `node start-tunnel.js --ngrok` | Force ngrok |
| `npm run prod` | `node start-tunnel.js --local` | Local production (no tunnel) |
| `npm run dev` | `concurrently BE FE` | Development mode (ports 3500/3000) |

### Ports

| Port | Service | Notes |
|------|---------|-------|
| `9807` | Backend (Express) | Production only — dev uses 3500 |
| `9808` | Frontend (Next.js) | Production only — dev uses 3000 |
| `3500` | Backend (dev) | Used during `npm run dev` |
| `3000` | Frontend (dev) | Used during `npm run dev` |

### Output Files

| File | Description |
|------|-------------|
| `.tunnel-info.txt` | Active tunnel URL, auth key, timestamps |
| `frontend/.next/.backend-port` | Port marker to detect stale builds |

---

## Mobile-Specific Behavior

### Sidebar Auto-Close

On mobile devices (screen width < 768px), the sidebar drawer auto-closes when the user:
- Selects a workspace
- Opens a conversation
- Clicks a navigation item (Settings, Agent Hub, etc.)
- Creates a new workspace

This is handled by the `closeMobile()` helper in `app-sidebar.tsx`:

```typescript
const closeMobile = useCallback(() => {
    if (isMobile) setOpenMobile(false)
}, [isMobile, setOpenMobile])
```

### Page Lifecycle Events

The WebSocket service handles mobile browser lifecycle events:

- **`visibilitychange` → hidden**: Records timestamp
- **`visibilitychange` → visible**: If hidden > 5s, force-reconnects (assumes WS is stale)
- **`freeze`** (iOS/mobile): Clean-closes WS to avoid stuck CLOSING state
- **`resume`**: Immediately reconnects

### PWA Considerations

The app includes a service worker and PWA manifest. On mobile:
- Add to Home Screen for native-app feel
- Push notifications work via VAPID keys
- Offline state shows cached content gracefully

---

## Troubleshooting

### "LS Connected" green but chatbox empty

**Cause**: WebSocket connection failed — the AI response stream can't reach the browser.

**Fix**: Ensure `next.config.ts` has the `/ws/*` rewrite rule and the build includes it. Force rebuild:
```bash
npm run online:ngrok -- --build
```

### "WS" indicator shows red

**Cause**: WebSocket upgrade rejected by ngrok or Next.js.

**Check**:
1. `frontend/next.config.ts` must have both `/api/*` and `/ws/*` rewrites
2. `server.js` must accept `/ws/ui` path in upgrade handler
3. Rebuild frontend after config changes

### Workspace shows orange HL badge

**Cause**: Successfully launched a headless Language Server. Orange = headless (vs blue = IDE).

This is normal and expected when connecting remotely.

### "Headless LS failed to bind ports within timeout"

**Cause**: The Language Server binary crashed on startup — usually a bad flag.

**Check**:
- `src/headless-ls.js` should NOT pass `--random_port` (removed — was a deprecated flag)
- At least one Antigravity IDE window must be open (provides extension server auth)
- Verify the LS binary exists at the detected path

### ngrok shows "ERR_NGROK_105" or "authtoken invalid"

**Fix**: Configure your authtoken:
```bash
ngrok config add-authtoken YOUR_TOKEN
```

### Process crashes with "exit code: 1" on restart

**Cause**: Port contention from previous run's zombie processes.

**Fix**: The launcher automatically kills stale processes on ports 9807/9808 at startup. If it still fails:
```powershell
# Windows
taskkill /F /FI "IMAGENAME eq node.exe"
taskkill /F /FI "IMAGENAME eq ngrok.exe"

# macOS/Linux
lsof -ti :9807 :9808 | xargs kill -9
pkill -f "ngrok.*http"
```

### Cloudflare rate limited (429)

Switch to ngrok:
```bash
npm run online:ngrok
```

Or wait 5-10 minutes and retry `npm run online`.

### Mobile shows "Launch Antigravity" loop

**Cause**: The `detected` state is false because neither WebSocket nor HTTP polling confirmed an LS instance.

**Check**:
1. Backend is running and healthy: `curl http://localhost:9807/api/status`
2. At least one workspace is open in the IDE on the host machine
3. The `detected` state is NOT reset on WS close (check `websocket.ts` line 157)

---

## Security Model

### Authentication

- **Auth Key**: 32-character random hex generated per session
- **Transport**: HTTPS (ngrok provides TLS termination)
- **Header**: `X-Auth-Key` on all HTTP requests
- **WebSocket**: `?auth_key=<key>` query parameter
- **Storage**: localStorage + cookie (dual redundancy for mobile)
- **Cookie**: `SameSite=Strict`, 30-day expiry

### Localhost Bypass

When `ALLOW_LOCALHOST_BYPASS=true`, requests from `127.0.0.1` skip auth validation. This is ONLY set in ngrok mode where Next.js proxies requests from the browser through localhost.

### Network Exposure

- Backend port 9807 is **never exposed** to the internet in ngrok mode
- Only port 9808 (frontend) is tunneled
- All backend communication goes through the Next.js reverse proxy on localhost
- Ngrok provides TLS encryption for the public-facing connection

### Helmet.js Headers

The Express backend applies security headers via Helmet:
- Content Security Policy (CSP)
- HSTS (1 year, includeSubDomains, preload)
- X-Frame-Options: DENY
- X-Content-Type-Options: nosniff
- Referrer-Policy: strict-origin-when-cross-origin

### Rate Limiting

Express applies `express-rate-limit` to prevent brute-force auth key guessing.

---

## Provider Comparison: Cloudflared vs Ngrok

| Aspect | Cloudflared | Ngrok |
|--------|------------|-------|
| **Account** | None (anonymous) | Free account required |
| **Setup** | `winget install cloudflare.cloudflared` | `winget install ngrok.ngrok` + authtoken |
| **Tunnels** | 2 (BE + FE) | 1 (FE only) |
| **Build** | Required per session (bakes BE URL) | Cached (no URL baking needed) |
| **Startup Time** | ~30-60s (includes rebuild) | ~15-30s (reuses cached build) |
| **URL Format** | `https://xxx-yyy.trycloudflare.com` | `https://xxxx.ngrok-free.app` |
| **URL Stability** | New URL every restart | New URL every restart (free tier) |
| **Rate Limits** | Aggressive (429 after ~10 restarts) | Generous (free: 1 tunnel, 20 conn/min) |
| **WebSocket** | Direct to backend tunnel | Via Next.js proxy |
| **Interstitial** | None | "Visit Site" page on first visit |
| **CLI** | `cloudflared tunnel --url ...` | `ngrok http PORT --log stdout` |

### When to Use Each

- **cloudflared**: First choice. No account, no interstitial page. Just works.
- **ngrok**: When cloudflared is rate-limited or unavailable. Requires one-time account setup.

---

## Files Modified

### Core Changes for Ngrok Support

| File | What Changed |
|------|-------------|
| [`start-tunnel.js`](../start-tunnel.js) | Added `findNgrok()`, provider abstraction, `_runNgrokTunnel()`, `ALLOW_LOCALHOST_BYPASS` env, ngrok URL extraction, ngrok rate-limit/auth detection |
| [`server.js`](../server.js) | Added `/ws/ui` path to WebSocket upgrade handler |
| [`frontend/next.config.ts`](../frontend/next.config.ts) | Added `/ws/:path*` rewrite rule for WebSocket proxying |
| [`frontend/lib/ws-service.ts`](../frontend/lib/ws-service.ts) | Changed WS connection to use explicit `/ws/ui` path |
| [`frontend/lib/config.ts`](../frontend/lib/config.ts) | Updated `getWsUrl()` to resolve via `/api/ws-url` first; localStorage caching |
| [`frontend/lib/websocket.ts`](../frontend/lib/websocket.ts) | Prevented `detected` state reset on WS close; added cached state restore |
| [`frontend/lib/auth.ts`](../frontend/lib/auth.ts) | Dual localStorage + cookie storage for auth key resilience |
| [`frontend/components/app-sidebar.tsx`](../frontend/components/app-sidebar.tsx) | Added `closeMobile()` for auto-close on navigation |
| [`src/headless-ls.js`](../src/headless-ls.js) | Removed deprecated `--random_port` flag |
| [`package.json`](../package.json) | Added `online:ngrok` script |
| [`scripts/setup.ps1`](../scripts/setup.ps1) | Added ngrok detection in dependency check |
| [`scripts/setup.sh`](../scripts/setup.sh) | Added ngrok detection in dependency check |
| [`scripts/uninstall.ps1`](../scripts/uninstall.ps1) | Added `ngrok.exe` to cleanup kill list |

---

## Known Limitations

1. **Free-tier URL changes**: ngrok free tier generates a new URL on every restart. Consider ngrok paid plans for stable custom domains.

2. **Interstitial page**: ngrok free tier shows a "Visit Site" interstitial on first visit per session. Users must tap through it.

3. **One tunnel limit**: ngrok free tier allows only one tunnel at a time. The single-tunnel architecture (FE only) works within this constraint.

4. **Auth key per session**: The auth key is regenerated on each `npm run online:ngrok` restart. Set `AUTH_KEY` environment variable for persistence:
   ```bash
   AUTH_KEY=my_fixed_key_here npm run online:ngrok
   ```

5. **Headless LS requires IDE**: The headless Language Server cannot authorize without at least one Antigravity IDE window running on the host machine.

6. **WebSocket via proxy**: In ngrok mode, WebSocket connections go through Next.js's reverse proxy, adding marginal latency compared to cloudflared's direct backend tunnel. This is unnoticeable in practice.
