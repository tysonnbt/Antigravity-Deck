'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { Step, ConversationsResponse, TrajectorySummary } from './types';
import { extractStepContent } from './step-utils';
import { showNotification } from './notifications';
import { API_BASE } from './config';
import { authHeaders } from './auth';
import { getCascadeStatus } from './cascade-api';
import { wsService } from './ws-service';

interface WSState {
    connected: boolean;  // WebSocket connection to backend
    detected: boolean;   // Windsurf Language Server detected by backend
    steps: Step[];
    conversations: Record<string, TrajectorySummary>;
    currentConvId: string | null;
    cascadeStatus: string | null;
    lastUpdate: string;
    conversationsVersion: number; // bumped when backend discovers new conversations
    stepContentVersion: number; // bumped on step_updated (streaming content changes)
}

export function useWebSocket() {
    // Restore conversation ID from localStorage for seamless refresh
    const storedConvId = typeof window !== 'undefined'
        ? (() => { try { const v = localStorage.getItem('antigravity-current-conv-id'); return v ? JSON.parse(v) : null; } catch { return null; } })()
        : null;

    const [state, setState] = useState<WSState>({
        connected: false,
        detected: false,
        steps: [] as Step[],
        conversations: {} as Record<string, TrajectorySummary>,
        currentConvId: storedConvId,
        cascadeStatus: null,
        lastUpdate: '',
        conversationsVersion: 0,
        stepContentVersion: 0,
    });
    // Use refs for values needed in WS handlers to avoid stale closures
    const currentConvIdRef = useRef<string | null>(storedConvId);

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
        });

        const offClose = wsService.on('__ws_close', () => {
            setState(prev => ({ ...prev, connected: false, detected: false }));
        });

        const offStatus = wsService.on('status', (data) => {
            console.log('[WS] status:', data.detected);
            setState(prev => ({ ...prev, detected: !!data.detected }));
            if (data.detected) loadConversationsRef.current();
        });

        const offStepsInit = wsService.on('steps_init', (data) => {
            console.log('[WS] steps_init:', (data.steps as Step[])?.length, 'for', (data.conversationId as string)?.substring(0, 8));
            setState(prev => {
                if (data.conversationId && data.conversationId !== prev.currentConvId) return prev;
                return {
                    ...prev,
                    steps: (data.steps as Step[]) || [],
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
                const currentLen = prev.steps.length;
                const expectedStart = data.total ? (data.total as number) - newSteps.length : currentLen;
                const skipCount = Math.max(0, currentLen - expectedStart);
                const actualNew = newSteps.slice(skipCount);
                console.log(`[WS] steps_new: ${newSteps.length} incoming, currentLen=${currentLen}, total=${data.total}, expectedStart=${expectedStart}, skipCount=${skipCount}, actualNew=${actualNew.length}`);
                if (actualNew.length === 0) return prev;
                return {
                    ...prev,
                    steps: [...prev.steps, ...actualNew],
                    lastUpdate: new Date().toLocaleTimeString(),
                };
            });
            // Desktop notification for agent responses when tab hidden
            const notifySteps = ((data.steps as Step[]) || []).filter((s: Step) => s.type === 'CORTEX_STEP_TYPE_NOTIFY_USER');
            if (notifySteps.length > 0) {
                const content = extractStepContent(notifySteps[0]) || 'Agent needs your attention';
                showNotification('AntigravityChat', content);
            }
        });

        const offStepUpdated = wsService.on('step_updated', (data) => {
            setState(prev => {
                if (data.conversationId && data.conversationId !== prev.currentConvId) return prev;
                const updated = [...prev.steps];
                const index = data.index as number;
                if (index >= 0 && index < updated.length) {
                    updated[index] = data.step as Step;
                }
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

        return () => {
            offOpen();
            offClose();
            offStatus();
            offStepsInit();
            offStepsNew();
            offStepUpdated();
            offCascadeStatus();
            offConvUpdated();
        };
    }, []);

    const selectConversation = useCallback((id: string | null) => {
        currentConvIdRef.current = id; // update ref immediately for WS handlers
        setState(prev => ({ ...prev, currentConvId: id, steps: [], cascadeStatus: null }));
        if (id && wsService) {
            wsService.send({ type: 'set_conversation', conversationId: id });
        }
    }, []);

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

    return { ...state, selectConversation, loadConversations };
}
