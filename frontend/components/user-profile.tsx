'use client';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { API_BASE } from '@/lib/config';
import { authHeaders } from '@/lib/auth';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { User, RefreshCw, Calendar, Clock, Zap } from 'lucide-react';
import { ProfileSwitcher } from './profile-switcher';

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

// === Account & Plan View — shows subscription, model usage, and reset timing ===

interface Model {
    label: string;
    modelId: string;
    supportsImages: boolean;
    isRecommended: boolean;
    quota: number;
    resetTime: string | null;
}

/** Format a countdown string like "21d 7h" */
function formatCountdown(target: Date): string {
    const diff = target.getTime() - Date.now();
    if (diff <= 0) return 'Resetting soon...';
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    if (days > 0) return `${days}d ${hours}h`;
    const mins = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    return `${hours}h ${mins}m`;
}

export function AccountInfoView() {
    const [user, setUser] = useState<any>(null);
    const [profilePic, setProfilePic] = useState<string | null>(null);
    const [models, setModels] = useState<Model[]>([]);
    const [loading, setLoading] = useState(true);
    const [now, setNow] = useState(Date.now());

    const loadData = useCallback(async () => {
        setLoading(true);
        try {
            const [profileRes, modelsRes] = await Promise.all([
                fetch(`${API_BASE}/api/user/profile`, { headers: authHeaders() }),
                fetch(`${API_BASE}/api/models`, { headers: authHeaders() }),
            ]);
            const profileData = await profileRes.json();
            const modelsData = await modelsRes.json();
            setUser(profileData.user || {});
            if (profileData.profilePicture) setProfilePic(profileData.profilePicture);
            setModels(modelsData.models || []);
        } catch (e) {
            console.error('Failed to load account data:', e);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { loadData(); }, [loadData]);

    // Re-fetch when profile swap happens
    useEffect(() => {
        const handler = () => {
            const attempts = [5000, 8000, 12000];
            attempts.forEach(delay => setTimeout(() => loadData(), delay));
        };
        window.addEventListener('profile-swapped', handler);
        return () => window.removeEventListener('profile-swapped', handler);
    }, [loadData]);

    // Tick every minute for countdown
    useEffect(() => {
        const timer = setInterval(() => setNow(Date.now()), 60_000);
        return () => clearInterval(timer);
    }, []);

    // Use the earliest resetTime from loaded models
    const resetDate = useMemo(() => {
        const times = models
            .map(m => m.resetTime)
            .filter((t): t is string => !!t)
            .map(t => new Date(t).getTime())
            .filter(t => t > Date.now());
        return times.length > 0 ? new Date(Math.min(...times)) : null;
    }, [models]);
    const countdown = useMemo(() => resetDate ? formatCountdown(resetDate) : '—', [now, resetDate]);
    const resetDateStr = useMemo(() => resetDate ? resetDate.toLocaleString('en-US', {
        month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'
    }) : 'Unknown', [resetDate]);

    if (loading) {
        return (
            <div className="flex-1 overflow-y-auto">
                <div className="max-w-xl mx-auto p-6 space-y-4">
                    <Skeleton className="h-6 w-32" />
                    <Skeleton className="h-24 w-full rounded-xl" />
                    <Skeleton className="h-40 w-full rounded-xl" />
                    <Skeleton className="h-16 w-full rounded-xl" />
                </div>
            </div>
        );
    }

    const tierName = user?.userTier?.name || '';
    const planName = user?.planStatus?.planInfo?.planName || '';

    return (
        <div className="flex-1 overflow-y-auto">
            <div className="max-w-xl mx-auto p-6 space-y-5">

                {/* Header */}
                <div className="flex items-center gap-2">
                    <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-1.5">
                        <Zap className="h-3.5 w-3.5" /> Account & Plan
                    </h2>
                    <div className="flex-1 h-px bg-border/30" />
                    <Button variant="outline" size="sm" onClick={loadData} className="h-7 text-[10px]">
                        <RefreshCw className="h-3 w-3" /> Refresh
                    </Button>
                </div>

                {/* Subscription Card */}
                <div className="relative overflow-hidden rounded-xl border border-border/50 bg-gradient-to-br from-indigo-500/10 via-purple-500/5 to-transparent p-5">
                    <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/5 rounded-full -translate-y-1/2 translate-x-1/2" />
                    <div className="flex items-center gap-4 relative">
                        <Avatar className="w-12 h-12 rounded-full ring-2 ring-indigo-500/20">
                            {profilePic && <AvatarImage src={`data:image/png;base64,${profilePic}`} alt={user?.name} />}
                            <AvatarFallback className="rounded-full bg-indigo-500/20 text-lg font-bold text-indigo-400">
                                {user?.name?.[0]?.toUpperCase() || '?'}
                            </AvatarFallback>
                        </Avatar>
                        <div className="flex-1 min-w-0">
                            <div className="text-base font-semibold">{user?.name || 'User'}</div>
                            {user?.email && <p className="text-xs text-muted-foreground truncate">{user.email}</p>}
                        </div>
                    </div>
                    <div className="flex items-center gap-2 mt-3">
                        {tierName && (
                            <Badge className="bg-indigo-500/20 text-indigo-400 border-indigo-500/30 hover:bg-indigo-500/30">
                                {tierName}
                            </Badge>
                        )}
                        {planName && (
                            <Badge variant="outline" className="border-purple-500/30 text-purple-400">
                                {planName} Plan
                            </Badge>
                        )}
                    </div>
                </div>

                {/* Profile Swap */}
                <ProfileSwitcher />

                {/* Model Usage */}
                <div>
                    <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 flex items-center gap-1.5">
                        <User className="h-3 w-3" /> Model Usage
                    </h3>
                    <div className="space-y-2">
                        {models.map((model, i) => {
                            const pct = Math.round(model.quota * 100);
                            return (
                                <div key={i} className="px-4 py-3 rounded-lg border border-border/40 bg-muted/10">
                                    <div className="flex items-center justify-between mb-2">
                                        <div className="flex items-center gap-2 min-w-0">
                                            <span className="text-xs font-medium truncate">{model.label}</span>
                                            {model.isRecommended && (
                                                <Badge variant="outline" className="text-[9px] h-4 px-1.5 border-amber-500/30 text-amber-500 shrink-0">★</Badge>
                                            )}
                                        </div>
                                        <span className={cn(
                                            "text-xs font-semibold tabular-nums shrink-0",
                                            pct > 50 ? "text-emerald-400" :
                                                pct > 20 ? "text-amber-400" : "text-red-400"
                                        )}>
                                            {pct}%
                                        </span>
                                    </div>
                                    <div className="h-1.5 bg-muted/30 rounded-full overflow-hidden">
                                        <div
                                            className={cn(
                                                "h-full rounded-full transition-all duration-500",
                                                pct > 50 ? "bg-emerald-500/70" :
                                                    pct > 20 ? "bg-amber-500/70" : "bg-red-500/70"
                                            )}
                                            style={{ width: `${pct}%` }}
                                        />
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>

                {/* Reset Timing */}
                <div className="rounded-xl border border-border/50 bg-muted/10 p-4">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center">
                                <Calendar className="h-4 w-4 text-amber-400" />
                            </div>
                            <div>
                                <div className="text-xs font-medium">Credits Reset</div>
                                <div className="text-[10px] text-muted-foreground">{resetDateStr}</div>
                            </div>
                        </div>
                        <div className="flex items-center gap-1.5 text-right">
                            <Clock className="h-3 w-3 text-muted-foreground" />
                            <span className="text-sm font-semibold text-amber-400">{countdown}</span>
                        </div>
                    </div>
                </div>

            </div>
        </div>
    );
}

