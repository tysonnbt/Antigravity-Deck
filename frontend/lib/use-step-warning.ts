'use client';
import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { API_BASE } from './config';
import { authHeaders } from './auth';

// --- Types ---
type Tier = 'safe' | 'warning' | 'danger';

export interface StepWarningState {
    stepCount: number;
    limit: number;
    pct: number;
    tier: Tier;
    dismissed: boolean;
    dismiss: () => void;
}

// --- Constants ---
const DISMISS_KEY_PREFIX = 'ag-step-dismissed-';
const DEFAULT_LIMIT = 500;
const DEFAULT_WARNING = 0.60;
const DEFAULT_DANGER = 0.90;

// --- Hook ---
export function useStepWarning(
    cascadeId: string | null,
    stepCount: number
): StepWarningState {
    // Settings (fetched once)
    const [limit, setLimit] = useState(DEFAULT_LIMIT);
    const [warningFrac, setWarningFrac] = useState(DEFAULT_WARNING);
    const [dangerFrac, setDangerFrac] = useState(DEFAULT_DANGER);

    // Dismiss state
    const [dismissedTier, setDismissedTier] = useState<Tier | null>(null);
    const prevCascadeIdRef = useRef<string | null>(null);

    // --- Fetch settings once on mount ---
    useEffect(() => {
        fetch(`${API_BASE}/api/settings`, { headers: authHeaders() })
            .then(r => r.json())
            .then(s => {
                if (s.stepWarningLimit != null) setLimit(s.stepWarningLimit);
                if (s.stepWarningFraction != null) setWarningFrac(s.stepWarningFraction);
                if (s.stepDangerFraction != null) setDangerFrac(s.stepDangerFraction);
            })
            .catch(() => { /* use defaults */ });
    }, []);

    // --- Reset dismiss on cascadeId change ---
    useEffect(() => {
        if (cascadeId !== prevCascadeIdRef.current) {
            prevCascadeIdRef.current = cascadeId;
            if (cascadeId) {
                try {
                    const stored = localStorage.getItem(DISMISS_KEY_PREFIX + cascadeId);
                    setDismissedTier(stored as Tier | null);
                } catch { setDismissedTier(null); }
            } else {
                setDismissedTier(null);
            }
        }
    }, [cascadeId]);

    // --- Compute tier (reactive — runs on every stepCount change) ---
    const pct = limit > 0 ? stepCount / limit : 0;
    const tier: Tier = pct >= dangerFrac ? 'danger' : pct >= warningFrac ? 'warning' : 'safe';

    // --- Dismiss logic ---
    const dismissed = useMemo(() => {
        if (tier === 'safe') return false;
        if (tier === 'warning') return dismissedTier === 'warning' || dismissedTier === 'danger';
        if (tier === 'danger') return dismissedTier === 'danger';
        return false;
    }, [tier, dismissedTier]);

    const dismiss = useCallback(() => {
        if (!cascadeId) return;
        setDismissedTier(tier);
        try {
            localStorage.setItem(DISMISS_KEY_PREFIX + cascadeId, tier);
        } catch { /* localStorage full — ignore */ }
    }, [cascadeId, tier]);

    return { stepCount, limit, pct, tier, dismissed, dismiss };
}
