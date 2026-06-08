// === Live LS Transport (replay layer) ===
//
// Resolves a live Language Server instance and replays a single method against
// it, capturing the FULL outcome (status, decode success, response shape) so
// the runner can diff and report. Reuses the Deck's own conventions from
// src/api.js (Connect-Protocol-Version: 1 + X-Codeium-Csrf-Token, path
// /exa.language_server_pb.LanguageServerService/<Method>, rejectUnauthorized:
// false for self-signed TLS).
//
// Why a local raw caller instead of src/api.js#callApi directly?
//   - callApi() REJECTS on HTTP >= 400, but a 404 / "unimplemented" is exactly
//     the signal we need to detect a REMOVED method. We must observe the status
//     code instead of having it thrown away.
//   - We must handle binary-proto responses (application/proto) and run them
//     through the Deck's decodeGenericMessage.
// We still reuse src/detector.js for live-instance discovery and src/api.js is
// require()'d so the harness shares the Deck's transport module (and we expose
// it for callers who want the high-level helpers).

const http = require('http');
const https = require('https');
const path = require('path');

// __dirname = tools/api-tracker/test/lib  →  4 levels up = repo root.
const REPO_ROOT = path.resolve(__dirname, '..', '..', '..', '..');

// Reuse the Deck's modules (per mission: require('../../../src/...')).
// Guarded so the harness still loads if the Deck tree moves.
let deckApi = null;
let deckDetector = null;
let deckProtobuf = null;
let deckConfig = null;
function loadDeckModules() {
    if (!deckApi) { try { deckApi = require(path.join(REPO_ROOT, 'src', 'api')); } catch { deckApi = {}; } }
    if (!deckDetector) { try { deckDetector = require(path.join(REPO_ROOT, 'src', 'detector')); } catch { deckDetector = {}; } }
    if (!deckProtobuf) { try { deckProtobuf = require(path.join(REPO_ROOT, 'src', 'protobuf')); } catch { deckProtobuf = {}; } }
    if (!deckConfig) { try { deckConfig = require(path.join(REPO_ROOT, 'src', 'config')); } catch { deckConfig = {}; } }
    return { deckApi, deckDetector, deckProtobuf, deckConfig };
}

const RPC_BASE = '/exa.language_server_pb.LanguageServerService';

/**
 * Resolve a live LS connection. Resolution order:
 *   1. Explicit --port/--csrf CLI flags (probe TLS unless stated).
 *   2. The Deck detector (scans running LS processes) — authoritative.
 *   3. Endpoints harvested from the capture file (the instance that produced
 *      the traffic), verified with a live GetUserStatus probe.
 * @param {{port?:string|number, csrf?:string, useTls?:boolean, captureEndpoints?:object[]}} opts
 * @returns {Promise<{conn: object|null, source: string, instances: object[]}>}
 */
async function resolveLiveInstance({ port, csrf, useTls, captureEndpoints = [] } = {}) {
    loadDeckModules();

    if (port && csrf) {
        let tls = useTls;
        if (tls === undefined) tls = await probeTls(port, csrf);
        return {
            conn: { host: tls ? '127.0.0.1' : 'localhost', port: Number(port), csrfToken: csrf, useTls: tls },
            source: 'cli-flags',
            instances: [],
        };
    }

    // 2. Detector.
    let instances = [];
    if (typeof deckDetector.init === 'function') {
        await new Promise((resolve) => {
            try { deckDetector.init(() => resolve()); }
            catch { resolve(); }
        });
        instances = (deckConfig.lsInstances || []).slice();
        const active = instances.find((i) => i.active) || instances[0] || null;
        if (active) {
            return {
                conn: { host: active.useTls ? '127.0.0.1' : 'localhost', port: active.port, csrfToken: active.csrfToken, useTls: active.useTls },
                source: 'detector',
                instances,
            };
        }
    }

    // 3. Capture-derived endpoint(s) — verify each with a live probe.
    for (const ep of dedupeEndpoints(captureEndpoints)) {
        if (!ep.port || !ep.csrfToken) continue;
        const live = await probeAlive(ep);
        if (live) {
            return { conn: { host: ep.host || (ep.useTls ? '127.0.0.1' : 'localhost'), port: ep.port, csrfToken: ep.csrfToken, useTls: ep.useTls }, source: 'capture-endpoint', instances };
        }
    }

    return { conn: null, source: instances.length ? 'detector-none' : (captureEndpoints.length ? 'capture-stale' : 'no-source'), instances };
}

function dedupeEndpoints(eps) {
    const seen = new Set();
    const out = [];
    for (const e of eps || []) {
        const k = `${e.host}:${e.port}:${e.csrfToken}`;
        if (seen.has(k)) continue;
        seen.add(k);
        out.push(e);
    }
    return out;
}

