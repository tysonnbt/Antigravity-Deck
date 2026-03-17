'use client';

import { memo, useState } from 'react';
import { ChevronDown, ChevronRight, XCircle } from 'lucide-react';
import type { OrchestratorChatMessage } from '@/lib/orchestrator-chat-types';

interface Props {
    message: OrchestratorChatMessage;
    onAction: (action: string) => void;
    onClarify?: (taskId: string, answer: string) => void;
}

export const OrchestratorProgressMessage = memo(function OrchestratorProgressMessage({ message, onAction, onClarify }: Props) {
    const [expanded, setExpanded] = useState(true);
    const { progress = 0, elapsed = 0, subtasks = {} } = message.metadata || {};
    const pct = Math.round(progress * 100);
    const elapsedSec = Math.round(elapsed / 1000);

    const subtaskEntries = Object.entries(subtasks);
    const completedCount = subtaskEntries.filter(([, s]) => s.state === 'completed').length;
    const totalCount = subtaskEntries.length;

    return (
        <div className="mb-2 rounded-lg border border-border/30 bg-muted/5 p-3">
            <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-blue-300">Executing</span>
                    <span className="text-[10px] text-muted-foreground">
                        {completedCount}/{totalCount} done · {elapsedSec}s
                    </span>
                </div>
                <button
                    onClick={() => onAction('cancel')}
                    className="text-[10px] px-1.5 py-0.5 rounded bg-red-600/20 text-red-400 hover:bg-red-600/30"
                >
                    <XCircle className="h-3 w-3 inline mr-0.5" />
                    Cancel
                </button>
            </div>

            {/* Progress bar */}
            <div className="h-1 w-full bg-muted/20 rounded-full mb-2">
                <div
                    className="h-full bg-blue-500 rounded-full transition-all duration-300"
                    style={{ width: `${pct}%` }}
                />
            </div>

            <button
                onClick={() => setExpanded(!expanded)}
                className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground"
            >
                {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                Subtasks
            </button>

            {expanded && (
                <div className="space-y-1 mt-1">
                    {subtaskEntries.map(([taskId, status]) => {
                        const stateIcon = status.state === 'completed' ? '✓' : status.state === 'running' ? '⟳' : status.state === 'failed' ? '✗' : '○';
                        const stateColor = status.state === 'completed' ? 'text-emerald-400' : status.state === 'running' ? 'text-blue-400' : status.state === 'failed' ? 'text-red-400' : 'text-muted-foreground';
                        return (
                            <div key={taskId} className="text-[10px] flex items-center gap-1">
                                <span className={stateColor}>{stateIcon}</span>
                                <span className="font-mono text-foreground">{taskId}</span>
                                <span className="text-muted-foreground truncate">{status.result || ''}</span>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
});
