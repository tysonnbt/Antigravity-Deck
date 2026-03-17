// === Agent Hub shared constants ===
// Extracted from agent-bridge-view.tsx for reuse across Agent Hub panels.

import {
    Bot, RefreshCw, ArrowRight, ArrowLeft, AlertCircle,
    Wifi, WifiOff, Globe, MessageSquare,
} from 'lucide-react';

// ── Session state → visual config ───────────────────────────────────────

export const SESSION_STATE_CONFIG = {
    IDLE: { color: 'text-muted-foreground/50', dot: 'bg-muted-foreground/40', label: 'Offline', icon: WifiOff },
    ACTIVE: { color: 'text-emerald-400', dot: 'bg-emerald-400', label: 'Active', icon: Wifi },
    TRANSITIONING: { color: 'text-amber-400', dot: 'bg-amber-400 animate-pulse', label: 'Transitioning', icon: RefreshCw },
} as const;

// ── Transport badge colors ──────────────────────────────────────────────

export const TRANSPORT_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
    discord: { label: 'Discord', color: 'text-violet-400', bg: 'bg-violet-400/10' },
    websocket: { label: 'WS', color: 'text-emerald-400', bg: 'bg-emerald-400/10' },
    'websocket-ui': { label: 'UI', color: 'text-orange-400', bg: 'bg-orange-400/10' },
    http: { label: 'HTTP', color: 'text-sky-400', bg: 'bg-sky-400/10' },
    unknown: { label: '?', color: 'text-muted-foreground', bg: 'bg-muted/10' },
};

// ── Log entry styling ───────────────────────────────────────────────────

export const LOG_COLORS: Record<string, string> = {
    system: 'text-muted-foreground/60',
    from_antigravity: 'text-sky-400',
    from_pi: 'text-violet-400',
    from_agent: 'text-sky-400',
    error: 'text-red-400',
};

export const LOG_ICONS: Record<string, typeof Bot> = {
    system: RefreshCw,
    from_antigravity: ArrowRight,
    from_pi: ArrowLeft,
    from_agent: ArrowRight,
    error: AlertCircle,
};

// ── Timestamp formatter ─────────────────────────────────────────────────

export function formatTimestamp(ts: number): string {
    return new Date(ts).toLocaleTimeString('vi-VN', {
        hour: '2-digit', minute: '2-digit', second: '2-digit',
    });
}
