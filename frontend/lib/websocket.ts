'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { Step, ConversationsResponse, TrajectorySummary } from './types';
import { extractStepContent } from './step-utils';
import { API_BASE } from './config';
import { authHeaders } from './auth';
import { getCascadeStatus, getWorkspaceResources } from './cascade-api';
import type { ResourceSnapshot } from './cascade-api';
import { wsService } from './ws-service';

interface WSState {
    connected: boolean;  // WebSocket connection to backend
    detected: boolean;   // Antigravity Language Server detected by backend
    swapping: boolean;   // Profile swap in progress (suppress "Not Detected" UI)
    steps: Step[];
    baseIndex: number;        // server index of steps[0]
    stepCount: number;        // total steps known to server
    loadingOlder: boolean;    // true while fetching older steps
    conversations: Record<string, TrajectorySummary>;
    currentConvId: string | null;
    cascadeStatus: string | null;
    lastUpdate: string;
    conversationsVersion: number; // bumped when backend discovers new conversations
    stepContentVersion: number; // bumped on step_updated (streaming content changes)
    workspaceResources: ResourceSnapshot | null; // full resource snapshot
}

// === Seamless resume: cache UI state for instant restore on mobile cold-reload ===
const CACHE_KEY_DETECTED = 'antigravity-cached-detected';
const CACHE_KEY_STEPS = 'antigravity-cached-steps';
const RECONNECT_GRACE_MS = 5000; // suppress disconnect indicators for 5s after mount

function _getCachedDetected(): boolean {
    if (typeof window === 'undefined') return false;
    try { return localStorage.getItem(CACHE_KEY_DETECTED) === 'true'; } catch { return false; }
}

function _getCachedSteps(): { steps: Step[]; baseIndex: number; stepCount: number; convId: string | null } | null {
    if (typeof window === 'undefined') return null;
    try {
        const raw = localStorage.getItem(CACHE_KEY_STEPS);
        if (!raw) return null;
        return JSON.parse(raw);
    } catch { return null; }
}

function _saveCachedSteps(steps: Step[], baseIndex: number, stepCount: number, convId: string | null) {
    try {
        // Only cache last 30 steps to keep localStorage small
        const tail = steps.slice(-30);
        const adjustedBase = baseIndex + (steps.length - tail.length);
        localStorage.setItem(CACHE_KEY_STEPS, JSON.stringify({
            steps: tail, baseIndex: adjustedBase, stepCount, convId,
        }));
    } catch { /* ignore — quota exceeded or private mode */ }
}

