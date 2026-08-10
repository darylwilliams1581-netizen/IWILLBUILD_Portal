/**
 * PhotoEditor.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Canvas-based photo editor for job photos.
 *
 * Tools:
 *   - Freehand pen
 *   - Arrow (click-drag)
 *   - Circle (click-drag, outline only)
 *   - Rectangle (click-drag, outline only)
 *   - Text (click to place, type, Enter/✓ to commit)
 *   - Eraser (drag to erase annotations only — never touches photo pixels)
 *   - Undo (up to 50 steps)
 *   - Clear all annotations
 *
 * Save & Lock flow:
 *   1. canvas.toBlob() → JPEG
 *   2. POST /api/jobs/:jobId/photos/:photoId/replace
 *   3. POST /api/jobs/:jobId/photos/:photoId/lock
 *   4. onSaved(updatedPhoto) callback
 *
 * Locked / readOnly photos: full-screen view, no tools, no save button.
 */

import React, {
  useRef,
  useEffect,
  useState,
  useCallback,
  useLayoutEffect,
} from 'react';

import {
  X,
  Pen,
  ArrowUpRight,
  Type,
  Circle,
  Square,
  Eraser,
  Undo2,
  Trash2,
  Lock,
  Loader2,
  AlertCircle,
  Download,
  Check,
  Pencil,
  RotateCw,
} from 'lucide-react';
import type { JobPhoto } from '@/components/JobPhotos';

// ── Types ─────────────────────────────────────────────────────────────────────

type Tool = 'draw' | 'arrow' | 'text' | 'circle' | 'rectangle' | 'eraser';

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

interface CircleStroke {
  type: 'circle';
  color: string;
  width: number;
  from: { x: number; y: number };
  to: { x: number; y: number };
}

