'use client';
import { useState, useEffect } from 'react';
import { API_BASE } from '@/lib/config';
import { authHeaders } from '@/lib/auth';
import { BarChart2, Zap } from 'lucide-react';

interface TokenData {
    totalInput: number;
    totalOutput: number;
    totalCache: number;
    byModel: Record<string, { input: number; output: number; cache: number; count: number }>;
}

export function TokenUsage({ cascadeId }: { cascadeId: string | null }) {
    const [data, setData] = useState<TokenData | null>(null);

    useEffect(() => {
        if (!cascadeId) { setData(null); return; }
        fetch(`${API_BASE}/api/cascade/${cascadeId}/metadata`, { headers: authHeaders() })
            .then(r => r.json())
            .then(raw => {
                let totalInput = 0, totalOutput = 0, totalCache = 0;
                const byModel: TokenData['byModel'] = {};
                for (const m of (raw.generatorMetadata || [])) {
                    const u = m.chatModel?.usage || {};
                    const inp = parseInt(u.inputTokens || '0');
                    const out = parseInt(u.outputTokens || '0');
                    const cache = parseInt(u.cacheReadTokens || '0');
                    totalInput += inp; totalOutput += out; totalCache += cache;
                    const model = m.chatModel?.model || 'unknown';
                    if (!byModel[model]) byModel[model] = { input: 0, output: 0, cache: 0, count: 0 };
                    byModel[model].input += inp;
                    byModel[model].output += out;
                    byModel[model].cache += cache;
                    byModel[model].count++;
                }
                setData({ totalInput, totalOutput, totalCache, byModel });
            })
            .catch(() => setData(null));
    }, [cascadeId]);

    if (!cascadeId || !data) return null;

    const total = data.totalInput + data.totalOutput;

    return (
        <div className="px-4 py-2 bg-muted/10 border-t border-border/30 text-[10px] text-muted-foreground">
            <div className="flex items-center gap-3 flex-wrap">
                <span className="flex items-center gap-1"><BarChart2 className="h-3 w-3" /> <strong className="text-foreground/70">{total.toLocaleString()}</strong> tokens</span>
                <span className="text-green-400/70">↓ {data.totalInput.toLocaleString()} in</span>
                <span className="text-blue-400/70">↑ {data.totalOutput.toLocaleString()} out</span>
                {data.totalCache > 0 && (
                    <span className="text-yellow-400/70 flex items-center gap-1"><Zap className="h-3 w-3" /> {data.totalCache.toLocaleString()} cached</span>
                )}
                {Object.entries(data.byModel).map(([model, d]) => (
                    <span key={model} className="text-muted-foreground/50">
                        {model.split('/').pop()}: {d.count} calls
                    </span>
                ))}
            </div>
        </div>
    );
}
