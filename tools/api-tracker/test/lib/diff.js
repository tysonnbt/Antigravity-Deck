// === Diff Engine + Report Renderer ===
//
// Computes the method-level delta between the discovered ("live") universe and
// the Deck's known set, folds in per-method replay results, and renders the
// api-diff-report.md.
//
// Categories:
//   NEW      : discovered (capture/schema) but NOT in Deck inventory.
//   REMOVED  : Deck uses it, but live LS no longer exposes it — detected at
//              replay time via 404 / 501 / "unimplemented". (Only methods that
//              were actually replayed can be flagged REMOVED; otherwise they're
//              reported as "deck-only, unverified".)
//   CHANGED  : request/response shape differs between the captured sample and
//              the live replay response.
//   per-method test result: pass / fail / skipped-unsafe / skipped-dry-run.

const HTTP_UNIMPLEMENTED = new Set([404, 501]);

/**
 * @param {object} args
 * @param {Set<string>} args.discovered   capture ∪ schema
 * @param {Set<string>} args.deckKnown    inventory / source scan
 * @param {object} args.safety            classifyAll() output {.methods}
 * @param {Record<string, object>} args.results  method → replay outcome (see runner)
 * @param {object} args.capture           capture artifact (for sample shapes)
 */
function computeDiff({ discovered, deckKnown, safety, results, capture }) {
    const all = new Set([...discovered, ...deckKnown, ...Object.keys(results || {})]);

    const newMethods = [];
    const removedMethods = [];
    const unimplemented = []; // schema-declared but 404/501, NOT in Deck inventory
    const deckOnlyUnverified = [];
    const changedMethods = [];
    const present = [];

    for (const m of [...all].sort()) {
        const inLive = discovered.has(m);
        const inDeck = deckKnown.has(m);
        const res = results ? results[m] : undefined;
        const isUnimpl = res && res.replayed && HTTP_UNIMPLEMENTED.has(res.status);

        // REMOVED detection: Deck knows it, replay says unimplemented.
        if (inDeck && isUnimpl) {
            removedMethods.push({ method: m, status: res.status });
            continue;
        }
        // Schema-declared but unimplemented on this build (not a Deck regression,
        // but useful: tells maintainers which API surface this LS does not serve).
        if (!inDeck && isUnimpl) {
            unimplemented.push({ method: m, status: res.status });
        }
        // Deck-only but never confirmed against live (not in discovered, not replayed-as-removed).
        if (inDeck && !inLive && !(res && res.replayed)) {
            deckOnlyUnverified.push({ method: m });
        }
        // NEW: live exposes it, Deck does not.
        if (inLive && !inDeck) {
            newMethods.push({ method: m });
        }
        // present in both
        if (inLive && inDeck) present.push(m);

        // CHANGED: compare captured sample shape vs live replay shape.
        // Only when BOTH sides are structured (object/array) shapes — if either
        // degraded to a scalar (string/null/number), that's a capture-decode
        // artifact (lossy gRPC-Web framing in the CDP string), not a real change.
        const sample = capture && capture.samples ? capture.samples[m] : null;
        if (sample && res && res.replayed && isStructuredShape(res.responseShape) && isStructuredShape(sample.responseShape)) {
            if (normalizeShape(sample.responseShape) !== normalizeShape(res.responseShape)) {
                changedMethods.push({
                    method: m,
                    capturedShape: sample.responseShape,
                    liveShape: res.responseShape,
                });
            }
        }
    }

    return { newMethods, removedMethods, unimplemented, deckOnlyUnverified, changedMethods, present, total: all.size };
}

// Shapes can differ only in array element ordering of keys; normalize spacing.
function normalizeShape(s) {
    return typeof s === 'string' ? s.replace(/\s+/g, '') : s;
}

// A "structured" shape string starts with { or array< — i.e. it described an
// object or array, not a degraded scalar.
function isStructuredShape(s) {
    return typeof s === 'string' && (s.startsWith('{') || s.startsWith('array<'));
}

