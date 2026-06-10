// Regression tests for the requested-interaction accept system.
//
// Original bug: buildInteraction() routed steps by CORTEX_STEP_TYPE_*, so a VIEW_FILE of a
// path outside the project produced a `file_permission` member. But that gate is actually
// requested as `permission` (PermissionInteraction) via the step's `requestedInteraction`
// field. The Deck sent the wrong oneof member, the LS silently dropped it, and clicking
// Accept did nothing.
//
// Systemic fix (audited 2026-06-10): buildInteraction now answers the member the LS
// explicitly requested (requestedInteraction-first dispatch across all 18 members), with
// the legacy step-type switch as fallback; unknown members are left WAITING instead of
// guessed; the binary protobuf decoder now decodes Step field 56 (requested_interaction).

const assert = require('assert');
const protobuf = require('protobufjs');
const { buildInteraction, denyInteraction } = require('../src/auto-accept');
const { decodeBinarySteps } = require('../src/protobuf');

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); console.log(`  ✓ ${name}`); pass++; }
  catch (e) { console.error(`  ✗ ${name}\n      ${e.message}`); fail++; }
}

// Real shape captured live from GetCascadeTrajectorySteps (conv e6581cfe, step[6]).
const realPermissionStep = {
  type: 'CORTEX_STEP_TYPE_VIEW_FILE',
  status: 'CORTEX_STEP_STATUS_WAITING',
  viewFile: { absolutePathUri: 'file:///c:/Users/zacka/OneDrive/Desktop/Projects/AgentSkills/skills.map.md' },
  requestedInteraction: {
    permission: { resource: { action: 'read_file', target: 'C:\\Users\\zacka\\OneDrive\\Desktop\\Projects\\AgentSkills\\skills.map.md' } },
  },
};

// ── permission gate (the original bug) ──────────────────────────────────────

test('outside-of-project gate -> permission:{allow:true} (matches captured wire payload)', () => {
  const out = buildInteraction({ trajectoryId: '5be9a772', stepIndex: 3, step: realPermissionStep });
  assert.deepStrictEqual(out, { trajectoryId: '5be9a772', stepIndex: 3, permission: { allow: true } });
});

test('permission gate wins over step-type guessing (no stray file_permission)', () => {
  const out = buildInteraction({ trajectoryId: 't', stepIndex: 2, step: realPermissionStep });
  assert.ok(out.permission, 'should produce permission member');
  assert.ok(!out.filePermission, 'must NOT produce filePermission for a permission gate');
});

test('reject flips permission to {allow:false}', () => {
  const accept = buildInteraction({ trajectoryId: 't', stepIndex: 1, step: realPermissionStep });
  const deny = denyInteraction(accept);
  assert.strictEqual(deny.permission.allow, false);
  assert.strictEqual(deny.trajectoryId, 't');
  assert.strictEqual(deny.stepIndex, 1);
});

// ── auto-accept policy on permission gates ───────────────────────────────────

test('auto mode: read-only permission → ALWAYS allow via turnGrants action(target), no scope field', () => {
  const out = buildInteraction({ trajectoryId: 't', stepIndex: 1, step: realPermissionStep }, { autoAcceptMode: true });
  assert.deepStrictEqual(out && out.permission, {
    allow: true,
    turnGrants: { allow: ['read_file(C:\\Users\\zacka\\OneDrive\\Desktop\\Projects\\AgentSkills\\skills.map.md)'], deny: [] },
  });
});

test('auto mode: SUGGESTED pattern → turnGrants uses action(suggestedPattern)', () => {
  const step = {
    ...realPermissionStep,
    requestedInteraction: {
      permission: {
        resource: { action: 'read_file', target: 'C:\\x\\a.md' },
        suggestedPersistPattern: 'C:\\x\\**',
        persistSuggestionType: 'PERSIST_SUGGESTION_TYPE_SUGGESTED',
      },
    },
  };
  const out = buildInteraction({ trajectoryId: 't', stepIndex: 1, step }, { autoAcceptMode: true });
  assert.deepStrictEqual(out.permission, { allow: true, turnGrants: { allow: ['read_file(C:\\x\\**)'], deny: [] } });
});

