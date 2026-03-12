'use client';
import { AlertTriangle, MessageSquarePlus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

interface ContextWarningBannerProps {
    tier: 'warning' | 'danger';
    pct: number;
    stepCount: number;
    limit: number;
    onDismiss: () => void;
    onNewChat: () => void;
}

export function ContextWarningBanner({
    tier, pct, stepCount, limit, onDismiss, onNewChat
}: ContextWarningBannerProps) {
    const isWarning = tier === 'warning';
    const pctDisplay = Math.round(pct * 100);

    return (
        <div className={cn(
            'mx-4 mb-2 rounded-lg border px-3 py-2 text-xs animate-in slide-in-from-bottom-2 duration-300',
            isWarning
                ? 'bg-amber-500/10 border-amber-500/30 text-amber-200'
                : 'bg-red-500/10 border-red-500/30 text-red-200'
        )}>
            {/* Top row: icon + message + dismiss */}
            <div className="flex items-center gap-2">
                <AlertTriangle className={cn(
                    'h-3.5 w-3.5 shrink-0',
                    isWarning ? 'text-amber-400' : 'text-red-400'
                )} />
                <span className="flex-1">
                    {isWarning
                        ? `Chat is getting long (${pctDisplay}%) — consider starting a new chat`
                        : `Chat is very long (${pctDisplay}%) — start a new chat for better results`
                    }
                </span>
                <button
                    onClick={onDismiss}
                    className="shrink-0 p-0.5 rounded hover:bg-white/10 transition-colors"
                    aria-label="Dismiss warning"
                >
                    <X className="h-3 w-3" />
                </button>
            </div>

            {/* Progress bar */}
            <div className="mt-1.5 flex items-center gap-2">
                <div className="flex-1 h-1.5 rounded-full bg-white/10 overflow-hidden">
                    <div
                        className={cn(
                            'h-full rounded-full transition-all duration-500',
                            isWarning ? 'bg-amber-400' : 'bg-red-400'
                        )}
                        style={{ width: `${Math.min(pctDisplay, 100)}%` }}
                    />
                </div>
                <span className="text-[10px] tabular-nums opacity-70 w-20 text-right">
                    {stepCount} / {limit} steps
                </span>
            </div>

            {/* CTA button */}
            <div className="mt-2 flex justify-end">
                <Button
                    variant="outline"
                    size="sm"
                    className={cn(
                        'h-6 text-[10px] gap-1',
                        isWarning
                            ? 'border-amber-500/40 text-amber-300 hover:bg-amber-500/20'
                            : 'border-red-500/40 text-red-300 hover:bg-red-500/20'
                    )}
                    onClick={onNewChat}
                >
                    <MessageSquarePlus className="h-3 w-3" />
                    Start New Chat
                </Button>
            </div>
        </div>
    );
}
