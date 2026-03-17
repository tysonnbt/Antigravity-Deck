'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { getOrchestratorWsUrl } from '@/lib/config';
import { authWsUrl } from '@/lib/auth';
import type {
    OrchestratorState, OrchestratorPlan,
    SubtaskStatus, OrchestratorEvent, OrchestratorLog,
} from '@/lib/orchestrator-api';
import type {
    OrchestratorChatMessage, ActivityState, PendingClarification,
} from '../lib/orchestrator-chat-types';
import {
    createUserMessage, createAssistantMessage, createProgressMessageId, generateMessageId,
} from '../lib/orchestrator-chat-types';

export type WsConnectionState = 'idle' | 'connecting' | 'connected' | 'reconnecting' | 'error';

const MAX_RETRIES = 3;
const BACKOFF = [1000, 2000, 4000];

export function useOrchestratorWs() {
    const [connectionState, setConnectionState] = useState<WsConnectionState>('idle');
    const [orchestrationId, setOrchestrationId] = useState<string | null>(null);
    const [state, setOState] = useState<OrchestratorState | null>(null);
    const [plan, setPlan] = useState<OrchestratorPlan | null>(null);
    const [subtasks, setSubtasks] = useState<Record<string, SubtaskStatus>>({});
    const [progress, setProgress] = useState(0);
    const [elapsed, setElapsed] = useState(0);
    const [events, setEvents] = useState<OrchestratorEvent[]>([]);
    const [logs, setLogs] = useState<OrchestratorLog[]>([]);
    const [error, setError] = useState<string | null>(null);

    // Chat state
    const [messages, setMessages] = useState<OrchestratorChatMessage[]>([]);
    const [activityState, setActivityState] = useState<ActivityState>('idle');
    const [pendingClarifications, setPendingClarifications] = useState<PendingClarification[]>([]);

    const wsRef = useRef<WebSocket | null>(null);
    const retryRef = useRef(0);
    const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    const orchIdRef = useRef<string | null>(null);
    const mountedRef = useRef(true);
    const workspaceRef = useRef<string | undefined>(undefined);

    useEffect(() => { orchIdRef.current = orchestrationId; }, [orchestrationId]);
    useEffect(() => {
        mountedRef.current = true;
        return () => {
            mountedRef.current = false;
            if (retryTimerRef.current) clearTimeout(retryTimerRef.current);
            if (wsRef.current) { wsRef.current.onclose = null; wsRef.current.close(); }
        };
    }, []);

    const wsSend = useCallback((data: Record<string, unknown>) => {
        if (wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify(data));
        }
    }, []);

    const addLog = useCallback((log: OrchestratorLog) => {
        setLogs(prev => [...prev.slice(-200), log]);
    }, []);

    const sendMessage = useCallback((content: string, options?: { intent?: string; replyTo?: string; silent?: boolean }) => {
        if (!content.trim() || !wsRef.current) return;

        // silent: true = button-driven action (approve/cancel), don't show user bubble
        if (!options?.silent) {
            const userMsg = createUserMessage(content);
            setMessages(prev => [...prev, userMsg]);
        }
        setActivityState('thinking');

        const payload: Record<string, unknown> = { type: 'chat_message', content };
        if (options?.intent) payload.intent = options.intent;
        if (options?.replyTo) payload.replyTo = options.replyTo;
        // Include workspace for session creation on first message
        if (workspaceRef.current) payload.workspace = workspaceRef.current;

        wsRef.current.send(JSON.stringify(payload));
    }, []);

    const resetChat = useCallback(() => {
        if (wsRef.current) {
            wsRef.current.send(JSON.stringify({ type: 'chat_reset' }));
        }
        setMessages([]);
        setActivityState('idle');
        setPendingClarifications([]);
    }, []);

    const handleMessage = useCallback((event: MessageEvent) => {
        if (!mountedRef.current) return;
        let data: Record<string, unknown>;
        try { data = JSON.parse(event.data as string); } catch { return; }

        const type = data.type as string;

        switch (type) {
            case 'orch_started':
                setOrchestrationId(data.orchestrationId as string);
                setOState(data.state as OrchestratorState);
                setConnectionState('connected');
                break;

            case 'orch_analysis':
                setOState('ANALYZING');
                setEvents(prev => [...prev.slice(-50), { type, orchestrationId: data.orchestrationId as string, timestamp: Date.now(), data }]);
                break;

            case 'orch_plan':
                setPlan(data.plan as OrchestratorPlan);
                setOState('AWAITING_APPROVAL');
                setMessages(prev => [...prev, createAssistantMessage(
                    (data.plan as OrchestratorPlan)?.summary || 'Plan ready for review',
                    'plan',
                    { plan: data.plan as OrchestratorPlan },
                    [
                        { label: 'Approve', action: 'approve', variant: 'default' },
                        { label: 'Revise', action: 'revise', variant: 'default' },
                    ],
                )]);
                setActivityState('idle');
                break;

            case 'orch_awaiting_approval':
                setOState('AWAITING_APPROVAL');
                break;

            case 'orch_executing':
                setOState('EXECUTING');
                setMessages(prev => [...prev, {
                    id: createProgressMessageId(data.orchestrationId as string),
                    role: 'assistant' as const,
                    content: 'Executing subtasks...',
                    timestamp: Date.now(),
                    messageType: 'progress' as const,
                    metadata: { subtasks: {}, progress: 0, elapsed: 0 },
                    actions: [{ label: 'Cancel', action: 'cancel', variant: 'destructive' as const }],
                }]);
                setActivityState('executing');
                break;

            case 'orch_subtask_update':
                setSubtasks(prev => ({
                    ...prev,
                    [data.taskId as string]: {
                        ...prev[data.taskId as string],
                        state: data.state as SubtaskStatus['state'],
                        result: (data.result as string) ?? prev[data.taskId as string]?.result ?? null,
                    },
                }));
                setMessages(prev => prev.map(m =>
                    m.id === createProgressMessageId(data.orchestrationId as string)
                        ? {
                            ...m,
                            metadata: {
                                ...m.metadata,
                                subtasks: {
                                    ...m.metadata?.subtasks,
                                    [data.taskId as string]: {
                                        state: data.state as SubtaskStatus['state'],
                                        result: (data.result as string) ?? null,
                                        description: (data.description as string) ?? '',
                                        affectedFiles: (data.affectedFiles as string[]) ?? [],
                                        retries: (data.retries as number) ?? 0,
                                        startedAt: (data.startedAt as number) ?? null,
                                        completedAt: (data.completedAt as number) ?? null,
                                        reviewDecision: (data.reviewDecision as string) ?? null,
                                        clarificationQuestion: (data.clarificationQuestion as string) ?? null,
                                        sessionId: (data.sessionId as string) ?? null,
                                    } satisfies SubtaskStatus,
                                },
                            },
                        }
                        : m
                ));
                break;

            case 'orch_phase_complete':
                setEvents(prev => [...prev.slice(-50), { type, orchestrationId: data.orchestrationId as string, timestamp: Date.now(), data }]);
                setMessages(prev => [...prev, createAssistantMessage(
                    `Phase ${data.phase as string} complete (${data.completedTasks as number} tasks)`,
                    'phase_complete',
                )]);
                break;

            case 'orch_clarification':
                setSubtasks(prev => ({
                    ...prev,
                    [data.taskId as string]: {
                        ...prev[data.taskId as string],
                        state: 'clarification',
                        clarificationQuestion: data.question as string,
                    },
                }));
                setMessages(prev => [...prev, createAssistantMessage(
                    `Task ${data.taskId as string} is asking: ${data.question as string}`,
                    'text',
                    { pendingClarification: { taskId: data.taskId as string, question: data.question as string } },
                )]);
                setPendingClarifications(prev => [...prev, { taskId: data.taskId as string, question: data.question as string }]);
                break;

            case 'orch_review':
                setOState('REVIEWING');
                setEvents(prev => [...prev.slice(-50), { type, orchestrationId: data.orchestrationId as string, timestamp: Date.now(), data }]);
                setMessages(prev => [...prev, createAssistantMessage(
                    'Review complete',
                    'review',
                    { decisions: data.decisions as Array<{ taskId: string; action: string; reason: string }> },
                )]);
                setActivityState('reviewing');
                break;

            case 'orch_progress':
                setProgress(data.progress as number);
                setElapsed(data.elapsed as number);
                setMessages(prev => prev.map(m =>
                    m.id === createProgressMessageId(data.orchestrationId as string)
                        ? { ...m, metadata: { ...m.metadata, progress: data.progress as number, elapsed: data.elapsed as number } }
                        : m
                ));
                break;

            case 'orch_completed':
                setOState('COMPLETED');
                setMessages(prev => [...prev, createAssistantMessage(
                    (data.summary as string) || 'Orchestration completed',
                    'completed',
                    {},
                    [{ label: 'New Chat', action: 'reset', variant: 'default' }],
                )]);
                setActivityState('idle');
                break;

            case 'orch_failed':
                setOState('FAILED');
                setError(data.reason as string);
                setMessages(prev => [...prev, createAssistantMessage(
                    (data.reason as string) || 'Orchestration failed',
                    'failed',
                    { error: data.reason as string },
                    [
                        { label: 'Retry', action: 'retry', variant: 'default' },
                        { label: 'New Chat', action: 'reset', variant: 'default' },
                    ],
                )]);
                setActivityState('idle');
                break;

            case 'orch_cancelled':
                setOState('CANCELLED');
                setMessages(prev => [...prev, createAssistantMessage(
                    'Orchestration cancelled',
                    'cancelled',
                    {},
                    [{ label: 'New Chat', action: 'reset', variant: 'default' }],
                )]);
                setActivityState('idle');
                break;

            case 'orch_log':
                addLog(data as unknown as OrchestratorLog);
                break;

            case 'orch_error':
                setError(data.message as string);
                break;

            case 'orch_status':
                // Full status restore (used after reconnect)
                setOState(data.state as OrchestratorState);
                setPlan(data.plan as OrchestratorPlan | null);
                setSubtasks(data.subtasks as Record<string, SubtaskStatus>);
                setProgress(data.progress as number);
                setElapsed(data.elapsed as number);
                if (data.chatHistory) {
                    setMessages((data.chatHistory as Array<{ role: string; content: string; timestamp: number; messageType?: string }>).map((m) => ({
                        id: generateMessageId(),
                        role: m.role as 'user' | 'assistant',
                        content: m.content,
                        timestamp: m.timestamp,
                        messageType: (m.messageType || 'text') as OrchestratorChatMessage['messageType'],
                    })));
                }
                if (data.plannerBusy) {
                    setActivityState('thinking');
                }
                break;

            case 'chat_response': {
                const msg = createAssistantMessage(data.content as string, data.messageType as OrchestratorChatMessage['messageType']);
                setMessages(prev => [...prev, msg]);
                if (data.messageType === 'queued') {
                    setActivityState('queued');
                } else {
                    setActivityState('idle');
                }
                break;
            }

            case 'chat_reset_ack': {
                setMessages([]);
                setActivityState('idle');
                break;
            }
        }
    }, [addLog]);

    const attemptConnect = useCallback(async () => {
        try {
            const wsUrl = await getOrchestratorWsUrl();
            const url = authWsUrl(wsUrl);
            const ws = new WebSocket(url);
            wsRef.current = ws;

            ws.onopen = () => {
                if (!mountedRef.current) { ws.close(); return; }
                setConnectionState('connected');
                retryRef.current = 0;
                setError(null);

                if (orchIdRef.current) {
                    ws.send(JSON.stringify({ type: 'orchestrate_status', orchestrationId: orchIdRef.current }));
                }
            };

            ws.onmessage = handleMessage;

            ws.onclose = () => {
                if (!mountedRef.current) return;
                wsRef.current = null;
                setConnectionState(prev => {
                    if (prev === 'idle') return prev;
                    if (retryRef.current >= MAX_RETRIES) {
                        setError('Connection lost after 3 retries');
                        return 'error';
                    }
                    const delay = BACKOFF[retryRef.current] || 4000;
                    retryRef.current++;
                    retryTimerRef.current = setTimeout(() => {
                        if (mountedRef.current) attemptConnect();
                    }, delay);
                    return 'reconnecting';
                });
            };

            ws.onerror = () => { /* onclose handles it */ };
        } catch (e) {
            if (!mountedRef.current) return;
            setError(e instanceof Error ? e.message : 'Connection failed');
            setConnectionState('error');
        }
    }, [handleMessage]);

    const connect = useCallback(async () => {
        if (wsRef.current) { wsRef.current.onclose = null; wsRef.current.close(); }
        if (retryTimerRef.current) { clearTimeout(retryTimerRef.current); retryTimerRef.current = null; }
        retryRef.current = 0;
        setError(null);
        setConnectionState('connecting');
        await attemptConnect();
    }, [attemptConnect]);

    const disconnect = useCallback(() => {
        if (retryTimerRef.current) { clearTimeout(retryTimerRef.current); retryTimerRef.current = null; }
        retryRef.current = 0;
        if (wsRef.current) { wsRef.current.onclose = null; wsRef.current.close(); wsRef.current = null; }
        setConnectionState('idle');
        setOrchestrationId(null);
        setOState(null);
        setPlan(null);
        setSubtasks({});
        setProgress(0);
        setElapsed(0);
        setEvents([]);
        setLogs([]);
        setError(null);
    }, []);

    const orchestrate = useCallback((task: string, workspace?: string) => {
        workspaceRef.current = workspace;
        wsSend({ type: 'orchestrate', task, workspace });
    }, [wsSend]);

    const execute = useCallback((configOverrides?: Record<string, unknown>) => {
        if (!orchIdRef.current) return;
        wsSend({ type: 'orchestrate_execute', orchestrationId: orchIdRef.current, configOverrides });
    }, [wsSend]);

    const doRevisePlan = useCallback((feedback: string) => {
        if (!orchIdRef.current) return;
        wsSend({ type: 'orchestrate_revise', orchestrationId: orchIdRef.current, feedback });
    }, [wsSend]);

    const cancel = useCallback(() => {
        if (!orchIdRef.current) return;
        wsSend({ type: 'orchestrate_cancel', orchestrationId: orchIdRef.current });
    }, [wsSend]);

    const doAnswerClarification = useCallback((taskId: string, answer: string) => {
        if (!orchIdRef.current) return;
        wsSend({ type: 'orchestrate_clarify', orchestrationId: orchIdRef.current, taskId, answer });
    }, [wsSend]);

    const setWorkspace = useCallback((ws: string) => {
        workspaceRef.current = ws;
    }, []);

    return {
        connectionState, orchestrationId, state, plan, subtasks,
        progress, elapsed, events, logs, error,
        connect, disconnect, orchestrate, execute,
        revisePlan: doRevisePlan, cancel, answerClarification: doAnswerClarification,
        messages, sendMessage, resetChat, activityState, pendingClarifications,
        setWorkspace,
    };
}

export type UseOrchestratorReturn = ReturnType<typeof useOrchestratorWs>;
