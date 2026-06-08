'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { lsCall } from '@/lib/cascade-api';
import { Workflow, Activity, AlertTriangle, Loader2, BookOpen, ScrollText, FolderOpen } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';

// === Types ===

// GetWorkspaceInfos response
interface WorkspaceInfo {
    workspaceUri?: string;
    gitRootUri?: string;
    [key: string]: unknown;
}

interface GetWorkspaceInfosResponse {
    homeDirPath?: string;
    homeDirUri?: string;
    geminiDirUri?: string;
    workspaceInfos?: WorkspaceInfo[];
    [key: string]: unknown;
}

// WorkflowSpec — used for both workflows and skills
interface WorkflowSpec {
    path?: string;
    name?: string;
    description?: string;
    content?: string;
    turbo?: boolean;
    isBuiltin?: boolean;
    scope?: string;
    baseDir?: string;
    disableModelInvocation?: boolean;
    pluginName?: string;
    [key: string]: unknown;
}

interface GetAllWorkflowsResponse {
    workflows?: WorkflowSpec[];
    [key: string]: unknown;
}

interface GetAllSkillsResponse {
    skills?: WorkflowSpec[];
    [key: string]: unknown;
}

// CortexMemory — a rule
interface CortexMemory {
    memoryId?: string;
    title?: string;
    metadata?: unknown;
    source?: string;
    scope?: string;
    textMemory?: string;
    absolutePath?: string;
    [key: string]: unknown;
}

interface GetAllRulesResponse {
    memories?: CortexMemory[];
    [key: string]: unknown;
}

type TabId = 'workflows' | 'skills' | 'rules';

// === Helpers ===

function workflowName(w: WorkflowSpec): string {
    return w.name ?? w.path ?? '(unnamed)';
}

function ruleName(r: CortexMemory): string {
    return r.title ?? r.memoryId ?? '(unnamed)';
}

// === Sub-components ===

