// === Frontend Configuration ===
// API: always relative path '' → Next.js proxy → backend (no CORS ever)
// WS:  fetched at runtime from /api/ws-url → backend port always correct

export const API_BASE = '';

// WS URL is resolved lazily at runtime by websocket.ts via getWsUrl()
// This avoids relying on NEXT_PUBLIC_ build-time vars that require a full rebuild.
let _wsUrl: string | null = null;

// Tailscale IPs: 100.64.0.0 – 100.127.255.255 (CGNAT range)
function isTailscaleHost(hostname: string): boolean {
    // Check IP pattern: 100.(64-127).x.x
    const ipMatch = hostname.match(/^100\.(\d+)\.\d+\.\d+$/);
    if (ipMatch) {
        const second = parseInt(ipMatch[1], 10);
        return second >= 64 && second <= 127;
    }
    // Check MagicDNS hostnames: *.tail*.ts.net or *.ts.net
    return /\.ts\.net$/i.test(hostname);
}

export async function getWsUrl(): Promise<string> {
    if (_wsUrl) return _wsUrl;

    const isBrowser = typeof window !== 'undefined';
    if (!isBrowser) return 'ws://localhost:3500';

    const hostname = window.location.hostname;
    const isLocal = hostname === 'localhost' || hostname === '127.0.0.1';
    const isTailscale = isTailscaleHost(hostname);

    if (isLocal || isTailscale) {
        // Local or Tailscale: fetch actual backend port at runtime
        // Next.js proxies /api/* → backend, so this always works
        try {
            const res = await fetch('/api/ws-url');
            const { wsPort } = await res.json();
            // For Tailscale: connect WS to the same hostname but backend port
            // For local: connect to localhost
            const wsHost = isTailscale ? hostname : 'localhost';
            _wsUrl = `ws://${wsHost}:${wsPort}`;
        } catch {
            _wsUrl = `ws://${isLocal ? 'localhost' : hostname}:3500`; // fallback
        }
    } else {
        // Remote tunnel (Cloudflare etc): use NEXT_PUBLIC_BACKEND_URL if available
        const tunnel = process.env.NEXT_PUBLIC_BACKEND_URL || '';
        _wsUrl = tunnel
            ? tunnel.replace(/^http/, 'ws')
            : `${window.location.protocol === 'https:' ? 'wss' : 'ws'}://${window.location.host}`;
    }

    return _wsUrl;
}

// Legacy sync export (used as initial value — overridden when getWsUrl() resolves)
export const WS_URL = '';

