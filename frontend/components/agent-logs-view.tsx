'use client';

import { useState, useEffect, useRef, useCallback, memo } from 'react';
import { cn } from '@/lib/utils';
import { wsService } from '@/lib/ws-service';
import {
    Activity, User, Bot, Wrench, Filter, Trash2,
    Wifi, WifiOff, ChevronDown, ChevronRight,
    Terminal, FileCode2, Search, Eye, Globe, Copy, Check,
} from 'lucide-react';

// ─── Step type classification ─────────────────────────────────────────────────

type StepRole = 'user' | 'agent' | 'tool' | 'system';

function getStepRole(type: string): StepRole {
    if (type === 'CORTEX_STEP_TYPE_USER_INPUT') return 'user';
    if (
        type === 'CORTEX_STEP_TYPE_PLANNER_RESPONSE' ||
        type === 'CORTEX_STEP_TYPE_NOTIFY_USER'
    ) return 'agent';
    if (
        type === 'CORTEX_STEP_TYPE_CODE_ACTION' ||
        type === 'CORTEX_STEP_TYPE_RUN_COMMAND' ||
        type === 'CORTEX_STEP_TYPE_COMMAND_STATUS' ||
        type === 'CORTEX_STEP_TYPE_SEND_COMMAND_INPUT' ||
        type === 'CORTEX_STEP_TYPE_VIEW_FILE' ||
        type === 'CORTEX_STEP_TYPE_LIST_DIRECTORY' ||
        type === 'CORTEX_STEP_TYPE_GREP_SEARCH' ||
        type === 'CORTEX_STEP_TYPE_FIND' ||
        type === 'CORTEX_STEP_TYPE_READ_URL_CONTENT' ||
        type === 'CORTEX_STEP_TYPE_BROWSER_SUBAGENT' ||
        type === 'CORTEX_STEP_TYPE_VIEW_CONTENT_CHUNK'
    ) return 'tool';
    return 'system';
}

const STEP_LABELS: Record<string, string> = {
    CORTEX_STEP_TYPE_USER_INPUT: 'User',
    CORTEX_STEP_TYPE_PLANNER_RESPONSE: 'Agent',
    CORTEX_STEP_TYPE_NOTIFY_USER: 'Notify',
    CORTEX_STEP_TYPE_CODE_ACTION: 'Code Edit',
    CORTEX_STEP_TYPE_CODE_ACKNOWLEDGEMENT: 'Code Ack',
    CORTEX_STEP_TYPE_RUN_COMMAND: 'Run Cmd',
    CORTEX_STEP_TYPE_SEND_COMMAND_INPUT: 'Cmd Input',
    CORTEX_STEP_TYPE_COMMAND_STATUS: 'Cmd Status',
    CORTEX_STEP_TYPE_TASK_BOUNDARY: 'Task',
    CORTEX_STEP_TYPE_VIEW_FILE: 'View File',
    CORTEX_STEP_TYPE_LIST_DIRECTORY: 'List Dir',
    CORTEX_STEP_TYPE_GREP_SEARCH: 'Grep',
    CORTEX_STEP_TYPE_FIND: 'Find',
    CORTEX_STEP_TYPE_READ_URL_CONTENT: 'Fetch URL',
    CORTEX_STEP_TYPE_VIEW_CONTENT_CHUNK: 'View Chunk',
    CORTEX_STEP_TYPE_BROWSER_SUBAGENT: 'Browser',
    CORTEX_STEP_TYPE_EPHEMERAL_MESSAGE: 'System',
    CORTEX_STEP_TYPE_CHECKPOINT: 'Checkpoint',
    CORTEX_STEP_TYPE_CONVERSATION_HISTORY: 'History',
    CORTEX_STEP_TYPE_ERROR: 'Error',
};

const ROLE_CONFIG: Record<StepRole, { icon: React.ElementType; color: string; bg: string; dot: string }> = {
    user: { icon: User, color: 'text-sky-400', bg: 'bg-sky-400/8', dot: 'bg-sky-400' },
    agent: { icon: Bot, color: 'text-violet-400', bg: 'bg-violet-400/8', dot: 'bg-violet-400' },
    tool: { icon: Wrench, color: 'text-amber-400', bg: 'bg-amber-400/8', dot: 'bg-amber-400' },
    system: { icon: Activity, color: 'text-slate-500', bg: 'bg-slate-500/5', dot: 'bg-slate-500' },
};

const TOOL_ICONS: Record<string, React.ElementType> = {
    CORTEX_STEP_TYPE_RUN_COMMAND: Terminal,
    CORTEX_STEP_TYPE_COMMAND_STATUS: Terminal,
    CORTEX_STEP_TYPE_CODE_ACTION: FileCode2,
    CORTEX_STEP_TYPE_GREP_SEARCH: Search,
    CORTEX_STEP_TYPE_VIEW_FILE: Eye,
    CORTEX_STEP_TYPE_READ_URL_CONTENT: Globe,
    CORTEX_STEP_TYPE_BROWSER_SUBAGENT: Globe,
};

