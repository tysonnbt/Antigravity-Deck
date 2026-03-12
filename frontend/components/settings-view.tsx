'use client';
import { useState, useEffect, useCallback } from 'react';
import { API_BASE } from '@/lib/config';
import { authHeaders } from '@/lib/auth';
import { getSettings, updateSettings } from '@/lib/cascade-api';
import type { AppSettings } from '@/lib/cascade-api';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { Check, X, Sparkles, CircleDot, Bot, Settings, Globe, Camera, Star, Bell } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
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
import { Slider } from '@/components/ui/slider';
import { notificationService, NOTIFICATION_SETTINGS_CHANGED } from '@/lib/notifications';
import type { NotificationSettings } from '@/lib/notifications';

interface Model {
    label: string;
    modelId: string;
    supportsImages: boolean;
    isRecommended: boolean;
    quota: number;
}

export function SettingsView() {
    const [settings, setSettings] = useState<AppSettings | null>(null);
    const [models, setModels] = useState<Model[]>([]);
    const [apiDefaultModel, setApiDefaultModel] = useState('');
    const [workspaceRoot, setWorkspaceRoot] = useState('');
    const [defaultModel, setDefaultModel] = useState('');
    const [saving, setSaving] = useState(false);
    const [loading, setLoading] = useState(true);
    const { toast } = useToast();

    // === Push notification settings (localStorage, not server) ===
    const [notiSettings, setNotiSettings] = useState<NotificationSettings>(() =>
        notificationService?.getSettings() ?? { enabled: false, events: { cascadeComplete: true, waitingForUser: true, error: true, autoAccepted: false } }
    );
    const [notiPermission, setNotiPermission] = useState<NotificationPermission>(() =>
        notificationService?.getPermission() ?? 'default'
    );

    useEffect(() => {
        const handler = () => {
            if (!notificationService) return;
            setNotiSettings(notificationService.getSettings());
            setNotiPermission(notificationService.getPermission());
        };
        window.addEventListener(NOTIFICATION_SETTINGS_CHANGED, handler);
        return () => window.removeEventListener(NOTIFICATION_SETTINGS_CHANGED, handler);
    }, []);

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
        } catch (e) {
            console.error('Failed to load settings:', e);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { loadAll(); }, [loadAll]);

    const handleSave = async () => {
        setSaving(true);
        try {
            const updated = await updateSettings({
                defaultWorkspaceRoot: workspaceRoot.trim(),
                defaultModel: defaultModel === '__api_default__' ? '' : defaultModel,
            });
            setSettings(updated);
            toast({ variant: "success", title: "Settings saved" });
        } catch {
            toast({ variant: "destructive", title: "Failed to save settings" });
        } finally {
            setSaving(false);
        }
    };

    const realDefault = defaultModel === '__api_default__' ? '' : defaultModel;
    const hasChanges = settings && (
        workspaceRoot.trim() !== (settings.defaultWorkspaceRoot || '') ||
        realDefault !== (settings.defaultModel || '')
    );

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

                {/* Push Notifications */}
                <Card>
                    <CardHeader className="pb-3">
                        <CardTitle className="text-xs font-semibold flex items-center gap-1.5">
                            <Bell className="h-3.5 w-3.5" /> Push Notifications
                        </CardTitle>
                        <CardDescription className="text-[10px]">
                            Get OS-level notifications when cascades complete, error, or need attention — even when the tab is minimized.
                        </CardDescription>
                        <p className="text-[10px] text-blue-400/80 mt-1">
                            📲 <strong>Tip:</strong> Install as PWA on mobile for native push notifications — no extra permission needed!
                        </p>
                    </CardHeader>
                    <CardContent className="space-y-4">

                        {/* Step 1: Permission setup — prominent section */}
                        {notiPermission !== 'granted' && (
                            <div className="rounded-lg border border-border/50 bg-muted/30 p-3 space-y-3">
                                <div className="flex items-start gap-2">
                                    <span className="text-lg mt-0.5">🔔</span>
                                    <div className="space-y-1">
                                        <p className="text-xs font-medium">Enable browser notifications</p>
                                        <p className="text-[10px] text-muted-foreground leading-relaxed">
                                            {notiPermission === 'denied' ? (
                                                <>Notifications are <strong className="text-red-400">blocked</strong> by your browser. To fix this:</>
                                            ) : (
                                                <>Click the button below to allow notifications. This works on both desktop and mobile browsers.</>
                                            )}
                                        </p>
                                    </div>
                                </div>

                                {notiPermission === 'denied' ? (
                                    <div className="space-y-2 pl-7">
                                        <div className="text-[10px] text-muted-foreground space-y-1">
                                            <p><strong>Desktop (Chrome/Edge):</strong> Click the 🔒 icon in the address bar → Site settings → Notifications → Allow</p>
                                            <p><strong>Mobile (Chrome):</strong> Tap ⋮ menu → Settings → Site settings → Notifications → find this site → Allow</p>
                                            <p><strong>Safari (iOS):</strong> Go to Settings → Safari → Notifications → find this site → Allow</p>
                                        </div>
                                        <p className="text-[10px] text-amber-400/80">After changing the setting, refresh this page.</p>
                                    </div>
                                ) : (
                                    <Button
                                        variant="default"
                                        size="sm"
                                        className="ml-7 text-xs h-8 gap-1.5"
                                        onClick={() => notificationService?.requestPermission()}
                                    >
                                        <Bell className="h-3.5 w-3.5" />
                                        Allow Notifications
                                    </Button>
                                )}
                            </div>
                        )}

                        {/* Permission granted badge */}
                        {notiPermission === 'granted' && (
                            <div className="flex items-center gap-2 text-[10px] text-emerald-400">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                                Notifications permitted — you're all set!
                            </div>
                        )}

                        {/* Master toggle */}
                        <div className="flex items-center justify-between">
                            <span className="text-xs">Enable push notifications</span>
                            <Switch
                                checked={notiSettings.enabled}
                                onCheckedChange={(checked) => notificationService?.setEnabled(checked)}
                            />
                        </div>

                        {/* Per-event toggles */}
                        <div className={cn("space-y-2 border-t border-border/30 pt-3", !notiSettings.enabled && "opacity-40 pointer-events-none")}>
                            <span className="text-[10px] text-muted-foreground uppercase tracking-wider">Notify on</span>
                            {[
                                { key: 'cascadeComplete' as const, label: 'Cascade complete', emoji: '✅' },
                                { key: 'waitingForUser' as const, label: 'Waiting for approval', emoji: '⏳' },
                                { key: 'error' as const, label: 'Error / Failed', emoji: '❌' },
                                { key: 'autoAccepted' as const, label: 'Auto-accepted', emoji: '⚡' },
                            ].map(({ key, label, emoji }) => (
                                <div key={key} className="flex items-center justify-between">
                                    <span className="text-xs flex items-center gap-1.5">
                                        <span>{emoji}</span> {label}
                                    </span>
                                    <Switch
                                        checked={notiSettings.events[key]}
                                        onCheckedChange={(checked) => notificationService?.setEventEnabled(key, checked)}
                                        className="scale-90"
                                    />
                                </div>
                            ))}
                        </div>

                        {/* Test button */}
                        <Button
                            variant="outline"
                            size="sm"
                            className="text-xs h-7"
                            onClick={() => notificationService?.testNotification()}
                            disabled={!notiSettings.enabled || notiPermission !== 'granted'}
                        >
                            Test Notification
                        </Button>

                        {/* PWA install hint */}
                        <p className="text-[10px] text-muted-foreground/60 leading-relaxed">
                            💡 <strong>Tip:</strong> For the best experience, install this app as a PWA — click the install icon in your browser's address bar, or use "Add to Home Screen" on mobile.
                        </p>
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
                    {hasChanges && (
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
