'use client';
import { memo, useMemo, useState, useEffect, useCallback } from 'react';
import { Step } from '@/lib/types';
import { extractStepContent } from '@/lib/step-utils';
import { MarkdownRenderer } from '../markdown-renderer';
import { useCopy } from './chat-helpers';
import { RawJsonViewer } from './raw-json-viewer';
import { Sheet, SheetTrigger, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Button } from '@/components/ui/button';
import { Copy, Check, FileText, Bot, AlertTriangle } from 'lucide-react';
import { API_BASE } from '@/lib/config';
import { authHeaders } from '@/lib/auth';

// View an MD artifact file in a Sheet (side panel)
function ArtifactPreview({ uri }: { uri: string }) {
    const [content, setContent] = useState<string | null>(null);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const fileName = uri.split('/').pop() || 'file';

    const loadFile = useCallback(() => {
        if (content || loading) return; // already loaded or loading
        setLoading(true);
        setError(null);
        fetch(`${API_BASE}/api/file/read`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...authHeaders() },
            body: JSON.stringify({ path: uri })
        })
            .then(r => {
                if (!r.ok) throw new Error(`HTTP ${r.status}`);
                return r.json();
            })
            .then(d => {
                if (d.content) { setContent(d.content); }
                else { setError('Empty file'); }
                setLoading(false);
            })
            .catch(e => { setError(e.message); setLoading(false); });
    }, [uri, content, loading]);

    return (
        <Sheet>
            <SheetTrigger asChild>
                <Button
                    variant="ghost"
                    onClick={loadFile}
                    className="mt-2 w-full justify-start gap-2 px-3 py-2.5 h-auto text-xs font-medium text-purple-300 border border-purple-500/20 bg-purple-950/15 hover:bg-purple-500/10 hover:border-purple-500/30 hover:text-purple-300 rounded-lg"
                >
                    <FileText className="h-4 w-4 shrink-0" />
                    <span className="flex-1 text-left truncate">{fileName}</span>
                    <span className="text-[10px] text-muted-foreground/50">Click to view →</span>
                </Button>
            </SheetTrigger>
            <SheetContent side="right" className="w-full sm:w-[600px] sm:max-w-[600px] p-0 flex flex-col overflow-hidden">
                <SheetHeader className="px-5 pt-5 pb-3 border-b border-border/50 shrink-0">
                    <SheetTitle className="flex items-center gap-2 text-sm">
                        <FileText className="h-4 w-4" />
                        <span>{fileName}</span>
                    </SheetTitle>
                    <SheetDescription className="text-xs text-muted-foreground/70 truncate">
                        {(() => { try { const p = decodeURIComponent(new URL(uri).pathname); return /^\/[a-zA-Z]:/.test(p) ? p.substring(1) : p; } catch { return uri.replace('file:///', ''); } })()}
                    </SheetDescription>
                </SheetHeader>
                <ScrollArea className="flex-1 min-h-0">
                    <div className="p-5 text-sm leading-relaxed overflow-x-auto max-w-full">
                        {loading && (
                            <div className="text-muted-foreground animate-pulse">Loading file content...</div>
                        )}
                        {error && (
                            <div className="text-yellow-400/80 text-xs">
                                <AlertTriangle className="h-3 w-3 inline mr-1" /> Could not load file: {error}
                                <br /><span className="text-muted-foreground/50 text-[10px] mt-1 block">Path: {uri}</span>
                            </div>
                        )}
                        {content && <MarkdownRenderer content={content} />}
                    </div>
                </ScrollArea>
            </SheetContent>
        </Sheet>
    );
}

export const AgentResponse = memo(function AgentResponse({ step, index }: { step: Step; index: number }) {
    const { copied, copy } = useCopy();
    const content = useMemo(() => extractStepContent(step) || '', [step]);

    // Extract review file URIs from NOTIFY_USER steps
    // Binary protobuf puts paths in field "1" instead of reviewAbsoluteUris
    const reviewUris = useMemo(() => {
        const nu = step.notifyUser as Record<string, unknown> | undefined;
        if (!nu) return [];
        let uris: string[] = [];
        if (Array.isArray(nu.reviewAbsoluteUris)) {
            uris = nu.reviewAbsoluteUris;
        } else if (nu['1']) {
            // Binary protobuf numeric field fallback
            uris = Array.isArray(nu['1']) ? nu['1'] : [nu['1'] as string];
        }
        return uris.filter(u => typeof u === 'string' && u.startsWith('file:///'));
    }, [step]);

    return (
        <div className="flex justify-start mb-4">
            <div className="max-w-[85%] group relative rounded-lg rounded-bl-md px-4 py-3 bg-gradient-to-r from-purple-950/20 to-transparent border border-purple-500/10 overflow-hidden min-w-0">
                <div className="flex items-center gap-2 mb-1.5">
                    <div className="w-5 h-5 rounded-full bg-purple-500/20 flex items-center justify-center text-[10px]"><Bot className="h-2.5 w-2.5 text-purple-400" /></div>
                    <span className="text-[10px] font-bold text-purple-400 uppercase tracking-widest">Agent</span>
                    <span className="text-[10px] text-muted-foreground/40 opacity-0 group-hover:opacity-100">#{index + 1}</span>
                </div>
                <div className="text-sm leading-relaxed"><MarkdownRenderer content={content} /></div>

                {/* Attached MD files — open in Sheet */}
                {reviewUris.length > 0 && (
                    <div className="space-y-1.5 mt-2">
                        {reviewUris.map((uri, i) => (
                            <ArtifactPreview key={i} uri={uri} />
                        ))}
                    </div>
                )}

                <div className="absolute top-2 right-2 flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                    <RawJsonViewer step={step} />
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-5 w-5 text-muted-foreground/50 hover:text-foreground"
                        onClick={(e) => copy(content, e)}
                    >
                        {copied ? <Check className="h-3 w-3" /> : <Copy className="h-3 w-3" />}
                    </Button>
                </div>
            </div>
        </div>
    );
});
AgentResponse.displayName = 'AgentResponse';