interface RectStroke {
  type: 'rectangle';
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

/** Eraser stores the indices of strokes it removed so Undo can restore them */
interface EraserStroke {
  type: 'eraser';
  removedIndices: number[];
}

type Stroke = DrawStroke | ArrowStroke | CircleStroke | RectStroke | TextStroke | EraserStroke;

interface PhotoEditorProps {
  photo: JobPhoto;
  onClose: () => void;
  onSaved: (updated: JobPhoto) => void;
  /** When true: show the image full-screen but hide all annotation tools and
   *  the Save & Lock button. Used for contexts that have no replace/lock API. */
  readOnly?: boolean;
}

// ── Constants ─────────────────────────────────────────────────────────────────

const ANNOTATION_COLORS = [
  { label: 'Red',    value: '#EF4444' },
  { label: 'Yellow', value: '#FACC15' },
  { label: 'White',  value: '#FFFFFF' },
  { label: 'Black',  value: '#000000' },
] as const;

const STROKE_WIDTHS = [2, 4, 8];
const FONT_SIZES    = [16, 24, 36];
const MAX_HISTORY   = 50;
const ERASER_RADIUS = 24; // px in canvas-space — touch-friendly

// ── Drawing helpers ───────────────────────────────────────────────────────────

function drawArrow(
  ctx: CanvasRenderingContext2D,
  from: { x: number; y: number },
  to: { x: number; y: number },
  color: string,
  width: number,
) {
  const headLen = Math.max(12, width * 4);
  const angle   = Math.atan2(to.y - from.y, to.x - from.x);
  ctx.save();
  ctx.strokeStyle = color;
  ctx.fillStyle   = color;
  ctx.lineWidth   = width;
  ctx.lineCap     = 'round';
  ctx.lineJoin    = 'round';
  ctx.beginPath();
  ctx.moveTo(from.x, from.y);
  ctx.lineTo(to.x, to.y);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(to.x, to.y);
  ctx.lineTo(to.x - headLen * Math.cos(angle - Math.PI / 6), to.y - headLen * Math.sin(angle - Math.PI / 6));
  ctx.lineTo(to.x - headLen * Math.cos(angle + Math.PI / 6), to.y - headLen * Math.sin(angle + Math.PI / 6));
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawCircle(
  ctx: CanvasRenderingContext2D,
  from: { x: number; y: number },
  to: { x: number; y: number },
  color: string,
  width: number,
) {
  const cx = (from.x + to.x) / 2;
  const cy = (from.y + to.y) / 2;
  const rx = Math.abs(to.x - from.x) / 2;
  const ry = Math.abs(to.y - from.y) / 2;
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth   = width;
  ctx.beginPath();
  ctx.ellipse(cx, cy, Math.max(rx, 1), Math.max(ry, 1), 0, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

function drawRect(
  ctx: CanvasRenderingContext2D,
  from: { x: number; y: number },
  to: { x: number; y: number },
  color: string,
  width: number,
) {
  ctx.save();
  ctx.strokeStyle = color;
  ctx.lineWidth   = width;
  ctx.strokeRect(from.x, from.y, to.x - from.x, to.y - from.y);
  ctx.restore();
}

// ── Redraw all non-eraser strokes ─────────────────────────────────────────────

function redrawStrokes(ctx: CanvasRenderingContext2D, strokes: Stroke[]) {
  // Build the visible set: start with all, then remove anything erased
  const removed = new Set<number>();
  for (const s of strokes) {
    if (s.type === 'eraser') s.removedIndices.forEach((i) => removed.add(i));
  }

  strokes.forEach((s, idx) => {
    if (s.type === 'eraser') return;
    if (removed.has(idx)) return;

    if (s.type === 'draw') {
      if (s.points.length < 2) return;
      ctx.save();
      ctx.strokeStyle = s.color;
      ctx.lineWidth   = s.width;
      ctx.lineCap     = 'round';
      ctx.lineJoin    = 'round';
      ctx.beginPath();
      ctx.moveTo(s.points[0].x, s.points[0].y);
      for (let i = 1; i < s.points.length; i++) ctx.lineTo(s.points[i].x, s.points[i].y);
      ctx.stroke();
      ctx.restore();
    } else if (s.type === 'arrow') {
      drawArrow(ctx, s.from, s.to, s.color, s.width);
    } else if (s.type === 'circle') {
      drawCircle(ctx, s.from, s.to, s.color, s.width);
    } else if (s.type === 'rectangle') {
      drawRect(ctx, s.from, s.to, s.color, s.width);
    } else if (s.type === 'text') {
      ctx.save();
      ctx.fillStyle   = s.color;
      ctx.font        = `bold ${s.fontSize}px sans-serif`;
      ctx.shadowColor = 'rgba(0,0,0,0.6)';
      ctx.shadowBlur  = 3;
      ctx.fillText(s.text, s.x, s.y);
      ctx.restore();
    }
  });
}

/** Returns indices of visible (non-erased) strokes whose bounding area
 *  overlaps the eraser circle at (cx, cy). */
function findErasedIndices(
  strokes: Stroke[],
  cx: number,
  cy: number,
  radius: number,
): number[] {
  const removed = new Set<number>();
  for (const s of strokes) {
    if (s.type === 'eraser') s.removedIndices.forEach((i) => removed.add(i));
  }

  const hit: number[] = [];
  strokes.forEach((s, idx) => {
    if (s.type === 'eraser' || removed.has(idx)) return;
    let touches = false;
    if (s.type === 'draw') {
      for (const p of s.points) {
        const dx = p.x - cx, dy = p.y - cy;
        if (dx * dx + dy * dy <= radius * radius) { touches = true; break; }
      }
    } else if (s.type === 'arrow') {
      for (const p of [s.from, s.to]) {
        const dx = p.x - cx, dy = p.y - cy;
        if (dx * dx + dy * dy <= radius * radius) { touches = true; break; }
      }
    } else if (s.type === 'circle' || s.type === 'rectangle') {
      // Check if eraser centre is near the bounding box
      const minX = Math.min(s.from.x, s.to.x) - radius;
      const maxX = Math.max(s.from.x, s.to.x) + radius;
      const minY = Math.min(s.from.y, s.to.y) - radius;
      const maxY = Math.max(s.from.y, s.to.y) + radius;
      touches = cx >= minX && cx <= maxX && cy >= minY && cy <= maxY;
    } else if (s.type === 'text') {
      const dx = s.x - cx, dy = s.y - cy;
      touches = dx * dx + dy * dy <= (radius * 3) * (radius * 3);
    }
    if (touches) hit.push(idx);
  });
  return hit;
}

// ── Main component ────────────────────────────────────────────────────────────

export default function PhotoEditor({ photo, onClose, onSaved, readOnly = false }: PhotoEditorProps) {
  const canvasRef    = useRef<HTMLCanvasElement>(null);
  const overlayRef   = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const baseImageRef = useRef<HTMLImageElement | null>(null);
  const rotationRef  = useRef<number>(0); // 0 | 90 | 180 | 270 — preview only; applied on Save & Lock

  // Annotation history
  const [strokes, setStrokes]   = useState<Stroke[]>([]);
  const strokesRef              = useRef<Stroke[]>([]);

  // Active tool
  const [tool, setTool]               = useState<Tool>('draw');
  const [color, setColor]             = useState(ANNOTATION_COLORS[0].value);
  const [strokeWidth, setStrokeWidth] = useState(STROKE_WIDTHS[1]);
  const [fontSize, setFontSize]       = useState(FONT_SIZES[1]);

  // Drawing state
  const isDrawingRef     = useRef(false);
  const currentStrokeRef = useRef<{ x: number; y: number }[]>([]);
  const shapeStartRef    = useRef<{ x: number; y: number } | null>(null);

  // Text input overlay
  const [textInput, setTextInput] = useState<{ x: number; y: number; value: string } | null>(null);
  const textInputRef = useRef<HTMLInputElement>(null);

  // Label editing
  const [labelEditing, setLabelEditing] = useState(false);
  const [labelValue, setLabelValue]     = useState(photo.label ?? '');
  const [labelSaving, setLabelSaving]   = useState(false);
  const labelInputRef = useRef<HTMLInputElement>(null);

  // Save state
  const [saving, setSaving]     = useState(false);
  const [saveError, setSaveError] = useState('');

  const isLocked = readOnly || photo.status === 'locked';

  // ── Load image ─────────────────────────────────────────────────────────────

  const drawBaseImage = useCallback((img: HTMLImageElement, rotation = 0) => {
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

    const overlay = overlayRef.current;
    if (overlay) { overlay.width = canvas.width; overlay.height = canvas.height; }
    redrawStrokes(ctx, strokesRef.current);
  }, []);

  useLayoutEffect(() => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    const candidates = [
      photo.url,
      photo.previewUrl,
      `/api/jobs/${photo.jobId}/photos/${photo.id}/download`,
    ].filter(Boolean) as string[];
    let idx = 0;
    const tryNext = () => { if (idx < candidates.length) img.src = candidates[idx++]; };
    img.onload  = () => { baseImageRef.current = img; drawBaseImage(img, rotationRef.current); };
    img.onerror = tryNext;
    tryNext();
  }, [photo, drawBaseImage]);

  // ── Sync strokesRef ────────────────────────────────────────────────────────

  useEffect(() => { strokesRef.current = strokes; }, [strokes]);

  // ── Redraw on stroke change ────────────────────────────────────────────────

  const redrawAll = useCallback(() => {
    const canvas = canvasRef.current;
    const img    = baseImageRef.current;
    if (!canvas || !img) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const w = img.naturalWidth;
    const h = img.naturalHeight;
    const rot = rotationRef.current;
    const rotated = rot === 90 || rot === 270;

    canvas.width  = rotated ? h : w;
    canvas.height = rotated ? w : h;

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
        if (textInput)    { setTextInput(null); return; }
        if (labelEditing) { setLabelEditing(false); setLabelValue(photo.label ?? ''); return; }
        onClose();
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
        e.preventDefault();
        setStrokes((prev) => prev.slice(0, -1));
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose, textInput, labelEditing, photo.label]);

  // ── Canvas coordinate helper ───────────────────────────────────────────────

  function canvasPoint(e: React.MouseEvent | React.TouchEvent): { x: number; y: number } {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect   = canvas.getBoundingClientRect();
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
    return { x: (clientX - rect.left) * scaleX, y: (clientY - rect.top) * scaleY };
  }

  // ── Pointer events ─────────────────────────────────────────────────────────

  const handlePointerDown = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    if (isLocked) return;
    const pt = canvasPoint(e);

    if (tool === 'text') {
      setTextInput({ x: pt.x, y: pt.y, value: '' });
      setTimeout(() => textInputRef.current?.focus(), 50);
      return;
    }

    isDrawingRef.current = true;

    if (tool === 'draw' || tool === 'eraser') {
      currentStrokeRef.current = [pt];
    } else {
      // arrow / circle / rectangle
      shapeStartRef.current = pt;
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLocked, tool]);

  const handlePointerMove = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawingRef.current || isLocked) return;
    const pt      = canvasPoint(e);
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
      ctx.lineWidth   = strokeWidth;
      ctx.lineCap     = 'round';
      ctx.lineJoin    = 'round';
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
      ctx.stroke();
      ctx.restore();
    } else if (tool === 'eraser') {
      currentStrokeRef.current.push(pt);
      // Show eraser cursor on overlay
      ctx.save();
      ctx.strokeStyle = 'rgba(255,255,255,0.6)';
      ctx.lineWidth   = 1;
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, ERASER_RADIUS, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    } else if (tool === 'arrow' && shapeStartRef.current) {
      drawArrow(ctx, shapeStartRef.current, pt, color, strokeWidth);
    } else if (tool === 'circle' && shapeStartRef.current) {
      drawCircle(ctx, shapeStartRef.current, pt, color, strokeWidth);
    } else if (tool === 'rectangle' && shapeStartRef.current) {
      drawRect(ctx, shapeStartRef.current, pt, color, strokeWidth);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLocked, tool, color, strokeWidth]);

  const handlePointerUp = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawingRef.current || isLocked) return;
    isDrawingRef.current = false;
    const pt      = canvasPoint(e);
    const overlay = overlayRef.current;
    if (overlay) overlay.getContext('2d')?.clearRect(0, 0, overlay.width, overlay.height);

    if (tool === 'draw') {
      const pts = [...currentStrokeRef.current];
      currentStrokeRef.current = [];
      if (pts.length < 2) return;
      setStrokes((prev) => [...prev.slice(-MAX_HISTORY + 1), { type: 'draw', color, width: strokeWidth, points: pts }]);
    } else if (tool === 'eraser') {
      const path = [...currentStrokeRef.current];
      currentStrokeRef.current = [];
      // Collect all strokes touched by any point along the eraser path
      const allRemoved = new Set<number>();
      for (const p of path) {
        findErasedIndices(strokesRef.current, p.x, p.y, ERASER_RADIUS).forEach((i) => allRemoved.add(i));
      }
      if (allRemoved.size === 0) return;
      setStrokes((prev) => [...prev.slice(-MAX_HISTORY + 1), { type: 'eraser', removedIndices: [...allRemoved] }]);
    } else if (tool === 'arrow' && shapeStartRef.current) {
      const from = shapeStartRef.current;
      shapeStartRef.current = null;
      const dx = pt.x - from.x, dy = pt.y - from.y;
      if (Math.sqrt(dx * dx + dy * dy) < 5) return;
      setStrokes((prev) => [...prev.slice(-MAX_HISTORY + 1), { type: 'arrow', color, width: strokeWidth, from, to: pt }]);
    } else if (tool === 'circle' && shapeStartRef.current) {
      const from = shapeStartRef.current;
      shapeStartRef.current = null;
      const dx = pt.x - from.x, dy = pt.y - from.y;
      if (Math.sqrt(dx * dx + dy * dy) < 5) return;
      setStrokes((prev) => [...prev.slice(-MAX_HISTORY + 1), { type: 'circle', color, width: strokeWidth, from, to: pt }]);
    } else if (tool === 'rectangle' && shapeStartRef.current) {
      const from = shapeStartRef.current;
      shapeStartRef.current = null;
      const dx = pt.x - from.x, dy = pt.y - from.y;
      if (Math.sqrt(dx * dx + dy * dy) < 5) return;
      setStrokes((prev) => [...prev.slice(-MAX_HISTORY + 1), { type: 'rectangle', color, width: strokeWidth, from, to: pt }]);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isLocked, tool, color, strokeWidth]);

  // ── Text commit ────────────────────────────────────────────────────────────

  const commitText = useCallback(() => {
    if (!textInput || !textInput.value.trim()) { setTextInput(null); return; }
    setStrokes((prev) => [...prev.slice(-MAX_HISTORY + 1), {
      type: 'text', color, fontSize,
      text: textInput.value.trim(),
      x: textInput.x, y: textInput.y,
    }]);
    setTextInput(null);
  }, [textInput, color, fontSize]);

  // ── Label save ─────────────────────────────────────────────────────────────

  const saveLabel = useCallback(async () => {
    const trimmed = labelValue.trim();
    setLabelSaving(true);
    try {
      const res = await fetch(
        `/api/jobs/${photo.jobId}/photos/${photo.id}`,
        {
          method: 'PATCH',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ label: trimmed || null }),
        },
      );
      if (!res.ok) throw new Error('Failed to save label');
      // Update local display value
      setLabelValue(trimmed);
    } catch {
      // Revert on error
      setLabelValue(photo.label ?? '');
    } finally {
      setLabelSaving(false);
      setLabelEditing(false);
    }
  }, [photo.jobId, photo.id, photo.label, labelValue]);

  // ── Rotation (preview only — applied to canvas on Save & Lock) ────────────

  // We keep a React state purely to trigger a re-render so the toolbar badge
  // updates; the actual value lives in rotationRef so pointer handlers always
  // read the latest without stale-closure issues.
  const [rotation, setRotation] = useState(0);

  const rotateCW = useCallback(() => {
    const next = ((rotationRef.current + 90) % 360) as 0 | 90 | 180 | 270;
    rotationRef.current = next;
    setRotation(next);
    const img = baseImageRef.current;
    if (img) drawBaseImage(img, next);
  }, [drawBaseImage]);

  // ── Clear annotations ──────────────────────────────────────────────────────

  const clearAnnotations = useCallback(() => { setStrokes([]); }, []);

  // ── Save & Lock ────────────────────────────────────────────────────────────

  const handleSaveAndLock = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    setSaving(true);
    setSaveError('');
    try {
      const blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob(
          (b) => b ? resolve(b) : reject(new Error('Canvas export failed')),
          'image/jpeg', 0.92,
        );
      });
      const fd = new FormData();
      fd.append('photo', blob, 'edited.jpg');
      const replaceRes = await fetch(
        `/api/jobs/${photo.jobId}/photos/${photo.id}/replace`,
        { method: 'POST', credentials: 'include', body: fd },
      );
      const replaceData = await replaceRes.json() as { ok?: boolean; photo?: JobPhoto; error?: string };
      if (!replaceRes.ok) throw new Error(replaceData.error ?? 'Replace failed');

      const lockRes = await fetch(
        `/api/jobs/${photo.jobId}/photos/${photo.id}/lock`,
        { method: 'POST', credentials: 'include' },
      );
      const lockData = await lockRes.json() as { ok?: boolean; photo?: JobPhoto; error?: string };
      if (!lockRes.ok) throw new Error(lockData.error ?? 'Lock failed');

      const updated = lockData.photo ?? replaceData.photo;
      if (updated) onSaved(updated);
      onClose();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }, [photo, onSaved, onClose]);

  // ── Cursor ─────────────────────────────────────────────────────────────────

  const canvasCursor = isLocked ? 'default' : tool === 'text' ? 'text' : tool === 'eraser' ? 'cell' : 'crosshair';

  // ── Visible annotation count (for disabled states) ─────────────────────────

  const visibleStrokeCount = (() => {
    const removed = new Set<number>();
    strokes.forEach((s) => { if (s.type === 'eraser') s.removedIndices.forEach((i) => removed.add(i)); });
    return strokes.filter((s, i) => s.type !== 'eraser' && !removed.has(i)).length;
  })();
  const hasAnnotations = strokes.length > 0;

  // ── Render ─────────────────────────────────────────────────────────────────

  const displayLabel = labelValue.trim() || (photo.label ?? '');

  return (
    <div className="fixed inset-0 z-[80] flex flex-col bg-black h-[100dvh]">

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
              maxHeight: 'min(calc(100dvh - 110px), calc(100vh - 110px))',
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

          {/* Overlay canvas — live-draw preview + eraser cursor */}
          <canvas
            ref={overlayRef}
            style={{
              position: 'absolute', top: 0, left: 0,
              width: '100%', height: '100%',
              pointerEvents: 'none',
            }}
          />

          {/* Text input overlay */}
          {textInput && (
            <div
              className="absolute flex items-center gap-1"
              style={{
                left: `${(textInput.x / (canvasRef.current?.width ?? 1)) * 100}%`,
                top:  `${(textInput.y / (canvasRef.current?.height ?? 1)) * 100}%`,
                transform: 'translateY(-100%)',
                zIndex: 10,
              }}
            >
              <input
                ref={textInputRef}
                type="text"
                value={textInput.value}
                onChange={(e) => setTextInput((prev) => prev ? { ...prev, value: e.target.value } : null)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter')  { e.preventDefault(); commitText(); }
                  if (e.key === 'Escape') { e.preventDefault(); setTextInput(null); }
                }}
                className="border border-white/40 rounded outline-none px-1.5 py-0.5 font-bold bg-black/70 text-white"
                style={{ color, fontSize: `${fontSize}px`, minWidth: 80 }}
                placeholder="Type here…"
              />
              <button
                onMouseDown={(e) => { e.preventDefault(); commitText(); }}
                className="w-7 h-7 flex items-center justify-center rounded-full bg-green-500 hover:bg-green-400 text-white shadow-lg shrink-0"
                title="Commit (Enter)"
              >
                <Check size={14} />
              </button>
              <button
                onMouseDown={(e) => { e.preventDefault(); setTextInput(null); }}
                className="w-7 h-7 flex items-center justify-center rounded-full bg-black/60 hover:bg-black/80 text-white shadow-lg shrink-0"
                title="Cancel (Esc)"
              >
                <X size={14} />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── Bottom toolbar ── */}
      <div
        className="shrink-0 bg-slate-900 border-t border-slate-700"
        style={{ paddingBottom: 'env(safe-area-inset-bottom, 0px)' }}
      >
        {/* Row 1 — Close | Label | Locked badge | Download */}
        <div className="flex items-center gap-2 px-2 py-1.5 border-b border-slate-800 min-h-[44px]">
          <button
            onClick={onClose}
            className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg hover:bg-slate-700 text-slate-300 hover:text-white transition-colors shrink-0"
            title="Close"
          >
            <X size={16} />
          </button>

          <div className="w-px h-5 bg-slate-700 shrink-0" />

          {/* Editable label */}
          {labelEditing ? (
            <div className="flex items-center gap-1 flex-1 min-w-0">
              <input
                ref={labelInputRef}
                type="text"
                value={labelValue}
                onChange={(e) => setLabelValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter')  { e.preventDefault(); void saveLabel(); }
                  if (e.key === 'Escape') { setLabelEditing(false); setLabelValue(photo.label ?? ''); }
                }}
                placeholder="Add photo label…"
                className="flex-1 min-w-0 bg-slate-800 border border-slate-600 rounded px-2 py-1 text-xs text-white outline-none focus:border-primary"
                autoFocus
              />
              <button
                onMouseDown={(e) => { e.preventDefault(); void saveLabel(); }}
                disabled={labelSaving}
                className="min-w-[32px] min-h-[32px] flex items-center justify-center rounded-full bg-green-600 hover:bg-green-500 text-white shrink-0 disabled:opacity-50"
                title="Save label"
              >
                {labelSaving ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
              </button>
              <button
                onMouseDown={(e) => { e.preventDefault(); setLabelEditing(false); setLabelValue(photo.label ?? ''); }}
                className="min-w-[32px] min-h-[32px] flex items-center justify-center rounded-full bg-slate-700 hover:bg-slate-600 text-white shrink-0"
                title="Cancel"
              >
                <X size={12} />
              </button>
            </div>
          ) : (
            <button
              onClick={() => { setLabelEditing(true); setTimeout(() => labelInputRef.current?.focus(), 30); }}
              className="flex items-center gap-1.5 flex-1 min-w-0 text-left group"
              title="Edit photo label"
            >
              <span className={`text-xs font-semibold truncate ${displayLabel ? 'text-slate-200' : 'text-slate-500 italic'}`}>
                {displayLabel || 'Add photo label'}
              </span>
              {!isLocked && (
                <Pencil size={11} className="text-slate-500 group-hover:text-slate-300 shrink-0 transition-colors" />
              )}
            </button>
          )}

          {photo.status === 'locked' && !readOnly && (
            <span className="flex items-center gap-1 px-2 py-1 bg-amber-500/20 border border-amber-500/40 rounded-md text-amber-400 text-xs font-semibold shrink-0">
              <Lock size={11} /> Locked
            </span>
          )}

          {/* Download */}
          <button
            type="button"
            onClick={() => {
              if (readOnly) {
                const directUrl = photo.url ?? photo.previewUrl;
                if (directUrl) window.open(directUrl, '_blank', 'noopener,noreferrer');
                return;
              }
              const url = `/api/jobs/${photo.jobId}/photos/${photo.id}/download`;
              fetch(url, { credentials: 'include' })
                .then((r) => {
                  const cd = r.headers.get('Content-Disposition') ?? '';
                  let name = '';
                  const utf8Match = cd.match(/filename\*=UTF-8''([^;]+)/i);
                  if (utf8Match) { try { name = decodeURIComponent(utf8Match[1]); } catch { /* ignore */ } }
                  if (!name) { const m = cd.match(/filename="?([^";]+)"?/i); if (m) name = m[1].trim(); }
                  if (!name) name = photo.label ?? photo.originalName ?? `job-${photo.jobId}-photo-${photo.id}.jpg`;
                  return r.blob().then((blob) => ({ blob, name }));
                })
                .then(({ blob, name }) => {
                  const objectUrl = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = objectUrl; a.download = name;
                  document.body.appendChild(a); a.click(); document.body.removeChild(a);
                  setTimeout(() => URL.revokeObjectURL(objectUrl), 10_000);
                })
                .catch(console.error);
            }}
            className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg hover:bg-slate-700 text-slate-300 hover:text-white transition-colors shrink-0"
            title="Download original"
          >
            <Download size={15} />
          </button>
        </div>

        {/* Row 2 — annotation tools (hidden when locked/readOnly) */}
        {!isLocked && (
          <div
            className="flex items-center gap-0.5 px-2 py-1 overflow-x-auto"
            style={{ scrollbarWidth: 'none', WebkitOverflowScrolling: 'touch' }}
          >
            {/* Rotate CW — preview only; baked in on Save & Lock */}
            <button
              onClick={rotateCW}
              title={`Rotate 90° clockwise (currently ${rotation}°)`}
              className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg hover:bg-slate-700 text-slate-300 hover:text-white transition-colors shrink-0"
            >
              <RotateCw size={15} />
            </button>

            <div className="w-px h-5 bg-slate-700 shrink-0 mx-0.5" />

            {/* Tool buttons */}
            {([
              { id: 'draw',      icon: <Pen size={15} />,          title: 'Pen' },
              { id: 'arrow',     icon: <ArrowUpRight size={15} />, title: 'Arrow' },
              { id: 'circle',    icon: <Circle size={15} />,       title: 'Circle' },
              { id: 'rectangle', icon: <Square size={15} />,       title: 'Rectangle' },
              { id: 'text',      icon: <Type size={15} />,         title: 'Text' },
              { id: 'eraser',    icon: <Eraser size={15} />,       title: 'Eraser' },
            ] as const).map(({ id, icon, title }) => (
              <button
                key={id}
                onClick={() => setTool(id)}
                title={title}
                className={`min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg transition-colors shrink-0 ${
                  tool === id
                    ? 'bg-primary text-primary-foreground'
                    : 'hover:bg-slate-700 text-slate-300 hover:text-white'
                }`}
              >
                {icon}
              </button>
            ))}

            <div className="w-px h-5 bg-slate-700 shrink-0 mx-0.5" />

            {/* Colour swatches */}
            {ANNOTATION_COLORS.map(({ label, value }) => (
              <button
                key={value}
                onClick={() => setColor(value)}
                title={label}
                className={`min-w-[32px] min-h-[32px] rounded-full border-2 transition-all shrink-0 ${
                  color === value ? 'border-white scale-110' : 'border-slate-600 hover:border-slate-400'
                }`}
                style={{ background: value }}
              />
            ))}

            <div className="w-px h-5 bg-slate-700 shrink-0 mx-0.5" />

            {/* Stroke widths (draw / arrow / shapes / eraser) */}
            {tool !== 'text' && (
              <>
                {STROKE_WIDTHS.map((w) => (
                  <button
                    key={w}
                    onClick={() => setStrokeWidth(w)}
                    title={`${w}px`}
                    className={`min-w-[36px] min-h-[44px] flex items-center justify-center rounded-lg transition-colors shrink-0 ${
                      strokeWidth === w ? 'bg-primary' : 'hover:bg-slate-700'
                    }`}
                  >
                    <div className="rounded-full bg-white" style={{ width: w + 2, height: w + 2 }} />
                  </button>
                ))}
                <div className="w-px h-5 bg-slate-700 shrink-0 mx-0.5" />
              </>
            )}

            {/* Font sizes (text only) */}
            {tool === 'text' && (
              <>
                {FONT_SIZES.map((s) => (
                  <button
                    key={s}
                    onClick={() => setFontSize(s)}
                    title={`${s}px`}
                    className={`min-w-[36px] min-h-[44px] px-1.5 flex items-center justify-center rounded-lg text-xs font-bold transition-colors shrink-0 ${
                      fontSize === s ? 'bg-primary text-primary-foreground' : 'hover:bg-slate-700 text-slate-300'
                    }`}
                  >
                    {s}
                  </button>
                ))}
                <div className="w-px h-5 bg-slate-700 shrink-0 mx-0.5" />
              </>
            )}

            {/* Undo */}
            <button
              onClick={() => setStrokes((p) => p.slice(0, -1))}
              disabled={!hasAnnotations}
              title="Undo"
              className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg hover:bg-slate-700 text-slate-300 hover:text-white disabled:opacity-30 transition-colors shrink-0"
            >
              <Undo2 size={15} />
            </button>

            {/* Clear all */}
            <button
              onClick={clearAnnotations}
              disabled={!hasAnnotations}
              title="Clear all annotations"
              className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg hover:bg-red-800 text-slate-300 hover:text-white disabled:opacity-30 transition-colors shrink-0"
            >
              <Trash2 size={15} />
            </button>

            <div className="w-px h-5 bg-slate-700 shrink-0 mx-0.5" />

            {/* Save & Lock */}
            <button
              onClick={handleSaveAndLock}
              disabled={saving}
              className="flex items-center gap-1.5 px-3 min-h-[44px] bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-black text-xs font-bold rounded-lg transition-colors shrink-0 whitespace-nowrap"
            >
              {saving ? <Loader2 size={13} className="animate-spin" /> : <Lock size={13} />}
              {saving ? 'Saving…' : 'Save & Lock'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
