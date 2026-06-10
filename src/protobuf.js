// === Binary Protobuf Encoding & Decoding ===
const protobuf = require('protobufjs');

// --- Encoding (for binary API calls) ---

function encodeVarint(value) {
    const bytes = [];
    if (value === 0) { bytes.push(0); return Buffer.from(bytes); }
    while (value > 0x7f) { bytes.push((value & 0x7f) | 0x80); value >>>= 7; }
    bytes.push(value & 0x7f);
    return Buffer.from(bytes);
}

function encodeStepsRequest(cascadeId, startIndex, endIndex) {
    const parts = [];
    const idBytes = Buffer.from(cascadeId, 'utf-8');
    parts.push(Buffer.from([0x0a]));  // field 1 (cascadeId), wire type 2
    parts.push(encodeVarint(idBytes.length));
    parts.push(idBytes);
    parts.push(Buffer.from([0x10]));  // field 2 (startIndex), wire type 0
    parts.push(encodeVarint(startIndex));
    parts.push(Buffer.from([0x18]));  // field 3 (endIndex), wire type 0
    parts.push(encodeVarint(endIndex));
    return Buffer.concat(parts);
}

// --- Decoding ---

// Status enum (binary field 4 value → JSON status string)
// Value 9 = WAITING confirmed from live LS data (both CODE_ACTION and RUN_COMMAND)
const STEP_STATUS_MAP = {
    0: 'CORTEX_STEP_STATUS_UNSPECIFIED',
    1: 'CORTEX_STEP_STATUS_PENDING',
    2: 'CORTEX_STEP_STATUS_IN_PROGRESS',
    3: 'CORTEX_STEP_STATUS_DONE',
    4: 'CORTEX_STEP_STATUS_ERROR',
    5: 'CORTEX_STEP_STATUS_CANCELLED',
    7: 'CORTEX_STEP_STATUS_BLOCKED',
    9: 'CORTEX_STEP_STATUS_WAITING',
};

// Type enum (binary field 1 value → JSON type string)
const STEP_TYPE_MAP = {
    5: 'CORTEX_STEP_TYPE_CODE_ACTION',
    8: 'CORTEX_STEP_TYPE_VIEW_FILE',
    9: 'CORTEX_STEP_TYPE_LIST_DIRECTORY',
    14: 'CORTEX_STEP_TYPE_USER_INPUT',
    15: 'CORTEX_STEP_TYPE_PLANNER_RESPONSE',
    17: 'CORTEX_STEP_TYPE_GENERATE_IMAGE',
    21: 'CORTEX_STEP_TYPE_RUN_COMMAND',
    23: 'CORTEX_STEP_TYPE_CHECKPOINT',
    28: 'CORTEX_STEP_TYPE_COMMAND_STATUS',
    31: 'CORTEX_STEP_TYPE_READ_URL_CONTENT',
    32: 'CORTEX_STEP_TYPE_VIEW_CONTENT_CHUNK',
    33: 'CORTEX_STEP_TYPE_SEARCH',
    47: 'CORTEX_STEP_TYPE_WORKSPACE_API',
    81: 'CORTEX_STEP_TYPE_TASK_BOUNDARY',
    82: 'CORTEX_STEP_TYPE_NOTIFY_USER',
    83: 'CORTEX_STEP_TYPE_CODE_ACKNOWLEDGEMENT',
    85: 'CORTEX_STEP_TYPE_BROWSER_SUBAGENT',
    90: 'CORTEX_STEP_TYPE_EPHEMERAL_MESSAGE',
    98: 'CORTEX_STEP_TYPE_CONVERSATION_HISTORY',
    99: 'CORTEX_STEP_TYPE_KNOWLEDGE_ARTIFACTS',
    100: 'CORTEX_STEP_TYPE_SEND_COMMAND_INPUT',
};

// Content field (binary field number → JSON key name)
const CONTENT_FIELD_MAP = {
    6: 'subtrajectory',
    10: 'codeAction',
    14: 'viewFile',
    15: 'listDirectory',
    19: 'userInput',
    20: 'plannerResponse',
    28: 'runCommand',
    30: 'checkpoint',
    31: 'sendCommandInput',
    37: 'commandStatus',
    40: 'readUrlContent',
    41: 'viewContentChunk',
    93: 'taskBoundary',
    94: 'notifyUser',
    95: 'codeAcknowledgement',
    97: 'browserSubagent',
    103: 'ephemeralMessage',
    111: 'conversationHistory',
    112: 'knowledgeArtifacts',
    113: 'error',
};

