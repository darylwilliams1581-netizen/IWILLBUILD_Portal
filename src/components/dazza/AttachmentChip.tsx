/**
 * AttachmentChip
 * ─────────────────────────────────────────────────────────────────────────────
 * Displays a single pending Dazza attachment with:
 *   - Filename (safe, sanitised)
 *   - File size
 *   - Upload state (uploading / encrypted / attached / failed)
 *   - Progress bar during upload
 *   - Remove control (detaches from pending question — does NOT delete stored source)
 *
 * Uses the existing IWIllBUILD/Dazza visual language.
 */

import { X, FileText, Lock, CheckCircle2, AlertTriangle, Loader2 } from 'lucide-react';
import type { PendingAttachment } from '@/hooks/useDazzaAttachments';

interface AttachmentChipProps {
  attachment: PendingAttachment;
  onRemove: (clientId: string) => void;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const STATUS_CONFIG = {
  pending:    { label: 'Pending',    icon: Loader2,       color: 'text-slate-400',  bg: 'bg-slate-100 border-slate-200' },
  uploading:  { label: 'Uploading',  icon: Loader2,       color: 'text-blue-500',   bg: 'bg-blue-50 border-blue-200' },
  encrypted:  { label: 'Encrypted',  icon: Lock,          color: 'text-violet-500', bg: 'bg-violet-50 border-violet-200' },
  attached:   { label: 'Attached',   icon: CheckCircle2,  color: 'text-emerald-500',bg: 'bg-emerald-50 border-emerald-200' },
  failed:     { label: 'Failed',     icon: AlertTriangle, color: 'text-red-500',    bg: 'bg-red-50 border-red-200' },
} as const;

export default function AttachmentChip({ attachment, onRemove }: AttachmentChipProps) {
  const cfg = STATUS_CONFIG[attachment.status];
  const StatusIcon = cfg.icon;
  const isSpinning = attachment.status === 'uploading' || attachment.status === 'pending';

  return (
    <div
      className={`relative flex items-center gap-2 px-2.5 py-1.5 rounded-xl border text-xs font-medium ${cfg.bg} max-w-[220px] group`}
      title={attachment.error ?? attachment.filename}
    >
      {/* File icon */}
      <FileText size={12} className="text-slate-400 shrink-0" />

      {/* Filename + size */}
      <div className="flex flex-col min-w-0 flex-1">
        <span className="truncate text-slate-700 leading-tight max-w-[120px]">
          {attachment.filename}
        </span>
        <span className="text-slate-400 leading-tight text-[10px]">
          {formatBytes(attachment.byteLength)}
        </span>
      </div>

      {/* Status icon */}
      <StatusIcon
        size={12}
        className={`${cfg.color} shrink-0 ${isSpinning ? 'animate-spin' : ''}`}
      />

      {/* Remove button */}
      <button
        type="button"
        onClick={() => onRemove(attachment.clientId)}
        className="ml-0.5 p-0.5 rounded-full hover:bg-slate-200 transition-colors text-slate-400 hover:text-slate-600 shrink-0"
        aria-label={`Remove ${attachment.filename}`}
        title="Remove (does not delete stored source)"
      >
        <X size={10} />
      </button>

      {/* Progress bar (uploading only) */}
      {attachment.status === 'uploading' && attachment.progress > 0 && (
        <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-blue-100 rounded-b-xl overflow-hidden">
          <div
            className="h-full bg-blue-400 transition-all duration-200"
            style={{ width: `${attachment.progress}%` }}
          />
        </div>
      )}

      {/* Error tooltip */}
      {attachment.status === 'failed' && attachment.error && (
        <div className="absolute bottom-full left-0 mb-1 z-50 hidden group-hover:block">
          <div className="bg-slate-900 text-white text-[10px] rounded-lg px-2 py-1 max-w-[200px] leading-snug shadow-lg">
            {attachment.error}
          </div>
        </div>
      )}
    </div>
  );
}
