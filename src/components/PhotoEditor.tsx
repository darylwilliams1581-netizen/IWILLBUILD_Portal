/**
 * PhotoEditor.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Canvas-based photo editor for job photos.
 *
 * Tools:
 *   - Rotate left / right (90° steps, applied to canvas immediately)
 *   - Freehand draw (pen)
 *   - Arrow (click-drag to draw a directional arrow)
 *   - Text (click to place, type, Enter/click-away to commit)
 *   - Undo (per-stroke / per-action history, up to 50 steps)
 *   - Clear annotations (restores to the last loaded image state)
 *
 * Save & Lock flow:
 *   1. canvas.toBlob() → JPEG
 *   2. POST /api/jobs/:jobId/photos/:photoId/replace  (replace storage file)
 *   3. POST /api/jobs/:jobId/photos/:photoId/lock     (set status = 'locked')
 *   4. onSaved(updatedPhoto) callback
 *
 * Locked photos: read-only view with a lock badge — no tools, no save button.
 */

import React, {
  useRef,
  useEffect,
  useState,
  useCallback,
  useLayoutEffect,
} from 'react';
import { motion } from 'motion/react';
import {
  X,
  RotateCcw,
  RotateCw,
  Pen,
  ArrowUpRight,
  Type,
  Undo2,
  Trash2,
  Lock,
  Loader2,
  AlertCircle,
  Download,
} from 'lucide-react';
import type { JobPhoto } from '@/components/JobPhotos';

// ── Types ─────────────────────────────────────────────────────────────────────

type Tool = 'draw' | 'arrow' | 'text';

interface DrawStroke {
  type: 'draw';
  color: string;
  width: number;
  points: { x: number; y: number }[];
}

interface ArrowStroke {
  type: 'arrow';
  color: string;
  width: number;
  from: { x: number; y: number };
  to: { x: number; y: number };
}

interface TextStroke {
  type: 'text';
  color: string;
  fontSize: number;
  text: string;
  x: number;
  y: number;
}

type Stroke = DrawStroke | ArrowStroke | TextStroke;

interface PhotoEditorProps {
  photo: JobPhoto;
  onClose: () => void;
  onSaved: (updated: JobPhoto) => void;
}

// ── Constants ─────────────────────────────────────────────────────────────────

// Annotation colours — these are annotation ink colours applied directly to
// canvas pixels, not UI theme colours. They must be literal values because
// they are passed to CanvasRenderingContext2D.strokeStyle / fillStyle.
const ANNOTATION_COLORS = [
  { label: 'Red',   value: '#EF4444' },
  { label: 'White', value: '#FFFFFF' },
  { label: 'Black', value: '#000000' },
] as const;

const STROKE_WIDTHS = [2, 4, 8];
const FONT_SIZES = [32, 48, 72];
const MAX_HISTORY = 50;

// ── Arrow drawing helper ──────────────────────────────────────────────────────

