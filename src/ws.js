// === WebSocket Handling ===
// Manages WS connections, per-client conversation tracking, and broadcasting.

const { lsInstances } = require('./config');
const { getInstanceForCascade } = require('./poller');

const viewers = new Set();
const globalViewers = new Set(); // clients that want ALL events (Live Logs)
const clientConvMap = new Map(); // Map<ws, convId> — per-client conversation tracking

function setupWebSocket(wss, { ensureCached, stepCache }) {
    wss.on('connection', (ws, req) => {
        // Auth check for WebSocket (skip for localhost connections — same policy as HTTP)
        const authKey = process.env.AUTH_KEY || '';
        if (authKey) {
            const ip = req.socket.remoteAddress || '';
            const isLocal = ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
            if (!isLocal) {
                const url = new URL(req.url, 'http://localhost');
                const key = url.searchParams.get('auth_key');
                if (key !== authKey) {
                    ws.close(4401, 'Unauthorized');
                    return;
                }
            }
        }
        viewers.add(ws);
        ws.send(JSON.stringify({ type: 'status', detected: lsInstances.length > 0, port: lsInstances[0]?.port || null }));

        ws.on('message', async (raw) => {
            try {
                const msg = JSON.parse(raw.toString());
                if (msg.type === 'set_conversation') {
                    clientConvMap.set(ws, msg.conversationId);
                    console.log(`[WS] set_conversation → ${msg.conversationId?.substring(0, 8)}, clients: ${clientConvMap.size}`);
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
                    // Live Logs mode: receive all broadcasts regardless of conversation
                    globalViewers.add(ws);
                    console.log(`[WS] subscribe_all — global viewers: ${globalViewers.size}`);
                }
            } catch (e) { }
        });

        ws.on('close', () => {
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

module.exports = { setupWebSocket, sendToOne, broadcast, broadcastAll };
