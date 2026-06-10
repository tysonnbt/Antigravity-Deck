// Tests for the permission-gate option builder (ported from the Antigravity webview
// bundle component `bRa` + grant builder `aRa`). Verifies labels + payloads match what
// the IDE would render for a given spec/context.

const assert = require('assert');
const { buildPermissionOptions } = require('../src/interaction-options');

let pass = 0, fail = 0;
function test(name, fn) {
  try { fn(); console.log(`  ✓ ${name}`); pass++; }
  catch (e) { console.error(`  ✗ ${name}\n      ${e.message}`); fail++; }
}
const labels = g => g.options.map(o => o.label);
const ids = g => g.options.map(o => o.id);

// Matches the user's real screenshot: read_file, outside-of-project, default suggestion.
test('outside-of-project read gate → once + project(not-in-project) + global', () => {
  const g = buildPermissionOptions(
    { resource: { action: 'read_file', target: 'C:/x/SKILL.md' } },
    { toolName: 'view_file', projectId: 'outside-of-project' },
  );
  assert.strictEqual(g.title, 'Allow read access to this path?');
  assert.deepStrictEqual(ids(g), ['once', 'project', 'global']);
  assert.deepStrictEqual(labels(g), [
    'Yes, allow this time',
    'Yes, and always allow when not in a project',
    'Yes, and always allow',
  ]);
  assert.strictEqual(g.denyWriteIn.label, 'No');
  assert.strictEqual(g.denyWriteIn.placeholder, '(tell the agent what to do instead)');
});

test('once payload is bare {allow:true} (matches captured wire payload)', () => {
  const g = buildPermissionOptions({ resource: { action: 'read_file', target: 'C:/x/a.md' } }, { projectId: 'outside-of-project' });
  assert.deepStrictEqual(g.options.find(o => o.id === 'once').payload, { permission: { allow: true } });
});

test('always payload carries turnGrants {allow:[action(target)]} (no scope field)', () => {
  const g = buildPermissionOptions({ resource: { action: 'read_file', target: 'C:/x/a.md' } }, { projectId: 'outside-of-project' });
  assert.deepStrictEqual(g.options.find(o => o.id === 'global').payload, {
    permission: { allow: true, turnGrants: { allow: ['read_file(C:/x/a.md)'], deny: [] } },
  });
});

test('in-project gate uses "in this project" wording', () => {
  const g = buildPermissionOptions(
    { resource: { action: 'write_file', target: 'C:/proj/a.ts' } },
    { projectId: 'proj-123' },
  );
  assert.ok(labels(g).includes('Yes, and always allow in this project'));
  assert.strictEqual(g.title, 'Allow write access to this path?');
});

test('SUGGESTED persist pattern → labels quote it and turnGrants uses action(pattern)', () => {
  const g = buildPermissionOptions(
    { resource: { action: 'read_file', target: 'C:/x/a.md' }, persistSuggestionType: 1, suggestedPersistPattern: 'C:/x/**' },
    { projectId: 'outside-of-project' },
  );
  assert.ok(labels(g).includes("Yes, and always allow 'C:/x/**' when not in a project"));
  assert.ok(labels(g).includes("Yes, and always allow 'C:/x/**'"));
  assert.deepStrictEqual(g.options.find(o => o.id === 'global').payload.permission.turnGrants.allow, ['read_file(C:/x/**)']);
});

test('BLOCKED persist suggestion → only "allow this time", no always options', () => {
  const g = buildPermissionOptions(
    { resource: { action: 'command', target: 'rm -rf /' }, persistSuggestionType: 2 },
    { projectId: 'outside-of-project' },
  );
  assert.deepStrictEqual(ids(g), ['once']);
});

test('BLOCKED works with string enum form too', () => {
  const g = buildPermissionOptions(
    { resource: { action: 'command', target: 'x' }, persistSuggestionType: 'PERSIST_SUGGESTION_TYPE_BLOCKED' },
    {},
  );
  assert.deepStrictEqual(ids(g), ['once']);
});

test('ask_permission mode → no "allow this time", "Save rule" labels + "Save rule to always allow" title', () => {
  const g = buildPermissionOptions(
    { resource: { action: 'read_file', target: 'C:/x/a.md' } },
    { toolName: 'ask_permission', projectId: 'outside-of-project' },
  );
  assert.strictEqual(g.title, 'Save rule to always allow read access to this path?');
  assert.deepStrictEqual(ids(g), ['project', 'global']);
  assert.ok(labels(g).includes('Yes, save rule when not in a project'));
  assert.ok(labels(g).includes('Yes, save rule globally'));
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
