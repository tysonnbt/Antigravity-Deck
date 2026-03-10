import { Step, StepDisplayConfig, StepStats } from './types';

// === Step type display config ===
export const STEP_DISPLAY: Record<string, StepDisplayConfig> = {
    'CORTEX_STEP_TYPE_USER_INPUT': { role: 'user', icon: 'User', label: 'User', show: true },
    'CORTEX_STEP_TYPE_PLANNER_RESPONSE': { role: 'thinking', icon: 'MessageCircle', label: 'Agent Thinking', show: true, collapsible: true },
    'CORTEX_STEP_TYPE_NOTIFY_USER': { role: 'response', icon: 'Megaphone', label: 'Agent Response', show: true },
    'CORTEX_STEP_TYPE_CODE_ACTION': { role: 'tool', icon: 'FileEdit', label: 'Code Edit', show: true },
    'CORTEX_STEP_TYPE_CODE_ACKNOWLEDGEMENT': { role: 'tool', icon: 'CheckCircle', label: 'Code Applied', show: true },
    'CORTEX_STEP_TYPE_RUN_COMMAND': { role: 'tool', icon: 'Zap', label: 'Terminal', show: true },
    'CORTEX_STEP_TYPE_COMMAND_STATUS': { role: 'tool', icon: 'BarChart2', label: 'Command Status', show: true },
    'CORTEX_STEP_TYPE_SEND_COMMAND_INPUT': { role: 'tool', icon: 'Keyboard', label: 'Command Input', show: true },
    'CORTEX_STEP_TYPE_VIEW_FILE': { role: 'tool', icon: 'FileText', label: 'View File', show: true },
    'CORTEX_STEP_TYPE_LIST_DIRECTORY': { role: 'tool', icon: 'FolderOpen', label: 'List Dir', show: true },
    'CORTEX_STEP_TYPE_BROWSER_SUBAGENT': { role: 'tool', icon: 'Globe', label: 'Browser', show: true },
    'CORTEX_STEP_TYPE_TASK_BOUNDARY': { role: 'system', icon: 'ClipboardList', label: 'Task', show: true },
    'CORTEX_STEP_TYPE_FIND': { role: 'tool', icon: 'Search', label: 'Search', show: true },
    'CORTEX_STEP_TYPE_GREP_SEARCH': { role: 'tool', icon: 'Search', label: 'Grep', show: true },
    'CORTEX_STEP_TYPE_ERROR_MESSAGE': { role: 'error', icon: 'XCircle', label: 'Error', show: true },
    'CORTEX_STEP_TYPE_CHECKPOINT': { role: 'system', icon: 'Save', label: 'Checkpoint', show: true },
    'CORTEX_STEP_TYPE_EPHEMERAL_MESSAGE': { role: 'system', icon: 'MessageSquare', label: 'System', show: true },
    'CORTEX_STEP_TYPE_CONVERSATION_HISTORY': { role: 'system', icon: 'ScrollText', label: 'History', show: true },
    'CORTEX_STEP_TYPE_KNOWLEDGE_ARTIFACTS': { role: 'system', icon: 'BookOpen', label: 'Knowledge', show: true },
    'CORTEX_STEP_TYPE_READ_URL_CONTENT': { role: 'tool', icon: 'Globe', label: 'Read URL', show: true },
    'CORTEX_STEP_TYPE_VIEW_CONTENT_CHUNK': { role: 'tool', icon: 'FileSearch', label: 'View Chunk', show: true },
    'CORTEX_STEP_TYPE_GENERATE_IMAGE': { role: 'tool', icon: 'ImagePlus', label: 'Generate Image', show: true },
};

export function getStepConfig(type: string): StepDisplayConfig {
    return STEP_DISPLAY[type] || { role: 'system', icon: 'Settings', label: type.replace('CORTEX_STEP_TYPE_', ''), show: true };
}

