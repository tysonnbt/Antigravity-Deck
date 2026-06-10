// === Jetbox subscriptions — full conversation history + projects (Antigravity 2.0.11) ===
//
// 2.0.11 stores conversations in a new "Jetbox" subsystem. The FULL conversation list
// (all projects, all time) is delivered by JetboxSubscribeToSummaries (server-streaming:
// initial snapshot in `updates`, then incremental `updates`/`deletes`). The old
// GetAllCascadeTrajectories only holds the recent/active set — which is why the Deck used
// to show far fewer conversations than the IDE.
//
// The project list ("Projects" grouping) comes from ProjectUpdatesStream (ids) +
// ReadProject (id -> name + folder). We hold one long-lived subscription per stream
// against the current hub, keep full state in memory, and broadcast 'conversations_updated'
// on change. Connect-protocol framing is modeled on src/ls-stream.js.

const http = require('http');
const https = require('https');
const { getHub } = require('./detector');
const { callApi } = require('./api');

const LS_SERVICE = '/exa.language_server_pb.LanguageServerService';

// --- State ---
let summaries = {};        // cascadeId -> CascadeTrajectorySummary (FULL list)
let projects = {};         // projectId -> { id, name, folderUri }
let projectIds = [];       // ordered project ids from ProjectUpdatesStream
let teardowns = [];
let running = false;
let broadcastTimer = null;

function getSummaries() { return summaries; }

// Real projects (exclude the synthetic "outside-of-project" bucket), with conversation counts.
function getProjects() {
    const counts = {};
    for (const s of Object.values(summaries)) {
        const pid = s?.trajectoryMetadata?.projectId;
        if (pid) counts[pid] = (counts[pid] || 0) + 1;
    }
    return projectIds
        .filter(id => id && id !== 'outside-of-project')
        .map(id => ({ ...(projects[id] || { id, name: id, folderUri: '' }), conversationCount: counts[id] || 0 }));
}

function scheduleBroadcast() {
    if (broadcastTimer) return;
    broadcastTimer = setTimeout(() => {
        broadcastTimer = null;
        try { require('./ws').broadcastAll({ type: 'conversations_updated' }); } catch { }
    }, 400); // debounce bursts of frames
}

function encodeEnvelope(jsonBody) {
    const payload = Buffer.from(JSON.stringify(jsonBody));
    const env = Buffer.allocUnsafe(5 + payload.length);
    env[0] = 0x00;
    env.writeUInt32BE(payload.length, 1);
    payload.copy(env, 5);
    return env;
}

// Generic Connect server-streaming subscription with auto-reconnect. Re-reads the hub on
// each (re)connect so a hub restart (new port/csrf) is picked up transparently.
function subscribeStream(method, body, onFrame) {
    let destroyed = false, activeReq = null, retryTimer = null;
    function teardown() {
        destroyed = true;
        if (retryTimer) { clearTimeout(retryTimer); retryTimer = null; }
        if (activeReq) { try { activeReq.destroy(); } catch { } activeReq = null; }
    }
    async function connect() {
        if (destroyed) return;
        const inst = getHub();
        if (!inst || !inst.port || !inst.csrfToken) { retryTimer = setTimeout(connect, 5000); return; }
        const host = inst.useTls ? '127.0.0.1' : 'localhost';
        const transport = inst.useTls ? https : http;
        const buf = encodeEnvelope(body);
        try {
            const res = await new Promise((resolve, reject) => {
                const req = transport.request({
                    hostname: host, port: inst.port,
                    path: `${LS_SERVICE}/${method}`, method: 'POST',
                    headers: {
                        'Content-Type': 'application/connect+json',
                        'Connect-Protocol-Version': '1',
                        'X-Codeium-Csrf-Token': inst.csrfToken,
                        'Content-Length': buf.length,
                    },
                    rejectUnauthorized: false,
                }, resolve);
                activeReq = req;
                req.on('error', reject);
                req.write(buf); req.end();
            });
            if (res.statusCode >= 400) {
                res.resume();
                if (!destroyed) retryTimer = setTimeout(connect, 10000);
                return;
            }
            let acc = Buffer.alloc(0);
            for await (const chunk of res) {
                if (destroyed) break;
                acc = Buffer.concat([acc, chunk]);
                while (acc.length >= 5) {
                    const flag = acc[0];
                    const len = acc.readUInt32BE(1);
                    if (acc.length < 5 + len) break;
                    const msgBody = acc.slice(5, 5 + len);
                    acc = acc.slice(5 + len);
                    if (flag !== 0x00) continue; // end-stream trailer
                    try { onFrame(JSON.parse(msgBody.toString())); } catch { }
                }
            }
            if (!destroyed) retryTimer = setTimeout(connect, 2000); // stream closed → reconnect
        } catch (e) {
            if (!destroyed) retryTimer = setTimeout(connect, 10000);
        }
    }
    connect();
    return teardown;
}

async function readProject(id) {
    if (!id || id === 'outside-of-project' || projects[id]) return;
    try {
        const inst = getHub(); if (!inst) return;
        const r = await callApi('ReadProject', { id }, inst);
        const p = r && r.project;
        if (p) {
            const folderUri = p.projectResources && p.projectResources.resources && p.projectResources.resources[0]
                && p.projectResources.resources[0].gitFolder && p.projectResources.resources[0].gitFolder.folderUri || '';
            projects[id] = { id, name: p.name || id, folderUri };
            scheduleBroadcast();
        }
    } catch { }
}

function start() {
    if (running) return;
    running = true;

    teardowns.push(subscribeStream('JetboxSubscribeToSummaries', {}, (frame) => {
        let changed = false;
        if (frame.updates) { Object.assign(summaries, frame.updates); changed = true; }
        if (Array.isArray(frame.deletes)) {
            for (const id of frame.deletes) { delete summaries[id]; changed = true; }
        }
        if (changed) scheduleBroadcast();
    }));

    teardowns.push(subscribeStream('ProjectUpdatesStream', {}, (frame) => {
        if (frame.projectList && Array.isArray(frame.projectList.projectIds)) {
            projectIds = frame.projectList.projectIds;
            for (const id of projectIds) readProject(id);
        } else if (frame.projectUpdatedId) {
            if (!projectIds.includes(frame.projectUpdatedId)) projectIds.push(frame.projectUpdatedId);
            readProject(frame.projectUpdatedId);
        }
    }));

    console.log('[Jetbox] conversation-summary + project subscriptions started');
}

function stop() {
    running = false;
    teardowns.forEach(t => { try { t(); } catch { } });
    teardowns = [];
}

module.exports = { start, stop, getSummaries, getProjects };
