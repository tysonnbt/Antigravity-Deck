'use client';
import { memo, useState, useEffect } from 'react';
import { Step } from '@/lib/types';
import { Badge } from '@/components/ui/badge';
import { ImagePlus, Download, Maximize2, X, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { API_BASE } from '@/lib/config';
import { authHeaders } from '@/lib/auth';

interface GeneratedImageStepProps {
    step: Step;
    originalIndex: number;
}

export const GeneratedImageStep = memo(function GeneratedImageStep({ step, originalIndex }: GeneratedImageStepProps) {
    const [expanded, setExpanded] = useState(false);
    const [imageError, setImageError] = useState(false);
    const [imageSrc, setImageSrc] = useState<string>('');
    const [loading, setLoading] = useState(false);

    const gi = step.generateImage || {};
    const imageName = gi.imageName || 'Generated Image';
    const prompt = gi.prompt || '';
    const modelName = gi.modelName || '';
    const uri = gi.generatedMedia?.uri || '';

    // Fetch image via POST — keeps file:// URI out of the URL so Cloudflare WAF won't block it
    useEffect(() => {
        if (!uri) return;
        let cancelled = false;
        setLoading(true);
        setImageError(false);
        setImageSrc('');
        fetch(`${API_BASE}/api/file/serve`, {
            method: 'POST',
            headers: { ...authHeaders(), 'Content-Type': 'application/json' },
            body: JSON.stringify({ path: uri }),
        })
            .then(r => r.ok ? r.json() : Promise.reject(r.status))
            .then(({ data, mimeType }) => {
                if (!cancelled) setImageSrc(`data:${mimeType};base64,${data}`);
            })
            .catch(() => { if (!cancelled) setImageError(true); })
            .finally(() => { if (!cancelled) setLoading(false); });
        return () => { cancelled = true; };
    }, [uri]);

    const handleDownload = () => {
        if (!imageSrc) return;
        const a = document.createElement('a');
        a.href = imageSrc;
        a.download = `${imageName}.png`;
        a.click();
    };

    return (
        <>
            <div className="mb-3 mx-4">
                <div className="rounded-xl border border-border/50 bg-gradient-to-br from-purple-500/5 via-background to-pink-500/5 overflow-hidden">
                    {/* Header */}
                    <div className="flex items-center gap-2 px-4 py-2.5 border-b border-border/30">
                        <ImagePlus className="h-4 w-4 text-purple-400" />
                        <span className="text-sm font-medium text-foreground/90">{imageName}</span>
                        <Badge variant="outline" className="text-[9px] font-mono text-muted-foreground/60 ml-auto">
                            #{originalIndex + 1}
                        </Badge>
                        {modelName && (
                            <Badge variant="secondary" className="text-[9px]">
                                {modelName}
                            </Badge>
                        )}
                    </div>

                    {/* Image */}
                    {loading ? (
                        <div className="flex items-center justify-center py-12 text-muted-foreground/60 text-sm gap-2">
                            <Loader2 className="h-5 w-5 animate-spin opacity-50" />
                            <span>Loading image…</span>
                        </div>
                    ) : imageSrc && !imageError ? (
                        <div className="relative group">
                            <img
                                src={imageSrc}
                                alt={prompt || imageName}
                                className="w-full max-h-[500px] object-contain bg-black/20 cursor-pointer"
                                onClick={() => setExpanded(true)}
                                onError={() => setImageError(true)}
                            />
                            {/* Overlay actions */}
                            <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                <Button
                                    variant="secondary"
                                    size="icon"
                                    className="h-8 w-8 bg-background/80 backdrop-blur-sm shadow-lg"
                                    onClick={() => setExpanded(true)}
                                    title="Expand"
                                >
                                    <Maximize2 className="h-3.5 w-3.5" />
                                </Button>
                                <Button
                                    variant="secondary"
                                    size="icon"
                                    className="h-8 w-8 bg-background/80 backdrop-blur-sm shadow-lg"
                                    onClick={handleDownload}
                                    title="Download"
                                >
                                    <Download className="h-3.5 w-3.5" />
                                </Button>
                            </div>
                        </div>
                    ) : imageError ? (
                        <div className="flex items-center justify-center py-12 text-muted-foreground/60 text-sm">
                            <ImagePlus className="h-8 w-8 mr-3 opacity-30" />
                            Failed to load image
                        </div>
                    ) : (
                        <div className="flex items-center justify-center py-12 text-muted-foreground/60 text-sm">
                            <ImagePlus className="h-8 w-8 mr-3 opacity-30" />
                            No image data available
                        </div>
                    )}

                    {/* Prompt */}
                    {prompt && (
                        <div className="px-4 py-2.5 border-t border-border/30">
                            <p className="text-xs text-muted-foreground/70 italic line-clamp-3">
                                &ldquo;{prompt}&rdquo;
                            </p>
                        </div>
                    )}
                </div>
            </div>

            {/* Lightbox overlay */}
            {expanded && imageSrc && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm cursor-pointer"
                    onClick={() => setExpanded(false)}
                >
                    <Button
                        variant="ghost"
                        size="icon"
                        className="absolute top-4 right-4 h-10 w-10 text-white/70 hover:text-white hover:bg-white/10"
                        onClick={() => setExpanded(false)}
                    >
                        <X className="h-6 w-6" />
                    </Button>
                    <img
                        src={imageSrc}
                        alt={prompt || imageName}
                        className="max-w-[90vw] max-h-[90vh] object-contain rounded-lg shadow-2xl"
                        onClick={(e) => e.stopPropagation()}
                    />
                </div>
            )}
        </>
    );
});
GeneratedImageStep.displayName = 'GeneratedImageStep';

