// === Orchestrator Session ===
// Manages task decomposition via a planner cascade and parallel sub-agent execution.
// Uses AgentSession for planner (internal, not pooled) and sub-agents (pooled via SessionManager).

const EventEmitter = require('events');
const { AgentSession } = require('./agent-session');
const sessionManager = require('./agent-session-manager');
const { resolveLsInst } = require('./ls-utils');

const STATES = {
    ANALYZING: 'ANALYZING',
    PLANNING: 'PLANNING',
    AWAITING_APPROVAL: 'AWAITING_APPROVAL',
    EXECUTING: 'EXECUTING',
    RECOVERING: 'RECOVERING',
    REVIEWING: 'REVIEWING',
    COMPLETED: 'COMPLETED',
    FAILED: 'FAILED',
    CANCELLING: 'CANCELLING',
    CANCELLED: 'CANCELLED',
};

const DEFAULT_PLANNER_PROMPT = `You are a task orchestrator. Analyze the given task and decide how to handle it.

If the task is simple enough for a single cascade to handle directly, respond with:
\`\`\`json
{"type":"direct","reason":"...","response":"..."}
\`\`\`

If the task needs decomposition into subtasks, first explore the project structure, then respond with:
\`\`\`json
{
  "type": "orchestrated",
  "subtasks": [
    {"id": "t1", "description": "...", "context": "...", "affectedFiles": ["path/to/file.js"]},
    {"id": "t2", "description": "...", "context": "...", "affectedFiles": ["path/to/other.js"]}
  ],
  "strategy": "parallel|sequential|phased",
  "phases": [["t1","t2"],["t3"]],
  "summary": "..."
}
\`\`\`

Rules:
- Minimize file overlap between subtasks. If two subtasks must touch the same file, put them in different phases.
- Each subtask should be completable in a single cascade turn.
- Include affectedFiles for every subtask.
- Maximum 10 subtasks.
- Respond ONLY with the JSON block, no other text.`;

const DEFAULT_SUB_AGENT_PROMPT = `You are a focused sub-agent handling one part of a larger task.

## Your Assignment
{description}

## Context
{context}

## Previous Phase Results
{phaseContext}

## Rules
- Focus ONLY on your assigned task
- Do not modify files outside your scope: {affectedFiles}
- When done, clearly state what you changed and the outcome`;

class OrchestratorSession extends EventEmitter {
    constructor(id, opts = {}) {
        super();
        this.id = id;
        this._state = STATES.ANALYZING;
        this._originalTask = opts.task || '';
        this._workspace = opts.workspace || 'AntigravityAuto';
        this._lsInst = opts.lsInst || null;

        // Config
        this._config = {
            maxParallel: opts.maxParallel || 5,
            maxSubtasks: opts.maxSubtasks || 10,
            maxRetries: opts.maxRetries || 2,
            stuckTimeoutMs: opts.stuckTimeoutMs || 300000,
            orchestrationTimeoutMs: opts.orchestrationTimeoutMs || 1800000,
            failureThreshold: opts.failureThreshold || 0.5,
            maxConcurrentApiCalls: opts.maxConcurrentApiCalls || 3,
            plannerStepLimit: opts.plannerStepLimit || 1000,
            allowMultiTurn: opts.allowMultiTurn || false,
            maxMessagesPerSubtask: opts.maxMessagesPerSubtask || 5,
            retryDelayMs: opts.retryDelayMs || 2000,
            maxClarificationRounds: opts.maxClarificationRounds || 2,
            contextMaxChars: opts.contextMaxChars || 5000,
        };

        // Planner session (internal, not pooled)
        this._plannerSession = null;
        this._plannerPrompt = opts.plannerPrompt || DEFAULT_PLANNER_PROMPT;
        this._subAgentPrompt = opts.subAgentPrompt || DEFAULT_SUB_AGENT_PROMPT;

        // Plan
        this._plan = null;

        // Subtask state
        this._subtasks = new Map(); // taskId -> { definition, session, state, result, retries, ... }

        // Execution tracking
        this._startedAt = Date.now();
        this._completedAt = null;
        this._destroyed = false;
        this._overallTimeout = null;
        this._progressInterval = null;
        this._stuckCheckers = new Map();
        this._events = [];  // recent events buffer
        this._logs = [];

        // Semaphore for LS API calls
        this._apiQueue = [];
        this._activeApiCalls = 0;
    }

    // ── Read-only properties ─────────────────────────────────────
    get state() { return this._state; }
    get originalTask() { return this._originalTask; }
    get workspace() { return this._workspace; }
    get plan() { return this._plan; }
    get destroyed() { return this._destroyed; }

