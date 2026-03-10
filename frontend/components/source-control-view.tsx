'use client';
import { useState, useEffect, useCallback, memo, useRef } from 'react';
import { cn } from '@/lib/utils';
import {
    getGitStatus, getGitDiff, getGitShow, getWorkspaceFile,
    listWorkspaceDir, GitFileStatus, FsEntry,
} from '@/lib/cascade-api';
import dynamic from 'next/dynamic';
import { DiffModeEnum, DiffFile, getLang } from '@git-diff-view/react';
import '@git-diff-view/react/styles/diff-view.css';
const DiffView = dynamic(() => import('@git-diff-view/react').then(m => ({ default: m.DiffView })), { ssr: false });
import {
    GitBranch, RefreshCw, X, Folder, FolderOpen,
    ChevronRight, ChevronDown, File, FileCode2,
    FileText, FileJson, Settings2, Image as ImageIcon, Table2,
    Plus, Minus, AlertCircle, Copy, Check, FileDiff,
} from 'lucide-react';

const SyntaxHighlighter = dynamic(
    () => import('react-syntax-highlighter').then(m => ({ default: m.Prism })),
    { ssr: false }
);
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';

const EXT_TO_LANG: Record<string, string> = {
    ts: 'typescript', tsx: 'tsx', js: 'javascript', jsx: 'jsx',
    mjs: 'javascript', cjs: 'javascript', css: 'css', scss: 'scss',
    json: 'json', jsonc: 'json', html: 'markup', xml: 'markup', svg: 'markup',
    md: 'markdown', mdx: 'markdown', py: 'python', sh: 'bash',
    bash: 'bash', yaml: 'yaml', yml: 'yaml', sql: 'sql',
    go: 'go', rs: 'rust', java: 'java', kt: 'kotlin',
    cpp: 'cpp', c: 'c', cs: 'csharp', rb: 'ruby', php: 'php',
};
function extToLang(ext?: string): string { return ext ? (EXT_TO_LANG[ext] ?? 'text') : 'text'; }

// ─── Types ───────────────────────────────────────────────────────────────────

interface SourceControlViewProps {
    workspace: string;
    onClose?: () => void;
}

const STATUS_COLORS: Record<string, string> = {
    modified: 'text-amber-400', added: 'text-emerald-400',
    deleted: 'text-red-400', untracked: 'text-sky-400',
    renamed: 'text-violet-400', copied: 'text-cyan-400',
};
const STATUS_BG: Record<string, string> = {
    modified: 'bg-amber-400/10', added: 'bg-emerald-400/10',
    deleted: 'bg-red-400/10', untracked: 'bg-sky-400/10',
    renamed: 'bg-violet-400/10', copied: 'bg-cyan-400/10',
};
const STATUS_LABELS: Record<string, string> = {
    modified: 'M', added: 'A', deleted: 'D',
    untracked: 'U', renamed: 'R', copied: 'C',
};

function basename(p: string) { return p.split(/[/\\]/).pop() || p; }
function dirname(p: string) { const ps = p.split(/[/\\]/); ps.pop(); return ps.join('/'); }

// ─── File icon with color ─────────────────────────────────────────────────────

const EXT_CONFIG: Record<string, { icon: React.ElementType; color: string }> = {
    ts: { icon: FileCode2, color: '#3178c6' },
    tsx: { icon: FileCode2, color: '#61dafb' },
    js: { icon: FileCode2, color: '#f7df1e' },
    jsx: { icon: FileCode2, color: '#61dafb' },
    mjs: { icon: FileCode2, color: '#f7df1e' },
    cjs: { icon: FileCode2, color: '#f7df1e' },
    json: { icon: FileJson, color: '#f0c040' },
    jsonc: { icon: FileJson, color: '#f0c040' },
    md: { icon: FileText, color: '#84cc16' },
    mdx: { icon: FileText, color: '#84cc16' },
    txt: { icon: FileText, color: '#94a3b8' },
    css: { icon: Settings2, color: '#38bdf8' },
    scss: { icon: Settings2, color: '#f472b6' },
    sass: { icon: Settings2, color: '#f472b6' },
    html: { icon: FileCode2, color: '#f97316' },
    xml: { icon: FileCode2, color: '#f97316' },
    svg: { icon: ImageIcon, color: '#fbbf24' },
    png: { icon: ImageIcon, color: '#a78bfa' },
    jpg: { icon: ImageIcon, color: '#a78bfa' },
    jpeg: { icon: ImageIcon, color: '#a78bfa' },
    gif: { icon: ImageIcon, color: '#a78bfa' },
    webp: { icon: ImageIcon, color: '#a78bfa' },
    csv: { icon: Table2, color: '#34d399' },
    py: { icon: FileCode2, color: '#3b82f6' },
    sh: { icon: FileCode2, color: '#22d3ee' },
    bash: { icon: FileCode2, color: '#22d3ee' },
    yaml: { icon: Settings2, color: '#facc15' },
    yml: { icon: Settings2, color: '#facc15' },
    lock: { icon: Settings2, color: '#6b7280' },
    env: { icon: Settings2, color: '#4ade80' },
};

