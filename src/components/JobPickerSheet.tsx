import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Loader2, X, ChevronRight, Search } from 'lucide-react';

interface JobOption {
  id: number;
  name: string;
  jobNumber?: string | null;
  client?: string | null;
  address?: string | null;
}

interface JobPickerSheetProps {
  open: boolean;
  onClose: () => void;
  title: string;
  subtitle: string;
  iconBg: string;
  iconFg: string;
  Icon: React.ElementType;
  onSelect: (job: JobOption) => void;
}

export default function JobPickerSheet({
  open, onClose, title, subtitle,
  iconBg, iconFg, Icon,
  onSelect,
}: JobPickerSheetProps) {
  const [jobs, setJobs] = useState<JobOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) { setQuery(''); return; }
    setLoading(true);
    fetch('/api/jobs?status=active&limit=100', { credentials: 'include' })
      .then(r => r.json())
      .then((data: { jobs?: JobOption[] } | JobOption[]) => {
        setJobs(Array.isArray(data) ? data : (data.jobs ?? []));
      })
      .catch(() => setJobs([]))
      .finally(() => setLoading(false));
  }, [open]);

  const filtered = query.trim()
    ? jobs.filter(j =>
        j.name.toLowerCase().includes(query.toLowerCase()) ||
        (j.jobNumber ?? '').toLowerCase().includes(query.toLowerCase())
      )
    : jobs;

  return (
    <AnimatePresence>
      {open && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[2px]"
            onClick={onClose}
          />

          {/* Floating centred modal — not a bottom sheet */}
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pointer-events-none">
            <motion.div
              initial={{ opacity: 0, scale: 0.94, y: 12 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.94, y: 12 }}
              transition={{ type: 'spring', damping: 28, stiffness: 340 }}
              className="pointer-events-auto w-full max-w-sm bg-white rounded-3xl flex flex-col overflow-hidden"
              style={{
                boxShadow: '0 8px 48px rgba(0,0,0,0.18)',
                /* Tall enough to show ~5 jobs; short enough to never overflow the screen */
                maxHeight: 'min(520px, calc(100dvh - 120px))',
              }}
              onClick={e => e.stopPropagation()}
            >
              {/* Header */}
              <div className="flex items-center justify-between px-5 pt-5 pb-3 shrink-0">
                <div className="flex items-center gap-3">
                  <div className={`w-9 h-9 rounded-2xl ${iconBg} flex items-center justify-center shrink-0`}>
                    <Icon size={17} className={iconFg} />
                  </div>
                  <div>
                    <h2 className="text-gray-900 font-bold text-base leading-tight">{title}</h2>
                    <p className="text-gray-400 text-xs leading-tight mt-0.5">{subtitle}</p>
                  </div>
                </div>
                <button
                  onClick={onClose}
                  className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 hover:bg-gray-200 active:bg-gray-300 transition-colors shrink-0"
                  aria-label="Close"
                >
                  <X size={15} />
                </button>
              </div>

              {/* Search — always visible, even while loading */}
              <div className="px-4 pb-2 shrink-0">
                <div className="flex items-center gap-2 bg-gray-100 rounded-xl px-3 py-2.5">
                  <Search size={14} className="text-gray-400 shrink-0" />
                  <input
                    ref={searchRef}
                    type="text"
                    value={query}
                    onChange={e => setQuery(e.target.value)}
                    placeholder="Search jobs, job numbers…"
                    className="flex-1 bg-transparent text-sm text-gray-800 placeholder-gray-400 outline-none min-w-0"
                  />
                  {query && (
                    <button onClick={() => setQuery('')} className="text-gray-400 hover:text-gray-600">
                      <X size={13} />
                    </button>
                  )}
                </div>
              </div>

              <div className="h-px bg-gray-100 shrink-0 mx-4" />

              {/* Scrollable job list */}
              <div className="overflow-y-auto flex-1 px-4 py-3 space-y-1.5">
                {loading ? (
                  <div className="flex items-center gap-2 text-gray-400 text-sm py-6 justify-center">
                    <Loader2 size={16} className="animate-spin" />
                    <span>Loading jobs…</span>
                  </div>
                ) : filtered.length === 0 ? (
                  <p className="text-center text-gray-400 text-sm py-8">
                    {query ? 'No jobs match your search' : 'No active jobs found'}
                  </p>
                ) : filtered.map(job => (
                  <button
                    key={job.id}
                    onClick={() => { onClose(); onSelect(job); }}
                    className="w-full flex items-center gap-3 bg-gray-50 hover:bg-violet-50 hover:border-violet-200 active:bg-violet-100 border border-gray-200 rounded-2xl px-4 py-3 text-left transition-colors"
                  >
                    <div className={`w-2 h-2 rounded-full shrink-0 ${iconBg.replace('-100', '-400')}`} />
                    <div className="flex-1 min-w-0">
                      <p className="text-gray-900 font-semibold text-sm truncate">{job.name}</p>
                      {job.jobNumber && (
                        <p className="text-gray-400 text-xs font-mono mt-0.5">{job.jobNumber}</p>
                      )}
                    </div>
                    <ChevronRight size={14} className="text-gray-300 shrink-0" />
                  </button>
                ))}
              </div>

              {/* Bottom safe-area spacer */}
              <div className="shrink-0" style={{ height: 'max(env(safe-area-inset-bottom), 8px)' }} />
            </motion.div>
          </div>
        </>
      )}
    </AnimatePresence>
  );
}
