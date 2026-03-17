// === Web Push Service ===
// Manages VAPID keys, push subscriptions, and sending push notifications.
// Push notifications work even when the browser tab is closed (unlike WebSocket-based notifications).

const webpush = require('web-push');
const fs = require('fs');
const path = require('path');
const { getSettings, saveSettings } = require('./config');

const SUBSCRIPTIONS_PATH = path.join(__dirname, '..', 'push-subscriptions.json');

// --- VAPID Key Management ---

function initVapid() {
    const settings = getSettings();
    if (settings.vapidPublicKey && settings.vapidPrivateKey) {
        webpush.setVapidDetails(
            // Must be a valid https: URL or mailto: with real domain.
            // Apple APNs rejects 'localhost' as the email domain (RFC 8292).
            'mailto:push@antigravity-deck.app',
            settings.vapidPublicKey,
            settings.vapidPrivateKey
        );
        console.log('[Push] VAPID keys loaded from settings');
        return;
    }

    // Auto-generate VAPID keys on first run
    const vapidKeys = webpush.generateVAPIDKeys();
    saveSettings({
        vapidPublicKey: vapidKeys.publicKey,
        vapidPrivateKey: vapidKeys.privateKey,
    });
    webpush.setVapidDetails(
        'mailto:push@antigravity-deck.app',
        vapidKeys.publicKey,
        vapidKeys.privateKey
    );
    console.log('[Push] VAPID keys generated and saved');
}

function getVapidPublicKey() {
    const settings = getSettings();
    return settings.vapidPublicKey || null;
}

// --- Subscription Management (in-memory cache + file persistence) ---

let _subsCache = null; // in-memory cache — avoids disk read on every push send

function loadSubscriptions() {
    if (_subsCache !== null) return _subsCache;
    try {
        if (fs.existsSync(SUBSCRIPTIONS_PATH)) {
            _subsCache = JSON.parse(fs.readFileSync(SUBSCRIPTIONS_PATH, 'utf-8'));
            return _subsCache;
        }
    } catch {}
    _subsCache = [];
    return _subsCache;
}

function persistSubscriptions(subs) {
    // Write to disk FIRST — only update in-memory cache after successful write.
    // This prevents cache corruption if the write fails.
    try {
        fs.writeFileSync(SUBSCRIPTIONS_PATH, JSON.stringify(subs, null, 2), 'utf-8');
        _subsCache = subs;
    } catch (e) {
        console.error('[Push] Failed to save subscriptions:', e.message);
    }
}

function addSubscription(subscription) {
    if (!subscription?.endpoint) return false;
    const subs = loadSubscriptions();
    // Deduplicate by endpoint
    const exists = subs.some(s => s.endpoint === subscription.endpoint);
    if (exists) return false;
    subs.push(subscription);
    persistSubscriptions(subs);
    console.log(`[Push] Subscription added (total: ${subs.length})`);
    return true;
}

function removeSubscription(endpoint) {
    if (!endpoint) return false;
    const subs = loadSubscriptions();
    const filtered = subs.filter(s => s.endpoint !== endpoint);
    if (filtered.length === subs.length) return false;
    persistSubscriptions(filtered);
    console.log(`[Push] Subscription removed (total: ${filtered.length})`);
    return true;
}

// --- Send Push Notifications ---

