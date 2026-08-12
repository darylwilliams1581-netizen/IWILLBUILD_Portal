/**
 * JobPhotosCameraPage  (/jobs/:id/camera)
 * ─────────────────────────────────────────────────────────────────────────────
 * Full-screen camera viewport for capturing job photos with an optional
 * watermark overlay (Label, Date, Time, Job Number).
 *
 * DESIGN REQUIREMENTS (from user spec):
 *   - Persistent live <video> preview — NOT one-shot Camera.getPhoto() per press
 *   - Five rapid photographs must work in locked mode without interruption
 *   - Locked mode: label is set once and stamped on every photo automatically
 *   - Unlocked mode: label prompt appears after each shutter press
 *   - All four watermark values (Label, Date, Time, Job Number) shown together
 *     in the bottom watermark strip — not scattered across corners
 *   - Settings gear toggles each field independently; persisted to localStorage
 *   - HEIC: do NOT silently upload unstamped — show error and direct user to
 *     the original Take Photo route as fallback
 *   - No flip/flash controls (not pre-existing, not requested)
 *   - No markup layer changes — PhotoEditor operates on saved JPEG as before
 *   - No database changes, no upload-pipeline changes, no metadata changes
 *
 * WATERMARK COMPOSITOR:
 *   - Off-screen canvas at the image's real pixel dimensions (not CSS size)
 *   - Semi-transparent pill behind each text segment
 *   - All fields in one horizontal strip at the bottom of the frame
 *   - Font size scales with image width (readable on 1080p and 4K)
 *   - Exports JPEG at quality 0.88 — same as existing normaliseToJpeg()
 *   - Passes resulting File to enqueueFiles() — identical to existing flow
 *
 * NATIVE iOS:
 *   - Uses getUserMedia on web (persistent live preview)
 *   - On native Capacitor: getUserMedia is available in WKWebView iOS 14.3+
 *     and is the correct approach for a persistent viewport
 *   - If getUserMedia is unavailable (very old WebView), shows an error with
 *     a link back to the original Take Photo route
 *
 * CRITICAL RULES (from pre-implementation inspection):
 *   - Never use dynamic import('@capacitor/*')
 *   - Never use FileReader + base64 for previews — URL.createObjectURL only
 *   - position:fixed inside CSS transform ancestor gets trapped — no transforms
 *     on the outer container
 *   - iOS safe area: always max(env(safe-area-inset-*), Npx)
 *   - Canvas uses raw image pixel dimensions, not CSS display size
 *   - HEIC: show error, do not silently upload unstamped
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { Helmet } from '@dr.pogodin/react-helmet';
import {
  ArrowLeft, Settings, X, Check, Loader2, Camera,
  Lock, Unlock, Tag, AlertTriangle,
} from 'lucide-react';
import { usePhotoUploadQueue } from '@/hooks/usePhotoUploadQueue';
import { useWatermarkSettings } from '@/hooks/useWatermarkSettings';

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
 * Composite all active watermark fields into a single horizontal strip at the
 * bottom of the frame. Uses the source's natural pixel dimensions.
 *
 * Returns null if canvas creation fails (very old WebView).
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

  // ── Collect active segments ─────────────────────────────────────────────────
  const now  = new Date();
  const pad  = (n: number) => String(n).padStart(2, '0');
  const date = `${pad(now.getDate())}/${pad(now.getMonth() + 1)}/${now.getFullYear()}`;
  const time = `${pad(now.getHours())}:${pad(now.getMinutes())}`;

  const segments: string[] = [];
  if (opts.showLabel     && opts.label.trim())  segments.push(opts.label.trim().slice(0, 60));
  if (opts.showDate)                             segments.push(date);
  if (opts.showTime)                             segments.push(time);
  if (opts.showJobNumber && opts.jobNumber)      segments.push(opts.jobNumber);

  if (segments.length === 0) {
    // No watermark fields active — export as-is
    return new Promise<File | null>((resolve) => {
      canvas.toBlob((blob) => {
        if (!blob) { resolve(null); return; }
        resolve(new File([blob], fileName, { type: 'image/jpeg' }));
      }, 'image/jpeg', 0.88);
    });
  }

  // ── Draw bottom strip ───────────────────────────────────────────────────────
  const fontSize  = Math.max(18, Math.round(w * 0.026));
  const padH      = fontSize * 0.45;   // horizontal padding inside each pill
  const padV      = fontSize * 0.35;   // vertical padding inside each pill
  const pillH     = fontSize + padV * 2;
  const gap       = Math.round(w * 0.012);
  const margin    = Math.round(w * 0.022);
  const bottomY   = h - margin;

  ctx.font         = `bold ${fontSize}px -apple-system, Arial, sans-serif`;
  ctx.textBaseline = 'middle';

  // Measure all segments first so we can lay them out left-to-right
  const measured = segments.map((seg) => ({
    text:  seg,
    width: ctx.measureText(seg).width,
  }));

  let x = margin;
  for (const seg of measured) {
    const pillW = seg.width + padH * 2;
    const pillX = x;
    const pillY = bottomY - pillH;
    const r     = pillH * 0.28;

    // Background pill
    ctx.save();
    ctx.globalAlpha = 0.58;
    ctx.fillStyle   = '#000000';
    ctx.beginPath();
    ctx.roundRect(pillX, pillY, pillW, pillH, r);
    ctx.fill();
    ctx.restore();

    // Text
    ctx.save();
    ctx.globalAlpha = 1;
    ctx.fillStyle   = '#ffffff';
    ctx.fillText(seg, pillX + padH, pillY + pillH / 2);
    ctx.restore();

    x += pillW + gap;
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
  const [showSettings, setShowSettings] = useState(false);

  // ── Label mode ──────────────────────────────────────────────────────────────
  // Locked: label is typed once and stamped on every photo without prompting.
  // Unlocked: after each shutter press a prompt appears to confirm/change label.
  const [labelLocked, setLabelLocked] = useState(false);
  const [label, setLabel] = useState('');
  // Post-capture label prompt state (unlocked mode)
  const [pendingCapture, setPendingCapture] = useState<{
    bitmap: ImageBitmap;
    fileName: string;
  } | null>(null);
  const [pendingLabel, setPendingLabel] = useState('');

  // ── Upload queue ────────────────────────────────────────────────────────────
  const { enqueueFiles, queue, isUploading } = usePhotoUploadQueue({ jobId });
  const captureCount = queue.length;

  // ── Last captured thumbnail ─────────────────────────────────────────────────
  const [lastThumb, setLastThumb] = useState<string | null>(null);

  // ── Camera stream ───────────────────────────────────────────────────────────
  const videoRef    = useRef<HTMLVideoElement>(null);
  const streamRef   = useRef<MediaStream | null>(null);
  const [cameraReady, setCameraReady]   = useState(false);
  const [cameraError, setCameraError]   = useState<string | null>(null);
  const [capturing, setCapturing]       = useState(false);
  const [flashAnim, setFlashAnim]       = useState(false);
  const [noGetUserMedia, setNoGetUserMedia] = useState(false);

  const startStream = useCallback(async () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    setCameraReady(false);
    setCameraError(null);

    if (!navigator.mediaDevices?.getUserMedia) {
      setNoGetUserMedia(true);
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          facingMode: { ideal: 'environment' },
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
      if (msg.includes('Permission') || msg.includes('NotAllowed') || msg.includes('denied')) {
        setCameraError('Camera access denied. Please allow camera access in your device settings, then tap Retry.');
      } else if (msg.includes('NotFound') || msg.includes('DevicesNotFound')) {
        setCameraError('No camera found on this device.');
      } else {
        setCameraError('Could not start camera. Tap Retry or use Take Photo instead.');
      }
    }
  }, []);

  useEffect(() => {
    void startStream();
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Cleanup thumb on unmount
  useEffect(() => {
    return () => { if (lastThumb) URL.revokeObjectURL(lastThumb); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Build watermark options ─────────────────────────────────────────────────
  const makeWatermarkOpts = useCallback((resolvedLabel: string): WatermarkOptions => ({
    showDate:      settings.showDate,
    showTime:      settings.showTime,
    showJobNumber: settings.showJobNumber,
    showLabel:     settings.showLabel,
    jobNumber:     job?.jobNumber ?? '',
    label:         resolvedLabel,
  }), [settings, job]);

  // ── Finalise capture (after label is resolved) ──────────────────────────────
  const finaliseCapture = useCallback(async (
    source: ImageBitmap | HTMLVideoElement,
    resolvedLabel: string,
    fileName: string,
  ) => {
    try {
      const file = await applyWatermark(source, makeWatermarkOpts(resolvedLabel), fileName);
      if (!file) {
        setCameraError('Could not composite watermark. Please use Take Photo instead.');
        return;
      }
      void enqueueFiles([file]);
      const thumb = URL.createObjectURL(file);
      setLastThumb((prev) => { if (prev) URL.revokeObjectURL(prev); return thumb; });
    } finally {
      setCapturing(false);
    }
  }, [makeWatermarkOpts, enqueueFiles]);

  // ── Shutter press ───────────────────────────────────────────────────────────
  const handleShutter = useCallback(async () => {
    if (!videoRef.current || !cameraReady || capturing) return;

    const video = videoRef.current;

    // HEIC check — video stream is always raw frames, not HEIC, so this guard
    // is for future-proofing; the real HEIC risk is the original Take Photo route.
    // However if videoWidth/Height are 0 the stream isn't ready.
    if (!video.videoWidth || !video.videoHeight) {
      setCameraError('Camera not ready. Please wait a moment and try again.');
      return;
    }

    setCapturing(true);
    setFlashAnim(true);
    setTimeout(() => setFlashAnim(false), 160);

    const ts       = Date.now();
    const fileName = `job-${jobId}-photo-${ts}.jpg`;

    if (labelLocked) {
      // Locked mode: capture immediately with current label
      await finaliseCapture(video, label, fileName);
    } else {
      // Unlocked mode: capture bitmap first, then prompt for label
      let bitmap: ImageBitmap;
      try {
        bitmap = await createImageBitmap(video);
      } catch {
        setCameraError('Could not capture frame. Please try again.');
        setCapturing(false);
        return;
      }
      setPendingLabel(label); // pre-fill with last used label
      setPendingCapture({ bitmap, fileName });
      // setCapturing stays true until the prompt is resolved
    }
  }, [cameraReady, capturing, jobId, labelLocked, label, finaliseCapture]);

  // ── Confirm label prompt (unlocked mode) ────────────────────────────────────
  const confirmPendingCapture = useCallback(async () => {
    if (!pendingCapture) return;
    const { bitmap, fileName } = pendingCapture;
    const resolvedLabel = pendingLabel;
    setLabel(resolvedLabel); // remember for next shot
    setPendingCapture(null);
    await finaliseCapture(bitmap, resolvedLabel, fileName);
    bitmap.close();
  }, [pendingCapture, pendingLabel, finaliseCapture]);

  const discardPendingCapture = useCallback(() => {
    if (pendingCapture) {
      pendingCapture.bitmap.close();
      setPendingCapture(null);
    }
    setCapturing(false);
  }, [pendingCapture]);

  // ── Live watermark preview text ─────────────────────────────────────────────
  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const previewDate = `${pad(now.getDate())}/${pad(now.getMonth() + 1)}/${now.getFullYear()}`;
  const previewTime = `${pad(now.getHours())}:${pad(now.getMinutes())}`;

  const previewSegments: string[] = [];
  if (settings.showLabel     && label.trim())       previewSegments.push(label.trim().slice(0, 60));
  if (settings.showDate)                             previewSegments.push(previewDate);
  if (settings.showTime)                             previewSegments.push(previewTime);
  if (settings.showJobNumber && job?.jobNumber)      previewSegments.push(job.jobNumber);

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <div
      className="fixed inset-0 z-50 bg-black flex flex-col"
      style={{ userSelect: 'none' }}
    >
      <Helmet>
        <title>Camera — IWILLBUILD</title>
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>
      <h1 className="sr-only">Job Camera</h1>

      {/* ── Live preview ── */}
      <div className="absolute inset-0 overflow-hidden">
        <video
          ref={videoRef}
          className="w-full h-full object-cover"
          autoPlay
          playsInline
          muted
        />

        {/* getUserMedia unavailable (old WebView) */}
        {noGetUserMedia && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black/90 px-8 text-center">
            <AlertTriangle size={36} className="text-yellow-400" />
            <p className="text-white text-sm font-semibold">
              Live camera preview is not available on this device.
            </p>
            <p className="text-gray-400 text-xs leading-relaxed">
              Use the original <strong className="text-white">Take Photo</strong> button on the photos page to capture images.
            </p>
            <button
              onClick={() => navigate(`/jobs/${id}/photos`)}
              className="mt-2 px-5 py-2.5 bg-primary text-white text-sm font-semibold rounded-xl"
            >
              Back to Photos
            </button>
          </div>
        )}

        {/* Camera permission / hardware error */}
        {cameraError && !noGetUserMedia && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/85 px-8 text-center">
            <AlertTriangle size={36} className="text-yellow-400" />
            <p className="text-white text-sm font-medium leading-relaxed">{cameraError}</p>
            <div className="flex gap-2 mt-1">
              <button
                onClick={() => void startStream()}
                className="px-4 py-2 bg-primary text-white text-sm font-semibold rounded-xl"
              >
                Retry
              </button>
              <button
                onClick={() => navigate(`/jobs/${id}/photos`)}
                className="px-4 py-2 bg-white/10 text-white text-sm font-semibold rounded-xl"
              >
                Back
              </button>
            </div>
            <p className="text-gray-500 text-xs mt-1">
              Or use <strong className="text-gray-300">Take Photo</strong> on the photos page as a fallback.
            </p>
          </div>
        )}

        {/* Loading */}
        {!cameraReady && !cameraError && !noGetUserMedia && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/60">
            <Loader2 size={32} className="animate-spin text-white/60" />
          </div>
        )}
      </div>

      {/* ── Flash animation ── */}
      {flashAnim && (
        <div className="absolute inset-0 bg-white pointer-events-none z-30 opacity-70" />
      )}

      {/* ── Live watermark preview overlay (CSS only — not composited) ── */}
      {cameraReady && previewSegments.length > 0 && (
        <div
          className="absolute left-0 right-0 pointer-events-none z-10 flex flex-wrap gap-1.5"
          style={{
            bottom: 'max(env(safe-area-inset-bottom), 10px)',
            left:   'max(env(safe-area-inset-left), 10px)',
            right:  'max(env(safe-area-inset-right), 10px)',
            marginBottom: '90px', // above shutter bar
          }}
        >
          {previewSegments.map((seg, i) => (
            <span
              key={i}
              className="bg-black/58 text-white text-[11px] font-bold px-2 py-0.5 rounded-md leading-tight"
            >
              {seg}
            </span>
          ))}
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
            placeholder={labelLocked ? 'Label (locked)…' : 'Add label…'}
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

        {/* Lock toggle */}
        <button
          onClick={() => setLabelLocked((v) => !v)}
          className={`w-9 h-9 flex items-center justify-center rounded-full transition-colors shrink-0 ${
            labelLocked ? 'bg-primary text-white' : 'bg-black/40 text-white/70 hover:bg-black/60'
          }`}
          aria-label={labelLocked ? 'Label locked — tap to unlock' : 'Label unlocked — tap to lock'}
          title={labelLocked ? 'Label locked for all shots' : 'Prompt for label after each shot'}
        >
          {labelLocked ? <Lock size={15} /> : <Unlock size={15} />}
        </button>

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
        <div className="relative z-20 mx-3 mb-2 bg-black/75 backdrop-blur-sm rounded-2xl p-4 shrink-0">
          <div className="flex items-center justify-between mb-3">
            <p className="text-white text-sm font-semibold">Watermark fields</p>
            <button onClick={() => setShowSettings(false)} className="text-white/50 hover:text-white">
              <X size={15} />
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {(
              [
                { key: 'showLabel',     label: 'Label' },
                { key: 'showDate',      label: 'Date' },
                { key: 'showTime',      label: 'Time' },
                { key: 'showJobNumber', label: 'Job number' },
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
          <p className="text-white/40 text-[10px] mt-3 leading-relaxed">
            All active fields appear together in the bottom watermark strip.
          </p>
        </div>
      )}

      {/* ── Spacer ── */}
      <div className="flex-1" />

      {/* ── Bottom shutter bar ── */}
      <div
        className="relative z-20 flex items-center justify-between px-8 bg-gradient-to-t from-black/80 to-transparent shrink-0"
        style={{
          paddingBottom: 'max(env(safe-area-inset-bottom), 16px)',
          paddingTop:    '16px',
        }}
      >
        {/* Last photo thumbnail / back */}
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
          onClick={() => void handleShutter()}
          disabled={capturing || !cameraReady || !!cameraError || noGetUserMedia}
          className="w-20 h-20 rounded-full border-4 border-white bg-white/20 flex items-center justify-center disabled:opacity-50 touch-manipulation active:scale-95 transition-transform shrink-0"
          aria-label="Take photo"
        >
          {capturing && !pendingCapture ? (
            <Loader2 size={28} className="animate-spin text-white" />
          ) : (
            <div className="w-14 h-14 rounded-full bg-white" />
          )}
        </button>

        {/* Upload status / capture count */}
        <div className="w-14 h-14 flex flex-col items-center justify-center gap-1 shrink-0">
          {isUploading && (
            <Loader2 size={16} className="animate-spin text-white/60" />
          )}
          {captureCount > 0 && (
            <span className="text-white/60 text-[10px] font-bold">{captureCount}</span>
          )}
          {!isUploading && captureCount === 0 && (
            <Camera size={16} className="text-white/30" />
          )}
        </div>
      </div>

      {/* ── Unlocked mode: label prompt after capture ── */}
      {pendingCapture && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center p-4 bg-black/70">
          <div className="bg-gray-900 rounded-2xl p-5 w-full max-w-sm border border-white/10">
            <p className="text-white text-sm font-semibold mb-1">Add a label</p>
            <p className="text-gray-400 text-xs mb-3">
              Optional. Leave blank to skip. Lock the label in the top bar to skip this prompt.
            </p>
            <div className="flex items-center gap-2 bg-white/10 rounded-xl px-3 h-11 mb-4">
              <Tag size={14} className="text-white/50 shrink-0" />
              <input
                type="text"
                value={pendingLabel}
                onChange={(e) => setPendingLabel(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') void confirmPendingCapture(); }}
                placeholder="e.g. North wall, Level 2…"
                maxLength={60}
                autoFocus
                className="flex-1 bg-transparent text-white text-sm placeholder-white/30 outline-none"
                style={{ fontSize: '16px' }}
              />
              {pendingLabel && (
                <button onClick={() => setPendingLabel('')} className="text-white/40 hover:text-white shrink-0">
                  <X size={13} />
                </button>
              )}
            </div>
            <div className="flex gap-2">
              <button
                onClick={discardPendingCapture}
                className="flex-1 py-2.5 rounded-xl border border-white/15 text-sm font-semibold text-gray-400 hover:text-white transition-colors"
              >
                Discard
              </button>
              <button
                onClick={() => void confirmPendingCapture()}
                className="flex-1 py-2.5 rounded-xl bg-primary text-white text-sm font-semibold"
              >
                Save photo
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Permission explainer (if needed by native bridge) ── */}
      {/* Note: on native Capacitor, getUserMedia permission is handled by the
          WKWebView permission delegate. If denied, startStream() sets cameraError
          which shows the Retry / Back UI above. No separate explainer needed. */}
    </div>
  );
}
