'use client';

import { useMemo, useState, useRef, useEffect } from 'react';
import { Step } from '@/lib/types';
import { extractStepContent, getStepConfig } from '@/lib/step-utils';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { MarkdownRenderer } from './markdown-renderer';
import { User, Bot, Star, Copy, Check, Wrench, ArrowUp, ArrowDown, MessageSquare } from 'lucide-react';
import { StepIcon } from './ui/step-icon';

// === Classification ===
function isUserInput(step: Step): boolean {
    return step.type === 'CORTEX_STEP_TYPE_USER_INPUT';
}

function isAgentResponse(step: Step): boolean {
    if (step.type === 'CORTEX_STEP_TYPE_NOTIFY_USER') return true;
    if (step.type === 'CORTEX_STEP_TYPE_PLANNER_RESPONSE') {
        return !!step.plannerResponse?.modifiedResponse;
    }
    return false;
}

// === Grouping ===
interface StepGroup {
    type: 'user' | 'response' | 'processing';
    steps: { step: Step; originalIndex: number }[];
}

function groupSteps(steps: Step[]): StepGroup[] {
    const groups: StepGroup[] = [];
    let proc: { step: Step; originalIndex: number }[] = [];

    const flush = () => {
        if (proc.length > 0) {
            groups.push({ type: 'processing', steps: [...proc] });
            proc = [];
        }
    };

    steps.forEach((step, idx) => {
        if (isUserInput(step)) { flush(); groups.push({ type: 'user', steps: [{ step, originalIndex: idx }] }); }
        else if (isAgentResponse(step)) { flush(); groups.push({ type: 'response', steps: [{ step, originalIndex: idx }] }); }
        else { proc.push({ step, originalIndex: idx }); }
    });
    flush();
    return groups;
}

// renderMd removed — using MarkdownRenderer component now

// === Copy hook ===
function useCopy() {
    const [copied, setCopied] = useState(false);
    const copy = async (text: string, e?: React.MouseEvent) => {
        e?.stopPropagation();
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
    };
    return { copied, copy };
}

