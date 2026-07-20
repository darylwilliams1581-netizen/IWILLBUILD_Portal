/**
 * PendingPhotoCard
 *
 * Renders a single pending/uploading/uploaded/failed photo card in the upload tray.
 * Shows local preview thumbnail, upload progress, status badge, and retry/remove actions.
 */

import { motion } from 'motion/react';
import { X, RefreshCw, CheckCircle2, AlertCircle, ImageOff, Loader2 } from 'lucide-react';
import type { PendingPhoto, UploadStatus } from '@/hooks/usePhotoUploadQueue';

interface PendingPhotoCardProps {
  item: PendingPhoto;
  onRetry: (clientId: string) => void;
  onRemove: (clientId: string) => void;
}

const STATUS_LABEL: Record<UploadStatus, string> = {
  pending:   'Waiting…',
  preparing: 'Preparing…',
  uploading: 'Uploading…',
  uploaded:  'Uploaded',
  failed:    'Failed',
};

export default function PendingPhotoCard({ item, onRetry, onRemove }: PendingPhotoCardProps) {
  const isActive   = item.status === 'uploading' || item.status === 'preparing';
  const isUploaded = item.status === 'uploaded';
  const isFailed   = item.status === 'failed';
  const isPending  = item.status === 'pending';

  return (
    <motion.div
      layout
      initial={{ opacity: 0, scale: 0.92 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.88 }}
      transition={{ duration: 0.15 }}
      className={[
        'relative flex flex-col rounded-xl overflow-hidden border transition-all',
        isUploaded ? 'border-emerald-300 bg-emerald-50'
          : isFailed ? 'border-red-300 bg-red-50'
          : 'border-slate-200 bg-slate-100',
      ].join(' ')}
    >
      {/* Thumbnail area */}
      <div className="relative aspect-square bg-slate-200 overflow-hidden">
        {item.localPreviewUrl ? (
          <img
            src={item.localPreviewUrl}
            alt={item.fileName}
            className="w-full h-full object-cover"
            draggable={false}
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center">
            <ImageOff size={24} className="text-slate-400" />
          </div>
        )}

        {/* Progress overlay — shown while uploading */}
        {isActive && (
          <div className="absolute inset-0 bg-black/40 flex flex-col items-center justify-center gap-1.5">
            {item.status === 'uploading' && item.progress > 0 ? (
              <>
                <span className="text-white font-bold text-lg leading-none">{item.progress}%</span>
                <div className="w-3/4 h-1.5 bg-white/30 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-white rounded-full transition-all duration-200"
                    style={{ width: `${item.progress}%` }}
                  />
                </div>
              </>
            ) : (
              <Loader2 size={22} className="text-white animate-spin" />
            )}
          </div>
        )}

        {/* Pending overlay */}
        {isPending && (
          <div className="absolute inset-0 bg-black/20 flex items-center justify-center">
            <div className="w-2 h-2 rounded-full bg-white/80 animate-pulse" />
          </div>
        )}

        {/* Success overlay */}
        {isUploaded && (
          <div className="absolute inset-0 bg-emerald-500/20 flex items-center justify-center">
            <div className="w-8 h-8 rounded-full bg-emerald-500 flex items-center justify-center shadow-lg">
              <CheckCircle2 size={18} className="text-white" strokeWidth={2.5} />
            </div>
          </div>
        )}

        {/* Failed overlay */}
        {isFailed && (
          <div className="absolute inset-0 bg-red-500/20 flex items-center justify-center">
            <div className="w-8 h-8 rounded-full bg-red-500 flex items-center justify-center shadow-lg">
              <AlertCircle size={18} className="text-white" strokeWidth={2.5} />
            </div>
          </div>
        )}

        {/* Remove button — top-right */}
        {!isActive && (
          <button
            onClick={() => onRemove(item.clientId)}
            className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-black/50 hover:bg-black/70 flex items-center justify-center text-white transition-colors touch-manipulation"
            aria-label="Remove"
          >
            <X size={12} strokeWidth={2.5} />
          </button>
        )}
      </div>

      {/* Status strip */}
      <div className="px-2 py-1.5 bg-white border-t border-slate-100 flex flex-col gap-0.5">
        {/* Filename */}
        <p className="text-[10px] text-slate-500 truncate leading-tight" title={item.fileName}>
          {item.fileName}
        </p>

        {/* Status row */}
        <div className="flex items-center justify-between gap-1">
          <span className={[
            'text-[10px] font-semibold leading-tight',
            isUploaded ? 'text-emerald-600'
              : isFailed ? 'text-red-600'
              : isActive ? 'text-orange-500'
              : 'text-slate-400',
          ].join(' ')}>
            {STATUS_LABEL[item.status]}
          </span>

          {/* Retry button for failed */}
          {isFailed && (
            <button
              onClick={() => onRetry(item.clientId)}
              className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-red-100 hover:bg-red-200 text-red-600 text-[10px] font-semibold transition-colors touch-manipulation"
              aria-label="Retry upload"
            >
              <RefreshCw size={9} /> Retry
            </button>
          )}
        </div>

        {/* Inline progress bar for uploading state */}
        {item.status === 'uploading' && (
          <div className="w-full h-1 bg-slate-200 rounded-full overflow-hidden mt-0.5">
            <div
              className="h-full bg-orange-400 rounded-full transition-all duration-200"
              style={{ width: `${item.progress}%` }}
            />
          </div>
        )}

        {/* Error message */}
        {isFailed && item.error && (
          <p className="text-[9px] text-red-500 leading-tight truncate" title={item.error}>
            {item.error}
          </p>
        )}
      </div>
    </motion.div>
  );
}
