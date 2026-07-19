import { useState, useEffect, useRef, useCallback, forwardRef, useImperativeHandle } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Camera,
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
  LayoutGrid,
  List,
  CheckSquare,
  Square,
  Share2,
  Send,
} from 'lucide-react';

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
  /** Signed URL from the server — use this for <img src> */
  url: string | null;
}

interface JobPhotosProps {
  jobId: number;
  /** Called when a share link is generated so the parent can show it */
  onShareLink?: (url: string) => void;
  /** Called whenever photo count changes so the parent can update its UI */
  onPhotoCount?: (count: number) => void;
  /** Called when uploading state changes */
  onUploading?: (uploading: boolean) => void;
  /** Called when selection changes (count of selected items) */
  onSelectionChange?: (count: number) => void;
}

/** Imperative handle exposed to the parent via ref */
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

// ── Helpers ───────────────────────────────────────────────────────────────────

function photoUrl(photo: JobPhoto) {
  if (photo.url) return photo.url;
  return `/airo-assets/uploads/job-photos/${photo.filename}`;
}

function photoUrlBusted(photo: JobPhoto, bust?: number) {
  const base = photoUrl(photo);
  return bust ? `${base}?v=${bust}` : base;
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

const HEIC_EXTS = ['heic', 'heif'];
const HEIC_MIMES = ['image/heic', 'image/heif', 'image/heic-sequence', 'image/heif-sequence'];
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

/**
 * Convert any image File to a JPEG via an off-screen canvas.
 * - iOS Safari can decode HEIC natively via createImageBitmap
 * - Also resizes to max 1920px on the longest side
 */
async function normaliseToJpeg(file: File): Promise<File> {
  const MAX_PX = 1920;
  const QUALITY = 0.88;
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return file; // browser can't decode — return original unchanged
  }
  let { width, height } = bitmap;
  if (width > MAX_PX || height > MAX_PX) {
    if (width >= height) { height = Math.round((height / width) * MAX_PX); width = MAX_PX; }
    else                 { width  = Math.round((width  / height) * MAX_PX); height = MAX_PX; }
  }
  const canvas = document.createElement('canvas');
  canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return file;
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  return new Promise<File>((resolve) => {
    canvas.toBlob((blob) => {
      if (!blob) { resolve(file); return; }
      const stem = file.name.replace(/\.[^.]+$/, '');
      resolve(new File([blob], `${stem}.jpg`, { type: 'image/jpeg', lastModified: Date.now() }));
    }, 'image/jpeg', QUALITY);
  });
}

/**
 * Async pre-process: convert HEIC→JPEG, resize oversized images.
 * Used for the main upload flow.
 */
async function prepareFiles(files: File[]): Promise<{ valid: File[]; error: string | null }> {
  if (files.length > 10) return { valid: [], error: 'Maximum 10 photos per upload.' };
  const prepared: File[] = [];
  for (const f of files) {
    const ext = f.name.split('.').pop()?.toLowerCase() ?? '';
    const isHeic = HEIC_EXTS.includes(ext) || HEIC_MIMES.includes(f.type);
    if (isHeic) {
      const converted = await normaliseToJpeg(f);
      if (converted.type !== 'image/jpeg') {
        return { valid: [], error: `"${f.name}" is a HEIC/HEIF file. On Android, set your camera to JPEG mode: Camera Settings → Formats → Most Compatible.` };
      }
      prepared.push(converted);
      continue;
    }
    if (!ALLOWED_TYPES.includes(f.type) && f.type !== '') {
      return { valid: [], error: `"${f.name}" is not a supported image type. Use JPEG, PNG, or WebP.` };
    }
    // Normalise (resize if oversized) — fall back to original if canvas fails
    try {
      prepared.push(await normaliseToJpeg(f));
    } catch {
      prepared.push(f);
    }
  }
  return { valid: prepared, error: null };
}

