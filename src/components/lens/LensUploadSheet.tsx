/**
 * LensUploadSheet — Website-only upload panel.
 * ─────────────────────────────────────────────────────────────────────────────
 * WEBSITE ONLY. No Capacitor, no IndexedDB, no offline queue, no native picker.
 *
 * Flow:
 *   1. Sheet opens → job picker (LensJobPickerSheet)
 *   2. Job selected → file picker (standard browser <input type="file">)
 *   3. Files uploaded immediately via XHR → POST /api/jobs/:jobId/photos
 *   4. Progress shown inline per file
 *   5. onPhotoSynced fires per confirmed photo → parent refreshes gallery
 *
 * Upload: plain XHR with credentials + X-Client-Id header.
 * No IDB, no CapacitorHttp, no native media library.
 */

import { useState, useRef, useCallback, useEffect } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { X, Upload, CheckCircle2, RotateCcw, ImagePlus, Loader2 } from 'lucide-react';
import LensJobPickerSheet, { type LensJobOption, jobLabel } from './LensJobPickerSheet';

// ── Types ─────────────────────────────────────────────────────────────────────

interface LensUploadSheetProps {
  open: boolean;
  onClose: () => void;
  onPhotoSynced: (serverPhotoId: number) => void;
  initialJob?: LensJobOption | null;
}

type FileStatus = 'pending' | 'uploading' | 'done' | 'failed';

interface FileItem {
  id: string;
  file: File;
  previewUrl: string | null;
  status: FileStatus;
  progress: number;
  error: string | null;
  serverId: number | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

let _counter = 0;
function uid() { return `f_${Date.now()}_${++_counter}`; }

function canPreview(f: File) {
  return ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif'].includes(f.type);
}

function uploadXhr(
  jobId: number,
  file: File,
  clientId: string,
  onProgress: (pct: number) => void,
): Promise<number> {
  return new Promise((resolve, reject) => {
    const fd = new FormData();
    fd.append('photos', file);
    const xhr = new XMLHttpRequest();
    xhr.open('POST', `/api/jobs/${jobId}/photos`);
    xhr.withCredentials = true;
    xhr.setRequestHeader('X-Client-Id', clientId);
    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    });
    xhr.addEventListener('load', () => {
      try {
        const data = JSON.parse(xhr.responseText) as { photos?: { id: number }[]; error?: string };
        if (xhr.status >= 200 && xhr.status < 300 && data.photos?.[0]) {
          resolve(data.photos[0].id);
        } else {
          reject(new Error(data.error ?? `Upload failed (${xhr.status})`));
        }
      } catch {
        reject(new Error(
          xhr.status === 413 ? 'File too large' :
          xhr.status === 401 ? 'Session expired — please log in again' :
          `Upload failed (${xhr.status})`
        ));
      }
    });
    xhr.addEventListener('error', () => reject(new Error('Network error')));
    xhr.addEventListener('abort', () => reject(new Error('Cancelled')));
    xhr.send(fd);
  });
}

