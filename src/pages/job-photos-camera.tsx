/**
 * JobPhotosCameraPage  (/jobs/:id/camera)
 * ─────────────────────────────────────────────────────────────────────────────
 * Isolated full-screen camera viewport with watermark compositing.
 *
 * SCOPE — this file only. No changes to:
 *   useIosMediaPicker, usePhotoUploadQueue, imageCompressor, offlinePhotoStore,
 *   JobPhotos.tsx, job-photos-page.tsx (beyond the additive buttons already
 *   added), routes.tsx (beyond the additive route), any DB schema, any API
 *   endpoint, any markup editor, any native config.
 *
 * PERSISTENT PREVIEW — getUserMedia() approach:
 *   Capacitor 8.4.1 WebViewDelegationHandler.swift line 56:
 *     decisionHandler(.grant)   ← auto-grants WKMediaCaptureType requests
 *   CAPBridgeViewController.swift line 122:
 *     allowsInlineMediaPlayback = true
 *   capacitor.config.ts: NSCameraUsageDescription present, server.url is HTTPS
 *   → getUserMedia works in this WKWebView without any native changes.
 *   → Stream stays open between shots; five rapid captures work in locked mode.
 *
 * LABEL MODES:
 *   Locked  — label entered once, reused for every shot without prompting.
 *             If label field is empty when shutter is pressed, the label
 *             prompt opens once to obtain it, then locks.
 *   Unlocked — frame is captured to an ImageBitmap first, then the label
 *             prompt opens. Confirming composites and enqueues. Cancelling
 *             closes the bitmap and does NOT upload or create any record.
 *
 * WATERMARK:
 *   All enabled fields rendered left-to-right in one compact strip at the
 *   bottom of the frame. Values only — no field-name labels.
 *   Order: Label · Date · Time · Job Number
 *   Font size scales with image width. Semi-transparent pill per segment.
 *   Canvas uses the video's natural pixel dimensions, not CSS display size.
 *   JPEG quality 0.88 — matches existing normaliseToJpeg() quality.
 *
 * COMPOSITION FAILURE / HEIC:
 *   getUserMedia delivers raw YUV frames — never HEIC. HEIC is only possible
 *   via the original Camera.getPhoto() path (Take Photo button, unchanged).
 *   If canvas creation or toBlob fails, an error panel is shown with three
 *   options: Retry | Cancel | Use original camera (navigates back to photos).
 *   Nothing is uploaded on failure.
 *
 * RULES (from pre-implementation inspection):
 *   - Never dynamic import('@capacitor/*')
 *   - Never FileReader + base64 — URL.createObjectURL only, revoke immediately
 *   - position:fixed inside CSS transform ancestor gets trapped — outer
 *     container has no transform or willChange
 *   - iOS safe area: max(env(safe-area-inset-*), Npx) on all edges
 *   - Canvas at video's natural pixel dimensions, not CSS size
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Helmet } from '@dr.pogodin/react-helmet';
import {
  ArrowLeft, Settings, X, Check, Loader2,
  Lock, Unlock, Tag, AlertTriangle, Camera,
} from 'lucide-react';
import { usePhotoUploadQueue } from '@/hooks/usePhotoUploadQueue';
import { useWatermarkSettings } from '@/hooks/useWatermarkSettings';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface Job {
  id: number;
  name: string;
  jobNumber?: string | null;
}

// ─────────────────────────────────────────────────────────────────────────────
// Watermark compositor
// ─────────────────────────────────────────────────────────────────────────────

interface WatermarkOpts {
  showLabel:   boolean;
  showDate:    boolean;
  showTime:    boolean;
  showJobName: boolean;
  label:       string;
  jobName:     string;
}

/**
 * Composite watermark onto source and return a JPEG File.
 *
 * Layout — compact two-row panel anchored to bottom-left:
 *   Line 1: JobName — Date — Time   (only enabled values; separators removed cleanly)
 *   Line 2: Label                   (hidden when disabled or empty; wraps if long)
 *
 * Returns null if canvas or toBlob fails — caller must show error, not upload.
 */
