/**
 * useDriverSession
 * Shared hook for the current user's active driving session.
 * Polls every 30s so the header badge stays in sync across tabs.
 */
import { useState, useEffect, useCallback } from 'react';

export interface DriverSession {
  id: number;
  fleet_asset_id: number;
  asset_name: string;
  driver_name: string;
  start_at: string;
  status: string;
  source: string;
}

export function useDriverSession() {
  const [session, setSession] = useState<DriverSession | null | undefined>(undefined); // undefined = loading
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    try {
      const res = await fetch('/api/fleet/driver-sessions/active', { credentials: 'include' });
      if (res.status === 401) { setSession(null); return; }
      const data = await res.json() as { session?: DriverSession | null };
      setSession(data.session ?? null);
    } catch {
      setError('Failed to load driving session');
    }
  }, []);

  useEffect(() => {
    void refresh();
    const interval = setInterval(refresh, 30_000);
    return () => clearInterval(interval);
  }, [refresh]);

  async function stopSession(sessionId: number): Promise<void> {
    await fetch(`/api/fleet/driver-sessions/${sessionId}/stop`, {
      method: 'POST',
      credentials: 'include',
    });
    setSession(null);
  }

  return { session, error, refresh, stopSession };
}