    // ── Internal helpers ─────────────────────────────────────────

    _setState(newState) {
        if (this._state === newState) return;
        const old = this._state;
        this._state = newState;
        this._addEvent('state_change', { state: newState, previousState: old });
        this.emit('state_change', { state: newState, previousState: old });
    }

    _addLog(type, message, taskId = null) {
        const entry = { type, message, orchestrationId: this.id, taskId, timestamp: Date.now() };
        this._logs.push(entry);
        if (this._logs.length > 500) this._logs = this._logs.slice(-500);
        this.emit('log', entry);
    }

    _addEvent(type, data = {}) {
        const event = { type, orchestrationId: this.id, timestamp: Date.now(), data };
        this._events.push(event);
        if (this._events.length > 100) this._events = this._events.slice(-100);
    }

    _shortId(id) {
        return id ? id.substring(0, 8) : '--------';
    }

    _elapsed() {
        return Date.now() - this._startedAt;
    }

    _progress() {
        if (!this._plan || this._plan.type === 'direct') return 1;
        const total = this._subtasks.size;
        if (total === 0) return 0;
        let completed = 0;
        for (const st of this._subtasks.values()) {
            if (st.state === 'completed' || st.state === 'failed') completed++;
        }
        return completed / total;
    }

    _truncate(text, maxLen) {
        if (!text || text.length <= maxLen) return text;
        return text.substring(0, maxLen) + '... [truncated]';
    }

    _parseJson(text) {
        // Extract JSON from cascade response (may be wrapped in markdown code blocks)
        const jsonMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
        const jsonStr = jsonMatch ? jsonMatch[1].trim() : text.trim();
        return JSON.parse(jsonStr);
    }

    // ── API call semaphore ───────────────────────────────────────

    async _acquireApiSlot() {
        if (this._activeApiCalls < this._config.maxConcurrentApiCalls) {
            this._activeApiCalls++;
            return;
        }
        return new Promise(resolve => {
            this._apiQueue.push(() => { this._activeApiCalls++; resolve(); });
        });
    }

    _releaseApiSlot() {
        this._activeApiCalls--;
        if (this._apiQueue.length > 0) {
            const next = this._apiQueue.shift();
            next();
        }
    }

    async _throttledSend(session, message) {
        await this._acquireApiSlot();
        try {
            return await session.sendMessage(message);
        } finally {
            this._releaseApiSlot();
        }
    }

    // ── Status ───────────────────────────────────────────────────

    getStatus() {
        const subtasks = {};
        for (const [taskId, st] of this._subtasks) {
            subtasks[taskId] = {
                state: st.state,
                description: st.definition.description,
                affectedFiles: st.definition.affectedFiles || [],
                result: st.result ? this._truncate(st.result, this._config.contextMaxChars) : null,
                retries: st.retries,
                startedAt: st.startedAt || null,
                completedAt: st.completedAt || null,
                reviewDecision: st.reviewDecision || null,
                clarificationQuestion: st.clarificationQuestion || null,
                sessionId: st.session ? st.session.id : null,
            };
        }

        const phases = this._plan && this._plan.phases ? this._plan.phases : [];
        let currentPhase = 0;
        if (this._state === 'EXECUTING' || this._state === 'RECOVERING') {
            for (let i = 0; i < phases.length; i++) {
                const allDone = phases[i].every(tid => {
                    const st = this._subtasks.get(tid);
                    return st && (st.state === 'completed' || st.state === 'failed');
                });
                if (!allDone) { currentPhase = i; break; }
                currentPhase = i + 1;
            }
        }

        return {
            id: this.id,
            state: this._state,
            originalTask: this._originalTask,
            workspace: this._workspace,
            plan: this._plan,
            subtasks,
            progress: this._progress(),
            elapsed: this._elapsed(),
            currentPhase: phases.length > 0 ? currentPhase : undefined,
            totalPhases: phases.length > 0 ? phases.length : undefined,
            requiredSlots: this._plan ? (this._plan.subtasks || []).length : 0,
            availableSlots: sessionManager.getAvailableSlots(),
            recentEvents: this._events.slice(-50),
        };
    }

    // ── Destroy ──────────────────────────────────────────────────

    destroy() {
        if (this._destroyed) return;
        this._destroyed = true;

        if (this._overallTimeout) {
            clearTimeout(this._overallTimeout);
            this._overallTimeout = null;
        }
        if (this._progressInterval) {
            clearInterval(this._progressInterval);
            this._progressInterval = null;
        }

        for (const timer of this._stuckCheckers.values()) {
            clearInterval(timer);
        }
        this._stuckCheckers.clear();

        for (const [, st] of this._subtasks) {
            if (st.session && !st.session.destroyed) {
                st.session.destroy();
            }
        }

        if (this._plannerSession && !this._plannerSession.destroyed) {
            this._plannerSession.destroy();
        }

        this._addLog('system', 'Orchestration destroyed');
        this.emit('destroyed');
        this.removeAllListeners();
    }

