'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { lsCall } from '@/lib/cascade-api';
import { GitBranch, Activity, AlertTriangle, Loader2, FolderOpen, GitCommit, FileEdit } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

// === Types ===

// GetWorkspaceInfos
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

// GetRepoInfos
interface BranchInfo {
    name?: string;
    isCurrentBranch?: boolean;
    [key: string]: unknown;
}

interface RepoInfo {
    name?: string;
    repoPath?: string;
    branches?: BranchInfo[];
    scmType?: string;
    [key: string]: unknown;
}

interface GetRepoInfosResponse {
    repos?: RepoInfo[];
    [key: string]: unknown;
}

// GetWorkspaceEditState
interface WorkspaceEdit {
    repoRoot?: string;
    numAdditions?: number;
    numDeletions?: number;
    edits?: unknown[];
    [key: string]: unknown;
}

interface GetWorkspaceEditStateResponse {
    workspaceEdits?: WorkspaceEdit[];
    [key: string]: unknown;
}

// === Helpers ===

/** True for the AbortError thrown when a fetch is cancelled (expected, not a user error). */
function isAbortError(e: unknown): boolean {
    return e instanceof DOMException && e.name === 'AbortError';
}

function currentBranch(repo: RepoInfo): string {
    return repo.branches?.find(b => b.isCurrentBranch)?.name
        ?? repo.branches?.[0]?.name
        ?? '(unknown branch)';
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

function NoWorkspaceState() {
    return (
        <div className="flex-1 flex items-center justify-center">
            <div className="flex flex-col items-center gap-3 max-w-sm text-center">
                <FolderOpen className="w-8 h-8 text-muted-foreground/30" />
                <span className="text-sm font-medium text-foreground/70">No workspace open</span>
                <span className="text-xs text-muted-foreground">
                    Open a workspace folder in Antigravity IDE to view repo info and pending AI edits.
                </span>
            </div>
        </div>
    );
}

// === Sub-components ===

function RepoCard({ repo }: { repo: RepoInfo }) {
    const branch = currentBranch(repo);
    const otherBranches = (repo.branches ?? []).filter(b => !b.isCurrentBranch);

    return (
        <div className="rounded-xl border border-border/50 bg-card/50 overflow-hidden">
            <div className="px-4 py-3 bg-muted/10 border-b border-border/30 flex items-center gap-2">
                <GitBranch className="w-4 h-4 text-emerald-400/60 shrink-0" />
                <span className="text-sm font-semibold truncate">{repo.name ?? '(unnamed repo)'}</span>
                {repo.scmType && repo.scmType !== 'GIT' && (
                    <Badge className="text-[9px] h-5 px-1.5 bg-muted/30 text-muted-foreground border border-border/20 hover:bg-muted/30 ml-auto shrink-0">
                        {repo.scmType}
                    </Badge>
                )}
            </div>
            <div className="px-4 py-3 space-y-2">
                {/* Current branch */}
                <div className="flex items-center gap-2">
                    <span className="text-[10px] text-muted-foreground/50 uppercase tracking-wider w-20 shrink-0">Branch</span>
                    <div className="flex items-center gap-1.5">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" />
                        <span className="text-sm font-mono font-medium text-emerald-400">{branch}</span>
                    </div>
                </div>
                {/* Repo path */}
                {repo.repoPath && (
                    <div className="flex items-start gap-2">
                        <span className="text-[10px] text-muted-foreground/50 uppercase tracking-wider w-20 shrink-0 pt-0.5">Path</span>
                        <span className="text-[11px] font-mono text-muted-foreground/70 break-all">{repo.repoPath}</span>
                    </div>
                )}
                {/* Other branches */}
                {otherBranches.length > 0 && (
                    <div className="flex items-start gap-2">
                        <span className="text-[10px] text-muted-foreground/50 uppercase tracking-wider w-20 shrink-0 pt-0.5">Branches</span>
                        <div className="flex flex-wrap gap-1">
                            {otherBranches.slice(0, 8).map((b, i) => (
                                <span
                                    key={b.name ?? String(i)}
                                    className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-muted/30 text-muted-foreground border border-border/20"
                                >
                                    {b.name}
                                </span>
                            ))}
                            {otherBranches.length > 8 && (
                                <span className="text-[10px] text-muted-foreground/50 py-0.5">
                                    +{otherBranches.length - 8} more
                                </span>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

function EditStateCard({ edit }: { edit: WorkspaceEdit }) {
    const additions = edit.numAdditions ?? 0;
    const deletions = edit.numDeletions ?? 0;
    const editCount = edit.edits?.length ?? 0;
    const hasChanges = additions > 0 || deletions > 0 || editCount > 0;

    return (
        <div className="rounded-xl border border-border/50 bg-card/50 overflow-hidden">
            <div className="px-4 py-3 bg-muted/10 border-b border-border/30 flex items-center gap-2">
                <FileEdit className="w-4 h-4 text-amber-400/60 shrink-0" />
                <span className="text-sm font-semibold truncate">
                    {edit.repoRoot
                        ? edit.repoRoot.split(/[\\/]/).filter(Boolean).pop() ?? edit.repoRoot
                        : '(unknown repo)'}
                </span>
                {!hasChanges && (
                    <Badge className="text-[9px] h-5 px-1.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/10 ml-auto shrink-0">
                        clean
                    </Badge>
                )}
                {hasChanges && (
                    <Badge className="text-[9px] h-5 px-1.5 bg-amber-500/10 text-amber-400 border border-amber-500/20 hover:bg-amber-500/10 ml-auto shrink-0">
                        pending
                    </Badge>
                )}
            </div>
            <div className="px-4 py-3 space-y-2">
                {edit.repoRoot && (
                    <div className="flex items-start gap-2">
                        <span className="text-[10px] text-muted-foreground/50 uppercase tracking-wider w-20 shrink-0 pt-0.5">Root</span>
                        <span className="text-[11px] font-mono text-muted-foreground/70 break-all">{edit.repoRoot}</span>
                    </div>
                )}
                <div className="flex items-center gap-4">
                    <div className="flex items-center gap-1.5">
                        <span className="text-[10px] text-muted-foreground/50 uppercase tracking-wider">Additions</span>
                        <span className={`text-sm font-mono font-medium ${additions > 0 ? 'text-emerald-400' : 'text-muted-foreground/40'}`}>
                            +{additions}
                        </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                        <span className="text-[10px] text-muted-foreground/50 uppercase tracking-wider">Deletions</span>
                        <span className={`text-sm font-mono font-medium ${deletions > 0 ? 'text-red-400' : 'text-muted-foreground/40'}`}>
                            -{deletions}
                        </span>
                    </div>
                    {editCount > 0 && (
                        <div className="flex items-center gap-1.5">
                            <GitCommit className="w-3 h-3 text-muted-foreground/40" />
                            <span className="text-xs font-mono text-muted-foreground">{editCount} edit{editCount !== 1 ? 's' : ''}</span>
                        </div>
                    )}
                </div>
                {!hasChanges && (
                    <p className="text-xs text-muted-foreground/50">No pending AI edits in this repo.</p>
                )}
            </div>
        </div>
    );
}

// === Combined panel data ===
interface PanelData {
    repos: RepoInfo[];
    editStates: WorkspaceEdit[];
}

// === Main Component ===

export function RepoInfoView() {
    const [workspaceUris, setWorkspaceUris] = useState<string[] | null>(null);
    const [wsLoading, setWsLoading] = useState(true);
    const [wsError, setWsError] = useState<string | null>(null);

    const [panelData, setPanelData] = useState<PanelData | null>(null);
    const [dataLoading, setDataLoading] = useState(false);
    const [dataError, setDataError] = useState<string | null>(null);

    const fetchAbortRef = useRef<AbortController | null>(null);

    // Step 1: resolve workspace URIs on mount
    useEffect(() => {
        const ac = new AbortController();
        setWsLoading(true);
        setWsError(null);

        lsCall<GetWorkspaceInfosResponse>('GetWorkspaceInfos', {}, ac.signal)
            .then(res => {
                if (ac.signal.aborted) return;
                const uris = (res.workspaceInfos ?? [])
                    .map(info => info.workspaceUri)
                    .filter((u): u is string => typeof u === 'string' && u.length > 0);
                setWorkspaceUris(uris);
                setWsLoading(false);
            })
            .catch((e: unknown) => {
                if (isAbortError(e)) return;
                setWsError(e instanceof Error ? e.message : 'Failed to load workspace info');
                setWorkspaceUris([]);
                setWsLoading(false);
            });

        return () => ac.abort();
    }, []);

    // Step 2: fetch repo + edit state in parallel once workspace URIs are known
    const fetchData = useCallback((uris: string[]) => {
        if (fetchAbortRef.current !== null) fetchAbortRef.current.abort();
        const ac = new AbortController();
        fetchAbortRef.current = ac;

        setDataLoading(true);
        setDataError(null);

        // Resolve git root URIs from workspace URIs — use workspaceUri as repoUri candidate
        const repoUris = uris;

        Promise.all([
            lsCall<GetRepoInfosResponse>('GetRepoInfos', { repoUris }, ac.signal),
            lsCall<GetWorkspaceEditStateResponse>('GetWorkspaceEditState', {}, ac.signal),
        ])
            .then(([repoRes, editRes]) => {
                if (ac.signal.aborted) return;
                setPanelData({
                    repos: repoRes.repos ?? [],
                    editStates: editRes.workspaceEdits ?? [],
                });
                setDataLoading(false);
            })
            .catch((e: unknown) => {
                if (isAbortError(e)) return;
                setDataError(e instanceof Error ? e.message : 'Failed to load repo info');
                setDataLoading(false);
            });
    }, []);

    useEffect(() => {
        if (workspaceUris === null) return;
        if (workspaceUris.length === 0) return; // no workspace open
        fetchData(workspaceUris);
        return () => {
            if (fetchAbortRef.current !== null) fetchAbortRef.current.abort();
        };
    }, [workspaceUris, fetchData]);

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

    if (workspaceUris !== null && workspaceUris.length === 0) {
        return <NoWorkspaceState />;
    }

    const uris = workspaceUris ?? [];

    return (
        <div className="flex-1 overflow-y-auto">
            <div className="max-w-3xl mx-auto p-6 space-y-6">
                {/* Header */}
                <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-gradient-to-br from-emerald-500/10 to-teal-500/10 border border-emerald-500/20">
                        <GitBranch className="w-5 h-5 text-emerald-400" />
                    </div>
                    <div>
                        <h2 className="text-lg font-semibold">Repo Info</h2>
                        <p className="text-xs text-muted-foreground">
                            Repository state and pending AI edits from the active workspace
                        </p>
                    </div>
                    {dataLoading && (
                        <Loader2 className="w-4 h-4 text-muted-foreground/50 animate-spin ml-auto" />
                    )}
                </div>

                {/* Data loading state */}
                {dataLoading && panelData === null && (
                    <LoadingSpinner label="Loading repo info..." />
                )}

                {/* Error state */}
                {dataError !== null && (
                    <ErrorState message={dataError} onRetry={() => fetchData(uris)} />
                )}

                {/* Content */}
                {panelData !== null && dataError === null && (
                    <>
                        {/* Repo Info section */}
                        <div className="space-y-3">
                            <h3 className="text-xs font-semibold text-muted-foreground/70 uppercase tracking-wider flex items-center gap-2">
                                <GitBranch className="w-3.5 h-3.5" />
                                Repositories
                            </h3>
                            {panelData.repos.length === 0 ? (
                                <div className="rounded-xl border border-border/50 bg-card/50 p-8 text-center">
                                    <GitBranch className="w-7 h-7 mx-auto text-muted-foreground/20 mb-3" />
                                    <p className="text-sm font-medium text-muted-foreground/60 mb-1">No repositories found</p>
                                    <p className="text-xs text-muted-foreground/40 max-w-xs mx-auto">
                                        Open a git repository in Antigravity IDE to see branch and remote info here.
                                    </p>
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {panelData.repos.map((repo, i) => (
                                        <RepoCard key={repo.repoPath ?? String(i)} repo={repo} />
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Pending AI Edits section */}
                        <div className="space-y-3">
                            <h3 className="text-xs font-semibold text-muted-foreground/70 uppercase tracking-wider flex items-center gap-2">
                                <FileEdit className="w-3.5 h-3.5" />
                                Pending AI Edits
                            </h3>
                            {panelData.editStates.length === 0 ? (
                                <div className="rounded-xl border border-border/50 bg-card/50 p-8 text-center">
                                    <FileEdit className="w-7 h-7 mx-auto text-muted-foreground/20 mb-3" />
                                    <p className="text-sm font-medium text-muted-foreground/60 mb-1">No pending AI edits</p>
                                    <p className="text-xs text-muted-foreground/40 max-w-xs mx-auto">
                                        AI-suggested changes that haven&apos;t been committed will appear here.
                                    </p>
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {panelData.editStates.map((edit, i) => (
                                        <EditStateCard key={edit.repoRoot ?? String(i)} edit={edit} />
                                    ))}
                                </div>
                            )}
                        </div>
                    </>
                )}

                {/* Footer */}
                <p className="text-center text-[10px] text-muted-foreground/40 pb-4">
                    Read-only view — manage repository and branches via Antigravity IDE
                </p>
            </div>
        </div>
    );
}
