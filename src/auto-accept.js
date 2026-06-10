// === Auto-Accept Logic ===
// Handles building interaction payloads and auto-accepting WAITING steps.

const { lsInstances, getSettings, saveSettings } = require('./config');
const { callApi, callApiOnInstance, callApiFireAndForgetOnInstance } = require('./api');
// NOTE: ws.js is NOT imported at top level to avoid circular dependency
// (cache.js → ws.js → poller.js → auto-accept.js → ws.js)
function _broadcast(data, targetConvId) { return require('./ws').broadcast(data, targetConvId); }
const { detectApiStartIndex } = require('./step-cache');
const fs = require('fs');
const path = require('path');

// State — persisted in settings.json so it survives restarts
let autoAcceptEnabled = !!(getSettings().autoAccept);
const autoAcceptedSet = new Set(); // debounce: track already auto-accepted cascade+step combos

// --- Security: Workspace Path Validation ---

// Helper: Convert file:// URI to filesystem path
function uriToFsPath(uri) {
    if (!uri) return null;
    try {
        const url = new URL(uri);
        let p = decodeURIComponent(url.pathname);
        if (process.platform === 'win32' && /^\/[a-zA-Z]:/.test(p)) p = p.substring(1);
        return p;
    } catch { return null; }
}

function validateFilePathInWorkspace(filePath) {
    if (!filePath) return false;
    
    // Extract filesystem path from file:// URI
    let fsPath = filePath;
    if (fsPath.startsWith('file://')) {
        try {
            fsPath = decodeURIComponent(new URL(fsPath).pathname);
        } catch {
            fsPath = decodeURIComponent(fsPath.replace('file://', ''));
        }
        // Windows: /C:/Users/... → C:/Users/...
        if (/^\/[a-zA-Z]:/.test(fsPath)) {
            fsPath = fsPath.substring(1);
        }
    }
    
    // Build list of allowed workspace roots
    const allowedRoots = [];
    for (const inst of lsInstances) {
        if (inst.workspaceFolderUri) {
            const workspaceRoot = uriToFsPath(inst.workspaceFolderUri);
            if (workspaceRoot) {
                try {
                    allowedRoots.push(fs.realpathSync(workspaceRoot));
                } catch {
                    // Workspace doesn't exist or can't be resolved - skip
                }
            }
        }
    }

    // Fallback: include defaultWorkspaceRoot from settings
    // (ensures validation works even before LS instances are detected)
    const settings = getSettings();
    if (settings.defaultWorkspaceRoot) {
        try {
            allowedRoots.push(fs.realpathSync(settings.defaultWorkspaceRoot));
        } catch {
            // Default root doesn't exist yet — add lexically
            allowedRoots.push(path.resolve(settings.defaultWorkspaceRoot));
        }
    }
    
    if (allowedRoots.length === 0) {
        // No workspaces available - reject for safety
        return false;
    }
    
    // Resolve symlinks and check if file is within any workspace
    let realPath;
    try {
        realPath = fs.realpathSync(fsPath);
    } catch {
        // File doesn't exist yet (new file) - validate lexically
        realPath = path.resolve(fsPath);
    }
    
    // Check if resolved path is within any allowed workspace
    for (const root of allowedRoots) {
        const normalizedRoot = path.resolve(root);
        const isInside = process.platform === 'win32'
            ? realPath.toLowerCase() === normalizedRoot.toLowerCase() ||
              realPath.toLowerCase().startsWith(normalizedRoot.toLowerCase() + path.sep)
            : realPath === normalizedRoot ||
              realPath.startsWith(normalizedRoot + path.sep);
        
        if (isInside) {
            return true;
        }
    }
    
    return false;
}

// --- Public API ---

function getAutoAccept() { return autoAcceptEnabled; }

function setAutoAccept(val) {
    autoAcceptEnabled = !!val;
    if (!autoAcceptEnabled) autoAcceptedSet.clear();
    saveSettings({ autoAccept: autoAcceptEnabled });
    console.log(`[AutoAccept] ${autoAcceptEnabled ? 'ENABLED' : 'DISABLED'} (saved to settings)`);
}