// === Extract displayable content from a step ===
export function extractStepContent(step: Step): string | null {
    const type = step.type || '';

    if (step.userInput) {
        const ui = step.userInput;
        // JSON API format: items array
        if (ui.items) return ui.items.map((i: any) => i.text || '').join('\n');
        // Binary protobuf format: userResponse string
        if (ui.userResponse) return ui.userResponse;
        // Fallback: check numeric field keys from generic protobuf decoder
        // Field 1 in userInput message = items (repeated), field 2 = userResponse
        if (typeof ui === 'string') return ui;
        const vals = Object.values(ui).filter(v => typeof v === 'string' && (v as string).length > 0);
        if (vals.length > 0) return vals.join('\n');
    }

    if (step.plannerResponse) {
        const pr = step.plannerResponse;
        if (pr.modifiedResponse) return pr.modifiedResponse;
        if (pr.response) return pr.response;
        if (pr.thinking) return pr.thinking;
        if (pr.text) return pr.text;
        if (pr.content) return pr.content;
        if (pr.responseItems) return pr.responseItems.map(i => i.text || '').join('\n');
        if (pr.toolCalls?.length) {
            return pr.toolCalls.map(tc => {
                const name = tc.name || 'tool';
                let detail = '';
                try {
                    const args = JSON.parse(tc.argumentsJson || '{}');
                    if (args.AbsolutePath) detail = args.AbsolutePath;
                    else if (args.TargetFile) detail = args.TargetFile;
                    else if (args.CommandLine) detail = `\`${args.CommandLine}\``;
                    else if (args.SearchPath) detail = `${args.Query || args.Pattern || ''} in ${args.SearchPath}`;
                    else if (args.DirectoryPath) detail = args.DirectoryPath;
                    else if (args.Url) detail = args.Url;
                    else if (args.TaskName) detail = args.TaskName;
                    else {
                        const first = Object.entries(args).find(([, v]) => typeof v === 'string' && (v as string).length > 0);
                        if (first) detail = `${first[0]}: ${(first[1] as string).substring(0, 80)}`;
                    }
                } catch { /* ignore */ }
                return `🔧 **${name}**${detail ? ` — ${detail}` : ''}`;
            }).join('\n');
        }
        return null;
    }

    if (step.notifyUser) {
        const nu = step.notifyUser;
        if (nu.notificationContent) return nu.notificationContent;
        if (nu.message) return nu.message;
        try { const args = JSON.parse(step.metadata?.argumentsJson || '{}'); if (args.Message) return args.Message; } catch { /* */ }
        return null;
    }

    if (step.codeAction || type === 'CORTEX_STEP_TYPE_CODE_ACTION') {
        const ca = step.codeAction || {};
        if (ca.actionSpec?.command) {
            const cmd = ca.actionSpec.command;
            const file = cmd.replacementChunks?.[0]?.targetFile || '';
            const targetFile = file || ca.targetFile || '';
            return `**${targetFile}**\n${cmd.instruction || cmd.description || ''}`;
        }
        try { const args = JSON.parse(step.metadata?.argumentsJson || '{}'); if (args.TargetFile || args.Description) return `**${args.TargetFile || ''}**\n${args.Description || args.Instruction || ''}`; } catch { /* */ }
        return `**${ca.targetFile || ''}**\n${ca.description || ca.instruction || ''}`;
    }

    if (step.codeAcknowledgement || type === 'CORTEX_STEP_TYPE_CODE_ACKNOWLEDGEMENT') {
        const ack = step.codeAcknowledgement || {};
        const accepted = ack.isAccept !== false;
        const infos = ack.codeAcknowledgementInfos || [];
        if (infos.length > 0) {
            return infos.map(info => {
                const file = info.uriPath || '';
                const basename = file.split('/').pop() || file;
                const diffLines = info.diff?.lines || [];
                const added = diffLines.filter(l => l.type?.includes('ADDED')).length;
                const removed = diffLines.filter(l => l.type?.includes('REMOVED')).length;
                return `${accepted ? '✅' : '❌'} **${basename}** (+${added} -${removed})`;
            }).join('\n');
        }
        return `${accepted ? '✅ Accepted' : '❌ Rejected'} code changes`;
    }

    if (step.runCommand || type === 'CORTEX_STEP_TYPE_RUN_COMMAND') {
        const rc = step.runCommand || {};
        const cmdLine = rc.commandLine || rc.command || '';
        if (cmdLine) return `\`\`\`bash\n${cmdLine}\n\`\`\``;
        try { const args = JSON.parse(step.metadata?.argumentsJson || '{}'); if (args.CommandLine) return `\`\`\`bash\n${args.CommandLine}\n\`\`\``; } catch { /* */ }
        return null;
    }

    if (step.sendCommandInput || type === 'CORTEX_STEP_TYPE_SEND_COMMAND_INPUT') {
        const sci = step.sendCommandInput || {};
        const parts: string[] = [];
        if (sci.terminate) parts.push('🛑 **Terminated** command');
        else if (sci.input) parts.push(`⌨️ Input: \`${sci.input.substring(0, 100)}\``);
        if (sci.output?.full) { const out = sci.output.full.trim(); if (out.length > 0) parts.push(`\`\`\`\n${out.substring(0, 300)}${out.length > 300 ? '...' : ''}\n\`\`\``); }
        if (parts.length) return parts.join('\n');
        return null;
    }

    if (step.commandStatus || type === 'CORTEX_STEP_TYPE_COMMAND_STATUS') {
        const cs = step.commandStatus || {};
        if (cs.output?.full) return `\`\`\`\n${cs.output.full.substring(0, 500)}\n\`\`\``;
        return null;
    }

    if (step.taskBoundary || type === 'CORTEX_STEP_TYPE_TASK_BOUNDARY') {
        const tb = step.taskBoundary || {};
        if (tb.taskName) return `**${tb.taskName}**${tb.taskStatus ? ` — ${tb.taskStatus}` : ''}${tb.taskSummary ? `\n\n${tb.taskSummary}` : ''}`;
        try { const args = JSON.parse(step.metadata?.argumentsJson || '{}'); if (args.TaskName) return `**${args.TaskName}** — ${args.TaskStatus || ''}`; } catch { /* */ }
        return null;
    }

    if (step.viewFile || type === 'CORTEX_STEP_TYPE_VIEW_FILE') {
        const vf = step.viewFile || {};
        const filePath = vf.absolutePath || vf.filePath || '';
        if (filePath) { const basename = filePath.split('/').pop(); const range = (vf.startLine && vf.endLine) ? ` (lines ${vf.startLine}-${vf.endLine})` : ''; return `📄 **${basename}**${range}\n\`${filePath}\``; }
        try { const args = JSON.parse(step.metadata?.argumentsJson || '{}'); if (args.AbsolutePath) { const basename = args.AbsolutePath.split('/').pop(); return `📄 **${basename}**${args.StartLine ? ` (lines ${args.StartLine}-${args.EndLine || ''})` : ''}\n\`${args.AbsolutePath}\``; } } catch { /* */ }
        return null;
    }

    if (step.listDirectory || type === 'CORTEX_STEP_TYPE_LIST_DIRECTORY') {
        const ld = step.listDirectory || {};
        if (ld.directoryPath) return `📁 **${ld.directoryPath}**`;
        try { const args = JSON.parse(step.metadata?.argumentsJson || '{}'); if (args.DirectoryPath) return `📁 **${args.DirectoryPath}**`; } catch { /* */ }
        return null;
    }

    if (step.browserSubagent || type === 'CORTEX_STEP_TYPE_BROWSER_SUBAGENT') {
        const bs = step.browserSubagent || {};
        const parts: string[] = [];
        if (bs.task) parts.push(bs.task);
        else if (bs.description) parts.push(bs.description);
        if (step.subtrajectory?.steps) { const subSteps = step.subtrajectory.steps; const lastSub = subSteps[subSteps.length - 1]; if (lastSub?.plannerResponse?.response) parts.push(`\n---\n**Result:** ${lastSub.plannerResponse.response.substring(0, 300)}`); }
        return parts.join('\n') || 'Browser action';
    }

    if (step.readUrlContent || type === 'CORTEX_STEP_TYPE_READ_URL_CONTENT') { try { const args = JSON.parse(step.metadata?.argumentsJson || '{}'); if (args.Url) return `🌐 **${args.Url}**`; } catch { /* */ } return null; }
    if (step.viewContentChunk || type === 'CORTEX_STEP_TYPE_VIEW_CONTENT_CHUNK') { try { const args = JSON.parse(step.metadata?.argumentsJson || '{}'); return `📑 Chunk #${args.position ?? '?'} from \`${args.document_id || ''}\``; } catch { /* */ } return null; }
    if (step.errorMessage) { const em = step.errorMessage; if (typeof em === 'string') return em; if (em.error) { const e = em.error; if (typeof e === 'string') return e; return e.userErrorMessage || e.shortError || e.message || JSON.stringify(e); } return em.message || (typeof em.error === 'string' ? em.error : null) || JSON.stringify(em); }
    if (step.ephemeralMessage?.content) return step.ephemeralMessage.content.substring(0, 200) + '...';
    if (step.checkpoint || type === 'CORTEX_STEP_TYPE_CHECKPOINT') { const cp = step.checkpoint || {}; const model = cp.modelName || cp.model || ''; const tokens = cp.inputTokens || cp.totalTokens || ''; if (model || tokens) return `💾 Model: **${model}**${tokens ? ` | Tokens: ${tokens}` : ''}`; return '💾 Checkpoint saved'; }
    if (step.conversationHistory || type === 'CORTEX_STEP_TYPE_CONVERSATION_HISTORY') return '📜 Conversation history loaded';
    if (type === 'CORTEX_STEP_TYPE_KNOWLEDGE_ARTIFACTS') return '📚 Knowledge artifacts loaded';
    if (step.grepSearch || type === 'CORTEX_STEP_TYPE_GREP_SEARCH') { try { const args = JSON.parse(step.metadata?.argumentsJson || '{}'); return `🔍 \`${args.Query || ''}\` in \`${args.SearchPath || ''}\``; } catch { /* */ } return null; }
    if (step.find || type === 'CORTEX_STEP_TYPE_FIND') { try { const args = JSON.parse(step.metadata?.argumentsJson || '{}'); return `🔍 \`${args.Pattern || args.Query || ''}\` in \`${args.SearchDirectory || ''}\``; } catch { /* */ } return null; }

    if (step.generateImage || type === 'CORTEX_STEP_TYPE_GENERATE_IMAGE') {
        const gi = step.generateImage || {};
        const name = gi.imageName || 'image';
        const prompt = gi.prompt || '';
        return `🖼️ **${name}**${prompt ? `\n_${prompt}_` : ''}`;
    }

    if (step.metadata?.argumentsJson) {
        try {
            const args = JSON.parse(step.metadata.argumentsJson);
            if (args.AbsolutePath) return `📄 ${args.AbsolutePath}`;
            if (args.SearchDirectory || args.SearchPath) return `🔍 ${args.Query || args.Pattern || ''} in \`${args.SearchDirectory || args.SearchPath}\``;
            if (args.CommandId) return `📊 Command ${(args.CommandId as string).substring(0, 8)}...`;
            if (args.DirectoryPath) return `📁 ${args.DirectoryPath}`;
        } catch { /* */ }
    }
    if (step.metadata?.name) return `🔧 ${step.metadata.name}`;
    return null;
}

