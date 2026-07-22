/**
 * useSupportMode — React hook for Owner Support Mode context.
 *
 * Polls /api/support-mode/status every 30s and provides enter/exit helpers.
 * Returns { active, companyId, companyName, enter, exit, loading }.
 */
import { useState, useEffect, useCallback } from 'react';

export interface SupportModeState {
  active: boolean;
  companyId: number | null;
  companyName: string | null;
  enteredAt: string | null;
}

const POLL_INTERVAL = 30_000;

let _cache: SupportModeState | null = null;
const _listeners = new Set<(s: SupportModeState) => void>();

function notify(state: SupportModeState) {
  _cache = state;
  _listeners.forEach((fn) => fn(state));
}

async function fetchStatus(): Promise<SupportModeState> {
  try {
    const r = await fetch('/api/support-mode/status', { credentials: 'include' });
    if (!r.ok) return { active: false, companyId: null, companyName: null, enteredAt: null };
    const data = await r.json() as { active: boolean; companyId?: number; companyName?: string; enteredAt?: string };
    return {
      active: data.active,
      companyId: data.companyId ?? null,
      companyName: data.companyName ?? null,
      enteredAt: data.enteredAt ?? null,
    };
  } catch {
    return { active: false, companyId: null, companyName: null, enteredAt: null };
  }
}

export function useSupportMode() {
  const [state, setState] = useState<SupportModeState>(
    _cache ?? { active: false, companyId: null, companyName: null, enteredAt: null }
  );
  const [loading, setLoading] = useState(!_cache);

  useEffect(() => {
    const listener = (s: SupportModeState) => setState(s);
    _listeners.add(listener);

    // Initial fetch if no cache
    if (!_cache) {
      fetchStatus().then((s) => {
        notify(s);
        setLoading(false);
      });
    } else {
      setLoading(false);
    }

    // Poll
    const interval = setInterval(() => {
      fetchStatus().then(notify);
    }, POLL_INTERVAL);

    return () => {
      _listeners.delete(listener);
      clearInterval(interval);
    };
  }, []);

  const enter = useCallback(async (companyId: number): Promise<{ ok: boolean; companyName?: string; error?: string }> => {
    const r = await fetch('/api/support-mode/enter', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ companyId }),
    });
    const data = await r.json() as { ok?: boolean; companyName?: string; error?: string };
    if (r.ok && data.ok) {
      const next: SupportModeState = {
        active: true,
        companyId,
        companyName: data.companyName ?? null,
        enteredAt: new Date().toISOString(),
      };
      notify(next);
      return { ok: true, companyName: data.companyName };
    }
    return { ok: false, error: data.error };
  }, []);

  const exit = useCallback(async (): Promise<void> => {
    await fetch('/api/support-mode/exit', { method: 'POST', credentials: 'include' });
    const next: SupportModeState = { active: false, companyId: null, companyName: null, enteredAt: null };
    notify(next);
  }, []);

  return { ...state, loading, enter, exit };
}

/** Invalidate the cache (call after exit) */
export function invalidateSupportModeCache() {
  _cache = null;
}
