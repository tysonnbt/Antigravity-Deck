#!/usr/bin/env node
// === Antigravity LS API Auto-Scanner ===
//
// Fully autonomous (no manual UI interaction). Resolves the live LS, then:
//   Tier 1  — calls every SAFE no-arg read method with {}.
//   Tier 2  — calls SAFE parameterized reads, filling inputs from harvested IDs.
//   Tier 3  — sandbox: creates a THROWAWAY cascade, sends "ping", captures the
//             send-message flow, then deletes the throwaway. (opt-in: --tier=3)
//   Tier 4  — aggressive echo-back: reversible Get→Set round-trips. (opt-in)
//
// NEVER calls anything in lib/policy.js#DESTRUCTIVE. All persisted samples are
// redacted (lib/redact.js). Output: api-catalog.json + api-catalog.md.
//
//   node tools/api-tracker/autoscan/autoscan.js                 # tiers 1,2
//   node tools/api-tracker/autoscan/autoscan.js --tier=1,2,3    # + sandbox
//   node tools/api-tracker/autoscan/autoscan.js --port 50934 --csrf <token>

const fs = require('fs');
const path = require('path');
const { resolveLiveInstance, rawCall, REPO_ROOT } = require(path.join('..', 'test', 'lib', 'transport'));
const { classifyMethod } = require(path.join('..', 'test', 'lib', 'safety'));
const { redact, redactSample } = require('./lib/redact');
const { isDestructive, ECHO_BACK } = require('./lib/policy');
const { harvest } = require('./lib/id-harvester');
const { buildBody } = require('./lib/body-builder');

const SCHEMA_DIR = path.resolve(__dirname, '..', 'schema');
const TARGET_FQ = 'exa.language_server_pb.LanguageServerService';

function parseArgs() {
    const a = process.argv.slice(2);
    const get = (flag) => {
        const eq = a.find((x) => x.startsWith(`${flag}=`));
        if (eq) return eq.slice(flag.length + 1);
        const i = a.indexOf(flag);
        return i > -1 ? a[i + 1] : undefined;
    };
    const tierArg = get('--tier') || '1,2';
    return {
        tiers: new Set(tierArg.split(',').map((s) => Number(s.trim())).filter(Boolean)),
        port: get('--port'),
        csrf: get('--csrf'),
        outDir: get('--out') || __dirname,
    };
}

function loadRegistry() {
    const reg = JSON.parse(fs.readFileSync(path.join(SCHEMA_DIR, 'rpc-registry.json'), 'utf-8'));
    const svc = reg.find((s) => s.fqService === TARGET_FQ);
    if (!svc) throw new Error(`${TARGET_FQ} not in registry`);
    const byMethod = {};
    for (const m of svc.methods) byMethod[m.name] = m;
    return { methods: svc.methods.slice().sort((x, y) => x.name.localeCompare(y.name)), byMethod };
}

function loadMessages() {
    try { return JSON.parse(fs.readFileSync(path.join(SCHEMA_DIR, 'messages.json'), 'utf-8')).messages || {}; }
    catch { return {}; }
}

async function callAndRecord(conn, method, body, tier, entry) {
    const r = await rawCall(conn, method, body, { timeoutMs: 12000 });
    entry.called = true;
    entry.tier = tier;
    entry.status = r.status;
    entry.ok = r.ok;
    entry.decodeMode = r.decodeMode;
    entry.respShape = r.responseShape;
    entry.sampleReq = redact(body);
    entry.sampleResp = redactSample(r.json != null ? r.json : (r.bytes ? `<${r.bytes} bytes ${r.contentType || ''}>` : null));
    entry.outcome = r.status == null ? `error:${r.error}` : (r.ok ? 'pass' : (r.status === 404 || r.status === 501 ? 'removed' : `http-${r.status}`));
    return r;
}

