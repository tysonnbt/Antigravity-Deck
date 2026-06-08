// === AgentState Streaming (Phase 4) ===
// Incremental, read-only subscription to StreamAgentStateUpdates.
// Modeled on startCascadeSSE() in src/poller.js: a long-lived
// transport.request POST that parses streaming frames, rejectUnauthorized:false,
// with 10s auto-retry on error.
//
// The LS requires application/connect+json for server-streaming RPCs.
// The Connect Protocol framing uses 5-byte envelopes:
//   byte[0]   = flags (0x00 = data frame, 0x02 = end-stream/trailer)
//   bytes[1-4] = big-endian uint32 payload length
//   bytes[5+]  = JSON payload

const http = require('http');
const https = require('https');
const crypto = require('crypto');

const LS_SERVICE_PATH = '/exa.language_server_pb.LanguageServerService';
const LS_METHOD = 'StreamAgentStateUpdates';
const CONNECT_FLAG_DATA = 0x00;

/**
 * Encode a single Connect Protocol message envelope.
 * @param {object} jsonBody
 * @returns {Buffer}
 */
function encodeConnectEnvelope(jsonBody) {
    const payload = Buffer.from(JSON.stringify(jsonBody));
    const envelope = Buffer.allocUnsafe(5 + payload.length);
    envelope[0] = CONNECT_FLAG_DATA;
    envelope.writeUInt32BE(payload.length, 1);
    payload.copy(envelope, 5);
    return envelope;
}

/**
 * Subscribe to incremental AgentStateUpdate frames for a conversation.
 *
 * @param {object} inst       - LS instance: { port, csrfToken, useTls }
 * @param {string} conversationId
 * @param {function} onUpdate - called with each parsed AgentStateUpdate object
 * @returns {function} teardown - call to destroy the stream and stop retries
 */
function subscribeAgentState(inst, conversationId, onUpdate) {
    let destroyed = false;
    let activeReq = null;
    let retryTimer = null;

    function teardown() {
        destroyed = true;
        if (retryTimer) { clearTimeout(retryTimer); retryTimer = null; }
        if (activeReq) { try { activeReq.destroy(); } catch {} activeReq = null; }
    }

    const subscriberId = crypto.randomUUID();

    async function connect() {
        if (destroyed) return;

        if (!inst || !inst.port || !inst.csrfToken) {
            console.log('[AgentStream] Not starting — LS instance not configured');
            return;
        }

        const host = inst.useTls ? '127.0.0.1' : 'localhost';
        const transport = inst.useTls ? https : http;
        const body = encodeConnectEnvelope({ conversationId, subscriberId });

        console.log(`[AgentStream] Connecting to ${LS_METHOD} for ${conversationId.substring(0, 8)}...`);

        try {
            const res = await new Promise((resolve, reject) => {
                const req = transport.request({
                    hostname: host,
                    port: inst.port,
                    path: `${LS_SERVICE_PATH}/${LS_METHOD}`,
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/connect+json',
                        'Connect-Protocol-Version': '1',
                        'X-Codeium-Csrf-Token': inst.csrfToken,
                        'Content-Length': body.length,
                    },
                    rejectUnauthorized: false,
                }, resolve);
                activeReq = req;            // track immediately so teardown can destroy it
                req.on('error', reject);
                req.write(body);
                req.end();
            });

            if (res.statusCode >= 400) {
                const chunks = [];
                res.on('data', (c) => chunks.push(c.toString()));
                await new Promise((r) => res.on('end', r));
                const errBody = chunks.join('').trim();
                console.log(`[AgentStream] HTTP ${res.statusCode} — ${errBody || 'no body'}`);
                res.resume();
                if (!destroyed) {
                    retryTimer = setTimeout(connect, 10000);
                }
                return;
            }

            console.log(`[AgentStream] Connected (HTTP ${res.statusCode}) for ${conversationId.substring(0, 8)}`);

            // Parse Connect Protocol 5-byte envelope framing from the streaming response.
            // Accumulate chunks in a Buffer; drain complete frames as they arrive.
            let buffer = Buffer.alloc(0);

            for await (const chunk of res) {
                if (destroyed) break;
                buffer = Buffer.concat([buffer, chunk]);

                // Drain all complete frames from the buffer
                while (buffer.length >= 5) {
                    const flag = buffer[0];
                    const msgLen = buffer.readUInt32BE(1);

                    if (buffer.length < 5 + msgLen) break; // wait for more data

                    const msgBody = buffer.slice(5, 5 + msgLen);
                    buffer = buffer.slice(5 + msgLen);

                    // flag 0x02 = end-stream trailer (may contain error); log but don't call onUpdate
                    if (flag !== CONNECT_FLAG_DATA) {
                        try {
                            const trailer = JSON.parse(msgBody.toString());
                            if (trailer.error) {
                                console.log(`[AgentStream] Stream ended with error: ${JSON.stringify(trailer.error)}`);
                            }
                        } catch {}
                        continue;
                    }

                    try {
                        const msg = JSON.parse(msgBody.toString());
                        // StreamAgentStateUpdatesResponse wraps the payload in { update: AgentStateUpdate }
                        const frame = msg.update || msg;
                        onUpdate(frame);
                    } catch { /* malformed frame — skip */ }
                }
            }
        } catch (e) {
            // req.destroy() from teardown throws ECONNRESET — treat as intentional close
            if (!destroyed && e.name !== 'AbortError') {
                console.log(`[AgentStream] Error: ${e.message}. Will retry in 10s.`);
                retryTimer = setTimeout(connect, 10000);
            }
        }
    }

    connect();
    return teardown;
}

module.exports = { subscribeAgentState };
