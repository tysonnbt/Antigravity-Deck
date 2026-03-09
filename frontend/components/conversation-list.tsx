'use client';
import { useState, useEffect, useCallback } from 'react';
import { API_BASE } from '@/lib/config';
import { authHeaders } from '@/lib/auth';
import { cn } from '@/lib/utils';
import type { Workspace } from '@/lib/cascade-api';
import { getWorkspaces } from '@/lib/cascade-api';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Plus, ChevronRight, Folder, MessageSquare } from 'lucide-react';

interface ConvSummary {
    id: string;
    summary: string;
    stepCount: number;
    lastModifiedTime: string;
    status?: string;
}

interface ConversationListProps {
    workspaceName: string;
    wsVersion: number;
    onSelectConversation: (convId: string) => void;
    onNewChat: () => void;
}

export function ConversationList({ workspaceName, wsVersion, onSelectConversation, onNewChat }: ConversationListProps) {
    const [conversations, setConversations] = useState<ConvSummary[]>([]);
    const [loading, setLoading] = useState(true);
    const [workspace, setWorkspace] = useState<Workspace | null>(null);

    const loadConversations = useCallback(async () => {
        setLoading(true);
        try {
            const workspaces = await getWorkspaces();
            const ws = workspaces.find(w => w.workspaceName === workspaceName);
            if (ws) setWorkspace(ws);

            const res = await fetch(`${API_BASE}/api/workspaces/${encodeURIComponent(workspaceName)}/conversations`, { headers: authHeaders() });
            const json = await res.json();
            const convs: ConvSummary[] = Object.entries(json.trajectorySummaries || {}).map(
                ([id, info]: [string, any]) => ({
                    id,
                    summary: info.summary || 'Untitled',
                    stepCount: info.stepCount || 0,
                    lastModifiedTime: info.lastModifiedTime || '',
                    status: info.status || '',
                })
            );
            convs.sort((a, b) => (b.lastModifiedTime || '').localeCompare(a.lastModifiedTime || ''));
            setConversations(convs);
        } catch (e) {
            console.error('Failed to load conversations:', e);
            setConversations([]);
        } finally {
            setLoading(false);
        }
    }, [workspaceName]);

    useEffect(() => {
        loadConversations();
    }, [loadConversations, wsVersion]);

    useEffect(() => {
        const interval = setInterval(loadConversations, 15000);
        return () => clearInterval(interval);
    }, [loadConversations]);

    const formatTime = (iso: string) => {
        if (!iso) return '';
        try {
            const d = new Date(iso);
            const now = new Date();
            const diffMs = now.getTime() - d.getTime();
            const diffMin = Math.floor(diffMs / 60000);
            if (diffMin < 1) return 'Just now';
            if (diffMin < 60) return `${diffMin}m ago`;
            const diffHr = Math.floor(diffMin / 60);
            if (diffHr < 24) return `${diffHr}h ago`;
            const diffDay = Math.floor(diffHr / 24);
            if (diffDay < 7) return `${diffDay}d ago`;
            return d.toLocaleDateString();
        } catch {
            return '';
        }
    };

    const getStatusColor = (status: string) => {
        if (status?.includes('RUNNING')) return 'bg-purple-400';
        if (status?.includes('WAITING')) return 'bg-amber-400';
        if (status?.includes('DONE') || status?.includes('COMPLETED')) return 'bg-green-400';
        return 'bg-muted-foreground/30';
    };

    return (
        <div className="flex-1 flex flex-col min-h-0">
            {/* Header */}
            <div className="px-4 pt-4 pb-3 sm:px-6 sm:pt-6 sm:pb-4 border-b border-border/50 flex-shrink-0">
                <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2.5">
                        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center text-sm">
                            <Folder className="h-4 w-4" />
                        </div>
                        <div>
                            <h2 className="text-base font-semibold text-foreground">
                                {workspace?.workspaceName || 'Workspace'}
                            </h2>
                            <p className="text-[11px] text-muted-foreground">
                                {conversations.length} conversation{conversations.length !== 1 ? 's' : ''}
                            </p>
                        </div>
                    </div>
                    <Button size="sm" onClick={onNewChat} className="gap-1.5">
                        <Plus className="h-3.5 w-3.5" />
                        New Chat
                    </Button>
                </div>
            </div>

            {/* Conversation list */}
            <ScrollArea className="flex-1">
                {loading ? (
                    <div className="p-4 space-y-2">
                        {Array.from({ length: 5 }).map((_, i) => (
                            <Skeleton key={i} className="h-14 w-full rounded-lg" />
                        ))}
                    </div>
                ) : conversations.length === 0 ? (
                    <div className="flex items-center justify-center py-16">
                        <div className="text-center space-y-3">
                            <div><MessageSquare className="h-10 w-10 text-muted-foreground/40" /></div>
                            <h3 className="text-sm font-medium text-foreground/70">No conversations yet</h3>
                            <p className="text-xs text-muted-foreground max-w-xs">
                                Start a new chat to begin working in this workspace.
                            </p>
                            <Button variant="outline" size="sm" onClick={onNewChat} className="mt-2">
                                Start your first chat
                            </Button>
                        </div>
                    </div>
                ) : (
                    <div className="p-2 sm:p-4 space-y-1 sm:space-y-1.5">
                        {conversations.map(conv => (
                            <Button
                                key={conv.id}
                                variant="ghost"
                                onClick={() => onSelectConversation(conv.id)}
                                className="w-full h-auto text-left justify-start px-3 sm:px-4 py-3 rounded-lg border border-transparent hover:border-border/50 group"
                            >
                                <div className="flex items-start gap-3 w-full min-w-0">
                                    <div className={cn(
                                        'w-2 h-2 rounded-full mt-1.5 shrink-0 transition-colors',
                                        getStatusColor(conv.status || '')
                                    )} />
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center justify-between gap-2 mb-0.5">
                                            <span className="text-sm font-medium truncate text-foreground/90 group-hover:text-foreground">
                                                {conv.summary}
                                            </span>
                                            <span className="text-[10px] text-muted-foreground/60 shrink-0">
                                                {formatTime(conv.lastModifiedTime)}
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-2">
                                            <span className="text-[10px] text-muted-foreground/50">
                                                {conv.stepCount} steps
                                            </span>
                                            <span className="text-[10px] text-muted-foreground/30 font-mono">
                                                {conv.id.substring(0, 8)}
                                            </span>
                                        </div>
                                    </div>
                                    <ChevronRight className="w-4 h-4 text-muted-foreground/30 group-hover:text-muted-foreground/60 shrink-0 mt-1 transition-colors" />
                                </div>
                            </Button>
                        ))}
                    </div>
                )}
            </ScrollArea>
        </div>
    );
}
