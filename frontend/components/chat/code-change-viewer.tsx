'use client';
import { useState, useCallback, memo } from 'react';
import { cn } from '@/lib/utils';
import { readFile } from '@/lib/cascade-api';
import { Button } from '@/components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { ChevronRight, Check, X, AlertTriangle } from 'lucide-react';

interface DiffLine {
    text?: string;
    type?: string;
}

interface CodeAckInfo {
    uriPath?: string;
    stepIndices?: number[];
    diff?: { lines?: DiffLine[] };
}

interface CodeChangeViewerProps {
    infos: CodeAckInfo[];
    isAccept?: boolean;
}

// Detect language from file extension for basic display
function getLang(path: string): string {
    const ext = path.split('.').pop()?.toLowerCase() || '';
    const map: Record<string, string> = {
        ts: 'TypeScript', tsx: 'TypeScript', js: 'JavaScript', jsx: 'JavaScript',
        py: 'Python', rs: 'Rust', go: 'Go', css: 'CSS', html: 'HTML',
        json: 'JSON', md: 'Markdown', yml: 'YAML', yaml: 'YAML',
        sh: 'Shell', bash: 'Shell', sql: 'SQL', java: 'Java',
    };
    return map[ext] || ext.toUpperCase();
}

function basename(path: string): string {
    return path.split(/[/\\]/).pop() || path;
}

function isAdded(type?: string): boolean {
    return !!type && (type.includes('ADDED') || type === '1');
}

function isRemoved(type?: string): boolean {
    return !!type && (type.includes('REMOVED') || type === '2');
}

// Single file diff/full-file card
const FileChangeCard = memo(function FileChangeCard({ info, isAccept }: { info: CodeAckInfo; isAccept?: boolean }) {
    const [expanded, setExpanded] = useState(false);
    const [tab, setTab] = useState<'diff' | 'file'>('diff');
    const [fileContent, setFileContent] = useState<string | null>(null);
    const [fileLoading, setFileLoading] = useState(false);
    const [fileError, setFileError] = useState<string | null>(null);

    const lines = info.diff?.lines || [];
    const added = lines.filter(l => isAdded(l.type)).length;
    const removed = lines.filter(l => isRemoved(l.type)).length;
    const filePath = info.uriPath || '';
    const name = basename(filePath);
    const lang = getLang(filePath);

    const loadFullFile = useCallback(async () => {
        if (fileContent !== null || fileLoading) return;
        setFileLoading(true);
        setFileError(null);
        try {
            const data = await readFile(filePath);
            setFileContent(data.content);
        } catch (e: any) {
            setFileError(e.message || 'Failed to load file');
        } finally {
            setFileLoading(false);
        }
    }, [filePath, fileContent, fileLoading]);

    const handleTabSwitch = useCallback((t: 'diff' | 'file') => {
        setTab(t);
        if (t === 'file') loadFullFile();
    }, [loadFullFile]);

    return (
        <div className="rounded-lg border border-border/50 overflow-hidden bg-background/50">
            {/* File header */}
            <Button
                variant="ghost"
                onClick={() => setExpanded(!expanded)}
                className={cn(
                    'w-full h-auto justify-start gap-2 px-3 py-2 text-xs rounded-none hover:bg-muted/30',
                    expanded && 'bg-muted/20'
                )}
            >
                <ChevronRight className={cn('h-3 w-3 text-muted-foreground shrink-0 transition-transform', expanded && 'rotate-90')} />
                <span>{isAccept !== false ? <Check className="h-3.5 w-3.5 text-green-500" /> : <X className="h-3.5 w-3.5 text-red-500" />}</span>
                <span className="font-mono font-semibold text-foreground/80 truncate">{name}</span>
                <span className="text-[10px] text-muted-foreground/50 font-mono truncate hidden sm:inline">{lang}</span>
                <span className="flex-1" />
                {added > 0 && <span className="text-green-400 font-mono text-[10px]">+{added}</span>}
                {removed > 0 && <span className="text-red-400 font-mono text-[10px]">-{removed}</span>}
            </Button>

            {expanded && (
                <div className="border-t border-border/30">
                    <Tabs value={tab} onValueChange={(v) => handleTabSwitch(v as 'diff' | 'file')}>
                        <div className="flex items-center">
                            <TabsList className="h-8 rounded-none bg-muted/10 border-b border-border/20 w-auto">
                                <TabsTrigger value="diff" className="text-[11px] h-full rounded-none">Diff</TabsTrigger>
                                <TabsTrigger value="file" className="text-[11px] h-full rounded-none">Full File</TabsTrigger>
                            </TabsList>
                            <span className="flex-1" />
                            <span className="text-[10px] text-muted-foreground/40 pr-3 font-mono truncate max-w-[200px]" title={filePath}>{filePath}</span>
                        </div>
                        <TabsContent value="diff" className="mt-0">
                            <DiffView lines={lines} />
                        </TabsContent>
                        <TabsContent value="file" className="mt-0">
                            <FullFileView content={fileContent} loading={fileLoading} error={fileError} />
                        </TabsContent>
                    </Tabs>
                </div>
            )}
        </div>
    );
});

