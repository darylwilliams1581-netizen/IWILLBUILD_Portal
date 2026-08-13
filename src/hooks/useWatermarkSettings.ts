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
 *   showJobName   — job name (first value on line 1)
 *   showDate      — current date (DD/MM/YYYY)
 *   showTime      — current time (HH:MM)
 *   showLabel     — user-typed label (line 2)
 *   orientation   — '0' (bottom-left, horizontal) | '-90' (bottom-right, vertical)
 *
 * All boolean fields default to true on first use.
 * orientation defaults to '0'.
 * Storage key bumped to v3; v2/v1 keys are migrated on first read.
 */

import { useState, useCallback } from 'react';

const STORAGE_KEY    = 'iwb_watermark_settings_v3';
const STORAGE_KEY_V2 = 'iwb_watermark_settings_v2';
const STORAGE_KEY_V1 = 'iwb_watermark_settings_v1';

export type WatermarkOrientation = '0' | '-90';

export interface WatermarkSettings {
  showDate:    boolean;
  showTime:    boolean;
  showJobName: boolean;
  showLabel:   boolean;
  orientation: WatermarkOrientation;
}

const DEFAULTS: WatermarkSettings = {
  showDate:    true,
  showTime:    true,
  showJobName: true,
  showLabel:   true,
  orientation: '0',
};

function load(): WatermarkSettings {
  try {
    // Try v3 first
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<WatermarkSettings>;
      return {
        showDate:    parsed.showDate    ?? DEFAULTS.showDate,
        showTime:    parsed.showTime    ?? DEFAULTS.showTime,
        showJobName: parsed.showJobName ?? DEFAULTS.showJobName,
        showLabel:   parsed.showLabel   ?? DEFAULTS.showLabel,
        orientation: (parsed.orientation === '-90' ? '-90' : '0'),
      };
    }
    // Migrate from v2
    const rawV2 = localStorage.getItem(STORAGE_KEY_V2);
    if (rawV2) {
      const p = JSON.parse(rawV2) as Record<string, boolean>;
      return {
        showDate:    p['showDate']    ?? DEFAULTS.showDate,
        showTime:    p['showTime']    ?? DEFAULTS.showTime,
        showJobName: p['showJobName'] ?? DEFAULTS.showJobName,
        showLabel:   p['showLabel']   ?? DEFAULTS.showLabel,
        orientation: '0',
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
        orientation: '0',
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

  const toggle = useCallback((key: keyof Pick<WatermarkSettings, 'showDate' | 'showTime' | 'showJobName' | 'showLabel'>) => {
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
