/**
 * JobPhotosTab
 *
 * Embeds the full photos experience (grid + toolbar) inside the job-detail
 * tab panel so it stays within the sidebar layout — no full-screen navigate.
 */
import { useState, useRef, useCallback } from 'react';
import {
  Upload, CheckSquare, X, Download, Send, Share2,
  Grid2x2, Grid3x3, LayoutGrid, Loader2, Copy, Check,
  QrCode, ExternalLink,
} from 'lucide-react';
import JobPhotos, { type JobPhotosHandle } from '@/components/JobPhotos';

type ViewSize = 'small' | 'medium' | 'large';

interface Props {
  jobId: number;
  jobName?: string;
}

export default function JobPhotosTab({ jobId, jobName }: Props) {
  const photosRef = useRef<JobPhotosHandle>(null);

  const [photoCount, setPhotoCount]       = useState(0);
  const [uploading, setUploading]         = useState(false);
  const [selectMode, setSelectModeLocal]  = useState(false);
  const [selectedCount, setSelectedCount] = useState(0);
  const [viewSize, setViewSizeLocal]      = useState<ViewSize>(() => {
    try {
      const s = localStorage.getItem('jobPhotosZoom');
      if (s === 'small' || s === 'medium' || s === 'large') return s;
    } catch (_) {}
    return window.innerWidth < 768 ? 'small' : 'medium';
  });

  // Share / QR state
  const [shareUrl, setShareUrl]   = useState<string | null>(null);
  const [copied, setCopied]       = useState(false);
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
  const [copiedQr, setCopiedQr]   = useState(false);
  const [sendMsg, setSendMsg]     = useState<string | null>(null);

  const atLimit = photoCount >= 200;

  // ── Handlers ────────────────────────────────────────────────────────────────
  const handleSetSelectMode = (v: boolean) => {
    setSelectModeLocal(v);
    photosRef.current?.setSelectMode(v);
    if (!v) setSelectedCount(0);
  };

  const handleSetViewSize = (s: ViewSize) => {
    setViewSizeLocal(s);
    photosRef.current?.setViewSize(s);
  };

  const handleShareLink = useCallback((url: string) => {
    setShareUrl(url);
    setCopied(false);
    setCopiedQr(false);
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
    try { await navigator.clipboard.writeText(shareUrl); setCopied(true); setTimeout(() => setCopied(false), 2500); } catch { /* silent */ }
  };

  const copyQr = async () => {
    if (!qrDataUrl) return;
    try {
      const blob = await (await fetch(qrDataUrl)).blob();
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
      setCopiedQr(true); setTimeout(() => setCopiedQr(false), 2500);
    } catch { /* silent */ }
  };

  const downloadQr = () => {
    if (!qrDataUrl) return;
    const a = document.createElement('a');
    a.href = qrDataUrl; a.download = `job-${jobId}-share-qr.png`; a.click();
  };

  const handleSendSelected = useCallback(async () => {
    setSendMsg(null);
    if (typeof navigator.share === 'function') {
      try {
        await navigator.share({ title: `${jobName ?? 'Job'} — Photos`, url: window.location.href });
        return;
      } catch { /* cancelled */ }
    }
    try {
      const res  = await fetch(`/api/jobs/${jobId}/photos/share`, { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' } });
      const data = await res.json() as { shareUrl?: string };
      if (data.shareUrl) { await navigator.clipboard.writeText(data.shareUrl).catch(() => {}); setSendMsg('Share link copied'); setTimeout(() => setSendMsg(null), 3000); }
    } catch { setSendMsg('Could not generate share link'); setTimeout(() => setSendMsg(null), 3000); }
  }, [jobId, jobName]);

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col gap-0 -m-4 md:-m-6">

      {/* ── Toolbar ── */}
      <div className="flex items-center gap-1.5 px-3 py-2 bg-white border-b border-border sticky top-0 z-10 flex-wrap">

        {/* Photo count */}
        <span className="text-xs text-muted-foreground mr-1 shrink-0">
          {photoCount} photo{photoCount !== 1 ? 's' : ''}
        </span>

        {/* Upload */}
        <button
          onClick={() => photosRef.current?.openFilePicker()}
          disabled={uploading || atLimit}
          className="flex items-center gap-1.5 px-2.5 py-1.5 bg-primary hover:bg-orange-600 disabled:opacity-50 text-white text-xs font-semibold rounded-lg transition-colors"
        >
          {uploading ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />}
          Upload
        </button>

        {/* Camera — removed: Upload button already opens file picker which includes camera on mobile */}

        {/* Select / Done */}
        {!selectMode ? (
          <button
            onClick={() => handleSetSelectMode(true)}
            className="flex items-center gap-1.5 px-2.5 py-1.5 bg-muted hover:bg-gray-200 text-foreground text-xs font-semibold rounded-lg transition-colors"
          >
            <CheckSquare size={12} /> Select
          </button>
        ) : (
          <button
            onClick={() => { handleSetSelectMode(false); photosRef.current?.exitSelectMode(); }}
            className="flex items-center gap-1.5 px-2.5 py-1.5 bg-muted hover:bg-gray-200 text-foreground text-xs font-semibold rounded-lg transition-colors"
          >
            <X size={12} /> Done {selectedCount > 0 && `(${selectedCount})`}
          </button>
        )}

        {/* Download / Send — only in select mode with selection */}
        {selectMode && selectedCount > 0 && (
          <>
            <button
              onClick={() => photosRef.current?.downloadSelected()}
              className="flex items-center gap-1.5 px-2.5 py-1.5 bg-muted hover:bg-gray-200 text-foreground text-xs font-semibold rounded-lg transition-colors"
            >
              <Download size={12} /> Download
            </button>
            <button
              onClick={() => void handleSendSelected()}
              className="flex items-center gap-1.5 px-2.5 py-1.5 bg-muted hover:bg-gray-200 text-foreground text-xs font-semibold rounded-lg transition-colors"
            >
              <Send size={12} /> Send
            </button>
          </>
        )}

        {/* Share */}
        <button
          onClick={() => photosRef.current?.generateShareLink()}
          disabled={photoCount === 0}
          className="flex items-center gap-1.5 px-2.5 py-1.5 bg-muted hover:bg-gray-200 disabled:opacity-40 text-foreground text-xs font-semibold rounded-lg transition-colors"
        >
          <Share2 size={12} /> Share
        </button>

        {/* View size toggle */}
        <div className="ml-auto flex items-center bg-muted rounded-lg overflow-hidden shrink-0">
          {(['small', 'medium', 'large'] as const).map((size) => (
            <button
              key={size}
              onClick={() => handleSetViewSize(size)}
              title={`${size.charAt(0).toUpperCase() + size.slice(1)} thumbnails`}
              className={`px-2 py-1.5 text-xs font-semibold transition-colors ${viewSize === size ? 'bg-white text-gray-800 shadow-sm' : 'text-muted-foreground hover:text-foreground'}`}
            >
              {size === 'small' ? <Grid3x3 size={12} /> : size === 'medium' ? <Grid2x2 size={12} /> : <LayoutGrid size={12} />}
            </button>
          ))}
        </div>
      </div>

      {/* ── Send feedback ── */}
      {sendMsg && (
        <div className="mx-4 mt-2 text-xs text-muted-foreground bg-muted rounded-lg px-3 py-2">{sendMsg}</div>
      )}

      {/* ── Share panel ── */}
      {shareUrl && (
        <div className="mx-4 mt-3 bg-white border border-border rounded-xl p-4 flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <p className="text-xs font-bold text-foreground">Share link</p>
            <button onClick={() => setShareUrl(null)} className="text-muted-foreground hover:text-foreground transition-colors">
              <X size={14} />
            </button>
          </div>
          <div className="flex items-center gap-2">
            <input
              readOnly
              value={shareUrl}
              className="flex-1 min-w-0 text-xs px-2.5 py-1.5 border border-border rounded-lg bg-muted font-mono"
            />
            <button onClick={() => void copyLink()} className="flex items-center gap-1 px-2.5 py-1.5 bg-muted hover:bg-gray-200 text-xs font-semibold rounded-lg transition-colors shrink-0">
              {copied ? <Check size={12} className="text-green-600" /> : <Copy size={12} />}
              {copied ? 'Copied' : 'Copy'}
            </button>
            <a href={shareUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 px-2.5 py-1.5 bg-muted hover:bg-gray-200 text-xs font-semibold rounded-lg transition-colors shrink-0">
              <ExternalLink size={12} /> Open
            </a>
          </div>
          {qrDataUrl && (
            <div className="flex items-start gap-3">
              <img src={qrDataUrl} alt="QR code" className="w-20 h-20 rounded border border-border" />
              <div className="flex flex-col gap-1.5">
                <button onClick={() => void copyQr()} className="flex items-center gap-1.5 px-2.5 py-1.5 bg-muted hover:bg-gray-200 text-xs font-semibold rounded-lg transition-colors">
                  {copiedQr ? <Check size={12} className="text-green-600" /> : <QrCode size={12} />}
                  {copiedQr ? 'Copied' : 'Copy QR'}
                </button>
                <button onClick={downloadQr} className="flex items-center gap-1.5 px-2.5 py-1.5 bg-muted hover:bg-gray-200 text-xs font-semibold rounded-lg transition-colors">
                  <Download size={12} /> Download QR
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── Photo grid ── */}
      <div className="px-2 py-2 md:px-4 md:py-4">
        <JobPhotos
          ref={photosRef}
          jobId={jobId}
          onShareLink={handleShareLink}
          onPhotoCount={setPhotoCount}
          onUploading={setUploading}
          onSelectionChange={setSelectedCount}
        />
      </div>
    </div>
  );
}
