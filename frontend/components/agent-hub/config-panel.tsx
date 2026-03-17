'use client';

import { useState, useEffect } from 'react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
    Save, Check, ChevronDown, ChevronUp, Play, Square,
    Eye, EyeOff, Loader2, AlertCircle, Settings2, Bot,
} from 'lucide-react';
import { wsService } from '@/lib/ws-service';
import { SESSION_STATE_CONFIG } from '@/lib/agent-utils';
import {
    fetchAgentApiSettings, saveAgentApiSettings as saveApiSettings,
    fetchBridgeSettings, saveBridgeSettings as saveBridgeSettingsApi,
    fetchBridgeStatus, startBridge, stopBridge,
} from '@/lib/agent-api';
import type { AgentApiSettings, BridgeSettings, BridgeStatus } from '@/lib/agent-api';

// ── Defaults ────────────────────────────────────────────────────────────

const DEFAULT_API_SETTINGS: AgentApiSettings = {
    enabled: true, maxConcurrentSessions: 5,
    sessionTimeoutMs: 1800000, defaultStepSoftLimit: 500,
};

const DEFAULT_BRIDGE: BridgeSettings = {
    discordBotToken: '', discordChannelId: '', discordGuildId: '',
    stepSoftLimit: 500, allowedBotIds: [], autoStart: false,
};

