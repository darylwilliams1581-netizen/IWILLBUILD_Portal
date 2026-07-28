/**
 * JobContextTab
 *
 * A persistent job-context panel for standalone module pages opened from a job.
 * Reads ?jobId= from the URL, fetches the job independently, and renders:
 *   - Desktop (md+): a vertical "Job" pill anchored to the right edge that
 *     slides out a panel when clicked.
 *   - Mobile (<md): a fixed bottom bar that expands upward into a sheet.
 *
 * Usage: mount once near the root of any standalone page that may receive ?jobId=
 * The component renders nothing when ?jobId= is absent or the fetch fails silently.
 */
import { useState, useEffect } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import {
  HardHat, X, ExternalLink, MapPin, User,
  ChevronUp, ChevronDown, Briefcase,
} from 'lucide-react';

interface JobSummary {
  id: number;
  name: string;
  jobNumber?: string | null;
  client?: string | null;
  siteAddress?: string | null;
  status?: string | null;
  customerName?: string | null;
}

interface JobApiResponse {
  job?: JobSummary & Record<string, unknown>;
  error?: string;
}

export default function JobContextTab() {
  const [searchParams] = useSearchParams();
  const jobIdParam = searchParams.get('jobId');
  const jobId = jobIdParam ? Number(jobIdParam) : null;

  const [job, setJob] = useState<JobSummary | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!jobId) return;
    fetch(`/api/jobs/${jobId}`, { credentials: 'include' })
      .then((r) => r.ok ? r.json() as Promise<JobApiResponse> : Promise.resolve({ error: 'not found' }))
      .then((d) => {
        if (d.job) setJob(d.job);
      })
      .catch(() => { /* silent — tab just won't show */ });
  }, [jobId]);

  if (!job) return null;

  const displayName = job.jobNumber ? `#${job.jobNumber} — ${job.name}` : job.name;
  const client = job.customerName ?? job.client ?? null;

  return (
    <>
      {/* ── Desktop: right-edge vertical tab + slide-out panel ──────────────── */}
      <div className="hidden md:block">
        {/* Vertical pill tab */}
        <button
          onClick={() => setOpen((v) => !v)}
          className="fixed right-0 top-1/2 -translate-y-1/2 z-40 flex flex-col items-center gap-1.5 bg-primary text-white px-2 py-4 rounded-l-xl shadow-lg hover:bg-violet-700 transition-colors"
          title={open ? 'Close job panel' : `Job: ${displayName}`}
          style={{ writingMode: 'vertical-rl', textOrientation: 'mixed' }}
        >
          <HardHat size={14} className="shrink-0 rotate-90" style={{ writingMode: 'horizontal-tb' }} />
          <span className="text-xs font-bold tracking-wide" style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}>
            Job
          </span>
        </button>

        {/* Slide-out panel */}
        <AnimatePresence>
          {open && (
            <>
              {/* Backdrop */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.15 }}
                className="fixed inset-0 z-30 bg-black/20"
                onClick={() => setOpen(false)}
              />
              {/* Panel */}
              <motion.div
                initial={{ x: '100%' }}
                animate={{ x: 0 }}
                exit={{ x: '100%' }}
                transition={{ type: 'spring', stiffness: 380, damping: 38 }}
                className="fixed right-0 top-0 bottom-0 z-40 w-72 bg-white border-l border-slate-200 shadow-2xl flex flex-col"
              >
                {/* Header */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-slate-50">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center">
                      <HardHat size={14} className="text-primary" />
                    </div>
                    <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">Linked Job</span>
                  </div>
                  <button
                    onClick={() => setOpen(false)}
                    className="w-7 h-7 rounded-lg flex items-center justify-center text-slate-600 hover:text-slate-800 hover:bg-slate-200 transition-colors"
                  >
                    <X size={14} />
                  </button>
                </div>

                {/* Body */}
                <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3">
                  <div>
                    <p className="text-sm font-bold text-slate-800 leading-snug">{job.name}</p>
                    {job.jobNumber && (
                      <p className="text-xs text-primary font-semibold mt-0.5">#{job.jobNumber}</p>
                    )}
                  </div>

                  <div className="flex flex-col gap-2">
                    {job.status && (
                      <ContextRow icon={Briefcase} label="Status" value={job.status} />
                    )}
                    {client && (
                      <ContextRow icon={User} label="Client" value={client} />
                    )}
                    {job.siteAddress && (
                      <ContextRow icon={MapPin} label="Site" value={job.siteAddress} />
                    )}
                  </div>
                </div>

                {/* Footer */}
                <div className="p-4 border-t border-slate-100">
                  <Link
                    to={`/jobs/${job.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-2 w-full px-4 py-2.5 rounded-xl bg-primary text-white text-sm font-bold hover:bg-violet-700 transition-colors"
                  >
                    <ExternalLink size={13} />
                    Open Job
                  </Link>
                </div>
              </motion.div>
            </>
          )}
        </AnimatePresence>
      </div>

      {/* ── Mobile: fixed bottom bar + expand-up sheet ───────────────────────── */}
      <div className="md:hidden">
        {/* Bottom bar */}
        <div className="fixed bottom-0 left-0 right-0 z-40 bg-white border-t border-slate-200 shadow-lg">
          <button
            onClick={() => setOpen((v) => !v)}
            className="w-full flex items-center justify-between px-4 py-3"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <div className="w-7 h-7 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                <HardHat size={13} className="text-primary" />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-bold text-slate-800 truncate">{displayName}</p>
                {client && <p className="text-xs text-slate-500 truncate">{client}</p>}
              </div>
            </div>
            <div className="flex items-center gap-2 shrink-0 ml-2">
              <span className="text-xs font-semibold text-primary">Job</span>
              {open ? <ChevronDown size={14} className="text-slate-400" /> : <ChevronUp size={14} className="text-slate-400" />}
            </div>
          </button>

          {/* Expand-up sheet */}
          <AnimatePresence>
            {open && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{ duration: 0.2, ease: 'easeOut' }}
                className="overflow-hidden border-t border-slate-100"
              >
                <div className="px-4 py-3 flex flex-col gap-3 bg-slate-50">
                  <div className="flex flex-col gap-2">
                    {job.status && <ContextRow icon={Briefcase} label="Status" value={job.status} />}
                    {client && <ContextRow icon={User} label="Client" value={client} />}
                    {job.siteAddress && <ContextRow icon={MapPin} label="Site" value={job.siteAddress} />}
                  </div>
                  <Link
                    to={`/jobs/${job.id}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center justify-center gap-2 w-full px-4 py-2.5 rounded-xl bg-primary text-white text-sm font-bold hover:bg-violet-700 transition-colors"
                  >
                    <ExternalLink size={13} />
                    Open Job
                  </Link>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Spacer so page content isn't hidden behind the bottom bar */}
        <div className="h-14" />
      </div>
    </>
  );
}

function ContextRow({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value: string }) {
  return (
    <div className="flex items-start gap-2">
      <Icon size={12} className="text-slate-400 mt-0.5 shrink-0" />
      <div className="min-w-0">
        <span className="text-xs text-slate-400">{label}: </span>
        <span className="text-xs font-semibold text-slate-700">{value}</span>
      </div>
    </div>
  );
}
