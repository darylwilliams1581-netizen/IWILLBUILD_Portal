/**
 * useWatermarkSettings
 * ─────────────────────────────────────────────────────────────────────────────
 * Persists the four watermark overlay toggles to localStorage so the user's
 * preferences survive navigation and app restarts.
 *
 * Watermark layout — two-row compact panel at bottom-left:
 *   Line 1: Job Name  —  Date  —  Time   (values only, separated by em-dashes)
 *   Line 2: Label                         (wraps if long; hidden when empty/off)
 *
 * Settings keys:
 *   showJobName — job name (first value on line 1)
 *   showDate    — current date (DD/MM/YYYY)
 *   showTime    — current time (HH:MM)
 *   showLabel   — user-typed label (line 2)
 *
 * All default to true on first use.
 * Storage key bumped to v2; v1 key is migrated on first read.
 */

import { useState, useCallback } from 'react';

const STORAGE_KEY    = 'iwb_watermark_settings_v2';
const STORAGE_KEY_V1 = 'iwb_watermark_settings_v1';

export interface WatermarkSettings {
  showDate:    boolean;
  showTime:    boolean;
  showJobName: boolean;
  showLabel:   boolean;
}

const DEFAULTS: WatermarkSettings = {
  showDate:    true,
  showTime:    true,
  showJobName: true,
  showLabel:   true,
};

function load(): WatermarkSettings {
  try {
    // Try v2 first
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<WatermarkSettings>;
      return {
        showDate:    parsed.showDate    ?? DEFAULTS.showDate,
        showTime:    parsed.showTime    ?? DEFAULTS.showTime,
        showJobName: parsed.showJobName ?? DEFAULTS.showJobName,
        showLabel:   parsed.showLabel   ?? DEFAULTS.showLabel,
      };
    }
    // Migrate from v1 (showJobNumber → showJobName)
    const rawV1 = localStorage.getItem(STORAGE_KEY_V1);
    if (rawV1) {
      const p = JSON.parse(rawV1) as Record<string, boolean>;
      return {
        showDate:    p['showDate']      ?? DEFAULTS.showDate,
        showTime:    p['showTime']      ?? DEFAULTS.showTime,
        showJobName: p['showJobNumber'] ?? DEFAULTS.showJobName,
        showLabel:   p['showLabel']     ?? DEFAULTS.showLabel,
      };
    }
    return { ...DEFAULTS };
  } catch {
    return { ...DEFAULTS };
  }
}

function save(s: WatermarkSettings): void {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(s)); } catch { /* quota */ }
}

export function useWatermarkSettings() {
  const [settings, setSettings] = useState<WatermarkSettings>(load);

  const toggle = useCallback((key: keyof WatermarkSettings) => {
    setSettings((prev) => {
      const next = { ...prev, [key]: !prev[key] };
      save(next);
      return next;
    });
  }, []);

  const update = useCallback((patch: Partial<WatermarkSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      save(next);
      return next;
    });
  }, []);

  return { settings, toggle, update };
}
