/**
 * /lens — Lens Phase 2: company-wide photo gallery with Upload and Camera.
 *
 * Phase 2 adds:
 *   - Upload photos: job picker → multi-file picker → usePhotoUploadQueue
 *   - Camera: job picker → navigate to /jobs/:id/camera with backPath=/lens
 *
 * All upload logic reuses the existing job photo pipeline:
 *   usePhotoUploadQueue → POST /api/jobs/:jobId/photos → job_photos + media_assets
 *
 * Camera return: ?from=lens on the camera URL causes it to pass
 *   location.state.backPath = '/lens' so the back button returns here.
 *   On return, the gallery refreshes automatically.
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useSearchParams, useLocation } from 'react-router-dom';
import { Helmet } from '@dr.pogodin/react-helmet';
import {
  Camera, Search, X, ChevronLeft, ChevronRight,
  Lock, Calendar, Briefcase, ImageOff, Loader2,
  ExternalLink, Filter, Upload, CheckSquare, Square, Home,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import LensUploadSheet from '@/components/lens/LensUploadSheet';
import LensJobPickerSheet, { type LensJobOption } from '@/components/lens/LensJobPickerSheet';
import LensSelectionBar from '@/components/lens/LensSelectionBar';

// ── Types ─────────────────────────────────────────────────────────────────────

interface LensPhoto {
  id: number;
  jobId: number;
  jobNumber: string | null;
  jobName: string | null;
  label: string | null;
  caption: string | null;
  originalName: string | null;
  mimeType: string | null;
  imageWidth: number | null;
  imageHeight: number | null;
  uploadedByName: string | null;
  createdAt: string;
  status: string;
  lockedAt: string | null;
  lockedByName: string | null;
  mediaAssetId: number | null;
  thumbnailUrl: string;
  downloadUrl: string;
}

interface LensResponse {
  photos: LensPhoto[];
  page: number;
  limit: number;
  total: number;
  hasMore: boolean;
}

interface JobOption {
  id: number;
  number: string | null;
  name: string;
}

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

  // Keyboard navigation
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft')  onPrev();
      if (e.key === 'ArrowRight') onNext();
    }
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose, onPrev, onNext]);

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-black/95"
      style={{ paddingTop: 'env(safe-area-inset-top)', paddingBottom: 'env(safe-area-inset-bottom)' }}
      onClick={onClose}
    >
      {/* Header */}
      <div
        className="flex items-center justify-between px-4 py-3 bg-black/60 shrink-0"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={onClose}
            className="text-white/80 hover:text-white transition-colors p-1 rounded"
            aria-label="Close lightbox"
          >
            <X size={20} />
          </button>
          <div className="min-w-0">
            <p className="text-white text-sm font-medium truncate">{photoLabel(photo)}</p>
            {photo.jobName && (
              <p className="text-white/60 text-xs truncate">
                {photo.jobNumber ? `${photo.jobNumber} — ` : ''}{photo.jobName}
              </p>
            )}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {photo.status === 'locked' && (
            <Badge variant="secondary" className="text-xs gap-1">
              <Lock size={10} /> Locked
            </Badge>
          )}
          <Button
            size="sm"
            variant="outline"
            className="text-xs border-white/30 text-white hover:bg-white/10 hover:text-white"
            onClick={() => onOpenJob(photo.jobId)}
          >
            <ExternalLink size={12} className="mr-1" />
            Open Job
          </Button>
        </div>
      </div>

      {/* Image */}
      <div
        className="flex-1 flex items-center justify-center relative overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Prev */}
        {index > 0 && (
          <button
            onClick={onPrev}
            className="absolute left-2 md:left-4 z-10 bg-black/50 hover:bg-black/70 text-white rounded-full p-2 transition-colors"
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

        {/* Next */}
        {index < photos.length - 1 && (
          <button
            onClick={onNext}
            className="absolute right-2 md:right-4 z-10 bg-black/50 hover:bg-black/70 text-white rounded-full p-2 transition-colors"
            aria-label="Next photo"
          >
            <ChevronRight size={24} />
          </button>
        )}
      </div>

      {/* Footer */}
      <div
        className="px-4 py-2 bg-black/60 text-white/60 text-xs flex items-center gap-4 shrink-0"
        onClick={(e) => e.stopPropagation()}
      >
        <span>{index + 1} / {photos.length}</span>
        {photo.uploadedByName && <span>By {photo.uploadedByName}</span>}
        <span>{formatDate(photo.createdAt)}</span>
      </div>
    </div>
  );
}