async function runReadTiers(conn, methods, byMethod, messages, ids, tiers, catalog) {
    for (const m of methods) {
        const cls = classifyMethod(m.name);
        const entry = {
            method: m.name, rpcPath: m.rpcPath, kind: m.kind, input: m.input, output: m.output,
            safety: cls.safety, safetyReason: cls.reason,
            called: false, tier: null, status: null, ok: null, outcome: null,
            decodeMode: null, respShape: null, sampleReq: null, sampleResp: null, note: null,
        };
        try {
            if (isDestructive(m.name)) {
                entry.note = 'destructive — never auto-called';
            } else if (cls.safety === 'safe' && m.kind === 'unary') {
                const built = buildBody(m.name, byMethod, messages, ids);
                const hasFields = built.filled.length + built.missing.length > 0;
                if (!hasFields) {
                    if (tiers.has(1)) await callAndRecord(conn, m.name, {}, 1, entry);
                    else entry.note = 'tier1 disabled';
                } else if (tiers.has(2)) {
                    if (!built.filled.length) entry.note = `tier2: no live ids for [${built.missing.join(', ')}]`;
                    else { await callAndRecord(conn, m.name, built.body, 2, entry); entry.note = `filled [${built.filled.join(', ')}]`; }
                } else entry.note = 'tier2 disabled';
            } else if (cls.safety === 'safe') {
                entry.note = `streaming read (${m.kind}) — use capture tool for sample`;
            } else {
                entry.note = `${cls.safety} — not a read tier`;
            }
        } catch (e) { entry.note = `error: ${e.message || e}`; }
        catalog.push(entry);
    }
}

// Tier 4: reversible Get→Set echo-back (aggressive but net-zero state change).
async function runEchoBack(conn, catalog) {
    for (const [setM, cfg] of Object.entries(ECHO_BACK)) {
        const entry = catalog.find((e) => e.method === setM);
        if (!entry || isDestructive(setM)) continue;
        try {
            const rd = await rawCall(conn, cfg.read, {}, { timeoutMs: 8000 });
            if (!rd.json) { entry.note = `echo-back: read ${cfg.read} returned no json (status ${rd.status})`; continue; }
            const w = await rawCall(conn, setM, rd.json, { timeoutMs: 8000 });
            entry.called = true; entry.tier = 4; entry.status = w.status; entry.ok = w.ok;
            entry.outcome = w.ok ? 'pass' : `http-${w.status}`;
            entry.sampleReq = redactSample(rd.json); entry.sampleResp = redactSample(w.json);
            entry.note = `echo-back via ${cfg.read} (read→write identical)`;
        } catch (e) { entry.note = `echo-back error: ${e.message || e}`; }
    }
}

// Tier 3: throwaway cascade to capture the real send-message flow, then delete.
async function runSandbox(conn, catalog, log) {
    const result = { steps: [] };
    let cascade;
    try { cascade = require(path.join(REPO_ROOT, 'src', 'cascade')); }
    catch (e) { log('sandbox: cannot load src/cascade.js: ' + e.message); return; }
    try {
        // StartCascade now REQUIRES `source` (Antigravity 2.0.11). Empty {} → 400
        // "CortexTrajectorySource is unspecified". (src/cascade.js still sends {} → broken.)
        const sc = await rawCall(conn, 'StartCascade',
            { source: 'CORTEX_TRAJECTORY_SOURCE_CASCADE_CLIENT', trajectoryType: 'CORTEX_TRAJECTORY_TYPE_CASCADE' },
            { timeoutMs: 8000 });
        const cascadeId = sc.json && (sc.json.cascadeId || sc.json.conversationId || sc.json.id);
        result.steps.push({ step: 'StartCascade', cascadeId: cascadeId || null, ok: !!cascadeId });
        markSandbox(catalog, 'StartCascade', !!cascadeId, sc);
        if (!cascadeId) { log(`sandbox: StartCascade returned no id (status ${sc.status}); aborting`); return; }

        const sent = await cascade.sendMessage(cascadeId, 'ping (autoscan sandbox — please ignore)').catch((e) => ({ _err: e.message }));
        result.steps.push({ step: 'SendUserCascadeMessage', ok: !sent._err, err: sent._err || null });
        markSandbox(catalog, 'SendUserCascadeMessage', !sent._err);

        // Capture the turn diff for the throwaway.
        const diff = await rawCall(conn, 'GetTurnDiff', { conversationId: cascadeId, stepIndex: 0 }, { timeoutMs: 8000 });
        markSandbox(catalog, 'GetTurnDiff', diff.ok, diff);

        // Clean up: delete the throwaway (bypasses the policy guard intentionally — it's our own convo).
        // DeleteCascadeTrajectoryRequest's field is `cascadeId` (NOT conversationId — an unknown
        // field is silently ignored, returning 200 without deleting).
        const del = await rawCall(conn, 'DeleteCascadeTrajectory', { cascadeId }, { timeoutMs: 8000 });
        result.steps.push({ step: 'DeleteCascadeTrajectory', ok: del.ok || del.status === 0 });
        log(`sandbox: created+deleted throwaway cascade ${cascadeId} (delete ok=${del.ok || del.status === 0})`);
    } catch (e) { log('sandbox error: ' + (e.message || e)); }
    return result;
}

