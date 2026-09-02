/**
 * LensSelectionBar
 * ─────────────────────────────────────────────────────────────────────────────
 * Sticky bottom action bar shown when Lens selection mode is active.
 *
 * Controls:
 *   - Selected count badge
 *   - Download / Export button (single photo → original; 2+ → ZIP)
 *   - Select visible (all currently loaded photos)
 *   - Select whole Job (opens job picker, then confirms count, then exports)
 *   - Clear selection
 *   - Cancel (exits selection mode)
 *
 * Export states:
 *   idle → exporting → success (auto-clears) | error (preserves selection)
 *
 * Rules:
 *   - 44×44 px minimum touch targets
 *   - Respects iPhone safe-area-inset-bottom
 *   - No horizontal overflow
 *   - Does not trigger multiple simultaneous downloads
 *   - Preserves selection on failure so user can retry
 *   - Clears selection after successful export
 */

import { useState, useEffect } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  Download, X, CheckSquare, Square,
  Loader2, CheckCircle2, AlertCircle,
  HardHat, Layers,
} from 'lucide-react';
import LensJobPickerSheet, { type LensJobOption } from './LensJobPickerSheet';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface LensSelectionBarProps {
  /** IDs of currently selected photos */
  selectedIds: Set<number>;
  /** Total photos currently loaded in the gallery (for "select visible") */
  visiblePhotoIds: number[];
  /** Called to set the full selection to a new set */
  onSetSelection: (ids: Set<number>) => void;
  /** Called to clear selection and exit selection mode */
  onCancel: () => void;
  /** Called after a successful export so the parent can clear selection */
  onExportSuccess: () => void;
}

type ExportState = 'idle' | 'exporting' | 'success' | 'error';

// ── Whole-Job confirmation modal ──────────────────────────────────────────────

interface WholeJobConfirmProps {
  job: LensJobOption;
  photoCount: number | null;
  loading: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

function WholeJobConfirm({ job, photoCount, loading, onConfirm, onCancel }: WholeJobConfirmProps) {
  const jobLabel = job.jobNumber ? `#${job.jobNumber} — ${job.name}` : job.name;
  return (
    <motion.div
      key="confirm-backdrop"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/50 px-4"
      style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 16px)' }}
    >
      <motion.div
        initial={{ y: 40, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 40, opacity: 0 }}
        transition={{ type: 'spring', damping: 28, stiffness: 320 }}
        className="w-full max-w-sm bg-background rounded-2xl shadow-2xl p-5"
      >
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-xl bg-violet-100 flex items-center justify-center shrink-0">
            <Layers size={18} className="text-violet-600" />
          </div>
          <div>
            <p className="text-sm font-bold text-foreground">Export whole job</p>
            <p className="text-xs text-muted-foreground truncate max-w-[200px]">{jobLabel}</p>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 py-2 text-sm text-muted-foreground">
            <Loader2 size={14} className="animate-spin" />
            Counting photos…
          </div>
        ) : (
          <p className="text-sm text-foreground mb-4">
            Export all{' '}
            <span className="font-bold">
              {photoCount !== null ? photoCount.toLocaleString() : '…'}
            </span>{' '}
            photo{photoCount !== 1 ? 's' : ''} from{' '}
            <span className="font-semibold">{jobLabel}</span>?
          </p>
        )}

        <div className="flex gap-2 mt-2">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 min-h-[44px] rounded-xl border border-border text-sm font-medium text-foreground hover:bg-muted transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading || photoCount === 0}
            className="flex-1 min-h-[44px] rounded-xl bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white text-sm font-semibold transition-colors"
          >
            Export ZIP
          </button>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ── Download helper ───────────────────────────────────────────────────────────

/**
 * Trigger a browser download from a Blob.
 * Uses a temporary <a> element — works on Safari, Chrome, and iOS WebView.
 */
function triggerBlobDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a   = document.createElement('a');
  a.href     = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

// ── Main component ────────────────────────────────────────────────────────────

