'use client';
import { useState, useMemo, memo } from 'react';
import { Step } from '@/lib/types';
import { extractStepContent, getStepConfig } from '@/lib/step-utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { ChevronRight, Wrench } from 'lucide-react';
import { StepIcon } from '../ui/step-icon';
import { cn } from '@/lib/utils';
import { WaitingStep } from './waiting-step';
import { RawJsonViewer } from './raw-json-viewer';
import { CodeChangeViewer } from './code-change-viewer';

interface ProcessingGroupProps {
    steps: { step: Step; originalIndex: number }[];
    cascadeId?: string | null;
    totalStepCount?: number;
    onStepAccepted?: () => void;
}

export const ProcessingGroup = memo(function ProcessingGroup({ steps: groupSteps, cascadeId, totalStepCount = 0, onStepAccepted }: ProcessingGroupProps) {
    const [expanded, setExpanded] = useState(false);

    // Separate WAITING steps that should be shown prominently
    const { waitingSteps, codeAckSteps, normalSteps } = useMemo(() => {
        const waiting: typeof groupSteps = [];
        const codeAck: typeof groupSteps = [];
        const normal: typeof groupSteps = [];
        for (const item of groupSteps) {
            // Handle both string status (JSON) and integer status (binary-decoded cache)
            const s = item.step.status as string | number;
            const isWaiting = s === 'CORTEX_STEP_STATUS_WAITING' || s === 9;
            // If WAITING but there are steps AFTER it in the entire conversation, it's already processed
            const isStale = isWaiting && totalStepCount > 0 && item.originalIndex < totalStepCount - 1;
            if (isWaiting && !isStale) {
                waiting.push(item);
            } else if (
                (item.step.type === 'CORTEX_STEP_TYPE_CODE_ACKNOWLEDGEMENT' || item.step.codeAcknowledgement) &&
                item.step.codeAcknowledgement?.codeAcknowledgementInfos?.some(info => info.diff?.lines?.length)
            ) {
                codeAck.push(item);
            } else {
                normal.push(item);
            }
        }
        return { waitingSteps: waiting, codeAckSteps: codeAck, normalSteps: normal };
    }, [groupSteps, totalStepCount]);

    const summary = useMemo(() => {
        const counts: Record<string, number> = {};
        normalSteps.forEach(({ step }) => { const c = getStepConfig(step.type); counts[c.label] = (counts[c.label] || 0) + 1; });
        return Object.entries(counts).map(([l, c]) => c > 1 ? `${c}× ${l}` : l).join(' · ');
    }, [normalSteps]);

    const first = groupSteps[0].originalIndex + 1;
    const last = groupSteps[groupSteps.length - 1].originalIndex + 1;

    return (
        <>
            {/* Render WAITING steps as prominent cards */}
            {waitingSteps.map(({ step, originalIndex }) => (
                <WaitingStep
                    key={`wait-${originalIndex}`}
                    step={step}
                    originalIndex={originalIndex}
                    cascadeId={cascadeId || null}
                    onAccepted={onStepAccepted}
                />
            ))}

            {/* Render code acknowledgements as diff cards */}
            {codeAckSteps.map(({ step, originalIndex }) => (
                <div key={`ack-${originalIndex}`} className="mb-3 mx-4">
                    <CodeChangeViewer
                        infos={step.codeAcknowledgement?.codeAcknowledgementInfos || []}
                        isAccept={step.codeAcknowledgement?.isAccept}
                    />
                </div>
            ))}

            {/* Render normal steps in collapsed group */}
            {normalSteps.length > 0 && (
                <div className="mb-3 mx-4">
                    <Collapsible open={expanded} onOpenChange={setExpanded}>
                        <CollapsibleTrigger asChild>
                            <Button
                                variant="ghost"
                                className={cn(
                                    'w-full flex items-center justify-start gap-2.5 px-4 py-2 h-auto text-xs',
                                    'border border-transparent rounded-lg',
                                    expanded ? 'bg-muted/40 border-border/50 rounded-b-none' : 'bg-muted/20 hover:bg-muted/40 hover:border-border/30'
                                )}
                            >
                                <ChevronRight className={cn('h-3 w-3 text-muted-foreground transition-transform duration-200 shrink-0', expanded && 'rotate-90')} />
                                <span className="text-muted-foreground/80"><Wrench className="h-3 w-3 text-muted-foreground/80" /></span>
                                <span className="font-semibold text-muted-foreground">{normalSteps.length} steps</span>
                                <span className="text-[10px] text-muted-foreground/50 truncate flex-1 text-left font-mono">{summary}</span>
                                <Badge variant="outline" className="text-[9px] font-mono text-muted-foreground/60 shrink-0">#{first}{first !== last ? `–${last}` : ''}</Badge>
                            </Button>
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                            <div className="border border-t-0 border-border/50 rounded-b-lg bg-muted/10 py-1 px-1 space-y-0.5">
                                {normalSteps.map(({ step, originalIndex }) => {
                                    const config = getStepConfig(step.type);
                                    const content = extractStepContent(step) || '';
                                    return (
                                        <div key={originalIndex} className="flex items-start gap-2 py-1.5 px-3 text-xs text-muted-foreground hover:bg-white/[0.03] rounded-md transition-colors">
                                            <StepIcon name={config.icon} className="shrink-0 mt-0.5 text-muted-foreground/70" />
                                            <span className="font-medium text-foreground/60 shrink-0 min-w-16">{config.label}</span>
                                            <span className="truncate opacity-60 flex-1">{String(content ?? '').substring(0, 150)}</span>
                                            <Badge variant="outline" className="text-[8px] font-mono shrink-0 opacity-50">#{originalIndex + 1}</Badge>
                                            <RawJsonViewer step={step} />
                                        </div>
                                    );
                                })}
                            </div>
                        </CollapsibleContent>
                    </Collapsible>
                </div>
            )}
        </>
    );
});
ProcessingGroup.displayName = 'ProcessingGroup';
