'use client';

import { wsService } from './ws-service';

// === Types ===

export interface SoundSettings {
  enabled: boolean;
  volume: number; // 0-100
}

// === Constants ===

const STORAGE_KEY = 'antigravity-sound-settings';
const DEFAULT_SETTINGS: SoundSettings = { enabled: false, volume: 70 };
const SETTINGS_CHANGED_EVENT = 'sound-settings-changed';

const SOUND_FILES: Record<string, string> = {
  'cascade-complete': '/sounds/cascade-complete.mp3',
  'waiting-for-user': '/sounds/waiting-for-user.mp3',
  'error': '/sounds/error.mp3',
  'auto-accepted': '/sounds/auto-accepted.mp3',
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
];

const DEBOUNCE_MS = 3000;

// Events suppressed by default in Phase 1 (spec: auto-accepted defaults to OFF)
// Phase 2 will add per-event UI toggle; for now just skip these in playInternal
const SUPPRESSED_BY_DEFAULT = new Set(['auto-accepted']);

// === Service ===

class SoundNotificationService {
  private audioContext: AudioContext | null = null;
  private buffers = new Map<string, AudioBuffer>();
  private _unlocked = false;
  private _initialized = false;
  private _settings: SoundSettings = DEFAULT_SETTINGS;
  private unsubscribers: Array<() => void> = [];

  // Status tracker — keyed per conversationId
  private statuses = new Map<string, string>();
  private initSeeded = new Set<string>();
  private lastPlayTime = new Map<string, number>();

  constructor() {
    this._settings = this.loadSettings();
  }

  // --- Settings ---

  getSettings(): SoundSettings {
    return { ...this._settings };
  }

  setEnabled(enabled: boolean): void {
    this._settings.enabled = enabled;
    this.saveSettings();
  }

  setVolume(volume: number): void {
    this._settings.volume = Math.max(0, Math.min(100, volume));
    this.saveSettings();
  }

  isUnlocked(): boolean {
    return this._unlocked;
  }

  private loadSettings(): SoundSettings {
    if (typeof window === 'undefined') return DEFAULT_SETTINGS;
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (!stored) return DEFAULT_SETTINGS;
      const parsed = JSON.parse(stored);
      return {
        enabled: typeof parsed.enabled === 'boolean' ? parsed.enabled : DEFAULT_SETTINGS.enabled,
        volume: typeof parsed.volume === 'number' ? parsed.volume : DEFAULT_SETTINGS.volume,
      };
    } catch {
      return DEFAULT_SETTINGS;
    }
  }

  private saveSettings(): void {
    if (typeof window === 'undefined') return;
    localStorage.setItem(STORAGE_KEY, JSON.stringify(this._settings));
    window.dispatchEvent(new Event(SETTINGS_CHANGED_EVENT));
  }

  // --- Lifecycle (init/unlock/destroy in Task 4) ---

  init(): void {
    // Placeholder — filled in Task 4
  }

  unlock(): void {
    // Placeholder — filled in Task 4
  }

  testSound(): void {
    // Placeholder — filled in Task 4
  }

  destroy(): void {
    // Placeholder — filled in Task 4
  }
}

export const soundService = typeof window !== 'undefined'
  ? new SoundNotificationService()
  : null;

export { SETTINGS_CHANGED_EVENT };