// Auto-discovered nested field name mappings (from cross-referencing JSON and binary responses)
const NESTED_FIELD_MAPS = {
    browserSubagent: { 1: 'task', 2: 'result', 3: 'taskName', 7: 'recordingName', 13: 'taskSummary' },
    checkpoint: { 1: 'checkpointIndex', 4: 'userIntent', 5: 'sessionSummary', 6: 'codeChangeSummary', 9: 'intentOnly', 12: 'includedStepIndexEnd' },
    codeAcknowledgement: { 3: 'isAccept' },
    codeAction: { 4: 'useFastApply', 9: 'markdownLanguage', 21: 'isArtifactFile', 22: 'artifactVersion', 26: 'description' },
    commandStatus: { 1: 'commandId', 8: 'outputCharacterCount', 9: 'combined', 10: 'waitDurationSeconds', 11: 'waitedDurationSeconds', 12: 'delta' },
    conversationHistory: { 1: 'content' },
    ephemeralMessage: { 1: 'content' },
    listDirectory: { 1: 'directoryPathUri' },
    notifyUser: { 2: 'notificationContent', 3: 'isBlocking', 7: 'shouldAutoProceed', 8: 'askForUserFeedback' },
    plannerResponse: { 1: 'response', 3: 'thinking', 6: 'messageId', 8: 'modifiedResponse' },
    readUrlContent: { 1: 'url', 3: 'resolvedUrl', 4: 'latencyMs' },
    runCommand: { 2: 'cwd', 6: 'exitCode', 11: 'blocking', 13: 'commandId', 23: 'commandLine', 25: 'proposedCommandLine' },
    sendCommandInput: { 1: 'commandId', 6: 'shouldAutoRun', 7: 'terminate', 8: 'waitMs' },
    taskBoundary: { 1: 'taskName', 2: 'taskStatus', 3: 'taskSummary', 4: 'taskSummaryWithCitations' },
    userInput: { 2: 'userResponse' },
    viewContentChunk: { 2: 'position', 5: 'documentId' },
    viewFile: { 1: 'absolutePathUri', 2: 'startLine', 3: 'endLine', 4: 'content', 11: 'numLines', 12: 'numBytes' },
};

// RequestedInteraction oneof (gemini_coder.Step field 56) — member field numbers from
// exa.cortex_pb.RequestedInteraction. Decoded so accept/auto-accept can answer the member
// the LS actually expects (see auto-accept.js buildFromRequestedInteraction). Without this,
// the binary-fallback path is blind to gates like the outside-of-project `permission` one.
const REQUESTED_INTERACTION_MEMBERS = {
    2: 'deploy', 3: 'runCommand', 4: 'openBrowserUrl', 5: 'runExtensionCode',
    7: 'executeBrowserJavascript', 8: 'captureBrowserScreenshot', 9: 'clickBrowserPixel',
    13: 'browserAction', 14: 'openBrowserSetup', 15: 'confirmBrowserSetup',
    16: 'sendCommandInput', 17: 'readUrlContent', 18: 'mcp', 19: 'filePermission',
    20: 'elicitation', 21: 'permission', 22: 'askQuestion', 23: 'approvalInteraction',
};

// PermissionInteractionSpec { resource=1 { action=1, target=2 }, suggested_persist_pattern=2,
//                             persist_suggestion_type=3, reason=4 }
function decodePermissionSpec(buf) {
    const reader = protobuf.Reader.create(buf);
    const spec = {};
    while (reader.pos < reader.len) {
        try {
            const tag = reader.uint32();
            const fn = tag >>> 3;
            const wt = tag & 7;
            if (fn === 1 && wt === 2) {
                const r = protobuf.Reader.create(Buffer.from(reader.bytes()));
                const resource = {};
                while (r.pos < r.len) {
                    const t2 = r.uint32();
                    const f2 = t2 >>> 3;
                    const w2 = t2 & 7;
                    if (f2 === 1 && w2 === 2) resource.action = Buffer.from(r.bytes()).toString('utf-8');
                    else if (f2 === 2 && w2 === 2) resource.target = Buffer.from(r.bytes()).toString('utf-8');
                    else r.skipType(w2);
                }
                spec.resource = resource;
            } else if (fn === 2 && wt === 2) {
                spec.suggestedPersistPattern = Buffer.from(reader.bytes()).toString('utf-8');
            } else if (fn === 3 && wt === 0) {
                spec.persistSuggestionType = reader.uint32(); // 0=UNSPECIFIED 1=SUGGESTED 2=BLOCKED
            } else if (fn === 4 && wt === 2) {
                spec.reason = Buffer.from(reader.bytes()).toString('utf-8');
            } else {
                reader.skipType(wt);
            }
        } catch { break; }
    }
    return spec;
}

