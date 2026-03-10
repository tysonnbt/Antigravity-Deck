'use client';

import { useState, useRef, useCallback, useEffect } from 'react';
import { cascadeSend, cascadeSubmit, getWorkspaces, getModels } from '@/lib/cascade-api';
import type { Workspace, CascadeModel } from '@/lib/cascade-api';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Image as ImageIcon } from 'lucide-react';

interface CascadeMessage {
    id: string;
    role: 'user' | 'system' | 'error';
    text: string;
    cascadeId?: string;
    timestamp: Date;
}

interface CascadePanelProps {
    currentConvId?: string | null;
    /** Workspace name that the currently selected cascade belongs to */
    currentWorkspace?: string | null;
    /** Bumped when workspaces change externally (e.g. sidebar creates one) */
    wsVersion?: number;
    onCascadeCreated?: (cascadeId: string) => void;
    /** Called when user clicks "New Chat" — parent should clear currentConvId */
    onNewConversation?: () => void;
}

export function CascadePanel({ currentConvId, currentWorkspace, wsVersion, onCascadeCreated, onNewConversation }: CascadePanelProps) {
    const [input, setInput] = useState('');
    const [messages, setMessages] = useState<CascadeMessage[]>([]);
    const [loading, setLoading] = useState(false);
    const [activeCascadeId, setActiveCascadeId] = useState<string | null>(null);
    const [mode, setMode] = useState<'new' | 'continue'>('new');
    const inputRef = useRef<HTMLTextAreaElement>(null);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    // Workspace state
    const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
    const [wsPickerOpen, setWsPickerOpen] = useState(false);
    const wsPickerRef = useRef<HTMLDivElement>(null);
    // Track which workspace name should be used for cascade operations
    const [targetWorkspace, setTargetWorkspace] = useState<string | null>(null);

    // Model state
    const [models, setModels] = useState<CascadeModel[]>([]);
    const [selectedModelId, setSelectedModelId] = useState<string>('');
    const [modelPickerOpen, setModelPickerOpen] = useState(false);
    const modelPickerRef = useRef<HTMLDivElement>(null);

    // Load workspaces on mount, when conversation changes, or when wsVersion bumps
    useEffect(() => {
        getWorkspaces().then(ws => {
            setWorkspaces(ws);
            // Auto-initialize targetWorkspace from the first workspace if not set
            setTargetWorkspace(prev => {
                if (prev != null) return prev;
                return ws[0]?.workspaceName ?? prev;
            });
        }).catch(() => { });
    }, [currentConvId, wsVersion]);

    // Load models on mount
    useEffect(() => {
        getModels().then(({ models: m, defaultModel }) => {
            setModels(m);
            setSelectedModelId(prev => prev || defaultModel || m[0]?.modelId || '');
        }).catch(() => { });
    }, []);

    // When parent tells us which workspace the selected cascade belongs to, track it
    useEffect(() => {
        if (currentWorkspace != null) {
            setTargetWorkspace(currentWorkspace);
        }
    }, [currentWorkspace]);

    // Close pickers on click outside
    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (wsPickerRef.current && !wsPickerRef.current.contains(e.target as Node)) setWsPickerOpen(false);
            if (modelPickerRef.current && !modelPickerRef.current.contains(e.target as Node)) setModelPickerOpen(false);
        };
        if (wsPickerOpen || modelPickerOpen) document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [wsPickerOpen, modelPickerOpen]);

    const handleSwitchWorkspace = useCallback(async (wsName: string) => {
        setTargetWorkspace(wsName);
        setWsPickerOpen(false);
        // Reset to new mode — old cascade belongs to old workspace
        setActiveCascadeId(null);
        setMode('new');
    }, []);

    // Sync with parent's selected conversation
    useEffect(() => {
        if (currentConvId) {
            setActiveCascadeId(currentConvId);
            setMode('continue');
        }
    }, [currentConvId]);

    const addMessage = useCallback((role: CascadeMessage['role'], text: string, cascadeId?: string) => {
        setMessages(prev => [...prev, {
            id: crypto.randomUUID(),
            role,
            text,
            cascadeId,
            timestamp: new Date(),
        }]);
        setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    }, []);

    const handleSend = useCallback(async () => {
        const text = input.trim();
        if (!text || loading) return;

        setInput('');
        setLoading(true);
        addMessage('user', text);

        try {
            if (mode === 'new' || !activeCascadeId) {
                // Start new conversation + send
                const activeWs = workspaces.find(w => w.workspaceName === targetWorkspace) || workspaces[0];
                addMessage('system', `[Loading] Creating cascade in ${activeWs?.workspaceName || '?'}...`);
                const result = await cascadeSubmit(text, selectedModelId || undefined, undefined, activeWs?.workspaceName);
                setActiveCascadeId(result.cascadeId);
                setMode('continue');
                onCascadeCreated?.(result.cascadeId);
                addMessage('system', `[OK] Sent to cascade \`${result.cascadeId.substring(0, 8)}...\` (${activeWs?.workspaceName || '?'})\n\nStatus: ${result.result.status}`, result.cascadeId);
                if (result.result.data) {
                    addMessage('system', result.result.data);
                }
            } else {
                // Continue existing conversation
                addMessage('system', `[Loading] Sending to \`${activeCascadeId.substring(0, 8)}...\``);
                const result = await cascadeSend(activeCascadeId, text, selectedModelId || undefined);
                addMessage('system', `[OK] Status: ${result.status}`, activeCascadeId);
                if (result.data) {
                    addMessage('system', result.data);
                }
            }
        } catch (e) {
            addMessage('error', `[Error] ${e instanceof Error ? e.message : 'Unknown error'}`);
        } finally {
            setLoading(false);
            inputRef.current?.focus();
        }
    }, [input, loading, mode, activeCascadeId, addMessage, workspaces, targetWorkspace, onCascadeCreated]);

    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSend();
        }
    }, [handleSend]);

    const handleNewConversation = useCallback(() => {
        setActiveCascadeId(null);
        setMode('new');
        addMessage('system', '[New] Switched to new conversation mode');
        onNewConversation?.(); // tell parent to clear currentConvId
    }, [addMessage, onNewConversation]);

    // Determine which workspace to display as active
    const displayWs = workspaces.find(w => w.workspaceName === targetWorkspace) || workspaces[0];

    return (
        <div className="flex flex-col border-t border-border bg-background flex-shrink-0">
            {/* Messages area (collapsible) */}
            {messages.length > 0 && (
                <div className="max-h-[200px] overflow-y-auto px-4 py-2 space-y-1.5 border-b border-border/50 bg-muted/20">
                    {messages.map((msg) => (
                        <div
                            key={msg.id}
                            className={cn(
                                'text-xs px-2.5 py-1.5 rounded-md max-w-full',
                                msg.role === 'user' && 'bg-primary/10 text-primary border border-primary/20 ml-auto w-fit max-w-[80%]',
                                msg.role === 'system' && 'bg-muted/50 text-muted-foreground',
                                msg.role === 'error' && 'bg-destructive/10 text-destructive border border-destructive/20',
                            )}
                        >
                            <span className="whitespace-pre-wrap break-words">{msg.text}</span>
                        </div>
                    ))}
                    <div ref={messagesEndRef} />
                </div>
            )}

            {/* Input bar */}
            <div className="flex items-end gap-2 px-4 py-2.5">
                {/* Mode indicator & new conversation button */}
                <div className="flex items-center gap-1.5 shrink-0 pb-1">
                    {activeCascadeId ? (
                        <button
                            onClick={handleNewConversation}
                            className="flex items-center gap-1 h-7 px-2 rounded-md text-[10px] bg-primary/10 text-primary border border-primary/20 hover:bg-primary/20 transition-colors"
                            title="Start new conversation"
                        >
                            <svg className="w-3 h-3" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M8 3v10M3 8h10" />
                            </svg>
                            <span className="font-mono">{activeCascadeId.substring(0, 8)}</span>
                        </button>
                    ) : (
                        <div className="flex items-center gap-1 h-7 px-2 rounded-md text-[10px] bg-muted text-muted-foreground border border-border">
                            <svg className="w-3 h-3" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
                                <circle cx="8" cy="8" r="5" />
                                <path d="M8 5.5v5M5.5 8h5" />
                            </svg>
                            <span>New</span>
                        </div>
                    )}
                </div>

                {/* Workspace picker */}
                {workspaces.length > 0 && (
                    <div className="relative shrink-0 pb-1" ref={wsPickerRef}>
                        <button
                            onClick={() => setWsPickerOpen(v => !v)}
                            className="flex items-center gap-1 h-7 px-2 rounded-md text-[10px] bg-accent/50 text-accent-foreground border border-border hover:bg-accent transition-colors"
                            title="Switch workspace for cascade"
                        >
                            <svg className="w-3 h-3 text-muted-foreground" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                                <rect x="2" y="3" width="12" height="10" rx="1.5" />
                                <path d="M2 6h12" />
                                <path d="M5 3V1.5M11 3V1.5" />
                            </svg>
                            <span className="max-w-[100px] truncate">{displayWs?.workspaceName || '?'}</span>
                            <svg className="w-2.5 h-2.5 text-muted-foreground" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M3 5l3 3 3-3" />
                            </svg>
                        </button>

                        {wsPickerOpen && (
                            <div className="absolute bottom-full left-0 mb-1 w-[280px] rounded-lg border border-border bg-popover shadow-xl z-50 py-1">
                                <div className="px-3 py-1.5 text-[10px] text-muted-foreground font-medium uppercase tracking-wider border-b border-border/50">
                                    Target Workspace ({workspaces.length})
                                </div>
                                {workspaces.map((ws) => (
                                    <button
                                        key={ws.workspaceName}
                                        onClick={() => handleSwitchWorkspace(ws.workspaceName)}
                                        className={cn(
                                            'w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-accent/50 transition-colors text-left',
                                            ws.workspaceName === targetWorkspace && 'bg-accent/30'
                                        )}
                                    >
                                        <div className={cn('w-1.5 h-1.5 rounded-full shrink-0', ws.workspaceName === targetWorkspace ? 'bg-green-400' : 'bg-muted-foreground/30')} />
                                        <div className="flex-1 min-w-0">
                                            <div className="font-medium truncate">{ws.workspaceName}</div>
                                            <div className="text-[10px] text-muted-foreground/60 font-mono truncate">
                                                PID:{ws.pid} · Port:{ws.port}
                                            </div>
                                        </div>
                                        {ws.workspaceName === targetWorkspace && <span className="text-[9px] text-green-400 font-medium shrink-0">TARGET</span>}
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* Model picker */}
                {models.length > 0 && (
                    <div className="relative shrink-0 pb-1" ref={modelPickerRef}>
                        <button
                            onClick={() => setModelPickerOpen(v => !v)}
                            className="flex items-center gap-1 h-7 px-2 rounded-md text-[10px] bg-accent/50 text-accent-foreground border border-border hover:bg-accent transition-colors"
                            title="Select model"
                        >
                            <svg className="w-3 h-3 text-muted-foreground" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5">
                                <path d="M3 3h10v10H3z" />
                                <path d="M6 1v4M10 1v4M6 11v4M10 11v4M1 6h4M11 6h4M1 10h4M11 10h4" />
                            </svg>
                            <span className="max-w-[80px] truncate">
                                {models.find(m => m.modelId === selectedModelId)?.label || '?'}
                            </span>
                            <svg className="w-2.5 h-2.5 text-muted-foreground" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2">
                                <path d="M3 5l3 3 3-3" />
                            </svg>
                        </button>

                        {modelPickerOpen && (
                            <div className="absolute bottom-full left-0 mb-1 w-[260px] rounded-lg border border-border bg-popover shadow-xl z-50 py-1">
                                <div className="px-3 py-1.5 text-[10px] text-muted-foreground font-medium uppercase tracking-wider border-b border-border/50">
                                    Model ({models.length})
                                </div>
                                {models.map((m) => (
                                    <button
                                        key={m.modelId}
                                        onClick={() => { setSelectedModelId(m.modelId); setModelPickerOpen(false); }}
                                        className={cn(
                                            'w-full flex items-center gap-2 px-3 py-2 text-xs hover:bg-accent/50 transition-colors text-left',
                                            m.modelId === selectedModelId && 'bg-accent/30'
                                        )}
                                    >
                                        <div className={cn('w-1.5 h-1.5 rounded-full shrink-0', m.modelId === selectedModelId ? 'bg-blue-400' : 'bg-muted-foreground/30')} />
                                        <div className="flex-1 min-w-0">
                                            <div className="font-medium truncate flex items-center gap-1">
                                                {m.label}
                                                {m.isRecommended && <span className="text-[8px] text-amber-400 font-semibold">★</span>}
                                                {m.supportsImages && <ImageIcon className="h-2.5 w-2.5 text-muted-foreground/50" />}
                                            </div>
                                            <div className="flex items-center gap-1.5 mt-0.5">
                                                <div className="h-1 flex-1 rounded-full bg-muted overflow-hidden">
                                                    <div
                                                        className={cn('h-full rounded-full transition-all', m.quota > 0.5 ? 'bg-green-400' : m.quota > 0.2 ? 'bg-amber-400' : 'bg-red-400')}
                                                        style={{ width: `${Math.round(m.quota * 100)}%` }}
                                                    />
                                                </div>
                                                <span className="text-[9px] text-muted-foreground/50 w-7 text-right">{Math.round(m.quota * 100)}%</span>
                                            </div>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>
                )}

                {/* Text input */}
                <div className="flex-1 relative">
                    <textarea
                        ref={inputRef}
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={handleKeyDown}
                        placeholder={activeCascadeId ? `Continue cascade ${activeCascadeId.substring(0, 8)}...` : `Send to ${displayWs?.workspaceName || 'Antigravity IDE'}...`}
                        rows={1}
                        className="w-full resize-none rounded-lg border border-input bg-muted/30 px-3 py-2 text-sm placeholder:text-muted-foreground/50 focus:outline-none focus:ring-1 focus:ring-primary/50 focus:border-primary/50 transition-colors min-h-[36px] max-h-[120px]"
                        style={{ height: 'auto', overflow: 'hidden' }}
                        onInput={(e) => {
                            const target = e.target as HTMLTextAreaElement;
                            target.style.height = 'auto';
                            target.style.height = Math.min(target.scrollHeight, 120) + 'px';
                        }}
                        disabled={loading}
                    />
                </div>

                {/* Send button */}
                <div className="shrink-0 pb-0.5">
                    <Button
                        size="sm"
                        onClick={handleSend}
                        disabled={!input.trim() || loading}
                        className="h-8 px-3 gap-1.5"
                    >
                        {loading ? (
                            <>
                                <svg className="w-3.5 h-3.5 animate-spin" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M8 1.5a6.5 6.5 0 105.196 2.616" />
                                </svg>
                                <span className="text-xs">Sending</span>
                            </>
                        ) : (
                            <>
                                <svg className="w-3.5 h-3.5" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2">
                                    <path d="M2 8h12M10 4l4 4-4 4" />
                                </svg>
                                <span className="text-xs">Send</span>
                            </>
                        )}
                    </Button>
                </div>
            </div>
        </div>
    );
}