function FileIcon({ ext, size = 14 }: { ext?: string; size?: number }) {
    const cfg = ext ? EXT_CONFIG[ext] : null;
    const Icon = cfg?.icon ?? File;
    const color = cfg?.color ?? '#94a3b8';
    return <Icon style={{ color, width: size, height: size, flexShrink: 0 }} />;
}

// ─── Copy button ─────────────────────────────────────────────────────────────

function CopyButton({ text }: { text: string }) {
    const [copied, setCopied] = useState(false);
    const copy = () => {
        navigator.clipboard.writeText(text).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1800);
        });
    };
    return (
        <button
            onClick={copy}
            className="flex items-center gap-1 px-2 py-1 rounded text-[10px] text-muted-foreground/50 hover:text-muted-foreground hover:bg-muted/40 transition-all"
            title="Copy"
        >
            {copied ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
            <span>{copied ? 'Copied!' : 'Copy'}</span>
        </button>
    );
}

// ─── Syntax-highlighted code viewer (react-syntax-highlighter) ───────────────

function CodeViewer({ content, ext }: { content: string; ext?: string }) {
    const lang = extToLang(ext);
    const lines = content.split('\n').length;

    return (
        <div className="flex flex-col h-full">
            {/* Toolbar */}
            <div className="flex items-center justify-between px-3 h-8 border-b border-border/20 bg-muted/5 shrink-0">
                <div className="flex items-center gap-2 text-[10px] text-muted-foreground/40">
                    <span>{lines} lines</span>
                    {lang && lang !== 'text' && (
                        <>
                            <span>·</span>
                            <span className="uppercase tracking-wider">{lang}</span>
                        </>
                    )}
                </div>
                <CopyButton text={content} />
            </div>

            {/* Code */}
            <div className="flex-1 overflow-auto text-[11.5px]">
                <SyntaxHighlighter
                    language={lang}
                    style={vscDarkPlus}
                    showLineNumbers
                    wrapLines
                    lineNumberStyle={{
                        minWidth: '2.5rem',
                        paddingRight: '1rem',
                        color: 'rgba(156,163,175,0.25)',
                        userSelect: 'none',
                        fontSize: '10px',
                        borderRight: '1px solid rgba(255,255,255,0.06)',
                        marginRight: '1rem',
                    }}
                    customStyle={{
                        margin: 0,
                        padding: '12px 0',
                        background: 'transparent',
                        fontSize: 'inherit',
                        height: '100%',
                        overflow: 'visible',
                    }}
                    codeTagProps={{
                        style: { fontFamily: 'ui-monospace, Menlo, monospace', lineHeight: '1.65' }
                    }}
                >
                    {content}
                </SyntaxHighlighter>
            </div>
        </div>
    );
}

// ─── Tree Node ────────────────────────────────────────────────────────────────

interface TreeNodeProps {
    name: string;
    type: 'file' | 'dir';
    ext?: string;
    depth: number;
    fullPath: string;
    selectedFile: string | null;
    workspace: string;
    onFileClick: (path: string) => void;
    isLast?: boolean;
}

