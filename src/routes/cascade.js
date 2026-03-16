// === Cascade Routes ===
// /api/cascade/*, /api/auto-accept, /api/user/profile, /api/plugins/*, /api/ls/:method

const { callApi, callApiFireAndForgetOnInstance } = require('../api');
const { getAutoAccept, setAutoAccept, buildAcceptPayload } = require('../cache');
const { startCascade, sendMessage } = require('../cascade'); // startAndSend is NOT used — intentionally omitted
const { registerCascadeInstance } = require('../poller');
const { resolveInst } = require('./route-helpers');

// Security: Method whitelist to prevent arbitrary LS method invocation
const ALLOWED_LS_METHODS = new Set([
    'GetCascadeModelConfigData',
    'GetAllCascadeTrajectories',
    'GetCascadeTrajectory',
    'GetCascadeTrajectorySteps',
    'GetCascadeTrajectoryGeneratorMetadata',
    'HandleCascadeUserInteraction',
    'CancelCascadeInvocation',
    'DeleteCascadeTrajectory',
    'GetUserStatus',
    'GetProfileData',
    'GetWorkspaceFolders',
    'GetSettings',
    'UpdateSettings',
    'GetAvailableCascadePlugins',
    'InstallCascadePlugin',
    'UninstallCascadePlugin',
    'StartCascadeInvocation',
    'SendCascadeMessage',
]);

