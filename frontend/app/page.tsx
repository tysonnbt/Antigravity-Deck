'use client';

import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import dynamic from 'next/dynamic';
import { useWebSocket } from '@/lib/websocket';
import { extractStepContent, exportToMarkdown } from '@/lib/step-utils';
import { Timeline } from '@/components/timeline';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { MoreVertical, BarChart2, Download, Bell, BellOff, FolderSync, Star, WifiOff, FolderOpen } from 'lucide-react';
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
import { SourceControlView } from '@/components/source-control-view';
import { ResourceMonitorView } from '@/components/resource-monitor-view';

// Lazy-load components that are hidden by default
const AnalyticsPanel = dynamic(() => import('@/components/analytics-panel').then(m => ({ default: m.AnalyticsPanel })), { ssr: false });
const StepDetail = dynamic(() => import('@/components/step-detail').then(m => ({ default: m.StepDetail })), { ssr: false });

/** Read a JSON-serialised value from localStorage (SSR-safe). */
function getStoredValue<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const stored = localStorage.getItem(key);
    if (stored === null) return fallback;
    return JSON.parse(stored) as T;
  } catch { return fallback; }
}

export default function Home() {
  const { connected, detected, steps, baseIndex, stepCount, loadingOlder, conversations, currentConvId, cascadeStatus, conversationsVersion, stepContentVersion, workspaceResources, selectConversation, lastUpdate, loadOlder } = useWebSocket();

  const [showAnalytics, setShowAnalytics] = useState(() => getStoredValue('antigravity-show-analytics', false));
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
  const [activeWorkspace, setActiveWorkspace] = useState<string | null>(() => getStoredValue('antigravity-active-workspace', null));
  // NEW: When true, show ChatView in "new chat" mode (no conversation yet)
  const [newChatMode, setNewChatMode] = useState(false);
  // NEW: When true, show AccountInfoView in main panel
  const [showAccountInfo, setShowAccountInfo] = useState(() => getStoredValue('antigravity-show-account-info', false));
  // NEW: When true, show SettingsView in main panel
  const [showSettings, setShowSettings] = useState(() => getStoredValue('antigravity-show-settings', false));
  // NEW: When true, show AgentLogsView in main panel
  const [showLogs, setShowLogs] = useState(() => getStoredValue('antigravity-show-logs', false));
  // NEW: When true, show Agent Bridge in main panel
  const [showBridge, setShowBridge] = useState(() => getStoredValue('antigravity-show-bridge', false));
  // NEW: When true, show Source Control / IDE view in main panel
  const [showSourceControl, setShowSourceControl] = useState(false);
  const [showResources, setShowResources] = useState(false);
  // Bumped when sidebar creates a workspace, so panels refresh their lists
  const [wsVersion, setWsVersion] = useState(0);

  // Auto-bump wsVersion when backend discovers new conversations
  useEffect(() => {
    if (conversationsVersion > 0) setWsVersion(v => v + 1);
  }, [conversationsVersion]);

  // === Persist navigation state to localStorage ===
  useEffect(() => { localStorage.setItem('antigravity-active-workspace', JSON.stringify(activeWorkspace)); }, [activeWorkspace]);
  useEffect(() => { localStorage.setItem('antigravity-show-settings', JSON.stringify(showSettings)); }, [showSettings]);
  useEffect(() => { localStorage.setItem('antigravity-show-account-info', JSON.stringify(showAccountInfo)); }, [showAccountInfo]);
  useEffect(() => { localStorage.setItem('antigravity-show-logs', JSON.stringify(showLogs)); }, [showLogs]);
  useEffect(() => { localStorage.setItem('antigravity-show-bridge', JSON.stringify(showBridge)); }, [showBridge]);
  useEffect(() => { localStorage.setItem('antigravity-show-analytics', JSON.stringify(showAnalytics)); }, [showAnalytics]);

  // Persist currentConvId and restore on mount
  useEffect(() => {
    localStorage.setItem('antigravity-current-conv-id', JSON.stringify(currentConvId));
  }, [currentConvId]);

  useEffect(() => {
    const storedConvId = getStoredValue<string | null>('antigravity-current-conv-id', null);
    if (storedConvId) {
      selectConversation(storedConvId);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // run once on mount

  // Step detail state
  const [selectedStep, setSelectedStep] = useState<number | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  // Bookmarks
  const [bookmarkedSteps, setBookmarkedSteps] = useState<Set<number>>(new Set());


  // Helper to reset all panel states
  const resetPanels = useCallback(() => {
    setNewChatMode(false);
    setShowAccountInfo(false);
    setShowSettings(false);
    setShowLogs(false);
    setShowBridge(false);
    setShowSourceControl(false);
    setShowResources(false);
  }, []);

  // === Sidebar: click workspace → show conversation list ===
  const handleSelectWorkspace = useCallback((wsName: string) => {
    setActiveWorkspace(wsName);
    resetPanels();
    selectConversation(null);
  }, [selectConversation, resetPanels]);

  // === Sidebar or ConversationList: click conversation → open chat ===
  const handleSelectConversation = useCallback((convId: string | null, wsName: string) => {
    setActiveWorkspace(wsName);
    resetPanels();
    selectConversation(convId);
  }, [selectConversation, resetPanels]);

  // === ConversationList: click conversation (workspace already set) ===
  const handleConvListSelect = useCallback((convId: string) => {
    resetPanels();
    selectConversation(convId);
  }, [selectConversation, resetPanels]);

  // === New Chat from ConversationList — show ChatView in new chat mode ===
  const handleNewChat = useCallback(() => {
    selectConversation(null);
    resetPanels();
    setNewChatMode(true);
  }, [selectConversation, resetPanels]);

  // === Start conversation from sidebar (new chat button) ===
  const handleStartConversation = useCallback(() => {
    selectConversation(null);
    resetPanels();
    if (activeWorkspace !== null) {
      setNewChatMode(true);
    } else {
      setActiveWorkspace(null);
    }
  }, [selectConversation, activeWorkspace, resetPanels]);

  // === Show account info in main panel ===
  const handleShowAccountInfo = useCallback(() => {
    selectConversation(null);
    resetPanels();
    setActiveWorkspace(null);
    setShowAccountInfo(true);
  }, [selectConversation, resetPanels]);

  // === Show settings in main panel ===
  const handleShowSettings = useCallback(() => {
    selectConversation(null);
    resetPanels();
    setActiveWorkspace(null);
    setShowSettings(true);
  }, [selectConversation, resetPanels]);

  // === Show Live Logs ===
  const handleShowLogs = useCallback(() => {
    selectConversation(null);
    resetPanels();
    setActiveWorkspace(null);
    setShowLogs(true);
  }, [selectConversation, resetPanels]);

  // === Show Agent Bridge ===
  const handleShowBridge = useCallback(() => {
    selectConversation(null);
    resetPanels();
    setActiveWorkspace(null);
    setShowBridge(true);
  }, [selectConversation, resetPanels]);

  // === Show Source Control / IDE ===
  const handleShowSourceControl = useCallback(() => {
    selectConversation(null);
    resetPanels();
    setShowSourceControl(true);
  }, [selectConversation, resetPanels]);

  // === Show Resources ===
  const handleShowResources = useCallback(() => {
    selectConversation(null);
    resetPanels();
    setActiveWorkspace(null);
    setShowResources(true);
  }, [selectConversation, resetPanels]);

  // === Go Home — reset all navigation state to welcome screen ===
  const handleGoHome = useCallback(() => {
    selectConversation(null);
    setActiveWorkspace(null);
    setNewChatMode(false);
    setShowAccountInfo(false);
    setShowSettings(false);
    setShowLogs(false);
    setShowBridge(false);
    setShowResources(false);
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

  // ChatView's "New Chat" button — enter new chat mode directly
  // Reuses handleNewChat logic: clear conversation + enable newChatMode



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
  // When LS not detected, force welcome/detection screen regardless of stored state
  const showChat = detected && (currentConvId !== null || newChatMode);
  const showConversationList = detected && !showChat && !showAccountInfo && !showSettings && !showLogs && !showBridge && !showSourceControl && !showResources && activeWorkspace !== null;
  const showWelcome = !detected || (!showChat && !showConversationList && !showAccountInfo && !showSettings && !showLogs && !showBridge && !showSourceControl && !showResources);

  return (
    <AuthGate>
      <div className="flex h-dvh w-full bg-background text-foreground overflow-hidden">
        {/* Shadcn App Sidebar */}
        <AppSidebar
          currentConvId={currentConvId}
          conversationsVersion={conversationsVersion}
          detected={detected}
          activeWorkspace={activeWorkspace}
          workspaceResources={workspaceResources}
          onSelectWorkspace={handleSelectWorkspace}
          onSelectConversation={handleSelectConversation}
          onShowAccountInfo={handleShowAccountInfo}
          onShowSettings={handleShowSettings}
          onShowLogs={handleShowLogs}
          onShowBridge={handleShowBridge}
          onShowSourceControl={handleShowSourceControl}
          onShowResources={handleShowResources}
          onGoHome={handleGoHome}
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
                <FolderSync className="w-4 h-4" />
                {activeWorkspace ? (
                  <span className="font-semibold text-sm truncate max-w-[120px] sm:max-w-[200px]">{activeWorkspace}</span>
                ) : (
                  <>
                    <span className="font-semibold text-sm">Antigravity Deck</span>
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
              {/* Status indicators — WS connection + LS detection */}
              <div className="flex items-center gap-1.5">
                {/* WebSocket connection status */}
                <div className={`flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium ${connected ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-red-500/10 text-red-400 border border-red-500/20'}`}>
                  <div className={`w-1.5 h-1.5 rounded-full ${connected ? 'bg-emerald-400' : 'bg-red-400'}`} />
                  <span>WS</span>
                </div>
                {/* Language Server detection status */}
                <div className={`flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium ${detected ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : connected ? 'bg-amber-500/10 text-amber-400 border border-amber-500/20' : 'bg-muted text-muted-foreground border border-border/30'}`}>
                  <div className={`w-1.5 h-1.5 rounded-full ${detected ? 'bg-emerald-400' : connected ? 'bg-amber-400 animate-pulse' : 'bg-muted-foreground/50'}`} />
                  <span>{detected ? 'LS Connected' : connected ? 'Detecting...' : 'LS N/A'}</span>
                </div>
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

          {/* Analytics — always mounted when data available, animate open/close */}
          {currentConvId && steps.length > 0 && (
            <div className={`grid transition-all duration-200 ease-in-out ${showAnalytics ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'}`}>
              <div className="overflow-hidden">
                <AnalyticsPanel steps={steps} />
              </div>
            </div>
          )}

          {/* === Main panel content === */}
          {showWelcome && !detected && (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center space-y-5 max-w-sm">
                <div className="flex items-center justify-center gap-3">
                  <WifiOff className="w-8 h-8 text-muted-foreground/50" />
                  <h2 className="text-xl font-semibold text-foreground/80">Antigravity Not Detected</h2>
                </div>
                <ol className="text-left space-y-2.5 rounded-lg bg-muted/10 border border-border/30 px-5 py-4">
                  {[
                    'Open Antigravity IDE',
                    'Open a project folder in Antigravity',
                    'Antigravity Deck will auto-detect it within ~10 seconds',
                  ].map((text, i) => (
                    <li key={i} className="flex items-start gap-3 text-sm text-muted-foreground">
                      <span className="flex-shrink-0 w-5 h-5 rounded-full bg-muted/30 flex items-center justify-center text-xs font-medium text-muted-foreground/80">
                        {i + 1}
                      </span>
                      <span>{text}</span>
                    </li>
                  ))}
                </ol>
                <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground/70">
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-amber-400/75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-amber-400" />
                  </span>
                  <span>Detecting Antigravity Language Server...</span>
                </div>
              </div>
            </div>
          )}

          {showWelcome && detected && !activeWorkspace && (
            <div className="flex-1 flex items-center justify-center">
              <div className="text-center space-y-4">
                <div className="flex items-center justify-center gap-3">
                  <FolderOpen className="w-8 h-8 text-muted-foreground/50" />
                  <h2 className="text-xl font-semibold text-foreground/80">No Workspace Selected</h2>
                </div>
                <p className="text-sm text-muted-foreground max-w-md">
                  Select a workspace from the sidebar to view conversations, or start a new one.
                </p>
              </div>
            </div>
          )}

          {detected && showAccountInfo && <AccountInfoView />}

          {detected && showSettings && <SettingsView />}

          {/* Always mounted — WS stays alive, events accumulate in background */}
          <div className={detected && showLogs ? 'flex flex-col flex-1 min-h-0 overflow-hidden' : 'hidden'}>
            <AgentLogsView />
          </div>

          {/* Agent Bridge panel */}
          <div className={detected && showBridge ? 'flex flex-col flex-1 min-h-0 overflow-hidden' : 'hidden'}>
            <AgentBridgeView />
          </div>

          {/* Source Control / IDE panel */}
          {showSourceControl && (
            <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
              {activeWorkspace ? (
                <SourceControlView
                  workspace={activeWorkspace}
                  onClose={() => setShowSourceControl(false)}
                />
              ) : (
                <div className="flex-1 flex items-center justify-center">
                  <div className="text-center space-y-3">
                    <div className="text-4xl">📂</div>
                    <h3 className="text-lg font-semibold text-foreground/70">No workspace selected</h3>
                    <p className="text-sm text-muted-foreground max-w-sm">
                      Select a workspace from the sidebar first, then open Source Control.
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Resource Monitor panel */}
          {showResources && (
            <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
              <ResourceMonitorView />
            </div>
          )}

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
                baseIndex={baseIndex}
                stepCount={stepCount}
                loadingOlder={loadingOlder}
                onLoadOlder={loadOlder}
                currentConvId={currentConvId}
                currentWorkspace={activeWorkspace}
                wsVersion={wsVersion}
                cascadeStatus={cascadeStatus ?? undefined}
                onCascadeCreated={handleCascadeCreated}
                onNewConversation={handleNewChat}
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
              <span><FolderSync className="w-3 h-3 inline-block mr-1" />Antigravity Deck v3</span>
              <span className="w-px h-3 bg-border hidden sm:block" />
              <span className="hidden sm:inline">AntigravityChat</span>
            </div>
            <div className="flex items-center gap-2 sm:gap-3">
              <button onClick={() => setShowShortcuts(v => !v)}
                className="flex items-center gap-1 hover:text-foreground transition-colors">
                <kbd className="px-1 py-0.5 bg-muted/50 rounded text-[9px] font-mono">?</kbd>
                <span>Shortcuts</span>
              </button>
            </div>
          </footer>
        </div>{/* end main content */}
      </div>
    </AuthGate>
  );
}