// ── Thumbnail card ────────────────────────────────────────────────────────────

interface PhotoCardProps {
  photo: LensPhoto;
  onOpen: () => void;
  onOpenJob: (jobId: number) => void;
  /** Selection mode props — undefined when selection mode is off */
  selectionMode?: boolean;
  selected?: boolean;
  onToggleSelect?: (id: number) => void;
}

function PhotoCard({ photo, onOpen, onOpenJob, selectionMode, selected, onToggleSelect }: PhotoCardProps) {
  const [imgError, setImgError] = useState(false);
  const isLocked = photo.status === 'locked';

  const aspectStyle = photo.imageWidth && photo.imageHeight
    ? { aspectRatio: `${photo.imageWidth} / ${photo.imageHeight}` }
    : { aspectRatio: '4 / 3' };

  // In selection mode: clicking the card toggles selection; preview via separate button
  function handleCardClick() {
    if (selectionMode) {
      onToggleSelect?.(photo.id);
    } else {
      onOpen();
    }
  }

  return (
    <div
      className={`group relative bg-slate-100 rounded-lg overflow-hidden border transition-colors cursor-pointer ${
        selectionMode && selected
          ? 'border-violet-500 ring-2 ring-violet-400'
          : 'border-slate-200 hover:border-violet-300'
      }`}
      onClick={handleCardClick}
    >
      {/* Thumbnail */}
      <div
        className="relative overflow-hidden bg-slate-200"
        style={aspectStyle}
      >
        {imgError ? (
          <div className="absolute inset-0 flex items-center justify-center text-slate-400">
            <ImageOff size={28} />
          </div>
        ) : (
          <img
            src={photo.thumbnailUrl}
            alt={photoLabel(photo)}
            loading="lazy"
            className={`w-full h-full object-cover transition-transform duration-300 ${
              selectionMode ? '' : 'group-hover:scale-105'
            }`}
            onError={() => setImgError(true)}
            {...(photo.imageWidth && photo.imageHeight
              ? { width: photo.imageWidth, height: photo.imageHeight }
              : {})}
          />
        )}

        {/* Selection checkbox overlay */}
        {selectionMode && (
          <div className="absolute inset-0 pointer-events-none">
            {/* Dim overlay when selected */}
            {selected && <div className="absolute inset-0 bg-violet-600/20" />}
            {/* Checkbox top-left */}
            <div className={`absolute top-1.5 left-1.5 w-6 h-6 rounded-md flex items-center justify-center ${
              selected ? 'bg-violet-600 text-white' : 'bg-white/80 text-slate-400 border border-slate-300'
            }`}>
              {selected
                ? <CheckSquare size={14} />
                : <Square size={14} />
              }
            </div>
          </div>
        )}

        {/* Lock badge */}
        {isLocked && (
          <div className="absolute top-1.5 right-1.5 bg-black/60 text-white rounded-full p-1">
            <Lock size={10} />
          </div>
        )}

        {/* Preview button in selection mode */}
        {selectionMode && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onOpen(); }}
            className="absolute bottom-1.5 right-1.5 bg-black/60 hover:bg-black/80 text-white rounded-full p-1.5 transition-colors pointer-events-auto"
            aria-label="Preview photo"
            title="Preview"
          >
            <ExternalLink size={11} />
          </button>
        )}

        {/* Hover overlay (non-selection mode only) */}
        {!selectionMode && (
          <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors pointer-events-none" />
        )}
      </div>

      {/* Meta */}
      <div className="p-2">
        <p className="text-xs font-medium text-slate-700 truncate leading-tight">
          {photoLabel(photo)}
        </p>
        {photo.jobName && (
          <button
            className="mt-0.5 text-xs text-violet-600 hover:text-violet-800 truncate w-full text-left flex items-center gap-1"
            onClick={(e) => { e.stopPropagation(); onOpenJob(photo.jobId); }}
            title={`Open ${photo.jobName}`}
          >
            <Briefcase size={10} className="shrink-0" />
            <span className="truncate">
              {photo.jobNumber ? `${photo.jobNumber} — ` : ''}{photo.jobName}
            </span>
          </button>
        )}
        <p className="mt-0.5 text-xs text-slate-400 flex items-center gap-1">
          <Calendar size={10} className="shrink-0" />
          {formatDate(photo.createdAt)}
        </p>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function LensPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();

  // Filter state — initialised from URL params for deep-linking
  const [search,   setSearch]   = useState(searchParams.get('search')   ?? '');
  const [jobId,    setJobId]    = useState(searchParams.get('jobId')    ?? '');
  const [dateFrom, setDateFrom] = useState(searchParams.get('dateFrom') ?? '');
  const [dateTo,   setDateTo]   = useState(searchParams.get('dateTo')   ?? '');

  // Data state
  const [photos,  setPhotos]  = useState<LensPhoto[]>([]);
  const [total,   setTotal]   = useState(0);
  const [page,    setPage]    = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  // Jobs list for the filter dropdown
  const [jobs, setJobs] = useState<JobOption[]>([]);

  // Lightbox
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);

  // Filter panel visibility (mobile)
  const [filtersOpen, setFiltersOpen] = useState(false);

  // ── Phase 2: Upload + Camera state ────────────────────────────────────────
  const [uploadSheetOpen, setUploadSheetOpen] = useState(false);
  const [cameraJobPickerOpen, setCameraJobPickerOpen] = useState(false);

  // ── Phase 3: Selection state ───────────────────────────────────────────────
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds,   setSelectedIds]   = useState<Set<number>>(new Set());

  // Debounce search
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const LIMIT = 48;

  // ── Fetch jobs for filter dropdown ────────────────────────────────────────
  useEffect(() => {
    fetch('/api/studio/jobs?limit=500', { credentials: 'include' })
      .then((r) => r.ok ? r.json() : null)
      .then((d) => {
        if (d?.jobs) {
          setJobs(
            (d.jobs as Array<{ id: number; jobNumber?: string | null; name: string }>)
              .map((j) => ({ id: j.id, number: j.jobNumber ?? null, name: j.name }))
          );
        }
      })
      .catch(() => {/* non-critical */});
  }, []);

  // ── Fetch photos ──────────────────────────────────────────────────────────
  const fetchPhotos = useCallback(async (pg: number, replace: boolean) => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({ page: String(pg), limit: String(LIMIT) });
      if (search)   params.set('search',   search);
      if (jobId)    params.set('jobId',    jobId);
      if (dateFrom) params.set('dateFrom', dateFrom);
      if (dateTo)   params.set('dateTo',   dateTo);

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
  }, [search, jobId, dateFrom, dateTo]);

  // Initial load + filter changes
  useEffect(() => {
    fetchPhotos(1, true);
    // Sync URL params
    const p: Record<string, string> = {};
    if (search)   p.search   = search;
    if (jobId)    p.jobId    = jobId;
    if (dateFrom) p.dateFrom = dateFrom;
    if (dateTo)   p.dateTo   = dateTo;
    setSearchParams(p, { replace: true });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search, jobId, dateFrom, dateTo]);

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

  function clearFilters() {
    setSearch('');
    setJobId('');
    setDateFrom('');
    setDateTo('');
  }

  const hasActiveFilters = !!(search || jobId || dateFrom || dateTo);

  // ── Phase 2: Upload photo synced → refresh gallery ────────────────────────
  const handlePhotoSynced = useCallback((_serverPhotoId: number) => {
    // Refresh from page 1 to pick up the new photo at the top
    fetchPhotos(1, true);
  }, [fetchPhotos]);

  // ── Phase 2: Camera — navigate to /jobs/:id/camera with backPath ──────────
  function handleCameraJobSelect(job: LensJobOption) {
    setCameraJobPickerOpen(false);
    navigate(`/jobs/${job.id}/camera`, {
      state: { backPath: '/lens?refreshed=1' },
    });
  }

  // ── Phase 2: Refresh gallery when returning from camera ───────────────────
  useEffect(() => {
    if (searchParams.get('refreshed') === '1') {
      // Remove the param so it doesn't persist on subsequent navigations
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        next.delete('refreshed');
        return next;
      }, { replace: true });
      fetchPhotos(1, true);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.search]);

  // ── Phase 3: Selection handlers ───────────────────────────────────────────
  function handleToggleSelect(id: number) {
    setSelectedIds(prev => {
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

  // ── Lightbox helpers ──────────────────────────────────────────────────────
  const openLightbox  = (idx: number) => setLightboxIndex(idx);
  const closeLightbox = () => setLightboxIndex(null);
  const prevPhoto     = () => setLightboxIndex((i) => (i !== null && i > 0 ? i - 1 : i));
  const nextPhoto     = () => setLightboxIndex((i) => (i !== null && i < photos.length - 1 ? i + 1 : i));

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <>
      <Helmet>
        <title>Lens — IWILLBUILD</title>
        <meta name="description" content="Company-wide photo gallery. Browse, search and filter all job photos." />
        <meta name="robots" content="noindex" />
        <link rel="canonical" href="https://iwillbuild.com/lens" />
      </Helmet>

      {/* ── Phase 2: Upload sheet ──────────────────────────────────────────── */}
      <LensUploadSheet
        open={uploadSheetOpen}
        onClose={() => setUploadSheetOpen(false)}
        onPhotoSynced={handlePhotoSynced}
      />

      {/* ── Phase 2: Camera job picker ─────────────────────────────────────── */}
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
          photos={photos}
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
          paddingBottom: 'env(safe-area-inset-bottom)',
        }}
      >
        {/* ── Page header ─────────────────────────────────────────────────── */}
        <div className="bg-white border-b border-slate-200 sticky top-0 z-20">
          <div className="max-w-screen-2xl mx-auto px-4 py-3">
            <div className="flex items-center gap-3">
              {/* Home button */}
              <button
                onClick={() => navigate('/')}
                className="p-2 -ml-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors shrink-0"
                aria-label="Go to home"
              >
                <Home size={20} />
              </button>

              {/* Title */}
              <div className="flex items-center gap-2 shrink-0">
                <div className="w-8 h-8 rounded-lg bg-violet-600 flex items-center justify-center">
                  <Camera size={16} className="text-white" />
                </div>
                <div>
                  <h1 className="text-base font-bold text-slate-900 leading-tight">Lens</h1>
                  {total > 0 && (
                    <p className="text-xs text-slate-500 leading-tight">
                      {total.toLocaleString()} photo{total !== 1 ? 's' : ''}
                    </p>
                  )}
                </div>
              </div>

              {/* Search */}
              <div className="flex-1 relative min-w-0">
                <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                <Input
                  type="search"
                  placeholder="Search photos, jobs…"
                  defaultValue={search}
                  onChange={(e) => handleSearchChange(e.target.value)}
                  className="pl-8 h-8 text-sm"
                />
              </div>

              {/* ── Phase 2: Upload + Camera action buttons ── */}
              <div className="flex items-center gap-2 shrink-0">
                <Button
                  variant="outline"
                  size="sm"
                  className="gap-1.5 min-h-[44px] sm:min-h-0"
                  onClick={() => setUploadSheetOpen(true)}
                  title="Upload photos"
                >
                  <Upload size={14} />
                  <span className="hidden sm:inline">Upload</span>
                </Button>
                <Button
                  variant="default"
                  size="sm"
                  className="gap-1.5 min-h-[44px] sm:min-h-0 bg-violet-600 hover:bg-violet-700"
                  onClick={() => setCameraJobPickerOpen(true)}
                  title="Open camera"
                >
                  <Camera size={14} />
                  <span className="hidden sm:inline">Camera</span>
                </Button>
                {/* ── Phase 3: Select button ── */}
                {!selectionMode ? (
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5 min-h-[44px] sm:min-h-0"
                    onClick={handleEnterSelectionMode}
                    title="Select photos"
                  >
                    <CheckSquare size={14} />
                    <span className="hidden sm:inline">Select</span>
                  </Button>
                ) : (
                  <Button
                    variant="secondary"
                    size="sm"
                    className="gap-1.5 min-h-[44px] sm:min-h-0 font-semibold"
                    onClick={handleCancelSelection}
                    title="Cancel selection"
                  >
                    <X size={14} />
                    <span className="hidden sm:inline">Cancel</span>
                  </Button>
                )}
              </div>

              {/* Filter toggle */}
              <Button
                variant={filtersOpen || hasActiveFilters ? 'default' : 'outline'}
                size="sm"
                className="shrink-0 gap-1.5 min-h-[44px] sm:min-h-0"
                onClick={() => setFiltersOpen((v) => !v)}
              >
                <Filter size={14} />
                <span className="hidden sm:inline">Filters</span>
                {hasActiveFilters && (
                  <span className="bg-white/30 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center font-bold">
                    {[search, jobId, dateFrom, dateTo].filter(Boolean).length}
                  </span>
                )}
              </Button>
            </div>

            {/* Filter row */}
            {filtersOpen && (
              <div className="mt-3 flex flex-wrap gap-2 items-end pb-1">
                {/* Job filter */}
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-slate-500 font-medium">Job</label>
                  <select
                    value={jobId}
                    onChange={(e) => setJobId(e.target.value)}
                    className="h-8 text-sm border border-slate-200 rounded-md px-2 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-violet-500"
                  >
                    <option value="">All jobs</option>
                    {jobs.map((j) => (
                      <option key={j.id} value={String(j.id)}>
                        {j.number ? `${j.number} — ` : ''}{j.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Date from */}
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-slate-500 font-medium">From</label>
                  <input
                    type="date"
                    value={dateFrom}
                    onChange={(e) => setDateFrom(e.target.value)}
                    className="h-8 text-sm border border-slate-200 rounded-md px-2 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-violet-500"
                  />
                </div>

                {/* Date to */}
                <div className="flex flex-col gap-1">
                  <label className="text-xs text-slate-500 font-medium">To</label>
                  <input
                    type="date"
                    value={dateTo}
                    onChange={(e) => setDateTo(e.target.value)}
                    className="h-8 text-sm border border-slate-200 rounded-md px-2 bg-white text-slate-700 focus:outline-none focus:ring-2 focus:ring-violet-500"
                  />
                </div>

                {/* Clear */}
                {hasActiveFilters && (
                  <Button variant="ghost" size="sm" onClick={clearFilters} className="gap-1 text-slate-500">
                    <X size={12} /> Clear
                  </Button>
                )}
              </div>
            )}
          </div>
        </div>

        {/* ── Gallery ─────────────────────────────────────────────────────── */}
        <div
          className="max-w-screen-2xl mx-auto px-4 py-4"
          style={{ paddingBottom: selectionMode ? 'calc(env(safe-area-inset-bottom) + 80px)' : undefined }}
        >

          {/* Error */}
          {error && (
            <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700 flex items-center gap-2">
              <X size={16} className="shrink-0" />
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
                {hasActiveFilters ? 'No photos match your filters' : 'No photos yet'}
              </p>
              {hasActiveFilters && (
                <Button variant="outline" size="sm" onClick={clearFilters}>
                  Clear filters
                </Button>
              )}
            </div>
          )}

          {/* Grid */}
          {photos.length > 0 && (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-8 gap-3">
              {photos.map((photo, idx) => (
                <PhotoCard
                  key={photo.id}
                  photo={photo}
                  onOpen={() => openLightbox(idx)}
                  onOpenJob={handleOpenJob}
                  selectionMode={selectionMode}
                  selected={selectedIds.has(photo.id)}
                  onToggleSelect={handleToggleSelect}
                />
              ))}
            </div>
          )}

          {/* Load more */}
          {hasMore && (
            <div className="mt-6 flex justify-center">
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

          {/* Loading — append */}
          {loading && photos.length > 0 && (
            <div className="mt-4 flex justify-center">
              <Loader2 size={20} className="animate-spin text-slate-400" />
            </div>
          )}

          {/* End of results */}
          {!hasMore && photos.length > 0 && !loading && (
            <p className="mt-6 text-center text-xs text-slate-400">
              {total.toLocaleString()} photo{total !== 1 ? 's' : ''} total
            </p>
          )}
        </div>

        {/* ── Phase 3: Selection bar ───────────────────────────────────────── */}
        {selectionMode && (
          <LensSelectionBar
            selectedIds={selectedIds}
            visiblePhotoIds={photos.map(p => p.id)}
            onSetSelection={setSelectedIds}
            onCancel={handleCancelSelection}
            onExportSuccess={handleExportSuccess}
          />
        )}
      </div>
    </>
  );
}
