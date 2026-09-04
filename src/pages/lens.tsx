/**
 * /lens — Lens Gallery with Layout & Filtering Overhaul
 *
 * Views:
 *   - All Photos   — 4-col square grid, newest-first
 *   - Group by Job — collapsible job sections, pre-seeded Upload/Camera
 *   - Sort by Date — day-grouped, newest/oldest toggle
 *   - Group by Location — collapsible address sections
 *
 * PhotoCard: square image-only, no metadata below.
 * Lightbox: rich metadata panel (address, datetime, uploadedBy, caption, label).
 * Filter panel removed — replaced by view-control icon buttons + search.
 * Mobile bottom bar: Upload | Camera (purple) | Select | Share.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useSearchParams, useLocation } from "react-router";
import { Helmet } from '@dr.pogodin/react-helmet';
import { Camera, X, ChevronLeft, ChevronRight, Lock, ImageOff, Loader2, Upload, CheckSquare, Home, LayoutGrid, Briefcase, Calendar, MapPin, ArrowUpDown, User, Clock, Download, Pencil, Trash2, MoreVertical, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import LensUploadSheet from '@/components/lens/LensUploadSheet';
import LensJobPickerSheet, { type LensJobOption } from '@/components/lens/LensJobPickerSheet';
import LensSelectionBar from '@/components/lens/LensSelectionBar';
import LensGroupByJob from '@/components/lens/LensGroupByJob';
import LensSortByDate from '@/components/lens/LensSortByDate';
import LensGroupByUploader from '@/components/lens/LensGroupByUploader';
import { type LensPhoto, type LensResponse } from '@/components/lens/lensTypes';
import PhotoEditor, { type EditorConfig } from '@/components/PhotoEditor';
import PortalSidebar from '@/components/PortalSidebar';
import { resolveDownloadUrl } from '@/lib/native-api';

// ── View mode ─────────────────────────────────────────────────────────────────

type ViewMode = 'all' | 'byJob' | 'byDate' | 'byLocation';
type DateOrder = 'newest' | 'oldest';

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-AU', {
      day: '2-digit',
      month: 'short',
      year: 'numeric'
    });
  } catch {
    return '';
  }
}
function formatDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString('en-AU', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  } catch {
    return '';
  }
}
function photoLabel(p: LensPhoto): string {
  return p.label ?? p.caption ?? p.originalName ?? `Photo ${p.id}`;
}

// ── Delete confirmation modal ─────────────────────────────────────────────────

interface DeleteConfirmProps {
  photo: LensPhoto;
  onConfirm: () => void;
  onCancel: () => void;
  deleting: boolean;
}
function DeleteConfirm({
  photo,
  onConfirm,
  onCancel,
  deleting
}: DeleteConfirmProps) {
  return <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 px-4">
      <div className="w-full max-w-sm bg-background rounded-2xl shadow-2xl p-5">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-10 h-10 rounded-xl bg-red-100 flex items-center justify-center shrink-0">
            <Trash2 size={18} className="text-red-600" />
          </div>
          <div>
            <p className="text-sm font-bold text-foreground">Delete photo?</p>
            <p className="text-xs text-muted-foreground truncate max-w-[200px]">
              {photo.label ?? photo.originalName ?? `Photo ${photo.id}`}
            </p>
          </div>
        </div>
        <p className="text-sm text-muted-foreground mb-4">
          This photo will be permanently deleted and cannot be recovered.
        </p>
        <div className="flex gap-2">
          <button type="button" onClick={onCancel} disabled={deleting} className="flex-1 min-h-[44px] rounded-xl border border-border text-sm font-medium text-foreground hover:bg-muted transition-colors disabled:opacity-50">
            Cancel
          </button>
          <button type="button" onClick={onConfirm} disabled={deleting} className="flex-1 min-h-[44px] rounded-xl bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white text-sm font-semibold transition-colors flex items-center justify-center gap-1.5">
            {deleting ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
            {deleting ? 'Deleting…' : 'Delete'}
          </button>
        </div>
      </div>
    </div>;
}

// ── Lightbox ──────────────────────────────────────────────────────────────────

interface LightboxProps {
  photos: LensPhoto[];
  index: number;
  /** Cache-bust counter per photo id — increment after edit to force img reload */
  cacheBust: Record<number, number>;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
  onOpenJob: (jobId: number) => void;
  onEdit: (photo: LensPhoto) => void;
  onDelete: (photo: LensPhoto) => void;
  onPhotoUpdated: (photo: LensPhoto) => void;
}
function Lightbox({
  photos,
  index,
  cacheBust,
  onClose,
  onPrev,
  onNext,
  onOpenJob,
  onEdit,
  onDelete
}: LightboxProps) {
  const photo = photos[index];
  if (!photo) return null;
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') onPrev();
      if (e.key === 'ArrowRight') onNext();
    }
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose, onPrev, onNext]);
  const isLocked = photo.status === 'locked';
  const jobLabel = photo.jobNumber ? `#${photo.jobNumber} — ${photo.jobName}` : photo.jobName;

  // Cache-bust the image URL after an edit
  const bust = cacheBust[photo.id];
  const imgSrc = bust ? `${photo.downloadUrl}${photo.downloadUrl.includes('?') ? '&' : '?'}_cb=${bust}` : photo.downloadUrl;
  return <div className="fixed inset-0 z-50 flex bg-black/95" style={{
    paddingTop: 'env(safe-area-inset-top)',
    paddingBottom: 'env(safe-area-inset-bottom)'
  }}>
      {/* ── Left: image area ── */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <div className="flex items-center gap-2 px-3 py-2 bg-black/60 shrink-0">
          {/* Close */}
          <button onClick={onClose} className="text-white/80 hover:text-white transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg" aria-label="Close lightbox">
            <X size={20} />
          </button>

          {/* Counter */}
          <span className="text-white/50 text-sm flex-1 text-center">
            {index + 1} / {photos.length}
          </span>

          {/* Locked badge */}
          {isLocked && <span className="flex items-center gap-1 text-amber-400 text-xs font-medium px-2 py-1 bg-amber-400/10 rounded-lg">
              <Lock size={11} /> Locked
            </span>}

          {/* Edit — only for unlocked photos */}
          {!isLocked && <button onClick={() => onEdit(photo)} className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors" aria-label="Edit photo" title="Edit photo">
              <Pencil size={16} />
            </button>}

          {/* Download */}
          <a href={resolveDownloadUrl(`/api/lens/photos/${photo.id}/download`)} download className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg bg-white/10 hover:bg-white/20 text-white transition-colors" aria-label="Download photo" title="Download original">
            <Download size={16} />
          </a>

          {/* Delete — disabled for locked */}
          <button onClick={() => onDelete(photo)} disabled={isLocked} className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg bg-white/10 hover:bg-red-500/80 text-white transition-colors disabled:opacity-40" aria-label={isLocked ? 'Locked photos cannot be deleted' : 'Delete photo'} title={isLocked ? 'Locked — cannot delete' : 'Delete'}>
            <Trash2 size={16} />
          </button>
        </div>

        {/* Image + prev/next */}
        <div className="flex-1 flex items-center justify-center relative overflow-hidden">
          {index > 0 && <button onClick={onPrev} className="absolute left-2 md:left-4 z-10 bg-black/50 hover:bg-black/70 text-white rounded-full p-2 transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center" aria-label="Previous photo">
              <ChevronLeft size={24} />
            </button>}

          <img key={`${photo.id}-${bust ?? 0}`} src={imgSrc} alt={photoLabel(photo)} className="max-w-full max-h-full object-contain" style={{
          maxHeight: 'calc(100vh - 120px)'
        }} loading="eager" />

          {index < photos.length - 1 && <button onClick={onNext} className="absolute right-2 md:right-4 z-10 bg-black/50 hover:bg-black/70 text-white rounded-full p-2 transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center" aria-label="Next photo">
              <ChevronRight size={24} />
            </button>}
        </div>
      </div>

      {/* ── Right: metadata panel (desktop) ── */}
      <div className="hidden md:flex flex-col w-72 bg-black/80 border-l border-white/10 overflow-y-auto shrink-0">
        <div className="p-5 flex flex-col gap-4">
          <h3 className="text-white font-semibold text-sm truncate">{photoLabel(photo)}</h3>

          {/* Job */}
          {jobLabel && <div className="flex flex-col gap-1">
              <span className="text-white/40 text-xs uppercase tracking-wide">Job</span>
              <button type="button" onClick={() => onOpenJob(photo.jobId)} className="flex items-center gap-2 text-violet-400 hover:text-violet-300 text-sm font-medium text-left transition-colors">
                <Briefcase size={13} className="shrink-0" />
                <span className="truncate">{jobLabel}</span>
              </button>
            </div>}

          {/* Address */}
          {photo.jobAddress && <div className="flex flex-col gap-1">
              <span className="text-white/40 text-xs uppercase tracking-wide">Location</span>
              <div className="flex items-start gap-2 text-white/80 text-sm">
                <MapPin size={13} className="shrink-0 mt-0.5 text-white/40" />
                <span>{photo.jobAddress}</span>
              </div>
            </div>}

          {/* Date/time */}
          <div className="flex flex-col gap-1">
            <span className="text-white/40 text-xs uppercase tracking-wide">Captured</span>
            <div className="flex items-center gap-2 text-white/80 text-sm">
              <Clock size={13} className="shrink-0 text-white/40" />
              {formatDateTime(photo.createdAt)}
            </div>
          </div>

          {/* Uploaded by */}
          {photo.uploadedByName && <div className="flex flex-col gap-1">
              <span className="text-white/40 text-xs uppercase tracking-wide">Uploaded by</span>
              <div className="flex items-center gap-2 text-white/80 text-sm">
                <User size={13} className="shrink-0 text-white/40" />
                {photo.uploadedByName}
              </div>
            </div>}

          {/* Caption */}
          {photo.caption && photo.caption !== photo.label && <div className="flex flex-col gap-1">
              <span className="text-white/40 text-xs uppercase tracking-wide">Caption</span>
              <p className="text-white/80 text-sm leading-relaxed">{photo.caption}</p>
            </div>}

          {/* Dimensions */}
          {photo.imageWidth && photo.imageHeight && <div className="flex flex-col gap-1">
              <span className="text-white/40 text-xs uppercase tracking-wide">Dimensions</span>
              <span className="text-white/60 text-sm">{photo.imageWidth} × {photo.imageHeight}px</span>
            </div>}

          {/* Actions */}
          <div className="flex flex-col gap-2 pt-2 border-t border-white/10">
            {!isLocked && <button type="button" onClick={() => onEdit(photo)} className="flex items-center justify-center gap-2 min-h-[40px] rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-sm font-medium transition-colors">
                <Pencil size={14} /> Edit photo
              </button>}
            <a href={resolveDownloadUrl(`/api/lens/photos/${photo.id}/download`)} download className="flex items-center justify-center gap-2 min-h-[40px] rounded-lg bg-white/10 hover:bg-white/20 text-white text-sm font-medium transition-colors">
              <Download size={14} /> Download
            </a>
            {jobLabel && <button type="button" onClick={() => onOpenJob(photo.jobId)} className="flex items-center justify-center gap-2 min-h-[40px] rounded-lg border border-white/20 hover:bg-white/10 text-white/80 text-sm font-medium transition-colors">
                <Briefcase size={14} /> Open Job
              </button>}
            {!isLocked && <button type="button" onClick={() => onDelete(photo)} className="flex items-center justify-center gap-2 min-h-[40px] rounded-lg border border-red-500/30 hover:bg-red-500/20 text-red-400 text-sm font-medium transition-colors">
                <Trash2 size={14} /> Delete
              </button>}
          </div>
        </div>
      </div>

      {/* ── Mobile metadata strip (bottom) ── */}
      <div className="md:hidden absolute bottom-0 inset-x-0 bg-black/80 px-4 py-3 flex flex-col gap-1" style={{
      paddingBottom: 'max(env(safe-area-inset-bottom), 12px)'
    }}>
        <p className="text-white text-sm font-medium truncate">{photoLabel(photo)}</p>
        {jobLabel && <button type="button" onClick={() => onOpenJob(photo.jobId)} className="flex items-center gap-1.5 text-violet-400 text-xs text-left">
            <Briefcase size={11} />
            <span className="truncate">{jobLabel}</span>
          </button>}
        {photo.jobAddress && <div className="flex items-center gap-1.5 text-white/50 text-xs">
            <MapPin size={11} />
            <span className="truncate">{photo.jobAddress}</span>
          </div>}
        <div className="flex items-center gap-3 text-white/40 text-xs mt-0.5">
          <span>{formatDate(photo.createdAt)}</span>
          {photo.uploadedByName && <span>· {photo.uploadedByName}</span>}
        </div>
      </div>
    </div>;
}

