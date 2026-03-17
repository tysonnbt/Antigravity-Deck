'use client';
import { useState, useEffect, useCallback } from 'react';
import { cn } from '@/lib/utils';
import {
    getGitStatus, getGitDiff, getGitShow, getWorkspaceFile,
    GitFileStatus,
} from '@/lib/cascade-api';
import {
    GitBranch, RefreshCw, X,
    Plus, Minus, AlertCircle, FileDiff, Menu, ArrowLeft,
} from 'lucide-react';
import { STATUS_COLORS, STATUS_BG, STATUS_LABELS, basename, dirname } from './shared';
import { buildDiffFile, DiffContent } from './diff-panel';
import type { DiffData } from './diff-panel';

// ─── Source Control Tab ───────────────────────────────────────────────────────

export function SourceControlTab({ workspace }: { workspace: string }) {
    const [files, setFiles] = useState<GitFileStatus[]>([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [selectedFile, setSelectedFile] = useState<string | null>(null);
    const [diffData, setDiffData] = useState<DiffData | null>(null);
    const [diffLoading, setDiffLoading] = useState(false);
    const [diffError, setDiffError] = useState<string | null>(null);
    const [viewMode, setViewMode] = useState<'diff' | 'original' | 'current'>('diff');
    const [mobileListOpen, setMobileListOpen] = useState(true);

    const refresh = useCallback(async () => {
        setLoading(true); setError(null);
        try {
            const data = await getGitStatus(workspace);
            setFiles(data.files || []);
            if (data.error) setError(data.error);
        } catch (e: any) { setError(e.message); }
        finally { setLoading(false); }
    }, [workspace]);

    useEffect(() => { refresh(); }, [refresh]);

    const selectFile = useCallback(async (filePath: string) => {
        setSelectedFile(filePath); setViewMode('diff');
        setDiffLoading(true); setDiffData(null); setDiffError(null);
        setMobileListOpen(false); // auto-collapse list on mobile when file selected
        try {
            const [diffRes, originalRes, currentRes] = await Promise.allSettled([
                getGitDiff(workspace, filePath),
                getGitShow(workspace, filePath),
                getWorkspaceFile(workspace, filePath),
            ]);
            const rawDiff = diffRes.status === 'fulfilled' ? (diffRes.value.diff ?? '') : '';
            const oldContent = originalRes.status === 'fulfilled' ? (originalRes.value.content ?? '') : '';
            const newContent = currentRes.status === 'fulfilled' ? (currentRes.value.content ?? '') : '';
            const hasDiff = rawDiff.includes('@@');
            const diffFile = hasDiff ? buildDiffFile(filePath, oldContent, newContent, rawDiff) : null;
            setDiffData({ diffFile, oldContent, newContent, hasDiff, rawDiff });
        } catch (e: any) {
            setDiffError(e.message);
        } finally { setDiffLoading(false); }
    }, [workspace]);

    const totalAdded = files.reduce((s, f) => s + f.additions, 0);
    const totalDeleted = files.reduce((s, f) => s + f.deletions, 0);

    return (
        <div className="flex-1 flex min-h-0 overflow-hidden relative">
            {/* Changed files list */}
            <div className={cn(
                'shrink-0 border-r border-border/50 flex flex-col overflow-hidden transition-all duration-200',
                // Desktop: always shown fixed width
                'md:w-[220px] xl:w-[260px] md:translate-x-0 md:relative md:flex',
                // Mobile: slide in/out
                mobileListOpen
                    ? 'w-[200px] flex absolute inset-y-0 left-0 z-10 bg-background'
                    : 'w-0 hidden',
            )}>
                <div className="flex items-center justify-between px-3 h-8 border-b border-border/30 shrink-0">
                    <div className="flex items-center gap-1.5">
                        <FileDiff className="w-3.5 h-3.5 text-muted-foreground/40" />
                        {files.length > 0 && (
                            <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-muted/40 text-[9px] text-muted-foreground/60 font-bold">
                                {files.length}
                            </span>
                        )}
                    </div>
                    <div className="flex items-center gap-2">
                        {totalAdded > 0 && (
                            <span className="flex items-center gap-0.5 text-[10px] text-emerald-400/70">
                                <Plus className="w-2.5 h-2.5" />{totalAdded}
                            </span>
                        )}
                        {totalDeleted > 0 && (
                            <span className="flex items-center gap-0.5 text-[10px] text-red-400/70">
                                <Minus className="w-2.5 h-2.5" />{totalDeleted}
                            </span>
                        )}
                        <div className="flex items-center gap-1 -mr-2.5 md:mr-0">
                            <button onClick={refresh} className="p-1 rounded hover:bg-muted/30 text-muted-foreground/30 hover:text-muted-foreground/70 transition-colors" title="Refresh">
                                <RefreshCw className={cn('w-3 h-3', loading && 'animate-spin')} />
                            </button>
                            {/* Mobile: close panel button */}
                            <button
                                onClick={() => setMobileListOpen(false)}
                                className="md:hidden p-1 rounded hover:bg-muted/30 text-muted-foreground/30 hover:text-muted-foreground/70 transition-colors"
                                title="Close panel"
                            >
                                <X className="w-3 h-3" />
                            </button>
                        </div>
                    </div>
                </div>

                <div className="flex-1 overflow-y-auto py-1">
                    {loading && (
                        <div className="flex flex-col gap-1.5 px-4 py-4">
                            {[70, 50, 85, 60].map((w, i) => (
                                <div key={i} className="h-4 rounded bg-muted/20 animate-pulse" style={{ width: `${w}%` }} />
                            ))}
                        </div>
                    )}
                    {!loading && error && files.length === 0 && (
                        <div className="m-3 p-2.5 rounded-md bg-amber-500/10 border border-amber-500/20 text-xs text-amber-400/80 flex items-start gap-2">
                            <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                            {error}
                        </div>
                    )}
                    {!loading && !error && files.length === 0 && (
                        <div className="flex flex-col items-center gap-2 py-10 text-muted-foreground/20">
                            <GitBranch className="w-7 h-7" />
                            <p className="text-xs">Working tree clean</p>
                        </div>
                    )}
                    {files.map(f => (
                        <button
                            key={f.path}
                            onClick={() => selectFile(f.path)}
                            className={cn(
                                'group w-full text-left px-2 py-1.5 flex items-center gap-2 transition-all rounded-sm mx-1 my-0.5',
                                selectedFile === f.path
                                    ? cn('border-l-2 border-primary pl-1.5', STATUS_BG[f.status] || 'bg-muted/30')
                                    : 'hover:bg-muted/25'
                            )}
                            title={f.path}
                            style={{ width: 'calc(100% - 8px)' }}
                        >
                            {/* Status badge */}
                            <span className={cn(
                                'font-mono font-bold text-[10px] w-4 h-4 flex items-center justify-center rounded shrink-0',
                                STATUS_COLORS[f.status] || 'text-muted-foreground',
                                STATUS_BG[f.status] || 'bg-muted/20',
                            )}>
                                {STATUS_LABELS[f.status] || '?'}
                            </span>

                            <div className="flex flex-col min-w-0 flex-1">
                                <span className="truncate font-mono text-xs text-foreground/80 leading-none mb-0.5">
                                    {basename(f.path)}
                                </span>
                                {dirname(f.path) && (
                                    <span className="truncate text-[9px] text-muted-foreground/30 font-mono">
                                        {dirname(f.path)}
                                    </span>
                                )}
                            </div>

                            {/* +/- stats */}
                            <div className="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                                {f.additions > 0 && (
                                    <span className="text-emerald-400/70 text-[9px] font-mono">+{f.additions}</span>
                                )}
                                {f.deletions > 0 && (
                                    <span className="text-red-400/70 text-[9px] font-mono">-{f.deletions}</span>
                                )}
                            </div>
                        </button>
                    ))}
                </div>
            </div>

            {/* Diff/content area */}
            <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
                {selectedFile ? (
                    <>
                        {/* View mode tabs */}
                        <div className="flex items-center border-b border-border/30 bg-muted/5 shrink-0">
                            {/* Mobile: button to reopen file list */}
                            <button
                                onClick={() => setMobileListOpen(v => !v)}
                                className="md:hidden flex items-center gap-1 px-2.5 py-2.5 text-muted-foreground/60 hover:text-muted-foreground hover:bg-muted/30 transition-colors border-r border-border/30 shrink-0"
                                title="Toggle file list"
                            >
                                <ArrowLeft className="w-4 h-4" />
                                <span className="text-[10px] font-medium">Files</span>
                            </button>
                            {(['diff', 'original', 'current'] as const).map(mode => (
                                <button
                                    key={mode}
                                    onClick={() => setViewMode(mode)}
                                    className={cn(
                                        'flex items-center gap-1.5 px-4 py-2.5 text-xs font-medium transition-all border-b-2',
                                        viewMode === mode
                                            ? 'text-foreground border-primary'
                                            : 'text-muted-foreground/50 border-transparent hover:text-muted-foreground hover:border-muted-foreground/20'
                                    )}
                                >
                                    {mode === 'diff' ? 'Changes' : mode === 'original' ? 'Before' : 'After'}
                                </button>
                            ))}
                            <span className="flex-1" />
                            <span className="text-[10px] text-muted-foreground/30 pr-4 font-mono truncate max-w-xs hidden sm:inline">
                                {selectedFile}
                            </span>
                        </div>

                        <div className="flex-1 min-h-0 overflow-auto relative">
                            <DiffContent
                                diffData={diffData}
                                diffLoading={diffLoading}
                                diffError={diffError}
                                viewMode={viewMode}
                                selectedFile={selectedFile}
                            />

                            {/* Mobile: floating button to reopen file list */}
                            {!mobileListOpen && (
                                <button
                                    onClick={() => setMobileListOpen(true)}
                                    className="md:hidden fixed bottom-16 left-3 z-30 flex items-center gap-1.5 px-3 py-2 rounded-full bg-primary/90 text-primary-foreground text-xs font-medium shadow-lg shadow-black/30 hover:bg-primary transition-all active:scale-95"
                                >
                                    <Menu className="w-3.5 h-3.5" />
                                    <span>Files</span>
                                </button>
                            )}
                        </div>
                    </>
                ) : (
                    <div className="flex-1 flex flex-col items-center justify-center gap-3 text-muted-foreground/20">
                        {/* Mobile: button to reopen file list when closed */}
                        {!mobileListOpen && (
                            <button
                                onClick={() => setMobileListOpen(true)}
                                className="md:hidden mb-2 px-3 py-1.5 rounded-md bg-muted/20 text-muted-foreground/50 text-xs hover:bg-muted/40 transition-colors"
                            >
                                Open file list
                            </button>
                        )}
                        <GitBranch className="w-10 h-10" />
                        <p className="text-xs">Select a changed file to view diff</p>
                    </div>
                )}
            </div>
        </div>
    );
}
