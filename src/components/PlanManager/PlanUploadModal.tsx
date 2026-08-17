/**
 * PlanUploadModal
 * ─────────────────────────────────────────────────────────────────────────────
 * Multi-step upload flow for the standalone Plan Manager page.
 *
 * Step 1 — Job picker (shared JobPickerSheet)
 * Step 2 — Drawing details + file selection
 * Step 3 — Uploading (progress feedback)
 *
 * Reuses the exact same three API calls as JobPlanManagerTab.UploadModal:
 *   1. POST /api/plan-manager/drawings          → create record
 *   2. POST /api/plan-manager/drawings/:id/upload → upload PDF
 *   3. POST /api/plan-manager/drawings/:id/job-links → link to job
 *
 * No new endpoints. No duplicate upload logic.
 *
 * Mobile/TestFlight:
 *   - Bottom sheet on mobile, centred modal on desktop
 *   - 44×44 px minimum touch targets
 *   - Safe-area-inset-bottom respected
 *   - File picker accepts application/pdf
 *   - No popup-window dependency
 *   - Same-tab navigation only
 */

import { useState, useRef } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  Upload, X, FileText, AlertCircle, Loader2,
  FilePlus2, ChevronLeft, CheckCircle2, HardHat,
} from 'lucide-react';
import JobPickerSheet from '@/components/shared/JobPickerSheet';
import type { JobOption } from '@/components/shared/JobPickerSheet';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface PlanUploadModalProps {
  open: boolean;
  onClose: () => void;
  /** Called with the new drawing ID and the job ID after successful upload */
  onSaved: (drawingId: number, jobId: number) => void;
}

type Step = 'job' | 'details' | 'uploading' | 'done';

// ── Discipline options ────────────────────────────────────────────────────────

const DISCIPLINES = [
  'Architectural',
  'Structural',
  'Civil',
  'Mechanical',
  'Electrical',
  'Hydraulic',
  'Fire',
  'Landscape',
  'Services',
  'Other',
];

