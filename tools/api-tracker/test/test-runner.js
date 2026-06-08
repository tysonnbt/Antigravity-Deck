#!/usr/bin/env node
// === Antigravity LS Auto-Test / Diff Harness ===
//
// SAFETY FIRST. The default mode is structurally incapable of mutating IDE or
// workspace state: it replays ONLY methods classified read-only, and even then
// only when a live LS is found. Mutating methods are listed and SKIPPED unless
// the operator passes BOTH --include-unsafe AND --no-dry-run.
//
// Pipeline:
//   1. Load artifacts (capture jsonl, schema registry, inventory json) with
//      graceful degradation; derive the discovered + Deck-known method sets.
//   2. Classify every method's safety  → method-safety.json
//   3. Resolve a live LS (detector, or --port/--csrf) and replay SAFE methods
//      (sending the captured request body, or {} for no-arg Get*); record
//      status / decode / shape. UNSAFE methods: skipped (or printed under
//      --include-unsafe --dry-run; sent only under --include-unsafe --no-dry-run).
//   4. Diff discovered vs Deck-known + fold in replay results
//      → api-diff-report.md
//
// Usage:
//   node tools/api-tracker/test/test-runner.js [options]
//
// Options:
//   --port <n> --csrf <token>   Target a specific LS instance (skips detector).
//   --tls / --no-tls            Force TLS on/off for --port (default: auto-probe).
//   --include-unsafe            Include unsafe/unknown methods in the run.
//   --no-dry-run                With --include-unsafe: ACTUALLY SEND them. DANGER.
//   --dry-run                   Force dry-run (default). Unsafe are printed only.
//   --no-live                   Skip live replay entirely (classify + diff only).
//   --timeout <ms>              Per-call timeout (default 15000).
//   --only <A,B,C>              Restrict replay to these methods (still safety-gated).
//   --help                      Print this help.

const fs = require('fs');
const path = require('path');

const artifacts = require('./lib/artifacts');
const safetyLib = require('./lib/safety');
const transport = require('./lib/transport');
const diffLib = require('./lib/diff');

const OUT_DIR = __dirname;
const OUT = {
    safety: path.join(OUT_DIR, 'method-safety.json'),
    report: path.join(OUT_DIR, 'api-diff-report.md'),
    results: path.join(OUT_DIR, 'replay-results.json'),
};

function parseArgs(argv) {
    const args = {
        port: null, csrf: null, useTls: undefined,
        includeUnsafe: false, dryRun: true, live: true,
        timeout: 15000, only: null, help: false,
    };
    for (let i = 2; i < argv.length; i++) {
        const a = argv[i];
        switch (a) {
            case '--port': args.port = argv[++i]; break;
            case '--csrf': args.csrf = argv[++i]; break;
            case '--tls': args.useTls = true; break;
            case '--no-tls': args.useTls = false; break;
            case '--include-unsafe': args.includeUnsafe = true; break;
            case '--no-dry-run': args.dryRun = false; break;
            case '--dry-run': args.dryRun = true; break;
            case '--no-live': args.live = false; break;
            case '--timeout': args.timeout = parseInt(argv[++i], 10) || 15000; break;
            case '--only': args.only = String(argv[++i] || '').split(',').map((s) => s.trim()).filter(Boolean); break;
            case '--help': case '-h': args.help = true; break;
            default:
                if (a.startsWith('--')) log(`[!] Unknown flag ignored: ${a}`);
        }
    }
    return args;
}

function log(...m) { process.stdout.write(m.join(' ') + '\n'); }

function printHelp() {
    const header = fs.readFileSync(__filename, 'utf-8').split('\n').filter((l) => l.startsWith('//')).map((l) => l.slice(3)).join('\n');
    log(header);
}

