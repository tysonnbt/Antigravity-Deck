'use client';

import { useState, useEffect } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Users, MessageSquare, Settings2, ScrollText } from 'lucide-react';
import { useAgentWs } from '@/hooks/use-agent-ws';
import { AgentSessionsPanel } from '@/components/agent-hub/sessions-panel';
import { AgentChatPanel } from '@/components/agent-hub/chat-panel';
import { AgentConfigPanel } from '@/components/agent-hub/config-panel';
import { AgentLogsPanel } from '@/components/agent-hub/logs-panel';
import { API_BASE } from '@/lib/config';
import { authHeaders } from '@/lib/auth';

export function AgentHubView() {
    const agentWs = useAgentWs();
    const [workspaces, setWorkspaces] = useState<string[]>([]);

    // Fetch workspace list for the Chat panel's workspace selector
    useEffect(() => {
        (async () => {
            try {
                const res = await fetch(`${API_BASE}/api/workspaces`, { headers: authHeaders() });
                if (res.ok) {
                    const data = await res.json();
                    // data is an array of workspace objects with .name
                    const names = Array.isArray(data)
                        ? data.map((w: { name?: string; workspaceName?: string }) => w.name || w.workspaceName || '').filter(Boolean)
                        : [];
                    setWorkspaces(names);
                }
            } catch { /* silent */ }
        })();
    }, []);

    // Chat tab badge: show dot when connected
    const chatConnected = agentWs.state === 'connected' || agentWs.state === 'busy';

    return (
        <div className="flex flex-col h-full bg-background">
            {/* Header */}
            <div className="flex items-center px-4 py-2 border-b border-border/30 shrink-0">
                <span className="text-xs font-semibold text-foreground/80">Agent Hub</span>
            </div>

            {/* Tabs */}
            <Tabs defaultValue="sessions" className="flex flex-col flex-1 min-h-0">
                <TabsList className="w-full justify-start rounded-none border-b border-border/20 bg-transparent h-8 px-2">
                    <TabsTrigger value="sessions" className="text-[10px] h-6 gap-1 px-2 data-[state=active]:bg-muted/10">
                        <Users className="h-3 w-3" /> Sessions
                    </TabsTrigger>
                    <TabsTrigger value="chat" className="text-[10px] h-6 gap-1 px-2 data-[state=active]:bg-muted/10 relative">
                        <MessageSquare className="h-3 w-3" /> Chat
                        {chatConnected && (
                            <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-emerald-400" />
                        )}
                    </TabsTrigger>
                    <TabsTrigger value="config" className="text-[10px] h-6 gap-1 px-2 data-[state=active]:bg-muted/10">
                        <Settings2 className="h-3 w-3" /> Config
                    </TabsTrigger>
                    <TabsTrigger value="logs" className="text-[10px] h-6 gap-1 px-2 data-[state=active]:bg-muted/10">
                        <ScrollText className="h-3 w-3" /> Logs
                    </TabsTrigger>
                </TabsList>

                <TabsContent value="sessions" className="flex-1 min-h-0 m-0">
                    <AgentSessionsPanel />
                </TabsContent>

                <TabsContent value="chat" className="flex-1 min-h-0 m-0">
                    <AgentChatPanel agentWs={agentWs} workspaces={workspaces} />
                </TabsContent>

                <TabsContent value="config" className="flex-1 min-h-0 m-0">
                    <AgentConfigPanel />
                </TabsContent>

                <TabsContent value="logs" className="flex-1 min-h-0 m-0 relative">
                    <AgentLogsPanel />
                </TabsContent>
            </Tabs>
        </div>
    );
}