function markSandbox(catalog, method, ok, r) {
    const e = catalog.find((x) => x.method === method);
    if (!e) return;
    e.called = true; e.tier = 3; e.ok = ok; e.outcome = ok ? 'pass' : 'fail';
    if (r) { e.status = r.status; e.respShape = r.responseShape; e.sampleResp = redactSample(r.json); }
    e.note = (e.note ? e.note + '; ' : '') + 'sandbox';
}

function findFirst(obj, keyRe, depth = 0) {
    if (obj == null || depth > 6) return null;
    if (typeof obj === 'object') {
        for (const [k, v] of Object.entries(obj)) {
            if (keyRe.test(k) && (typeof v === 'string' || typeof v === 'number')) return String(v);
            const inner = findFirst(v, keyRe, depth + 1);
            if (inner) return inner;
        }
    }
    return null;
}

function writeCatalog(catalog, meta, outDir) {
    const redactedMeta = redact(meta);
    fs.writeFileSync(path.join(outDir, 'api-catalog.json'), JSON.stringify({ meta: redactedMeta, methods: catalog }, null, 2), 'utf-8');

    const called = catalog.filter((e) => e.called);
    const byOutcome = (o) => called.filter((e) => e.outcome === o).length;
    const lines = [];
    lines.push(`# LS API Catalog — autoscan`);
    lines.push('');
    lines.push(`Generated against a live LS (${meta.source}). Tiers run: ${meta.tiers.join(', ')}.`);
    lines.push('');
    lines.push(`- Total methods: **${catalog.length}**`);
    lines.push(`- Called this run: **${called.length}** (pass ${byOutcome('pass')}, removed ${byOutcome('removed')}, errors ${called.filter((e) => /^error|^http-5/.test(e.outcome || '')).length})`);
    lines.push(`- Safe ${catalog.filter((e) => e.safety === 'safe').length} / unsafe ${catalog.filter((e) => e.safety === 'unsafe').length} / unknown ${catalog.filter((e) => e.safety === 'unknown').length}`);
    lines.push('');
    lines.push('| Method | Safety | Kind | Called | Outcome | Resp shape | Note |');
    lines.push('|---|---|---|---|---|---|---|');
    for (const e of catalog) {
        lines.push(`| ${e.method} | ${e.safety} | ${e.kind} | ${e.called ? '✓' : ''} | ${e.outcome || ''} | ${(e.respShape || '').slice(0, 40)} | ${(e.note || '').slice(0, 60)} |`);
    }
    fs.writeFileSync(path.join(outDir, 'api-catalog.md'), lines.join('\n'), 'utf-8');
}

async function main() {
    const args = parseArgs();
    const log = (m) => console.log(`  [autoscan] ${m}`);
    log(`tiers: ${[...args.tiers].join(', ')}`);

    const { conn, source } = await resolveLiveInstance({ port: args.port, csrf: args.csrf });
    if (!conn) { console.error('❌ No live LS instance found (open Antigravity or pass --port/--csrf).'); process.exit(2); }
    log(`live LS via ${source}: ${conn.host}:${conn.port} (tls=${conn.useTls})`);

    const { methods, byMethod } = loadRegistry();
    const messages = loadMessages();
    log(`registry: ${methods.length} methods, ${Object.keys(messages).length} message schemas`);

    let ids = { conversationIds: [], trajectoryIds: [], workspaceUris: [], modelIds: [] };
    if (args.tiers.has(2) || args.tiers.has(3)) {
        ids = await harvest(conn);
        log(`harvested ids: ${ids.conversationIds.length} conv, ${ids.trajectoryIds.length} traj, ${ids.workspaceUris.length} ws, ${ids.modelIds.length} model`);
    }

    const catalog = [];
    await runReadTiers(conn, methods, byMethod, messages, ids, args.tiers, catalog);
    if (args.tiers.has(4)) { log('running tier 4 (echo-back) — aggressive'); await runEchoBack(conn, catalog); }
    if (args.tiers.has(3)) { log('running tier 3 (sandbox cascade)'); await runSandbox(conn, catalog, log); }

    writeCatalog(catalog, { source, host: conn.host, port: conn.port, tiers: [...args.tiers], ids }, args.outDir);
    const called = catalog.filter((e) => e.called);
    log(`done. called ${called.length}/${catalog.length}. catalog → tools/api-tracker/autoscan/api-catalog.{json,md}`);
}

main().catch((e) => { console.error('autoscan fatal:', e); process.exit(1); });
