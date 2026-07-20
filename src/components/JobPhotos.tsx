import { useState, useEffect, useRef, useCallback, forwardRef, useImperativeHandle, memo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Upload,
  X,
  Download,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Loader2,
  AlertCircle,
  ImageOff,
  Pencil,
  RotateCcw,
  RotateCw,
  Check,
  User,
  Clock,
  CheckSquare,
  Square,
} from 'lucide-react';
import { usePhotoUploadQueue } from '@/hooks/usePhotoUploadQueue';
import PendingPhotoCard from '@/components/PendingPhotoCard';
import BatchUploadSummary from '@/components/BatchUploadSummary';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface JobPhoto {
  id: number;
  jobId: number;
  companyId: number;
  filename: string;
  originalName: string | null;
  label: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  uploadedByUserId: string | null;
  uploadedByName: string | null;
  createdAt: string;
  /** Signed URL for the original full-resolution file */
  url: string | null;
  /** Signed URL for the ~300px thumbnail (fast grid display) */
  thumbnailUrl: string | null;
  /** Signed URL for the ~1000px preview (lightbox) */
  previewUrl: string | null;
  /** Original image dimensions if known */
  imageWidth: number | null;
  imageHeight: number | null;
}

interface JobPhotosProps {
  jobId: number;
  onShareLink?: (url: string) => void;
  onPhotoCount?: (count: number) => void;
  onUploading?: (uploading: boolean) => void;
  onSelectionChange?: (count: number) => void;
}

export interface JobPhotosHandle {
  openFilePicker: () => void;
  openCamera: () => void;
  generateShareLink: () => void;
  setViewSize: (size: ViewSize) => void;
  viewSize: ViewSize;
  selectMode: boolean;
  setSelectMode: (v: boolean) => void;
  selectedCount: number;
  photoCount: number;
  uploading: boolean;
  downloadSelected: () => void;
  exitSelectMode: () => void;
}

type ViewSize = 'small' | 'medium' | 'large';

// ── Constants ─────────────────────────────────────────────────────────────────

const MAX_PHOTOS = 200;
const PAGE_SIZE = 30;
/** Max files a user can select in a single batch */
const BATCH_LIMIT = 10;

// auto-fill columns — tiles snap to minmax width, no fixed column count
const VIEW_COLS: Record<ViewSize, string> = {
  small:  '[grid-template-columns:repeat(auto-fill,minmax(80px,1fr))]',
  medium: '[grid-template-columns:repeat(auto-fill,minmax(150px,1fr))]',
  large:  '[grid-template-columns:repeat(auto-fill,minmax(240px,1fr))]',
};
const VIEW_GAP: Record<ViewSize, string> = {
  small:  'gap-[2px]',
  medium: 'gap-[8px]',
  large:  'gap-[12px]',
};
const VIEW_RADIUS: Record<ViewSize, string> = {
  small:  'rounded-sm',
  medium: 'rounded-xl',
  large:  'rounded-xl',
};

// ── Client-side photo cache (stale-while-revalidate) ──────────────────────────
// Keyed by jobId. Survives tab switches within the same session.

interface CacheEntry {
  photos: JobPhoto[];
  hasMore: boolean;
  nextCursor: string | null;
  totalCount: number;
  fetchedAt: number;
}
const photoCache = new Map<number, CacheEntry>();
const CACHE_TTL_MS = 30_000; // 30 s stale window

// ── Helpers ───────────────────────────────────────────────────────────────────

function photoUrl(photo: JobPhoto) {
  return photo.url ?? `/airo-assets/uploads/job-photos/${photo.filename}`;
}

function thumbnailSrc(photo: JobPhoto, bust?: number): string {
  const isHeic = photo.mimeType === 'image/heic' || photo.mimeType === 'image/heif';
  const base = photo.thumbnailUrl ?? photo.url ?? `/airo-assets/uploads/job-photos/${photo.filename}`;
  if (isHeic && !photo.thumbnailUrl) return base;
  return bust ? `${base}?v=${bust}` : base;
}

function previewSrc(photo: JobPhoto, bust?: number): string {
  const base = photo.previewUrl ?? photo.url ?? `/airo-assets/uploads/job-photos/${photo.filename}`;
  return bust ? `${base}?v=${bust}` : base;
}

function isHeicNoThumb(photo: JobPhoto): boolean {
  return (photo.mimeType === 'image/heic' || photo.mimeType === 'image/heif') && !photo.thumbnailUrl;
}

