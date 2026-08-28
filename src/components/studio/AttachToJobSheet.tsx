/**
 * AttachToJobSheet
 * ─────────────────────────────────────────────────────────────────────────────
 * Attaches a Studio SWMS or Safety Plan master to a selected job.
 *
 * Architecture:
 *   Calls POST /api/jobs/:id/studio-swms which inserts a row into the existing
 *   job_swms table (studio_document_id set, swms_template_id null).
 *   No synthetic records are created. Workers sign on via the normal
 *   job sign-on workflow using the job_swms.id returned here.
 */

import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { X, Loader2, CheckCircle2, AlertTriangle, Briefcase, FileText } from 'lucide-react';
import JobPickerSheet, { type JobOption, jobOptionLabel } from '@/components/shared/JobPickerSheet';
import { createPortal } from 'react-dom';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface AttachToJobSheetProps {
  open: boolean;
  studioDocId: number;
  docTitle: string;
  templateType: string;
  onClose: () => void;
  onAttached?: (result: AttachResult) => void;
}

export interface AttachResult {
  jobSwmsId: number;
  jobId: number;
  jobTitle: string;
  jobNumber: string;
  docTitle: string;
  revision: string;
}

type Step = 'pick-job' | 'confirm' | 'attaching' | 'done' | 'error';

// ── Component ─────────────────────────────────────────────────────────────────

