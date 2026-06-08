// === Safety classifier tests ===
// Run: node tools/api-tracker/test/safety.test.js
// Zero-dependency assertions (Node built-in `assert`). Exits non-zero on failure.
//
// The single most important invariant: NO mutating method may ever be
// classified "safe". A false-safe verdict would let the default mode mutate
// IDE/workspace state — exactly what the harness must never do.

const assert = require('assert');
const { classifyMethod, classifyAll, SAFETY } = require('./lib/safety');

let passed = 0;
function check(name, fn) {
    try { fn(); passed++; process.stdout.write(`  ok  ${name}\n`); }
    catch (e) { process.stdout.write(`FAIL  ${name}\n      ${e.message}\n`); process.exitCode = 1; }
}

// --- SAFE methods ---
const SAFE = [
    'GetUserStatus', 'GetWorkspaceInfos', 'GetCascadeTrajectorySteps', 'GetTurnDiff',
    'GetAgentScripts', 'GetMcpServerStates', 'GetRepoInfos', 'GetStandaloneDir',
    'GetProfileData', 'GetAllCascadeTrajectories', 'StatUri', 'ListFiles',
    'StreamAgentStateUpdates', 'StreamCascadeReactiveUpdates', 'ReadFile', 'SearchSymbols',
];
for (const m of SAFE) {
    check(`safe: ${m}`, () => assert.strictEqual(classifyMethod(m).safety, SAFETY.SAFE));
}

// --- UNSAFE methods (mutating) ---
const UNSAFE = [
    'JetboxWriteState', 'UpdateConversationAnnotations', 'DeleteCascadeTrajectory',
    'CreateConversation', 'StartCascade', 'StartCascadeInvocation', 'SendUserCascadeMessage',
    'SendCascadeMessage', 'CancelCascadeInvocation', 'AcceptDiff', 'RejectDiff',
    'HandleCascadeUserInteraction', 'InstallCascadePlugin', 'UninstallCascadePlugin',
    'UpdateSettings', 'SaveMediaAsArtifact', 'RecordAnalyticsEvent', 'AddTrackedWorkspace',
    'SetActiveModel', 'ApplyEditCheckpoint', 'ExecuteCommand', 'RunCommand',
    // Mutating verb that shares a prefix with a SAFE rule (Check*) — must NOT
    // be mis-classified safe (would let the harness check out a worktree).
    'CheckoutWorktree',
];
for (const m of UNSAFE) {
    check(`unsafe: ${m}`, () => assert.strictEqual(classifyMethod(m).safety, SAFETY.UNSAFE));
}

// --- UNKNOWN (ambiguous, conservative) ---
const UNKNOWN = [
    'RequestAgentStatePageUpdate', // pinned unknown via override
    'FrobnicateWidget',            // no rule matches
    'StreamRawInput',              // Stream* but not *Updates
];
for (const m of UNKNOWN) {
    check(`unknown: ${m}`, () => assert.strictEqual(classifyMethod(m).safety, SAFETY.UNKNOWN));
}

// --- CRITICAL invariant: nothing mutating is ever "safe" ---
check('invariant: no UNSAFE method is classified safe', () => {
    for (const m of UNSAFE) {
        assert.notStrictEqual(classifyMethod(m).safety, SAFETY.SAFE, `${m} must not be safe`);
    }
});

// --- classifyAll summary integrity ---
check('classifyAll: counts add up + dedups', () => {
    const out = classifyAll([...SAFE, ...UNSAFE, ...UNKNOWN, 'GetUserStatus' /* dup */]);
    const { safe, unsafe, unknown, total } = out.summary;
    assert.strictEqual(safe + unsafe + unknown, total, 'bucket counts must sum to total');
    assert.strictEqual(total, new Set([...SAFE, ...UNSAFE, ...UNKNOWN]).size, 'dedup expected');
    assert.ok(out.scheme && out.scheme.buckets, 'scheme embedded');
});

process.stdout.write(`\n${passed} checks passed${process.exitCode ? ' (with failures)' : ''}\n`);
