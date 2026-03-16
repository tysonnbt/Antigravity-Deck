// === Git Routes ===
// /api/workspaces/:name/git/*, /api/workspaces/:name/file/read, /api/workspaces/:name/fs/list

const { getInstanceByName } = require('../detector');
const { execGitSafe, validateGitPath, uriToFsPath } = require('./route-helpers');

module.exports = function setupGitRoutes(app) {
    // Git status: list changed files with stats
    app.get('/api/workspaces/:name/git/status', async (req, res) => {
        const inst = getInstanceByName(decodeURIComponent(req.params.name));
        if (!inst) return res.status(400).json({ error: 'Unknown workspace' });
        const cwd = uriToFsPath(inst.workspaceFolderUri);
        if (!cwd) return res.status(400).json({ error: 'No workspace folder' });

        try {
            // Check if it's a git repository
            try {
                await execGitSafe(['rev-parse', '--is-inside-work-tree'], cwd);
            } catch {
                return res.json({ files: [], error: 'Not a git repository' });
            }

            const porcelain = (await execGitSafe(['status', '--porcelain'], cwd)).trim();
            if (!porcelain) return res.json({ files: [] });

            let numstatMap = {};
            try {
                const numstat = (await execGitSafe(['diff', '--numstat'], cwd)).trim();
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
        } catch (e) {
            if (e.message === 'OUTPUT_LIMIT_EXCEEDED') {
                return res.status(413).json({ error: 'Output too large' });
            }
            res.status(500).json({ error: e.message });
        }
    });

    // Git diff: unified diff (all files or specific file)
    app.get('/api/workspaces/:name/git/diff', async (req, res) => {
        const inst = getInstanceByName(decodeURIComponent(req.params.name));
        if (!inst) return res.status(400).json({ error: 'Unknown workspace' });
        const cwd = uriToFsPath(inst.workspaceFolderUri);
        if (!cwd) return res.status(400).json({ error: 'No workspace folder' });

        try {
            const file = req.query.file;
            let args;
            if (file) {
                const validated = validateGitPath(file);
                args = ['diff', '--', validated]; // Arguments as array, no shell interpolation
            } else {
                args = ['diff'];
            }
            const diff = await execGitSafe(args, cwd);
            res.json({ diff });
        } catch (e) {
            if (e.message === 'OUTPUT_LIMIT_EXCEEDED') {
                return res.status(413).json({ error: 'Output too large' });
            }
            if (e.message === 'GIT_COMMAND_FAILED') {
                return res.status(500).json({ error: 'Git command failed' });
            }
            res.status(400).json({ error: e.message });
        }
    });

    // Git show: original file content from HEAD
    app.get('/api/workspaces/:name/git/show', async (req, res) => {
        const inst = getInstanceByName(decodeURIComponent(req.params.name));
        if (!inst) return res.status(400).json({ error: 'Unknown workspace' });
        const cwd = uriToFsPath(inst.workspaceFolderUri);
        if (!cwd) return res.status(400).json({ error: 'No workspace folder' });
        const file = req.query.file;
        if (!file) return res.status(400).json({ error: 'file parameter required' });

        try {
            const validated = validateGitPath(file);
            const args = ['show', `HEAD:${validated}`]; // No shell, arguments as array
            const content = await execGitSafe(args, cwd);
            res.json({ content });
        } catch (e) {
            if (e.message === 'OUTPUT_LIMIT_EXCEEDED') {
                return res.status(413).json({ error: 'Output too large' });
            }
            if (e.message === 'GIT_COMMAND_FAILED') {
                // Check if this is specifically a "file not in HEAD" error (new/untracked file)
                const stderr = e.stderr || '';
                if (stderr.includes('does not exist') || stderr.includes('not exist in') ||
                    stderr.includes('Path') && stderr.includes('does not exist')) {
                    // This is expected for new files not yet committed
                    return res.json({ content: null, error: 'File not in HEAD (new file)' });
                }
                // Other git failures (not a repo, git unavailable, permission errors, etc.)
                return res.status(500).json({ error: 'Git command failed' });
            }
            res.status(400).json({ error: e.message });
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

        // Reject absolute paths
        if (file.startsWith('/') || /^[a-zA-Z]:/.test(file)) {
            return res.status(403).json({ error: 'Access denied: absolute paths not allowed' });
        }

        try {
            const fullPath = path.resolve(cwd, file);

            // Security: Resolve real paths (follows symlinks) to prevent symlink traversal
            let realCwd, realPath;
            try {
                realCwd = fs.realpathSync(cwd);
                realPath = fs.realpathSync(fullPath);
            } catch (e) {
                if (e.code === 'ENOENT') {
                    return res.json({ content: null, error: 'File not found' });
                }
                return res.status(403).json({ error: 'Access denied: invalid path' });
            }

            // Security: ensure the real file path is within the real workspace (case-insensitive on Windows)
            const isInside = process.platform === 'win32'
                ? realPath.toLowerCase() === realCwd.toLowerCase() ||
                realPath.toLowerCase().startsWith(realCwd.toLowerCase() + path.sep)
                : realPath === realCwd ||
                realPath.startsWith(realCwd + path.sep);

            if (!isInside) {
                return res.status(403).json({ error: 'Access denied: path outside workspace' });
            }

            const content = fs.readFileSync(realPath, 'utf-8');
            res.json({ content, path: file });
        } catch (e) {
            if (e.code === 'ENOENT') {
                return res.json({ content: null, error: 'File not found' });
            }
            res.status(500).json({ error: 'Failed to read file' });
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
            // Resolve symlinks to prevent symlink traversal attacks
            let realCwd, realPath;
            try {
                realCwd = fs.realpathSync(cwd);
                realPath = fs.realpathSync(path.resolve(cwd, subpath));
            } catch (e) {
                if (e.code === 'ENOENT') {
                    return res.status(404).json({ error: 'Path not found' });
                }
                return res.status(403).json({ error: 'Access denied: invalid path' });
            }

            // Verify resolved path is within workspace
            const isInside = process.platform === 'win32'
                ? realPath.toLowerCase() === realCwd.toLowerCase() ||
                  realPath.toLowerCase().startsWith(realCwd.toLowerCase() + path.sep)
                : realPath === realCwd ||
                  realPath.startsWith(realCwd + path.sep);
            
            if (!isInside) {
                return res.status(403).json({ error: 'Access denied: path outside workspace' });
            }

            // Hidden dirs to skip (always)
            const SKIP_DIRS = new Set(['node_modules', '.git', '.next', 'dist', 'build', '__pycache__', '.cache']);

            const dirents = fs.readdirSync(realPath, { withFileTypes: true });
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
                            const stat = fs.statSync(path.join(realPath, d.name));
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
};
