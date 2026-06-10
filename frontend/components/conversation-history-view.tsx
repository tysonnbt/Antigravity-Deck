'use client';

// === Conversation History view ===
// Mirrors the Antigravity app's "Conversation History": the FULL conversation list
// (from the hub's Jetbox stream) with a search box and a "Projects" grouping/filter.
// Click a conversation to open it. Shares its data loader with the sidebar.

import { useEffect, useMemo, useState, useCallback } from 'react';
import { Search, MessageSquare, FolderGit2, Inbox, History as HistoryIcon, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { loadConversationIndex, relTime, OUTSIDE_PROJECT } from '@/lib/conversations';
import type { Project, ConvRow } from '@/lib/conversations';

interface ConversationHistoryViewProps {
    currentConvId: string | null;
    version: number;
    onSelectConversation: (convId: string, wsName: string) => void;
    /** Pre-select a project filter when the view is opened (e.g. from "See all"). */
    initialProjectId?: string | null;
}

export function ConversationHistoryView({ currentConvId, version, onSelectConversation, initialProjectId = null }: ConversationHistoryViewProps) {
    const [projects, setProjects] = useState<Project[]>([]);
    const [rows, setRows] = useState<ConvRow[]>([]);
    const [q, setQ] = useState('');
    const [activeProject, setActiveProject] = useState<string | null>(initialProjectId); // projectId | OUTSIDE_PROJECT | null(all)
    const [loading, setLoading] = useState(true);

    // Sync the filter whenever the caller changes the requested project.
    useEffect(() => { setActiveProject(initialProjectId); }, [initialProjectId]);

    const load = useCallback(async () => {
        try {
            const { projects: projs, rows: next } = await loadConversationIndex();
            setProjects(projs);
            setRows(next);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { load(); }, [load, version]);

    const looseCount = useMemo(
        () => rows.filter(r => !r.projectId || r.projectId === OUTSIDE_PROJECT).length,
        [rows]
    );

    const filtered = useMemo(() => {
        const query = q.trim().toLowerCase();
        return rows.filter(r => {
            if (activeProject === OUTSIDE_PROJECT) {
                if (r.projectId && r.projectId !== OUTSIDE_PROJECT) return false;
            } else if (activeProject) {
                if (r.projectId !== activeProject) return false;
            }
            if (query && !r.title.toLowerCase().includes(query) && !r.projectName.toLowerCase().includes(query)) return false;
            return true;
        });
    }, [rows, q, activeProject]);

    return (
        <div className="flex flex-1 min-h-0 overflow-hidden">
            {/* Left: Projects filter */}
            <div className="w-56 shrink-0 border-r border-border/40 flex flex-col min-h-0 hidden md:flex">
                <div className="px-3 py-3 text-xs font-semibold text-muted-foreground flex items-center gap-2">
                    <FolderGit2 className="w-3.5 h-3.5" /> Projects
                </div>
                <div className="flex-1 overflow-y-auto px-2 pb-2 space-y-0.5">
                    <ProjectButton
                        active={activeProject === null}
                        icon={<HistoryIcon className="w-3.5 h-3.5" />}
                        label="All conversations"
                        count={rows.length}
                        onClick={() => setActiveProject(null)}
                    />
                    {projects.map(p => (
                        <ProjectButton
                            key={p.id}
                            active={activeProject === p.id}
                            icon={<FolderGit2 className="w-3.5 h-3.5" />}
                            label={p.name}
                            count={p.conversationCount}
                            onClick={() => setActiveProject(p.id)}
                        />
                    ))}
                    {looseCount > 0 && (
                        <ProjectButton
                            active={activeProject === OUTSIDE_PROJECT}
                            icon={<Inbox className="w-3.5 h-3.5" />}
                            label="Other"
                            count={looseCount}
                            onClick={() => setActiveProject(OUTSIDE_PROJECT)}
                        />
                    )}
                </div>
            </div>

            {/* Right: search + list */}
            <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
                <div className="px-4 sm:px-6 pt-5 pb-3 shrink-0">
                    <h1 className="text-xl font-semibold mb-3">Conversation History</h1>
                    <div className="relative max-w-2xl">
                        <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground/60" />
                        <input
                            value={q}
                            onChange={e => setQ(e.target.value)}
                            placeholder="Search conversations..."
                            className="w-full h-9 pl-9 pr-3 rounded-lg bg-muted/40 border border-border/50 text-sm outline-none focus:border-primary/50 transition-colors"
                        />
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto px-2 sm:px-4 pb-6">
                    {loading ? (
                        <div className="flex items-center justify-center py-16 text-muted-foreground text-sm gap-2">
                            <Loader2 className="w-4 h-4 animate-spin" /> Loading history...
                        </div>
                    ) : filtered.length === 0 ? (
                        <div className="text-center py-16 text-sm text-muted-foreground/60">
                            {rows.length === 0 ? 'No conversations found.' : 'No conversations match your filter.'}
                        </div>
                    ) : (
                        <div className="max-w-3xl mx-auto divide-y divide-border/30">
                            {filtered.map(r => (
                                <button
                                    key={r.id}
                                    onClick={() => onSelectConversation(r.id, r.projectName || 'unknown')}
                                    className={cn(
                                        'group w-full flex items-center gap-3 px-3 py-2.5 text-left rounded-md transition-colors hover:bg-muted/40',
                                        currentConvId === r.id && 'bg-muted/60'
                                    )}
                                >
                                    <MessageSquare className="w-4 h-4 shrink-0 text-muted-foreground/50" />
                                    <div className="flex-1 min-w-0">
                                        <div className="text-sm truncate">{r.title}</div>
                                        {r.projectName && (
                                            <div className="text-[11px] text-muted-foreground/60 truncate">{r.projectName}</div>
                                        )}
                                    </div>
                                    {r.stepCount > 0 && (
                                        <span className="text-[10px] text-muted-foreground/40 shrink-0 hidden sm:inline">{r.stepCount} steps</span>
                                    )}
                                    <span className="text-[11px] text-muted-foreground/50 shrink-0 w-10 text-right">{relTime(r.lastModified)}</span>
                                </button>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}

function ProjectButton({ active, icon, label, count, onClick }: {
    active: boolean; icon: React.ReactNode; label: string; count: number; onClick: () => void;
}) {
    return (
        <button
            onClick={onClick}
            className={cn(
                'w-full flex items-center gap-2 px-2.5 py-1.5 rounded-md text-xs transition-colors',
                active ? 'bg-primary/15 text-primary' : 'text-foreground/80 hover:bg-muted/40'
            )}
        >
            <span className="shrink-0 opacity-70">{icon}</span>
            <span className="flex-1 truncate text-left">{label}</span>
            <span className="shrink-0 text-[10px] text-muted-foreground/50 tabular-nums">{count}</span>
        </button>
    );
}