async function main() {
    const args = parseArgs(process.argv);
    if (args.help) { printHelp(); return; }

    log('=== Antigravity LS Auto-Test / Diff Harness ===');
    log(`[mode] live-replay=${args.live} include-unsafe=${args.includeUnsafe} dry-run=${args.dryRun}`);
    log('');

    // --- 1. Load artifacts -------------------------------------------------
    const A = artifacts.loadAll();
    log(`[*] Artifacts loaded:`);
    log(`    capture:   present=${A.capture.present} rpcs=${A.capture.count} methods=${A.capture.methods.size} endpoints=${(A.capture.endpoints || []).length}`);
    const svcNames = Object.keys(A.schema.services || {});
    log(`    schema:    present=${A.schema.present} target='${A.schema.targetService}' methods=${A.schema.methods.size} (of ${svcNames.length} service(s))${A.schema.sourceFile ? ` (${A.schema.sourceFile})` : ''}`);
    log(`    inventory: present=${A.inventory.present} methods=${A.inventory.methods.size}${A.inventory.fromSourceScan ? ' (source-scan fallback)' : ''}`);
    log(`    => discovered=${A.discovered.size}, deck-known=${A.deckKnown.size}, all=${A.allMethods.size}`);
    if (A.warnings.length) { log('[!] Warnings:'); A.warnings.forEach((w) => log(`    - ${w}`)); }
    log('');

    // --- 2. Classify safety ------------------------------------------------
    const safety = safetyLib.classifyAll(A.allMethods);
    writeJson(OUT.safety, {
        generatedAt: new Date().toISOString(),
        scheme: safety.scheme,
        summary: safety.summary,
        methods: safety.methods,
    });
    log(`[✓] Wrote ${rel(OUT.safety)} (safe=${safety.summary.safe} unsafe=${safety.summary.unsafe} unknown=${safety.summary.unknown})`);
    log('');

    // --- 3. Resolve live LS + replay --------------------------------------
    const results = {};
    const liveMeta = { connected: false, source: 'disabled', port: null, useTls: null };

    if (args.live) {
        log('[*] Resolving live Language Server...');
        let live;
        try {
            live = await transport.resolveLiveInstance({
                port: args.port,
                csrf: args.csrf,
                useTls: args.useTls,
                captureEndpoints: (A.capture && A.capture.endpoints) || [],
            });
        } catch (e) {
            live = { conn: null, source: `error:${e.message}`, instances: [] };
        }
        liveMeta.source = live.source;
        if (live.conn) {
            liveMeta.connected = true;
            liveMeta.port = live.conn.port;
            liveMeta.useTls = live.conn.useTls;
            log(`[✓] Live LS via ${live.source}: port ${live.conn.port} (${live.conn.useTls ? 'https' : 'http'})`);
            await replayAll({ conn: live.conn, A, safety, args, results });
        } else {
            log(`[!] No live LS resolved (${live.source}). Replay skipped — classification + diff only.`);
            log('    To target one explicitly: --port <n> --csrf <token>');
        }
    } else {
        log('[*] --no-live: skipping replay (classification + diff only).');
    }
    log('');

    // Persist raw replay results for machine consumption.
    writeJson(OUT.results, { generatedAt: new Date().toISOString(), live: liveMeta, results });

    // --- 4. Diff + report --------------------------------------------------
    const diff = diffLib.computeDiff({
        discovered: A.discovered,
        deckKnown: A.deckKnown,
        safety,
        results,
        capture: A.capture,
    });

    const md = diffLib.renderReport({
        diff,
        safety,
        results,
        meta: {
            mode: describeMode(args),
            live: liveMeta,
            includeUnsafe: args.includeUnsafe,
            dryRun: args.dryRun,
            counts: { discovered: A.discovered.size, deckKnown: A.deckKnown.size, total: A.allMethods.size },
            warnings: A.warnings,
            schema: {
                targetService: A.schema.targetService,
                sourceFile: A.schema.sourceFile,
                services: Object.fromEntries(Object.entries(A.schema.services || {}).map(([k, v]) => [k, v.length])),
            },
        },
    });
    fs.writeFileSync(OUT.report, md, 'utf-8');
    log(`[✓] Wrote ${rel(OUT.report)}`);
    log('');

    // --- console summary ---
    log('=== Summary ===');
    log(`  NEW:      ${diff.newMethods.length}  (live exposes, Deck does not call)`);
    log(`  REMOVED:  ${diff.removedMethods.length}  (Deck calls, live 404/501)`);
    log(`  CHANGED:  ${diff.changedMethods.length}  (response shape differs)`);
    const replayed = Object.values(results).filter((r) => r.replayed);
    const tally = (label) => replayed.filter((r) => r.result === label).length;
    const skipped = Object.values(results).filter((r) => /skipped/.test(r.result)).length;
    log(`  Replay:   ${tally('pass')} pass, ${tally('reached-error')} reached-error, ${tally('needs-streaming')} needs-streaming, ${tally('removed')} removed, ${tally('fail')} fail, ${skipped} skipped`);
    log('');
    log('Outputs:');
    log(`  ${rel(OUT.safety)}`);
    log(`  ${rel(OUT.report)}`);
    log(`  ${rel(OUT.results)}`);

    // Cleanly exit (detector may leave timers / open handles).
    process.exit(0);
}

function describeMode(args) {
    if (!args.live) return 'classify+diff (no live)';
    if (args.includeUnsafe && !args.dryRun) return 'LIVE + UNSAFE SEND (danger)';
    if (args.includeUnsafe && args.dryRun) return 'safe-replay + unsafe dry-run';
    return 'safe-replay only (default)';
}

/**
 * Replay methods according to safety + flags.
 *   safe   → sent (always, when live).
 *   unsafe → skipped, unless --include-unsafe: then printed (dry-run) or sent
 *            only if --no-dry-run.
 *   unknown → treated like unsafe (conservative).
 */
