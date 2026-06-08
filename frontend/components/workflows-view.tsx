'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import type { ComponentType, ReactNode } from 'react';
import { lsCall } from '@/lib/cascade-api';
import { Workflow, Activity, AlertTriangle, Loader2, BookOpen, ScrollText, FolderOpen, Copy } from 'lucide-react';
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

/** True for the AbortError thrown when a fetch is cancelled (expected, not a user error). */
function isAbortError(e: unknown): boolean {
    return e instanceof DOMException && e.name === 'AbortError';
}

// === Shared presentational primitives ===

function LoadingSpinner({ label }: { label: string }) {
    return (
        <div className="flex items-center justify-center py-16">
            <div className="flex flex-col items-center gap-3">
                <Loader2 className="w-6 h-6 text-muted-foreground/50 animate-spin" />
                <span className="text-sm text-muted-foreground">{label}</span>
            </div>
        </div>
    );
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
    return (
        <div className="flex items-center justify-center py-16">
            <div className="flex flex-col items-center gap-3 max-w-sm text-center">
                <AlertTriangle className="w-6 h-6 text-red-400/60" />
                <span className="text-sm font-medium text-foreground/70">Failed to load</span>
                <span className="text-xs text-muted-foreground font-mono break-all">{message}</span>
                <button
                    onClick={onRetry}
                    className="text-xs px-3 py-1.5 rounded-lg bg-muted/40 hover:bg-muted/70 text-muted-foreground hover:text-foreground transition-colors border border-border/30"
                >
                    Retry
                </button>
            </div>
        </div>
    );
}

function EmptyState({ icon: Icon, title, hint }: { icon: ComponentType<{ className?: string }>; title: string; hint: string }) {
    return (
        <div className="rounded-xl border border-border/50 bg-card/50 p-10 text-center">
            <Icon className="w-8 h-8 mx-auto text-muted-foreground/20 mb-3" />
            <p className="text-sm font-medium text-muted-foreground/60 mb-1">{title}</p>
            <p className="text-xs text-muted-foreground/40 max-w-xs mx-auto">{hint}</p>
        </div>
    );
}

/** A list row wrapper: name + optional badges line, optional description/meta lines, and a trailing scope badge. */
function ListRow({
    icon: Icon,
    iconColor,
    name,
    badges,
    description,
    meta,
    scope,
}: {
    icon: ComponentType<{ className?: string }>;
    iconColor: string;
    name: string;
    badges?: ReactNode;
    description?: string;
    meta?: string;
    scope?: string;
}) {
    return (
        <div className="px-4 py-3 hover:bg-muted/20 transition-colors">
            <div className="grid grid-cols-[1fr_auto] items-start gap-3">
                <div className="flex flex-col gap-0.5 min-w-0">
                    <div className="flex items-center gap-2 min-w-0">
                        <Icon className={`w-3.5 h-3.5 shrink-0 ${iconColor}`} />
                        <span className="text-sm font-medium truncate">{name}</span>
                        {badges}
                    </div>
                    {description && (
                        <p className="text-xs text-muted-foreground/60 pl-6 line-clamp-2">{description}</p>
                    )}
                    {meta && (
                        <p className="text-[10px] text-muted-foreground/40 pl-6 font-mono truncate">{meta}</p>
                    )}
                </div>
                {scope && (
                    <Badge className="text-[9px] h-5 px-1.5 bg-muted/30 text-muted-foreground border border-border/20 hover:bg-muted/30 shrink-0 mt-0.5">
                        {scope}
                    </Badge>
                )}
            </div>
        </div>
    );
}

function ListTable({ columnLabel, children }: { columnLabel: string; children: ReactNode }) {
    return (
        <div className="rounded-xl border border-border/50 bg-card/50 overflow-hidden">
            <div className="grid grid-cols-[1fr_auto] gap-3 px-4 py-2 text-[10px] text-muted-foreground/50 uppercase tracking-wider font-medium border-b border-border/30 bg-muted/10">
                <span>{columnLabel}</span>
                <span>Scope</span>
            </div>
            <div className="divide-y divide-border/20">{children}</div>
        </div>
    );
}

