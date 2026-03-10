'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { API_BASE } from '@/lib/config';
import { apiClient } from '@/lib/api-client';
import {
    Bot, Play, Square, RefreshCw, Wifi, WifiOff,
    MessageSquare, ArrowRight, ArrowLeft, RotateCcw, AlertCircle,
} from 'lucide-react';

// ── Types ──────────────────────────────────────────────────────────────────

interface BridgeStatus {
    state: 'IDLE' | 'ACTIVE' | 'TRANSITIONING';
    cascadeId: string | null;
    cascadeIdShort: string;
    stepCount: number;
    softLimit: number;
    log: LogEntry[];
}

interface LogEntry {
    type: 'system' | 'from_antigravity' | 'from_pi' | 'error';
    message: string;
    ts: number;
}

interface BridgeConfig {
    discordBotToken: string;
    discordChannelId: string;
    cascadeId: string;
    stepSoftLimit: string;
}

const LOG_COLORS: Record<string, string> = {
    system: 'text-muted-foreground/50',
    from_antigravity: 'text-sky-400',
    from_pi: 'text-violet-400',
    error: 'text-red-400',
};

const LOG_ICONS: Record<string, typeof Bot> = {
    system: RefreshCw,
    from_antigravity: ArrowRight,
    from_pi: ArrowLeft,
    error: AlertCircle,
};

const STATE_CONFIG = {
    IDLE: { color: 'text-muted-foreground/50', dot: 'bg-muted-foreground/40', label: 'Idle' },
    ACTIVE: { color: 'text-emerald-400', dot: 'bg-emerald-400', label: 'Active' },
    TRANSITIONING: { color: 'text-amber-400', dot: 'bg-amber-400 animate-pulse', label: 'Transitioning' },
};

// ── Main Component ─────────────────────────────────────────────────────────

