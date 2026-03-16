// === Workspace Routes ===
// /api/workspaces/* (CRUD, headless, resources, folders)

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { detectLanguageServers, detectPorts, findApiPort } = require('../detector');
const { launchHeadlessLS, getHeadlessInstances, killHeadlessLS } = require('../headless-ls');
const { getResourceSnapshot } = require('../resource-monitor');
const { pathToFileUri, validateWorkspacePath } = require('./route-helpers');

module.exports = function setupWorkspacesRoutes(app) {
    // ⚠️ Route order IMPORTANT: static routes before parameterized

    // List folders in the default workspace root (available workspaces)
    app.get('/api/workspaces/folders', (req, res) => {
        const { lsInstances, getSettings } = require('../config');
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

        res.json({ root, folders: entries, suggestedWorkspaceRoot: settings.suggestedWorkspaceRoot || '' });
    });

    // Resource usage snapshot for all workspace PIDs
    app.get('/api/workspaces/resources', (req, res) => {
        res.json(getResourceSnapshot());
    });

    // List headless LS instances — static, before /headless/:pid
    app.get('/api/workspaces/headless', (req, res) => {
        res.json(getHeadlessInstances());
    });

    // Workspace list — all detected LS instances
    app.get('/api/workspaces', (req, res) => {
        const { lsInstances } = require('../config');
        res.json(lsInstances.map((inst) => ({
            pid: inst.pid,
            workspaceId: inst.workspaceId,
            workspaceName: inst.workspaceName,
            workspaceFolderUri: inst.workspaceFolderUri || '',
            category: inst.category || 'workspace',
            port: inst.port,
            headless: !!inst.headless,
        })));
    });

    // Create/open a workspace — accepts { path } or { name }
    // If name is given, resolves to defaultWorkspaceRoot/<name>
    app.post('/api/workspaces/create', async (req, res) => {
        const { lsInstances, getSettings, platform } = require('../config');

        let folderPath = req.body.path;
        const name = req.body.name;

        // If name is given, resolve to root + name
        if (!folderPath && name) {
            const settings = getSettings();
            const root = settings.defaultWorkspaceRoot;
            if (!root) {
                return res.status(400).json({ error: 'defaultWorkspaceRoot is not configured — set it in Settings first' });
            }
            // Ensure root exists
            if (!fs.existsSync(root)) {
                fs.mkdirSync(root, { recursive: true });
                console.log(`[*] Created workspace root: ${root}`);
            }
            folderPath = path.join(root, name);
        }

        if (!folderPath) {
            return res.status(400).json({ error: 'path or name is required, and defaultWorkspaceRoot must be configured' });
        }

        // Validate path to prevent command injection
        try {
            folderPath = validateWorkspacePath(folderPath);
        } catch (error) {
            return res.status(400).json({ error: error.message });
        }

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
        if (platform === 'darwin') {
            // Try Antigravity first using spawn (no shell = no command injection)
            const child = spawn('open', ['-a', 'Antigravity', folderPath], {
                timeout: 10000,
                detached: true,
                stdio: 'ignore'
            });

            child.on('error', (err) => {
                console.error('[!] Failed to open Antigravity:', err.message);
            });

            child.on('exit', (code) => {
                if (code !== 0 && code !== null) {
                    console.error(`[!] Antigravity exited with code ${code}`);
                }
            });

            child.unref();
        } else {
            // Windows/Linux: use spawn with shell:true on Windows (.cmd files need shell)
            const child = spawn('antigravity', ['--trust-workspace', folderPath], {
                timeout: 10000,
                detached: true,
                stdio: 'ignore',
                shell: platform === 'win32', // Windows .cmd files require shell
            });

            child.on('error', (err) => {
                console.error('[!] Failed to launch antigravity:', err.message);
                // Don't crash the server, just log the error
            });

            child.unref();
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

    // Create a headless LS instance (no IDE UI) — requires running IDE for auth
    app.post('/api/workspaces/create-headless', async (req, res) => {
        const { getSettings } = require('../config');

        let folderPath = req.body.path;
        const name = req.body.name;

        // Same path/name resolution as /api/workspaces/create
        if (!folderPath && name) {
            const settings = getSettings();
            const root = settings.defaultWorkspaceRoot;
            if (!fs.existsSync(root)) {
                fs.mkdirSync(root, { recursive: true });
            }
            folderPath = path.join(root, name);
        }

        if (!folderPath) {
            return res.status(400).json({ error: 'path or name is required, and defaultWorkspaceRoot must be configured' });
        }

        try {
            folderPath = validateWorkspacePath(folderPath);
        } catch (error) {
            return res.status(400).json({ error: error.message });
        }

        try {
            const result = await launchHeadlessLS(folderPath);
            res.json(result);
        } catch (e) {
            console.error(`[Headless] Launch failed: ${e.message}`);
            res.status(500).json({ error: e.message });
        }
    });

    // Kill a headless LS instance — parameterized, AFTER static headless route
    app.delete('/api/workspaces/headless/:pid', (req, res) => {
        try {
            const result = killHeadlessLS(req.params.pid);
            res.json(result);
        } catch (e) {
            res.status(400).json({ error: e.message });
        }
    });
};
