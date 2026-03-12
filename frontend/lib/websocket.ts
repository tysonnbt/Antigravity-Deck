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

export function useWebSocket() {
    // Restore conversation ID from localStorage for seamless refresh
    const storedConvId = typeof window !== 'undefined'
        ? (() => { try { const v = localStorage.getItem('antigravity-current-conv-id'); return v ? JSON.parse(v) : null; } catch { return null; } })()
        : null;

    const [state, setState] = useState<WSState>({
        connected: false,
        detected: false,
        swapping: false,
        steps: [] as Step[],
        baseIndex: 0,
        stepCount: 0,
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
            setState(prev => ({ ...prev, connected: false, detected: false }));
        });

        const offStatus = wsService.on('status', (data) => {
            console.log('[WS] status:', data.detected, 'swapping:', data.swapping);
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

        const offStepsLoading = wsService.on('steps_loading', (data) => {
            setState(prev => {
                if (data.conversationId && data.conversationId !== prev.currentConvId) return prev;
                return { ...prev, loadingOlder: true };
            });
        });

        const offStepsInit = wsService.on('steps_init', (data) => {
            console.log('[WS] steps_init:', (data.steps as Step[])?.length, 'for', (data.conversationId as string)?.substring(0, 8), 'baseIndex:', data.baseIndex, 'stepCount:', data.stepCount);
            setState(prev => {
                if (data.conversationId && data.conversationId !== prev.currentConvId) return prev;
                const steps = (data.steps as Step[]) || [];
                const baseIndex = (data.baseIndex as number) ?? 0;
                // Skip if data is identical (avoids unnecessary re-render from 30s fallback)
                if (prev.steps.length === steps.length && prev.baseIndex === baseIndex && !prev.loadingOlder) return prev;
                return {
                    ...prev,
                    steps,
                    baseIndex,
                    stepCount: (data.stepCount as number) ?? steps.length,
                    loadingOlder: false,
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
                // Server-absolute dedup: total is now server-absolute end position
                const serverTotal = (data.total as number) || 0;
                const feTotal = prev.baseIndex + prev.steps.length;
                const newStartsAt = serverTotal - newSteps.length;
                const skipCount = Math.max(0, feTotal - newStartsAt);
                const actualNew = newSteps.slice(skipCount);
                console.log(`[WS] steps_new: ${newSteps.length} incoming, feTotal=${feTotal}, serverTotal=${serverTotal}, newStartsAt=${newStartsAt}, skipCount=${skipCount}, actualNew=${actualNew.length}`);
                if (actualNew.length === 0) return prev;
                return {
                    ...prev,
                    steps: [...prev.steps, ...actualNew],
                    stepCount: serverTotal,
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
                return { ...prev, cascadeStatus: data.status as string };
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
            offStepsLoading();
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
