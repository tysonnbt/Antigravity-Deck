'use client';

import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import dynamic from 'next/dynamic';
import { useWebSocket } from '@/lib/websocket';
import { extractStepContent, exportToMarkdown } from '@/lib/step-utils';
import { Timeline } from '@/components/timeline';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { MoreVertical, BarChart2, Download, Bell, BellOff, MessageCircle, Star, Rocket } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ChatView } from '@/components/chat-view';
import { AppSidebar } from '@/components/app-sidebar';
import { SidebarTrigger } from '@/components/ui/sidebar';
import { ConversationList } from '@/components/conversation-list';
import { AccountInfoView } from '@/components/user-profile';
import { SettingsView } from '@/components/settings-view';
import { AuthGate } from '@/components/auth-gate';
import { AgentLogsView } from '@/components/agent-logs-view';
import { AgentBridgeView } from '@/components/agent-bridge-view';

// Lazy-load components that are hidden by default
const AnalyticsPanel = dynamic(() => import('@/components/analytics-panel').then(m => ({ default: m.AnalyticsPanel })), { ssr: false });
const StepDetail = dynamic(() => import('@/components/step-detail').then(m => ({ default: m.StepDetail })), { ssr: false });

export default function Home() {
  const { connected, steps, conversations, currentConvId, cascadeStatus, conversationsVersion, selectConversation, lastUpdate } = useWebSocket();

  const [showAnalytics, setShowAnalytics] = useState(false);
  const [showTimeline, setShowTimeline] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('showTimeline');
      return saved !== null ? saved === 'true' : false;
    }
    return false;
  });
  const [notificationsEnabled, setNotificationsEnabled] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);

  // Persist showTimeline to localStorage
  const handleSetShowTimeline = useCallback((val: boolean) => {
    setShowTimeline(val);
    localStorage.setItem('showTimeline', String(val));
  }, []);

  // Listen for localStorage changes (e.g. from Settings view)
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'showTimeline' && e.newValue !== null) {
        setShowTimeline(e.newValue === 'true');
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  // === Mobile sidebar state ===
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarClosing, setSidebarClosing] = useState(false);

  const handleCloseSidebar = useCallback(() => {
    setSidebarClosing(true);
    setTimeout(() => { setSidebarOpen(false); setSidebarClosing(false); }, 200);
  }, []);

  // === Active workspace name — which workspace the user is "in" ===
  const [activeWorkspace, setActiveWorkspace] = useState<string | null>(null);
  // NEW: When true, show ChatView in "new chat" mode (no conversation yet)
  const [newChatMode, setNewChatMode] = useState(false);
  // NEW: When true, show AccountInfoView in main panel
  const [showAccountInfo, setShowAccountInfo] = useState(false);
  // NEW: When true, show SettingsView in main panel
  const [showSettings, setShowSettings] = useState(false);
  // NEW: When true, show AgentLogsView in main panel
  const [showLogs, setShowLogs] = useState(false);
  // NEW: When true, show Agent Bridge in main panel
  const [showBridge, setShowBridge] = useState(false);
  // Bumped when sidebar creates a workspace, so panels refresh their lists
  const [wsVersion, setWsVersion] = useState(0);

  // Auto-bump wsVersion when backend discovers new conversations
  useEffect(() => {
    if (conversationsVersion > 0) setWsVersion(v => v + 1);
  }, [conversationsVersion]);

  // Step detail state
  const [selectedStep, setSelectedStep] = useState<number | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  // Bookmarks
  const [bookmarkedSteps, setBookmarkedSteps] = useState<Set<number>>(new Set());


  // === Sidebar: click workspace → show conversation list ===
  const handleSelectWorkspace = useCallback((wsName: string) => {
    setActiveWorkspace(wsName);
    setNewChatMode(false);
    setShowAccountInfo(false);
    setShowSettings(false);
    setShowLogs(false);
    setShowBridge(false);
    selectConversation(null);
  }, [selectConversation]);

  // === Sidebar or ConversationList: click conversation → open chat ===
  const handleSelectConversation = useCallback((convId: string | null, wsName: string) => {
    setActiveWorkspace(wsName);
    setNewChatMode(false);
    setShowAccountInfo(false);
    setShowSettings(false);
    setShowLogs(false);
    setShowBridge(false);
    selectConversation(convId);
  }, [selectConversation]);

  // === ConversationList: click conversation (workspace already set) ===
  const handleConvListSelect = useCallback((convId: string) => {
    setNewChatMode(false);
    setShowLogs(false);
    setShowBridge(false);
    selectConversation(convId);
  }, [selectConversation]);

  // === New Chat from ConversationList — show ChatView in new chat mode ===
  const handleNewChat = useCallback(() => {
    selectConversation(null);
    setNewChatMode(true);
    setShowAccountInfo(false);
    setShowSettings(false);
    setShowLogs(false);
    setShowBridge(false);
  }, [selectConversation]);

  // === Start conversation from sidebar (new chat button) ===
  const handleStartConversation = useCallback(() => {
    if (activeWorkspace !== null) {
      selectConversation(null);
      setNewChatMode(true);
      setShowAccountInfo(false);
      setShowSettings(false);
      setShowLogs(false);
      setShowBridge(false);
    } else {
      selectConversation(null);
      setActiveWorkspace(null);
      setNewChatMode(false);
      setShowAccountInfo(false);
      setShowSettings(false);
      setShowLogs(false);
      setShowBridge(false);
    }
  }, [selectConversation, activeWorkspace]);

  // === Show account info in main panel ===
  const handleShowAccountInfo = useCallback(() => {
    selectConversation(null);
    setNewChatMode(false);
    setActiveWorkspace(null);
    setShowAccountInfo(true);
    setShowSettings(false);
    setShowLogs(false);
    setShowBridge(false);
  }, [selectConversation]);

  // === Show settings in main panel ===
  const handleShowSettings = useCallback(() => {
    selectConversation(null);
    setNewChatMode(false);
    setActiveWorkspace(null);
    setShowAccountInfo(false);
    setShowLogs(false);
    setShowBridge(false);
    setShowSettings(true);
  }, [selectConversation]);

  // === Show Live Logs ===
  const handleShowLogs = useCallback(() => {
    selectConversation(null);
    setNewChatMode(false);
    setActiveWorkspace(null);
    setShowAccountInfo(false);
    setShowSettings(false);
    setShowBridge(false);
    setShowLogs(true);
  }, [selectConversation]);

  // === Show Agent Bridge ===
  const handleShowBridge = useCallback(() => {
    selectConversation(null);
    setNewChatMode(false);
    setActiveWorkspace(null);
    setShowAccountInfo(false);
    setShowSettings(false);
    setShowLogs(false);
    setShowBridge(true);
  }, [selectConversation]);

  // When CascadePanel creates a new cascade, track it
  const handleCascadeCreated = useCallback((cascadeId: string) => {
    setNewChatMode(false);
    selectConversation(cascadeId);
  }, [selectConversation]);

  // Bidirectional sync: bumped when any component creates/changes workspaces
  const handleWorkspaceCreated = useCallback(() => {
    setWsVersion(v => v + 1);
  }, []);

  // ChatView's "New Chat" button — go back to conversation list
  const handleNewConversation = useCallback(() => {
    selectConversation(null);
    setNewChatMode(false);
  }, [selectConversation]);



  // Export
  const handleExport = useCallback(() => {
    if (currentConvId && steps.length > 0) exportToMarkdown(steps, currentConvId);
  }, [steps, currentConvId]);

  // Notifications
  const handleToggleNotifications = useCallback(() => {
    setNotificationsEnabled(prev => {
      if (!prev && 'Notification' in window && Notification.permission !== 'granted') {
        Notification.requestPermission();
      }
      return !prev;
    });
  }, []);

  // Copy conversation ID
  const handleCopyId = useCallback((e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    navigator.clipboard.writeText(id);
    setTimeout(() => { }, 1500);
  }, []);

  // Step detail
  const openStepDetail = useCallback((index: number) => {
    setSelectedStep(index);
    setDetailOpen(true);
  }, []);

  const navigateStep = useCallback((direction: 'prev' | 'next') => {
    setSelectedStep(prev => {
      if (prev === null) return 0;
      const next = direction === 'prev' ? prev - 1 : prev + 1;
      return Math.max(0, Math.min(steps.length - 1, next));
    });
  }, [steps.length]);

  const toggleBookmark = useCallback(() => {
    if (selectedStep === null) return;
    setBookmarkedSteps(prev => {
      const next = new Set(prev);
      if (next.has(selectedStep)) next.delete(selectedStep);
      else next.add(selectedStep);
      return next;
    });
  }, [selectedStep]);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      // Search focus
      if (mod && (e.key === 'f' || e.key === 'k')) {
        e.preventDefault();
        document.querySelector<HTMLInputElement>('input[placeholder*="Search"]')?.focus();
      }
      // New conversation
      if (mod && e.key === 'n') {
        e.preventDefault();
        handleStartConversation();
      }
      // Export
      if (mod && e.shiftKey && e.key === 'E') {
        e.preventDefault();
        handleExport();
      }
      // Close panel
      if (e.key === 'Escape') {
        setDetailOpen(false);
      }
      // Arrow key navigation in detail panel
      if (detailOpen) {
        if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') { e.preventDefault(); navigateStep('prev'); }
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') { e.preventDefault(); navigateStep('next'); }
        if (e.key === 'b') toggleBookmark();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [detailOpen, navigateStep, toggleBookmark, handleStartConversation, handleExport]);

  // Refresh conversation handler — re-selects the same conversation to force re-fetch
  useEffect(() => {
    const handler = (e: Event) => {
      const cascadeId = (e as CustomEvent).detail?.cascadeId;
      if (cascadeId) {
        // De-select then re-select to force WS re-fetch
        selectConversation(null);
        setTimeout(() => selectConversation(cascadeId), 100);
      }
    };
    window.addEventListener('refresh-conversation', handler);
    return () => window.removeEventListener('refresh-conversation', handler);
  }, [selectConversation]);

  // Current conversation info for header display
  const currentConvInfo = currentConvId ? conversations[currentConvId] : null;

  // === Determine what to show in main panel ===
  const showChat = currentConvId !== null || newChatMode;
  const showConversationList = !showChat && !showAccountInfo && !showSettings && !showLogs && !showBridge && activeWorkspace !== null;
  const showWelcome = !showChat && !showConversationList && !showAccountInfo && !showSettings && !showLogs && !showBridge;

  return (
    <AuthGate>
      <div className="flex h-dvh w-full bg-background text-foreground overflow-hidden">
        {/* Shadcn App Sidebar */}
        <AppSidebar
          currentConvId={currentConvId}
          conversationsVersion={conversationsVersion}
          activeWorkspace={activeWorkspace}
          onSelectWorkspace={handleSelectWorkspace}
          onSelectConversation={handleSelectConversation}
          onShowAccountInfo={handleShowAccountInfo}
          onShowSettings={handleShowSettings}
          onShowLogs={handleShowLogs}
          onShowBridge={handleShowBridge}
          onWorkspaceCreated={handleWorkspaceCreated}
          wsVersion={wsVersion}
        />

        {/* Main content */}
        <div className="flex flex-col flex-1 min-w-0 min-h-0 overflow-hidden">
          {/* Topbar */}
          <header className="flex items-center justify-between px-2 sm:px-4 h-11 bg-background border-b border-border flex-shrink-0">
            <div className="flex items-center gap-2 sm:gap-3 min-w-0">
              {/* Hamburger — provided by Shadcn SidebarTrigger */}
              <SidebarTrigger className="-ml-1 w-9 h-9" />
              <div className="flex items-center gap-1.5">
                <MessageCircle className="w-4 h-4" />
                {activeWorkspace ? (
                  <span className="font-semibold text-sm truncate max-w-[120px] sm:max-w-[200px]">{activeWorkspace}</span>
                ) : (
                  <>
                    <span className="font-semibold text-sm">Chat Mirror</span>
                    <Badge variant="outline" className="text-[9px] h-4 px-1 font-mono inline-flex">v3</Badge>
                  </>
                )}
              </div>
              {currentConvId && (
                <>
                  <div className="w-px h-5 bg-border hidden sm:block" />
                  <span className="text-xs text-muted-foreground truncate max-w-[120px] sm:max-w-[300px]">
                    {currentConvInfo?.summary || currentConvId.substring(0, 8)}
                  </span>
                  <span className="text-[10px] text-muted-foreground/60 hidden sm:inline">
                    ({steps.length || currentConvInfo?.stepCount || 0} steps)
                  </span>
                </>
              )}
            </div>

            <div className="flex items-center gap-1.5 sm:gap-3">

              {bookmarkedSteps.size > 0 && (
                <Badge variant="secondary" className="text-[10px] hidden sm:inline-flex gap-1"><Star className="w-3 h-3" /> {bookmarkedSteps.size}</Badge>
              )}
              {showChat && <span className="text-xs text-muted-foreground font-mono hidden md:inline">{steps.length > 0 ? `${steps.length} steps` : ''}</span>}
              {lastUpdate && <span className="text-xs text-muted-foreground hidden md:inline">{lastUpdate}</span>}
              {/* Mobile: just the dot */}
              <div className={`w-1.5 h-1.5 rounded-full sm:hidden ${connected ? 'bg-green-400 animate-pulse' : 'bg-red-400'}`} />
              {/* Desktop: full pill with text */}
              <div className={`hidden sm:flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium ${connected ? 'bg-green-500/10 text-green-400 border border-green-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'}`}>
                <div className={`w-1.5 h-1.5 rounded-full ${connected ? 'bg-green-400 animate-pulse' : 'bg-red-400'}`} />
                <span>{connected ? 'Connected' : 'Detecting...'}</span>
              </div>
            </div>

          </header>

          {/* Keyboard shortcuts popup */}
          {showShortcuts && (
            <div className="absolute right-2 sm:right-4 top-12 z-50 w-[calc(100%-1rem)] sm:w-56 bg-popover border border-border rounded-lg shadow-xl p-3 space-y-1.5 text-xs">
              <div className="flex items-center justify-between pb-1.5 border-b border-border mb-1.5">
                <span className="font-semibold text-foreground">Keyboard Shortcuts</span>
                <button onClick={() => setShowShortcuts(false)} className="text-muted-foreground hover:text-foreground">✕</button>
              </div>
              {[
                ['Ctrl+K', 'Search steps'],
                ['Ctrl+N', 'New conversation'],
                ['Ctrl+Shift+E', 'Export to markdown'],
                ['←  →', 'Navigate steps'],
                ['B', 'Toggle bookmark'],
                ['Esc', 'Close panels'],
                ['Enter', 'Send message'],
                ['Shift+Enter', 'New line'],
              ].map(([key, desc]) => (
                <div key={key} className="flex items-center justify-between">
                  <span className="text-muted-foreground">{desc}</span>
                  <kbd className="px-1.5 py-0.5 bg-muted/50 rounded text-[9px] font-mono text-muted-foreground">{key}</kbd>
                </div>
              ))}
            </div>
          )}

          {/* Timeline */}
          {currentConvId && showTimeline && steps.length > 0 && (
            <Timeline
              steps={steps}
              onSelectStep={openStepDetail}
            />
          )}

          {/* Analytics */}
          {currentConvId && showAnalytics && steps.length > 0 && <AnalyticsPanel steps={steps} />}

          {/* === Main panel content === */}
          {showWelcome && (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center space-y-4">
                <div className="flex items-center justify-center gap-3">
                  <Rocket className="w-8 h-8 text-muted-foreground/50" />
                  <h2 className="text-xl font-semibold text-foreground/80">AntigravityChat</h2>
                </div>
                <p className="text-sm text-muted-foreground max-w-md">
                  Select a workspace from the sidebar to view conversations, or start a new one.
                </p>
              </div>
            </div>
          )}

          {showAccountInfo && <AccountInfoView />}

          {showSettings && <SettingsView />}

          {/* Always mounted — WS stays alive, events accumulate in background */}
          <div className={showLogs ? 'flex flex-col flex-1 min-h-0 overflow-hidden' : 'hidden'}>
            <AgentLogsView />
          </div>

          {/* Agent Bridge panel */}
          <div className={showBridge ? 'flex flex-col flex-1 min-h-0 overflow-hidden' : 'hidden'}>
            <AgentBridgeView />
          </div>

          {showConversationList && (
            <ConversationList
              workspaceName={activeWorkspace!}
              wsVersion={wsVersion}
              onSelectConversation={handleConvListSelect}
              onNewChat={handleNewChat}
            />
          )}

          {showChat && (
            <>
              <ChatView
                steps={steps}
                currentConvId={currentConvId}
                currentWorkspace={activeWorkspace}
                wsVersion={wsVersion}
                cascadeStatus={cascadeStatus ?? undefined}
                onCascadeCreated={handleCascadeCreated}
                onNewConversation={handleNewConversation}
                showTimeline={showTimeline}
                onSetShowTimeline={handleSetShowTimeline}
                showAnalytics={showAnalytics}
                onToggleAnalytics={() => setShowAnalytics(v => !v)}
                onExport={handleExport}
                notificationsEnabled={notificationsEnabled}
                onToggleNotifications={handleToggleNotifications}
              />

              {/* Step Detail Sheet */}
              <StepDetail
                step={selectedStep !== null ? steps[selectedStep] : null}
                index={selectedStep ?? 0}
                open={detailOpen}
                onClose={() => setDetailOpen(false)}
                onNavigate={navigateStep}
                totalSteps={steps.length}
                isBookmarked={selectedStep !== null ? bookmarkedSteps.has(selectedStep) : false}
                onToggleBookmark={toggleBookmark}
              />
            </>
          )}

          {/* Footer */}
          <footer className="flex items-center justify-between px-2 sm:px-4 h-8 bg-background border-t border-border flex-shrink-0 text-[10px] text-muted-foreground/60 safe-area-bottom">
            <div className="flex items-center gap-2 sm:gap-3">
              <span><MessageCircle className="w-3 h-3 inline-block mr-1" />Chat Mirror v3</span>
              <span className="w-px h-3 bg-border hidden sm:block" />
              <span className="hidden sm:inline">AntigravityChat</span>
            </div>
            <div className="flex items-center gap-2 sm:gap-3">
              <button onClick={() => setShowShortcuts(v => !v)}
                className="flex items-center gap-1 hover:text-foreground transition-colors">
                <kbd className="px-1 py-0.5 bg-muted/50 rounded text-[9px] font-mono">?</kbd>
                <span className="hidden sm:inline">Shortcuts</span>
              </button>
              <span className="w-px h-3 bg-border hidden sm:block" />
            </div>
          </footer>
        </div>{/* end main content */}
      </div>
    </AuthGate>
  );
}
