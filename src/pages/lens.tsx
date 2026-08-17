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
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import { Helmet } from '@dr.pogodin/react-helmet';
import {
  Camera, Search, X, ChevronLeft, ChevronRight,
  Lock, ImageOff, Loader2, Upload, CheckSquare, Home, Share2,
  LayoutGrid, Briefcase, Calendar, MapPin, ArrowUpDown,
  User, Clock, Download,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import LensUploadSheet from '@/components/lens/LensUploadSheet';
import LensJobPickerSheet, { type LensJobOption } from '@/components/lens/LensJobPickerSheet';
import LensSelectionBar from '@/components/lens/LensSelectionBar';
import LensGroupByJob from '@/components/lens/LensGroupByJob';
import LensSortByDate from '@/components/lens/LensSortByDate';
import LensGroupByLocation from '@/components/lens/LensGroupByLocation';
import { type LensPhoto, type LensResponse } from '@/components/lens/lensTypes';

// ── View mode ─────────────────────────────────────────────────────────────────

type ViewMode = 'all' | 'byJob' | 'byDate' | 'byLocation';
type DateOrder = 'newest' | 'oldest';

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString('en-AU', {
      day: '2-digit', month: 'short', year: 'numeric',
    });
  } catch {
    return '';
  }
}

function formatDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString('en-AU', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return '';
  }
}

function photoLabel(p: LensPhoto): string {
  return p.label ?? p.caption ?? p.originalName ?? `Photo ${p.id}`;
}

// ── Lightbox ──────────────────────────────────────────────────────────────────

interface LightboxProps {
  photos: LensPhoto[];
  index: number;
  onClose: () => void;
  onPrev: () => void;
  onNext: () => void;
  onOpenJob: (jobId: number) => void;
}

