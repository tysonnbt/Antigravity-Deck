// === Step Polling & SSE ===
// Polls ALL running conversations across ALL LS instances for new/updated steps.
// Broadcasts updates via WebSocket to connected UI clients.
// Also subscribes to LS SSE stream for real-time status updates.

const { lsConfig, lsInstances, POLL_INTERVAL, FAST_POLL_INTERVAL, SLOW_POLL_INTERVAL, STEP_WINDOW_SIZE } = require('./config');
const { callApi, callApiOnInstance } = require('./api');
const { countBinarySteps, decodeBinarySteps } = require('./protobuf');
// NOTE: ws.js is NOT imported at top level to avoid circular dependency:
//   cache.js → ws.js → poller.js → ws.js
// Instead, broadcast/broadcastAll are lazy-loaded inside functions that need them.
function _broadcast(data, targetConvId) { return require('./ws').broadcast(data, targetConvId); }
function _broadcastAll(data) { return require('./ws').broadcastAll(data); }
const { stepCache, getStepCountAndStatus, ensureCached, detectApiStartIndex, fetchingSet } = require('./step-cache');
const { handleAutoAccept, startAutoAcceptPolling } = require('./auto-accept');

// --- State ---
let pollTimer = null;
let currentInterval = POLL_INTERVAL;
const lastCascadeStatusMap = {}; // per-conversation status tracking
let isPollRunning = false; // prevent concurrent poll ticks
const knownConvIds = new Set(); // track all discovered conversation IDs
const quietPoll = !!process.env.QUIET_POLL; // suppress verbose logs in tunnel mode

// --- Cascade→Instance persistent map ---
// Maps cascadeId → LS instance object. Updated by poller each tick and by routes on cascade creation.
const cascadeInstanceMap = new Map();
function getInstanceForCascade(cascadeId) { return cascadeInstanceMap.get(cascadeId) || null; }
function registerCascadeInstance(cascadeId, inst) { cascadeInstanceMap.set(cascadeId, inst); }

// Bridge relay: notify about cascade status changes (backup — bridge handles its own relay)
let _bridge = null;
function triggerBridgeRelay(convId) {
    if (!_bridge) _bridge = require('./agent-bridge');
    if (_bridge.activeCascadeId === convId &&
        (_bridge.state === 'ACTIVE' || _bridge.state === 'TRANSITIONING')) {
        console.log(`[Bridge] Cascade ${convId.substring(0, 8)} status changed (bridge handles relay)`);
    }
}

// --- Adaptive poll rate ---

function adjustPollRate(cascadeStatus) {
    const isActive = cascadeStatus === 'CASCADE_RUN_STATUS_RUNNING' ||
        cascadeStatus === 'CASCADE_RUN_STATUS_WAITING_FOR_USER';
    const target = isActive ? FAST_POLL_INTERVAL : SLOW_POLL_INTERVAL;
    if (target !== currentInterval) {
        currentInterval = target;
        clearInterval(pollTimer);
        pollTimer = setInterval(pollNow, currentInterval);
        console.log(`[*] Poll rate → ${currentInterval / 1000}s (${isActive ? 'ACTIVE' : 'IDLE'})`);
    }
}

// --- Start polling ---

function startPolling() {
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = setInterval(pollNow, POLL_INTERVAL);
    console.log(`[*] Polling every ${POLL_INTERVAL / 1000}s (global — all running conversations)`);
    // Start dedicated auto-accept polling (checks ALL running cascades, not just UI-viewed)
    startAutoAcceptPolling();
}

// --- Poll tick: discover ALL running conversations across ALL LS instances ---

