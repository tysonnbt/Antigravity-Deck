'use client';
import { useState, useEffect, useCallback } from 'react';
import { API_BASE } from '@/lib/config';
import { authHeaders } from '@/lib/auth';
import { getSettings, updateSettings } from '@/lib/cascade-api';
import type { AppSettings } from '@/lib/cascade-api';
import { cn } from '@/lib/utils';
import { Check, X, Sparkles, CircleDot, Bot, Settings, Globe, Camera, Star, MessageSquare, Eye, EyeOff } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import {
    Select,
    SelectContent,
    SelectGroup,
    SelectItem,
    SelectLabel,
    SelectSeparator,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';

interface Model {
    label: string;
    modelId: string;
    supportsImages: boolean;
    isRecommended: boolean;
    quota: number;
}

interface AgentBridgeSettings {
    discordBotToken: string;
    discordChannelId: string;
    discordGuildId: string;
    stepSoftLimit: number;
    allowedBotIds: string[];
    autoStart: boolean;
}

const DEFAULT_BRIDGE: AgentBridgeSettings = {
    discordBotToken: '',
    discordChannelId: '',
    discordGuildId: '',
    stepSoftLimit: 500,
    allowedBotIds: [],
    autoStart: false,
};

export function SettingsView() {
    const [settings, setSettings] = useState<AppSettings | null>(null);
    const [models, setModels] = useState<Model[]>([]);
    const [apiDefaultModel, setApiDefaultModel] = useState('');
    const [workspaceRoot, setWorkspaceRoot] = useState('');
    const [defaultModel, setDefaultModel] = useState('');
    const [saving, setSaving] = useState(false);
    const [saveMsg, setSaveMsg] = useState('');
    const [loading, setLoading] = useState(true);

    // Agent Bridge state
    const [bridge, setBridge] = useState<AgentBridgeSettings>(DEFAULT_BRIDGE);
    const [bridgeOriginal, setBridgeOriginal] = useState<AgentBridgeSettings>(DEFAULT_BRIDGE);
    const [showToken, setShowToken] = useState(false);


    const loadAll = useCallback(async () => {
        setLoading(true);
        try {
            const [settingsData, modelsRes] = await Promise.all([
                getSettings(),
                fetch(`${API_BASE}/api/models`, { headers: authHeaders() }).then(r => r.json()),
            ]);
            setSettings(settingsData);
            setWorkspaceRoot(settingsData.defaultWorkspaceRoot || '');
            setDefaultModel(settingsData.defaultModel || '__api_default__');
            setModels(modelsRes.models || []);
            setApiDefaultModel(modelsRes.defaultModel || '');

            // Load bridge settings
            const b = (settingsData as Record<string, unknown>).agentBridge as Partial<AgentBridgeSettings> | undefined;
            const bridgeData: AgentBridgeSettings = { ...DEFAULT_BRIDGE, ...b };
            setBridge(bridgeData);
            setBridgeOriginal(bridgeData);
        } catch (e) {
            console.error('Failed to load settings:', e);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { loadAll(); }, [loadAll]);

    const handleSave = async () => {
        setSaving(true);
        setSaveMsg('');
        try {
            const payload: Record<string, unknown> = {
                defaultWorkspaceRoot: workspaceRoot.trim(),
                defaultModel: defaultModel === '__api_default__' ? '' : defaultModel,
            };

            // Include bridge settings if changed
            if (hasBridgeChanges) {
                payload.agentBridge = {
                    discordBotToken: bridge.discordBotToken,
                    discordChannelId: bridge.discordChannelId,
                    discordGuildId: bridge.discordGuildId,
                    stepSoftLimit: bridge.stepSoftLimit,
                    allowedBotIds: bridge.allowedBotIds,
                    autoStart: bridge.autoStart,
                };
            }

            const updated = await updateSettings(payload as Partial<AppSettings>);
            setSettings(updated);

            // Sync bridge original
            const b = (updated as Record<string, unknown>).agentBridge as Partial<AgentBridgeSettings> | undefined;
            const bridgeData: AgentBridgeSettings = { ...DEFAULT_BRIDGE, ...b };
            setBridge(bridgeData);
            setBridgeOriginal(bridgeData);

            setSaveMsg('saved');
            setTimeout(() => setSaveMsg(''), 2500);
        } catch {
            setSaveMsg('error');
        } finally {
            setSaving(false);
        }
    };

    const realDefault = defaultModel === '__api_default__' ? '' : defaultModel;
    const hasBridgeChanges =
        bridge.discordBotToken !== bridgeOriginal.discordBotToken ||
        bridge.discordChannelId !== bridgeOriginal.discordChannelId ||
        bridge.discordGuildId !== bridgeOriginal.discordGuildId ||
        bridge.stepSoftLimit !== bridgeOriginal.stepSoftLimit ||
        bridge.autoStart !== bridgeOriginal.autoStart ||
        JSON.stringify(bridge.allowedBotIds) !== JSON.stringify(bridgeOriginal.allowedBotIds);

    const hasChanges = (settings && (
        workspaceRoot.trim() !== (settings.defaultWorkspaceRoot || '') ||
        realDefault !== (settings.defaultModel || '')
    )) || hasBridgeChanges;

    const geminiModels = models.filter(m => m.label.toLowerCase().includes('gemini'));
    const claudeModels = models.filter(m => m.label.toLowerCase().includes('claude'));
    const otherModels = models.filter(m =>
        !m.label.toLowerCase().includes('gemini') && !m.label.toLowerCase().includes('claude')
    );

    const getModelIcon = (label: string) => {
        if (label.toLowerCase().includes('gemini')) return <Sparkles className="h-3.5 w-3.5 text-sky-400" />;
        if (label.toLowerCase().includes('claude')) return <CircleDot className="h-3.5 w-3.5 text-purple-400" />;
        if (label.toLowerCase().includes('gpt')) return <CircleDot className="h-3.5 w-3.5 text-emerald-400" />;
        return <Bot className="h-3.5 w-3.5" />;
    };

    if (loading) {
        return (
            <div className="flex-1 overflow-y-auto">
                <div className="max-w-2xl mx-auto p-6 space-y-4">
                    <Skeleton className="h-6 w-24" />
                    <Skeleton className="h-32 w-full rounded-lg" />
                    <Skeleton className="h-24 w-full rounded-lg" />
                    <Skeleton className="h-20 w-full rounded-lg" />
                </div>
            </div>
        );
    }

    return (
        <div className="flex-1 overflow-y-auto">
            <div className="max-w-2xl mx-auto p-6 space-y-4">

                {/* Header */}
                <div className="flex items-center gap-2">
                    <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5"><Settings className="h-3.5 w-3.5" /> Settings</h2>
                    <div className="flex-1 h-px bg-border/30" />
                </div>

                {/* Default Model */}
                <Card>
                    <CardHeader className="pb-3">
                        <CardTitle className="text-xs font-semibold">Default Model</CardTitle>
                        <CardDescription className="text-[10px]">
                            Model used by default when starting a new chat. You can always change it per-chat.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-3">
                        <Select value={defaultModel} onValueChange={setDefaultModel}>
                            <SelectTrigger className="w-full">
                                <SelectValue placeholder="Select a model" />
                            </SelectTrigger>
                            <SelectContent>
                                <SelectItem value="__api_default__">
                                    <span className="flex items-center gap-1.5">
                                        <Globe className="h-3.5 w-3.5" />
                                        Use API default ({models.find(m => m.modelId === apiDefaultModel)?.label || 'Auto'})
                                    </span>
                                </SelectItem>

                                <SelectSeparator />

                                {geminiModels.length > 0 && (
                                    <SelectGroup>
                                        <SelectLabel>Gemini</SelectLabel>
                                        {geminiModels.map(m => (
                                            <SelectItem key={m.modelId} value={m.modelId}>
                                                <span className="flex items-center gap-2">
                                                    {getModelIcon(m.label)}
                                                    <span>{m.label}</span>
                                                    {m.modelId === apiDefaultModel && (
                                                        <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary ml-1">API Default</span>
                                                    )}
                                                    {m.supportsImages && (
                                                        <span className="text-[9px] text-sky-400"><Camera className="h-3 w-3" /></span>
                                                    )}
                                                </span>
                                            </SelectItem>
                                        ))}
                                    </SelectGroup>
                                )}

                                {claudeModels.length > 0 && (
                                    <SelectGroup>
                                        <SelectLabel>Claude</SelectLabel>
                                        {claudeModels.map(m => (
                                            <SelectItem key={m.modelId} value={m.modelId}>
                                                <span className="flex items-center gap-2">
                                                    {getModelIcon(m.label)}
                                                    <span>{m.label}</span>
                                                    {m.modelId === apiDefaultModel && (
                                                        <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary ml-1">API Default</span>
                                                    )}
                                                    {m.supportsImages && (
                                                        <span className="text-[9px] text-sky-400"><Camera className="h-3 w-3" /></span>
                                                    )}
                                                </span>
                                            </SelectItem>
                                        ))}
                                    </SelectGroup>
                                )}

                                {otherModels.length > 0 && (
                                    <SelectGroup>
                                        <SelectLabel>Other</SelectLabel>
                                        {otherModels.map(m => (
                                            <SelectItem key={m.modelId} value={m.modelId}>
                                                <span className="flex items-center gap-2">
                                                    {getModelIcon(m.label)}
                                                    <span>{m.label}</span>
                                                    {m.modelId === apiDefaultModel && (
                                                        <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-primary/10 text-primary ml-1">API Default</span>
                                                    )}
                                                </span>
                                            </SelectItem>
                                        ))}
                                    </SelectGroup>
                                )}
                            </SelectContent>
                        </Select>

                        {defaultModel && defaultModel !== '__api_default__' && (
                            <div className="text-[10px] text-primary/80 flex items-center gap-1">
                                <Star className="h-3 w-3 fill-primary text-primary" /> Currently set to: <strong>{models.find(m => m.modelId === defaultModel)?.label || defaultModel}</strong>
                            </div>
                        )}
                    </CardContent>
                </Card>

                {/* Chat Display */}

                {/* Default Workspace Root */}
                <Card>
                    <CardHeader className="pb-3">
                        <CardTitle className="text-xs font-semibold">Default Workspace Root</CardTitle>
                        <CardDescription className="text-[10px]">
                            New workspaces will be created as subfolders here. Existing subfolders will appear as available workspaces.
                        </CardDescription>
                    </CardHeader>
                    <CardContent>
                        <Input
                            value={workspaceRoot}
                            onChange={e => setWorkspaceRoot(e.target.value)}
                            placeholder="C:\Users\you\Workspaces"
                            className="font-mono text-xs"
                        />
                    </CardContent>
                </Card>

                {/* Agent Bridge */}
                <Card>
                    <CardHeader className="pb-3">
                        <CardTitle className="text-xs font-semibold flex items-center gap-1.5">
                            <MessageSquare className="h-3.5 w-3.5 text-indigo-400" />
                            Agent Bridge
                        </CardTitle>
                        <CardDescription className="text-[10px]">
                            Connect external AI agents to Antigravity via Discord. Configure bot credentials and relay behavior.
                        </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        {/* Discord Bot Token */}
                        <div className="space-y-1.5">
                            <Label className="text-[11px] text-muted-foreground">Discord Bot Token</Label>
                            <div className="relative">
                                <Input
                                    type={showToken ? 'text' : 'password'}
                                    value={bridge.discordBotToken}
                                    onChange={e => setBridge(b => ({ ...b, discordBotToken: e.target.value }))}
                                    placeholder="MTQ3OTUw..."
                                    className="font-mono text-xs pr-9"
                                />
                                <button
                                    type="button"
                                    onClick={() => setShowToken(!showToken)}
                                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                                >
                                    {showToken ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                                </button>
                            </div>
                        </div>

                        {/* Channel & Guild IDs — side by side */}
                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1.5">
                                <Label className="text-[11px] text-muted-foreground">Channel ID</Label>
                                <Input
                                    value={bridge.discordChannelId}
                                    onChange={e => setBridge(b => ({ ...b, discordChannelId: e.target.value }))}
                                    placeholder="1479500166..."
                                    className="font-mono text-xs"
                                />
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-[11px] text-muted-foreground">Guild ID</Label>
                                <Input
                                    value={bridge.discordGuildId}
                                    onChange={e => setBridge(b => ({ ...b, discordGuildId: e.target.value }))}
                                    placeholder="1479500111..."
                                    className="font-mono text-xs"
                                />
                            </div>
                        </div>

                        {/* Step Limit & Allowed Bot IDs */}
                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1.5">
                                <Label className="text-[11px] text-muted-foreground">Step Soft Limit</Label>
                                <Input
                                    type="number"
                                    value={bridge.stepSoftLimit}
                                    onChange={e => setBridge(b => ({ ...b, stepSoftLimit: parseInt(e.target.value) || 0 }))}
                                    min={0}
                                    max={10000}
                                    className="font-mono text-xs"
                                />
                            </div>
                            <div className="space-y-1.5">
                                <Label className="text-[11px] text-muted-foreground">Allowed Bot IDs</Label>
                                <Input
                                    value={bridge.allowedBotIds.join(', ')}
                                    onChange={e => setBridge(b => ({
                                        ...b,
                                        allowedBotIds: e.target.value.split(',').map(s => s.trim()).filter(Boolean)
                                    }))}
                                    placeholder="bot_id_1, bot_id_2"
                                    className="font-mono text-xs"
                                />
                            </div>
                        </div>

                        {/* Auto-start toggle */}
                        <div className="flex items-center justify-between rounded-lg border border-border/50 px-3 py-2.5">
                            <div>
                                <Label className="text-[11px] font-medium">Auto-Start Bridge</Label>
                                <p className="text-[10px] text-muted-foreground">Automatically start the Agent Bridge when the server starts</p>
                            </div>
                            <Switch
                                checked={bridge.autoStart}
                                onCheckedChange={v => setBridge(b => ({ ...b, autoStart: v }))}
                            />
                        </div>
                    </CardContent>
                </Card>

                {/* Save */}
                <div className="flex items-center gap-3">
                    <Button
                        onClick={handleSave}
                        disabled={saving || !hasChanges}
                    >
                        {saving ? 'Saving…' : 'Save Settings'}
                    </Button>
                    {saveMsg && (
                        <span className={cn("text-xs font-medium flex items-center gap-1", saveMsg === 'saved' ? "text-emerald-500" : "text-destructive")}>
                            {saveMsg === 'saved' ? <><Check className="h-3 w-3" /> Saved!</> : <><X className="h-3 w-3" /> Error saving</>}
                        </span>
                    )}
                    {hasChanges && !saveMsg && (
                        <span className="text-[10px] text-amber-500 flex items-center gap-1">
                            <span className="w-1.5 h-1.5 rounded-full bg-amber-500 animate-pulse" />
                            Unsaved changes
                        </span>
                    )}
                </div>

            </div>
        </div>
    );
}

