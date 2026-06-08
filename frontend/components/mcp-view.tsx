'use client';

import { useEffect, useState, useCallback, useRef } from 'react';
import { lsCall } from '@/lib/cascade-api';
import { Plug, Activity, AlertTriangle, CheckCircle2, Loader2, WrenchIcon, XCircle, ToggleLeft, ToggleRight } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

// === Types (from McpServerState proto) ===
// McpServerSpec fields: server_name, command, args, env, server_url, disabled, ...
interface McpServerSpec {
    server_name?: string;
    command?: string;
    server_url?: string;
    disabled?: boolean;
    [key: string]: unknown;
}

// McpServerStatus enum values from the LS proto
type McpServerStatus =
    | 'MCP_SERVER_STATUS_UNKNOWN'
    | 'MCP_SERVER_STATUS_NOT_CONNECTED'
    | 'MCP_SERVER_STATUS_CONNECTED'
    | 'MCP_SERVER_STATUS_ERROR'
    | string;

// ChatToolDefinition: minimal fields we need
interface ChatToolDefinition {
    name?: string;
    description?: string;
    [key: string]: unknown;
}

// McpServerState (GetMcpServerStates response item)
interface McpServerState {
    spec?: McpServerSpec;
    status?: McpServerStatus;
    error?: string;
    tools?: ChatToolDefinition[];
    tool_errors?: string[];
    auth_url?: string;
    has_auth_token?: boolean;
    [key: string]: unknown;
}

// GetMcpServerStates response envelope
interface GetMcpServerStatesResponse {
    states?: McpServerState[];
    is_loading?: boolean;
    [key: string]: unknown;
}

// === Status helpers ===
function statusBadge(status: McpServerStatus | undefined): React.ReactElement {
    switch (status) {
        case 'MCP_SERVER_STATUS_CONNECTED':
            return (
                <Badge className="text-[10px] h-5 px-1.5 gap-1 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 hover:bg-emerald-500/10">
                    <CheckCircle2 className="w-3 h-3" />
                    Connected
                </Badge>
            );
        case 'MCP_SERVER_STATUS_ERROR':
            return (
                <Badge className="text-[10px] h-5 px-1.5 gap-1 bg-red-500/10 text-red-400 border border-red-500/20 hover:bg-red-500/10">
                    <XCircle className="w-3 h-3" />
                    Error
                </Badge>
            );
        case 'MCP_SERVER_STATUS_NOT_CONNECTED':
            return (
                <Badge className="text-[10px] h-5 px-1.5 gap-1 bg-amber-500/10 text-amber-400 border border-amber-500/20 hover:bg-amber-500/10">
                    <AlertTriangle className="w-3 h-3" />
                    Not Connected
                </Badge>
            );
        default:
            return (
                <Badge className="text-[10px] h-5 px-1.5 bg-muted text-muted-foreground border border-border/30 hover:bg-muted">
                    Unknown
                </Badge>
            );
    }
}

function serverName(state: McpServerState): string {
    return state.spec?.server_name || '(unnamed)';
}

function toolCount(state: McpServerState): number {
    return state.tools?.length ?? 0;
}

