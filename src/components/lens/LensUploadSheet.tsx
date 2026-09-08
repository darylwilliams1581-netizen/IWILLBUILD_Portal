/**
 * LensUploadSheet
 * ─────────────────────────────────────────────────────────────────────────────
 * Lens Phase 2 — Upload photos flow.
 *
 * Flow:
 *   1. Job picker (LensJobPickerSheet)
 *   2. User chooses Take Photo or Photo Library
 *   3. Selected files enter usePhotoUploadQueue → POST /api/jobs/:jobId/photos
 *   4. Queue progress shown inline (PendingPhotoCard)
 *   5. onPhotoSynced fires per-photo → parent refreshes gallery
 *   6. User stays on Lens throughout
 *
 * Rules:
 *   - Reuses usePhotoUploadQueue (existing hook, existing endpoint)
 *   - Uses the native-safe iOS picker for Camera and Photo Library
 *   - Accepts photos only; there is no file-browser path
 *   - Reuses PendingPhotoCard for queue display
 *   - No base64 storage, no direct R2 upload, no duplicate records
 *   - Multiple files allowed
 *   - 44×44 px minimum touch targets
 */

import { useState, useEffect, useCallback } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { X, CheckCircle2, RotateCcw, ImagePlus, Camera, Images, Loader2 } from 'lucide-react';
import { usePhotoUploadQueue } from '@/hooks/usePhotoUploadQueue';
import { useIosMediaPicker } from '@/hooks/useIosMediaPicker';
import { IosMediaInputs, IosPermissionBanner } from '@/components/IosMediaInputs';
import PermissionExplainerModal from '@/components/PermissionExplainerModal';
import PendingPhotoCard from '@/components/PendingPhotoCard';
import JobPickerSheet from '@/components/JobPickerSheet';
import { type LensJobOption, jobLabel } from './LensJobPickerSheet';

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

const ACCEPTED_PHOTO_TYPES = new Set([
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/heic',
  'image/heif',
  'image/heic-sequence',
  'image/heif-sequence',
  'image/webp',
  'image/gif',
]);

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
  const [queueError, setQueueError] = useState<string | null>(null);

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

  const enqueueSelected = useCallback(async (files: File[]) => {
    const photos = files.filter(file => ACCEPTED_PHOTO_TYPES.has(file.type.toLowerCase()));
    if (photos.length !== files.length) setQueueError('Photos only');
    else setQueueError(null);
    if (photos.length === 0) return;
    try {
      await enqueueFiles(photos);
    } catch (error) {
      setQueueError(error instanceof Error ? error.message : 'The photo could not be saved on this device.');
    }
  }, [enqueueFiles]);

  const picker = useIosMediaPicker((file) => {
    void enqueueSelected([file]);
  });

  const hasItems = queue.length > 0;
  const allDone  = hasItems && pendingCount === 0 && failedCount === 0;

  return (
    <div className="flex min-h-0 flex-col">
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

      <IosMediaInputs picker={picker} accept="image/*" />

      {picker.permissionDenied && (
        <div className="px-4 pt-3 shrink-0">
          <IosPermissionBanner type={picker.permissionDenied} />
        </div>
      )}

      {(picker.cameraError || queueError) && (
        <div className="mx-4 mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {picker.cameraError ?? queueError}
        </div>
      )}

      {/* Queue */}
      <div className="min-h-0 overflow-y-auto px-4 py-3 flex flex-col gap-2">
        {!hasItems && (
          <div className="flex flex-col items-center justify-center py-4 gap-2 text-muted-foreground">
            <ImagePlus size={28} className="opacity-30" />
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

      {/* Photo-only backup choices. No watermark; both use the existing queue. */}
      <div
        className="px-4 pt-3 pb-4 shrink-0 border-t border-border"
        style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 16px)' }}
      >
        {failedCount > 0 && <div className="mb-2 flex justify-end">
          <button
            type="button"
            onClick={() => queue.filter(i => i.status === 'failed').forEach(i => retryItem(i.clientId))}
            className="flex items-center gap-1.5 px-3 py-2.5 min-h-[44px] rounded-xl border border-border text-sm font-medium text-foreground hover:bg-muted transition-colors"
          >
            <RotateCcw size={14} />
            Retry {failedCount}
          </button>
        </div>}
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => void picker.openCamera()}
            disabled={picker.checkingPermission}
            className="flex min-h-[54px] flex-col items-center justify-center gap-1 rounded-xl bg-violet-600 px-2 text-[11px] font-semibold text-white transition-colors hover:bg-violet-700 active:bg-violet-800 disabled:opacity-50"
          >
            {picker.checkingPermission ? <Loader2 size={17} className="animate-spin" /> : <Camera size={17} />}
            Take Photo
          </button>
          <button
            type="button"
            onClick={() => void picker.openLibrary()}
            disabled={picker.checkingPermission}
            className="flex min-h-[54px] flex-col items-center justify-center gap-1 rounded-xl border border-border bg-background px-2 text-[11px] font-semibold text-foreground transition-colors hover:bg-muted disabled:opacity-50"
          >
            <Images size={17} />
            Photo Library
          </button>
        </div>
      </div>

      {picker.explainer && (
        <PermissionExplainerModal
          open={true}
          type={picker.explainer.type}
          denied={picker.explainer.denied}
          onNotNow={picker.explainer.onNotNow}
          onEnable={picker.explainer.onEnable}
        />
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function LensUploadSheet({ open, onClose, onPhotoSynced, initialJob }: LensUploadSheetProps) {
  const [selectedJob, setSelectedJob] = useState<LensJobOption | null>(null);
  const [showJobPicker, setShowJobPicker] = useState(false);

  function handleJobSelect(job: { id: number; name: string; jobNumber?: string | null }) {
    setSelectedJob({
      id: job.id,
      name: job.name,
      jobNumber: job.jobNumber ?? null,
      status: 'active',
    });
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

  // Initialise the sheet after render. Updating state during render caused a
  // React #301 loop when the Lens Upload button opened with no preselected job.
  useEffect(() => {
    if (!open) return;
    if (initialJob) {
      setSelectedJob(initialJob);
      setShowJobPicker(false);
    } else {
      setSelectedJob(null);
      setShowJobPicker(true);
    }
  }, [open, initialJob]);

  return (
    <>
      {/* Job picker sheet */}
      <JobPickerSheet
        open={open && showJobPicker}
        title="Select a job"
        subtitle="Photos will be uploaded to this job"
        iconBg="bg-violet-100"
        iconFg="text-violet-600"
        Icon={ImagePlus}
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

            {/* Same mobile/desktop shell used by the sign-in job picker. */}
            <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4 pointer-events-none">
              <motion.div
                key="upload-sheet"
                initial={{ opacity: 0, y: 40 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 40 }}
                transition={{ type: 'spring', damping: 30, stiffness: 340 }}
                className="pointer-events-auto w-full sm:max-w-sm bg-white rounded-t-3xl sm:rounded-3xl flex flex-col overflow-hidden"
                style={{
                  boxShadow: '0 8px 48px rgba(0,0,0,0.18)',
                  maxHeight: 'min(560px, calc(100dvh - 60px))',
                }}
                onClick={e => e.stopPropagation()}
              >
                <UploadPanel
                  job={selectedJob}
                  onPhotoSynced={onPhotoSynced}
                  onChangeJob={handleChangeJob}
                  onClose={handleClose}
                />
              </motion.div>
            </div>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