module.exports = function setupCascadeRoutes(app) {
    // Create a new cascade conversation
    app.post('/api/cascade/start', async (req, res) => {
        try {
            const inst = resolveInst(req);
            if (!inst) return res.status(503).json({ error: 'No language server connected' });
            const cascadeId = await startCascade(inst);
            registerCascadeInstance(cascadeId, inst);
            res.json({ cascadeId });
        } catch (e) { res.status(500).json({ error: e.message }); }
    });

    // Send a message to an existing cascade (non-blocking — fires stream, returns immediately)
    app.post('/api/cascade/send', async (req, res) => {
        try {
            const { cascadeId, message, modelId, images, imageBase64 } = req.body;
            if (!cascadeId || !message) {
                return res.status(400).json({ error: 'cascadeId and message are required' });
            }
            // Fire-and-forget: start the stream but don't await completion
            // Polling will pick up the AI's response steps in real-time
            const opts = { modelId };
            if (images && images.length > 0) {
                opts.media = images; // array of { mimeType, inlineData, uri, thumbnail }
            } else if (imageBase64) {
                opts.imageBase64 = imageBase64; // legacy single-image fallback
            }
            const inst = resolveInst(req);
            sendMessage(cascadeId, message, { ...opts, inst }).catch(e => console.error('[Cascade send error]', e.message));
            res.json({ ok: true, cascadeId });
        } catch (e) { res.status(500).json({ error: e.message }); }
    });

    // Start a new cascade and send a message (non-blocking)
    app.post('/api/cascade/submit', async (req, res) => {
        try {
            const { message, modelId, images, imageBase64 } = req.body;
            if (!message) {
                return res.status(400).json({ error: 'message is required' });
            }
            // Start cascade synchronously, then fire-and-forget the message
            const inst = resolveInst(req);
            const cascadeId = await startCascade(inst);
            registerCascadeInstance(cascadeId, inst);
            const opts = { modelId, inst };
            if (images && images.length > 0) {
                opts.media = images;
            } else if (imageBase64) {
                opts.imageBase64 = imageBase64;
            }
            sendMessage(cascadeId, message, opts).catch(e => console.error('[Cascade submit error]', e.message));
            res.json({ cascadeId });
        } catch (e) { res.status(500).json({ error: e.message }); }
    });

    // Cascade run status
    app.get('/api/cascade/:id/status', async (req, res) => {
        try {
            const inst = resolveInst(req);
            if (!inst) return res.status(503).json({ error: 'No language server connected' });
            const data = await callApi('GetAllCascadeTrajectories', {}, inst);
            const traj = data.trajectorySummaries?.[req.params.id];
            if (!traj) return res.status(404).json({ error: 'Cascade not found' });
            res.json({
                cascadeId: req.params.id,
                status: traj.status,
                stepCount: traj.stepCount,
                summary: traj.summary,
                lastModifiedTime: traj.lastModifiedTime,
            });
        } catch (e) { res.status(500).json({ error: e.message }); }
    });

    // Accept or reject pending code changes
    // HandleCascadeUserInteraction is a streaming RPC — use fire-and-forget
    // Searches ALL LS instances to find the one that owns this cascade
    app.post('/api/cascade/:id/accept', async (req, res) => {
        const { lsInstances } = require('../config');
        const cascadeId = req.params.id;
        const isReject = !!req.body?.reject;
        console.log(`[ManualInteract] ${isReject ? 'REJECT' : 'ACCEPT'} request for ${cascadeId.substring(0, 8)}, instances: ${lsInstances.length}`);
        try {
            for (const inst of lsInstances) {
                try {
                    const payload = await buildAcceptPayload(cascadeId, inst);
                    if (!payload) {
                        console.log(`[ManualInteract] Skip ${inst.workspaceName}:${inst.port} — no WAITING step`);
                        continue;
                    }

                    let body;
                    if (req.body?.interaction) {
                        body = { cascadeId, interaction: req.body.interaction };
                    } else if (isReject) {
                        // Build reject payload: flip allow to false, remove scope
                        const rejectInteraction = { ...payload.interaction };
                        if (rejectInteraction.filePermission) {
                            rejectInteraction.filePermission = {
                                absolutePathUri: rejectInteraction.filePermission.absolutePathUri,
                                // No 'allow' field and no 'scope' — LS treats this as reject
                            };
                        } else if (rejectInteraction.runCommand) {
                            rejectInteraction.runCommand = {
                                ...rejectInteraction.runCommand,
                                confirm: false,
                            };
                        } else if (rejectInteraction.codeAction) {
                            rejectInteraction.codeAction = { confirm: false };
                        } else if (rejectInteraction.sendCommandInput) {
                            rejectInteraction.sendCommandInput = {
                                ...rejectInteraction.sendCommandInput,
                                confirm: false,
                            };
                        } else {
                            rejectInteraction.confirm = false;
                        }
                        body = { cascadeId, interaction: rejectInteraction };
                        console.log(`[ManualInteract] Reject payload:`, JSON.stringify(body.interaction));
                    } else {
                        body = payload;
                    }

                    console.log(`[ManualInteract] >>> ${isReject ? 'Rejecting' : 'Accepting'} ${cascadeId.substring(0, 8)} on ${inst.workspaceName}:${inst.port}`);
                    const result = await callApiFireAndForgetOnInstance(inst, 'HandleCascadeUserInteraction', body);

                    if (result.ok) {
                        console.log(`[ManualInteract] +++ ${isReject ? 'REJECTED' : 'ACCEPTED'} via ${inst.workspaceName}`);
                        return res.json(result);
                    }
                    console.log(`[ManualInteract] --- FAILED on ${inst.workspaceName}: ${result.error || result.data}, trying next...`);
                } catch (e) {
                    console.log(`[ManualInteract] !!! Error on ${inst.workspaceName}: ${e.message}`);
                }
            }
            console.log(`[ManualInteract] No instance could ${isReject ? 'reject' : 'accept'} ${cascadeId.substring(0, 8)}`);
            res.status(404).json({ error: 'No WAITING step found on any LS instance' });
        } catch (e) { res.status(500).json({ error: e.message }); }
    });

    // Cancel active cascade invocation
    app.post('/api/cascade/:id/cancel', async (req, res) => {
        try {
            const inst = resolveInst(req);
            const result = await callApi('CancelCascadeInvocation', {
                cascadeId: req.params.id,
            }, inst);
            res.json(result);
        } catch (e) { res.status(500).json({ error: e.message }); }
    });

    // Auto-accept toggle (server-side, instant reaction)
    app.get('/api/auto-accept', (req, res) => {
        res.json({ enabled: getAutoAccept() });
    });
    app.post('/api/auto-accept', (req, res) => {
        const { enabled } = req.body || {};
        setAutoAccept(!!enabled);
        res.json({ enabled: getAutoAccept() });
    });

    // Token usage / generator metadata
    app.get('/api/cascade/:id/metadata', async (req, res) => {
        try {
            const inst = resolveInst(req);
            if (!inst) return res.status(503).json({ error: 'No language server connected' });
            res.json(await callApi('GetCascadeTrajectoryGeneratorMetadata', {
                cascadeId: req.params.id,
            }, inst));
        } catch (e) { res.status(500).json({ error: e.message }); }
    });

    // User profile + plan status data
    app.get('/api/user/profile', async (req, res) => {
        try {
            const inst = resolveInst(req);
            if (!inst) return res.status(503).json({ error: 'IDE not connected' });
            const [status, profile] = await Promise.all([
                callApi('GetUserStatus', {}, inst),
                callApi('GetProfileData', {}, inst)
            ]);
            res.json({
                user: status.userStatus || {},
                profilePicture: profile.profilePicture || null
            });
        } catch (e) { res.status(500).json({ error: e.message }); }
    });

    // Delete a cascade conversation
    app.delete('/api/cascade/:id', async (req, res) => {
        try {
            await callApi('DeleteCascadeTrajectory', { cascadeId: req.params.id }, resolveInst(req));
            const { cleanupCascade } = require('../cleanup');
            cleanupCascade(req.params.id);
            res.json({ success: true });
        } catch (e) { res.status(500).json({ error: e.message }); }
    });

    // Plugin management
    app.get('/api/plugins', async (req, res) => {
        try { res.json(await callApi('GetAvailableCascadePlugins', {}, resolveInst(req))); }
        catch (e) { res.status(500).json({ error: e.message }); }
    });
    app.post('/api/plugins/install', async (req, res) => {
        try { res.json(await callApi('InstallCascadePlugin', req.body, resolveInst(req))); }
        catch (e) { res.status(500).json({ error: e.message }); }
    });
    app.delete('/api/plugins/:id', async (req, res) => {
        try { res.json(await callApi('UninstallCascadePlugin', { pluginId: req.params.id }, resolveInst(req))); }
        catch (e) { res.status(500).json({ error: e.message }); }
    });

    // === Generic LS Proxy — call any method ===
    // Security: Method whitelist to prevent arbitrary LS method invocation
    app.post('/api/ls/:method', async (req, res) => {
        try {
            const method = req.params.method;
            
            // Validate method against whitelist
            if (!ALLOWED_LS_METHODS.has(method)) {
                return res.status(403).json({ 
                    error: 'Method not allowed',
                    hint: 'This LS method is not in the allowed list for security reasons'
                });
            }
            
            const inst = resolveInst(req);
            const result = await callApi(method, req.body || {}, inst);
            res.json(result);
        } catch (e) { res.status(500).json({ error: e.message }); }
    });
};