function TreeNode({
    name, type, ext, depth, fullPath,
    selectedFile, workspace, onFileClick,
}: TreeNodeProps) {
    const [open, setOpen] = useState(false);
    const [children, setChildren] = useState<FsEntry[] | null>(null);
    const [loading, setLoading] = useState(false);
    const isSelected = selectedFile === fullPath && type === 'file';

    const handleClick = useCallback(async () => {
        if (type === 'file') { onFileClick(fullPath); return; }
        const next = !open;
        setOpen(next);
        if (next && children === null) {
            setLoading(true);
            try {
                const data = await listWorkspaceDir(workspace, fullPath);
                setChildren(data.entries);
            } catch { setChildren([]); }
            finally { setLoading(false); }
        }
    }, [type, open, children, workspace, fullPath, onFileClick]);

    const paddingLeft = depth * 16 + 8;

    return (
        <div className="select-none">
            <button
                onClick={handleClick}
                className={cn(
                    'group w-full text-left flex items-center gap-1.5 py-[3.5px] pr-2 rounded-sm transition-all duration-100',
                    isSelected
                        ? 'bg-primary/20 text-primary'
                        : 'hover:bg-muted/30 text-foreground/80 hover:text-foreground',
                )}
                style={{ paddingLeft }}
                title={fullPath}
            >
                {/* Expand/collapse arrow for dirs */}
                <span className="w-3.5 h-3.5 shrink-0 flex items-center justify-center">
                    {type === 'dir' && (
                        loading
                            ? <span className="w-3 h-3 border border-muted-foreground/40 border-t-transparent rounded-full animate-spin inline-block" />
                            : open
                                ? <ChevronDown className="w-3 h-3 text-muted-foreground/60" />
                                : <ChevronRight className="w-3 h-3 text-muted-foreground/40 group-hover:text-muted-foreground/60" />
                    )}
                </span>

                {/* Icon */}
                {type === 'dir'
                    ? open
                        ? <FolderOpen className="w-3.5 h-3.5 shrink-0" style={{ color: '#e8b84b' }} />
                        : <Folder className="w-3.5 h-3.5 shrink-0" style={{ color: '#dcad3d' }} />
                    : <FileIcon ext={ext} size={14} />
                }

                {/* Label */}
                <span className={cn(
                    'truncate text-[12px] leading-none',
                    type === 'dir' && 'font-medium',
                    isSelected && 'font-medium'
                )}>
                    {name}
                </span>
            </button>

            {/* Children */}
            {type === 'dir' && open && children && (
                <div className="relative">
                    {/* VS Code–style indent guide */}
                    <span
                        className="absolute top-0 bottom-1 border-l border-muted/30"
                        style={{ left: paddingLeft + 6 }}
                        aria-hidden
                    />
                    {children.length === 0 ? (
                        <div
                            className="text-[10px] text-muted-foreground/25 italic py-0.5"
                            style={{ paddingLeft: paddingLeft + 22 }}
                        >
                            empty folder
                        </div>
                    ) : (
                        children.map((child, idx) => (
                            <TreeNode
                                key={child.name}
                                name={child.name}
                                type={child.type}
                                ext={child.ext}
                                depth={depth + 1}
                                fullPath={fullPath ? `${fullPath}/${child.name}` : child.name}
                                selectedFile={selectedFile}
                                workspace={workspace}
                                onFileClick={onFileClick}
                                isLast={idx === children.length - 1}
                            />
                        ))
                    )}
                </div>
            )}
        </div>
    );
}

// ─── Explorer Tab ─────────────────────────────────────────────────────────────

