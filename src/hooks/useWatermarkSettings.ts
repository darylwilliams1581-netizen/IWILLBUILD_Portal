/**
 * useWatermarkSettings
 * ─────────────────────────────────────────────────────────────────────────────
 * Persists the four watermark overlay toggles to localStorage so the user's
 * preferences survive navigation and app restarts.
 *
 * Watermark fields (all rendered together in one bottom strip, left-to-right):
 *   showLabel     — user-typed label
 *   showDate      — current date (DD/MM/YYYY)
 *   showTime      — current time (HH:MM)
 *   showJobNumber — job number
 *
 * All default to true on first use.
 */

import { useState, useCallback } from 'react';

const STORAGE_KEY = 'iwb_watermark_settings_v1';

export interface WatermarkSettings {
  showDate:      boolean;
  showTime:      boolean;
  showJobNumber: boolean;
  showLabel:     boolean;
}

const DEFAULTS: WatermarkSettings = {
  showDate:      true,
  showTime:      true,
  showJobNumber: true,
  showLabel:     true,
};

function load(): WatermarkSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw) as Partial<WatermarkSettings>;
    return {
      showDate:      parsed.showDate      ?? DEFAULTS.showDate,
      showTime:      parsed.showTime      ?? DEFAULTS.showTime,
      showJobNumber: parsed.showJobNumber ?? DEFAULTS.showJobNumber,
      showLabel:     parsed.showLabel     ?? DEFAULTS.showLabel,
    };
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