export default function LensSelectionBar({
  selectedIds,
  visiblePhotoIds,
  onSetSelection,
  onCancel,
  onExportSuccess,
}: LensSelectionBarProps) {
  const [exportState, setExportState] = useState<ExportState>('idle');
  const [exportError, setExportError] = useState<string | null>(null);

  // Whole-job flow state
  const [jobPickerOpen,    setJobPickerOpen]    = useState(false);
  const [confirmJob,       setConfirmJob]       = useState<LensJobOption | null>(null);
  const [confirmCount,     setConfirmCount]     = useState<number | null>(null);
  const [confirmLoading,   setConfirmLoading]   = useState(false);

  const count = selectedIds.size;

  // Auto-clear success message after 3 s
  useEffect(() => {
    if (exportState !== 'success') return;
    const t = setTimeout(() => setExportState('idle'), 3000);
    return () => clearTimeout(t);
  }, [exportState]);

  // ── Export selected photos ─────────────────────────────────────────────────
  async function handleExport() {
    if (count === 0 || exportState === 'exporting') return;
    setExportState('exporting');
    setExportError(null);

    try {
      if (count === 1) {
        // Single photo — download original via authenticated proxy
        const [photoId] = [...selectedIds];
        const res = await fetch(`/api/lens/photos/${photoId}/download`, { credentials: 'include' });
        if (!res.ok) throw new Error(`Server returned ${res.status}`);
        const blob     = await res.blob();
        const cd       = res.headers.get('Content-Disposition') ?? '';
        const match    = cd.match(/filename="?([^";\n]+)"?/i);
        const filename = match?.[1] ?? `photo-${photoId}.jpg`;
        triggerBlobDownload(blob, filename);
      } else {
        // Multiple photos — ZIP via Lens export endpoint
        const res = await fetch('/api/lens/photos/export-zip', {
          method:  'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ photoIds: [...selectedIds] }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({})) as { error?: string };
          throw new Error(body.error ?? `Server returned ${res.status}`);
        }
        const blob     = await res.blob();
        const cd       = res.headers.get('Content-Disposition') ?? '';
        const match    = cd.match(/filename="?([^";\n]+)"?/i);
        const filename = match?.[1] ?? 'IWIIlBUILD_Lens_Photos.zip';
        triggerBlobDownload(blob, filename);
      }

      setExportState('success');
      onExportSuccess();
    } catch (err) {
      console.error('Lens export error:', err);
      setExportError(err instanceof Error ? err.message : 'Export failed');
      setExportState('error');
    }
  }

  // ── Select visible ─────────────────────────────────────────────────────────
  function handleSelectVisible() {
    onSetSelection(new Set(visiblePhotoIds));
  }

  // ── Whole-job flow ─────────────────────────────────────────────────────────
  async function handleJobSelected(job: LensJobOption) {
    setJobPickerOpen(false);
    setConfirmJob(job);
    setConfirmCount(null);
    setConfirmLoading(true);

    try {
      const res = await fetch(`/api/lens/photos?jobId=${job.id}&limit=1`, { credentials: 'include' });
      const data = await res.json() as { total?: number };
      setConfirmCount(data.total ?? 0);
    } catch {
      setConfirmCount(0);
    } finally {
      setConfirmLoading(false);
    }
  }

  async function handleWholeJobExport() {
    if (!confirmJob || exportState === 'exporting') return;
    setConfirmJob(null);
    setExportState('exporting');
    setExportError(null);

    try {
      const res = await fetch(`/api/jobs/${confirmJob.id}/photos/export-zip`, {
        method:  'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({}),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(body.error ?? `Server returned ${res.status}`);
      }
      const blob     = await res.blob();
      const cd       = res.headers.get('Content-Disposition') ?? '';
      const match    = cd.match(/filename="?([^";\n]+)"?/i);
      const filename = match?.[1] ?? `job-${confirmJob.id}-photos.zip`;
      triggerBlobDownload(blob, filename);

      setExportState('success');
      onExportSuccess();
    } catch (err) {
      console.error('Whole-job export error:', err);
      setExportError(err instanceof Error ? err.message : 'Export failed');
      setExportState('error');
    }
  }

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <>
      {/* Job picker for whole-job export */}
      <LensJobPickerSheet
        open={jobPickerOpen}
        title="Select a job to export"
        subtitle="All photos for that job will be downloaded as a ZIP"
        onSelect={handleJobSelected}
        onClose={() => setJobPickerOpen(false)}
      />

      {/* Whole-job confirmation */}
      <AnimatePresence>
        {confirmJob && (
          <WholeJobConfirm
            job={confirmJob}
            photoCount={confirmCount}
            loading={confirmLoading}
            onConfirm={() => void handleWholeJobExport()}
            onCancel={() => setConfirmJob(null)}
          />
        )}
      </AnimatePresence>

      {/* Sticky bottom bar */}
      <div
        className="fixed inset-x-0 bottom-0 z-30 bg-background/95 backdrop-blur-sm border-t border-border shadow-lg"
        style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 8px)' }}
      >
        {/* Error banner */}
        <AnimatePresence>
          {exportState === 'error' && exportError && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="flex items-center gap-2 px-4 py-2 bg-destructive/10 border-b border-destructive/20 text-xs text-destructive font-medium">
                <AlertCircle size={13} className="shrink-0" />
                <span className="flex-1 min-w-0 truncate">{exportError}</span>
                <button
                  type="button"
                  onClick={() => { setExportState('idle'); setExportError(null); }}
                  className="shrink-0 text-destructive/70 hover:text-destructive"
                  aria-label="Dismiss error"
                >
                  <X size={13} />
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Success banner */}
        <AnimatePresence>
          {exportState === 'success' && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="flex items-center gap-2 px-4 py-2 bg-emerald-50 border-b border-emerald-200 text-xs text-emerald-700 font-medium">
                <CheckCircle2 size={13} className="shrink-0 text-emerald-500" />
                Download started
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Main bar — icons only, no text labels */}
        <div className="max-w-screen-2xl mx-auto px-3 py-2 flex items-center gap-1.5">
          {/* Count badge */}
          <div className="flex items-center gap-1 shrink-0 bg-violet-600 text-white text-xs font-bold px-2 py-1.5 rounded-lg min-h-[36px] min-w-[44px] justify-center">
            <CheckSquare size={13} />
            <span>{count}</span>
          </div>

          {/* Download / Export */}
          <button
            type="button"
            onClick={() => void handleExport()}
            disabled={count === 0 || exportState === 'exporting'}
            className="flex items-center justify-center min-h-[44px] min-w-[44px] px-3 rounded-xl bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white transition-colors shrink-0"
            title={count === 1 ? 'Download photo' : 'Export as ZIP'}
            aria-label={count === 1 ? 'Download photo' : 'Export as ZIP'}
          >
            {exportState === 'exporting' ? (
              <Loader2 size={16} className="animate-spin" />
            ) : (
              <Download size={16} />
            )}
          </button>

          {/* Select visible */}
          <button
            type="button"
            onClick={handleSelectVisible}
            className="flex items-center justify-center min-h-[44px] min-w-[44px] px-3 rounded-xl border border-border text-foreground hover:bg-muted transition-colors shrink-0"
            title="Select all visible photos"
            aria-label="Select all visible photos"
          >
            <Square size={16} />
          </button>

          {/* Select whole job */}
          <button
            type="button"
            onClick={() => setJobPickerOpen(true)}
            className="flex items-center justify-center min-h-[44px] min-w-[44px] px-3 rounded-xl border border-border text-foreground hover:bg-muted transition-colors shrink-0"
            title="Export all photos for a job"
            aria-label="Export all photos for a job"
          >
            <HardHat size={16} />
          </button>

          {/* Clear */}
          {count > 0 && (
            <button
              type="button"
              onClick={() => onSetSelection(new Set())}
              className="flex items-center justify-center min-h-[44px] min-w-[44px] px-3 rounded-xl border border-border text-muted-foreground hover:text-foreground hover:bg-muted transition-colors shrink-0"
              title="Clear selection"
              aria-label="Clear selection"
            >
              <X size={16} />
            </button>
          )}

          {/* Cancel */}
          <button
            type="button"
            onClick={onCancel}
            className="ml-auto flex items-center justify-center min-h-[44px] min-w-[44px] px-3 rounded-xl text-muted-foreground hover:text-foreground hover:bg-muted transition-colors shrink-0"
            title="Exit selection mode"
            aria-label="Exit selection mode"
          >
            <X size={18} className="text-foreground" />
          </button>
        </div>
      </div>
    </>
  );
}