    // ── Main entry point ─────────────────────────────────────────

    async start() {
        if (this._destroyed) throw new Error('Orchestration destroyed');
        this._addLog('system', `Starting orchestration: "${this._truncate(this._originalTask, 100)}"`);

        // Start overall timeout
        this._overallTimeout = setTimeout(() => {
            this._addLog('error', `Orchestration timeout after ${this._config.orchestrationTimeoutMs}ms`);
            this._fail('Orchestration timeout');
        }, this._config.orchestrationTimeoutMs);

        // Create planner session (internal, not pooled)
        try {
            this._plannerSession = new AgentSession(`planner-${this.id}`, {
                workspace: this._workspace,
                stepSoftLimit: this._config.plannerStepLimit,
                lsInst: this._lsInst || resolveLsInst(this._workspace),
                transport: 'orchestrator-planner',
                orchestrationId: this.id,
                role: 'planner',
            });
        } catch (e) {
            return this._fail(`Cannot create planner session: ${e.message}`);
        }

        // ANALYZING: Send task to planner
        this._setState(STATES.ANALYZING);
        this._addLog('system', 'Analyzing task with planner cascade...');
        this.emit('orch_started', { orchestrationId: this.id, state: this._state });

        let plannerResponse;
        try {
            plannerResponse = await this._plannerSession.sendMessage(
                `${this._plannerPrompt}\n\n## Task\n${this._originalTask}`
            );
        } catch (e) {
            return this._fail(`Planner failed: ${e.message}`);
        }

        if (!plannerResponse.text) {
            return this._fail('Planner returned empty response');
        }

        // Parse planner output
        let plan;
        let parseAttempts = 0;
        const maxParseRetries = 3;

        while (parseAttempts < maxParseRetries) {
            try {
                plan = this._parseJson(plannerResponse.text);
                break;
            } catch (e) {
                parseAttempts++;
                this._addLog('warning', `JSON parse failed (attempt ${parseAttempts}/${maxParseRetries}): ${e.message}`);
                if (parseAttempts >= maxParseRetries) {
                    plan = { type: 'direct', reason: 'Could not parse planner output', response: plannerResponse.text };
                    break;
                }
                try {
                    plannerResponse = await this._plannerSession.sendMessage(
                        'Your previous response was not valid JSON. Respond ONLY with the JSON block matching the schema.'
                    );
                } catch (retryErr) {
                    plan = { type: 'direct', reason: 'Planner retry failed', response: plannerResponse.text };
                    break;
                }
            }
        }

        this._plan = plan;
        this.emit('orch_analysis', {
            orchestrationId: this.id,
            planType: plan.type,
            subtaskCount: plan.subtasks ? plan.subtasks.length : 0,
            reason: plan.reason || null,
        });

        // DIRECT: No sub-agents needed
        if (plan.type === 'direct') {
            this._addLog('system', `Direct response: ${plan.reason || 'simple task'}`);
            this._setState(STATES.COMPLETED);
            this._completedAt = Date.now();
            this._cleanup();
            this.emit('orch_completed', {
                orchestrationId: this.id,
                summary: plan.response || '',
                results: {},
            });
            return;
        }

        // ORCHESTRATED: Validate and prepare plan
        if (!plan.subtasks || plan.subtasks.length === 0) {
            return this._fail('Planner returned orchestrated plan with no subtasks');
        }

        if (plan.subtasks.length > this._config.maxSubtasks) {
            this._addLog('warning', `Plan has ${plan.subtasks.length} subtasks, capping to ${this._config.maxSubtasks}`);
            plan.subtasks = plan.subtasks.slice(0, this._config.maxSubtasks);
        }

        // Validate file overlap for parallel strategy
        if (plan.strategy === 'parallel') {
            const overlap = this._detectFileOverlap(plan.subtasks);
            if (overlap) {
                this._addLog('warning', `File overlap detected between ${overlap[0]} and ${overlap[1]}, overriding to sequential`);
                plan.strategy = 'sequential';
            }
        }

        // Ensure phases exist
        if (!plan.phases || plan.phases.length === 0) {
            if (plan.strategy === 'sequential') {
                plan.phases = plan.subtasks.map(t => [t.id]);
            } else {
                plan.phases = [plan.subtasks.map(t => t.id)];
            }
        }

        // Initialize subtask state
        for (const def of plan.subtasks) {
            this._subtasks.set(def.id, {
                definition: def,
                session: null,
                state: 'pending',
                result: null,
                retries: 0,
                startedAt: null,
                completedAt: null,
                reviewDecision: null,
                clarificationQuestion: null,
                clarificationRounds: 0,
            });
        }

        this._plan = plan;
        this._setState(STATES.AWAITING_APPROVAL);
        this._addLog('system', `Plan ready: ${plan.subtasks.length} subtasks, strategy: ${plan.strategy}`);

        this.emit('orch_plan', {
            orchestrationId: this.id,
            plan: this._plan,
            requiredSlots: plan.subtasks.length,
            availableSlots: sessionManager.getAvailableSlots(),
        });
        this.emit('orch_awaiting_approval', { orchestrationId: this.id });
    }

