import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Loader2, X, ChevronRight } from 'lucide-react';

interface JobOption {
  id: number;
  name: string;
  jobNumber?: string | null;
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

  useEffect(() => {
    if (!open) return;
    setLoading(true);
    fetch('/api/jobs?status=active&limit=100', { credentials: 'include' })
      .then(r => r.json())
      .then((data: { jobs?: JobOption[] } | JobOption[]) => {
        setJobs(Array.isArray(data) ? data : (data.jobs ?? []));
      })
      .catch(() => setJobs([]))
      .finally(() => setLoading(false));
  }, [open]);

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-40 bg-black/30 backdrop-blur-[2px]"
            onClick={onClose}
          />
          <motion.div
            initial={{ y: '100%' }} animate={{ y: 0 }} exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 320 }}
            className="fixed bottom-0 left-0 right-0 z-50 bg-white rounded-t-3xl max-h-[80vh] flex flex-col overflow-hidden"
            style={{ boxShadow: '0 -4px 32px rgba(0,0,0,0.12)' }}
            onClick={e => e.stopPropagation()}
          >
            <div className="flex justify-center pt-3 pb-1 shrink-0">
              <div className="w-10 h-1 rounded-full bg-gray-200" />
            </div>
            <div className="flex items-center justify-between px-5 py-3 border-b border-gray-100 shrink-0">
              <div className="flex items-center gap-2.5">
                <div className={`w-8 h-8 rounded-xl ${iconBg} flex items-center justify-center`}>
                  <Icon size={15} className={iconFg} />
                </div>
                <div>
                  <h2 className="text-gray-900 font-bold text-base">{title}</h2>
                  <p className="text-gray-400 text-xs">{subtitle}</p>
                </div>
              </div>
              <button
                onClick={onClose}
                className="w-7 h-7 rounded-full bg-gray-100 flex items-center justify-center text-gray-500 hover:bg-gray-200 transition-colors"
              >
                <X size={14} />
              </button>
            </div>
            <div className="overflow-y-auto flex-1 px-4 py-3 space-y-1.5 safe-bottom">
              {loading ? (
                <div className="flex items-center gap-2 text-gray-400 text-sm py-4 justify-center">
                  <Loader2 size={16} className="animate-spin" /> Loading jobs…
                </div>
              ) : jobs.length === 0 ? (
                <p className="text-center text-gray-400 text-sm py-8">No active jobs found</p>
              ) : jobs.map(job => (
                <button
                  key={job.id}
                  onClick={() => { onClose(); onSelect(job); }}
                  className="w-full flex items-center gap-3 bg-gray-50 hover:bg-gray-100 border border-gray-200 rounded-xl px-3 py-3 text-left transition-colors"
                >
                  <div className={`w-2 h-2 rounded-full shrink-0 ${iconBg.replace('-100', '-400')}`} />
                  <div className="flex-1 min-w-0">
                    <p className="text-gray-900 font-semibold text-sm truncate">{job.name}</p>
                    {job.jobNumber && <p className="text-gray-400 text-xs font-mono">{job.jobNumber}</p>}
                  </div>
                  <ChevronRight size={14} className="text-gray-300 shrink-0" />
                </button>
              ))}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
