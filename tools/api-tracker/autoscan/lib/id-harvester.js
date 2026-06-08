// === Live ID harvester ===
// Collects real IDs from the running LS (conversation/trajectory ids, workspace
// URIs, model ids) so Tier-2 can call parameterized READ methods with valid
// inputs — without any manual UI interaction.

const path = require('path');
const { rawCall } = require(path.join('..', '..', 'test', 'lib', 'transport'));

function deepCollect(obj, keyRe, out, depth = 0) {
    if (obj == null || depth > 7) return;
    if (Array.isArray(obj)) { obj.forEach((v) => deepCollect(v, keyRe, out, depth + 1)); return; }
    if (typeof obj === 'object') {
        for (const [k, v] of Object.entries(obj)) {
            if (keyRe.test(k) && (typeof v === 'string' || typeof v === 'number') && String(v).length) {
                out.add(String(v));
            }
            deepCollect(v, keyRe, out, depth + 1);
        }
    }
}

function collect(json, keyRe) {
    const s = new Set();
    if (json) deepCollect(json, keyRe, s);
    return Array.from(s);
}

/**
 * Harvest IDs from the live LS via a few read calls.
 * @param {{host,port,csrfToken,useTls}} conn
 * @returns {Promise<{conversationIds:string[], trajectoryIds:string[], workspaceUris:string[], modelIds:string[]}>}
 */
async function harvest(conn) {
    const ids = { conversationIds: [], trajectoryIds: [], workspaceUris: [], modelIds: [] };

    const traj = await rawCall(conn, 'GetAllCascadeTrajectories', {}, { timeoutMs: 8000 });
    if (traj.json) {
        ids.conversationIds = collect(traj.json, /^(cascadeId|conversationId)$/i);
        ids.trajectoryIds = collect(traj.json, /^trajectoryId$/i);
    }

    const ws = await rawCall(conn, 'GetWorkspaceInfos', {}, { timeoutMs: 6000 });
    if (ws.json) ids.workspaceUris = collect(ws.json, /(uri|absoluteUri|folder)$/i);

    const md = await rawCall(conn, 'GetCascadeModelConfigData', {}, { timeoutMs: 6000 });
    if (md.json) ids.modelIds = collect(md.json, /(modelId|^model$)/i);

    return ids;
}

module.exports = { harvest, collect, deepCollect };
