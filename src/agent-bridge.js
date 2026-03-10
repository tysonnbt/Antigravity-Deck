// === Agent Bridge ===
// Relay between Antigravity (Executor) and Pi/OpenClaw via Discord.
//
// Discord Commands (no @mention needed):
//   /help           — show available commands
//   /listws         — list workspaces under defaultWorkspaceRoot
//   /setws <name>   — set active workspace; creates new cascade if bridge active
//
// Regular messages (@mention required in guild):
//   Relayed to Antigravity cascade. Antigravity NOTIFY_USER → forwarded to Discord.

const fs = require('fs');
const path = require('path');
const discord = require('./discord-relay');
const { startCascade, sendMessage: cascadeSend } = require('./cascade');
const { getStepCountAndStatus } = require('./step-cache');
const { waitAndExtractResponse } = require('./cascade-relay');
const { getSettings, saveSettings } = require('./config');
const { callApi: _callApi } = require('./api');

// ── State ────────────────────────────────────────────────────────────────────

const STATES = { IDLE: 'IDLE', ACTIVE: 'ACTIVE', TRANSITIONING: 'TRANSITIONING' };

let state = STATES.IDLE;
let activeCascadeId = null;
let stepCount = 0;
let softLimit = 500;
let workspaceName = 'AntigravityAuto';
let log = [];
let lastRelayTs = 0;
let lastRelayedStepIndex = -1; // track last relayed step index to prevent duplicates
let isBridgeBusy = false; // true = message sent, waiting for response relay
let bridgeLsInst = null; // Stored LS instance for bridge — independent from global lsConfig

// ── Persist bridge state to settings.json ────────────────────────────────────

function saveBridgeState() {
    const settings = getSettings();
    saveSettings({
        agentBridge: {
            ...settings.agentBridge,
            currentWorkspace: workspaceName,
            lastCascadeId: activeCascadeId,
            lastStepCount: stepCount,
            lastRelayedStepIndex: lastRelayedStepIndex,
        }
    });
}

function restoreBridgeState() {
    const bridgeSettings = getSettings().agentBridge || {};
    if (bridgeSettings.lastCascadeId) {
        activeCascadeId = bridgeSettings.lastCascadeId;
        stepCount = bridgeSettings.lastStepCount || 0;
        lastRelayedStepIndex = bridgeSettings.lastRelayedStepIndex ?? -1;
        addLog('system', `Restored previous cascade: ${shortId(activeCascadeId)} (${stepCount} steps, lastRelayed=${lastRelayedStepIndex})`);
    }
}

// Helper: callApi bound to bridge's LS instance (falls back to global if not set)
function bridgeCallApi(method, body = {}) {
    return _callApi(method, body, bridgeLsInst);
}

// ── Public API ───────────────────────────────────────────────────────────────

