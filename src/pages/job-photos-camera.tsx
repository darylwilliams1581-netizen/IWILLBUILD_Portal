/**
 * JobPhotosCameraPage  (/jobs/:id/camera)
 * ─────────────────────────────────────────────────────────────────────────────
 * Isolated full-screen camera viewport with watermark compositing.
 *
 * NATIVE PREVIEW:
 *   @capacitor-community/camera-preview owns the AVCaptureSession and renders
 *   its preview layer behind the transparent lens area. The React chrome stays
 *   interactive above it. No getUserMedia call is made in this page.
 *   If native preview cannot start within four seconds, the same shutter uses
 *   capturePhotoLocally() once so a site photo can still be saved offline.
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
 * COMPOSITION FAILURE:
 *   Native JPEG data is converted to an ImageBitmap, then passed through the
 *   existing JavaScript compositor so the stamp matches every other photo.
 *   If canvas creation or toBlob fails, an error panel is shown.
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
import { useParams, useNavigate, useLocation } from "react-router";
import { Helmet } from '@dr.pogodin/react-helmet';
import { CameraPreview } from '@capacitor-community/camera-preview';
import { ArrowLeft, Settings, X, Check, Loader2, Lock, Unlock, AlertTriangle, Pencil, Zap, ZapOff, FlipHorizontal2 } from 'lucide-react';
import { usePhotoUploadQueue } from '@/hooks/usePhotoUploadQueue';
import { useWatermarkSettings } from '@/hooks/useWatermarkSettings';
import { isNative } from '@/lib/capacitor-plugins';
import {
  capturePhotoLocally,
  deleteLocalPhoto,
  readLocalPhoto,
} from '@/lib/capturePhotoLocally';
import { goBack } from '@/lib/navigation';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

interface Job {
  id: number;
  name: string;
  jobNumber?: string | null;
}

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => reject(new Error(message)), timeoutMs);
    promise.then(
      value => {
        window.clearTimeout(timer);
        resolve(value);
      },
      error => {
        window.clearTimeout(timer);
        reject(error);
      },
    );
  });
}

function base64JpegToFile(value: string, fileName: string): File {
  const base64 = value.includes(',') ? value.slice(value.indexOf(',') + 1) : value;
  if (!base64) throw new Error('Native camera returned an empty photo.');
  const decoded = window.atob(base64);
  const chunks: ArrayBuffer[] = [];
  const chunkSize = 32_768;
  for (let offset = 0; offset < decoded.length; offset += chunkSize) {
    const slice = decoded.slice(offset, offset + chunkSize);
    const buffer = new ArrayBuffer(slice.length);
    const bytes = new Uint8Array(buffer);
    for (let index = 0; index < slice.length; index += 1) {
      bytes[index] = slice.charCodeAt(index);
    }
    chunks.push(buffer);
  }
  return new File(chunks, fileName, { type: 'image/jpeg', lastModified: Date.now() });
}

/** Temporarily reveal the native preview behind WKWebView for this route only. */
function makeCameraAncestorsTransparent(start: HTMLElement): () => void {
  const elements: HTMLElement[] = [];
  let current: HTMLElement | null = start;
  while (current) {
    elements.push(current);
    current = current.parentElement;
  }
  if (!elements.includes(document.documentElement)) elements.push(document.documentElement);

  const snapshots = elements.map(element => ({
    element,
    value: element.style.getPropertyValue('background-color'),
    priority: element.style.getPropertyPriority('background-color'),
  }));
  for (const { element } of snapshots) {
    element.style.setProperty('background-color', 'transparent', 'important');
  }

  return () => {
    for (const { element, value, priority } of snapshots) {
      if (value) element.style.setProperty('background-color', value, priority);
      else element.style.removeProperty('background-color');
    }
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Watermark compositor
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Sanitize a label string before display or storage.
 *
 * Allows: letters, numbers, spaces, standard punctuation, common symbols, emoji.
 * Removes: HTML tags, script content, control characters (except newlines which
 *           are collapsed to a single space), and excess whitespace.
 * Does NOT strip normal construction punctuation (-, /, #, @, &, etc.).
 */
function sanitizeLabel(raw: string): string {
  return raw
  // Strip HTML tags (including script/style content)
  .replace(/<script[\s\S]*?<\/script>/gi, '').replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<[^>]*>/g, '')
  // Collapse newlines / carriage returns to a space
  .replace(/[\r\n]+/g, ' ')
  // Remove C0/C1 control characters (except regular space U+0020)
  // eslint-disable-next-line no-control-regex
  .replace(/[\x00-\x1F\x7F-\x9F]/g, '')
  // Collapse multiple spaces to one
  .replace(/ {2,}/g, ' ').trim();
}

/**
 * Wrap a label string into at most 2 lines of ~60 chars each.
 * Prefers word-boundary wraps; hard-wraps at 60 if no space found.
 * Total input is capped at 120 characters before wrapping.
 */
function wrapLabel(text: string): string[] {
  const MAX_CHARS = 120;
  const LINE_WIDTH = 60;
  const capped = text.slice(0, MAX_CHARS);
  if (capped.length <= LINE_WIDTH) return [capped];

  // Find the last space at or before position LINE_WIDTH
  const breakAt = capped.lastIndexOf(' ', LINE_WIDTH);
  const splitAt = breakAt > 0 ? breakAt : LINE_WIDTH;
  const line1 = capped.slice(0, splitAt).trimEnd();
  const line2 = capped.slice(splitAt).trimStart().slice(0, LINE_WIDTH);
  return line2.length > 0 ? [line1, line2] : [line1];
}
interface WatermarkOpts {
  showLabel: boolean;
  showDate: boolean;
  showTime: boolean;
  showJobName: boolean;
  label: string;
  jobName: string;
  /** '0' = bottom-left horizontal (default); '-90' = bottom-right vertical, text reads upward */
  orientation: '0' | '-90';
}

/**
 * Composite watermark onto source and return a JPEG File.
 *
 * orientation '0'  — compact panel anchored bottom-left, horizontal text.
 * orientation '-90' — panel anchored bottom-right, rotated CCW 90°, text reads upward.
 *
 * Returns null if canvas or toBlob fails — caller must show error, not upload.
 */
async function compositeWatermark(source: HTMLVideoElement | ImageBitmap, opts: WatermarkOpts, fileName: string): Promise<File | null> {
  const w = source instanceof HTMLVideoElement ? source.videoWidth : source.width;
  const h = source instanceof HTMLVideoElement ? source.videoHeight : source.height;
  if (!w || !h) return null;
  let canvas: HTMLCanvasElement;
  let ctx: CanvasRenderingContext2D;
  try {
    canvas = document.createElement('canvas');
    canvas.width = w;
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
  const z = (n: number) => String(n).padStart(2, '0');
  const line1Parts: string[] = [];
  if (opts.showJobName && opts.jobName.trim()) line1Parts.push(opts.jobName.trim().slice(0, 60));
  if (opts.showDate) line1Parts.push(`${z(now.getDate())}/${z(now.getMonth() + 1)}/${now.getFullYear()}`);
  if (opts.showTime) line1Parts.push(`${z(now.getHours())}:${z(now.getMinutes())}`);
  const line1 = line1Parts.join('  —  ');

  // Build line 2: Label (hidden when off or empty; max 120 chars, max 2 wrapped lines)
  // Sanitize here as defence-in-depth — the value should already be clean from input handlers
  const line2 = opts.showLabel && opts.label.trim() ? sanitizeLabel(opts.label).trim().slice(0, 120) : '';
  const hasLine1 = line1.length > 0;
  const hasLine2 = line2.length > 0;
  if (!hasLine1 && !hasLine2) {
    // No watermark at all — return image as-is
    return new Promise<File | null>(resolve => {
      try {
        canvas.toBlob(blob => resolve(blob ? new File([blob], fileName, {
          type: 'image/jpeg'
        }) : null), 'image/jpeg', 0.88);
      } catch {
        resolve(null);
      }
    });
  }

  // ── Typography (shared between both orientations) ──────────────────────────
  // For -90° the image is landscape (w > h typically), so base font on the
  // shorter dimension to keep the panel proportional.
  const refDim = opts.orientation === '-90' ? Math.min(w, h) : w;
  const fontSize = Math.max(16, Math.round(refDim * 0.024));
  const lineH = fontSize * 1.35;
  const padH = fontSize * 0.55;
  const padV = fontSize * 0.45;
  const margin = Math.round(refDim * 0.022);
  const radius = fontSize * 0.32;
  ctx.font = `bold ${fontSize}px -apple-system, Arial, sans-serif`;
  ctx.textBaseline = 'alphabetic';

  // Measure lines — label uses shared wrapLabel (max 2 lines, 120 chars)
  const line1Rows = hasLine1 ? [line1] : [];
  const line2Rows = hasLine2 ? wrapLabel(line2) : [];
  const allRows = [...line1Rows, ...line2Rows];
  const totalRows = allRows.length;
  const panelH = padV * 2 + totalRows * lineH - (lineH - fontSize) * 0.5;
  if (opts.orientation === '-90') {
    // ── Rotated mode: bottom-right corner, text reads upward ─────────────────
    //
    // Strategy: translate origin to the bottom-right corner, rotate CCW 90°.
    // In the rotated coordinate system the "bottom-left" of the panel maps to
    // the physical bottom-right of the image, and the panel grows upward
    // (toward the physical top-right).
    //
    // In the rotated frame:
    //   x-axis points upward in the physical image
    //   y-axis points leftward in the physical image
    //
    // We constrain panelW to the physical image height minus two margins so
    // the panel never overflows the top or bottom edge.
    const maxPanelW = h - margin * 2;
    const panelW = Math.min(maxPanelW, Math.max(...allRows.map(r => ctx.measureText(r).width)) + padH * 2);
    ctx.save();
    // Move origin to bottom-right corner, then rotate CCW 90°
    ctx.translate(w, h);
    ctx.rotate(-Math.PI / 2);
    // Now we're in a rotated frame where (0,0) is the physical bottom-right.
    // Place the panel at bottom-left of this rotated frame = physical bottom-right.
    const panelX = margin;
    const panelY = -panelH - margin; // negative because we're above the rotated baseline

    // Background panel
    ctx.globalAlpha = 0.65;
    ctx.fillStyle = '#1a1a1a';
    ctx.beginPath();
    ctx.roundRect(panelX, panelY, panelW, panelH, radius);
    ctx.fill();
    ctx.globalAlpha = 1;

    // Divider
    if (hasLine1 && hasLine2) {
      const divY = panelY + padV + line1Rows.length * lineH - lineH * 0.15;
      ctx.save();
      ctx.globalAlpha = 0.28;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(panelX + padH * 0.5, divY);
      ctx.lineTo(panelX + panelW - padH * 0.5, divY);
      ctx.stroke();
      ctx.restore();
    }

    // Text rows
    ctx.fillStyle = '#ffffff';
    ctx.textBaseline = 'alphabetic';
    allRows.forEach((row, i) => {
      const isLabel = i >= line1Rows.length;
      ctx.font = isLabel ? `600 ${Math.round(fontSize * 0.92)}px -apple-system, Arial, sans-serif` : `bold ${fontSize}px -apple-system, Arial, sans-serif`;
      const textY = panelY + padV + fontSize + i * lineH;
      ctx.fillText(row, panelX + padH, textY, panelW - padH * 2);
    });
    ctx.restore();
  } else {
    // ── Normal mode: bottom-left corner, horizontal ───────────────────────────
    const maxWidth = w - margin * 2;
    const panelW = Math.min(maxWidth, Math.max(...allRows.map(r => ctx.measureText(r).width)) + padH * 2);
    const panelX = margin;
    const panelY = h - margin - panelH;

    // Background panel
    ctx.save();
    ctx.globalAlpha = 0.65;
    ctx.fillStyle = '#1a1a1a';
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
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(panelX + padH * 0.5, divY);
      ctx.lineTo(panelX + panelW - padH * 0.5, divY);
      ctx.stroke();
      ctx.restore();
    }

    // Text rows
    ctx.save();
    ctx.globalAlpha = 1;
    ctx.fillStyle = '#ffffff';
    ctx.textBaseline = 'alphabetic';
    allRows.forEach((row, i) => {
      const isLabel = i >= line1Rows.length;
      ctx.font = isLabel ? `600 ${Math.round(fontSize * 0.92)}px -apple-system, Arial, sans-serif` : `bold ${fontSize}px -apple-system, Arial, sans-serif`;
      ctx.fillStyle = '#ffffff';
      const textY = panelY + padV + fontSize + i * lineH;
      ctx.fillText(row, panelX + padH, textY, panelW - padH * 2);
    });
    ctx.restore();
  }
  return new Promise<File | null>(resolve => {
    try {
      canvas.toBlob(blob => resolve(blob ? new File([blob], fileName, {
        type: 'image/jpeg'
      }) : null), 'image/jpeg', 0.88);
    } catch {
      resolve(null);
    }
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────────────────────────────────────

export default function JobPhotosCameraPage() {
  const {
    id
  } = useParams<{
    id: string;
  }>();
  const navigate = useNavigate();
  const location = useLocation();

  // Optional overrides passed via navigate state (e.g. from job-card-detail)
  const locationState = location.state as {
    uploadEndpoint?: string;
    backPath?: string;
    jobName?: string;
  } | null;
  const uploadEndpointOverride = locationState?.uploadEndpoint;
  const backPath = typeof locationState?.backPath === 'string' && locationState.backPath.trim() ? locationState.backPath : undefined;
  const jobNameOverride = locationState?.jobName;
  const jobId = Number(id);
  const cameraFallback = backPath ?? (Number.isFinite(jobId) && jobId > 0 ? `/jobs/${jobId}/photos` : '/home');

  // ── Job metadata ────────────────────────────────────────────────────────────
  const [job, setJob] = useState<Job | null>(null);
  useEffect(() => {
    if (!id) return;
    // If a name was passed via state (job card mode), skip the API fetch
    if (jobNameOverride) return;
    fetch(`/api/jobs/${id}`, {
      credentials: 'include'
    }).then(async r => {
      if (!r.ok) return;
      if (!(r.headers.get('content-type') ?? '').includes('application/json')) return;
      const data = (await r.json()) as {
        job?: Job;
      } | Job;
      setJob((data && 'job' in data ? data.job : data as Job) ?? null);
    }).catch(() => {});
  }, [id, jobNameOverride]);

  // ── Watermark settings ──────────────────────────────────────────────────────
  const {
    settings,
    toggle,
    update
  } = useWatermarkSettings();
  const [showSettings, setShowSettings] = useState(false);
  const [showWatermarkPopup, setShowWatermarkPopup] = useState(false);

  // Draft state inside the watermark popup (committed on Done)
  const [draftLabel, setDraftLabel] = useState('');
  const [draftLocked, setDraftLocked] = useState(false);

  // ── Label state ─────────────────────────────────────────────────────────────
  const [labelLocked, setLabelLocked] = useState(false);
  const [label, setLabel] = useState('');

  // ── Pending capture (unlocked mode) ────────────────────────────────────────
  // Frame is captured to ImageBitmap before the label prompt opens.
  // Cancelling closes the bitmap — nothing is uploaded.
  const [pendingBitmap, setPendingBitmap] = useState<ImageBitmap | null>(null);
  const [pendingFileName, setPendingFileName] = useState('');
  const [pendingLabel, setPendingLabel] = useState('');
  const [pendingLocalPath, setPendingLocalPath] = useState<string | null>(null);
  const pendingLabelRef = useRef<HTMLTextAreaElement>(null);

  // ── Upload queue ────────────────────────────────────────────────────────────
  const {
    enqueueFiles,
    queue,
    isUploading
  } = usePhotoUploadQueue({
    jobId,
    uploadEndpoint: uploadEndpointOverride
  });
  const cameraRootRef = useRef<HTMLDivElement>(null);
  const lensRef = useRef<HTMLDivElement>(null);
  const previewStartedRef = useRef(false);
  const previewStartRef = useRef<Promise<void> | null>(null);
  const previewGenerationRef = useRef(0);
  type CamState = 'starting' | 'ready' | 'unavailable';
  const [camState, setCamState] = useState<CamState>('starting');
  const [camErrMsg, setCamErrMsg] = useState('');
  const [capturing, setCapturing] = useState(false);
  const [flashAnim, setFlashAnim] = useState(false);
  const [composeError, setComposeError] = useState(false);

  // ── Last captured thumbnail (gallery button preview) ────────────────────────
  const [lastThumb, setLastThumb] = useState<string | null>(null);
  const lastThumbRef = useRef<string | null>(null);

  // ── Session photo counter & limit ───────────────────────────────────────────
  const SESSION_MAX = 10;
  const [sessionCount, setSessionCount] = useState(0);
  const sessionLimitReached = sessionCount >= SESSION_MAX;

  // ── Facing mode (rear / front) ──────────────────────────────────────────────
  type FacingMode = 'environment' | 'user';
  const [facingMode, setFacingMode] = useState<FacingMode>('environment');
  const facingModeRef = useRef<FacingMode>('environment');

  // ── Flash mode ──────────────────────────────────────────────────────────────
  // 'auto' | 'on' | 'off' — passed to the native preview when supported
  type FlashMode = 'auto' | 'on' | 'off';
  const [flashMode, setFlashMode] = useState<FlashMode>('auto');
  const flashModeRef = useRef<FlashMode>('auto');
  // Whether the device supports flash control (detected after preview starts)
  const [torchSupported, setTorchSupported] = useState(false);

  const stopPreview = useCallback(async () => {
    previewGenerationRef.current += 1;
    const preview = isNative() ? CameraPreview : null;
    const pendingStart = previewStartRef.current;
    previewStartRef.current = null;
    const wasStarted = previewStartedRef.current;
    previewStartedRef.current = false;
    if (!preview) return;

    // If start() is still inside AVFoundation, stop as soon as it resolves.
    if (pendingStart && !wasStarted) {
      try {
        await withTimeout(CameraPreview.stop(), 2_000, 'Camera stop timed out.');
      } catch {
        // start() may not have created its session yet; late cleanup below wins.
      }
      void pendingStart.then(() => CameraPreview.stop()).catch(() => {});
      return;
    }
    if (wasStarted) {
      try {
        await withTimeout(CameraPreview.stop(), 2_000, 'Camera stop timed out.');
      } catch {
        // An already-stopped native session needs no further cleanup.
      }
    }
  }, []);

  const startNativePreview = useCallback(async () => {
    await stopPreview();
    const generation = previewGenerationRef.current;
    const preview = isNative() ? CameraPreview : null;
    const lens = lensRef.current;
    if (!isNative() || !preview || !lens) {
      setCamState('unavailable');
      setCamErrMsg('Native live preview is unavailable. The shutter still opens the iPhone camera.');
      return;
    }

    setCamState('starting');
    setCamErrMsg('');
    const rect = lens.getBoundingClientRect();
    const scale = window.devicePixelRatio || 1;
    const startCall = preview.start({
      parent: 'iwb-native-lens',
      // The iOS plugin converts x/y from device pixels but accepts dimensions
      // in points. These are layout bounds, not capture-resolution requests.
      x: Math.round(rect.left * scale),
      y: Math.round(rect.top * scale),
      width: Math.max(1, Math.round(rect.width)),
      height: Math.max(1, Math.round(rect.height)),
      position: 'rear',
      toBack: true,
      storeToFile: false,
      disableAudio: true,
      rotateWhenOrientationChanged: true,
    });
    previewStartRef.current = startCall;

    try {
      await withTimeout(startCall, 4_000, 'Native preview did not start within 4 seconds.');
      if (previewGenerationRef.current !== generation) {
        await CameraPreview.stop().catch(() => {});
        return;
      }
      const status = await withTimeout(
        preview.isCameraStarted(),
        750,
        'Native preview did not report a live session.',
      );
      if (!status.value) throw new Error('Native preview did not report a live session.');

      previewStartRef.current = null;
      previewStartedRef.current = true;
      setCamState('ready');

      try {
        const { result } = await preview.getSupportedFlashModes();
        const supported = result.some(mode => mode === 'auto' || mode === 'on' || mode === 'torch');
        setTorchSupported(supported);
        if (result.includes('auto')) await preview.setFlashMode({ flashMode: 'auto' });
      } catch {
        setTorchSupported(false);
      }
    } catch (error) {
      if (previewGenerationRef.current !== generation) return;
      previewStartRef.current = null;
      previewStartedRef.current = false;
      const message = error instanceof Error ? error.message : String(error);
      setCamErrMsg(/permission|denied/i.test(message)
        ? 'Camera access is off. Allow Camera access in iPhone Settings, then reopen Lens.'
        : 'Live preview is unavailable. The shutter still opens the iPhone camera.');
      setCamState('unavailable');
      // A timed-out start may resolve later. Never leave that session running.
      void startCall.then(() => CameraPreview.stop()).catch(() => {});
    }
  }, [stopPreview]);

  useEffect(() => {
    if (!isNative()) {
      setCamState('unavailable');
      setCamErrMsg('Native live preview is available in the iPhone app.');
      return;
    }

    const root = cameraRootRef.current;
    const restoreBackgrounds = root ? makeCameraAncestorsTransparent(root) : () => {};
    const frame = window.requestAnimationFrame(() => void startNativePreview());
    return () => {
      window.cancelAnimationFrame(frame);
      void stopPreview();
      restoreBackgrounds();
      if (lastThumbRef.current) URL.revokeObjectURL(lastThumbRef.current);
    };
  }, [startNativePreview, stopPreview]);

  const handleBack = useCallback(async () => {
    await stopPreview();
    goBack(navigate, cameraFallback);
  }, [stopPreview, navigate, cameraFallback]);

  // ── Flip camera ─────────────────────────────────────────────────────────────
  const handleFlip = useCallback(async () => {
    if (camState !== 'ready') return;
    const preview = isNative() ? CameraPreview : null;
    if (!preview) return;
    try {
      await preview.flip();
      const next: FacingMode = facingModeRef.current === 'environment' ? 'user' : 'environment';
      facingModeRef.current = next;
      setFacingMode(next);
    } catch {
      setCamErrMsg('Could not switch cameras.');
    }
  }, [camState]);

  // ── Cycle flash mode ────────────────────────────────────────────────────────
  const handleFlashCycle = useCallback(async () => {
    if (camState !== 'ready') return;
    const preview = isNative() ? CameraPreview : null;
    if (!preview) return;
    const order: FlashMode[] = ['auto', 'on', 'off'];
    const next = order[(order.indexOf(flashModeRef.current) + 1) % order.length];
    try {
      await preview.setFlashMode({ flashMode: next });
      flashModeRef.current = next;
      setFlashMode(next);
    } catch {
      setTorchSupported(false);
    }
  }, [camState]);
  // ── Build watermark opts ────────────────────────────────────────────────────
  const makeOpts = useCallback((resolvedLabel: string): WatermarkOpts => ({
    showLabel: settings.showLabel,
    showDate: settings.showDate,
    showTime: settings.showTime,
    showJobName: settings.showJobName,
    label: resolvedLabel,
    jobName: jobNameOverride ?? job?.name ?? '',
    orientation: settings.orientation
  }), [settings, job, jobNameOverride]);

  // ── Finalise: composite + enqueue ───────────────────────────────────────────
  const finalise = useCallback(async (
    source: HTMLVideoElement | ImageBitmap,
    resolvedLabel: string,
    fileName: string,
    fallbackLocalPath?: string | null,
  ): Promise<boolean> => {
    const file = await compositeWatermark(source, makeOpts(resolvedLabel), fileName);
    if (!file) {
      setComposeError(true);
      setCapturing(false);
      return false;
    }
    try {
      // Await the existing IndexedDB queue write before deleting a fallback
      // source. The final JPEG is durable on the phone before upload begins.
      await enqueueFiles([file]);
      if (fallbackLocalPath) await deleteLocalPhoto(fallbackLocalPath);
    } catch {
      setComposeError(true);
      setCapturing(false);
      return false;
    }
    const thumb = URL.createObjectURL(file);
    setLastThumb(prev => {
      if (prev) URL.revokeObjectURL(prev);
      lastThumbRef.current = thumb;
      return thumb;
    });
    setSessionCount(n => n + 1);
    setCapturing(false);
    return true;
  }, [makeOpts, enqueueFiles]);

  // ── Shutter ─────────────────────────────────────────────────────────────────
  const handleShutter = useCallback(async () => {
    if (capturing || sessionLimitReached) return;
    setCapturing(true);
    setFlashAnim(true);
    window.setTimeout(() => setFlashAnim(false), 150);

    const fileName = `job-${jobId}-photo-${Date.now()}.jpg`;
    let bitmap: ImageBitmap | null = null;
    let fallbackLocalPath: string | null = null;

    try {
      if (camState === 'ready') {
        try {
          const result = await withTimeout(
            CameraPreview.capture({ quality: 88 }),
            12_000,
            'Native photo capture timed out.',
          );
          bitmap = await createImageBitmap(base64JpegToFile(result.value, fileName));
        } catch {
          // The preview session failed after launch. Stop it before opening the
          // one-shot native fallback so two AVCaptureSessions never compete.
          await stopPreview();
          setCamState('unavailable');
          setCamErrMsg('Live preview stopped. The shutter now uses the iPhone camera.');
        }
      }

      if (!bitmap) {
        const captured = await capturePhotoLocally();
        fallbackLocalPath = captured.localPath;
        const localFile = await readLocalPhoto(captured.localPath, fileName, 'image/jpeg');
        if (!localFile) throw new Error('The captured photo could not be read from this device.');
        bitmap = await createImageBitmap(localFile);
      }

      if (labelLocked) {
        // Locked: if label is empty, open the prompt once to obtain it, then lock.
        if (settings.showLabel && !label.trim()) {
          setPendingBitmap(bitmap);
          setPendingFileName(fileName);
          setPendingLocalPath(fallbackLocalPath);
          setPendingLabel('');
          return;
        }
        const saved = await finalise(bitmap, label, fileName, fallbackLocalPath);
        bitmap.close();
        if (saved && fallbackLocalPath) {
          setCamErrMsg('Photo saved on this device. Tap the shutter for another.');
        }
        return;
      }

      // Unlocked: preserve the captured frame while the user enters a label.
      setPendingBitmap(bitmap);
      setPendingFileName(fileName);
      setPendingLocalPath(fallbackLocalPath);
      setPendingLabel(sanitizeLabel(label).slice(0, 120));
    } catch (error) {
      bitmap?.close();
      const message = error instanceof Error ? error.message : String(error);
      const cancelled = /cancel|dismiss|no image|user cancelled/i.test(message);
      setCamErrMsg(cancelled
        ? 'Camera ready.'
        : message || 'The photo could not be captured. Check Camera access in iPhone Settings.');
      setCapturing(false);
    }
  }, [
    capturing,
    sessionLimitReached,
    jobId,
    camState,
    stopPreview,
    labelLocked,
    settings.showLabel,
    label,
    finalise,
  ]);
  // ── Confirm label prompt ────────────────────────────────────────────────────
  const confirmPending = useCallback(async () => {
    if (!pendingBitmap) return;
    const bitmap = pendingBitmap;
    const fileName = pendingFileName;
    const resolved = pendingLabel;
    const fallbackLocalPath = pendingLocalPath;
    setPendingBitmap(null);
    setPendingFileName('');
    setPendingLocalPath(null);

    // If we arrived here from locked mode with empty label, lock it now
    if (labelLocked) setLabel(resolved);else setLabel(resolved); // remember for next pre-fill

    const ok = await finalise(bitmap, resolved, fileName, fallbackLocalPath);
    bitmap.close();
    if (!ok) return; // composeError already set
    if (fallbackLocalPath) setCamErrMsg('Photo saved on this device. Tap the shutter for another.');
  }, [pendingBitmap, pendingFileName, pendingLabel, pendingLocalPath, labelLocked, finalise]);

  // ── Cancel label prompt ─────────────────────────────────────────────────────
  const cancelPending = useCallback(() => {
    if (pendingBitmap) {
      pendingBitmap.close();
      setPendingBitmap(null);
    }
    if (pendingLocalPath) void deleteLocalPhoto(pendingLocalPath);
    setPendingFileName('');
    setPendingLocalPath(null);
    setCapturing(false);
  }, [pendingBitmap, pendingLocalPath]);

  // ── Watermark popup helpers ─────────────────────────────────────────────────
  const openWatermarkPopup = useCallback(() => {
    setDraftLabel(sanitizeLabel(label).slice(0, 120));
    setDraftLocked(labelLocked);
    setShowWatermarkPopup(true);
  }, [label, labelLocked]);
  const commitWatermarkPopup = useCallback(() => {
    // Sanitize once more on commit — single source of truth
    setLabel(sanitizeLabel(draftLabel).slice(0, 120));
    setLabelLocked(draftLocked);
    setShowWatermarkPopup(false);
  }, [draftLabel, draftLocked]);

  // ── Live preview watermark (CSS only — not composited) ─────────────────────
  // Line 1: JobName — Date — Time  (only enabled values)
  // Line 2: Label                  (hidden when off or empty)
  const now = new Date();
  const z = (n: number) => String(n).padStart(2, '0');
  const previewLine1Parts: string[] = [];
  if (settings.showJobName && (jobNameOverride ?? job?.name)) previewLine1Parts.push((jobNameOverride ?? job?.name)!);
  if (settings.showDate) previewLine1Parts.push(`${z(now.getDate())}/${z(now.getMonth() + 1)}/${now.getFullYear()}`);
  if (settings.showTime) previewLine1Parts.push(`${z(now.getHours())}:${z(now.getMinutes())}`);
  const previewLine1 = previewLine1Parts.join('  —  ');
  const previewLabelRows = settings.showLabel && label.trim() ? wrapLabel(label.trim()) : [];

  // ─────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────

  return (
    // No transform/willChange on this container — position:fixed children must
    // not be trapped inside a stacking context created by CSS transforms.
    <div ref={cameraRootRef} className="fixed inset-0 z-50 bg-transparent flex flex-col" style={{
      userSelect: 'none'
    }}>
      <Helmet>
        <title>Camera — IWIllBUIlD</title>
        <meta name="description" content="Take watermarked job site photos." />
        <link rel="canonical" href={`https://iwillbuild.com/jobs/${jobId}/camera`} />
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>
      <h1 className="sr-only">Job Camera</h1>

      {/* ── Top bar: Back · job name · Flash · Flip ── */}
      <div className="relative z-20 flex items-center gap-2 px-3 shrink-0 bg-gradient-to-b from-black/70 to-transparent" style={{
        paddingTop: 'max(env(safe-area-inset-top), 10px)',
        paddingBottom: '10px'
      }}>
        {/* Back */}
        <button onClick={() => void handleBack()} className="w-9 h-9 flex items-center justify-center rounded-full bg-black/40 text-white hover:bg-black/60 transition-colors shrink-0" aria-label="Back to photos">
          <ArrowLeft size={18} />
        </button>

        {/* Job name */}
        <span className="flex-1 text-white text-sm font-semibold truncate px-1">
          {jobNameOverride ?? job?.name ?? 'Camera'}
        </span>

        {/* Flash cycle button */}
        <button onClick={() => void handleFlashCycle()} disabled={!torchSupported} className={`flex items-center gap-1 px-2.5 h-9 rounded-full transition-colors shrink-0 ${!torchSupported ? 'bg-black/20 text-white/25 cursor-default' : flashMode === 'on' ? 'bg-yellow-400/20 text-yellow-300' : flashMode === 'off' ? 'bg-black/40 text-white/40' : 'bg-black/40 text-white/80' /* auto */}`} aria-label={`Flash: ${flashMode}`} title={torchSupported ? `Flash: ${flashMode} — tap to cycle` : 'Flash not supported on this device'}>
          {flashMode === 'off' ? <ZapOff size={16} /> : <Zap size={16} className={flashMode === 'on' ? 'fill-yellow-300' : ''} />}
          <span className="text-[10px] font-bold leading-none tracking-wide">
            {flashMode === 'auto' ? 'AUTO' : flashMode === 'on' ? 'ON' : 'OFF'}
          </span>
        </button>

        {/* Flip camera */}
        <button onClick={() => void handleFlip()} disabled={camState !== 'ready'} className="w-9 h-9 flex items-center justify-center rounded-full bg-black/40 text-white hover:bg-black/60 transition-colors shrink-0 disabled:opacity-40" aria-label={facingMode === 'environment' ? 'Switch to front camera' : 'Switch to rear camera'} title={facingMode === 'environment' ? 'Switch to front camera' : 'Switch to rear camera'}>
          <FlipHorizontal2 size={18} />
        </button>
      </div>

      {/* ── Lens area — picture frame + live preview ── */}
      <div id="iwb-native-lens" ref={lensRef} className="relative flex-1 min-h-0 overflow-hidden bg-transparent camera-lens-frame">
        {/* Native AVCapture preview is rendered behind this transparent frame. */}

        {/* Native preview fallback — no retry loop and shutter remains active. */}
        {camState === 'unavailable' && <div className="absolute inset-x-4 top-4 z-20 flex items-center gap-3 rounded-xl bg-black/70 px-4 py-3 text-left backdrop-blur-sm">
            <AlertTriangle size={36} className="text-yellow-400" />
            <div>
              <p className="text-white text-sm font-semibold">{camErrMsg}</p>
              <p className="mt-0.5 text-gray-300 text-xs leading-relaxed">
                Tap the shutter to take and save a watermarked photo.
              </p>
            </div>
          </div>}

        {/* Small status only; chrome and shutter paint immediately. */}
        {camState === 'starting' && <div className="absolute right-3 top-3 z-20 flex items-center gap-1.5 rounded-full bg-black/55 px-2.5 py-1.5 text-white/80 backdrop-blur-sm">
            <Loader2 size={13} className="animate-spin" />
            <span className="text-[10px] font-semibold">Starting camera</span>
          </div>}

        {/* Flash animation */}
        {flashAnim && <div className="absolute inset-0 bg-white pointer-events-none z-30 opacity-70" />}

        {/* ── Tappable watermark pill ── */}
        {/* orientation '0': bottom-left, horizontal */}
        {/* orientation '-90': bottom-right, rotated CCW 90° — text reads upward */}
        <button onClick={openWatermarkPopup} className={`absolute z-10 text-left ${settings.orientation === '-90' ? 'bottom-3 right-3 origin-bottom-right' : 'bottom-3 left-3'}`} style={settings.orientation === '-90' ? {
          transform: 'rotate(-90deg)',
          transformOrigin: 'bottom right'
        } : undefined} aria-label="Edit watermark">
          <div className="inline-flex flex-col gap-0.5 bg-black/65 rounded-lg px-2.5 py-1.5 max-w-[calc(100vw-1.5rem)]">
            {previewLine1 && <span className="text-white text-[11px] font-bold leading-tight whitespace-nowrap">
                {previewLine1}
              </span>}
            {previewLabelRows.map((row, i) => <span key={i} className="text-white text-[10px] font-semibold leading-tight break-words">
                {row}
              </span>)}
            {/* Edit hint icon */}
            <span className="flex items-center gap-1 mt-0.5">
              <Pencil size={9} className="text-white/40" />
              <span className="text-white/40 text-[9px] leading-none">tap to edit</span>
            </span>
          </div>
        </button>
      </div>

      {/* ── Bottom footer: Back · Lock · SHUTTER · Settings · Gallery ── */}
      <div className="relative z-20 shrink-0 bg-gradient-to-t from-black/90 to-transparent" style={{
        paddingBottom: 'max(env(safe-area-inset-bottom), 16px)',
        paddingTop: '12px'
      }}>
        <div className="flex items-center justify-between px-6">

          {/* Back / gallery thumbnail */}
          <button onClick={() => void handleBack()} className="w-14 h-14 rounded-xl overflow-hidden border-2 border-white/30 bg-white/10 flex items-center justify-center shrink-0 touch-manipulation" aria-label="Back to photos">
            {lastThumb ? <img src={lastThumb} alt="Last captured" className="w-full h-full object-cover" /> : <div className="flex flex-col items-center gap-0.5">
                <ArrowLeft size={16} className="text-white/60" />
                {queue.length > 0 && <span className="text-[9px] text-white/60 font-bold">{queue.length}</span>}
              </div>}
          </button>

          {/* Lock */}
          <button onClick={() => setLabelLocked(v => !v)} className={`w-11 h-11 flex flex-col items-center justify-center rounded-full transition-colors shrink-0 gap-0.5 ${labelLocked ? 'bg-primary text-white' : 'bg-white/10 text-white/60 hover:bg-white/20'}`} aria-label={labelLocked ? 'Label locked — tap to unlock' : 'Label unlocked — tap to lock'} title={labelLocked ? 'Tap to unlock — prompt after each shot' : 'Tap to lock — reuse label for all shots'}>
            {labelLocked ? <Lock size={16} /> : <Unlock size={16} />}
            <span className="text-[8px] font-semibold leading-none opacity-70">
              {labelLocked ? 'LOCKED' : 'LOCK'}
            </span>
          </button>

          {/* Shutter — dominant centre control */}
          <button onClick={() => void handleShutter()} disabled={capturing || sessionLimitReached} className="w-20 h-20 rounded-full border-4 border-white bg-white/20 flex items-center justify-center disabled:opacity-40 touch-manipulation active:scale-95 transition-transform shrink-0" aria-label="Take photo">
            {capturing && !pendingBitmap ? <Loader2 size={28} className="animate-spin text-white" /> : <div className="w-14 h-14 rounded-full bg-white" />}
          </button>

          {/* Settings */}
          <button onClick={() => setShowSettings(v => !v)} className={`w-11 h-11 flex flex-col items-center justify-center rounded-full transition-colors shrink-0 gap-0.5 ${showSettings ? 'bg-primary text-white' : 'bg-white/10 text-white/60 hover:bg-white/20'}`} aria-label="Watermark settings">
            <Settings size={16} />
            <span className="text-[8px] font-semibold leading-none opacity-70">FIELDS</span>
          </button>

          {/* Photo counter / session status */}
          <div className="w-14 h-14 flex flex-col items-center justify-center gap-0.5 shrink-0">
            {sessionLimitReached ? <>
                <span className="text-[11px] font-bold text-white/60 leading-none">10 / 10</span>
                <span className="text-[8px] text-yellow-400/80 font-semibold leading-none text-center px-0.5">limit reached</span>
              </> : <>
                <span className="text-[11px] font-bold text-white/50 leading-none">
                  {sessionCount} / {SESSION_MAX}
                </span>
                {isUploading && <Loader2 size={10} className="animate-spin text-white/40" />}
              </>}
          </div>
        </div>
      </div>

      {/* ── Settings panel (watermark field toggles) ── */}
      {showSettings && <div className="fixed z-[55] left-0 right-0 mx-3 bg-black/90 backdrop-blur-sm rounded-2xl p-4" style={{
        bottom: 'calc(max(env(safe-area-inset-bottom), 16px) + 88px)'
      }}>
          <div className="flex items-center justify-between mb-3">
            <p className="text-white text-sm font-semibold">Watermark fields</p>
            <button onClick={() => setShowSettings(false)} className="text-white/50 hover:text-white">
              <X size={15} />
            </button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {([{
            key: 'showJobName',
            display: 'Job name'
          }, {
            key: 'showDate',
            display: 'Date'
          }, {
            key: 'showTime',
            display: 'Time'
          }, {
            key: 'showLabel',
            display: 'Label'
          }] as {
            key: keyof typeof settings;
            display: string;
          }[]).map(({
            key,
            display
          }) => <button key={key} onClick={() => toggle(key)} className={`flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium transition-colors ${settings[key] ? 'bg-primary text-white' : 'bg-white/10 text-white/55'}`}>
                {settings[key] ? <Check size={13} /> : <X size={13} />}
                {display}
              </button>)}
          </div>
          <p className="text-white/38 text-[10px] mt-3 leading-relaxed">
            Line 1: Job name — Date — Time · Line 2: Label
          </p>

          {/* Orientation toggle */}
          <div className="mt-3 pt-3 border-t border-white/10">
            <p className="text-white/50 text-[10px] font-medium mb-2">Watermark orientation</p>
            <div className="flex gap-2">
              {(['0', '-90'] as const).map(val => <button key={val} onClick={() => update({
              orientation: val
            })} className={`flex-1 py-2 rounded-xl text-sm font-semibold transition-colors ${settings.orientation === val ? 'bg-primary text-white' : 'bg-white/10 text-white/55'}`}>
                  {val === '0' ? '0°' : '−90°'}
                </button>)}
            </div>
          </div>
        </div>}

      {/* ── Watermark popup (tapping the pill) ── */}
      {showWatermarkPopup && <div className="fixed inset-0 z-[60] flex items-end" onClick={e => {
        if (e.target === e.currentTarget) setShowWatermarkPopup(false);
      }}>
          <div className="w-full bg-gray-950 rounded-t-3xl border-t border-white/10 px-5 pt-5 pb-safe">
            {/* Handle */}
            <div className="w-10 h-1 rounded-full bg-white/20 mx-auto mb-5" />

            <p className="text-white text-base font-semibold mb-4">Watermark</p>

            {/* Date/time preview row */}
            {(settings.showDate || settings.showTime || settings.showJobName) && <div className="mb-3 px-3 py-2 bg-white/5 rounded-xl">
                <p className="text-white/50 text-[10px] font-medium mb-1 uppercase tracking-wide">Preview — line 1</p>
                <p className="text-white text-[11px] font-bold leading-tight">
                  {previewLine1 || '—'}
                </p>
              </div>}

            {/* Toggles */}
            <div className="grid grid-cols-2 gap-2 mb-4">
              {([{
              key: 'showJobName',
              display: 'Job name'
            }, {
              key: 'showDate',
              display: 'Date'
            }, {
              key: 'showTime',
              display: 'Time'
            }, {
              key: 'showLabel',
              display: 'Label'
            }] as {
              key: keyof typeof settings;
              display: string;
            }[]).map(({
              key,
              display
            }) => <button key={key} onClick={() => toggle(key)} className={`flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors ${settings[key] ? 'bg-primary text-white' : 'bg-white/10 text-white/55'}`}>
                  {settings[key] ? <Check size={13} /> : <X size={13} />}
                  {display}
                </button>)}
            </div>

            {/* Label input — 2-line textarea */}
            <div className="mb-4">
              <div className="relative bg-white/10 rounded-xl px-3 pt-2.5 pb-2">
                <div className="flex items-start gap-1.5">
                  <Pencil size={13} className="text-white/40 shrink-0 mt-0.5" />
                  <textarea value={draftLabel} onChange={e => setDraftLabel(sanitizeLabel(e.target.value).slice(0, 120))} placeholder="Label (optional)…" maxLength={120} rows={2} className="flex-1 bg-transparent text-white text-sm placeholder-white/30 outline-none resize-none leading-snug overflow-hidden break-words" style={{
                  fontSize: '16px',
                  lineHeight: '1.4',
                  /* Exactly 2 lines: 2 × (16px × 1.4) = 44.8px — no third line visible */
                  height: 'calc(2 * 16px * 1.4)',
                  wordBreak: 'break-word',
                  overflowWrap: 'break-word',
                  whiteSpace: 'pre-wrap'
                }} />
                  {draftLabel && <button onClick={() => setDraftLabel('')} className="text-white/40 hover:text-white shrink-0 mt-0.5" aria-label="Clear label">
                      <X size={13} />
                    </button>}
                </div>
              </div>
              <div className="flex items-center justify-between mt-1 px-1">
                <span className="text-white/30 text-[10px]">~60 chars per line · 2 lines max</span>
                <span className={`text-[10px] ${draftLabel.length >= 110 ? 'text-yellow-400' : 'text-white/40'}`}>
                  {draftLabel.length} / 120
                </span>
              </div>
            </div>

            {/* Lock toggle inside popup */}
            <button onClick={() => setDraftLocked(v => !v)} className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl mb-4 text-sm font-medium transition-colors ${draftLocked ? 'bg-primary/20 text-primary border border-primary/40' : 'bg-white/10 text-white/60'}`}>
              {draftLocked ? <Lock size={15} /> : <Unlock size={15} />}
              <span>{draftLocked ? 'Label locked — reused for every shot' : 'Label unlocked — prompted after each shot'}</span>
            </button>

            {/* Cancel / Done */}
            <div className="flex gap-3 pb-2" style={{
            paddingBottom: 'max(env(safe-area-inset-bottom), 8px)'
          }}>
              <button onClick={() => setShowWatermarkPopup(false)} className="flex-1 py-3 rounded-xl border border-white/12 text-sm font-semibold text-gray-400 hover:text-white transition-colors">
                Cancel
              </button>
              <button onClick={commitWatermarkPopup} className="flex-1 py-3 rounded-xl bg-primary text-white text-sm font-semibold">
                Done
              </button>
            </div>
          </div>
        </div>}

      {/* ── Label prompt (unlocked mode, or locked+empty first shot) ── */}
      {pendingBitmap && <div className="fixed inset-0 z-[60] flex items-end justify-center p-4 bg-black/72">
          <div className="bg-gray-900 rounded-2xl p-5 w-full max-w-sm border border-white/10">
            <p className="text-white text-sm font-semibold mb-1">Add a label</p>
            <p className="text-gray-400 text-xs mb-3 leading-relaxed">
              Optional. Leave blank to skip.
              {!labelLocked && <> Use the <Lock size={10} className="inline mx-0.5 text-gray-400" /> lock to reuse a label for rapid shots.</>}
            </p>
            <div className="bg-white/10 rounded-xl px-3 pt-2.5 pb-2 mb-1">
              <div className="flex items-start gap-2">
                <Pencil size={14} className="text-white/50 shrink-0 mt-0.5" />
                <textarea ref={pendingLabelRef} value={pendingLabel} onChange={e => setPendingLabel(sanitizeLabel(e.target.value).slice(0, 120))} placeholder="e.g. North wall, Level 2, damaged flashing…" maxLength={120} rows={2} autoFocus className="flex-1 bg-transparent text-white text-sm placeholder-white/30 outline-none resize-none leading-snug overflow-hidden break-words" style={{
                fontSize: '16px',
                lineHeight: '1.4',
                height: 'calc(2 * 16px * 1.4)',
                wordBreak: 'break-word',
                overflowWrap: 'break-word',
                whiteSpace: 'pre-wrap'
              }} />
                {pendingLabel && <button onClick={() => setPendingLabel('')} className="text-white/40 hover:text-white shrink-0 mt-0.5" aria-label="Clear label">
                    <X size={13} />
                  </button>}
              </div>
            </div>
            <div className="flex items-center justify-between mb-4 px-1">
              <span className="text-white/30 text-[10px]">~60 chars per line · 2 lines max</span>
              <span className={`text-[10px] ${pendingLabel.length >= 110 ? 'text-yellow-400' : 'text-white/40'}`}>
                {pendingLabel.length} / 120
              </span>
            </div>
            <div className="flex gap-2">
              <button onClick={cancelPending} className="flex-1 py-2.5 rounded-xl border border-white/12 text-sm font-semibold text-gray-400 hover:text-white transition-colors">
                Cancel
              </button>
              <button onClick={() => void confirmPending()} className="flex-1 py-2.5 rounded-xl bg-primary text-white text-sm font-semibold">
                Save photo
              </button>
            </div>
          </div>
        </div>}

      {/* ── Composition failure error ── */}
      {composeError && <div className="fixed inset-0 z-[60] flex items-end justify-center p-4 bg-black/72">
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
              <button onClick={() => {
              setComposeError(false);
              setCapturing(false);
            }} className="w-full py-2.5 rounded-xl bg-primary text-white text-sm font-semibold">
                Retry
              </button>
              <button onClick={() => {
              setComposeError(false);
              setCapturing(false);
            }} className="w-full py-2.5 rounded-xl border border-white/12 text-sm font-semibold text-gray-400 hover:text-white transition-colors">
                Cancel
              </button>
              <button onClick={() => void handleBack()} className="w-full py-2.5 rounded-xl border border-white/12 text-sm font-semibold text-gray-400 hover:text-white transition-colors">
                Use original camera
              </button>
            </div>
          </div>
        </div>}
    </div>
  );
}
