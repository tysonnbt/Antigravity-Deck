// === Frontend Configuration ===
// API: always relative path '' → Next.js proxy → backend (no CORS ever)
// WS:  fetched at runtime from /api/ws-url → backend port always correct

export const API_BASE = '';

// WS URL is resolved lazily at runtime by websocket.ts via getWsUrl()
// This avoids relying on NEXT_PUBLIC_ build-time vars that require a full rebuild.
// Cached in localStorage for instant reconnect on mobile cold-reload.
let _wsUrl: string | null = null;
const WS_URL_CACHE_KEY = 'antigravity-ws-url';

export async function getWsUrl(): Promise<string> {
    if (_wsUrl) return _wsUrl;

    const isBrowser = typeof window !== 'undefined';
    if (!isBrowser) return 'ws://localhost:3500';

    // Try localStorage cache first (instant — no HTTP round trip on cold reload)
    const cached = localStorage.getItem(WS_URL_CACHE_KEY);
    if (cached) {
        _wsUrl = cached;
        // Refresh cache in background (non-blocking) so it stays up to date
        _refreshWsUrlCache();
        return _wsUrl;
    }

    // First-ever load: resolve and cache
    _wsUrl = await _resolveWsUrl();
    localStorage.setItem(WS_URL_CACHE_KEY, _wsUrl);
    return _wsUrl;
}

async function _resolveWsUrl(): Promise<string> {
    const hostname = window.location.hostname;

    const isLocal =
        hostname === 'localhost' ||
        hostname === '127.0.0.1' ||
        /^192\.168\./.test(hostname) ||
        /^10\./.test(hostname) ||
        /^172\.(1[6-9]|2\d|3[01])\./.test(hostname) ||
        /^169\.254\./.test(hostname);

    if (isLocal) {
        try {
            const res = await fetch('/api/ws-url');
            const { wsPort } = await res.json();
            return `ws://${hostname}:${wsPort}`;
        } catch {
            return `ws://${hostname}:3500`;
        }
    } else {
        const tunnel = process.env.NEXT_PUBLIC_BACKEND_URL || '';
        return tunnel
            ? tunnel.replace(/^http/, 'ws')
            : `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}`;
    }
}

function _refreshWsUrlCache() {
    _resolveWsUrl().then(fresh => {
        if (fresh !== _wsUrl) {
            _wsUrl = fresh;
            localStorage.setItem(WS_URL_CACHE_KEY, fresh);
        }
    }).catch(() => { /* ignore — cache is still valid */ });
}


// Legacy sync export (used as initial value — overridden when getWsUrl() resolves)
export const WS_URL = '';
