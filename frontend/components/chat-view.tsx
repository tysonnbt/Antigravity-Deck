'use client';

import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { Step } from '@/lib/types';
import { extractStepContent, getStepConfig } from '@/lib/step-utils';
import { cascadeSend, cascadeSubmit, cascadeCancel, cascadeInteract, getWorkspaces, getModels, getAutoAcceptState, setAutoAcceptState, saveMedia, clearConversationCache } from '@/lib/cascade-api';
import type { Workspace, CascadeModel, MediaItem } from '@/lib/cascade-api';
import { API_BASE } from '@/lib/config';
import { authHeaders } from '@/lib/auth';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { TokenUsage } from './token-usage';
import { cn } from '@/lib/utils';
import { SourceControlView } from './source-control-view';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuLabel,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Settings, Folder, Zap, BarChart2, RefreshCcw, SendHorizontal, Square, Paperclip, GitBranch, Plus, X, ChevronDown, Activity, Download, Bell, BellOff, Rocket, ArrowDown as ArrowDownIcon, Camera, Brain, Image as ImageIcon } from 'lucide-react';
import { Switch } from '@/components/ui/switch';

// === Props ===
interface ChatViewProps {
    steps: Step[];
    currentConvId: string | null;
    currentWorkspace: string | null;
    wsVersion: number;
    cascadeStatus?: string;
    onCascadeCreated: (cascadeId: string) => void;
    onNewConversation: () => void;
    showTimeline: boolean;
    onSetShowTimeline: (val: boolean) => void;
    showAnalytics: boolean;
    onToggleAnalytics: () => void;
    onExport: () => void;
    notificationsEnabled: boolean;
    onToggleNotifications: () => void;
}

// === Classification ===
// === Extracted sub-components ===
import { groupSteps } from './chat/chat-helpers';
import { UserMessage } from './chat/user-message';
import { AgentResponse } from './chat/agent-response';
import { ProcessingGroup } from './chat/processing-group';
import { StreamingIndicator } from './chat/streaming-indicator';

// Helper: generate a small thumbnail (base64) from a full-size base64 image
function generateThumbnail(base64: string, mimeType: string, maxSize = 128): Promise<string> {
    return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            const scale = Math.min(maxSize / img.width, maxSize / img.height, 1);
            canvas.width = Math.round(img.width * scale);
            canvas.height = Math.round(img.height * scale);
            const ctx = canvas.getContext('2d')!;
            ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
            // Return just the base64 part (no data: prefix)
            const dataUrl = canvas.toDataURL(mimeType || 'image/png', 0.7);
            resolve(dataUrl.split(',')[1]);
        };
        img.onerror = () => resolve(''); // fallback: empty thumbnail
        img.src = `data:${mimeType};base64,${base64}`;
    });
}