function Lightbox({ photos, index, onClose, onPrev, onNext, onOpenJob }: LightboxProps) {
  const photo = photos[index];
  if (!photo) return null;

  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if (e.key === 'Escape')      onClose();
      if (e.key === 'ArrowLeft')   onPrev();
      if (e.key === 'ArrowRight')  onNext();
    }
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose, onPrev, onNext]);

  const jobLabel = photo.jobNumber
    ? `#${photo.jobNumber} — ${photo.jobName}`
    : photo.jobName;

  return (
    <div
      className="fixed inset-0 z-50 flex bg-black/95"
      style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}
    >
      {/* ── Left: image area ── */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top bar */}
        <div className="flex items-center justify-between px-4 py-3 bg-black/60 shrink-0">
          <button
            onClick={onClose}
            className="text-white/80 hover:text-white transition-colors p-1 rounded min-w-[44px] min-h-[44px] flex items-center justify-center"
            aria-label="Close lightbox"
          >
            <X size={20} />
          </button>
          <span className="text-white/60 text-sm">
            {index + 1} / {photos.length}
          </span>
          {photo.status === 'locked' && (
            <div className="flex items-center gap-1 text-amber-400 text-xs font-medium">
              <Lock size={12} /> Locked
            </div>
          )}
        </div>

        {/* Image + prev/next */}
        <div className="flex-1 flex items-center justify-center relative overflow-hidden">
          {index > 0 && (
            <button
              onClick={onPrev}
              className="absolute left-2 md:left-4 z-10 bg-black/50 hover:bg-black/70 text-white rounded-full p-2 transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
              aria-label="Previous photo"
            >
              <ChevronLeft size={24} />
            </button>
          )}

          <img
            key={photo.downloadUrl}
            src={photo.downloadUrl}
            alt={photoLabel(photo)}
            className="max-w-full max-h-full object-contain"
            style={{ maxHeight: 'calc(100vh - 120px)' }}
            loading="eager"
          />

          {index < photos.length - 1 && (
            <button
              onClick={onNext}
              className="absolute right-2 md:right-4 z-10 bg-black/50 hover:bg-black/70 text-white rounded-full p-2 transition-colors min-w-[44px] min-h-[44px] flex items-center justify-center"
              aria-label="Next photo"
            >
              <ChevronRight size={24} />
            </button>
          )}
        </div>
      </div>

      {/* ── Right: metadata panel (desktop) ── */}
      <div className="hidden md:flex flex-col w-72 bg-black/80 border-l border-white/10 overflow-y-auto shrink-0">
        <div className="p-5 flex flex-col gap-4">
          <h3 className="text-white font-semibold text-sm truncate">{photoLabel(photo)}</h3>

          {/* Job */}
          {jobLabel && (
            <div className="flex flex-col gap-1">
              <span className="text-white/40 text-xs uppercase tracking-wide">Job</span>
              <button
                type="button"
                onClick={() => onOpenJob(photo.jobId)}
                className="flex items-center gap-2 text-violet-400 hover:text-violet-300 text-sm font-medium text-left transition-colors"
              >
                <Briefcase size={13} className="shrink-0" />
                <span className="truncate">{jobLabel}</span>
              </button>
            </div>
          )}

          {/* Address */}
          {photo.jobAddress && (
            <div className="flex flex-col gap-1">
              <span className="text-white/40 text-xs uppercase tracking-wide">Location</span>
              <div className="flex items-start gap-2 text-white/80 text-sm">
                <MapPin size={13} className="shrink-0 mt-0.5 text-white/40" />
                <span>{photo.jobAddress}</span>
              </div>
            </div>
          )}

          {/* Date/time */}
          <div className="flex flex-col gap-1">
            <span className="text-white/40 text-xs uppercase tracking-wide">Captured</span>
            <div className="flex items-center gap-2 text-white/80 text-sm">
              <Clock size={13} className="shrink-0 text-white/40" />
              {formatDateTime(photo.createdAt)}
            </div>
          </div>

          {/* Uploaded by */}
          {photo.uploadedByName && (
            <div className="flex flex-col gap-1">
              <span className="text-white/40 text-xs uppercase tracking-wide">Uploaded by</span>
              <div className="flex items-center gap-2 text-white/80 text-sm">
                <User size={13} className="shrink-0 text-white/40" />
                {photo.uploadedByName}
              </div>
            </div>
          )}

          {/* Caption */}
          {photo.caption && photo.caption !== photo.label && (
            <div className="flex flex-col gap-1">
              <span className="text-white/40 text-xs uppercase tracking-wide">Caption</span>
              <p className="text-white/80 text-sm leading-relaxed">{photo.caption}</p>
            </div>
          )}

          {/* Dimensions */}
          {photo.imageWidth && photo.imageHeight && (
            <div className="flex flex-col gap-1">
              <span className="text-white/40 text-xs uppercase tracking-wide">Dimensions</span>
              <span className="text-white/60 text-sm">{photo.imageWidth} × {photo.imageHeight}px</span>
            </div>
          )}

          {/* Actions */}
          <div className="flex flex-col gap-2 pt-2 border-t border-white/10">
            <a
              href={photo.downloadUrl}
              download
              className="flex items-center justify-center gap-2 min-h-[40px] rounded-lg bg-white/10 hover:bg-white/20 text-white text-sm font-medium transition-colors"
            >
              <Download size={14} /> Download
            </a>
            {jobLabel && (
              <button
                type="button"
                onClick={() => onOpenJob(photo.jobId)}
                className="flex items-center justify-center gap-2 min-h-[40px] rounded-lg border border-white/20 hover:bg-white/10 text-white/80 text-sm font-medium transition-colors"
              >
                <Briefcase size={14} /> Open Job
              </button>
            )}
          </div>
        </div>
      </div>

      {/* ── Mobile metadata strip (bottom) ── */}
      <div
        className="md:hidden absolute bottom-0 inset-x-0 bg-black/80 px-4 py-3 flex flex-col gap-1"
        style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 12px)' }}
      >
        <p className="text-white text-sm font-medium truncate">{photoLabel(photo)}</p>
        {jobLabel && (
          <button
            type="button"
            onClick={() => onOpenJob(photo.jobId)}
            className="flex items-center gap-1.5 text-violet-400 text-xs text-left"
          >
            <Briefcase size={11} />
            <span className="truncate">{jobLabel}</span>
          </button>
        )}
        {photo.jobAddress && (
          <div className="flex items-center gap-1.5 text-white/50 text-xs">
            <MapPin size={11} />
            <span className="truncate">{photo.jobAddress}</span>
          </div>
        )}
        <div className="flex items-center gap-3 text-white/40 text-xs mt-0.5">
          <span>{formatDate(photo.createdAt)}</span>
          {photo.uploadedByName && <span>· {photo.uploadedByName}</span>}
        </div>
      </div>
    </div>
  );
}

