// === Step Cache & Fetching ===
// Manages the step cache, fetching steps (JSON + binary protobuf), and ensuring cached data.

const { lsConfig, lsInstances, BATCH_SIZE, STEP_WINDOW_SIZE } = require('./config');
const { callApi } = require('./api');
const { countBinarySteps, decodeBinarySteps } = require('./protobuf');

const stepCache = {};       // { convId: { steps: [], stepCount: N, baseIndex: M } }
const fetchingSet = new Map(); // per-conversation fetching lock: convId → Promise

// --- Step count ---

async function getStepCountAndStatus(convId, callFn = null) {
    const apiFn = callFn || ((m, b) => callApi(m, b));
    const summaries = await apiFn('GetAllCascadeTrajectories', {});
    const info = summaries?.trajectorySummaries?.[convId];
    return {
        stepCount: info?.stepCount || 0,
        status: info?.status || null,
        trajectoryId: info?.trajectoryId || null,
    };
}

// --- Fetch all steps: hybrid JSON + binary protobuf strategy ---
// JSON may cap results; binary protobuf correctly respects pagination.
async function fetchAllSteps(convId, totalSteps, inst = null, fromIndex = 0) {
    const maxSteps = Math.max(totalSteps, 0);
    if (maxSteps === 0) return { steps: [], hasGaps: false };

    // Step 1: JSON call for steps from fromIndex
    const jsonData = await callApi('GetCascadeTrajectorySteps', {
        cascadeId: convId, startIndex: fromIndex, endIndex: maxSteps
    }, inst);
    const jsonSteps = jsonData.steps || [];
    const jsonCount = jsonSteps.length;

    // Check if JSON returned enough (respects fromIndex or returned from 0)
    const expectedCount = maxSteps - fromIndex;
    if (jsonCount >= expectedCount) {
        return { steps: jsonSteps.slice(0, expectedCount), hasGaps: false };
    }

    // Step 2: Binary protobuf for remaining steps
    const { callApiBinary } = require('./api');
    console.log(`[*] JSON returned ${jsonCount}/${expectedCount} steps (from ${fromIndex}). Using binary protobuf for remaining...`);

    const allSteps = [...jsonSteps];
    let hasGaps = false;
    // Detect if JSON API ignored our fromIndex and returned from 0
    const jsonActualStart = jsonCount > expectedCount ? 0 : fromIndex;
    let binaryStart = jsonActualStart + jsonCount;
    let consecutiveEmptyRanges = 0;
    const MAX_EMPTY_RANGES = 5;
    const SUB_BATCH_SIZE = 50;

    while (binaryStart < maxSteps) {
        const binaryEnd = Math.min(binaryStart + BATCH_SIZE, maxSteps);
        try {
            const binBuf = await callApiBinary(convId, binaryStart, binaryEnd, inst);
            const binCount = countBinarySteps(binBuf);

            if (binCount === 0) {
                console.log(`[*] Binary [${binaryStart}-${binaryEnd}]: 0 steps, probing with sub-batches...`);
                let subStart = binaryStart;
                let foundAny = false;
                while (subStart < binaryEnd) {
                    const subEnd = Math.min(subStart + SUB_BATCH_SIZE, binaryEnd);
                    try {
                        const subBuf = await callApiBinary(convId, subStart, subEnd, inst);
                        const subCount = countBinarySteps(subBuf);
                        if (subCount > 0) {
                            const subDecoded = decodeBinarySteps(subBuf);
                            console.log(`[*]   Sub-batch [${subStart}-${subEnd}]: ${subCount} → ${subDecoded.length} decoded`);
                            if (subDecoded.length > 0) allSteps.push(...subDecoded);
                            foundAny = true;
                            subStart += subCount;
                        } else {
                            subStart = subEnd;
                        }
                    } catch {
                        subStart = subEnd;
                    }
                }

                if (!foundAny) {
                    consecutiveEmptyRanges++;
                    if (consecutiveEmptyRanges >= MAX_EMPTY_RANGES) {
                        console.log(`[!] Too many empty ranges, stopping`);
                        hasGaps = true;
                        break;
                    }
                } else {
                    consecutiveEmptyRanges = 0;
                }
                binaryStart = binaryEnd;
                continue;
            }

            consecutiveEmptyRanges = 0;

            const decodedSteps = decodeBinarySteps(binBuf);
            console.log(`[*] Binary [${binaryStart}-${binaryEnd}]: ${binCount} binary steps → ${decodedSteps.length} decoded`);

            if (decodedSteps.length > 0) {
                allSteps.push(...decodedSteps);
            }

            binaryStart += binCount;
        } catch (e) {
            console.log(`[!] Binary batch [${binaryStart}-${binaryEnd}] failed: ${e.message}`);
            consecutiveEmptyRanges++;
            if (consecutiveEmptyRanges >= MAX_EMPTY_RANGES) {
                hasGaps = true;
                break;
            }
            binaryStart = binaryEnd;
        }
    }

    console.log(`[✓] Total: ${allSteps.length}/${maxSteps} steps (JSON: ${jsonCount}, binary: ${allSteps.length - jsonCount})`);
    return { steps: allSteps, hasGaps: hasGaps || allSteps.length < maxSteps };
}

// --- Ensure cached ---
// Uses a Promise-based lock: if another call is already fetching the same conversation,
// subsequent callers await the same Promise instead of returning with empty cache.

async function ensureCached(convId, inst = null) {
    if (stepCache[convId]) return;
    if (lsInstances.length === 0) {
        console.log(`[!] ensureCached skipped — LS not configured yet`);
        return; // Don't cache empty — will retry after init
    }

    // Wait if another call is already fetching this conversation
    if (fetchingSet.has(convId)) {
        await fetchingSet.get(convId);
        return;
    }

    const fetchPromise = (async () => {
        try {
            const callFn = inst ? (m, b) => callApi(m, b, inst) : null;
            const stepCount = await getStepCountAndStatus(convId, callFn).then(r => r.stepCount);
            console.log(`[*] Loading ${convId.substring(0, 8)} (stepCount: ${stepCount}, batches: ${Math.ceil(stepCount / BATCH_SIZE)})...`);

            // Only fetch the tail window (last STEP_WINDOW_SIZE steps)
            const baseIndex = Math.max(0, stepCount - STEP_WINDOW_SIZE);
            const { steps, hasGaps } = await fetchAllSteps(convId, stepCount, inst, baseIndex);
            stepCache[convId] = { steps, stepCount, baseIndex };
            console.log(`[✓] Cached ${steps.length}/${stepCount} steps (window from ${baseIndex})${hasGaps ? ' (with gaps)' : ''}`);
        } catch (e) {
            console.log(`[!] Load error: ${e.message}`);
            // Don't cache empty on error — will retry on next set_conversation
        }
    })();

    fetchingSet.set(convId, fetchPromise);
    try {
        await fetchPromise;
    } finally {
        fetchingSet.delete(convId);
    }
}

// --- Shared helper: Antigravity LS API startIndex workaround ---
// Antigravity LS JSON API may ignore startIndex and return from 0 (both macOS & Windows).
// Detect: if we got more steps than the range we requested, API started at 0.
function detectApiStartIndex(stepsLength, expectedRange, requestedFrom) {
    return stepsLength > expectedRange ? 0 : requestedFrom;
}

module.exports = { stepCache, ensureCached, getStepCountAndStatus, fetchAllSteps, detectApiStartIndex, fetchingSet };
