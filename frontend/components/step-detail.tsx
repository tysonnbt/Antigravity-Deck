'use client';

import { Step } from '@/lib/types';
import { extractStepContent, getStepConfig } from '@/lib/step-utils';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { MarkdownRenderer } from '@/components/markdown-renderer';
import { useState, useMemo } from 'react';
import { Star, Copy, Check } from 'lucide-react';
import { StepIcon } from './ui/step-icon';
import { cn } from '@/lib/utils';

interface StepDetailProps {
    step: Step | null;
    index: number;
    open: boolean;
    onClose: () => void;
    onNavigate: (direction: 'prev' | 'next') => void;
    totalSteps: number;
    isBookmarked: boolean;
    onToggleBookmark: () => void;
}

export function StepDetail({ step, index, open, onClose, onNavigate, totalSteps, isBookmarked, onToggleBookmark }: StepDetailProps) {
    const [copied, setCopied] = useState(false);

    const config = useMemo(() => step ? getStepConfig(step.type) : null, [step]);
    const content = useMemo(() => step ? extractStepContent(step) || '' : '', [step]);

    const metadata = useMemo(() => {
        if (!step?.metadata) return {};
        const m = step.metadata;
        const result: Record<string, string> = {};
        if (m.name) result['Tool'] = m.name;
        if (m.createdAt) result['Created'] = new Date(m.createdAt).toLocaleString();
        if (m.generatorModel) result['Model'] = m.generatorModel;
        if (m.toolCallOutputTokens) result['Output Tokens'] = String(m.toolCallOutputTokens);
        if (m.requestedModel?.model) result['Requested Model'] = m.requestedModel.model;
        return result;
    }, [step]);

    const rawArgs = useMemo(() => {
        if (!step?.metadata?.argumentsJson) return null;
        try { return JSON.stringify(JSON.parse(step.metadata.argumentsJson), null, 2); }
        catch { return step.metadata.argumentsJson; }
    }, [step]);

    const rawResult = useMemo(() => {
        if (!step?.metadata?.resultJson) return null;
        try { return JSON.stringify(JSON.parse(step.metadata.resultJson), null, 2); }
        catch { return step.metadata.resultJson; }
    }, [step]);

    const handleCopy = async () => {
        await navigator.clipboard.writeText(content);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
    };

    if (!step || !config) return null;

    return (
        <Sheet open={open} onOpenChange={() => onClose()}>
            <SheetContent className="w-full sm:w-[600px] sm:max-w-[600px] overflow-y-auto">
                <SheetHeader>
                    <SheetTitle className="flex items-center gap-2">
                        <StepIcon name={config.icon} />
                        <span>{config.label}</span>
                        <Badge variant="outline" className="font-mono text-[10px]">#{index + 1}</Badge>
                        <Badge variant={String(step.status ?? '').includes('ERROR') ? 'destructive' : 'secondary'} className="text-[10px]">
                            {String(step.status ?? '').replace('CORTEX_STEP_STATUS_', '')}
                        </Badge>
                    </SheetTitle>
                </SheetHeader>

                {/* Navigation + Actions */}
                <div className="flex items-center justify-between mt-4 mb-3">
                    <div className="flex items-center gap-1">
                        <Button variant="outline" size="sm" onClick={() => onNavigate('prev')} disabled={index === 0}>← Prev</Button>
                        <Button variant="outline" size="sm" onClick={() => onNavigate('next')} disabled={index >= totalSteps - 1}>Next →</Button>
                        <span className="text-xs text-muted-foreground ml-2">{index + 1} / {totalSteps}</span>
                    </div>
                    <div className="flex items-center gap-1">
                        <Button variant="ghost" size="sm" onClick={onToggleBookmark}><Star className={cn("h-4 w-4", isBookmarked ? "fill-yellow-500 text-yellow-500" : "text-muted-foreground")} /></Button>
                        <Button variant="ghost" size="sm" onClick={handleCopy}>{copied ? <><Check className="h-3 w-3 mr-1 inline" />Copied</> : <><Copy className="h-3 w-3 mr-1 inline" />Copy</>}</Button>
                    </div>
                </div>

                <Separator className="mb-3" />

                {/* Tabs */}
                <Tabs defaultValue="content">
                    <TabsList className="w-full">
                        <TabsTrigger value="content" className="flex-1">Content</TabsTrigger>
                        <TabsTrigger value="metadata" className="flex-1">Metadata</TabsTrigger>
                        {rawArgs && <TabsTrigger value="args" className="flex-1">Arguments</TabsTrigger>}
                        {rawResult && <TabsTrigger value="result" className="flex-1">Result</TabsTrigger>}
                    </TabsList>

                    <TabsContent value="content" className="mt-3">
                        <MarkdownRenderer content={content} className="prose prose-invert prose-sm max-w-none" />
                    </TabsContent>

                    <TabsContent value="metadata" className="mt-3">
                        <div className="space-y-2">
                            <div className="grid grid-cols-2 gap-2">
                                <div className="text-xs text-muted-foreground">Type</div>
                                <div className="text-xs font-mono">{step.type?.replace('CORTEX_STEP_TYPE_', '')}</div>
                                {Object.entries(metadata).map(([key, val]) => (
                                    <div key={key} className="contents">
                                        <div className="text-xs text-muted-foreground">{key}</div>
                                        <div className="text-xs font-mono break-all">{val}</div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </TabsContent>

                    {rawArgs && (
                        <TabsContent value="args" className="mt-3">
                            <pre className="text-xs font-mono bg-black/30 rounded-lg p-3 overflow-auto max-h-96 border border-border whitespace-pre-wrap break-all">
                                {rawArgs}
                            </pre>
                        </TabsContent>
                    )}

                    {rawResult && (
                        <TabsContent value="result" className="mt-3">
                            <pre className="text-xs font-mono bg-black/30 rounded-lg p-3 overflow-auto max-h-96 border border-border whitespace-pre-wrap break-all">
                                {rawResult.substring(0, 5000)}{rawResult.length > 5000 ? '\n... (truncated)' : ''}
                            </pre>
                        </TabsContent>
                    )}
                </Tabs>
            </SheetContent>
        </Sheet>
    );
}