test('auto mode: BLOCKED persist suggestion → allow once (no turnGrants)', () => {
  const step = {
    ...realPermissionStep,
    requestedInteraction: {
      permission: {
        resource: { action: 'read_file', target: 'C:\\x\\a.md' },
        suggestedPersistPattern: 'C:\\x\\**',
        persistSuggestionType: 'PERSIST_SUGGESTION_TYPE_BLOCKED',
      },
    },
  };
  const out = buildInteraction({ trajectoryId: 't', stepIndex: 1, step }, { autoAcceptMode: true });
  assert.deepStrictEqual(out.permission, { allow: true });
});

test('auto mode: non-read permission action is left for manual decision (null)', () => {
  const step = {
    ...realPermissionStep,
    requestedInteraction: { permission: { resource: { action: 'write_file', target: 'C:\\x\\a.txt' } } },
  };
  const out = buildInteraction({ trajectoryId: 't', stepIndex: 1, step }, { autoAcceptMode: true });
  assert.strictEqual(out, null);
});

test('manual mode: non-read permission action is still allowed (explicit user click)', () => {
  const step = {
    ...realPermissionStep,
    requestedInteraction: { permission: { resource: { action: 'write_file', target: 'C:\\x\\a.txt' } } },
  };
  const out = buildInteraction({ trajectoryId: 't', stepIndex: 1, step });
  assert.deepStrictEqual(out && out.permission, { allow: true });
});

// ── requested-first dispatch for other members ──────────────────────────────

test('requested mcp beats mismatched step type (RUN_COMMAND step, mcp gate)', () => {
  const step = {
    type: 'CORTEX_STEP_TYPE_RUN_COMMAND', status: 'CORTEX_STEP_STATUS_WAITING',
    runCommand: { commandLine: 'echo hi' },
    requestedInteraction: { mcp: {} },
  };
  const out = buildInteraction({ trajectoryId: 't', stepIndex: 4, step });
  assert.deepStrictEqual(out, { trajectoryId: 't', stepIndex: 4, mcp: { confirm: true } });
});

test('requested filePermission is built from the spec path', () => {
  const step = {
    type: 'CORTEX_STEP_TYPE_VIEW_FILE', status: 'CORTEX_STEP_STATUS_WAITING',
    requestedInteraction: { filePermission: { absolutePathUri: 'file:///c:/ws/a.txt', blockReason: 1 } },
  };
  const out = buildInteraction({ trajectoryId: 't', stepIndex: 2, step });
  assert.deepStrictEqual(out.filePermission, { allow: true, scope: 'PERMISSION_SCOPE_ONCE', absolutePathUri: 'file:///c:/ws/a.txt' });
});

test('requested runCommand keeps proposed/submitted command line from step content', () => {
  const step = {
    type: 'CORTEX_STEP_TYPE_RUN_COMMAND', status: 'CORTEX_STEP_STATUS_WAITING',
    runCommand: { commandLine: 'npm test' },
    requestedInteraction: { runCommand: {} },
  };
  const out = buildInteraction({ trajectoryId: 't', stepIndex: 9, step });
  assert.deepStrictEqual(out.runCommand, { confirm: true, proposedCommandLine: 'npm test', submittedCommandLine: 'npm test' });
});

test('requested askQuestion / elicitation are never auto-built (null)', () => {
  for (const member of ['askQuestion', 'elicitation']) {
    const step = {
      type: 'CORTEX_STEP_TYPE_ASK_QUESTION', status: 'CORTEX_STEP_STATUS_WAITING',
      requestedInteraction: { [member]: { questions: [] } },
    };
    assert.strictEqual(buildInteraction({ trajectoryId: 't', stepIndex: 1, step }), null, member);
  }
});