// --- Requested-interaction dispatch (authoritative) ---
// A WAITING step declares the exact CascadeUserInteraction member the LS expects via
// `requestedInteraction` (RequestedInteraction oneof — same member names as the response
// oneof). Responding with any OTHER member is silently dropped by the LS — that was the
// "outside-of-project permission gate" bug: VIEW_FILE steps requested `permission` but the
// step-type switch answered `filePermission`. So when `requestedInteraction` is present it
// takes priority over the legacy step-type switch.
// Return contract:
//   object    → response member(s) to merge into the interaction (accept semantics)
//   null      → cannot / should not auto-answer (leave WAITING)
//   undefined → no recognizable member; caller falls back to the step-type switch
const READONLY_PERMISSION_ACTION = /^(read|list|view|search|stat|glob|grep|find|fetch|get)/i;

function buildFromRequestedInteraction(requested, step, autoAcceptMode) {
    const has = (m) => requested[m] !== undefined && requested[m] !== null && typeof requested[m] === 'object';

    // permission — the 2.0.11 "outside-of-project" access gate (PermissionInteraction).
    // Verified live: the IDE answers { permission: { allow: true } } for "allow this time".
    if (has('permission')) {
        const res = requested.permission.resource || {};
        if (autoAcceptMode) {
            if (!READONLY_PERMISSION_ACTION.test(String(res.action || ''))) {
                console.log(`[AutoAccept] permission gate (${res.action || '?'}: ${res.target || '?'}) is not read-only — leaving for manual decision`);
                return null;
            }
            // Auto-accept = "always allow": grant the pattern via turnGrants so the same
            // resource doesn't re-prompt. Shape verified from the IDE webview (grant builder
            // `aRa`): { allow:true, turnGrants:{ allow:[pattern], deny:[] } } — no scope field.
            const blocked = requested.permission.persistSuggestionType === 2
                || requested.permission.persistSuggestionType === 'PERSIST_SUGGESTION_TYPE_BLOCKED';
            const suggested = requested.permission.persistSuggestionType === 1
                || requested.permission.persistSuggestionType === 'PERSIST_SUGGESTION_TYPE_SUGGESTED';
            const pat = requested.permission.suggestedPersistPattern;
            if (blocked) {
                console.log(`[AutoAccept] permission gate -> allow once (persist blocked) (${res.action || '?'})`);
                return { permission: { allow: true } };
            }
            const pattern = (suggested && pat) ? `${res.action}(${pat})` : `${res.action}(${res.target})`;
            console.log(`[AutoAccept] permission gate -> ALWAYS allow (${res.action || '?'}: ${res.target || '?'})`);
            return { permission: { allow: true, turnGrants: { allow: [pattern], deny: [] } } };
        }
        console.log(`[AutoAccept] permission gate -> allow once (${res.action || '?'}: ${res.target || '?'})`);
        return { permission: { allow: true } };
    }

    // file_permission — the spec carries the authoritative path.
    if (has('filePermission')) {
        const uri = requested.filePermission.absolutePathUri || '';
        if (autoAcceptMode && uri && !validateFilePathInWorkspace(uri)) {
            console.warn(`[AutoAccept] Skipping file permission outside workspace: ${uri}`);
            return null;
        }
        const fp = { allow: true, scope: 'PERMISSION_SCOPE_ONCE' };
        if (uri) fp.absolutePathUri = uri;
        return { filePermission: fp };
    }

    // These require a real user answer (options / typed input) — never auto-build.
    if (has('askQuestion') || has('elicitation')) {
        console.log('[AutoAccept] requested interaction needs a user answer (ask_question/elicitation) — skipping');
        return null;
    }

    if (has('deploy')) return { deploy: { cancel: false } };

    if (has('runCommand')) {
        const cmd = step.runCommand?.commandLine || step.runCommand?.command || '';
        return { runCommand: { confirm: true, proposedCommandLine: cmd, submittedCommandLine: cmd } };
    }

    if (has('sendCommandInput')) {
        const input = step.sendCommandInput?.input || '';
        return { sendCommandInput: { confirm: true, proposedInput: input, submittedInput: input } };
    }

    // Members whose accept is a plain { confirm: true } (per exa.cortex_pb schema).
    const CONFIRM_MEMBERS = [
        'approvalInteraction', 'mcp', 'readUrlContent', 'openBrowserUrl', 'browserAction',
        'runExtensionCode', 'executeBrowserJavascript', 'captureBrowserScreenshot',
        'clickBrowserPixel', 'openBrowserSetup', 'confirmBrowserSetup',
    ];
    for (const m of CONFIRM_MEMBERS) {
        if (has(m)) return { [m]: { confirm: true } };
    }

    // Unknown member: answering with a guessed member would be silently dropped (the
    // original bug class) — leave it WAITING and make the gap loud in the logs.
    const members = Object.keys(requested);
    if (members.length > 0) {
        console.warn(`[AutoAccept] Unknown requestedInteraction member(s) [${members.join(',')}] — cannot answer, leaving WAITING`);
        return null;
    }
    return undefined;
}

