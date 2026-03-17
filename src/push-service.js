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

/**
 * Extract a short, human-readable content snippet from the most recent meaningful step.
 * Searches from the end of the cached steps for the first step with real content.
 * Returns null if nothing useful found.
 */
function extractLastStepContent(convId) {
    try {
        const { stepCache } = require('./step-cache');
        const cache = stepCache[convId];
        if (!cache || !cache.steps || cache.steps.length === 0) return null;

        // Walk backwards to find the latest meaningful step
        for (let i = cache.steps.length - 1; i >= 0; i--) {
            const step = cache.steps[i];
            if (!step) continue;

            // notifyUser message (highest priority — explicit message to user)
            const notifyMsg = step.notifyUser?.notificationContent || step.notifyUser?.message;
            if (notifyMsg && typeof notifyMsg === 'string' && notifyMsg.trim()) {
                return notifyMsg.trim().substring(0, 120);
            }

            // taskBoundary status (agent task status)
            // Only use taskStatus — taskName often duplicates the conversation summary in the title
            const taskStatus = step.taskBoundary?.taskStatus;
            if (taskStatus && typeof taskStatus === 'string' && taskStatus.trim()) {
                return taskStatus.trim().substring(0, 120);
            }

            // plannerResponse text (agent reply)
            const plannerText =
                step.plannerResponse?.modifiedResponse ||
                step.plannerResponse?.response ||
                step.plannerResponse?.text ||
                step.plannerResponse?.content ||
                (step.plannerResponse?.responseItems || []).map(r => r.text).filter(Boolean).join(' ');
            if (plannerText && typeof plannerText === 'string' && plannerText.trim()) {
                return plannerText.trim().substring(0, 120);
            }

            // codeAction description
            const codeDesc =
                step.codeAction?.actionSpec?.command?.description ||
                step.codeAction?.description ||
                step.codeAction?.instruction ||
                step.codeAction?.actionSpec?.command?.instruction;
            if (codeDesc && typeof codeDesc === 'string' && codeDesc.trim()) {
                return codeDesc.trim().substring(0, 120);
            }

            // userInput (what the user said — only for first-step context)
            if (i === cache.steps.length - 1) {
                const userText = (step.userInput?.items || []).map(it => it.text).filter(Boolean).join(' ');
                if (userText && userText.trim()) return userText.trim().substring(0, 120);
            }
        }
    } catch { /* never block push send on content extraction failure */ }
    return null;
}

/**
 * Build a human-readable conversation label from summary + short ID.
 * e.g. "Fix login bug" or "abc12345" if no summary.
 */
function convLabel(convId, convInfo) {
    const summary = convInfo?.summary;
    if (summary && typeof summary === 'string' && summary.trim()) {
        return summary.trim().substring(0, 60);
    }
    return convId.substring(0, 8);
}

// handleCascadeStatusPush — convInfo is the trajectorySummary object ({ summary, stepCount, status, ... })
function handleCascadeStatusPush(convId, prevStatus, newStatus, convInfo) {
    const label = convLabel(convId, convInfo);
    const lastContent = extractLastStepContent(convId);

    // Cascade complete: ACTIVE → DONE/IDLE
    if (ACTIVE_STATUSES.includes(prevStatus) && COMPLETE_STATUSES.includes(newStatus)) {
        if (!isEventEnabled('cascadeComplete')) return;
        sendPushToAll({
            title: `✅ ${label}`,
            body: lastContent || 'Cascade has finished running.',
            tag: `cascade-complete-${convId.substring(0, 8)}`,
            data: { url: '/', convId },
        });
        return;
    }

    // Waiting for user
    if (newStatus === 'CASCADE_RUN_STATUS_WAITING_FOR_USER' && prevStatus !== 'CASCADE_RUN_STATUS_WAITING_FOR_USER') {
        if (!isEventEnabled('waitingForUser')) return;
        sendPushToAll({
            title: `⏳ ${label} — Action Required`,
            body: lastContent || 'Waiting for your approval.',
            tag: `waiting-${convId.substring(0, 8)}`,
            data: { url: '/', convId },
        });
        return;
    }

    // Error
    if (ERROR_STATUSES.includes(newStatus) && !ERROR_STATUSES.includes(prevStatus)) {
        if (!isEventEnabled('error')) return;
        sendPushToAll({
            title: `❌ ${label} — Error`,
            body: lastContent || 'Cascade encountered an error.',
            tag: `error-${convId.substring(0, 8)}`,
            data: { url: '/', convId },
        });
        return;
    }
}

// Called from auto-accept.js when a step is auto-accepted
// convInfo is optional: the trajectorySummary object ({ summary, ... })
function handleAutoAcceptedPush(convId, convInfo) {
    if (!isEventEnabled('autoAccepted')) return;
    const label = convLabel(convId, convInfo);
    const lastContent = extractLastStepContent(convId);
    sendPushToAll({
        title: `⚡ ${label} — Auto-Accepted`,
        body: lastContent || 'A change was auto-accepted.',
        tag: `auto-accepted-${convId.substring(0, 8)}`,
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