    _detectFileOverlap(subtasks) {
        for (let i = 0; i < subtasks.length; i++) {
            for (let j = i + 1; j < subtasks.length; j++) {
                const filesA = new Set(subtasks[i].affectedFiles || []);
                for (const f of (subtasks[j].affectedFiles || [])) {
                    if (filesA.has(f)) return [subtasks[i].id, subtasks[j].id];
                }
            }
        }
        return null;
    }

    _fail(reason) {
        this._setState(STATES.FAILED);
        this._completedAt = Date.now();
        this._addLog('error', `Orchestration failed: ${reason}`);
        this._cleanup();

        const partialResults = {};
        for (const [taskId, st] of this._subtasks) {
            if (st.result) partialResults[taskId] = st.result;
        }

        this.emit('orch_failed', {
            orchestrationId: this.id,
            reason,
            partialResults,
        });
    }

    _cleanup() {
        if (this._overallTimeout) {
            clearTimeout(this._overallTimeout);
            this._overallTimeout = null;
        }
        if (this._progressInterval) {
            clearInterval(this._progressInterval);
            this._progressInterval = null;
        }
        for (const timer of this._stuckCheckers.values()) {
            clearInterval(timer);
        }
        this._stuckCheckers.clear();

        for (const [, st] of this._subtasks) {
            if (st.session && !st.session.destroyed) {
                st.session.destroy();
                st.session = null;
            }
        }
        if (this._plannerSession && !this._plannerSession.destroyed) {
            this._plannerSession.destroy();
            this._plannerSession = null;
        }
    }

    // ── Execute approved plan ────────────────────────────────────

    async execute(configOverrides = {}) {
        if (this._state !== STATES.AWAITING_APPROVAL) {
            throw new Error(`Cannot execute: state is ${this._state}, expected AWAITING_APPROVAL`);
        }
        if (this._destroyed) throw new Error('Orchestration destroyed');

        if (configOverrides.maxParallel != null) {
            this._config.maxParallel = configOverrides.maxParallel;
        }

        this._setState(STATES.EXECUTING);
        this._addLog('system', 'Execution started');
        this.emit('orch_executing', { orchestrationId: this.id });

        this._progressInterval = setInterval(() => {
            if (this._state === STATES.EXECUTING || this._state === STATES.RECOVERING) {
                this.emit('orch_progress', {
                    orchestrationId: this.id,
                    progress: this._progress(),
                    elapsed: this._elapsed(),
                });
            }
        }, 5000);

        try {
            for (let phaseIdx = 0; phaseIdx < this._plan.phases.length; phaseIdx++) {
                if (this._destroyed || this._state === STATES.CANCELLING) break;

                const phase = this._plan.phases[phaseIdx];
                this._addLog('system', `Starting phase ${phaseIdx + 1}/${this._plan.phases.length}: [${phase.join(', ')}]`);

                await this._executePhase(phase, phaseIdx);

                const failCount = Array.from(this._subtasks.values()).filter(s => s.state === 'failed').length;
                const total = this._subtasks.size;
                if (failCount / total > this._config.failureThreshold) {
                    return this._fail(`Failure threshold exceeded: ${failCount}/${total} tasks failed`);
                }

                const completedTasks = phase.filter(tid => {
                    const st = this._subtasks.get(tid);
                    return st && st.state === 'completed';
                });
                this.emit('orch_phase_complete', {
                    orchestrationId: this.id,
                    phase: phaseIdx,
                    completedTasks,
                });

                if (phaseIdx < this._plan.phases.length - 1) {
                    await this._summarizePhaseForNext(phase, phaseIdx);
                }
            }
        } catch (e) {
            if (this._state !== STATES.FAILED && this._state !== STATES.CANCELLED) {
                return this._fail(`Execution error: ${e.message}`);
            }
            return;
        }

        if (this._state === STATES.CANCELLING || this._destroyed) return;

        await this._review();
    }