async function pollNow() {
    if (lsInstances.length === 0) return;
    if (isPollRunning) return; // debounce
    isPollRunning = true;

    try {
        // Collect ALL conversation IDs to poll from ALL LS instances
        const convToPoll = new Map(); // convId → { status, trajectoryId, inst }
        let anyActive = false;

        for (const inst of lsInstances) {
            try {
                const summaries = await callApiOnInstance(inst, 'GetAllCascadeTrajectories');
                const trajectories = summaries?.trajectorySummaries || {};
                for (const [cascadeId, info] of Object.entries(trajectories)) {
                    const status = info.status || '';
                    const isRunning = status === 'CASCADE_RUN_STATUS_RUNNING' ||
                        status === 'CASCADE_RUN_STATUS_WAITING_FOR_USER';

                    if (isRunning) anyActive = true;

                    // Prioritize RUNNING/WAITING over IDLE for the same cascadeId
                    const existing = convToPoll.get(cascadeId);
                    // Always update cascade→instance map
                    cascadeInstanceMap.set(cascadeId, inst);

                    if (!existing || isRunning) {
                        convToPoll.set(cascadeId, {
                            status,
                            trajectoryId: info.trajectoryId,
                            stepCount: info.stepCount || 0,
                            inst,
                        });
                    }
                }
            } catch { }
        }

        // Adaptive poll rate based on any active cascade
        adjustPollRate(anyActive ? 'CASCADE_RUN_STATUS_RUNNING' : 'CASCADE_RUN_STATUS_IDLE');

        // Detect NEW conversations (not seen before) → push to frontend
        let hasNewConversations = false;
        for (const cascadeId of convToPoll.keys()) {
            if (!knownConvIds.has(cascadeId)) {
                knownConvIds.add(cascadeId);
                hasNewConversations = true;
            }
        }
        if (hasNewConversations) {
            console.log(`[poll] New conversations discovered → notifying frontend`);
            _broadcastAll({ type: 'conversations_updated' });
        }

        // Poll each discovered conversation
        for (const [cascadeId, info] of convToPoll) {
            // Detect cascade status changes for ALL conversations (not just polled ones)
            // This must happen BEFORE the isRunning filter, otherwise
            // RUNNING→DONE transitions are missed for non-UI-viewed cascades (e.g. bridge)
            if (info.status && info.status !== lastCascadeStatusMap[cascadeId]) {
                const prevStatus = lastCascadeStatusMap[cascadeId];
                lastCascadeStatusMap[cascadeId] = info.status;
                _broadcast({
                    type: 'cascade_status',
                    conversationId: cascadeId,
                    status: info.status,
                }, cascadeId);
                handleAutoAccept(cascadeId, info.status);

                // Bridge relay: trigger when cascade transitions from active → done
                const wasActive = prevStatus === 'CASCADE_RUN_STATUS_RUNNING' ||
                    prevStatus === 'CASCADE_RUN_STATUS_WAITING_FOR_USER';
                const isNowDone = info.status !== 'CASCADE_RUN_STATUS_RUNNING' &&
                    info.status !== 'CASCADE_RUN_STATUS_WAITING_FOR_USER';
                if (wasActive && isNowDone) {
                    triggerBridgeRelay(cascadeId);
                    // Final poll: fetch complete step content before stopping
                    await pollConversation(cascadeId, info);
                }

                // Fast-cascade relay: first time seeing this cascade and it's already IDLE/DONE
                // (cascade completed faster than poll interval, poller never saw RUNNING state)
                if (!prevStatus && isNowDone && info.stepCount > 0) {
                    triggerBridgeRelay(cascadeId);
                }
            }

            // Ensure conversation is cached (auto-cache new conversations)
            if (!stepCache[cascadeId] && info.stepCount > 0) {
                await ensureCached(cascadeId, info.inst);
            }

            // Poll conversations to keep cache up to date:
            // - RUNNING/WAITING: always poll (streaming content updates)
            // - IDLE: poll if server has more steps than cache (catch up after transition)
            const isRunning = info.status === 'CASCADE_RUN_STATUS_RUNNING' ||
                info.status === 'CASCADE_RUN_STATUS_WAITING_FOR_USER';
            const cached = stepCache[cascadeId];
            const serverAhead = cached && info.stepCount > (cached.baseIndex || 0) + cached.steps.length;

            if (isRunning || serverAhead) {
                await pollConversation(cascadeId, info);
            }

            // Backup bridge relay: catch cases where poller missed RUNNING→IDLE transition
            // (cascade processed faster than poll interval, poller only sees IDLE→IDLE)
            if (!isRunning && serverAhead) {
                triggerBridgeRelay(cascadeId);
            }
        }

    } finally {
        isPollRunning = false;
    }
}