// ─── Event types ─────────────────────────────────────────────────────────────

interface LogEvent {
    id: string;        // unique id for React key
    ts: number;        // timestamp ms
    convId: string;
    type: string;      // WS message type
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    payload: any;      // raw payload
    // For step events
    stepRole?: StepRole;
    stepLabel?: string;
    stepContent?: string;
    stepIndex?: number;
}

// ─── Extract readable content from a step ────────────────────────────────────

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function extractContent(step: any, type: string): string {
    if (!step) return '';
    // User input
    if (type === 'CORTEX_STEP_TYPE_USER_INPUT') {
        return step.userInput?.items?.[0]?.text || step.userInput?.message || '';
    }
    // Agent response
    if (type === 'CORTEX_STEP_TYPE_PLANNER_RESPONSE' || type === 'CORTEX_STEP_TYPE_NOTIFY_USER') {
        return step.plannerResponse?.content?.[0]?.text
            || step.plannerResponse?.text
            || step.response?.message
            || step.notifyUser?.message
            || '';
    }
    // Commands
    if (type === 'CORTEX_STEP_TYPE_RUN_COMMAND') {
        return step.runCommand?.command || step.command || '';
    }
    if (type === 'CORTEX_STEP_TYPE_COMMAND_STATUS') {
        const out = step.commandStatus?.output || step.output || '';
        return typeof out === 'string' ? out.slice(0, 300) : '';
    }
    // Code action
    if (type === 'CORTEX_STEP_TYPE_CODE_ACTION') {
        const path = step.codeAction?.path || step.path || '';
        const action = step.codeAction?.action || step.action || '';
        return `${action} ${path}`.trim();
    }
    // File views
    if (type === 'CORTEX_STEP_TYPE_VIEW_FILE') {
        return step.viewFile?.path || step.path || '';
    }
    if (type === 'CORTEX_STEP_TYPE_GREP_SEARCH') {
        return step.grepSearch?.query || step.query || '';
    }
    if (type === 'CORTEX_STEP_TYPE_READ_URL_CONTENT') {
        return step.readUrlContent?.url || step.url || '';
    }
    // Task boundary
    if (type === 'CORTEX_STEP_TYPE_TASK_BOUNDARY') {
        return step.taskBoundary?.taskName || step.taskName || '';
    }
    return '';
}

// ─── Log Item component ───────────────────────────────────────────────────────