async function startBridge(config = {}) {
    if (state !== STATES.IDLE) {
        throw new Error(`Bridge already ${state}`);
    }

    const settings = getSettings();
    const bridgeSettings = settings.agentBridge || {};

    const token = config.discordBotToken || bridgeSettings.discordBotToken;
    const channelId = config.discordChannelId || bridgeSettings.discordChannelId;
    softLimit = config.stepSoftLimit || bridgeSettings.stepSoftLimit || 500;

    // Load last-used workspace from settings
    workspaceName = bridgeSettings.currentWorkspace
        || config.workspaceName
        || settings.workspaceName
        || 'AntigravityAuto';

    // Find the LS instance matching the workspace and bind bridgeLsInst
    const { lsInstances } = require('./config');
    const matchInst = lsInstances.find(
        i => i.workspaceName.toLowerCase() === workspaceName.toLowerCase()
    );
    if (matchInst) {
        bridgeLsInst = { port: matchInst.port, csrfToken: matchInst.csrfToken, useTls: matchInst.useTls };
        addLog('system', `Bound to LS instance: ${workspaceName} (port ${matchInst.port})`);
    } else {
        addLog('system', `No LS instance found for workspace "${workspaceName}" — using global fallback`);
    }

    if (!token) throw new Error('Missing discordBotToken');
    if (!channelId) throw new Error('Missing discordChannelId');

    if (config.cascadeId && config.cascadeId.trim()) {
        activeCascadeId = config.cascadeId.trim();
        const info = await getStepCountAndStatus(activeCascadeId).catch(() => ({ stepCount: 0 }));
        stepCount = info.stepCount || 0;
        addLog('system', `Locking to cascade: ${shortId(activeCascadeId)} (${stepCount} steps)`);
    } else {
        // Try to restore from previous session
        restoreBridgeState();
        if (!activeCascadeId) {
            addLog('system', 'Auto-follow mode: will latch to first active cascade');
        }
    }

    const eventHook = (event, data) => {
        if (event === 'error') addLog('error', `Discord: ${data.message}`);
        if (event === 'update') addLog('system', `Discord msg from @${data.from}: "${data.text}"`);
        if (event === 'reply') addLog('system', `Discord reply processed: action=${data.action}`);
        if (event === 'command') addLog('system', `Discord command: /${data.command} from @${data.from}`);
        if (event === 'listening') addLog('system', `Discord WS active on channel ${data.channelId}`);
        if (event === 'ready') addLog('system', `Discord bot ready: ${data.tag}`);
        if (event === 'ignored') addLog('system', `Discord ignored: "${data.text}"`);
    };

    const guildId = config.discordGuildId || bridgeSettings.discordGuildId || '';
    await discord.init(token, channelId, guildId, eventHook);
    discord.startListening(handlePiReply, handleCommand);

    state = STATES.ACTIVE;
    addLog('system', `Bridge ACTIVE — workspace: ${workspaceName}, limit: ${softLimit}`);

    await discord.sendMessage(discord.formatBridgeStatus(
        `Bridge ACTIVE\n` +
        `**Workspace:** \`${workspaceName}\`\n` +
        `**Cascade limit:** ${softLimit} steps\n` +
        `Type \`/help\` for commands`
    )).catch(e => addLog('error', `Discord init msg error: ${e.message}`));

    return getStatus();
}

function stopBridge() {
    if (state === STATES.IDLE) return;
    discord.stop().catch(() => { });
    state = STATES.IDLE;
    activeCascadeId = null;
    stepCount = 0;
    lastRelayedStepIndex = -1;
    isBridgeBusy = false;
    addLog('system', 'Bridge stopped');
}

function getStatus() {
    return {
        state,
        cascadeId: activeCascadeId,
        cascadeIdShort: shortId(activeCascadeId),
        stepCount,
        softLimit,
        workspaceName,
        log: log.slice(-50),
    };
}

// ── Discord Command Handler ───────────────────────────────────────────────────