function formatBytes(bytes: number | null) {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDateTime(iso: string) {
  return new Date(iso).toLocaleString('en-AU', {
    day: 'numeric', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

// Dev-only timing helper — no-ops in production
const DEV = import.meta.env.DEV;
function devLog(msg: string, data?: Record<string, unknown>) {
  if (!DEV) return;
  if (data) console.log(`[JobPhotos] ${msg}`, data);
  else console.log(`[JobPhotos] ${msg}`);
}

// ── Edit Modal (lazy-mounted) ─────────────────────────────────────────────────

interface EditModalProps {
  photo: JobPhoto;
  cacheBust: Record<number, number>;
  onClose: () => void;
  onSaved: (updated: JobPhoto) => void;
}

function EditModal({ photo, cacheBust, onClose, onSaved }: EditModalProps) {
  const [label, setLabel] = useState(photo.label ?? '');
  const [saving, setSaving] = useState(false);
  const [rotating, setRotating] = useState<'left' | 'right' | null>(null);
  const [replacing, setReplacing] = useState(false);
  const [error, setError] = useState('');
  const [localBust, setLocalBust] = useState(cacheBust[photo.id] ?? Date.now());
  const replaceRef = useRef<HTMLInputElement>(null);

  async function doRotate(dir: 'left' | 'right') {
    setRotating(dir); setError('');
    try {
      const res = await fetch(`/api/jobs/${photo.jobId}/photos/${photo.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        credentials: 'include', body: JSON.stringify({ rotate: dir }),
      });
      const data = await res.json() as { ok?: boolean; photo?: JobPhoto; error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Rotation failed');
      setLocalBust(Date.now());
      if (data.photo) onSaved({ ...data.photo, label: label || data.photo.label });
    } catch (e) { setError(e instanceof Error ? e.message : 'Rotation failed'); }
    finally { setRotating(null); }
  }

  async function doSave() {
    setSaving(true); setError('');
    try {
      const res = await fetch(`/api/jobs/${photo.jobId}/photos/${photo.id}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        credentials: 'include', body: JSON.stringify({ label }),
      });
      const data = await res.json() as { ok?: boolean; photo?: JobPhoto; error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Save failed');
      if (data.photo) onSaved(data.photo);
      onClose();
    } catch (e) { setError(e instanceof Error ? e.message : 'Save failed'); }
    finally { setSaving(false); }
  }

  async function doReplace(file: File) {
    setReplacing(true); setError('');
    try {
      const fd = new FormData(); fd.append('photo', file);
      const res = await fetch(`/api/jobs/${photo.jobId}/photos/${photo.id}/replace`, {
        method: 'POST', credentials: 'include', body: fd,
      });
      const data = await res.json() as { ok?: boolean; photo?: JobPhoto; error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Replace failed');
      setLocalBust(Date.now());
      if (data.photo) onSaved({ ...data.photo, label: label || data.photo.label });
    } catch (e) { setError(e instanceof Error ? e.message : 'Replace failed'); }
    finally { setReplacing(false); if (replaceRef.current) replaceRef.current.value = ''; }
  }

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  const busy = saving || rotating !== null || replacing;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 8 }} animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 8 }} transition={{ duration: 0.15 }}
        className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden"
      >
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h3 className="font-heading font-bold text-base text-slate-900">Edit Photo</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground"><X size={16} /></button>
        </div>
        <div className="bg-slate-100 flex items-center justify-center" style={{ height: 220 }}>
          <img key={localBust} src={previewSrc(photo, localBust)} alt={photo.label ?? photo.originalName ?? 'Photo'} className="max-w-full max-h-full object-contain" />
        </div>
        <div className="flex items-center justify-center gap-3 px-5 py-3 border-b border-border bg-slate-50">
          <span className="text-xs font-semibold text-muted-foreground mr-1">Rotate:</span>
          <button onClick={() => doRotate('left')} disabled={busy} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-white hover:bg-muted text-xs font-semibold text-slate-700 disabled:opacity-40 transition-colors">
            {rotating === 'left' ? <Loader2 size={13} className="animate-spin" /> : <RotateCcw size={13} />} Left 90°
          </button>
          <button onClick={() => doRotate('right')} disabled={busy} className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-white hover:bg-muted text-xs font-semibold text-slate-700 disabled:opacity-40 transition-colors">
            {rotating === 'right' ? <Loader2 size={13} className="animate-spin" /> : <RotateCw size={13} />} Right 90°
          </button>
        </div>
        <div className="px-5 py-4 flex flex-col gap-3">
          {error && <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 flex items-center gap-2"><AlertCircle size={12} /> {error}</p>}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">Caption / Label</label>
            <input type="text" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. North wall framing"
              className="w-full px-3 py-2.5 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors"
              onKeyDown={(e) => { if (e.key === 'Enter' && !busy) doSave(); }} />
          </div>
          <div className="flex flex-col gap-1.5">
            <p className="text-xs font-semibold text-slate-700">Upload edited version</p>
            <p className="text-[11px] text-slate-400 leading-snug">Download → mark up → save → upload here to replace.</p>
            <button type="button" onClick={() => replaceRef.current?.click()} disabled={busy}
              className="flex items-center gap-2 self-start mt-1 px-3 py-2 border border-border bg-white hover:bg-slate-50 disabled:opacity-40 text-sm font-semibold text-slate-700 rounded-lg transition-colors">
              {replacing ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
              {replacing ? 'Replacing…' : 'Choose file to replace'}
            </button>
            <input ref={replaceRef} type="file" accept="image/*" className="hidden"
              onChange={(e) => { if (e.target.files?.[0]) void doReplace(e.target.files[0]); }} />
          </div>
          <div className="flex flex-col gap-1 pt-1">
            {photo.uploadedByName && (
              <p className="text-xs text-muted-foreground flex items-center gap-1.5"><User size={11} className="shrink-0" /> Uploaded by <span className="font-semibold text-slate-700">{photo.uploadedByName}</span></p>
            )}
            <p className="text-xs text-muted-foreground flex items-center gap-1.5"><Clock size={11} className="shrink-0" /> {formatDateTime(photo.createdAt)}</p>
          </div>
        </div>
        <div className="flex items-center justify-between gap-2 px-5 py-4 border-t border-border bg-slate-50">
          <a href={`/api/jobs/${photo.jobId}/photos/${photo.id}/download`} download={photo.originalName ?? photo.filename}
            className="flex items-center gap-1.5 px-4 py-2 border border-border bg-white hover:bg-muted text-sm font-semibold text-slate-600 rounded-lg transition-colors">
            <Download size={13} /> Download
          </a>
          <div className="flex items-center gap-2">
            <button type="button" onClick={onClose} disabled={busy} className="px-4 py-2 text-sm font-semibold text-slate-600 hover:text-slate-800 disabled:opacity-40 transition-colors">Cancel</button>
            <button type="button" onClick={doSave} disabled={busy}
              className="flex items-center gap-1.5 px-5 py-2 bg-slate-900 hover:bg-slate-700 disabled:opacity-40 text-white text-sm font-semibold rounded-lg transition-colors">
              {saving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />} Save
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

// ── Lightbox (lazy-mounted) ───────────────────────────────────────────────────

interface LightboxProps {
  photos: JobPhoto[];
  index: number;
  cacheBust: Record<number, number>;
  onClose: () => void;
  onNavigate: (i: number) => void;
  onDelete: (photo: JobPhoto) => void;
  onEdit: (photo: JobPhoto) => void;
  deleting: number | null;
}

function Lightbox({ photos, index, cacheBust, onClose, onNavigate, onDelete, onEdit, deleting }: LightboxProps) {
  const photo = photos[index];

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft' && index > 0) onNavigate(index - 1);
      if (e.key === 'ArrowRight' && index < photos.length - 1) onNavigate(index + 1);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [index, photos.length, onClose, onNavigate]);

  const bust = cacheBust[photo.id];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/92">
      <div className="absolute inset-0" onClick={onClose} />
      <div className="absolute top-4 right-4 flex items-center gap-2 z-10">
        <button onClick={(e) => { e.stopPropagation(); onEdit(photo); }} className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors" title="Edit"><Pencil size={16} /></button>
        <button onClick={() => { const a = document.createElement('a'); a.href = `/api/jobs/${photo.jobId}/photos/${photo.id}/download`; a.download = photo.originalName ?? photo.filename; a.click(); }}
          className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors" title="Download"><Download size={16} /></button>
        <button onClick={() => onDelete(photo)} disabled={deleting === photo.id}
          className="p-2 rounded-lg bg-white/10 hover:bg-red-500/80 text-white transition-colors disabled:opacity-50" title="Delete">
          {deleting === photo.id ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
        </button>
        <button onClick={onClose} className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors" title="Close"><X size={16} /></button>
      </div>
      {index > 0 && (
        <button onClick={(e) => { e.stopPropagation(); onNavigate(index - 1); }} className="absolute left-4 top-1/2 -translate-y-1/2 z-10 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors">
          <ChevronLeft size={24} />
        </button>
      )}
      <div className="relative z-10 max-w-[90vw] max-h-[85vh] flex flex-col items-center gap-3">
        <img
          key={bust ?? photo.filename}
          src={previewSrc(photo, bust)}
          alt={photo.label ?? photo.originalName ?? 'Job photo'}
          className="max-w-full max-h-[72vh] object-contain rounded-lg shadow-2xl"
          loading="eager"
          decoding="async"
        />
        <div className="text-center">
          {photo.label && <p className="text-white font-semibold text-sm mb-0.5">{photo.label}</p>}
          <p className="text-white/50 text-xs">{photo.originalName ?? photo.filename}{photo.sizeBytes ? ` · ${formatBytes(photo.sizeBytes)}` : ''}</p>
          {photo.uploadedByName && <p className="text-white/40 text-xs mt-0.5">{photo.uploadedByName} · {formatDateTime(photo.createdAt)}</p>}
          <p className="text-white/25 text-xs mt-0.5">{index + 1} / {photos.length}</p>
        </div>
      </div>
      {index < photos.length - 1 && (
        <button onClick={(e) => { e.stopPropagation(); onNavigate(index + 1); }} className="absolute right-4 top-1/2 -translate-y-1/2 z-10 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors">
          <ChevronRight size={24} />
        </button>
      )}
    </div>
  );
}

// ── Photo card (memoised to avoid re-renders on unrelated state changes) ──────

interface PhotoCardProps {
  photo: JobPhoto;
  index: number;
  viewSize: ViewSize;
  isSelected: boolean;
  selectMode: boolean;
  bust: number | undefined;
  onTap: (i: number) => void;
  onToggleSelect: (id: number) => void;
  onEdit: (p: JobPhoto) => void;
  onDelete: (p: JobPhoto) => void;
}

const PhotoCard = memo(function PhotoCard({
  photo, index, viewSize, isSelected, selectMode, bust,
  onTap, onToggleSelect, onEdit, onDelete,
}: PhotoCardProps) {
  return (
    <div
      className={`group relative flex flex-col ${VIEW_RADIUS[viewSize]} overflow-hidden bg-slate-100 border transition-all ${
        isSelected ? 'border-primary ring-2 ring-primary/30' : 'border-slate-200'
      }`}
    >
      {/* Thumbnail */}
      <div
        className="relative aspect-square cursor-pointer"
        onClick={() => selectMode ? onToggleSelect(photo.id) : onTap(index)}
      >
        {isHeicNoThumb(photo) ? (
          <div className="w-full h-full flex flex-col items-center justify-center bg-slate-100 gap-1">
            <ImageOff size={20} className="text-slate-400" />
            <span className="text-[10px] text-slate-500 font-semibold">HEIC</span>
          </div>
        ) : (
          <img
            key={bust ?? photo.filename}
            src={thumbnailSrc(photo, bust)}
            alt={photo.label ?? photo.originalName ?? 'Job photo'}
            className="w-full h-full object-cover"
            loading="lazy"
            width={300}
            height={300}
            decoding="async"
          />
        )}

        {/* Select overlay */}
        {selectMode && (
          <div className={`absolute inset-0 transition-colors ${isSelected ? 'bg-primary/20' : 'bg-black/0 hover:bg-black/10'}`}>
            <div className={`absolute top-1.5 left-1.5 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${
              isSelected ? 'bg-primary border-primary' : 'bg-white/80 border-white'
            }`}>
              {isSelected && <Check size={11} className="text-white" strokeWidth={3} />}
            </div>
          </div>
        )}

        {/* Hover overlay */}
        {!selectMode && <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors pointer-events-none" />}

        {/* Small-view: action buttons on hover */}
        {!selectMode && viewSize === 'small' && (
          <div className="absolute top-1 right-1 flex flex-col gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none group-hover:pointer-events-auto">
            <button onClick={(e) => { e.stopPropagation(); onEdit(photo); }} className="w-5 h-5 rounded bg-black/60 hover:bg-black/80 text-white flex items-center justify-center" title="Edit"><Pencil size={9} /></button>
            <button onClick={(e) => { e.stopPropagation(); onDelete(photo); }} className="w-5 h-5 rounded bg-black/60 hover:bg-red-600 text-white flex items-center justify-center" title="Delete"><Trash2 size={9} /></button>
          </div>
        )}
      </div>

      {/* Metadata strip — medium and large only */}
      {viewSize !== 'small' && (
        <div className={`bg-slate-50 border-t border-slate-200 flex flex-col gap-0.5 ${viewSize === 'large' ? 'px-3 py-2.5' : 'px-2 py-1.5'}`}>
          <div className="flex items-start justify-between gap-1">
            <div className="min-w-0 flex-1">
              {photo.label
                ? <p className="text-xs font-semibold text-slate-800 truncate">{photo.label}</p>
                : <p className="text-xs text-slate-500 italic truncate">{photo.originalName ?? photo.filename}</p>
              }
            </div>
            {!selectMode && (
              <div className="flex items-center gap-0.5 shrink-0">
                <button onClick={(e) => { e.stopPropagation(); onEdit(photo); }} className="p-1 rounded-md hover:bg-slate-200 text-slate-600 hover:text-slate-900 transition-colors" title="Edit"><Pencil size={13} /></button>
                <button onClick={(e) => { e.stopPropagation(); const a = document.createElement('a'); a.href = `/api/jobs/${photo.jobId}/photos/${photo.id}/download`; a.download = photo.originalName ?? photo.filename; a.click(); }} className="p-1 rounded-md hover:bg-slate-200 text-slate-600 hover:text-slate-900 transition-colors" title="Download"><Download size={13} /></button>
                <button onClick={(e) => { e.stopPropagation(); onDelete(photo); }} className="p-1 rounded-md hover:bg-red-100 text-slate-600 hover:text-red-700 transition-colors" title="Delete"><Trash2 size={13} /></button>
              </div>
            )}
          </div>
          {viewSize === 'large' && photo.uploadedByName && (
            <p className="text-[10px] text-slate-600 flex items-center gap-1 truncate"><User size={9} className="shrink-0" />{photo.uploadedByName}</p>
          )}
          <p className="text-[10px] text-slate-500 flex items-center gap-1 truncate"><Clock size={9} className="shrink-0" />{formatDateTime(photo.createdAt)}</p>
        </div>
      )}
    </div>
  );
});

// ── Main component ────────────────────────────────────────────────────────────

const JobPhotos = forwardRef<JobPhotosHandle, JobPhotosProps>(function JobPhotos(
  { jobId, onShareLink, onPhotoCount, onUploading, onSelectionChange },
  ref,
) {
  const [photos, setPhotos] = useState<JobPhoto[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [totalCount, setTotalCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  // Lightbox + EditModal are null until opened — zero DOM cost when closed
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [deleting, setDeleting] = useState<number | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<JobPhoto | null>(null);
  const [editPhoto, setEditPhoto] = useState<JobPhoto | null>(null);
  const [cacheBust, setCacheBust] = useState<Record<number, number>>({});
  const [summaryDismissed, setSummaryDismissed] = useState(false);

  // Over-limit batch dialog — shown when user selects > BATCH_LIMIT files
  const [overLimitFiles, setOverLimitFiles] = useState<File[] | null>(null);

  const [viewSize, setViewSizeState] = useState<ViewSize>(() => {
    try {
      const saved = localStorage.getItem('jobPhotosZoom');
      if (saved === 'small' || saved === 'medium' || saved === 'large') return saved;
    } catch (_) {}
    return 'medium';
  });

  const setViewSize = (s: ViewSize) => {
    setViewSizeState(s);
    try { localStorage.setItem('jobPhotosZoom', s); } catch (_) {}
  };

  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const fileInputRef   = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);
  // Guard against concurrent fetches
  const fetchingRef = useRef(false);

  // ── Upload queue ───────────────────────────────────────────────────────────

  const {
    queue,
    isUploading,
    uploadedCount,
    failedCount,
    pendingCount,
    totalCount: queueTotal,
    enqueueFiles,
    retryItem,
    removeItem,
    clearUploaded,
  } = usePhotoUploadQueue({
    jobId,
    onBatchComplete: (uploaded, _failed) => {
      if (uploaded > 0) {
        // Invalidate cache and reload first page
        photoCache.delete(jobId);
        void fetchPhotos(true);
      }
      setSummaryDismissed(false);
    },
  });

  useEffect(() => { onUploading?.(isUploading); }, [isUploading, onUploading]);

  // ── Fetch (first page or refresh) ─────────────────────────────────────────

  const fetchPhotos = useCallback(async (forceRefresh = false) => {
    if (!jobId || isNaN(jobId)) { setError('Invalid job ID'); setLoading(false); return; }
    if (fetchingRef.current) return;

    // Stale-while-revalidate: serve cache immediately, then refresh in background
    const cached = photoCache.get(jobId);
    const isStale = !cached || (Date.now() - cached.fetchedAt > CACHE_TTL_MS);

    if (cached && !forceRefresh) {
      devLog('Serving from cache', { jobId, count: cached.photos.length, stale: isStale });
      setPhotos(cached.photos);
      setHasMore(cached.hasMore);
      setNextCursor(cached.nextCursor);
      setTotalCount(cached.totalCount);
      onPhotoCount?.(cached.totalCount);
      setLoading(false);
      if (!isStale) return; // fresh — no background refetch needed
    }

    fetchingRef.current = true;
    const t0 = performance.now();

    try {
      const res = await fetch(`/api/jobs/${jobId}/photos?limit=${PAGE_SIZE}`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to load');
      const data = await res.json() as {
        photos: JobPhoto[];
        hasMore: boolean;
        nextCursor: string | null;
        totalCount: number;
      };
      const list = data.photos ?? [];
      const entry: CacheEntry = {
        photos: list,
        hasMore: data.hasMore ?? false,
        nextCursor: data.nextCursor ?? null,
        totalCount: data.totalCount ?? list.length,
        fetchedAt: Date.now(),
      };
      photoCache.set(jobId, entry);

      devLog('Fetched photos', {
        count: list.length,
        hasMore: entry.hasMore,
        totalCount: entry.totalCount,
        ms: Math.round(performance.now() - t0),
      });

      setPhotos(list);
      setHasMore(entry.hasMore);
      setNextCursor(entry.nextCursor);
      setTotalCount(entry.totalCount);
      onPhotoCount?.(entry.totalCount);
    } catch {
      setError('Failed to load photos');
    } finally {
      setLoading(false);
      fetchingRef.current = false;
    }
  }, [jobId, onPhotoCount]);

  useEffect(() => { void fetchPhotos(); }, [fetchPhotos]);

  // ── Load more (next page) ──────────────────────────────────────────────────

  const loadMore = useCallback(async () => {
    if (!hasMore || !nextCursor || loadingMore || fetchingRef.current) return;
    fetchingRef.current = true;
    setLoadingMore(true);
    const t0 = performance.now();
    try {
      const res = await fetch(
        `/api/jobs/${jobId}/photos?limit=${PAGE_SIZE}&cursor=${encodeURIComponent(nextCursor)}`,
        { credentials: 'include' }
      );
      if (!res.ok) throw new Error('Failed to load more');
      const data = await res.json() as {
        photos: JobPhoto[];
        hasMore: boolean;
        nextCursor: string | null;
        totalCount: number;
      };
      const newPhotos = data.photos ?? [];
      devLog('Loaded more', { count: newPhotos.length, ms: Math.round(performance.now() - t0) });

      setPhotos((prev) => {
        const merged = [...prev, ...newPhotos];
        // Update cache with full merged list
        const existing = photoCache.get(jobId);
        if (existing) {
          photoCache.set(jobId, {
            ...existing,
            photos: merged,
            hasMore: data.hasMore ?? false,
            nextCursor: data.nextCursor ?? null,
          });
        }
        return merged;
      });
      setHasMore(data.hasMore ?? false);
      setNextCursor(data.nextCursor ?? null);
    } catch {
      // Non-fatal — user can tap again
    } finally {
      setLoadingMore(false);
      fetchingRef.current = false;
    }
  }, [jobId, hasMore, nextCursor, loadingMore]);

  // ── Enqueue selected files ─────────────────────────────────────────────────

  /** Actually enqueue files — called after any over-limit confirmation */
  const enqueueValidated = useCallback((files: File[]) => {
    if (!jobId || isNaN(jobId)) { setUploadError('Invalid job ID — cannot upload.'); return; }
    if (files.length === 0) return;
    const atLimit = totalCount >= MAX_PHOTOS;
    if (atLimit) { setUploadError(`Photo limit reached (${MAX_PHOTOS}). Delete some first.`); return; }
    const remaining = MAX_PHOTOS - totalCount;
    const toAdd = files.slice(0, remaining);
    if (toAdd.length < files.length) {
      setUploadError(`Only ${remaining} photo${remaining === 1 ? '' : 's'} can be added. Uploading first ${remaining}.`);
    }
    setSummaryDismissed(false);
    enqueueFiles(toAdd);
  }, [jobId, totalCount, enqueueFiles]);

  const doUpload = useCallback((files: FileList | File[]) => {
    if (!jobId || isNaN(jobId)) { setUploadError('Invalid job ID — cannot upload.'); return; }
    const arr = Array.from(files);
    if (arr.length === 0) return;
    // If user selected more than BATCH_LIMIT, show friendly dialog
    if (arr.length > BATCH_LIMIT) {
      setOverLimitFiles(arr);
      return;
    }
    enqueueValidated(arr);
  }, [jobId, enqueueValidated]);

  // ── Delete ─────────────────────────────────────────────────────────────────

  const confirmDelete = async () => {
    if (!deleteConfirm) return;
    setDeleting(deleteConfirm.id);
    try {
      const res = await fetch(`/api/jobs/${jobId}/photos/${deleteConfirm.id}`, { method: 'DELETE', credentials: 'include' });
      if (!res.ok) throw new Error('Delete failed');
      if (lightboxIndex !== null && photos[lightboxIndex]?.id === deleteConfirm.id) setLightboxIndex(null);
      setDeleteConfirm(null);
      setSelected((prev) => { const n = new Set(prev); n.delete(deleteConfirm.id); return n; });
      // Remove from local state immediately; invalidate cache
      setPhotos((prev) => prev.filter((p) => p.id !== deleteConfirm.id));
      setTotalCount((c) => Math.max(0, c - 1));
      photoCache.delete(jobId);
    } catch { setError('Failed to delete photo'); }
    finally { setDeleting(null); }
  };

  // ── Edit saved ─────────────────────────────────────────────────────────────

  const handleEditSaved = (updated: JobPhoto) => {
    setPhotos((prev) => prev.map((p) => p.id === updated.id ? updated : p));
    setCacheBust((prev) => ({ ...prev, [updated.id]: Date.now() }));
    if (editPhoto?.id === updated.id) setEditPhoto(updated);
    // Invalidate cache so next visit gets fresh data
    photoCache.delete(jobId);
  };

  // ── Select helpers ─────────────────────────────────────────────────────────

  const toggleSelect = useCallback((id: number) => {
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      onSelectionChange?.(n.size);
      return n;
    });
  }, [onSelectionChange]);

  const exitSelectMode = useCallback(() => {
    setSelectMode(false);
    setSelected(new Set());
    onSelectionChange?.(0);
  }, [onSelectionChange]);

  const downloadSelected = useCallback(() => {
    const targets = photos.filter((p) => selected.has(p.id));
    targets.forEach((p, i) => {
      setTimeout(() => {
        const a = document.createElement('a');
        a.href = `/api/jobs/${p.jobId}/photos/${p.id}/download`;
        a.download = p.originalName ?? p.filename;
        a.click();
      }, i * 300);
    });
  }, [photos, selected]);

  // ── Share link ─────────────────────────────────────────────────────────────

  const generateShareLink = useCallback(async () => {
    try {
      const res = await fetch(`/api/jobs/${jobId}/photos/share`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json() as { shareUrl?: string; error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Failed to generate link');
      if (data.shareUrl && onShareLink) onShareLink(data.shareUrl);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to generate share link');
    }
  }, [jobId, onShareLink]);

  // ── Drag & drop ────────────────────────────────────────────────────────────

  const handleDrop = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files.length > 0) doUpload(e.dataTransfer.files);
  }, [doUpload]);

  // ── Imperative handle ──────────────────────────────────────────────────────

  useImperativeHandle(ref, () => ({
    openFilePicker: () => fileInputRef.current?.click(),
    openCamera: () => cameraInputRef.current?.click(),
    generateShareLink: () => void generateShareLink(),
    setViewSize,
    get viewSize() { return viewSize; },
    get selectMode() { return selectMode; },
    setSelectMode,
    get selectedCount() { return selected.size; },
    get photoCount() { return totalCount; },
    get uploading() { return isUploading; },
    downloadSelected,
    exitSelectMode,
  }), [viewSize, selectMode, selected.size, totalCount, isUploading, generateShareLink, downloadSelected, exitSelectMode]);

  // ── Render ─────────────────────────────────────────────────────────────────

  const atLimit = totalCount >= MAX_PHOTOS;
  const remaining = MAX_PHOTOS - totalCount;
  const hasPendingCards = queue.length > 0;

  return (
    <div
      className="flex flex-col gap-3"
      onDragOver={(e) => { e.preventDefault(); }}
      onDrop={handleDrop}
    >
      {/* Photo count hint when near limit */}
      {!atLimit && remaining <= 20 && totalCount > 0 && (
        <p className="text-xs text-amber-600 font-semibold">{totalCount} / {MAX_PHOTOS} photos · {remaining} remaining</p>
      )}
      {atLimit && (
        <p className="text-xs text-red-500 font-semibold">{MAX_PHOTOS} / {MAX_PHOTOS} photos — limit reached. Delete photos to upload more.</p>
      )}

      {/* Errors */}
      {uploadError && (
        <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
          <AlertCircle size={15} className="shrink-0 mt-0.5" />
          <span className="flex-1">{uploadError}</span>
          <button onClick={() => setUploadError(null)} className="text-red-400 hover:text-red-600 shrink-0 text-base leading-none">&times;</button>
        </div>
      )}
      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
          <AlertCircle size={15} className="shrink-0" /> {error}
          <button onClick={() => setError(null)} className="ml-auto text-red-400 hover:text-red-600 text-base leading-none">&times;</button>
        </div>
      )}

      {/* Batch upload summary */}
      {!summaryDismissed && (
        <BatchUploadSummary
          totalCount={queueTotal}
          pendingCount={pendingCount}
          uploadedCount={uploadedCount}
          failedCount={failedCount}
          isUploading={isUploading}
          onDismiss={() => { setSummaryDismissed(true); clearUploaded(); }}
        />
      )}

      {/* Pending upload tray */}
      {hasPendingCards && (
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold text-slate-600">
              {isUploading ? 'Uploading…' : 'Upload queue'}
            </p>
            {!isUploading && (
              <button
                onClick={() => { clearUploaded(); setSummaryDismissed(true); }}
                className="text-[11px] text-slate-600 hover:text-slate-800 font-semibold transition-colors"
              >
                Clear done
              </button>
            )}
          </div>
          <div className={`grid ${VIEW_GAP[viewSize]} ${VIEW_COLS[viewSize]}`}>
            {queue.map((item) => (
              <PendingPhotoCard
                key={item.clientId}
                item={item}
                onRetry={retryItem}
                onRemove={removeItem}
              />
            ))}
          </div>
        </div>
      )}

      {/* Loading skeleton */}
      {loading && (
        <div className={`grid ${VIEW_GAP[viewSize]} ${VIEW_COLS[viewSize]}`}>
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className={`${VIEW_RADIUS[viewSize]} overflow-hidden bg-slate-100 border border-slate-200 animate-pulse`}>
              <div className="aspect-square bg-slate-200" />
              {viewSize !== 'small' && (
                <div className="px-2.5 py-2 bg-white border-t border-slate-100">
                  <div className="h-3 bg-slate-200 rounded w-3/4" />
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Empty state */}
      {!loading && photos.length === 0 && !hasPendingCards && (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <ImageOff size={32} className="text-slate-300 mb-3" />
          <p className="text-sm font-semibold text-slate-500">No photos yet</p>
          <p className="text-xs text-slate-400 mt-1">Upload photos from your device or take one with your camera.</p>
        </div>
      )}

      {/* Photo grid — plain div grid, no AnimatePresence (perf on mobile) */}
      {!loading && photos.length > 0 && (
        <>
          {selectMode && (
            <div className="flex items-center gap-2">
              <button onClick={() => {
                if (selected.size === photos.length) setSelected(new Set());
                else setSelected(new Set(photos.map((p) => p.id)));
              }} className="flex items-center gap-1.5 px-3 py-1.5 border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-600 rounded-lg transition-colors">
                {selected.size === photos.length ? <CheckSquare size={13} className="text-primary" /> : <Square size={13} />}
                {selected.size === photos.length ? 'Deselect all' : 'Select all'}
              </button>
              <p className="text-xs text-slate-500 font-semibold ml-1">
                {selected.size === 0 ? 'Tap photos to select' : `${selected.size} of ${photos.length} selected`}
              </p>
            </div>
          )}

          <div className={`grid ${VIEW_GAP[viewSize]} ${VIEW_COLS[viewSize]}`}>
            {photos.map((photo, i) => (
              <PhotoCard
                key={photo.id}
                photo={photo}
                index={i}
                viewSize={viewSize}
                isSelected={selected.has(photo.id)}
                selectMode={selectMode}
                bust={cacheBust[photo.id]}
                onTap={setLightboxIndex}
                onToggleSelect={toggleSelect}
                onEdit={setEditPhoto}
                onDelete={setDeleteConfirm}
              />
            ))}
          </div>

          {/* Load more */}
          {hasMore && (
            <div className="flex flex-col items-center gap-1 pt-2">
              <button
                onClick={loadMore}
                disabled={loadingMore}
                className="flex items-center gap-2 px-5 py-2.5 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 text-sm font-semibold text-slate-700 rounded-xl transition-colors"
              >
                {loadingMore ? <Loader2 size={14} className="animate-spin" /> : null}
                {loadingMore ? 'Loading…' : `Load more (${totalCount - photos.length} remaining)`}
              </button>
            </div>
          )}
        </>
      )}

      {/* Lightbox — only mounted when open */}
      {lightboxIndex !== null && !selectMode && (
        <Lightbox
          photos={photos}
          index={lightboxIndex}
          cacheBust={cacheBust}
          onClose={() => setLightboxIndex(null)}
          onNavigate={setLightboxIndex}
          onDelete={(p) => setDeleteConfirm(p)}
          onEdit={(p) => setEditPhoto(p)}
          deleting={deleting}
        />
      )}

      {/* Edit modal — only mounted when open */}
      {editPhoto && (
        <EditModal
          photo={editPhoto}
          cacheBust={cacheBust}
          onClose={() => setEditPhoto(null)}
          onSaved={handleEditSaved}
        />
      )}

      {/* File inputs */}
      <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden"
        onChange={(e) => { if (e.target.files && !atLimit) doUpload(e.target.files); e.target.value = ''; }} />
      <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="hidden"
        onChange={(e) => { if (e.target.files && !atLimit) doUpload(e.target.files); e.target.value = ''; }} />

      {/* Over-limit batch dialog */}
      <AnimatePresence>
        {overLimitFiles && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/60" onClick={() => setOverLimitFiles(null)} />
            <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.96 }} transition={{ duration: 0.14 }}
              className="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm p-6">
              <h3 className="font-heading font-bold text-base text-slate-900 mb-2">
                Too many photos selected
              </h3>
              <p className="text-sm text-slate-500 mb-5">
                You selected <span className="font-semibold text-slate-700">{overLimitFiles.length} photos</span>. Upload up to {BATCH_LIMIT} at a time to keep things fast and reliable.
              </p>
              <div className="flex flex-col gap-2">
                <button
                  onClick={() => { const files = overLimitFiles.slice(0, BATCH_LIMIT); setOverLimitFiles(null); enqueueValidated(files); }}
                  className="w-full py-2.5 bg-slate-900 hover:bg-slate-700 text-white text-sm font-semibold rounded-xl transition-colors"
                >
                  Upload first {BATCH_LIMIT}
                </button>
                <button
                  onClick={() => { setOverLimitFiles(null); fileInputRef.current?.click(); }}
                  className="w-full py-2.5 border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-sm font-semibold rounded-xl transition-colors"
                >
                  Choose again
                </button>
                <button
                  onClick={() => setOverLimitFiles(null)}
                  className="w-full py-2 text-sm font-semibold text-slate-400 hover:text-slate-600 transition-colors"
                >
                  Cancel
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Delete confirm */}
      <AnimatePresence>
        {deleteConfirm && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/60" onClick={() => setDeleteConfirm(null)} />
            <motion.div initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.96 }} transition={{ duration: 0.12 }}
              className="relative bg-white rounded-xl shadow-2xl w-full max-w-sm p-6">
              <h3 className="font-heading font-bold text-base text-slate-900 mb-2">Delete Photo?</h3>
              <p className="text-sm text-slate-500 mb-6">
                {deleteConfirm.label ? <><span className="font-semibold text-slate-700">"{deleteConfirm.label}"</span> will be permanently deleted.</> : 'This photo will be permanently deleted.'} This cannot be undone.
              </p>
              <div className="flex gap-3 justify-end">
                <button onClick={() => setDeleteConfirm(null)} className="px-4 py-2 text-sm font-semibold text-slate-600 hover:text-slate-800 transition-colors">Cancel</button>
                <button onClick={confirmDelete} disabled={deleting !== null} className="px-5 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-sm font-semibold rounded-lg transition-colors">
                  {deleting !== null ? 'Deleting…' : 'Delete'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
});

export default JobPhotos;
