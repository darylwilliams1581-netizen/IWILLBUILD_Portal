/**
 * useFleetAnalytics
 * Fetches and caches the company's fleet analytics toggle settings.
 * Used by the telemetry hook and the session summary card to know
 * which metrics are enabled.
 */
import { useState, useEffect, useCallback } from 'react';

export interface FleetAnalyticsSettings {
  track_distance: boolean;
  track_drive_time: boolean;
  track_speed: boolean;
  enable_speeding_alerts: boolean;
  speeding_threshold_kmh: number;
  enable_collision_alerts: boolean;
}

const DEFAULTS: FleetAnalyticsSettings = {
  track_distance: true,
  track_drive_time: true,
  track_speed: true,
  enable_speeding_alerts: false,
  speeding_threshold_kmh: 110,
  enable_collision_alerts: false,
};

// Module-level cache so multiple components share one fetch
let cached: FleetAnalyticsSettings | null = null;
let fetchPromise: Promise<FleetAnalyticsSettings> | null = null;

async function fetchSettings(): Promise<FleetAnalyticsSettings> {
  if (cached) return cached;
  if (fetchPromise) return fetchPromise;

  fetchPromise = fetch('/api/fleet/analytics-settings', { credentials: 'include' })
    .then(async (r) => {
      if (!r.ok) return DEFAULTS;
      const d = await r.json() as { ok?: boolean; settings?: FleetAnalyticsSettings };
      cached = d.settings ?? DEFAULTS;
      return cached;
    })
    .catch(() => DEFAULTS)
    .finally(() => { fetchPromise = null; });

  return fetchPromise;
}

export function invalidateFleetAnalyticsCache() {
  cached = null;
  fetchPromise = null;
}

export function useFleetAnalytics() {
  const [settings, setSettings] = useState<FleetAnalyticsSettings>(cached ?? DEFAULTS);
  const [loading, setLoading]   = useState(!cached);
  const [saving,  setSaving]    = useState(false);
  const [error,   setError]     = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const s = await fetchSettings();
      setSettings(s);
    } catch {
      setError('Failed to load analytics settings');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function save(updates: Partial<FleetAnalyticsSettings>): Promise<boolean> {
    setSaving(true);
    setError(null);
    try {
      const next = { ...settings, ...updates };
      const res = await fetch('/api/fleet/analytics-settings', {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(next),
      });
      if (!res.ok) {
        const d = await res.json() as { error?: string };
        throw new Error(d.error ?? 'Failed to save');
      }
      cached = next;
      setSettings(next);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save settings');
      return false;
    } finally {
      setSaving(false);
    }
  }

  return { settings, loading, saving, error, save, reload: load };
}
