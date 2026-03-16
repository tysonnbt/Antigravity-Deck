// === Workflow Routes ===
// /api/workflows, /api/workflows/:name

const { getInstanceByName } = require('../detector');
const { uriToFsPath } = require('./route-helpers');

module.exports = function setupWorkflowsRoutes(app) {
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
};