// === Main Component ===
export function McpView() {
    const [states, setStates] = useState<McpServerState[] | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [togglingServer, setTogglingServer] = useState<string | null>(null);
    const [toggleErrors, setToggleErrors] = useState<Record<string, string>>({});
    const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
    // Guards async setState after unmount (fetchData is awaited in handleToggle and re-armed on a timer).
    const isMountedRef = useRef(true);

    const fetchData = useCallback(async () => {
        try {
            const res = await lsCall<GetMcpServerStatesResponse>('GetMcpServerStates');
            if (!isMountedRef.current) return;
            setStates(res.states ?? []);
            setError(null);
            // If LS reports discovery still in progress, poll again shortly
            if (res.is_loading) pollTimerRef.current = setTimeout(fetchData, 2000);
        } catch (e: unknown) {
            if (!isMountedRef.current) return;
            setError(e instanceof Error ? e.message : 'Failed to load MCP server states');
        } finally {
            if (isMountedRef.current) setIsLoading(false);
        }
    }, []);

    const handleToggle = useCallback(async (state: McpServerState) => {
        const name = state.spec?.server_name;
        if (!name) return;
        const nextEnabled = state.spec?.disabled === true; // currently disabled → enable; enabled → disable
        setTogglingServer(name);
        setToggleErrors(prev => { const n = { ...prev }; delete n[name]; return n; });
        try {
            await lsCall('ToggleMcpServer', { serverName: name, enabled: nextEnabled });
            await fetchData();
        } catch (e: unknown) {
            if (!isMountedRef.current) return;
            setToggleErrors(prev => ({ ...prev, [name]: e instanceof Error ? e.message : 'Toggle failed' }));
        } finally {
            if (isMountedRef.current) setTogglingServer(null);
        }
    }, [fetchData]);

    useEffect(() => {
        isMountedRef.current = true;
        fetchData();
        return () => {
            isMountedRef.current = false;
            if (pollTimerRef.current !== null) clearTimeout(pollTimerRef.current);
        };
    }, [fetchData]);

    if (isLoading && states === null) {
        return (
            <div className="flex-1 flex items-center justify-center">
                <div className="flex flex-col items-center gap-3">
                    <Activity className="w-8 h-8 text-muted-foreground/50 animate-pulse" />
                    <span className="text-sm text-muted-foreground">Loading MCP servers...</span>
                </div>
            </div>
        );
    }

    if (error !== null) {
        return (
            <div className="flex-1 flex items-center justify-center">
                <div className="flex flex-col items-center gap-3 max-w-sm text-center">
                    <AlertTriangle className="w-8 h-8 text-red-400/60" />
                    <span className="text-sm font-medium text-foreground/70">Failed to load MCP servers</span>
                    <span className="text-xs text-muted-foreground font-mono break-all">{error}</span>
                    <button
                        onClick={() => { if (pollTimerRef.current !== null) clearTimeout(pollTimerRef.current); setIsLoading(true); setError(null); fetchData(); }}
                        className="text-xs px-3 py-1.5 rounded-lg bg-muted/40 hover:bg-muted/70 text-muted-foreground hover:text-foreground transition-colors border border-border/30"
                    >
                        Retry
                    </button>
                </div>
            </div>
        );
    }

    const serverList = states ?? [];

    return (
        <div className="flex-1 overflow-y-auto">
            <div className="max-w-3xl mx-auto p-6 space-y-6">
                {/* Header */}
                <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-gradient-to-br from-violet-500/10 to-indigo-500/10 border border-violet-500/20">
                        <Plug className="w-5 h-5 text-violet-400" />
                    </div>
                    <div>
                        <h2 className="text-lg font-semibold">MCP Servers</h2>
                        <p className="text-xs text-muted-foreground">
                            {serverList.length === 0
                                ? 'No MCP servers configured'
                                : `${serverList.length} server${serverList.length !== 1 ? 's' : ''} configured`}
                        </p>
                    </div>
                    {isLoading && (
                        <Loader2 className="w-4 h-4 text-muted-foreground/50 animate-spin ml-auto" />
                    )}
                </div>

                {/* Server list */}
                {serverList.length === 0 ? (
                    <div className="rounded-xl border border-border/50 bg-card/50 p-10 text-center">
                        <Plug className="w-8 h-8 mx-auto text-muted-foreground/20 mb-3" />
                        <p className="text-sm font-medium text-muted-foreground/60 mb-1">No MCP servers configured</p>
                        <p className="text-xs text-muted-foreground/40 max-w-xs mx-auto">
                            Add MCP servers in Antigravity IDE to extend the agent with external tools.
                        </p>
                    </div>
                ) : (
                    <div className="rounded-xl border border-border/50 bg-card/50 overflow-hidden">
                        {/* Column headers */}
                        <div className="grid grid-cols-[1fr_140px_64px_72px] gap-3 px-4 py-2 text-[10px] text-muted-foreground/50 uppercase tracking-wider font-medium border-b border-border/30 bg-muted/10">
                            <span>Server</span>
                            <span>Status</span>
                            <span className="text-right">Tools</span>
                            <span className="text-right">Enable</span>
                        </div>
                        {/* Rows */}
                        <div className="divide-y divide-border/20">
                            {serverList.map((state, i) => {
                                const name = serverName(state);
                                const count = toolCount(state);
                                const hasError = state.error && state.error.length > 0;
                                const toolList = state.tools ?? [];
                                const svrKey = state.spec?.server_url ?? state.spec?.server_name ?? String(i);
                                const svrName = state.spec?.server_name ?? '';
                                const isDisabled = state.spec?.disabled === true;
                                const isToggling = togglingServer === svrName;
                                const toggleErr = svrName ? toggleErrors[svrName] : undefined;

                                return (
                                    <div key={svrKey} className="group">
                                        {/* Main row */}
                                        <div className="grid grid-cols-[1fr_140px_64px_72px] items-center gap-3 px-4 py-3 hover:bg-muted/20 transition-colors">
                                            <div className="flex items-center gap-2.5 min-w-0">
                                                <Plug className="w-3.5 h-3.5 text-violet-400/60 shrink-0" />
                                                <span className="text-sm font-medium truncate">{name}</span>
                                            </div>
                                            <div>{statusBadge(state.status)}</div>
                                            <div className="flex items-center justify-end gap-1">
                                                <WrenchIcon className="w-3 h-3 text-muted-foreground/40" />
                                                <span className="text-xs font-mono tabular-nums text-muted-foreground">
                                                    {count}
                                                </span>
                                            </div>
                                            <div className="flex items-center justify-end">
                                                <button
                                                    onClick={() => handleToggle(state)}
                                                    disabled={isToggling || !svrName}
                                                    title={isDisabled ? 'Enable server' : 'Disable server'}
                                                    className="flex items-center justify-center w-7 h-7 rounded-md transition-colors hover:bg-muted/40 disabled:opacity-40 disabled:cursor-not-allowed"
                                                    aria-label={isDisabled ? 'Enable server' : 'Disable server'}
                                                >
                                                    {isToggling
                                                        ? <Loader2 className="w-4 h-4 text-muted-foreground/50 animate-spin" />
                                                        : isDisabled
                                                            ? <ToggleLeft className="w-4 h-4 text-muted-foreground/50" />
                                                            : <ToggleRight className="w-4 h-4 text-emerald-400" />
                                                    }
                                                </button>
                                            </div>
                                        </div>

                                        {/* Toggle error row */}
                                        {toggleErr && (
                                            <div className="px-4 pb-2 -mt-1">
                                                <p className="text-[10px] text-amber-400/80 font-mono bg-amber-500/5 border border-amber-500/10 rounded px-2 py-1 break-all">
                                                    Toggle failed: {toggleErr}
                                                </p>
                                            </div>
                                        )}

                                        {/* Error row (if any) */}
                                        {hasError && (
                                            <div className="px-4 pb-2 -mt-1">
                                                <p className="text-[10px] text-red-400/80 font-mono bg-red-500/5 border border-red-500/10 rounded px-2 py-1 break-all">
                                                    {state.error}
                                                </p>
                                            </div>
                                        )}

                                        {/* Tool pills (if connected and has tools) */}
                                        {toolList.length > 0 && (
                                            <div className="px-4 pb-3 flex flex-wrap gap-1.5">
                                                {toolList.map((tool, ti) => (
                                                    <span
                                                        key={`${tool.name ?? ti}`}
                                                        className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-muted/30 text-muted-foreground border border-border/20"
                                                        title={tool.description as string | undefined}
                                                    >
                                                        {tool.name ?? `tool_${ti}`}
                                                    </span>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}

                {/* Footer hint */}
                <p className="text-center text-[10px] text-muted-foreground/40 pb-4">
                    Toggle enables/disables a server without removing its config. Add servers via Antigravity IDE settings.
                </p>
            </div>
        </div>
    );
}
