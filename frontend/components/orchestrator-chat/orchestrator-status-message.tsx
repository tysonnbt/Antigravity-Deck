'use client';

import { memo } from 'react';
import { CheckCircle2, XCircle, Ban, RotateCcw, MessageSquarePlus } from 'lucide-react';
import type { OrchestratorChatMessage } from '@/lib/orchestrator-chat-types';

interface Props {
    message: OrchestratorChatMessage;
    onAction: (action: string) => void;
}

const STATUS_CONFIG = {
    completed: { icon: CheckCircle2, color: 'text-emerald-400', bg: 'bg-emerald-500/5', label: 'Completed' },
    failed: { icon: XCircle, color: 'text-red-400', bg: 'bg-red-500/5', label: 'Failed' },
    cancelled: { icon: Ban, color: 'text-amber-400', bg: 'bg-amber-500/5', label: 'Cancelled' },
    error: { icon: XCircle, color: 'text-red-400', bg: 'bg-red-500/5', label: 'Error' },
} as const;

export const OrchestratorStatusMessage = memo(function OrchestratorStatusMessage({ message, onAction }: Props) {
    const config = STATUS_CONFIG[message.messageType as keyof typeof STATUS_CONFIG];
    if (!config) return null;

    const Icon = config.icon;

    return (
        <div className={`mb-2 rounded-lg border border-border/30 ${config.bg} p-3`}>
            <div className="flex items-center gap-2 mb-1">
                <Icon className={`h-3.5 w-3.5 ${config.color}`} />
                <span className={`text-xs font-medium ${config.color}`}>{config.label}</span>
            </div>
            <p className="text-xs text-muted-foreground">{message.content}</p>
            {message.metadata?.error && (
                <p className="text-[10px] text-red-400/80 mt-1 font-mono">{message.metadata.error}</p>
            )}
            {message.actions && (
                <div className="flex gap-2 mt-2">
                    {message.actions.map((action) => (
                        <button
                            key={action.action}
                            onClick={() => onAction(action.action)}
                            className="text-[10px] px-2 py-1 rounded bg-muted/20 text-foreground hover:bg-muted/30"
                        >
                            {action.action === 'retry' && <RotateCcw className="h-3 w-3 inline mr-1" />}
                            {action.action === 'reset' && <MessageSquarePlus className="h-3 w-3 inline mr-1" />}
                            {action.label}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
});
