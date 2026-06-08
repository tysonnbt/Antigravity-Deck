// === Artifact Loaders ===
//
// Consumes the artifacts produced by the sibling agents, degrading gracefully
// when any are absent. Everything here is defensive: a missing/garbage file
// yields an empty-but-valid structure plus a recorded warning, never a throw.
//
// Inputs (all optional — read whatever exists):
//   capture/captured-traffic.jsonl      → live request/response samples
//   schema/method-registry.json (or *.json in schema/) → full method set + schemas
//   inventory/deck-known-methods.json   → methods the Deck currently calls
//
// Fallback: if inventory json is absent, we scan ../../../src for callApi*(...)
// invocations + hardcoded /LanguageServerService/<Method> paths so we always
// have a usable "Deck known" set.

const fs = require('fs');
const path = require('path');

const TRACKER_ROOT = path.resolve(__dirname, '..', '..'); // tools/api-tracker
const REPO_ROOT = path.resolve(TRACKER_ROOT, '..', '..'); // repo root
const SRC_DIR = path.join(REPO_ROOT, 'src');

const PATHS = {
    capture: path.join(TRACKER_ROOT, 'capture', 'captured-traffic.jsonl'),
    captureDir: path.join(TRACKER_ROOT, 'capture'),
    schemaDir: path.join(TRACKER_ROOT, 'schema'),
    inventory: path.join(TRACKER_ROOT, 'inventory', 'deck-known-methods.json'),
    inventoryDir: path.join(TRACKER_ROOT, 'inventory'),
};

function safeRead(file) {
    try {
        return fs.readFileSync(file, 'utf-8');
    } catch {
        return null;
    }
}

function exists(p) {
    try { return fs.existsSync(p); } catch { return false; }
}

const RPC_PATH_RE = /LanguageServerService\/([A-Za-z][A-Za-z0-9]*)/g;

// --- Capture (.jsonl) -----------------------------------------------------
// One JSON object per line, produced by the CDP capture agent. Known fields
// (probed defensively so we survive minor drift):
//   methodPath, servicePrefix, url           → method name
//   requestBody / responseBody (string)      → gRPC-Web-framed OR plain payload
//   requestBodyBase64Encoded / responseBody… → base64 flag
//   requestContentType / responseContentType → grpc-web+json | json | proto
//   requestBodyIsProto                        → bool
//   csrfToken, responseStatus, isStream
//
// gRPC-Web framing: a 5-byte prefix (1 flag byte + uint32 BE length) precedes
// each message. We strip it to recover the inner JSON for replay/shape diffing.
function loadCapture(warnings) {
    const result = { methods: new Set(), samples: {}, count: 0, present: false, endpoints: [] };
    const raw = safeRead(PATHS.capture);
    if (raw == null) {
        warnings.push(`capture: ${rel(PATHS.capture)} not found — skipping replay-from-capture (Get* will use {}).`);
        return result;
    }
    result.present = true;

    const lines = raw.split(/\r?\n/).filter((l) => l.trim().length);
    for (const line of lines) {
        let obj;
        try { obj = JSON.parse(line); } catch { continue; }
        const method = pickMethod(obj);
        if (!method) continue;
        result.count += 1;
        result.methods.add(method);

        // Harvest a live endpoint (host/port/csrf/tls) so the runner can target
        // the very instance that produced the capture if the detector fails.
        const ep = pickEndpoint(obj);
        if (ep) result.endpoints.push(ep);

        // Keep the first observed request body + a response shape per method.
        if (!result.samples[method]) {
            const reqJson = decodeBodyToJson(obj.requestBody, obj.requestBodyBase64Encoded, obj.requestContentType, obj.requestBodyIsProto);
            const respJson = decodeBodyToJson(obj.responseBody, obj.responseBodyBase64Encoded, obj.responseContentType, false);
            result.samples[method] = {
                requestBody: reqJson && typeof reqJson === 'object' ? reqJson : null,
                requestIsProto: !!obj.requestBodyIsProto,
                responseShape: respJson != null ? shapeOf(respJson) : null,
                responseStatus: typeof obj.responseStatus === 'number' ? obj.responseStatus : null,
                contentType: obj.responseContentType || null,
                isStream: !!obj.isStream,
            };
        }
    }

    if (result.count === 0) {
        warnings.push(`capture: ${rel(PATHS.capture)} present but no parseable RPC lines found.`);
    }
    return result;
}