// --- Markdown rendering ---------------------------------------------------
function renderReport({ diff, safety, results, meta }) {
    const L = [];
    const now = new Date().toISOString();

    L.push('# Antigravity LS — API Diff & Test Report');
    L.push('');
    L.push(`_Generated: ${now}_`);
    L.push('');

    // --- Run context ---
    L.push('## Run context');
    L.push('');
    L.push(`- Mode: **${meta.mode}**`);
    L.push(`- Live LS: ${meta.live.connected ? `connected via \`${meta.live.source}\` (port ${meta.live.port}, ${meta.live.useTls ? 'https' : 'http'})` : `**not connected** (${meta.live.source}) — replay skipped`}`);
    L.push(`- Unsafe replay: ${meta.includeUnsafe ? (meta.dryRun ? 'dry-run (printed, not sent)' : '**LIVE (sent)**') : 'disabled'}`);
    L.push(`- Methods: discovered=${meta.counts.discovered}, deck-known=${meta.counts.deckKnown}, total=${meta.counts.total}`);
    L.push(`- Safety: safe=${safety.summary.safe}, unsafe=${safety.summary.unsafe}, unknown=${safety.summary.unknown}`);
    if (meta.schema) {
        L.push(`- Schema source: \`${meta.schema.sourceFile || 'n/a'}\`, target service: \`${meta.schema.targetService}\``);
        const svc = meta.schema.services || {};
        const svcNames = Object.keys(svc);
        if (svcNames.length) {
            const top = svcNames.sort((a, b) => svc[b] - svc[a]).slice(0, 12).map((n) => `${n}(${svc[n]})`).join(', ');
            L.push(`- Services in descriptors (${svcNames.length}): ${top}${svcNames.length > 12 ? ', …' : ''}`);
        }
    }
    if (meta.warnings && meta.warnings.length) {
        L.push('');
        L.push('### Artifact warnings');
        for (const w of meta.warnings) L.push(`- ${w}`);
    }
    L.push('');

    // --- Summary counts ---
    L.push('## Diff summary');
    L.push('');
    L.push('| Category | Count |');
    L.push('| --- | ---: |');
    L.push(`| NEW (live, not in Deck) | ${diff.newMethods.length} |`);
    L.push(`| REMOVED (Deck uses, live 404/501) | ${diff.removedMethods.length} |`);
    L.push(`| CHANGED (response shape differs) | ${diff.changedMethods.length} |`);
    L.push(`| Deck-only, unverified | ${diff.deckOnlyUnverified.length} |`);
    L.push(`| Present in both | ${diff.present.length} |`);
    L.push('');

    // --- NEW ---
    L.push('## NEW methods (live exposes, Deck does not call)');
    L.push('');
    if (diff.newMethods.length === 0) L.push('_None._');
    else {
        L.push('| Method | Safety | Replay result |');
        L.push('| --- | --- | --- |');
        for (const n of diff.newMethods) {
            const s = sf(safety, n.method);
            L.push(`| \`${n.method}\` | ${badge(s)} | ${resultCell(results, n.method)} |`);
        }
    }
    L.push('');

    // --- REMOVED ---
    L.push('## REMOVED methods (Deck calls, live LS returned unimplemented)');
    L.push('');
    if (diff.removedMethods.length === 0) L.push('_None detected (only flagged when a replay returned 404/501)._');
    else {
        L.push('| Method | Status |');
        L.push('| --- | --- |');
        for (const r of diff.removedMethods) L.push(`| \`${r.method}\` | ${r.status} |`);
    }
    L.push('');

    // --- UNIMPLEMENTED (schema-declared, not Deck-used, 404/501) ---
    L.push('## Schema-declared but unimplemented on this LS build');
    L.push('');
    L.push('_In the proto descriptors but the live LS returned 404/501. Not a Deck regression — the Deck does not call these — but documents which schema surface this build does not serve._');
    L.push('');
    if (!diff.unimplemented || diff.unimplemented.length === 0) L.push('_None detected._');
    else {
        L.push('| Method | Status |');
        L.push('| --- | --- |');
        for (const r of diff.unimplemented) L.push(`| \`${r.method}\` | ${r.status} |`);
    }
    L.push('');

    // --- CHANGED ---
    L.push('## CHANGED methods (response shape differs: captured vs live)');
    L.push('');
    if (diff.changedMethods.length === 0) L.push('_None detected._');
    else {
        for (const c of diff.changedMethods) {
            L.push(`### \`${c.method}\``);
            L.push('');
            L.push('```diff');
            L.push(`- captured: ${truncate(c.capturedShape, 600)}`);
            L.push(`+ live:     ${truncate(c.liveShape, 600)}`);
            L.push('```');
            L.push('');
        }
    }

    // --- Deck-only unverified ---
    if (diff.deckOnlyUnverified.length) {
        L.push('## Deck-only (unverified against live)');
        L.push('');
        L.push('_These are in the Deck inventory but were not seen in capture/schema and were not replayed (or replay was skipped). Not necessarily removed._');
        L.push('');
        for (const d of diff.deckOnlyUnverified) L.push(`- \`${d.method}\` (${badge(sf(safety, d.method))})`);
        L.push('');
    }

    // --- Per-method replay results ---
    L.push('## Per-method replay results');
    L.push('');
    L.push('| Method | Safety | Result | Status | Decode | Bytes | Detail |');
    L.push('| --- | --- | --- | ---: | --- | ---: | --- |');
    const methods = Object.keys(results || {}).sort();
    for (const m of methods) {
        const r = results[m];
        L.push(`| \`${m}\` | ${badge(sf(safety, m))} | ${r.result} | ${r.status == null ? '—' : r.status} | ${r.decodeMode || '—'}${r.decoded ? '✓' : ''} | ${r.bytes || 0} | ${escapeCell(r.detail || '')} |`);
    }
    if (methods.length === 0) L.push('| _none_ | | | | | | |');
    L.push('');

    // --- Full safety table ---
    L.push('## Full method → safety classification');
    L.push('');
    L.push('| Method | Safety | Source | Reason |');
    L.push('| --- | --- | --- | --- |');
    for (const m of Object.keys(safety.methods).sort()) {
        const v = safety.methods[m];
        L.push(`| \`${m}\` | ${badge(v.safety)} | ${v.source} | ${escapeCell(v.reason)} |`);
    }
    L.push('');

    return L.join('\n');
}

function sf(safety, method) {
    return safety.methods[method] ? safety.methods[method].safety : 'unknown';
}
function badge(s) {
    if (s === 'safe') return 'safe';
    if (s === 'unsafe') return '**unsafe**';
    return 'unknown';
}
function resultCell(results, method) {
    const r = results && results[method];
    if (!r) return '—';
    return `${r.result}${r.status != null ? ` (${r.status})` : ''}`;
}
function escapeCell(s) {
    return String(s).replace(/\|/g, '\\|').replace(/\n/g, ' ');
}
function truncate(s, n) {
    s = String(s);
    return s.length > n ? `${s.slice(0, n)}…` : s;
}

module.exports = { computeDiff, renderReport, HTTP_UNIMPLEMENTED };