// --- Build interaction payload from WAITING step data ---

function buildInteraction(stepInfo, options = {}) {
    const { trajectoryId, stepIndex, step } = stepInfo;
    if (!trajectoryId || stepIndex === undefined || !step) return null;

    const { autoAcceptMode = false } = options; // Flag to distinguish auto-accept vs manual

    const interaction = { trajectoryId, stepIndex };
    const stepType = (step.type || '').replace('CORTEX_STEP_TYPE_', '');

    // Authoritative path: answer the member the LS explicitly requested.
    const requested = step.requestedInteraction;
    if (requested && typeof requested === 'object') {
        const viaRequested = buildFromRequestedInteraction(requested, step, autoAcceptMode);
        if (viaRequested === null) return null;
        if (viaRequested !== undefined) return { ...interaction, ...viaRequested };
        // fall through: requestedInteraction was empty/unusable — use the legacy switch
    }

    switch (stepType) {
        case 'RUN_COMMAND': {
            const cmd = step.runCommand?.commandLine || step.runCommand?.command || '';
            interaction.runCommand = {
                confirm: true,
                proposedCommandLine: cmd,
                submittedCommandLine: cmd,
            };
            break;
        }
        case 'CODE_ACTION': {
            // CODE_ACTION WAITING = file permission needed (writing outside workspace)
            let filePath = step.codeAction?.targetFile || step.codeAction?.filePath
                || step.codeAction?.actionSpec?.command?.replacementChunks?.[0]?.targetFile || '';
            // Fallback: check metadata.toolCall.argumentsJson for TargetFile
            if (!filePath && step.metadata?.toolCall?.argumentsJson) {
                try {
                    const args = JSON.parse(step.metadata.toolCall.argumentsJson);
                    filePath = args.TargetFile || args.AbsolutePath || args.FilePath || '';
                } catch { }
            }
            // Fallback: extract from binary-decoded codeAction numeric fields
            if (!filePath && step.codeAction) {
                const ca = step.codeAction;
                // Field "25" often contains raw path like "\n.C:\Users\...\file.py\u0018\u0001" (Win)
                // or "/Users/.../file.py" (macOS)
                if (ca['25'] && typeof ca['25'] === 'string') {
                    const cleaned = ca['25'].replace(/[\x00-\x1f]/g, '').trim();
                    const winMatch = cleaned.match(/([A-Za-z]:\\[^\x00]+)/);
                    const macMatch = cleaned.match(/(\/[^\x00]+)/);
                    if (winMatch) filePath = winMatch[1];
                    else if (macMatch) filePath = macMatch[1];
                }
                // Field "1" may contain file:/// URI
                if (!filePath && ca['1'] && typeof ca['1'] === 'string') {
                    const uriMatch = ca['1'].match(/file:\/\/(\/[^\s\x00]+)/);
                    if (uriMatch) {
                        let extracted = uriMatch[1];
                        // Windows: /C:/... → strip leading slash
                        if (/^\/[A-Za-z]:/.test(extracted)) extracted = extracted.substring(1);
                        filePath = 'file://' + (extracted.startsWith('/') ? '' : '/') + extracted;
                    }
                }
            }
            if (filePath) {
                // Security: Validate file path is within workspace boundaries
                if (validateFilePathInWorkspace(filePath)) {
                    interaction.filePermission = {
                        allow: true,
                        scope: 'PERMISSION_SCOPE_ONCE',
                        absolutePathUri: filePath,
                    };
                    console.log(`[AutoAccept] File permission for: ${filePath}`);
                } else {
                    // Out-of-workspace files: behavior depends on mode
                    if (autoAcceptMode) {
                        // Auto-accept: skip entirely, let LS handle it
                        console.warn(`[AutoAccept] Skipping auto-accept (outside workspace): ${filePath}`);
                        return null; // Signal to caller: don't send any interaction
                    } else {
                        // Manual accept/reject: allow user to explicitly approve/deny
                        interaction.filePermission = {
                            allow: true,
                            scope: 'PERMISSION_SCOPE_ONCE',
                            absolutePathUri: filePath,
                        };
                        console.log(`[AutoAccept] Manual file permission for out-of-workspace: ${filePath}`);
                    }
                }
            } else {
                // No file path → not a file-permission gate; treat as a generic approval.
                // (`codeAction` is NOT a member of CascadeUserInteraction — would be dropped.)
                interaction.approvalInteraction = { confirm: true };
            }
            break;
        }
        case 'VIEW_FILE':
        case 'LIST_DIRECTORY':
        case 'READ_URL_CONTENT':
        case 'VIEW_CONTENT_CHUNK':
        case 'SEARCH': {
            // Read-only operations — always safe to accept, even outside workspace.
            // VIEW_FILE outside workspace triggers BLOCK_REASON_OUTSIDE_WORKSPACE
            // which causes WAITING status. Since reading is non-destructive, always allow.
            let readPath = '';
            if (step.viewFile?.absolutePathUri) readPath = step.viewFile.absolutePathUri;
            else if (step.viewFile?.filePermissionRequest?.absolutePathUri) readPath = step.viewFile.filePermissionRequest.absolutePathUri;
            else if (step.listDirectory?.directoryPathUri) readPath = step.listDirectory.directoryPathUri;
            if (!readPath && step.metadata?.toolCall?.argumentsJson) {
                try {
                    const args = JSON.parse(step.metadata.toolCall.argumentsJson);
                    readPath = args.AbsolutePath || args.DirectoryPath || args.SearchPath || args.Url || '';
                } catch { }
            }
            if (readPath) {
                // Convert to file:// URI if it's a raw path
                let uri = readPath;
                if (!uri.startsWith('file://')) {
                    const normalized = uri.replace(/\\/g, '/');
                    uri = 'file:///' + (normalized.startsWith('/') ? normalized.substring(1) : normalized);
                }
                interaction.filePermission = {
                    allow: true,
                    scope: 'PERMISSION_SCOPE_ONCE',
                    absolutePathUri: uri,
                };
                console.log(`[AutoAccept] Read-only ${stepType}: ${readPath} (always allowed)`);
            } else {
                // `confirm` is NOT a member of CascadeUserInteraction — use the generic approval.
                interaction.approvalInteraction = { confirm: true };
                console.log(`[AutoAccept] Read-only ${stepType}: no path found, generic approval`);
            }
            break;
        }
        case 'SEND_COMMAND_INPUT': {
            // Terminal input accept
            const input = step.sendCommandInput?.input || '';
            interaction.sendCommandInput = {
                confirm: true,
                proposedInput: input,
                submittedInput: input,
            };
            break;
        }
        case 'OPEN_BROWSER_URL':
        case 'BROWSER_ACTION':
        case 'BROWSER_SUBAGENT': {
            // Browser subagent wants to open a URL or perform a browser action
            interaction.browserAction = { confirm: true };
            const url = step.openBrowserUrl?.url || '';
            console.log(`[AutoAccept] Browser action${url ? ': ' + url : ''}`);
            break;
        }
        case 'MCP_TOOL': {
            // MCP tool-call approval — a plain confirm on the `mcp` member.
            interaction.mcp = { confirm: true };
            console.log(`[AutoAccept] MCP tool call`);
            break;
        }
        case 'TOOL_CALL_PROPOSAL': {
            // Generic tool-call / approval gate.
            interaction.approvalInteraction = { confirm: true };
            break;
        }
        case 'RUN_EXTENSION_CODE': {
            interaction.runExtensionCode = { confirm: true };
            break;
        }
        case 'EXECUTE_BROWSER_JAVASCRIPT': {
            interaction.executeBrowserJavascript = { confirm: true };
            break;
        }
        case 'CAPTURE_BROWSER_SCREENSHOT': {
            interaction.captureBrowserScreenshot = { confirm: true };
            break;
        }
        case 'CLICK_BROWSER_PIXEL': {
            interaction.clickBrowserPixel = { confirm: true };
            break;
        }
        case 'OPEN_BROWSER_SETUP': {
            interaction.openBrowserSetup = { confirm: true };
            break;
        }
        case 'CONFIRM_BROWSER_SETUP': {
            interaction.confirmBrowserSetup = { confirm: true };
            break;
        }
        case 'DEPLOY_FIREBASE':
        case 'SET_UP_FIREBASE': {
            // Deploy confirmation — `cancel:false` = proceed.
            interaction.deploy = { cancel: false };
            console.log(`[AutoAccept] Deploy confirm`);
            break;
        }
        case 'ASK_QUESTION':
        case 'ELICITATION': {
            // These require a real answer (selected options / typed input), not a blind
            // confirm — they can't be auto-built. Surface to the user via dedicated UI.
            console.log(`[AutoAccept] ${stepType} needs a user answer — cannot auto-build, skipping`);
            return null;
        }
        default: {
            // Unknown step type — try to find file path from various sources
            let fp = step.codeAction?.targetFile || step.codeAction?.filePath || '';
            if (!fp && step.metadata?.toolCall?.argumentsJson) {
                try {
                    const args = JSON.parse(step.metadata.toolCall.argumentsJson);
                    fp = args.TargetFile || args.AbsolutePath || args.FilePath || '';
                } catch { }
            }
            if (fp) {
                // Security: Validate file path is within workspace boundaries
                if (validateFilePathInWorkspace(fp)) {
                    interaction.filePermission = { allow: true, scope: 'PERMISSION_SCOPE_ONCE', absolutePathUri: fp };
                    console.log(`[AutoAccept] File permission (default) for: ${fp}`);
                } else {
                    // Out-of-workspace files: behavior depends on mode
                    if (autoAcceptMode) {
                        // Auto-accept: skip entirely, let LS handle it
                        console.warn(`[AutoAccept] Skipping auto-accept (outside workspace, default branch): ${fp}`);
                        return null; // Signal to caller: don't send any interaction
                    } else {
                        // Manual accept/reject: allow user to explicitly approve/deny
                        interaction.filePermission = { allow: true, scope: 'PERMISSION_SCOPE_ONCE', absolutePathUri: fp };
                        console.log(`[AutoAccept] Manual file permission (default) for out-of-workspace: ${fp}`);
                    }
                }
            } else {
                // `confirm` is NOT a member of CascadeUserInteraction — use the generic approval.
                console.log(`[AutoAccept] Unknown step type for interaction: ${stepType}, generic approval`);
                interaction.approvalInteraction = { confirm: true };
            }
            break;
        }
    }

    return interaction;
}