function pickMethod(obj) {
    if (typeof obj.methodPath === 'string' && /^[A-Za-z][A-Za-z0-9]*$/.test(obj.methodPath)) return obj.methodPath;
    for (const k of ['method', 'methodName', 'rpc', 'rpcMethod']) {
        if (typeof obj[k] === 'string' && /^[A-Za-z][A-Za-z0-9]*$/.test(obj[k])) return obj[k];
    }
    for (const k of ['url', 'path', 'requestUrl', 'endpoint']) {
        if (typeof obj[k] === 'string') {
            const m = [...obj[k].matchAll(RPC_PATH_RE)][0];
            if (m) return m[1];
        }
    }
    return null;
}

// Extract { host, port, csrfToken, useTls } from a capture line's url + token.
function pickEndpoint(obj) {
    const url = obj.url || (obj.requestHeaders && obj.requestHeaders[':authority']);
    const csrf = obj.csrfToken || (obj.requestHeaders && (obj.requestHeaders['x-codeium-csrf-token']));
    if (!url || !csrf) return null;
    try {
        const u = new URL(url.startsWith('http') ? url : `https://${url}`);
        return {
            host: u.hostname.replace(/^\[|\]$/g, '') || '127.0.0.1',
            port: parseInt(u.port, 10),
            csrfToken: String(csrf),
            useTls: u.protocol === 'https:',
        };
    } catch {
        return null;
    }
}

// Decode a captured body string into a JS value (object/string), stripping
// gRPC-Web framing and handling base64. Returns null if it can't be made sense
// of (e.g. genuine binary proto without a decoder here).
function decodeBodyToJson(body, isBase64, contentType, isProto) {
    if (body == null) return null;
    let buf;
    if (isBase64) {
        try { buf = Buffer.from(String(body), 'base64'); } catch { return null; }
    } else if (typeof body === 'object') {
        return body; // already structured
    } else {
        // CDP delivers the raw bytes as a latin1/binary string.
        buf = Buffer.from(String(body), 'binary');
    }

    const inner = stripGrpcWebFrame(buf);
    if (isProto) return null; // proto payload — shape handled elsewhere
    const text = inner.toString('utf-8').trim();
    if (!text) return {};
    try { return JSON.parse(text); } catch { return text; }
}

// gRPC-Web / Connect streaming frame = [1 flag byte][4-byte BE length][payload].
// If the buffer starts with a plausible frame, strip it; otherwise return as-is.
function stripGrpcWebFrame(buf) {
    if (buf.length >= 5) {
        const flag = buf[0];
        const len = buf.readUInt32BE(1);
        // flag is a bitfield; trailers have bit 0x80 set. Data frames are 0.
        if ((flag === 0 || (flag & 0x80) === 0) && len + 5 <= buf.length && len > 0) {
            return buf.subarray(5, 5 + len);
        }
        // Some captures double-frame or pad; if length matches exactly, strip.
        if (len + 5 === buf.length) return buf.subarray(5);
    }
    return buf;
}

// --- Schema registry ------------------------------------------------------
// The schema-extraction agent emits protobuf descriptors. The format we handle
// natively is an array of FileDescriptorProto objects (descriptors.json), where
// RPC methods live ONLY under service[].method[]. Extracting from arbitrary
// `name` fields would wrongly pull message/enum/field names (thousands of them),
// so we extract methods strictly from service definitions.
//
// We focus on the LanguageServerService (the Deck's target) but also retain a
// map of every service so the report can note cross-service methods. If the
// file is some other shape (e.g. a flat registry), we fall back to a structural
// harvest that still only accepts service/method-shaped data.
//
// Target service (mission): exa.language_server_pb.LanguageServerService
const TARGET_SERVICE = 'LanguageServerService';

