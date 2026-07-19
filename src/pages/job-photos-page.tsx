import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Camera, Loader2, Copy, Check, X, ExternalLink, QrCode, Download, House } from 'lucide-react';
import { Helmet } from '@dr.pogodin/react-helmet';
import { motion, AnimatePresence } from 'motion/react';
import JobPhotos from '@/components/JobPhotos';
import QRCode from 'qrcode';

interface Job {
  id: number;
  name: string;
  jobNumber?: string | null;
}

export default function JobPhotosPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const jobId = Number(id);

  const [job, setJob] = useState<Job | null>(null);
  const [loading, setLoading] = useState(true);

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
    // Generate QR code data URL
    QRCode.toDataURL(url, { width: 300, margin: 2, color: { dark: '#111827', light: '#ffffff' } })
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

  const title = job ? `${job.name} — Photos` : 'Job Photos';

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <Helmet>
        <title>{title} — IWILLBUILD</title>
        <meta name="description" content="View and manage photos for this job." />
        <meta name="robots" content="noindex, nofollow" />
        <link rel="canonical" href={`https://iwillbuild.com/jobs/${id}/photos`} />
      </Helmet>

      {/* ── Desktop top bar (md+) ── */}
      <div
        className="hidden md:flex bg-white border-b border-gray-100 px-4 py-3 items-center gap-3 shrink-0"
        style={{ boxShadow: '0 1px 0 rgba(0,0,0,0.05)' }}
      >
        <button
          onClick={() => navigate(`/jobs/${id}`)}
          className="w-9 h-9 rounded-xl bg-gray-100 flex items-center justify-center text-gray-600 hover:bg-gray-200 active:bg-gray-300 transition-colors shrink-0"
        >
          <ArrowLeft size={18} />
        </button>
        <div className="flex items-center gap-2.5 flex-1 min-w-0">
          <div className="w-8 h-8 rounded-xl bg-orange-100 flex items-center justify-center shrink-0">
            <Camera size={15} className="text-orange-500" />
          </div>
          <div className="min-w-0">
            {loading ? (
              <div className="h-4 w-32 bg-gray-200 rounded animate-pulse" />
            ) : (
              <>
                {/* Breadcrumb: Home > Jobs > Job Name > Photos */}
                <div className="flex items-center gap-1 text-xs text-gray-400 leading-tight">
                  <button onClick={() => navigate('/home')} className="hover:text-orange-500 transition-colors flex items-center gap-0.5" title="Dashboard"><House size={11} /></button>
                  <span>/</span>
                  <button onClick={() => navigate('/jobs')} className="hover:text-orange-500 transition-colors">Jobs</button>
                  <span>/</span>
                  <button onClick={() => navigate(`/jobs/${id}`)} className="hover:text-orange-500 transition-colors truncate max-w-[120px]">{job?.name ?? '...'}</button>
                  <span>/</span>
                  <span className="text-gray-600 font-medium">Photos</span>
                </div>
                <h1 className="text-gray-900 font-bold text-sm leading-tight truncate">
                  {job?.name ?? 'Job Photos'}
                </h1>
              </>
            )}
          </div>
        </div>
      </div>

      {/* ── Mobile: back arrow floats top-left ── */}
      <button
        onClick={() => navigate(`/jobs/${id}`)}
        className="md:hidden fixed top-3 left-3 z-20 w-9 h-9 rounded-xl bg-white/90 backdrop-blur-sm shadow-sm border border-gray-100 flex items-center justify-center text-gray-600 active:bg-gray-100 transition-colors"
        aria-label="Back"
      >
        <ArrowLeft size={18} />
      </button>
      {/* ── Mobile: Dashboard button ── */}
      <button
        onClick={() => navigate('/home')}
        className="md:hidden fixed top-3 left-14 z-20 w-9 h-9 rounded-xl bg-orange-50/90 backdrop-blur-sm shadow-sm border border-orange-200 flex items-center justify-center text-orange-500 active:bg-orange-100 transition-colors"
        aria-label="Dashboard"
      >
        <House size={16} />
      </button>
      <div className="flex-1 overflow-y-auto pb-0 md:pb-0">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 size={24} className="animate-spin text-orange-400" />
          </div>
        ) : (
          /* Mobile: no bottom padding here — bottom bar handles safe area */
          <div className="px-4 py-4 pb-24 md:pb-4">
            <JobPhotos jobId={jobId} onShareLink={handleShareLink} />
          </div>
        )}
      </div>

      {/* ── Mobile bottom bar (hidden on md+) ── */}
      <div
        className="md:hidden fixed bottom-0 inset-x-0 z-10 bg-white border-t border-gray-100"
        style={{ boxShadow: '0 -1px 0 rgba(0,0,0,0.05)', paddingBottom: 'env(safe-area-inset-bottom)' }}
      >
        <div className="flex items-center gap-3 px-4 py-3">
          <div className="w-8 h-8 rounded-xl bg-orange-100 flex items-center justify-center shrink-0">
            <Camera size={15} className="text-orange-500" />
          </div>
          <div className="flex-1 min-w-0">
            {loading ? (
              <div className="h-4 w-32 bg-gray-200 rounded animate-pulse" />
            ) : (
              <>
                <p className="text-gray-900 font-bold text-sm leading-tight truncate">
                  {job?.name ?? 'Job Photos'}
                </p>
                {job?.jobNumber && (
                  <p className="text-gray-400 text-xs font-mono leading-tight">{job.jobNumber}</p>
                )}
              </>
            )}
          </div>
        </div>
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
            >
              {/* Header */}
              <div className="flex items-center justify-between mb-1">
                <h3 className="font-heading font-bold text-base text-slate-900">Share Link Generated</h3>
                <button onClick={() => setShareUrl(null)} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 transition-colors">
                  <X size={16} />
                </button>
              </div>
              <p className="text-sm text-slate-500 mb-4">
                Anyone with this link can view the photos for this job. Valid for 90 days.
              </p>

              {/* URL row */}
              <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-xl px-3 py-2.5 mb-3">
                <span className="flex-1 text-xs text-slate-600 font-mono truncate">{shareUrl}</span>
              </div>

              {/* Copy link + Preview */}
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

              {/* QR Code section */}
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

              {/* hidden canvas for QR generation fallback */}
              <canvas ref={qrCanvasRef} className="hidden" />
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
