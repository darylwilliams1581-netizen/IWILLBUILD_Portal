/**
 * BatchUploadSummary
 *
 * Sticky banner shown during and after a batch upload.
 * Shows "Uploading 3 of 10 photos…" while active,
 * "8 uploaded, 2 failed" when done.
 */

import { Loader2, CheckCircle2, AlertCircle, X } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface BatchUploadSummaryProps {
  totalCount: number;
  pendingCount: number;
  uploadedCount: number;
  failedCount: number;
  isUploading: boolean;
  onDismiss?: () => void;
}

export default function BatchUploadSummary({
  totalCount,
  pendingCount,
  uploadedCount,
  failedCount,
  isUploading,
  onDismiss,
}: BatchUploadSummaryProps) {
  const doneCount = uploadedCount + failedCount;
  const allDone   = !isUploading && doneCount > 0 && pendingCount === 0;
  const visible   = isUploading || allDone;

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
            failedCount > 0 && !isUploading
              ? 'bg-red-50 border-red-200 text-red-700'
              : allDone
              ? 'bg-emerald-50 border-emerald-200 text-emerald-700'
              : 'bg-orange-50 border-orange-200 text-orange-700',
          ].join(' ')}
        >
          {isUploading ? (
            <Loader2 size={15} className="animate-spin shrink-0" />
          ) : failedCount > 0 ? (
            <AlertCircle size={15} className="shrink-0" />
          ) : (
            <CheckCircle2 size={15} className="shrink-0" />
          )}

          <span className="flex-1">
            {isUploading ? (
              <>Uploading {uploadedCount + 1} of {totalCount} photo{totalCount !== 1 ? 's' : ''}…</>
            ) : failedCount > 0 && uploadedCount > 0 ? (
              <>{uploadedCount} uploaded, {failedCount} failed</>
            ) : failedCount > 0 ? (
              <>{failedCount} photo{failedCount !== 1 ? 's' : ''} failed to upload</>
            ) : (
              <>{uploadedCount} photo{uploadedCount !== 1 ? 's' : ''} uploaded</>
            )}
          </span>

          {allDone && onDismiss && (
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