function loadSchema(warnings) {
    const result = {
        methods: new Set(),       // methods of the TARGET service (LanguageServerService)
        schemas: {},              // method -> { inputType, outputType, serverStreaming, deprecated }
        services: {},             // serviceName -> [method names] (all services seen)
        present: false,
        sourceFile: null,
        targetService: TARGET_SERVICE,
    };

    const preferred = [
        path.join(PATHS.schemaDir, 'descriptors.json'),
        path.join(PATHS.schemaDir, 'method-registry.json'),
    ].find(exists);
    const file = preferred || findFirstJson(PATHS.schemaDir);

    if (!file) {
        warnings.push(`schema: no descriptors.json / *.json under ${rel(PATHS.schemaDir)} — method set comes from capture + inventory only.`);
        return result;
    }

    const raw = safeRead(file);
    let parsed;
    try { parsed = JSON.parse(raw); } catch {
        warnings.push(`schema: ${rel(file)} is not valid JSON — skipping.`);
        return result;
    }

    result.present = true;
    result.sourceFile = rel(file);
    harvestServices(parsed, result);

    if (result.methods.size === 0) {
        const svcCount = Object.keys(result.services).length;
        if (svcCount > 0) {
            warnings.push(`schema: ${rel(file)} had ${svcCount} service(s) but none named '${TARGET_SERVICE}' — diff uses all discovered services instead.`);
            // Fall back: treat the union of ALL service methods as discovered.
            for (const list of Object.values(result.services)) for (const m of list) result.methods.add(m);
        } else {
            warnings.push(`schema: ${rel(file)} parsed but no service[].method[] definitions found.`);
        }
    }
    return result;
}

function findFirstJson(dir) {
    try {
        const entries = fs.readdirSync(dir);
        const json = entries.filter((f) => f.toLowerCase().endsWith('.json')).sort();
        return json.length ? path.join(dir, json[0]) : null;
    } catch {
        return null;
    }
}

// Walk any structure looking for protobuf `service` arrays whose entries have a
// `method` array. This matches FileDescriptorProto (array or wrapped) and most
// registry shapes, while strictly ignoring message/enum/field name noise.
function harvestServices(node, result, depth = 0) {
    if (node == null || depth > 8) return;

    if (Array.isArray(node)) {
        for (const item of node) harvestServices(item, result, depth + 1);
        return;
    }
    if (typeof node !== 'object') return;

    // A service descriptor: { name, method: [ { name, inputType, outputType, ... } ] }
    if (Array.isArray(node.service)) {
        for (const svc of node.service) registerService(svc, result);
    }
    // Some extractors put services at top-level array of {name, method:[...]}.
    if (typeof node.name === 'string' && Array.isArray(node.method)) {
        registerService(node, result);
    }

    // Recurse into nested containers (e.g. fileDescriptorSet.file[]).
    for (const k of Object.keys(node)) {
        if (k === 'service' || k === 'method') continue;
        harvestServices(node[k], result, depth + 1);
    }
}

function registerService(svc, result) {
    if (!svc || typeof svc !== 'object' || !Array.isArray(svc.method)) return;
    const svcName = typeof svc.name === 'string' ? svc.name : '(anonymous)';
    const names = [];
    for (const m of svc.method) {
        if (!m || typeof m.name !== 'string' || !isMethodName(m.name)) continue;
        names.push(m.name);
        if (svcName === TARGET_SERVICE) {
            result.methods.add(m.name);
            result.schemas[m.name] = pickSchema(m);
        }
    }
    if (names.length) {
        result.services[svcName] = (result.services[svcName] || []).concat(names);
    }
}

function pickSchema(m) {
    if (!m || typeof m !== 'object') return null;
    const out = {};
    if (typeof m.inputType === 'string') out.inputType = m.inputType;
    if (typeof m.outputType === 'string') out.outputType = m.outputType;
    if (m.serverStreaming != null) out.serverStreaming = !!m.serverStreaming;
    if (m.clientStreaming != null) out.clientStreaming = !!m.clientStreaming;
    if (m.options && m.options.deprecated) out.deprecated = true;
    return Object.keys(out).length ? out : null;
}

// RPC method names are PascalCase identifiers (e.g. GetUserStatus). They always
// contain at least one lowercase letter, which distinguishes them from
// ALL-CAPS enum constants (CHECKPOINT, CORTEX_STEP_STATUS_DONE, etc.) that
// otherwise leak in from inventory notes / response-shape strings.
function isMethodName(s) {
    return typeof s === 'string'
        && /^[A-Z][A-Za-z0-9]{2,}$/.test(s)   // PascalCase, no underscores/digits-only
        && /[a-z]/.test(s);                    // must have a lowercase letter
}

