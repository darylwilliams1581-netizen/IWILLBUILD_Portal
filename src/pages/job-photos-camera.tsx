/**
 * JobPhotosCameraPage  (/jobs/:id/camera)
 * ─────────────────────────────────────────────────────────────────────────────
 * Full-screen camera viewport for capturing job photos with an optional
 * watermark overlay (date, time, job number, label).
 *
 * Flow:
 *   1. Page mounts → shows live <video> preview via getUserMedia (web) or
 *      triggers Capacitor Camera.getPhoto() on native iOS.
 *   2. User types an optional label in the top bar.
 *   3. User taps the shutter button.
 *   4. On web: captures frame from <video> to off-screen canvas, composites
 *      watermark text, exports as JPEG blob, passes File to enqueueFiles().
 *   5. On native: useIosMediaPicker.openCamera() returns a File; we composite
 *      the watermark onto it via createImageBitmap → canvas → toBlob, then
 *      pass the new File to enqueueFiles(). Falls through with raw file if
 *      HEIC or createImageBitmap fails.
 *   6. After capture the shutter button shows a thumbnail of the last shot.
 *      Tapping it navigates back to /jobs/:id/photos.
 *   7. Settings panel (gear icon) toggles the four watermark fields.
 *
 * CRITICAL RULES (from pre-implementation inspection):
 *   - Never use dynamic import('@capacitor/*') — always window.Capacitor.Plugins
 *   - Never use FileReader + base64 for previews — use URL.createObjectURL
 *   - position:fixed inside CSS transform ancestor gets trapped — no transforms
 *     on the outer container
 *   - iOS safe area: always max(env(safe-area-inset-*), Npx)
 *   - Watermark canvas uses raw image pixel dimensions, not CSS display size
 *   - HEIC guard: fall through with raw file rather than blocking save
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Helmet } from '@dr.pogodin/react-helmet';
import {
  ArrowLeft, Settings, X, Check, Loader2, Camera,
  SwitchCamera, Zap, ZapOff, Tag,
} from 'lucide-react';
import { usePhotoUploadQueue } from '@/hooks/usePhotoUploadQueue';
import { useWatermarkSettings } from '@/hooks/useWatermarkSettings';
import { isNative } from '@/lib/capacitor-plugins';
import { useIosMediaPicker } from '@/hooks/useIosMediaPicker';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Job {
  id: number;
  name: string;
  jobNumber?: string | null;
}

// ── Watermark compositor ──────────────────────────────────────────────────────

interface WatermarkOptions {
  showDate:      boolean;
  showTime:      boolean;
  showJobNumber: boolean;
  showLabel:     boolean;
  jobNumber:     string;
  label:         string;
}

/**
 * Composite watermark text onto an ImageBitmap and return a JPEG File.
 * Uses the bitmap's natural pixel dimensions — never CSS display size.
 * Returns null if the browser cannot create a canvas (very old WebViews).
 */