const LogItem = memo(function LogItem({ event }: { event: LogEvent }) {
    const [expanded, setExpanded] = useState(false);
    const [copied, setCopied] = useState(false);

    if (event.type === 'cascade_status') {
        const status = event.payload?.status || '';
        const short = status.replace('CASCADE_RUN_STATUS_', '');
        const color = short === 'RUNNING' ? 'text-emerald-400' : short === 'WAITING_FOR_USER' ? 'text-amber-400' : 'text-slate-500';
        return (
            <div className="flex items-center gap-2 px-3 py-1 text-[10px] text-muted-foreground/40">
                <span className="flex-1 border-t border-border/10" />
                <span className={cn('font-mono tracking-wider', color)}>{short}</span>
                <span className="flex-1 border-t border-border/10" />
            </div>
        );
    }

    if (event.type === 'conversations_updated') {
        return (
            <div className="px-3 py-0.5 text-[10px] text-muted-foreground/30 italic">
                conversations updated
            </div>
        );
    }

    if (!event.stepRole) return null;

    const cfg = ROLE_CONFIG[event.stepRole];
    const Icon = TOOL_ICONS[event.payload?.step?.type] || cfg.icon;
    const content = event.stepContent || '';
    const hasDetail = content.length > 80 || Object.keys(event.payload?.step || {}).length > 2;
    const preview = content.length > 120 ? content.slice(0, 120) + '…' : content;
    const time = new Date(event.ts).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const shortConv = event.convId?.slice(0, 6) || '?';

    const copyPayload = () => {
        navigator.clipboard.writeText(JSON.stringify(event.payload, null, 2));
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
    };

    return (
        <div className={cn('group border-b border-border/5 transition-colors hover:bg-muted/10', cfg.bg)}>
            <div
                className="flex items-start gap-2.5 px-3 py-2 cursor-pointer"
                onClick={() => hasDetail && setExpanded(e => !e)}
            >
                {/* Timeline dot + icon */}
                <div className="flex flex-col items-center gap-1 pt-0.5 shrink-0">
                    <div className={cn('w-5 h-5 rounded-full flex items-center justify-center', cfg.bg, 'border border-border/20')}>
                        <Icon className={cn('w-3 h-3', cfg.color)} />
                    </div>
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5 flex-wrap">
                        <span className={cn('text-[10px] font-semibold tracking-wide uppercase', cfg.color)}>
                            {event.stepLabel}
                        </span>
                        <span className="text-[9px] text-muted-foreground/30 font-mono">#{shortConv}</span>
                        {event.stepIndex !== undefined && (
                            <span className="text-[9px] text-muted-foreground/25 font-mono">·{event.stepIndex}</span>
                        )}
                        <span className="ml-auto text-[9px] text-muted-foreground/25 font-mono shrink-0">{time}</span>
                        {hasDetail && (
                            <span className="text-muted-foreground/30">
                                {expanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                            </span>
                        )}
                    </div>
                    {preview && (
                        <p className="text-xs text-foreground/60 mt-0.5 break-words leading-relaxed line-clamp-2">
                            {preview}
                        </p>
                    )}
                </div>

                {/* Copy button */}
                <button
                    onClick={(e) => { e.stopPropagation(); copyPayload(); }}
                    className="opacity-0 group-hover:opacity-100 transition-opacity shrink-0 p-1 rounded hover:bg-muted/30"
                    title="Copy payload"
                >
                    {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3 text-muted-foreground/40" />}
                </button>
            </div>

            {/* Expanded detail */}
            {expanded && (
                <div className="mx-3 mb-2 rounded border border-border/15 overflow-auto max-h-48">
                    <pre className="text-[10px] font-mono text-foreground/50 p-2 whitespace-pre-wrap break-all leading-relaxed">
                        {JSON.stringify(event.payload?.step || event.payload, null, 2)}
                    </pre>
                </div>
            )}
        </div>
    );
});

// ─── Filter pill ─────────────────────────────────────────────────────────────

type FilterMode = 'all' | 'user' | 'agent' | 'tool';

const FILTERS: { mode: FilterMode; label: string }[] = [
    { mode: 'all', label: 'All' },
    { mode: 'user', label: 'User' },
    { mode: 'agent', label: 'Agent' },
    { mode: 'tool', label: 'Tools' },
];

// ─── Main component ───────────────────────────────────────────────────────────

export function AgentLogsView() {
    const [events, setEvents] = useState<LogEvent[]>([]);
    const [filter, setFilter] = useState<FilterMode>('all');
    const [wsStatus, setWsStatus] = useState<'connecting' | 'connected' | 'disconnected'>('connecting');
    const [autoScroll, setAutoScroll] = useState(true);
    const bottomRef = useRef<HTMLDivElement>(null);
    const eventIdRef = useRef(0);

    const addEvent = useCallback((evt: Omit<LogEvent, 'id' | 'ts'>) => {
        setEvents(prev => {
            // Cap at 500 events
            const next = prev.length >= 500 ? prev.slice(-450) : prev;
            return [...next, { ...evt, id: String(++eventIdRef.current), ts: Date.now() }];
        });
    }, []);

    // Subscribe to shared WS service for all messages (Live Logs mode)
    useEffect(() => {
        if (!wsService) return;

        // Track connection status via shared service events
        const offOpen = wsService.on('__ws_open', () => setWsStatus('connected'));
        const offClose = wsService.on('__ws_close', () => setWsStatus('disconnected'));
        // Set initial status
        setWsStatus(wsService.connected ? 'connected' : 'connecting');

        // Listen to ALL messages for live logging
        const offAll = wsService.onAll((data) => {
            const convId = (data.conversationId as string) || (data.cascadeId as string) || '';

            if (data.type === 'cascade_status') {
                addEvent({ type: 'cascade_status', convId, payload: data });
            } else if (data.type === 'conversations_updated') {
                addEvent({ type: 'conversations_updated', convId: '', payload: data });
            } else if (data.type === 'steps_new') {
                const steps: any[] = (data.steps as any[]) || [];
                const startIdx = ((data.total as number) || steps.length) - steps.length;
                steps.forEach((step, i) => {
                    const stepType = step.type || '';
                    const role = getStepRole(stepType);
                    addEvent({
                        type: 'step',
                        convId,
                        stepRole: role,
                        stepLabel: STEP_LABELS[stepType] || stepType.replace('CORTEX_STEP_TYPE_', ''),
                        stepContent: extractContent(step, stepType),
                        stepIndex: startIdx + i,
                        payload: { step },
                    });
                });
            } else if (data.type === 'step_updated') {
                const step = (data.step as any) || {};
                const stepType = step.type || '';
                const role = getStepRole(stepType);
                // Only log meaningful updates (content changes), not every poll tick
                const content = extractContent(step, stepType);
                if (content) {
                    addEvent({
                        type: 'step_update',
                        convId,
                        stepRole: role,
                        stepLabel: `↻ ${STEP_LABELS[stepType] || stepType.replace('CORTEX_STEP_TYPE_', '')}`,
                        stepContent: content,
                        stepIndex: data.index as number,
                        payload: { step, index: data.index },
                    });
                }
            }
        });

        return () => {
            offOpen();
            offClose();
            offAll();
        };
    }, [addEvent]);

    // Auto-scroll to bottom
    useEffect(() => {
        if (autoScroll) {
            bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
        }
    }, [events, autoScroll]);

    const clearLogs = useCallback(() => setEvents([]), []);

    const filtered = filter === 'all'
        ? events
        : events.filter(e =>
            (filter === 'user' && e.stepRole === 'user') ||
            (filter === 'agent' && e.stepRole === 'agent') ||
            (filter === 'tool' && e.stepRole === 'tool') ||
            e.type === 'cascade_status'
        );

    return (
        <div className="flex flex-col h-full bg-background">
            {/* Header */}
            <div className="flex items-center justify-between px-3 py-2 border-b border-border/20 shrink-0">
                <div className="flex items-center gap-2">
                    <Activity className="w-3.5 h-3.5 text-primary/60" />
                    <span className="text-xs font-semibold text-foreground/70">Live Logs</span>
                    {/* WS status */}
                    <span className={cn(
                        'flex items-center gap-1 text-[9px] font-mono px-1.5 py-0.5 rounded-full border',
                        wsStatus === 'connected'
                            ? 'text-emerald-400 border-emerald-400/20 bg-emerald-400/5'
                            : wsStatus === 'connecting'
                                ? 'text-amber-400 border-amber-400/20 bg-amber-400/5 animate-pulse'
                                : 'text-red-400 border-red-400/20 bg-red-400/5'
                    )}>
                        {wsStatus === 'connected'
                            ? <><Wifi className="w-2.5 h-2.5" /> live</>
                            : wsStatus === 'connecting'
                                ? <><Wifi className="w-2.5 h-2.5" /> connecting…</>
                                : <><WifiOff className="w-2.5 h-2.5" /> offline</>
                        }
                    </span>
                    {events.length > 0 && (
                        <span className="text-[9px] text-muted-foreground/30 font-mono">{events.length}</span>
                    )}
                </div>

                <div className="flex items-center gap-1">
                    {/* Auto-scroll toggle */}
                    <button
                        onClick={() => setAutoScroll(p => !p)}
                        className={cn(
                            'text-[9px] px-2 py-0.5 rounded border transition-all',
                            autoScroll
                                ? 'text-primary border-primary/30 bg-primary/5'
                                : 'text-muted-foreground/40 border-border/20'
                        )}
                        title="Toggle auto-scroll"
                    >
                        ↓
                    </button>
                    {/* Clear */}
                    <button
                        onClick={clearLogs}
                        className="p-1 rounded hover:bg-muted/30 text-muted-foreground/40 hover:text-muted-foreground/70 transition-all"
                        title="Clear logs"
                    >
                        <Trash2 className="w-3 h-3" />
                    </button>
                </div>
            </div>

            {/* Filter bar */}
            <div className="flex items-center gap-1 px-3 py-1.5 border-b border-border/10 shrink-0">
                <Filter className="w-2.5 h-2.5 text-muted-foreground/30 shrink-0" />
                {FILTERS.map(f => (
                    <button
                        key={f.mode}
                        onClick={() => setFilter(f.mode)}
                        className={cn(
                            'text-[9px] px-2 py-0.5 rounded-full border transition-all',
                            filter === f.mode
                                ? 'text-primary border-primary/40 bg-primary/8'
                                : 'text-muted-foreground/40 border-transparent hover:border-border/30 hover:text-muted-foreground/60'
                        )}
                    >
                        {f.label}
                    </button>
                ))}
            </div>

            {/* Log stream */}
            <div
                className="flex-1 overflow-y-auto"
                onScroll={(e) => {
                    const el = e.currentTarget;
                    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
                    setAutoScroll(atBottom);
                }}
            >
                {filtered.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full gap-3 text-center px-6">
                        <div className="w-10 h-10 rounded-full bg-muted/10 flex items-center justify-center">
                            <Activity className="w-5 h-5 text-muted-foreground/20" />
                        </div>
                        <div>
                            <p className="text-xs text-muted-foreground/40 font-medium">Waiting for events…</p>
                            <p className="text-[10px] text-muted-foreground/25 mt-0.5">
                                Events appear here when the agent runs
                            </p>
                        </div>
                    </div>
                ) : (
                    filtered.map(event => (
                        <LogItem key={event.id} event={event} />
                    ))
                )}
                <div ref={bottomRef} />
            </div>
        </div>
    );
}
