'use client';
import { useState, useEffect, useCallback } from 'react';
import { API_BASE } from '@/lib/config';
import { authHeaders } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from '@/components/ui/dialog';
import { Plug } from 'lucide-react';

interface Plugin {
    id: string;
    name: string;
    description?: string;
    installed?: boolean;
    version?: string;
    author?: string;
}

export function PluginManager({ open, onClose }: { open: boolean; onClose: () => void }) {
    const [plugins, setPlugins] = useState<Plugin[]>([]);
    const [loading, setLoading] = useState(false);
    const [installing, setInstalling] = useState<string | null>(null);

    const fetchPlugins = useCallback(async () => {
        setLoading(true);
        try {
            const res = await fetch(`${API_BASE}/api/plugins`, { headers: authHeaders() });
            const data = await res.json();
            setPlugins(data.plugins || data.availablePlugins || []);
        } catch {
            setPlugins([]);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        if (open) fetchPlugins();
    }, [open, fetchPlugins]);

    const handleInstall = async (plugin: Plugin) => {
        setInstalling(plugin.id);
        try {
            await fetch(`${API_BASE}/api/plugins/install`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', ...authHeaders() },
                body: JSON.stringify({ pluginId: plugin.id })
            });
            await fetchPlugins();
        } catch (e) {
            console.error('Install error:', e);
        } finally {
            setInstalling(null);
        }
    };

    const handleUninstall = async (pluginId: string) => {
        setInstalling(pluginId);
        try {
            await fetch(`${API_BASE}/api/plugins/${pluginId}`, { method: 'DELETE', headers: authHeaders() });
            await fetchPlugins();
        } catch (e) {
            console.error('Uninstall error:', e);
        } finally {
            setInstalling(null);
        }
    };

    return (
        <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
            <DialogContent className="w-[500px] max-w-[95vw] p-0 overflow-hidden">
                <DialogHeader className="px-5 pt-5 pb-4 border-b border-border">
                    <DialogTitle className="flex items-center gap-2 text-sm">
                        <Plug className="h-4 w-4" /> Plugin Manager
                    </DialogTitle>
                    <DialogDescription className="text-[10px]">
                        Manage Cascade plugins
                    </DialogDescription>
                </DialogHeader>

                <ScrollArea className="max-h-[55vh]">
                    <div className="p-4 space-y-2">
                        {loading ? (
                            <div className="space-y-2">
                                {Array.from({ length: 3 }).map((_, i) => (
                                    <Skeleton key={i} className="h-16 w-full rounded-lg" />
                                ))}
                            </div>
                        ) : plugins.length === 0 ? (
                            <div className="text-center py-8">
                                <div className="mb-2"><Plug className="h-8 w-8 text-muted-foreground" /></div>
                                <div className="text-sm text-muted-foreground">No plugins available</div>
                                <div className="text-[10px] text-muted-foreground/60 mt-1">
                                    Plugins will appear here when the API supports them
                                </div>
                            </div>
                        ) : (
                            plugins.map(p => (
                                <div
                                    key={p.id}
                                    className={`flex items-center gap-3 px-4 py-3 rounded-lg border transition-colors ${p.installed
                                            ? 'bg-green-500/5 border-green-500/20'
                                            : 'bg-muted/10 border-border/40 hover:border-border/60'
                                        }`}
                                >
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <span className="text-xs font-medium">{p.name}</span>
                                            {p.version && (
                                                <span className="text-[9px] text-muted-foreground/50 font-mono">
                                                    v{p.version}
                                                </span>
                                            )}
                                            {p.installed && (
                                                <Badge variant="secondary" className="text-[8px] h-4 px-1.5 bg-green-500/10 text-green-400 border-green-500/20">
                                                    Installed
                                                </Badge>
                                            )}
                                        </div>
                                        {p.description && (
                                            <div className="text-[10px] text-muted-foreground mt-0.5 line-clamp-3">
                                                {p.description}
                                            </div>
                                        )}
                                        {p.author && (
                                            <div className="text-[9px] text-muted-foreground/40 mt-0.5">
                                                by {p.author}
                                            </div>
                                        )}
                                    </div>
                                    <Button
                                        size="sm"
                                        variant={p.installed ? 'destructive' : 'secondary'}
                                        onClick={() => p.installed ? handleUninstall(p.id) : handleInstall(p)}
                                        disabled={installing === p.id}
                                        className="shrink-0 h-7 text-[10px]"
                                    >
                                        {installing === p.id ? '...' : p.installed ? 'Uninstall' : 'Install'}
                                    </Button>
                                </div>
                            ))
                        )}
                    </div>
                </ScrollArea>
            </DialogContent>
        </Dialog>
    );
}