// ── Square PhotoCard (All Photos view) ────────────────────────────────────────

interface PhotoCardProps {
  photo: LensPhoto;
  onOpen: () => void;
  onEdit: () => void;
  onDelete: () => void;
  selectionMode: boolean;
  selected: boolean;
  onToggleSelect: (id: number) => void;
  /** Cache-bust counter — increment after edit to force thumbnail reload */
  cacheBust: number;
}
function PhotoCard({
  photo,
  onOpen,
  onEdit,
  onDelete,
  selectionMode,
  selected,
  onToggleSelect,
  cacheBust
}: PhotoCardProps) {
  const [imgError, setImgError] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const isLocked = photo.status === 'locked';
  const thumbSrc = cacheBust ? `${photo.thumbnailUrl}${photo.thumbnailUrl.includes('?') ? '&' : '?'}_cb=${cacheBust}` : photo.thumbnailUrl;
  function handleClick() {
    if (menuOpen) return;
    if (selectionMode) onToggleSelect(photo.id);else onOpen();
  }
  return <div className={`group relative aspect-square overflow-hidden rounded-sm cursor-pointer bg-slate-200 ${selectionMode && selected ? 'ring-2 ring-violet-500 ring-offset-1' : ''}`} onClick={handleClick}>
      {imgError ? <div className="absolute inset-0 flex items-center justify-center text-slate-400">
          <ImageOff size={24} />
        </div> : <img key={`${photo.id}-${cacheBust}`} src={thumbSrc} alt={photoLabel(photo)} loading="lazy" className={`w-full h-full object-cover transition-transform duration-200 ${!selectionMode ? 'hover:scale-105' : ''}`} onError={() => setImgError(true)} />}

      {/* Lock badge */}
      {isLocked && <div className="absolute top-1 right-1 bg-black/60 text-white rounded-full p-1 pointer-events-none">
          <Lock size={9} />
        </div>}

      {/* Selection overlay */}
      {selectionMode && <div className="absolute inset-0 pointer-events-none">
          {selected && <div className="absolute inset-0 bg-violet-600/20" />}
          <div className={`absolute top-1.5 left-1.5 w-5 h-5 rounded flex items-center justify-center ${selected ? 'bg-violet-600 text-white' : 'bg-white/80 text-slate-400 border border-slate-300'}`}>
            <CheckSquare size={12} className={selected ? '' : 'opacity-0'} />
          </div>
        </div>}

      {/* Three-dot menu — shown on hover (desktop) or always visible (touch) */}
      {!selectionMode && <div className="absolute top-1 right-1">
          <button type="button" onClick={e => {
        e.stopPropagation();
        setMenuOpen(o => !o);
      }} className="w-7 h-7 flex items-center justify-center rounded-full bg-black/50 hover:bg-black/70 text-white opacity-0 group-hover:opacity-100 transition-opacity touch:opacity-100" aria-label="Photo actions">
            <MoreVertical size={13} />
          </button>

          {menuOpen && <>
              {/* Backdrop to close */}
              <div className="fixed inset-0 z-10" onClick={e => {
          e.stopPropagation();
          setMenuOpen(false);
        }} />
              <div className="absolute top-8 right-0 z-20 bg-white rounded-xl shadow-xl border border-slate-200 py-1 min-w-[130px]" onClick={e => e.stopPropagation()}>
                <button type="button" onClick={() => {
            setMenuOpen(false);
            onOpen();
          }} className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-slate-700 hover:bg-slate-50 transition-colors min-h-[44px]">
                  <Download size={14} className="text-slate-400" /> View
                </button>
                {!isLocked && <button type="button" onClick={() => {
            setMenuOpen(false);
            onEdit();
          }} className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-slate-700 hover:bg-slate-50 transition-colors min-h-[44px]">
                    <Pencil size={14} className="text-slate-400" /> Edit
                  </button>}
                {!isLocked && <button type="button" onClick={() => {
            setMenuOpen(false);
            onDelete();
          }} className="w-full flex items-center gap-2.5 px-3 py-2.5 text-sm text-red-600 hover:bg-red-50 transition-colors min-h-[44px]">
                    <Trash2 size={14} /> Delete
                  </button>}
              </div>
            </>}
        </div>}
    </div>;
}

