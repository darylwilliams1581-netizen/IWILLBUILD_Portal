/**
 * PendingPhotoCard
 *
 * Compact horizontal banner row for a single pending/uploading/uploaded/failed photo.
 * Matches the slim style of BatchUploadSummary — no large card, no aspect-square thumbnail.
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
  pending:   'Waiting',
  preparing: 'Preparing…',
  uploading: 'Uploading…',
  uploaded:  'Uploaded',
  failed:    'Failed',
};

export default function PendingPhotoCard({ item, onRetry, onRemove }: PendingPhotoCardProps) {
  const isActive   = item.status === 'uploading' || item.status === 'preparing';
  const isUploaded = item.status === 'uploaded';
  const isFailed   = item.status === 'failed';

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      transition={{ duration: 0.14 }}
      className={[
        'flex items-center gap-2.5 px-3 py-2 rounded-xl border text-sm',
        isUploaded ? 'bg-emerald-50 border-emerald-200'
          : isFailed  ? 'bg-red-50 border-red-200'
          : isActive  ? 'bg-violet-50 border-violet-200'
          : 'bg-slate-50 border-slate-200',
      ].join(' ')}
    >
      {/* Tiny thumbnail or icon */}
      <div className="w-8 h-8 rounded-lg overflow-hidden shrink-0 bg-slate-200 flex items-center justify-center">
        {item.localPreviewUrl ? (
          <img
            src={item.localPreviewUrl}
            alt={item.fileName}
            className="w-full h-full object-cover"
            draggable={false}
          />
        ) : (
          <ImageOff size={14} className="text-slate-400" />
        )}
      </div>

      {/* Status icon */}
      <div className="shrink-0">
        {isActive ? (
          <Loader2 size={14} className="animate-spin text-violet-600" />
        ) : isUploaded ? (
          <CheckCircle2 size={14} className="text-emerald-500" />
        ) : isFailed ? (
          <AlertCircle size={14} className="text-red-500" />
        ) : (
          <div className="w-3.5 h-3.5 rounded-full border-2 border-slate-300" />
        )}
      </div>

      {/* Filename + status */}
      <div className="flex-1 min-w-0">
        <p className="text-xs text-slate-600 truncate leading-tight" title={item.fileName}>
          {item.fileName}
        </p>
        <div className="flex items-center gap-2 mt-0.5">
          <span className={[
            'text-[10px] font-semibold leading-none',
            isUploaded ? 'text-emerald-600'
              : isFailed ? 'text-red-600'
              : isActive  ? 'text-violet-600'
              : 'text-slate-400',
          ].join(' ')}>
            {STATUS_LABEL[item.status]}
            {item.status === 'uploading' && item.progress > 0 ? ` ${item.progress}%` : ''}
          </span>
          {isFailed && item.error && (
            <span className="text-[10px] text-red-400 truncate">{item.error}</span>
          )}
        </div>
        {/* Inline progress bar */}
        {item.status === 'uploading' && (
          <div className="w-full h-1 bg-violet-100 rounded-full overflow-hidden mt-1">
            <div
              className="h-full bg-violet-500 rounded-full transition-all duration-200"
              style={{ width: `${item.progress}%` }}
            />
          </div>
        )}
      </div>

      {/* Actions */}
      {isFailed && (
        <button
          onClick={() => onRetry(item.clientId)}
          className="flex items-center gap-1 px-2 py-1 rounded-lg bg-red-100 hover:bg-red-200 text-red-600 text-[10px] font-semibold transition-colors touch-manipulation shrink-0"
          aria-label="Retry upload"
        >
          <RefreshCw size={10} /> Retry
        </button>
      )}
      {!isActive && (
        <button
          onClick={() => onRemove(item.clientId)}
          className="w-6 h-6 rounded-full flex items-center justify-center text-slate-400 hover:text-slate-600 hover:bg-slate-200 transition-colors touch-manipulation shrink-0"
          aria-label="Remove"
        >
          <X size={12} strokeWidth={2.5} />
        </button>
      )}
    </motion.div>
  );
}
