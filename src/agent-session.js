// === Agent Session ===
// Transport-agnostic orchestration for a single agent ↔ cascade conversation.
// Extracted from agent-bridge.js to enable reuse across Discord, WebSocket, HTTP transports.
//
// Key design:
//   - Each session owns its own state (cascadeId, stepCount, isBusy, etc.)
//   - sendMessage() is blocking — returns when cascade response is extracted
//   - Events emitted in parallel for transport-layer consumption
//   - No knowledge of Discord, WebSocket, or HTTP — pure orchestration logic

const EventEmitter = require('events');
const { startCascade, sendMessage: cascadeSend } = require('./cascade');
const { getStepCountAndStatus } = require('./step-cache');
const { waitAndExtractResponse } = require('./cascade-relay');
const { callApi, callApiFireAndForget } = require('./api');

const STATES = { IDLE: 'IDLE', ACTIVE: 'ACTIVE', TRANSITIONING: 'TRANSITIONING' };

class AgentSession extends EventEmitter {
    /**
     * @param {string} id - Unique session identifier
     * @param {object} opts
     * @param {string} [opts.workspace]       - Workspace name
     * @param {string} [opts.cascadeId]       - Existing cascade to resume
     * @param {number} [opts.stepSoftLimit]   - Max steps before auto-transition (default: 500)
     * @param {object} [opts.lsInst]          - LS instance { port, csrfToken, useTls }
     * @param {string} [opts.transport]       - Transport label for identification (e.g. 'discord', 'ws', 'http')
     * @param {function} [opts.persist]       - (state) => void — callback to persist session state
     */
    constructor(id, opts = {}) {
        super();
        this.id = id;
        this._state = STATES.ACTIVE;
        this._cascadeId = opts.cascadeId || null;
        this._stepCount = 0;
        this._stepSoftLimit = opts.stepSoftLimit || 500;
        this._lastRelayedStepIndex = -1;
        this._isBusy = false;
        this._workspace = opts.workspace || 'AntigravityAuto';
        this._lsInst = opts.lsInst || null;
        this._transport = opts.transport || 'unknown';
        this._persist = opts.persist || (() => {});
        this._destroyed = false;
        this._lastActivity = Date.now();
        this._log = [];
        this._orchestrationId = opts.orchestrationId || null;
        this._role = opts.role || null; // 'planner' | 'subtask' | null

        // If resuming existing cascade, fetch its current step count
        if (this._cascadeId) {
            this._refreshCascadeInfo().catch(() => {});
        }
    }

    // ── Read-only properties ─────────────────────────────────────────────────

    get state() { return this._state; }
    get cascadeId() { return this._cascadeId; }
    get stepCount() { return this._stepCount; }
    get isBusy() { return this._isBusy; }
    get workspace() { return this._workspace; }
    get transport() { return this._transport; }
    get lastActivity() { return this._lastActivity; }
    get destroyed() { return this._destroyed; }
    get orchestrationId() { return this._orchestrationId; }
    get role() { return this._role; }

    // ── Core: Send message and wait for response ─────────────────────────────

