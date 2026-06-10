// === Interaction gate options ===
// Reproduces, server-side, the permission-dialog option list the Antigravity webview
// builds for an `ask_permission` / permission gate, so the Deck shows EXACTLY what the
// IDE would (dynamic per the live spec) instead of hardcoded buttons.
//
// Ported from the Antigravity webview bundle (tools/api-tracker/schema/bundles/main.js,
// component `bRa` + grant builder `aRa`). Key facts reproduced from that code:
//   - Action label/description maps (ZQa / $Qa).
//   - Option list: "allow this time" (scope ONCE, hidden in ask_permission mode) +
//     "always allow / save rule" per scope, hidden entirely when persistSuggestionType
//     is BLOCKED. Project-scope wording depends on whether the cascade is in a project.
//   - Payloads: ONCE => { allow:true } (no turnGrants). ALWAYS => the turnGrants actually
//     sent to the LS is { allow:[pattern], deny:[] } regardless of scope — the
//     project/workspace/global difference is only a LOCAL IDE settings write, which the
//     Deck can't and shouldn't reproduce. DENY => { allow:false, userDenyInstruction }.

// ZQa: action -> short verb label
const ACTION_LABELS = {
    read_file: 'Read', write_file: 'Write', command: 'Run',
    unsandboxed: 'Run (unsandboxed)', mcp: 'Use', read_url: 'Read',
};
// $Qa: action -> phrase for the "Allow <...>?" title
const ACTION_DESCRIPTIONS = {
    read_file: 'read access to this path',
    write_file: 'write access to this path',
    read_url: 'reading this URL',
    execute_url: 'executing actions on this URL',
    command: 'running this command',
    unsandboxed: 'running this command outside the sandbox',
    mcp: 'using this MCP tool',
};

function isBlocked(pst) { return pst === 2 || pst === 'PERSIST_SUGGESTION_TYPE_BLOCKED'; }
function isSuggested(pst) { return pst === 1 || pst === 'PERSIST_SUGGESTION_TYPE_SUGGESTED'; }

// Build the permission-gate descriptor (title + dynamic options) for one spec.
// spec: PermissionInteractionSpec { resource:{action,target}, persistSuggestionType,
//        suggestedPersistPattern, reason }
// ctx:  { toolName, projectId }  (projectId from trajectoryMetadata; 'outside-of-project' or a real id)
function buildPermissionOptions(spec, ctx = {}) {
    const resource = spec.resource || {};
    const action = resource.action || '';
    const target = resource.target || '';
    const toolName = ctx.toolName || '';
    const projectId = ctx.projectId || '';

    const askMode = toolName === 'ask_permission';          // `t` in the bundle
    const blocked = isBlocked(spec.persistSuggestionType);  // `z`
    const suggested = isSuggested(spec.persistSuggestionType); // `A`
    const suggestedPattern = spec.suggestedPersistPattern || '';
    const hasPat = suggested && !!suggestedPattern;         // A && y

    // Pattern string the IDE persists. `D` in the bundle: action(suggestedPattern) when
    // suggested, else action(target).
    const pattern = hasPat ? `${action}(${suggestedPattern})` : `${action}(${target})`;
    const patLbl = hasPat ? `'${suggestedPattern}' ` : '';  // "'pattern' " prefix used in labels

    const desc = ACTION_DESCRIPTIONS[action] || 'access to this resource';
    const title = askMode ? `Save rule to always allow ${desc}?` : `Allow ${desc}?`;

    const ALLOW_ONCE = { allow: true };
    const ALWAYS = { allow: true, turnGrants: { allow: [pattern], deny: [] } };

    const options = [];
    // scope ONCE — hidden in ask_permission mode (`t || Ma(...)`).
    if (!askMode) {
        options.push({ id: 'once', label: 'Yes, allow this time', payload: { permission: ALLOW_ONCE } });
    }
    if (!blocked) {
        const outside = !projectId || projectId === 'outside-of-project';
        const projWord = outside ? 'when not in a project' : 'in this project';
        // scope PROJECT (5)
        options.push({
            id: 'project',
            label: askMode
                ? (hasPat ? `Yes, save rule for ${patLbl}${projWord}` : `Yes, save rule ${projWord}`)
                : (hasPat ? `Yes, and always allow ${patLbl}${projWord}` : `Yes, and always allow ${projWord}`),
            payload: { permission: ALWAYS },
        });
        // scope WORKSPACE (3) is intentionally omitted: it requires the IDE's
        // `supportsWorkspacePermissions` context flag, which the Deck can't observe, and
        // the live IDE omits it when unavailable.
        // scope GLOBAL (4) — Antigravity is not "Cider", so always shown.
        options.push({
            id: 'global',
            label: askMode
                ? (hasPat ? `Yes, save rule for '${suggestedPattern}' globally` : 'Yes, save rule globally')
                : (hasPat ? `Yes, and always allow '${suggestedPattern}'` : 'Yes, and always allow'),
            payload: { permission: ALWAYS },
        });
    }

    return {
        kind: 'permission',
        action,
        actionLabel: ACTION_LABELS[action] || 'Allow',
        target,
        editableTarget: action !== 'command' && action !== 'unsandboxed',
        title,
        reason: spec.reason || '',
        options,
        // The write-in "No" answer (deny + free-text instruction to the agent).
        denyWriteIn: { label: 'No', placeholder: '(tell the agent what to do instead)' },
    };
}

module.exports = { buildPermissionOptions, ACTION_LABELS, ACTION_DESCRIPTIONS };
