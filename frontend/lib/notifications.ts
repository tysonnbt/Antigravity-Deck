'use client';

import { wsService } from './ws-service';
import { updateSettings, getSettings } from './cascade-api';

// === Types ===

export interface NotificationSettings {
  enabled: boolean;
  events: {
    cascadeComplete: boolean;
    waitingForUser: boolean;
    error: boolean;
    autoAccepted: boolean;
  };
}

// === Constants ===

const STORAGE_KEY = 'antigravity-notification-settings';
const SETTINGS_CHANGED_EVENT = 'notification-settings-changed';

const DEFAULT_SETTINGS: NotificationSettings = {
  enabled: false,
  events: {
    cascadeComplete: true,
    waitingForUser: true,
    error: true,
    autoAccepted: false,
  },
};

const COMPLETE_STATUSES = [
  'CASCADE_RUN_STATUS_IDLE',
  'CASCADE_RUN_STATUS_DONE',
  'CASCADE_RUN_STATUS_COMPLETED',
];
const ACTIVE_STATUSES = [
  'CASCADE_RUN_STATUS_RUNNING',
  'CASCADE_RUN_STATUS_WAITING_FOR_USER',
];
const ERROR_STATUSES = [
  'CASCADE_RUN_STATUS_ERROR',
  'CASCADE_RUN_STATUS_FAILED',
  'CASCADE_RUN_STATUS_CANCELLED',
];

const DEBOUNCE_MS = 5000; // 5s debounce per event+conv

// === Notification titles & bodies ===

const EVENT_CONFIG: Record<string, { title: string; body: string; tag: string }> = {
  'cascade-complete': {
    title: '✅ Cascade Complete',
    body: 'Your cascade has finished running.',
    tag: 'cascade-complete',
  },
  'waiting-for-user': {
    title: '⏳ Action Required',
    body: 'Cascade is waiting for your approval.',
    tag: 'waiting-for-user',
  },
  'error': {
    title: '❌ Cascade Error',
    body: 'Your cascade encountered an error.',
    tag: 'cascade-error',
  },
  'auto-accepted': {
    title: '⚡ Auto-Accepted',
    body: 'A change was auto-accepted.',
    tag: 'auto-accepted',
  },
};

// === Service ===

class NotificationService {
  private _initialized = false;
  private _settings: NotificationSettings = DEFAULT_SETTINGS;
  private _swRegistration: ServiceWorkerRegistration | null = null;
  private unsubscribers: Array<() => void> = [];

  // Status tracker (same pattern as SoundNotificationService)
  private statuses = new Map<string, string>();
  private initSeeded = new Set<string>();
  private lastNotifyTime = new Map<string, number>();

  constructor() {
    this._settings = this.loadSettings();
  }

  getSettings(): NotificationSettings {
    const perm = this.getPermission();
    const settings = JSON.parse(JSON.stringify(this._settings));
    // If permission is not granted, notifications are always off
    if (perm !== 'granted') {
      settings.enabled = false;
    }
    return settings;
  }

  getPermission(): NotificationPermission {
    if (typeof window === 'undefined' || !('Notification' in window)) return 'denied';
    return Notification.permission;
  }

  async setEnabled(enabled: boolean): Promise<void> {
    if (enabled) {
      const perm = this.getPermission();
      if (perm === 'denied') {
        // Can't enable — permission blocked
        return;
      }
      if (perm === 'default') {
        // Must request permission first
        const result = await this.requestPermission();
        if (result !== 'granted') {
          // User didn't grant — don't enable
          return;
        }
      }
      // Permission is granted — enable
      this._settings.enabled = true;
    } else {
      this._settings.enabled = false;
    }
    this.saveSettings();
  }

  setEventEnabled(event: keyof NotificationSettings['events'], enabled: boolean): void {
    this._settings.events[event] = enabled;
    this.saveSettings();
  }