async function compositeWatermark(
  source: HTMLVideoElement | ImageBitmap,
  opts: WatermarkOpts,
  fileName: string,
): Promise<File | null> {
  const w = source instanceof HTMLVideoElement ? source.videoWidth  : source.width;
  const h = source instanceof HTMLVideoElement ? source.videoHeight : source.height;
  if (!w || !h) return null;

  let canvas: HTMLCanvasElement;
  let ctx: CanvasRenderingContext2D;
  try {
    canvas = document.createElement('canvas');
    canvas.width  = w;
    canvas.height = h;
    const c = canvas.getContext('2d');
    if (!c) return null;
    ctx = c;
  } catch {
    return null;
  }

  ctx.drawImage(source, 0, 0, w, h);

  // Build line 1: JobName — Date — Time (only enabled, joined with em-dash separator)
  const now = new Date();
  const z   = (n: number) => String(n).padStart(2, '0');
  const line1Parts: string[] = [];
  if (opts.showJobName && opts.jobName.trim()) line1Parts.push(opts.jobName.trim().slice(0, 60));
  if (opts.showDate)  line1Parts.push(`${z(now.getDate())}/${z(now.getMonth() + 1)}/${now.getFullYear()}`);
  if (opts.showTime)  line1Parts.push(`${z(now.getHours())}:${z(now.getMinutes())}`);
  const line1 = line1Parts.join('  —  ');

  // Build line 2: Label (hidden when off or empty)
  const line2 = (opts.showLabel && opts.label.trim()) ? opts.label.trim().slice(0, 80) : '';

  const hasLine1 = line1.length > 0;
  const hasLine2 = line2.length > 0;
  if (!hasLine1 && !hasLine2) {
    // No watermark at all — return image as-is
    return new Promise<File | null>((resolve) => {
      try {
        canvas.toBlob(
          (blob) => resolve(blob ? new File([blob], fileName, { type: 'image/jpeg' }) : null),
          'image/jpeg', 0.88,
        );
      } catch { resolve(null); }
    });
  }

  // Typography
  const fontSize  = Math.max(16, Math.round(w * 0.024));
  const lineH     = fontSize * 1.35;
  const padH      = fontSize * 0.55;
  const padV      = fontSize * 0.45;
  const margin    = Math.round(w * 0.022);
  const maxWidth  = w - margin * 2;

  ctx.font         = `bold ${fontSize}px -apple-system, Arial, sans-serif`;
  ctx.textBaseline = 'alphabetic';

  // Measure lines (line2 may wrap — split into wrapped lines)
  const wrapText = (text: string, maxW: number): string[] => {
    const words = text.split(' ');
    const lines: string[] = [];
    let current = '';
    for (const word of words) {
      const test = current ? `${current} ${word}` : word;
      if (ctx.measureText(test).width > maxW && current) {
        lines.push(current);
        current = word;
      } else {
        current = test;
      }
    }
    if (current) lines.push(current);
    return lines;
  };

  const line1Rows  = hasLine1 ? [line1] : [];
  const line2Rows  = hasLine2 ? wrapText(line2, maxWidth - padH * 2) : [];
  const allRows    = [...line1Rows, ...line2Rows];
  const totalRows  = allRows.length;

  const panelH = padV * 2 + totalRows * lineH - (lineH - fontSize) * 0.5;
  const panelW = Math.min(
    maxWidth,
    Math.max(...allRows.map((r) => ctx.measureText(r).width)) + padH * 2,
  );
  const panelX = margin;
  const panelY = h - margin - panelH;
  const radius = fontSize * 0.32;

  // Background panel — dark grey at 65% opacity, rounded corners, auto-expands with wrapped label
  ctx.save();
  ctx.globalAlpha = 0.65;
  ctx.fillStyle   = '#1a1a1a';
  ctx.beginPath();
  ctx.roundRect(panelX, panelY, panelW, panelH, radius);
  ctx.fill();
  ctx.restore();

  // Divider between line1 and line2 (only when both present)
  if (hasLine1 && hasLine2) {
    const divY = panelY + padV + line1Rows.length * lineH - lineH * 0.15;
    ctx.save();
    ctx.globalAlpha = 0.28;
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth   = 1;
    ctx.beginPath();
    ctx.moveTo(panelX + padH * 0.5, divY);
    ctx.lineTo(panelX + panelW - padH * 0.5, divY);
    ctx.stroke();
    ctx.restore();
  }

  // Text rows
  ctx.save();
  ctx.globalAlpha = 1;
  ctx.fillStyle   = '#ffffff';
  ctx.font        = `bold ${fontSize}px -apple-system, Arial, sans-serif`;
  ctx.textBaseline = 'alphabetic';

  allRows.forEach((row, i) => {
    // Line 2 rows get slightly smaller / lighter weight
    const isLabel = i >= line1Rows.length;
    if (isLabel) {
      ctx.font      = `600 ${Math.round(fontSize * 0.92)}px -apple-system, Arial, sans-serif`;
      ctx.fillStyle = '#ffffff';
    } else {
      ctx.font      = `bold ${fontSize}px -apple-system, Arial, sans-serif`;
      ctx.fillStyle = '#ffffff';
    }
    const textY = panelY + padV + fontSize + i * lineH;
    ctx.fillText(row, panelX + padH, textY, panelW - padH * 2);
  });
  ctx.restore();

  return new Promise<File | null>((resolve) => {
    try {
      canvas.toBlob(
        (blob) => resolve(blob ? new File([blob], fileName, { type: 'image/jpeg' }) : null),
        'image/jpeg',
        0.88,
      );
    } catch {
      resolve(null);
    }
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

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
        if (!(r.headers.get('content-type') ?? '').includes('application/json')) return;
        const data = await r.json() as { job?: Job } | Job;
        setJob((data && 'job' in data ? data.job : data as Job) ?? null);
      })
      .catch(() => {});
  }, [id]);

  // ── Watermark settings ──────────────────────────────────────────────────────
  const { settings, toggle } = useWatermarkSettings();
  const [showSettings, setShowSettings] = useState(false);

  // ── Label state ─────────────────────────────────────────────────────────────
  const [labelLocked, setLabelLocked] = useState(false);
  const [label, setLabel]             = useState('');

  // ── Pending capture (unlocked mode) ────────────────────────────────────────
  // Frame is captured to ImageBitmap before the label prompt opens.
  // Cancelling closes the bitmap — nothing is uploaded.
  const [pendingBitmap,   setPendingBitmap]   = useState<ImageBitmap | null>(null);
  const [pendingFileName, setPendingFileName] = useState('');
  const [pendingLabel,    setPendingLabel]    = useState('');
  const pendingLabelRef = useRef<HTMLInputElement>(null);

  // ── Upload queue ────────────────────────────────────────────────────────────
  const { enqueueFiles, queue, isUploading } = usePhotoUploadQueue({ jobId });

  // ── Thumbnail of last saved photo ───────────────────────────────────────────
  const [lastThumb, setLastThumb] = useState<string | null>(null);
  const lastThumbRef = useRef<string | null>(null);
  useEffect(() => { lastThumbRef.current = lastThumb; }, [lastThumb]);

  // ── Camera stream ───────────────────────────────────────────────────────────
  const videoRef  = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  type CamState = 'loading' | 'ready' | 'error' | 'unavailable';
  const [camState,  setCamState]  = useState<CamState>('loading');
  const [camErrMsg, setCamErrMsg] = useState('');
  const [capturing, setCapturing] = useState(false);
  const [flashAnim, setFlashAnim] = useState(false);

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  const startStream = useCallback(async () => {
    stopStream();
    setCamState('loading');
    setCamErrMsg('');

    if (!navigator.mediaDevices?.getUserMedia) {
      setCamState('unavailable');
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCamState('ready');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (/Permission|NotAllowed|denied/i.test(msg)) {
        setCamErrMsg('Camera access was denied. Please allow camera access in Settings, then tap Retry.');
      } else if (/NotFound|DevicesNotFound/i.test(msg)) {
        setCamErrMsg('No camera found on this device.');
      } else {
        setCamErrMsg('Could not start the camera. Tap Retry or use the original Take Photo button.');
      }
      setCamState('error');
    }
  }, [stopStream]);

  useEffect(() => {
    void startStream();
    return () => {
      stopStream();
      if (lastThumbRef.current) URL.revokeObjectURL(lastThumbRef.current);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ── Composition error state ─────────────────────────────────────────────────
  const [composeError, setComposeError] = useState(false);

  // ── Build watermark opts ────────────────────────────────────────────────────
  const makeOpts = useCallback((resolvedLabel: string): WatermarkOpts => ({
    showLabel:   settings.showLabel,
    showDate:    settings.showDate,
    showTime:    settings.showTime,
    showJobName: settings.showJobName,
    label:       resolvedLabel,
    jobName:     job?.name ?? '',
  }), [settings, job]);

  // ── Finalise: composite + enqueue ───────────────────────────────────────────
  const finalise = useCallback(async (
    source: HTMLVideoElement | ImageBitmap,
    resolvedLabel: string,
    fileName: string,
  ): Promise<boolean> => {
    const file = await compositeWatermark(source, makeOpts(resolvedLabel), fileName);
    if (!file) {
      setComposeError(true);
      setCapturing(false);
      return false;
    }
    void enqueueFiles([file]);
    const thumb = URL.createObjectURL(file);
    setLastThumb((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return thumb;
    });
    setCapturing(false);
    return true;
  }, [makeOpts, enqueueFiles]);

  // ── Shutter ─────────────────────────────────────────────────────────────────
  const handleShutter = useCallback(async () => {
    if (camState !== 'ready' || capturing || !videoRef.current) return;
    const video = videoRef.current;
    if (!video.videoWidth || !video.videoHeight) return;

    setCapturing(true);
    setFlashAnim(true);
    setTimeout(() => setFlashAnim(false), 150);

    const fileName = `job-${jobId}-photo-${Date.now()}.jpg`;

    if (labelLocked) {
      // Locked: if label is empty, open the prompt once to obtain it, then lock
      if (settings.showLabel && !label.trim()) {
        // Capture bitmap first so the live frame is preserved while user types
        let bitmap: ImageBitmap;
        try { bitmap = await createImageBitmap(video); }
        catch { setComposeError(true); setCapturing(false); return; }
        setPendingBitmap(bitmap);
        setPendingFileName(fileName);
        setPendingLabel('');
        // Stay in capturing=true; prompt will finalise
        return;
      }
      // Label present (or showLabel off) — composite immediately
      await finalise(video, label, fileName);
    } else {
      // Unlocked: capture bitmap, then prompt
      let bitmap: ImageBitmap;
      try { bitmap = await createImageBitmap(video); }
      catch { setComposeError(true); setCapturing(false); return; }
      setPendingBitmap(bitmap);
      setPendingFileName(fileName);
      setPendingLabel(label); // pre-fill with last used value
    }
  }, [camState, capturing, jobId, labelLocked, label, settings.showLabel, finalise]);

  // ── Confirm label prompt ────────────────────────────────────────────────────
  const confirmPending = useCallback(async () => {
    if (!pendingBitmap) return;
    const bitmap   = pendingBitmap;
    const fileName = pendingFileName;
    const resolved = pendingLabel;

    setPendingBitmap(null);
    setPendingFileName('');

    // If we arrived here from locked mode with empty label, lock it now
    if (labelLocked) setLabel(resolved);
    else             setLabel(resolved); // remember for next pre-fill

    const ok = await finalise(bitmap, resolved, fileName);
    bitmap.close();
    if (!ok) return; // composeError already set
  }, [pendingBitmap, pendingFileName, pendingLabel, labelLocked, finalise]);

  // ── Cancel label prompt ─────────────────────────────────────────────────────
  const cancelPending = useCallback(() => {
    if (pendingBitmap) { pendingBitmap.close(); setPendingBitmap(null); }
    setPendingFileName('');
    setCapturing(false);
  }, [pendingBitmap]);

  // ── Live preview watermark (CSS only — not composited) ─────────────────────
  // Line 1: JobName — Date — Time  (only enabled values)
  // Line 2: Label                  (hidden when off or empty)
  const now  = new Date();
  const z    = (n: number) => String(n).padStart(2, '0');
  const previewLine1Parts: string[] = [];
  if (settings.showJobName && job?.name)  previewLine1Parts.push(job.name);
  if (settings.showDate)                  previewLine1Parts.push(`${z(now.getDate())}/${z(now.getMonth() + 1)}/${now.getFullYear()}`);
  if (settings.showTime)                  previewLine1Parts.push(`${z(now.getHours())}:${z(now.getMinutes())}`);
  const previewLine1 = previewLine1Parts.join('  —  ');
  const previewLine2 = (settings.showLabel && label.trim()) ? label.trim() : '';
  const hasPreview   = previewLine1.length > 0 || previewLine2.length > 0;

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────

  return (
    // No transform/willChange on this container — position:fixed children must
    // not be trapped inside a stacking context created by CSS transforms.
    <div className="fixed inset-0 z-50 bg-black flex flex-col" style={{ userSelect: 'none' }}>
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

        {/* getUserMedia unavailable */}
        {camState === 'unavailable' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black/90 px-8 text-center">
            <AlertTriangle size={36} className="text-yellow-400" />
            <p className="text-white text-sm font-semibold">
              Live camera preview is not available on this device.
            </p>
            <p className="text-gray-400 text-xs leading-relaxed">
              Use the <strong className="text-white">Take Photo</strong> button on the photos page instead.
            </p>
            <button
              onClick={() => navigate(`/jobs/${id}/photos`)}
              className="mt-1 px-5 py-2.5 bg-primary text-white text-sm font-semibold rounded-xl"
            >
              Back to Photos
            </button>
          </div>
        )}

        {/* Camera error */}
        {camState === 'error' && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-black/88 px-8 text-center">
            <AlertTriangle size={36} className="text-yellow-400" />
            <p className="text-white text-sm font-medium leading-relaxed">{camErrMsg}</p>
            <div className="flex gap-2 mt-1">
              <button
                onClick={() => void startStream()}
                className="px-4 py-2.5 bg-primary text-white text-sm font-semibold rounded-xl"
              >
                Retry
              </button>
              <button
                onClick={() => navigate(`/jobs/${id}/photos`)}
                className="px-4 py-2.5 bg-white/10 text-white text-sm font-semibold rounded-xl"
              >
                Back
              </button>
            </div>
            <p className="text-gray-500 text-xs mt-1">
              Or use <strong className="text-gray-300">Take Photo</strong> on the photos page.
            </p>
          </div>
        )}

        {/* Loading */}
        {camState === 'loading' && (
          <div className="absolute inset-0 flex items-center justify-center bg-black/60">
            <Loader2 size={32} className="animate-spin text-white/60" />
          </div>
        )}
      </div>

      {/* ── Black picture frame around lens area ── */}
      <div className="camera-lens-frame absolute inset-0 pointer-events-none z-10" />

      {/* ── Flash animation ── */}
      {flashAnim && (
        <div className="absolute inset-0 bg-white pointer-events-none z-30 opacity-70" />
      )}

      {/* ── Live watermark preview panel (CSS only — not composited) ── */}
      {camState === 'ready' && hasPreview && (
        <div
          className="absolute pointer-events-none z-10"
          style={{
            bottom: 'max(env(safe-area-inset-bottom), 10px)',
            left:   'max(env(safe-area-inset-left), 10px)',
            right:  'max(env(safe-area-inset-right), 10px)',
            marginBottom: '96px',
          }}
        >
          <div className="inline-flex flex-col gap-0.5 bg-black/65 rounded-lg px-2.5 py-1.5 max-w-full">
            {previewLine1 && (
              <span className="text-white text-[11px] font-bold leading-tight whitespace-nowrap">
                {previewLine1}
              </span>
            )}
            {previewLine2 && (
              <span className="text-white/88 text-[10px] font-semibold leading-tight break-words">
                {previewLine2}
              </span>
            )}
          </div>
        </div>
      )}

      {/* ── Top bar ── */}
      <div
        className="relative z-20 flex items-center gap-2 px-3 bg-gradient-to-b from-black/70 to-transparent shrink-0"
        style={{ paddingTop: 'max(env(safe-area-inset-top), 10px)', paddingBottom: '10px' }}
      >
        <button
          onClick={() => navigate(`/jobs/${id}/photos`)}
          className="w-9 h-9 flex items-center justify-center rounded-full bg-black/40 text-white hover:bg-black/60 transition-colors shrink-0"
          aria-label="Back to photos"
        >
          <ArrowLeft size={18} />
        </button>

        {/* Label input */}
        <div className="flex-1 flex items-center gap-1.5 bg-black/40 rounded-full px-3 h-9 min-w-0">
          <Tag size={13} className="text-white/60 shrink-0" />
          <input
            type="text"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder={labelLocked ? 'Label (locked)…' : 'Label…'}
            maxLength={60}
            className="flex-1 bg-transparent text-white text-sm placeholder-white/40 outline-none min-w-0"
            style={{ fontSize: '16px' }}
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
          aria-label={labelLocked ? 'Label locked' : 'Label unlocked'}
          title={labelLocked ? 'Tap to unlock — prompt after each shot' : 'Tap to lock — reuse label for all shots'}
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
        <div className="relative z-20 mx-3 mb-2 bg-black/78 backdrop-blur-sm rounded-2xl p-4 shrink-0">
          <div className="flex items-center justify-between mb-3">
            <p className="text-white text-sm font-semibold">Watermark fields</p>
            <button onClick={() => setShowSettings(false)} className="text-white/50 hover:text-white">
              <X size={15} />
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {(
              [
                { key: 'showJobName', display: 'Job name' },
                { key: 'showDate',    display: 'Date' },
                { key: 'showTime',    display: 'Time' },
                { key: 'showLabel',   display: 'Label' },
              ] as { key: keyof typeof settings; display: string }[]
            ).map(({ key, display }) => (
              <button
                key={key}
                onClick={() => toggle(key)}
                className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium transition-colors ${
                  settings[key] ? 'bg-primary text-white' : 'bg-white/10 text-white/55'
                }`}
              >
                {settings[key] ? <Check size={13} /> : <X size={13} />}
                {display}
              </button>
            ))}
          </div>
          <p className="text-white/38 text-[10px] mt-3 leading-relaxed">
            Line 1: Job name — Date — Time · Line 2: Label
          </p>
        </div>
      )}

      {/* Spacer */}
      <div className="flex-1" />

      {/* ── Bottom shutter bar ── */}
      <div
        className="relative z-20 flex items-center justify-between px-8 bg-gradient-to-t from-black/80 to-transparent shrink-0"
        style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 16px)', paddingTop: '16px' }}
      >
        {/* Thumbnail / back */}
        <button
          onClick={() => navigate(`/jobs/${id}/photos`)}
          className="w-14 h-14 rounded-xl overflow-hidden border-2 border-white/30 bg-white/10 flex items-center justify-center shrink-0 touch-manipulation"
          aria-label="Back to photos"
        >
          {lastThumb ? (
            <img src={lastThumb} alt="Last captured" className="w-full h-full object-cover" />
          ) : (
            <div className="flex flex-col items-center gap-0.5">
              <ArrowLeft size={16} className="text-white/60" />
              {queue.length > 0 && (
                <span className="text-[9px] text-white/60 font-bold">{queue.length}</span>
              )}
            </div>
          )}
        </button>

        {/* Shutter */}
        <button
          onClick={() => void handleShutter()}
          disabled={camState !== 'ready' || capturing}
          className="w-20 h-20 rounded-full border-4 border-white bg-white/20 flex items-center justify-center disabled:opacity-40 touch-manipulation active:scale-95 transition-transform shrink-0"
          aria-label="Take photo"
        >
          {capturing && !pendingBitmap ? (
            <Loader2 size={28} className="animate-spin text-white" />
          ) : (
            <div className="w-14 h-14 rounded-full bg-white" />
          )}
        </button>

        {/* Upload indicator */}
        <div className="w-14 h-14 flex flex-col items-center justify-center gap-1 shrink-0">
          {isUploading
            ? <Loader2 size={16} className="animate-spin text-white/60" />
            : <Camera size={16} className="text-white/25" />
          }
          {queue.length > 0 && (
            <span className="text-[9px] text-white/55 font-bold">{queue.length}</span>
          )}
        </div>
      </div>

      {/* ── Label prompt (unlocked mode, or locked+empty first shot) ── */}
      {pendingBitmap && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center p-4 bg-black/72">
          <div className="bg-gray-900 rounded-2xl p-5 w-full max-w-sm border border-white/10">
            <p className="text-white text-sm font-semibold mb-1">Add a label</p>
            <p className="text-gray-400 text-xs mb-3 leading-relaxed">
              Optional. Leave blank to skip.
              {!labelLocked && (
                <> Use the <Lock size={10} className="inline mx-0.5 text-gray-400" /> lock to reuse a label for rapid shots.</>
              )}
            </p>
            <div className="flex items-center gap-2 bg-white/10 rounded-xl px-3 h-11 mb-4">
              <Tag size={14} className="text-white/50 shrink-0" />
              <input
                ref={pendingLabelRef}
                type="text"
                value={pendingLabel}
                onChange={(e) => setPendingLabel(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') void confirmPending(); }}
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
                onClick={cancelPending}
                className="flex-1 py-2.5 rounded-xl border border-white/12 text-sm font-semibold text-gray-400 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => void confirmPending()}
                className="flex-1 py-2.5 rounded-xl bg-primary text-white text-sm font-semibold"
              >
                Save photo
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Composition failure error ── */}
      {composeError && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center p-4 bg-black/72">
          <div className="bg-gray-900 rounded-2xl p-5 w-full max-w-sm border border-red-900/40">
            <div className="flex items-start gap-3 mb-4">
              <AlertTriangle size={20} className="text-red-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-white text-sm font-semibold mb-1">Could not add watermark</p>
                <p className="text-gray-400 text-xs leading-relaxed">
                  The photo was not saved. No file was uploaded.
                </p>
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <button
                onClick={() => { setComposeError(false); setCapturing(false); }}
                className="w-full py-2.5 rounded-xl bg-primary text-white text-sm font-semibold"
              >
                Retry
              </button>
              <button
                onClick={() => { setComposeError(false); setCapturing(false); }}
                className="w-full py-2.5 rounded-xl border border-white/12 text-sm font-semibold text-gray-400 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => navigate(`/jobs/${id}/photos`)}
                className="w-full py-2.5 rounded-xl border border-white/12 text-sm font-semibold text-gray-400 hover:text-white transition-colors"
              >
                Use original camera
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
