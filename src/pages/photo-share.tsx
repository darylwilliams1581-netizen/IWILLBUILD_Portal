/**
 * /photos/share/:token — Public read-only photo gallery
 * No login required. Token-validated, 90-day expiry.
 */
import { useState, useEffect, useCallback } from 'react';
import { useParams } from "react-router";
import { Helmet } from '@dr.pogodin/react-helmet';
import { motion, AnimatePresence } from 'motion/react';
import { Camera, ChevronLeft, ChevronRight, X, Download, Loader2, Lock, AlertCircle, Calendar, Building2, ImageOff, ZoomIn } from 'lucide-react';
interface SharePhoto {
  id: number;
  filename: string;
  originalName: string | null;
  label: string | null;
  createdAt: string | null;
  url: string | null;
  thumbnailUrl: string | null;
  previewUrl: string | null;
}

/** Resolve the best available URL for a photo — signed URL if present, proxy fallback otherwise */
function photoUrl(token: string, photo: SharePhoto): string | null {
  if (photo.url) return photo.url;
  return `/api/public/job-photos/${token}/photo/${photo.id}`;
}

/** Thumbnail URL for grid — falls back to full URL */
function thumbUrl(token: string, photo: SharePhoto): string | null {
  return photo.thumbnailUrl ?? photoUrl(token, photo);
}