// --- Flip an accept interaction into a reject (deny), generically across all members ---
// buildInteraction() always builds the *accept* payload (confirm/allow=true, deploy.cancel=false).
// To reject, flip the single populated oneof member to its deny value. Works for every member type.
function denyInteraction(interaction) {
    const COMMON = new Set(['trajectoryId', 'stepIndex', 'timedOut']);
    const out = {};
    for (const [key, val] of Object.entries(interaction)) {
        if (COMMON.has(key) || val === null || typeof val !== 'object') { out[key] = val; continue; }
        if (key === 'filePermission') {
            // Reject = keep only the path; absence of `allow` (default false) is the deny.
            out[key] = { absolutePathUri: val.absolutePathUri };
            continue;
        }
        const member = { ...val };
        if ('confirm' in member) member.confirm = false;     // run_command/mcp/approval/browser/extension/...
        if ('allow' in member) member.allow = false;         // permission
        if ('cancel' in member) member.cancel = true;        // deploy: cancel=true = reject
        if ('cancelled' in member) member.cancelled = true;  // ask_question
        out[key] = member;
    }
    return out;
}

// --- Direct accept on a specific LS instance ---

async function handleAutoAcceptDirect(cascadeId, inst, stepInfo = null) {
    if (!autoAcceptEnabled) return;
    // Debounce key includes instance port + stepIndex to allow re-accept of different steps
    const stepIdx = stepInfo?.stepIndex ?? 'x';
    const debounceKey = `${cascadeId}:${inst.port}:${stepIdx}`;
    if (autoAcceptedSet.has(debounceKey)) return;

    // Build interaction payload BEFORE adding to debounce set.
    // If build fails (path not found, unknown type), we must NOT lock the key
    // — otherwise the step stays stuck for 15s with no retry.
    const body = { cascadeId };
    if (stepInfo) {
        const interaction = buildInteraction(stepInfo, { autoAcceptMode: true });
        if (interaction) {
            body.interaction = interaction;
            console.log(`[AutoAccept] >>> Accepting ${cascadeId.substring(0, 8)} step[${stepInfo.stepIndex}] on ${inst.workspaceName}:${inst.port} (${(stepInfo.step?.type || '').replace('CORTEX_STEP_TYPE_', '')})`);
        } else {
            // Build failed — don't add to debounce, allow retry on next poll cycle
            console.log(`[AutoAccept] >>> Could not build interaction for ${cascadeId.substring(0, 8)}, skipping`);
            return;
        }
    } else {
        // No step info supplied (e.g. SSE path) — dedicated polling will handle it
        console.log(`[AutoAccept] >>> No step info for ${cascadeId.substring(0, 8)}, skipping (need trajectoryId + step data)`);
        return;
    }

    // Mark as in-progress only now that we know we can proceed
    autoAcceptedSet.add(debounceKey);
    setTimeout(() => autoAcceptedSet.delete(debounceKey), 15000);

    try {
        const result = await callApiFireAndForgetOnInstance(inst, 'HandleCascadeUserInteraction', body);
        if (result.ok) {
            console.log(`[AutoAccept] +++ ACCEPTED ${cascadeId.substring(0, 8)} via ${inst.workspaceName} (port ${inst.port})`);
            _broadcast({ type: 'auto_accepted', conversationId: cascadeId }, cascadeId);
            // Web Push for auto-accepted
            try {
                const { handleAutoAcceptedPush } = require('./push-service');
                handleAutoAcceptedPush(cascadeId);
            } catch {}
        } else {
            console.log(`[AutoAccept] --- FAILED ${cascadeId.substring(0, 8)} via ${inst.workspaceName}: ${result.error || result.data}`);
            // Remove from debounce so next poll cycle can retry
            autoAcceptedSet.delete(debounceKey);
        }
    } catch (e) {
        console.log(`[AutoAccept] !!! ERROR ${cascadeId.substring(0, 8)}: ${e.message}`);
        // Remove from debounce to allow retry
        autoAcceptedSet.delete(debounceKey);
    }
}

