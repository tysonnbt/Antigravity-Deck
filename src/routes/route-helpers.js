// === Shared Route Helpers ===
// Used by multiple sub-routers in src/routes/*.js

const path = require('path');
const { getInstanceByName, getFirstActiveInstance } = require('../detector');
const { getInstanceForCascade } = require('../poller');
const { spawn } = require('child_process');

// Helper: construct file:// URI from filesystem path (cross-platform)
function pathToFileUri(fsPath) {
    const normalized = fsPath.replace(/\\/g, '/');
    // macOS/Linux paths start with /, Windows paths start with drive letter
    return normalized.startsWith('/')
        ? 'file://' + normalized     // /Users/... → file:///Users/...
        : 'file:///' + normalized;   // C:/Users/... → file:///C:/Users/...
}

// Helper: Execute git command safely with argument array
function execGitSafe(args, cwd) {
    return new Promise((resolve, reject) => {
        const MAX_BUFFER = 10 * 1024 * 1024; // 10MB limit
        const git = spawn('git', args, { cwd });
        let stdout = '';
        let stderr = '';

        git.stdout.on('data', (data) => {
            stdout += data;
            if (stdout.length > MAX_BUFFER) {
                git.kill();
                reject(new Error('OUTPUT_LIMIT_EXCEEDED'));
            }
        });

        git.stderr.on('data', (data) => {
            stderr += data;
            if (stderr.length > MAX_BUFFER) {
                git.kill();
                reject(new Error('OUTPUT_LIMIT_EXCEEDED'));
            }
        });

        git.on('close', (code) => {
            if (code !== 0) {
                // Log detailed error server-side only
                console.error(`[Git Error] Command: git ${args.join(' ')}, Exit code: ${code}, Stderr: ${stderr}`);
                // Return structured error with code and stderr pattern for caller to handle
                const error = new Error('GIT_COMMAND_FAILED');
                error.exitCode = code;
                error.stderr = stderr;
                reject(error);
            } else {
                resolve(stdout);
            }
        });

        git.on('error', (err) => {
            console.error(`[Git Error] Spawn failed: ${err.message}`);
            reject(new Error('GIT_COMMAND_FAILED'));
        });
    });
}

// Helper: Validate git file path (allowlist approach)
function validateGitPath(filePath) {
    if (!filePath) return null;

    // Since we use spawn() with argument arrays (no shell interpretation),
    // we can be more permissive with characters. Focus on path traversal and absolute paths.

    // Reject null bytes (can cause issues in C-based tools)
    if (filePath.includes('\0')) {
        throw new Error('Invalid file path: null byte not allowed');
    }

    // Reject path traversal - check for ".." as a path segment, not substring
    // This allows legitimate filenames like "a..b.txt" while blocking "../etc/passwd"
    const segments = filePath.split(/[/\\]/); // Split by both / and \ for cross-platform
    if (segments.some(segment => segment === '..')) {
        throw new Error('Invalid file path: path traversal not allowed');
    }

    // Reject absolute paths
    if (filePath.startsWith('/') || /^[a-zA-Z]:/.test(filePath)) {
        throw new Error('Invalid file path: absolute paths not allowed');
    }

    // Reject paths starting with dash (could be interpreted as git options)
    if (filePath.startsWith('-')) {
        throw new Error('Invalid file path: paths starting with dash not allowed');
    }

    return filePath;
}

// Helper: determine which LS instance to route a request to
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

// Validate workspace path to prevent command injection
function validateWorkspacePath(folderPath) {
    // Must be absolute path
    if (!path.isAbsolute(folderPath)) {
        throw new Error('Path must be absolute');
    }

    // Resolve to prevent traversal
    const resolved = path.resolve(folderPath);

    // Check for suspicious characters (shell metacharacters)
    if (/[;&|`$(){}[\]<>]/.test(resolved)) {
        throw new Error('Invalid characters in path');
    }

    return resolved;
}

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

module.exports = { pathToFileUri, execGitSafe, validateGitPath, resolveInst, validateWorkspacePath, uriToFsPath };