async function sendPushToAll(payload) {
    const subs = loadSubscriptions();
    if (subs.length === 0) return;

    const message = JSON.stringify(payload);
    const expiredEndpoints = [];

    const results = await Promise.allSettled(
        subs.map(sub =>
            webpush.sendNotification(sub, message).catch(err => {
                // Log every failure with details so we can diagnose iOS/APNs issues
                const endpointShort = sub.endpoint?.split('/').pop()?.substring(0, 20) || '?';
                const body = err.body ? (typeof err.body === 'string' ? err.body : JSON.stringify(err.body)) : err.message || String(err);
                console.warn(`[Push] ⚠️  Failed to send to ...${endpointShort}: HTTP ${err.statusCode || '?'} — ${body}`);
                // 404/410 = expired/unregistered; 401/403 = VAPID key mismatch (e.g. BadJwtToken from Apple APNs)
                // All of these mean the subscription is permanently invalid — remove it.
                if (err.statusCode === 404 || err.statusCode === 410 ||
                    err.statusCode === 401 || err.statusCode === 403) {
                    expiredEndpoints.push(sub.endpoint);
                }
                throw err;
            })
        )
    );

    // Cleanup expired subscriptions
    if (expiredEndpoints.length > 0) {
        const cleaned = subs.filter(s => !expiredEndpoints.includes(s.endpoint));
        persistSubscriptions(cleaned);
        console.log(`[Push] Cleaned ${expiredEndpoints.length} expired subscription(s)`);
    }

    const sent = results.filter(r => r.status === 'fulfilled').length;
    const failed = results.filter(r => r.status === 'rejected').length;
    if (sent > 0 || failed > 0) {
        console.log(`[Push] Sent: ${sent}/${subs.length}, Failed: ${failed} — ${payload.title || 'notification'}`);
    }
}

// --- Cascade Status → Push (called from poller.js) ---

const COMPLETE_STATUSES = [
    'CASCADE_RUN_STATUS_IDLE',
    'CASCADE_RUN_STATUS_DONE',
    'CASCADE_RUN_STATUS_COMPLETED',
];
const ACTIVE_STATUSES = [
    'CASCADE_RUN_STATUS_RUNNING',
    'CASCADE_RUN_STATUS_WAITING_FOR_USER',
];
const ERROR_STATUSES = [
    'CASCADE_RUN_STATUS_ERROR',
    'CASCADE_RUN_STATUS_FAILED',
    'CASCADE_RUN_STATUS_CANCELLED',
];

// Check if a specific notification event is enabled in settings
function isEventEnabled(eventKey) {
    const settings = getSettings();
    const ns = settings.notifications;
    if (!ns || !ns.enabled) return false;
    if (!ns.events) return true; // no per-event config = all enabled
    return ns.events[eventKey] !== false;
}

function handleCascadeStatusPush(convId, prevStatus, newStatus) {
    const shortId = convId.substring(0, 8);

    // Cascade complete: ACTIVE → DONE/IDLE
    if (ACTIVE_STATUSES.includes(prevStatus) && COMPLETE_STATUSES.includes(newStatus)) {
        if (!isEventEnabled('cascadeComplete')) return;
        sendPushToAll({
            title: '✅ Cascade Complete',
            body: `Cascade ${shortId} has finished running.`,
            tag: `cascade-complete-${shortId}`,
            data: { url: '/', convId },
        });
        return;
    }

    // Waiting for user
    if (newStatus === 'CASCADE_RUN_STATUS_WAITING_FOR_USER' && prevStatus !== 'CASCADE_RUN_STATUS_WAITING_FOR_USER') {
        if (!isEventEnabled('waitingForUser')) return;
        sendPushToAll({
            title: '⏳ Action Required',
            body: `Cascade ${shortId} is waiting for your approval.`,
            tag: `waiting-${shortId}`,
            data: { url: '/', convId },
        });
        return;
    }

    // Error
    if (ERROR_STATUSES.includes(newStatus) && !ERROR_STATUSES.includes(prevStatus)) {
        if (!isEventEnabled('error')) return;
        sendPushToAll({
            title: '❌ Cascade Error',
            body: `Cascade ${shortId} encountered an error.`,
            tag: `error-${shortId}`,
            data: { url: '/', convId },
        });
        return;
    }
}

// Called from auto-accept.js when a step is auto-accepted
function handleAutoAcceptedPush(convId) {
    if (!isEventEnabled('autoAccepted')) return;
    const shortId = convId.substring(0, 8);
    sendPushToAll({
        title: '⚡ Auto-Accepted',
        body: `A change was auto-accepted for ${shortId}.`,
        tag: `auto-accepted-${shortId}`,
        data: { url: '/', convId },
    });
}

module.exports = {
    initVapid,
    getVapidPublicKey,
    addSubscription,
    removeSubscription,
    handleCascadeStatusPush,
    handleAutoAcceptedPush,
};