// Effective LS connections to poll/answer on. Hub model: when no workspace is tracked,
// lsInstances is empty but the hub connection still serves every cascade — fall back to it.
// (Same fallback the manual accept route uses.)
function effectiveInstances() {
    if (lsInstances.length) return lsInstances;
    try {
        const { getFirstActiveInstance } = require('./detector');
        const hub = getFirstActiveInstance();
        return hub ? [hub] : [];
    } catch { return []; }
}

// --- Legacy wrapper — tries all instances ---

async function handleAutoAccept(cascadeId, status, stepInfo = null) {
    if (!autoAcceptEnabled) return;
    if (status !== 'CASCADE_RUN_STATUS_WAITING_FOR_USER') return;
    for (const inst of effectiveInstances()) {
        await handleAutoAcceptDirect(cascadeId, inst, stepInfo);
    }
}

// --- Build accept payload for manual accept (used by routes.js) ---

// Locate WAITING steps (most-recent-first) for a cascade, with their trajectoryId and
// true step index. JSON first, binary protobuf fallback. Used both to build accept
// payloads and to fill trajectoryId/stepIndex into custom interactions sent by the UI.
async function locateWaitingSteps(cascadeId, instOrNull = null) {
    const callFn = instOrNull ? (m, b) => callApiOnInstance(instOrNull, m, b) : (m, b) => callApi(m, b);
    const summaries = await callFn('GetAllCascadeTrajectories', {});
    const info = summaries?.trajectorySummaries?.[cascadeId];
    if (!info) return [];

    const trajectoryId = info.trajectoryId;
    const stepCount = info.stepCount || 0;
    if (!trajectoryId || stepCount === 0) return [];

    const from = Math.max(0, stepCount - 8);
    const candidates = [];

    const stepsResp = await callFn('GetCascadeTrajectorySteps', {
        cascadeId, startIndex: from, endIndex: stepCount,
    });
    const steps = stepsResp?.steps || [];

    // Use Antigravity LS API workaround (JSON may ignore startIndex)
    const expectedRange = stepCount - from;
    const apiStartedAt = detectApiStartIndex(steps.length, expectedRange, from);

    for (let i = steps.length - 1; i >= 0; i--) { // search from end (most recent)
        if (steps[i].status === 'CORTEX_STEP_STATUS_WAITING' || steps[i].status === 9) {
            candidates.push({ trajectoryId, stepIndex: apiStartedAt + i, step: steps[i] });
        }
    }
    if (candidates.length > 0) return candidates;

    // Binary fallback: if JSON didn't return the WAITING step, try binary protobuf
    try {
        const { callApiBinary } = require('./api');
        const { decodeBinarySteps } = require('./protobuf');
        const binBuf = await callApiBinary(cascadeId, from, stepCount, instOrNull);
        const decoded = decodeBinarySteps(binBuf);
        for (let i = decoded.length - 1; i >= 0; i--) {
            if (decoded[i].status === 'CORTEX_STEP_STATUS_WAITING' || decoded[i].status === 9) {
                candidates.push({ trajectoryId, stepIndex: from + i, step: decoded[i] });
            }
        }
    } catch { }

    return candidates;
}

