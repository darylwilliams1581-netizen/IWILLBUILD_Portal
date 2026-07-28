/**
 * PendingPhotoCard
 *
 * Compact horizontal banner row for a single pending/uploading/synced/failed photo.
 * Uses field-friendly language — no technical jargon.
 *
 * Sync states shown to the user:
 *   saved      → "Saved on device"   (safe locally, waiting to upload)
 *   preparing  → "Getting ready…"    (resizing/normalising)
 *   uploading  → "Uploading… 42%"    (actively sending)
 *   synced     → "Synced"            (confirmed on server)
 *   failed     → "Couldn't upload"   (retry available)
 */

import { motion } from 'motion/react';
import { X, RefreshCw, CheckCircle2, AlertCircle, ImageOff, Loader2, HardDrive, WifiOff } from 'lucide-react';
import type { PendingPhoto, UploadStatus } from '@/hooks/usePhotoUploadQueue';

interface PendingPhotoCardProps {
  item: PendingPhoto;
  isOnline: boolean;
  onRetry: (clientId: string) => void;
  onRemove: (clientId: string) => void;
}

// ── Field-friendly labels ─────────────────────────────────────────────────────

const STATUS_LABEL: Record<UploadStatus, string> = {
  saved:     'Saved on device',
  preparing: 'Getting ready…',
  uploading: 'Uploading…',
  synced:    'Synced',
  failed:    'Couldn\'t upload',
};

// ── Colour scheme per state ───────────────────────────────────────────────────

const STATE_STYLE: Record<UploadStatus, { row: string; label: string }> = {
  saved:     { row: 'bg-slate-50 border-slate-200',       label: 'text-slate-500' },
  preparing: { row: 'bg-violet-50 border-violet-200',     label: 'text-violet-600' },
  uploading: { row: 'bg-violet-50 border-violet-200',     label: 'text-violet-600' },
  synced:    { row: 'bg-emerald-50 border-emerald-200',   label: 'text-emerald-600' },
  failed:    { row: 'bg-red-50 border-red-200',           label: 'text-red-600' },
};

// ── Component ─────────────────────────────────────────────────────────────────

export default function PendingPhotoCard({ item, isOnline, onRetry, onRemove }: PendingPhotoCardProps) {
  const isActive   = item.status === 'uploading' || item.status === 'preparing';
  const isSynced   = item.status === 'synced';
  const isFailed   = item.status === 'failed';
  const isSaved    = item.status === 'saved';
  const style      = STATE_STYLE[item.status];

  // When offline and saved, show a softer "waiting for connection" hint
  const offlineAndWaiting = isSaved && !isOnline;

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: -4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -4 }}
      transition={{ duration: 0.14 }}
      className={`flex items-center gap-2.5 px-3 py-2 rounded-xl border text-sm ${style.row}`}
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
        ) : isSynced ? (
          <CheckCircle2 size={14} className="text-emerald-500" />
        ) : isFailed ? (
          <AlertCircle size={14} className="text-red-500" />
        ) : offlineAndWaiting ? (
          <WifiOff size={14} className="text-slate-400" />
        ) : (
          <HardDrive size={14} className="text-slate-400" />
        )}
      </div>

      {/* Filename + status */}
      <div className="flex-1 min-w-0">
        <p className="text-xs text-slate-600 truncate leading-tight" title={item.fileName}>
          {item.fileName}
        </p>
        <div className="flex items-center gap-2 mt-0.5">
          <span className={`text-[10px] font-semibold leading-none ${style.label}`}>
            {offlineAndWaiting
              ? 'Waiting for connection'
              : STATUS_LABEL[item.status]}
            {item.status === 'uploading' && item.progress > 0 ? ` ${item.progress}%` : ''}
          </span>
          {isFailed && item.error && (
            <span className="text-[10px] text-red-400 truncate">{item.error}</span>
          )}
        </div>

        {/* Progress bar — uploading only */}
        {item.status === 'uploading' && (
          <div className="w-full h-1 bg-violet-100 rounded-full overflow-hidden mt-1">
            <div
              className="h-full bg-violet-500 rounded-full transition-all duration-200"
              style={{ width: `${item.progress}%` }}
            />
          </div>
        )}

        {/* "Restored from device" badge — shown on items recovered after app restart */}
        {item.restoredFromDevice && isSaved && (
          <span className="inline-flex items-center gap-1 mt-0.5 text-[9px] font-semibold text-slate-400 uppercase tracking-wide">
            <HardDrive size={8} /> Recovered
          </span>
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
