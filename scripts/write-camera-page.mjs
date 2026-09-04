/**
 * Writes the Build 22 offline-first camera page to src/pages/job-photos-camera.tsx
 * Run: node scripts/write-camera-page.mjs
 */
import { writeFileSync, readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Read the capturePhotoLocally source to verify it exists
const captureSrc = readFileSync(resolve(__dirname, '../src/lib/capturePhotoLocally.ts'), 'utf8');
if (!captureSrc.includes('capturePhotoLocally')) {
  throw new Error('capturePhotoLocally.ts not found or invalid');
}

const dest = resolve(__dirname, '../src/pages/job-photos-camera.tsx');

const content = `/**
 * JobPhotosCameraPage  (/jobs/:id/camera)
 * ─────────────────────────────────────────────────────────────────────────────
 * Offline-first native camera page — Build 22.
 *
 * ARCHITECTURE (Stage 1 + Stage 2):
 *   Stage 1 — capture:
 *     Camera.getPhoto() opens the native iPhone camera.
 *     The returned URI is copied to Filesystem Directory.Data immediately.
 *     A File object is created from the copy for watermark compositing.
 *     enqueueFiles() saves to IDB and returns control to the user.
 *     No network required. Works in airplane mode.
 *
 *   Stage 2 — sync (handled by usePhotoUploadQueue):
 *     Uploads when online. Retries on reconnect / foreground.
 *     Idempotency key prevents duplicates on retry.
 *     Filesystem copy deleted only after server confirms R2 + DB save.
 *
 * WHY NOT getUserMedia:
 *   getUserMedia requires a secure context and is fragile on
 *   capacitor://localhost. Camera.getPhoto() is the correct Capacitor 8 path.
 */

import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router';
import { Helmet } from '@dr.pogodin/react-helmet';
import {
  ArrowLeft, Settings, X, Check, Loader2, Lock, Unlock,
  AlertTriangle, Pencil, Camera,
} from 'lucide-react';
import { usePhotoUploadQueue } from '@/hooks/usePhotoUploadQueue';
import { useWatermarkSettings } from '@/hooks/useWatermarkSettings';
import { capturePhotoLocally } from '@/lib/capturePhotoLocally';
import { Capacitor } from '@capacitor/core';

interface Job { id: number; name: string; jobNumber?: string | null; }

function sanitizeLabel(raw: string): string {
  return raw
    .replace(/<script[\\s\\S]*?<\\/script>/gi, '')
    .replace(/<style[\\s\\S]*?<\\/style>/gi, '')
    .replace(/<[^>]*>/g, '')
    .replace(/[\\r\\n]+/g, ' ')
    // eslint-disable-next-line no-control-regex
    .replace(/[\\x00-\\x1F\\x7F-\\x9F]/g, '')
    .replace(/ {2,}/g, ' ')
    .trim();
}

function wrapLabel(text: string): string[] {
  const MAX_CHARS = 120;
  const LINE_WIDTH = 60;
  const capped = text.slice(0, MAX_CHARS);
  if (capped.length <= LINE_WIDTH) return [capped];
  const breakAt = capped.lastIndexOf(' ', LINE_WIDTH);
  const splitAt = breakAt > 0 ? breakAt : LINE_WIDTH;
  const line1 = capped.slice(0, splitAt).trimEnd();
  const line2 = capped.slice(splitAt).trimStart().slice(0, LINE_WIDTH);
  return line2.length > 0 ? [line1, line2] : [line1];
}

interface WatermarkOpts {
  showLabel: boolean; showDate: boolean; showTime: boolean; showJobName: boolean;
  label: string; jobName: string; orientation: '0' | '-90';
}

async function compositeWatermark(
  source: HTMLImageElement | ImageBitmap,
  opts: WatermarkOpts,
  fileName: string,
): Promise<File | null> {
  const w = source instanceof HTMLImageElement ? source.naturalWidth : source.width;
  const h = source instanceof HTMLImageElement ? source.naturalHeight : source.height;
  if (!w || !h) return null;
  let canvas: HTMLCanvasElement;
  let ctx: CanvasRenderingContext2D;
  try {
    canvas = document.createElement('canvas');
    canvas.width = w; canvas.height = h;
    const c = canvas.getContext('2d');
    if (!c) return null;
    ctx = c;
  } catch { return null; }
  ctx.drawImage(source, 0, 0, w, h);
  const now = new Date();
  const z = (n: number) => String(n).padStart(2, '0');
  const line1Parts: string[] = [];
  if (opts.showJobName && opts.jobName.trim()) line1Parts.push(opts.jobName.trim().slice(0, 60));
  if (opts.showDate) line1Parts.push(\`\${z(now.getDate())}/\${z(now.getMonth() + 1)}/\${now.getFullYear()}\`);
  if (opts.showTime) line1Parts.push(\`\${z(now.getHours())}:\${z(now.getMinutes())}\`);
  const line1 = line1Parts.join('  —  ');
  const line2 = opts.showLabel && opts.label.trim() ? sanitizeLabel(opts.label).trim().slice(0, 120) : '';
  const hasLine1 = line1.length > 0;
  const hasLine2 = line2.length > 0;
  if (!hasLine1 && !hasLine2) {
    return new Promise<File | null>(resolve => {
      try { canvas.toBlob(blob => resolve(blob ? new File([blob], fileName, { type: 'image/jpeg' }) : null), 'image/jpeg', 0.88); }
      catch { resolve(null); }
    });
  }
  const refDim = opts.orientation === '-90' ? Math.min(w, h) : w;
  const fontSize = Math.max(16, Math.round(refDim * 0.024));
  const lineH = fontSize * 1.35; const padH = fontSize * 0.55; const padV = fontSize * 0.45;
  const margin = Math.round(refDim * 0.022); const radius = fontSize * 0.32;
  ctx.font = \`bold \${fontSize}px -apple-system, Arial, sans-serif\`;
  ctx.textBaseline = 'alphabetic';
  const line1Rows = hasLine1 ? [line1] : [];
  const line2Rows = hasLine2 ? wrapLabel(line2) : [];
  const allRows = [...line1Rows, ...line2Rows];
  const panelH = padV * 2 + allRows.length * lineH - (lineH - fontSize) * 0.5;
  const drawPanel = (panelX: number, panelY: number, panelW: number, rotated: boolean) => {
    if (rotated) { ctx.save(); ctx.translate(w, h); ctx.rotate(-Math.PI / 2); }
    ctx.globalAlpha = 0.65; ctx.fillStyle = '#1a1a1a';
    ctx.beginPath(); ctx.roundRect(panelX, panelY, panelW, panelH, radius); ctx.fill();
    ctx.globalAlpha = 1;
    if (hasLine1 && hasLine2) {
      const divY = panelY + padV + line1Rows.length * lineH - lineH * 0.15;
      ctx.save(); ctx.globalAlpha = 0.28; ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.moveTo(panelX + padH * 0.5, divY); ctx.lineTo(panelX + panelW - padH * 0.5, divY); ctx.stroke(); ctx.restore();
    }
    ctx.fillStyle = '#ffffff'; ctx.textBaseline = 'alphabetic';
    allRows.forEach((row, i) => {
      const isLabel = i >= line1Rows.length;
      ctx.font = isLabel ? \`600 \${Math.round(fontSize * 0.92)}px -apple-system, Arial, sans-serif\` : \`bold \${fontSize}px -apple-system, Arial, sans-serif\`;
      ctx.fillStyle = '#ffffff';
      ctx.fillText(row, panelX + padH, panelY + padV + fontSize + i * lineH, panelW - padH * 2);
    });
    if (rotated) ctx.restore();
  };
  if (opts.orientation === '-90') {
    const maxPanelW = h - margin * 2;
    const panelW = Math.min(maxPanelW, Math.max(...allRows.map(r => ctx.measureText(r).width)) + padH * 2);
    drawPanel(margin, -panelH - margin, panelW, true);
  } else {
    const panelW = Math.min(w - margin * 2, Math.max(...allRows.map(r => ctx.measureText(r).width)) + padH * 2);
    ctx.save(); drawPanel(margin, h - margin - panelH, panelW, false); ctx.restore();
  }
  return new Promise<File | null>(resolve => {
    try { canvas.toBlob(blob => resolve(blob ? new File([blob], fileName, { type: 'image/jpeg' }) : null), 'image/jpeg', 0.88); }
    catch { resolve(null); }
  });
}

export default function JobPhotosCameraPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const locationState = location.state as { uploadEndpoint?: string; backPath?: string; jobName?: string; companyId?: string; } | null;
  const uploadEndpointOverride = locationState?.uploadEndpoint;
  const backPath = locationState?.backPath;
  const jobNameOverride = locationState?.jobName;
  const companyId = locationState?.companyId ?? 'default';
  const jobId = Number(id);

  const [job, setJob] = useState<Job | null>(null);
  useEffect(() => {
    if (!id || jobNameOverride) return;
    fetch(\`/api/jobs/\${id}\`, { credentials: 'include' })
      .then(async r => {
        if (!r.ok) return;
        if (!(r.headers.get('content-type') ?? '').includes('application/json')) return;
        const data = (await r.json()) as { job?: Job } | Job;
        setJob((data && 'job' in data ? data.job : data as Job) ?? null);
      }).catch(() => {});
  }, [id, jobNameOverride]);

  const { settings, toggle, update } = useWatermarkSettings();
  const [showSettings, setShowSettings] = useState(false);
  const [showWatermarkPopup, setShowWatermarkPopup] = useState(false);
  const [draftLabel, setDraftLabel] = useState('');
  const [draftLocked, setDraftLocked] = useState(false);
  const [labelLocked, setLabelLocked] = useState(false);
  const [label, setLabel] = useState('');

  const [pendingCapture, setPendingCapture] = useState<{
    file: File; localPath?: string; idempotencyKey?: string; fileName: string; previewUrl: string;
  } | null>(null);
  const [pendingLabel, setPendingLabel] = useState('');
  const pendingLabelRef = useRef<HTMLTextAreaElement>(null);

  const { enqueueFiles, queue, isUploading } = usePhotoUploadQueue({ jobId, uploadEndpoint: uploadEndpointOverride });
  const [capturing, setCapturing] = useState(false);
  const [composeError, setComposeError] = useState(false);
  const [permissionError, setPermissionError] = useState(false);
  const [lastThumb, setLastThumb] = useState<string | null>(null);
  const lastThumbRef = useRef<string | null>(null);
  const SESSION_MAX = 10;
  const [sessionCount, setSessionCount] = useState(0);
  const sessionLimitReached = sessionCount >= SESSION_MAX;
  const isNative = Capacitor.isNativePlatform();

  const makeOpts = useCallback((resolvedLabel: string): WatermarkOpts => ({
    showLabel: settings.showLabel, showDate: settings.showDate, showTime: settings.showTime,
    showJobName: settings.showJobName, label: resolvedLabel,
    jobName: jobNameOverride ?? job?.name ?? '', orientation: settings.orientation,
  }), [settings, job, jobNameOverride]);

  const finalise = useCallback(async (
    file: File, resolvedLabel: string, fileName: string, localPath?: string, idempotencyKey?: string,
  ): Promise<boolean> => {
    const objectUrl = URL.createObjectURL(file);
    let composited: File | null = null;
    try {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const el = new Image(); el.onload = () => resolve(el); el.onerror = reject; el.src = objectUrl;
      });
      composited = await compositeWatermark(img, makeOpts(resolvedLabel), fileName);
    } catch { composited = null; } finally { URL.revokeObjectURL(objectUrl); }
    if (!composited) { setComposeError(true); setCapturing(false); return false; }
    void enqueueFiles([composited], [{ localPath, idempotencyKey }]);
    const thumb = URL.createObjectURL(composited);
    setLastThumb(prev => { if (prev) URL.revokeObjectURL(prev); lastThumbRef.current = thumb; return thumb; });
    setSessionCount(n => n + 1);
    setCapturing(false);
    return true;
  }, [makeOpts, enqueueFiles]);

  const handleShutter = useCallback(async () => {
    if (capturing || sessionLimitReached) return;
    setCapturing(true); setPermissionError(false);
    let captured: Awaited<ReturnType<typeof capturePhotoLocally>> | null = null;
    try { captured = await capturePhotoLocally(companyId, String(jobId)); }
    catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg === 'camera_permission_denied') { setPermissionError(true); setCapturing(false); return; }
      setComposeError(true); setCapturing(false); return;
    }
    if (!captured) { setCapturing(false); return; }
    const fileName = \`job-\${jobId}-photo-\${Date.now()}.jpg\`;
    let file: File | null = null;
    try {
      const resp = await fetch(captured.previewUrl);
      const blob = await resp.blob();
      file = new File([blob], fileName, { type: captured.mimeType });
    } catch {
      try {
        const resp = await fetch(captured.localUri);
        const blob = await resp.blob();
        file = new File([blob], fileName, { type: captured.mimeType });
      } catch { setComposeError(true); setCapturing(false); return; }
    }
    if (labelLocked) {
      if (settings.showLabel && !label.trim()) {
        setPendingCapture({ file, localPath: captured.localPath, idempotencyKey: captured.idempotencyKey, fileName, previewUrl: captured.previewUrl });
        setPendingLabel(''); return;
      }
      await finalise(file, label, fileName, captured.localPath, captured.idempotencyKey);
    } else {
      setPendingCapture({ file, localPath: captured.localPath, idempotencyKey: captured.idempotencyKey, fileName, previewUrl: captured.previewUrl });
      setPendingLabel(sanitizeLabel(label).slice(0, 120));
    }
  }, [capturing, sessionLimitReached, companyId, jobId, labelLocked, label, settings.showLabel, finalise]);

  const confirmPending = useCallback(async () => {
    if (!pendingCapture) return;
    const { file, localPath, idempotencyKey, fileName } = pendingCapture;
    setPendingCapture(null);
    setLabel(pendingLabel);
    await finalise(file, pendingLabel, fileName, localPath, idempotencyKey);
  }, [pendingCapture, pendingLabel, finalise]);

  const cancelPending = useCallback(() => { setPendingCapture(null); setCapturing(false); }, []);

  const openWatermarkPopup = useCallback(() => {
    setDraftLabel(sanitizeLabel(label).slice(0, 120)); setDraftLocked(labelLocked); setShowWatermarkPopup(true);
  }, [label, labelLocked]);

  const commitWatermarkPopup = useCallback(() => {
    setLabel(sanitizeLabel(draftLabel).slice(0, 120)); setLabelLocked(draftLocked); setShowWatermarkPopup(false);
  }, [draftLabel, draftLocked]);

  useEffect(() => { return () => { if (lastThumbRef.current) URL.revokeObjectURL(lastThumbRef.current); }; }, []);

  const now = new Date();
  const z = (n: number) => String(n).padStart(2, '0');
  const previewLine1Parts: string[] = [];
  if (settings.showJobName && (jobNameOverride ?? job?.name)) previewLine1Parts.push((jobNameOverride ?? job?.name)!);
  if (settings.showDate) previewLine1Parts.push(\`\${z(now.getDate())}/\${z(now.getMonth() + 1)}/\${now.getFullYear()}\`);
  if (settings.showTime) previewLine1Parts.push(\`\${z(now.getHours())}:\${z(now.getMinutes())}\`);
  const previewLine1 = previewLine1Parts.join('  —  ');
  const previewLabelRows = settings.showLabel && label.trim() ? wrapLabel(label.trim()) : [];
  const hasPreview = previewLine1.length > 0 || previewLabelRows.length > 0;

  return (
    <div className="fixed inset-0 z-50 bg-black flex flex-col" style={{ userSelect: 'none' }}>
      <Helmet>
        <title>Camera — IWILLBUILD</title>
        <meta name="description" content="Take watermarked job site photos." />
        <link rel="canonical" href={\`https://iwillbuild.com/jobs/\${jobId}/camera\`} />
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>
      <h1 className="sr-only">Job Camera</h1>

      <div className="relative z-20 flex items-center gap-2 px-3 shrink-0 bg-gradient-to-b from-black/70 to-transparent"
        style={{ paddingTop: 'max(env(safe-area-inset-top), 10px)', paddingBottom: '10px' }}>
        <button onClick={() => navigate(backPath ?? \`/jobs/\${id}?tab=photos\`)}
          className="w-9 h-9 flex items-center justify-center rounded-full bg-black/40 text-white hover:bg-black/60 transition-colors shrink-0" aria-label="Back to photos">
          <ArrowLeft size={18} />
        </button>
        <span className="flex-1 text-white text-sm font-semibold truncate px-1">{jobNameOverride ?? job?.name ?? 'Camera'}</span>
        <button onClick={() => setShowSettings(v => !v)}
          className={\`w-9 h-9 flex items-center justify-center rounded-full transition-colors shrink-0 \${showSettings ? 'bg-primary text-white' : 'bg-black/40 text-white/80 hover:bg-black/60'}\`}
          aria-label="Watermark settings"><Settings size={16} /></button>
      </div>

      <div className="relative flex-1 min-h-0 overflow-hidden flex items-center justify-center bg-gray-950">
        {lastThumb
          ? <img src={lastThumb} alt="Last captured photo" className="w-full h-full object-contain" />
          : <div className="flex flex-col items-center gap-4 text-center px-8">
              <Camera size={48} className="text-white/20" />
              <p className="text-white/40 text-sm leading-relaxed">
                {isNative ? 'Tap the shutter to open the camera' : 'Camera capture requires the native app'}
              </p>
            </div>}
        {hasPreview && (
          <button onClick={openWatermarkPopup}
            className={\`absolute z-10 text-left \${settings.orientation === '-90' ? 'bottom-3 right-3 origin-bottom-right' : 'bottom-3 left-3'}\`}
            style={settings.orientation === '-90' ? { transform: 'rotate(-90deg)', transformOrigin: 'bottom right' } : undefined}
            aria-label="Edit watermark">
            <div className="inline-flex flex-col gap-0.5 bg-black/65 rounded-lg px-2.5 py-1.5 max-w-[calc(100vw-1.5rem)]">
              {previewLine1 && <span className="text-white text-[11px] font-bold leading-tight whitespace-nowrap">{previewLine1}</span>}
              {previewLabelRows.map((row, i) => <span key={i} className="text-white text-[10px] font-semibold leading-tight break-words">{row}</span>)}
              <span className="flex items-center gap-1 mt-0.5"><Pencil size={9} className="text-white/40" /><span className="text-white/40 text-[9px] leading-none">tap to edit</span></span>
            </div>
          </button>
        )}
        {permissionError && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black/90 px-8 text-center">
            <AlertTriangle size={36} className="text-yellow-400" />
            <p className="text-white text-sm font-semibold">Camera access denied</p>
            <p className="text-gray-400 text-xs leading-relaxed">Allow camera access in Settings → Privacy → Camera → IWILLBUILD, then try again.</p>
            <button onClick={() => setPermissionError(false)} className="mt-1 px-5 py-2.5 bg-primary text-white text-sm font-semibold rounded-xl">Dismiss</button>
          </div>
        )}
      </div>

      <div className="relative z-20 shrink-0 bg-gradient-to-t from-black/90 to-transparent"
        style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 16px)', paddingTop: '12px' }}>
        <div className="flex items-center justify-between px-6">
          <button onClick={() => navigate(backPath ?? \`/jobs/\${id}?tab=photos\`)}
            className="w-14 h-14 rounded-xl overflow-hidden border-2 border-white/30 bg-white/10 flex items-center justify-center shrink-0 touch-manipulation" aria-label="Back to photos">
            {lastThumb
              ? <img src={lastThumb} alt="Last captured" className="w-full h-full object-cover" />
              : <div className="flex flex-col items-center gap-0.5">
                  <ArrowLeft size={16} className="text-white/60" />
                  {queue.length > 0 && <span className="text-[9px] text-white/60 font-bold">{queue.length}</span>}
                </div>}
          </button>
          <button onClick={() => setLabelLocked(v => !v)}
            className={\`w-11 h-11 flex flex-col items-center justify-center rounded-full transition-colors shrink-0 gap-0.5 \${labelLocked ? 'bg-primary text-white' : 'bg-white/10 text-white/60 hover:bg-white/20'}\`}
            aria-label={labelLocked ? 'Label locked — tap to unlock' : 'Label unlocked — tap to lock'}>
            {labelLocked ? <Lock size={16} /> : <Unlock size={16} />}
            <span className="text-[8px] font-semibold leading-none opacity-70">{labelLocked ? 'LOCKED' : 'LOCK'}</span>
          </button>
          <button onClick={() => void handleShutter()} disabled={capturing || sessionLimitReached || !isNative}
            className="w-20 h-20 rounded-full border-4 border-white bg-white/20 flex items-center justify-center disabled:opacity-40 touch-manipulation active:scale-95 transition-transform shrink-0" aria-label="Take photo">
            {capturing && !pendingCapture ? <Loader2 size={28} className="animate-spin text-white" /> : <div className="w-14 h-14 rounded-full bg-white" />}
          </button>
          <button onClick={() => setShowSettings(v => !v)}
            className={\`w-11 h-11 flex flex-col items-center justify-center rounded-full transition-colors shrink-0 gap-0.5 \${showSettings ? 'bg-primary text-white' : 'bg-white/10 text-white/60 hover:bg-white/20'}\`}
            aria-label="Watermark settings">
            <Settings size={16} /><span className="text-[8px] font-semibold leading-none opacity-70">FIELDS</span>
          </button>
          <div className="w-14 h-14 flex flex-col items-center justify-center gap-0.5 shrink-0">
            {sessionLimitReached
              ? <><span className="text-[11px] font-bold text-white/60 leading-none">10 / 10</span><span className="text-[8px] text-yellow-400/80 font-semibold leading-none text-center px-0.5">limit reached</span></>
              : <><span className="text-[11px] font-bold text-white/50 leading-none">{sessionCount} / {SESSION_MAX}</span>{isUploading && <Loader2 size={10} className="animate-spin text-white/40" />}</>}
          </div>
        </div>
      </div>

      {showSettings && (
        <div className="fixed z-[55] left-0 right-0 mx-3 bg-black/90 backdrop-blur-sm rounded-2xl p-4"
          style={{ bottom: 'calc(max(env(safe-area-inset-bottom), 16px) + 88px)' }}>
          <div className="flex items-center justify-between mb-3">
            <p className="text-white text-sm font-semibold">Watermark fields</p>
            <button onClick={() => setShowSettings(false)} className="text-white/50 hover:text-white"><X size={15} /></button>
          </div>
          <div className="grid grid-cols-2 gap-2">
            {([{ key: 'showJobName', display: 'Job name' }, { key: 'showDate', display: 'Date' }, { key: 'showTime', display: 'Time' }, { key: 'showLabel', display: 'Label' }] as { key: keyof typeof settings; display: string }[]).map(({ key, display }) => (
              <button key={key} onClick={() => toggle(key)}
                className={\`flex items-center gap-2 px-3 py-2 rounded-xl text-sm font-medium transition-colors \${settings[key] ? 'bg-primary text-white' : 'bg-white/10 text-white/55'}\`}>
                {settings[key] ? <Check size={13} /> : <X size={13} />}{display}
              </button>
            ))}
          </div>
          <p className="text-white/38 text-[10px] mt-3 leading-relaxed">Line 1: Job name — Date — Time · Line 2: Label</p>
          <div className="mt-3 pt-3 border-t border-white/10">
            <p className="text-white/50 text-[10px] font-medium mb-2">Watermark orientation</p>
            <div className="flex gap-2">
              {(['0', '-90'] as const).map(val => (
                <button key={val} onClick={() => update({ orientation: val })}
                  className={\`flex-1 py-2 rounded-xl text-sm font-semibold transition-colors \${settings.orientation === val ? 'bg-primary text-white' : 'bg-white/10 text-white/55'}\`}>
                  {val === '0' ? '0°' : '−90°'}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {showWatermarkPopup && (
        <div className="fixed inset-0 z-[60] flex items-end" onClick={e => { if (e.target === e.currentTarget) setShowWatermarkPopup(false); }}>
          <div className="w-full bg-gray-950 rounded-t-3xl border-t border-white/10 px-5 pt-5 pb-safe">
            <div className="w-10 h-1 rounded-full bg-white/20 mx-auto mb-5" />
            <p className="text-white text-base font-semibold mb-4">Watermark</p>
            {(settings.showDate || settings.showTime || settings.showJobName) && (
              <div className="mb-3 px-3 py-2 bg-white/5 rounded-xl">
                <p className="text-white/50 text-[10px] font-medium mb-1 uppercase tracking-wide">Preview — line 1</p>
                <p className="text-white text-[11px] font-bold leading-tight">{previewLine1 || '—'}</p>
              </div>
            )}
            <div className="grid grid-cols-2 gap-2 mb-4">
              {([{ key: 'showJobName', display: 'Job name' }, { key: 'showDate', display: 'Date' }, { key: 'showTime', display: 'Time' }, { key: 'showLabel', display: 'Label' }] as { key: keyof typeof settings; display: string }[]).map(({ key, display }) => (
                <button key={key} onClick={() => toggle(key)}
                  className={\`flex items-center gap-2 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors \${settings[key] ? 'bg-primary text-white' : 'bg-white/10 text-white/55'}\`}>
                  {settings[key] ? <Check size={13} /> : <X size={13} />}{display}
                </button>
              ))}
            </div>
            <div className="mb-4">
              <div className="relative bg-white/10 rounded-xl px-3 pt-2.5 pb-2">
                <div className="flex items-start gap-1.5">
                  <Pencil size={13} className="text-white/40 shrink-0 mt-0.5" />
                  <textarea value={draftLabel} onChange={e => setDraftLabel(sanitizeLabel(e.target.value).slice(0, 120))}
                    placeholder="Label (optional)…" maxLength={120} rows={2}
                    className="flex-1 bg-transparent text-white text-sm placeholder-white/30 outline-none resize-none leading-snug overflow-hidden break-words"
                    style={{ fontSize: '16px', lineHeight: '1.4', height: 'calc(2 * 16px * 1.4)', wordBreak: 'break-word', overflowWrap: 'break-word', whiteSpace: 'pre-wrap' }} />
                  {draftLabel && <button onClick={() => setDraftLabel('')} className="text-white/40 hover:text-white shrink-0 mt-0.5" aria-label="Clear label"><X size={13} /></button>}
                </div>
              </div>
              <div className="flex items-center justify-between mt-1 px-1">
                <span className="text-white/30 text-[10px]">~60 chars per line · 2 lines max</span>
                <span className={\`text-[10px] \${draftLabel.length >= 110 ? 'text-yellow-400' : 'text-white/40'}\`}>{draftLabel.length} / 120</span>
              </div>
            </div>
            <button onClick={() => setDraftLocked(v => !v)}
              className={\`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl mb-4 text-sm font-medium transition-colors \${draftLocked ? 'bg-primary/20 text-primary border border-primary/40' : 'bg-white/10 text-white/60'}\`}>
              {draftLocked ? <Lock size={15} /> : <Unlock size={15} />}
              <span>{draftLocked ? 'Label locked — reused for every shot' : 'Label unlocked — prompted after each shot'}</span>
            </button>
            <div className="flex gap-3 pb-2" style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 8px)' }}>
              <button onClick={() => setShowWatermarkPopup(false)} className="flex-1 py-3 rounded-xl border border-white/12 text-sm font-semibold text-gray-400 hover:text-white transition-colors">Cancel</button>
              <button onClick={commitWatermarkPopup} className="flex-1 py-3 rounded-xl bg-primary text-white text-sm font-semibold">Done</button>
            </div>
          </div>
        </div>
      )}

      {pendingCapture && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center p-4 bg-black/72">
          <div className="bg-gray-900 rounded-2xl p-5 w-full max-w-sm border border-white/10">
            <div className="w-full aspect-video rounded-xl overflow-hidden mb-4 bg-black">
              <img src={pendingCapture.previewUrl} alt="Captured photo preview" className="w-full h-full object-contain" />
            </div>
            <p className="text-white text-sm font-semibold mb-1">Add a label</p>
            <p className="text-gray-400 text-xs mb-3 leading-relaxed">Optional. Leave blank to skip.
              {!labelLocked && <> Use the <Lock size={10} className="inline mx-0.5 text-gray-400" /> lock to reuse a label for rapid shots.</>}
            </p>
            <div className="bg-white/10 rounded-xl px-3 pt-2.5 pb-2 mb-1">
              <div className="flex items-start gap-2">
                <Pencil size={14} className="text-white/50 shrink-0 mt-0.5" />
                <textarea ref={pendingLabelRef} value={pendingLabel} onChange={e => setPendingLabel(sanitizeLabel(e.target.value).slice(0, 120))}
                  placeholder="e.g. North wall, Level 2, damaged flashing…" maxLength={120} rows={2} autoFocus
                  className="flex-1 bg-transparent text-white text-sm placeholder-white/30 outline-none resize-none leading-snug overflow-hidden break-words"
                  style={{ fontSize: '16px', lineHeight: '1.4', height: 'calc(2 * 16px * 1.4)', wordBreak: 'break-word', overflowWrap: 'break-word', whiteSpace: 'pre-wrap' }} />
                {pendingLabel && <button onClick={() => setPendingLabel('')} className="text-white/40 hover:text-white shrink-0 mt-0.5" aria-label="Clear label"><X size={13} /></button>}
              </div>
            </div>
            <div className="flex items-center justify-between mb-4 px-1">
              <span className="text-white/30 text-[10px]">~60 chars per line · 2 lines max</span>
              <span className={\`text-[10px] \${pendingLabel.length >= 110 ? 'text-yellow-400' : 'text-white/40'}\`}>{pendingLabel.length} / 120</span>
            </div>
            <div className="flex gap-2">
              <button onClick={cancelPending} className="flex-1 py-2.5 rounded-xl border border-white/12 text-sm font-semibold text-gray-400 hover:text-white transition-colors">Cancel</button>
              <button onClick={() => void confirmPending()} className="flex-1 py-2.5 rounded-xl bg-primary text-white text-sm font-semibold">Save photo</button>
            </div>
          </div>
        </div>
      )}

      {composeError && (
        <div className="fixed inset-0 z-[60] flex items-end justify-center p-4 bg-black/72">
          <div className="bg-gray-900 rounded-2xl p-5 w-full max-w-sm border border-red-900/40">
            <div className="flex items-start gap-3 mb-4">
              <AlertTriangle size={20} className="text-red-400 shrink-0 mt-0.5" />
              <div>
                <p className="text-white text-sm font-semibold mb-1">Could not process photo</p>
                <p className="text-gray-400 text-xs leading-relaxed">The photo was not saved. No file was uploaded.</p>
              </div>
            </div>
            <div className="flex flex-col gap-2">
              <button onClick={() => { setComposeError(false); setCapturing(false); }} className="w-full py-2.5 rounded-xl bg-primary text-white text-sm font-semibold">Retry</button>
              <button onClick={() => { setComposeError(false); setCapturing(false); }} className="w-full py-2.5 rounded-xl border border-white/12 text-sm font-semibold text-gray-400 hover:text-white transition-colors">Cancel</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
`;

writeFileSync(dest, content);
console.log('written', dest, content.length, 'bytes');