export default function AttachToJobSheet({
  open,
  studioDocId,
  docTitle,
  templateType,
  onClose,
  onAttached,
}: AttachToJobSheetProps) {
  const [step, setStep] = useState<Step>('pick-job');
  const [selectedJob, setSelectedJob] = useState<JobOption | null>(null);
  const [revision, setRevision] = useState('1');
  const [result, setResult] = useState<AttachResult | null>(null);
  const [errorMsg, setErrorMsg] = useState('');
  const [showJobPicker, setShowJobPicker] = useState(false);

  const isSafetyDoc = templateType === 'swms' || templateType === 'safety_plan';

  // Open job picker on mount when sheet opens
  if (open && step === 'pick-job' && !showJobPicker && !selectedJob) {
    setShowJobPicker(true);
  }

  function handleJobSelected(job: JobOption) {
    setSelectedJob(job);
    setShowJobPicker(false);
    setStep('confirm');
  }

  async function handleAttach() {
    if (!selectedJob) return;
    setStep('attaching');
    try {
      const res = await fetch(`/api/jobs/${selectedJob.id}/studio-swms`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          studioDocId,
          revision: revision.trim() || '1',
        }),
      });
      const data = await res.json() as {
        ok?: boolean;
        error?: string;
        migrationRequired?: boolean;
        jobSwmsId?: number;
        revision?: string;
      };
      if (!res.ok || data.error) {
        if (data.migrationRequired) {
          setErrorMsg('Database migration required. Ask your platform owner to run POST /api/migrate-studio-phase2.');
        } else {
          setErrorMsg(data.error ?? `HTTP ${res.status}`);
        }
        setStep('error');
        return;
      }
      const attachResult: AttachResult = {
        jobSwmsId: data.jobSwmsId!,
        jobId: selectedJob.id,
        jobTitle: selectedJob.name,
        jobNumber: selectedJob.jobNumber ?? '',
        docTitle,
        revision: data.revision ?? revision,
      };
      setResult(attachResult);
      setStep('done');
      onAttached?.(attachResult);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'Attach failed');
      setStep('error');
    }
  }

  if (!open) return null;

  const modal = (
    <AnimatePresence>
      {open && (
        <motion.div
          key="attach-overlay"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm px-4"
          onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
        >
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 12 }}
            transition={{ duration: 0.18 }}
            className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-violet-100 text-violet-600 flex items-center justify-center">
                  <Briefcase size={15} />
                </div>
                <div>
                  <h3 className="text-sm font-bold text-slate-800">Attach to Job</h3>
                  <p className="text-[11px] text-slate-400 truncate max-w-[220px]">{docTitle}</p>
                </div>
              </div>
              <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 transition-colors">
                <X size={15} />
              </button>
            </div>

            {/* Body */}
            <div className="p-5">
              {/* Step: pick-job — handled by JobPickerSheet */}
              {step === 'pick-job' && (
                <div className="text-center py-6">
                  <Loader2 size={20} className="animate-spin text-slate-400 mx-auto mb-2" />
                  <p className="text-sm text-slate-500">Opening job picker…</p>
                </div>
              )}

              {/* Step: confirm */}
              {step === 'confirm' && selectedJob && (
                <div className="space-y-4">
                  <div className="bg-slate-50 rounded-xl p-3 border border-slate-200">
                    <p className="text-[11px] text-slate-500 mb-0.5">Selected job</p>
                    <p className="text-sm font-bold text-slate-800">{jobOptionLabel(selectedJob)}</p>
                  </div>

                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                      <FileText size={10} className="inline mr-1" />Revision
                    </label>
                    <input
                      type="text"
                      value={revision}
                      onChange={(e) => setRevision(e.target.value)}
                      placeholder="1"
                      className="w-full text-xs border border-slate-200 rounded-lg px-2.5 py-2 focus:outline-none focus:ring-2 focus:ring-violet-400"
                    />
                  </div>

                  {isSafetyDoc && (
                    <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-xs text-blue-700">
                      <p className="font-semibold mb-0.5">Sign-on workflow</p>
                      <p className="leading-snug">
                        A sign-on record will be created for this job. Workers can sign on using the
                        existing job sign-on workflow. The content is locked at attachment time —
                        later edits to the master will not affect this job's version.
                      </p>
                    </div>
                  )}

                  <div className="flex gap-2 pt-1">
                    <button
                      onClick={() => { setStep('pick-job'); setSelectedJob(null); setShowJobPicker(true); }}
                      className="flex-1 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
                    >
                      Change Job
                    </button>
                    <button
                      onClick={() => void handleAttach()}
                      className="flex-1 py-2.5 rounded-xl bg-violet-600 hover:bg-violet-700 text-white text-sm font-bold transition-colors flex items-center justify-center gap-2"
                    >
                      <Briefcase size={14} />
                      Attach to Job
                    </button>
                  </div>
                </div>
              )}

              {/* Step: attaching */}
              {step === 'attaching' && (
                <div className="text-center py-8">
                  <Loader2 size={24} className="animate-spin text-violet-500 mx-auto mb-3" />
                  <p className="text-sm font-semibold text-slate-700">Attaching document…</p>
                  <p className="text-xs text-slate-400 mt-1">Creating content snapshot in job SWMS record</p>
                </div>
              )}

              {/* Step: done */}
              {step === 'done' && result && (
                <div className="space-y-3">
                  <div className="flex items-start gap-3 bg-emerald-50 border border-emerald-200 rounded-xl p-3">
                    <CheckCircle2 size={18} className="text-emerald-600 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-bold text-emerald-800">Document attached</p>
                      <p className="text-xs text-emerald-700 mt-0.5">
                        {docTitle} attached to {result.jobTitle || `Job #${result.jobNumber}`}.
                        Revision {result.revision}.
                      </p>
                    </div>
                  </div>
                  {isSafetyDoc && (
                    <div className="bg-blue-50 border border-blue-200 rounded-xl p-3 text-xs text-blue-700">
                      <p className="font-semibold mb-0.5">Ready for sign-on</p>
                      <p className="leading-snug">
                        Workers can now sign on to this SWMS from the job's Safety tab.
                        Sign-ons are linked to this specific attached version.
                      </p>
                    </div>
                  )}
                  <button
                    onClick={onClose}
                    className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-900 text-white text-sm font-bold transition-colors"
                  >
                    Done
                  </button>
                </div>
              )}

              {/* Step: error */}
              {step === 'error' && (
                <div className="space-y-3">
                  <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-xl p-3">
                    <AlertTriangle size={18} className="text-red-600 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-bold text-red-800">Attach failed</p>
                      <p className="text-xs text-red-700 mt-0.5">{errorMsg}</p>
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setStep('confirm')}
                      className="flex-1 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
                    >
                      Try Again
                    </button>
                    <button
                      onClick={onClose}
                      className="flex-1 py-2.5 rounded-xl bg-slate-800 text-white text-sm font-bold transition-colors"
                    >
                      Close
                    </button>
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );

  return (
    <>
      {createPortal(modal, document.body)}
      <JobPickerSheet
        open={showJobPicker}
        title="Select Job"
        subtitle={`Attach "${docTitle}" to a job`}
        onSelect={handleJobSelected}
        onClose={() => {
          setShowJobPicker(false);
          if (step === 'pick-job') onClose();
        }}
      />
    </>
  );
}