// === User Message ===
function UserMessage({ step, index, searchQuery, onStepClick, isBookmarked }: {
    step: Step; index: number; searchQuery?: string;
    onStepClick?: (i: number) => void; isBookmarked?: boolean;
}) {
    const { copied, copy } = useCopy();
    const content = useMemo(() => extractStepContent(step) || '', [step]);
    const tag = step.type.replace('CORTEX_STEP_TYPE_', '').toLowerCase();

    return (
        <div className={cn(
            'group relative border-l-[3px] border-l-blue-500 rounded-lg px-5 py-4 mb-4 transition-all',
            'bg-gradient-to-r from-blue-950/25 to-transparent',
            'hover:from-blue-950/35',
            isBookmarked && 'ring-1 ring-yellow-500/30'
        )}>
            <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-full bg-blue-500/20 flex items-center justify-center text-sm"><User className="h-3.5 w-3.5 text-blue-400" /></div>
                    <span className="text-xs font-bold text-blue-400 uppercase tracking-widest">User</span>
                    <Badge variant="secondary" className="text-[9px] font-mono h-4 px-1.5 bg-blue-500/10 text-blue-400/70 border-blue-500/20">{tag}</Badge>
                </div>
                <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    {isBookmarked && <span className="text-xs opacity-100"><Star className="h-3 w-3 fill-yellow-500 text-yellow-500" /></span>}
                    <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={(e) => copy(content, e)}>
                        {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                    </Button>
                    <Badge variant="outline" className="text-[9px] font-mono cursor-pointer hover:bg-muted/80 transition-colors" onClick={() => onStepClick?.(index)}>#{index + 1}</Badge>
                </div>
            </div>
            <div className="text-[14px] leading-relaxed"><MarkdownRenderer content={content} /></div>
        </div>
    );
}

// === Agent Response ===
function AgentResponse({ step, index, searchQuery, onStepClick, isBookmarked }: {
    step: Step; index: number; searchQuery?: string;
    onStepClick?: (i: number) => void; isBookmarked?: boolean;
}) {
    const { copied, copy } = useCopy();
    const content = useMemo(() => extractStepContent(step) || '', [step]);
    const tag = step.type.replace('CORTEX_STEP_TYPE_', '').toLowerCase();

    return (
        <div className={cn(
            'group relative border-l-[3px] border-l-purple-500 rounded-lg px-5 py-4 mb-4 transition-all',
            'bg-gradient-to-r from-purple-950/20 to-transparent',
            'hover:from-purple-950/30',
            isBookmarked && 'ring-1 ring-yellow-500/30'
        )}>
            <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-full bg-purple-500/20 flex items-center justify-center text-sm"><Bot className="h-3.5 w-3.5 text-purple-400" /></div>
                    <span className="text-xs font-bold text-purple-400 uppercase tracking-widest">Agent</span>
                    <Badge variant="secondary" className="text-[9px] font-mono h-4 px-1.5 bg-purple-500/10 text-purple-400/70 border-purple-500/20">{tag}</Badge>
                </div>
                <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    {isBookmarked && <span className="text-xs opacity-100"><Star className="h-3 w-3 fill-yellow-500 text-yellow-500" /></span>}
                    <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={(e) => copy(content, e)}>
                        {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                    </Button>
                    <Badge variant="outline" className="text-[9px] font-mono cursor-pointer hover:bg-muted/80 transition-colors" onClick={() => onStepClick?.(index)}>#{index + 1}</Badge>
                </div>
            </div>
            <div className="text-[14px] leading-relaxed"><MarkdownRenderer content={content} /></div>
        </div>
    );
}

// === Processing Group ===
function ProcessingGroup({ steps: groupSteps, searchQuery, onStepClick, bookmarkedSteps }: {
    steps: { step: Step; originalIndex: number }[];
    searchQuery?: string; onStepClick?: (i: number) => void;
    bookmarkedSteps?: Set<number>;
}) {
    const [expanded, setExpanded] = useState(false);

    const summary = useMemo(() => {
        const counts: Record<string, number> = {};
        groupSteps.forEach(({ step }) => {
            const c = getStepConfig(step.type);
            counts[c.label] = (counts[c.label] || 0) + 1;
        });
        return Object.entries(counts).map(([l, c]) => c > 1 ? `${c}× ${l}` : l).join(' · ');
    }, [groupSteps]);

    const hasBookmarks = groupSteps.some(({ originalIndex }) => bookmarkedSteps?.has(originalIndex));
    const first = groupSteps[0].originalIndex + 1;
    const last = groupSteps[groupSteps.length - 1].originalIndex + 1;

    return (
        <div className="mb-3 mx-1">
            <button
                onClick={() => setExpanded(!expanded)}
                className={cn(
                    'w-full flex items-center gap-2.5 px-4 py-2 rounded-lg text-xs transition-all duration-200',
                    'bg-muted/20 hover:bg-muted/40 border border-transparent',
                    expanded ? 'bg-muted/40 border-border/50 rounded-b-none' : 'hover:border-border/30'
                )}
            >
                <span className={cn('transition-transform duration-200 text-[10px] text-muted-foreground', expanded && 'rotate-90')}>▶</span>
                <span className="text-muted-foreground/80"><Wrench className="h-3 w-3 text-muted-foreground/80" /></span>
                <span className="font-semibold text-muted-foreground">{groupSteps.length} processing steps</span>
                <span className="text-[10px] text-muted-foreground/50 truncate flex-1 text-left font-mono">{summary}</span>
                {hasBookmarks && <span className="text-[10px]"><Star className="h-2.5 w-2.5 fill-yellow-500 text-yellow-500" /></span>}
                <Badge variant="outline" className="text-[9px] font-mono text-muted-foreground/60">#{first}{first !== last ? `–${last}` : ''}</Badge>
            </button>

            {expanded && (
                <div className="border border-t-0 border-border/50 rounded-b-lg bg-muted/10 py-1 px-1 space-y-0.5 animate-in slide-in-from-top-1 duration-150">
                    {groupSteps.map(({ step, originalIndex }) => {
                        const config = getStepConfig(step.type);
                        const content = extractStepContent(step) || '';
                        return (
                            <div
                                key={originalIndex}
                                className="flex items-start gap-2 py-1.5 px-3 text-xs text-muted-foreground hover:bg-white/[0.03] rounded-md cursor-pointer transition-colors"
                                onClick={() => onStepClick?.(originalIndex)}
                            >
                                <span className="shrink-0 mt-0.5"><StepIcon name={config.icon} className="text-muted-foreground/70" /></span>
                                <span className="font-medium text-foreground/60 shrink-0 min-w-16">{config.label}</span>
                                <span className="truncate opacity-60 flex-1">{content.substring(0, 150)}</span>
                                {bookmarkedSteps?.has(originalIndex) && <span className="shrink-0"><Star className="h-2.5 w-2.5 fill-yellow-500 text-yellow-500" /></span>}
                                <Badge variant="outline" className="text-[8px] font-mono shrink-0 opacity-50">#{originalIndex + 1}</Badge>
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}

// === Scroll buttons ===
function ScrollControls({ containerRef, show }: { containerRef: React.RefObject<HTMLDivElement | null>; show: boolean }) {
    if (!show) return null;
    return (
        <div className="absolute bottom-4 right-6 flex flex-col gap-1.5 z-10">
            <Button
                variant="secondary"
                size="sm"
                className="h-8 w-8 p-0 rounded-full shadow-lg bg-background/90 backdrop-blur border border-border hover:bg-muted"
                onClick={() => containerRef.current?.scrollTo({ top: 0, behavior: 'smooth' })}
            ><ArrowUp className="h-4 w-4" /></Button>
            <Button
                variant="secondary"
                size="sm"
                className="h-8 w-8 p-0 rounded-full shadow-lg bg-background/90 backdrop-blur border border-border hover:bg-muted"
                onClick={() => containerRef.current?.scrollTo({ top: containerRef.current.scrollHeight, behavior: 'smooth' })}
            ><ArrowDown className="h-4 w-4" /></Button>
        </div>
    );
}

// === Chat Area ===
export function ChatArea({ steps, searchQuery, activeFilters, onStepClick, bookmarkedSteps }: {
    steps: Step[]; searchQuery: string; activeFilters: Set<string>;
    onStepClick?: (i: number) => void; bookmarkedSteps?: Set<number>;
}) {
    const bottomRef = useRef<HTMLDivElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const [autoScroll, setAutoScroll] = useState(true);
    const [showScrollBtns, setShowScrollBtns] = useState(false);

    const groups = useMemo(() => groupSteps(steps), [steps]);

    const filteredGroups = useMemo(() => {
        if (!searchQuery) return groups;
        const q = searchQuery.toLowerCase();
        return groups.filter(g => g.steps.some(({ step }) => String(extractStepContent(step) || '').toLowerCase().includes(q)));
    }, [groups, searchQuery]);

    useEffect(() => {
        if (autoScroll) bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [filteredGroups.length, steps.length, autoScroll]);

    const handleScroll = () => {
        if (!containerRef.current) return;
        const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
        setAutoScroll(scrollHeight - scrollTop <= clientHeight + 100);
        setShowScrollBtns(scrollHeight > clientHeight + 200);
    };

    if (steps.length === 0) {
        return (
            <div className="flex-1 flex items-center justify-center">
                <div className="text-center text-muted-foreground space-y-3">
                    <div className="text-5xl animate-pulse"><MessageSquare className="h-12 w-12 text-muted-foreground/30" /></div>
                    <p className="text-lg font-medium">Chat Mirror</p>
                    <p className="text-sm opacity-60">Select a conversation to start viewing</p>
                </div>
            </div>
        );
    }

    return (
        <div className="flex-1 relative">
            <div ref={containerRef} onScroll={handleScroll} className="absolute inset-0 overflow-y-auto px-6 py-5">
                {/* Reading progress bar */}
                <div className="sticky top-0 z-10 -mx-6 -mt-5 mb-4">
                    <div className="h-[2px] bg-border/30">
                        <div
                            className="h-full bg-gradient-to-r from-blue-500 via-purple-500 to-green-500 transition-all duration-300"
                            style={{
                                width: containerRef.current
                                    ? `${Math.min(100, (containerRef.current.scrollTop / (containerRef.current.scrollHeight - containerRef.current.clientHeight)) * 100)}%`
                                    : '0%'
                            }}
                        />
                    </div>
                </div>

                <div className="max-w-4xl mx-auto">
                    {filteredGroups.map((group, gIdx) => {
                        if (group.type === 'user') {
                            const { step, originalIndex } = group.steps[0];
                            return <UserMessage key={`u-${gIdx}`} step={step} index={originalIndex} searchQuery={searchQuery} onStepClick={onStepClick} isBookmarked={bookmarkedSteps?.has(originalIndex)} />;
                        }
                        if (group.type === 'response') {
                            const { step, originalIndex } = group.steps[0];
                            return <AgentResponse key={`r-${gIdx}`} step={step} index={originalIndex} searchQuery={searchQuery} onStepClick={onStepClick} isBookmarked={bookmarkedSteps?.has(originalIndex)} />;
                        }
                        return <ProcessingGroup key={`p-${gIdx}`} steps={group.steps} searchQuery={searchQuery} onStepClick={onStepClick} bookmarkedSteps={bookmarkedSteps} />;
                    })}
                    <div ref={bottomRef} className="h-4" />
                </div>
            </div>

            <ScrollControls containerRef={containerRef} show={showScrollBtns} />
        </div>
    );
}
