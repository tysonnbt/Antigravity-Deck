// === Safety Classification Engine ===
//
// Classifies every LanguageServerService method into one of three buckets:
//   - "safe"    : read-only / non-mutating. Eligible for automatic replay.
//   - "unsafe"  : mutating / side-effecting. NEVER auto-invoked.
//   - "unknown" : ambiguous. Treated as unsafe for execution purposes.
//
// CONSERVATIVE BY DESIGN: anything that is not provably read-only is withheld
// from automatic replay. The classifier returns a structured verdict so the
// runner can surface *why* a method landed in a given bucket.

const SAFETY = Object.freeze({
    SAFE: 'safe',
    UNSAFE: 'unsafe',
    UNKNOWN: 'unknown',
});

// --- Explicit overrides ---------------------------------------------------
// Some method names look safe/unsafe by prefix but need a hand-tuned verdict.
// Keys are exact method names. These win over every heuristic below.
const OVERRIDES = Object.freeze({
    // RecordAnalyticsEvent: a write to the analytics pipeline. The prompt flags
    // it with a "?" — being conservative, telemetry emission is a side effect
    // (it can create server-side records / influence rate limits), so UNSAFE.
    RecordAnalyticsEvent: SAFETY.UNSAFE,

    // GetTurnDiff / GetCascadeTrajectorySteps etc. are pure reads even though
    // "Turn"/"Diff" could look state-y. Pin them safe.
    GetTurnDiff: SAFETY.SAFE,

    // StatUri: a filesystem stat — read-only.
    StatUri: SAFETY.SAFE,

    // GetStandaloneDir / GetRepoInfos / GetAgentScripts / GetMcpServerStates:
    // plain getters, safe (covered by Get* heuristic, listed for clarity).
    GetStandaloneDir: SAFETY.SAFE,
    GetRepoInfos: SAFETY.SAFE,
    GetAgentScripts: SAFETY.SAFE,
    GetMcpServerStates: SAFETY.SAFE,

    // RequestAgentStatePageUpdate: despite "Request"/"Update" in the name, this
    // is a *pull* — it asks the LS to (re)send a page of agent state to the
    // client. It does not mutate IDE/workspace state. However, being
    // conservative about anything with "Update" in it, we keep it UNKNOWN so it
    // is never auto-replayed without an explicit opt-in.
    RequestAgentStatePageUpdate: SAFETY.UNKNOWN,
});

// --- Heuristic rule table -------------------------------------------------
// Ordered list. First matching rule decides. UNSAFE rules are checked before
// SAFE rules so that e.g. "UpdateConversationAnnotations" (Update*) cannot be
// mis-claimed by a broad read pattern.
//
// Each rule: { test: (name) => bool, verdict, reason }
const RULES = [
    // ---- UNSAFE (mutating / side-effecting) ----
    rule(/^Jetbox.*Write/i, SAFETY.UNSAFE, 'Jetbox write — persists agent/file state'),
    rule(/Write(State|File|s)?$/i, SAFETY.UNSAFE, 'Write* — persists state'),
    rule(/^Update/i, SAFETY.UNSAFE, 'Update* — mutates server/IDE state'),
    rule(/^Delete/i, SAFETY.UNSAFE, 'Delete* — removes state'),
    rule(/^Remove/i, SAFETY.UNSAFE, 'Remove* — removes state'),
    rule(/^Create/i, SAFETY.UNSAFE, 'Create* — creates state'),
    rule(/^Start/i, SAFETY.UNSAFE, 'Start* — starts an invocation/agent run'),
    rule(/^Send/i, SAFETY.UNSAFE, 'Send* — emits a message / drives the agent'),
    rule(/^Cancel/i, SAFETY.UNSAFE, 'Cancel* — interrupts a running invocation'),
    rule(/^Accept/i, SAFETY.UNSAFE, 'Accept* — applies a proposed diff/change'),
    rule(/^Reject/i, SAFETY.UNSAFE, 'Reject* — discards a proposed diff/change'),
    rule(/^Apply/i, SAFETY.UNSAFE, 'Apply* — applies a change'),
    rule(/^Save/i, SAFETY.UNSAFE, 'Save* — persists content (e.g. SaveMediaAsArtifact)'),
    rule(/^Install/i, SAFETY.UNSAFE, 'Install* — installs a plugin/extension'),
    rule(/^Uninstall/i, SAFETY.UNSAFE, 'Uninstall* — removes a plugin/extension'),
    rule(/^Set/i, SAFETY.UNSAFE, 'Set* — sets configuration/state'),
    rule(/^Add(Tracked)?/i, SAFETY.UNSAFE, 'Add* / AddTracked* — adds tracked resources'),
    rule(/Handle.*Interaction/i, SAFETY.UNSAFE, 'Handle*Interaction — drives the agent on user input'),
    rule(/^Handle/i, SAFETY.UNSAFE, 'Handle* — processes an interaction (side-effecting)'),
    rule(/^Execute/i, SAFETY.UNSAFE, 'Execute* — runs an action/command'),
    rule(/^Run/i, SAFETY.UNSAFE, 'Run* — runs a command'),
    rule(/^Restart/i, SAFETY.UNSAFE, 'Restart* — restarts a service'),
    rule(/^Refresh/i, SAFETY.UNSAFE, 'Refresh* — may trigger re-indexing side effects'),
    rule(/Annotations?$/i, SAFETY.UNSAFE, '*Annotations — annotation mutation'),
    // Mutating verbs that share a prefix with a SAFE rule — listed BEFORE the
    // SAFE table so they are never mis-claimed (e.g. Checkout* vs Check*).
    rule(/^Checkout/i, SAFETY.UNSAFE, 'Checkout* — checks out a worktree/branch (mutates state)'),

    // ---- SAFE (read-only) ----
    // Stream* is split: a *read* stream (StateUpdates / ReactiveUpdates) is a
    // subscription that does not mutate. But Stream* that drives input would be
    // unsafe — none are known, so we treat Stream<...>Updates as safe reads and
    // leave any other Stream* as UNKNOWN (handled after the table).
    rule(/^Stream.*Updates?$/i, SAFETY.SAFE, 'Stream*Updates — read-only subscription'),
    rule(/^Get/i, SAFETY.SAFE, 'Get* — pure read'),
    rule(/^List/i, SAFETY.SAFE, 'List* — pure read'),
    rule(/^Stat/i, SAFETY.SAFE, 'Stat* — filesystem/resource stat (read-only)'),
    rule(/^Read/i, SAFETY.SAFE, 'Read* — pure read'),
    rule(/^Fetch/i, SAFETY.SAFE, 'Fetch* — pure read'),
    rule(/^Find/i, SAFETY.SAFE, 'Find* — pure read'),
    rule(/^Search/i, SAFETY.SAFE, 'Search* — pure read (query only)'),
    rule(/^Check/i, SAFETY.SAFE, 'Check* — read-only validation'),
    rule(/^Query/i, SAFETY.SAFE, 'Query* — pure read'),
];