// --- Inventory (Deck known methods) --------------------------------------
function loadInventory(warnings) {
    const result = { methods: new Set(), present: false, fromSourceScan: false };

    const raw = safeRead(PATHS.inventory);
    if (raw != null) {
        let parsed;
        try { parsed = JSON.parse(raw); } catch {
            warnings.push(`inventory: ${rel(PATHS.inventory)} invalid JSON — falling back to source scan.`);
            parsed = null;
        }
        if (parsed) {
            result.present = true;
            collectInventoryNames(parsed, result.methods);
            if (result.methods.size > 0) return result;
            warnings.push(`inventory: ${rel(PATHS.inventory)} had no recognizable method names — falling back to source scan.`);
        }
    } else {
        warnings.push(`inventory: ${rel(PATHS.inventory)} not found — deriving Deck-known set by scanning ${rel(SRC_DIR)}.`);
    }

    // Fallback: scan the Deck source.
    scanSourceForMethods(result.methods);
    result.fromSourceScan = true;
    return result;
}

function collectInventoryNames(node, set) {
    if (node == null) return;
    if (typeof node === 'string') { if (isMethodName(node)) set.add(node); return; }
    if (Array.isArray(node)) { node.forEach((n) => collectInventoryNames(n, set)); return; }
    if (typeof node === 'object') {
        // Object keyed by method name, or with {method}/{name} entries.
        for (const [k, v] of Object.entries(node)) {
            if (isMethodName(k)) set.add(k);
            if (k === 'method' || k === 'name' || k === 'methodName') collectInventoryNames(v, set);
            else collectInventoryNames(v, set);
        }
    }
}

// Scan src/ for callApi*('Method', ...) and hardcoded RPC paths.
const CALL_RE = /callApi(?:Stream|Binary|FireAndForget|OnInstance|FireAndForgetOnInstance)?\(\s*['"`]([A-Za-z][A-Za-z0-9]*)['"`]/g;

function scanSourceForMethods(set) {
    const files = walkJs(SRC_DIR);
    for (const f of files) {
        const txt = safeRead(f);
        if (txt == null) continue;
        for (const m of txt.matchAll(CALL_RE)) set.add(m[1]);
        for (const m of txt.matchAll(RPC_PATH_RE)) set.add(m[1]);
    }
}

function walkJs(dir, acc = []) {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return acc; }
    for (const e of entries) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) {
            if (e.name === 'node_modules' || e.name === '.git') continue;
            walkJs(full, acc);
        } else if (e.isFile() && /\.(js|cjs|mjs)$/.test(e.name)) {
            acc.push(full);
        }
    }
    return acc;
}

// --- Shape summarizer (for response diffing) ------------------------------
// Produces a stable, comparable description of a JSON value's structure
// (keys + value *types*), ignoring concrete values so diffs are about shape.
function shapeOf(value, depth = 0) {
    if (value === null || value === undefined) return 'null';
    if (depth > 5) return '…';
    const t = typeof value;
    if (t === 'number' || t === 'boolean' || t === 'string') return t;
    if (Array.isArray(value)) {
        if (value.length === 0) return 'array<>';
        return `array<${shapeOf(value[0], depth + 1)}>`;
    }
    if (t === 'object') {
        const keys = Object.keys(value).sort();
        const inner = keys.map((k) => `${k}:${shapeOf(value[k], depth + 1)}`);
        return `{${inner.join(',')}}`;
    }
    return t;
}

function rel(p) {
    return path.relative(REPO_ROOT, p).replace(/\\/g, '/');
}

/**
 * Load every artifact and return a merged view.
 * @returns {{
 *   warnings: string[],
 *   capture: {methods:Set<string>, samples:object, count:number, present:boolean},
 *   schema: {methods:Set<string>, schemas:object, present:boolean, sourceFile:string|null},
 *   inventory: {methods:Set<string>, present:boolean, fromSourceScan:boolean},
 *   discovered: Set<string>,   // capture ∪ schema (the "live"/known-to-exist universe)
 *   deckKnown: Set<string>,    // inventory (or source-scan fallback)
 *   allMethods: Set<string>,   // discovered ∪ deckKnown
 * }}
 */
function loadAll() {
    const warnings = [];
    const capture = loadCapture(warnings);
    const schema = loadSchema(warnings);
    const inventory = loadInventory(warnings);

    const discovered = union(capture.methods, schema.methods);
    const deckKnown = inventory.methods;
    const allMethods = union(discovered, deckKnown);

    return { warnings, capture, schema, inventory, discovered, deckKnown, allMethods, PATHS, rel };
}

function union(...sets) {
    const out = new Set();
    for (const s of sets) for (const v of s) out.add(v);
    return out;
}

module.exports = { loadAll, loadCapture, loadSchema, loadInventory, shapeOf, scanSourceForMethods, PATHS, REPO_ROOT, SRC_DIR, rel };