async function applyWatermark(
  source: ImageBitmap | HTMLVideoElement,
  opts: WatermarkOptions,
  fileName: string,
): Promise<File | null> {
  const w = source instanceof HTMLVideoElement ? source.videoWidth  : source.width;
  const h = source instanceof HTMLVideoElement ? source.videoHeight : source.height;
  if (!w || !h) return null;

  const canvas = document.createElement('canvas');
  canvas.width  = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  ctx.drawImage(source, 0, 0, w, h);

  // ── Watermark text ──────────────────────────────────────────────────────────
  const now   = new Date();
  const pad   = (n: number) => String(n).padStart(2, '0');
  const date  = `${pad(now.getDate())}/${pad(now.getMonth() + 1)}/${now.getFullYear()}`;
  const time  = `${pad(now.getHours())}:${pad(now.getMinutes())}`;

  // Font size scales with image width — readable on both 1080p and 4K captures
  const fontSize = Math.max(20, Math.round(w * 0.028));
  ctx.font        = `bold ${fontSize}px -apple-system, Arial, sans-serif`;
  ctx.textBaseline = 'bottom';

  // Semi-transparent pill background helper
  function drawPill(text: string, x: number, y: number, align: 'left' | 'right') {
    const pad2 = fontSize * 0.4;
    const tw   = ctx!.measureText(text).width;
    const bx   = align === 'right' ? x - tw - pad2 * 2 : x;
    const by   = y - fontSize - pad2;
    const bw   = tw + pad2 * 2;
    const bh   = fontSize + pad2 * 1.6;
    const r    = fontSize * 0.3;

    ctx!.save();
    ctx!.globalAlpha = 0.55;
    ctx!.fillStyle   = '#000000';
    ctx!.beginPath();
    ctx!.roundRect(bx, by, bw, bh, r);
    ctx!.fill();
    ctx!.restore();

    ctx!.save();
    ctx!.globalAlpha = 1;
    ctx!.fillStyle   = '#ffffff';
    ctx!.fillText(text, align === 'right' ? x - tw - pad2 : x + pad2, y);
    ctx!.restore();
  }

  const margin = Math.round(w * 0.025);

  // Bottom-left: date [time]
  if (opts.showDate || opts.showTime) {
    const parts: string[] = [];
    if (opts.showDate) parts.push(date);
    if (opts.showTime) parts.push(time);
    drawPill(parts.join('  '), margin, h - margin, 'left');
  }

  // Bottom-right: job number
  if (opts.showJobNumber && opts.jobNumber) {
    drawPill(opts.jobNumber, w - margin, h - margin, 'right');
  }

  // Top-left: label
  if (opts.showLabel && opts.label.trim()) {
    ctx.textBaseline = 'top';
    const labelText = opts.label.trim().slice(0, 60);
    const pad2 = fontSize * 0.4;
    const tw   = ctx.measureText(labelText).width;
    const bx   = margin;
    const by   = margin;
    const bw   = tw + pad2 * 2;
    const bh   = fontSize + pad2 * 1.6;
    const r    = fontSize * 0.3;

    ctx.save();
    ctx.globalAlpha = 0.55;
    ctx.fillStyle   = '#000000';
    ctx.beginPath();
    ctx.roundRect(bx, by, bw, bh, r);
    ctx.fill();
    ctx.restore();

    ctx.save();
    ctx.globalAlpha = 1;
    ctx.fillStyle   = '#ffffff';
    ctx.fillText(labelText, bx + pad2, by + pad2 * 0.8);
    ctx.restore();
  }

  return new Promise<File | null>((resolve) => {
    canvas.toBlob((blob) => {
      if (!blob) { resolve(null); return; }
      resolve(new File([blob], fileName, { type: 'image/jpeg' }));
    }, 'image/jpeg', 0.88);
  });
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function JobPhotosCameraPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const jobId = Number(id);

  // ── Job metadata ────────────────────────────────────────────────────────────
  const [job, setJob] = useState<Job | null>(null);
  useEffect(() => {
    if (!id) return;
    fetch(`/api/jobs/${id}`, { credentials: 'include' })
      .then(async (r) => {
        if (!r.ok) return;
        const ct = r.headers.get('content-type') ?? '';
        if (!ct.includes('application/json')) return;
        const data = await r.json() as { job?: Job } | Job;
        const j = data && typeof data === 'object' && 'job' in data ? data.job : data as Job;
        setJob(j ?? null);
      })
      .catch(() => {});
  }, [id]);

  // ── Watermark settings ──────────────────────────────────────────────────────
  const { settings, toggle } = useWatermarkSettings();
  const [label, setLabel] = useState('');
  const [showSettings, setShowSettings] = useState(false);

  // ── Upload queue ────────────────────────────────────────────────────────────
  const { enqueueFiles, queue, isUploading } = usePhotoUploadQueue({ jobId });
  const captureCount = queue.length;

  // ── Last captured thumbnail ─────────────────────────────────────────────────
  const [lastThumb, setLastThumb] = useState<string | null>(null);

  // ── Web camera (getUserMedia) ───────────────────────────────────────────────
  const videoRef  = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [facingMode, setFacingMode] = useState<'environment' | 'user'>('environment');
  const [flashOn, setFlashOn]       = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const [capturing, setCapturing]   = useState(false);
  const [flashAnim, setFlashAnim]   = useState(false);

  // ── Native iOS picker ───────────────────────────────────────────────────────
  const picker = useIosMediaPicker();

  // ── Start / stop web camera stream ─────────────────────────────────────────
  const startStream = useCallback(async (facing: 'environment' | 'user') => {
    // Stop any existing stream first
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setCameraReady(false);
    setCameraError(null);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: facing },
          width:  { ideal: 1920 },
          height: { ideal: 1080 },
        },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
        setCameraReady(true);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('Permission') || msg.includes('NotAllowed')) {
        setCameraError('Camera access denied. Please allow camera in your browser settings.');
      } else if (msg.includes('NotFound') || msg.includes('DevicesNotFound')) {
        setCameraError('No camera found on this device.');
      } else {
        setCameraError('Could not start camera.');
      }
    }
  }, []);

  // Start stream on mount (web only)
  useEffect(() => {
    if (isNative()) return; // native uses Capacitor picker
    void startStream(facingMode);
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Restart stream when facing mode changes (web only)
  useEffect(() => {
    if (isNative()) return;
    void startStream(facingMode);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [facingMode]);

  // ── Flash toggle (web — torch API) ─────────────────────────────────────────
  const toggleFlash = useCallback(async () => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    try {
      const caps = track.getCapabilities() as { torch?: boolean };
      if (!caps.torch) return;
      await track.applyConstraints({ advanced: [{ torch: !flashOn } as MediaTrackConstraintSet] });
      setFlashOn((v) => !v);
    } catch { /* torch not supported */ }
  }, [flashOn]);

  // ── Build watermark options ─────────────────────────────────────────────────
  const watermarkOpts = useCallback((): WatermarkOptions => ({
    showDate:      settings.showDate,
    showTime:      settings.showTime,
    showJobNumber: settings.showJobNumber,
    showLabel:     settings.showLabel,
    jobNumber:     job?.jobNumber ?? '',
    label,
  }), [settings, job, label]);

  // ── Capture — web ───────────────────────────────────────────────────────────
  const captureWeb = useCallback(async () => {
    if (!videoRef.current || !cameraReady || capturing) return;
    setCapturing(true);
    setFlashAnim(true);
    setTimeout(() => setFlashAnim(false), 180);

    try {
      const video = videoRef.current;
      const ts    = Date.now();
      const name  = `job-${jobId}-photo-${ts}.jpg`;

      const file = await applyWatermark(video, watermarkOpts(), name);
      if (!file) {
        // Canvas failed — capture raw frame without watermark
        const canvas = document.createElement('canvas');
        canvas.width  = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(video, 0, 0);
          await new Promise<void>((resolve) => {
            canvas.toBlob((blob) => {
              if (blob) {
                const raw = new File([blob], name, { type: 'image/jpeg' });
                void enqueueFiles([raw]);
                const thumb = URL.createObjectURL(blob);
                setLastThumb((prev) => { if (prev) URL.revokeObjectURL(prev); return thumb; });
              }
              resolve();
            }, 'image/jpeg', 0.88);
          });
        }
        return;
      }

      void enqueueFiles([file]);
      const thumb = URL.createObjectURL(file);
      setLastThumb((prev) => { if (prev) URL.revokeObjectURL(prev); return thumb; });
    } finally {
      setCapturing(false);
    }
  }, [cameraReady, capturing, jobId, watermarkOpts, enqueueFiles]);

  // ── Capture — native iOS ────────────────────────────────────────────────────
  // On native we call picker.openCamera() synchronously in the click handler
  // (no await before the Capacitor call — required for iOS gesture token).
  // The result arrives via picker.file state change.
  const nativeCaptureTriggered = useRef(false);

  const captureNative = useCallback(() => {
    if (capturing) return;
    nativeCaptureTriggered.current = true;
    void picker.openCamera({
      direction:      facingMode === 'user' ? 'front' : 'rear',
      flashMode:      flashOn ? 'on' : 'auto',
      captureQuality: 84,
    });
  }, [capturing, picker, facingMode, flashOn]);

  // Watch picker.file for the result
  useEffect(() => {
    if (!nativeCaptureTriggered.current) return;
    if (!picker.file) return;
    nativeCaptureTriggered.current = false;

    const file = picker.file;
    setCapturing(true);

    (async () => {
      try {
        const ts   = Date.now();
        const name = `job-${jobId}-photo-${ts}.jpg`;

        // HEIC guard — fall through with raw file, no watermark
        if (file.type === 'image/heic' || file.type === 'image/heif') {
          void enqueueFiles([file]);
          picker.clear();
          return;
        }

        let bitmap: ImageBitmap | null = null;
        try {
          bitmap = await createImageBitmap(file);
        } catch {
          // createImageBitmap failed (old WebView) — upload raw
          void enqueueFiles([file]);
          picker.clear();
          return;
        }

        const watermarked = await applyWatermark(bitmap, watermarkOpts(), name);
        bitmap.close();

        const toUpload = watermarked ?? file;
        void enqueueFiles([toUpload]);

        // Thumbnail from the watermarked file
        const thumb = URL.createObjectURL(toUpload);
        setLastThumb((prev) => { if (prev) URL.revokeObjectURL(prev); return thumb; });
      } finally {
        setCapturing(false);
        picker.clear();
      }
    })();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [picker.file]);

  // Cleanup thumb on unmount
  useEffect(() => {
    return () => {
      if (lastThumb) URL.revokeObjectURL(lastThumb);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Render ──────────────────────────────────────────────────────────────────

  const native = isNative();

  return (
    <div
      className="fixed inset-0 z-50 bg-black flex flex-col"
      style={{ userSelect: 'none' }}
    >
      <Helmet>
        <title>Camera — IWILLBUILD</title>
        <meta name="description" content="Capture job photos with watermark overlay." />
        <meta name="robots" content="noindex, nofollow" />
        <link rel="canonical" href={`https://iwillbuild.com/jobs/${id}/camera`} />
      </Helmet>
      {/* Visually hidden H1 for accessibility — camera UI has no visible heading */}
      <h1 className="sr-only">Job Camera</h1>

      {/* ── Live preview (web only) ── */}
      {!native && (
        <div className="absolute inset-0 overflow-hidden">
          <video
            ref={videoRef}
            className="w-full h-full object-cover"
            autoPlay
            playsInline
            muted
          />
          {/* Camera error overlay */}
          {cameraError && (
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/80 px-8 text-center">
              <Camera size={40} className="text-gray-500" />
              <p className="text-white text-sm font-medium">{cameraError}</p>
              <button
                onClick={() => void startStream(facingMode)}
                className="mt-2 px-4 py-2 bg-primary text-white text-sm font-semibold rounded-xl"
              >
                Retry
              </button>
            </div>
          )}
          {/* Loading overlay */}
          {!cameraReady && !cameraError && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/60">
              <Loader2 size={32} className="animate-spin text-white/60" />
            </div>
          )}
        </div>
      )}

      {/* Native: dark background with instruction */}
      {native && (
        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-gray-950">
          <Camera size={48} className="text-gray-600" />
          <p className="text-gray-400 text-sm text-center px-8">
            Tap the shutter to open the camera
          </p>
        </div>
      )}

      {/* ── Flash animation ── */}
      {flashAnim && (
        <div className="absolute inset-0 bg-white pointer-events-none z-30 opacity-70" />
      )}

      {/* ── Watermark preview overlay (live, CSS only — not composited) ── */}
      {!native && cameraReady && (
        <div className="absolute inset-0 pointer-events-none z-10">
          {/* Bottom-left: date/time */}
          {(settings.showDate || settings.showTime) && (
            <div
              className="absolute bottom-0 left-0 flex items-center gap-1"
              style={{
                bottom: 'max(env(safe-area-inset-bottom), 10px)',
                left:   'max(env(safe-area-inset-left), 10px)',
                marginBottom: '80px', // above shutter bar
              }}
            >
              <span className="bg-black/55 text-white text-[11px] font-bold px-2 py-0.5 rounded-md leading-tight">
                {settings.showDate && new Date().toLocaleDateString('en-AU')}
                {settings.showDate && settings.showTime && '  '}
                {settings.showTime && new Date().toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit', hour12: false })}
              </span>
            </div>
          )}
          {/* Bottom-right: job number */}
          {settings.showJobNumber && job?.jobNumber && (
            <div
              className="absolute bottom-0 right-0"
              style={{
                bottom: 'max(env(safe-area-inset-bottom), 10px)',
                right:  'max(env(safe-area-inset-right), 10px)',
                marginBottom: '80px',
              }}
            >
              <span className="bg-black/55 text-white text-[11px] font-bold px-2 py-0.5 rounded-md leading-tight">
                {job.jobNumber}
              </span>
            </div>
          )}
          {/* Top-left: label */}
          {settings.showLabel && label.trim() && (
            <div
              className="absolute top-0 left-0"
              style={{
                top:  'max(env(safe-area-inset-top), 10px)',
                left: 'max(env(safe-area-inset-left), 10px)',
                marginTop: '52px', // below top bar
              }}
            >
              <span className="bg-black/55 text-white text-[11px] font-bold px-2 py-0.5 rounded-md leading-tight max-w-[200px] truncate block">
                {label.trim()}
              </span>
            </div>
          )}
        </div>
      )}

      {/* ── Top bar ── */}
      <div
        className="relative z-20 flex items-center gap-2 px-3 bg-gradient-to-b from-black/70 to-transparent shrink-0"
        style={{
          paddingTop:    'max(env(safe-area-inset-top), 10px)',
          paddingBottom: '10px',
        }}
      >
        {/* Back */}
        <button
          onClick={() => navigate(`/jobs/${id}/photos`)}
          className="w-9 h-9 flex items-center justify-center rounded-full bg-black/40 text-white hover:bg-black/60 transition-colors shrink-0"
          aria-label="Back to photos"
        >
          <ArrowLeft size={18} />
        </button>

        {/* Label input */}
        <div className="flex-1 flex items-center gap-1.5 bg-black/40 rounded-full px-3 h-9">
          <Tag size={13} className="text-white/60 shrink-0" />
          <input
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="Add label…"
            maxLength={60}
            className="flex-1 bg-transparent text-white text-sm placeholder-white/40 outline-none min-w-0"
            style={{ fontSize: '16px' }} // prevent iOS zoom
          />
          {label && (
            <button onClick={() => setLabel('')} className="text-white/50 hover:text-white shrink-0">
              <X size={13} />
            </button>
          )}
        </div>

        {/* Settings */}
        <button
          onClick={() => setShowSettings((v) => !v)}
          className="w-9 h-9 flex items-center justify-center rounded-full bg-black/40 text-white hover:bg-black/60 transition-colors shrink-0"
          aria-label="Watermark settings"
        >
          <Settings size={16} />
        </button>
      </div>

      {/* ── Settings panel ── */}
      {showSettings && (
        <div
          className="relative z-20 mx-3 mb-2 bg-black/75 backdrop-blur-sm rounded-2xl p-4 shrink-0"
        >
          <div className="flex items-center justify-between mb-3">
            <p className="text-white text-sm font-semibold">Watermark</p>
            <button onClick={() => setShowSettings(false)} className="text-white/50 hover:text-white">
              <X size={15} />
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {(
              [
                { key: 'showDate',      label: 'Date' },
                { key: 'showTime',      label: 'Time' },
                { key: 'showJobNumber', label: 'Job number' },
                { key: 'showLabel',     label: 'Label' },
              ] as { key: keyof typeof settings; label: string }[]
            ).map(({ key, label: lbl }) => (
              <button
                key={key}
                onClick={() => toggle(key)}
                className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium transition-colors ${
                  settings[key]
                    ? 'bg-primary text-white'
                    : 'bg-white/10 text-white/60'
                }`}
              >
                {settings[key] ? <Check size={13} /> : <X size={13} />}
                {lbl}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Spacer — pushes bottom bar down ── */}
      <div className="flex-1" />

      {/* ── Bottom shutter bar ── */}
      <div
        className="relative z-20 flex items-center justify-between px-8 bg-gradient-to-t from-black/80 to-transparent shrink-0"
        style={{
          paddingBottom: 'max(env(safe-area-inset-bottom), 16px)',
          paddingTop:    '16px',
        }}
      >
        {/* Last photo thumbnail / back button */}
        <button
          onClick={() => navigate(`/jobs/${id}/photos`)}
          className="w-14 h-14 rounded-xl overflow-hidden border-2 border-white/30 bg-white/10 flex items-center justify-center shrink-0 touch-manipulation"
          aria-label="View photos"
        >
          {lastThumb ? (
            <img src={lastThumb} alt="Last captured photo" className="w-full h-full object-cover" />
          ) : (
            <div className="flex flex-col items-center gap-0.5">
              <ArrowLeft size={16} className="text-white/60" />
              {captureCount > 0 && (
                <span className="text-[9px] text-white/60 font-bold">{captureCount}</span>
              )}
            </div>
          )}
        </button>

        {/* Shutter */}
        <button
          onClick={native ? captureNative : () => void captureWeb()}
          disabled={capturing || (!native && !cameraReady)}
          className="w-20 h-20 rounded-full border-4 border-white bg-white/20 flex items-center justify-center disabled:opacity-50 touch-manipulation active:scale-95 transition-transform shrink-0"
          aria-label="Take photo"
        >
          {capturing ? (
            <Loader2 size={28} className="animate-spin text-white" />
          ) : (
            <div className="w-14 h-14 rounded-full bg-white" />
          )}
        </button>

        {/* Flip / Flash */}
        <div className="flex flex-col items-center gap-3 shrink-0">
          {/* Flip camera */}
          <button
            onClick={() => setFacingMode((v) => v === 'environment' ? 'user' : 'environment')}
            className="w-10 h-10 rounded-full bg-white/10 flex items-center justify-center text-white hover:bg-white/20 transition-colors touch-manipulation"
            aria-label="Flip camera"
          >
            <SwitchCamera size={18} />
          </button>
          {/* Flash (web only — native uses captureQuality) */}
          {!native && (
            <button
              onClick={() => void toggleFlash()}
              className={`w-10 h-10 rounded-full flex items-center justify-center transition-colors touch-manipulation ${
                flashOn ? 'bg-yellow-400 text-black' : 'bg-white/10 text-white hover:bg-white/20'
              }`}
              aria-label={flashOn ? 'Flash on' : 'Flash off'}
            >
              {flashOn ? <Zap size={18} /> : <ZapOff size={18} />}
            </button>
          )}
          {/* Upload status indicator */}
          {isUploading && (
            <div className="w-10 h-10 rounded-full bg-primary/80 flex items-center justify-center">
              <Loader2 size={16} className="animate-spin text-white" />
            </div>
          )}
        </div>
      </div>

      {/* Native picker inputs (hidden) */}
      {native && <div ref={picker.inputsRef} />}

      {/* Permission explainer modal */}
      {picker.explainer && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center p-4 bg-black/60">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm">
            <h3 className="font-bold text-base text-gray-900 mb-2">
              {picker.explainer.denied ? 'Camera access denied' : 'Camera access needed'}
            </h3>
            <p className="text-sm text-gray-500 mb-4">
              {picker.explainer.denied
                ? 'Please enable camera access in Settings to take photos.'
                : 'IWILLBUILD needs camera access to capture job photos.'}
            </p>
            <div className="flex gap-2">
              <button
                onClick={picker.explainer.onNotNow}
                className="flex-1 py-2.5 rounded-xl border border-gray-200 text-sm font-semibold text-gray-600"
              >
                Not now
              </button>
              <button
                onClick={() => void picker.explainer!.onEnable()}
                className="flex-1 py-2.5 rounded-xl bg-primary text-white text-sm font-semibold"
              >
                {picker.explainer.denied ? 'Open Settings' : 'Allow'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
