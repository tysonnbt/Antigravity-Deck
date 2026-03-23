'use client';
import { memo, useMemo, useState, useCallback, useRef, useEffect } from 'react';
import { Step } from '@/lib/types';
import { extractStepContent } from '@/lib/step-utils';
import { MarkdownRenderer } from '../markdown-renderer';
import { useCopy } from './chat-helpers';
import { RawJsonViewer } from './raw-json-viewer';
import { Button } from '@/components/ui/button';
import { Copy, Check, RotateCcw } from 'lucide-react';

interface UserMessageProps {
    step: Step;
    index: number;
    stepIndex?: number;
    onRollback?: (stepIndex: number) => void;
    cascadeStatus?: string;
}

export const UserMessage = memo(function UserMessage({ step, index, stepIndex, onRollback, cascadeStatus }: UserMessageProps) {
    const { copied, copy } = useCopy();
    const content = useMemo(() => extractStepContent(step) || '', [step]);
    const [confirmRollback, setConfirmRollback] = useState(false);
    const confirmTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

    // Auto-dismiss confirm state after 3s
    useEffect(() => {
        if (confirmRollback) {
            confirmTimer.current = setTimeout(() => setConfirmRollback(false), 3000);
            return () => { if (confirmTimer.current) clearTimeout(confirmTimer.current); };
        }
    }, [confirmRollback]);

    const isActive = cascadeStatus === 'CASCADE_RUN_STATUS_RUNNING' || cascadeStatus === 'CASCADE_RUN_STATUS_WAITING_FOR_USER';
    const canRollback = onRollback && stepIndex != null && !isActive;

    const handleRollbackClick = useCallback((e: React.MouseEvent) => {
        e.stopPropagation();
        if (!canRollback) return;
        if (confirmRollback) {
            setConfirmRollback(false);
            onRollback(stepIndex - 1);
        } else {
            setConfirmRollback(true);
        }
    }, [canRollback, confirmRollback, onRollback, stepIndex]);

    // Extract images: from optimistic step (_media with dataUrl) or real step (userInput.media with thumbnail)
    const images = useMemo(() => {
        // Optimistic steps have _media with dataUrl
        const optimistic = (step as any)._media || [];
        // Real steps have userInput.media with { mimeType, thumbnail, uri, inlineData }
        const serverMedia = step.userInput?.media || (step as any).media || [];
        const raw = optimistic.length > 0 ? optimistic : serverMedia;
        if (!Array.isArray(raw) || raw.length === 0) return [];
        return raw.map((m: any) => {
            // Priority: dataUrl (optimistic) > thumbnail > inlineData
            let src = '';
            if (m.dataUrl) {
                src = m.dataUrl;
            } else if (m.thumbnail) {
                src = `data:${m.mimeType || 'image/png'};base64,${m.thumbnail}`;
            } else if (m.inlineData) {
                src = `data:${m.mimeType || 'image/png'};base64,${m.inlineData}`;
            }
            return { src, name: m.name || m.uri || 'image' };
        }).filter((img: any) => img.src);
    }, [step]);

    return (
        <div className="flex justify-end mb-4">
            <div className="max-w-[80%] group relative rounded-lg rounded-br-md px-4 py-3 bg-blue-600/20 border border-blue-500/20 overflow-hidden min-w-0">
                <div className="flex items-center justify-between gap-2 mb-1.5">
                    <div className="flex items-center gap-2">
                        <span className="text-[10px] font-bold text-blue-400 uppercase tracking-widest">You</span>
                        <span className="text-[10px] text-muted-foreground/40 opacity-0 group-hover:opacity-100">#{index + 1}</span>
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        {canRollback && (
                            <Button
                                variant="ghost"
                                size={confirmRollback ? 'sm' : 'icon'}
                                className={confirmRollback
                                    ? 'h-5 px-2 text-[10px] text-orange-400 hover:text-orange-300 hover:bg-orange-500/10'
                                    : 'h-5 w-5 text-muted-foreground/50 hover:text-foreground'}
                                onClick={handleRollbackClick}
                                title="Rollback to this message"
                            >
                                {confirmRollback ? 'Confirm?' : <RotateCcw className="h-3 w-3" />}
                            </Button>
                        )}
                        <RawJsonViewer step={step} />
                        <Button
                            variant="ghost"
                            size="icon"
                            className="h-5 w-5 text-muted-foreground/50 hover:text-foreground"
                            onClick={(e) => copy(content, e)}
                        >
                            {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                        </Button>
                    </div>
                </div>

                {/* Images */}
                {images.length > 0 && (
                    <div className="flex flex-wrap gap-2 mb-2">
                        {images.map((img: { src: string; name: string }, i: number) => (
                            <img
                                key={i}
                                src={img.src}
                                alt={img.name}
                                className="rounded-lg object-cover border border-border/30 max-h-48 max-w-[200px] cursor-pointer hover:opacity-90 transition-opacity"
                                onClick={() => window.open(img.src, '_blank')}
                            />
                        ))}
                    </div>
                )}

                {content && <div className="text-sm leading-relaxed"><MarkdownRenderer content={content} /></div>}
            </div>
        </div>
    );
});
UserMessage.displayName = 'UserMessage';