// FilePermissionInteractionSpec { absolute_path_uri=1, is_directory=2, block_reason=3 }
function decodeFilePermissionSpec(buf) {
    const reader = protobuf.Reader.create(buf);
    const spec = {};
    while (reader.pos < reader.len) {
        try {
            const tag = reader.uint32();
            const fn = tag >>> 3;
            const wt = tag & 7;
            if (fn === 1 && wt === 2) spec.absolutePathUri = Buffer.from(reader.bytes()).toString('utf-8');
            else if (fn === 2 && wt === 0) spec.isDirectory = reader.uint32() !== 0;
            else if (fn === 3 && wt === 0) spec.blockReason = reader.uint32();
            else reader.skipType(wt);
        } catch { break; }
    }
    return spec;
}

function decodeRequestedInteraction(buf) {
    const reader = protobuf.Reader.create(buf);
    const out = {};
    while (reader.pos < reader.len) {
        try {
            const tag = reader.uint32();
            const fn = tag >>> 3;
            const wt = tag & 7;
            const member = REQUESTED_INTERACTION_MEMBERS[fn];
            if (member && wt === 2) {
                const bytes = Buffer.from(reader.bytes());
                if (member === 'permission') out.permission = decodePermissionSpec(bytes);
                else if (member === 'filePermission') out.filePermission = decodeFilePermissionSpec(bytes);
                else out[member] = bytes.length ? decodeGenericMessage(bytes, null) : {};
            } else {
                reader.skipType(wt);
            }
        } catch { break; }
    }
    return out;
}

// Count steps in a binary protobuf response (field 1 = repeated Step)
function countBinarySteps(buf) {
    const reader = protobuf.Reader.create(buf);
    let count = 0;
    try {
        while (reader.pos < reader.len) {
            const tag = reader.uint32();
            const fn = tag >>> 3;
            const wt = tag & 7;
            if (fn === 1 && wt === 2) { count++; reader.bytes(); }
            else { reader.skipType(wt); }
        }
    } catch { }
    return count;
}

// Decode binary protobuf step response to JSON-compatible objects.
function decodeBinarySteps(buf) {
    const reader = protobuf.Reader.create(buf);
    const steps = [];
    while (reader.pos < reader.len) {
        try {
            const tag = reader.uint32();
            const fn = tag >>> 3;
            const wt = tag & 7;
            if (fn === 1 && wt === 2) {
                const stepBytes = reader.bytes();
                const step = decodeStepMessage(Buffer.from(stepBytes));
                if (step) steps.push(step);
            } else {
                reader.skipType(wt);
            }
        } catch { break; }
    }
    return steps;
}

// Decode a single step from binary protobuf to JSON-like object.
function decodeStepMessage(buf) {
    const reader = protobuf.Reader.create(buf);
    const step = {};
    while (reader.pos < reader.len) {
        try {
            const tag = reader.uint32();
            const fn = tag >>> 3;
            const wt = tag & 7;
            if (fn === 1 && wt === 0) {
                const typeId = reader.uint32();
                step.type = STEP_TYPE_MAP[typeId] || `CORTEX_STEP_TYPE_UNKNOWN_${typeId}`;
            } else if (fn === 4 && wt === 0) {
                const statusId = reader.uint32();
                step.status = STEP_STATUS_MAP[statusId] || `CORTEX_STEP_STATUS_UNKNOWN_${statusId}`;
            } else if (fn === 5 && wt === 2) {
                const metaBytes = reader.bytes();
                step.metadata = decodeMetadata(Buffer.from(metaBytes));
            } else if (fn === 56 && wt === 2) {
                // requested_interaction — which CascadeUserInteraction member the LS expects
                const riBytes = reader.bytes();
                const ri = decodeRequestedInteraction(Buffer.from(riBytes));
                if (Object.keys(ri).length > 0) step.requestedInteraction = ri;
            } else if (wt === 2 && CONTENT_FIELD_MAP[fn]) {
                const bytes = reader.bytes();
                const key = CONTENT_FIELD_MAP[fn];
                step[key] = decodeGenericMessage(Buffer.from(bytes), NESTED_FIELD_MAPS[key] || null);
            } else {
                reader.skipType(wt);
            }
        } catch { break; }
    }
    return Object.keys(step).length > 0 ? step : null;
}