// ── Square PhotoCard (All Photos view) ────────────────────────────────────────

interface PhotoCardProps {
  photo: LensPhoto;
  onOpen: () => void;
  selectionMode: boolean;
  selected: boolean;
  onToggleSelect: (id: number) => void;
}

function PhotoCard({ photo, onOpen, selectionMode, selected, onToggleSelect }: PhotoCardProps) {
  const [imgError, setImgError] = useState(false);

  function handleClick() {
    if (selectionMode) onToggleSelect(photo.id);
    else onOpen();
  }

  return (
    <div
      className={`relative aspect-square overflow-hidden rounded-sm cursor-pointer bg-slate-200 ${
        selectionMode && selected ? 'ring-2 ring-violet-500 ring-offset-1' : ''
      }`}
      onClick={handleClick}
    >
      {imgError ? (
        <div className="absolute inset-0 flex items-center justify-center text-slate-400">
          <ImageOff size={24} />
        </div>
      ) : (
        <img
          src={photo.thumbnailUrl}
          alt={photoLabel(photo)}
          loading="lazy"
          className={`w-full h-full object-cover transition-transform duration-200 ${
            !selectionMode ? 'hover:scale-105' : ''
          }`}
          onError={() => setImgError(true)}
        />
      )}

      {/* Lock badge */}
      {photo.status === 'locked' && (
        <div className="absolute top-1 right-1 bg-black/60 text-white rounded-full p-1 pointer-events-none">
          <Lock size={9} />
        </div>
      )}

      {/* Selection overlay */}
      {selectionMode && (
        <div className="absolute inset-0 pointer-events-none">
          {selected && <div className="absolute inset-0 bg-violet-600/20" />}
          <div className={`absolute top-1.5 left-1.5 w-5 h-5 rounded flex items-center justify-center ${
            selected ? 'bg-violet-600 text-white' : 'bg-white/80 text-slate-400 border border-slate-300'
          }`}>
            {selected ? <CheckSquare size={12} /> : <CheckSquare size={12} className="opacity-0" />}
          </div>
        </div>
      )}
    </div>
  );
}

// ── View control button ───────────────────────────────────────────────────────

interface ViewBtnProps {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  title?: string;
}