    /**
     * Send a message to the cascade and wait for the agent's response.
     * Blocking — resolves when the cascade finishes processing.
     *
     * @param {string} text - Message text
     * @param {object} [opts]
     * @param {string} [opts.action]     - 'accept' | 'reject' | null
     * @param {string} [opts.authorName] - Prefixed to message for multi-user context
     * @returns {Promise<{text:string|null, stepIndex:number, stepCount:number, stepType:string|null}>}
     */
    async sendMessage(text, opts = {}) {
        if (this._destroyed) throw new Error('Session destroyed');

        const { action = null, authorName = null } = opts;
        const messageToSend = authorName ? `${authorName}: ${text}` : text;

        this._lastActivity = Date.now();

        // Busy gate — reject concurrent messages
        if (this._isBusy) {
            this._addLog('system', 'Session busy — message blocked');
            return { text: null, stepIndex: -1, stepCount: this._stepCount, stepType: null, busy: true };
        }

        // Ensure we have a valid cascade
        await this._ensureCascade();

        this._addLog('from_agent', messageToSend.substring(0, 200));

        // Set busy BEFORE sending — block concurrent messages
        const cascadeIdAtSend = this._cascadeId;
        this._setBusy(true);

        // Send message to cascade
        try {
            await cascadeSend(this._cascadeId, messageToSend, { inst: this._lsInst });
            this._addLog('system', `Sent to cascade ${this._shortId()} — waiting for response`);
        } catch (e) {
            this._setBusy(false);
            this._addLog('error', `cascadeSend failed: ${e.message}`);
            this.emit('error', e);
            return { text: null, stepIndex: -1, stepCount: this._stepCount, stepType: null };
        }

        // Handle accept/reject action
        if (action === 'accept') {
            await this._triggerAccept().catch(e => this._addLog('error', `Accept failed: ${e.message}`));
        } else if (action === 'reject') {
            await this._triggerReject().catch(e => this._addLog('error', `Reject failed: ${e.message}`));
        }

        // If we were transitioning, we're now active
        if (this._state === STATES.TRANSITIONING) {
            this._setState(STATES.ACTIVE);
            this._addLog('system', `Transitioned OK → ${this._shortId()}`);
        }

        // Wait for cascade response
        const result = await waitAndExtractResponse(cascadeIdAtSend, {
            inst: this._lsInst,
            fromStepIndex: this._lastRelayedStepIndex,
            log: (type, msg) => this._addLog(type, msg),
            shouldAbort: () => this._destroyed || this._cascadeId !== cascadeIdAtSend || !this._isBusy,
        });

        if (result.text) {
            // Advance state
            this._lastRelayedStepIndex = result.stepIndex;
            this._stepCount = result.stepCount;
            this._setBusy(false);
            this._persistState();

            this.emit('response', {
                text: result.text,
                stepIndex: result.stepIndex,
                stepCount: result.stepCount,
                stepType: result.stepType,
            });

            // Step limit check
            if (this._stepCount >= this._stepSoftLimit) {
                await this.transitionCascade('Auto: step limit reached');
            } else if (this._stepCount >= this._stepSoftLimit - 10) {
                this.emit('step_limit_warning', {
                    stepCount: this._stepCount,
                    softLimit: this._stepSoftLimit,
                });
            }
        } else {
            this._setBusy(false);
            this._addLog('system', `Response extraction failed or timeout for ${this._shortId(cascadeIdAtSend)}`);
        }

        return result;
    }

    // ── Cascade Transition ───────────────────────────────────────────────────

    /**
     * Create a new cascade, replacing the current one.
     * @param {string} [reason]
     */
    async transitionCascade(reason = null) {
        if (this._destroyed) return;

        const oldId = this._cascadeId;
        const oldCount = this._stepCount;

        this._setState(STATES.TRANSITIONING);
        this._addLog('system', `Transitioning cascade after ${oldCount} steps...${reason ? ` (${reason})` : ''}`);

        let newId;
        try {
            newId = await startCascade(this._lsInst);
        } catch (e) {
            this._addLog('error', `Failed to create new cascade: ${e.message}`);
            this._setState(STATES.ACTIVE);
            return;
        }

        this._cascadeId = newId;
        this._stepCount = 0;
        this._lastRelayedStepIndex = -1;
        this._isBusy = false;

        this._setState(STATES.ACTIVE);
        this._addLog('system', `Cascade transitioned → ${this._shortId()}`);
        this._persistState();

        this.emit('cascade_transition', {
            oldId,
            newId,
            oldStepCount: oldCount,
            oldShort: this._shortId(oldId),
            newShort: this._shortId(newId),
            stepCount: oldCount,
            reason,
        });
    }

    // ── Workspace Switch ─────────────────────────────────────────────────────

    /**
     * Switch to a different workspace / LS instance.
     * @param {string} name - Workspace name
     * @param {object} [lsInst] - LS instance to bind to
     */
    async switchWorkspace(name, lsInst = null) {
        if (this._destroyed) return;

        if (lsInst) {
            this._lsInst = lsInst;
        }
        this._workspace = name;
        this._addLog('system', `Switched workspace → ${name}`);
        this._persistState();

        if (this._state === STATES.ACTIVE || this._state === STATES.TRANSITIONING) {
            await this.transitionCascade(`Workspace: ${name}`);
        }
    }

    // ── Accept / Reject ──────────────────────────────────────────────────────

    async accept() {
        await this._interact(false);
    }

    async reject() {
        await this._interact(true);
    }

    // AcceptDiff/RejectDiff don't exist in Antigravity 2.0.11's LS (404) — answer the
    // pending WAITING interaction via HandleCascadeUserInteraction, same as the dashboard.
    async _interact(reject, logPrefix = '') {
        if (!this._cascadeId) return;
        const { buildAcceptPayload, denyInteraction } = require('./auto-accept');
        const payload = await buildAcceptPayload(this._cascadeId, this._lsInst);
        if (!payload) {
            this._addLog('system', `${logPrefix}${reject ? 'Reject' : 'Accept'}: no pending interaction found`);
            return;
        }
        const body = reject
            ? { cascadeId: this._cascadeId, interaction: denyInteraction(payload.interaction) }
            : payload;
        await callApiFireAndForget('HandleCascadeUserInteraction', body, this._lsInst);
        this._addLog('system', `${logPrefix}${reject ? 'Rejected' : 'Accepted'} pending interaction`);
    }

