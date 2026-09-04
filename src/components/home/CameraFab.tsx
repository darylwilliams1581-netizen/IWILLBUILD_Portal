/**
 * CameraFab.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Floating camera button on the mobile Dashboard page.
 *
 * Flow:
 *   1. Tap the FAB → bottom sheet slides up with job search
 *   2. Select a job → camera opens immediately (native Capacitor on iOS,
 *      file input on web)
 *   3. Photo captured → uploads to POST /api/jobs/:id/photos
 *   4. Success state with "View photos" link; sheet closes
 *
 * The job selector is the same search-as-you-type pattern as
 * DashboardPhotoUploader but optimised for one-tap mobile use:
 *   • Active jobs load on open (no typing required for common case)
 *   • Selecting a job fires the camera immediately — no extra "Upload" step
 *   • One photo per FAB tap (camera flow, not bulk upload)
 */

import { useState, useRef, useEffect, useCallback } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { Camera, Search, X, CheckCircle2, ExternalLink, Loader2, ChevronRight, AlertTriangle } from 'lucide-react';
import { Link } from "react-router";
import { useIosMediaPicker } from '@/hooks/useIosMediaPicker';
import { IosMediaInputs } from '@/components/IosMediaInputs';
import PermissionExplainerModal from '@/components/PermissionExplainerModal';
import { IosPermissionBanner } from '@/components/IosMediaInputs';

// ── Types ─────────────────────────────────────────────────────────────────────

interface JobOption {
  id: number;
  jobNumber: string | null;
  name: string;
  status: string;
}
type SheetState = 'closed' | 'job-select' | 'uploading' | 'done';

// ── Helpers ───────────────────────────────────────────────────────────────────

function jobLabel(job: JobOption): string {
  return job.jobNumber ? `#${job.jobNumber} — ${job.name}` : job.name;
}

// ── Job search list ───────────────────────────────────────────────────────────

function JobSearchList({
  onSelect,
  uploadError
}: {
  onSelect: (job: JobOption) => void;
  uploadError: string | null;
}) {
  const [query, setQuery] = useState('');
  const [jobs, setJobs] = useState<JobOption[]>([]);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  // Load active jobs on mount
  useEffect(() => {
    void fetchJobs('');
    setTimeout(() => inputRef.current?.focus(), 120);
  }, []);

  // Debounced search
  useEffect(() => {
    const t = setTimeout(() => void fetchJobs(query), 250);
    return () => clearTimeout(t);
  }, [query]);
  async function fetchJobs(q: string) {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        status: 'active',
        limit: '40'
      });
      if (q) params.set('q', q);
      const res = await fetch(`/api/jobs/search?${params}`, {
        credentials: 'include'
      });
      const data = (await res.json()) as {
        jobs?: JobOption[];
      };
      setJobs(data.jobs ?? []);
    } catch {
      setJobs([]);
    } finally {
      setLoading(false);
    }
  }
  return <div className="flex flex-col gap-0">
      {/* Error banner */}
      {uploadError && <div className="mx-4 mt-3 px-3 py-2.5 bg-destructive/10 border border-destructive/20 rounded-xl text-xs font-semibold text-destructive">
          {uploadError}
        </div>}

      {/* Search input */}
      <div className="flex items-center gap-2.5 px-4 py-3 border-b border-border mt-1">
        <Search size={15} className="text-muted-foreground shrink-0" />
        <input ref={inputRef} value={query} onChange={e => setQuery(e.target.value)} placeholder="Search job number or name…" className="flex-1 text-sm bg-transparent outline-none text-foreground placeholder:text-muted-foreground" autoComplete="off" autoCorrect="off" spellCheck={false} />
        {loading && <Loader2 size={13} className="animate-spin text-muted-foreground shrink-0" />}
        {!loading && query && <button type="button" onClick={() => setQuery('')} className="text-muted-foreground hover:text-foreground transition-colors" aria-label="Clear search">
            <X size={13} />
          </button>}
      </div>

      {/* Results */}
      <div className="overflow-y-auto" style={{
      maxHeight: '52vh'
    }}>
        {jobs.length === 0 && !loading ? <p className="text-sm text-muted-foreground text-center py-8">
            {query ? 'No jobs found.' : 'No active jobs.'}
          </p> : jobs.map(job => <button key={job.id} type="button" onClick={() => onSelect(job)} className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-muted/60 active:bg-muted transition-colors border-b border-border/50 last:border-b-0">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-foreground truncate">{job.name}</p>
                {job.jobNumber && <p className="text-xs text-muted-foreground mt-0.5">#{job.jobNumber}</p>}
              </div>
              <ChevronRight size={14} className="text-muted-foreground shrink-0" />
            </button>)}
      </div>
    </div>;
}

