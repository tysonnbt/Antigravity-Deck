'use client';

import { useEffect, useRef, useState, useCallback } from 'react';
import { Step, ConversationsResponse, TrajectorySummary } from './types';
import { extractStepContent } from './step-utils';
import { showNotification } from './notifications';
import { API_BASE, getWsUrl } from './config';
import { authHeaders, authWsUrl } from './auth';
import { getCascadeStatus } from './cascade-api';

interface WSState {
    connected: boolean;
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
}

export function useWebSocket() {
    // Restore conversation ID from localStorage for seamless refresh
    const storedConvId = typeof window !== 'undefined'
        ? (() => { try { const v = localStorage.getItem('antigravity-current-conv-id'); return v ? JSON.parse(v) : null; } catch { return null; } })()
        : null;

    const [state, setState] = useState<WSState>({
        connected: false,
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
    });
    const wsRef = useRef<WebSocket | null>(null);
    const reconnectRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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

    // Stable ref for loadConversations so connect doesn't depend on it
    const loadConversationsRef = useRef(loadConversations);
    loadConversationsRef.current = loadConversations;

    const connect = useCallback(async () => {
        try {
            const wsBase = await getWsUrl();
            const ws = new WebSocket(authWsUrl(wsBase));
            wsRef.current = ws;

            ws.onopen = () => {
                console.log('[WS] connected, re-syncing conversation...');
                // Use ref for immediate access to current conv ID (no stale closure)
                const convId = currentConvIdRef.current;
                console.log('[WS] onopen currentConvId:', convId?.substring(0, 8));
                if (convId && ws.readyState === 1) {
                    ws.send(JSON.stringify({ type: 'set_conversation', conversationId: convId }));
                }
            };

            ws.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    if (data.type === 'status') {
                        console.log('[WS] status:', data.detected);
                        setState(prev => ({ ...prev, connected: data.detected }));
                        if (data.detected) loadConversationsRef.current();
                    } else if (data.type === 'steps_init') {
                        console.log('[WS] steps_init:', data.steps?.length, 'for', data.conversationId?.substring(0, 8), 'baseIndex:', data.baseIndex, 'stepCount:', data.stepCount);
                        setState(prev => {
                            // Only accept init for current conversation
                            if (data.conversationId && data.conversationId !== prev.currentConvId) return prev;
                            return {
                                ...prev,
                                steps: data.steps || [],
                                baseIndex: data.baseIndex ?? 0,
                                stepCount: data.stepCount ?? (data.steps?.length || 0),
                                lastUpdate: new Date().toLocaleTimeString(),
                            };
                        });
                        // Fetch cascade status on init (handles reload/reconnect)
                        const convId = data.conversationId || currentConvIdRef.current;
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
                    } else if (data.type === 'steps_new') {
                        console.log('[WS] steps_new received:', data.steps?.length, 'for', data.conversationId?.substring(0, 8));
                        setState(prev => {
                            // Only append if same conversation
                            if (data.conversationId && data.conversationId !== prev.currentConvId) {
                                console.log('[WS] steps_new SKIP: conv mismatch', data.conversationId?.substring(0, 8), '!=', prev.currentConvId?.substring(0, 8));
                                return prev;
                            }
                            const newSteps = data.steps || [];
                            if (newSteps.length === 0) return prev;
                            // Dedup: only append steps beyond current length
                            const currentLen = prev.steps.length;
                            const expectedStart = data.total ? data.total - newSteps.length : currentLen;
                            const skipCount = Math.max(0, currentLen - expectedStart);
                            const actualNew = newSteps.slice(skipCount);
                            console.log(`[WS] steps_new: ${newSteps.length} incoming, currentLen=${currentLen}, total=${data.total}, expectedStart=${expectedStart}, skipCount=${skipCount}, actualNew=${actualNew.length}`);
                            if (actualNew.length === 0) return prev;
                            // Update stepCount from backend metadata
                            const newStepCount = data.baseIndex !== undefined
                                ? (data.baseIndex + (data.total || (currentLen + actualNew.length)))
                                : prev.stepCount + actualNew.length;
                            return {
                                ...prev,
                                steps: [...prev.steps, ...actualNew],
                                stepCount: newStepCount,
                                lastUpdate: new Date().toLocaleTimeString(),
                            };
                        });
                        // Desktop notification for agent responses when tab hidden
                        const notifySteps = (data.steps || []).filter((s: Step) => s.type === 'CORTEX_STEP_TYPE_NOTIFY_USER');
                        if (notifySteps.length > 0) {
                            const content = extractStepContent(notifySteps[0]) || 'Agent needs your attention';
                            showNotification('AntigravityChat', content);
                        }
                    } else if (data.type === 'step_updated') {
                        setState(prev => {
                            if (data.conversationId && data.conversationId !== prev.currentConvId) return prev;
                            // Convert server-absolute index to local array index
                            const localIndex = data.index - prev.baseIndex;
                            if (localIndex < 0 || localIndex >= prev.steps.length) return prev;
                            const updated = [...prev.steps];
                            updated[localIndex] = data.step;
                            return { ...prev, steps: updated, lastUpdate: new Date().toLocaleTimeString() };
                        });
                    } else if (data.type === 'cascade_status') {
                        setState(prev => {
                            if (data.conversationId && data.conversationId !== prev.currentConvId) return prev;
                            return { ...prev, cascadeStatus: data.status };
                        });
                    } else if (data.type === 'conversations_updated') {
                        // Backend discovered new conversations — bump version to trigger sidebar refresh
                        console.log('[WS] conversations_updated — refreshing sidebar');
                        setState(prev => ({ ...prev, conversationsVersion: prev.conversationsVersion + 1 }));
                    }
                } catch (e) {
                    console.error('WS parse error:', e);
                }
            };

            ws.onclose = () => {
                setState(prev => ({ ...prev, connected: false }));
                reconnectRef.current = setTimeout(connect, 2000);
            };

            ws.onerror = () => ws.close();
        } catch {
            reconnectRef.current = setTimeout(connect, 2000);
        }
    }, []); // No dependencies — fully stable function

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
        if (id && wsRef.current?.readyState === 1) {
            wsRef.current.send(JSON.stringify({ type: 'set_conversation', conversationId: id }));
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

    useEffect(() => {
        connect();
        return () => {
            if (reconnectRef.current) clearTimeout(reconnectRef.current);
            wsRef.current?.close();
        };
    }, [connect]);

    // Fallback safety net: re-sync only for rare missed WS broadcasts
    // Primary data flow is BE push (cascade_status + steps_new), not this timer
    useEffect(() => {
        const fallback = setInterval(() => {
            const convId = currentConvIdRef.current;
            const ws = wsRef.current;
            if (convId && ws?.readyState === 1) {
                ws.send(JSON.stringify({ type: 'set_conversation', conversationId: convId }));
            }
        }, 30000); // 30s — safety net only, not primary data flow
        return () => clearInterval(fallback);
    }, []);

    return { ...state, selectConversation, loadConversations, loadOlder };
}