// Probe whether an endpoint is alive RIGHT NOW (csrf may have rotated).
async function probeAlive(ep) {
    try {
        const r = await rawCall({ host: ep.host || '127.0.0.1', port: ep.port, csrfToken: ep.csrfToken, useTls: ep.useTls }, 'GetUserStatus', {}, { timeoutMs: 2500 });
        return r.status && r.status > 0 && r.status < 500;
    } catch {
        return false;
    }
}

// Quick TLS probe: try HTTPS GetUserStatus; on TLS/parse error, assume plain http.
async function probeTls(port, csrf) {
    try {
        const r = await rawCall({ host: '127.0.0.1', port: Number(port), csrfToken: csrf, useTls: true }, 'GetUserStatus', {}, { timeoutMs: 2500 });
        if (r.status && r.status > 0) return true;
    } catch { /* fall through */ }
    return false;
}

/**
 * Low-level Connect-RPC call that NEVER rejects on HTTP status. Returns a
 * structured outcome including raw bytes so the caller can diff/decode.
 *
 * @param {{host:string,port:number,csrfToken:string,useTls:boolean}} conn
 * @param {string} method
 * @param {object|Buffer} body            JSON object (default) or Buffer (proto)
 * @param {{timeoutMs?:number, binary?:boolean}} opts
 * @returns {Promise<{
 *   ok:boolean, status:number|null, error:string|null,
 *   contentType:string|null, raw:Buffer, bytes:number,
 *   json:any, decoded:boolean, decodeMode:'json'|'proto'|'none',
 *   responseShape:string|null
 * }>}
 */
function rawCall(conn, method, body = {}, opts = {}) {
    const { timeoutMs = 15000, binary = false } = opts;
    return new Promise((resolve) => {
        const transport = conn.useTls ? https : http;
        const isBuf = Buffer.isBuffer(body);
        const data = isBuf ? body : Buffer.from(JSON.stringify(body || {}));
        const headers = {
            'Content-Type': (binary || isBuf) ? 'application/proto' : 'application/json',
            'Connect-Protocol-Version': '1',
            'X-Codeium-Csrf-Token': conn.csrfToken,
            'Content-Length': data.length,
        };
        const reqOpts = {
            hostname: conn.host,
            port: conn.port,
            path: `${RPC_BASE}/${method}`,
            method: 'POST',
            headers,
            timeout: timeoutMs,
        };
        if (conn.useTls) reqOpts.rejectUnauthorized = false;

        const req = transport.request(reqOpts, (res) => {
            const chunks = [];
            res.on('data', (c) => chunks.push(c));
            res.on('end', () => resolve(interpret(res, Buffer.concat(chunks))));
        });
        req.on('error', (e) => {
            // A reset/hangup on a streaming RPC means the LS processed it then
            // closed — treat as a reached-and-responded (status 0).
            if (e.code === 'ECONNRESET' || /socket hang up/.test(e.message || '')) {
                resolve({ ok: true, status: 0, error: 'stream_closed', contentType: null, raw: Buffer.alloc(0), bytes: 0, json: null, decoded: false, decodeMode: 'none', responseShape: null });
            } else {
                resolve({ ok: false, status: null, error: e.code || e.message || String(e), contentType: null, raw: Buffer.alloc(0), bytes: 0, json: null, decoded: false, decodeMode: 'none', responseShape: null });
            }
        });
        req.on('timeout', () => { req.destroy(); resolve({ ok: false, status: null, error: 'timeout', contentType: null, raw: Buffer.alloc(0), bytes: 0, json: null, decoded: false, decodeMode: 'none', responseShape: null }); });
        req.write(data);
        req.end();
    });
}

function interpret(res, raw) {
    const status = res.statusCode;
    const contentType = (res.headers && res.headers['content-type']) || null;
    const out = {
        ok: status >= 200 && status < 400,
        status,
        error: status >= 400 ? `HTTP ${status}` : null,
        contentType,
        raw,
        bytes: raw.length,
        json: null,
        decoded: false,
        decodeMode: 'none',
        responseShape: null,
    };

    if (raw.length === 0) return out;

    const looksJson = !contentType || /json/i.test(contentType);
    if (looksJson) {
        try {
            out.json = JSON.parse(raw.toString('utf-8'));
            out.decoded = true;
            out.decodeMode = 'json';
            out.responseShape = require('./artifacts').shapeOf(out.json);
            return out;
        } catch { /* not json — fall through to proto */ }
    }

    // Binary / proto path: report bytes and attempt the Deck's generic decoder.
    const { deckProtobuf: pb } = loadDeckModules();
    out.decodeMode = 'proto';
    if (pb && typeof pb.decodeGenericMessage === 'function') {
        try {
            const decoded = pb.decodeGenericMessage(raw, null);
            if (decoded && (typeof decoded === 'object' ? Object.keys(decoded).length : String(decoded).length)) {
                out.json = decoded;
                out.decoded = true;
                out.responseShape = require('./artifacts').shapeOf(decoded);
            }
        } catch { /* leave undecoded; bytes still reported */ }
    }
    return out;
}

module.exports = { resolveLiveInstance, rawCall, loadDeckModules, RPC_BASE, REPO_ROOT };
