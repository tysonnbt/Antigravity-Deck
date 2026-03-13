/**
 * Singleton WebSocket service — one shared connection for the entire app.
 * Components subscribe to message types via addEventListener pattern.
 * Handles connect, reconnect (exponential backoff + keepalive), auth, and exposes send().
 */
'use client';

import { getWsUrl } from './config';
import { authWsUrl } from './auth';

type WSListener = (data: Record<string, unknown>) => void;

class WebSocketService {
    private ws: WebSocket | null = null;
    private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    private keepaliveTimer: ReturnType<typeof setInterval> | null = null;
    private listeners = new Map<string, Set<WSListener>>(); // type → listeners
    private wildcardListeners = new Set<WSListener>(); // receive ALL messages
    private _connected = false;
    private reconnectAttempts = 0;
    private lastPong = 0;

    get connected() { return this._connected; }

    /** Subscribe to a specific message type (e.g. 'status', 'steps_new') */
    on(type: string, fn: WSListener) {
        if (!this.listeners.has(type)) this.listeners.set(type, new Set());
        this.listeners.get(type)!.add(fn);
        return () => { this.listeners.get(type)?.delete(fn); };
    }

    /** Subscribe to ALL messages (for Live Logs) */
    onAll(fn: WSListener) {
        this.wildcardListeners.add(fn);
        return () => { this.wildcardListeners.delete(fn); };
    }

    /** Send a message to the backend */
    send(data: Record<string, unknown>) {
        if (this.ws?.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(data));
        }
    }

    /** Connect (idempotent — safe to call multiple times) */
    async connect() {
        if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
            return; // already connected or connecting
        }
        try {
            const wsBase = await getWsUrl();
            const ws = new WebSocket(authWsUrl(wsBase));
            this.ws = ws;

            ws.onopen = () => {
                console.log('[WS-Service] connected');
                this._connected = true;
                this.reconnectAttempts = 0; // reset backoff on successful connect
                this.lastPong = Date.now();
                // Subscribe to all events so backend sends messages for ALL conversations
                // (needed for Live Logs which monitors all cascades)
                ws.send(JSON.stringify({ type: 'subscribe_all' }));
                this.emit('__ws_open', {});
                // Start keepalive ping every 25s to detect stale connections
                this.startKeepalive();
            };

            ws.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    const type = data.type as string;
                    // Track pong responses for keepalive
                    if (type === 'pong') {
                        this.lastPong = Date.now();
                        return;
                    }
                    // Any message from server counts as alive
                    this.lastPong = Date.now();
                    // Emit to type-specific listeners
                    if (type) {
                        this.listeners.get(type)?.forEach(fn => fn(data));
                    }
                    // Emit to wildcard listeners (Live Logs)
                    this.wildcardListeners.forEach(fn => fn(data));
                } catch (e) {
                    console.error('[WS-Service] parse error:', e);
                }
            };

            ws.onclose = () => {
                console.log('[WS-Service] disconnected');
                this._connected = false;
                this.stopKeepalive();
                this.emit('__ws_close', {});
                this.scheduleReconnect();
            };

            ws.onerror = () => ws.close();
        } catch {
            this.scheduleReconnect();
        }
    }

    /** Exponential backoff with jitter: 2s → 4s → 8s → 16s → 30s cap */
    private scheduleReconnect() {
        if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
        const baseDelay = Math.min(2000 * Math.pow(2, this.reconnectAttempts), 30000);
        const jitter = Math.random() * 1000; // 0-1s jitter
        const delay = baseDelay + jitter;
        this.reconnectAttempts++;
        console.log(`[WS-Service] reconnecting in ${Math.round(delay)}ms (attempt ${this.reconnectAttempts})`);
        this.reconnectTimer = setTimeout(() => this.connect(), delay);
    }

    /** Keepalive: ping every 45s, close if no response in 90s (VPN-friendly) */
    private startKeepalive() {
        this.stopKeepalive();
        this.keepaliveTimer = setInterval(() => {
            if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
            // Check if we got any message in the last 90s
            if (Date.now() - this.lastPong > 90000) {
                console.warn('[WS-Service] keepalive timeout — forcing reconnect');
                this.ws.close();
                return;
            }
            // Send ping
            this.ws.send(JSON.stringify({ type: 'ping' }));
        }, 45000);
    }

    private stopKeepalive() {
        if (this.keepaliveTimer) {
            clearInterval(this.keepaliveTimer);
            this.keepaliveTimer = null;
        }
    }

    /** Disconnect and clean up */
    disconnect() {
        if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
        this.stopKeepalive();
        this.ws?.close();
        this.ws = null;
        this._connected = false;
    }

    private emit(type: string, data: Record<string, unknown>) {
        this.listeners.get(type)?.forEach(fn => fn(data));
    }
}

// Singleton instance — shared across entire app
export const wsService = typeof window !== 'undefined' ? new WebSocketService() : null;

