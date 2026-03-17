// === Frontend Configuration ===
// API: always relative path '' → Next.js proxy → backend (no CORS ever)
// WS:  fetched at runtime from /api/ws-url → backend port always correct

export const API_BASE = '';

// WS URL is resolved lazily at runtime by websocket.ts via getWsUrl()
// This avoids relying on NEXT_PUBLIC_ build-time vars that require a full rebuild.
let _wsUrl: string | null = null;

export async function getWsUrl(): Promise<string> {
    if (_wsUrl) return _wsUrl;

    const isBrowser = typeof window !== 'undefined';
    if (!isBrowser) return 'ws://localhost:3500';

    const hostname = window.location.hostname;

    // Treat localhost, loopback, and private LAN IPs as "local"
    // (192.168.x.x, 10.x.x.x, 172.16-31.x.x, 169.254.x.x link-local)
    const isLocal =
        hostname === 'localhost' ||
        hostname === '127.0.0.1' ||
        /^192\.168\./.test(hostname) ||
        /^10\./.test(hostname) ||
        /^172\.(1[6-9]|2\d|3[01])\./.test(hostname) ||
        /^169\.254\./.test(hostname);

    if (isLocal) {
        // Fetch actual backend port at runtime via Next.js proxy — works for
        // localhost AND any LAN IP the server is reachable on.
        try {
            const res = await fetch('/api/ws-url');
            const { wsPort } = await res.json();
            _wsUrl = `ws://${hostname}:${wsPort}`;
        } catch {
            _wsUrl = `ws://${hostname}:3500`; // fallback
        }
    } else {
        // Remote tunnel: use NEXT_PUBLIC_BACKEND_URL if available, else derive from window.location
        const tunnel = process.env.NEXT_PUBLIC_BACKEND_URL || '';
        _wsUrl = tunnel
            ? tunnel.replace(/^http/, 'ws')
            : `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}`;
    }

    return _wsUrl;
}


/**
 * Agent WebSocket URL — derived from UI WS URL by appending /agent path.
 * Example: ws://localhost:3500 → ws://localhost:3500/ws/agent
 */
export async function getAgentWsUrl(): Promise<string> {
    const uiWsUrl = await getWsUrl();
    // getWsUrl() returns e.g. "ws://localhost:3500" (no path)
    // Agent WS is at /ws/agent
    return `${uiWsUrl}/ws/agent`;
}

// Legacy sync export (used as initial value — overridden when getWsUrl() resolves)
export const WS_URL = '';
