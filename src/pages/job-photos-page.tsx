import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import {
  ArrowLeft, Loader2, Copy, Check, X, ExternalLink, QrCode,
  Download, Home, Upload, Share2, LayoutGrid, List, CheckSquare, Send,
  Grid2x2, Grid3x3,
} from 'lucide-react';
import { Helmet } from '@dr.pogodin/react-helmet';
import { motion, AnimatePresence } from 'motion/react';
import JobPhotos, { type JobPhotosHandle } from '@/components/JobPhotos';
// qrcode is loaded lazily (dynamic import) to prevent its module-level
// constructor code from running on iOS Safari at page parse time, which
// causes "o is not a constructor" in the minified bundle.

interface Job {
  id: number;
  name: string;
  jobNumber?: string | null;
}

export default function JobPhotosPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const jobId = Number(id);

  const photosRef = useRef<JobPhotosHandle>(null);

  const [job, setJob] = useState<Job | null>(null);
  const [loading, setLoading] = useState(true);

  // Mirror state from the JobPhotos handle so the bottom bar re-renders
  const [photoCount, setPhotoCount] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [selectMode, setSelectModeLocal] = useState(false);
  const [selectedCount, setSelectedCount] = useState(0);
  const [viewSize, setViewSizeLocal] = useState<'small' | 'medium' | 'large'>(() => {
    try {
      const saved = localStorage.getItem('jobPhotosZoom');
      if (saved === 'small' || saved === 'medium' || saved === 'large') return saved;
    } catch (_) {}
    return 'medium';
  });

  // Share sheet state
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [copiedQr, setCopiedQr] = useState(false);
  const qrCanvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!id) { setLoading(false); return; }
    fetch(`/api/jobs/${id}`, { credentials: 'include' })
      .then(async r => {
        const ct = r.headers.get('content-type') ?? '';
        if (!ct.includes('application/json')) { setLoading(false); return; }
        const data = await r.json() as { job?: Job } | Job;
        const j = data && typeof data === 'object' && 'job' in data ? data.job : data as Job;
        setJob(j ?? null);
      })
      .catch(() => setJob(null))
      .finally(() => setLoading(false));
  }, [id]);

  const handleShareLink = useCallback((url: string) => {
    setShareUrl(url);
    setCopied(false);
    setCopiedQr(false);
    // Lazy-load qrcode so its module-level constructor code doesn't run at
    // page parse time on iOS Safari (causes "o is not a constructor").
    import('qrcode').then((mod) => {
      const QRCode = mod.default ?? mod;
      return (QRCode as { toDataURL: (url: string, opts: object) => Promise<string> })
        .toDataURL(url, { width: 300, margin: 2, color: { dark: '#111827', light: '#ffffff' } });
    })
      .then(setQrDataUrl)
      .catch(() => setQrDataUrl(null));
  }, []);

  const copyLink = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch { /* silent */ }
  };

  const copyQr = async () => {
    if (!qrDataUrl) return;
    try {
      const res = await fetch(qrDataUrl);
      const blob = await res.blob();
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      setCopiedQr(true);
      setTimeout(() => setCopiedQr(false), 2500);
    } catch { /* silent */ }
  };

  const downloadQr = () => {
    if (!qrDataUrl) return;
    const a = document.createElement('a');
    a.href = qrDataUrl;
    a.download = `job-${jobId}-share-qr.png`;
    a.click();
  };

  // Sync select mode changes back to the handle
  const handleSetSelectMode = (v: boolean) => {
    setSelectModeLocal(v);
    photosRef.current?.setSelectMode(v);
    if (!v) setSelectedCount(0);
  };

  const handleSetViewSize = (s: 'small' | 'medium' | 'large') => {
    setViewSizeLocal(s);
    photosRef.current?.setViewSize(s);
  };

  const atLimit = photoCount >= 200;
  const title = job ? `${job.name} — Photos` : 'Job Photos';

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <Helmet>
        <title>{title} — IWILLBUILD</title>
        <meta name="description" content="View and manage photos for this job." />
        <meta name="robots" content="noindex, nofollow" />
        <link rel="canonical" href={`https://iwillbuild.com/jobs/${id}/photos`} />
      </Helmet>

      {/* ── Safe-area top bar ── */}
      <div
        className="bg-white border-b border-gray-100 shrink-0 sticky top-0 z-10"
        style={{
          boxShadow: '0 1px 0 rgba(0,0,0,0.05)',
          paddingTop: 'max(env(safe-area-inset-top), 12px)',
        }}
      >
        <div className="flex items-center gap-2 px-3 pb-3">
          {/* Back — desktop only */}
          <button
            onClick={() => navigate(`/jobs/${id}`)}
            className="hidden md:flex w-9 h-9 rounded-xl bg-gray-100 items-center justify-center text-gray-600 hover:bg-gray-200 active:bg-gray-300 transition-colors shrink-0 touch-manipulation"
            aria-label="Back"
          >
            <ArrowLeft size={18} />
          </button>

          {/* Home — desktop only */}
          <button
            onClick={() => navigate('/home')}
            className="hidden md:flex w-9 h-9 rounded-xl bg-orange-50 border border-orange-200 items-center justify-center text-orange-500 hover:bg-orange-100 active:bg-orange-200 transition-colors shrink-0 touch-manipulation"
            aria-label="Dashboard"
          >
            <Home size={16} />
          </button>

          {/* Title — centered on mobile, left-aligned on desktop */}
          <div className="flex-1 min-w-0 flex flex-col items-center md:items-start px-1">
            {loading ? (
              <div className="h-4 w-32 bg-gray-200 rounded animate-pulse" />
            ) : (
              <>
                <h1 className="text-gray-900 font-bold text-sm leading-tight truncate text-center md:text-left w-full">
                  {job?.name ?? 'Job Photos'}
                </h1>
                <p className="text-xs text-gray-400 leading-tight">
                  {job?.jobNumber ? `${job.jobNumber} · ` : ''}{photoCount} photo{photoCount !== 1 ? 's' : ''}
                </p>
              </>
            )}
          </div>

          {/* Desktop-only: view size toggle */}
          <div className="hidden md:flex items-center border border-slate-200 rounded-lg overflow-hidden bg-white shrink-0">
            {(['small', 'medium', 'large'] as const).map((size) => (
              <button
                key={size}
                onClick={() => handleSetViewSize(size)}
                className={`px-2.5 py-1.5 text-xs font-semibold transition-colors ${viewSize === size ? 'bg-slate-800 text-white' : 'text-slate-500 hover:bg-slate-50'}`}
                title={`${size.charAt(0).toUpperCase() + size.slice(1)} thumbnails`}
              >
                {size === 'small' ? <Grid3x3 size={13} /> : size === 'medium' ? <Grid2x2 size={13} /> : <LayoutGrid size={13} />}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── Content ── */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 size={24} className="animate-spin text-orange-400" />
          </div>
        ) : (
          <div className="px-2 py-2 pb-36 sm:px-4 sm:py-4">
            <JobPhotos
              ref={photosRef}
              jobId={jobId}
              onShareLink={handleShareLink}
              onPhotoCount={setPhotoCount}
              onUploading={setUploading}
              onSelectionChange={setSelectedCount}
            />
          </div>
        )}
      </div>

      {/* ── Mobile bottom action bar ── */}
      <div
        className="fixed bottom-0 inset-x-0 z-20 bg-white border-t border-gray-100"
        style={{
          boxShadow: '0 -2px 12px rgba(0,0,0,0.08)',
          paddingBottom: 'max(env(safe-area-inset-bottom), 8px)',
        }}
      >
        {/* Normal mode */}
        {!selectMode && (
          <div className="flex items-center gap-2 px-3 pt-2 pb-1">

            {/* Back — mobile only */}
            <button
              onClick={() => navigate(`/jobs/${id}`)}
              aria-label="Back"
              className="md:hidden w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center text-gray-600 active:bg-gray-200 transition-colors touch-manipulation shrink-0"
            >
              <ArrowLeft size={16} />
            </button>

            {/* Home — mobile only */}
            <button
              onClick={() => navigate('/home')}
              aria-label="Dashboard"
              className="md:hidden w-10 h-10 rounded-xl bg-orange-50 border border-orange-200 flex items-center justify-center text-orange-500 active:bg-orange-100 transition-colors touch-manipulation shrink-0"
            >
              <Home size={16} />
            </button>

            {/* Choose Files — single orange upload button for all */}
            <button
              onClick={() => photosRef.current?.openFilePicker()}
              disabled={uploading || atLimit}
              className="w-12 h-12 flex items-center justify-center bg-primary hover:bg-orange-600 disabled:opacity-50 text-white rounded-xl transition-colors touch-manipulation shrink-0"
              aria-label="Upload photos"
            >
              {uploading ? <Loader2 size={18} className="animate-spin" /> : <Upload size={18} />}
            </button>

            {/* Select */}
            <button
              onClick={() => handleSetSelectMode(true)}
              className="flex flex-col items-center justify-center gap-0.5 px-3 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 transition-colors touch-manipulation shrink-0"
            >
              <CheckSquare size={16} />
              <span className="text-[10px] font-semibold leading-none">Select</span>
            </button>

            {/* Share */}
            <button
              onClick={() => photosRef.current?.generateShareLink()}
              disabled={photoCount === 0}
              className="flex flex-col items-center justify-center gap-0.5 px-3 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 text-slate-600 transition-colors touch-manipulation shrink-0"
              title="Share view-only link"
            >
              <Share2 size={16} />
              <span className="text-[10px] font-semibold leading-none">Share</span>
            </button>

            {/* View size (mobile) */}
            <div className="flex flex-col items-center gap-0.5 shrink-0">
              <div className="flex items-center border border-slate-200 rounded-lg overflow-hidden bg-white">
                {(['small', 'medium', 'large'] as const).map((size) => (
                  <button
                    key={size}
                    onClick={() => handleSetViewSize(size)}
                    className={`px-2 py-1.5 text-xs font-semibold transition-colors touch-manipulation ${viewSize === size ? 'bg-slate-800 text-white' : 'text-slate-500 hover:bg-slate-50'}`}
                  >
                    {size === 'small' ? <Grid3x3 size={12} /> : size === 'medium' ? <Grid2x2 size={12} /> : <LayoutGrid size={12} />}
                  </button>
                ))}
              </div>
              <span className="text-[9px] text-slate-400 font-semibold leading-none">View</span>
            </div>
          </div>
        )}

        {/* Select mode */}
        {selectMode && (
          <div className="flex items-center gap-2 px-3 pt-2 pb-1">
            {/* Done */}
            <button
              onClick={() => { handleSetSelectMode(false); photosRef.current?.exitSelectMode(); }}
              className="flex flex-col items-center justify-center gap-0.5 px-3 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 transition-colors touch-manipulation shrink-0"
            >
              <X size={16} />
              <span className="text-[10px] font-semibold leading-none">Done</span>
            </button>

            {/* Count label */}
            <div className="flex-1 text-center">
              <p className="text-sm font-semibold text-slate-700">
                {selectedCount === 0 ? 'Tap to select' : `${selectedCount} selected`}
              </p>
            </div>

            {/* Download selected */}
            <button
              onClick={() => photosRef.current?.downloadSelected()}
              disabled={selectedCount === 0}
              className="flex flex-col items-center justify-center gap-0.5 px-3 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 text-slate-600 transition-colors touch-manipulation shrink-0"
            >
              <Download size={16} />
              <span className="text-[10px] font-semibold leading-none">Download</span>
            </button>

            {/* Send selected */}
            <button
              disabled={selectedCount === 0}
              className="flex flex-col items-center justify-center gap-0.5 px-3 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 disabled:opacity-40 text-slate-600 transition-colors touch-manipulation shrink-0"
            >
              <Send size={16} />
              <span className="text-[10px] font-semibold leading-none">Send</span>
            </button>
          </div>
        )}
      </div>

      {/* ── Share link sheet ── */}
      <AnimatePresence>
        {shareUrl && (
          <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center p-4">
            <div className="absolute inset-0 bg-black/50" onClick={() => setShareUrl(null)} />
            <motion.div
              initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 24 }} transition={{ duration: 0.2 }}
              className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md p-6"
              style={{ marginBottom: 'max(env(safe-area-inset-bottom), 0px)' }}
            >
              <div className="flex items-center justify-between mb-1">
                <h3 className="font-heading font-bold text-base text-slate-900">Share Link Generated</h3>
                <button onClick={() => setShareUrl(null)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 transition-colors">
                  <X size={16} />
                </button>
              </div>
              <p className="text-sm text-slate-500 mb-4">
                Anyone with this link can view the photos for this job. Valid for 90 days.
              </p>
              <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 mb-3">
                <span className="flex-1 text-xs text-slate-600 font-mono truncate">{shareUrl}</span>
              </div>
              <div className="flex items-center gap-2 mb-4">
                <button
                  onClick={copyLink}
                  className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-colors ${
                    copied ? 'bg-green-500 text-white' : 'bg-slate-900 hover:bg-slate-700 text-white'
                  }`}
                >
                  {copied ? <><Check size={15} /> Copied!</> : <><Copy size={15} /> Copy Link</>}
                </button>
                <a
                  href={shareUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-center gap-1.5 px-4 py-2.5 border border-slate-200 bg-white hover:bg-slate-50 text-sm font-semibold text-slate-600 rounded-xl transition-colors"
                >
                  <ExternalLink size={14} /> Preview
                </a>
              </div>
              <div className="border-t border-slate-100 pt-4">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3 flex items-center gap-1.5">
                  <QrCode size={13} /> QR Code
                </p>
                {qrDataUrl ? (
                  <div className="flex items-center gap-4">
                    <div className="w-24 h-24 rounded-xl border border-slate-200 overflow-hidden shrink-0 bg-white p-1.5">
                      <img src={qrDataUrl} alt="QR code for share link" className="w-full h-full" />
                    </div>
                    <div className="flex flex-col gap-2 flex-1">
                      <button
                        onClick={copyQr}
                        className={`flex items-center justify-center gap-2 py-2 rounded-xl text-sm font-semibold transition-colors ${
                          copiedQr ? 'bg-green-500 text-white' : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                        }`}
                      >
                        {copiedQr ? <><Check size={14} /> Copied!</> : <><Copy size={14} /> Copy QR</>}
                      </button>
                      <button
                        onClick={downloadQr}
                        className="flex items-center justify-center gap-2 py-2 rounded-xl text-sm font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors"
                      >
                        <Download size={14} /> Download QR
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-xs text-slate-400">
                    <Loader2 size={13} className="animate-spin" /> Generating QR…
                  </div>
                )}
              </div>
              <canvas ref={qrCanvasRef} className="hidden" />
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