// ── View control button ───────────────────────────────────────────────────────

interface ViewBtnProps {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  title?: string;
}
function ViewBtn({
  active,
  onClick,
  icon,
  label,
  title
}: ViewBtnProps) {
  return <button type="button" onClick={onClick} title={title ?? label} className={`flex flex-col items-center justify-center gap-0.5 px-2 py-1.5 rounded-lg transition-colors min-w-[44px] min-h-[44px] ${active ? 'bg-violet-600 text-white' : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'}`}>
      {icon}
      <span className="text-[9px] font-semibold leading-none hidden sm:block">{label}</span>
    </button>;
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function LensPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();

  // Filter state
  const [uploadedBy, setUploadedBy] = useState(searchParams.get('uploadedBy') ?? '');

  // Data state
  const [photos, setPhotos] = useState<LensPhoto[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // View mode
  const [viewMode, setViewMode] = useState<ViewMode>('all');
  const [dateOrder, setDateOrder] = useState<DateOrder>('newest');

  // Lightbox — tracks photo + context array (for grouped views)
  const [lightboxPhotos, setLightboxPhotos] = useState<LensPhoto[]>([]);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  // Editor
  const [editorPhoto, setEditorPhoto] = useState<LensPhoto | null>(null);
  /** Per-photo cache-bust counter — incremented after a successful edit */
  const [cacheBust, setCacheBust] = useState<Record<number, number>>({});

  // Delete confirmation
  const [deleteTarget, setDeleteTarget] = useState<LensPhoto | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Upload sheet — optional pre-seeded job
  const [uploadSheetOpen, setUploadSheetOpen] = useState(false);
  const [uploadInitialJob, setUploadInitialJob] = useState<LensJobOption | null>(null);

  // Camera job picker
  const [cameraJobPickerOpen, setCameraJobPickerOpen] = useState(false);

  // Selection
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const LIMIT = 96; // larger page for grouped views

  // ── Fetch ──────────────────────────────────────────────────────────────────
  const fetchPhotos = useCallback(async (pg: number, replace: boolean) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        page: String(pg),
        limit: String(LIMIT)
      });
      if (uploadedBy) params.set('uploadedBy', uploadedBy);
      const r = await fetch(`/api/lens/photos?${params}`, {
        credentials: 'include'
      });
      if (!r.ok) {
        const body = (await r.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(body.error ?? `HTTP ${r.status}`);
      }
      const data = (await r.json()) as LensResponse;
      setPhotos(prev => replace ? data.photos : [...prev, ...data.photos]);
      setTotal(data.total);
      setHasMore(data.hasMore);
      setPage(pg);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load photos');
    } finally {
      setLoading(false);
    }
  }, [uploadedBy]);

  // Initial load + uploadedBy changes
  useEffect(() => {
    fetchPhotos(1, true);
    const p: Record<string, string> = {};
    if (uploadedBy) p.uploadedBy = uploadedBy;
    setSearchParams(p, {
      replace: true
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uploadedBy]);

  // Refresh on return from camera
  useEffect(() => {
    if (searchParams.get('refreshed') === '1') {
      setSearchParams(prev => {
        const next = new URLSearchParams(prev);
        next.delete('refreshed');
        return next;
      }, {
        replace: true
      });
      fetchPhotos(1, true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.search]);

  // ── Handlers ──────────────────────────────────────────────────────────────
  function handleUploadedByChange(value: string) {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => setUploadedBy(value), 350);
  }
  function handleLoadMore() {
    if (!loading && hasMore) fetchPhotos(page + 1, false);
  }
  function handleOpenJob(jId: number) {
    navigate(`/jobs/${jId}`);
  }
  const handlePhotoSynced = useCallback((_id: number) => {
    fetchPhotos(1, true);
  }, [fetchPhotos]);
  function handleCameraJobSelect(job: LensJobOption) {
    setCameraJobPickerOpen(false);
    navigate(`/jobs/${job.id}/camera`, {
      state: {
        backPath: '/lens?refreshed=1'
      }
    });
  }

  // Upload with optional pre-seeded job (from Group by Job view)
  function openUpload(job?: LensJobOption) {
    setUploadInitialJob(job ?? null);
    setUploadSheetOpen(true);
  }

  // Camera with optional pre-seeded job (from Group by Job view)
  function openCamera(job?: LensJobOption) {
    if (job) {
      handleCameraJobSelect(job);
    } else {
      setCameraJobPickerOpen(true);
    }
  }

  // ── Lightbox helpers ──────────────────────────────────────────────────────
  function openLightbox(photo: LensPhoto, contextPhotos: LensPhoto[]) {
    const idx = contextPhotos.findIndex(p => p.id === photo.id);
    setLightboxPhotos(contextPhotos);
    setLightboxIndex(idx >= 0 ? idx : 0);
  }
  function closeLightbox() {
    setLightboxIndex(null);
    setLightboxPhotos([]);
  }
  const prevPhoto = () => setLightboxIndex(i => i !== null && i > 0 ? i - 1 : i);
  const nextPhoto = () => setLightboxIndex(i => i !== null && i < lightboxPhotos.length - 1 ? i + 1 : i);

  // ── Edit handlers ──────────────────────────────────────────────────────────
  function handleEditPhoto(photo: LensPhoto) {
    // Close lightbox first so the editor renders on top cleanly
    setLightboxIndex(null);
    setLightboxPhotos([]);
    setEditorPhoto(photo);
  }
  function buildEditorConfig(photo: LensPhoto): EditorConfig {
    return {
      imageUrl: photo.downloadUrl,
      photoId: photo.id,
      label: photo.label,
      createdAt: photo.createdAt,
      isLocked: photo.status === 'locked',
      canEdit: photo.status !== 'locked',
      jobName: photo.jobName ?? undefined,
      jobNumber: photo.jobNumber ?? undefined,
      onClose: () => setEditorPhoto(null),
      onSaveLabel: async label => {
        const res = await fetch(`/api/jobs/${photo.jobId}/photos/${photo.id}`, {
          method: 'PATCH',
          credentials: 'include',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({
            label
          })
        });
        if (!res.ok) throw new Error('Failed to save label');
        // Refresh gallery so label change is reflected
        fetchPhotos(1, true);
      },
      onSaveAndLock: async blob => {
        const fd = new FormData();
        fd.append('photo', blob, 'edited.jpg');
        const replaceRes = await fetch(`/api/jobs/${photo.jobId}/photos/${photo.id}/replace`, {
          method: 'POST',
          credentials: 'include',
          body: fd
        });
        if (!replaceRes.ok) {
          const body = (await replaceRes.json().catch(() => ({}))) as {
            error?: string;
          };
          throw new Error(body.error ?? 'Replace failed');
        }
        const lockRes = await fetch(`/api/jobs/${photo.jobId}/photos/${photo.id}/lock`, {
          method: 'POST',
          credentials: 'include'
        });
        if (!lockRes.ok) {
          const body = (await lockRes.json().catch(() => ({}))) as {
            error?: string;
          };
          throw new Error(body.error ?? 'Lock failed');
        }
      },
      onSaved: () => {
        // Bust thumbnail cache for this photo
        setCacheBust(prev => ({
          ...prev,
          [photo.id]: Date.now()
        }));
        // Refresh gallery to pick up new status/label
        fetchPhotos(1, true);
        setEditorPhoto(null);
      }
    };
  }

  // ── Delete handlers ────────────────────────────────────────────────────────
  function handleRequestDelete(photo: LensPhoto) {
    if (photo.status === 'locked') return; // guard — UI should prevent this
    setDeleteError(null);
    setDeleteTarget(photo);
  }
  async function handleConfirmDelete() {
    if (!deleteTarget) return;
    setDeleting(true);
    setDeleteError(null);
    try {
      const res = await fetch(`/api/jobs/${deleteTarget.jobId}/photos/${deleteTarget.id}`, {
        method: 'DELETE',
        credentials: 'include'
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as {
          error?: string;
        };
        throw new Error(body.error ?? `HTTP ${res.status}`);
      }
      // Remove from local state immediately
      setPhotos(prev => prev.filter(p => p.id !== deleteTarget.id));
      setTotal(t => Math.max(0, t - 1));
      // Close lightbox if the deleted photo was open
      setLightboxPhotos(prev => prev.filter(p => p.id !== deleteTarget.id));
      setLightboxIndex(i => {
        if (i === null) return null;
        // If we deleted the last photo in context, close; otherwise clamp
        return i >= lightboxPhotos.length - 1 ? Math.max(0, i - 1) : i;
      });
      setDeleteTarget(null);
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : 'Delete failed');
    } finally {
      setDeleting(false);
    }
  }

  // ── Selection ─────────────────────────────────────────────────────────────
  function handleToggleSelect(id: number) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);else next.add(id);
      return next;
    });
  }
  function handleEnterSelectionMode() {
    setSelectionMode(true);
    setSelectedIds(new Set());
  }
  function handleCancelSelection() {
    setSelectionMode(false);
    setSelectedIds(new Set());
  }
  function handleExportSuccess() {
    setSelectionMode(false);
    setSelectedIds(new Set());
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return <>
      <PortalSidebar />
      <Helmet>
        <title>Lens — IWIllBUIlD</title>
        <meta name="description" content="Company-wide photo gallery. Browse, search and filter all job photos." />
        <meta name="robots" content="noindex" />
        <link rel="canonical" href="https://iwillbuild.com/lens" />
      </Helmet>

      {/* Upload sheet */}
      <LensUploadSheet open={uploadSheetOpen} onClose={() => {
      setUploadSheetOpen(false);
      setUploadInitialJob(null);
    }} onPhotoSynced={handlePhotoSynced} initialJob={uploadInitialJob} />

      {/* Camera job picker (global — used when no job pre-seeded) */}
      <LensJobPickerSheet open={cameraJobPickerOpen} title="Select a job" subtitle="Camera photos will be saved to this job" onSelect={handleCameraJobSelect} onClose={() => setCameraJobPickerOpen(false)} />

      {/* Lightbox */}
      {lightboxIndex !== null && lightboxPhotos.length > 0 && <Lightbox photos={lightboxPhotos} index={lightboxIndex} cacheBust={cacheBust} onClose={closeLightbox} onPrev={prevPhoto} onNext={nextPhoto} onOpenJob={handleOpenJob} onEdit={handleEditPhoto} onDelete={handleRequestDelete} onPhotoUpdated={() => fetchPhotos(1, true)} />}

      {/* Photo editor — full-screen, z-[80] (above lightbox z-50) */}
      {editorPhoto && <PhotoEditor config={buildEditorConfig(editorPhoto)} onClose={() => setEditorPhoto(null)} onSaved={() => {
      setCacheBust(prev => ({
        ...prev,
        [editorPhoto.id]: Date.now()
      }));
      fetchPhotos(1, true);
      setEditorPhoto(null);
    }} />}

      {/* Delete confirmation */}
      {deleteTarget && <DeleteConfirm photo={deleteTarget} onConfirm={() => void handleConfirmDelete()} onCancel={() => {
      setDeleteTarget(null);
      setDeleteError(null);
    }} deleting={deleting} />}

      {/* Delete error toast */}
      {deleteError && <div className="fixed bottom-24 inset-x-4 z-50 flex items-center gap-2 bg-red-600 text-white text-sm font-medium px-4 py-3 rounded-xl shadow-xl max-w-sm mx-auto">
          <AlertCircle size={15} className="shrink-0" />
          <span className="flex-1">{deleteError}</span>
          <button onClick={() => setDeleteError(null)} className="shrink-0 text-white/70 hover:text-white">
            <X size={14} />
          </button>
        </div>}

      <div className="min-h-screen bg-slate-50 lg-portal" style={{
      paddingLeft: 'env(safe-area-inset-left)',
      paddingRight: 'env(safe-area-inset-right)'
    }}>
        {/* ── Page header ─────────────────────────────────────────────────── */}
        <div className="bg-white border-b border-slate-200 sticky top-0 lg:top-[116px] z-20 safe-top">
          <div className="max-w-screen-2xl mx-auto px-3 py-2 flex flex-col gap-1.5">

            {/* ── Row 1: home + title + desktop actions ── */}
            <div className="flex items-center gap-2">

              {/* Home */}
              <button onClick={() => goBack(navigate, '/home')} className="p-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors shrink-0 min-w-[40px] min-h-[40px] flex items-center justify-center" aria-label="Go to dashboard">
                <Home size={18} />
              </button>

              {/* Title */}
              <div className="flex items-center gap-2 shrink-0">
                <div className="w-7 h-7 rounded-lg bg-violet-600 flex items-center justify-center">
                  <Camera size={14} className="text-white" />
                </div>
                <div>
                  <h1 className="text-sm font-bold text-slate-900 leading-tight">Lens</h1>
                  {total > 0 && <p className="text-[10px] text-slate-400 leading-tight">
                      {total.toLocaleString()} photo{total !== 1 ? 's' : ''}
                    </p>}
                </div>
              </div>

              {/* Spacer — pushes desktop actions to the right */}
              <div className="flex-1" />

              {/* ── Desktop action buttons ── */}
              <div className="hidden md:flex items-center gap-1.5 shrink-0">
                <Button variant="outline" size="sm" className="gap-1.5 h-8" onClick={() => openUpload()}>
                  <Upload size={13} />
                  <span className="hidden lg:inline">Upload</span>
                </Button>
                <Button size="sm" className="gap-1.5 h-8 bg-violet-600 hover:bg-violet-700 text-white" onClick={() => openCamera()}>
                  <Camera size={13} />
                  <span className="hidden lg:inline">Camera</span>
                </Button>
                {!selectionMode ? <Button variant="outline" size="sm" className="gap-1.5 h-8" onClick={handleEnterSelectionMode}>
                    <CheckSquare size={13} />
                    <span className="hidden lg:inline">Select</span>
                  </Button> : <Button variant="secondary" size="sm" className="gap-1.5 h-8 font-semibold" onClick={handleCancelSelection}>
                    <X size={13} />
                    <span className="hidden lg:inline">Cancel</span>
                  </Button>}
              </div>
            </div>

            {/* ── Row 2: uploaded-by filter + view controls ── */}
            <div className="flex items-center gap-2">

              {/* Uploaded by filter */}
              <div className="flex-1 relative min-w-0">
                <User size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                <Input type="search" placeholder="Uploaded by…" defaultValue={uploadedBy} onChange={e => handleUploadedByChange(e.target.value)} className="pl-8 h-8 text-sm" />
              </div>

              {/* View controls */}
              <div className="flex items-center gap-0.5 shrink-0 bg-slate-100 rounded-xl p-1">
                <ViewBtn active={viewMode === 'all'} onClick={() => setViewMode('all')} icon={<LayoutGrid size={15} />} label="All" title="All photos" />
                <ViewBtn active={viewMode === 'byJob'} onClick={() => setViewMode('byJob')} icon={<Briefcase size={15} />} label="Job" title="Group by job" />
                <ViewBtn active={viewMode === 'byDate'} onClick={() => setViewMode('byDate')} icon={<Calendar size={15} />} label="Date" title="Sort by date" />
                <ViewBtn active={viewMode === 'byLocation'} onClick={() => setViewMode('byLocation')} icon={<User size={15} />} label="Uploader" title="Group by uploader" />
              </div>
            </div>

            {/* Date order toggle — only shown in byDate view */}
            {viewMode === 'byDate' && <div className="flex items-center gap-2 pb-0.5">
                <button type="button" onClick={() => setDateOrder(o => o === 'newest' ? 'oldest' : 'newest')} className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700 transition-colors px-2 py-1 rounded-lg hover:bg-slate-100">
                  <ArrowUpDown size={12} />
                  {dateOrder === 'newest' ? 'Newest first' : 'Oldest first'}
                </button>
              </div>}
          </div>
        </div>

        {/* ── Gallery ─────────────────────────────────────────────────────── */}
        <div className={`max-w-screen-2xl mx-auto px-3 py-3 ${selectionMode ? '' : 'pb-24 md:pb-8'}`} style={selectionMode ? {
        paddingBottom: 'calc(env(safe-area-inset-bottom) + 80px)'
      } : undefined}>
          {/* Error */}
          {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 flex items-center gap-2">
              <X size={15} className="shrink-0" />
              {error}
              <Button variant="ghost" size="sm" className="ml-auto" onClick={() => fetchPhotos(1, true)}>
                Retry
              </Button>
            </div>}

          {/* Loading — initial */}
          {loading && photos.length === 0 && <div className="flex flex-col items-center justify-center py-24 gap-3 text-slate-400">
              <Loader2 size={32} className="animate-spin" />
              <p className="text-sm">Loading photos…</p>
            </div>}

          {/* Empty state */}
          {!loading && !error && photos.length === 0 && <div className="flex flex-col items-center justify-center py-24 gap-3 text-slate-400">
              <Camera size={40} className="text-slate-300" />
              <p className="text-base font-medium text-slate-500">
                {uploadedBy ? 'No photos match that uploader' : 'No photos yet'}
              </p>
              {uploadedBy && <Button variant="outline" size="sm" onClick={() => setUploadedBy('')}>
                  Clear filter
                </Button>}
            </div>}

          {/* ── All Photos view ── */}
          {photos.length > 0 && viewMode === 'all' && <div className="grid grid-cols-4 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10 2xl:grid-cols-12 gap-1">
              {photos.map(photo => <PhotoCard key={photo.id} photo={photo} onOpen={() => openLightbox(photo, photos)} onEdit={() => handleEditPhoto(photo)} onDelete={() => handleRequestDelete(photo)} selectionMode={selectionMode} selected={selectedIds.has(photo.id)} onToggleSelect={handleToggleSelect} cacheBust={cacheBust[photo.id] ?? 0} />)}
            </div>}

          {/* ── Group by Job view ── */}
          {photos.length > 0 && viewMode === 'byJob' && <LensGroupByJob photos={photos} onOpenPhoto={(photo, ctx) => openLightbox(photo, ctx)} onUpload={job => openUpload(job)} onCamera={job => openCamera(job)} selectionMode={selectionMode} selectedIds={selectedIds} onToggleSelect={handleToggleSelect} />}

          {/* ── Sort by Date view ── */}
          {photos.length > 0 && viewMode === 'byDate' && <LensSortByDate photos={photos} order={dateOrder} onOpenPhoto={(photo, ctx) => openLightbox(photo, ctx)} selectionMode={selectionMode} selectedIds={selectedIds} onToggleSelect={handleToggleSelect} />}

          {/* ── Group by Uploader view ── */}
          {photos.length > 0 && viewMode === 'byLocation' && <LensGroupByUploader photos={photos} onOpenPhoto={(photo, ctx) => openLightbox(photo, ctx)} selectionMode={selectionMode} selectedIds={selectedIds} onToggleSelect={handleToggleSelect} />}

          {/* Load more (All Photos only — grouped views show all loaded photos) */}
          {viewMode === 'all' && hasMore && <div className="mt-5 flex justify-center">
              <Button variant="outline" onClick={handleLoadMore} disabled={loading} className="gap-2">
                {loading ? <Loader2 size={14} className="animate-spin" /> : null}
                Load more
              </Button>
            </div>}

          {/* Auto-load more for grouped views */}
          {viewMode !== 'all' && hasMore && !loading && <div className="mt-4 flex justify-center">
              <Button variant="ghost" size="sm" onClick={handleLoadMore} className="text-slate-400 text-xs gap-1">
                <Loader2 size={12} />
                Load more photos
              </Button>
            </div>}

          {/* Loading — append */}
          {loading && photos.length > 0 && <div className="mt-4 flex justify-center">
              <Loader2 size={20} className="animate-spin text-slate-400" />
            </div>}

          {/* End of results */}
          {!hasMore && photos.length > 0 && !loading && <p className="mt-5 text-center text-xs text-slate-400">
              {total.toLocaleString()} photo{total !== 1 ? 's' : ''} total
            </p>}
        </div>

        {/* ── Selection bar ────────────────────────────────────────────────── */}
        {selectionMode && <LensSelectionBar selectedIds={selectedIds} visiblePhotoIds={photos.map(p => p.id)} onSetSelection={setSelectedIds} onCancel={handleCancelSelection} onExportSuccess={handleExportSuccess} />}
      </div>

      {/* ── Mobile bottom action bar ─────────────────────────────────────── */}
      {!selectionMode && <div className="md:hidden fixed bottom-0 inset-x-0 z-20 bg-white border-t border-gray-200" style={{
      overflowX: 'clip'
    }}>
          <div className="flex items-center justify-around px-4 pt-2" style={{
        paddingBottom: 'max(env(safe-area-inset-bottom), 8px)'
      }}>
            <button onClick={() => openUpload()} className="flex flex-col items-center justify-center gap-1 w-14 h-12 rounded-xl border border-gray-200 text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-colors touch-manipulation">
              <Upload size={20} />
              <span className="text-[9px] font-semibold leading-none">Upload</span>
            </button>

            <button onClick={() => openCamera()} className="flex flex-col items-center justify-center gap-1 w-16 h-14 rounded-2xl bg-violet-600 hover:bg-violet-700 text-white shadow-lg shadow-violet-600/30 transition-colors touch-manipulation" aria-label="Take a photo">
              <Camera size={24} />
              <span className="text-[9px] font-semibold leading-none">Camera</span>
            </button>

            <button onClick={handleEnterSelectionMode} className="flex flex-col items-center justify-center gap-1 w-14 h-12 rounded-xl text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-colors touch-manipulation">
              <CheckSquare size={20} />
              <span className="text-[9px] font-semibold leading-none">Select</span>
            </button>


          </div>
        </div>}
    </>;
}
