// === Orchestrator Manager ===
// Registry for concurrent OrchestratorSession instances.
// Shared between HTTP routes and WebSocket handler.

const crypto = require('crypto');
const { OrchestratorSession } = require('./orchestrator-session');
const { resolveLsInst } = require('./ls-utils');
const { getOrchestratorSettings } = require('./config');

const orchestrations = new Map(); // id -> OrchestratorSession
const history = [];               // completed orchestrations (metadata only)
let _config = null;

function _getConfig() {
    if (!_config) _config = getOrchestratorSettings();
    return _config;
}

function createOrchestration(opts = {}) {
    const cfg = _getConfig();
    if (!cfg.enabled) throw new Error('Orchestrator is disabled');

    // Check concurrent limit
    const active = Array.from(orchestrations.values()).filter(
        o => !['COMPLETED', 'FAILED', 'CANCELLED'].includes(o.state)
    );
    if (active.length >= cfg.maxConcurrentOrchestrations) {
        throw new Error(`Max concurrent orchestrations reached (${cfg.maxConcurrentOrchestrations})`);
    }

    const id = crypto.randomUUID();
    const orch = new OrchestratorSession(id, {
        task: opts.task,
        workspace: opts.workspace,
        lsInst: opts.lsInst || resolveLsInst(opts.workspace),
        ...cfg,
        ...(opts.config || {}), // user overrides
    });

    orchestrations.set(id, orch);

    orch.on('destroyed', () => {
        _archiveToHistory(id, orch);
        orchestrations.delete(id);
        _broadcast('orchestration_destroyed', { orchestrationId: id });
    });

    // Forward key events to UI broadcast
    for (const evt of ['orch_started', 'orch_analysis', 'orch_plan', 'orch_awaiting_approval',
        'orch_executing', 'orch_subtask_update', 'orch_phase_complete', 'orch_clarification',
        'orch_review', 'orch_completed', 'orch_failed', 'orch_cancelled', 'log', 'state_change']) {
        orch.on(evt, (data) => _broadcast(evt, { orchestrationId: id, ...data }));
    }

    _broadcast('orchestration_created', { orchestrationId: id, task: opts.task, workspace: opts.workspace });
    return orch;
}

function getOrchestration(id) { return orchestrations.get(id) || null; }

function destroyOrchestration(id) {
    const orch = orchestrations.get(id);
    if (orch) orch.destroy();
}

function listOrchestrations(includeCompleted = false) {
    const active = Array.from(orchestrations.values()).map(o => o.getStatus());
    if (includeCompleted) {
        return [...active, ...history.slice(-(_getConfig().historySize || 10))];
    }
    return active;
}

function configure(config) {
    _config = { ..._getConfig(), ...config };
}

function shutdownAll() {
    for (const orch of orchestrations.values()) orch.destroy();
    orchestrations.clear();
}

function _archiveToHistory(id, orch) {
    const cfg = _getConfig();
    history.push({
        id,
        state: orch.state,
        originalTask: orch.originalTask,
        workspace: orch.workspace,
        completedAt: Date.now(),
        progress: 1,
    });
    while (history.length > (cfg.historySize || 10)) history.shift();
}

function _broadcast(event, data) {
    try {
        const { broadcastAll } = require('./ws');
        broadcastAll({ type: 'orchestrator', event, ...data });
    } catch { /* ws not ready */ }
}

module.exports = {
    createOrchestration, getOrchestration, destroyOrchestration,
    listOrchestrations, configure, shutdownAll,
};