    async _executePhase(taskIds, phaseIdx) {
        const queue = [...taskIds];
        const running = new Set();

        return new Promise((resolve, reject) => {
            const startNext = () => {
                if (this._destroyed || this._state === STATES.CANCELLING) {
                    if (running.size === 0) resolve();
                    return;
                }

                while (running.size < this._config.maxParallel && queue.length > 0) {
                    const taskId = queue.shift();
                    running.add(taskId);
                    this._executeSubtask(taskId, phaseIdx)
                        .then(() => {
                            running.delete(taskId);
                            if (queue.length > 0) startNext();
                            else if (running.size === 0) resolve();
                        })
                        .catch(err => {
                            running.delete(taskId);
                            this._addLog('error', `Subtask ${taskId} error: ${err.message}`, taskId);
                            if (queue.length > 0) startNext();
                            else if (running.size === 0) resolve();
                        });
                }
            };
            startNext();
        });
    }

    async _executeSubtask(taskId, phaseIdx) {
        const st = this._subtasks.get(taskId);
        if (!st) return;

        st.state = 'running';
        st.startedAt = Date.now();
        this._addLog('system', `Subtask ${taskId} started: "${this._truncate(st.definition.description, 80)}"`, taskId);
        this.emit('orch_subtask_update', { orchestrationId: this.id, taskId, state: 'running' });

        try {
            st.session = sessionManager.createSession({
                workspace: this._workspace,
                lsInst: this._lsInst || resolveLsInst(this._workspace),
                transport: 'orchestrator-subtask',
                orchestrationId: this.id,
                role: 'subtask',
            });
        } catch (e) {
            this._addLog('error', `Cannot create session for ${taskId}: ${e.message}`, taskId);
            st.state = 'failed';
            st.result = `Session creation failed: ${e.message}`;
            this.emit('orch_subtask_update', { orchestrationId: this.id, taskId, state: 'failed', result: st.result });
            return;
        }

        const phaseContext = st._phaseContext || 'No previous phase context.';
        const message = this._subAgentPrompt
            .replace('{description}', st.definition.description)
            .replace('{context}', st.definition.context || '')
            .replace('{phaseContext}', phaseContext)
            .replace('{affectedFiles}', (st.definition.affectedFiles || []).join(', '));

        const stuckChecker = setInterval(() => {
            if (st.session && st.session.isBusy && (Date.now() - st.session.lastActivity) > this._config.stuckTimeoutMs) {
                this._addLog('warning', `Subtask ${taskId} stuck (busy > ${this._config.stuckTimeoutMs}ms), destroying`, taskId);
                clearInterval(stuckChecker);
                this._stuckCheckers.delete(taskId);
                this._retrySubtask(taskId, 'stuck timeout');
            }
        }, 30000);
        this._stuckCheckers.set(taskId, stuckChecker);

        let result;
        try {
            result = await this._throttledSend(st.session, message);
        } catch (e) {
            this._addLog('error', `Subtask ${taskId} sendMessage failed: ${e.message}`, taskId);
            clearInterval(stuckChecker);
            this._stuckCheckers.delete(taskId);
            return this._retrySubtask(taskId, e.message);
        }

        clearInterval(stuckChecker);
        this._stuckCheckers.delete(taskId);

        if (!result.text) {
            return this._retrySubtask(taskId, 'empty response');
        }

        if (this._looksLikeQuestion(result.text) && st.clarificationRounds < this._config.maxClarificationRounds) {
            await this._handleClarification(taskId, result.text);
            return;
        }

        // NOTE: Do NOT destroy sub-session here — keep it alive for accept/reject during REVIEWING phase.
        st.state = 'completed';
        st.result = result.text;
        st.completedAt = Date.now();
        this._addLog('system', `Subtask ${taskId} completed (${st.completedAt - st.startedAt}ms)`, taskId);
        this.emit('orch_subtask_update', {
            orchestrationId: this.id,
            taskId,
            state: 'completed',
            result: this._truncate(result.text, 500),
        });
    }

    _looksLikeQuestion(text) {
        if (!text) return false;
        const lines = text.trim().split('\n');
        const lastLine = lines[lines.length - 1].trim();
        return lastLine.endsWith('?') ||
            /\b(which|should I|do you want|please clarify|could you)\b/i.test(lastLine);
    }

