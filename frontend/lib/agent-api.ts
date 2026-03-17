// === Agent API types and HTTP helpers ===

import { API_BASE } from './config';
import { authHeaders } from './auth';

// ── Types ───────────────────────────────────────────────────────────────

export type AgentWsState = 'disconnected' | 'connecting' | 'connected' | 'busy' | 'reconnecting' | 'error';

export interface AgentSessionInfo {
    id: string;
    state: 'IDLE' | 'ACTIVE' | 'TRANSITIONING';
    cascadeId: string | null;
    cascadeIdShort: string;
    stepCount: number;
    stepSoftLimit: number;
    isBusy: boolean;
    workspace: string;
    transport: string;
    lastActivity: number;
}

export interface AgentMessage {
    id: string;
    role: 'user' | 'agent' | 'system';
    content: string;
    timestamp: number;
    stepIndex?: number;
    stepCount?: number;
    stepType?: string;
}

export interface AgentApiSettings {
    enabled: boolean;
    maxConcurrentSessions: number;
    sessionTimeoutMs: number;
    defaultStepSoftLimit: number;
}

export interface BridgeSettings {
    discordBotToken: string;
    discordChannelId: string;
    discordGuildId: string;
    stepSoftLimit: number;
    allowedBotIds: string[];
    autoStart: boolean;
}

export interface BridgeStatus {
    state: 'IDLE' | 'ACTIVE' | 'TRANSITIONING';
    cascadeId: string | null;
    cascadeIdShort: string;
    stepCount: number;
    softLimit: number;
    log: Array<{ type: string; message: string; ts: number }>;
}

export interface AgentLogEntry {
    sessionId: string;
    transport: string;
    logType: string;
    message: string;
    timestamp: number;
}

// ── HTTP Helpers ────────────────────────────────────────────────────────

export async function fetchAgentSessions(): Promise<AgentSessionInfo[]> {
    const res = await fetch(`${API_BASE}/api/agent/sessions`, { headers: authHeaders() });
    if (!res.ok) throw new Error(`Failed to fetch sessions: ${res.status}`);
    return res.json();
}

export async function destroyAgentSession(sessionId: string): Promise<void> {
    const res = await fetch(`${API_BASE}/api/agent/${sessionId}`, {
        method: 'DELETE',
        headers: authHeaders(),
    });
    if (!res.ok) throw new Error(`Failed to destroy session: ${res.status}`);
}

export async function fetchAgentApiSettings(): Promise<AgentApiSettings> {
    const res = await fetch(`${API_BASE}/api/agent-api/settings`, { headers: authHeaders() });
    if (!res.ok) throw new Error(`Failed to fetch settings: ${res.status}`);
    return res.json();
}

export async function saveAgentApiSettings(settings: Partial<AgentApiSettings>): Promise<AgentApiSettings> {
    const res = await fetch(`${API_BASE}/api/agent-api/settings`, {
        method: 'PUT',
        headers: authHeaders(),
        body: JSON.stringify(settings),
    });
    if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Save failed' }));
        throw new Error(err.error || `Save failed: ${res.status}`);
    }
    return res.json();
}

export async function fetchBridgeSettings(): Promise<BridgeSettings> {
    const res = await fetch(`${API_BASE}/api/agent-bridge/settings`, { headers: authHeaders() });
    if (!res.ok) throw new Error(`Failed to fetch bridge settings: ${res.status}`);
    return res.json();
}

export async function saveBridgeSettings(settings: Partial<BridgeSettings>): Promise<BridgeSettings> {
    const res = await fetch(`${API_BASE}/api/agent-bridge/settings`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify(settings),
    });
    if (!res.ok) throw new Error(`Save failed: ${res.status}`);
    return res.json();
}

export async function fetchBridgeStatus(): Promise<BridgeStatus> {
    const res = await fetch(`${API_BASE}/api/agent-bridge/status`, { headers: authHeaders() });
    if (!res.ok) throw new Error(`Failed to fetch bridge status: ${res.status}`);
    return res.json();
}

export async function startBridge(config: Record<string, unknown> = {}): Promise<BridgeStatus> {
    const res = await fetch(`${API_BASE}/api/agent-bridge/start`, {
        method: 'POST',
        headers: authHeaders(),
        body: JSON.stringify(config),
    });
    const data = await res.json();
    if (!data.ok && data.error) throw new Error(data.error);
    return data;
}

export async function stopBridge(): Promise<void> {
    await fetch(`${API_BASE}/api/agent-bridge/stop`, { method: 'POST', headers: authHeaders() });
}