// === Compute stats ===
export function computeStats(steps: Step[]): StepStats {
    const stats: StepStats = { total: steps.length, user: 0, agent: 0, tool: 0, system: 0, error: 0, typeCounts: {} };
    steps.forEach(s => {
        const config = getStepConfig(s.type);
        if (config.role === 'user') stats.user++;
        else if (config.role === 'response' || (config.role === 'thinking' && (s.plannerResponse?.modifiedResponse || s.plannerResponse?.response))) stats.agent++;
        else if (config.role === 'tool') stats.tool++;
        else if (config.role === 'error') stats.error++;
        else stats.system++;
        const shortType = (s.type || '').replace('CORTEX_STEP_TYPE_', '');
        stats.typeCounts[shortType] = (stats.typeCounts[shortType] || 0) + 1;
    });
    return stats;
}

// === Export to markdown ===
export function exportToMarkdown(steps: Step[], convId: string): void {
    // Step type counts for metadata
    const typeCounts: Record<string, number> = {};
    steps.forEach(s => { const c = getStepConfig(s.type); typeCounts[c.label] = (typeCounts[c.label] || 0) + 1; });
    const countStr = Object.entries(typeCounts).map(([l, c]) => `${l}: ${c}`).join(' · ');

    let md = `# Antigravity Deck Export\n\n**Conversation ID:** \`${convId}\`\n**Steps:** ${steps.length} (${countStr})\n**Exported:** ${new Date().toLocaleString()}\n\n---\n\n`;

    steps.forEach((step, idx) => {
        const config = getStepConfig(step.type);
        const isUser = step.type === 'CORTEX_STEP_TYPE_USER_INPUT';
        const isAgent = step.plannerResponse?.modifiedResponse || step.plannerResponse?.response || step.type === 'CORTEX_STEP_TYPE_NOTIFY_USER';
        const content = extractStepContent(step) || `_${config.label} step_`;

        if (isUser) {
            md += `## 💬 You (Step #${idx + 1})\n\n${content}\n\n---\n\n`;
        } else if (isAgent) {
            md += `## 🤖 Agent (Step #${idx + 1})\n\n${content}\n\n---\n\n`;
        } else {
            md += `<details><summary>${config.icon} ${config.label} (Step #${idx + 1})</summary>\n\n\`\`\`\n${content.substring(0, 500)}\n\`\`\`\n\n</details>\n\n`;
        }
    });

    const blob = new Blob([md], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `chat-mirror-${convId.substring(0, 8)}-${new Date().toISOString().slice(0, 10)}.md`;
    a.click();
    URL.revokeObjectURL(url);
}