function WorkflowList({ items }: { items: WorkflowSpec[] }) {
    if (items.length === 0) {
        return (
            <div className="rounded-xl border border-border/50 bg-card/50 p-10 text-center">
                <Workflow className="w-8 h-8 mx-auto text-muted-foreground/20 mb-3" />
                <p className="text-sm font-medium text-muted-foreground/60 mb-1">No workflows found</p>
                <p className="text-xs text-muted-foreground/40 max-w-xs mx-auto">
                    Add workflow files to your workspace to see them here.
                </p>
            </div>
        );
    }

    return (
        <div className="rounded-xl border border-border/50 bg-card/50 overflow-hidden">
            <div className="grid grid-cols-[1fr_auto] gap-3 px-4 py-2 text-[10px] text-muted-foreground/50 uppercase tracking-wider font-medium border-b border-border/30 bg-muted/10">
                <span>Workflow</span>
                <span>Scope</span>
            </div>
            <div className="divide-y divide-border/20">
                {items.map((w, i) => {
                    const name = workflowName(w);
                    const key = w.path ?? w.name ?? String(i);
                    return (
                        <div key={key} className="px-4 py-3 hover:bg-muted/20 transition-colors">
                            <div className="grid grid-cols-[1fr_auto] items-start gap-3">
                                <div className="flex flex-col gap-0.5 min-w-0">
                                    <div className="flex items-center gap-2 min-w-0">
                                        <Workflow className="w-3.5 h-3.5 text-violet-400/60 shrink-0" />
                                        <span className="text-sm font-medium truncate">{name}</span>
                                        {w.isBuiltin && (
                                            <span className="text-[9px] font-medium text-muted-foreground/50 bg-muted/40 px-1 py-0.5 rounded shrink-0">
                                                builtin
                                            </span>
                                        )}
                                        {w.turbo && (
                                            <span className="text-[9px] font-medium text-amber-400/70 bg-amber-500/10 px-1 py-0.5 rounded shrink-0">
                                                turbo
                                            </span>
                                        )}
                                    </div>
                                    {w.description && (
                                        <p className="text-xs text-muted-foreground/60 pl-6 truncate">{w.description}</p>
                                    )}
                                    {w.pluginName && (
                                        <p className="text-[10px] text-muted-foreground/40 pl-6 font-mono truncate">
                                            plugin: {w.pluginName}
                                        </p>
                                    )}
                                </div>
                                {w.scope && (
                                    <Badge className="text-[9px] h-5 px-1.5 bg-muted/30 text-muted-foreground border border-border/20 hover:bg-muted/30 shrink-0 mt-0.5">
                                        {w.scope}
                                    </Badge>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

function SkillList({ items }: { items: WorkflowSpec[] }) {
    if (items.length === 0) {
        return (
            <div className="rounded-xl border border-border/50 bg-card/50 p-10 text-center">
                <BookOpen className="w-8 h-8 mx-auto text-muted-foreground/20 mb-3" />
                <p className="text-sm font-medium text-muted-foreground/60 mb-1">No skills found</p>
                <p className="text-xs text-muted-foreground/40 max-w-xs mx-auto">
                    Install skills from the Antigravity plugin marketplace to see them here.
                </p>
            </div>
        );
    }

    return (
        <div className="rounded-xl border border-border/50 bg-card/50 overflow-hidden">
            <div className="grid grid-cols-[1fr_auto] gap-3 px-4 py-2 text-[10px] text-muted-foreground/50 uppercase tracking-wider font-medium border-b border-border/30 bg-muted/10">
                <span>Skill</span>
                <span>Scope</span>
            </div>
            <div className="divide-y divide-border/20">
                {items.map((s, i) => {
                    const name = workflowName(s);
                    const key = s.path ?? s.name ?? String(i);
                    return (
                        <div key={key} className="px-4 py-3 hover:bg-muted/20 transition-colors">
                            <div className="grid grid-cols-[1fr_auto] items-start gap-3">
                                <div className="flex flex-col gap-0.5 min-w-0">
                                    <div className="flex items-center gap-2 min-w-0">
                                        <BookOpen className="w-3.5 h-3.5 text-emerald-400/60 shrink-0" />
                                        <span className="text-sm font-medium truncate">{name}</span>
                                        {s.isBuiltin && (
                                            <span className="text-[9px] font-medium text-muted-foreground/50 bg-muted/40 px-1 py-0.5 rounded shrink-0">
                                                builtin
                                            </span>
                                        )}
                                    </div>
                                    {s.description && (
                                        <p className="text-xs text-muted-foreground/60 pl-6 truncate">{s.description}</p>
                                    )}
                                    {s.pluginName && (
                                        <p className="text-[10px] text-muted-foreground/40 pl-6 font-mono truncate">
                                            plugin: {s.pluginName}
                                        </p>
                                    )}
                                </div>
                                {s.scope && (
                                    <Badge className="text-[9px] h-5 px-1.5 bg-muted/30 text-muted-foreground border border-border/20 hover:bg-muted/30 shrink-0 mt-0.5">
                                        {s.scope}
                                    </Badge>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

function RuleList({ items }: { items: CortexMemory[] }) {
    if (items.length === 0) {
        return (
            <div className="rounded-xl border border-border/50 bg-card/50 p-10 text-center">
                <ScrollText className="w-8 h-8 mx-auto text-muted-foreground/20 mb-3" />
                <p className="text-sm font-medium text-muted-foreground/60 mb-1">No rules found</p>
                <p className="text-xs text-muted-foreground/40 max-w-xs mx-auto">
                    Add rule files to your workspace to inject persistent instructions into the agent.
                </p>
            </div>
        );
    }

    return (
        <div className="rounded-xl border border-border/50 bg-card/50 overflow-hidden">
            <div className="grid grid-cols-[1fr_auto] gap-3 px-4 py-2 text-[10px] text-muted-foreground/50 uppercase tracking-wider font-medium border-b border-border/30 bg-muted/10">
                <span>Rule</span>
                <span>Scope</span>
            </div>
            <div className="divide-y divide-border/20">
                {items.map((r, i) => {
                    const name = ruleName(r);
                    const key = r.memoryId ?? r.absolutePath ?? String(i);
                    return (
                        <div key={key} className="px-4 py-3 hover:bg-muted/20 transition-colors">
                            <div className="grid grid-cols-[1fr_auto] items-start gap-3">
                                <div className="flex flex-col gap-0.5 min-w-0">
                                    <div className="flex items-center gap-2 min-w-0">
                                        <ScrollText className="w-3.5 h-3.5 text-sky-400/60 shrink-0" />
                                        <span className="text-sm font-medium truncate">{name}</span>
                                        {r.source && (
                                            <span className="text-[9px] font-medium text-muted-foreground/50 bg-muted/40 px-1 py-0.5 rounded shrink-0">
                                                {r.source}
                                            </span>
                                        )}
                                    </div>
                                    {r.textMemory && (
                                        <p className="text-xs text-muted-foreground/60 pl-6 line-clamp-2">{r.textMemory}</p>
                                    )}
                                    {r.absolutePath && (
                                        <p className="text-[10px] text-muted-foreground/40 pl-6 font-mono truncate">
                                            {r.absolutePath}
                                        </p>
                                    )}
                                </div>
                                {r.scope && (
                                    <Badge className="text-[9px] h-5 px-1.5 bg-muted/30 text-muted-foreground border border-border/20 hover:bg-muted/30 shrink-0 mt-0.5">
                                        {r.scope}
                                    </Badge>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

// === No-workspace state ===
function NoWorkspaceState() {
    return (
        <div className="flex-1 flex items-center justify-center">
            <div className="flex flex-col items-center gap-3 max-w-sm text-center">
                <FolderOpen className="w-8 h-8 text-muted-foreground/30" />
                <span className="text-sm font-medium text-foreground/70">No workspace open</span>
                <span className="text-xs text-muted-foreground">
                    Open a workspace folder in Antigravity IDE to browse workflows, skills, and rules.
                </span>
            </div>
        </div>
    );
}

// === Per-tab data state ===
interface TabData<T> {
    data: T | null;
    isLoading: boolean;
    error: string | null;
}

function initialTabData<T>(): TabData<T> {
    return { data: null, isLoading: false, error: null };
}

// === Main Component ===
export function WorkflowsView() {
    const [workspaceUris, setWorkspaceUris] = useState<string[] | null>(null);
    const [wsLoading, setWsLoading] = useState(true);
    const [wsError, setWsError] = useState<string | null>(null);

    const [activeTab, setActiveTab] = useState<TabId>('workflows');

    const [workflowsTab, setWorkflowsTab] = useState<TabData<WorkflowSpec[]>>(initialTabData);
    const [skillsTab, setSkillsTab] = useState<TabData<WorkflowSpec[]>>(initialTabData);
    const [rulesTab, setRulesTab] = useState<TabData<CortexMemory[]>>(initialTabData);

    // Track in-flight fetch AbortControllers per tab to avoid leaks/races
    const fetchAbortRef = useRef<AbortController | null>(null);

    // Step 1: resolve workspace URIs on mount
    useEffect(() => {
        let cancelled = false;
        setWsLoading(true);
        setWsError(null);

        lsCall<GetWorkspaceInfosResponse>('GetWorkspaceInfos')
            .then(res => {
                if (cancelled) return;
                const uris = (res.workspaceInfos ?? [])
                    .map(info => info.workspaceUri)
                    .filter((u): u is string => typeof u === 'string' && u.length > 0);
                setWorkspaceUris(uris);
            })
            .catch((e: unknown) => {
                if (cancelled) return;
                setWsError(e instanceof Error ? e.message : 'Failed to load workspace info');
                setWorkspaceUris([]);
            })
            .finally(() => {
                if (!cancelled) setWsLoading(false);
            });

        return () => { cancelled = true; };
    }, []);

    // Step 2: fetch tab data when workspaceUris are ready and tab changes
    const fetchTab = useCallback((tab: TabId, uris: string[]) => {
        // Abort any prior in-flight fetch
        if (fetchAbortRef.current !== null) {
            fetchAbortRef.current.abort();
        }
        const ac = new AbortController();
        fetchAbortRef.current = ac;

        const body = { workspaceUris: uris };

        if (tab === 'workflows') {
            setWorkflowsTab(prev => ({ ...prev, isLoading: true, error: null }));
            lsCall<GetAllWorkflowsResponse>('GetAllWorkflows', body)
                .then(res => {
                    if (ac.signal.aborted) return;
                    setWorkflowsTab({ data: res.workflows ?? [], isLoading: false, error: null });
                })
                .catch((e: unknown) => {
                    if (ac.signal.aborted) return;
                    setWorkflowsTab({ data: null, isLoading: false, error: e instanceof Error ? e.message : 'Failed to load workflows' });
                });
        } else if (tab === 'skills') {
            setSkillsTab(prev => ({ ...prev, isLoading: true, error: null }));
            lsCall<GetAllSkillsResponse>('GetAllSkills', body)
                .then(res => {
                    if (ac.signal.aborted) return;
                    setSkillsTab({ data: res.skills ?? [], isLoading: false, error: null });
                })
                .catch((e: unknown) => {
                    if (ac.signal.aborted) return;
                    setSkillsTab({ data: null, isLoading: false, error: e instanceof Error ? e.message : 'Failed to load skills' });
                });
        } else {
            setRulesTab(prev => ({ ...prev, isLoading: true, error: null }));
            lsCall<GetAllRulesResponse>('GetAllRules', body)
                .then(res => {
                    if (ac.signal.aborted) return;
                    setRulesTab({ data: res.memories ?? [], isLoading: false, error: null });
                })
                .catch((e: unknown) => {
                    if (ac.signal.aborted) return;
                    setRulesTab({ data: null, isLoading: false, error: e instanceof Error ? e.message : 'Failed to load rules' });
                });
        }
    }, []);

    useEffect(() => {
        if (workspaceUris === null) return; // still loading workspace info
        fetchTab(activeTab, workspaceUris);
        return () => {
            if (fetchAbortRef.current !== null) {
                fetchAbortRef.current.abort();
            }
        };
    }, [activeTab, workspaceUris, fetchTab]);

    // === Loading workspace info ===
    if (wsLoading) {
        return (
            <div className="flex-1 flex items-center justify-center">
                <div className="flex flex-col items-center gap-3">
                    <Activity className="w-8 h-8 text-muted-foreground/50 animate-pulse" />
                    <span className="text-sm text-muted-foreground">Detecting workspace...</span>
                </div>
            </div>
        );
    }

    if (wsError !== null) {
        return (
            <div className="flex-1 flex items-center justify-center">
                <div className="flex flex-col items-center gap-3 max-w-sm text-center">
                    <AlertTriangle className="w-8 h-8 text-red-400/60" />
                    <span className="text-sm font-medium text-foreground/70">Failed to detect workspace</span>
                    <span className="text-xs text-muted-foreground font-mono break-all">{wsError}</span>
                </div>
            </div>
        );
    }

    // No workspace URIs at all → show friendly state
    if (workspaceUris !== null && workspaceUris.length === 0) {
        return <NoWorkspaceState />;
    }

    // === Tab rendering helpers ===
    function renderWorkflowsContent() {
        const { data, isLoading, error } = workflowsTab;
        if (isLoading && data === null) {
            return (
                <div className="flex items-center justify-center py-16">
                    <div className="flex flex-col items-center gap-3">
                        <Loader2 className="w-6 h-6 text-muted-foreground/50 animate-spin" />
                        <span className="text-sm text-muted-foreground">Loading workflows...</span>
                    </div>
                </div>
            );
        }
        if (error !== null) {
            return (
                <div className="flex items-center justify-center py-16">
                    <div className="flex flex-col items-center gap-3 max-w-sm text-center">
                        <AlertTriangle className="w-6 h-6 text-red-400/60" />
                        <span className="text-sm font-medium text-foreground/70">Failed to load workflows</span>
                        <span className="text-xs text-muted-foreground font-mono break-all">{error}</span>
                        <button
                            onClick={() => { if (workspaceUris !== null) fetchTab('workflows', workspaceUris); }}
                            className="text-xs px-3 py-1.5 rounded-lg bg-muted/40 hover:bg-muted/70 text-muted-foreground hover:text-foreground transition-colors border border-border/30"
                        >
                            Retry
                        </button>
                    </div>
                </div>
            );
        }
        return <WorkflowList items={data ?? []} />;
    }

    function renderSkillsContent() {
        const { data, isLoading, error } = skillsTab;
        if (isLoading && data === null) {
            return (
                <div className="flex items-center justify-center py-16">
                    <div className="flex flex-col items-center gap-3">
                        <Loader2 className="w-6 h-6 text-muted-foreground/50 animate-spin" />
                        <span className="text-sm text-muted-foreground">Loading skills...</span>
                    </div>
                </div>
            );
        }
        if (error !== null) {
            return (
                <div className="flex items-center justify-center py-16">
                    <div className="flex flex-col items-center gap-3 max-w-sm text-center">
                        <AlertTriangle className="w-6 h-6 text-red-400/60" />
                        <span className="text-sm font-medium text-foreground/70">Failed to load skills</span>
                        <span className="text-xs text-muted-foreground font-mono break-all">{error}</span>
                        <button
                            onClick={() => { if (workspaceUris !== null) fetchTab('skills', workspaceUris); }}
                            className="text-xs px-3 py-1.5 rounded-lg bg-muted/40 hover:bg-muted/70 text-muted-foreground hover:text-foreground transition-colors border border-border/30"
                        >
                            Retry
                        </button>
                    </div>
                </div>
            );
        }
        return <SkillList items={data ?? []} />;
    }

    function renderRulesContent() {
        const { data, isLoading, error } = rulesTab;
        if (isLoading && data === null) {
            return (
                <div className="flex items-center justify-center py-16">
                    <div className="flex flex-col items-center gap-3">
                        <Loader2 className="w-6 h-6 text-muted-foreground/50 animate-spin" />
                        <span className="text-sm text-muted-foreground">Loading rules...</span>
                    </div>
                </div>
            );
        }
        if (error !== null) {
            return (
                <div className="flex items-center justify-center py-16">
                    <div className="flex flex-col items-center gap-3 max-w-sm text-center">
                        <AlertTriangle className="w-6 h-6 text-red-400/60" />
                        <span className="text-sm font-medium text-foreground/70">Failed to load rules</span>
                        <span className="text-xs text-muted-foreground font-mono break-all">{error}</span>
                        <button
                            onClick={() => { if (workspaceUris !== null) fetchTab('rules', workspaceUris); }}
                            className="text-xs px-3 py-1.5 rounded-lg bg-muted/40 hover:bg-muted/70 text-muted-foreground hover:text-foreground transition-colors border border-border/30"
                        >
                            Retry
                        </button>
                    </div>
                </div>
            );
        }
        return <RuleList items={data ?? []} />;
    }

    const currentTab = activeTab === 'workflows' ? workflowsTab : activeTab === 'skills' ? skillsTab : rulesTab;

    return (
        <div className="flex-1 overflow-y-auto">
            <div className="max-w-3xl mx-auto p-6 space-y-6">
                {/* Header */}
                <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-gradient-to-br from-violet-500/10 to-indigo-500/10 border border-violet-500/20">
                        <Workflow className="w-5 h-5 text-violet-400" />
                    </div>
                    <div>
                        <h2 className="text-lg font-semibold">Workflows / Skills / Rules</h2>
                        <p className="text-xs text-muted-foreground">
                            Read-only view of extensibility items from the active workspace
                        </p>
                    </div>
                    {currentTab.isLoading && (
                        <Loader2 className="w-4 h-4 text-muted-foreground/50 animate-spin ml-auto" />
                    )}
                </div>

                {/* Tabs */}
                <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabId)}>
                    <TabsList className="w-full justify-start">
                        <TabsTrigger value="workflows" className="flex items-center gap-1.5">
                            <Workflow className="w-3.5 h-3.5" />
                            Workflows
                        </TabsTrigger>
                        <TabsTrigger value="skills" className="flex items-center gap-1.5">
                            <BookOpen className="w-3.5 h-3.5" />
                            Skills
                        </TabsTrigger>
                        <TabsTrigger value="rules" className="flex items-center gap-1.5">
                            <ScrollText className="w-3.5 h-3.5" />
                            Rules
                        </TabsTrigger>
                    </TabsList>

                    <TabsContent value="workflows">
                        {renderWorkflowsContent()}
                    </TabsContent>
                    <TabsContent value="skills">
                        {renderSkillsContent()}
                    </TabsContent>
                    <TabsContent value="rules">
                        {renderRulesContent()}
                    </TabsContent>
                </Tabs>

                {/* Footer */}
                <p className="text-center text-[10px] text-muted-foreground/40 pb-4">
                    Read-only view — manage workflows, skills, and rules via Antigravity IDE settings
                </p>
            </div>
        </div>
    );
}