// Sync validate for single-file replace flow
function validateFiles(files: File[]): { valid: File[]; error: string | null } {
  for (const f of files) {
    const ext = f.name.split('.').pop()?.toLowerCase() ?? '';
    if (HEIC_EXTS.includes(ext) || HEIC_MIMES.includes(f.type)) {
      return { valid: [], error: `HEIC/HEIF not supported here. Convert "${f.name}" to JPEG first.` };
    }
    if (!ALLOWED_TYPES.includes(f.type) && f.type !== '') {
      return { valid: [], error: `"${f.name}" is not a supported image type. Use JPEG, PNG, or WebP.` };
    }
  }
  if (files.length > 10) return { valid: [], error: 'Maximum 10 photos per upload.' };
  return { valid: files, error: null };
}

const VIEW_COLS: Record<ViewSize, string> = {
  small:  'grid-cols-3 sm:grid-cols-4 md:grid-cols-5',
  medium: 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4',
  large:  'grid-cols-1 sm:grid-cols-2',
};

// ── Edit Modal ────────────────────────────────────────────────────────────────

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
    const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
    if (ext === 'heic' || ext === 'heif') { setError('HEIC/HEIF not supported — convert to JPEG first.'); return; }
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
          <img key={localBust} src={photoUrlBusted(photo, localBust)} alt={photo.label ?? photo.originalName ?? 'Photo'} className="max-w-full max-h-full object-contain" />
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
            <input ref={replaceRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden"
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

// ── Lightbox ──────────────────────────────────────────────────────────────────

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
        <img key={bust ?? photo.filename} src={photoUrlBusted(photo, bust)} alt={photo.label ?? photo.originalName ?? 'Job photo'} className="max-w-full max-h-[72vh] object-contain rounded-lg shadow-2xl" />
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

// ── Main component ────────────────────────────────────────────────────────────

const MAX_PHOTOS = 200;

const JobPhotos = forwardRef<JobPhotosHandle, JobPhotosProps>(function JobPhotos(
  { jobId, onShareLink, onPhotoCount, onUploading, onSelectionChange },
  ref,
) {
  const [photos, setPhotos] = useState<JobPhoto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [deleting, setDeleting] = useState<number | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<JobPhoto | null>(null);
  const [editPhoto, setEditPhoto] = useState<JobPhoto | null>(null);
  const [cacheBust, setCacheBust] = useState<Record<number, number>>({});

  const [viewSize, setViewSize] = useState<ViewSize>('medium');
  const [selectMode, setSelectMode] = useState(false);
  const [selected, setSelected] = useState<Set<number>>(new Set());

  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  // ── Fetch ──────────────────────────────────────────────────────────────────

  const fetchPhotos = useCallback(async () => {
    if (!jobId || isNaN(jobId)) { setError('Invalid job ID'); setLoading(false); return; }
    try {
      const res = await fetch(`/api/jobs/${jobId}/photos`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to load');
      const data = await res.json() as { photos: JobPhoto[] };
      const list = data.photos ?? [];
      setPhotos(list);
      onPhotoCount?.(list.length);
    } catch { setError('Failed to load photos'); }
    finally { setLoading(false); }
  }, [jobId, onPhotoCount]);

  useEffect(() => { void fetchPhotos(); }, [fetchPhotos]);

  // ── Upload ─────────────────────────────────────────────────────────────────

  const doUpload = async (files: FileList | File[]) => {
    if (!jobId || isNaN(jobId)) { setUploadError('Invalid job ID — cannot upload.'); return; }
    const arr = Array.from(files);
    if (arr.length === 0) return;
    setUploading(true); onUploading?.(true); setUploadError(null);
    let valid: File[];
    try {
      const result = await prepareFiles(arr);
      if (result.error) { setUploadError(result.error); setUploading(false); onUploading?.(false); return; }
      valid = result.valid;
    } catch {
      setUploadError('Failed to process images. Please try again.');
      setUploading(false); onUploading?.(false); return;
    }
    if (photos.length >= MAX_PHOTOS) { setUploadError(`Photo limit reached (${MAX_PHOTOS}). Delete some first.`); setUploading(false); onUploading?.(false); return; }
    if (photos.length + valid.length > MAX_PHOTOS) {
      const rem = MAX_PHOTOS - photos.length;
      setUploadError(`Only ${rem} photo${rem === 1 ? '' : 's'} can be added. Select fewer files.`);
      setUploading(false); onUploading?.(false); return;
    }
    const fd = new FormData();
    valid.forEach((f) => fd.append('photos', f));
    try {
      const res = await fetch(`/api/jobs/${jobId}/photos`, { method: 'POST', credentials: 'include', body: fd });
      let data: { error?: string } = {};
      const ct = res.headers.get('content-type') ?? '';
      if (ct.includes('application/json')) {
        data = await res.json() as { error?: string };
      } else {
        const text = await res.text();
        throw new Error(text.includes('<!') ? `Server error (${res.status}) — please try again` : text || `Upload failed (${res.status})`);
      }
      if (!res.ok) throw new Error(data.error ?? `Upload failed (${res.status})`);
      await fetchPhotos();
    } catch (e) { setUploadError(e instanceof Error ? e.message : 'Upload failed — please try again'); }
    finally {
      setUploading(false); onUploading?.(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
      if (cameraInputRef.current) cameraInputRef.current.value = '';
    }
  };

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
      await fetchPhotos();
    } catch { setError('Failed to delete photo'); }
    finally { setDeleting(null); }
  };

  // ── Edit saved ─────────────────────────────────────────────────────────────

  const handleEditSaved = (updated: JobPhoto) => {
    setPhotos((prev) => prev.map((p) => p.id === updated.id ? updated : p));
    setCacheBust((prev) => ({ ...prev, [updated.id]: Date.now() }));
    if (editPhoto?.id === updated.id) setEditPhoto(updated);
  };

  // ── Select helpers ─────────────────────────────────────────────────────────

  const toggleSelect = (id: number) => {
    setSelected((prev) => {
      const n = new Set(prev);
      if (n.has(id)) n.delete(id); else n.add(id);
      onSelectionChange?.(n.size);
      return n;
    });
  };

  const exitSelectMode = useCallback(() => {
    setSelectMode(false);
    setSelected(new Set());
    onSelectionChange?.(0);
  }, [onSelectionChange]);

  // ── Download selected ──────────────────────────────────────────────────────

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
    if (e.dataTransfer.files.length > 0) void doUpload(e.dataTransfer.files);
  }, [doUpload]); // eslint-disable-line react-hooks/exhaustive-deps

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
    get photoCount() { return photos.length; },
    get uploading() { return uploading; },
    downloadSelected,
    exitSelectMode,
  }), [viewSize, selectMode, selected.size, photos.length, uploading, generateShareLink, downloadSelected, exitSelectMode]);

  // ── Render ─────────────────────────────────────────────────────────────────

  const atLimit = photos.length >= MAX_PHOTOS;
  const remaining = MAX_PHOTOS - photos.length;

  return (
    <div
      className="flex flex-col gap-3"
      onDragOver={(e) => { e.preventDefault(); }}
      onDrop={handleDrop}
    >
      {/* Photo count hint when near limit */}
      {!atLimit && remaining <= 20 && photos.length > 0 && (
        <p className="text-xs text-amber-600 font-semibold">{photos.length} / {MAX_PHOTOS} photos · {remaining} remaining</p>
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

      {/* Loading */}
      {loading && <div className="flex items-center justify-center py-10"><Loader2 size={22} className="animate-spin text-primary" /></div>}

      {/* Empty */}
      {!loading && photos.length === 0 && (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <ImageOff size={32} className="text-slate-300 mb-3" />
          <p className="text-sm font-semibold text-slate-500">No photos yet</p>
          <p className="text-xs text-slate-400 mt-1">Upload photos from your device or take one with your camera.</p>
        </div>
      )}

      {/* ── Photo grid ── */}
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
          <div className={`grid gap-3 ${VIEW_COLS[viewSize]}`}>
            <AnimatePresence>
              {photos.map((photo, i) => {
                const bust = cacheBust[photo.id];
                const isSelected = selected.has(photo.id);
                return (
                  <motion.div
                    key={photo.id} layout
                    initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }} transition={{ duration: 0.15 }}
                    className={`group relative flex flex-col rounded-xl overflow-hidden bg-slate-100 border transition-all ${
                      isSelected ? 'border-primary ring-2 ring-primary/30' : 'border-slate-200'
                    }`}
                  >
                    {/* Thumbnail */}
                    <div
                      className="relative aspect-square cursor-pointer"
                      onClick={() => selectMode ? toggleSelect(photo.id) : setLightboxIndex(i)}
                    >
                      <img
                        key={bust ?? photo.filename}
                        src={photoUrlBusted(photo, bust)}
                        alt={photo.label ?? photo.originalName ?? 'Job photo'}
                        className="w-full h-full object-cover"
                        loading="lazy"
                      />
                      {/* Select overlay */}
                      {selectMode && (
                        <div className={`absolute inset-0 transition-colors ${isSelected ? 'bg-primary/20' : 'bg-black/0 hover:bg-black/10'}`}>
                          <div className={`absolute top-2 left-2 w-5 h-5 rounded-full border-2 flex items-center justify-center transition-all ${
                            isSelected ? 'bg-primary border-primary' : 'bg-white/80 border-white'
                          }`}>
                            {isSelected && <Check size={11} className="text-white" strokeWidth={3} />}
                          </div>
                        </div>
                      )}
                      {/* Hover overlay (non-select mode) */}
                      {!selectMode && <div className="absolute inset-0 bg-black/0 group-hover:bg-black/10 transition-colors pointer-events-none" />}
                    </div>

                    {/* Metadata strip — hidden in small view */}
                    {viewSize !== 'small' && (
                      <div className="px-2.5 py-2 bg-white border-t border-slate-100 flex flex-col gap-0.5">
                        <div className="flex items-start justify-between gap-1">
                          <div className="min-w-0 flex-1">
                            {photo.label
                              ? <p className="text-xs font-semibold text-slate-800 truncate">{photo.label}</p>
                              : <p className="text-xs text-slate-400 italic truncate">{photo.originalName ?? photo.filename}</p>
                            }
                          </div>
                          {!selectMode && (
                            <div className="flex items-center gap-0.5 shrink-0">
                              <button onClick={(e) => { e.stopPropagation(); setEditPhoto(photo); }} className="p-1 rounded-md hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors" title="Edit"><Pencil size={13} /></button>
                              <button onClick={(e) => { e.stopPropagation(); const a = document.createElement('a'); a.href = `/api/jobs/${photo.jobId}/photos/${photo.id}/download`; a.download = photo.originalName ?? photo.filename; a.click(); }} className="p-1 rounded-md hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors" title="Download"><Download size={13} /></button>
                              <button onClick={(e) => { e.stopPropagation(); setDeleteConfirm(photo); }} className="p-1 rounded-md hover:bg-red-50 text-slate-400 hover:text-red-600 transition-colors" title="Delete"><Trash2 size={13} /></button>
                            </div>
                          )}
                        </div>
                        {photo.uploadedByName && (
                          <p className="text-[10px] text-slate-500 flex items-center gap-1 truncate"><User size={9} className="shrink-0" />{photo.uploadedByName}</p>
                        )}
                        <p className="text-[10px] text-slate-400 flex items-center gap-1 truncate"><Clock size={9} className="shrink-0" />{formatDateTime(photo.createdAt)}</p>
                      </div>
                    )}
                  </motion.div>
                );
              })}
            </AnimatePresence>
          </div>
        </>
      )}

      {/* Lightbox */}
      <AnimatePresence>
        {lightboxIndex !== null && !selectMode && (
          <Lightbox photos={photos} index={lightboxIndex} cacheBust={cacheBust}
            onClose={() => setLightboxIndex(null)} onNavigate={setLightboxIndex}
            onDelete={(p) => setDeleteConfirm(p)} onEdit={(p) => setEditPhoto(p)} deleting={deleting} />
        )}
      </AnimatePresence>

      {/* Edit modal */}
      <AnimatePresence>
        {editPhoto && (
          <EditModal photo={editPhoto} cacheBust={cacheBust} onClose={() => setEditPhoto(null)} onSaved={handleEditSaved} />
        )}
      </AnimatePresence>

      {/* File inputs */}
      <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden"
        onChange={(e) => { if (e.target.files && !atLimit) void doUpload(e.target.files); }} />
      <input ref={cameraInputRef} type="file" accept="image/*" capture="environment" className="hidden"
        onChange={(e) => { if (e.target.files && !atLimit) void doUpload(e.target.files); }} />

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