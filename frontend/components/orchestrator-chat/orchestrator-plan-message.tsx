'use client';

import { memo, useState } from 'react';
import { CheckCircle2, ChevronDown, ChevronRight, FileText, Pencil } from 'lucide-react';
import type { OrchestratorChatMessage } from '@/lib/orchestrator-chat-types';

interface Props {
    message: OrchestratorChatMessage;
    onAction: (action: string) => void;
    disabled?: boolean;
}

export const OrchestratorPlanMessage = memo(function OrchestratorPlanMessage({ message, onAction, disabled }: Props) {
    const [expanded, setExpanded] = useState(true);
    const plan = message.metadata?.plan;
    if (!plan) return null;

    return (
        <div className="mb-2 rounded-lg border border-border/30 bg-muted/5 p-3">
            <div className="flex items-center gap-2 mb-2">
                <FileText className="h-3.5 w-3.5 text-purple-400" />
                <span className="text-xs font-medium text-purple-300">Plan</span>
                {plan.strategy && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-400">
                        {plan.strategy}
                    </span>
                )}
            </div>

            {plan.summary && (
                <p className="text-xs text-muted-foreground mb-2">{plan.summary}</p>
            )}

            <button
                onClick={() => setExpanded(!expanded)}
                className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground mb-1"
            >
                {expanded ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                {plan.subtasks?.length || 0} subtasks
            </button>

            {expanded && plan.subtasks && (
                <div className="space-y-1 ml-2 mb-3">
                    {plan.subtasks.map((st) => (
                        <div key={st.id} className="text-[10px] text-muted-foreground">
                            <span className="text-foreground font-mono">{st.id}</span>
                            {' — '}
                            {st.description}
                            {st.affectedFiles && st.affectedFiles.length > 0 && (
                                <span className="ml-1 text-amber-400/60">
                                    [{st.affectedFiles.join(', ')}]
                                </span>
                            )}
                        </div>
                    ))}
                </div>
            )}

            {!disabled && message.actions && (
                <div className="flex gap-2">
                    {message.actions.map((action) => (
                        <button
                            key={action.action}
                            onClick={() => onAction(action.action)}
                            className={`text-[10px] px-2 py-1 rounded ${
                                action.action === 'approve'
                                    ? 'bg-emerald-600/20 text-emerald-400 hover:bg-emerald-600/30'
                                    : 'bg-amber-600/20 text-amber-400 hover:bg-amber-600/30'
                            }`}
                        >
                            {action.action === 'approve' ? (
                                <CheckCircle2 className="h-3 w-3 inline mr-1" />
                            ) : (
                                <Pencil className="h-3 w-3 inline mr-1" />
                            )}
                            {action.label}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
});