export function AgentConfigPanel() {
    // ── Agent API Settings ──────────────────────────────────────────────
    const [api, setApi] = useState<AgentApiSettings>(DEFAULT_API_SETTINGS);
    const [apiOriginal, setApiOriginal] = useState<AgentApiSettings>(DEFAULT_API_SETTINGS);
    const [apiSaving, setApiSaving] = useState(false);
    const [apiMsg, setApiMsg] = useState('');
    const [apiOpen, setApiOpen] = useState(true);

    // ── Discord Bridge Settings ─────────────────────────────────────────
    const [bridge, setBridge] = useState<BridgeSettings>(DEFAULT_BRIDGE);
    const [bridgeOriginal, setBridgeOriginal] = useState<BridgeSettings>(DEFAULT_BRIDGE);
    const [bridgeStatus, setBridgeStatus] = useState<BridgeStatus | null>(null);
    const [bridgeSaving, setBridgeSaving] = useState(false);
    const [bridgeMsg, setBridgeMsg] = useState('');
    const [bridgeLoading, setBridgeLoading] = useState(false);
    const [bridgeOpen, setBridgeOpen] = useState(false);
    const [showToken, setShowToken] = useState(false);

    // ── Load on mount ───────────────────────────────────────────────────
    useEffect(() => {
        fetchAgentApiSettings()
            .then(d => { setApi(d); setApiOriginal(d); })
            .catch(() => {});

        fetchBridgeSettings()
            .then(d => { const s = { ...DEFAULT_BRIDGE, ...d }; setBridge(s); setBridgeOriginal(s); })
            .catch(() => {});

        fetchBridgeStatus()
            .then(setBridgeStatus)
            .catch(() => {});

        // WS updates for bridge status
        if (!wsService) return;
        const off = wsService.on('bridge_status', (data) => {
            setBridgeStatus(data as unknown as BridgeStatus);
        });
        return off;
    }, []);

    // ── API settings save ───────────────────────────────────────────────
    const hasApiChanges = JSON.stringify(api) !== JSON.stringify(apiOriginal);

    const handleSaveApi = async () => {
        setApiSaving(true);
        setApiMsg('');
        try {
            // Convert minutes → ms for backend
            const updated = await saveApiSettings(api);
            setApi(updated);
            setApiOriginal(updated);
            setApiMsg('saved');
            setTimeout(() => setApiMsg(''), 2000);
        } catch {
            setApiMsg('error');
        } finally {
            setApiSaving(false);
        }
    };

    // ── Bridge settings save ────────────────────────────────────────────
    const hasBridgeChanges = JSON.stringify(bridge) !== JSON.stringify(bridgeOriginal);

    const handleSaveBridge = async () => {
        setBridgeSaving(true);
        setBridgeMsg('');
        try {
            const updated = await saveBridgeSettingsApi(bridge);
            const s = { ...DEFAULT_BRIDGE, ...updated };
            setBridge(s);
            setBridgeOriginal(s);
            setBridgeMsg('saved');
            setTimeout(() => setBridgeMsg(''), 2000);
        } catch {
            setBridgeMsg('error');
        } finally {
            setBridgeSaving(false);
        }
    };

    const handleStartBridge = async () => {
        setBridgeLoading(true);
        try {
            const body: Record<string, unknown> = {};
            if (bridge.discordBotToken) body.discordBotToken = bridge.discordBotToken;
            if (bridge.discordChannelId) body.discordChannelId = bridge.discordChannelId;
            if (bridge.discordGuildId) body.discordGuildId = bridge.discordGuildId;
            if (bridge.stepSoftLimit) body.stepSoftLimit = bridge.stepSoftLimit;
            const data = await startBridge(body);
            setBridgeStatus(data);
        } catch { /* error handled by bridge_status WS */ }
        finally { setBridgeLoading(false); }
    };

    const handleStopBridge = async () => {
        setBridgeLoading(true);
        try {
            await stopBridge();
            const status = await fetchBridgeStatus();
            setBridgeStatus(status);
        } finally { setBridgeLoading(false); }
    };

    const bridgeState = bridgeStatus?.state || 'IDLE';
    const stateConf = SESSION_STATE_CONFIG[bridgeState as keyof typeof SESSION_STATE_CONFIG] || SESSION_STATE_CONFIG.IDLE;
    const canStartBridge = bridge.discordBotToken && bridge.discordChannelId;

    // Convert ms ↔ minutes for display
    const timeoutMinutes = Math.round(api.sessionTimeoutMs / 60000);

    return (
        <div className="p-3 space-y-3 overflow-y-auto h-full">
            {/* ── Section 1: Agent API Settings ── */}
            <Card className="bg-muted/5 border-border/20">
                <CardHeader className="p-3 pb-0 cursor-pointer" onClick={() => setApiOpen(!apiOpen)}>
                    <div className="flex items-center justify-between">
                        <CardTitle className="text-xs flex items-center gap-1.5">
                            <Settings2 className="h-3.5 w-3.5" /> Agent API
                        </CardTitle>
                        {apiOpen ? <ChevronUp className="h-3 w-3 text-muted-foreground/40" /> : <ChevronDown className="h-3 w-3 text-muted-foreground/40" />}
                    </div>
                </CardHeader>
                {apiOpen && (
                    <CardContent className="p-3 pt-2 space-y-3">
                        <div className="flex items-center justify-between">
                            <Label className="text-[10px] text-muted-foreground/70">Enable Agent API</Label>
                            <Switch checked={api.enabled} onCheckedChange={v => setApi(a => ({ ...a, enabled: v }))} className="scale-75" />
                        </div>

                        <div className="grid grid-cols-3 gap-2">
                            <div className="space-y-1">
                                <Label className="text-[10px] text-muted-foreground/70">Max Sessions</Label>
                                <Input type="number" value={api.maxConcurrentSessions} min={1} max={20}
                                    onChange={e => setApi(a => ({ ...a, maxConcurrentSessions: parseInt(e.target.value) || 1 }))}
                                    className="font-mono text-[11px] h-8" />
                            </div>
                            <div className="space-y-1">
                                <Label className="text-[10px] text-muted-foreground/70">Timeout (min)</Label>
                                <Input type="number" value={timeoutMinutes} min={1} max={1440}
                                    onChange={e => setApi(a => ({ ...a, sessionTimeoutMs: (parseInt(e.target.value) || 1) * 60000 }))}
                                    className="font-mono text-[11px] h-8" />
                            </div>
                            <div className="space-y-1">
                                <Label className="text-[10px] text-muted-foreground/70">Step Limit</Label>
                                <Input type="number" value={api.defaultStepSoftLimit} min={10} max={10000}
                                    onChange={e => setApi(a => ({ ...a, defaultStepSoftLimit: parseInt(e.target.value) || 10 }))}
                                    className="font-mono text-[11px] h-8" />
                            </div>
                        </div>

                        <div className="flex items-center justify-end gap-2">
                            {apiMsg && (
                                <span className={cn('text-[10px] font-medium', apiMsg === 'saved' ? 'text-emerald-400' : 'text-red-400')}>
                                    {apiMsg === 'saved' ? <><Check className="h-3 w-3 inline mr-0.5" />Saved</> : 'Error'}
                                </span>
                            )}
                            <Button size="sm" variant="outline" onClick={handleSaveApi}
                                disabled={apiSaving || !hasApiChanges} className="h-7 text-[10px] gap-1 px-2.5">
                                <Save className="w-3 h-3" /> {apiSaving ? 'Saving…' : 'Save'}
                            </Button>
                        </div>
                    </CardContent>
                )}
            </Card>

            {/* ── Section 2: Discord Bridge ── */}
            <Card className="bg-muted/5 border-border/20">
                <CardHeader className="p-3 pb-0 cursor-pointer" onClick={() => setBridgeOpen(!bridgeOpen)}>
                    <div className="flex items-center justify-between">
                        <CardTitle className="text-xs flex items-center gap-1.5">
                            <Bot className="h-3.5 w-3.5" /> Discord Bridge
                            <span className={cn('w-1.5 h-1.5 rounded-full ml-1', stateConf.dot)} />
                        </CardTitle>
                        <div className="flex items-center gap-1.5">
                            <span className={cn('text-[9px]', stateConf.color)}>{stateConf.label}</span>
                            {bridgeOpen ? <ChevronUp className="h-3 w-3 text-muted-foreground/40" /> : <ChevronDown className="h-3 w-3 text-muted-foreground/40" />}
                        </div>
                    </div>
                </CardHeader>
                {bridgeOpen && (
                    <CardContent className="p-3 pt-2 space-y-3">
                        {/* Bot Token */}
                        <div className="space-y-1">
                            <Label className="text-[10px] text-muted-foreground/70">Discord Bot Token</Label>
                            <div className="relative">
                                <Input type={showToken ? 'text' : 'password'} value={bridge.discordBotToken}
                                    onChange={e => setBridge(b => ({ ...b, discordBotToken: e.target.value }))}
                                    placeholder="MTQ3OTUw..." className="font-mono text-[11px] h-8 pr-8" />
                                <button type="button" onClick={() => setShowToken(!showToken)}
                                    className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground/40 hover:text-foreground/60 transition-colors">
                                    {showToken ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                                </button>
                            </div>
                        </div>

                        {/* Channel & Guild */}
                        <div className="grid grid-cols-2 gap-2">
                            <div className="space-y-1">
                                <Label className="text-[10px] text-muted-foreground/70">Channel ID</Label>
                                <Input value={bridge.discordChannelId}
                                    onChange={e => setBridge(b => ({ ...b, discordChannelId: e.target.value }))}
                                    placeholder="1479500166..." className="font-mono text-[11px] h-8" />
                            </div>
                            <div className="space-y-1">
                                <Label className="text-[10px] text-muted-foreground/70">Guild ID</Label>
                                <Input value={bridge.discordGuildId}
                                    onChange={e => setBridge(b => ({ ...b, discordGuildId: e.target.value }))}
                                    placeholder="1479500111..." className="font-mono text-[11px] h-8" />
                            </div>
                        </div>

                        {/* Step Limit & Allowed Bots */}
                        <div className="grid grid-cols-2 gap-2">
                            <div className="space-y-1">
                                <Label className="text-[10px] text-muted-foreground/70">Step Soft Limit</Label>
                                <Input type="number" value={bridge.stepSoftLimit}
                                    onChange={e => setBridge(b => ({ ...b, stepSoftLimit: parseInt(e.target.value) || 0 }))}
                                    min={0} max={10000} className="font-mono text-[11px] h-8" />
                            </div>
                            <div className="space-y-1">
                                <Label className="text-[10px] text-muted-foreground/70">Allowed Bot IDs</Label>
                                <Input value={bridge.allowedBotIds.join(', ')}
                                    onChange={e => setBridge(b => ({
                                        ...b, allowedBotIds: e.target.value.split(',').map(s => s.trim()).filter(Boolean),
                                    }))}
                                    placeholder="bot_id_1, bot_id_2" className="font-mono text-[11px] h-8" />
                            </div>
                        </div>

                        {/* Auto-start + Save + Start/Stop */}
                        <div className="flex items-center justify-between pt-1">
                            <div className="flex items-center gap-2">
                                <Switch checked={bridge.autoStart}
                                    onCheckedChange={v => setBridge(b => ({ ...b, autoStart: v }))}
                                    className="scale-75 origin-left" />
                                <span className="text-[10px] text-muted-foreground/60">Auto-start</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                                {bridgeMsg && (
                                    <span className={cn('text-[10px] font-medium', bridgeMsg === 'saved' ? 'text-emerald-400' : 'text-red-400')}>
                                        {bridgeMsg === 'saved' ? 'Saved' : 'Error'}
                                    </span>
                                )}
                                <Button size="sm" variant="outline" onClick={handleSaveBridge}
                                    disabled={bridgeSaving || !hasBridgeChanges} className="h-7 text-[10px] gap-1 px-2">
                                    <Save className="w-3 h-3" /> Save
                                </Button>
                                {bridgeState === 'IDLE' ? (
                                    <Button size="sm" onClick={handleStartBridge}
                                        disabled={bridgeLoading || !canStartBridge} className="h-7 text-[10px] gap-1 px-2">
                                        <Play className="w-3 h-3" /> Start
                                    </Button>
                                ) : (
                                    <Button size="sm" variant="destructive" onClick={handleStopBridge}
                                        disabled={bridgeLoading} className="h-7 text-[10px] gap-1 px-2">
                                        <Square className="w-3 h-3" /> Stop
                                    </Button>
                                )}
                            </div>
                        </div>
                    </CardContent>
                )}
            </Card>
        </div>
    );
}
