import { useState } from 'react';
import { X, HardHat, Loader2 } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { JOB_STATUSES, createJob, type Job } from '@/lib/jobs-api';
import { useTerminology } from '@/lib/useTerminology';

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated: (job: Job) => void;
}

const INITIAL = {
  name: '',
  jobNumber: '',
  client: '',
  address: '',
  status: 'New' as string,
  notes: '',
};

export default function NewJobModal({ open, onClose, onCreated }: Props) {
  const [form, setForm] = useState(INITIAL);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const { workSingular } = useTerminology();

  function set(field: keyof typeof INITIAL, value: string) {
    setForm((f) => ({ ...f, [field]: value }));
    setError('');
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.name.trim()) { setError('Job title is required'); return; }
    setSaving(true);
    setError('');
    try {
      const job = await createJob({
        name: form.name.trim(),
        jobNumber: form.jobNumber.trim() || undefined,
        client: form.client.trim() || undefined,
        address: form.address.trim() || undefined,
        status: form.status,
        notes: form.notes.trim() || undefined,
      });
      setForm(INITIAL);
      onCreated(job);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create job');
    } finally {
      setSaving(false);
    }
  }

  function handleClose() {
    if (saving) return;
    setForm(INITIAL);
    setError('');
    onClose();
  }

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
            transition={{ duration: 0.15 }}
            onClick={handleClose}
            className="fixed inset-0 bg-black/50 z-40"
          />

          {/* Modal */}
          <motion.div
            key="modal"
            initial={{ opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 12 }}
            transition={{ duration: 0.2, ease: 'easeOut' as const }}
            className="fixed inset-0 z-50 flex items-center justify-center p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-white rounded-xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto mobile-sheet">
              {/* Header */}
              <div className="flex items-center justify-between px-6 py-4 border-b border-border">
                <div className="flex items-center gap-2">
                  <div className="p-1.5 bg-orange-50 rounded-md">
                    <HardHat size={16} className="text-primary" />
                  </div>
                  <h2 className="font-heading font-bold text-base">New {workSingular}</h2>
                </div>
                <button
                  onClick={handleClose}
                  className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                >
                  <X size={16} />
                </button>
              </div>

              {/* Form */}
              <form onSubmit={handleSubmit} className="p-6 flex flex-col gap-4">
                {/* Job title */}
                <div>
                  <label className="block text-xs font-semibold text-foreground mb-1.5">
                    Job Title <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={form.name}
                    onChange={(e) => set('name', e.target.value)}
                    placeholder="e.g. Riverside Residential Build"
                    className="w-full px-3 py-2.5 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors"
                    autoFocus
                  />
                </div>

                {/* Job number + Status row */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-foreground mb-1.5">
                      Job Number
                      <span className="text-muted-foreground font-normal ml-1">(auto if blank)</span>
                    </label>
                    <input
                      type="text"
                      value={form.jobNumber}
                      onChange={(e) => set('jobNumber', e.target.value)}
                      placeholder="JOB-001"
                      className="w-full px-3 py-2.5 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-foreground mb-1.5">Status</label>
                    <select
                      value={form.status}
                      onChange={(e) => set('status', e.target.value)}
                      className="w-full px-3 py-2.5 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors bg-white"
                    >
                      {JOB_STATUSES.map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Client */}
                <div>
                  <label className="block text-xs font-semibold text-foreground mb-1.5">Client Name</label>
                  <input
                    type="text"
                    value={form.client}
                    onChange={(e) => set('client', e.target.value)}
                    placeholder="e.g. M. Thompson"
                    className="w-full px-3 py-2.5 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors"
                  />
                </div>

                {/* Address */}
                <div>
                  <label className="block text-xs font-semibold text-foreground mb-1.5">Site Address / Suburb</label>
                  <input
                    type="text"
                    value={form.address}
                    onChange={(e) => set('address', e.target.value)}
                    placeholder="e.g. 12 River St, Bulimba QLD"
                    className="w-full px-3 py-2.5 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors"
                  />
                </div>

                {/* Notes */}
                <div>
                  <label className="block text-xs font-semibold text-foreground mb-1.5">Description / Notes</label>
                  <textarea
                    value={form.notes}
                    onChange={(e) => set('notes', e.target.value)}
                    placeholder="Any relevant notes about this job…"
                    rows={3}
                    className="w-full px-3 py-2.5 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors resize-none"
                  />
                </div>

                {/* Error */}
                {error && (
                  <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</p>
                )}

                {/* Actions */}
                <div className="flex gap-3 pt-1">
                  <button
                    type="button"
                    onClick={handleClose}
                    disabled={saving}
                    className="flex-1 px-4 py-2.5 border border-border rounded-lg text-sm font-semibold text-foreground hover:bg-muted transition-colors disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={saving}
                    className="flex-1 px-4 py-2.5 bg-primary hover:bg-orange-600 text-white rounded-lg text-sm font-bold transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
                  >
                    {saving ? <><Loader2 size={14} className="animate-spin" /> Saving…</> : `Create ${workSingular}`}
                  </button>
                </div>
              </form>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