function ExplorerTab({ workspace }: { workspace: string }) {
    const [rootEntries, setRootEntries] = useState<FsEntry[] | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [selectedFile, setSelectedFile] = useState<string | null>(null);
    const [fileContent, setFileContent] = useState<string | null>(null);
    const [fileLoading, setFileLoading] = useState(false);
    const [fileError, setFileError] = useState<string | null>(null);
    const [mobileListOpen, setMobileListOpen] = useState(true);

    const loadRoot = useCallback(async () => {
        setLoading(true); setError(null);
        try {
            const data = await listWorkspaceDir(workspace, '');
            setRootEntries(data.entries);
        } catch (e: any) { setError(e.message); }
        finally { setLoading(false); }
    }, [workspace]);

    useEffect(() => { loadRoot(); }, [loadRoot]);

    const handleFileClick = useCallback(async (path: string) => {
        setSelectedFile(path);
        setFileContent(null);
        setFileError(null);
        setFileLoading(true);
        setMobileListOpen(false); // auto-collapse list on mobile when file selected
        try {
            const data = await getWorkspaceFile(workspace, path);
            if (data.error && data.content === null) setFileError(data.error);
            else setFileContent(data.content ?? '');
        } catch (e: any) { setFileError(e.message); }
        finally { setFileLoading(false); }
    }, [workspace]);

    const selectedExt = selectedFile ? selectedFile.split('.').pop() : undefined;

    return (
        <div className="flex-1 flex min-h-0 overflow-hidden relative">
            {/* ── File tree ─────────────────────────────── */}
            <div className={cn(
                'shrink-0 border-r border-border/50 flex flex-col overflow-hidden transition-all duration-200',
                // Desktop: always shown fixed width
                'md:w-[220px] xl:w-[260px] md:translate-x-0 md:relative md:flex',
                // Mobile: slide in/out
                mobileListOpen
                    ? 'w-[200px] flex absolute inset-y-0 left-0 z-10 bg-background'
                    : 'w-0 hidden',
            )}>
                {/* Tree header */}
                <div className="flex items-center justify-between px-3 h-8 border-b border-border/30 shrink-0">
                    <FolderOpen className="w-3.5 h-3.5 text-muted-foreground/40" />
                    <div className="flex items-center gap-1 -mr-2.5 md:mr-0">
                        <button
                            onClick={loadRoot}
                            className="p-1 rounded hover:bg-muted/30 text-muted-foreground/30 hover:text-muted-foreground/70 transition-colors"
                            title="Refresh"
                        >
                            <RefreshCw className="w-3 h-3" />
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

                {/* Tree scroll area */}
                <div className="flex-1 overflow-y-auto py-1 scrollbar-thin">
                    {loading && (
                        <div className="flex flex-col gap-2 px-4 py-4">
                            {[80, 60, 90, 50, 70].map((w, i) => (
                                <div key={i} className="h-3.5 rounded bg-muted/20 animate-pulse" style={{ width: `${w}%` }} />
                            ))}
                        </div>
                    )}
                    {!loading && error && (
                        <div className="m-3 p-2.5 rounded-md bg-red-500/10 border border-red-500/20 text-[11px] text-red-400/80 flex items-start gap-2">
                            <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                            {error}
                        </div>
                    )}
                    {!loading && !error && rootEntries?.length === 0 && (
                        <div className="px-4 py-8 text-center text-[11px] text-muted-foreground/30">
                            Folder is empty
                        </div>
                    )}
                    {!loading && !error && rootEntries?.map(entry => (
                        <TreeNode
                            key={entry.name}
                            name={entry.name}
                            type={entry.type}
                            ext={entry.ext}
                            depth={0}
                            fullPath={entry.name}
                            selectedFile={selectedFile}
                            workspace={workspace}
                            onFileClick={handleFileClick}
                        />
                    ))}
                </div>
            </div>

            {/* ── File viewer ───────────────────────────── */}
            <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
                {selectedFile ? (
                    <>
                        {/* Tab style file title bar */}
                        <div className="flex items-center gap-0 h-8 border-b border-border/30 bg-muted/5 shrink-0 overflow-x-auto">
                            {/* Mobile: button to toggle file tree */}
                            <button
                                onClick={() => setMobileListOpen(v => !v)}
                                className="md:hidden flex items-center px-3 py-2.5 text-muted-foreground/40 hover:text-muted-foreground/70 transition-colors border-r border-border/30 shrink-0"
                                title="Toggle file tree"
                            >
                                <ChevronRight className={cn('w-4 h-4 transition-transform', mobileListOpen && 'rotate-180')} />
                            </button>
                            <div className="flex items-center gap-1.5 px-3 py-2 border-b-2 border-primary bg-background text-foreground min-w-0 max-w-[300px]">
                                <FileIcon ext={selectedExt} size={13} />
                                <span className="text-xs font-medium truncate">{basename(selectedFile)}</span>
                            </div>
                        </div>

                        {/* Breadcrumb */}
                        {dirname(selectedFile) && (
                            <div className="px-3 py-1 border-b border-border/20 bg-muted/[0.03] shrink-0">
                                <span className="text-[10px] text-muted-foreground/30 font-mono">
                                    {dirname(selectedFile)}/
                                </span>
                            </div>
                        )}

                        {/* Content */}
                        <div className="flex-1 min-h-0 overflow-hidden">
                            {fileLoading ? (
                                <div className="flex flex-col gap-2 p-4">
                                    {[90, 70, 85, 60, 80, 50, 75].map((w, i) => (
                                        <div key={i} className="h-3 rounded bg-muted/20 animate-pulse" style={{ width: `${w}%` }} />
                                    ))}
                                </div>
                            ) : fileError ? (
                                <div className="m-4 p-3 rounded-md bg-red-500/10 border border-red-500/20 text-[11px] text-red-400/80 flex items-start gap-2">
                                    <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                                    {fileError}
                                </div>
                            ) : fileContent !== null ? (
                                fileContent === '' ? (
                                    <div className="flex items-center justify-center h-full text-muted-foreground/25 text-xs italic">
                                        (empty file)
                                    </div>
                                ) : (
                                    <CodeViewer content={fileContent} ext={selectedExt} />
                                )
                            ) : null}
                        </div>
                    </>
                ) : (
                    <div className="flex-1 flex flex-col items-center justify-center gap-3 text-muted-foreground/20">
                        {/* Mobile: button to reopen file tree when closed */}
                        {!mobileListOpen && (
                            <button
                                onClick={() => setMobileListOpen(true)}
                                className="md:hidden mb-2 px-3 py-1.5 rounded-md bg-muted/20 text-muted-foreground/50 text-xs hover:bg-muted/40 transition-colors"
                            >
                                Open file tree
                            </button>
                        )}
                        <FileText className="w-10 h-10" />
                        <p className="text-xs">Click a file to view its contents</p>
                    </div>
                )}
            </div>
        </div>
    );
}