async function buildAcceptPayload(cascadeId, instOrNull = null) {
    const candidates = await locateWaitingSteps(cascadeId, instOrNull);
    for (const cand of candidates) {
        console.log(`[buildAcceptPayload] Found WAITING step[${cand.stepIndex}]`);
        const interaction = buildInteraction(cand);
        if (interaction) return { cascadeId, interaction };
    }
    return null;
}

// --- Dedicated auto-accept polling ---
// Polls ALL running cascades (even those not open in Antigravity Deck UI)
// to detect WAITING steps and auto-accept them.

let autoAcceptTimer = null;
const AUTO_ACCEPT_POLL_MS = 1500;
let isAutoAcceptRunning = false;

function startAutoAcceptPolling() {
    if (autoAcceptTimer) clearInterval(autoAcceptTimer);
    autoAcceptTimer = setInterval(autoAcceptPollNow, AUTO_ACCEPT_POLL_MS);
}

async function autoAcceptPollNow() {
    if (!autoAcceptEnabled) return;
    if (isAutoAcceptRunning) return; // Prevent concurrent runs
    const instances = effectiveInstances();
    if (instances.length === 0) return;
    isAutoAcceptRunning = true;

    try {
        // Poll EACH LS instance independently — NO lsConfig mutation!
        for (const inst of instances) {
            try {
                const summaries = await callApiOnInstance(inst, 'GetAllCascadeTrajectories');
                const trajectories = summaries?.trajectorySummaries || {};
                for (const [cascadeId, info] of Object.entries(trajectories)) {
                    // Check both RUNNING and WAITING_FOR_USER cascades
                    if (info.status !== 'CASCADE_RUN_STATUS_RUNNING' &&
                        info.status !== 'CASCADE_RUN_STATUS_WAITING_FOR_USER') continue;
                    const stepCount = info.stepCount || 0;
                    if (stepCount === 0) continue;
                    const trajectoryId = info.trajectoryId;
                    const from = Math.max(0, stepCount - 5);
                    try {
                        const stepsResp = await callApiOnInstance(inst, 'GetCascadeTrajectorySteps', {
                            cascadeId,
                            startIndex: from,
                            endIndex: stepCount,
                        });
                        const steps = stepsResp?.steps || [];
                        // Use Antigravity LS API workaround
                        const expectedRange = stepCount - from;
                        const apiStartedAt = detectApiStartIndex(steps.length, expectedRange, from);
                        let found = false;
                        for (let i = steps.length - 1; i >= 0; i--) { // search from end
                            const realIdx = apiStartedAt + i;
                            if (realIdx < from) continue; // skip steps outside requested range
                            if (steps[i].status === 'CORTEX_STEP_STATUS_WAITING' || steps[i].status === 9) {
                                const step = steps[i];
                                console.log(`[AutoAccept] WAITING on ${inst.workspaceName}:${inst.port} → ${cascadeId.substring(0, 8)} step[${realIdx}] (${(step.type || '').replace('CORTEX_STEP_TYPE_', '')})`);
                                await handleAutoAcceptDirect(cascadeId, inst, { trajectoryId, stepIndex: realIdx, step });
                                found = true;
                                break;
                            }
                        }
                        // Binary fallback: if JSON didn't return the right steps, try binary
                        if (!found && info.status === 'CASCADE_RUN_STATUS_WAITING_FOR_USER') {
                            try {
                                const { callApiBinary } = require('./api');
                                const { decodeBinarySteps } = require('./protobuf');
                                const binBuf = await callApiBinary(cascadeId, from, stepCount, inst);
                                const decoded = decodeBinarySteps(binBuf);
                                for (let i = decoded.length - 1; i >= 0; i--) {
                                    const step = decoded[i];
                                    if (step.status === 'CORTEX_STEP_STATUS_WAITING' || step.status === 9) {
                                        const stepIndex = from + i;
                                        console.log(`[AutoAccept] WAITING (binary) on ${inst.workspaceName}:${inst.port} → ${cascadeId.substring(0, 8)} step[${stepIndex}] (${(step.type || '').replace('CORTEX_STEP_TYPE_', '')})`);
                                        await handleAutoAcceptDirect(cascadeId, inst, { trajectoryId, stepIndex, step });
                                        break;
                                    }
                                }
                            } catch { }
                        }
                    } catch { }
                }
            } catch { }
        }
    } finally {
        isAutoAcceptRunning = false;
    }
}

module.exports = {
    getAutoAccept,
    setAutoAccept,
    buildInteraction,
    denyInteraction,
    buildAcceptPayload,
    locateWaitingSteps,
    handleAutoAccept,
    handleAutoAcceptDirect,
    startAutoAcceptPolling,
};