async function handleCommand(cmd, args, replyFn) {
    const settings = getSettings();
    const wsRoot = settings.defaultWorkspaceRoot || '';
    const { lsInstances } = require('./config');

    switch (cmd) {
        case 'help': {
            await replyFn([
                '📖 **Agent Bridge Commands**',
                '```',
                '/help              — Show this help',
                '/listws            — List running LS instances + folders',
                '/setws <name>      — Switch to workspace (opens if needed)',
                '/createws <name>   — Create new workspace folder + open in Antigravity',
                '```',
                `**Active workspace:** \`${workspaceName}\``,
                `**Cascade:** #${shortId(activeCascadeId)} (${stepCount}/${softLimit} steps)`,
                `**State:** ${state}`,
            ].join('\n'));
            break;
        }

        case 'listws': {
            const lines = [];
            // Running LS instances
            if (lsInstances.length > 0) {
                lines.push('**🟢 Running (Antigravity open):**');
                lsInstances.forEach(inst => {
                    const activeTag = inst.active ? ' ← LS active' : '';
                    const bridgeTag = inst.workspaceName === workspaceName ? ' 🤖' : '';
                    const bold = inst.active ? '**' : '';
                    lines.push(`${bold}• ${inst.workspaceName}${activeTag}${bridgeTag}${bold}`);
                });
            } else {
                lines.push('*No running Antigravity instances detected*');
            }
            // Filesystem folders not already shown
            try {
                if (wsRoot && fs.existsSync(wsRoot)) {
                    const running = new Set(lsInstances.map(i => i.workspaceName));
                    const fsWs = fs.readdirSync(wsRoot, { withFileTypes: true })
                        .filter(d => d.isDirectory() && !running.has(d.name))
                        .map(d => d.name).sort();
                    if (fsWs.length > 0) {
                        lines.push('\n**📁 Other folders (not running):**');
                        fsWs.forEach(w => lines.push(`• ${w}`));
                    }
                }
            } catch { /* ignore */ }
            lines.push(`\n*Use \`/setws <name>\` to switch. 🤖 = bridge workspace*`);
            await replyFn(lines.join('\n'));
            break;
        }

        case 'setws': {
            const newWs = args[0] || '';
            if (!newWs.trim()) {
                await replyFn(`❌ Usage: \`/setws <workspace_name>\`\nCurrent: \`${workspaceName}\``);
                break;
            }

            // ── Case 1: Already a running LS instance ──────────────────────
            const matchIdx = lsInstances.findIndex(
                i => i.workspaceName.toLowerCase() === newWs.toLowerCase()
            );

            if (matchIdx >= 0) {
                // Same as clicking "active workspace" in sidebar:
                // switchToInstance + clear step cache
                const { cleanupAll } = require('./cleanup');
                cleanupAll();
                bridgeLsInst = { port: lsInstances[matchIdx].port, csrfToken: lsInstances[matchIdx].csrfToken, useTls: lsInstances[matchIdx].useTls };
                workspaceName = lsInstances[matchIdx].workspaceName;
                addLog('system', `Switched LS → ${workspaceName} (port: ${lsInstances[matchIdx].port})`);
                saveSettings({ agentBridge: { ...settings.agentBridge, currentWorkspace: workspaceName } });

                if (state === STATES.ACTIVE || state === STATES.TRANSITIONING) {
                    await replyFn(`✅ Switched to \`${workspaceName}\` (port ${lsInstances[matchIdx].port})\n🔄 Starting new cascade...`);
                    await performCascadeTransition(`Workspace: ${workspaceName}`);
                } else {
                    await replyFn(`✅ Switched to \`${workspaceName}\` — ready`);
                }
                break;
            }

            // ── Case 2: Not running — open in Antigravity IDE ──────────────
            // Same as clicking "Available Workspace" in sidebar:
            // POST /api/workspaces/create { name } → launches IDE, polls 30s
            await replyFn(`⏳ Opening \`${newWs}\` in Antigravity... (waiting up to 30s)`);
            addLog('system', `Opening workspace: ${newWs}`);

            const { PORT } = require('./config');
            const authKey = process.env.AUTH_KEY || '';
            const headers = { 'Content-Type': 'application/json' };
            if (authKey) headers['X-Auth-Key'] = authKey;

            let createResult;
            try {
                const res = await fetch(`http://localhost:${PORT}/api/workspaces/create`, {
                    method: 'POST',
                    headers,
                    body: JSON.stringify({ name: newWs }),
                    signal: AbortSignal.timeout(35000),
                });
                createResult = await res.json();
            } catch (e) {
                await replyFn(`❌ Failed to open workspace: ${e.message}`);
                break;
            }

            if (createResult.error) {
                await replyFn(`❌ ${createResult.error}`);
                break;
            }

            // Find the newly opened LS instance by name
            const newIdx = lsInstances.findIndex(
                i => i.workspaceName.toLowerCase() === newWs.toLowerCase()
            );
            if (newIdx >= 0) {
                bridgeLsInst = { port: lsInstances[newIdx].port, csrfToken: lsInstances[newIdx].csrfToken, useTls: lsInstances[newIdx].useTls };
                workspaceName = lsInstances[newIdx].workspaceName;
            } else if (createResult.workspace?.workspaceName) {
                // Fallback: use response workspaceName to find instance
                const fallbackIdx = lsInstances.findIndex(
                    i => i.workspaceName.toLowerCase() === createResult.workspace.workspaceName.toLowerCase()
                );
                if (fallbackIdx >= 0) {
                    bridgeLsInst = { port: lsInstances[fallbackIdx].port, csrfToken: lsInstances[fallbackIdx].csrfToken, useTls: lsInstances[fallbackIdx].useTls };
                }
                workspaceName = createResult.workspace.workspaceName;
            } else {
                workspaceName = newWs;
            }

            saveSettings({ agentBridge: { ...settings.agentBridge, currentWorkspace: workspaceName } });
            addLog('system', `Workspace opened: ${workspaceName}`);

            if (state === STATES.ACTIVE || state === STATES.TRANSITIONING) {
                await replyFn(`✅ \`${workspaceName}\` opened — starting new cascade...`);
                await performCascadeTransition(`Workspace: ${workspaceName}`);
            } else {
                await replyFn(`✅ \`${workspaceName}\` is ready`);
            }
            break;
        }

        case 'createws': {
            const newWsName = args[0] || '';
            if (!newWsName.trim()) {
                await replyFn(`❌ Usage: \`/createws <workspace_name>\``);
                break;
            }

            await replyFn(`⏳ Creating \`${newWsName}\` and opening in Antigravity... (waiting up to 30s)`);
            addLog('system', `Creating workspace: ${newWsName}`);

            const { PORT: CREATE_PORT } = require('./config');
            const { lsInstances: lsInst2 } = require('./config');
            const createAuthKey = process.env.AUTH_KEY || '';
            const createHeaders = { 'Content-Type': 'application/json' };
            if (createAuthKey) createHeaders['X-Auth-Key'] = createAuthKey;

            let result;
            try {
                const res = await fetch(`http://localhost:${CREATE_PORT}/api/workspaces/create`, {
                    method: 'POST',
                    headers: createHeaders,
                    body: JSON.stringify({ name: newWsName }),
                    signal: AbortSignal.timeout(35000),
                });
                result = await res.json();
            } catch (e) {
                await replyFn(`❌ Failed: ${e.message}`);
                break;
            }

            if (result.error) {
                await replyFn(`❌ ${result.error}`);
                break;
            }

            if (result.alreadyOpen) {
                await replyFn(`ℹ️ Workspace \`${newWsName}\` already open — use \`/setws ${newWsName}\` to switch`);
                break;
            }

            // Switch to the new workspace by name
            const newIdx2 = lsInst2.findIndex(i => i.workspaceName.toLowerCase() === newWsName.toLowerCase());
            if (newIdx2 >= 0) {
                bridgeLsInst = { port: lsInst2[newIdx2].port, csrfToken: lsInst2[newIdx2].csrfToken, useTls: lsInst2[newIdx2].useTls };
                workspaceName = lsInst2[newIdx2].workspaceName;
            } else if (result.workspace?.workspaceName) {
                const fallbackIdx2 = lsInst2.findIndex(
                    i => i.workspaceName.toLowerCase() === result.workspace.workspaceName.toLowerCase()
                );
                if (fallbackIdx2 >= 0) {
                    bridgeLsInst = { port: lsInst2[fallbackIdx2].port, csrfToken: lsInst2[fallbackIdx2].csrfToken, useTls: lsInst2[fallbackIdx2].useTls };
                }
                workspaceName = result.workspace.workspaceName;
            } else {
                workspaceName = newWsName;
            }

            saveSettings({ agentBridge: { ...getSettings().agentBridge, currentWorkspace: workspaceName } });
            addLog('system', `Workspace created + opened: ${workspaceName}`);

            if (state === STATES.ACTIVE || state === STATES.TRANSITIONING) {
                await replyFn(`✅ \`${workspaceName}\` created — starting new cascade...`);
                await performCascadeTransition(`New workspace: ${workspaceName}`);
            } else {
                await replyFn(`✅ \`${workspaceName}\` created and ready`);
            }
            break;
        }

        default:
            await replyFn(`❓ Unknown command \`/${cmd}\`. Type \`/help\` for available commands.`);
    }
}