// --- Poll a single conversation ---
// info = { status, trajectoryId, stepCount, inst } or null (use global lsConfig)

async function pollConversation(activeConvId, info) {
    const cache = stepCache[activeConvId];
    if (!cache) return;
    // Skip polling while ensureCached is still loading this conversation
    if (fetchingSet.has(activeConvId)) return;

    try {
        // Use pre-fetched info if available, otherwise query
        let newStepCount, cascadeStatus, trajectoryId;
        if (info && info.stepCount !== undefined) {
            newStepCount = info.stepCount;
            cascadeStatus = info.status;
            trajectoryId = info.trajectoryId;
        } else {
            const result = await getStepCountAndStatus(activeConvId);
            newStepCount = result.stepCount;
            cascadeStatus = result.status;
            trajectoryId = result.trajectoryId;
        }

        const cachedLen = (cache.baseIndex || 0) + cache.steps.length; // server-absolute end of cached window
        if (!quietPoll && newStepCount !== cachedLen) console.log(`[poll] ${activeConvId.substring(0, 8)}: cached=${cachedLen} server=${newStepCount} status=${cascadeStatus}`);

        // Status changes are now detected at pollNow() level (before isRunning/isUIViewed filter)
        // to ensure RUNNING→DONE transitions are caught for ALL cascades including bridge

        // Nothing to do if no steps exist
        if (newStepCount === 0 && cachedLen === 0) return;

        // Fetch last 20 steps from cache + any new steps beyond cache
        // REFRESH_TAIL=20 ensures streaming content updates are caught
        const REFRESH_TAIL = 20;
        const fetchFrom = Math.max(0, cachedLen - REFRESH_TAIL);
        const fetchTo = Math.max(newStepCount, cachedLen);

        if (fetchTo <= 0) return;

        // Use instance-specific API call if info provides one
        const callFn = (info && info.inst)
            ? (m, b) => callApiOnInstance(info.inst, m, b)
            : (m, b) => callApi(m, b);

        let freshSteps = [];
        try {
            const data = await callFn('GetCascadeTrajectorySteps', {
                cascadeId: activeConvId,
                startIndex: fetchFrom,
                endIndex: fetchTo
            });
            freshSteps = data.steps || [];
        } catch { return; }

        // Use Antigravity LS API workaround (JSON may ignore startIndex)
        const expectedRange = fetchTo - fetchFrom;
        const apiStartedAt = detectApiStartIndex(freshSteps.length, expectedRange, fetchFrom);

        // Process the fresh steps — map each to the correct cache index
        let updatedCount = 0;
        let newCount = 0;
        const newStepsToAdd = [];
        const baseIdx = cache.baseIndex || 0; // server index of cache.steps[0]

        for (let i = 0; i < freshSteps.length; i++) {
            const serverIdx = apiStartedAt + i; // what server index this step represents
            if (serverIdx < 0 || serverIdx >= newStepCount) continue; // out of bounds

            if (serverIdx < cachedLen) {
                // Existing step — check if changed (convert to local index)
                const localIdx = serverIdx - baseIdx;
                if (localIdx >= 0 && localIdx < cache.steps.length) {
                    const oldJson = JSON.stringify(cache.steps[localIdx]);
                    const newJson = JSON.stringify(freshSteps[i]);
                    if (oldJson !== newJson) {
                        cache.steps[localIdx] = freshSteps[i];
                        _broadcast({
                            type: 'step_updated',
                            conversationId: activeConvId,
                            index: serverIdx,
                            step: freshSteps[i]
                        }, activeConvId);
                        updatedCount++;
                    }
                }
            } else if (serverIdx >= cachedLen) {
                // New step beyond cache — only add if index matches cache end
                if (serverIdx === cachedLen + newStepsToAdd.length) {
                    newStepsToAdd.push(freshSteps[i]);
                    newCount++;
                }
            }
        }

        // If JSON didn't return enough new steps, try binary
        const { callApiBinary } = require('./api');
        const expectedNew = Math.max(0, newStepCount - cachedLen);
        if (newCount < expectedNew && expectedNew > 0) {
            const binaryFrom = cachedLen + newCount;
            try {
                const binBuf = await callApiBinary(activeConvId, binaryFrom, newStepCount, info?.inst);
                const binCount = countBinarySteps(binBuf);
                if (binCount > 0) {
                    const decoded = decodeBinarySteps(binBuf);
                    if (decoded.length > 0) {
                        newStepsToAdd.push(...decoded);
                        newCount += decoded.length;
                        console.log(`[*] Binary incremental [${binaryFrom}-${newStepCount}]: ${decoded.length} decoded`);
                    }
                }
            } catch { }
        }

        // Binary refresh for cached tail steps that JSON couldn't reach
        // (e.g., steps 938-958 when JSON only returns 0-~598)
        const jsonMaxReach = apiStartedAt + freshSteps.length;
        if (jsonMaxReach < cachedLen) {
            const binRefreshFrom = Math.max(jsonMaxReach, fetchFrom);
            try {
                const binBuf = await callApiBinary(activeConvId, binRefreshFrom, cachedLen, info?.inst);
                const binCount = countBinarySteps(binBuf);
                if (binCount > 0) {
                    const decoded = decodeBinarySteps(binBuf);
                    for (let j = 0; j < decoded.length && (binRefreshFrom + j) < cachedLen; j++) {
                        const sIdx = binRefreshFrom + j;
                        const localIdx = sIdx - baseIdx;
                        if (localIdx < 0 || localIdx >= cache.steps.length) continue;
                        const oldJson = JSON.stringify(cache.steps[localIdx]);
                        const newJson = JSON.stringify(decoded[j]);
                        if (oldJson !== newJson) {
                            cache.steps[localIdx] = decoded[j];
                            _broadcast({
                                type: 'step_updated',
                                conversationId: activeConvId,
                                index: sIdx,
                                step: decoded[j]
                            }, activeConvId);
                            updatedCount++;
                        }
                    }
                }
            } catch { }
        }

        // Broadcast new steps
        if (newStepsToAdd.length > 0) {
            cache.steps.push(...newStepsToAdd);
            // Trim window to keep memory bounded
            if (cache.steps.length > STEP_WINDOW_SIZE) {
                const excess = cache.steps.length - STEP_WINDOW_SIZE;
                cache.steps.splice(0, excess);
                cache.baseIndex = (cache.baseIndex || 0) + excess;
            }
            _broadcast({
                type: 'steps_new',
                conversationId: activeConvId,
                steps: newStepsToAdd,
                total: cache.steps.length,
                baseIndex: cache.baseIndex || 0,
            }, activeConvId);
            console.log(`[WS] broadcast steps_new: ${newStepsToAdd.length} steps for ${activeConvId.substring(0, 8)} (total: ${cache.steps.length})`);
        }

        cache.stepCount = newStepCount;

        if (updatedCount > 0 || newCount > 0) {
            if (!quietPoll) console.log(`[poll] ${updatedCount} updated, ${newCount} new (${cache.steps.length}/${newStepCount})`);
        }

        // Step-level auto-accept: detect CORTEX_STEP_STATUS_WAITING on any step
        // Check BOTH JSON freshSteps AND binary-decoded newStepsToAdd
        const { getAutoAccept } = require('./auto-accept');
        if (getAutoAccept()) {
            let found = false;
            // Check JSON-fetched steps first
            for (let i = 0; i < freshSteps.length && !found; i++) {
                if (freshSteps[i].status === 'CORTEX_STEP_STATUS_WAITING' || freshSteps[i].status === 9) {
                    const stepIndex = apiStartedAt + i;
                    const step = freshSteps[i];
                    console.log(`[AutoAccept] Found WAITING step[${stepIndex}] (JSON): ${step.type || ''}`);
                    handleAutoAccept(activeConvId, 'CASCADE_RUN_STATUS_WAITING_FOR_USER', { trajectoryId, stepIndex, step });
                    found = true;
                }
            }
            // Check binary-decoded steps (for high-index steps beyond JSON range)
            if (!found) {
                for (let i = 0; i < newStepsToAdd.length; i++) {
                    const step = newStepsToAdd[i];
                    if (step.status === 'CORTEX_STEP_STATUS_WAITING' || step.status === 9) {
                        const stepIndex = cachedLen + i;
                        console.log(`[AutoAccept] Found WAITING step[${stepIndex}] (binary): ${step.type || ''}`);
                        handleAutoAccept(activeConvId, 'CASCADE_RUN_STATUS_WAITING_FOR_USER', { trajectoryId, stepIndex, step });
                        break;
                    }
                }
            }
        }

    } catch (e) { }
}