function ViewBtn({ active, onClick, icon, label, title }: ViewBtnProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={title ?? label}
      className={`flex flex-col items-center justify-center gap-0.5 px-2 py-1.5 rounded-lg transition-colors min-w-[44px] min-h-[44px] ${
        active
          ? 'bg-violet-600 text-white'
          : 'text-slate-500 hover:bg-slate-100 hover:text-slate-700'
      }`}
    >
      {icon}
      <span className="text-[9px] font-semibold leading-none hidden sm:block">{label}</span>
    </button>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function LensPage() {
  const navigate  = useNavigate();
  const location  = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();

  // Filter state
  const [search, setSearch] = useState(searchParams.get('search') ?? '');

  // Data state
  const [photos,  setPhotos]  = useState<LensPhoto[]>([]);
  const [total,   setTotal]   = useState(0);
  const [page,    setPage]    = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  // View mode
  const [viewMode,   setViewMode]   = useState<ViewMode>('all');
  const [dateOrder,  setDateOrder]  = useState<DateOrder>('newest');

  // Lightbox — tracks photo + context array (for grouped views)
  const [lightboxPhotos, setLightboxPhotos] = useState<LensPhoto[]>([]);
  const [lightboxIndex,  setLightboxIndex]  = useState<number | null>(null);

  // Upload sheet — optional pre-seeded job
  const [uploadSheetOpen, setUploadSheetOpen] = useState(false);
  const [uploadInitialJob, setUploadInitialJob] = useState<LensJobOption | null>(null);

  // Camera job picker
  const [cameraJobPickerOpen, setCameraJobPickerOpen] = useState(false);

  // Selection
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds,   setSelectedIds]   = useState<Set<number>>(new Set());

  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const LIMIT = 96; // larger page for grouped views

  // ── Fetch ──────────────────────────────────────────────────────────────────
  const fetchPhotos = useCallback(async (pg: number, replace: boolean) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ page: String(pg), limit: String(LIMIT) });
      if (search) params.set('search', search);

      const r = await fetch(`/api/lens/photos?${params}`, { credentials: 'include' });
      if (!r.ok) {
        const body = await r.json().catch(() => ({})) as { error?: string };
        throw new Error(body.error ?? `HTTP ${r.status}`);
      }
      const data = await r.json() as LensResponse;
      setPhotos((prev) => replace ? data.photos : [...prev, ...data.photos]);
      setTotal(data.total);
      setHasMore(data.hasMore);
      setPage(pg);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load photos');
    } finally {
      setLoading(false);
    }
  }, [search]);

  // Initial load + search changes
  useEffect(() => {
    fetchPhotos(1, true);
    const p: Record<string, string> = {};
    if (search) p.search = search;
    setSearchParams(p, { replace: true });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  // Refresh on return from camera
  useEffect(() => {
    if (searchParams.get('refreshed') === '1') {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.delete('refreshed');
        return next;
      }, { replace: true });
      fetchPhotos(1, true);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.search]);

  // ── Handlers ──────────────────────────────────────────────────────────────
  function handleSearchChange(value: string) {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => setSearch(value), 350);
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
      state: { backPath: '/lens?refreshed=1' },
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
    const idx = contextPhotos.findIndex((p) => p.id === photo.id);
    setLightboxPhotos(contextPhotos);
    setLightboxIndex(idx >= 0 ? idx : 0);
  }

  function closeLightbox() {
    setLightboxIndex(null);
    setLightboxPhotos([]);
  }

  const prevPhoto = () => setLightboxIndex((i) => (i !== null && i > 0 ? i - 1 : i));
  const nextPhoto = () => setLightboxIndex((i) =>
    (i !== null && i < lightboxPhotos.length - 1 ? i + 1 : i)
  );

  // ── Selection ─────────────────────────────────────────────────────────────
  function handleToggleSelect(id: number) {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
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
  return (
    <>
      <Helmet>
        <title>Lens — IWILLBUILD</title>
        <meta name="description" content="Company-wide photo gallery. Browse, search and filter all job photos." />
        <meta name="robots" content="noindex" />
        <link rel="canonical" href="https://iwillbuild.com/lens" />
      </Helmet>

      {/* Upload sheet */}
      <LensUploadSheet
        open={uploadSheetOpen}
        onClose={() => { setUploadSheetOpen(false); setUploadInitialJob(null); }}
        onPhotoSynced={handlePhotoSynced}
        initialJob={uploadInitialJob}
      />

      {/* Camera job picker (global — used when no job pre-seeded) */}
      <LensJobPickerSheet
        open={cameraJobPickerOpen}
        title="Select a job"
        subtitle="Camera photos will be saved to this job"
        onSelect={handleCameraJobSelect}
        onClose={() => setCameraJobPickerOpen(false)}
      />

      {/* Lightbox */}
      {lightboxIndex !== null && (
        <Lightbox
          photos={lightboxPhotos}
          index={lightboxIndex}
          onClose={closeLightbox}
          onPrev={prevPhoto}
          onNext={nextPhoto}
          onOpenJob={handleOpenJob}
        />
      )}

      <div
        className="min-h-screen bg-slate-50"
        style={{
          paddingTop:    'env(safe-area-inset-top)',
          paddingLeft:   'env(safe-area-inset-left)',
          paddingRight:  'env(safe-area-inset-right)',
        }}
      >
        {/* ── Page header ─────────────────────────────────────────────────── */}
        <div className="bg-white border-b border-slate-200 sticky top-0 z-20">
          <div className="max-w-screen-2xl mx-auto px-3 py-2">
            <div className="flex items-center gap-2">

              {/* Home */}
              <button
                onClick={() => navigate('/home')}
                className="p-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors shrink-0 min-w-[40px] min-h-[40px] flex items-center justify-center"
                aria-label="Go to dashboard"
              >
                <Home size={18} />
              </button>

              {/* Title */}
              <div className="flex items-center gap-2 shrink-0">
                <div className="w-7 h-7 rounded-lg bg-violet-600 flex items-center justify-center">
                  <Camera size={14} className="text-white" />
                </div>
                <div className="hidden sm:block">
                  <h1 className="text-sm font-bold text-slate-900 leading-tight">Lens</h1>
                  {total > 0 && (
                    <p className="text-[10px] text-slate-400 leading-tight">
                      {total.toLocaleString()} photo{total !== 1 ? 's' : ''}
                    </p>
                  )}
                </div>
              </div>

              {/* Search */}
              <div className="flex-1 relative min-w-0">
                <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                <Input
                  type="search"
                  placeholder="Search photos, jobs…"
                  defaultValue={search}
                  onChange={(e) => handleSearchChange(e.target.value)}
                  className="pl-8 h-8 text-sm"
                />
              </div>

              {/* ── View controls ── */}
              <div className="flex items-center gap-0.5 shrink-0 bg-slate-100 rounded-xl p-1">
                <ViewBtn
                  active={viewMode === 'all'}
                  onClick={() => setViewMode('all')}
                  icon={<LayoutGrid size={15} />}
                  label="All"
                  title="All photos"
                />
                <ViewBtn
                  active={viewMode === 'byJob'}
                  onClick={() => setViewMode('byJob')}
                  icon={<Briefcase size={15} />}
                  label="Job"
                  title="Group by job"
                />
                <ViewBtn
                  active={viewMode === 'byDate'}
                  onClick={() => setViewMode('byDate')}
                  icon={<Calendar size={15} />}
                  label="Date"
                  title="Sort by date"
                />
                <ViewBtn
                  active={viewMode === 'byLocation'}
                  onClick={() => setViewMode('byLocation')}
                  icon={<MapPin size={15} />}
                  label="Place"
                  title="Group by location"
                />
              </div>

              {/* ── Desktop action buttons ── */}
              <div className="hidden md:flex items-center gap-1.5 shrink-0">
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 h-8"
                  onClick={() => openUpload()}
                >
                  <Upload size={13} />
                  <span className="hidden lg:inline">Upload</span>
                </Button>
                <Button
                  size="sm"
                  className="gap-1.5 h-8 bg-violet-600 hover:bg-violet-700 text-white"
                  onClick={() => openCamera()}
                >
                  <Camera size={13} />
                  <span className="hidden lg:inline">Camera</span>
                </Button>
                {!selectionMode ? (
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5 h-8"
                    onClick={handleEnterSelectionMode}
                  >
                    <CheckSquare size={13} />
                    <span className="hidden lg:inline">Select</span>
                  </Button>
                ) : (
                  <Button
                    variant="secondary"
                    size="sm"
                    className="gap-1.5 h-8 font-semibold"
                    onClick={handleCancelSelection}
                  >
                    <X size={13} />
                    <span className="hidden lg:inline">Cancel</span>
                  </Button>
                )}
              </div>
            </div>

            {/* Date order toggle — only shown in byDate view */}
            {viewMode === 'byDate' && (
              <div className="flex items-center gap-2 pt-2 pb-0.5">
                <button
                  type="button"
                  onClick={() => setDateOrder((o) => o === 'newest' ? 'oldest' : 'newest')}
                  className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700 transition-colors px-2 py-1 rounded-lg hover:bg-slate-100"
                >
                  <ArrowUpDown size={12} />
                  {dateOrder === 'newest' ? 'Newest first' : 'Oldest first'}
                </button>
              </div>
            )}
          </div>
        </div>

        {/* ── Gallery ─────────────────────────────────────────────────────── */}
        <div
          className="max-w-screen-2xl mx-auto px-3 py-3"
          style={{
            paddingBottom: selectionMode
              ? 'calc(env(safe-area-inset-bottom) + 80px)'
              : 'calc(max(env(safe-area-inset-bottom), 8px) + 72px)',
          }}
        >
          {/* Error */}
          {error && (
            <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 flex items-center gap-2">
              <X size={15} className="shrink-0" />
              {error}
              <Button variant="ghost" size="sm" className="ml-auto" onClick={() => fetchPhotos(1, true)}>
                Retry
              </Button>
            </div>
          )}

          {/* Loading — initial */}
          {loading && photos.length === 0 && (
            <div className="flex flex-col items-center justify-center py-24 gap-3 text-slate-400">
              <Loader2 size={32} className="animate-spin" />
              <p className="text-sm">Loading photos…</p>
            </div>
          )}

          {/* Empty state */}
          {!loading && !error && photos.length === 0 && (
            <div className="flex flex-col items-center justify-center py-24 gap-3 text-slate-400">
              <Camera size={40} className="text-slate-300" />
              <p className="text-base font-medium text-slate-500">
                {search ? 'No photos match your search' : 'No photos yet'}
              </p>
              {search && (
                <Button variant="outline" size="sm" onClick={() => setSearch('')}>
                  Clear search
                </Button>
              )}
            </div>
          )}

          {/* ── All Photos view ── */}
          {photos.length > 0 && viewMode === 'all' && (
            <div className="grid grid-cols-4 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 xl:grid-cols-10 2xl:grid-cols-12 gap-1">
              {photos.map((photo) => (
                <PhotoCard
                  key={photo.id}
                  photo={photo}
                  onOpen={() => openLightbox(photo, photos)}
                  selectionMode={selectionMode}
                  selected={selectedIds.has(photo.id)}
                  onToggleSelect={handleToggleSelect}
                />
              ))}
            </div>
          )}

          {/* ── Group by Job view ── */}
          {photos.length > 0 && viewMode === 'byJob' && (
            <LensGroupByJob
              photos={photos}
              onOpenPhoto={(photo, ctx) => openLightbox(photo, ctx)}
              onUpload={(job) => openUpload(job)}
              onCamera={(job) => openCamera(job)}
              selectionMode={selectionMode}
              selectedIds={selectedIds}
              onToggleSelect={handleToggleSelect}
            />
          )}

          {/* ── Sort by Date view ── */}
          {photos.length > 0 && viewMode === 'byDate' && (
            <LensSortByDate
              photos={photos}
              order={dateOrder}
              onOpenPhoto={(photo, ctx) => openLightbox(photo, ctx)}
              selectionMode={selectionMode}
              selectedIds={selectedIds}
              onToggleSelect={handleToggleSelect}
            />
          )}

          {/* ── Group by Location view ── */}
          {photos.length > 0 && viewMode === 'byLocation' && (
            <LensGroupByLocation
              photos={photos}
              onOpenPhoto={(photo, ctx) => openLightbox(photo, ctx)}
              selectionMode={selectionMode}
              selectedIds={selectedIds}
              onToggleSelect={handleToggleSelect}
            />
          )}

          {/* Load more (All Photos only — grouped views show all loaded photos) */}
          {viewMode === 'all' && hasMore && (
            <div className="mt-5 flex justify-center">
              <Button
                variant="outline"
                onClick={handleLoadMore}
                disabled={loading}
                className="gap-2"
              >
                {loading ? <Loader2 size={14} className="animate-spin" /> : null}
                Load more
              </Button>
            </div>
          )}

          {/* Auto-load more for grouped views */}
          {viewMode !== 'all' && hasMore && !loading && (
            <div className="mt-4 flex justify-center">
              <Button
                variant="ghost"
                size="sm"
                onClick={handleLoadMore}
                className="text-slate-400 text-xs gap-1"
              >
                <Loader2 size={12} />
                Load more photos
              </Button>
            </div>
          )}

          {/* Loading — append */}
          {loading && photos.length > 0 && (
            <div className="mt-4 flex justify-center">
              <Loader2 size={20} className="animate-spin text-slate-400" />
            </div>
          )}

          {/* End of results */}
          {!hasMore && photos.length > 0 && !loading && (
            <p className="mt-5 text-center text-xs text-slate-400">
              {total.toLocaleString()} photo{total !== 1 ? 's' : ''} total
            </p>
          )}
        </div>

        {/* ── Selection bar ────────────────────────────────────────────────── */}
        {selectionMode && (
          <LensSelectionBar
            selectedIds={selectedIds}
            visiblePhotoIds={photos.map((p) => p.id)}
            onSetSelection={setSelectedIds}
            onCancel={handleCancelSelection}
            onExportSuccess={handleExportSuccess}
          />
        )}
      </div>

      {/* ── Mobile bottom action bar ─────────────────────────────────────── */}
      {!selectionMode && (
        <div
          className="md:hidden fixed bottom-0 inset-x-0 z-20 bg-white border-t border-gray-200"
          style={{ overflowX: 'clip' }}
        >
          <div
            className="flex items-center justify-around px-4 pt-2"
            style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 8px)' }}
          >
            <button
              onClick={() => openUpload()}
              className="flex flex-col items-center justify-center gap-1 w-14 h-12 rounded-xl border border-gray-200 text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-colors touch-manipulation"
            >
              <Upload size={20} />
              <span className="text-[9px] font-semibold leading-none">Upload</span>
            </button>

            <button
              onClick={() => openCamera()}
              className="flex flex-col items-center justify-center gap-1 w-16 h-14 rounded-2xl bg-violet-600 hover:bg-violet-700 text-white shadow-lg shadow-violet-600/30 transition-colors touch-manipulation"
              aria-label="Take a photo"
            >
              <Camera size={24} />
              <span className="text-[9px] font-semibold leading-none">Camera</span>
            </button>

            <button
              onClick={handleEnterSelectionMode}
              className="flex flex-col items-center justify-center gap-1 w-14 h-12 rounded-xl text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-colors touch-manipulation"
            >
              <CheckSquare size={20} />
              <span className="text-[9px] font-semibold leading-none">Select</span>
            </button>

            <button
              onClick={handleEnterSelectionMode}
              disabled={total === 0}
              className="flex flex-col items-center justify-center gap-1 w-14 h-12 rounded-xl text-gray-500 hover:text-gray-700 hover:bg-gray-100 disabled:opacity-40 transition-colors touch-manipulation"
            >
              <Share2 size={20} />
              <span className="text-[9px] font-semibold leading-none">Share</span>
            </button>
          </div>
        </div>
      )}
    </>
  );
}
