/**
 * Singleton WebSocket service — one shared connection for the entire app.
 * Components subscribe to message types via addEventListener pattern.
 * Handles connect, reconnect, auth, and exposes send().
 */
'use client';

import { getWsUrl } from './config';
import { getAuthKey } from './auth';

type WSListener = (data: Record<string, unknown>) => void;

class WebSocketService {
    private ws: WebSocket | null = null;
    private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    private listeners = new Map<string, Set<WSListener>>(); // type → listeners
    private wildcardListeners = new Set<WSListener>(); // receive ALL messages
    private _connected = false;

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
            // Connect WITHOUT auth key in URL — auth via message instead
            const ws = new WebSocket(wsBase);
            this.ws = ws;

            ws.onopen = () => {
                console.log('[WS-Service] connected');
                this._connected = true;
                // Authenticate via message (key never appears in URL/logs)
                const key = getAuthKey();
                if (key) {
                    ws.send(JSON.stringify({ type: 'auth', key }));
                }
                // Subscribe to all events so backend sends messages for ALL conversations
                ws.send(JSON.stringify({ type: 'subscribe_all' }));
                this.emit('__ws_open', {});
            };

            ws.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    const type = data.type as string;
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
                this.emit('__ws_close', {});
                this.reconnectTimer = setTimeout(() => this.connect(), 2000);
            };

            ws.onerror = () => ws.close();
        } catch {
            this.reconnectTimer = setTimeout(() => this.connect(), 2000);
        }
    }

    /** Disconnect and clean up */
    disconnect() {
        if (this.reconnectTimer) clearTimeout(this.reconnectTimer);
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