    async _retrySubtask(taskId, reason) {
        const st = this._subtasks.get(taskId);
        if (!st) return;

        if (st.session && !st.session.destroyed) {
            st.session.destroy();
            st.session = null;
        }

        st.retries++;
        if (st.retries > this._config.maxRetries) {
            st.state = 'failed';
            st.result = `Failed after ${st.retries} retries. Last error: ${reason}`;
            st.completedAt = Date.now();
            this._addLog('error', `Subtask ${taskId} failed permanently: ${reason}`, taskId);
            this.emit('orch_subtask_update', { orchestrationId: this.id, taskId, state: 'failed', result: st.result });
            return;
        }

        st.state = 'retrying';
        this._addLog('warning', `Subtask ${taskId} retrying (${st.retries}/${this._config.maxRetries}): ${reason}`, taskId);
        this.emit('orch_subtask_update', { orchestrationId: this.id, taskId, state: 'retrying' });

        await new Promise(r => setTimeout(r, this._config.retryDelayMs));

        if (this._destroyed || this._state === STATES.CANCELLING) return;

        st.state = 'pending';
        st.startedAt = null;
        return this._executeSubtask(taskId, 0);
    }

    // ── Clarification flow ───────────────────────────────────────

    async _handleClarification(taskId, questionText) {
        const st = this._subtasks.get(taskId);
        if (!st) return;

        st.clarificationRounds++;
        this._addLog('system', `Subtask ${taskId} needs clarification (round ${st.clarificationRounds})`, taskId);

        // First try: ask planner if it can answer
        try {
            const plannerResponse = await this._plannerSession.sendMessage(
                `Sub-agent for task "${st.definition.description}" is asking:\n\n${questionText}\n\nCan you answer this? Respond with JSON:\n{"canAnswer": true, "answer": "..."} or {"canAnswer": false}`
            );

            if (plannerResponse.text) {
                try {
                    const decision = this._parseJson(plannerResponse.text);
                    if (decision.canAnswer && decision.answer) {
                        this._addLog('system', `Planner answered clarification for ${taskId}`, taskId);
                        const followUp = await st.session.sendMessage(decision.answer);
                        if (followUp.text) {
                            st.state = 'completed';
                            st.result = followUp.text;
                            st.completedAt = Date.now();
                            this.emit('orch_subtask_update', {
                                orchestrationId: this.id, taskId, state: 'completed',
                                result: this._truncate(followUp.text, 500),
                            });
                            return;
                        }
                    }
                } catch { /* parse failed, escalate */ }
            }
        } catch { /* planner failed, escalate */ }

        // Escalate to user
        const CLARIFICATION_TIMEOUT = 5 * 60 * 1000;
        st._clarificationTimer = setTimeout(() => {
            if (st.state === 'clarification') {
                this._addLog('warning', `Clarification timeout for ${taskId}, marking failed`, taskId);
                st.state = 'failed';
                st.result = 'Clarification timeout (5 min)';
                st.completedAt = Date.now();
                st.clarificationQuestion = null;
                if (st.session && !st.session.destroyed) { st.session.destroy(); st.session = null; }
                this.emit('orch_subtask_update', { orchestrationId: this.id, taskId, state: 'failed', result: st.result });
            }
        }, CLARIFICATION_TIMEOUT);

        st.state = 'clarification';
        st.clarificationQuestion = questionText;
        this._addLog('system', `Escalating clarification for ${taskId} to user`, taskId);
        this.emit('orch_clarification', {
            orchestrationId: this.id,
            taskId,
            question: questionText,
        });
    }

    async answerClarification(taskId, answer) {
        const st = this._subtasks.get(taskId);
        if (!st || st.state !== 'clarification') {
            throw new Error(`Subtask ${taskId} is not awaiting clarification`);
        }

        if (st._clarificationTimer) { clearTimeout(st._clarificationTimer); st._clarificationTimer = null; }

        st.state = 'running';
        st.clarificationQuestion = null;
        this._addLog('system', `User answered clarification for ${taskId}`, taskId);
        this.emit('orch_subtask_update', { orchestrationId: this.id, taskId, state: 'running' });

        try {
            const result = await st.session.sendMessage(answer);
            if (result.text) {
                st.state = 'completed';
                st.result = result.text;
                st.completedAt = Date.now();
                this.emit('orch_subtask_update', {
                    orchestrationId: this.id, taskId, state: 'completed',
                    result: this._truncate(result.text, 500),
                });
            } else {
                return this._retrySubtask(taskId, 'empty response after clarification');
            }
        } catch (e) {
            return this._retrySubtask(taskId, `clarification response failed: ${e.message}`);
        }
    }

    // ── Review phase ─────────────────────────────────────────────

