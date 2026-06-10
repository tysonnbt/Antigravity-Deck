// === Profile Routes ===
// /api/profiles/*

const { listProfiles, getActiveProfile, swapProfile, createProfile, deleteProfile, getProfileMetadata, startAddAccount, cancelAddAccount, assertProfileSwapSupported } = require('../profile-manager');
const { callApi } = require('../api');
const { getFirstActiveInstance } = require('../detector');

// Profile mutations are Windows-only (EPLATFORM from profile-manager) → 501 Not Implemented
const errStatus = (e, fallback) => (e.code === 'EPLATFORM' ? 501 : fallback);

module.exports = function setupProfilesRoutes(app) {
    app.get('/api/profiles', (req, res) => {
        try {
            const names = listProfiles();
            const profiles = names.map(name => ({ name, meta: getProfileMetadata(name) }));
            res.json({ profiles, active: getActiveProfile() });
        } catch (e) {
            res.status(500).json({ error: e.message });
        }
    });

    app.get('/api/profiles/active', (req, res) => {
        res.json({ active: getActiveProfile() });
    });

    app.post('/api/profiles/swap', (req, res) => {
        const { targetProfile } = req.body || {};
        if (!targetProfile) return res.status(400).json({ error: 'targetProfile required' });
        swapProfile(targetProfile)
            .then(result => res.json(result))
            .catch(e => {
                const status = e.message.includes('already in progress') ? 409
                    : e.message.includes('not found') ? 404 : errStatus(e, 500);
                res.status(status).json({ error: e.message });
            });
    });

    // Auto-create default profile from current IDE account (onboarding — only when 0 profiles exist)
    app.post('/api/profiles/auto-onboard', (req, res) => {
        // Short-circuit before touching the LS API — frontend auto-calls this on
        // every mount; on macOS/Linux it must get a consistent 501 immediately.
        try { assertProfileSwapSupported(); } catch (e) { return res.status(501).json({ error: e.message }); }
        const active = getActiveProfile();
        const existing = listProfiles();
        // Run onboard when: no profiles exist OR we're in "adding" state (activeProfile=null but profiles exist)
        if (active && existing.length > 0) return res.json({ skipped: true, message: 'Profile already active', active });

        const inst = getFirstActiveInstance();
        if (!inst) return res.status(400).json({ error: 'IDE is not running. Open Antigravity IDE and login first.' });

        callApi('GetUserStatus', {}, inst).catch(() => null).then(userStatus => {
            const email = userStatus?.userStatus?.email;
            if (!email) return res.status(400).json({ error: 'Could not detect IDE account. Make sure you are logged in.' });

            const userName = userStatus?.userStatus?.name;
            const tierName = userStatus?.userStatus?.userTier?.name;
            const planName = userStatus?.userStatus?.planStatus?.planInfo?.planName;
            const autoName = email.split('@')[0].replace(/[^a-zA-Z0-9_-]/g, '-').substring(0, 30) || 'default';
            const metadata = { userName: userName || null, email, tier: tierName || null, plan: planName || null, savedAt: new Date().toISOString() };
            const result = createProfile(autoName, metadata);
            res.json({ ...result, autoName });
        }).catch(e => {
            res.status(errStatus(e, 400)).json({ error: e.message });
        });
    });

    app.post('/api/profiles/create', (req, res) => {
        const { name, force } = req.body || {};
        if (!name) return res.status(400).json({ error: 'name required' });

        // Try to fetch current user info from IDE for profile metadata
        const inst = getFirstActiveInstance();
        const metaPromise = inst
            ? callApi('GetUserStatus', {}, inst).catch(() => null).then(userStatus => ({
                userName: userStatus?.userStatus?.name || null,
                email: userStatus?.userStatus?.email || null,
                tier: userStatus?.userStatus?.userTier?.name || null,
                plan: userStatus?.userStatus?.planStatus?.planInfo?.planName || null,
                savedAt: new Date().toISOString(),
            })).catch(() => null)
            : Promise.resolve(null);

        metaPromise.then(metadata => {
            const result = createProfile(name, metadata, { force: !!force });
            res.json(result);
        }).catch(e => {
            const status = e.message.includes('already saved as profile') ? 409 : errStatus(e, 400);
            res.status(status).json({ error: e.message });
        });
    });

    app.delete('/api/profiles/:name', (req, res) => {
        try {
            res.json(deleteProfile(req.params.name));
        } catch (e) {
            res.status(400).json({ error: e.message });
        }
    });

    // Start "Add New Account" flow — saves current, launches fresh IDE for new login
    app.post('/api/profiles/add-account', (req, res) => {
        startAddAccount()
            .then(result => res.json(result))
            .catch(e => res.status(errStatus(e, 500)).json({ error: e.message }));
    });

    // Cancel add account — restore previous profile
    app.post('/api/profiles/cancel-add', (req, res) => {
        const { previousProfile } = req.body || {};
        if (!previousProfile) return res.status(400).json({ error: 'previousProfile required' });
        cancelAddAccount(previousProfile)
            .then(result => res.json(result))
            .catch(e => res.status(errStatus(e, 500)).json({ error: e.message }));
    });
};
