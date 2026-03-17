// === WebSocket Orchestrator Protocol ===
// Dedicated WebSocket endpoint for orchestrator at /ws/orchestrator.
// Separate from /ws (UI) and /ws/agent (agent sessions).
//
// Protocol:
//   Client → Server: orchestrate, orchestrate_execute, orchestrate_revise,
//                    orchestrate_cancel, orchestrate_clarify, orchestrate_status,
//                    chat_message, chat_reset
//   Server → Client: orch_started, orch_analysis, orch_plan, orch_awaiting_approval,
//                    orch_executing, orch_subtask_update, orch_phase_complete,
//                    orch_clarification, orch_review, orch_progress, orch_completed,
//                    orch_failed, orch_cancelled, orch_log, orch_error,
//                    chat_response, chat_reset_ack

const crypto = require('crypto');
const orchestratorManager = require('./orchestrator-manager');

/**
 * Set up the orchestrator WebSocket server.
 * @param {import('ws').WebSocketServer} wss
 */
function setupOrchestratorWebSocket(wss) {
    const chatSessions = new Map(); // wsConnectionId → OrchestratorSession

    wss.on('connection', (ws, req) => {
        // Auth check (same pattern as ws-agent.js)
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

        // Assign a unique connection ID and extract workspace from query params
        ws._connectionId = crypto.randomUUID();
        const urlObj = new URL(req.url, 'http://localhost');
        ws._workspace = urlObj.searchParams.get('workspace') || undefined;

        // Track which orchestrations this WS connection is subscribed to
        const subscriptions = new Map(); // orchestrationId → cleanup function

        console.log('[WS-Orchestrator] New connection', ws._connectionId);

        ws.on('message', async (raw) => {
            let msg;
            try {
                msg = JSON.parse(raw.toString());
            } catch {
                _send(ws, { type: 'orch_error', message: 'Invalid JSON' });
                return;
            }

            try {
                switch (msg.type) {
                    case 'chat_message': {
                        if (!msg.content) {
                            _send(ws, { type: 'chat_response', content: 'Missing "content" field', messageType: 'error' });
                            break;
                        }
                        let session = chatSessions.get(ws._connectionId);
                        if (!session) {
                            session = orchestratorManager.createChatSession({
                                workspace: msg.workspace || ws._workspace,
                            });
                            chatSessions.set(ws._connectionId, session);
                            const cleanupEvents = _wireChatEvents(ws, session);
                            // Store cleanup function for use on disconnect
                            ws._chatEventCleanup = cleanupEvents;

                            session.on('destroyed', () => {
                                chatSessions.delete(ws._connectionId);
                            });
                        }
                        session.chat(msg.content, { intent: msg.intent, replyTo: msg.replyTo })
                            .catch(e => _send(ws, { type: 'chat_response', content: e.message, messageType: 'error' }));
                        break;
                    }

                    case 'chat_reset': {
                        const session = chatSessions.get(ws._connectionId);
                        if (session) {
                            session.destroy();
                            chatSessions.delete(ws._connectionId);
                        }
                        _send(ws, { type: 'chat_reset_ack' });
                        break;
                    }

                    case 'orchestrate': {
                        if (!msg.task) {
                            _send(ws, { type: 'orch_error', message: 'Missing "task" field' });
                            break;
                        }

                        let session = chatSessions.get(ws._connectionId);
                        if (!session) {
                            session = orchestratorManager.createChatSession({
                                workspace: msg.workspace || ws._workspace,
                            });
                            chatSessions.set(ws._connectionId, session);
                            const cleanupEvents = _wireChatEvents(ws, session);
                            ws._chatEventCleanup = cleanupEvents;

                            session.on('destroyed', () => {
                                chatSessions.delete(ws._connectionId);
                            });
                        }

                        session.chat(msg.task)
                            .catch(e => {
                                _send(ws, { type: 'orch_error', orchestrationId: session.id, message: e.message });
                            });
                        break;
                    }

                    case 'orchestrate_execute': {
                        // Try chat session first (new path)
                        const execSession = msg.orchestrationId
                            ? chatSessions.get(ws._connectionId) || _getChatSessionById(chatSessions, msg.orchestrationId)
                            : chatSessions.get(ws._connectionId);
                        if (execSession) {
                            execSession.chat('approve', { intent: 'approve' })
                                .catch(e => _send(ws, { type: 'orch_error', orchestrationId: execSession.id, message: e.message }));
                            break;
                        }

                        // Fallback: legacy path
                        const orch = _getOrch(ws, msg.orchestrationId);
                        if (!orch) break;

                        if (!subscriptions.has(orch.id)) {
                            const cleanup = _wireOrchestratorEvents(ws, orch);
                            subscriptions.set(orch.id, cleanup);
                        }

                        orch.execute(msg.configOverrides || {}).catch(e => {
                            _send(ws, { type: 'orch_error', orchestrationId: orch.id, message: e.message });
                        });
                        _send(ws, { type: 'orch_executing', orchestrationId: orch.id });
                        break;
                    }

                    case 'orchestrate_revise': {
                        // Try chat session first (new path)
                        const revSession = msg.orchestrationId
                            ? chatSessions.get(ws._connectionId) || _getChatSessionById(chatSessions, msg.orchestrationId)
                            : chatSessions.get(ws._connectionId);
                        if (revSession) {
                            if (!msg.feedback) {
                                _send(ws, { type: 'orch_error', orchestrationId: revSession.id, message: 'Missing "feedback" field' });
                                break;
                            }
                            revSession.chat(msg.feedback, { intent: 'revise' })
                                .catch(e => _send(ws, { type: 'orch_error', orchestrationId: revSession.id, message: e.message }));
                            break;
                        }

                        // Fallback: legacy path
                        const orchRev = _getOrch(ws, msg.orchestrationId);
                        if (!orchRev) break;

                        if (!msg.feedback) {
                            _send(ws, { type: 'orch_error', orchestrationId: orchRev.id, message: 'Missing "feedback" field' });
                            break;
                        }

                        orchRev.revisePlan(msg.feedback).catch(e => {
                            _send(ws, { type: 'orch_error', orchestrationId: orchRev.id, message: e.message });
                        });
                        break;
                    }

                    case 'orchestrate_cancel': {
                        // Try chat session first (new path)
                        const cancelSession = msg.orchestrationId
                            ? chatSessions.get(ws._connectionId) || _getChatSessionById(chatSessions, msg.orchestrationId)
                            : chatSessions.get(ws._connectionId);
                        if (cancelSession) {
                            cancelSession.chat('cancel', { intent: 'cancel' })
                                .catch(e => _send(ws, { type: 'orch_error', orchestrationId: cancelSession.id, message: e.message }));
                            break;
                        }

                        // Fallback: legacy path
                        const orchCancel = _getOrch(ws, msg.orchestrationId);
                        if (!orchCancel) break;

                        await orchCancel.cancel();
                        break;
                    }

                    case 'orchestrate_clarify': {
                        // Try chat session first (new path)
                        const clarifySession = msg.orchestrationId
                            ? chatSessions.get(ws._connectionId) || _getChatSessionById(chatSessions, msg.orchestrationId)
                            : chatSessions.get(ws._connectionId);
                        if (clarifySession) {
                            if (!msg.answer) {
                                _send(ws, { type: 'orch_error', orchestrationId: clarifySession.id, message: 'Missing "answer" field' });
                                break;
                            }
                            clarifySession.chat(msg.answer, { replyTo: msg.taskId })
                                .catch(e => _send(ws, { type: 'orch_error', orchestrationId: clarifySession.id, message: e.message }));
                            break;
                        }

                        // Fallback: legacy path
                        const orchClarify = _getOrch(ws, msg.orchestrationId);
                        if (!orchClarify) break;

                        if (!msg.taskId || !msg.answer) {
                            _send(ws, { type: 'orch_error', orchestrationId: orchClarify.id, message: 'Missing "taskId" or "answer" field' });
                            break;
                        }

                        await orchClarify.answerClarification(msg.taskId, msg.answer);
                        break;
                    }

                    case 'orchestrate_status': {
                        const orch = _getOrch(ws, msg.orchestrationId);
                        if (!orch) break;

                        _send(ws, { type: 'orch_status', orchestrationId: orch.id, ...orch.getStatus() });
                        break;
                    }

                    default:
                        _send(ws, { type: 'orch_error', message: `Unknown message type: ${msg.type}` });
                }
            } catch (e) {
                _send(ws, { type: 'orch_error', orchestrationId: msg.orchestrationId, message: e.message });
            }
        });

        ws.on('close', () => {
            console.log('[WS-Orchestrator] Connection closed — cleaning up subscriptions');
            if (ws._chatEventCleanup) ws._chatEventCleanup();
            const chatSession = chatSessions.get(ws._connectionId);
            if (chatSession) {
                chatSession.destroy();
                chatSessions.delete(ws._connectionId);
            }
            for (const cleanup of subscriptions.values()) {
                cleanup();
            }
            subscriptions.clear();
        });

        ws.on('error', (err) => {
            console.error('[WS-Orchestrator] WebSocket error:', err.message);
        });
    });
}