// Diff view
function DiffView({ lines }: { lines: DiffLine[] }) {
    if (lines.length === 0) {
        return <div className="px-4 py-3 text-xs text-muted-foreground/60 italic">No diff data available</div>;
    }

    let oldLine = 0;
    let newLine = 0;

    return (
        <div className="overflow-x-auto max-h-[400px] overflow-y-auto scrollbar-thin">
            <table className="w-full text-[11px] font-mono leading-[1.6]">
                <tbody>
                    {lines.map((line, i) => {
                        const add = isAdded(line.type);
                        const rem = isRemoved(line.type);

                        if (!rem) newLine++;
                        if (!add) oldLine++;

                        return (
                            <tr key={i} className={cn(
                                add && 'bg-green-500/10',
                                rem && 'bg-red-500/10',
                            )}>
                                <td className="select-none text-right pr-1 pl-2 text-muted-foreground/30 w-[1%] whitespace-nowrap">
                                    {!add ? oldLine : ''}
                                </td>
                                <td className="select-none text-right pr-2 text-muted-foreground/30 w-[1%] whitespace-nowrap">
                                    {!rem ? newLine : ''}
                                </td>
                                <td className={cn(
                                    'select-none w-4 text-center',
                                    add && 'text-green-400',
                                    rem && 'text-red-400',
                                )}>
                                    {add ? '+' : rem ? '-' : ' '}
                                </td>
                                <td className="whitespace-pre pr-4">
                                    <span className={cn(
                                        add && 'text-green-300/90',
                                        rem && 'text-red-300/90 line-through opacity-70',
                                        !add && !rem && 'text-foreground/60',
                                    )}>
                                        {line.text ?? ''}
                                    </span>
                                </td>
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
}

// Full file view
function FullFileView({ content, loading, error }: { content: string | null; loading: boolean; error: string | null }) {
    if (loading) {
        return (
            <div className="p-4 space-y-2">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-4 w-5/6" />
            </div>
        );
    }

    if (error) {
        return (
            <div className="px-4 py-3 text-xs text-red-400/80">
                <AlertTriangle className="h-3 w-3 inline mr-1" />{error}
            </div>
        );
    }

    if (content === null) {
        return <div className="px-4 py-3 text-xs text-muted-foreground/60 italic">Click to load file content</div>;
    }

    const lines = content.split('\n');

    return (
        <div className="overflow-x-auto max-h-[400px] overflow-y-auto scrollbar-thin">
            <table className="w-full text-[11px] font-mono leading-[1.6]">
                <tbody>
                    {lines.map((line, i) => (
                        <tr key={i} className="hover:bg-muted/20">
                            <td className="select-none text-right pr-3 pl-2 text-muted-foreground/30 w-[1%] whitespace-nowrap">
                                {i + 1}
                            </td>
                            <td className="whitespace-pre pr-4 text-foreground/70">
                                {line}
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    );
}

// Main export: renders all file changes
export const CodeChangeViewer = memo(function CodeChangeViewer({ infos, isAccept }: CodeChangeViewerProps) {
    if (!infos || infos.length === 0) return null;

    return (
        <div className="space-y-2 my-2">
            {infos.map((info, i) => (
                <FileChangeCard key={info.uriPath || i} info={info} isAccept={isAccept} />
            ))}
        </div>
    );
});
CodeChangeViewer.displayName = 'CodeChangeViewer';
