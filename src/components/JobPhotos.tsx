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
} from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────

interface JobPhoto {
  id: number;
  jobId: number;
  companyId: number;
  filename: string;
  originalName: string | null;
  label: string | null;
  mimeType: string | null;
  sizeBytes: number | null;
  createdAt: string;
}

interface JobPhotosProps {
  jobId: number;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function photoUrl(filename: string) {
  return `/airo-assets/uploads/job-photos/${filename}`;
}

function formatBytes(bytes: number | null) {
  if (!bytes) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
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

// ── Lightbox ──────────────────────────────────────────────────────────────────

interface LightboxProps {
  photos: JobPhoto[];
  index: number;
  onClose: () => void;
  onNavigate: (i: number) => void;
  onDelete: (photo: JobPhoto) => void;
  deleting: number | null;
}

function Lightbox({ photos, index, onClose, onNavigate, onDelete, deleting }: LightboxProps) {
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/90">
      {/* Backdrop close */}
      <div className="absolute inset-0" onClick={onClose} />

      {/* Controls top-right */}
      <div className="absolute top-4 right-4 flex items-center gap-2 z-10">
        <button
          onClick={handleDownload}
          className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors"
          title="Download"
        >
          <Download size={18} />
        </button>
        <button
          onClick={() => onDelete(photo)}
          disabled={deleting === photo.id}
          className="p-2 rounded-lg bg-white/10 hover:bg-red-500/80 text-white transition-colors disabled:opacity-50"
          title="Delete"
        >
          {deleting === photo.id ? <Loader2 size={18} className="animate-spin" /> : <Trash2 size={18} />}
        </button>
        <button
          onClick={onClose}
          className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors"
          title="Close"
        >
          <X size={18} />
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
          src={photoUrl(photo.filename)}
          alt={photo.label ?? photo.originalName ?? 'Job photo'}
          className="max-w-full max-h-[75vh] object-contain rounded-lg shadow-2xl"
        />
        <div className="text-center">
          {photo.label && <p className="text-white font-semibold text-sm">{photo.label}</p>}
          <p className="text-white/50 text-xs">
            {photo.originalName ?? photo.filename}
            {photo.sizeBytes ? ` · ${formatBytes(photo.sizeBytes)}` : ''}
            {' · '}{new Date(photo.createdAt).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}
          </p>
          <p className="text-white/30 text-xs mt-0.5">{index + 1} / {photos.length}</p>
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
  const [dragOver, setDragOver] = useState(false);
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
      // If lightbox is open on this photo, close it
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
            <p className="text-xs text-slate-400 mt-0.5">JPEG, PNG, WebP, GIF · Max 10 per upload · HEIC not supported</p>
          </div>

          {/* Label input */}
          <input
            type="text"
            placeholder="Caption / label (optional)"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            className="w-full max-w-xs border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
          />

          {/* Buttons */}
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

        {/* Hidden inputs */}
        <input
          ref={fileInputRef}
          type="file"
          accept="image/jpeg,image/png,image/webp,image/gif"
          multiple
          className="hidden"
          onChange={(e) => { if (e.target.files) void doUpload(e.target.files); }}
        />
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
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
          <button onClick={() => setUploadError(null)} className="text-red-400 hover:text-red-600 shrink-0">&times;</button>
        </div>
      )}

      {/* General error */}
      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
          <AlertCircle size={15} className="shrink-0" />
          {error}
          <button onClick={() => setError(null)} className="ml-auto text-red-400 hover:text-red-600">&times;</button>
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
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
          <AnimatePresence>
            {photos.map((photo, i) => (
              <motion.div
                key={photo.id}
                layout
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9 }}
                transition={{ duration: 0.15 }}
                className="group relative aspect-square rounded-xl overflow-hidden bg-slate-100 border border-slate-200 cursor-pointer"
                onClick={() => setLightboxIndex(i)}
              >
                <img
                  src={photoUrl(photo.filename)}
                  alt={photo.label ?? photo.originalName ?? 'Job photo'}
                  className="w-full h-full object-cover"
                  loading="lazy"
                />

                {/* Hover overlay */}
                <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-colors flex items-center justify-center">
                  <ZoomIn size={20} className="text-white opacity-0 group-hover:opacity-100 transition-opacity" />
                </div>

                {/* Label */}
                {photo.label && (
                  <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/70 to-transparent px-2 py-1.5">
                    <p className="text-white text-xs font-medium truncate">{photo.label}</p>
                  </div>
                )}

                {/* Delete button */}
                <button
                  onClick={(e) => { e.stopPropagation(); setDeleteConfirm(photo); }}
                  className="absolute top-1.5 right-1.5 p-1 rounded-md bg-black/50 hover:bg-red-600 text-white opacity-0 group-hover:opacity-100 transition-all"
                  title="Delete photo"
                >
                  <Trash2 size={12} />
                </button>
              </motion.div>
            ))}
          </AnimatePresence>
        </div>
      )}

      {/* Lightbox */}
      <AnimatePresence>
        {lightboxIndex !== null && (
          <Lightbox
            photos={photos}
            index={lightboxIndex}
            onClose={() => setLightboxIndex(null)}
            onNavigate={setLightboxIndex}
            onDelete={(p) => { setDeleteConfirm(p); }}
            deleting={deleting}
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
