'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { API_BASE } from '@/lib/config';
import { authHeaders } from '@/lib/auth';
import { wsService } from '@/lib/ws-service';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import {
    Bot, Play, Square, RefreshCw, Wifi, WifiOff,
    MessageSquare, ArrowRight, ArrowLeft, AlertCircle,
    Settings2, Eye, EyeOff, Check, ChevronDown, ChevronUp, Save,
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

interface BridgeSettings {
    discordBotToken: string;
    discordChannelId: string;
    discordGuildId: string;
    stepSoftLimit: number;
    allowedBotIds: string[];
    autoStart: boolean;
}

const DEFAULT_BRIDGE: BridgeSettings = {
    discordBotToken: '',
    discordChannelId: '',
    discordGuildId: '',
    stepSoftLimit: 500,
    allowedBotIds: [],
    autoStart: false,
};

const LOG_COLORS: Record<string, string> = {
    system: 'text-muted-foreground/60',
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
    IDLE: { color: 'text-muted-foreground/50', dot: 'bg-muted-foreground/40', label: 'Offline', icon: WifiOff },
    ACTIVE: { color: 'text-emerald-400', dot: 'bg-emerald-400', label: 'Connected', icon: Wifi },
    TRANSITIONING: { color: 'text-amber-400', dot: 'bg-amber-400 animate-pulse', label: 'Transitioning', icon: RefreshCw },
};

// ── Main Component ─────────────────────────────────────────────────────────

export function AgentBridgeView() {
    const [status, setStatus] = useState<BridgeStatus>({
        state: 'IDLE', cascadeId: null, cascadeIdShort: '--------',
        stepCount: 0, softLimit: 500, log: [],
    });
    const [bridge, setBridge] = useState<BridgeSettings>(DEFAULT_BRIDGE);
    const [bridgeOriginal, setBridgeOriginal] = useState<BridgeSettings>(DEFAULT_BRIDGE);
    const [showToken, setShowToken] = useState(false);
    const [showSettings, setShowSettings] = useState(false);
    const [saving, setSaving] = useState(false);
    const [saveMsg, setSaveMsg] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [settingsLoaded, setSettingsLoaded] = useState(false);
    const bottomRef = useRef<HTMLDivElement>(null);

    // Load persistent settings from backend
    const loadSettings = useCallback(async () => {
        try {
            const res = await fetch(`${API_BASE}/api/agent-bridge/settings`, { headers: authHeaders() });
            if (!res.ok) return;
            const data = await res.json();
            const bridgeData: BridgeSettings = { ...DEFAULT_BRIDGE, ...data };
            setBridge(bridgeData);
            setBridgeOriginal(bridgeData);
            setSettingsLoaded(true);
        } catch { /* silent */ }
    }, []);

    const fetchStatus = useCallback(async () => {
        try {
            const res = await fetch(`${API_BASE}/api/agent-bridge/status`, { headers: authHeaders() });
            if (res.ok) setStatus(await res.json());
        } catch { /* silent */ }
    }, []);

    useEffect(() => {
        loadSettings();
        fetchStatus(); // initial fetch only — subsequent updates via WebSocket

        // Subscribe to real-time bridge status updates via existing WS
        if (!wsService) return;
        const off = wsService.on('bridge_status', (data) => {
            setStatus(data as unknown as BridgeStatus);
        });
        return off;
    }, [loadSettings, fetchStatus]);

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [status.log]);

    // Auto-expand settings if not configured yet
    useEffect(() => {
        if (settingsLoaded && !bridge.discordBotToken && status.state === 'IDLE') {
            setShowSettings(true);
        }
    }, [settingsLoaded, bridge.discordBotToken, status.state]);

    const handleSaveSettings = async () => {
        setSaving(true);
        setSaveMsg('');
        try {
            const res = await fetch(`${API_BASE}/api/agent-bridge/settings`, {
                method: 'POST',
                headers: authHeaders(),
                body: JSON.stringify({
                    discordBotToken: bridge.discordBotToken,
                    discordChannelId: bridge.discordChannelId,
                    discordGuildId: bridge.discordGuildId,
                    stepSoftLimit: bridge.stepSoftLimit,
                    allowedBotIds: bridge.allowedBotIds,
                    autoStart: bridge.autoStart,
                }),
            });
            if (!res.ok) throw new Error('Save failed');
            const updated = await res.json();
            const bridgeData: BridgeSettings = { ...DEFAULT_BRIDGE, ...updated };
            setBridge(bridgeData);
            setBridgeOriginal(bridgeData);
            setSaveMsg('saved');
            setTimeout(() => setSaveMsg(''), 2000);
        } catch {
            setSaveMsg('error');
        } finally {
            setSaving(false);
        }
    };

    const handleStart = async () => {
        setLoading(true);
        setError(null);
        try {
            const body: Record<string, unknown> = {};
            if (bridge.discordBotToken) body.discordBotToken = bridge.discordBotToken;
            if (bridge.discordChannelId) body.discordChannelId = bridge.discordChannelId;
            if (bridge.discordGuildId) body.discordGuildId = bridge.discordGuildId;
            if (bridge.stepSoftLimit) body.stepSoftLimit = bridge.stepSoftLimit;

            const res = await fetch(`${API_BASE}/api/agent-bridge/start`, {
                method: 'POST',
                headers: authHeaders(),
                body: JSON.stringify(body),
            });
            const data = await res.json();
            if (!data.ok) throw new Error(data.error || 'Failed to start');
            setStatus(data);
            setShowSettings(false);
        } catch (e: unknown) {
            setError(e instanceof Error ? e.message : 'Unknown error');
        } finally {
            setLoading(false);
        }
    };

    const handleStop = async () => {
        setLoading(true);
        try {
            await fetch(`${API_BASE}/api/agent-bridge/stop`, { method: 'POST', headers: authHeaders() });
            await fetchStatus();
        } finally { setLoading(false); }
    };

    const stateConf = STATE_CONFIG[status.state];
    const StateIcon = stateConf.icon;
    const pct = status.softLimit > 0 ? Math.min((status.stepCount / status.softLimit) * 100, 100) : 0;

    const hasBridgeChanges =
        bridge.discordBotToken !== bridgeOriginal.discordBotToken ||
        bridge.discordChannelId !== bridgeOriginal.discordChannelId ||
        bridge.discordGuildId !== bridgeOriginal.discordGuildId ||
        bridge.stepSoftLimit !== bridgeOriginal.stepSoftLimit ||
        bridge.autoStart !== bridgeOriginal.autoStart ||
        JSON.stringify(bridge.allowedBotIds) !== JSON.stringify(bridgeOriginal.allowedBotIds);

    const canStart = bridge.discordBotToken && bridge.discordChannelId;

    return (
        <div className="flex flex-col h-full bg-background">
            {/* ── Header ── */}
            <div className="flex items-center justify-between px-4 py-2.5 border-b border-border/30 shrink-0">
                <div className="flex items-center gap-2.5">
                    <div className={cn(
                        'w-7 h-7 rounded-lg flex items-center justify-center',
                        status.state === 'ACTIVE' ? 'bg-emerald-500/10' : 'bg-muted/30'
                    )}>
                        <Bot className={cn('w-3.5 h-3.5', status.state === 'ACTIVE' ? 'text-emerald-400' : 'text-muted-foreground/50')} />
                    </div>
                    <div>
                        <span className="text-xs font-semibold text-foreground/80">Agent Bridge</span>
                        <div className="flex items-center gap-1.5">
                            <span className={cn('w-1.5 h-1.5 rounded-full', stateConf.dot)} />
                            <span className={cn('text-[10px] font-medium', stateConf.color)}>
                                {stateConf.label}
                            </span>
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-1.5">
                    {/* Settings toggle */}
                    <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7"
                        onClick={() => setShowSettings(p => !p)}
                        title="Bridge Settings"
                    >
                        <Settings2 className={cn('h-3.5 w-3.5', showSettings ? 'text-primary' : 'text-muted-foreground/50')} />
                    </Button>

                    {/* Start/Stop */}
                    {status.state === 'IDLE' ? (
                        <Button
                            size="sm"
                            onClick={handleStart}
                            disabled={loading || !canStart}
                            className="h-7 text-[10px] gap-1 px-2.5"
                        >
                            <Play className="w-3 h-3" />
                            Start
                        </Button>
                    ) : (
                        <Button
                            size="sm"
                            variant="destructive"
                            onClick={handleStop}
                            disabled={loading}
                            className="h-7 text-[10px] gap-1 px-2.5"
                        >
                            <Square className="w-3 h-3" />
                            Stop
                        </Button>
                    )}

                    {/* Refresh */}
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={fetchStatus} title="Refresh">
                        <RefreshCw className="w-3 h-3 text-muted-foreground/40" />
                    </Button>
                </div>
            </div>

            {/* ── Settings Panel (collapsible) ── */}
            {showSettings && (
                <div className="border-b border-border/20 shrink-0 bg-muted/5">
                    <div className="px-4 py-3 space-y-3">
                        {/* Discord Bot Token */}
                        <div className="space-y-1">
                            <Label className="text-[10px] text-muted-foreground/70">Discord Bot Token</Label>
                            <div className="relative">
                                <Input
                                    type={showToken ? 'text' : 'password'}
                                    value={bridge.discordBotToken}
                                    onChange={e => setBridge(b => ({ ...b, discordBotToken: e.target.value }))}
                                    placeholder="MTQ3OTUw..."
                                    className="font-mono text-[11px] h-8 pr-8"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowToken(!showToken)}
                                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground/40 hover:text-foreground/60 transition-colors"
                                >
                                    {showToken ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                                </button>
                            </div>
                        </div>

                        {/* Channel & Guild IDs */}
                        <div className="grid grid-cols-2 gap-2">
                            <div className="space-y-1">
                                <Label className="text-[10px] text-muted-foreground/70">Channel ID</Label>
                                <Input
                                    value={bridge.discordChannelId}
                                    onChange={e => setBridge(b => ({ ...b, discordChannelId: e.target.value }))}
                                    placeholder="1479500166..."
                                    className="font-mono text-[11px] h-8"
                                />
                            </div>
                            <div className="space-y-1">
                                <Label className="text-[10px] text-muted-foreground/70">Guild ID</Label>
                                <Input
                                    value={bridge.discordGuildId}
                                    onChange={e => setBridge(b => ({ ...b, discordGuildId: e.target.value }))}
                                    placeholder="1479500111..."
                                    className="font-mono text-[11px] h-8"
                                />
                            </div>
                        </div>

                        {/* Step Limit & Allowed Bots */}
                        <div className="grid grid-cols-2 gap-2">
                            <div className="space-y-1">
                                <Label className="text-[10px] text-muted-foreground/70">Step Soft Limit</Label>
                                <Input
                                    type="number"
                                    value={bridge.stepSoftLimit}
                                    onChange={e => setBridge(b => ({ ...b, stepSoftLimit: parseInt(e.target.value) || 0 }))}
                                    min={0}
                                    max={10000}
                                    className="font-mono text-[11px] h-8"
                                />
                            </div>
                            <div className="space-y-1">
                                <Label className="text-[10px] text-muted-foreground/70">Allowed Bot IDs</Label>
                                <Input
                                    value={bridge.allowedBotIds.join(', ')}
                                    onChange={e => setBridge(b => ({
                                        ...b,
                                        allowedBotIds: e.target.value.split(',').map(s => s.trim()).filter(Boolean)
                                    }))}
                                    placeholder="bot_id_1, bot_id_2"
                                    className="font-mono text-[11px] h-8"
                                />
                            </div>
                        </div>

                        {/* Auto-start + Save row */}
                        <div className="flex items-center justify-between pt-1">
                            <div className="flex items-center gap-2">
                                <Switch
                                    checked={bridge.autoStart}
                                    onCheckedChange={v => setBridge(b => ({ ...b, autoStart: v }))}
                                    className="scale-75 origin-left"
                                />
                                <span className="text-[10px] text-muted-foreground/60">Auto-start on server boot</span>
                            </div>

                            <div className="flex items-center gap-2">
                                {saveMsg && (
                                    <span className={cn("text-[10px] font-medium", saveMsg === 'saved' ? 'text-emerald-400' : 'text-red-400')}>
                                        {saveMsg === 'saved' ? <Check className="h-3 w-3 inline mr-0.5" /> : null}
                                        {saveMsg === 'saved' ? 'Saved' : 'Error'}
                                    </span>
                                )}
                                <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={handleSaveSettings}
                                    disabled={saving || !hasBridgeChanges}
                                    className="h-7 text-[10px] gap-1 px-2.5"
                                >
                                    <Save className="w-3 h-3" />
                                    {saving ? 'Saving…' : 'Save'}
                                </Button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* ── Error banner ── */}
            {error && (
                <div className="px-4 py-2 bg-red-500/5 border-b border-red-500/10 flex items-center gap-2 shrink-0">
                    <AlertCircle className="w-3 h-3 text-red-400 shrink-0" />
                    <p className="text-[10px] text-red-400">{error}</p>
                    <button onClick={() => setError(null)} className="ml-auto text-red-400/50 hover:text-red-400 text-xs">✕</button>
                </div>
            )}

            {/* ── Cascade Info Bar ── */}
            {status.state !== 'IDLE' && (
                <div className="px-4 py-2 border-b border-border/10 shrink-0">
                    <div className="flex items-center justify-between text-[10px] text-muted-foreground/60 mb-1.5">
                        <span className="font-mono flex items-center gap-1">
                            <MessageSquare className="w-3 h-3" />
                            #{status.cascadeIdShort}
                        </span>
                        <span className="font-mono">{status.stepCount}/{status.softLimit} steps</span>
                    </div>
                    <div className="w-full h-1.5 rounded-full bg-muted/20 overflow-hidden">
                        <div
                            className={cn(
                                'h-full rounded-full transition-all duration-500',
                                pct > 85 ? 'bg-red-400/70' : pct > 60 ? 'bg-amber-400/70' : 'bg-emerald-400/70'
                            )}
                            style={{ width: `${pct}%` }}
                        />
                    </div>
                </div>
            )}

            {/* ── Log Stream ── */}
            <div className="flex-1 overflow-y-auto">
                {status.log.length === 0 ? (
                    <div className="flex flex-col items-center justify-center h-full gap-4 px-6">
                        <div className={cn(
                            'w-14 h-14 rounded-2xl flex items-center justify-center',
                            status.state === 'ACTIVE' ? 'bg-emerald-500/10' : 'bg-muted/10'
                        )}>
                            <StateIcon className={cn(
                                'w-7 h-7',
                                status.state === 'ACTIVE' ? 'text-emerald-400/50' : 'text-muted-foreground/15'
                            )} />
                        </div>
                        <div className="text-center space-y-1">
                            <p className="text-xs text-muted-foreground/50 font-medium">
                                {status.state === 'IDLE' ? 'Bridge not started' : 'Waiting for messages…'}
                            </p>
                            <p className="text-[10px] text-muted-foreground/30">
                                {status.state === 'IDLE'
                                    ? canStart
                                        ? 'Click Start to begin relaying between Antigravity ↔ Discord'
                                        : 'Configure Discord credentials above to get started'
                                    : 'Messages will appear here as they flow through the bridge'
                                }
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
                            <div key={i} className="flex items-start gap-2.5 px-4 py-2 border-b border-border/5 hover:bg-muted/5 transition-colors">
                                <Icon className={cn('w-3 h-3 mt-0.5 shrink-0', color)} />
                                <div className="flex-1 min-w-0">
                                    <p className={cn('text-[11px] break-words leading-relaxed', color)}>
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
