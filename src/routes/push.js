// === Push Notification Routes ===
// /api/push/*

// Module scope
const pushService = require('../push-service');

module.exports = function setupPushRoutes(app) {
    // Public — no auth needed (returns only the public key)
    app.get('/api/push/vapid-public-key', (req, res) => {
        const key = pushService.getVapidPublicKey();
        if (!key) return res.status(503).json({ error: 'Push not configured' });
        res.json({ publicKey: key });
    });

    // Save push subscription from browser
    app.post('/api/push/subscribe', (req, res) => {
        const subscription = req.body;
        if (!subscription?.endpoint) {
            return res.status(400).json({ error: 'Invalid subscription: missing endpoint' });
        }
        const added = pushService.addSubscription(subscription);
        res.json({ success: true, added });
    });

    // Remove push subscription
    app.post('/api/push/unsubscribe', (req, res) => {
        const { endpoint } = req.body || {};
        if (!endpoint) {
            return res.status(400).json({ error: 'endpoint required' });
        }
        const removed = pushService.removeSubscription(endpoint);
        res.json({ success: true, removed });
    });
};