/** Preview URL for lightbox — falls back to full URL */
function prevUrl(token: string, photo: SharePhoto): string | null {
  return photo.previewUrl ?? photoUrl(token, photo);
}
interface ShareData {
  job: {
    id: number;
    name: string;
    jobNumber: string | null;
  };
  photos: SharePhoto[];
  expiresAt: string | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatDate(iso: string | null) {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString('en-AU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  });
}
function ErrorShell({
  icon,
  title,
  body
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
      <div className="bg-white rounded-2xl shadow-sm border border-slate-100 p-8 max-w-sm w-full text-center">
        <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center mx-auto mb-4">
          {icon}
        </div>
        <h1 className="font-heading font-bold text-lg text-slate-900 mb-2">{title}</h1>
        <p className="text-sm text-slate-500">{body}</p>
        <p className="text-xs text-slate-400 mt-4">Powered by IWIllBUILD</p>
      </div>
    </div>;
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function PhotoSharePage() {
  const {
    token
  } = useParams<{
    token: string;
  }>();
  const [data, setData] = useState<ShareData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [lightbox, setLightbox] = useState<number | null>(null);
  useEffect(() => {
    if (!token) return;
    fetch(`/api/public/job-photos/${token}`).then(async r => {
      const ct = r.headers.get('content-type') ?? '';
      if (!ct.includes('application/json')) throw new Error('Link not found or expired');
      const json = (await r.json()) as ShareData & {
        error?: string;
      };
      if (!r.ok) throw new Error(json.error ?? 'Link not found or expired');
      return json;
    }).then(setData).catch((e: Error) => setError(e.message)).finally(() => setLoading(false));
  }, [token]);

  // ── Lightbox keyboard nav ──────────────────────────────────────────────────
  const photos = data?.photos ?? [];
  const prev = useCallback(() => {
    setLightbox(i => i === null ? null : (i - 1 + photos.length) % photos.length);
  }, [photos.length]);
  const next = useCallback(() => {
    setLightbox(i => i === null ? null : (i + 1) % photos.length);
  }, [photos.length]);
  useEffect(() => {
    if (lightbox === null) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') prev();else if (e.key === 'ArrowRight') next();else if (e.key === 'Escape') setLightbox(null);
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [lightbox, prev, next]);

  // ── States ─────────────────────────────────────────────────────────────────

  if (loading) {
    return <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Loader2 size={28} className="animate-spin text-violet-400" />
      </div>;
  }
  if (error || !data) {
    const isExpired = error.toLowerCase().includes('expir');
    return <ErrorShell icon={isExpired ? <Lock size={22} className="text-slate-400" /> : <AlertCircle size={22} className="text-slate-400" />} title={isExpired ? 'Link expired' : 'Link not found'} body={isExpired ? 'This photo gallery link has expired. Ask the site team to generate a new one.' : 'This link is invalid or has been removed.'} />;
  }
  const {
    job,
    expiresAt
  } = data;
  const tok = token ?? '';
  return <>
      <Helmet>
        <title>{job.name} — Photos · IWIllBUILD</title>
        <meta name="description" content={`View site photos for ${job.name}${job.jobNumber ? ` (${job.jobNumber})` : ''}.`} />
        <meta name="robots" content="noindex, nofollow" />
        <link rel="canonical" href={`https://iwillbuild.com/photos/share/${token}`} />
      </Helmet>

      <div className="min-h-screen bg-slate-50">

        {/* ── Desktop header (md+) ── */}
        <div className="hidden md:block bg-white border-b border-slate-100 sticky top-0 z-10" style={{
        boxShadow: '0 1px 0 rgba(0,0,0,0.05)'
      }}>
          <div className="max-w-5xl mx-auto px-4 py-3 flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-violet-100 flex items-center justify-center shrink-0">
              <Camera size={16} className="text-violet-600" />
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="font-heading font-bold text-sm text-slate-900 truncate leading-tight">
                {job.name}
              </h1>
              <div className="flex items-center gap-3 flex-wrap">
                {job.jobNumber && <span className="text-xs text-slate-400 font-mono">{job.jobNumber}</span>}
                <span className="text-xs text-slate-400">{photos.length} photo{photos.length !== 1 ? 's' : ''}</span>
                {expiresAt && <span className="text-xs text-slate-400 flex items-center gap-1">
                    <Calendar size={10} />
                    Expires {formatDate(expiresAt)}
                  </span>}
              </div>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <Building2 size={12} className="text-slate-300" />
              <span className="text-xs text-slate-400 font-semibold">IWIllBUILD</span>
            </div>
          </div>
        </div>

        {/* ── Gallery ── */}
        <div className="max-w-5xl mx-auto px-2 py-2 md:px-4 md:py-5 pb-28 md:pb-8">
          {photos.length === 0 ? <div className="flex flex-col items-center justify-center py-24 text-center">
              <div className="w-14 h-14 rounded-2xl bg-slate-100 flex items-center justify-center mb-4">
                <ImageOff size={22} className="text-slate-300" />
              </div>
              <p className="text-sm font-semibold text-slate-500">No photos yet</p>
              <p className="text-xs text-slate-400 mt-1">Photos will appear here once uploaded by the site team.</p>
            </div> : <div className="grid grid-cols-3 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-1 md:gap-2">
              {photos.map((photo, idx) => <motion.button key={photo.id} initial={{
            opacity: 0,
            scale: 0.97
          }} animate={{
            opacity: 1,
            scale: 1
          }} transition={{
            duration: 0.2,
            delay: Math.min(idx * 0.03, 0.4)
          }} onClick={() => setLightbox(idx)} className="group relative aspect-square rounded-lg md:rounded-xl overflow-hidden bg-slate-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-violet-400">
                  {photoUrl(tok, photo) ? <img src={thumbUrl(tok, photo)!} alt={photo.label ?? photo.originalName ?? `Photo ${idx + 1}`} className="w-full h-full object-cover transition-transform duration-300 group-hover:scale-105" loading={idx < 9 ? 'eager' : 'lazy'} width={300} height={300} decoding="async" /> : <div className="w-full h-full flex items-center justify-center">
                      <ImageOff size={18} className="text-slate-300" />
                    </div>}
                  {/* Hover overlay */}
                  <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 transition-colors pointer-events-none flex items-center justify-center">
                    <ZoomIn size={18} className="text-white opacity-0 group-hover:opacity-100 transition-opacity drop-shadow" />
                  </div>
                  {/* Label badge */}
                  {photo.label && <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/60 to-transparent px-2 py-1.5 pointer-events-none">
                      <p className="text-white text-[10px] font-semibold truncate">{photo.label}</p>
                    </div>}
                </motion.button>)}
            </div>}
        </div>

        {/* ── Desktop footer ── */}
        <div className="hidden md:block max-w-5xl mx-auto px-4 pb-8 pt-2 text-center">
          <p className="text-xs text-slate-300">Shared via IWIllBUILD · View only</p>
        </div>

        {/* ── Mobile bottom bar (hidden on md+) ── */}
        <div className="md:hidden fixed bottom-0 inset-x-0 z-10 bg-white border-t border-slate-100" style={{
        boxShadow: '0 -1px 0 rgba(0,0,0,0.05)',
        paddingBottom: 'env(safe-area-inset-bottom)'
      }}>
          <div className="flex items-center gap-3 px-4 py-3">
            <div className="w-8 h-8 rounded-xl bg-violet-100 flex items-center justify-center shrink-0">
              <Camera size={15} className="text-violet-600" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-heading font-bold text-sm text-slate-900 truncate leading-tight">{job.name}</p>
              <div className="flex items-center gap-2 flex-wrap">
                {job.jobNumber && <span className="text-xs text-slate-400 font-mono">{job.jobNumber}</span>}
                <span className="text-xs text-slate-400">{photos.length} photo{photos.length !== 1 ? 's' : ''}</span>
                {expiresAt && <span className="text-xs text-slate-400 flex items-center gap-1">
                    <Calendar size={10} /> Expires {formatDate(expiresAt)}
                  </span>}
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <Building2 size={11} className="text-slate-300" />
              <span className="text-[10px] text-slate-500 font-semibold">IWIllBUILD</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Lightbox ── */}
      <AnimatePresence>
        {lightbox !== null && photos[lightbox] && <motion.div initial={{
        opacity: 0
      }} animate={{
        opacity: 1
      }} exit={{
        opacity: 0
      }} transition={{
        duration: 0.18
      }} className="fixed inset-0 z-50 bg-black/90 flex flex-col" onClick={() => setLightbox(null)}>
            {/* Top bar */}
            <div className="flex items-center justify-between px-4 py-3 shrink-0" onClick={e => e.stopPropagation()}>
              <span className="text-white/60 text-sm font-semibold">
                {lightbox + 1} / {photos.length}
              </span>
              <div className="flex items-center gap-2">
                {photoUrl(tok, photos[lightbox]) && <a href={photoUrl(tok, photos[lightbox])!} download={photos[lightbox].originalName ?? `photo-${photos[lightbox].id}.jpg`} target="_blank" rel="noopener noreferrer" className="w-9 h-9 rounded-xl bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors" onClick={e => e.stopPropagation()}>
                    <Download size={16} />
                  </a>}
                <button onClick={() => setLightbox(null)} className="w-9 h-9 rounded-xl bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors">
                  <X size={16} />
                </button>
              </div>
            </div>

            {/* Image */}
            <div className="flex-1 flex items-center justify-center px-12 min-h-0" onClick={e => e.stopPropagation()}>
              <motion.img key={lightbox} initial={{
            opacity: 0,
            scale: 0.97
          }} animate={{
            opacity: 1,
            scale: 1
          }} transition={{
            duration: 0.15
          }} src={prevUrl(tok, photos[lightbox]) ?? ''} alt={photos[lightbox].label ?? photos[lightbox].originalName ?? `Photo ${lightbox + 1}`} className="max-w-full max-h-full object-contain rounded-lg select-none" draggable={false} />
            </div>

            {/* Caption */}
            {(photos[lightbox].label || photos[lightbox].originalName) && <div className="shrink-0 px-4 py-2 text-center" onClick={e => e.stopPropagation()}>
                <p className="text-white/70 text-sm truncate">
                  {photos[lightbox].label ?? photos[lightbox].originalName}
                </p>
                {photos[lightbox].createdAt && <p className="text-white/40 text-xs mt-0.5">{formatDate(photos[lightbox].createdAt)}</p>}
              </div>}

            {/* Prev / Next */}
            {photos.length > 1 && <>
                <button onClick={e => {
            e.stopPropagation();
            prev();
          }} className="absolute left-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-xl bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors" aria-label="Previous photo">
                  <ChevronLeft size={20} />
                </button>
                <button onClick={e => {
            e.stopPropagation();
            next();
          }} className="absolute right-2 top-1/2 -translate-y-1/2 w-10 h-10 rounded-xl bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors" aria-label="Next photo">
                  <ChevronRight size={20} />
                </button>
              </>}
          </motion.div>}
      </AnimatePresence>
    </>;
}
