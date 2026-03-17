const { Router } = require('express');
const { z } = require('zod');
const orchestratorManager = require('../orchestrator-manager');
const { getOrchestratorSettings, saveOrchestratorSettings } = require('../config');

const router = Router();

// ── Zod Schemas ──────────────────────────────────────────────

const StartSchema = z.object({
    task: z.string().min(1).max(10000),
    workspace: z.string().max(200).optional(),
    config: z.object({
        maxParallel: z.number().int().min(1).max(10).optional(),
        maxSubtasks: z.number().int().min(1).max(20).optional(),
    }).strict().optional(),
}).strict();

const ExecuteSchema = z.object({
    configOverrides: z.object({
        maxParallel: z.number().int().min(1).max(10).optional(),
    }).strict().optional(),
}).strict();

const ReviseSchema = z.object({
    feedback: z.string().min(1).max(10000),
}).strict();

const ClarifySchema = z.object({
    taskId: z.string().min(1).max(100),
    answer: z.string().min(1).max(10000),
}).strict();

const SettingsSchema = z.object({
    enabled: z.boolean().optional(),
    maxConcurrentOrchestrations: z.number().int().min(1).max(10).optional(),
    maxParallel: z.number().int().min(1).max(10).optional(),
    maxSubtasks: z.number().int().min(1).max(20).optional(),
    maxRetries: z.number().int().min(0).max(5).optional(),
    stuckTimeoutMs: z.number().int().min(60000).max(3600000).optional(),
    orchestrationTimeoutMs: z.number().int().min(60000).max(86400000).optional(),
    failureThreshold: z.number().min(0).max(1).optional(),
}).strict();

// ── Routes ───────────────────────────────────────────────────

// POST /api/orchestrator/start
router.post('/start', async (req, res) => {
    try {
        const body = StartSchema.parse(req.body || {});
        const orch = orchestratorManager.createOrchestration({
            task: body.task,
            workspace: body.workspace,
            config: body.config,
        });

        const isSSE = req.headers.accept === 'text/event-stream';
        if (isSSE) {
            res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' });
            const send = (evt, data) => res.write(`event: ${evt}\ndata: ${JSON.stringify(data)}\n\n`);

            orch.on('orch_analysis', d => send('analysis', d));
            orch.on('orch_plan', d => send('plan', d));
            orch.on('orch_awaiting_approval', () => send('awaiting_approval', orch.getStatus()));
            orch.on('orch_completed', d => send('completed', d));
            orch.on('orch_failed', d => send('failed', d));
            orch.on('log', d => send('log', d));

            send('started', { orchestrationId: orch.id, state: orch.state });

            await orch.start();
            send('done', orch.getStatus());
            res.end();
        } else {
            await orch.start();
            res.json(orch.getStatus());
        }
    } catch (e) {
        if (e instanceof z.ZodError) return res.status(400).json({ error: 'Invalid request', details: e.issues });
        res.status(500).json({ error: e.message, code: 'START_FAILED' });
    }
});

// POST /api/orchestrator/:id/execute
router.post('/:id/execute', async (req, res) => {
    try {
        const orch = orchestratorManager.getOrchestration(req.params.id);
        if (!orch) return res.status(404).json({ error: 'Not found', code: 'ORCHESTRATION_NOT_FOUND' });
        const body = ExecuteSchema.parse(req.body || {});
        orch.execute(body.configOverrides || {}).catch(e => {
            console.error(`[Orchestrator] Execute error: ${e.message}`);
        });
        res.json({ state: 'EXECUTING', message: 'Execution started' });
    } catch (e) {
        if (e instanceof z.ZodError) return res.status(400).json({ error: 'Invalid request', details: e.issues });
        res.status(500).json({ error: e.message });
    }
});

// POST /api/orchestrator/:id/revise-plan
router.post('/:id/revise-plan', async (req, res) => {
    try {
        const orch = orchestratorManager.getOrchestration(req.params.id);
        if (!orch) return res.status(404).json({ error: 'Not found', code: 'ORCHESTRATION_NOT_FOUND' });
        const body = ReviseSchema.parse(req.body || {});
        await orch.revisePlan(body.feedback);
        res.json(orch.getStatus());
    } catch (e) {
        if (e instanceof z.ZodError) return res.status(400).json({ error: 'Invalid request', details: e.issues });
        res.status(e.message.includes('Cannot revise') ? 409 : 500).json({ error: e.message });
    }
});

// GET /api/orchestrator/:id/status
router.get('/:id/status', (req, res) => {
    const orch = orchestratorManager.getOrchestration(req.params.id);
    if (!orch) return res.status(404).json({ error: 'Not found', code: 'ORCHESTRATION_NOT_FOUND' });
    res.json(orch.getStatus());
});