// Decode metadata sub-message
function decodeMetadata(buf) {
    const reader = protobuf.Reader.create(buf);
    const meta = {};
    while (reader.pos < reader.len) {
        try {
            const tag = reader.uint32();
            const fn = tag >>> 3;
            const wt = tag & 7;
            if (fn === 1 && wt === 2) {
                const tsBytes = reader.bytes();
                meta.createdAt = decodeTimestamp(Buffer.from(tsBytes));
            } else if (fn === 3 && wt === 0) {
                meta.stepIndex = reader.uint32();
            } else if (wt === 2) {
                const bytes = reader.bytes();
                const str = Buffer.from(bytes).toString('utf-8');
                if (fn === 6) meta.cascadeId = str;
                else if (fn === 12) meta.generatorModel = str;
            } else if (wt === 0) {
                reader.uint64(); // skip unknown varints
            } else {
                reader.skipType(wt);
            }
        } catch { break; }
    }
    return meta;
}

// Decode protobuf Timestamp to ISO string
function decodeTimestamp(buf) {
    const reader = protobuf.Reader.create(buf);
    let seconds = 0, nanos = 0;
    while (reader.pos < reader.len) {
        try {
            const tag = reader.uint32();
            const fn = tag >>> 3;
            if (fn === 1) seconds = reader.int64().toNumber();
            else if (fn === 2) nanos = reader.int32();
            else reader.skipType(tag & 7);
        } catch { break; }
    }
    const ms = seconds * 1000 + Math.floor(nanos / 1e6);
    return new Date(ms).toISOString();
}

// Schema-aware protobuf decoder: uses field name maps when available,
// falls back to field numbers for unknown nested messages.
function decodeGenericMessage(buf, fieldNameMap, depth = 0) {
    if (depth > 6 || buf.length === 0) return {};

    const reader = protobuf.Reader.create(buf);
    const result = {};
    let fieldCount = 0;
    let parseError = false;

    while (reader.pos < reader.len) {
        try {
            const tag = reader.uint32();
            const fn = tag >>> 3;
            const wt = tag & 7;
            if (fn === 0 || fn > 10000) { parseError = true; break; }
            fieldCount++;

            const fieldName = (fieldNameMap && fieldNameMap[fn]) || fn;
            let value;

            if (wt === 0) {
                const v = reader.uint64();
                value = v.toNumber();
            } else if (wt === 1) {
                value = reader.fixed64().toNumber();
            } else if (wt === 5) {
                value = reader.fixed32();
            } else if (wt === 2) {
                const bytes = reader.bytes();
                const sub = Buffer.from(bytes);
                const s = sub.toString('utf-8');
                if (looksLikeString(s, sub)) {
                    value = s;
                } else {
                    try {
                        const nested = decodeGenericMessage(sub, null, depth + 1);
                        value = (typeof nested === 'object' && Object.keys(nested).length > 0) ? nested : s;
                    } catch { value = s; }
                }
            } else {
                reader.skipType(wt);
                continue;
            }

            // Handle repeated fields
            if (fieldName in result) {
                if (!Array.isArray(result[fieldName])) result[fieldName] = [result[fieldName]];
                result[fieldName].push(value);
            } else {
                result[fieldName] = value;
            }
        } catch {
            parseError = true;
            break;
        }
    }

    if (parseError && fieldCount === 0) {
        const str = buf.toString('utf-8');
        return /^[\x20-\x7e\u00a0-\uffff\n\r\t]*$/.test(str) ? str : {};
    }
    return result;
}

// Heuristic: check if bytes look like a UTF-8 string vs nested protobuf
function looksLikeString(str, buf) {
    if (buf.length === 0) return true;
    let printable = 0;
    const len = Math.min(str.length, 200);
    for (let i = 0; i < len; i++) {
        const c = str.charCodeAt(i);
        if ((c >= 32 && c < 127) || c === 10 || c === 13 || c === 9 || (c >= 0x80 && c <= 0xffff)) printable++;
    }
    return len > 0 && printable / len > 0.9;
}

module.exports = {
    encodeVarint,
    encodeStepsRequest,
    countBinarySteps,
    decodeBinarySteps,
    decodeStepMessage,
    decodeMetadata,
    decodeTimestamp,
    decodeGenericMessage,
    decodeRequestedInteraction,
    looksLikeString,
    STEP_TYPE_MAP,
    STEP_STATUS_MAP,
    CONTENT_FIELD_MAP,
    NESTED_FIELD_MAPS,
    REQUESTED_INTERACTION_MEMBERS,
};