    async _review() {
        this._setState(STATES.REVIEWING);
        this._addLog('system', 'Reviewing subtask results...');
        this.emit('orch_review', { orchestrationId: this.id, decisions: [] });

        const resultsSummary = [];
        for (const [taskId, st] of this._subtasks) {
            resultsSummary.push({
                taskId,
                description: st.definition.description,
                state: st.state,
                result: st.state === 'completed'
                    ? this._truncate(st.result, this._config.contextMaxChars)
                    : `Failed: ${st.result || 'unknown error'}`,
            });
        }

        const failCount = resultsSummary.filter(r => r.state === 'failed').length;
        const reviewPrompt = failCount > 0
            ? `Review these subtask results. ${resultsSummary.length - failCount}/${resultsSummary.length} completed, ${failCount} failed.\nFor each completed task, decide: accept or reject.\nFor failed tasks, decide: retry_failed, accept_partial, or abort_all.\n\nResults:\n${JSON.stringify(resultsSummary, null, 2)}\n\nRespond with JSON:\n{"decisions":[{"taskId":"t1","action":"accept","reason":"..."},...],"overall":"accept_partial|abort_all|retry_failed"}`
            : `Review these subtask results. All ${resultsSummary.length} completed.\nFor each task, decide: accept or reject.\n\nResults:\n${JSON.stringify(resultsSummary, null, 2)}\n\nRespond with JSON:\n{"decisions":[{"taskId":"t1","action":"accept","reason":"..."},...],"overall":"complete"}`;

        let reviewResponse;
        try {
            reviewResponse = await this._plannerSession.sendMessage(reviewPrompt);
        } catch (e) {
            this._addLog('warning', `Planner review failed: ${e.message}, auto-accepting completed tasks`);
            for (const [, st] of this._subtasks) {
                if (st.state === 'completed') {
                    st.reviewDecision = 'accepted';
                    if (st.session && !st.session.destroyed) {
                        try { await st.session.accept(); } catch { /* ignore */ }
                    }
                }
            }
            return this._complete();
        }

        let review;
        try {
            review = this._parseJson(reviewResponse.text);
        } catch {
            this._addLog('warning', 'Could not parse review response, auto-accepting completed tasks');
            for (const [, st] of this._subtasks) {
                if (st.state === 'completed') st.reviewDecision = 'accepted';
            }
            return this._complete();
        }

        if (review.decisions) {
            for (const dec of review.decisions) {
                const st = this._subtasks.get(dec.taskId);
                if (!st) continue;

                st.reviewDecision = dec.action;
                this._addLog('system', `Review: ${dec.taskId} → ${dec.action} (${dec.reason || ''})`, dec.taskId);

                if (dec.action === 'accept' && st.session && !st.session.destroyed) {
                    try { await st.session.accept(); } catch (e) {
                        this._addLog('error', `Accept failed for ${dec.taskId}: ${e.message}`, dec.taskId);
                    }
                } else if (dec.action === 'reject' && st.session && !st.session.destroyed) {
                    try { await st.session.reject(); } catch (e) {
                        this._addLog('error', `Reject failed for ${dec.taskId}: ${e.message}`, dec.taskId);
                    }
                }
            }
        }

        this.emit('orch_review', {
            orchestrationId: this.id,
            decisions: review.decisions || [],
        });

        if (review.overall === 'abort_all') {
            for (const [, st] of this._subtasks) {
                if (st.session && !st.session.destroyed) {
                    try { await st.session.reject(); } catch { /* ignore */ }
                }
            }
            return this._fail('Planner decided to abort all');
        }

        if (review.overall === 'retry_failed') {
            const failedIds = [];
            for (const [taskId, st] of this._subtasks) {
                if (st.state === 'failed') {
                    st.state = 'pending';
                    st.result = null;
                    st.retries = 0;
                    st.startedAt = null;
                    st.completedAt = null;
                    if (st.session && !st.session.destroyed) { st.session.destroy(); st.session = null; }
                    failedIds.push(taskId);
                }
            }
            if (failedIds.length > 0) {
                this._addLog('system', `Retrying failed subtasks: [${failedIds.join(', ')}]`);
                this._setState(STATES.RECOVERING);
                await this._executePhase(failedIds, 0);
                return this._review();
            }
        }

        this._complete();
    }

    _complete() {
        this._setState(STATES.COMPLETED);
        this._completedAt = Date.now();
        this._addLog('system', `Orchestration completed in ${this._elapsed()}ms`);
        this._cleanup();

        const results = {};
        for (const [taskId, st] of this._subtasks) {
            results[taskId] = {
                state: st.state,
                result: st.result,
                reviewDecision: st.reviewDecision,
            };
        }

        const accepted = Array.from(this._subtasks.values()).filter(s => s.reviewDecision === 'accepted').length;
        const rejected = Array.from(this._subtasks.values()).filter(s => s.reviewDecision === 'rejected').length;

        this.emit('orch_completed', {
            orchestrationId: this.id,
            summary: `${accepted} accepted, ${rejected} rejected, ${this._subtasks.size} total. Elapsed: ${this._elapsed()}ms`,
            results,
        });
    }

