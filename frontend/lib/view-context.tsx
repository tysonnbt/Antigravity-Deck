'use client';

import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from 'react';

/** Read a JSON-serialised value from localStorage (SSR-safe). */
function getStoredValue<T>(key: string, fallback: T): T {
  if (typeof window === 'undefined') return fallback;
  try {
    const stored = localStorage.getItem(key);
    if (stored === null) return fallback;
    return JSON.parse(stored) as T;
  } catch { return fallback; }
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ViewState {
  // Panel visibility
  showAnalytics: boolean;
  showTimeline: boolean;
  showSettings: boolean;
  showLogs: boolean;
  showBridge: boolean;
  showSourceControl: boolean;
  showResources: boolean;
  showAccountInfo: boolean;
  newChatMode: boolean;

}

export interface ViewActions {
  setShowAnalytics: (val: boolean | ((prev: boolean) => boolean)) => void;
  setShowTimeline: (val: boolean) => void;
  setShowSettings: (val: boolean) => void;
  setShowLogs: (val: boolean) => void;
  setShowBridge: (val: boolean) => void;
  setShowSourceControl: (val: boolean) => void;
  setShowResources: (val: boolean) => void;
  setShowAccountInfo: (val: boolean) => void;
  setNewChatMode: (val: boolean) => void;

  /** Reset all panel states to false */
  resetPanels: () => void;

  /** Toggle analytics panel */
  toggleAnalytics: () => void;

  /** Set showTimeline with localStorage persistence */
  handleSetShowTimeline: (val: boolean) => void;
}

export type ViewContextValue = ViewState & ViewActions;

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const ViewContext = createContext<ViewContextValue | null>(null);

export function useViewContext(): ViewContextValue {
  const ctx = useContext(ViewContext);
  if (!ctx) throw new Error('useViewContext must be used within a ViewProvider');
  return ctx;
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

export function ViewProvider({ children }: { children: ReactNode }) {
  // --- Panel visibility ---
  const [showAnalytics, _setShowAnalytics] = useState(() => getStoredValue('antigravity-show-analytics', false));
  const [showTimeline, setShowTimelineRaw] = useState(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('showTimeline');
      return saved !== null ? saved === 'true' : false;
    }
    return false;
  });
  const [showSettings, _setShowSettings] = useState(() => getStoredValue('antigravity-show-settings', false));
  const [showLogs, _setShowLogs] = useState(() => getStoredValue('antigravity-show-logs', false));
  const [showBridge, _setShowBridge] = useState(() => getStoredValue('antigravity-show-bridge', false));
  const [showSourceControl, _setShowSourceControl] = useState(false);
  const [showResources, _setShowResources] = useState(false);
  const [showAccountInfo, _setShowAccountInfo] = useState(() => getStoredValue('antigravity-show-account-info', false));
  const [newChatMode, _setNewChatMode] = useState(false);

  // --- Persist to localStorage ---
  useEffect(() => { localStorage.setItem('antigravity-show-settings', JSON.stringify(showSettings)); }, [showSettings]);
  useEffect(() => { localStorage.setItem('antigravity-show-account-info', JSON.stringify(showAccountInfo)); }, [showAccountInfo]);
  useEffect(() => { localStorage.setItem('antigravity-show-logs', JSON.stringify(showLogs)); }, [showLogs]);
  useEffect(() => { localStorage.setItem('antigravity-show-bridge', JSON.stringify(showBridge)); }, [showBridge]);
  useEffect(() => { localStorage.setItem('antigravity-show-analytics', JSON.stringify(showAnalytics)); }, [showAnalytics]);

  // Listen for localStorage changes (e.g. from Settings view) for showTimeline
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === 'showTimeline' && e.newValue !== null) {
        setShowTimelineRaw(e.newValue === 'true');
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, []);

  // --- Setters (exposed as stable callbacks) ---
  const setShowAnalytics = useCallback((val: boolean | ((prev: boolean) => boolean)) => {
    _setShowAnalytics(val);
  }, []);

  const handleSetShowTimeline = useCallback((val: boolean) => {
    setShowTimelineRaw(val);
    localStorage.setItem('showTimeline', String(val));
  }, []);

  const setShowTimeline = handleSetShowTimeline;

  const setShowSettings = useCallback((val: boolean) => { _setShowSettings(val); }, []);
  const setShowLogs = useCallback((val: boolean) => { _setShowLogs(val); }, []);
  const setShowBridge = useCallback((val: boolean) => { _setShowBridge(val); }, []);
  const setShowSourceControl = useCallback((val: boolean) => { _setShowSourceControl(val); }, []);
  const setShowResources = useCallback((val: boolean) => { _setShowResources(val); }, []);
  const setShowAccountInfo = useCallback((val: boolean) => { _setShowAccountInfo(val); }, []);
  const setNewChatMode = useCallback((val: boolean) => { _setNewChatMode(val); }, []);

  // --- Composite actions ---
  const resetPanels = useCallback(() => {
    _setNewChatMode(false);
    _setShowAccountInfo(false);
    _setShowSettings(false);
    _setShowLogs(false);
    _setShowBridge(false);
    _setShowSourceControl(false);
    _setShowResources(false);
  }, []);

  const toggleAnalytics = useCallback(() => {
    _setShowAnalytics(v => !v);
  }, []);

  const value: ViewContextValue = {
    // State
    showAnalytics,
    showTimeline,
    showSettings,
    showLogs,
    showBridge,
    showSourceControl,
    showResources,
    showAccountInfo,
    newChatMode,
    // Actions
    setShowAnalytics,
    setShowTimeline,
    setShowSettings,
    setShowLogs,
    setShowBridge,
    setShowSourceControl,
    setShowResources,
    setShowAccountInfo,
    setNewChatMode,
    resetPanels,
    toggleAnalytics,
    handleSetShowTimeline,
  };

  return <ViewContext.Provider value={value}>{children}</ViewContext.Provider>;
}
