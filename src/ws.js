// === WebSocket Handling ===
// Manages WS connections, per-client conversation tracking, and broadcasting.

const { lsInstances } = require('./config');
const { getInstanceForCascade } = require('./poller');
const { verifyAccessToken } = require('./jwt-utils');

const viewers = new Set();
const globalViewers = new Set(); // clients that want ALL events (Live Logs)
const clientConvMap = new Map(); // Map<ws, convId> — per-client conversation tracking

function setupWebSocket(wss, { ensureCached, stepCache }) {
    wss.on('connection', (ws, req) => {
        // WebSocket Authentication
        const jwtSecret = process.env.JWT_SECRET || '';
        const authKey = process.env.AUTH_KEY || '';
        
        if (jwtSecret || authKey) {
            const ip = req.socket.remoteAddress || '';
            const isLocal = ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1';
            const allowLocalBypass = process.env.ALLOW_LOCALHOST_BYPASS === 'true';
            
            // Check auth (no localhost bypass unless explicitly enabled)
            if (!(isLocal && allowLocalBypass)) {
                const url = new URL(req.url, 'http://localhost');
                let authenticated = false;
                
                // JWT mode: only accept JWT tokens
                if (jwtSecret) {
                    // Extract JWT from query param or cookie
                    const token = url.searchParams.get('token') || 
                                 req.headers.cookie?.match(/access_token=([^;]+)/)?.[1];
                    
                    if (token) {
                        try {
                            const decoded = verifyAccessToken(token);
                            req.user = { id: decoded.sub };
                            authenticated = true;
                        } catch (err) {
                            // JWT invalid - reject connection
                            console.warn('[WS] Invalid JWT token:', err.message);
                        }
                    }
                }
                // Legacy mode: only accept auth_key when JWT_SECRET is not set
                else if (authKey) {
                    const key = url.searchParams.get('auth_key');
                    if (key === authKey) {
                        authenticated = true;
                    }
                }
                
                if (!authenticated) {
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
                        steps: cache ? cache.steps : []
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
