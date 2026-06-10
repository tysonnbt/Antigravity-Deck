'use client';

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

// === Service ===

class NotificationService {
  private _initialized = false;
  private _settings: NotificationSettings = DEFAULT_SETTINGS;
  private _swRegistration: ServiceWorkerRegistration | null = null;

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
      // Permission is granted — enable and subscribe to push
      this._settings.enabled = true;
      if (this._swRegistration) {
        this.subscribeToPush().catch(() => {});
      }
    } else {
      this._settings.enabled = false;
      // Unsubscribe from push when user disables notifications
      this.unsubscribeFromPush().catch(() => {});
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
      // Also subscribe to push now that we have permission
      if (this._swRegistration) {
        this.subscribeToPush().catch(() => {});
      }
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

    // Register service worker.
    // In development (Turbopack/HMR), a caching SW serves stale JS bundles on a *normal* reload,
    // causing "module factory not available" errors (the cached page.tsx still references modules
    // removed in newer code). So in dev we do NOT register it, and actively unregister any existing
    // SW + clear caches so every normal reload gets fresh code.
    if ('serviceWorker' in navigator) {
      if (process.env.NODE_ENV === 'development') {
        try {
          const regs = await navigator.serviceWorker.getRegistrations();
          await Promise.all(regs.map((r) => r.unregister()));
          if ('caches' in window) {
            const keys = await caches.keys();
            await Promise.all(keys.map((k) => caches.delete(k)));
          }
          if (regs.length) console.log('[Notifications] Dev mode — unregistered SW + cleared caches');
        } catch (e) {
          console.warn('[Notifications] Dev SW cleanup failed:', e);
        }
      } else {
        try {
          this._swRegistration = await navigator.serviceWorker.register('/sw.js');
          console.log('[Notifications] SW registered:', this._swRegistration.scope);
        } catch (e) {
          console.warn('[Notifications] SW registration failed:', e);
        }
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

    console.log('[Notifications] Initialized — enabled:', this._settings.enabled, 'permission:', this.getPermission());

    // Subscribe to Web Push (background notifications even when tab is closed)
    if (this._settings.enabled && this.getPermission() === 'granted' && this._swRegistration) {
      this.subscribeToPush().catch((e) => {
        console.warn('[Notifications] Push subscription failed:', e);
      });
    }
  }

  // --- Web Push Subscription ---

  private async subscribeToPush(): Promise<void> {
    if (!this._swRegistration) return;

    const { API_BASE } = await import('./config');
    const { authHeaders } = await import('./auth');

    // Check if already subscribed in the browser
    const existing = await this._swRegistration.pushManager.getSubscription();
    if (existing) {
      // Always re-confirm with the server — it may have lost our subscription
      // (e.g. server restart, push-subscriptions.json wiped, or first time on PWA).
      // The server deduplicates by endpoint so this is idempotent.
      try {
        await fetch(`${API_BASE}/api/push/subscribe`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...authHeaders() },
          body: JSON.stringify(existing.toJSON()),
        });
        console.log('[Notifications] Push subscription re-confirmed with server');
      } catch {
        console.warn('[Notifications] Could not re-confirm push subscription with server');
      }
      return;
    }

    // No existing subscription — create one
    try {
      const res = await fetch(`${API_BASE}/api/push/vapid-public-key`, { headers: authHeaders() });
      if (!res.ok) {
        console.warn('[Notifications] Could not fetch VAPID key:', res.status);
        return;
      }
      const { publicKey } = await res.json();
      if (!publicKey) return;

      // Subscribe via Push API.
      // Pass Uint8Array directly (not .buffer) — .buffer can include extra padding
      // bytes if the array is a view into a larger underlying ArrayBuffer.
      const subscription = await this._swRegistration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: this.urlBase64ToUint8Array(publicKey).buffer as ArrayBuffer,
      });

      // Send subscription to backend
      await fetch(`${API_BASE}/api/push/subscribe`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify(subscription.toJSON()),
      });

      console.log('[Notifications] ✅ Push subscription registered');
    } catch (e) {
      console.warn('[Notifications] Push subscribe error:', e);
    }
  }

  private async unsubscribeFromPush(): Promise<void> {
    if (!this._swRegistration) return;
    try {
      const existing = await this._swRegistration.pushManager.getSubscription();
      if (!existing) return;
      const endpoint = existing.endpoint;
      await existing.unsubscribe();
      // Tell backend to remove this subscription
      try {
        const { API_BASE } = await import('./config');
        const { authHeaders } = await import('./auth');
        await fetch(`${API_BASE}/api/push/unsubscribe`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', ...authHeaders() },
          body: JSON.stringify({ endpoint }),
        });
      } catch {}
      console.log('[Notifications] Push subscription removed');
    } catch (e) {
      console.warn('[Notifications] Push unsubscribe error:', e);
    }
  }

  private urlBase64ToUint8Array(base64String: string): Uint8Array {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) {
      outputArray[i] = rawData.charCodeAt(i);
    }
    return outputArray;
  }

  // --- Test (used by Settings UI "Test Notification" button) ---

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

  // --- Cleanup ---

  destroy(): void {
    this._initialized = false;
  }
}

export const notificationService = typeof window !== 'undefined'
  ? new NotificationService()
  : null;

export { SETTINGS_CHANGED_EVENT as NOTIFICATION_SETTINGS_CHANGED };
