// === API Tracker Routes ===
// /api/api-tracker/* — trigger LS API scans and read the catalog/registry.

const tracker = require('../api-tracker');

module.exports = function setupApiTrackerRoutes(app) {
    // Start a scan (single-flight). Body: { tiers?: "1,2" }.
    // HTTP scans are restricted to READ-ONLY tiers 1,2. Tiers 3 (sandbox agent
    // run) and 4 (echo-back mutations) have side effects and are CLI-ONLY — they
    // are not exposed over the network even to an authenticated caller.
    app.post('/api/api-tracker/scan', (req, res) => {
        const tiers = String((req.body && req.body.tiers) || '1,2');
        if (!/^[12](,[12])*$/.test(tiers)) {
            return res.status(403).json({
                error: 'HTTP scans allow read-only tiers 1,2 only.',
                hint: 'Run side-effecting tiers 3/4 via the CLI: node tools/api-tracker/autoscan/autoscan.js --tier=3',
            });
        }
        const r = tracker.startScan({ tiers });
        const conflict = r.error && /already running|cooldown/.test(r.error);
        res.status(r.ok ? 202 : (conflict ? 409 : 400)).json(r);
    });

    // Poll scan status + recent log lines.
    app.get('/api/api-tracker/status', (req, res) => res.json(tracker.getStatus()));

    // The last scan's catalog (per-method outcomes + redacted samples).
    app.get('/api/api-tracker/catalog', (req, res) => {
        const c = tracker.readCatalog();
        if (!c) return res.status(404).json({ error: 'No catalog yet — run a scan first.' });
        res.json(c);
    });

    // The full extracted RPC registry (every service/method/IO type).
    app.get('/api/api-tracker/registry', (req, res) => {
        const r = tracker.readRegistry();
        if (!r) return res.status(404).json({ error: 'No registry — run the schema extractor.' });
        res.json(r);
    });
};
