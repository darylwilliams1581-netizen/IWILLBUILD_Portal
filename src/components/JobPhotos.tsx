import { useState, useEffect, useRef, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Camera,
  Upload,
  X,
  Download,
  Trash2,
  ZoomIn,
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
}

interface JobPhotosProps {
  jobId: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function photoUrl(filename: string) {
  return `/airo-assets/uploads/job-photos/${filename}`;
}

// Cache-bust after rotation so the browser re-fetches the updated file
function photoUrlBusted(filename: string, bust?: number) {
  const base = photoUrl(filename);
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
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const HEIC_EXTS = ['heic', 'heif'];
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];

function validateFiles(files: File[]): { valid: File[]; error: string | null } {
  for (const f of files) {
    const ext = f.name.split('.').pop()?.toLowerCase() ?? '';
    if (HEIC_EXTS.includes(ext)) {
      return {
        valid: [],
        error: `HEIC/HEIF files are not supported. Please convert "${f.name}" to JPEG or PNG before uploading.`,
      };
    }
    if (!ALLOWED_TYPES.includes(f.type) && f.type !== '') {
      return {
        valid: [],
        error: `"${f.name}" is not a supported image type. Please upload JPEG, PNG, WebP, or GIF.`,
      };
    }
  }
  if (files.length > 10) {
    return { valid: [], error: 'Maximum 10 photos per upload.' };
  }
  return { valid: files, error: null };
}

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
  const [error, setError] = useState('');
  // Local bust counter so the preview refreshes after each rotation
  const [localBust, setLocalBust] = useState(cacheBust[photo.id] ?? Date.now());

