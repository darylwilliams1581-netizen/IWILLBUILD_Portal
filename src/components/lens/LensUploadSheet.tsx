/**
 * LensUploadSheet
 * ─────────────────────────────────────────────────────────────────────────────
 * Lens Phase 2 — Upload photos flow.
 *
 * Flow:
 *   1. Job picker (LensJobPickerSheet)
 *   2. File picker opens immediately after job selection
 *   3. Files enqueued into usePhotoUploadQueue → POST /api/jobs/:jobId/photos
 *   4. Queue progress shown inline (PendingPhotoCard)
 *   5. onPhotoSynced fires per-photo → parent refreshes gallery
 *   6. User stays on Lens throughout
 *
 * Rules:
 *   - Reuses usePhotoUploadQueue (existing hook, existing endpoint)
 *   - Reuses useIosMediaPicker + IosMediaInputs (iOS/Capacitor safe)
 *   - Reuses PendingPhotoCard for queue display
 *   - No base64 storage, no direct R2 upload, no duplicate records
 *   - Multiple files allowed
 *   - 44×44 px minimum touch targets
 */

import { useState, useCallback, useRef } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { X, Upload, CheckCircle2, RotateCcw, ImagePlus } from 'lucide-react';
import { usePhotoUploadQueue } from '@/hooks/usePhotoUploadQueue';
import { useIosMediaPicker } from '@/hooks/useIosMediaPicker';
import { IosMediaInputs, IosPermissionBanner } from '@/components/IosMediaInputs';
import PendingPhotoCard from '@/components/PendingPhotoCard';
import LensJobPickerSheet, { type LensJobOption, jobLabel } from './LensJobPickerSheet';

// ── Types ─────────────────────────────────────────────────────────────────────

interface LensUploadSheetProps {
  open: boolean;
  onClose: () => void;
  /** Called after each individual photo is confirmed on the server */
  onPhotoSynced: (serverPhotoId: number) => void;
  /**
   * When set, skip the job picker and go straight to the upload panel
   * for this job. Used by the Group-by-Job view where the job is already known.
   */
  initialJob?: LensJobOption | null;
}

// ── Inner upload panel (shown after job is selected) ─────────────────────────

