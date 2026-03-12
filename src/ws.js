// === WebSocket Handling ===
// Manages WS connections, per-client conversation tracking, and broadcasting.

const { lsInstances } = require('./config');
const { getInstanceForCascade } = require('./poller');

const viewers = new Set();
const globalViewers = new Set(); // clients that want ALL events (Live Logs)
const clientConvMap = new Map(); // Map<ws, convId> — per-client conversation tracking

function setupWebSocket(wss, { ensureCached, stepCache }) {
    wss.on('connection', (ws, req) => {
        const authKey = process.env.AUTH_KEY || '';
        const ip = req.socket.remoteAddress || '';
        const isLocal = ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';

        // Auth: local connections auto-auth, remote must send auth message
        let authenticated = !authKey || isLocal;

        // Backward compat: also accept ?auth_key= in URL (will be removed in future)
        if (!authenticated) {
            const url = new URL(req.url, 'http://localhost');
            const urlKey = url.searchParams.get('auth_key');
            if (urlKey === authKey) authenticated = true;
        }

        const messageBuffer = []; // buffer messages until auth
        let authTimeout = null;

        if (!authenticated) {
            // Give client 5s to send auth message
            authTimeout = setTimeout(() => {
                if (!authenticated) {
                    console.log(`[WS] Auth timeout — closing connection from ${ip}`);
                    ws.close(4401, 'Auth timeout');
                }
            }, 5000);
        }

        // Add to viewers immediately (for status broadcast), but gate message processing
        viewers.add(ws);

        // Process a single message (extracted so buffer + live can share)
        async function processMessage(msg) {
            if (msg.type === 'set_conversation') {
                clientConvMap.set(ws, msg.conversationId);
                console.log(`[WS] set_conversation → ${msg.conversationId?.substring(0, 8)}, clients: ${clientConvMap.size}`);
                if (!stepCache[msg.conversationId]) {
                    sendToOne(ws, { type: 'steps_loading', conversationId: msg.conversationId });
                }
                await ensureCached(msg.conversationId, getInstanceForCascade(msg.conversationId));
                const cache = stepCache[msg.conversationId];
                sendToOne(ws, {
                    type: 'steps_init',
                    conversationId: msg.conversationId,
                    steps: cache ? cache.steps : [],
                    baseIndex: cache ? (cache.baseIndex || 0) : 0,
                    stepCount: cache ? (cache.stepCount || 0) : 0,
                });
            } else if (msg.type === 'subscribe_all') {
                globalViewers.add(ws);
                console.log(`[WS] subscribe_all — global viewers: ${globalViewers.size}`);
            } else if (msg.type === 'app_log') {
                broadcastToGlobal({ ...msg, ts: msg.ts || Date.now() });
            }
        }

        // Send initial status immediately (even before auth — it's public info)
        ws.send(JSON.stringify({ type: 'status', detected: lsInstances.length > 0, port: lsInstances[0]?.port || null }));

        ws.on('message', async (raw) => {
            try {
                const msg = JSON.parse(raw.toString());

                // Handle auth message
                if (!authenticated) {
                    if (msg.type === 'auth') {
                        if (msg.key === authKey) {
                            authenticated = true;
                            if (authTimeout) clearTimeout(authTimeout);
                            console.log(`[WS] Authenticated via message from ${ip}`);
                            // Process buffered messages
                            for (const buffered of messageBuffer) {
                                await processMessage(buffered);
                            }
                            messageBuffer.length = 0;
                        } else {
                            console.log(`[WS] Invalid auth key from ${ip}`);
                            ws.close(4401, 'Invalid key');
                        }
                        return;
                    }
                    // Buffer non-auth messages until authenticated
                    messageBuffer.push(msg);
                    return;
                }

                await processMessage(msg);
            } catch (e) { }
        });

        ws.on('close', () => {
            if (authTimeout) clearTimeout(authTimeout);
            viewers.delete(ws);
            globalViewers.delete(ws);
            clientConvMap.delete(ws);
        });
    });
}

function sendToOne(ws, data) {
    if (ws.readyState === 1) ws.send(JSON.stringify(data));
}

function broadcast(data, targetConvId) {
    const msg = JSON.stringify(data);
    // Send to viewers watching this specific conversation
    viewers.forEach(v => {
        if (v.readyState !== 1) return;
        if (targetConvId && clientConvMap.get(v) !== targetConvId) return;
        v.send(msg);
    });
    // Also send to global viewers (Live Logs — all cascades)
    globalViewers.forEach(v => {
        if (v.readyState !== 1) return;
        v.send(msg);
    });

}

// Broadcast to ALL connected viewers (no conversation filter)
function broadcastAll(data) {
    const msg = JSON.stringify(data);
    viewers.forEach(v => {
        if (v.readyState === 1) v.send(msg);
    });
}

// Broadcast to global viewers only (Live Logs subscribers — for app_log events)
function broadcastToGlobal(data) {
    const msg = JSON.stringify(data);
    globalViewers.forEach(v => {
        if (v.readyState === 1) v.send(msg);
    });
}

module.exports = { setupWebSocket, sendToOne, broadcast, broadcastAll, broadcastToGlobal };