function drawArrow(
  ctx: CanvasRenderingContext2D,
  from: { x: number; y: number },
  to: { x: number; y: number },
  color: string,
  width: number,
) {
  const headLen = Math.max(12, width * 4);
  const angle = Math.atan2(to.y - from.y, to.x - from.x);

  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // Shaft
  ctx.beginPath();
  ctx.moveTo(from.x, from.y);
  ctx.lineTo(to.x, to.y);
  ctx.stroke();

  // Arrowhead
  ctx.beginPath();
  ctx.moveTo(to.x, to.y);
  ctx.lineTo(
    to.x - headLen * Math.cos(angle - Math.PI / 6),
    to.y - headLen * Math.sin(angle - Math.PI / 6),
  );
  ctx.lineTo(
    to.x - headLen * Math.cos(angle + Math.PI / 6),
    to.y - headLen * Math.sin(angle + Math.PI / 6),
  );
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

// ── Redraw all strokes onto a canvas context ──────────────────────────────────

function redrawStrokes(ctx: CanvasRenderingContext2D, strokes: Stroke[]) {
  for (const s of strokes) {
    if (s.type === 'draw') {
      if (s.points.length < 2) continue;
      ctx.save();
      ctx.strokeStyle = s.color;
      ctx.lineWidth = s.width;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(s.points[0].x, s.points[0].y);
      for (let i = 1; i < s.points.length; i++) ctx.lineTo(s.points[i].x, s.points[i].y);
      ctx.stroke();
      ctx.restore();
    } else if (s.type === 'arrow') {
      drawArrow(ctx, s.from, s.to, s.color, s.width);
    } else if (s.type === 'text') {
      ctx.save();
      ctx.fillStyle = s.color;
      ctx.font = `bold ${s.fontSize}px sans-serif`;
      ctx.shadowColor = 'rgba(0,0,0,0.6)';
      ctx.shadowBlur = 3;
      ctx.fillText(s.text, s.x, s.y);
      ctx.restore();
    }
  }
}

// ── Main component ────────────────────────────────────────────────────────────

export default function PhotoEditor({ photo, onClose, onSaved }: PhotoEditorProps) {
  const canvasRef    = useRef<HTMLCanvasElement>(null);
  const overlayRef   = useRef<HTMLCanvasElement>(null); // live-draw preview layer
  const containerRef = useRef<HTMLDivElement>(null);

  // Base image (rotated) — redrawn whenever rotation changes
  const baseImageRef = useRef<HTMLImageElement | null>(null);
  const rotationRef  = useRef<number>(0); // 0 | 90 | 180 | 270

  // Annotation history
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const strokesRef = useRef<Stroke[]>([]);

  // Active tool state
  const [tool, setTool] = useState<Tool>('draw');
  const [color, setColor] = useState(ANNOTATION_COLORS[0].value);
  const [strokeWidth, setStrokeWidth] = useState(STROKE_WIDTHS[1]);
  const [fontSize, setFontSize] = useState(FONT_SIZES[1]);

  // Drawing state
  const isDrawingRef     = useRef(false);
  const currentStrokeRef = useRef<{ x: number; y: number }[]>([]);
  const arrowStartRef    = useRef<{ x: number; y: number } | null>(null);

  // Text input overlay
  const [textInput, setTextInput] = useState<{ x: number; y: number; value: string } | null>(null);
  const textInputRef = useRef<HTMLInputElement>(null);

  // Save state
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  const isLocked = photo.status === 'locked';

  // ── Load image into canvas ─────────────────────────────────────────────────

  const drawBaseImage = useCallback((img: HTMLImageElement, rotation: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = img.naturalWidth;
    const h = img.naturalHeight;
    const rotated = rotation === 90 || rotation === 270;

    canvas.width  = rotated ? h : w;
    canvas.height = rotated ? w : h;

    ctx.save();
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate((rotation * Math.PI) / 180);
    ctx.drawImage(img, -w / 2, -h / 2);
    ctx.restore();

    // Sync overlay canvas dimensions
    const overlay = overlayRef.current;
    if (overlay) {
      overlay.width  = canvas.width;
      overlay.height = canvas.height;
    }

    // Redraw existing strokes on top
    redrawStrokes(ctx, strokesRef.current);
  }, []);

  useLayoutEffect(() => {
    const img = new Image();
    img.crossOrigin = 'anonymous';

    // URL priority: full-res original → 1000px preview → download endpoint.
    // Always load the highest available resolution so the saved canvas is not
    // a downscaled copy of the original.
    const urlCandidates = [
      photo.url,
      photo.previewUrl,
      `/api/jobs/${photo.jobId}/photos/${photo.id}/download`,
    ].filter(Boolean) as string[];

    let candidateIdx = 0;

    const tryNext = () => {
      if (candidateIdx >= urlCandidates.length) return; // all failed
      img.src = urlCandidates[candidateIdx++];
    };

    img.onload = () => {
      baseImageRef.current = img;
      drawBaseImage(img, rotationRef.current);
    };
    img.onerror = () => {
      // Try next candidate in the fallback chain
      tryNext();
    };

    tryNext();
  }, [photo, drawBaseImage]);

  // ── Sync strokesRef ────────────────────────────────────────────────────────

  useEffect(() => {
    strokesRef.current = strokes;
  }, [strokes]);

  // ── Redraw canvas when strokes change ─────────────────────────────────────

  const redrawAll = useCallback(() => {
    const canvas = canvasRef.current;
    const img = baseImageRef.current;
    if (!canvas || !img) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = img.naturalWidth;
    const h = img.naturalHeight;
    const rot = rotationRef.current;

    ctx.save();
    ctx.translate(canvas.width / 2, canvas.height / 2);
    ctx.rotate((rot * Math.PI) / 180);
    ctx.drawImage(img, -w / 2, -h / 2);
    ctx.restore();

    redrawStrokes(ctx, strokesRef.current);
  }, []);

  useEffect(() => { redrawAll(); }, [strokes, redrawAll]);

  // ── Keyboard shortcuts ─────────────────────────────────────────────────────

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (textInput) { setTextInput(null); return; }
        onClose();
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
        e.preventDefault();
        setStrokes((prev) => prev.slice(0, -1));
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose, textInput]);

  // ── Canvas coordinate helper ───────────────────────────────────────────────

  function canvasPoint(e: React.MouseEvent | React.TouchEvent): { x: number; y: number } {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width  / rect.width;
    const scaleY = canvas.height / rect.height;
    let clientX: number, clientY: number;
    if ('touches' in e) {
      clientX = e.touches[0]?.clientX ?? 0;
      clientY = e.touches[0]?.clientY ?? 0;
    } else {
      clientX = e.clientX;
      clientY = e.clientY;
    }
    return {
      x: (clientX - rect.left) * scaleX,
      y: (clientY - rect.top)  * scaleY,
    };
  }

  // ── Pointer events ─────────────────────────────────────────────────────────

  const handlePointerDown = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    if (isLocked) return;
    if (tool === 'text') {
      const pt = canvasPoint(e);
      setTextInput({ x: pt.x, y: pt.y, value: '' });
      setTimeout(() => textInputRef.current?.focus(), 50);
      return;
    }
    isDrawingRef.current = true;
    const pt = canvasPoint(e);
    if (tool === 'draw') {
      currentStrokeRef.current = [pt];
    } else if (tool === 'arrow') {
      arrowStartRef.current = pt;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLocked, tool]);

  const handlePointerMove = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawingRef.current || isLocked) return;
    const pt = canvasPoint(e);
    const overlay = overlayRef.current;
    if (!overlay) return;
    const ctx = overlay.getContext('2d');
    if (!ctx) return;

    ctx.clearRect(0, 0, overlay.width, overlay.height);

    if (tool === 'draw') {
      currentStrokeRef.current.push(pt);
      const pts = currentStrokeRef.current;
      if (pts.length < 2) return;
      ctx.save();
      ctx.strokeStyle = color;
      ctx.lineWidth = strokeWidth;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
      ctx.stroke();
      ctx.restore();
    } else if (tool === 'arrow' && arrowStartRef.current) {
      drawArrow(ctx, arrowStartRef.current, pt, color, strokeWidth);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLocked, tool, color, strokeWidth]);

  const handlePointerUp = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawingRef.current || isLocked) return;
    isDrawingRef.current = false;
    const pt = canvasPoint(e);

    // Clear overlay
    const overlay = overlayRef.current;
    if (overlay) overlay.getContext('2d')?.clearRect(0, 0, overlay.width, overlay.height);

    if (tool === 'draw') {
      const pts = [...currentStrokeRef.current];
      currentStrokeRef.current = [];
      if (pts.length < 2) return;
      const newStroke: DrawStroke = { type: 'draw', color, width: strokeWidth, points: pts };
      setStrokes((prev) => [...prev.slice(-MAX_HISTORY + 1), newStroke]);
    } else if (tool === 'arrow' && arrowStartRef.current) {
      const from = arrowStartRef.current;
      arrowStartRef.current = null;
      const dx = pt.x - from.x, dy = pt.y - from.y;
      if (Math.sqrt(dx * dx + dy * dy) < 5) return; // too short
      const newStroke: ArrowStroke = { type: 'arrow', color, width: strokeWidth, from, to: pt };
      setStrokes((prev) => [...prev.slice(-MAX_HISTORY + 1), newStroke]);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLocked, tool, color, strokeWidth]);

  // ── Text commit ────────────────────────────────────────────────────────────

  const commitText = useCallback(() => {
    if (!textInput || !textInput.value.trim()) { setTextInput(null); return; }
    const newStroke: TextStroke = {
      type: 'text',
      color,
      fontSize,
      text: textInput.value.trim(),
      x: textInput.x,
      y: textInput.y,
    };
    setStrokes((prev) => [...prev.slice(-MAX_HISTORY + 1), newStroke]);
    setTextInput(null);
  }, [textInput, color, fontSize]);

  // ── Rotate ─────────────────────────────────────────────────────────────────

  const rotate = useCallback((dir: 'left' | 'right') => {
    const delta = dir === 'right' ? 90 : -90;
    rotationRef.current = ((rotationRef.current + delta) % 360 + 360) % 360;
    const img = baseImageRef.current;
    if (img) drawBaseImage(img, rotationRef.current);
  }, [drawBaseImage]);

  // ── Clear annotations ──────────────────────────────────────────────────────

  const clearAnnotations = useCallback(() => {
    setStrokes([]);
  }, []);

  // ── Save & Lock ────────────────────────────────────────────────────────────

  const handleSaveAndLock = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setSaving(true);
    setSaveError('');

    try {
      // 1. Flatten canvas to JPEG blob
      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (b) => b ? resolve(b) : reject(new Error('Canvas export failed')),
          'image/jpeg',
          0.92,
        );
      });

      // 2. Replace storage file
      const fd = new FormData();
      fd.append('photo', blob, 'edited.jpg');
      const replaceRes = await fetch(
        `/api/jobs/${photo.jobId}/photos/${photo.id}/replace`,
        { method: 'POST', credentials: 'include', body: fd },
      );
      const replaceData = await replaceRes.json() as { ok?: boolean; photo?: JobPhoto; error?: string };
      if (!replaceRes.ok) throw new Error(replaceData.error ?? 'Replace failed');

      // 3. Lock the photo
      const lockRes = await fetch(
        `/api/jobs/${photo.jobId}/photos/${photo.id}/lock`,
        { method: 'POST', credentials: 'include' },
      );
      const lockData = await lockRes.json() as { ok?: boolean; photo?: JobPhoto; error?: string };
      if (!lockRes.ok) throw new Error(lockData.error ?? 'Lock failed');

      // 4. Notify parent
      const updated = lockData.photo ?? replaceData.photo;
      if (updated) onSaved(updated);
      onClose();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }, [photo, onSaved, onClose]);

  // ── Cursor style ───────────────────────────────────────────────────────────

  const canvasCursor = isLocked ? 'default' : tool === 'text' ? 'text' : 'crosshair';

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 z-[80] flex flex-col bg-black h-[100dvh]">
      {/* ── Safe-area spacer + Toolbar ── */}
      {/* The safe-area wrapper pushes the toolbar below the iPhone status bar /
          notch / Dynamic Island. The toolbar itself stays horizontally scrollable
          on narrow phones so controls are never clipped. */}
      <div
        className="shrink-0 bg-slate-900"
        style={{ paddingTop: 'env(safe-area-inset-top, 0px)' }}
      >
        <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-700 overflow-x-auto">
        {/* Close */}
        <button
          onClick={onClose}
          className="p-2 rounded-lg hover:bg-slate-700 text-slate-300 hover:text-white transition-colors shrink-0"
          title="Close"
        >
          <X size={16} />
        </button>

        <div className="w-px h-6 bg-slate-700 shrink-0" />

        {/* Photo name */}
        <span className="text-xs text-slate-400 font-semibold truncate max-w-[120px] shrink-0">
          {photo.label ?? photo.originalName ?? 'Photo'}
        </span>

        {isLocked && (
          <span className="flex items-center gap-1 px-2 py-1 bg-amber-500/20 border border-amber-500/40 rounded-md text-amber-400 text-xs font-semibold shrink-0">
            <Lock size={11} /> Locked
          </span>
        )}

        <div className="flex-1" />

        {!isLocked && (
          <>
            {/* Rotate */}
            <button onClick={() => rotate('left')} title="Rotate left 90°"
              className="p-2 rounded-lg hover:bg-slate-700 text-slate-300 hover:text-white transition-colors shrink-0">
              <RotateCcw size={15} />
            </button>
            <button onClick={() => rotate('right')} title="Rotate right 90°"
              className="p-2 rounded-lg hover:bg-slate-700 text-slate-300 hover:text-white transition-colors shrink-0">
              <RotateCw size={15} />
            </button>

            <div className="w-px h-6 bg-slate-700 shrink-0" />

            {/* Tool selector */}
            {([
              { id: 'draw',  icon: <Pen size={15} />,          title: 'Freehand draw' },
              { id: 'arrow', icon: <ArrowUpRight size={15} />, title: 'Arrow' },
              { id: 'text',  icon: <Type size={15} />,         title: 'Text' },
            ] as const).map(({ id, icon, title }) => (
              <button key={id} onClick={() => setTool(id)} title={title}
                className={`p-2 rounded-lg transition-colors shrink-0 ${
                  tool === id
                    ? 'bg-primary text-primary-foreground'
                    : 'hover:bg-slate-700 text-slate-300 hover:text-white'
                }`}>
                {icon}
              </button>
            ))}

            <div className="w-px h-6 bg-slate-700 shrink-0" />

            {/* Annotation colour swatches */}
            <div className="flex items-center gap-1 shrink-0">
              {ANNOTATION_COLORS.map(({ label, value }) => (
                <button key={value} onClick={() => setColor(value)} title={label}
                  className={`w-5 h-5 rounded-full border-2 transition-all ${
                    color === value ? 'border-white scale-110' : 'border-slate-600 hover:border-slate-400'
                  }`}
                  style={{ background: value }}
                />
              ))}
            </div>

            <div className="w-px h-6 bg-slate-700 shrink-0" />

            {/* Stroke width (draw / arrow) */}
            {tool !== 'text' && (
              <div className="flex items-center gap-1 shrink-0">
                {STROKE_WIDTHS.map((w) => (
                  <button key={w} onClick={() => setStrokeWidth(w)} title={`${w}px`}
                    className={`w-7 h-7 rounded-lg flex items-center justify-center transition-colors ${
                      strokeWidth === w ? 'bg-primary' : 'hover:bg-slate-700'
                    }`}>
                    <div className="rounded-full bg-white" style={{ width: w + 2, height: w + 2 }} />
                  </button>
                ))}
              </div>
            )}

            {/* Font size (text only) */}
            {tool === 'text' && (
              <div className="flex items-center gap-1 shrink-0">
                {FONT_SIZES.map((s) => (
                  <button key={s} onClick={() => setFontSize(s)} title={`${s}px`}
                    className={`px-2 py-1 rounded-lg text-xs font-bold transition-colors ${
                      fontSize === s ? 'bg-primary text-primary-foreground' : 'hover:bg-slate-700 text-slate-300'
                    }`}>
                    {s}
                  </button>
                ))}
              </div>
            )}

            <div className="w-px h-6 bg-slate-700 shrink-0" />

            {/* Undo */}
            <button onClick={() => setStrokes((p) => p.slice(0, -1))}
              disabled={strokes.length === 0}
              title="Undo (⌘Z)"
              className="p-2 rounded-lg hover:bg-slate-700 text-slate-300 hover:text-white disabled:opacity-30 transition-colors shrink-0">
              <Undo2 size={15} />
            </button>

            {/* Clear annotations */}
            <button onClick={clearAnnotations}
              disabled={strokes.length === 0}
              title="Clear all annotations"
              className="p-2 rounded-lg hover:bg-red-800 text-slate-300 hover:text-white disabled:opacity-30 transition-colors shrink-0">
              <Trash2 size={15} />
            </button>

            <div className="w-px h-6 bg-slate-700 shrink-0" />

            {/* Save & Lock */}
            <button onClick={handleSaveAndLock} disabled={saving}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-black text-xs font-bold rounded-lg transition-colors shrink-0">
              {saving ? <Loader2 size={13} className="animate-spin" /> : <Lock size={13} />}
              {saving ? 'Saving…' : 'Save & Lock'}
            </button>
          </>
        )}

        {/* Download (always available) */}
        <button
          type="button"
          onClick={() => {
            const url = `/api/jobs/${photo.jobId}/photos/${photo.id}/download`;
            fetch(url, { credentials: 'include' })
              .then((r) => r.blob())
              .then((blob) => {
                const objectUrl = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = objectUrl;
                a.download = photo.originalName ?? photo.filename;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                setTimeout(() => URL.revokeObjectURL(objectUrl), 10_000);
              })
              .catch(console.error);
          }}
          className="p-2 rounded-lg hover:bg-slate-700 text-slate-300 hover:text-white transition-colors shrink-0"
          title="Download original"
        >
          <Download size={15} />
        </button>
      </div>{/* end toolbar inner */}
      </div>{/* end safe-area wrapper */}

      {/* ── Error banner ── */}
      {saveError && (
        <div className="flex items-center gap-2 px-4 py-2 bg-red-900/80 text-red-200 text-xs font-semibold shrink-0">
          <AlertCircle size={13} />
          {saveError}
          <button onClick={() => setSaveError('')} className="ml-auto text-red-300 hover:text-white">&times;</button>
        </div>
      )}

      {/* ── Canvas area ── */}
      <div
        ref={containerRef}
        className="flex-1 min-h-0 overflow-auto flex items-center justify-center bg-black p-2"
      >
        <div className="relative" style={{ display: 'inline-block', lineHeight: 0 }}>
          {/* Base canvas */}
          <canvas
            ref={canvasRef}
            style={{
              display: 'block',
              maxWidth: '100%',
              // dvh fallback: Safari < 15.4 doesn't support dvh; min() picks
              // whichever resolves — both evaluate identically on supporting
              // browsers, and the vh value is the safe fallback.
              maxHeight: 'min(calc(100dvh - 100px), calc(100vh - 100px))',
              cursor: canvasCursor,
              touchAction: 'none',
            }}
            onMouseDown={handlePointerDown}
            onMouseMove={handlePointerMove}
            onMouseUp={handlePointerUp}
            onMouseLeave={handlePointerUp}
            onTouchStart={handlePointerDown}
            onTouchMove={handlePointerMove}
            onTouchEnd={handlePointerUp}
          />

          {/* Overlay canvas for live-draw preview */}
          <canvas
            ref={overlayRef}
            style={{
              position: 'absolute',
              top: 0,
              left: 0,
              width: '100%',
              height: '100%',
              pointerEvents: 'none',
            }}
          />

          {/* Text input overlay — positioned relative to canvas */}
          {textInput && (
            <input
              ref={textInputRef}
              type="text"
              value={textInput.value}
              onChange={(e) => setTextInput((prev) => prev ? { ...prev, value: e.target.value } : null)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') { e.preventDefault(); commitText(); }
                if (e.key === 'Escape') setTextInput(null);
              }}
              onBlur={commitText}
              className="absolute border border-white/40 rounded outline-none px-1.5 py-0.5 font-bold bg-black/70 text-white"
              style={{
                left: `${(textInput.x / (canvasRef.current?.width ?? 1)) * 100}%`,
                top:  `${(textInput.y / (canvasRef.current?.height ?? 1)) * 100}%`,
                transform: 'translateY(-100%)',
                color,
                fontSize: `${fontSize}px`,
                minWidth: 80,
                zIndex: 10,
              }}
              placeholder="Type here…"
            />
          )}
        </div>
      </div>

      {/* ── Locked overlay hint ── */}
      {isLocked && (
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-2 px-4 py-2.5 bg-amber-500/90 text-black text-sm font-bold rounded-full shadow-xl pointer-events-none"
        >
          <Lock size={14} />
          This photo is locked — no further edits allowed
        </motion.div>
      )}
    </div>
  );
}