  async function doRotate(dir: 'left' | 'right') {
    setRotating(dir);
    setError('');
    try {
      const res = await fetch(`/api/jobs/${photo.jobId}/photos/${photo.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ rotate: dir }),
      });
      const data = await res.json() as { ok?: boolean; photo?: JobPhoto; error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Rotation failed');
      const newBust = Date.now();
      setLocalBust(newBust);
      if (data.photo) onSaved({ ...data.photo, label: label || data.photo.label });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Rotation failed');
    } finally {
      setRotating(null);
    }
  }

  async function doSave() {
    setSaving(true);
    setError('');
    try {
      const res = await fetch(`/api/jobs/${photo.jobId}/photos/${photo.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ label }),
      });
      const data = await res.json() as { ok?: boolean; photo?: JobPhoto; error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Save failed');
      if (data.photo) onSaved(data.photo);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  // Close on Escape
  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  const busy = saving || rotating !== null;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 8 }}
        transition={{ duration: 0.15 }}
        className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h3 className="font-heading font-bold text-base text-slate-900">Edit Photo</h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground">
            <X size={16} />
          </button>
        </div>

        {/* Preview */}
        <div className="bg-slate-100 flex items-center justify-center" style={{ height: 220 }}>
          <img
            key={localBust}
            src={photoUrlBusted(photo.filename, localBust)}
            alt={photo.label ?? photo.originalName ?? 'Photo'}
            className="max-w-full max-h-full object-contain"
          />
        </div>

        {/* Rotation controls */}
        <div className="flex items-center justify-center gap-3 px-5 py-3 border-b border-border bg-slate-50">
          <span className="text-xs font-semibold text-muted-foreground mr-1">Rotate:</span>
          <button
            onClick={() => doRotate('left')}
            disabled={busy}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-white hover:bg-muted text-xs font-semibold text-slate-700 disabled:opacity-40 transition-colors"
          >
            {rotating === 'left' ? <Loader2 size={13} className="animate-spin" /> : <RotateCcw size={13} />}
            Left 90°
          </button>
          <button
            onClick={() => doRotate('right')}
            disabled={busy}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border bg-white hover:bg-muted text-xs font-semibold text-slate-700 disabled:opacity-40 transition-colors"
          >
            {rotating === 'right' ? <Loader2 size={13} className="animate-spin" /> : <RotateCw size={13} />}
            Right 90°
          </button>
        </div>

        {/* Label */}
        <div className="px-5 py-4 flex flex-col gap-3">
          {error && (
            <p className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2 flex items-center gap-2">
              <AlertCircle size={12} /> {error}
            </p>
          )}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">Caption / Label</label>
            <input
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. North wall framing"
              className="w-full px-3 py-2.5 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors"
              onKeyDown={(e) => { if (e.key === 'Enter' && !busy) doSave(); }}
            />
          </div>

          {/* Metadata */}
          <div className="flex flex-col gap-1 pt-1">
            {photo.uploadedByName && (
              <p className="text-xs text-muted-foreground flex items-center gap-1.5">
                <User size={11} className="shrink-0" />
                Uploaded by <span className="font-semibold text-slate-700">{photo.uploadedByName}</span>
              </p>
            )}
            <p className="text-xs text-muted-foreground flex items-center gap-1.5">
              <Clock size={11} className="shrink-0" />
              {formatDateTime(photo.createdAt)}
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-5 py-4 border-t border-border bg-slate-50">
          <button
            onClick={onClose}
            disabled={busy}
            className="px-4 py-2 text-sm font-semibold text-slate-600 hover:text-slate-800 disabled:opacity-40 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={doSave}
            disabled={busy}
            className="flex items-center gap-1.5 px-5 py-2 bg-slate-900 hover:bg-slate-700 disabled:opacity-40 text-white text-sm font-semibold rounded-lg transition-colors"
          >
            {saving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
            Save
          </button>
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

  const handleDownload = () => {
    const a = document.createElement('a');
    a.href = `/api/jobs/${photo.jobId}/photos/${photo.id}/download`;
    a.download = photo.originalName ?? photo.filename;
    a.click();
  };

  const bust = cacheBust[photo.id];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/92">
      <div className="absolute inset-0" onClick={onClose} />

      {/* Controls top-right */}
      <div className="absolute top-4 right-4 flex items-center gap-2 z-10">
        <button
          onClick={(e) => { e.stopPropagation(); onEdit(photo); }}
          className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors"
          title="Edit photo"
        >
          <Pencil size={16} />
        </button>
        <button
          onClick={handleDownload}
          className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors"
          title="Download"
        >
          <Download size={16} />
        </button>
        <button
          onClick={() => onDelete(photo)}
          disabled={deleting === photo.id}
          className="p-2 rounded-lg bg-white/10 hover:bg-red-500/80 text-white transition-colors disabled:opacity-50"
          title="Delete"
        >
          {deleting === photo.id ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />}
        </button>
        <button
          onClick={onClose}
          className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors"
          title="Close"
        >
          <X size={16} />
        </button>
      </div>

      {/* Prev */}
      {index > 0 && (
        <button
          onClick={(e) => { e.stopPropagation(); onNavigate(index - 1); }}
          className="absolute left-4 top-1/2 -translate-y-1/2 z-10 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
        >
          <ChevronLeft size={24} />
        </button>
      )}

      {/* Image */}
      <div className="relative z-10 max-w-[90vw] max-h-[85vh] flex flex-col items-center gap-3">
        <img
          key={bust ?? photo.filename}
          src={photoUrlBusted(photo.filename, bust)}
          alt={photo.label ?? photo.originalName ?? 'Job photo'}
          className="max-w-full max-h-[72vh] object-contain rounded-lg shadow-2xl"
        />
        <div className="text-center">
          {photo.label && <p className="text-white font-semibold text-sm mb-0.5">{photo.label}</p>}
          <p className="text-white/50 text-xs">
            {photo.originalName ?? photo.filename}
            {photo.sizeBytes ? ` · ${formatBytes(photo.sizeBytes)}` : ''}
          </p>
          {photo.uploadedByName && (
            <p className="text-white/40 text-xs mt-0.5">
              {photo.uploadedByName} · {formatDateTime(photo.createdAt)}
            </p>
          )}
          <p className="text-white/25 text-xs mt-0.5">{index + 1} / {photos.length}</p>
        </div>
      </div>

      {/* Next */}
      {index < photos.length - 1 && (
        <button
          onClick={(e) => { e.stopPropagation(); onNavigate(index + 1); }}
          className="absolute right-4 top-1/2 -translate-y-1/2 z-10 p-2 rounded-full bg-white/10 hover:bg-white/20 text-white transition-colors"
        >
          <ChevronRight size={24} />
        </button>
      )}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function JobPhotos({ jobId }: JobPhotosProps) {
  const [photos, setPhotos] = useState<JobPhoto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [label, setLabel] = useState('');
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const [deleting, setDeleting] = useState<number | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState<JobPhoto | null>(null);
  const [editPhoto, setEditPhoto] = useState<JobPhoto | null>(null);
  const [dragOver, setDragOver] = useState(false);
  // Cache-bust map: photoId → timestamp, so rotated images reload
  const [cacheBust, setCacheBust] = useState<Record<number, number>>({});
  const fileInputRef = useRef<HTMLInputElement>(null);
  const cameraInputRef = useRef<HTMLInputElement>(null);

  // ── Fetch ──────────────────────────────────────────────────────────────────

  const fetchPhotos = useCallback(async () => {
    try {
      const res = await fetch(`/api/jobs/${jobId}/photos`, { credentials: 'include' });
      if (!res.ok) throw new Error('Failed to load');
      const data = await res.json() as { photos: JobPhoto[] };
      setPhotos(data.photos ?? []);
    } catch {
      setError('Failed to load photos');
    } finally {
      setLoading(false);
    }
  }, [jobId]);

  useEffect(() => { void fetchPhotos(); }, [fetchPhotos]);

  // ── Upload ─────────────────────────────────────────────────────────────────

  const doUpload = async (files: FileList | File[]) => {
    const arr = Array.from(files);
    if (arr.length === 0) return;
    const { valid, error: valErr } = validateFiles(arr);
    if (valErr) { setUploadError(valErr); return; }

    setUploading(true);
    setUploadError(null);

    const fd = new FormData();
    valid.forEach((f) => fd.append('photos', f));
    if (label.trim()) fd.append('label', label.trim());

    try {
      const res = await fetch(`/api/jobs/${jobId}/photos`, {
        method: 'POST',
        credentials: 'include',
        body: fd,
      });
      const data = await res.json() as { error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Upload failed');
      setLabel('');
      await fetchPhotos();
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
      if (cameraInputRef.current) cameraInputRef.current.value = '';
    }
  };

  // ── Delete ─────────────────────────────────────────────────────────────────

  const confirmDelete = async () => {
    if (!deleteConfirm) return;
    setDeleting(deleteConfirm.id);
    try {
      const res = await fetch(`/api/jobs/${jobId}/photos/${deleteConfirm.id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Delete failed');
      if (lightboxIndex !== null && photos[lightboxIndex]?.id === deleteConfirm.id) {
        setLightboxIndex(null);
      }
      setDeleteConfirm(null);
      await fetchPhotos();
    } catch {
      setError('Failed to delete photo');
    } finally {
      setDeleting(null);
    }
  };

  // ── Edit saved callback ────────────────────────────────────────────────────

  const handleEditSaved = (updated: JobPhoto) => {
    setPhotos((prev) => prev.map((p) => p.id === updated.id ? updated : p));
    setCacheBust((prev) => ({ ...prev, [updated.id]: Date.now() }));
    // If this photo is open in the lightbox, keep it open with updated data
    if (editPhoto?.id === updated.id) {
      setEditPhoto(updated);
    }
  };

  // ── Drag & drop ────────────────────────────────────────────────────────────

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files.length > 0) void doUpload(e.dataTransfer.files);
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-4">

      {/* Upload zone */}
      <div
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        className={`border-2 border-dashed rounded-xl p-5 transition-colors ${
          dragOver ? 'border-primary bg-orange-50' : 'border-slate-200 bg-white hover:border-slate-300'
        }`}
      >
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="w-10 h-10 rounded-full bg-slate-100 flex items-center justify-center">
            <Upload size={18} className="text-slate-400" />
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-700">Drop photos here or choose files</p>
            <p className="text-xs text-slate-400 mt-0.5">JPEG, PNG, WebP · Max 10 per upload · HEIC not supported</p>
          </div>

          <input
            type="text"
            placeholder="Caption / label (optional)"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            className="w-full max-w-xs border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
          />

          <div className="flex items-center gap-2 flex-wrap justify-center">
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="inline-flex items-center gap-2 bg-primary hover:bg-orange-600 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
            >
              {uploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
              {uploading ? 'Uploading…' : 'Choose Files'}
            </button>
            <button
              onClick={() => cameraInputRef.current?.click()}
              disabled={uploading}
              className="inline-flex items-center gap-2 bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-white text-sm font-semibold px-4 py-2 rounded-lg transition-colors"
            >
              <Camera size={14} />
              Camera
            </button>
          </div>
        </div>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          className="hidden"
          onChange={(e) => { if (e.target.files) void doUpload(e.target.files); }}
        />
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp"
          capture="environment"
          className="hidden"
          onChange={(e) => { if (e.target.files) void doUpload(e.target.files); }}
        />
      </div>

      {/* Upload error */}
      {uploadError && (
        <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
          <AlertCircle size={15} className="shrink-0 mt-0.5" />
          <span className="flex-1">{uploadError}</span>
          <button onClick={() => setUploadError(null)} className="text-red-400 hover:text-red-600 shrink-0 text-base leading-none">&times;</button>
        </div>
      )}

      {/* General error */}
      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
          <AlertCircle size={15} className="shrink-0" />
          {error}
          <button onClick={() => setError(null)} className="ml-auto text-red-400 hover:text-red-600 text-base leading-none">&times;</button>
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-10">
          <Loader2 size={22} className="animate-spin text-primary" />
        </div>
      )}

      {/* Empty state */}
      {!loading && photos.length === 0 && (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <ImageOff size={32} className="text-slate-300 mb-3" />
          <p className="text-sm font-semibold text-slate-500">No photos yet</p>
          <p className="text-xs text-slate-400 mt-1">Upload photos from your device or take one with your camera.</p>
        </div>
      )}

      {/* Photo grid */}
      {!loading && photos.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <AnimatePresence>
            {photos.map((photo, i) => {
              const bust = cacheBust[photo.id];
              return (
                <motion.div
                  key={photo.id}
                  layout
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.9 }}
                  transition={{ duration: 0.15 }}
                  className="group relative flex flex-col rounded-xl overflow-hidden bg-slate-100 border border-slate-200"
                >
                  {/* Thumbnail */}
                  <div
                    className="relative aspect-square cursor-pointer"
                    onClick={() => setLightboxIndex(i)}
                  >
                    <img
                      key={bust ?? photo.filename}
                      src={photoUrlBusted(photo.filename, bust)}
                      alt={photo.label ?? photo.originalName ?? 'Job photo'}
                      className="w-full h-full object-cover"
                      loading="lazy"
                    />

                    {/* Hover overlay */}
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-colors flex items-center justify-center">
                      <ZoomIn size={20} className="text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                    </div>

                    {/* Action buttons — top right */}
                    <div className="absolute top-1.5 right-1.5 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button
                        onClick={(e) => { e.stopPropagation(); setEditPhoto(photo); }}
                        className="p-1.5 rounded-md bg-black/60 hover:bg-slate-700 text-white transition-colors"
                        title="Edit photo"
                      >
                        <Pencil size={11} />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); setDeleteConfirm(photo); }}
                        className="p-1.5 rounded-md bg-black/60 hover:bg-red-600 text-white transition-colors"
                        title="Delete photo"
                      >
                        <Trash2 size={11} />
                      </button>
                    </div>
                  </div>

                  {/* Metadata strip */}
                  <div className="px-2.5 py-2 bg-white border-t border-slate-100 flex flex-col gap-0.5">
                    <div className="flex items-start justify-between gap-1">
                      <div className="min-w-0 flex-1">
                        {photo.label ? (
                          <p className="text-xs font-semibold text-slate-800 truncate">{photo.label}</p>
                        ) : (
                          <p className="text-xs text-slate-400 italic truncate">{photo.originalName ?? photo.filename}</p>
                        )}
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          const a = document.createElement('a');
                          a.href = `/api/jobs/${photo.jobId}/photos/${photo.id}/download`;
                          a.download = photo.originalName ?? photo.filename;
                          a.click();
                        }}
                        className="shrink-0 p-1 rounded-md hover:bg-slate-100 text-slate-400 hover:text-slate-700 transition-colors"
                        title="Download photo"
                      >
                        <Download size={13} />
                      </button>
                    </div>
                    {photo.uploadedByName && (
                      <p className="text-[10px] text-slate-500 flex items-center gap-1 truncate">
                        <User size={9} className="shrink-0" />
                        {photo.uploadedByName}
                      </p>
                    )}
                    <p className="text-[10px] text-slate-400 flex items-center gap-1 truncate">
                      <Clock size={9} className="shrink-0" />
                      {formatDateTime(photo.createdAt)}
                    </p>
                  </div>
                </motion.div>
              );
            })}
          </AnimatePresence>
        </div>
      )}

      {/* Lightbox */}
      <AnimatePresence>
        {lightboxIndex !== null && (
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
      </AnimatePresence>

      {/* Edit modal */}
      <AnimatePresence>
        {editPhoto && (
          <EditModal
            photo={editPhoto}
            cacheBust={cacheBust}
            onClose={() => setEditPhoto(null)}
            onSaved={handleEditSaved}
          />
        )}
      </AnimatePresence>

      {/* Delete confirm modal */}
      <AnimatePresence>
        {deleteConfirm && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/60" onClick={() => setDeleteConfirm(null)} />
            <motion.div
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              transition={{ duration: 0.12 }}
              className="relative bg-white rounded-xl shadow-2xl w-full max-w-sm p-6"
            >
              <h3 className="font-heading font-bold text-base text-slate-900 mb-2">Delete Photo?</h3>
              <p className="text-sm text-slate-500 mb-6">
                {deleteConfirm.label
                  ? <><span className="font-semibold text-slate-700">"{deleteConfirm.label}"</span> will be permanently deleted.</>
                  : 'This photo will be permanently deleted.'
                } This cannot be undone.
              </p>
              <div className="flex gap-3 justify-end">
                <button
                  onClick={() => setDeleteConfirm(null)}
                  className="px-4 py-2 text-sm font-semibold text-slate-600 hover:text-slate-800 transition-colors"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmDelete}
                  disabled={deleting !== null}
                  className="px-5 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-sm font-semibold rounded-lg transition-colors"
                >
                  {deleting !== null ? 'Deleting…' : 'Delete'}
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
