// === API Tracker — orchestrates LS API scans from within the Deck ===
//
// Runs the standalone autoscan tool (tools/api-tracker/autoscan) as a child
// process (single-flight) and exposes its catalog + the extracted registry.
// Spawned out-of-process so a long scan never blocks the request thread, and so
// the tracker tooling stays decoupled from the server runtime.

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const AUTOSCAN = path.join(ROOT, 'tools', 'api-tracker', 'autoscan', 'autoscan.js');
const CATALOG = path.join(ROOT, 'tools', 'api-tracker', 'autoscan', 'api-catalog.json');
const REGISTRY = path.join(ROOT, 'tools', 'api-tracker', 'schema', 'rpc-registry.json');

const MAX_LOG_LINES = 200;
const COOLDOWN_MS = 30 * 1000; // min gap between scans (anti-spam)
const VALID_TIERS = /^[1-4](,[1-4])*$/;

let _state = { running: false, tiers: null, startedAt: null, finishedAt: null, exitCode: null, log: [] };
let _child = null;

// Strip secrets/PII from any child stdout/stderr before it is held in memory or
// returned via /status (the autoscan tool can surface CSRF tokens / emails).
function redactLine(s) {
    return String(s)
        .replace(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g, '[REDACTED-JWT]')
        .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, '[REDACTED-UUID]')
        .replace(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g, '[REDACTED-EMAIL]')
        .replace(/\b[a-f0-9]{32,}\b/gi, '[REDACTED-HEX]');
}

function pushLog(chunk) {
    for (const line of String(chunk).split(/\r?\n/)) {
        if (line.trim()) _state.log.push(redactLine(line));
    }
    if (_state.log.length > MAX_LOG_LINES) _state.log = _state.log.slice(-MAX_LOG_LINES);
}

function killChild() {
    if (_child) { try { _child.kill(); } catch { /* already gone */ } _child = null; }
}
process.on('exit', killChild);
process.on('SIGINT', killChild);
process.on('SIGTERM', killChild);

/** Start a scan. tiers e.g. "1,2". Tiers 3/4 have side effects (agent run / echo-back). */
function startScan({ tiers = '1,2' } = {}) {
    if (_state.running) return { ok: false, error: 'A scan is already running', status: getStatus() };
    if (typeof tiers !== 'string' || !VALID_TIERS.test(tiers)) {
        return { ok: false, error: 'Invalid tiers — expected a comma list of 1-4, e.g. "1,2"' };
    }
    if (_state.finishedAt && Date.now() - _state.finishedAt < COOLDOWN_MS) {
        return { ok: false, error: 'Scan cooldown active — wait a moment before starting another scan' };
    }
    if (!fs.existsSync(AUTOSCAN)) return { ok: false, error: 'autoscan tool not found' };

    _state = { running: true, tiers, startedAt: Date.now(), finishedAt: null, exitCode: null, log: [] };
    try {
        _child = spawn(process.execPath, [AUTOSCAN, `--tier=${tiers}`], { cwd: ROOT });
    } catch (e) {
        _state.running = false; _state.finishedAt = Date.now(); _state.exitCode = -1;
        return { ok: false, error: `spawn failed: ${e.message}` };
    }
    _child.stdout.on('data', pushLog);
    _child.stderr.on('data', pushLog);
    _child.on('exit', (code) => { _state.running = false; _state.finishedAt = Date.now(); _state.exitCode = code; _child = null; });
    _child.on('error', (e) => { _state.running = false; _state.finishedAt = Date.now(); _state.exitCode = -1; pushLog(`spawn error: ${e.message}`); _child = null; });
    return { ok: true, running: true, tiers };
}

function getStatus() {
    return {
        running: _state.running,
        tiers: _state.tiers,
        startedAt: _state.startedAt,
        finishedAt: _state.finishedAt,
        exitCode: _state.exitCode,
        log: _state.log.slice(-50),
    };
}

function readJson(file) {
    try {
        return JSON.parse(fs.readFileSync(file, 'utf-8'));
    } catch (e) {
        if (e.code !== 'ENOENT') console.warn(`[api-tracker] failed to read ${path.basename(file)}: ${e.message}`);
        return null;
    }
}

/** The last scan's catalog (per-method outcomes + redacted samples), or null. */
function readCatalog() { return readJson(CATALOG); }

/** The full extracted RPC registry (every service + method + I/O type). */
function readRegistry() { return readJson(REGISTRY); }

module.exports = { startScan, getStatus, readCatalog, readRegistry };