test('unknown requested member is left WAITING (no guessed answer)', () => {
  const step = {
    type: 'CORTEX_STEP_TYPE_RUN_COMMAND', status: 'CORTEX_STEP_STATUS_WAITING',
    runCommand: { commandLine: 'echo hi' },
    requestedInteraction: { someFutureGate: { foo: 1 } },
  };
  assert.strictEqual(buildInteraction({ trajectoryId: 't', stepIndex: 1, step }), null);
});

test('reject works generically for confirm members (mcp)', () => {
  const step = { type: 'CORTEX_STEP_TYPE_RUN_COMMAND', status: 'CORTEX_STEP_STATUS_WAITING', requestedInteraction: { mcp: {} } };
  const deny = denyInteraction(buildInteraction({ trajectoryId: 't', stepIndex: 1, step }));
  assert.strictEqual(deny.mcp.confirm, false);
});

// ── legacy fallback (no requestedInteraction) must be unchanged ──────────────

test('legacy: RUN_COMMAND without requestedInteraction still -> runCommand', () => {
  const step = { type: 'CORTEX_STEP_TYPE_RUN_COMMAND', status: 'CORTEX_STEP_STATUS_WAITING', runCommand: { commandLine: 'ls -la' } };
  const out = buildInteraction({ trajectoryId: 't', stepIndex: 5, step });
  assert.ok(out.runCommand && out.runCommand.confirm === true, 'should produce runCommand.confirm=true');
  assert.ok(!out.permission, 'should not produce permission');
});

test('legacy: empty requestedInteraction object falls through to step-type switch', () => {
  const step = {
    type: 'CORTEX_STEP_TYPE_RUN_COMMAND', status: 'CORTEX_STEP_STATUS_WAITING',
    runCommand: { commandLine: 'echo hi' },
    requestedInteraction: {},
  };
  const out = buildInteraction({ trajectoryId: 't', stepIndex: 6, step });
  assert.ok(out.runCommand, 'should fall back to step-type mapping');
});

// ── binary protobuf decoder: Step field 56 (requested_interaction) ───────────

function buildPermissionStepEnvelope() {
  // PermissionResource { action=1, target=2 }
  const resource = protobuf.Writer.create()
    .uint32((1 << 3) | 2).string('read_file')
    .uint32((2 << 3) | 2).string('C:\\outside\\file.md')
    .finish();
  // PermissionInteractionSpec { resource=1 }
  const spec = protobuf.Writer.create()
    .uint32((1 << 3) | 2).bytes(resource)
    .finish();
  // RequestedInteraction { permission=21 }
  const reqInt = protobuf.Writer.create()
    .uint32((21 << 3) | 2).bytes(spec)
    .finish();
  // Step { type=1 (VIEW_FILE=8), status=4 (WAITING=9), requested_interaction=56 }
  const step = protobuf.Writer.create()
    .uint32((1 << 3) | 0).uint32(8)
    .uint32((4 << 3) | 0).uint32(9)
    .uint32((56 << 3) | 2).bytes(reqInt)
    .finish();
  // Response envelope { steps=1 (repeated Step) }
  return Buffer.from(protobuf.Writer.create().uint32((1 << 3) | 2).bytes(step).finish());
}

test('binary decoder surfaces requestedInteraction.permission (field 56)', () => {
  const steps = decodeBinarySteps(buildPermissionStepEnvelope());
  assert.strictEqual(steps.length, 1);
  const st = steps[0];
  assert.strictEqual(st.type, 'CORTEX_STEP_TYPE_VIEW_FILE');
  assert.strictEqual(st.status, 'CORTEX_STEP_STATUS_WAITING');
  assert.deepStrictEqual(st.requestedInteraction, {
    permission: { resource: { action: 'read_file', target: 'C:\\outside\\file.md' } },
  });
});

test('binary-decoded permission step builds the correct accept payload end-to-end', () => {
  const st = decodeBinarySteps(buildPermissionStepEnvelope())[0];
  const out = buildInteraction({ trajectoryId: 'traj', stepIndex: 6, step: st });
  assert.deepStrictEqual(out, { trajectoryId: 'traj', stepIndex: 6, permission: { allow: true } });
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
