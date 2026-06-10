// === Conversations Routes ===
// /api/workspaces/:name/conversations, /api/models, /api/conversations/*, /api/user, /api/cache

const { callApi, callApiOnInstance } = require('../api');
const { callApiBinary } = require('../api');
const { countBinarySteps, decodeBinarySteps } = require('../protobuf');
const { STEP_LOAD_CHUNK } = require('../config');
const { lsInstances } = require('../config');
const { stepCache } = require('../cache');
const { getInstanceByName } = require('../detector');
const { resolveInst } = require('./route-helpers');

// Private helper — clear all step cache
function clearCache() {
    const { cleanupAll } = require('../cleanup');
    return cleanupAll();
}

module.exports = function setupConversationsRoutes(app) {
    // Conversations for a specific workspace (filtered by workspace URI)
    app.get('/api/workspaces/:name/conversations', async (req, res) => {
        const inst = getInstanceByName(decodeURIComponent(req.params.name));
        if (!inst) return res.status(400).json({ error: 'Unknown workspace' });

        try {
            // Source: full Jetbox conversation history (all-time). Fall back to the live
            // cascade list only if Jetbox hasn't populated yet (e.g. right after boot).
            const { getSummaries } = require('../jetbox');
            let all = getSummaries();
            if (!all || Object.keys(all).length === 0) {
                const trajData = await callApiOnInstance(inst, 'GetAllCascadeTrajectories');
                all = trajData.trajectorySummaries || {};
            }

            // Filter: only keep cascades whose workspace URI matches this instance.
            // Case-insensitive + decoded comparison (Windows drive letters vary: C: vs c:).
            // Orphans (no workspace URIs) only show in detached instances (no real folder).
            const wsUri = inst.workspaceFolderUri;
            const isDetached = !wsUri || wsUri.startsWith('detached://');
            const normalize = uri => decodeURIComponent(uri || '').toLowerCase().replace(/\/+$/, '');
            const wsUriNorm = normalize(wsUri);
            const filtered = {};
            for (const [id, info] of Object.entries(all)) {
                const cascadeWsUris = (info.workspaces || []).map(w => w.workspaceFolderAbsoluteUri);
                const isOrphan = !info.workspaces || info.workspaces.length === 0;
                const matchesWorkspace = cascadeWsUris.some(uri => normalize(uri) === wsUriNorm);
                if (matchesWorkspace || (isOrphan && isDetached)) filtered[id] = info;
            }

            res.json({ trajectorySummaries: filtered });
        } catch (e) { res.status(500).json({ error: e.message }); }
    });

    // Available models for cascade — mirrors the Antigravity IDE's model picker:
    // same models, same order + grouping (from clientModelSorts), same badges (tagTitle).
    // The LS already scopes clientModelConfigs to the signed-in user's tier, so no extra
    // tier filtering is needed here; we only drop any explicitly-disabled model defensively.
    app.get('/api/models', async (req, res) => {
        try {
            // Models are hub-global in 2.0.11; resolveInst() already falls back to the
            // shared hub (getFirstActiveInstance) when no workspace is tracked, so the
            // picker still loads before a folder is opened.
            const inst = resolveInst(req);
            if (!inst) return res.status(503).json({ error: 'IDE not connected' });
            const data = await callApi('GetCascadeModelConfigData', {}, inst);

            const mapModel = (m) => ({
                label: m.label,
                modelId: m.modelOrAlias?.model || m.modelOrAlias?.alias || '',
                supportsImages: !!m.supportsImages,
                isRecommended: !!m.isRecommended,
                isBeta: !!m.isBeta,
                tagTitle: m.tagTitle || '',
                tagDescription: m.tagDescription || '',
                quota: m.quotaInfo?.remainingFraction ?? 1,
                resetTime: m.quotaInfo?.resetTime || null,
            });

            // LS omits `disabled` when false; drop only models explicitly disabled.
            const configs = (data.clientModelConfigs || []).filter(m => m.disabled !== true);
            const byLabel = new Map(configs.map(m => [m.label, m]));

            // Build IDE-faithful groups from the default sort scheme (clientModelSorts[0]).
            // Its groups reference models by label and define the display order + grouping.
            const used = new Set();
            const groups = [];
            const primarySort = (data.clientModelSorts || [])[0];
            if (primarySort) {
                for (const g of (primarySort.groups || [])) {
                    const groupModels = (g.modelLabels || [])
                        .map(label => byLabel.get(label))
                        .filter(Boolean)
                        .map(m => { used.add(m.label); return mapModel(m); });
                    // Only the first group carries the sort name as its header (avoids dupes).
                    if (groupModels.length) groups.push({ name: groups.length === 0 ? (primarySort.name || '') : '', models: groupModels });
                }
            }
            // Any models the sort didn't reference stay visible (never silently hide them).
            const leftovers = configs.filter(m => !used.has(m.label)).map(mapModel);
            if (leftovers.length) groups.push({ name: groups.length ? 'Other' : '', models: leftovers });

            // Flat list (backward compatible) = groups flattened, already in IDE order.
            const models = groups.flatMap(g => g.models);
            const defaultModel = data.defaultOverrideModelConfig?.modelOrAlias?.model || '';
            res.json({ models, groups, defaultModel });
        } catch (e) { res.status(500).json({ error: e.message }); }
    });

    // Full conversation history — from the Jetbox stream (all projects, all-time).
    app.get('/api/conversations', async (req, res) => {
        try {
            const { getSummaries } = require('../jetbox');
            const summaries = getSummaries();
            if (summaries && Object.keys(summaries).length > 0) {
                return res.json({ trajectorySummaries: summaries });
            }
            // Fallback (Jetbox not populated yet): merge live cascade lists per unique hub conn.
            const { lsInstances } = require('../config');
            const merged = { trajectorySummaries: {} };
            const seenConns = new Set();
            for (const inst of lsInstances) {
                const connKey = `${inst.useTls ? 's' : ''}${inst.port}:${inst.csrfToken}`;
                if (seenConns.has(connKey)) continue;
                seenConns.add(connKey);
                try {
                    const data = await callApiOnInstance(inst, 'GetAllCascadeTrajectories');
                    if (data?.trajectorySummaries) Object.assign(merged.trajectorySummaries, data.trajectorySummaries);
                } catch { }
            }
            res.json(merged);
        }
        catch (e) { res.status(500).json({ error: e.message }); }
    });

    // Projects (Jetbox ProjectUpdatesStream + ReadProject) with conversation counts —
    // powers the "Projects" grouping in the conversation history view.
    app.get('/api/projects', (req, res) => {
        try {
            const { getProjects } = require('../jetbox');
            res.json({ projects: getProjects() });
        } catch (e) { res.status(500).json({ error: e.message }); }
    });

    // Conversation steps
    app.get('/api/conversations/:id/steps', async (req, res) => {
        try {
            const inst = resolveInst(req);
            res.json(await callApi('GetCascadeTrajectorySteps', {
                cascadeId: req.params.id,
                startIndex: parseInt(req.query.start) || 0,
                endIndex: parseInt(req.query.end) || 999999
            }, inst));
        } catch (e) { res.status(500).json({ error: e.message }); }
    });

    // Load older steps for scroll-up pagination (binary protobuf for reliability)
    app.get('/api/conversations/:id/steps/older', async (req, res) => {
        try {
            const { STEP_LOAD_CHUNK } = require('../config');
            const cascadeId = req.params.id;
            const cache = stepCache[cascadeId];
            if (!cache || (cache.baseIndex || 0) === 0) {
                return res.json({ steps: [], baseIndex: 0, hasMore: false });
            }

            const currentBase = cache.baseIndex || 0;
            const loadFrom = Math.max(0, currentBase - STEP_LOAD_CHUNK);
            const loadTo = currentBase;

            // Use binary protobuf for reliable pagination
            const inst = resolveInst(req);
            const binBuf = await callApiBinary(cascadeId, loadFrom, loadTo, inst);
            const binCount = countBinarySteps(binBuf);
            let olderSteps = [];
            if (binCount > 0) {
                olderSteps = decodeBinarySteps(binBuf);
            }

            // Prepend to cache (allow temporary expansion, next poll trim will restore)
            if (olderSteps.length > 0) {
                cache.steps.unshift(...olderSteps);
                cache.baseIndex = loadFrom;
            }

            res.json({
                steps: olderSteps,
                baseIndex: loadFrom,
                hasMore: loadFrom > 0,
            });
        } catch (e) { res.status(500).json({ error: e.message }); }
    });

    // User info
    app.get('/api/user', async (req, res) => {
        try { res.json(await callApi('GetUserStatus', {}, resolveInst(req))); }
        catch (e) { res.status(500).json({ error: e.message }); }
    });

    // Cache management
    app.delete('/api/cache', (req, res) => {
        const count = clearCache();
        console.log(`[*] Cache cleared (${count} conversations)`);
        res.json({ cleared: count });
    });

    app.delete('/api/cache/:id', (req, res) => {
        const id = req.params.id;
        if (stepCache[id]) {
            const { cleanupCascade } = require('../cleanup');
            cleanupCascade(id);
            console.log(`[*] Cache cleared for ${id.substring(0, 8)}`);
            res.json({ cleared: true, id });
        } else {
            res.json({ cleared: false, id, message: 'not cached' });
        }
    });
};