const builtinBadge = (
    <span className="text-[9px] font-medium text-muted-foreground/50 bg-muted/40 px-1 py-0.5 rounded shrink-0">
        builtin
    </span>
);

// === Lists ===

// Workflows and skills share the WorkflowSpec shape; only icon/color/labels differ.
function SpecList({
    items,
    icon,
    iconColor,
    columnLabel,
    showTurbo,
    onCopy,
    copyingPath,
    copyErrors,
}: {
    items: WorkflowSpec[];
    icon: ComponentType<{ className?: string }>;
    iconColor: string;
    columnLabel: string;
    showTurbo: boolean;
    onCopy?: (w: WorkflowSpec) => void;
    copyingPath?: string | null;
    copyErrors?: Record<string, string>;
}) {
    return (
        <ListTable columnLabel={columnLabel}>
            {items.map((w, i) => {
                const key = w.path ?? w.name ?? String(i);
                const isCopying = copyingPath === key;
                const copyErr = copyErrors?.[key];
                return (
                    <div key={key}>
                        <div className="grid grid-cols-[1fr_auto] items-start gap-3 px-4 py-3 hover:bg-muted/20 transition-colors">
                            <div className="flex flex-col gap-0.5 min-w-0">
                                <div className="flex items-center gap-2 min-w-0">
                                    {(() => { const Icon = icon; return <Icon className={`w-3.5 h-3.5 shrink-0 ${iconColor}`} />; })()}
                                    <span className="text-sm font-medium truncate">{workflowName(w)}</span>
                                    {w.isBuiltin && builtinBadge}
                                    {showTurbo && w.turbo && (
                                        <span className="text-[9px] font-medium text-amber-400/70 bg-amber-500/10 px-1 py-0.5 rounded shrink-0">
                                            turbo
                                        </span>
                                    )}
                                </div>
                                {w.description && (
                                    <p className="text-xs text-muted-foreground/60 pl-6 line-clamp-2">{w.description as string}</p>
                                )}
                                {w.pluginName && (
                                    <p className="text-[10px] text-muted-foreground/40 pl-6 font-mono truncate">plugin: {w.pluginName as string}</p>
                                )}
                            </div>
                            <div className="flex items-center gap-2 shrink-0 mt-0.5">
                                {onCopy && w.isBuiltin && (
                                    <button
                                        onClick={() => onCopy(w)}
                                        disabled={isCopying}
                                        title="Copy to workspace for editing"
                                        className="flex items-center gap-1 text-[10px] px-2 py-1 rounded-md bg-muted/30 hover:bg-muted/60 text-muted-foreground hover:text-foreground transition-colors border border-border/20 disabled:opacity-40 disabled:cursor-not-allowed"
                                    >
                                        {isCopying
                                            ? <Loader2 className="w-3 h-3 animate-spin" />
                                            : <Copy className="w-3 h-3" />
                                        }
                                        Copy
                                    </button>
                                )}
                                {w.scope && (
                                    <Badge className="text-[9px] h-5 px-1.5 bg-muted/30 text-muted-foreground border border-border/20 hover:bg-muted/30">
                                        {w.scope as string}
                                    </Badge>
                                )}
                            </div>
                        </div>
                        {copyErr && (
                            <div className="px-4 pb-2 -mt-1">
                                <p className="text-[10px] text-red-400/80 font-mono bg-red-500/5 border border-red-500/10 rounded px-2 py-1 break-all">
                                    Copy failed: {copyErr}
                                </p>
                            </div>
                        )}
                    </div>
                );
            })}
        </ListTable>
    );
}