// (handleNotifyUser removed — relay now triggered by cascade status change in poller.js)

// ── Handle Pi's reply from Discord ───────────────────────────────────────────

async function handlePiReply({ reply, action, authorId, authorName }) {
    if (state !== STATES.ACTIVE && state !== STATES.TRANSITIONING) return;

    // Prefix sender name so agent knows who's talking
    const messageToSend = authorName ? `${authorName}: ${reply}` : reply;

    // If no cascade yet, create one with workspace context
    if (!activeCascadeId) {
        try {
            activeCascadeId = await startCascade(bridgeLsInst);
            stepCount = 0;
            lastRelayTs = 0;
            lastRelayedStepIndex = -1;
            isBridgeBusy = false;
            addLog('system', `Created cascade: ${shortId(activeCascadeId)} for workspace: ${workspaceName}`);
            saveBridgeState();
            await discord.sendMessage(discord.formatBridgeStatus(
                `New cascade #${shortId(activeCascadeId)} — workspace: \`${workspaceName}\``
            )).catch(() => { });
        } catch (e) {
            addLog('error', `Cannot create cascade: ${e.message}`);
            return;
        }
    } else {
        // Block if bridge is still waiting for response from previous message
        if (isBridgeBusy) {
            addLog('system', `Bridge busy — waiting for response relay. Message blocked.`);
            await discord.sendMessage(discord.formatBridgeStatus(
                `⚠️ Agent đang xử lý, hãy chờ response rồi gửi lại message nhé`
            )).catch(() => { });
            return;
        }

        // Check cascade status
        try {
            const info = await getStepCountAndStatus(activeCascadeId, (m, b) => bridgeCallApi(m, b));
            const status = info.status || '';

            // DONE/COMPLETED/unknown → terminal, need new cascade
            const isTerminal = status === 'CASCADE_RUN_STATUS_DONE' ||
                status === 'CASCADE_RUN_STATUS_COMPLETED' ||
                status === '';
            if (isTerminal) {
                addLog('system', `Cascade ${shortId(activeCascadeId)} is ${status || 'UNKNOWN'} — creating new cascade`);
                const oldId = activeCascadeId;
                activeCascadeId = await startCascade(bridgeLsInst);
                stepCount = 0;
                lastRelayTs = 0;
                lastRelayedStepIndex = -1;
                isBridgeBusy = false;
                addLog('system', `New cascade: ${shortId(activeCascadeId)} (old: ${shortId(oldId)})`);
                saveBridgeState();
                await discord.sendMessage(discord.formatBridgeStatus(
                    `Previous cascade finished → new cascade #${shortId(activeCascadeId)}`
                )).catch(() => { });
            } else {
                // IDLE/RUNNING/WAITING → reuse cascade
                stepCount = info.stepCount || stepCount;
                addLog('system', `Cascade ${shortId(activeCascadeId)} is ${status} — reusing (${stepCount} steps)`);

                // Pre-check: if at/over step limit, transition BEFORE sending
                if (stepCount >= softLimit) {
                    addLog('system', `Step limit reached (${stepCount}/${softLimit}) — transitioning before send`);
                    await performCascadeTransition('Step limit reached');
                }
            }
        } catch (e) {
            addLog('system', `Status check failed: ${e.message} — sending to existing cascade`);
        }
    }

    addLog('from_pi', messageToSend.substring(0, 200));

    // Set busy BEFORE cascadeSend — block concurrent messages during agent processing
    const cascadeIdAtSend = activeCascadeId;
    isBridgeBusy = true;

    try {
        await cascadeSend(activeCascadeId, messageToSend, { inst: bridgeLsInst });
        addLog('system', `✓ Sent to cascade ${shortId(activeCascadeId)} — waiting for response`);
    } catch (e) {
        isBridgeBusy = false;
        addLog('error', `cascadeSend failed: ${e.message}`);
        return;
    }

    if (action === 'accept') {
        await triggerAccept().catch(e => addLog('error', `Accept failed: ${e.message}`));
    } else if (action === 'reject') {
        await triggerReject().catch(e => addLog('error', `Reject failed: ${e.message}`));
    }

    if (state === STATES.TRANSITIONING) {
        state = STATES.ACTIVE;
        addLog('system', `Transitioned OK → ${shortId(activeCascadeId)}`);
    }

    // Show "typing..." in Discord while waiting for response
    discord.sendTyping();
    const typingInterval = setInterval(() => discord.sendTyping(), 8000);

    // Wait for cascade to finish → extract complete response → relay to Discord
    const result = await waitAndExtractResponse(cascadeIdAtSend, {
        inst: bridgeLsInst,
        fromStepIndex: lastRelayedStepIndex,
        log: addLog,
        shouldAbort: () => activeCascadeId !== cascadeIdAtSend || !isBridgeBusy,
    });

    clearInterval(typingInterval);

    if (result.text) {
        // Send to Discord FIRST — only advance state if send succeeds
        try {
            await discord.sendResponse({
                workspaceName,
                cascadeIdShort: shortId(activeCascadeId),
                stepCount: result.stepCount,
                softLimit,
                content: result.text,
                mentionUserId: authorId,
                mentionUserName: authorName,
            });
        } catch (e) {
            // Discord send failed — DON'T advance lastRelayedStepIndex
            // so the response can be retried on next interaction
            isBridgeBusy = false;
            addLog('error', `Discord send failed (response NOT consumed): ${e.message}`);
            return;
        }

        // Send succeeded — now advance state
        lastRelayedStepIndex = result.stepIndex;
        stepCount = result.stepCount;
        isBridgeBusy = false;
        lastRelayTs = Date.now();
        saveBridgeState();

        // Step limit check
        if (stepCount >= softLimit) {
            await performCascadeTransition('Auto: step limit reached');
        } else if (stepCount >= softLimit - 10) {
            await discord.sendMessage(discord.formatBridgeStatus(
                `⚠️ Cascade #${shortId(activeCascadeId)} at ${stepCount}/${softLimit} steps — will auto-transition soon`
            )).catch(() => { });
        }
    } else {
        isBridgeBusy = false;
        addLog('system', `Response extraction failed or timeout for ${shortId(cascadeIdAtSend)}`);
    }
}