// ── Internal ─────────────────────────────────────────────────────────────────

/**
 * Look up a chat session by its orchestration/session id across the connection map.
 * Used for legacy handlers that pass orchestrationId.
 */
function _getChatSessionById(chatSessions, orchestrationId) {
    for (const session of chatSessions.values()) {
        if (session.id === orchestrationId) return session;
    }
    return null;
}

function _getOrch(ws, orchestrationId) {
    if (!orchestrationId) {
        _send(ws, { type: 'orch_error', message: 'Missing "orchestrationId" field' });
        return null;
    }
    const orch = orchestratorManager.getOrchestration(orchestrationId);
    if (!orch) {
        _send(ws, { type: 'orch_error', orchestrationId, message: 'Orchestration not found' });
        return null;
    }
    return orch;
}

function _wireChatEvents(ws, session) {
    const orchCleanup = _wireOrchestratorEvents(ws, session);

    const onChatResponse = (data) => _send(ws, { type: 'chat_response', ...data });
    session.on('chat_response', onChatResponse);

    return () => {
        orchCleanup();
        session.off('chat_response', onChatResponse);
    };
}

function _wireOrchestratorEvents(ws, orch) {
    const listeners = [];

    function on(event, handler) {
        orch.on(event, handler);
        listeners.push({ event, handler });
    }

    on('orch_analysis', (data) => {
        _send(ws, { type: 'orch_analysis', orchestrationId: orch.id, ...data });
    });

    on('orch_plan', (data) => {
        _send(ws, { type: 'orch_plan', orchestrationId: orch.id, ...data });
    });

    on('orch_awaiting_approval', (data) => {
        _send(ws, { type: 'orch_awaiting_approval', orchestrationId: orch.id, ...data });
    });

    on('orch_executing', (data) => {
        _send(ws, { type: 'orch_executing', orchestrationId: orch.id, ...data });
    });

    on('orch_subtask_update', (data) => {
        _send(ws, { type: 'orch_subtask_update', orchestrationId: orch.id, ...data });
    });

    on('orch_phase_complete', (data) => {
        _send(ws, { type: 'orch_phase_complete', orchestrationId: orch.id, ...data });
    });

    on('orch_clarification', (data) => {
        _send(ws, { type: 'orch_clarification', orchestrationId: orch.id, ...data });
    });

    on('orch_review', (data) => {
        _send(ws, { type: 'orch_review', orchestrationId: orch.id, ...data });
    });

    on('orch_progress', (data) => {
        _send(ws, { type: 'orch_progress', orchestrationId: orch.id, ...data });
    });

    on('orch_completed', (data) => {
        _send(ws, { type: 'orch_completed', orchestrationId: orch.id, ...data });
    });

    on('orch_failed', (data) => {
        _send(ws, { type: 'orch_failed', orchestrationId: orch.id, ...data });
    });

    on('orch_cancelled', (data) => {
        _send(ws, { type: 'orch_cancelled', orchestrationId: orch.id, ...data });
    });

    on('log', (data) => {
        _send(ws, { type: 'orch_log', orchestrationId: orch.id, taskId: data.taskId, logType: data.type, message: data.message });
    });

    on('error', (err) => {
        _send(ws, { type: 'orch_error', orchestrationId: orch.id, message: err.message });
    });

    return () => {
        for (const { event, handler } of listeners) {
            orch.removeListener(event, handler);
        }
    };
}

function _send(ws, data) {
    if (ws.readyState === 1) {
        ws.send(JSON.stringify(data));
    }
}

module.exports = { setupOrchestratorWebSocket };
