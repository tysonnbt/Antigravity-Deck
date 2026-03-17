'use client';
import { useState, useEffect, useCallback } from 'react';
import { cn } from '@/lib/utils';
import {
    getWorkspaceFile, listWorkspaceDir, FsEntry,
} from '@/lib/cascade-api';
import dynamic from 'next/dynamic';
import {
    RefreshCw, X, Folder, FolderOpen,
    ChevronRight, ChevronDown, File,
    AlertCircle, Copy, Check, FileText, Menu, ArrowLeft,
} from 'lucide-react';
import { EXT_CONFIG, extToLang, basename, dirname, SKELETON_WIDTHS } from './shared';
import { vscDarkPlus } from 'react-syntax-highlighter/dist/esm/styles/prism';

const SyntaxHighlighter = dynamic(
    () => import('react-syntax-highlighter').then(m => ({ default: m.Prism })),
    { ssr: false }
);

// ─── FileIcon ─────────────────────────────────────────────────────────────────

export function FileIcon({ ext, size = 14 }: { ext?: string; size?: number }) {
    const cfg = ext ? EXT_CONFIG[ext] : null;
    const Icon = cfg?.icon ?? File;
    const color = cfg?.color ?? '#94a3b8';
    return <Icon style={{ color, width: size, height: size, flexShrink: 0 }} />;
}

// ─── Copy button ──────────────────────────────────────────────────────────────

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
            {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
            <span>{copied ? 'Copied!' : 'Copy'}</span>
        </button>
    );
}

// ─── Syntax-highlighted code viewer ───────────────────────────────────────────

export function CodeViewer({ content, ext }: { content: string; ext?: string }) {
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

// ─── Skeleton loader ──────────────────────────────────────────────────────────

export function SkeletonLines() {
    return (
        <div className="flex flex-col gap-2 p-4">
            {SKELETON_WIDTHS.map((w, i) => (
                <div key={i} className="h-3 rounded bg-muted/20 animate-pulse" style={{ width: `${w}%` }} />
            ))}
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
                    {/* VS Code-style indent guide */}
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

export function ExplorerTab({ workspace }: { workspace: string }) {
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
            {/* File tree */}
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
                        <div className="m-3 p-2.5 rounded-md bg-red-500/10 border border-red-500/20 text-xs text-red-400/80 flex items-start gap-2">
                            <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
                            {error}
                        </div>
                    )}
                    {!loading && !error && rootEntries?.length === 0 && (
                        <div className="px-4 py-8 text-center text-xs text-muted-foreground/30">
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

            {/* File viewer */}
            <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
                {selectedFile ? (
                    <>
                        {/* Tab style file title bar */}
                        <div className="flex items-center gap-0 h-8 border-b border-border/30 bg-muted/5 shrink-0 overflow-x-auto">
                            {/* Mobile: button to toggle file tree */}
                            <button
                                onClick={() => setMobileListOpen(v => !v)}
                                className="md:hidden flex items-center gap-1 px-2.5 py-2.5 text-muted-foreground/60 hover:text-muted-foreground hover:bg-muted/30 transition-colors border-r border-border/30 shrink-0"
                                title="Toggle file tree"
                            >
                                <ArrowLeft className="w-4 h-4" />
                                <span className="text-[10px] font-medium">Files</span>
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
                        <div className="flex-1 min-h-0 overflow-hidden relative">
                            {fileLoading ? (
                                <div className="flex flex-col gap-2 p-4">
                                    {[90, 70, 85, 60, 80, 50, 75].map((w, i) => (
                                        <div key={i} className="h-3 rounded bg-muted/20 animate-pulse" style={{ width: `${w}%` }} />
                                    ))}
                                </div>
                            ) : fileError ? (
                                <div className="m-4 p-3 rounded-md bg-red-500/10 border border-red-500/20 text-xs text-red-400/80 flex items-start gap-2">
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

// ─── Current File View (shared utility) ──────────────────────────────────────

export function CurrentFileView({ workspace, filePath }: { workspace: string; filePath: string }) {
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
        <div className="m-4 p-3 rounded-md bg-red-500/10 border border-red-500/20 text-xs text-red-400/80 flex items-start gap-2">
            <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" /> {error}
        </div>
    );
    if (content === null || content === '') return (
        <div className="flex items-center justify-center h-full text-muted-foreground/25 text-xs italic">(empty file)</div>
    );

    return <CodeViewer content={content} ext={filePath.split('.').pop()} />;
}