// --- SSE Stream: Subscribe to real-time cascade status changes ---
// This supplements polling with instant WAITING_FOR_USER detection

let sseAbortController = null;

async function startCascadeSSE() {
    const sseInst = lsInstances[0];
    if (!sseInst?.port || !sseInst?.csrfToken) {
        console.log('[SSE] Not starting — LS not configured');
        return;
    }
    if (sseAbortController) sseAbortController.abort();
    sseAbortController = new AbortController();

    const protocol = sseInst.useTls ? 'https' : 'http';
    const host = sseInst.useTls ? '127.0.0.1' : 'localhost';
    const url = `${protocol}://${host}:${sseInst.port}/exa.language_server_pb.LanguageServerService/StreamCascadeReactiveUpdates`;

    console.log('[SSE] Connecting to StreamCascadeReactiveUpdates...');
    try {
        const fetchOpts = {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Connect-Protocol-Version': '1',
                'X-Codeium-Csrf-Token': sseInst.csrfToken,
            },
            body: JSON.stringify({}),
            signal: sseAbortController.signal,
        };
        if (sseInst.useTls) {
            const https = require('https');
            fetchOpts.agent = new https.Agent({ rejectUnauthorized: false });
        }
        const res = await fetch(url, fetchOpts);
        if (!res.ok) {
            console.log(`[SSE] HTTP ${res.status} — streaming not available`);
            return;
        }
        console.log('[SSE] ✓ Connected');

        const reader = res.body?.getReader();
        if (!reader) return;
        const decoder = new TextDecoder();
        let buffer = '';

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            buffer += decoder.decode(value, { stream: true });

            // Parse JSON lines/chunks from streaming response
            let lines = buffer.split('\n');
            buffer = lines.pop() || ''; // keep incomplete line

            for (const line of lines) {
                const trimmed = line.trim();
                if (!trimmed) continue;
                try {
                    const msg = JSON.parse(trimmed);
                    // Look for status changes
                    if (msg.status || msg.cascadeStatus) {
                        const status = msg.status || msg.cascadeStatus;
                        const convId = msg.cascadeId || msg.conversationId;
                        if (convId && status) {
                            console.log(`[SSE] Status update: ${convId.substring(0, 8)} → ${status}`);
                            if (status !== lastCascadeStatusMap[convId]) {
                                const prevStatus = lastCascadeStatusMap[convId];
                                lastCascadeStatusMap[convId] = status;
                                _broadcast({
                                    type: 'cascade_status',
                                    conversationId: convId,
                                    status: status,
                                }, convId);
                                handleAutoAccept(convId, status);

                                // Bridge relay: trigger when cascade transitions from active → done
                                const wasActive = prevStatus === 'CASCADE_RUN_STATUS_RUNNING' ||
                                    prevStatus === 'CASCADE_RUN_STATUS_WAITING_FOR_USER';
                                const isNowDone = status !== 'CASCADE_RUN_STATUS_RUNNING' &&
                                    status !== 'CASCADE_RUN_STATUS_WAITING_FOR_USER';
                                if (wasActive && isNowDone) {
                                    triggerBridgeRelay(convId);
                                }
                            }
                        }
                    }
                } catch { /* not valid JSON, skip */ }
            }
        }
    } catch (e) {
        if (e.name !== 'AbortError') {
            console.log(`[SSE] Error: ${e.message}. Will retry in 10s.`);
            setTimeout(startCascadeSSE, 10000);
        }
    }
}

// Start SSE when LS is detected (call after detector confirms LS)
function startSSE() {
    startCascadeSSE();
}

module.exports = {
    startPolling, startSSE, getInstanceForCascade, registerCascadeInstance,
    // Exposed for cleanup.js — not for general use
    _knownConvIds: knownConvIds,
    _lastCascadeStatusMap: lastCascadeStatusMap,
    _cascadeInstanceMap: cascadeInstanceMap,
};
