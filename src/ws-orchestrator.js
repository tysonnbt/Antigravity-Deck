// === WebSocket Orchestrator Protocol ===
// Dedicated WebSocket endpoint for orchestrator at /ws/orchestrator.
// Separate from /ws (UI) and /ws/agent (agent sessions).
//
// Protocol:
//   Client → Server: orchestrate, orchestrate_execute, orchestrate_revise,
//                    orchestrate_cancel, orchestrate_clarify, orchestrate_status
//   Server → Client: orch_started, orch_analysis, orch_plan, orch_awaiting_approval,
//                    orch_executing, orch_subtask_update, orch_phase_complete,
//                    orch_clarification, orch_review, orch_progress, orch_completed,
//                    orch_failed, orch_cancelled, orch_log, orch_error

const orchestratorManager = require('./orchestrator-manager');

/**
 * Set up the orchestrator WebSocket server.
 * @param {import('ws').WebSocketServer} wss
 */
function setupOrchestratorWebSocket(wss) {
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

        // Track which orchestrations this WS connection is subscribed to
        const subscriptions = new Map(); // orchestrationId → cleanup function

        console.log('[WS-Orchestrator] New connection');

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
                    case 'orchestrate': {
                        if (!msg.task) {
                            _send(ws, { type: 'orch_error', message: 'Missing "task" field' });
                            break;
                        }

                        const orch = orchestratorManager.createOrchestration({
                            task: msg.task,
                            workspace: msg.workspace,
                            config: msg.config,
                        });

                        const cleanup = _wireOrchestratorEvents(ws, orch);
                        subscriptions.set(orch.id, cleanup);

                        _send(ws, { type: 'orch_started', orchestrationId: orch.id, state: orch.state });

                        orch.start().catch(e => {
                            _send(ws, { type: 'orch_error', orchestrationId: orch.id, message: e.message });
                        });
                        break;
                    }

                    case 'orchestrate_execute': {
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
                        const orch = _getOrch(ws, msg.orchestrationId);
                        if (!orch) break;

                        if (!msg.feedback) {
                            _send(ws, { type: 'orch_error', orchestrationId: orch.id, message: 'Missing "feedback" field' });
                            break;
                        }

                        orch.revisePlan(msg.feedback).catch(e => {
                            _send(ws, { type: 'orch_error', orchestrationId: orch.id, message: e.message });
                        });
                        break;
                    }

                    case 'orchestrate_cancel': {
                        const orch = _getOrch(ws, msg.orchestrationId);
                        if (!orch) break;

                        await orch.cancel();
                        break;
                    }

                    case 'orchestrate_clarify': {
                        const orch = _getOrch(ws, msg.orchestrationId);
                        if (!orch) break;

                        if (!msg.taskId || !msg.answer) {
                            _send(ws, { type: 'orch_error', orchestrationId: orch.id, message: 'Missing "taskId" or "answer" field' });
                            break;
                        }

                        await orch.answerClarification(msg.taskId, msg.answer);
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

    on('orch_awaiting_approval', () => {
        _send(ws, { type: 'orch_awaiting_approval', orchestrationId: orch.id });
    });

    on('orch_executing', () => {
        _send(ws, { type: 'orch_executing', orchestrationId: orch.id });
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

    on('orch_cancelled', () => {
        _send(ws, { type: 'orch_cancelled', orchestrationId: orch.id });
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
