import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useNavigate } from "react-router";
import { Loader2, Copy, Check, X, ExternalLink, QrCode, Download, Upload, Share2, CheckSquare, Send, Camera, Trash2 } from 'lucide-react';
import { Helmet } from '@dr.pogodin/react-helmet';
import { motion, AnimatePresence } from 'motion/react';
import JobPhotos, { type JobPhotosHandle } from '@/components/JobPhotos';
import JobFeatureShell from '@/components/job/JobFeatureShell';
// qrcode is loaded lazily (dynamic import) to prevent its module-level
// constructor code from running on iOS Safari at page parse time, which
// causes "o is not a constructor" in the minified bundle.

interface Job {
  id: number;
  name: string;
  jobNumber?: string | null;
}
export default function JobPhotosPage() {
  const {
    id
  } = useParams<{
    id: string;
  }>();
  const navigate = useNavigate();
  const openCameraPage = () => navigate(`/jobs/${id}/camera`);
  const handleChangeJob = () => navigate('/?picker=photos');
  const jobId = Number(id);
  const photosRef = useRef<JobPhotosHandle>(null);
  const [job, setJob] = useState<Job | null>(null);
  const [loading, setLoading] = useState(true);

  // Mirror state from the JobPhotos handle so the bottom bar re-renders
  const [photoCount, setPhotoCount] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [selectMode, setSelectModeLocal] = useState(false);
  const [selectedCount, setSelectedCount] = useState(0);
  // View size is fixed to 'medium' — grid size picker removed

  // Share state
  const [shareUrl, setShareUrl] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [copiedQr, setCopiedQr] = useState(false);
  const qrCanvasRef = useRef<HTMLCanvasElement>(null);
  // Send-selected state
  const [sendMsg, setSendMsg] = useState<string | null>(null);
  useEffect(() => {
    if (!id) {
      setLoading(false);
      return;
    }
    fetch(`/api/jobs/${id}`, {
      credentials: 'include'
    }).then(async r => {
      const ct = r.headers.get('content-type') ?? '';
      if (!ct.includes('application/json')) {
        setLoading(false);
        return;
      }
      const data = (await r.json()) as {
        job?: Job;
      } | Job;
      const j = data && typeof data === 'object' && 'job' in data ? data.job : data as Job;
      setJob(j ?? null);
    }).catch(() => setJob(null)).finally(() => setLoading(false));
  }, [id]);
  const handleShareLink = useCallback((url: string) => {
    setShareUrl(url);
    setCopied(false);
    setCopiedQr(false);
    // Lazy-load qrcode so its module-level constructor code doesn't run at
    // page parse time on iOS Safari (causes "o is not a constructor").
    import('qrcode').then(mod => {
      const QRCode = mod.default ?? mod;
      return (QRCode as {
        toDataURL: (url: string, opts: object) => Promise<string>;
      }).toDataURL(url, {
        width: 300,
        margin: 2,
        color: {
          dark: '#111827',
          light: '#ffffff'
        }
      });
    }).then(setQrDataUrl).catch(() => setQrDataUrl(null));
  }, []);
  const copyLink = async () => {
    if (!shareUrl) return;
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2500);
    } catch {/* silent */}
  };
  const copyQr = async () => {
    if (!qrDataUrl) return;
    try {
      const res = await fetch(qrDataUrl);
      const blob = await res.blob();
      await navigator.clipboard.write([new ClipboardItem({
        'image/png': blob
      })]);
      setCopiedQr(true);
      setTimeout(() => setCopiedQr(false), 2500);
    } catch {/* silent */}
  };
  const downloadQr = () => {
    if (!qrDataUrl) return;
    const a = document.createElement('a');
    a.href = qrDataUrl;
    a.download = `job-${jobId}-share-qr.png`;
    a.click();
  };

  /**
   * Download selected photos.
   * On iOS Safari, <a download> is blocked — open each URL in a new tab instead.
   * On desktop, use the standard anchor-click approach.
   */
  const handleDownloadSelected = useCallback(() => {
    photosRef.current?.downloadSelected();
  }, []);

  /**
   * Send selected photos via Web Share API (iOS/Android native share sheet).
   * Falls back to copying the job share link if Web Share is unavailable.
   */
  const handleSendSelected = useCallback(async () => {
    setSendMsg(null);
    // Try Web Share API first (works on iOS Safari 15+, Android Chrome)
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({
          title: `${job?.name ?? 'Job'} — Photos`,
          text: `View photos for ${job?.name ?? 'this job'} on IWILLBUILD`,
          url: window.location.href
        });
        return;
      } catch {
        // User cancelled or share failed — fall through to copy
      }
    }
    // Fallback: generate a share link and copy it
    try {
      const res = await fetch(`/api/jobs/${jobId}/photos/share`, {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json'
        }
      });
      const data = (await res.json()) as {
        shareUrl?: string;
      };
      if (data.shareUrl) {
        await navigator.clipboard.writeText(data.shareUrl).catch(() => {});
        setSendMsg('Share link copied to clipboard');
        setTimeout(() => setSendMsg(null), 3000);
      }
    } catch {
      setSendMsg('Could not generate share link');
      setTimeout(() => setSendMsg(null), 3000);
    }
  }, [job, jobId]);

  // Sync select mode changes back to the handle
  const handleSetSelectMode = (v: boolean) => {
    setSelectModeLocal(v);
    photosRef.current?.setSelectMode(v);
    if (!v) setSelectedCount(0);
  };
  const atLimit = photoCount >= 200;
  const title = job ? `${job.name} — Photos` : 'Job Photos';
  return <div className="portal-page">
      <Helmet>
        <title>{title} — IWILLBUILD</title>
        <meta name="description" content="View and manage photos for this job." />
        <meta name="robots" content="noindex" />
        <link rel="canonical" href={`https://iwillbuild.com/jobs/${id}/photos`} />
      </Helmet>
      <h1 className="sr-only">{title}</h1>

      <div className="portal-content flex flex-col p-0">
        <JobFeatureShell
          Icon={Camera}
          featureLabel="Photos"
          jobName={job?.name ?? 'Job'}
          jobNumber={job?.jobNumber}
          backTo="/"
          onChangeJob={handleChangeJob}
          desktopActions={
            <div className="hidden md:flex items-center gap-1.5">
              {/* Upload */}
              <button onClick={() => photosRef.current?.openFilePicker()} disabled={uploading || atLimit} title="Upload photos" className="flex items-center justify-center w-8 h-8 border border-border hover:bg-muted disabled:opacity-50 text-foreground rounded-lg transition-colors">
                {uploading ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
              </button>
              {/* Camera */}
              <button onClick={openCameraPage} disabled={uploading || atLimit} title="Take a photo" className="flex items-center justify-center w-8 h-8 bg-primary hover:bg-violet-700 disabled:opacity-50 text-white rounded-lg transition-colors">
                <Camera size={16} />
              </button>
              {/* Select / Done */}
              {!selectMode
                ? <button onClick={() => handleSetSelectMode(true)} className="flex items-center gap-1.5 px-2.5 py-1 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-semibold rounded transition-colors">
                    <CheckSquare size={12} /> Select
                  </button>
                : <button onClick={() => { handleSetSelectMode(false); photosRef.current?.exitSelectMode(); }} className="flex items-center gap-1.5 px-2.5 py-1 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-semibold rounded transition-colors">
                    <X size={12} /> Done {selectedCount > 0 && `(${selectedCount})`}
                  </button>}
              {selectMode && selectedCount > 0 && <>
                <button onClick={() => photosRef.current?.deleteSelected()} className="flex items-center gap-1.5 px-2.5 py-1 bg-red-50 hover:bg-red-100 border border-red-200 text-red-700 text-xs font-semibold rounded transition-colors">
                  <Trash2 size={12} /> Delete
                </button>
                <button onClick={handleDownloadSelected} className="flex items-center gap-1.5 px-2.5 py-1 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-semibold rounded transition-colors">
                  <Download size={12} /> Download
                </button>
                <button onClick={() => void handleSendSelected()} className="flex items-center gap-1.5 px-2.5 py-1 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-semibold rounded transition-colors">
                  <Send size={12} /> Send
                </button>
              </>}
              {/* Share */}
              <button onClick={() => photosRef.current?.generateShareLink()} disabled={photoCount === 0} title="Share view-only link" className="flex items-center gap-1.5 px-2.5 py-1 bg-gray-100 hover:bg-gray-200 disabled:opacity-40 text-gray-700 text-xs font-semibold rounded transition-colors">
                <Share2 size={12} /> Share
              </button>
            </div>
          }
        >
        {/* ── Content ── */}
        {loading ? <div className="flex items-center justify-center py-20">
            <Loader2 size={24} className="animate-spin text-primary" />
          </div> : <div className="px-2 py-2 pb-28 sm:px-4 sm:py-4 md:pb-6">
            <JobPhotos ref={photosRef} jobId={jobId} onShareLink={handleShareLink} onPhotoCount={setPhotoCount} onUploading={setUploading} onSelectionChange={setSelectedCount} />
          </div>}

      {/* ── Mobile bottom action bar ── */}
      <div className="md:hidden fixed bottom-0 inset-x-0 z-20 bg-white border-t border-gray-200 safe-bottom" style={{
      overflowX: 'clip'
    }}>
        {/* Normal mode — Upload | Camera | Select | Share */}
        {!selectMode && <div className="flex items-center justify-around px-4 pt-2 pb-2">
            {/* Upload — icon only, no fill */}
            <button onClick={() => photosRef.current?.openFilePicker()} disabled={uploading || atLimit} title="Upload photos from library" className="flex flex-col items-center justify-center gap-1 w-14 h-12 rounded-xl border border-gray-200 text-gray-500 hover:text-gray-700 hover:bg-gray-100 disabled:opacity-40 transition-colors touch-manipulation">
              {uploading ? <Loader2 size={20} className="animate-spin" /> : <Upload size={20} />}
              <span className="text-[9px] font-semibold leading-none">Upload</span>
            </button>

            {/* Camera — purple, bigger */}
            <button onClick={openCameraPage} disabled={atLimit} title="Take a photo" className="flex flex-col items-center justify-center gap-1 w-16 h-14 rounded-2xl bg-primary hover:bg-violet-700 disabled:opacity-40 text-white shadow-lg shadow-primary/30 transition-colors touch-manipulation" aria-label="Take a photo">
              <Camera size={24} />
              <span className="text-[9px] font-semibold leading-none">Camera</span>
            </button>

            {/* Select */}
            <button onClick={() => handleSetSelectMode(true)} className="flex flex-col items-center justify-center gap-1 w-14 h-12 rounded-xl text-gray-500 hover:text-gray-700 hover:bg-gray-100 transition-colors touch-manipulation">
              <CheckSquare size={20} />
              <span className="text-[9px] font-semibold leading-none">Select</span>
            </button>

            {/* Share */}
            <button onClick={() => photosRef.current?.generateShareLink()} disabled={photoCount === 0} className="flex flex-col items-center justify-center gap-1 w-14 h-12 rounded-xl text-gray-500 hover:text-gray-700 hover:bg-gray-100 disabled:opacity-40 transition-colors touch-manipulation" title="Share view-only link">
              <Share2 size={20} />
              <span className="text-[9px] font-semibold leading-none">Share</span>
            </button>
          </div>}

        {/* Select mode */}
        {selectMode && <div className="flex flex-col">
            {sendMsg && <div className="flex items-center gap-2 px-4 py-2 bg-emerald-50 border-t border-emerald-200 text-xs text-emerald-700 font-medium">
                <Check size={12} className="shrink-0" />
                {sendMsg}
              </div>}
            <div className="flex items-center gap-2 px-3 pt-2 pb-2">
              {/* Done */}
              <button onClick={() => {
            handleSetSelectMode(false);
            photosRef.current?.exitSelectMode();
          }} className="flex flex-col items-center justify-center gap-0.5 px-3 py-2 rounded-lg border border-gray-200 bg-gray-50 hover:bg-gray-100 text-gray-600 transition-colors touch-manipulation shrink-0">
                <X size={16} />
                <span className="text-[10px] font-semibold leading-none">Done</span>
              </button>

              {/* Count label */}
              <div className="flex-1 text-center">
                <p className="text-sm font-semibold text-gray-800">
                  {selectedCount === 0 ? 'Tap to select' : `${selectedCount} selected`}
                </p>
              </div>

              {/* Delete selected */}
              <button onClick={() => photosRef.current?.deleteSelected()} disabled={selectedCount === 0} className="flex flex-col items-center justify-center gap-0.5 px-3 py-2 rounded-lg border border-gray-200 bg-gray-50 hover:bg-red-50 hover:border-red-200 disabled:opacity-40 text-gray-600 hover:text-red-600 transition-colors touch-manipulation shrink-0">
                <Trash2 size={16} />
                <span className="text-[10px] font-semibold leading-none">Delete</span>
              </button>

              {/* Download selected */}
              <button onClick={handleDownloadSelected} disabled={selectedCount === 0} className="flex flex-col items-center justify-center gap-0.5 px-3 py-2 rounded-lg border border-gray-200 bg-gray-50 hover:bg-gray-100 disabled:opacity-40 text-gray-600 transition-colors touch-manipulation shrink-0">
                <Download size={16} />
                <span className="text-[10px] font-semibold leading-none">Download</span>
              </button>

              {/* Send selected */}
              <button onClick={() => void handleSendSelected()} disabled={selectedCount === 0} className="flex flex-col items-center justify-center gap-0.5 px-3 py-2 rounded-lg border border-gray-200 bg-gray-50 hover:bg-gray-100 disabled:opacity-40 text-gray-600 transition-colors touch-manipulation shrink-0">
                <Send size={16} />
                <span className="text-[10px] font-semibold leading-none">Send</span>
              </button>
            </div>
          </div>}
      </div>

      {/* ── Share link sheet ── */}
      <AnimatePresence>
        {shareUrl && <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center p-4">
            <div className="absolute inset-0 bg-black/50" onClick={() => setShareUrl(null)} />
            <motion.div initial={{
          opacity: 0,
          y: 24
        }} animate={{
          opacity: 1,
          y: 0
        }} exit={{
          opacity: 0,
          y: 24
        }} transition={{
          duration: 0.2
        }} className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md p-6" style={{
          marginBottom: 'max(env(safe-area-inset-bottom), 0px)'
        }}>
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
                <button onClick={copyLink} className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold transition-colors ${copied ? 'bg-green-500 text-white' : 'bg-slate-900 hover:bg-slate-700 text-white'}`}>
                  {copied ? <><Check size={15} /> Copied!</> : <><Copy size={15} /> Copy Link</>}
                </button>
                <a href={shareUrl} target="_blank" rel="noopener noreferrer" className="flex items-center justify-center gap-1.5 px-4 py-2.5 border border-slate-200 bg-white hover:bg-slate-50 text-sm font-semibold text-slate-600 rounded-xl transition-colors">
                  <ExternalLink size={14} /> Preview
                </a>
              </div>
              <div className="border-t border-slate-100 pt-4">
                <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide mb-3 flex items-center gap-1.5">
                  <QrCode size={13} /> QR Code
                </p>
                {qrDataUrl ? <div className="flex items-center gap-4">
                    <div className="w-24 h-24 rounded-xl border border-slate-200 overflow-hidden shrink-0 bg-white p-1.5">
                      <img src={qrDataUrl} alt="QR code for share link" className="w-full h-full" />
                    </div>
                    <div className="flex flex-col gap-2 flex-1">
                      <button onClick={copyQr} className={`flex items-center justify-center gap-2 py-2 rounded-xl text-sm font-semibold transition-colors ${copiedQr ? 'bg-green-500 text-white' : 'bg-slate-100 hover:bg-slate-200 text-slate-700'}`}>
                        {copiedQr ? <><Check size={14} /> Copied!</> : <><Copy size={14} /> Copy QR</>}
                      </button>
                      <button onClick={downloadQr} className="flex items-center justify-center gap-2 py-2 rounded-xl text-sm font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 transition-colors">
                        <Download size={14} /> Download QR
                      </button>
                    </div>
                  </div> : <div className="flex items-center gap-2 text-xs text-slate-400">
                    <Loader2 size={13} className="animate-spin" /> Generating QR…
                  </div>}
              </div>
              <canvas ref={qrCanvasRef} className="hidden" />
            </motion.div>
          </div>}
      </AnimatePresence>
        </JobFeatureShell>
      </div>
    </div>;
}
