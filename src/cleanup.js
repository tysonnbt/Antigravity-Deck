// === Centralized Cascade State Cleanup ===
// Prevents memory leaks by ensuring all 4 global structures are cleaned in sync.
// All modules call into this instead of doing ad-hoc `delete stepCache[id]`.

const { stepCache, fetchingSet } = require('./step-cache');

// Lazy imports to avoid circular deps (poller.js -> cleanup.js -> poller.js)
function _getPollerState() {
    const poller = require('./poller');
    return {
        knownConvIds: poller._knownConvIds,
        lastCascadeStatusMap: poller._lastCascadeStatusMap,
        cascadeInstanceMap: poller._cascadeInstanceMap,
    };
}

/**
 * Remove a single cascade from all global state.
 * Call from: DELETE /api/cascade/:id, DELETE /api/cache/:id
 */
function cleanupCascade(cascadeId) {
    const { knownConvIds, lastCascadeStatusMap, cascadeInstanceMap } = _getPollerState();

    delete stepCache[cascadeId];
    fetchingSet.delete(cascadeId);
    knownConvIds.delete(cascadeId);
    delete lastCascadeStatusMap[cascadeId];
    cascadeInstanceMap.delete(cascadeId);
}

/**
 * Remove ALL cascades owned by a specific LS instance.
 * Call from: detector.js when instance PID disappears or is replaced.
 * @param {object} inst - the LS instance object being removed
 */
function cleanupByInstance(inst) {
    const { cascadeInstanceMap, knownConvIds, lastCascadeStatusMap } = _getPollerState();

    const cascadeIds = [];
    for (const [cascadeId, ownerInst] of cascadeInstanceMap.entries()) {
        // Match by object identity first, then fallback to PID
        if (ownerInst === inst || ownerInst.pid === inst.pid) {
            cascadeIds.push(cascadeId);
        }
    }

    for (const id of cascadeIds) {
        delete stepCache[id];
        fetchingSet.delete(id);
        knownConvIds.delete(id);
        delete lastCascadeStatusMap[id];
        cascadeInstanceMap.delete(id);
    }

    if (cascadeIds.length > 0) {
        console.log(`[Cleanup] Purged ${cascadeIds.length} cascades for dead instance PID ${inst.pid}`);
    }
}

/**
 * Clear ALL cached state. Call from: DELETE /api/cache, agent-bridge workspace switch
 */
function cleanupAll() {
    const { knownConvIds, lastCascadeStatusMap, cascadeInstanceMap } = _getPollerState();

    const count = Object.keys(stepCache).length;
    Object.keys(stepCache).forEach(k => delete stepCache[k]);
    fetchingSet.clear();
    knownConvIds.clear();
    Object.keys(lastCascadeStatusMap).forEach(k => delete lastCascadeStatusMap[k]);
    cascadeInstanceMap.clear();

    return count;
}

module.exports = { cleanupCascade, cleanupByInstance, cleanupAll };
