// === Workspace Routes ===
// /api/workspaces/* (CRUD, resources, folders)

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');
const { getHub, ensureWorkspaceTracked, init } = require('../detector');
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

        // Case-insensitive URI match (Windows drive letters vary: file:///C:/ vs file:///c:/)
        const norm = u => decodeURIComponent(u || '').toLowerCase().replace(/\/+$/, '');
        const entries = fs.readdirSync(root, { withFileTypes: true })
            .filter(d => d.isDirectory() && !d.name.startsWith('.'))
            .map(d => {
                const fullPath = path.join(root, d.name);
                const uri = pathToFileUri(fullPath);
                const uriNorm = norm(uri);
                const matchIdx = lsInstances.findIndex(i => norm(i.workspaceFolderUri) === uriNorm);
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

        // Check if already tracked (matching workspace folder URI, case-insensitive —
        // Windows drive letters vary: file:///C:/ vs file:///c:/)
        const folderUri = pathToFileUri(folderPath);
        const norm = u => decodeURIComponent(u || '').toLowerCase().replace(/\/+$/, '');
        const existing = lsInstances.findIndex(i => norm(i.workspaceFolderUri) === norm(folderUri));
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

        // Best-effort: open the Antigravity IDE GUI on this folder (no wait). Antigravity
        // 2.0.11 uses a single shared "hub" LS, so the Deck works through the hub whether
        // or not the GUI is shown — we never block on a new per-workspace LS process.
        const launchIde = () => {
            try {
                if (platform === 'darwin') {
                    const child = spawn('open', ['-a', 'Antigravity', folderPath], { timeout: 10000, detached: true, stdio: 'ignore' });
                    child.on('error', (err) => console.error('[!] Failed to open Antigravity:', err.message));
                    child.unref();
                } else {
                    const child = spawn('antigravity', ['--trust-workspace', folderPath], { timeout: 10000, detached: true, stdio: 'ignore', shell: platform === 'win32' });
                    child.on('error', (err) => console.error('[!] Failed to launch antigravity:', err.message));
                    child.unref();
                }
            } catch (e) {
                console.error('[!] IDE launch error:', e.message);
            }
        };

        let hub = getHub();

        // Cold start: no hub yet → launch the IDE and wait for the hub to come up.
        if (!hub) {
            console.log('[*] No hub detected — launching Antigravity IDE and waiting for hub...');
            launchIde();
            const MAX_WAIT = 30000, POLL = 3000;
            let elapsed = 0;
            while (elapsed < MAX_WAIT && !hub) {
                await new Promise(r => setTimeout(r, POLL));
                elapsed += POLL;
                await init(() => { }); // re-detect hub
                hub = getHub();
                if (!hub) console.log(`[*] Waiting for hub... ${elapsed / 1000}s`);
            }
            if (!hub) {
                return res.json({ created: false, message: `Hub not detected after ${MAX_WAIT / 1000}s. Make sure Antigravity IDE is installed/running; auto-rescan will pick it up.` });
            }
        } else {
            // Hub already up — still open the GUI best-effort for the "Open with IDE" UX.
            console.log(`[*] Opening Antigravity IDE (best-effort): ${folderPath}`);
            launchIde();
        }

        // Track the workspace on the hub and register a virtual instance — no waiting.
        try {
            const inst = await ensureWorkspaceTracked(folderPath);
            const ws = inst
                ? { pid: inst.pid, workspaceName: inst.workspaceName, port: inst.port }
                : { pid: hub.pid, workspaceName: folderPath.split(/[/\\]/).filter(Boolean).pop(), port: hub.port };
            console.log(`[+] Workspace tracked on hub: ${ws.workspaceName} (${folderUri})`);
            return res.json({ created: true, workspace: ws });
        } catch (e) {
            console.error(`[!] AddTrackedWorkspace failed: ${e.message}`);
            return res.status(500).json({ created: false, error: `Failed to track workspace: ${e.message}` });
        }
    });

};