function RuleList({ items }: { items: CortexMemory[] }) {
    return (
        <ListTable columnLabel="Rule">
            {items.map((r, i) => (
                <ListRow
                    key={r.memoryId ?? r.absolutePath ?? String(i)}
                    icon={ScrollText}
                    iconColor="text-sky-400/60"
                    name={ruleName(r)}
                    badges={
                        r.source ? (
                            <span className="text-[9px] font-medium text-muted-foreground/50 bg-muted/40 px-1 py-0.5 rounded shrink-0">
                                {r.source}
                            </span>
                        ) : undefined
                    }
                    description={r.textMemory}
                    meta={r.absolutePath}
                    scope={r.scope}
                />
            ))}
        </ListTable>
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

/** Renders one tab's loading / error / content states from its TabData. */
function TabContent<T>({
    tab,
    loadingLabel,
    onRetry,
    children,
}: {
    tab: TabData<T>;
    loadingLabel: string;
    onRetry: () => void;
    children: (data: T) => ReactNode;
}) {
    if (tab.isLoading && tab.data === null) return <LoadingSpinner label={loadingLabel} />;
    if (tab.error !== null) return <ErrorState message={tab.error} onRetry={onRetry} />;
    return <>{tab.data !== null ? children(tab.data) : null}</>;
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

    const [copyingPath, setCopyingPath] = useState<string | null>(null);
    const [copyErrors, setCopyErrors] = useState<Record<string, string>>({});

    // Track the in-flight fetch's AbortController so we can cancel it on unmount / tab change.
    const fetchAbortRef = useRef<AbortController | null>(null);

    // Step 1: resolve workspace URIs on mount
    useEffect(() => {
        const ac = new AbortController();
        setWsLoading(true);
        setWsError(null);

        lsCall<GetWorkspaceInfosResponse>('GetWorkspaceInfos', {}, ac.signal)
            .then(res => {
                const uris = (res.workspaceInfos ?? [])
                    .map(info => info.workspaceUri)
                    .filter((u): u is string => typeof u === 'string' && u.length > 0);
                setWorkspaceUris(uris);
            })
            .catch((e: unknown) => {
                if (isAbortError(e)) return;
                setWsError(e instanceof Error ? e.message : 'Failed to load workspace info');
                setWorkspaceUris([]);
            })
            .finally(() => {
                if (!ac.signal.aborted) setWsLoading(false);
            });

        return () => ac.abort();
    }, []);

    // Step 2: fetch tab data when workspaceUris are ready and tab changes.
    const fetchTab = useCallback((tab: TabId, uris: string[]) => {
        // Cancel any prior in-flight fetch (truly aborts the HTTP request via the signal).
        if (fetchAbortRef.current !== null) fetchAbortRef.current.abort();
        const ac = new AbortController();
        fetchAbortRef.current = ac;

        const body = { workspaceUris: uris };

        if (tab === 'workflows') {
            setWorkflowsTab(prev => ({ ...prev, isLoading: true, error: null }));
            lsCall<GetAllWorkflowsResponse>('GetAllWorkflows', body, ac.signal)
                .then(res => setWorkflowsTab({ data: res.workflows ?? [], isLoading: false, error: null }))
                .catch((e: unknown) => {
                    if (isAbortError(e)) return;
                    setWorkflowsTab({ data: null, isLoading: false, error: e instanceof Error ? e.message : 'Failed to load workflows' });
                });
        } else if (tab === 'skills') {
            setSkillsTab(prev => ({ ...prev, isLoading: true, error: null }));
            lsCall<GetAllSkillsResponse>('GetAllSkills', body, ac.signal)
                .then(res => setSkillsTab({ data: res.skills ?? [], isLoading: false, error: null }))
                .catch((e: unknown) => {
                    if (isAbortError(e)) return;
                    setSkillsTab({ data: null, isLoading: false, error: e instanceof Error ? e.message : 'Failed to load skills' });
                });
        } else {
            setRulesTab(prev => ({ ...prev, isLoading: true, error: null }));
            lsCall<GetAllRulesResponse>('GetAllRules', body, ac.signal)
                .then(res => setRulesTab({ data: res.memories ?? [], isLoading: false, error: null }))
                .catch((e: unknown) => {
                    if (isAbortError(e)) return;
                    setRulesTab({ data: null, isLoading: false, error: e instanceof Error ? e.message : 'Failed to load rules' });
                });
        }
    }, []);

    const handleCopyWorkflow = useCallback(async (w: WorkflowSpec) => {
        const key = w.path ?? w.name ?? '';
        if (!key) return;
        setCopyingPath(key);
        setCopyErrors(prev => { const n = { ...prev }; delete n[key]; return n; });
        try {
            await lsCall('CopyBuiltinWorkflowToWorkspace', { workflow: w, metadata: {} });
            // Re-fetch the workflows list so the copied item appears as a workspace workflow.
            // Use a dedicated AbortController (NOT the shared fetchAbortRef) so a concurrent
            // tab-switch can't cancel this refresh, and vice-versa.
            if (workspaceUris !== null) {
                const ac = new AbortController();
                setWorkflowsTab(prev => ({ ...prev, isLoading: true, error: null }));
                try {
                    const res = await lsCall<GetAllWorkflowsResponse>('GetAllWorkflows', { workspaceUris }, ac.signal);
                    setWorkflowsTab({ data: res.workflows ?? [], isLoading: false, error: null });
                } catch (re: unknown) {
                    if (!isAbortError(re)) {
                        setWorkflowsTab({ data: null, isLoading: false, error: re instanceof Error ? re.message : 'Failed to load workflows' });
                    }
                }
            }
        } catch (e: unknown) {
            setCopyErrors(prev => ({ ...prev, [key]: e instanceof Error ? e.message : 'Copy failed' }));
        } finally {
            setCopyingPath(null);
        }
    }, [workspaceUris]);

    useEffect(() => {
        if (workspaceUris === null) return; // still loading workspace info
        fetchTab(activeTab, workspaceUris);
        return () => {
            if (fetchAbortRef.current !== null) fetchAbortRef.current.abort();
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

    const currentTab = activeTab === 'workflows' ? workflowsTab : activeTab === 'skills' ? skillsTab : rulesTab;
    const uris = workspaceUris ?? [];

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
                        <TabContent tab={workflowsTab} loadingLabel="Loading workflows..." onRetry={() => fetchTab('workflows', uris)}>
                            {(items) => items.length === 0
                                ? <EmptyState icon={Workflow} title="No workflows found" hint="Add workflow files to your workspace to see them here." />
                                : <SpecList items={items} icon={Workflow} iconColor="text-violet-400/60" columnLabel="Workflow" showTurbo onCopy={handleCopyWorkflow} copyingPath={copyingPath} copyErrors={copyErrors} />}
                        </TabContent>
                    </TabsContent>
                    <TabsContent value="skills">
                        <TabContent tab={skillsTab} loadingLabel="Loading skills..." onRetry={() => fetchTab('skills', uris)}>
                            {(items) => items.length === 0
                                ? <EmptyState icon={BookOpen} title="No skills found" hint="Install skills from the Antigravity plugin marketplace to see them here." />
                                : <SpecList items={items} icon={BookOpen} iconColor="text-emerald-400/60" columnLabel="Skill" showTurbo={false} />}
                        </TabContent>
                    </TabsContent>
                    <TabsContent value="rules">
                        <TabContent tab={rulesTab} loadingLabel="Loading rules..." onRetry={() => fetchTab('rules', uris)}>
                            {(items) => items.length === 0
                                ? <EmptyState icon={ScrollText} title="No rules found" hint="Add rule files to your workspace to inject persistent instructions into the agent." />
                                : <RuleList items={items} />}
                        </TabContent>
                    </TabsContent>
                </Tabs>

                {/* Footer */}
                <p className="text-center text-[10px] text-muted-foreground/40 pb-4">
                    Builtin workflows can be copied to your workspace for customization. Manage skills and rules via Antigravity IDE settings.
                </p>
            </div>
        </div>
    );
}