// ─── Build DiffFile instance from raw data ───────────────────────────────────────

function buildDiffFile(
    fileName: string,
    oldContent: string,
    newContent: string,
    rawDiff: string,
): DiffFile {
    const lang = getLang(fileName);
    // Pass the full raw diff as a single element — DiffFile parses it internally
    const file = new DiffFile(
        fileName, oldContent,
        fileName, newContent,
        [rawDiff],
        lang, lang,
    );
    file.initTheme('dark');
    file.init();
    file.buildUnifiedDiffLines();
    return file;
}

// ─── Source Control Tab ───────────────────────────────────────────────────────

interface DiffData {
    diffFile: DiffFile | null;
    oldContent: string;
    newContent: string;
    hasDiff: boolean;
    rawDiff: string;
}

function SourceControlTab({ workspace }: { workspace: string }) {
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
            {/* ── Changed files list ─────────────────────── */}
            {/* On mobile: overlay/toggle; On desktop: always visible sidebar */}
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
                        <div className="m-3 p-2.5 rounded-md bg-amber-500/10 border border-amber-500/20 text-[11px] text-amber-400/80 flex items-start gap-2">
                            <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                            {error}
                        </div>
                    )}
                    {!loading && !error && files.length === 0 && (
                        <div className="flex flex-col items-center gap-2 py-10 text-muted-foreground/20">
                            <GitBranch className="w-7 h-7" />
                            <p className="text-[11px]">Working tree clean</p>
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
                                <span className="truncate font-mono text-[11px] text-foreground/80 leading-none mb-0.5">
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

            {/* ── Diff/content area ─────────────────────── */}
            <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
                {selectedFile ? (
                    <>
                        {/* View mode tabs */}
                        <div className="flex items-center border-b border-border/30 bg-muted/5 shrink-0">
                            {/* Mobile: button to reopen file list */}
                            <button
                                onClick={() => setMobileListOpen(v => !v)}
                                className="md:hidden flex items-center px-3 py-2.5 text-muted-foreground/40 hover:text-muted-foreground/70 transition-colors border-r border-border/30 shrink-0"
                                title="Toggle file list"
                            >
                                <ChevronRight className={cn('w-4 h-4 transition-transform', mobileListOpen && 'rotate-180')} />
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

                        <div className="flex-1 min-h-0 overflow-auto">
                            {diffLoading ? (
                                <SkeletonLines />
                            ) : diffError ? (
                                <div className="m-4 p-3 rounded-md bg-red-500/10 border border-red-500/20 text-xs text-red-400/80">{diffError}</div>
                            ) : diffData ? (
                                viewMode === 'diff' ? (
                                    diffData.hasDiff === false || !diffData.diffFile ? (
                                        <div className="flex flex-col items-center justify-center h-full gap-3 text-muted-foreground/30">
                                            <GitBranch className="w-8 h-8" />
                                            <p className="text-xs">No changes (untracked file or empty diff)</p>
                                        </div>
                                    ) : (
                                        <div className="flex flex-col h-full">
                                            <div className="flex-1 overflow-auto">
                                                {(diffData.diffFile?.unifiedLineLength ?? 0) > 0 ? (
                                                    <DiffView
                                                        diffFile={diffData.diffFile!}
                                                        diffViewMode={DiffModeEnum.Unified}
                                                        diffViewTheme="dark"
                                                        diffViewHighlight
                                                        diffViewFontSize={12}
                                                    />
                                                ) : (
                                                    <pre className="p-4 text-[10px] font-mono text-foreground/60 whitespace-pre overflow-x-auto leading-relaxed">
                                                        {diffData.rawDiff}
                                                    </pre>
                                                )}
                                            </div>
                                        </div>
                                    )
                                ) : viewMode === 'original' ? (
                                    <CodeViewer content={diffData.oldContent} ext={selectedFile.split('.').pop()} />
                                ) : (
                                    <CodeViewer content={diffData.newContent} ext={selectedFile.split('.').pop()} />
                                )
                            ) : null}
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

// ─── Skeleton loader ──────────────────────────────────────────────────────────

function SkeletonLines() {
    return (
        <div className="flex flex-col gap-2 p-4">
            {[80, 60, 90, 40, 70, 55, 85, 65].map((w, i) => (
                <div key={i} className="h-3 rounded bg-muted/20 animate-pulse" style={{ width: `${w}%` }} />
            ))}
        </div>
    );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

type TabId = 'explorer' | 'source-control';

export const SourceControlView = memo(function SourceControlView({
    workspace, onClose,
}: SourceControlViewProps) {
    const [activeTab, setActiveTab] = useState<TabId>('explorer');

    return (
        <div className="h-full flex flex-col overflow-hidden bg-background">
            {/* ── Header ────────────────────────────────────────── */}
            <div className="flex items-center gap-1 px-2 pt-1.5 pb-0 border-b border-border/40 bg-background/95 backdrop-blur shrink-0">
                {/* Tab buttons */}
                <button
                    onClick={() => setActiveTab('explorer')}
                    className={cn(
                        'flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-t-md border-b-2 transition-all -mb-px',
                        activeTab === 'explorer'
                            ? 'text-foreground border-primary bg-background'
                            : 'text-muted-foreground/50 border-transparent hover:text-muted-foreground hover:bg-muted/20'
                    )}
                >
                    <FolderOpen className="w-3.5 h-3.5" />
                    <span>Explorer</span>
                </button>

                <button
                    onClick={() => setActiveTab('source-control')}
                    className={cn(
                        'flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-t-md border-b-2 transition-all -mb-px',
                        activeTab === 'source-control'
                            ? 'text-foreground border-primary bg-background'
                            : 'text-muted-foreground/50 border-transparent hover:text-muted-foreground hover:bg-muted/20'
                    )}
                >
                    <GitBranch className="w-3.5 h-3.5" />
                    <span>Source Control</span>
                </button>

                <span className="flex-1" />

                {workspace && (
                    <span className="text-[10px] text-muted-foreground/30 truncate max-w-[140px] hidden md:inline pr-1">
                        {workspace}
                    </span>
                )}

                {onClose && (
                    <button
                        onClick={onClose}
                        className="p-1.5 rounded hover:bg-muted/50 text-muted-foreground/30 hover:text-muted-foreground transition-colors"
                        title="Close"
                    >
                        <X className="w-3.5 h-3.5" />
                    </button>
                )}
            </div>

            {/* ── Body ─────────────────────────────────────────────  */}
            {activeTab === 'explorer'
                ? <ExplorerTab key={workspace} workspace={workspace} />
                : <SourceControlTab key={workspace} workspace={workspace} />
            }
        </div>
    );
});
SourceControlView.displayName = 'SourceControlView';

// ─── Shared: read current file ────────────────────────────────────────────────

function CurrentFileView({ workspace, filePath }: { workspace: string; filePath: string }) {
    const [content, setContent] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        setLoading(true); setError(null); setContent(null);
        getWorkspaceFile(workspace, filePath)
            .then(data => {
                if (data.error && data.content === null) setError(data.error);
                else setContent(data.content ?? '');
            })
            .catch(e => setError(e.message))
            .finally(() => setLoading(false));
    }, [workspace, filePath]);

    if (loading) return <SkeletonLines />;
    if (error) return (
        <div className="m-4 p-3 rounded-md bg-red-500/10 border border-red-500/20 text-[11px] text-red-400/80 flex items-start gap-2">
            <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" /> {error}
        </div>
    );
    if (content === null || content === '') return (
        <div className="flex items-center justify-center h-full text-muted-foreground/25 text-xs italic">(empty file)</div>
    );

    return <CodeViewer content={content} ext={filePath.split('.').pop()} />;
}
