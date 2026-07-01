/**
 * DrivingSessionBadge
 * Shown in the portal header when the current user has an active driving session.
 * One click opens a stop-confirmation popover.
 */
import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Car, X, Loader2, StopCircle } from 'lucide-react';
import type { DriverSession } from '@/lib/useDriverSession';

interface Props {
  session: DriverSession;
  onStopped: () => void;
}

function formatDuration(startAt: string): string {
  const diffMs = Date.now() - new Date(startAt).getTime();
  const mins = Math.floor(diffMs / 60_000);
  if (mins < 60) return `${mins}m`;
  const hrs = Math.floor(mins / 60);
  const rem = mins % 60;
  return rem > 0 ? `${hrs}h ${rem}m` : `${hrs}h`;
}

export default function DrivingSessionBadge({ session, onStopped }: Props) {
  const [open, setOpen] = useState(false);
  const [stopping, setStopping] = useState(false);
  const [error, setError] = useState('');

  async function handleStop() {
    setStopping(true);
    setError('');
    try {
      const res = await fetch(`/api/fleet/driver-sessions/${session.id}/stop`, {
        method: 'POST',
        credentials: 'include',
      });
      if (!res.ok) {
        const d = await res.json() as { error?: string };
        throw new Error(d.error ?? 'Failed to stop session');
      }
      setOpen(false);
      onStopped();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to stop');
    } finally {
      setStopping(false);
    }
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-primary/10 border border-primary/20 text-primary hover:bg-primary/15 transition-colors duration-150 text-xs font-semibold"
        title={`Driving: ${session.asset_name} — click to stop`}
      >
        <span className="relative flex h-2 w-2 shrink-0">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-60" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-primary" />
        </span>
        <Car size={13} className="shrink-0" />
        <span className="hidden sm:inline truncate max-w-[100px]">Driving: {session.asset_name}</span>
        <span className="sm:hidden">Driving</span>
      </button>

      <AnimatePresence>
        {open && (
          <>
            <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: -4 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: -4 }}
              transition={{ duration: 0.12 }}
              className="absolute right-0 top-full mt-2 z-50 bg-white rounded-xl shadow-xl border border-border w-72"
            >
              <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                <div className="flex items-center gap-2">
                  <Car size={15} className="text-primary" />
                  <span className="font-semibold text-sm">Active Driving Session</span>
                </div>
                <button onClick={() => setOpen(false)} className="p-1 text-muted-foreground hover:text-foreground transition-colors">
                  <X size={14} />
                </button>
              </div>

              <div className="px-4 py-3 flex flex-col gap-1.5">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Vehicle</span>
                  <span className="font-semibold">{session.asset_name}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Driver</span>
                  <span className="font-semibold">{session.driver_name}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Started</span>
                  <span className="font-semibold">
                    {new Date(session.start_at).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' })}
                    {' '}({formatDuration(session.start_at)})
                  </span>
                </div>
              </div>

              {error && (
                <div className="mx-4 mb-2 text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                  {error}
                </div>
              )}

              <div className="px-4 pb-4">
                <button
                  onClick={handleStop}
                  disabled={stopping}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-red-600 text-white text-sm font-semibold rounded-lg hover:bg-red-700 disabled:opacity-50 transition-colors"
                >
                  {stopping ? <Loader2 size={14} className="animate-spin" /> : <StopCircle size={14} />}
                  {stopping ? 'Stopping…' : `Stop driving ${session.asset_name}`}
                </button>
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </div>
  );
}