function UploadPanel({
  job,
  onPhotoSynced,
  onChangeJob,
  onClose,
}: {
  job: LensJobOption;
  onPhotoSynced: (id: number) => void;
  onChangeJob: () => void;
  onClose: () => void;
}) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const {
    queue,
    isOnline,
    enqueueFiles,
    retryItem,
    removeItem,
    clearUploaded,
    pendingCount,
    uploadedCount,
    failedCount,
  } = usePhotoUploadQueue({
    jobId: job.id,
    onPhotoSynced,
    onBatchComplete: (uploaded, failed) => {
      if (uploaded > 0 && failed === 0) {
        // Auto-clear synced items after a short delay so user sees success
        setTimeout(() => clearUploaded(), 2500);
      }
    },
  });

  // iOS-safe multi-file picker
  const picker = useIosMediaPicker(async (file: File) => {
    await enqueueFiles([file]);
  });

  // Web multi-file input handler
  function handleWebFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (files.length > 0) void enqueueFiles(files);
    // Reset so the same files can be re-selected if needed
    e.target.value = '';
  }

  function openFilePicker() {
    // On native iOS use the Capacitor-safe library picker
    if (picker.openLibrary) {
      void picker.openLibrary();
    } else {
      fileInputRef.current?.click();
    }
  }

  const hasItems = queue.length > 0;
  const allDone  = hasItems && pendingCount === 0 && failedCount === 0;

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-4 pt-4 pb-3 shrink-0 border-b border-border">
        <div className="min-w-0">
          <h2 className="text-base font-bold text-foreground">Upload photos</h2>
          <button
            type="button"
            onClick={onChangeJob}
            className="text-xs text-violet-600 hover:text-violet-800 transition-colors mt-0.5 text-left truncate max-w-[220px]"
          >
            {jobLabel(job)} · change
          </button>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="min-w-[44px] min-h-[44px] flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors rounded-lg -mr-2"
          aria-label="Close"
        >
          <X size={18} />
        </button>
      </div>

      {/* Permission denied banner */}
      {picker.permissionDenied && (
        <div className="px-4 pt-3 shrink-0">
          <IosPermissionBanner type={picker.permissionDenied} />
        </div>
      )}

      {/* Hidden inputs (iOS/web) */}
      <IosMediaInputs picker={picker} accept="image/*" />

      {/* Web multi-file input (hidden) */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        aria-hidden="true"
        onChange={handleWebFileChange}
      />

      {/* Queue */}
      <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-2">
        {!hasItems && (
          <div className="flex flex-col items-center justify-center py-10 gap-3 text-muted-foreground">
            <ImagePlus size={36} className="opacity-30" />
            <p className="text-sm text-center">
              Select photos to upload to<br />
              <span className="font-semibold text-foreground">{job.name}</span>
            </p>
          </div>
        )}

        {queue.map((item) => (
          <PendingPhotoCard
            key={item.clientId}
            item={item}
            isOnline={isOnline}
            onRetry={retryItem}
            onRemove={removeItem}
          />
        ))}

        {allDone && uploadedCount > 0 && (
          <div className="flex items-center gap-2 px-3 py-2.5 bg-emerald-50 border border-emerald-200 rounded-xl text-sm text-emerald-700 font-medium">
            <CheckCircle2 size={16} className="shrink-0 text-emerald-500" />
            {uploadedCount} photo{uploadedCount !== 1 ? 's' : ''} uploaded to {job.name}
          </div>
        )}

        {!isOnline && (
          <div className="px-3 py-2 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-700">
            You're offline — photos are saved on device and will upload when you reconnect.
          </div>
        )}
      </div>

      {/* Actions */}
      <div
        className="px-4 pt-3 pb-4 shrink-0 border-t border-border flex gap-2"
        style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 16px)' }}
      >
        {failedCount > 0 && (
          <button
            type="button"
            onClick={() => queue.filter(i => i.status === 'failed').forEach(i => retryItem(i.clientId))}
            className="flex items-center gap-1.5 px-3 py-2.5 min-h-[44px] rounded-xl border border-border text-sm font-medium text-foreground hover:bg-muted transition-colors"
          >
            <RotateCcw size={14} />
            Retry {failedCount}
          </button>
        )}
        <button
          type="button"
          onClick={openFilePicker}
          className="flex-1 flex items-center justify-center gap-2 min-h-[44px] rounded-xl bg-violet-600 hover:bg-violet-700 active:bg-violet-800 text-white text-sm font-semibold transition-colors"
        >
          <Upload size={16} />
          {hasItems ? 'Add more photos' : 'Select photos'}
        </button>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function LensUploadSheet({ open, onClose, onPhotoSynced, initialJob }: LensUploadSheetProps) {
  const [selectedJob, setSelectedJob] = useState<LensJobOption | null>(null);
  const [showJobPicker, setShowJobPicker] = useState(false);

  // When the sheet opens, decide whether to show job picker or go straight to upload
  function handleOpen() {
    if (initialJob) {
      setSelectedJob(initialJob);
      setShowJobPicker(false);
    } else {
      setSelectedJob(null);
      setShowJobPicker(true);
    }
  }

  function handleJobSelect(job: LensJobOption) {
    setSelectedJob(job);
    setShowJobPicker(false);
  }

  function handleChangeJob() {
    setSelectedJob(null);
    setShowJobPicker(true);
  }

  function handleClose() {
    setSelectedJob(null);
    setShowJobPicker(false);
    onClose();
  }

  // Trigger job picker (or direct upload) on open
  const prevOpen = useRef(false);
  if (open && !prevOpen.current) {
    handleOpen();
  }
  // If initialJob changes while open, re-run handleOpen so the correct job is pre-seeded
  const prevInitialJobId = useRef<number | null | undefined>(null);
  if (open && initialJob?.id !== prevInitialJobId.current) {
    prevInitialJobId.current = initialJob?.id ?? null;
    handleOpen();
  }
  prevOpen.current = open;

  return (
    <>
      {/* Job picker sheet */}
      <LensJobPickerSheet
        open={open && showJobPicker}
        title="Select a job"
        subtitle="Photos will be uploaded to this job"
        onSelect={handleJobSelect}
        onClose={handleClose}
      />

      {/* Upload panel sheet */}
      <AnimatePresence>
        {open && selectedJob && !showJobPicker && (
          <>
            {/* Backdrop */}
            <motion.div
              key="upload-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
              className="fixed inset-0 z-40 bg-black/50"
              onClick={handleClose}
            />

            {/* Sheet */}
            <motion.div
              key="upload-sheet"
              initial={{ y: '100%', opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: '100%', opacity: 0 }}
              transition={{ type: 'spring', damping: 28, stiffness: 320 }}
              className="fixed inset-x-0 bottom-0 z-50 bg-background rounded-t-2xl shadow-2xl flex flex-col md:inset-auto md:top-1/2 md:left-1/2 md:-translate-x-1/2 md:-translate-y-1/2 md:w-[480px] md:max-w-[90vw] md:rounded-2xl"
              style={{
                maxHeight: 'min(85vh, 640px)',
              }}
            >
              {/* Handle (mobile only) */}
              <div className="flex justify-center pt-3 pb-0 md:hidden shrink-0">
                <div className="w-10 h-1 rounded-full bg-muted-foreground/30" />
              </div>

              <UploadPanel
                job={selectedJob}
                onPhotoSynced={onPhotoSynced}
                onChangeJob={handleChangeJob}
                onClose={handleClose}
              />
            </motion.div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
