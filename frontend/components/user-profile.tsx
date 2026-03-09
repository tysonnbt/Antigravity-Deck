'use client';
import { useState, useEffect, useCallback } from 'react';
import { API_BASE } from '@/lib/config';
import { authHeaders } from '@/lib/auth';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ImageIcon, User, RefreshCw, MessageSquare, RefreshCcw } from 'lucide-react';
import { CreditCard } from './profile/credit-card';
import { FeatureBadge } from './profile/feature-badge';
import { CollapsibleSection } from './profile/collapsible-section';
export function UserProfile() {
    const [user, setUser] = useState<any>(null);
    const [profilePic, setProfilePic] = useState<string | null>(null);

    useEffect(() => {
        fetch(`${API_BASE}/api/user/profile`, { headers: authHeaders() })
            .then(r => r.json())
            .then(d => {
                setUser(d.user);
                if (d.profilePicture) setProfilePic(d.profilePicture);
            })
            .catch(() => { });
    }, []);

    if (!user) return null;

    const credits = user.planStatus?.availablePromptCredits ?? 0;
    const max = user.planStatus?.planInfo?.monthlyPromptCredits ?? 1;
    const pct = max > 0 ? Math.min(100, Math.round((credits / max) * 100)) : 0;

    return (
        <div className="px-3 py-3 border-t border-border bg-sidebar flex items-center justify-between group-hover:bg-accent/50 transition-colors">
            <div className="flex items-center gap-2.5">
                <Avatar className="w-8 h-8 rounded-full">
                    {profilePic && <AvatarImage src={`data:image/png;base64,${profilePic}`} alt={user.name} />}
                    <AvatarFallback className="rounded-full bg-indigo-500/20 text-indigo-400 text-xs font-semibold">
                        {user.name?.[0]?.toUpperCase() || '?'}
                    </AvatarFallback>
                </Avatar>
                <div className="flex flex-col min-w-0">
                    <div className="text-xs font-semibold text-white/90 truncate tracking-tight">{user.name || 'User'}</div>
                    <div className="flex items-center gap-1.5 mt-0.5">
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-indigo-500/20 text-indigo-400 font-medium tracking-wide uppercase">
                            {user.userTier?.name || user.planStatus?.planInfo?.planName || 'PRO'}
                        </span>
                        <div className="w-1.5 h-1.5 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,183,127,0.6)]" title="Connected" />
                    </div>
                </div>
            </div>
            <div className="w-5 h-5 rounded hover:bg-white/10 flex items-center justify-center text-muted-foreground transition-colors shrink-0">
                <svg className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="1" /><circle cx="12" cy="5" r="1" /><circle cx="12" cy="19" r="1" /></svg>
            </div>
        </div>
    );
}

// === Full Account Info View — shown in main panel (Profile only, no settings) ===
interface Model {
    label: string;
    modelId: string;
    supportsImages: boolean;
    isRecommended: boolean;
    quota: number;
}

