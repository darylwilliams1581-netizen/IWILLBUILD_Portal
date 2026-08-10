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

  // Label modal
  const [labelModalOpen, setLabelModalOpen] = useState(false);
  const [labelValue, setLabelValue]         = useState(photo.label ?? '');
  const [labelDraft, setLabelDraft]         = useState('');
  const [labelSaving, setLabelSaving]       = useState(false);
  const [labelError, setLabelError]         = useState('');
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
        if (textInput)     { setTextInput(null); return; }
        if (labelModalOpen) { setLabelModalOpen(false); return; }
        onClose();
      }
      if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
        e.preventDefault();
        setStrokes((prev) => prev.slice(0, -1));
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose, textInput, labelModalOpen, photo.label]);

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

  const openLabelModal = useCallback(() => {
    setLabelDraft(labelValue);
    setLabelError('');
    setLabelModalOpen(true);
    setTimeout(() => labelInputRef.current?.focus(), 60);
  }, [labelValue]);

  // Lock body scroll while label modal is open (prevents background page scroll on iOS)
  useEffect(() => {
    if (!labelModalOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [labelModalOpen]);

  const saveLabel = useCallback(async () => {
    const trimmed = labelDraft.trim();
    setLabelSaving(true);
    setLabelError('');
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
      setLabelValue(trimmed);
      setLabelModalOpen(false);
    } catch {
      setLabelError('Could not save label. Please try again.');
    } finally {
      setLabelSaving(false);
    }
  }, [photo.jobId, photo.id, labelDraft]);

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

  // ── Sheet open state ───────────────────────────────────────────────────────

  const [sheetOpen, setSheetOpen] = useState(false);

  // Lock body scroll while sheet is open
  useEffect(() => {
    if (!sheetOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = prev; };
  }, [sheetOpen]);

  // ── Render ─────────────────────────────────────────────────────────────────

  const hasAnnotations = strokes.length > 0;
  const canvasCursor   = isLocked ? 'default' : tool === 'text' ? 'text' : tool === 'eraser' ? 'cell' : 'crosshair';
  const displayLabel   = labelValue.trim();

  return (
    <div
      className="fixed inset-0 z-[80] flex flex-col bg-black"
      style={{
        height: '100dvh',
        maxWidth: '100vw',
        overflowX: 'clip',
        paddingTop: 'env(safe-area-inset-top, 0px)',
      }}
    >
      {/* ── Error banner ── */}
      {saveError && (
        <div className="flex items-center gap-2 px-4 py-2 bg-red-900/80 text-red-200 text-xs font-semibold shrink-0">
          <AlertCircle size={13} />
          {saveError}
          <button onClick={() => setSaveError('')} className="ml-auto text-red-300 hover:text-white">&times;</button>
        </div>
      )}

      {/* ── Top bar: Close | label | Download ── */}
      <div
        className="shrink-0 flex items-center gap-2 px-2 bg-slate-900 border-b border-slate-800"
        style={{ minHeight: 44 }}
      >
        {/* Close */}
        <button
          onClick={onClose}
          className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-lg hover:bg-slate-700 text-slate-300 hover:text-white transition-colors shrink-0"
          title="Close"
        >
          <X size={16} />
        </button>

        {/* Label button */}
        <button
          onClick={openLabelModal}
          title="Edit photo label"
          className="flex items-center gap-1 px-2 py-1 rounded-lg hover:bg-slate-700 transition-colors text-left min-w-0 flex-1"
          style={{ maxWidth: 200 }}
        >
          <span
            className={`text-xs font-semibold ${displayLabel ? 'text-slate-200' : 'text-slate-500 italic'}`}
            style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 160 }}
          >
            {displayLabel || 'Add label…'}
          </span>
          {!isLocked && <Pencil size={10} className="text-slate-500 shrink-0 ml-0.5" />}
        </button>

        {/* Locked badge */}
        {photo.status === 'locked' && !readOnly && (
          <span className="flex items-center gap-1 px-2 py-1 bg-amber-500/20 border border-amber-500/40 rounded-md text-amber-400 text-xs font-semibold shrink-0">
            <Lock size={11} /> Locked
          </span>
        )}

        <div className="flex-1" />

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
          title="Download"
        >
          <Download size={15} />
        </button>
      </div>

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
              maxHeight: 'calc(100dvh - 132px)',
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

      {/* ── Collapsed bottom action bar ── */}
      {!isLocked && (
        <div
          className="shrink-0 flex items-center gap-2 px-3 bg-slate-900 border-t border-slate-700"
          style={{
            minHeight: 56,
            paddingBottom: 'env(safe-area-inset-bottom, 0px)',
            paddingLeft: 'max(env(safe-area-inset-left, 0px), 12px)',
            paddingRight: 'max(env(safe-area-inset-right, 0px), 12px)',
            boxSizing: 'border-box',
            maxWidth: '100vw',
          }}
        >
          {/* Pen — opens sheet, highlights when sheet open */}
          <button
            onClick={() => setSheetOpen((o) => !o)}
            title="Annotation tools"
            className={`min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl transition-colors shrink-0 ${
              sheetOpen
                ? 'bg-primary text-primary-foreground'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white'
            }`}
          >
            <Pen size={16} />
          </button>

          {/* Undo */}
          <button
            onClick={() => setStrokes((p) => p.slice(0, -1))}
            disabled={!hasAnnotations}
            title="Undo"
            className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white disabled:opacity-30 transition-colors shrink-0"
          >
            <Undo2 size={16} />
          </button>

          {/* Eraser */}
          <button
            onClick={() => { setTool('eraser'); setSheetOpen(true); }}
            title="Eraser"
            className={`min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl transition-colors shrink-0 ${
              tool === 'eraser'
                ? 'bg-primary text-primary-foreground'
                : 'bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white'
            }`}
          >
            <Eraser size={16} />
          </button>

          {/* Rotate CW */}
          <button
            onClick={rotateCW}
            title={`Rotate CW (${rotation}°)`}
            className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-colors shrink-0"
          >
            <RotateCw size={16} />
          </button>

          {/* Clear */}
          <button
            onClick={clearAnnotations}
            disabled={!hasAnnotations}
            title="Clear all annotations"
            className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl bg-slate-800 hover:bg-red-900 text-slate-300 hover:text-red-300 disabled:opacity-30 transition-colors shrink-0"
          >
            <Trash2 size={16} />
          </button>

          {/* Save & Lock */}
          <button
            onClick={handleSaveAndLock}
            disabled={saving}
            className="flex items-center gap-1.5 px-4 min-h-[44px] bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-black text-sm font-bold rounded-xl transition-colors shrink-0 whitespace-nowrap"
          >
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Lock size={14} />}
            {saving ? 'Saving…' : 'Save & Lock'}
          </button>
        </div>
      )}

      {/* ── Bottom editing sheet ── */}
      {sheetOpen && !isLocked && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-[85] bg-black/40"
            onClick={() => setSheetOpen(false)}
          />

          {/* Sheet panel */}
          <div
            className="fixed bottom-0 left-0 right-0 z-[86] flex flex-col bg-slate-900 rounded-t-2xl border-t border-slate-700 shadow-2xl"
            style={{
              maxHeight: '70dvh',
              width: '100%',
              maxWidth: '100vw',
              boxSizing: 'border-box',
              paddingBottom: 'env(safe-area-inset-bottom, 0px)',
              paddingLeft: 'env(safe-area-inset-left, 0px)',
              paddingRight: 'env(safe-area-inset-right, 0px)',
              animation: 'slideUp 220ms ease-out',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Drag handle */}
            <div className="flex justify-center pt-3 pb-2 shrink-0">
              <div className="w-10 h-1 rounded-full bg-slate-600" />
            </div>

            {/* Sheet header */}
            <div className="flex items-center justify-between px-4 pb-2 shrink-0">
              <span className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Annotation tools</span>
              <button
                onClick={() => setSheetOpen(false)}
                className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
              >
                <X size={15} />
              </button>
            </div>

            {/* Scrollable content */}
            <div className="overflow-y-auto flex-1 min-h-0 px-4 pb-4 flex flex-col gap-5">

              {/* ── Section: Tools ── */}
              <div className="flex flex-col gap-2">
                <span className="text-xs text-slate-500 font-medium">Tools</span>
                <div className="flex flex-wrap gap-2">
                  {([
                    { id: 'draw',      icon: <Pen size={16} />,          label: 'Pen' },
                    { id: 'arrow',     icon: <ArrowUpRight size={16} />, label: 'Arrow' },
                    { id: 'circle',    icon: <Circle size={16} />,       label: 'Circle' },
                    { id: 'rectangle', icon: <Square size={16} />,       label: 'Rect' },
                    { id: 'text',      icon: <Type size={16} />,         label: 'Text' },
                    { id: 'eraser',    icon: <Eraser size={16} />,       label: 'Eraser' },
                  ] as const).map(({ id, icon, label }) => (
                    <button
                      key={id}
                      onClick={() => setTool(id)}
                      className={`flex flex-col items-center gap-1 min-w-[52px] min-h-[52px] px-2 py-1.5 rounded-xl text-xs font-medium transition-colors ${
                        tool === id
                          ? 'bg-primary text-primary-foreground'
                          : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                      }`}
                    >
                      {icon}
                      <span>{label}</span>
                    </button>
                  ))}

                  {/* Rotate CW */}
                  <button
                    onClick={rotateCW}
                    title={`Rotate CW (${rotation}°)`}
                    className="flex flex-col items-center gap-1 min-w-[52px] min-h-[52px] px-2 py-1.5 rounded-xl text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-300 transition-colors"
                  >
                    <RotateCw size={16} />
                    <span>Rotate</span>
                  </button>

                  {/* Undo */}
                  <button
                    onClick={() => setStrokes((p) => p.slice(0, -1))}
                    disabled={!hasAnnotations}
                    title="Undo"
                    className="flex flex-col items-center gap-1 min-w-[52px] min-h-[52px] px-2 py-1.5 rounded-xl text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-300 disabled:opacity-30 transition-colors"
                  >
                    <Undo2 size={16} />
                    <span>Undo</span>
                  </button>

                  {/* Clear */}
                  <button
                    onClick={clearAnnotations}
                    disabled={!hasAnnotations}
                    title="Clear all"
                    className="flex flex-col items-center gap-1 min-w-[52px] min-h-[52px] px-2 py-1.5 rounded-xl text-xs font-medium bg-slate-800 hover:bg-red-900 text-slate-300 hover:text-red-300 disabled:opacity-30 transition-colors"
                  >
                    <Trash2 size={16} />
                    <span>Clear</span>
                  </button>
                </div>
              </div>

              {/* ── Section: Style ── */}
              <div className="flex flex-col gap-3">
                <span className="text-xs text-slate-500 font-medium">Style</span>

                {/* Colours */}
                <div className="flex items-center gap-3 flex-wrap">
                  <span className="text-xs text-slate-500 w-12 shrink-0">Colour</span>
                  <div className="flex gap-2 flex-wrap">
                    {ANNOTATION_COLORS.map(({ label, value }) => (
                      <button
                        key={value}
                        onClick={() => setColor(value)}
                        title={label}
                        className={`w-8 h-8 rounded-full border-2 transition-all ${
                          color === value ? 'border-white scale-110' : 'border-slate-600 hover:border-slate-400'
                        }`}
                        style={{ background: value }}
                      />
                    ))}
                  </div>
                </div>

                {/* Line width (non-text tools) */}
                {tool !== 'text' && (
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="text-xs text-slate-500 w-12 shrink-0">Width</span>
                    <div className="flex gap-2">
                      {STROKE_WIDTHS.map((w) => (
                        <button
                          key={w}
                          onClick={() => setStrokeWidth(w)}
                          title={`${w}px`}
                          className={`w-10 h-10 flex items-center justify-center rounded-xl transition-colors ${
                            strokeWidth === w ? 'bg-primary' : 'bg-slate-800 hover:bg-slate-700'
                          }`}
                        >
                          <div className="rounded-full bg-white" style={{ width: w + 2, height: w + 2 }} />
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                {/* Font size (text tool) */}
                {tool === 'text' && (
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="text-xs text-slate-500 w-12 shrink-0">Size</span>
                    <div className="flex gap-2">
                      {FONT_SIZES.map((s) => (
                        <button
                          key={s}
                          onClick={() => setFontSize(s)}
                          title={`${s}px`}
                          className={`w-10 h-10 flex items-center justify-center rounded-xl text-xs font-bold transition-colors ${
                            fontSize === s ? 'bg-primary text-primary-foreground' : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                          }`}
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {/* ── Section: Photo details ── */}
              <div className="flex flex-col gap-3">
                <span className="text-xs text-slate-500 font-medium">Photo details</span>

                {/* Label (editable) */}
                <div className="flex items-center gap-3">
                  <span className="text-xs text-slate-500 w-12 shrink-0">Label</span>
                  <button
                    onClick={openLabelModal}
                    className="flex-1 min-h-[40px] text-left px-3 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-sm transition-colors"
                  >
                    <span className={displayLabel ? 'text-white' : 'text-slate-500 italic'}>
                      {displayLabel || 'Add label…'}
                    </span>
                  </button>
                </div>

                {/* Job name (read-only — present when passed via extended photo object) */}
                {(photo as JobPhoto & { jobName?: string }).jobName && (
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-slate-500 w-12 shrink-0">Job</span>
                    <span className="flex-1 px-3 py-2 rounded-xl bg-slate-800/50 border border-slate-700/50 text-sm text-slate-400 truncate">
                      {(photo as JobPhoto & { jobName?: string }).jobName}
                    </span>
                  </div>
                )}

                {/* Capture date (read-only) */}
                {photo.createdAt && (
                  <div className="flex items-center gap-3">
                    <span className="text-xs text-slate-500 w-12 shrink-0">Date</span>
                    <span className="flex-1 px-3 py-2 rounded-xl bg-slate-800/50 border border-slate-700/50 text-sm text-slate-400">
                      {new Date(photo.createdAt).toLocaleDateString('en-AU', {
                        day: 'numeric', month: 'short', year: 'numeric',
                        hour: '2-digit', minute: '2-digit',
                      })}
                    </span>
                  </div>
                )}
              </div>

            </div>
          </div>
        </>
      )}

      {/* ── Label modal (opened from top bar or sheet) ── */}
      {labelModalOpen && (
        <div
          className="fixed inset-0 z-[90] flex items-end sm:items-center justify-center"
          style={{ overflowX: 'hidden' }}
          onWheel={(e) => e.preventDefault()}
        >
          {/* Backdrop */}
          <div
            className="absolute inset-0 bg-black/70"
            onClick={() => { if (!labelSaving) setLabelModalOpen(false); }}
          />

          {/* Sheet / dialog */}
          <div
            className="relative bg-slate-900 border border-slate-700 rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col"
            style={{ width: 'calc(100vw - 32px)', maxWidth: 420 }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Drag handle — mobile only */}
            <div className="sm:hidden flex justify-center pt-3 pb-1 shrink-0">
              <div className="w-10 h-1 rounded-full bg-slate-700" />
            </div>

            {/* Header */}
            <div className="flex items-center justify-between px-5 py-3 border-b border-slate-700 shrink-0">
              <h3 className="font-semibold text-sm text-white">Edit photo label</h3>
              <button
                onClick={() => { if (!labelSaving) setLabelModalOpen(false); }}
                className="p-1.5 rounded-lg hover:bg-slate-700 text-slate-400 hover:text-white transition-colors"
              >
                <X size={15} />
              </button>
            </div>

            {/* Body */}
            <div className="px-5 py-4 flex flex-col gap-3">
              <input
                ref={labelInputRef}
                type="text"
                value={labelDraft}
                onChange={(e) => { setLabelDraft(e.target.value); setLabelError(''); }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter')  { e.preventDefault(); void saveLabel(); }
                  if (e.key === 'Escape') { if (!labelSaving) setLabelModalOpen(false); }
                }}
                placeholder="Add photo label…"
                maxLength={120}
                className="w-full bg-slate-800 border border-slate-600 focus:border-primary rounded-lg px-3 py-2.5 text-sm text-white outline-none placeholder:text-slate-500 transition-colors"
              />
              {labelError && (
                <p className="flex items-center gap-1.5 text-xs text-red-400">
                  <AlertCircle size={12} className="shrink-0" />
                  {labelError}
                </p>
              )}
            </div>

            {/* Footer */}
            <div
              className="flex items-center justify-end gap-2 px-5 py-4 border-t border-slate-700 shrink-0"
              style={{ paddingBottom: 'max(env(safe-area-inset-bottom), 16px)' }}
            >
              <button
                type="button"
                onClick={() => setLabelModalOpen(false)}
                disabled={labelSaving}
                className="px-4 py-2 rounded-lg border border-slate-600 text-sm text-slate-300 hover:bg-slate-700 disabled:opacity-50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void saveLabel()}
                disabled={labelSaving}
                className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary hover:bg-primary/90 text-primary-foreground text-sm font-semibold disabled:opacity-50 transition-colors"
              >
                {labelSaving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                {labelSaving ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Slide-up keyframe ── */}
      <style>{`
        @keyframes slideUp {
          from { transform: translateY(100%); }
          to   { transform: translateY(0); }
        }
      `}</style>
    </div>
  );
}