    // ── Status ───────────────────────────────────────────────────────────────

    getStatus() {
        return {
            id: this.id,
            state: this._state,
            cascadeId: this._cascadeId,
            cascadeIdShort: this._shortId(),
            stepCount: this._stepCount,
            stepSoftLimit: this._stepSoftLimit,
            isBusy: this._isBusy,
            workspace: this._workspace,
            transport: this._transport,
            lastActivity: this._lastActivity,
            log: this._log.slice(-50),
            orchestrationId: this._orchestrationId,
            role: this._role,
        };
    }

    // ── Destroy ──────────────────────────────────────────────────────────────

    destroy() {
        if (this._destroyed) return;
        this._destroyed = true;
        this._isBusy = false;
        this._addLog('system', 'Session destroyed');
        this.emit('destroyed');
        this.removeAllListeners();
    }

    // ── Internal ─────────────────────────────────────────────────────────────

    async _ensureCascade() {
        if (this._cascadeId) {
            // Check if existing cascade is still usable
            try {
                const info = await getStepCountAndStatus(
                    this._cascadeId,
                    (m, b) => this._callApi(m, b)
                );
                const status = info.status || '';

                const isTerminal = status === 'CASCADE_RUN_STATUS_DONE' ||
                    status === 'CASCADE_RUN_STATUS_COMPLETED' ||
                    status === '';

                if (isTerminal) {
                    this._addLog('system', `Cascade ${this._shortId()} is ${status || 'UNKNOWN'} — creating new`);
                    const oldId = this._cascadeId;
                    const oldCount = this._stepCount;
                    this._cascadeId = await startCascade(this._lsInst);
                    this._stepCount = 0;
                    this._lastRelayedStepIndex = -1;
                    this._persistState();

                    this.emit('cascade_transition', {
                        oldId,
                        newId: this._cascadeId,
                        oldStepCount: oldCount,
                        oldShort: this._shortId(oldId),
                        newShort: this._shortId(),
                        stepCount: 0,
                        reason: 'Previous cascade finished',
                    });
                } else {
                    this._stepCount = info.stepCount || this._stepCount;
                    this._addLog('system', `Cascade ${this._shortId()} is ${status} — reusing (${this._stepCount} steps)`);

                    // Pre-check step limit
                    if (this._stepCount >= this._stepSoftLimit) {
                        this._addLog('system', `Step limit reached (${this._stepCount}/${this._stepSoftLimit}) — transitioning`);
                        await this.transitionCascade('Step limit reached');
                    }
                }
            } catch (e) {
                this._addLog('system', `Status check failed: ${e.message} — using existing cascade`);
            }
        } else {
            // No cascade — create a new one
            try {
                this._cascadeId = await startCascade(this._lsInst);
                this._stepCount = 0;
                this._lastRelayedStepIndex = -1;
                this._addLog('system', `Created cascade: ${this._shortId()} for workspace: ${this._workspace}`);
                this._persistState();
            } catch (e) {
                this._addLog('error', `Cannot create cascade: ${e.message}`);
                throw e;
            }
        }
    }

    async _refreshCascadeInfo() {
        if (!this._cascadeId) return;
        try {
            const info = await getStepCountAndStatus(this._cascadeId);
            this._stepCount = info.stepCount || 0;
        } catch { /* ignore */ }
    }

    async _triggerAccept() {
        await this._interact(false, 'Auto-');
    }

    async _triggerReject() {
        await this._interact(true, 'Auto-');
    }

    _callApi(method, body = {}) {
        return callApi(method, body, this._lsInst);
    }

    _setBusy(busy) {
        if (this._isBusy === busy) return;
        this._isBusy = busy;
        this.emit('busy_change', { isBusy: busy });
    }

    _setState(newState) {
        if (this._state === newState) return;
        const old = this._state;
        this._state = newState;
        this.emit('status_change', { state: newState, previousState: old, ...this.getStatus() });
    }

    _persistState() {
        this._persist({
            id: this.id,
            workspace: this._workspace,
            cascadeId: this._cascadeId,
            stepCount: this._stepCount,
            lastRelayedStepIndex: this._lastRelayedStepIndex,
        });
    }

    _addLog(type, message) {
        this._log.push({ type, message, ts: Date.now() });
        if (this._log.length > 200) this._log = this._log.slice(-200);
        this.emit('log', { type, message, ts: Date.now() });
    }

    _shortId(id) {
        const target = id || this._cascadeId;
        return target ? target.substring(0, 8) : '--------';
    }
}

module.exports = { AgentSession, STATES };