export function AccountInfoView() {
    const [user, setUser] = useState<any>(null);
    const [rawUserData, setRawUserData] = useState<any>(null);
    const [profilePic, setProfilePic] = useState<string | null>(null);
    const [models, setModels] = useState<Model[]>([]);
    const [defaultModel, setDefaultModel] = useState('');
    const [loading, setLoading] = useState(true);

    const loadAll = useCallback(async () => {
        setLoading(true);
        try {
            const [profileRes, userRes, modelsRes] = await Promise.all([
                fetch(`${API_BASE}/api/user/profile`, { headers: authHeaders() }),
                fetch(`${API_BASE}/api/user`, { headers: authHeaders() }),
                fetch(`${API_BASE}/api/models`, { headers: authHeaders() }),
            ]);
            const profileData = await profileRes.json();
            const userData = await userRes.json();
            const modelsData = await modelsRes.json();

            setUser(profileData.user || {});
            setRawUserData(userData);
            if (profileData.profilePicture) setProfilePic(profileData.profilePicture);
            setModels(modelsData.models || []);
            setDefaultModel(modelsData.defaultModel || '');
        } catch (e) {
            console.error('Failed to load account data:', e);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { loadAll(); }, [loadAll]);

    if (loading) {
        return (
            <div className="flex-1 overflow-y-auto">
                <div className="max-w-2xl mx-auto p-6 space-y-4">
                    <Skeleton className="h-6 w-20" />
                    <Skeleton className="h-20 w-full rounded-lg" />
                    <div className="grid grid-cols-2 gap-3">
                        <Skeleton className="h-24 rounded-lg" />
                        <Skeleton className="h-24 rounded-lg" />
                    </div>
                    <Skeleton className="h-40 w-full rounded-lg" />
                </div>
            </div>
        );
    }

    const promptCredits = user?.planStatus?.availablePromptCredits ?? 0;
    const maxPromptCredits = user?.planStatus?.planInfo?.monthlyPromptCredits ?? 1;
    const promptPct = maxPromptCredits > 0 ? Math.min(100, Math.round((promptCredits / maxPromptCredits) * 100)) : 0;

    const flowCredits = user?.planStatus?.availableFlowCredits ?? 0;
    const maxFlowCredits = user?.planStatus?.planInfo?.monthlyFlowCredits ?? 1;
    const flowPct = maxFlowCredits > 0 ? Math.min(100, Math.round((flowCredits / maxFlowCredits) * 100)) : 0;

    const planInfo = user?.planStatus?.planInfo || {};
    const tierName = user?.userTier?.name || '';
    const planName = planInfo.planName || '';

    return (
        <div className="flex-1 overflow-y-auto">
            <div className="max-w-2xl mx-auto p-6 space-y-6">

                {/* Header */}
                <div className="flex items-center gap-2">
                    <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5"><User className="h-3.5 w-3.5" /> Profile</h2>
                    <div className="flex-1 h-px bg-border/30" />
                    <Button variant="outline" size="sm" onClick={loadAll} className="h-7 text-[10px]">
                        <RefreshCw className="h-3 w-3" /> Refresh
                    </Button>
                </div>

                {/* Profile header */}
                <div className="flex items-center gap-4">
                    <Avatar className="w-14 h-14 rounded-full">
                        {profilePic && <AvatarImage src={`data:image/png;base64,${profilePic}`} alt={user?.name} />}
                        <AvatarFallback className="rounded-full bg-primary/15 text-xl font-semibold text-primary">
                            {user?.name?.[0]?.toUpperCase() || '?'}
                        </AvatarFallback>
                    </Avatar>
                    <div className="flex-1 min-w-0">
                        <div className="text-base font-semibold">{user?.name || 'User'}</div>
                        {user?.email && <p className="text-xs text-muted-foreground">{user.email}</p>}
                        <div className="flex items-center gap-2 mt-1.5">
                            {tierName && <Badge variant="secondary">{tierName}</Badge>}
                            {planName && <Badge variant="outline">{planName} Plan</Badge>}
                        </div>
                    </div>
                </div>

                {/* Credits */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <CreditCard label="Prompt Credits" icon={<MessageSquare className="h-4 w-4" />}
                        used={maxPromptCredits - promptCredits} available={promptCredits}
                        total={maxPromptCredits} pct={promptPct} />
                    <CreditCard label="Flow Credits" icon={<RefreshCcw className="h-4 w-4" />}
                        used={maxFlowCredits - flowCredits} available={flowCredits}
                        total={maxFlowCredits} pct={flowPct} />
                </div>

                {/* Plan Features */}
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                    <FeatureBadge label="Web Search" enabled={!!planInfo.cascadeWebSearchEnabled} />
                    <FeatureBadge label="Browser" enabled={!!planInfo.browserEnabled} />
                    <FeatureBadge label="Buy More Credits" enabled={!!planInfo.canBuyMoreCredits} />
                    <FeatureBadge label="Teams Tier" value={planInfo.teamsTier?.replace('TEAMS_TIER_', '') || 'N/A'} />
                </div>

                {/* Models */}
                <div>
                    <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                        Available Models ({models.length})
                    </h3>
                    <div className="space-y-2">
                        {models.map((model, i) => (
                            <div key={i} className={cn(
                                "flex items-center gap-3 px-4 py-3 rounded-lg border transition-colors",
                                model.modelId === defaultModel
                                    ? "bg-primary/5 border-primary/20"
                                    : "bg-muted/10 border-border/40"
                            )}>
                                <div className="flex-1 min-w-0">
                                    <div className="flex items-center gap-2">
                                        <span className="text-xs font-medium">{model.label}</span>
                                        {model.modelId === defaultModel && (
                                            <Badge variant="secondary" className="text-[8px] h-4 px-1.5">API Default</Badge>
                                        )}
                                        {model.isRecommended && (
                                            <Badge variant="outline" className="text-[8px] h-4 px-1.5 border-amber-500/30 text-amber-500">Recommended</Badge>
                                        )}
                                    </div>
                                    <div className="text-[10px] text-muted-foreground/50 font-mono mt-0.5">{model.modelId}</div>
                                </div>
                                <div className="flex items-center gap-2 shrink-0">
                                    {model.supportsImages && (
                                        <Badge variant="secondary" className="h-4 px-1.5 text-[8px] gap-0.5">
                                            <ImageIcon className="h-2.5 w-2.5" />
                                        </Badge>
                                    )}
                                    <div className={cn(
                                        "text-xs font-semibold",
                                        model.quota > 0.5 ? "text-green-400" :
                                            model.quota > 0.2 ? "text-amber-400" : "text-red-400"
                                    )}>
                                        {Math.round(model.quota * 100)}%
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Raw data */}
                <div className="space-y-2">
                    <CollapsibleSection title="Raw User API Response">
                        <pre className="p-3 rounded-lg bg-muted/10 border border-border/30 text-[10px] font-mono text-muted-foreground overflow-x-auto whitespace-pre-wrap break-all">
                            {JSON.stringify(rawUserData, null, 2)}
                        </pre>
                    </CollapsibleSection>
                    <CollapsibleSection title="Raw Profile API Response">
                        <pre className="p-3 rounded-lg bg-muted/10 border border-border/30 text-[10px] font-mono text-muted-foreground overflow-x-auto whitespace-pre-wrap break-all">
                            {JSON.stringify(user, null, 2)}
                        </pre>
                    </CollapsibleSection>
                </div>
            </div>
        </div>
    );
}

// --- Sub-components (Extracted to components/profile/) ---
