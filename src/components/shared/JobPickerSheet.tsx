/**
 * JobPickerSheet — generic shared job-selection bottom sheet / modal.
 * ─────────────────────────────────────────────────────────────────────────────
 * Promoted from src/components/lens/LensJobPickerSheet.tsx.
 * Lens, Plan Manager, and any future feature that needs a job picker use this.
 *
 * - Loads active jobs for the authenticated company via /api/jobs/search
 * - Search by job number, name, or customer
 * - iOS bottom sheet on mobile, centred modal on desktop
 * - 44×44 px minimum touch targets
 * - Company isolation: session-scoped API call only
 */

import { useState, useEffect, useRef } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Search, X, ChevronRight, Loader2, HardHat } from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface JobOption {
  id: number;
  jobNumber: string | null;
  name: string;
  status: string;
}

export interface JobPickerSheetProps {
  open: boolean;
  title: string;
  subtitle?: string;
  onSelect: (job: JobOption) => void;
  onClose: () => void;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

export function jobOptionLabel(job: JobOption): string {
  return job.jobNumber ? `#${job.jobNumber} — ${job.name}` : job.name;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function JobPickerSheet({
  open,
  title,
  subtitle,
  onSelect,
  onClose,
}: JobPickerSheetProps) {
  const [query, setQuery]     = useState('');
  const [jobs, setJobs]       = useState<JobOption[]>([]);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Load active jobs on open
  useEffect(() => {
    if (!open) return;
    setQuery('');
    void fetchJobs('');
    setTimeout(() => inputRef.current?.focus(), 150);
  }, [open]);

  // Debounced search
  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => void fetchJobs(query), 250);
    return () => clearTimeout(t);
  }, [query, open]);

  async function fetchJobs(q: string) {
    setLoading(true);
    try {
      const params = new URLSearchParams({ status: 'active', limit: '60' });
      if (q) params.set('q', q);
      const res = await fetch(`/api/jobs/search?${params}`, { credentials: 'include' });
      const data = await res.json() as { jobs?: JobOption[] };
      setJobs(data.jobs ?? []);
    } catch {
      setJobs([]);
    } finally {
      setLoading(false);
    }
  }

  // Close on Escape
  useEffect(() => {
    if (!open) return;
    function handler(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
    }
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="fixed inset-0 z-40 bg-black/50"
            onClick={onClose}
          />

          {/* Sheet — always centred */}
          <motion.div
            key="sheet"
            initial={{ scale: 0.95, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.95, opacity: 0 }}
            transition={{ type: 'spring', damping: 28, stiffness: 320 }}
            className="fixed left-1/2 z-50 bg-background rounded-2xl shadow-2xl flex flex-col w-[calc(100vw-2rem)] sm:w-[480px] sm:max-w-[90vw]"
            style={{
              translateX: '-50%',
              translateY: '-50%',
              top: 'calc(50% + 40px)',
              maxHeight: 'min(90dvh, 640px)',
              paddingBottom: 'max(env(safe-area-inset-bottom), 16px)',
            }}
          >
            {/* Header */}
            <div className="flex items-start justify-between px-4 pt-3 pb-2 shrink-0">
              <div>
                <h2 className="text-base font-bold text-foreground">{title}</h2>
                {subtitle && (
                  <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>
                )}
              </div>
              <button
                type="button"
                onClick={onClose}
                className="min-w-[44px] min-h-[44px] flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors rounded-lg -mr-2 -mt-1"
                aria-label="Close"
              >
                <X size={18} />
              </button>
            </div>

            {/* Search */}
            <div className="flex items-center gap-2.5 px-4 py-2.5 border-b border-border shrink-0">
              <Search size={15} className="text-muted-foreground shrink-0" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search job number, name or customer…"
                className="flex-1 text-sm bg-transparent outline-none text-foreground placeholder:text-muted-foreground"
                autoComplete="off"
                autoCorrect="off"
                spellCheck={false}
              />
              {loading && <Loader2 size={13} className="animate-spin text-muted-foreground shrink-0" />}
              {!loading && query && (
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  className="min-w-[28px] min-h-[28px] flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors"
                  aria-label="Clear search"
                >
                  <X size={13} />
                </button>
              )}
            </div>

            {/* Job list */}
            <div className="flex-1 overflow-y-auto">
              {!loading && jobs.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 gap-3 text-muted-foreground">
                  <HardHat size={32} className="opacity-30" />
                  <p className="text-sm">
                    {query ? 'No jobs match your search.' : 'No active jobs found.'}
                  </p>
                </div>
              ) : (
                jobs.map((job) => (
                  <button
                    key={job.id}
                    type="button"
                    onClick={() => onSelect(job)}
                    className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-muted/60 active:bg-muted transition-colors border-b border-border/50 last:border-b-0 min-h-[56px]"
                  >
                    <div className="w-8 h-8 rounded-lg bg-violet-100 flex items-center justify-center shrink-0">
                      <HardHat size={15} className="text-violet-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-foreground truncate">{job.name}</p>
                      {job.jobNumber && (
                        <p className="text-xs text-muted-foreground mt-0.5">#{job.jobNumber}</p>
                      )}
                    </div>
                    <ChevronRight size={14} className="text-muted-foreground shrink-0" />
                  </button>
                ))
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