// === Main Chat View ===
export function ChatView({ steps, currentConvId, currentWorkspace, wsVersion, cascadeStatus, onCascadeCreated, onNewConversation, showTimeline, onSetShowTimeline, showAnalytics, onToggleAnalytics, onExport, notificationsEnabled, onToggleNotifications }: ChatViewProps) {
    const [input, setInput] = useState('');
    const [sending, setSending] = useState(false);
    // activeCascadeId: derived from currentConvId, with local override for new chats
    const [localCascadeId, setLocalCascadeId] = useState<string | null>(null);
    const [showSourceControl, setShowSourceControl] = useState(false);
    const activeCascadeId = localCascadeId ?? currentConvId;
    const [showScrollBtn, setShowScrollBtn] = useState(false);
    const prevStepsLenRef = useRef(0);

    // Auto-accept: synced with backend for instant server-side reaction
    const [autoAccept, setAutoAccept] = useState<boolean>(false);

    // Workspace & model pickers
    const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
    const [selectedWs, setSelectedWs] = useState<number | null>(null);
    const [models, setModels] = useState<CascadeModel[]>([]);
    const [selectedModel, setSelectedModel] = useState<string>('');
    const [showWsPicker, setShowWsPicker] = useState(false);
    const [showModelPicker, setShowModelPicker] = useState(false);
    const [showTokens, setShowTokens] = useState(() => {
        if (typeof window === 'undefined') return false;
        try { const v = localStorage.getItem('antigravity-show-tokens'); return v ? JSON.parse(v) : false; } catch { return false; }
    });
    // Multi-image state: array of pending images
    const [pendingImages, setPendingImages] = useState<{ id: string; name: string; mimeType: string; base64: string; dataUrl: string }[]>([]);
    const [pendingMessage, setPendingMessage] = useState<string | null>(null);
    const [isDragOver, setIsDragOver] = useState(false);
    const wsPickerRef = useRef<HTMLDivElement>(null);
    const modelPickerRef = useRef<HTMLDivElement>(null);

    // Chat scroll — autoScroll as ref to avoid re-renders on scroll events (rerender-use-ref-transient-values)
    const bottomRef = useRef<HTMLDivElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const autoScrollRef = useRef(true);
    const inputRef = useRef<HTMLTextAreaElement>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);
    // Snapshot of sent images for optimistic rendering (survives state clear)
    const pendingMediaRef = useRef<{ dataUrl: string; mimeType: string; name: string }[]>([]);

    // Reset textarea height when input is cleared (e.g. after send)
    useEffect(() => {
        if (!input && inputRef.current) {
            inputRef.current.style.height = '';
        }
    }, [input]);

    // Auto-scroll
    useEffect(() => {
        if (autoScrollRef.current) {
            bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
        } else if (steps.length > prevStepsLenRef.current) {
            // New steps arrived but user is scrolled up — show button
            setShowScrollBtn(true);
        }
        prevStepsLenRef.current = steps.length;
    }, [steps.length]);

    const handleScroll = useCallback(() => {
        if (!containerRef.current) return;
        const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
        const atBottom = scrollHeight - scrollTop <= clientHeight + 100;
        autoScrollRef.current = atBottom;
        if (atBottom) setShowScrollBtn(false);
    }, []);

    const scrollToBottom = useCallback(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
        autoScrollRef.current = true;
        setShowScrollBtn(false);
    }, []);

    // Load workspaces + models + settings in parallel
    useEffect(() => { localStorage.setItem('antigravity-show-tokens', JSON.stringify(showTokens)); }, [showTokens]);
    const modelInitRef = useRef(false);
    useEffect(() => {
        const fetchModels = modelInitRef.current ? Promise.resolve(null) : getModels();
        Promise.all([getWorkspaces(), fetchModels, fetch(`${API_BASE}/api/settings`, { headers: authHeaders() }).then(r => r.json()).catch(() => null)])
            .then(([ws, modelsResp, settingsResp]) => {
                setWorkspaces(ws);
                if (currentWorkspace !== null) {
                    const wsIdx = ws.findIndex(w => w.workspaceName === currentWorkspace);
                    setSelectedWs(wsIdx >= 0 ? wsIdx : 0);
                }
                else if (ws.length > 0) setSelectedWs(0);
                if (modelsResp && !modelInitRef.current) {
                    modelInitRef.current = true;
                    setModels(modelsResp.models);
                    // Use settings default → API default → first model
                    const defaultFromSettings = settingsResp?.defaultModel;
                    const defaultFromApi = modelsResp.defaultModel;
                    if (!selectedModel) setSelectedModel(defaultFromSettings || defaultFromApi || modelsResp.models?.[0]?.modelId || '');
                }
            })
            .catch(() => { });
        // Load auto-accept state from backend
        getAutoAcceptState().then(s => setAutoAccept(s.enabled)).catch(() => { });
    }, [wsVersion, currentWorkspace]);

    // Reset localCascadeId when currentConvId changes
    useEffect(() => { setLocalCascadeId(null); }, [currentConvId]);

    // Close pickers on outside click
    useEffect(() => {
        const handler = (e: MouseEvent) => {
            if (wsPickerRef.current && !wsPickerRef.current.contains(e.target as Node)) setShowWsPicker(false);
            if (modelPickerRef.current && !modelPickerRef.current.contains(e.target as Node)) setShowModelPicker(false);
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    // Send message
    const handleSend = useCallback(async () => {
        const text = input.trim();
        if ((!text && pendingImages.length === 0) || sending) return;

        // Ensure backend workspace matches parent-controlled workspace
        // No need to switch workspace — resolveInst handles routing on backend

        setSending(true);
        // Optimistic update: show user message immediately
        setPendingMessage(text || '(images)');
        // Snapshot images for optimistic rendering before clearing state
        pendingMediaRef.current = pendingImages.map(img => ({ dataUrl: img.dataUrl, mimeType: img.mimeType, name: img.name }));
        try {
            // Build media array from pending images
            let mediaItems: MediaItem[] | undefined;
            if (pendingImages.length > 0) {
                // Generate thumbnails and save each image via SaveMediaAsArtifact
                mediaItems = await Promise.all(pendingImages.map(async (img) => {
                    const thumbnail = await generateThumbnail(img.base64, img.mimeType);
                    // Try to save via SaveMediaAsArtifact to get a uri
                    let uri: string | undefined;
                    try {
                        const saved = await saveMedia(img.mimeType, img.base64, thumbnail);
                        uri = saved.uri;
                    } catch { /* uri is optional, continue without it */ }
                    return {
                        mimeType: img.mimeType,
                        inlineData: img.base64,
                        uri: uri || '',
                        thumbnail: thumbnail,
                    };
                }));
            }

            if (activeCascadeId) {
                await cascadeSend(activeCascadeId, text, selectedModel || undefined, mediaItems);
            } else {
                const result = await cascadeSubmit(text, selectedModel || undefined, mediaItems);
                const newId = result.cascadeId;
                setLocalCascadeId(newId);
                onCascadeCreated(newId);
            }
            setInput('');
            setPendingImages([]);
        } catch (e) {
            console.error('Send error:', e);
        } finally {
            setSending(false);
        }
    }, [input, sending, activeCascadeId, selectedWs, selectedModel, pendingImages, onCascadeCreated]);

    // Image handling — shared processor for adding files to pending images
    const processImageFile = useCallback((file: File) => {
        if (!file.type.startsWith('image/')) return;
        const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        const reader = new FileReader();
        reader.onload = () => {
            const dataUrl = reader.result as string;
            const base64 = dataUrl.split(',')[1];
            setPendingImages(prev => [...prev, {
                id,
                name: file.name || 'clipboard-image.png',
                mimeType: file.type || 'image/png',
                base64,
                dataUrl,
            }]);
        };
        reader.readAsDataURL(file);
    }, []);

    const handleImagePick = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const files = e.target.files;
        if (!files) return;
        Array.from(files).forEach(f => processImageFile(f));
        // Reset input so same file can be re-selected
        if (fileInputRef.current) fileInputRef.current.value = '';
    }, [processImageFile]);

    // Clipboard paste — capture ALL images from Ctrl+V
    const handlePaste = useCallback((e: React.ClipboardEvent) => {
        const items = e.clipboardData?.items;
        if (!items) return;
        let hasImage = false;
        for (const item of items) {
            if (item.type.startsWith('image/')) {
                const file = item.getAsFile();
                if (file) { processImageFile(file); hasImage = true; }
            }
        }
        if (hasImage) e.preventDefault();
    }, [processImageFile]);

    // Drag-and-drop handlers
    const handleDragOver = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        if (e.dataTransfer.types.includes('Files')) {
            setIsDragOver(true);
        }
    }, []);

    const handleDragLeave = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragOver(false);
    }, []);

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragOver(false);
        const files = e.dataTransfer.files;
        if (!files) return;
        Array.from(files).forEach(f => {
            if (f.type.startsWith('image/')) processImageFile(f);
        });
    }, [processImageFile]);

    const removeImage = useCallback((id: string) => {
        setPendingImages(prev => prev.filter(img => img.id !== id));
    }, []);

    const clearAllImages = useCallback(() => {
        setPendingImages([]);
        if (fileInputRef.current) fileInputRef.current.value = '';
    }, []);

    // Cancel
    const handleCancel = useCallback(async () => {
        if (!activeCascadeId) return;
        try { await cascadeCancel(activeCascadeId); } catch (e) { console.error('Cancel error:', e); }
    }, [activeCascadeId]);

    // Accept/Reject interaction
    const handleInteract = useCallback(async (action: 'accept' | 'reject') => {
        if (!activeCascadeId) return;
        try { await cascadeInteract(activeCascadeId, action); }
        catch (e) { console.error('Interact error:', e); }
    }, [activeCascadeId]);

    // New chat
    const handleNewChat = useCallback(() => {
        setLocalCascadeId(null);
        setInput('');
        onNewConversation();
    }, [onNewConversation]);

    // Key handling
    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); }
    }, [handleSend]);

    // Merge optimistic pending message into displayed steps
    const displaySteps = useMemo(() => {
        if (!pendingMessage) return steps;
        // Check if pending message is already in real steps using extractStepContent (handles all formats)
        const lastUserStep = [...steps].reverse().find(s => s.type === 'CORTEX_STEP_TYPE_USER_INPUT');
        if (lastUserStep) {
            const lastText = extractStepContent(lastUserStep) || '';
            if (lastText === pendingMessage) return steps;
        }
        // Append optimistic user step with image data
        const optimisticStep: any = {
            type: 'CORTEX_STEP_TYPE_USER_INPUT',
            status: 'CORTEX_STEP_STATUS_DONE',
            userInput: { items: [{ text: pendingMessage }] },
        };
        // Attach image snapshots for UserMessage rendering
        if (pendingMediaRef.current.length > 0) {
            optimisticStep._media = pendingMediaRef.current;
        }
        return [...steps, optimisticStep];
    }, [steps, pendingMessage]);

    // Clear pending message when real steps pick it up (avoids setTimeout inside useMemo)
    useEffect(() => {
        if (!pendingMessage) return;
        const lastUserStep = [...steps].reverse().find(s => s.type === 'CORTEX_STEP_TYPE_USER_INPUT');
        if (lastUserStep) {
            const lastText = extractStepContent(lastUserStep) || '';
            if (lastText === pendingMessage) {
                setPendingMessage(null);
                pendingMediaRef.current = [];
            }
        }
    }, [steps, pendingMessage]);

    const groups = useMemo(() => groupSteps(displaySteps), [displaySteps]);

    const isRunning = cascadeStatus === 'CASCADE_RUN_STATUS_RUNNING';
    const isWaiting = cascadeStatus === 'CASCADE_RUN_STATUS_WAITING_FOR_USER';
    const isActive = isRunning || isWaiting;

    const selectedWsName = selectedWs !== null && workspaces[selectedWs] ? workspaces[selectedWs].workspaceName : 'No workspace';
    const selectedModelLabel = models.find(m => m.modelId === selectedModel)?.label || 'Default';

    return (
        <div className="flex-1 flex flex-col min-h-0">
            {showSourceControl && currentWorkspace !== null ? (
                <div className="flex-1 min-h-0 overflow-hidden">
                    <SourceControlView
                        workspace={currentWorkspace}
                        onClose={() => setShowSourceControl(false)}
                    />
                </div>
            ) : (
                <>
                    {/* Chat messages */}
                    <div ref={containerRef} onScroll={handleScroll} className="relative flex-1 overflow-y-auto px-3 sm:px-6 py-3 sm:py-5">
                        {displaySteps.length === 0 ? (
                            <div className="flex items-center justify-center h-full">
                                <div className="text-center space-y-4">
                                    <div className="flex items-center justify-center gap-3">
                                        <Rocket className="h-8 w-8 text-muted-foreground/40" />
                                        <h2 className="text-xl font-semibold text-foreground/80">AntigravityChat</h2>
                                    </div>
                                    <p className="text-sm text-muted-foreground max-w-md">
                                        {currentConvId ? 'Loading conversation...' : 'Select a conversation from the sidebar or start a new one'}
                                    </p>
                                </div>
                            </div>
                        ) : (
                            <div className="max-w-4xl mx-auto">
                                {groups.map((group, gIdx) => {
                                    const isRecent = gIdx >= groups.length - 3;
                                    const animClass = isRecent ? 'message-animate' : '';
                                    if (group.type === 'user') {
                                        const { step, originalIndex } = group.steps[0];
                                        return <div key={`u-${gIdx}`} className={animClass}><UserMessage step={step} index={originalIndex} /></div>;
                                    }
                                    if (group.type === 'response') {
                                        const { step, originalIndex } = group.steps[0];
                                        return <div key={`r-${gIdx}`} className={animClass}><AgentResponse step={step} index={originalIndex} /></div>;
                                    }
                                    return <div key={`p-${gIdx}`} className={animClass}><ProcessingGroup steps={group.steps} cascadeId={activeCascadeId} totalStepCount={displaySteps.length} /></div>;
                                })}
                                {isRunning && <StreamingIndicator />}
                                <div ref={bottomRef} className="h-4" />
                            </div>
                        )}
                        {/* Scroll to bottom button */}
                        {showScrollBtn && (
                            <Button
                                onClick={scrollToBottom}
                                variant="secondary"
                                size="sm"
                                className="scroll-bottom-btn"
                            >
                                <ArrowDownIcon className="h-3 w-3 mr-1 inline" /> New messages
                            </Button>
                        )}
                    </div>

                    {/* Input bar */}
                    <div className="border-t border-border bg-background/80 backdrop-blur px-2 sm:px-4 py-2 sm:py-3"
                        onDragOver={handleDragOver}
                        onDragLeave={handleDragLeave}
                        onDrop={handleDrop}
                    >
                        {/* Drag overlay */}
                        {isDragOver && (
                            <div className="absolute inset-0 z-50 flex items-center justify-center bg-primary/5 border-2 border-dashed border-primary/40 rounded-lg backdrop-blur-sm pointer-events-none">
                                <div className="text-center space-y-2">
                                    <div className="flex items-center justify-center gap-2">
                                        <Camera className="h-6 w-6 text-primary/60" />
                                        <p className="text-sm font-medium text-primary/80">Drop images here</p>
                                    </div>
                                </div>
                            </div>
                        )}
                        <div className="max-w-4xl mx-auto space-y-2">
                            {/* Pickers row */}
                            <div className="flex items-center gap-1.5 sm:gap-2 text-xs flex-wrap">
                                {/* Model picker */}
                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                        <Button variant="ghost" size="sm" className="gap-1.5 text-muted-foreground h-7 px-2 font-normal">
                                            <span><Brain className="h-3.5 w-3.5" /></span>
                                            <span className="truncate max-w-[200px] sm:max-w-[240px]">{selectedModelLabel}</span>
                                            <ChevronDown className="h-3 w-3 opacity-50" />
                                        </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="start" className="w-72">
                                        {models.map(m => (
                                            <DropdownMenuItem
                                                key={m.modelId}
                                                onClick={() => setSelectedModel(m.modelId)}
                                                className={cn('cursor-pointer flex items-center justify-between gap-2',
                                                    m.modelId === selectedModel && 'text-primary')}
                                            >
                                                <div className="flex items-center gap-2 min-w-0">
                                                    <span className="truncate">{m.label}</span>
                                                    {m.isRecommended && <Badge variant="secondary" className="text-[8px] h-3.5 px-1 shrink-0">★</Badge>}
                                                </div>
                                                <div className="flex items-center gap-1.5 shrink-0">
                                                    {m.supportsImages && <span className="text-[9px]"><ImageIcon className="h-3 w-3" /></span>}
                                                    <div className="w-12 h-1.5 rounded-full bg-muted overflow-hidden">
                                                        <div className="h-full rounded-full bg-green-500/70" style={{ width: `${Math.round(m.quota * 100)}%` }} />
                                                    </div>
                                                </div>
                                            </DropdownMenuItem>
                                        ))}
                                    </DropdownMenuContent>
                                </DropdownMenu>

                                {/* Status indicator */}
                                {isActive && (
                                    <div className="flex items-center gap-1.5 text-[10px] text-purple-400/70 ml-1">
                                        <div className="w-1.5 h-1.5 rounded-full bg-purple-400 animate-pulse" />
                                        {isWaiting ? (autoAccept ? 'Auto-accepting...' : 'Waiting for approval') : 'Running'}
                                    </div>
                                )}

                                <div className="flex-1" />

                                {/* New chat button */}
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={handleNewChat}
                                    className="gap-1 h-7 text-muted-foreground hover:text-foreground"
                                >
                                    <Plus className="h-3.5 w-3.5" />
                                    <span className="hidden sm:inline">New Chat</span>
                                </Button>

                                {/* Chat Settings Dropdown */}
                                <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                        <Button variant="ghost" size="sm" className="gap-1.5 h-7 text-muted-foreground hover:text-foreground">
                                            <Settings className="w-3.5 h-3.5" />
                                            <span className="hidden sm:inline">Settings</span>
                                        </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent align="end" className="w-56 mb-1 bg-popover/95 backdrop-blur-sm shadow-xl rounded-lg border-border">
                                        <DropdownMenuLabel className="flex items-center gap-2 text-xs font-normal text-muted-foreground px-2 py-1.5">
                                            <Folder className="w-3.5 h-3.5" />
                                            <span className="truncate flex-1">{selectedWsName}</span>
                                        </DropdownMenuLabel>
                                        <DropdownMenuSeparator className="bg-border" />
                                        <DropdownMenuItem
                                            onClick={(e) => {
                                                e.preventDefault();
                                                const newVal = !autoAccept;
                                                setAutoAccept(newVal);
                                                setAutoAcceptState(newVal).catch(() => { });
                                            }}
                                            className="cursor-pointer flex items-center justify-between"
                                        >
                                            <div className="flex items-center gap-2">
                                                <Zap className={cn("w-3.5 h-3.5", autoAccept ? "text-green-400" : "text-muted-foreground")} />
                                                <span className={autoAccept ? "text-green-400/90" : ""}>Auto-accept</span>
                                            </div>
                                            <Switch checked={autoAccept} className="scale-75 pointer-events-none" />
                                        </DropdownMenuItem>
                                        <DropdownMenuItem
                                            onClick={(e) => {
                                                e.preventDefault();
                                                onSetShowTimeline(!showTimeline);
                                            }}
                                            className="cursor-pointer flex items-center justify-between"
                                        >
                                            <div className="flex items-center gap-2">
                                                <Activity className={cn("w-3.5 h-3.5", showTimeline ? "text-blue-400" : "text-muted-foreground")} />
                                                <span className={showTimeline ? "text-blue-400/90" : ""}>Timeline</span>
                                            </div>
                                            <Switch checked={showTimeline} className="scale-75 pointer-events-none" />
                                        </DropdownMenuItem>
                                        <DropdownMenuItem onClick={() => setShowTokens(!showTokens)} className="cursor-pointer">
                                            <BarChart2 className="w-3.5 h-3.5 mr-2 text-muted-foreground" />
                                            {showTokens ? 'Hide Tokens' : 'Show Tokens'}
                                        </DropdownMenuItem>
                                        <DropdownMenuSeparator className="bg-white/5" />
                                        <DropdownMenuItem onClick={onToggleAnalytics} className="cursor-pointer">
                                            <BarChart2 className="w-3.5 h-3.5 mr-2 text-muted-foreground" />
                                            {showAnalytics ? 'Hide Stats' : 'Show Stats'}
                                        </DropdownMenuItem>
                                        <DropdownMenuItem onClick={onExport} disabled={steps.length === 0} className="cursor-pointer">
                                            <Download className="w-3.5 h-3.5 mr-2 text-muted-foreground" />
                                            Export Markdown
                                        </DropdownMenuItem>
                                        <DropdownMenuItem onClick={onToggleNotifications} className="cursor-pointer">
                                            {notificationsEnabled
                                                ? <><BellOff className="w-3.5 h-3.5 mr-2 text-muted-foreground" /> Disable Notifications</>
                                                : <><Bell className="w-3.5 h-3.5 mr-2 text-muted-foreground" /> Enable Notifications</>}
                                        </DropdownMenuItem>
                                        <DropdownMenuSeparator className="bg-white/5" />
                                        <DropdownMenuItem
                                            onClick={async () => {
                                                if (!activeCascadeId) return;
                                                try {
                                                    await clearConversationCache(activeCascadeId);
                                                    window.dispatchEvent(new CustomEvent('refresh-conversation', { detail: { cascadeId: activeCascadeId } }));
                                                } catch (e) { console.error('Refresh error:', e); }
                                            }}
                                            className="cursor-pointer text-muted-foreground focus:text-foreground"
                                        >
                                            <RefreshCcw className="w-3.5 h-3.5 mr-2" />
                                            Refresh Chat
                                        </DropdownMenuItem>
                                    </DropdownMenuContent>
                                </DropdownMenu>
                            </div>

                            {/* Token usage display */}
                            {showTokens && <TokenUsage cascadeId={activeCascadeId} />}

                            {/* Image preview — multi-image horizontal list */}
                            {pendingImages.length > 0 && (
                                <div className="flex items-center gap-2 px-3 py-2 bg-muted/20 border border-border/30 rounded-lg overflow-x-auto">
                                    {pendingImages.map((img) => (
                                        <div key={img.id} className="relative shrink-0 group/img">
                                            <img src={img.dataUrl} className="w-14 h-14 rounded-lg object-cover border border-border/30" alt={img.name} title={img.name} />
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="absolute -top-1.5 -right-1.5 h-5 w-5 rounded-full bg-destructive text-destructive-foreground opacity-0 group-hover/img:opacity-100 transition-opacity shadow-md"
                                                onClick={() => removeImage(img.id)}
                                            >
                                                <X className="h-2.5 w-2.5" />
                                            </Button>
                                        </div>
                                    ))}
                                    {pendingImages.length > 1 && (
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            className="shrink-0 h-6 text-[10px] text-muted-foreground hover:text-destructive px-2"
                                            onClick={clearAllImages}
                                        >
                                            Clear all
                                        </Button>
                                    )}
                                    <span className="shrink-0 text-[10px] text-muted-foreground/60">
                                        {pendingImages.length} image{pendingImages.length > 1 ? 's' : ''}
                                    </span>
                                </div>
                            )}

                            {/* Hidden file input — supports multiple */}
                            <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleImagePick} />

                            {/* Input area */}
                            <div className="flex items-end gap-2">
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    className="shrink-0 h-9 w-9 sm:h-11 sm:w-11 rounded-lg border border-border/50"
                                    onClick={() => fileInputRef.current?.click()}
                                    title="Attach image"
                                >
                                    <Paperclip className="h-4 w-4" />
                                </Button>
                                <Button
                                    variant={showSourceControl ? 'secondary' : 'ghost'}
                                    size="icon"
                                    className={cn(
                                        'shrink-0 h-9 w-9 sm:h-11 sm:w-11 rounded-lg border border-border/50',
                                        showSourceControl && 'border-primary/30'
                                    )}
                                    onClick={() => setShowSourceControl(v => !v)}
                                    title="Source Control"
                                >
                                    <GitBranch className="h-4 w-4" />
                                </Button>
                                <Textarea
                                    ref={inputRef}
                                    value={input}
                                    onChange={e => setInput(e.target.value)}
                                    onKeyDown={handleKeyDown}
                                    onPaste={handlePaste}
                                    placeholder={currentConvId ? "Continue conversation..." : "Start a new conversation..."}
                                    className="flex-1 resize-none min-h-[36px] sm:min-h-[44px] max-h-[200px] text-sm !py-[8px] sm:!py-[12px]"
                                    rows={1}
                                    onInput={(e) => {
                                        const target = e.target as HTMLTextAreaElement;
                                        target.style.height = 'auto';
                                        target.style.height = Math.min(target.scrollHeight, 200) + 'px';
                                    }}
                                />
                                {isRunning ? (
                                    <Button onClick={handleCancel} variant="destructive" size="icon" className="h-9 w-9 sm:h-11 sm:w-11 rounded-lg shrink-0">
                                        <Square className="h-4 w-4" />
                                    </Button>
                                ) : (
                                    <Button
                                        onClick={handleSend}
                                        disabled={(!input.trim() && pendingImages.length === 0) || sending}
                                        size="icon"
                                        className="h-9 w-9 sm:h-11 sm:w-11 rounded-lg shrink-0"
                                    >
                                        <SendHorizontal className="h-4 w-4" />
                                    </Button>
                                )}
                            </div>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