const DOC_STATUSES = [
  'For Construction',
  'For Review',
  'Issued for Tender',
  'Issued for Information',
  'Preliminary',
  'As Constructed',
  'Superseded',
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function jobLabel(job: JobOption): string {
  return job.jobNumber ? `#${job.jobNumber} — ${job.name}` : job.name;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function PlanUploadModal({ open, onClose, onSaved }: PlanUploadModalProps) {
  const [step, setStep]           = useState<Step>('job');
  const [selectedJob, setSelectedJob] = useState<JobOption | null>(null);

  // Drawing details
  const [title,          setTitle]          = useState('');
  const [drawingNumber,  setDrawingNumber]  = useState('');
  const [revisionName,   setRevisionName]   = useState('');
  const [discipline,     setDiscipline]     = useState('');
  const [docStatusLabel, setDocStatusLabel] = useState('');
  const [file,           setFile]           = useState<File | null>(null);
  const [error,          setError]          = useState('');

  const fileRef = useRef<HTMLInputElement>(null);

  // ── Reset on close ─────────────────────────────────────────────────────────
  function handleClose() {
    setStep('job');
    setSelectedJob(null);
    setTitle('');
    setDrawingNumber('');
    setRevisionName('');
    setDiscipline('');
    setDocStatusLabel('');
    setFile(null);
    setError('');
    onClose();
  }

  // ── Step 1: Job selected ───────────────────────────────────────────────────
  function handleJobSelect(job: JobOption) {
    setSelectedJob(job);
    setStep('details');
  }

  // ── File selected ──────────────────────────────────────────────────────────
  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    // Auto-fill title from filename if empty
    if (!title.trim()) {
      setTitle(f.name.replace(/\.pdf$/i, '').replace(/[-_]/g, ' ').trim());
    }
  }

  // ── Step 2: Submit ─────────────────────────────────────────────────────────
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!selectedJob) return;
    if (!title.trim()) { setError('Title is required.'); return; }

    setStep('uploading');
    setError('');

    try {
      // 1. Create drawing record
      const createRes = await fetch('/api/plan-manager/drawings', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          title:          title.trim(),
          drawingNumber:  drawingNumber.trim() || undefined,
          revisionName:   revisionName.trim()  || undefined,
          discipline:     discipline.trim()    || undefined,
          docStatusLabel: docStatusLabel.trim() || undefined,
        }),
      });
      const createData = await createRes.json() as { id?: number; error?: string };
      if (!createRes.ok || !createData.id) throw new Error(createData.error ?? 'Failed to create drawing');
      const drawingId = createData.id;

      // 2. Upload PDF if provided
      if (file) {
        const form = new FormData();
        form.append('file', file);
        const uploadRes = await fetch(`/api/plan-manager/drawings/${drawingId}/upload`, {
          method: 'POST', credentials: 'include', body: form,
        });
        if (!uploadRes.ok) {
          const ud = await uploadRes.json() as { error?: string };
          throw new Error(ud.error ?? 'Upload failed');
        }
      }

      // 3. Link to job
      const linkRes = await fetch(`/api/plan-manager/drawings/${drawingId}/job-links`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ jobId: selectedJob.id }),
      });
      if (!linkRes.ok) {
        const ld = await linkRes.json() as { error?: string };
        throw new Error(ld.error ?? 'Failed to link to job');
      }

      setStep('done');
      onSaved(drawingId, selectedJob.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStep('details');
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────

  // Step 1: delegate to shared job picker
  if (step === 'job') {
    return (
      <JobPickerSheet
        open={open}
        title="Select a job"
        subtitle="The plan will be linked to this job"
        onSelect={handleJobSelect}
        onClose={handleClose}
      />
    );
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
            transition={{ duration: 0.18 }}
            className="fixed inset-0 z-40 bg-black/60"
            onClick={step === 'uploading' ? undefined : handleClose}
          />

          {/* Sheet */}
          <motion.div
            key="sheet"
            initial={{ y: '100%', opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            exit={{ y: '100%', opacity: 0 }}
            transition={{ type: 'spring', damping: 28, stiffness: 320 }}
            className="fixed inset-x-0 bottom-0 z-50 bg-background rounded-t-2xl shadow-2xl flex flex-col md:inset-auto md:top-1/2 md:left-1/2 md:-translate-x-1/2 md:-translate-y-1/2 md:w-[520px] md:max-w-[92vw] md:rounded-2xl"
            style={{
              maxHeight: 'min(92vh, 700px)',
              paddingBottom: 'max(env(safe-area-inset-bottom), 16px)',
            }}
          >
            {/* Handle (mobile only) */}
            <div className="flex justify-center pt-3 pb-1 md:hidden">
              <div className="w-10 h-1 rounded-full bg-muted-foreground/30" />
            </div>

            {/* ── Uploading state ─────────────────────────────────────────── */}
            {step === 'uploading' && (
              <div className="flex flex-col items-center justify-center flex-1 gap-4 px-6 py-12">
                <div className="w-14 h-14 rounded-2xl bg-violet-100 flex items-center justify-center">
                  <Loader2 size={26} className="text-violet-600 animate-spin" />
                </div>
                <p className="text-sm font-semibold text-foreground">Uploading plan…</p>
                <p className="text-xs text-muted-foreground text-center">
                  Creating record, uploading PDF and linking to job.
                </p>
              </div>
            )}

            {/* ── Done state ──────────────────────────────────────────────── */}
            {step === 'done' && (
              <div className="flex flex-col items-center justify-center flex-1 gap-4 px-6 py-12">
                <div className="w-14 h-14 rounded-2xl bg-emerald-100 flex items-center justify-center">
                  <CheckCircle2 size={26} className="text-emerald-600" />
                </div>
                <p className="text-sm font-semibold text-foreground">Plan uploaded</p>
                <p className="text-xs text-muted-foreground text-center">
                  The drawing has been added to{' '}
                  <span className="font-semibold">{selectedJob ? jobLabel(selectedJob) : 'the job'}</span>.
                </p>
                <button
                  type="button"
                  onClick={handleClose}
                  className="mt-2 px-5 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-sm font-semibold transition-colors min-h-[44px]"
                >
                  Done
                </button>
              </div>
            )}

            {/* ── Details form ────────────────────────────────────────────── */}
            {step === 'details' && (
              <>
                {/* Header */}
                <div className="flex items-center justify-between px-4 pt-3 pb-3 border-b border-border shrink-0">
                  <div className="flex items-center gap-2.5">
                    <button
                      type="button"
                      onClick={() => setStep('job')}
                      className="min-w-[44px] min-h-[44px] flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors rounded-lg -ml-2"
                      aria-label="Back to job selection"
                    >
                      <ChevronLeft size={18} />
                    </button>
                    <div className="w-8 h-8 rounded-xl bg-violet-500/10 border border-violet-600/20 flex items-center justify-center">
                      <FilePlus2 size={15} className="text-violet-600" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-foreground">Upload Plan</p>
                      {selectedJob && (
                        <div className="flex items-center gap-1 mt-0.5">
                          <HardHat size={10} className="text-violet-500 shrink-0" />
                          <p className="text-xs text-muted-foreground truncate max-w-[220px]">
                            {jobLabel(selectedJob)}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={handleClose}
                    className="min-w-[44px] min-h-[44px] flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors rounded-lg -mr-2"
                    aria-label="Close"
                  >
                    <X size={18} />
                  </button>
                </div>

                {/* Form */}
                <form
                  onSubmit={(e) => void handleSubmit(e)}
                  className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-4"
                >
                  {/* PDF file picker */}
                  <div>
                    <label className="text-xs font-semibold text-foreground mb-1.5 block">
                      PDF File <span className="text-muted-foreground font-normal">(optional — can upload later)</span>
                    </label>
                    <input
                      ref={fileRef}
                      type="file"
                      accept="application/pdf,.pdf"
                      className="hidden"
                      onChange={handleFileChange}
                    />
                    <div
                      onClick={() => fileRef.current?.click()}
                      className={`border-2 border-dashed rounded-xl p-4 text-center cursor-pointer transition-colors min-h-[64px] flex items-center justify-center ${
                        file
                          ? 'border-emerald-300 bg-emerald-50'
                          : 'border-border hover:border-violet-400/60 hover:bg-violet-50/20'
                      }`}
                    >
                      {file ? (
                        <div className="flex items-center gap-2">
                          <FileText size={16} className="text-emerald-600 shrink-0" />
                          <span className="text-sm font-semibold text-emerald-700 truncate max-w-[280px]">
                            {file.name}
                          </span>
                          <button
                            type="button"
                            onClick={(e) => { e.stopPropagation(); setFile(null); if (fileRef.current) fileRef.current.value = ''; }}
                            className="ml-1 text-emerald-500 hover:text-emerald-700 shrink-0"
                            aria-label="Remove file"
                          >
                            <X size={13} />
                          </button>
                        </div>
                      ) : (
                        <div className="flex flex-col items-center gap-1.5">
                          <Upload size={18} className="text-muted-foreground" />
                          <p className="text-xs text-muted-foreground">Tap to select PDF</p>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Title (required) */}
                  <div>
                    <label className="text-xs font-semibold text-foreground mb-1.5 block">
                      Drawing Title <span className="text-destructive">*</span>
                    </label>
                    <input
                      type="text"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder="e.g. Ground Floor Plan"
                      className="w-full border border-border rounded-xl px-3 py-2.5 text-sm bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-violet-400/30 min-h-[44px]"
                      required
                    />
                  </div>

                  {/* Drawing number + Revision — 2 columns */}
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs font-semibold text-foreground mb-1.5 block">
                        Drawing Number
                      </label>
                      <input
                        type="text"
                        value={drawingNumber}
                        onChange={(e) => setDrawingNumber(e.target.value)}
                        placeholder="e.g. A-001"
                        className="w-full border border-border rounded-xl px-3 py-2.5 text-sm bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-violet-400/30 min-h-[44px]"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-semibold text-foreground mb-1.5 block">
                        Revision
                      </label>
                      <input
                        type="text"
                        value={revisionName}
                        onChange={(e) => setRevisionName(e.target.value)}
                        placeholder="e.g. A, B, 1, Draft"
                        className="w-full border border-border rounded-xl px-3 py-2.5 text-sm bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-violet-400/30 min-h-[44px]"
                      />
                    </div>
                  </div>

                  {/* Discipline */}
                  <div>
                    <label className="text-xs font-semibold text-foreground mb-1.5 block">
                      Discipline
                    </label>
                    <select
                      value={discipline}
                      onChange={(e) => setDiscipline(e.target.value)}
                      className="w-full border border-border rounded-xl px-3 py-2.5 text-sm bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-violet-400/30 min-h-[44px]"
                    >
                      <option value="">Select discipline…</option>
                      {DISCIPLINES.map((d) => (
                        <option key={d} value={d}>{d}</option>
                      ))}
                    </select>
                  </div>

                  {/* Status */}
                  <div>
                    <label className="text-xs font-semibold text-foreground mb-1.5 block">
                      Status
                    </label>
                    <select
                      value={docStatusLabel}
                      onChange={(e) => setDocStatusLabel(e.target.value)}
                      className="w-full border border-border rounded-xl px-3 py-2.5 text-sm bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-violet-400/30 min-h-[44px]"
                    >
                      <option value="">Select status…</option>
                      {DOC_STATUSES.map((s) => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </div>

                  {/* Error */}
                  {error && (
                    <div className="flex items-center gap-2 bg-destructive/10 border border-destructive/20 rounded-xl px-3 py-2.5">
                      <AlertCircle size={13} className="text-destructive shrink-0" />
                      <p className="text-xs text-destructive">{error}</p>
                    </div>
                  )}

                  {/* Submit */}
                  <div className="flex gap-3 pt-1 pb-2">
                    <button
                      type="button"
                      onClick={handleClose}
                      className="flex-1 min-h-[44px] rounded-xl border border-border text-sm font-semibold text-foreground hover:bg-muted transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={!title.trim()}
                      className="flex-1 min-h-[44px] rounded-xl bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white text-sm font-bold flex items-center justify-center gap-2 transition-colors"
                    >
                      <Upload size={14} />
                      Upload Plan
                    </button>
                  </div>
                </form>
              </>
            )}
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