// ── Main component ────────────────────────────────────────────────────────────

export default function CameraFab() {
  const [sheetState, setSheetState] = useState<SheetState>('closed');
  const [selectedJob, setSelectedJob] = useState<JobOption | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [doneJobId, setDoneJobId] = useState<number | null>(null);
  const [doneJobName, setDoneJobName] = useState<string>('');

  // Ref to the job selected when camera fires — needed in the picker callback
  // which closes over a stale selectedJob state value.
  const pendingJobRef = useRef<JobOption | null>(null);

  // ── Upload handler ────────────────────────────────────────────────────────
  // Defined before useIosMediaPicker so it can be passed as the onChange callback.

  async function handlePhotoFile(file: File) {
    const job = pendingJobRef.current;
    if (!job) return;

    setSheetState('uploading');
    setUploadError(null);
    try {
      const formData = new FormData();
      formData.append('photo', file, file.name);
      const res = await fetch(`/api/jobs/${job.id}/photos`, {
        method: 'POST',
        credentials: 'include',
        body: formData
      });
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(data.error ?? `Upload failed (${res.status})`);
      }
      setDoneJobId(job.id);
      setDoneJobName(job.name);
      setSheetState('done');
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Upload failed');
      setSheetState('job-select');
    }
  }
  const picker = useIosMediaPicker(handlePhotoFile);

  // ── Job selected → open camera immediately ────────────────────────────────

  const handleJobSelect = useCallback(async (job: JobOption) => {
    pendingJobRef.current = job;
    setSelectedJob(job);
    await picker.openCamera({
      direction: 'rear',
      captureQuality: 84
    });
  }, [picker]);

  // ── Open / close ──────────────────────────────────────────────────────────

  function openSheet() {
    setSelectedJob(null);
    setUploadError(null);
    pendingJobRef.current = null;
    picker.clear();
    setSheetState('job-select');
  }
  function closeSheet() {
    setSheetState('closed');
    setSelectedJob(null);
    setUploadError(null);
    pendingJobRef.current = null;
    picker.clear();
  }
  const isOpen = sheetState !== 'closed';
  return <>
      {/* Hidden file inputs (web fallback) */}
      <IosMediaInputs picker={picker as Parameters<typeof IosMediaInputs>[0]['picker']} />

      {/* Permission explainer modal */}
      {picker.explainer && <PermissionExplainerModal type={picker.explainer.type} denied={picker.explainer.denied} onNotNow={picker.explainer.onNotNow} onEnable={picker.explainer.onEnable} />}

      {/* ── FAB ── */}
      <button type="button" onClick={openSheet} aria-label="Take a photo" className="fixed z-40 flex items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg active:scale-90 transition-transform" style={{
      bottom: 'calc(max(env(safe-area-inset-bottom), 16px) + 60px)',
      right: 20,
      width: 56,
      height: 56,
      boxShadow: '0 4px 20px hsl(var(--primary) / 0.45)'
    }}>
        <Camera size={24} strokeWidth={2} />
      </button>

      {/* ── Bottom sheet backdrop ── */}
      <AnimatePresence>
        {isOpen && <motion.div key="backdrop" initial={{
        opacity: 0
      }} animate={{
        opacity: 1
      }} exit={{
        opacity: 0
      }} transition={{
        duration: 0.2
      }} className="fixed inset-0 z-50 bg-black/50" onClick={closeSheet} />}
      </AnimatePresence>

      {/* ── Bottom sheet ── */}
      <AnimatePresence>
        {isOpen && <motion.div key="sheet" initial={{
        y: '100%'
      }} animate={{
        y: 0
      }} exit={{
        y: '100%'
      }} transition={{
        type: 'spring',
        damping: 28,
        stiffness: 300
      }} className="fixed left-0 right-0 z-50 bg-card rounded-t-2xl overflow-hidden" style={{
        bottom: 0,
        paddingBottom: 'max(env(safe-area-inset-bottom), 16px)',
        maxHeight: '85vh'
      }} onClick={e => e.stopPropagation()}>
            {/* Drag handle */}
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 rounded-full bg-border" />
            </div>

            {/* ── Job select state ── */}
            {sheetState === 'job-select' && <>
                <div className="flex items-center justify-between px-4 py-2.5 border-b border-border">
                  <div className="flex items-center gap-2.5">
                    <div className="w-7 h-7 rounded-lg bg-primary/15 flex items-center justify-center">
                      <Camera size={14} className="text-primary" />
                    </div>
                    <div>
                      <p className="text-sm font-bold text-foreground leading-tight">Select a job</p>
                      <p className="text-xs text-muted-foreground leading-tight">Camera opens after selection</p>
                    </div>
                  </div>
                  <button type="button" onClick={closeSheet} className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground" aria-label="Close">
                    <X size={16} />
                  </button>
                </div>

                {/* Camera error banner */}
                {picker.cameraError && <div className="mx-4 mt-3 flex items-start gap-2.5 px-3 py-2.5 bg-destructive/10 border border-destructive/20 rounded-xl">
                    <AlertTriangle size={14} className="text-destructive shrink-0 mt-0.5" />
                    <p className="text-xs font-semibold text-destructive leading-snug">{picker.cameraError}</p>
                  </div>}

                {/* Permission denied banner */}
                {picker.permissionDenied && <div className="mx-4 mt-3">
                    <IosPermissionBanner type={picker.permissionDenied} onDismiss={() => picker.clear()} />
                  </div>}

                <JobSearchList onSelect={handleJobSelect} uploadError={uploadError} />
              </>}

            {/* ── Uploading state ── */}
            {sheetState === 'uploading' && <div className="flex flex-col items-center justify-center gap-3 py-12 px-6">
                <div className="w-14 h-14 rounded-full bg-primary/10 flex items-center justify-center">
                  <Loader2 size={28} className="animate-spin text-primary" />
                </div>
                <div className="text-center">
                  <p className="text-sm font-bold text-foreground">Uploading photo…</p>
                  {selectedJob && <p className="text-xs text-muted-foreground mt-1">{jobLabel(selectedJob)}</p>}
                </div>
              </div>}

            {/* ── Done state ── */}
            {sheetState === 'done' && <div className="flex flex-col items-center justify-center gap-4 py-10 px-6">
                <div className="w-14 h-14 rounded-full bg-emerald-500/15 flex items-center justify-center">
                  <CheckCircle2 size={28} className="text-emerald-500" />
                </div>
                <div className="text-center">
                  <p className="text-sm font-bold text-foreground">Photo uploaded</p>
                  <p className="text-xs text-muted-foreground mt-1">{doneJobName}</p>
                </div>
                <div className="flex items-center gap-3 flex-wrap justify-center">
                  {doneJobId && <Link to={`/jobs/${doneJobId}/photos`} onClick={closeSheet} className="flex items-center gap-1.5 px-4 py-2 bg-primary text-primary-foreground text-xs font-semibold rounded-xl">
                      View photos <ExternalLink size={11} />
                    </Link>}
                  <button type="button" onClick={() => {
              // Take another photo — go back to job select
              setUploadError(null);
              picker.clear();
              setSheetState('job-select');
            }} className="flex items-center gap-1.5 px-4 py-2 border border-border bg-card text-foreground text-xs font-semibold rounded-xl">
                    <Camera size={12} /> Another photo
                  </button>
                </div>
                <button type="button" onClick={closeSheet} className="text-xs text-muted-foreground hover:text-foreground transition-colors mt-1">
                  Done
                </button>
              </div>}
          </motion.div>}
      </AnimatePresence>
    </>;
}