  async requestPermission(): Promise<NotificationPermission> {
    if (typeof window === 'undefined' || !('Notification' in window)) return 'denied';
    const result = await Notification.requestPermission();
    // Auto-enable if permission was just granted and user wanted to enable
    if (result === 'granted' && !this._settings.enabled) {
      this._settings.enabled = true;
      this.saveSettings();
    }
    // Emit settings change to update UI (permission status changed)
    window.dispatchEvent(new Event(SETTINGS_CHANGED_EVENT));
    return result;
  }

  private loadSettings(): NotificationSettings {
    if (typeof window === 'undefined') return JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (!stored) return JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
      const parsed = JSON.parse(stored);
      return {
        enabled: typeof parsed.enabled === 'boolean' ? parsed.enabled : DEFAULT_SETTINGS.enabled,
        events: {
          cascadeComplete: typeof parsed.events?.cascadeComplete === 'boolean' ? parsed.events.cascadeComplete : DEFAULT_SETTINGS.events.cascadeComplete,
          waitingForUser: typeof parsed.events?.waitingForUser === 'boolean' ? parsed.events.waitingForUser : DEFAULT_SETTINGS.events.waitingForUser,
          error: typeof parsed.events?.error === 'boolean' ? parsed.events.error : DEFAULT_SETTINGS.events.error,
          autoAccepted: typeof parsed.events?.autoAccepted === 'boolean' ? parsed.events.autoAccepted : DEFAULT_SETTINGS.events.autoAccepted,
        },
      };
    } catch {
      return JSON.parse(JSON.stringify(DEFAULT_SETTINGS));
    }
  }

  private saveSettings(): void {
    if (typeof window === 'undefined') return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this._settings));
    } catch {
      // localStorage full or blocked
    }
    window.dispatchEvent(new Event(SETTINGS_CHANGED_EVENT));
    // Persist to server (fire-and-forget)
    updateSettings({ notifications: this._settings }).catch(() => {});
  }

  // --- Lifecycle ---

  async init(): Promise<void> {
    if (this._initialized) return;
    this._initialized = true;

    // Register service worker
    if ('serviceWorker' in navigator) {
      try {
        this._swRegistration = await navigator.serviceWorker.register('/sw.js');
        console.log('[Notifications] SW registered:', this._swRegistration.scope);
      } catch (e) {
        console.warn('[Notifications] SW registration failed:', e);
      }
    }

    // Load settings from server (overrides localStorage if available)
    try {
      const serverSettings = await getSettings();
      if (serverSettings.notifications && typeof serverSettings.notifications === 'object') {
        const ns = serverSettings.notifications as Record<string, unknown>;
        this._settings = {
          enabled: typeof ns.enabled === 'boolean' ? ns.enabled : this._settings.enabled,
          events: {
            cascadeComplete: typeof (ns.events as Record<string, unknown>)?.cascadeComplete === 'boolean' ? (ns.events as Record<string, boolean>).cascadeComplete : this._settings.events.cascadeComplete,
            waitingForUser: typeof (ns.events as Record<string, unknown>)?.waitingForUser === 'boolean' ? (ns.events as Record<string, boolean>).waitingForUser : this._settings.events.waitingForUser,
            error: typeof (ns.events as Record<string, unknown>)?.error === 'boolean' ? (ns.events as Record<string, boolean>).error : this._settings.events.error,
            autoAccepted: typeof (ns.events as Record<string, unknown>)?.autoAccepted === 'boolean' ? (ns.events as Record<string, boolean>).autoAccepted : this._settings.events.autoAccepted,
          },
        };
        // Sync to localStorage
        try { localStorage.setItem(STORAGE_KEY, JSON.stringify(this._settings)); } catch {}
        window.dispatchEvent(new Event(SETTINGS_CHANGED_EVENT));
      }
    } catch {
      // Server unavailable, use localStorage fallback
    }

    // Subscribe to WS events (same pattern as SoundNotificationService)
    if (wsService) {
      this.unsubscribers.push(
        wsService.on('cascade_status', (data) => {
          const convId = data.conversationId as string;
          const newStatus = data.status as string;
          if (!convId || !newStatus) return;
          this.handleCascadeStatus(convId, newStatus);
        })
      );
      this.unsubscribers.push(
        wsService.on('auto_accepted', (data) => {
          const convId = data.conversationId as string;
          if (!convId) return;
          this.notify('auto-accepted', convId);
        })
      );
    }
  }

  // --- Cascade Status State Machine (mirrors SoundNotificationService) ---

  private handleCascadeStatus(convId: string, newStatus: string): void {
    const prev = this.statuses.get(convId);
    this.statuses.set(convId, newStatus);

    // Smart init: first event is seed
    if (this.initSeeded.has(convId)) {
      this.initSeeded.delete(convId);
      if (prev === newStatus) return;
    }

    if (prev === undefined) {
      this.initSeeded.add(convId);
      return;
    }

    // Cascade complete
    if (ACTIVE_STATUSES.includes(prev) && COMPLETE_STATUSES.includes(newStatus)) {
      this.notify('cascade-complete', convId);
      return;
    }

    // Waiting for user
    if (newStatus === 'CASCADE_RUN_STATUS_WAITING_FOR_USER' && prev !== 'CASCADE_RUN_STATUS_WAITING_FOR_USER') {
      this.notify('waiting-for-user', convId);
      return;
    }

    // Error (includes CANCELLED)
    if (ERROR_STATUSES.includes(newStatus) && !ERROR_STATUSES.includes(prev)) {
      this.notify('error', convId);
      return;
    }
  }

  // --- Notification dispatch ---

  private notify(eventId: string, convId: string): void {
    if (!this._settings.enabled) return;
    if (this.getPermission() !== 'granted') return;

    // Check per-event toggle
    const eventKey = this.eventIdToKey(eventId);
    if (eventKey && !this._settings.events[eventKey]) return;

    // Debounce
    const key = `${eventId}:${convId}`;
    const now = Date.now();
    if (now - (this.lastNotifyTime.get(key) || 0) < DEBOUNCE_MS) return;
    this.lastNotifyTime.set(key, now);

    // Don't notify if the app is in the foreground and visible
    if (document.visibilityState === 'visible' && document.hasFocus()) return;

    const config = EVENT_CONFIG[eventId];
    if (!config) return;

    this.showNotification(config.title, config.body, {
      tag: `${config.tag}-${convId.substring(0, 8)}`,
      data: { url: '/', convId },
    });
  }

  private eventIdToKey(eventId: string): keyof NotificationSettings['events'] | null {
    const map: Record<string, keyof NotificationSettings['events']> = {
      'cascade-complete': 'cascadeComplete',
      'waiting-for-user': 'waitingForUser',
      'error': 'error',
      'auto-accepted': 'autoAccepted',
    };
    return map[eventId] || null;
  }

  private showNotification(title: string, body: string, options: { tag?: string; data?: Record<string, unknown> } = {}): void {
    // Prefer Service Worker (persistent, works when tab is background)
    if (this._swRegistration?.active) {
      this._swRegistration.active.postMessage({
        type: 'SHOW_NOTIFICATION',
        title,
        body,
        tag: options.tag,
        data: options.data,
      });
      return;
    }

    // Fallback: basic Notification API
    try {
      new Notification(title, {
        body,
        icon: '/favicon.ico',
        tag: options.tag,
      });
    } catch {
      console.warn('[Notifications] Failed to show notification');
    }
  }

  // --- Test ---

  testNotification(): void {
    if (this.getPermission() !== 'granted') {
      this.requestPermission().then((p) => {
        if (p === 'granted') {
          this.showNotification('🔔 Test Notification', 'Notifications are working!', {
            tag: 'test',
          });
        }
      });
      return;
    }
    this.showNotification('🔔 Test Notification', 'Notifications are working!', {
      tag: 'test',
    });
  }

  // --- Cleanup ---

  destroy(): void {
    this.unsubscribers.forEach((unsub) => unsub());
    this.unsubscribers = [];
    this.statuses.clear();
    this.initSeeded.clear();
    this.lastNotifyTime.clear();
    this._initialized = false;
  }
}

export const notificationService = typeof window !== 'undefined'
  ? new NotificationService()
  : null;

export { SETTINGS_CHANGED_EVENT as NOTIFICATION_SETTINGS_CHANGED };