// POST /api/orchestrator/:id/cancel
router.post('/:id/cancel', async (req, res) => {
    const orch = orchestratorManager.getOrchestration(req.params.id);
    if (!orch) return res.status(404).json({ error: 'Not found', code: 'ORCHESTRATION_NOT_FOUND' });
    await orch.cancel();
    res.json({ state: orch.state });
});

// POST /api/orchestrator/:id/clarify
router.post('/:id/clarify', async (req, res) => {
    try {
        const orch = orchestratorManager.getOrchestration(req.params.id);
        if (!orch) return res.status(404).json({ error: 'Not found', code: 'ORCHESTRATION_NOT_FOUND' });
        const body = ClarifySchema.parse(req.body || {});
        await orch.answerClarification(body.taskId, body.answer);
        res.json({ state: 'running' });
    } catch (e) {
        if (e instanceof z.ZodError) return res.status(400).json({ error: 'Invalid request', details: e.issues });
        res.status(400).json({ error: e.message });
    }
});

// GET /api/orchestrator/:id/events — SSE stream
router.get('/:id/events', (req, res) => {
    const orch = orchestratorManager.getOrchestration(req.params.id);
    if (!orch) return res.status(404).json({ error: 'Not found', code: 'ORCHESTRATION_NOT_FOUND' });

    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' });
    const send = (evt, data) => res.write(`event: ${evt}\ndata: ${JSON.stringify(data)}\n\n`);

    const events = ['orch_subtask_update', 'orch_phase_complete', 'orch_clarification',
        'orch_review', 'orch_completed', 'orch_failed', 'orch_cancelled', 'log', 'state_change'];
    const listeners = events.map(evt => {
        const fn = (data) => send(evt, data);
        orch.on(evt, fn);
        return { evt, fn };
    });

    req.on('close', () => listeners.forEach(({ evt, fn }) => orch.removeListener(evt, fn)));
});

// GET /api/orchestrator/:id/subtask/:taskId
router.get('/:id/subtask/:taskId', (req, res) => {
    const orch = orchestratorManager.getOrchestration(req.params.id);
    if (!orch) return res.status(404).json({ error: 'Not found', code: 'ORCHESTRATION_NOT_FOUND' });
    const status = orch.getStatus();
    const subtask = status.subtasks[req.params.taskId];
    if (!subtask) return res.status(404).json({ error: 'Subtask not found' });
    res.json(subtask);
});

// GET /api/orchestrator/:id/subtask/:taskId/log
router.get('/:id/subtask/:taskId/log', (req, res) => {
    const orch = orchestratorManager.getOrchestration(req.params.id);
    if (!orch) return res.status(404).json({ error: 'Not found', code: 'ORCHESTRATION_NOT_FOUND' });
    const logs = orch._logs.filter(l => l.taskId === req.params.taskId);
    res.json({ logs });
});

// GET /api/orchestrator/list
router.get('/list', (req, res) => {
    const includeCompleted = req.query.includeCompleted === 'true';
    res.json({ orchestrations: orchestratorManager.listOrchestrations(includeCompleted) });
});

// DELETE /api/orchestrator/:id
router.delete('/:id', (req, res) => {
    orchestratorManager.destroyOrchestration(req.params.id);
    res.json({ ok: true });
});

// GET /api/orchestrator/settings
router.get('/settings', (req, res) => {
    res.json(getOrchestratorSettings());
});

// PUT /api/orchestrator/settings
router.put('/settings', (req, res) => {
    try {
        const body = SettingsSchema.parse(req.body || {});
        const saved = saveOrchestratorSettings(body);
        orchestratorManager.configure(saved);
        res.json(saved);
    } catch (e) {
        if (e instanceof z.ZodError) return res.status(400).json({ error: 'Invalid settings', details: e.issues });
        res.status(500).json({ error: e.message });
    }
});

// GET /api/orchestrator/prompt
router.get('/prompt', (req, res) => {
    const settings = getOrchestratorSettings();
    res.json({ prompt: settings.plannerPrompt || null });
});

// PUT /api/orchestrator/prompt
router.put('/prompt', (req, res) => {
    const { prompt } = req.body || {};
    if (typeof prompt !== 'string') return res.status(400).json({ error: 'Missing "prompt" string field' });
    const saved = saveOrchestratorSettings({ plannerPrompt: prompt });
    res.json({ prompt: saved.plannerPrompt });
});

module.exports = (app) => {
    app.use('/api/orchestrator', router);
};
