'use client';

import { useState, useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Loader2, Play, XCircle, RotateCcw, ChevronDown, ChevronRight } from 'lucide-react';
import { useOrchestratorWs } from '@/hooks/use-orchestrator-ws';
import { OrchestratorTaskCard } from './orchestrator-task-card';
import { API_BASE } from '@/lib/config';
import { authHeaders } from '@/lib/auth';

interface OrchestratorPanelProps {
    /** When provided, use this workspace instead of internal state */
    workspace?: string;
    /** When provided, skip internal fetch and use these */
    workspaces?: string[];
}

export function OrchestratorPanel({ workspace: externalWorkspace, workspaces: externalWorkspaces }: OrchestratorPanelProps = {}) {
    const orch = useOrchestratorWs();
    const [task, setTask] = useState('');
    const [internalWorkspace, setInternalWorkspace] = useState('');
    const [internalWorkspaces, setInternalWorkspaces] = useState<string[]>([]);
    const [feedback, setFeedback] = useState('');
    const [logsOpen, setLogsOpen] = useState(false);
    const logsEndRef = useRef<HTMLDivElement>(null);

    // Use external props when provided, otherwise internal state
    const workspace = externalWorkspace ?? internalWorkspace;
    const workspaces = externalWorkspaces ?? internalWorkspaces;
    const hasExternalWorkspace = externalWorkspaces !== undefined;

    // Auto-connect WS on mount
    useEffect(() => { orch.connect(); }, []);

    // Fetch workspaces only when not provided externally
    useEffect(() => {
        if (hasExternalWorkspace) return;
        (async () => {
            try {
                const res = await fetch(`${API_BASE}/api/workspaces`, { headers: authHeaders() });
                if (res.ok) {
                    const data = await res.json();
                    const names = Array.isArray(data) ? data.map((w: { name?: string }) => w.name || '').filter(Boolean) : [];
                    setInternalWorkspaces(names);
                    if (names.length > 0 && !internalWorkspace) setInternalWorkspace(names[0]);
                }
            } catch { /* silent */ }
        })();
    }, [hasExternalWorkspace]);

    // Auto-scroll logs
    useEffect(() => {
        if (logsOpen) logsEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [orch.logs.length, logsOpen]);

    const handleStart = () => {
        if (!task.trim()) return;
        orch.orchestrate(task.trim(), workspace || undefined);
        setTask('');
    };

    const isIdle = !orch.state;
    const isAnalyzing = orch.state === 'ANALYZING' || orch.state === 'PLANNING';
    const isAwaiting = orch.state === 'AWAITING_APPROVAL';
    const isExecuting = orch.state === 'EXECUTING' || orch.state === 'RECOVERING';
    const isReviewing = orch.state === 'REVIEWING';
    const isDone = orch.state === 'COMPLETED' || orch.state === 'FAILED' || orch.state === 'CANCELLED';

    return (
        <div className="flex flex-col h-full overflow-hidden">
            <div className="flex-1 overflow-y-auto p-3 space-y-3">
                {/* Connection status */}
                {orch.connectionState !== 'connected' && orch.connectionState !== 'idle' && (
                    <div className="text-[10px] text-amber-400 text-center py-1">
                        {orch.connectionState === 'connecting' && 'Connecting...'}
                        {orch.connectionState === 'reconnecting' && 'Reconnecting...'}
                        {orch.connectionState === 'error' && `Connection error: ${orch.error}`}
                    </div>
                )}

                {/* Idle: Task input */}
                {isIdle && (
                    <Card className="bg-muted/5 border-border/20">
                        <CardContent className="p-3 space-y-2">
                            <Textarea
                                value={task}
                                onChange={e => setTask(e.target.value)}
                                placeholder="Describe the task to orchestrate..."
                                className="min-h-[80px] text-[11px] bg-background/50 resize-none"
                                onKeyDown={e => { if (e.key === 'Enter' && e.metaKey) handleStart(); }}
                            />
                            <div className="flex items-center gap-2">
                                {!hasExternalWorkspace && (
                                    <select
                                        value={workspace}
                                        onChange={e => setInternalWorkspace(e.target.value)}
                                        className="h-7 text-[10px] bg-background/50 border border-border/30 rounded px-2"
                                    >
                                        {workspaces.map(w => (
                                            <option key={w} value={w}>{w}</option>
                                        ))}
                                    </select>
                                )}
                                <Button
                                    size="sm"
                                    className="h-7 text-[10px] px-3 ml-auto"
                                    disabled={!task.trim()}
                                    onClick={handleStart}
                                >
                                    <Play className="h-3 w-3 mr-1" /> Orchestrate
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                )}

                {/* Analyzing/Planning spinner */}
                {isAnalyzing && (
                    <div className="flex flex-col items-center gap-2 py-8">
                        <Loader2 className="h-6 w-6 text-blue-400 animate-spin" />
                        <span className="text-[10px] text-foreground/60">
                            {orch.state === 'ANALYZING' ? 'Analyzing task...' : 'Planning subtasks...'}
                        </span>
                    </div>
                )}

                {/* Awaiting approval: plan review */}
                {isAwaiting && orch.plan && (
                    <Card className="bg-muted/5 border-border/20">
                        <CardContent className="p-3 space-y-3">
                            <div className="flex items-center justify-between">
                                <span className="text-[11px] font-semibold text-foreground/80">Plan Review</span>
                                <Badge variant="outline" className="text-[9px] px-1.5 py-0 text-blue-400">
                                    {orch.plan.strategy} &middot; {orch.plan.subtasks?.length || 0} tasks
                                </Badge>
                            </div>

                            {orch.plan.summary && (
                                <p className="text-[10px] text-foreground/60">{orch.plan.summary}</p>
                            )}

                            <div className="space-y-2">
                                {orch.plan.subtasks?.map(st => (
                                    <div key={st.id} className="flex items-start gap-2 text-[10px]">
                                        <span className="font-mono text-foreground/40 shrink-0">{st.id}</span>
                                        <span className="text-foreground/70">{st.description}</span>
                                    </div>
                                ))}
                            </div>

                            {/* Feedback input */}
                            <div className="flex gap-1.5">
                                <Input
                                    value={feedback}
                                    onChange={e => setFeedback(e.target.value)}
                                    className="h-7 text-[10px] bg-background/50"
                                    placeholder="Request changes (optional)..."
                                />
                                <Button
                                    size="sm"
                                    variant="outline"
                                    className="h-7 text-[10px] px-2 shrink-0"
                                    disabled={!feedback.trim()}
                                    onClick={() => { orch.revisePlan(feedback); setFeedback(''); }}
                                >
                                    <RotateCcw className="h-3 w-3 mr-1" /> Revise
                                </Button>
                            </div>

                            <div className="flex gap-2 pt-1">
                                <Button size="sm" className="h-7 text-[10px] px-3" onClick={() => orch.execute()}>
                                    <Play className="h-3 w-3 mr-1" /> Execute
                                </Button>
                                <Button size="sm" variant="outline" className="h-7 text-[10px] px-3 text-red-400" onClick={orch.cancel}>
                                    <XCircle className="h-3 w-3 mr-1" /> Cancel
                                </Button>
                            </div>
                        </CardContent>
                    </Card>
                )}

                {/* Executing: progress bar + subtask grid */}
                {(isExecuting || isReviewing) && (
                    <>
                        {/* Progress bar */}
                        <div className="space-y-1">
                            <div className="flex items-center justify-between text-[9px] text-foreground/50">
                                <span>{orch.state === 'REVIEWING' ? 'Reviewing...' : 'Executing...'}</span>
                                <span>{Math.round(orch.progress * 100)}% &middot; {Math.round(orch.elapsed / 1000)}s</span>
                            </div>
                            <div className="h-1 bg-muted/20 rounded-full overflow-hidden">
                                <div
                                    className="h-full bg-blue-500 rounded-full transition-all duration-500"
                                    style={{ width: `${orch.progress * 100}%` }}
                                />
                            </div>
                        </div>

                        {/* Subtask cards */}
                        <div className="space-y-2">
                            {Object.entries(orch.subtasks).map(([taskId, st]) => (
                                <OrchestratorTaskCard
                                    key={taskId}
                                    taskId={taskId}
                                    status={st}
                                    onClarify={orch.answerClarification}
                                />
                            ))}
                        </div>

                        {isExecuting && (
                            <Button size="sm" variant="outline" className="h-7 text-[10px] px-3 text-red-400" onClick={orch.cancel}>
                                <XCircle className="h-3 w-3 mr-1" /> Cancel
                            </Button>
                        )}
                    </>
                )}

                {/* Done: summary */}
                {isDone && (
                    <Card className={cn('border-border/20',
                        orch.state === 'COMPLETED' ? 'bg-emerald-500/5' :
                        orch.state === 'FAILED' ? 'bg-red-500/5' : 'bg-muted/5'
                    )}>
                        <CardContent className="p-3 space-y-2">
                            <div className="flex items-center gap-2">
                                <Badge variant="outline" className={cn('text-[10px] px-2 py-0.5',
                                    orch.state === 'COMPLETED' ? 'text-emerald-400' :
                                    orch.state === 'FAILED' ? 'text-red-400' : 'text-muted-foreground'
                                )}>
                                    {orch.state}
                                </Badge>
                                <span className="text-[9px] text-foreground/40">{Math.round(orch.elapsed / 1000)}s elapsed</span>
                            </div>

                            {orch.error && (
                                <p className="text-[10px] text-red-400">{orch.error}</p>
                            )}

                            {Object.keys(orch.subtasks).length > 0 && (
                                <div className="space-y-2">
                                    {Object.entries(orch.subtasks).map(([taskId, st]) => (
                                        <OrchestratorTaskCard key={taskId} taskId={taskId} status={st} />
                                    ))}
                                </div>
                            )}

                            <Button size="sm" variant="outline" className="h-7 text-[10px] px-3 mt-2" onClick={orch.disconnect}>
                                New Orchestration
                            </Button>
                        </CardContent>
                    </Card>
                )}
            </div>

            {/* Collapsible logs */}
            <div className="border-t border-border/20 shrink-0">
                <button
                    className="flex items-center gap-1 w-full px-3 py-1.5 text-[10px] text-foreground/50 hover:text-foreground/70"
                    onClick={() => setLogsOpen(o => !o)}
                >
                    {logsOpen ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                    Logs ({orch.logs.length})
                </button>
                {logsOpen && (
                    <div className="max-h-32 overflow-y-auto px-3 pb-2 space-y-0.5">
                        {orch.logs.map((log, i) => (
                            <div key={i} className="text-[9px] font-mono text-foreground/40">
                                <span className={cn(
                                    log.type === 'error' && 'text-red-400',
                                    log.type === 'warning' && 'text-amber-400',
                                )}>
                                    [{log.type}]
                                </span>{' '}
                                {log.taskId && <span className="text-foreground/30">[{log.taskId}] </span>}
                                {log.message}
                            </div>
                        ))}
                        <div ref={logsEndRef} />
                    </div>
                )}
            </div>
        </div>
    );
}