export function useWebSocket() {
    // Restore conversation ID from localStorage for seamless refresh
    const storedConvId = typeof window !== 'undefined'
        ? (() => { try { const v = localStorage.getItem('antigravity-current-conv-id'); return v ? JSON.parse(v) : null; } catch { return null; } })()
        : null;

    // Restore cached state for seamless mobile resume
    const cachedDetected = _getCachedDetected();
    const cachedSteps = _getCachedSteps();
    const hasCachedData = cachedDetected && cachedSteps && cachedSteps.convId === storedConvId;

    const [state, setState] = useState<WSState>({
        // Optimistic: if we have cached data, show it immediately (WS will sync in background)
        connected: hasCachedData ? true : false,
        detected: cachedDetected,
        swapping: false,
        steps: (hasCachedData ? cachedSteps!.steps : []) as Step[],
        baseIndex: hasCachedData ? cachedSteps!.baseIndex : 0,
        stepCount: hasCachedData ? cachedSteps!.stepCount : 0,
        loadingOlder: false,
        conversations: {} as Record<string, TrajectorySummary>,
        currentConvId: storedConvId,
        cascadeStatus: null,
        lastUpdate: '',
        conversationsVersion: 0,
        stepContentVersion: 0,
        workspaceResources: null,
    });
    // Use refs for values needed in WS handlers to avoid stale closures
    const currentConvIdRef = useRef<string | null>(storedConvId);
    const cleanupRef = useRef<(() => void) | null>(null);
    // Grace period: suppress disconnect indicators right after mount
    const mountedAtRef = useRef(Date.now());
    const graceActiveRef = useRef(hasCachedData);

    // Keep ref in sync with state
    useEffect(() => { currentConvIdRef.current = state.currentConvId; }, [state.currentConvId]);

    const loadConversations = useCallback(async () => {
        try {
            const res = await fetch(`${API_BASE}/api/conversations`, { headers: authHeaders() });
            const data: ConversationsResponse = await res.json();
            if (data.trajectorySummaries) {
                setState(prev => ({ ...prev, conversations: data.trajectorySummaries! }));
            }
        } catch (e) {
            console.error('Failed to load conversations:', e);
        }
    }, []);

    // Stable ref for loadConversations so handlers don't depend on it
    const loadConversationsRef = useRef(loadConversations);
    loadConversationsRef.current = loadConversations;

    useEffect(() => {
        if (!wsService) return;

        // Connect shared WS service (idempotent — safe if already connected)
        wsService.connect();

        // Sync initial state if WS already connected (handles HMR/StrictMode remount)
        if (wsService.connected) {
            setState(prev => ({ ...prev, connected: true }));
            const convId = currentConvIdRef.current;
            if (convId) {
                wsService.send({ type: 'set_conversation', conversationId: convId });
            }
            // Fetch initial resource data immediately
            getWorkspaceResources()
                .then(data => setState(prev => ({ ...prev, workspaceResources: data })))
                .catch(() => { /* ignore — resource monitor may not be ready */ });
        }

        // Re-sync conversation on WS open
        const offOpen = wsService.on('__ws_open', () => {
            console.log('[WS] connected, re-syncing conversation...');
            graceActiveRef.current = false; // real connection established
            setState(prev => ({ ...prev, connected: true }));
            const convId = currentConvIdRef.current;
            console.log('[WS] onopen currentConvId:', convId?.substring(0, 8));
            if (convId) {
                wsService!.send({ type: 'set_conversation', conversationId: convId });
            }
            // Fetch initial resource data immediately (don't wait for first 5s broadcast)
            getWorkspaceResources()
                .then(data => setState(prev => ({ ...prev, workspaceResources: data })))
                .catch(() => { /* ignore — resource monitor may not be ready */ });
        });

        const offClose = wsService.on('__ws_close', () => {
            // During grace period after mount, suppress disconnect to avoid flash
            if (graceActiveRef.current && (Date.now() - mountedAtRef.current) < RECONNECT_GRACE_MS) {
                console.log('[WS] close during grace period — suppressing disconnect UI');
                return;
            }
            graceActiveRef.current = false;
            setState(prev => ({ ...prev, connected: false, detected: false }));
        });

        const offStatus = wsService.on('status', (data) => {
            console.log('[WS] status:', data.detected, 'swapping:', data.swapping);
            // Cache detected state for seamless mobile resume
            try { localStorage.setItem(CACHE_KEY_DETECTED, data.detected ? 'true' : 'false'); } catch {}
            // Grace period ends once we get real status from backend
            graceActiveRef.current = false;
            setState(prev => ({
                ...prev,
                detected: !!data.detected,
                swapping: !!data.swapping,
            }));
            if (data.detected) loadConversationsRef.current();
        });

        const offSwapComplete = wsService.on('swap_complete', (data) => {
            console.log('[WS] swap_complete:', data.profile);
            // Don't clear swapping yet — wait for detected=true from detector
        });

        const offStepsInit = wsService.on('steps_init', (data) => {
            setState(prev => {
                if (data.conversationId && data.conversationId !== prev.currentConvId) return prev;
                const incoming = (data.steps as Step[]) || [];
                const incomingBase = (data.baseIndex as number) ?? 0;
                const incomingCount = (data.stepCount as number) ?? incoming.length;

                // Cache steps for seamless mobile resume
                _saveCachedSteps(incoming, incomingBase, incomingCount, prev.currentConvId);

                // Merge: if same base+length, only update steps that actually changed
                // Prevents visible re-render on auto-refresh after cascade completion
                if (prev.baseIndex === incomingBase && prev.steps.length === incoming.length) {
                    let anyChanged = false;
                    const merged = prev.steps.map((oldStep, i) => {
                        if (i >= incoming.length - 5 && JSON.stringify(oldStep) !== JSON.stringify(incoming[i])) {
                            anyChanged = true;
                            return incoming[i];
                        }
                        return oldStep;
                    });
                    if (!anyChanged) return prev;
                    return { ...prev, steps: merged, stepCount: incomingCount, lastUpdate: new Date().toLocaleTimeString() };
                }

                // Different base/length — full replacement (initial load, conversation switch)
                return {
                    ...prev,
                    steps: incoming,
                    baseIndex: incomingBase,
                    stepCount: incomingCount,
                    lastUpdate: new Date().toLocaleTimeString(),
                };
            });
            // Fetch cascade status on init (handles reload/reconnect)
            const convId = (data.conversationId as string) || currentConvIdRef.current;
            if (convId) {
                getCascadeStatus(convId)
                    .then(s => {
                        setState(prev => {
                            if (prev.currentConvId !== convId) return prev;
                            return { ...prev, cascadeStatus: s.status || null };
                        });
                    })
                    .catch(() => { /* ignore — status unavailable */ });
            }
        });

        const offStepsNew = wsService.on('steps_new', (data) => {
            console.log('[WS] steps_new received:', (data.steps as Step[])?.length, 'for', (data.conversationId as string)?.substring(0, 8));
            setState(prev => {
                if (data.conversationId && data.conversationId !== prev.currentConvId) {
                    console.log('[WS] steps_new SKIP: conv mismatch', (data.conversationId as string)?.substring(0, 8), '!=', prev.currentConvId?.substring(0, 8));
                    return prev;
                }
                const newSteps = (data.steps as Step[]) || [];
                if (newSteps.length === 0) return prev;
                // Dedup: only append steps beyond current length
                const currentLen = prev.steps.length;
                const expectedStart = data.total ? (data.total as number) - newSteps.length : currentLen;
                const skipCount = Math.max(0, currentLen - expectedStart);
                const actualNew = newSteps.slice(skipCount);
                console.log(`[WS] steps_new: ${newSteps.length} incoming, currentLen=${currentLen}, total=${data.total}, expectedStart=${expectedStart}, skipCount=${skipCount}, actualNew=${actualNew.length}`);
                if (actualNew.length === 0) return prev;
                // Update stepCount from backend metadata
                const newStepCount = data.baseIndex !== undefined
                    ? ((data.baseIndex as number) + ((data.total as number) || (currentLen + actualNew.length)))
                    : prev.stepCount + actualNew.length;
                return {
                    ...prev,
                    steps: [...prev.steps, ...actualNew],
                    stepCount: newStepCount,
                    lastUpdate: new Date().toLocaleTimeString(),
                };
            });
        });

        const offStepUpdated = wsService.on('step_updated', (data) => {
            setState(prev => {
                if (data.conversationId && data.conversationId !== prev.currentConvId) return prev;
                // Convert server-absolute index to local array index
                const localIndex = (data.index as number) - prev.baseIndex;
                if (localIndex < 0 || localIndex >= prev.steps.length) return prev;
                const updated = [...prev.steps];
                updated[localIndex] = data.step as Step;
                return { ...prev, steps: updated, lastUpdate: new Date().toLocaleTimeString(), stepContentVersion: prev.stepContentVersion + 1 };
            });
        });

        const offCascadeStatus = wsService.on('cascade_status', (data) => {
            setState(prev => {
                if (data.conversationId && data.conversationId !== prev.currentConvId) return prev;
                const newState = { ...prev, cascadeStatus: data.status as string };
                const isDone = data.status !== 'CASCADE_RUN_STATUS_RUNNING' &&
                               data.status !== 'CASCADE_RUN_STATUS_WAITING_FOR_USER';
                if (isDone && prev.cascadeStatus && prev.cascadeStatus !== data.status) {
                    newState.conversationsVersion = prev.conversationsVersion + 1;
                    // Auto re-sync step content: backend just invalidated cache,
                    // re-send set_conversation to get fresh steps_init with finalized data.
                    // steps_init handler uses merge (not replace) so no visible flicker.
                    const convId = prev.currentConvId;
                    if (convId) {
                        wsService?.send({ type: 'set_conversation', conversationId: convId });
                    }
                }
                return newState;
            });
        });

        const offConvUpdated = wsService.on('conversations_updated', () => {
            console.log('[WS] conversations_updated — refreshing sidebar');
            setState(prev => ({ ...prev, conversationsVersion: prev.conversationsVersion + 1 }));
        });

        const offResources = wsService.on('workspace_resources', (data) => {
            // Resource monitor broadcast — update workspace CPU/RAM stats
            setState(prev => ({ ...prev, workspaceResources: (data.data as ResourceSnapshot) || {} as ResourceSnapshot }));
        });

        return () => {
            offOpen();
            offClose();
            offStatus();
            offSwapComplete();
            offStepsInit();
            offStepsNew();
            offStepUpdated();
            offCascadeStatus();
            offConvUpdated();
            offResources();
        };
    }, []);

    const selectConversation = useCallback((id: string | null) => {
        currentConvIdRef.current = id; // update ref immediately for WS handlers
        // Clear cached steps when switching conversations
        try { localStorage.removeItem(CACHE_KEY_STEPS); } catch {}
        setState(prev => ({
            ...prev,
            currentConvId: id,
            steps: [],
            baseIndex: 0,
            stepCount: 0,
            loadingOlder: false,
            cascadeStatus: null,
        }));
        if (id && wsService) {
            wsService.send({ type: 'set_conversation', conversationId: id });
        }
    }, []);

    // Load older steps on scroll-up (calls backend binary protobuf endpoint)
    const loadOlder = useCallback(async () => {
        const convId = currentConvIdRef.current;
        if (!convId) return;

        // Guard: skip if already loading or no older steps exist
        const currentState = state;
        if (currentState.loadingOlder || currentState.baseIndex === 0) return;

        setState(prev => {
            if (prev.loadingOlder || prev.baseIndex === 0) return prev;
            return { ...prev, loadingOlder: true };
        });

        try {
            const { loadOlderSteps } = await import('./cascade-api');
            const result = await loadOlderSteps(convId);

            setState(prev => {
                if (prev.currentConvId !== convId) return { ...prev, loadingOlder: false };
                if (result.steps.length === 0) return { ...prev, loadingOlder: false };
                return {
                    ...prev,
                    steps: [...result.steps, ...prev.steps],
                    baseIndex: result.baseIndex,
                    loadingOlder: false,
                };
            });
        } catch (e) {
            console.error('[WS] loadOlder failed:', e);
            setState(prev => ({ ...prev, loadingOlder: false }));
        }
    }, [state.loadingOlder, state.baseIndex]);

    // Fallback safety net: re-sync only for rare missed WS broadcasts
    // Primary data flow is BE push (cascade_status + steps_new), not this timer
    useEffect(() => {
        const fallback = setInterval(() => {
            const convId = currentConvIdRef.current;
            if (convId && wsService?.connected) {
                wsService.send({ type: 'set_conversation', conversationId: convId });
            }
        }, 30000); // 30s — safety net only, not primary data flow
        return () => clearInterval(fallback);
    }, []);

    // HTTP polling fallback for LS detection status
    // If WS status message is missed (timing, proxy, reconnect), this polls /api/status
    // every 3s until detection succeeds. Stops polling once detected = true.
    useEffect(() => {
        if (state.detected) return; // already detected — no need to poll

        let cancelled = false;
        const poll = async () => {
            try {
                const res = await fetch(`${API_BASE}/api/status`, { headers: authHeaders() });
                if (!res.ok) return;
                const data = await res.json();
                if (data.detected && !cancelled) {
                    console.log('[WS] HTTP fallback detected LS — setting detected=true');
                    setState(prev => ({
                        ...prev,
                        detected: true,
                    }));
                    loadConversationsRef.current();
                }
            } catch { /* ignore — backend may not be ready */ }
        };

        // Start polling after 5s grace period (give WS time to deliver status first)
        const delay = setTimeout(() => {
            if (cancelled) return;
            poll(); // immediate first check
            const interval = setInterval(() => {
                if (!cancelled) poll();
            }, 3000);
            // Store interval for cleanup
            cleanupRef.current = () => clearInterval(interval);
        }, 5000);

        return () => {
            cancelled = true;
            clearTimeout(delay);
            cleanupRef.current?.();
        };
    }, [state.detected]);

    return { ...state, selectConversation, loadConversations, loadOlder };
}