// ── Cascade Transition ────────────────────────────────────────────────────────

async function performCascadeTransition(reason = null) {
    const oldId = activeCascadeId;
    const oldCount = stepCount;

    state = STATES.TRANSITIONING;
    addLog('system', `Transitioning cascade after ${oldCount} steps...${reason ? ` (${reason})` : ''}`);

    let newId;
    try {
        newId = await startCascade(bridgeLsInst);
    } catch (e) {
        addLog('error', `Failed to create new cascade: ${e.message}`);
        state = STATES.ACTIVE;
        return;
    }

    activeCascadeId = newId;
    stepCount = 0;
    lastRelayedStepIndex = -1;
    isBridgeBusy = false;
    lastRelayTs = 0;

    await discord.sendMessage(discord.formatCascadeSwitch({
        oldShort: shortId(oldId),
        newShort: shortId(newId),
        stepCount: oldCount,
    })).catch(e => addLog('error', `Transition notice error: ${e.message}`));

    if (reason) {
        await discord.sendMessage(discord.formatBridgeStatus(
            `New cascade #${shortId(newId)} for workspace \`${workspaceName}\` — please re-inject context`
        )).catch(() => { });
    }

    state = STATES.ACTIVE;
    addLog('system', `Cascade transitioned → ${shortId(newId)}`);
    saveBridgeState();
}

// ── Accept / Reject ───────────────────────────────────────────────────────────

async function triggerAccept() {
    await bridgeCallApi('AcceptDiff', { cascadeId: activeCascadeId });
    addLog('system', '✓ Auto-accepted code changes');
}

async function triggerReject() {
    await bridgeCallApi('RejectDiff', { cascadeId: activeCascadeId });
    addLog('system', '✓ Auto-rejected code changes');
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function shortId(id) {
    return id ? id.substring(0, 8) : '--------';
}

function addLog(type, message) {
    log.push({ type, message, ts: Date.now() });
    if (log.length > 200) log = log.slice(-200);
    const line = `[Bridge/${type}] ${String(message).substring(0, 120)}`;
    console.log(line);
    // Also write to bridge.log for full inspection (truncation-free)
    try {
        const logPath = path.join(__dirname, '..', 'bridge.log');
        fs.appendFileSync(logPath, `${new Date().toISOString()} ${line}\n`);
    } catch { /* ignore write errors */ }
}

// ── Exports ───────────────────────────────────────────────────────────────────

module.exports = {
    startBridge, stopBridge, getStatus,
    STATES,
    get state() { return state; },
    get activeCascadeId() { return activeCascadeId; },
    get stepCount() { return stepCount; },
};