function rule(re, verdict, reason) {
    return { test: (name) => re.test(name), verdict, reason };
}

/**
 * Classify a single method name.
 * @param {string} method
 * @returns {{ method: string, safety: 'safe'|'unsafe'|'unknown', reason: string, source: string }}
 */
function classifyMethod(method) {
    if (typeof method !== 'string' || !method.length) {
        return { method: String(method), safety: SAFETY.UNKNOWN, reason: 'empty/invalid method name', source: 'invalid' };
    }

    if (Object.prototype.hasOwnProperty.call(OVERRIDES, method)) {
        return { method, safety: OVERRIDES[method], reason: 'explicit override', source: 'override' };
    }

    for (const r of RULES) {
        if (r.test(method)) {
            return { method, safety: r.verdict, reason: r.reason, source: 'heuristic' };
        }
    }

    // Stream* that is not a *Updates read → ambiguous.
    if (/^Stream/i.test(method)) {
        return { method, safety: SAFETY.UNKNOWN, reason: 'Stream* not matching *Updates — direction unclear', source: 'heuristic' };
    }

    // Nothing matched → conservative UNKNOWN (never auto-invoked).
    return { method, safety: SAFETY.UNKNOWN, reason: 'no rule matched — conservative default', source: 'default' };
}

/**
 * Classify a set/array of method names into a structured table.
 * @param {Iterable<string>} methods
 * @returns {{
 *   scheme: object,
 *   methods: Record<string, {safety:string, reason:string, source:string}>,
 *   summary: { safe:number, unsafe:number, unknown:number, total:number }
 * }}
 */
function classifyAll(methods) {
    const unique = Array.from(new Set(Array.from(methods || []))).sort();
    const table = {};
    const summary = { safe: 0, unsafe: 0, unknown: 0, total: 0 };

    for (const m of unique) {
        const v = classifyMethod(m);
        table[m] = { safety: v.safety, reason: v.reason, source: v.source };
        summary[v.safety] += 1;
        summary.total += 1;
    }

    return {
        scheme: describeScheme(),
        methods: table,
        summary,
    };
}

function isSafe(method) {
    return classifyMethod(method).safety === SAFETY.SAFE;
}

/**
 * Human/machine-readable description of the classification scheme. Embedded in
 * method-safety.json so the output is self-documenting.
 */
function describeScheme() {
    return {
        buckets: {
            safe: 'Read-only / non-mutating. Eligible for automatic replay.',
            unsafe: 'Mutating / side-effecting. NEVER auto-invoked; replay gated behind --include-unsafe + --no-dry-run.',
            unknown: 'Ambiguous. Treated as unsafe for execution; listed for human review.',
        },
        precedence: [
            '1. Explicit per-method overrides (OVERRIDES table).',
            '2. UNSAFE prefix/suffix heuristics (Write/Update/Delete/Create/Start/Send/Cancel/Accept/Reject/Apply/Save/Install/Set/Add/Handle*Interaction/Execute/Run/...).',
            '3. SAFE prefix heuristics (Stream*Updates/Get/List/Stat/Read/Fetch/Find/Search/Check/Query).',
            '4. Stream* fallback → unknown (stream direction unclear).',
            '5. Conservative default → unknown.',
        ],
        principle: 'Anything not provably read-only is withheld from automatic replay.',
    };
}

module.exports = { SAFETY, classifyMethod, classifyAll, isSafe, describeScheme, OVERRIDES };
