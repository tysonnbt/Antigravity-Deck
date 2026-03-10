// === Express HTTP Routes ===
const https = require('https');
const { callApi, callApiOnInstance, callApiStream, callApiFireAndForget, callApiFireAndForgetOnInstance } = require('./api');
const { stepCache, getAutoAccept, setAutoAccept, buildAcceptPayload } = require('./cache');
const { startCascade, sendMessage, startAndSend } = require('./cascade');
const { getInstanceByName, getFirstActiveInstance } = require('./detector');
const { getInstanceForCascade, registerCascadeInstance } = require('./poller');

// Helper: construct file:// URI from filesystem path (cross-platform)
function pathToFileUri(fsPath) {
    const normalized = fsPath.replace(/\\/g, '/');
    // macOS/Linux paths start with /, Windows paths start with drive letter
    return normalized.startsWith('/')
        ? 'file://' + normalized     // /Users/... → file:///Users/...
        : 'file:///' + normalized;   // C:/Users/... → file:///C:/Users/...
}

// Helper: clear step cache
function clearCache() {
    const keys = Object.keys(stepCache);
    keys.forEach(k => delete stepCache[k]);
    return keys.length;
}

function setupRoutes(app) {
    // Public config — no auth required, used by FE to discover WS URL at runtime
    app.get('/api/ws-url', (req, res) => {
        const port = process.env.PORT || 3500;
        res.json({ wsPort: Number(port) });
    });

    // Status
    app.get('/api/status', (req, res) => {
        const { lsInstances } = require('./config');
        const firstInst = lsInstances[0];
        res.json({ detected: lsInstances.length > 0, port: firstInst?.port || null });
    });

    // Clear cache for a specific conversation
    app.delete('/api/cache/:id', (req, res) => {
        const cascadeId = req.params.id;
        if (stepCache[cascadeId]) {
            delete stepCache[cascadeId];
            console.log(`[Cache] Cleared cache for ${cascadeId.substring(0, 8)}`);
            res.json({ cleared: true });
        } else {
            res.json({ cleared: false, message: 'Not cached' });
        }
    });

    // --- Settings ---
    app.get('/api/settings', (req, res) => {
        const { getSettings } = require('./config');
        res.json(getSettings());
    });

    app.post('/api/settings', (req, res) => {
        const { saveSettings } = require('./config');
        const updated = saveSettings(req.body);
        console.log(`[*] Settings updated:`, JSON.stringify(updated));
        res.json(updated);
    });

    // Workspace list — all detected LS instances
    app.get('/api/workspaces', (req, res) => {
        const { lsInstances } = require('./config');
        res.json(lsInstances.map((inst) => ({
            pid: inst.pid,
            workspaceId: inst.workspaceId,
            workspaceName: inst.workspaceName,
            workspaceFolderUri: inst.workspaceFolderUri || '',
            category: inst.category || 'workspace',
            port: inst.port,
        })));
    });

    // List folders in the default workspace root (available workspaces)
    app.get('/api/workspaces/folders', (req, res) => {
        const fs = require('fs');
        const path = require('path');
        const { lsInstances, getSettings } = require('./config');
        const settings = getSettings();
        const root = settings.defaultWorkspaceRoot;

        if (!fs.existsSync(root)) {
            return res.json({ root, folders: [] });
        }

        const openUris = new Set(lsInstances.map(i => i.workspaceFolderUri));
        const entries = fs.readdirSync(root, { withFileTypes: true })
            .filter(d => d.isDirectory() && !d.name.startsWith('.'))
            .map(d => {
                const fullPath = path.join(root, d.name);
                const uri = pathToFileUri(fullPath);
                const matchIdx = lsInstances.findIndex(i => i.workspaceFolderUri === uri);
                return {
                    name: d.name,
                    path: fullPath,
                    uri,
                    open: matchIdx >= 0,
                    wsName: matchIdx >= 0 ? lsInstances[matchIdx].workspaceName : null,
                };
            })
            .sort((a, b) => a.name.localeCompare(b.name));

        res.json({ root, folders: entries });
    });

    // --- resolveInst: determine which LS instance to route a request to ---
    function resolveInst(req) {
        // 1. By cascade ID (existing cascades)
        const cascadeId = req.params.id || req.body?.cascadeId;
        if (cascadeId) {
            const inst = getInstanceForCascade(cascadeId);
            if (inst) return inst;
        }
        // 2. By workspace name (query/body/param)
        const wsName = req.query.workspace || req.body?.workspace || req.params.name;
        if (wsName) {
            const inst = getInstanceByName(decodeURIComponent(wsName));
            if (inst) return inst;
        }
        // 3. Fallback to first active
        return getFirstActiveInstance();
    }


    // Create/open a workspace — accepts { path } or { name }
    // If name is given, resolves to defaultWorkspaceRoot/<name>
    app.post('/api/workspaces/create', async (req, res) => {
        const { exec } = require('child_process');
        const fs = require('fs');
        const path = require('path');
        const { lsInstances, getSettings } = require('./config');
        const { detectLanguageServers, detectPorts, findApiPort } = require('./detector');

        let folderPath = req.body.path;
        const name = req.body.name;

        // If name is given, resolve to root + name
        if (!folderPath && name) {
            const settings = getSettings();
            const root = settings.defaultWorkspaceRoot;
            // Ensure root exists
            if (!fs.existsSync(root)) {
                fs.mkdirSync(root, { recursive: true });
                console.log(`[*] Created workspace root: ${root}`);
            }
            folderPath = path.join(root, name);
        }

        if (!folderPath) return res.status(400).json({ error: 'path or name is required' });

        // Create folder if it doesn't exist
        if (!fs.existsSync(folderPath)) {
            fs.mkdirSync(folderPath, { recursive: true });
            console.log(`[*] Created workspace folder: ${folderPath}`);
        }

        // Check if already open (matching workspace folder URI)
        const folderUri = pathToFileUri(folderPath);
        const existing = lsInstances.findIndex(i => i.workspaceFolderUri === folderUri);
        if (existing >= 0) {
            console.log(`[*] Workspace already open: ${folderPath}`);
            return res.json({
                created: false,
                alreadyOpen: true,
                workspace: {
                    pid: lsInstances[existing].pid,
                    workspaceName: lsInstances[existing].workspaceName,
                    port: lsInstances[existing].port
                }
            });
        }

        // Remember current PIDs, then launch IDE
        const beforePids = new Set(lsInstances.map(i => i.pid));
        console.log(`[*] Opening Antigravity IDE: ${folderPath}`);
        const { platform } = require('./config');
        if (platform === 'darwin') {
            // Try Antigravity first, then Windsurf (name may vary by install)
            exec(`open -a "Antigravity" "${folderPath}" 2>/dev/null || open -a "Windsurf" "${folderPath}"`, { timeout: 10000 });
        } else {
            exec(`antigravity --trust-workspace "${folderPath}"`, { timeout: 10000 });
        }

        // Poll for new LS instance (up to 30s)
        const MAX_WAIT = 30000;
        const POLL = 3000;
        let elapsed = 0;
        let found = null;

        while (elapsed < MAX_WAIT) {
            await new Promise(r => setTimeout(r, POLL));
            elapsed += POLL;

            const instances = await detectLanguageServers();
            for (const inst of instances) {
                if (beforePids.has(inst.pid)) continue; // already known
                const ports = await detectPorts(inst.pid);
                if (!ports.length) continue;
                const result = await findApiPort(ports, inst.csrfToken);
                if (result) {
                    const name = inst.workspaceId
                        ? inst.workspaceId.replace(/^file_.*_Projects_/, '').split('_').pop()
                        : folderPath.split(/[/\\]/).pop();
                    const folderUri = pathToFileUri(folderPath);
                    found = {
                        pid: inst.pid,
                        csrfToken: inst.csrfToken,
                        workspaceId: inst.workspaceId,
                        workspaceName: name,
                        workspaceFolderUri: folderUri,
                        port: result.port,
                        useTls: result.useTls,
                        active: false
                    };
                    lsInstances.push(found);

                    // Tell the LS about its workspace folder so cascades get bound to it
                    // Field must be 'workspace' with a plain path (not file:// URI)
                    try {
                        const protocol = result.useTls ? 'https' : 'http';
                        const host = result.useTls ? '127.0.0.1' : 'localhost';
                        const plainPath = folderPath.replace(/\\/g, '/');
                        const addWsOpts = {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/json',
                                'Connect-Protocol-Version': '1',
                                'X-Codeium-Csrf-Token': inst.csrfToken
                            },
                            body: JSON.stringify({ workspace: plainPath }),
                            signal: AbortSignal.timeout(5000)
                        };
                        if (result.useTls) addWsOpts.agent = new (require('https').Agent)({ rejectUnauthorized: false });
                        await fetch(`${protocol}://${host}:${result.port}/exa.language_server_pb.LanguageServerService/AddTrackedWorkspace`, addWsOpts);
                        console.log(`[+] Bound workspace folder: ${plainPath}`);
                    } catch (e) {
                        console.log(`[!] AddTrackedWorkspace failed: ${e.message}`);
                    }

                    console.log(`[+] Workspace created: ${name} (PID: ${inst.pid}, Port: ${result.port})`);
                    break;
                }
            }
            if (found) break;
            console.log(`[*] Waiting for LS... ${elapsed / 1000}s`);
        }

        if (found) {
            res.json({
                created: true,
                workspace: {
                    pid: found.pid,
                    workspaceName: found.workspaceName,
                    port: found.port
                }
            });
        } else {
            res.json({ created: false, message: `LS not detected after ${MAX_WAIT / 1000}s. Auto-rescan will pick it up later.` });
        }
    });

    // Conversations for a specific workspace (filtered by workspace URI)
    app.get('/api/workspaces/:name/conversations', async (req, res) => {
        const inst = getInstanceByName(decodeURIComponent(req.params.name));
        if (!inst) return res.status(400).json({ error: 'Unknown workspace' });

        try {
            // Get all trajectories from this LS instance
            const trajData = await callApiOnInstance(inst, 'GetAllCascadeTrajectories');

            // Filter: only keep cascades whose workspace URI matches this instance
            if (inst.workspaceFolderUri && trajData.trajectorySummaries) {
                const wsUri = inst.workspaceFolderUri;
                const filtered = {};
                for (const [id, info] of Object.entries(trajData.trajectorySummaries)) {
                    const cascadeWsUris = (info.workspaces || []).map(w => w.workspaceFolderAbsoluteUri);
                    if (cascadeWsUris.some(uri => uri === wsUri)) {
                        filtered[id] = info;
                    }
                }
                trajData.trajectorySummaries = filtered;
            }

            res.json(trajData);
        } catch (e) { res.status(500).json({ error: e.message }); }
    });

    // === Git Source Control endpoints ===
    // Helper: convert workspaceFolderUri to filesystem path
    function uriToFsPath(uri) {
        if (!uri) return null;
        try {
            const url = new URL(uri);
            let p = decodeURIComponent(url.pathname);
            if (process.platform === 'win32' && /^\/[a-zA-Z]:/.test(p)) p = p.substring(1);
            return p;
        } catch { return null; }
    }

    // Git status: list changed files with stats
    app.get('/api/workspaces/:name/git/status', (req, res) => {
        const { execSync } = require('child_process');
        const inst = getInstanceByName(decodeURIComponent(req.params.name));
        if (!inst) return res.status(400).json({ error: 'Unknown workspace' });
        const cwd = uriToFsPath(inst.workspaceFolderUri);
        if (!cwd) return res.status(400).json({ error: 'No workspace folder' });

        try {
            try { execSync('git rev-parse --is-inside-work-tree', { cwd, encoding: 'utf-8' }); }
            catch { return res.json({ files: [], error: 'Not a git repository' }); }

            const porcelain = execSync('git status --porcelain', { cwd, encoding: 'utf-8', maxBuffer: 5 * 1024 * 1024 }).trim();
            if (!porcelain) return res.json({ files: [] });

            let numstatMap = {};
            try {
                const numstat = execSync('git diff --numstat', { cwd, encoding: 'utf-8', maxBuffer: 5 * 1024 * 1024 }).trim();
                numstat.split('\n').forEach(line => {
                    const [add, del, file] = line.split('\t');
                    if (file) numstatMap[file] = { additions: parseInt(add) || 0, deletions: parseInt(del) || 0 };
                });
            } catch { }

            const statusMap = { 'M': 'modified', 'A': 'added', 'D': 'deleted', '??': 'untracked', 'R': 'renamed', 'C': 'copied' };
            const files = porcelain.split('\n').filter(Boolean).map(line => {
                const status = line.substring(0, 2).trim();
                const filePath = line.substring(2).trimStart();
                return {
                    path: filePath,
                    status: statusMap[status] || status,
                    statusCode: status,
                    additions: numstatMap[filePath]?.additions || 0,
                    deletions: numstatMap[filePath]?.deletions || 0,
                };
            });
            res.json({ files });
        } catch (e) { res.status(500).json({ error: e.message }); }
    });

    // Git diff: unified diff (all files or specific file)
    app.get('/api/workspaces/:name/git/diff', (req, res) => {
        const { execSync } = require('child_process');
        const inst = getInstanceByName(decodeURIComponent(req.params.name));
        if (!inst) return res.status(400).json({ error: 'Unknown workspace' });
        const cwd = uriToFsPath(inst.workspaceFolderUri);
        if (!cwd) return res.status(400).json({ error: 'No workspace folder' });

        try {
            const file = req.query.file;
            const cmd = file ? `git diff -- "${file}"` : 'git diff';
            const diff = execSync(cmd, { cwd, encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 });
            res.json({ diff });
        } catch (e) { res.status(500).json({ error: e.message }); }
    });

    // Git show: original file content from HEAD
    app.get('/api/workspaces/:name/git/show', (req, res) => {
        const { execSync } = require('child_process');
        const inst = getInstanceByName(decodeURIComponent(req.params.name));
        if (!inst) return res.status(400).json({ error: 'Unknown workspace' });
        const cwd = uriToFsPath(inst.workspaceFolderUri);
        if (!cwd) return res.status(400).json({ error: 'No workspace folder' });
        const file = req.query.file;
        if (!file) return res.status(400).json({ error: 'file parameter required' });

        try {
            const content = execSync(`git show HEAD:"${file}"`, { cwd, encoding: 'utf-8', maxBuffer: 10 * 1024 * 1024 });
            res.json({ content });
        } catch (e) {
            if (e.stderr?.includes('does not exist') || e.stderr?.includes('not exist') || e.status) {
                return res.json({ content: null, error: 'File not in HEAD (new file)' });
            }
            res.status(500).json({ error: e.message });
        }
    });

    // Read current file from workspace (working tree, not git HEAD)
    app.get('/api/workspaces/:name/file/read', (req, res) => {
        const path = require('path');
        const fs = require('fs');
        const inst = getInstanceByName(decodeURIComponent(req.params.name));
        if (!inst) return res.status(400).json({ error: 'Unknown workspace' });
        const cwd = uriToFsPath(inst.workspaceFolderUri);
        if (!cwd) return res.status(400).json({ error: 'No workspace folder' });
        const file = req.query.file;
        if (!file) return res.status(400).json({ error: 'file parameter required' });

        // Reject path traversal attempts
        if (file.includes('..')) {
            return res.status(403).json({ error: 'Access denied: path traversal not allowed' });
        }

        try {
            const fullPath = path.resolve(cwd, file);
            const normalizedCwd = path.resolve(cwd);
            // Security: ensure the file is within the workspace (case-insensitive on Windows)
            const isInside = process.platform === 'win32'
                ? fullPath.toLowerCase().startsWith(normalizedCwd.toLowerCase())
                : fullPath.startsWith(normalizedCwd);
            if (!isInside) {
                return res.status(403).json({ error: 'Access denied: path outside workspace' });
            }
            const content = fs.readFileSync(fullPath, 'utf-8');
            res.json({ content, path: file });
        } catch (e) {
            if (e.code === 'ENOENT') {
                return res.json({ content: null, error: 'File not found' });
            }
            res.status(500).json({ error: e.message });
        }
    });

    // List files/dirs in workspace (for File Explorer)
    app.get('/api/workspaces/:name/fs/list', (req, res) => {
        const path = require('path');
        const fs = require('fs');
        const inst = getInstanceByName(decodeURIComponent(req.params.name));
        if (!inst) return res.status(400).json({ error: 'Unknown workspace' });
        const cwd = uriToFsPath(inst.workspaceFolderUri);
        if (!cwd) return res.status(400).json({ error: 'No workspace folder' });

        const subpath = req.query.path || '';
        const showHidden = req.query.showHidden === 'true';

        // Prevent path traversal
        if (subpath.includes('..')) {
            return res.status(403).json({ error: 'Access denied: path traversal not allowed' });
        }

        try {
            const fullPath = path.resolve(cwd, subpath);
            const normalizedCwd = path.resolve(cwd);
            const isInside = process.platform === 'win32'
                ? fullPath.toLowerCase().startsWith(normalizedCwd.toLowerCase())
                : fullPath.startsWith(normalizedCwd);
            if (!isInside) {
                return res.status(403).json({ error: 'Access denied: path outside workspace' });
            }

            // Hidden dirs to skip (always)
            const SKIP_DIRS = new Set(['node_modules', '.git', '.next', 'dist', 'build', '__pycache__', '.cache']);

            const dirents = fs.readdirSync(fullPath, { withFileTypes: true });
            const entries = dirents
                .filter(d => {
                    if (!showHidden && d.name.startsWith('.')) return false;
                    if (d.isDirectory() && SKIP_DIRS.has(d.name)) return false;
                    return true;
                })
                .map(d => {
                    const entry = { name: d.name, type: d.isDirectory() ? 'dir' : 'file' };
                    if (!d.isDirectory()) {
                        const ext = path.extname(d.name).toLowerCase().slice(1);
                        entry.ext = ext || '';
                        try {
                            const stat = fs.statSync(path.join(fullPath, d.name));
                            entry.size = stat.size;
                        } catch { entry.size = 0; }
                    }
                    return entry;
                })
                .sort((a, b) => {
                    if (a.type !== b.type) return a.type === 'dir' ? -1 : 1;
                    return a.name.localeCompare(b.name);
                });

            res.json({ entries, path: subpath });
        } catch (e) {
            if (e.code === 'ENOENT') return res.status(404).json({ error: 'Path not found' });
            res.status(500).json({ error: e.message });
        }
    });

    // Available models for cascade
    app.get('/api/models', async (req, res) => {
        try {
            const data = await callApi('GetCascadeModelConfigData', {}, resolveInst(req));
            const models = (data.clientModelConfigs || []).map(m => ({
                label: m.label,
                modelId: m.modelOrAlias?.model || m.modelOrAlias?.alias || '',
                supportsImages: !!m.supportsImages,
                isRecommended: !!m.isRecommended,
                quota: m.quotaInfo?.remainingFraction ?? 1,
            }));
            const defaultModel = data.defaultOverrideModelConfig?.modelOrAlias?.model || '';
            res.json({ models, defaultModel });
        } catch (e) { res.status(500).json({ error: e.message }); }
    });

    // Conversations list — merge from ALL LS instances
    app.get('/api/conversations', async (req, res) => {
        try {
            const { lsInstances } = require('./config');
            const merged = { trajectorySummaries: {} };
            for (const inst of lsInstances) {
                try {
                    const data = await callApiOnInstance(inst, 'GetAllCascadeTrajectories');
                    if (data?.trajectorySummaries) {
                        Object.assign(merged.trajectorySummaries, data.trajectorySummaries);
                    }
                } catch { }
            }
            res.json(merged);
        }
        catch (e) { res.status(500).json({ error: e.message }); }
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
            delete stepCache[id];
            console.log(`[*] Cache cleared for ${id.substring(0, 8)}`);
            res.json({ cleared: true, id });
        } else {
            res.json({ cleared: false, id, message: 'not cached' });
        }
    });

    // === File Read (for rendering artifacts like .md files) ===
    app.get('/api/file/read', async (req, res) => {
        try {
            let filePath = req.query.path;
            if (!filePath) return res.status(400).json({ error: 'path query parameter is required' });
            // Support file:/// URIs
            if (filePath.startsWith('file:///')) {
                try { filePath = decodeURIComponent(new URL(filePath).pathname); } catch { filePath = decodeURIComponent(filePath.replace('file://', '')); }
                // Windows: /C:/Users/... → C:/Users/...
                if (/^\/[a-zA-Z]:/.test(filePath)) filePath = filePath.substring(1);
            }
            // Security: only allow reading from .gemini/antigravity/brain paths
            const normalized = require('path').resolve(filePath);
            if (!normalized.includes('.gemini')) {
                return res.status(403).json({ error: 'Access denied — only .gemini paths allowed' });
            }
            const fs = require('fs');
            if (!fs.existsSync(normalized)) return res.status(404).json({ error: 'File not found' });
            const content = fs.readFileSync(normalized, 'utf-8');
            res.json({ path: normalized, content });
        } catch (e) { res.status(500).json({ error: e.message }); }
    });

    // === Media Upload (SaveMediaAsArtifact proxy) ===
    app.post('/api/media/save', async (req, res) => {
        try {
            const { mimeType, inlineData, thumbnail } = req.body;
            if (!inlineData) return res.status(400).json({ error: 'inlineData is required' });
            const inst = resolveInst(req);
            const result = await callApi('SaveMediaAsArtifact', {
                media: { mimeType: mimeType || 'image/png', inlineData, thumbnail: thumbnail || '' }
            }, inst);
            res.json(result);
        } catch (e) { res.status(500).json({ error: e.message }); }
    });

    // === Cascade Submit Endpoints ===

    // Create a new cascade conversation
    app.post('/api/cascade/start', async (req, res) => {
        try {
            const inst = resolveInst(req);
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

    // === Gateway API Endpoints (for external LLM agents) ===

    // Cascade run status
    app.get('/api/cascade/:id/status', async (req, res) => {
        try {
            const inst = resolveInst(req);
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
        const { lsInstances } = require('./config');
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
            res.json(await callApi('GetCascadeTrajectoryGeneratorMetadata', {
                cascadeId: req.params.id,
            }, resolveInst(req)));
        } catch (e) { res.status(500).json({ error: e.message }); }
    });

    // User profile + plan status data
    app.get('/api/user/profile', async (req, res) => {
        try {
            const inst = resolveInst(req);
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
            delete stepCache[req.params.id];
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
    app.post('/api/ls/:method', async (req, res) => {
        try {
            const inst = resolveInst(req);
            const result = await callApi(req.params.method, req.body || {}, inst);
            res.json(result);
        } catch (e) { res.status(500).json({ error: e.message }); }
    });
    // === File read — for artifact/review file preview ===
    // Uses POST to avoid Cloudflare WAF blocking file:// URIs in query params
    // Security: restricts reads to workspace root and active workspace folders only
    // Defenses: path.resolve (traversal), realpathSync (symlink), allowedRoots whitelist
    app.post('/api/file/read', async (req, res) => {
        try {
            const fs = require('fs');
            const path = require('path');
            let filePath = typeof req.body?.path === 'string' ? req.body.path : '';
            // Handle file:// URIs
            if (filePath.startsWith('file:///')) {
                try { filePath = decodeURIComponent(new URL(filePath).pathname); } catch { filePath = decodeURIComponent(filePath.replace('file://', '')); }
                // Windows: /C:/Users/... → C:/Users/...
                if (/^\/[a-zA-Z]:/.test(filePath)) filePath = filePath.substring(1);
            }
            if (!filePath) return res.status(400).json({ error: 'Missing path parameter' });

            // Resolve to absolute path — prevents ../ traversal
            const normalized = path.resolve(filePath);

            // Build allowed roots: workspace root + all active workspace folders
            const { lsInstances, getSettings } = require('./config');
            const settings = getSettings();
            const allowedRoots = [];
            // 1. Default workspace root from settings
            if (settings.defaultWorkspaceRoot) {
                allowedRoots.push(path.resolve(settings.defaultWorkspaceRoot));
            }
            // 2. All active workspace folder paths
            for (const inst of lsInstances) {
                if (inst.workspaceFolderUri) {
                    const wsPath = uriToFsPath(inst.workspaceFolderUri);
                    if (wsPath) allowedRoots.push(path.resolve(wsPath));
                }
            }

            // Deny if no workspace roots configured — nothing to allow
            if (allowedRoots.length === 0) {
                return res.status(403).json({ error: 'Access denied — no workspace configured' });
            }

            // File must exist before symlink resolution
            if (!fs.existsSync(normalized)) return res.status(404).json({ error: 'File not found' });

            // Resolve symlinks to real path — prevents symlink-to-outside-workspace bypass
            const realPath = fs.realpathSync(normalized);

            // Check: real path must be inside an allowed workspace root
            // .gemini/ paths are allowed only when inside a workspace root (not arbitrary .gemini dirs)
            const isAllowed = allowedRoots.some(root =>
                realPath.startsWith(root + path.sep) || realPath === root
            );

            if (!isAllowed) {
                return res.status(403).json({ error: 'Access denied — path outside workspace' });
            }

            const content = fs.readFileSync(realPath, 'utf-8');
            res.json({ content, path: realPath });
        } catch (e) { res.status(500).json({ error: e.message }); }
    });

    // ── Workflows (slash commands from Antigravity IDE) ─────────────────────

    // GET /api/workflows — list all available workflow files
    app.get('/api/workflows', (req, res) => {
        const fs = require('fs');
        const path = require('path');
        const os = require('os');

        const workflows = [];

        // Parse YAML frontmatter description from .md content
        function parseDescription(content) {
            const fm = content.match(/^---\s*\n([\s\S]*?)\n---/);
            if (fm) {
                const descMatch = fm[1].match(/description:\s*(.+)/);
                if (descMatch) return descMatch[1].trim();
            }
            // Fallback: first heading
            const heading = content.match(/^#\s+(.+)/m);
            return heading ? heading[1].trim() : '';
        }

        // 1. Scan global workflows
        const globalDir = path.join(os.homedir(), '.gemini', 'antigravity', 'global_workflows');
        if (fs.existsSync(globalDir)) {
            try {
                const files = fs.readdirSync(globalDir).filter(f => f.endsWith('.md'));
                for (const file of files) {
                    try {
                        const content = fs.readFileSync(path.join(globalDir, file), 'utf-8');
                        const name = path.basename(file, '.md');
                        workflows.push({
                            slash: `/${name}`,
                            label: name.charAt(0).toUpperCase() + name.slice(1).replace(/[-_]/g, ' '),
                            description: parseDescription(content),
                            source: 'global',
                        });
                    } catch { /* skip unreadable files */ }
                }
            } catch { /* dir not readable */ }
        }

        // 2. Scan per-workspace workflows if workspace param given
        const wsName = req.query.workspace;
        if (wsName) {
            const inst = getInstanceByName(decodeURIComponent(wsName));
            if (inst?.workspaceFolderUri) {
                const wsPath = uriToFsPath(inst.workspaceFolderUri);
                if (wsPath) {
                    const wsWorkflowDir = path.join(wsPath, '.agent', 'workflows');
                    if (fs.existsSync(wsWorkflowDir)) {
                        try {
                            const files = fs.readdirSync(wsWorkflowDir).filter(f => f.endsWith('.md'));
                            for (const file of files) {
                                try {
                                    const content = fs.readFileSync(path.join(wsWorkflowDir, file), 'utf-8');
                                    const name = path.basename(file, '.md');
                                    // Skip if global already has same name
                                    if (!workflows.some(w => w.slash === `/${name}`)) {
                                        workflows.push({
                                            slash: `/${name}`,
                                            label: name.charAt(0).toUpperCase() + name.slice(1).replace(/[-_]/g, ' '),
                                            description: parseDescription(content),
                                            source: 'workspace',
                                        });
                                    }
                                } catch { }
                            }
                        } catch { }
                    }
                }
            }
        }

        workflows.sort((a, b) => a.slash.localeCompare(b.slash));
        res.json(workflows);
    });

    // GET /api/workflows/:name — read full content of a workflow file
    app.get('/api/workflows/:name', (req, res) => {
        const fs = require('fs');
        const path = require('path');
        const os = require('os');

        const name = req.params.name.replace(/[^a-zA-Z0-9_-]/g, ''); // sanitize
        if (!name) return res.status(400).json({ error: 'Invalid workflow name' });

        // Check workspace-specific first, then global
        const wsName = req.query.workspace;
        if (wsName) {
            const inst = getInstanceByName(decodeURIComponent(wsName));
            if (inst?.workspaceFolderUri) {
                const wsPath = uriToFsPath(inst.workspaceFolderUri);
                if (wsPath) {
                    const wsFile = path.join(wsPath, '.agent', 'workflows', `${name}.md`);
                    if (fs.existsSync(wsFile)) {
                        return res.json({ name, content: fs.readFileSync(wsFile, 'utf-8'), source: 'workspace' });
                    }
                }
            }
        }

        // Global
        const globalFile = path.join(os.homedir(), '.gemini', 'antigravity', 'global_workflows', `${name}.md`);
        if (fs.existsSync(globalFile)) {
            return res.json({ name, content: fs.readFileSync(globalFile, 'utf-8'), source: 'global' });
        }

        res.status(404).json({ error: `Workflow "${name}" not found` });
    });

    // ── Agent Bridge ────────────────────────────────────────────────────────

    const bridge = require('./agent-bridge');

    app.post('/api/agent-bridge/start', async (req, res) => {
        try {
            const status = await bridge.startBridge(req.body || {});
            res.json({ ok: true, ...status });
        } catch (e) {
            res.status(400).json({ ok: false, error: e.message });
        }
    });

    app.post('/api/agent-bridge/stop', (req, res) => {
        bridge.stopBridge();
        res.json({ ok: true });
    });

    app.get('/api/agent-bridge/status', (req, res) => {
        res.json(bridge.getStatus());
    });
}

module.exports = { setupRoutes };