// ── Upload panel ──────────────────────────────────────────────────────────────

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
  const [items, setItems] = useState<FileItem[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const activeRef = useRef(0);
  const itemsRef = useRef<FileItem[]>([]);
  itemsRef.current = items;

  const updateItem = useCallback((id: string, patch: Partial<FileItem>) => {
    setItems(prev => prev.map(i => i.id === id ? { ...i, ...patch } : i));
  }, []);

  const processNext = useCallback(() => {
    const current = itemsRef.current;
    if (activeRef.current >= 2) return;
    const next = current.find(i => i.status === 'pending');
    if (!next) return;

    activeRef.current += 1;
    updateItem(next.id, { status: 'uploading', progress: 0 });

    void uploadXhr(job.id, next.file, next.id, (pct) => {
      updateItem(next.id, { progress: pct });
    }).then((serverId) => {
      if (next.previewUrl) URL.revokeObjectURL(next.previewUrl);
      updateItem(next.id, { status: 'done', progress: 100, serverId, previewUrl: null });
      onPhotoSynced(serverId);
    }).catch((err: Error) => {
      updateItem(next.id, { status: 'failed', error: err.message });
    }).finally(() => {
      activeRef.current -= 1;
      processNext();
    });
  }, [job.id, updateItem, onPhotoSynced]);

  // Kick uploads whenever new pending items appear
  useEffect(() => {
    const pending = items.filter(i => i.status === 'pending').length;
    if (pending > 0) processNext();
  }, [items, processNext]);

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    const newItems: FileItem[] = files.map(f => ({
      id: uid(),
      file: f,
      previewUrl: canPreview(f) ? URL.createObjectURL(f) : null,
      status: 'pending',
      progress: 0,
      error: null,
      serverId: null,
    }));
    setItems(prev => [...prev, ...newItems]);
    e.target.value = '';
  }

  function retryItem(id: string) {
    updateItem(id, { status: 'pending', progress: 0, error: null });
  }

  function removeItem(id: string) {
    setItems(prev => {
      const item = prev.find(i => i.id === id);
      if (item?.previewUrl) URL.revokeObjectURL(item.previewUrl);
      return prev.filter(i => i.id !== id);
    });
  }

  function clearDone() {
    setItems(prev => {
      prev.filter(i => i.status === 'done' && i.previewUrl).forEach(i => URL.revokeObjectURL(i.previewUrl!));
      return prev.filter(i => i.status !== 'done');
    });
  }

  const pendingCount  = items.filter(i => i.status === 'pending' || i.status === 'uploading').length;
  const doneCount     = items.filter(i => i.status === 'done').length;
  const failedCount   = items.filter(i => i.status === 'failed').length;
  const allDone       = items.length > 0 && pendingCount === 0 && failedCount === 0;

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

      {/* Hidden file input — browser native, no Capacitor */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        aria-hidden="true"
        onChange={handleFileChange}
      />

      {/* Queue */}
      <div className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-2">
        {items.length === 0 && (
          <div className="flex flex-col items-center justify-center py-10 gap-3 text-muted-foreground">
            <ImagePlus size={36} className="opacity-30" />
            <p className="text-sm text-center">
              Select photos to upload to<br />
              <span className="font-semibold text-foreground">{job.name}</span>
            </p>
          </div>
        )}

        {items.map(item => (
          <div
            key={item.id}
            className="flex items-center gap-3 p-3 rounded-xl border border-border bg-card"
          >
            {/* Thumbnail */}
            <div className="w-12 h-12 rounded-lg overflow-hidden bg-muted shrink-0 flex items-center justify-center">
              {item.previewUrl
                ? <img src={item.previewUrl} alt="" className="w-full h-full object-cover" />
                : <ImagePlus size={20} className="text-muted-foreground opacity-40" />
              }
            </div>

            {/* Info */}
            <div className="flex-1 min-w-0">
              <p className="text-xs font-medium text-foreground truncate">{item.file.name}</p>
              {item.status === 'uploading' && (
                <div className="mt-1.5 h-1.5 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full bg-violet-500 rounded-full transition-all duration-200"
                    style={{ width: `${item.progress}%` }}
                  />
                </div>
              )}
              {item.status === 'pending' && (
                <p className="text-[11px] text-muted-foreground mt-0.5">Waiting…</p>
              )}
              {item.status === 'done' && (
                <p className="text-[11px] text-emerald-600 mt-0.5 flex items-center gap-1">
                  <CheckCircle2 size={11} /> Uploaded
                </p>
              )}
              {item.status === 'failed' && (
                <p className="text-[11px] text-destructive mt-0.5 truncate">{item.error}</p>
              )}
            </div>

            {/* Actions */}
            <div className="shrink-0 flex items-center gap-1">
              {item.status === 'uploading' && (
                <Loader2 size={16} className="animate-spin text-violet-500" />
              )}
              {item.status === 'failed' && (
                <button
                  type="button"
                  onClick={() => retryItem(item.id)}
                  className="min-w-[36px] min-h-[36px] flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground transition-colors"
                  aria-label="Retry"
                >
                  <RotateCcw size={14} />
                </button>
              )}
              {(item.status === 'done' || item.status === 'failed') && (
                <button
                  type="button"
                  onClick={() => removeItem(item.id)}
                  className="min-w-[36px] min-h-[36px] flex items-center justify-center rounded-lg text-muted-foreground hover:text-foreground transition-colors"
                  aria-label="Remove"
                >
                  <X size={14} />
                </button>
              )}
            </div>
          </div>
        ))}

        {allDone && doneCount > 0 && (
          <div className="flex items-center justify-between px-3 py-2.5 bg-emerald-50 border border-emerald-200 rounded-xl text-sm text-emerald-700 font-medium">
            <span className="flex items-center gap-2">
              <CheckCircle2 size={16} className="shrink-0 text-emerald-500" />
              {doneCount} photo{doneCount !== 1 ? 's' : ''} uploaded
            </span>
            <button
              type="button"
              onClick={clearDone}
              className="text-xs text-emerald-600 hover:text-emerald-800 transition-colors"
            >
              Clear
            </button>
          </div>
        )}
      </div>

      {/* Footer */}
      <div
        className="px-4 pt-3 pb-4 shrink-0 border-t border-border flex gap-2"
        style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 16px)' }}
      >
        {failedCount > 0 && (
          <button
            type="button"
            onClick={() => items.filter(i => i.status === 'failed').forEach(i => retryItem(i.id))}
            className="flex items-center gap-1.5 px-3 py-2.5 min-h-[44px] rounded-xl border border-border text-sm font-medium text-foreground hover:bg-muted transition-colors"
          >
            <RotateCcw size={14} />
            Retry {failedCount}
          </button>
        )}
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          className="flex-1 flex items-center justify-center gap-2 min-h-[44px] rounded-xl bg-violet-600 hover:bg-violet-700 active:bg-violet-800 text-white text-sm font-semibold transition-colors"
        >
          <Upload size={16} />
          {items.length > 0 ? 'Add more photos' : 'Select photos'}
        </button>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function LensUploadSheet({ open, onClose, onPhotoSynced, initialJob }: LensUploadSheetProps) {
  const [selectedJob, setSelectedJob] = useState<LensJobOption | null>(null);
  const [showJobPicker, setShowJobPicker] = useState(false);

  // React to open/initialJob changes via useEffect — never call setState in render body
  useEffect(() => {
    if (!open) {
      setSelectedJob(null);
      setShowJobPicker(false);
      return;
    }
    if (initialJob) {
      setSelectedJob(initialJob);
      setShowJobPicker(false);
    } else {
      setSelectedJob(null);
      setShowJobPicker(true);
    }
  }, [open, initialJob]);

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
            <motion.div
              key="upload-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.18 }}
              className="fixed inset-0 z-40 bg-black/50"
              onClick={handleClose}
            />
            <motion.div
              key="upload-sheet"
              initial={{ y: '100%', opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: '100%', opacity: 0 }}
              transition={{ type: 'spring', damping: 28, stiffness: 320 }}
              className="fixed inset-x-0 bottom-0 z-50 bg-background rounded-t-2xl shadow-2xl flex flex-col md:inset-auto md:top-1/2 md:left-1/2 md:-translate-x-1/2 md:-translate-y-1/2 md:w-[480px] md:max-w-[90vw] md:rounded-2xl"
              style={{ maxHeight: 'min(85vh, 640px)' }}
            >
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
