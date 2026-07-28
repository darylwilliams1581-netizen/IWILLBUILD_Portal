/**
 * BatchUploadSummary
 *
 * Sticky banner shown during and after a batch upload.
 * Uses field-friendly language — no technical jargon.
 *
 * States:
 *   - Offline with saved photos → "X photos saved on device — will sync when back online"
 *   - Uploading                 → "Syncing 3 of 10 photos…"
 *   - All synced                → "X photos synced"
 *   - Some failed               → "X synced, Y couldn't upload"
 */

import { Loader2, CheckCircle2, AlertCircle, X, WifiOff } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface BatchUploadSummaryProps {
  totalCount: number;
  pendingCount: number;
  uploadedCount: number;
  failedCount: number;
  savedCount: number;
  isUploading: boolean;
  isOnline: boolean;
  onDismiss?: () => void;
}

export default function BatchUploadSummary({
  totalCount,
  pendingCount,
  uploadedCount,
  failedCount,
  savedCount,
  isUploading,
  isOnline,
  onDismiss,
}: BatchUploadSummaryProps) {
  const doneCount    = uploadedCount + failedCount;
  const allDone      = !isUploading && doneCount > 0 && pendingCount === 0;
  const offlineHold  = !isOnline && savedCount > 0 && !isUploading;
  const visible      = isUploading || allDone || offlineHold;

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -8 }}
          transition={{ duration: 0.18 }}
          className={[
            'flex items-center gap-2.5 px-4 py-2.5 rounded-xl border text-sm font-semibold',
            offlineHold
              ? 'bg-amber-50 border-amber-200 text-amber-800'
              : failedCount > 0 && !isUploading
              ? 'bg-red-50 border-red-200 text-red-700'
              : allDone
              ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
              : 'bg-violet-50 border-violet-200 text-violet-800',
          ].join(' ')}
        >
          {/* Icon */}
          {offlineHold ? (
            <WifiOff size={15} className="shrink-0" />
          ) : isUploading ? (
            <Loader2 size={15} className="animate-spin shrink-0" />
          ) : failedCount > 0 ? (
            <AlertCircle size={15} className="shrink-0" />
          ) : (
            <CheckCircle2 size={15} className="shrink-0" />
          )}

          {/* Message */}
          <span className="flex-1">
            {offlineHold ? (
              <>
                {savedCount} photo{savedCount !== 1 ? 's' : ''} saved on device
                {' '}— will sync when back online
              </>
            ) : isUploading ? (
              <>Syncing {uploadedCount + 1} of {totalCount} photo{totalCount !== 1 ? 's' : ''}…</>
            ) : failedCount > 0 && uploadedCount > 0 ? (
              <>{uploadedCount} synced, {failedCount} couldn't upload</>
            ) : failedCount > 0 ? (
              <>{failedCount} photo{failedCount !== 1 ? 's' : ''} couldn't upload</>
            ) : (
              <>{uploadedCount} photo{uploadedCount !== 1 ? 's' : ''} synced</>
            )}
          </span>

          {(allDone || offlineHold) && onDismiss && (
            <button
              onClick={onDismiss}
              className="p-0.5 rounded-md hover:bg-black/10 transition-colors touch-manipulation"
              aria-label="Dismiss"
            >
              <X size={13} />
            </button>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