    // ── Phase context propagation ────────────────────────────────

    async _summarizePhaseForNext(phaseTaskIds, phaseIdx) {
        const results = phaseTaskIds.map(tid => {
            const st = this._subtasks.get(tid);
            return `- ${tid}: ${st.state === 'completed' ? this._truncate(st.result, 1000) : 'FAILED'}`;
        }).join('\n');

        try {
            const summaryResponse = await this._plannerSession.sendMessage(
                `Phase ${phaseIdx + 1} complete. Summarize the results below into a compact context for the next phase of subtasks. Be concise.\n\n${results}\n\nRespond with a brief summary paragraph only.`
            );

            if (summaryResponse.text) {
                const nextPhase = this._plan.phases[phaseIdx + 1];
                if (nextPhase) {
                    for (const tid of nextPhase) {
                        const st = this._subtasks.get(tid);
                        if (st) st._phaseContext = summaryResponse.text;
                    }
                }
            }
        } catch (e) {
            this._addLog('warning', `Phase summary failed: ${e.message}, next phase runs without context`);
        }
    }

    // ── Cancel ───────────────────────────────────────────────────

    async cancel() {
        if (this._destroyed) return;
        if (this._state === STATES.COMPLETED || this._state === STATES.FAILED || this._state === STATES.CANCELLED) {
            return;
        }

        this._setState(STATES.CANCELLING);
        this._addLog('system', 'Cancelling orchestration...');

        this._cleanup();

        this._setState(STATES.CANCELLED);
        this._completedAt = Date.now();

        const partialResults = {};
        for (const [taskId, st] of this._subtasks) {
            if (st.result) partialResults[taskId] = { state: st.state, result: st.result };
        }

        this.emit('orch_cancelled', {
            orchestrationId: this.id,
            partialResults,
        });
    }

    // ── Revise plan (during AWAITING_APPROVAL) ───────────────────

    async revisePlan(feedback) {
        if (this._state !== STATES.AWAITING_APPROVAL) {
            throw new Error(`Cannot revise: state is ${this._state}, expected AWAITING_APPROVAL`);
        }

        this._setState(STATES.PLANNING);
        this._addLog('system', `Revising plan: "${this._truncate(feedback, 100)}"`);

        try {
            const response = await this._plannerSession.sendMessage(
                `The user wants changes to the plan:\n\n${feedback}\n\nRevise the plan and respond with the updated JSON block.`
            );

            if (!response.text) {
                this._setState(STATES.AWAITING_APPROVAL);
                throw new Error('Planner returned empty response');
            }

            const newPlan = this._parseJson(response.text);

            if (newPlan.type === 'orchestrated' && newPlan.subtasks) {
                if (newPlan.subtasks.length > this._config.maxSubtasks) {
                    newPlan.subtasks = newPlan.subtasks.slice(0, this._config.maxSubtasks);
                }
                if (newPlan.strategy === 'parallel') {
                    const overlap = this._detectFileOverlap(newPlan.subtasks);
                    if (overlap) newPlan.strategy = 'sequential';
                }
                if (!newPlan.phases || newPlan.phases.length === 0) {
                    if (newPlan.strategy === 'sequential') {
                        newPlan.phases = newPlan.subtasks.map(t => [t.id]);
                    } else {
                        newPlan.phases = [newPlan.subtasks.map(t => t.id)];
                    }
                }
            }

            this._subtasks.clear();
            if (newPlan.subtasks) {
                for (const def of newPlan.subtasks) {
                    this._subtasks.set(def.id, {
                        definition: def, session: null, state: 'pending', result: null,
                        retries: 0, startedAt: null, completedAt: null,
                        reviewDecision: null, clarificationQuestion: null, clarificationRounds: 0,
                    });
                }
            }

            this._plan = newPlan;
            this._setState(STATES.AWAITING_APPROVAL);

            this.emit('orch_plan', {
                orchestrationId: this.id,
                plan: this._plan,
                requiredSlots: (newPlan.subtasks || []).length,
                availableSlots: sessionManager.getAvailableSlots(),
            });
        } catch (e) {
            this._setState(STATES.AWAITING_APPROVAL);
            throw e;
        }
    }
}

module.exports = { OrchestratorSession, STATES, DEFAULT_PLANNER_PROMPT, DEFAULT_SUB_AGENT_PROMPT };