async function replayAll({ conn, A, safety, args, results }) {
    // Replay universe = everything we know about; ordering: safe first.
    let methods = [...A.allMethods];
    if (args.only) {
        const want = new Set(args.only);
        methods = methods.filter((m) => want.has(m));
        log(`[*] --only filter active: ${methods.length} method(s).`);
    }
    methods.sort((a, b) => {
        const sa = safety.methods[a]?.safety === 'safe' ? 0 : 1;
        const sb = safety.methods[b]?.safety === 'safe' ? 0 : 1;
        return sa - sb || a.localeCompare(b);
    });

    let sentSafe = 0, sentUnsafe = 0, printed = 0, skipped = 0;

    for (const method of methods) {
        const klass = safety.methods[method]?.safety || 'unknown';
        const body = requestBodyFor(method, A);

        if (klass === 'safe') {
            const r = await sendAndRecord(conn, method, body, args.timeout, results, 'safe');
            sentSafe++;
            log(`  [safe]   ${method}: ${r.result} (status ${r.status ?? '—'}, ${r.bytes}b, ${r.decodeMode}${r.decoded ? '✓' : ''})`);
            continue;
        }

        // unsafe or unknown
        if (!args.includeUnsafe) {
            results[method] = skel(method, klass, 'skipped-unsafe', { replayed: false, detail: 'skipped (mutating/unknown; not included)' });
            skipped++;
            continue;
        }
        if (args.dryRun) {
            results[method] = skel(method, klass, 'skipped-dry-run', {
                replayed: false,
                detail: `DRY-RUN: would POST ${transport.RPC_BASE}/${method} body=${JSON.stringify(body).slice(0, 200)}`,
            });
            printed++;
            log(`  [DRY]    ${method} (${klass}): WOULD send body=${JSON.stringify(body).slice(0, 120)}`);
            continue;
        }
        // --include-unsafe AND --no-dry-run → actually send (explicit operator intent).
        const r = await sendAndRecord(conn, method, body, args.timeout, results, klass);
        sentUnsafe++;
        log(`  [UNSAFE] ${method}: ${r.result} (status ${r.status ?? '—'}) <-- SENT (operator opt-in)`);
    }

    log('');
    log(`[*] Replay done: ${sentSafe} safe sent, ${printed} unsafe printed (dry-run), ${sentUnsafe} unsafe sent, ${skipped} skipped.`);
}

// Pick the request body to replay: captured sample if available, else {}.
function requestBodyFor(method, A) {
    const sample = A.capture && A.capture.samples ? A.capture.samples[method] : null;
    if (sample && sample.requestBody && typeof sample.requestBody === 'object') return sample.requestBody;
    return {}; // no-arg Get* and anything without a capture
}

async function sendAndRecord(conn, method, body, timeoutMs, results, klass) {
    let out;
    try {
        out = await transport.rawCall(conn, method, body, { timeoutMs });
    } catch (e) {
        out = { ok: false, status: null, error: e.message, bytes: 0, decoded: false, decodeMode: 'none', responseShape: null };
    }
    const { result, detail } = classifyOutcome(method, out);
    results[method] = skel(method, klass, result, {
        replayed: true,
        status: out.status,
        bytes: out.bytes,
        decoded: out.decoded,
        decodeMode: out.decodeMode,
        responseShape: out.responseShape,
        detail,
    });
    return results[method];
}

// Translate an HTTP outcome into an honest result label. Existence-proving
// statuses (200/400/415/500) are NOT "fail" for diff purposes — only 404/501
// mean the method is gone. The empty/sample body we send often lacks required
// args (→ 400/500), and streaming RPCs reject application/json (→ 415); both
// still prove the method exists on the live LS.
function classifyOutcome(method, out) {
    const s = out.status;
    if (s === 0) return { result: 'pass', detail: 'stream closed (reached)' };
    if (s == null) return { result: 'fail', detail: out.error || 'no response (network/timeout)' };
    if (s >= 200 && s < 400) return { result: 'pass', detail: out.decoded ? `decoded ${out.decodeMode}` : `undecoded (${out.decodeMode})` };
    if (s === 404 || s === 501) return { result: 'removed', detail: `unimplemented (HTTP ${s})` };
    if (s === 415) return { result: 'needs-streaming', detail: 'rejected application/json (use gRPC-Web/proto framing for streams)' };
    if (s === 400 || s === 500) return { result: 'reached-error', detail: `exists but request rejected (HTTP ${s}; likely missing/invalid args for empty body)` };
    return { result: 'fail', detail: `HTTP ${s}` };
}

function skel(method, klass, result, extra) {
    return {
        method,
        safety: klass,
        result,
        replayed: false,
        status: null,
        bytes: 0,
        decoded: false,
        decodeMode: 'none',
        responseShape: null,
        detail: '',
        ...extra,
    };
}

function writeJson(file, obj) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, JSON.stringify(obj, null, 2), 'utf-8');
}

function rel(p) {
    return path.relative(transport.REPO_ROOT, p).replace(/\\/g, '/');
}

main().catch((e) => {
    log(`[FATAL] ${e.stack || e.message}`);
    process.exit(1);
});