export function AgentBridgeView() {
    const [status, setStatus] = useState<BridgeStatus>({
        state: 'IDLE', cascadeId: null, cascadeIdShort: '--------',
        stepCount: 0, softLimit: 500, log: [],
    });
    const [config, setConfig] = useState<BridgeConfig>({
        discordBotToken: '', discordChannelId: '', cascadeId: '', stepSoftLimit: '500',
    });
    const [showConfig, setShowConfig] = useState(false);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const bottomRef = useRef<HTMLDivElement>(null);
    const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const fetchStatus = useCallback(async () => {
        try {
            // Bug fix: Use apiClient() instead of fetch() for authentication + CSRF
            const res = await apiClient(`${API_BASE}/api/agent-bridge/status`);
            if (res.ok) setStatus(await res.json());
        } catch { /* silent */ }
    }, []);

    useEffect(() => {
        fetchStatus();
        pollRef.current = setInterval(fetchStatus, 3000);
        return () => { if (pollRef.current) clearInterval(pollRef.current); };
    }, [fetchStatus]);

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [status.log]);

    const handleStart = async () => {
        setLoading(true);
        setError(null);
        try {
            const body: Record<string, unknown> = {};
            if (config.discordBotToken) body.discordBotToken = config.discordBotToken;
            if (config.discordChannelId) body.discordChannelId = config.discordChannelId;
            if (config.cascadeId) body.cascadeId = config.cascadeId;
            if (config.stepSoftLimit) body.stepSoftLimit = Number(config.stepSoftLimit);

            const res = await apiClient(`${API_BASE}/api/agent-bridge/start`, {
                method: 'POST',
                body: JSON.stringify(body),
            });
            const data = await res.json();
            if (!data.ok) throw new Error(data.error || 'Failed to start');
            setStatus(data);
            setShowConfig(false);
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : 'Unknown error');
        } finally {
            setLoading(false);
        }
    };

    const handleStop = async () => {
        setLoading(true);
        try {
            await apiClient(`${API_BASE}/api/agent-bridge/stop`, { method: 'POST' });
            await fetchStatus();
        } finally { setLoading(false); }
    };

    const stateConf = STATE_CONFIG[status.state];
    const pct = status.softLimit > 0 ? Math.min((status.stepCount / status.softLimit) * 100, 100) : 0;

    return (
        <div className="flex flex-col h-full bg-background">
            {/* Header */}
            <div className="flex items-center justify-between px-3 py-2 border-b border-border/20 shrink-0">
                <div className="flex items-center gap-2">
                    <Bot className="w-3.5 h-3.5 text-primary/60" />
                    <span className="text-xs font-semibold text-foreground/70">Agent Bridge</span>
                    <span className={cn(
                        'flex items-center gap-1 text-[9px] font-mono px-1.5 py-0.5 rounded-full border',
                        status.state === 'ACTIVE'
                            ? 'text-emerald-400 border-emerald-400/20 bg-emerald-400/5'
                            : status.state === 'TRANSITIONING'
                                ? 'text-amber-400 border-amber-400/20 bg-amber-400/5'
                                : 'text-muted-foreground/40 border-muted-foreground/10'
                    )}>
                        <span className={cn('w-1.5 h-1.5 rounded-full', stateConf.dot)} />
                        {stateConf.label}
                    </span>
                </div>

                <div className="flex items-center gap-1">
                    {status.state === 'IDLE' ? (
                        <button
                            onClick={() => setShowConfig(p => !p)}
                            className="flex items-center gap-1 text-[9px] px-2 py-0.5 rounded border border-border/30 text-muted-foreground/60 hover:text-foreground/70 hover:border-border/60 transition-all"
                        >
                            <Play className="w-2.5 h-2.5" />
                            Start
                        </button>
                    ) : (
                        <button
                            onClick={handleStop}
                            disabled={loading}
                            className="flex items-center gap-1 text-[9px] px-2 py-0.5 rounded border border-red-400/30 text-red-400/70 hover:text-red-400 hover:border-red-400/60 transition-all"
                        >
                            <Square className="w-2.5 h-2.5" />
                            Stop
                        </button>
                    )}
                    <button onClick={fetchStatus} className="p-1 rounded hover:bg-muted/30 text-muted-foreground/40" title="Refresh">
                        <RefreshCw className="w-3 h-3" />
                    </button>
                </div>
            </div>

            {/* Config Panel */}
            {showConfig && status.state === 'IDLE' && (
                <div className="px-3 py-2.5 border-b border-border/20 bg-muted/5 shrink-0 space-y-2">
                    <p className="text-[10px] font-semibold text-foreground/50 uppercase tracking-wide">Bridge Config</p>
                    {[
                        { key: 'discordBotToken', label: 'Discord Bot Token', placeholder: 'MTQ3OT...', type: 'password' },
                        { key: 'discordChannelId', label: 'Channel ID', placeholder: '1479500166414336010', type: 'text' },
                        { key: 'cascadeId', label: 'Cascade ID (optional)', placeholder: 'auto-create if empty', type: 'text' },
                        { key: 'stepSoftLimit', label: 'Step Soft Limit', placeholder: '500', type: 'number' },
                    ].map(({ key, label, placeholder, type }) => (
                        <div key={key}>
                            <label className="text-[9px] text-muted-foreground/50 block mb-0.5">{label}</label>
                            <input
                                type={type}
                                value={config[key as keyof BridgeConfig]}
                                onChange={e => setConfig(p => ({ ...p, [key]: e.target.value }))}
                                placeholder={placeholder}
                                className="w-full bg-muted/10 border border-border/20 rounded px-2 py-1 text-[10px] font-mono text-foreground/70 focus:outline-none focus:border-primary/40"
                            />
                        </div>
                    ))}
                    {error && (
                        <p className="text-[9px] text-red-400 flex items-center gap-1">
                            <AlertCircle className="w-3 h-3" />{error}
                        </p>
                    )}
                    <button
                        onClick={handleStart}
                        disabled={loading}
                        className="w-full text-[10px] py-1 rounded bg-primary/10 border border-primary/30 text-primary/70 hover:bg-primary/20 hover:text-primary transition-all"
                    >
                        {loading ? 'Starting…' : 'Start Bridge'}
                    </button>
                </div>
            )}

            {/* Cascade Info */}
            {status.state !== 'IDLE' && (
                <div className="px-3 py-2 border-b border-border/10 shrink-0 space-y-1.5">
                    <div className="flex items-center justify-between text-[9px] text-muted-foreground/50">
                        <span className="font-mono">#{status.cascadeIdShort}</span>
                        <span>{status.stepCount}/{status.softLimit} steps</span>
                    </div>
                    <div className="w-full h-1 rounded-full bg-muted/20 overflow-hidden">
                        <div
                            className={cn(
                                'h-full rounded-full transition-all',
                                pct > 85 ? 'bg-red-400/60' : pct > 60 ? 'bg-amber-400/60' : 'bg-emerald-400/60'
                            )}
                            style={{ width: `${pct}%` }}
                        />
                    </div>
                </div>
            )}

            {/* Log Stream */}
            <div className="flex-1 overflow-y-auto">
                {status.log.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full gap-3">
                        <div className="w-10 h-10 rounded-full bg-muted/10 flex items-center justify-center">
                            <Bot className="w-5 h-5 text-muted-foreground/20" />
                        </div>
                        <div className="text-center">
                            <p className="text-xs text-muted-foreground/40 font-medium">Bridge not started</p>
                            <p className="text-[10px] text-muted-foreground/25 mt-0.5">
                                Start the bridge to relay Antigravity ↔ Pi
                            </p>
                        </div>
                    </div>
                ) : (
                    status.log.map((entry, i) => {
                        const Icon = LOG_ICONS[entry.type] || MessageSquare;
                        const color = LOG_COLORS[entry.type] || 'text-muted-foreground/50';
                        const time = new Date(entry.ts).toLocaleTimeString('vi-VN', {
                            hour: '2-digit', minute: '2-digit', second: '2-digit'
                        });
                        return (
                            <div key={i} className="flex items-start gap-2 px-3 py-1.5 border-b border-border/5 hover:bg-muted/5">
                                <Icon className={cn('w-3 h-3 mt-0.5 shrink-0', color)} />
                                <div className="flex-1 min-w-0">
                                    <p className={cn('text-[10px] break-words leading-relaxed line-clamp-3', color)}>
                                        {entry.message}
                                    </p>
                                </div>
                                <span className="text-[9px] text-muted-foreground/25 font-mono shrink-0 mt-0.5">{time}</span>
                            </div>
                        );
                    })
                )}
                <div ref={bottomRef} />
            </div>
        </div>
    );
}
