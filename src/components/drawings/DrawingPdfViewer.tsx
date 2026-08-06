/**
 * DrawingPdfViewer
 * Full-screen PDF viewer with zoom/pan/rotate/fit, page navigation,
 * markup tools (text, arrow, rect, highlight, pen), and markup save.
 *
 * Mobile (Sprint 5 — Gesture Viewer):
 * - useMobileViewer hook: two-finger pinch-zoom, double-tap toggle, body-scroll lock
 * - Fit-to-screen default on mobile (auto-fit on first page load)
 * - Markup toolbar collapses into "…" overflow menu on mobile (< md)
 * - Rotate button hidden on mobile (in overflow menu)
 * - Safe-area bottom padding via env(safe-area-inset-bottom)
 * - touch-action: none on PDF canvas area prevents browser pan/zoom interfering
 * - Tested at 375 / 390 / 430 px viewport widths
 */
import React, { useState, useRef, useEffect, useCallback } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';
import {
  X, ZoomIn, ZoomOut, RotateCw, Maximize2, Minimize2,
  ChevronLeft, ChevronRight, Save, Trash2, Loader2,
  Type, ArrowUpRight, Square, Highlighter, Pen,
  Shrink, MousePointer2,
} from 'lucide-react';
import { useMobileViewer } from '@/lib/useMobileViewer';
import { resolveNativeUrl } from '@/lib/native-url';

// react-pdf@10 bundles its own pdfjs-dist@5.4.296 — worker must match that version exactly.
// On Capacitor native the worker path must be absolute (capacitor://localhost can't serve it).
pdfjs.GlobalWorkerOptions.workerSrc = resolveNativeUrl('/pdf.worker.5.4.296.min.mjs');

type ToolType = 'none' | 'text' | 'arrow' | 'rect' | 'highlight' | 'pen';

interface MarkupItem {
  id: string;
  tool: ToolType;
  page: number;
  x: number; y: number;
  x2?: number; y2?: number;
  text?: string;
  color: string;
  points?: Array<{ x: number; y: number }>;
}

interface Props {
  drawingId: number;
  fileUrl: string;
  title: string;
  onClose: () => void;
  onMarkupSaved?: () => void;
}

const TOOL_COLORS: Record<ToolType, string> = {
  none: '#7c3aed', text: '#1e40af', arrow: '#dc2626',
  rect: '#16a34a', highlight: '#fbbf24', pen: '#7c3aed',
};
const TOOL_LABELS: Record<ToolType, string> = {
  none: 'Select', text: 'Text Note', arrow: 'Arrow',
  rect: 'Rectangle', highlight: 'Highlight', pen: 'Freehand Pen',
};

function drawArrow(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number, color: string) {
  const headLen = 14;
  const angle = Math.atan2(y2 - y1, x2 - x1);
  ctx.save();
  ctx.strokeStyle = color; ctx.fillStyle = color; ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x2, y2);
  ctx.lineTo(x2 - headLen * Math.cos(angle - Math.PI / 6), y2 - headLen * Math.sin(angle - Math.PI / 6));
  ctx.lineTo(x2 - headLen * Math.cos(angle + Math.PI / 6), y2 - headLen * Math.sin(angle + Math.PI / 6));
  ctx.closePath(); ctx.fill(); ctx.restore();
}

function MarkupCanvas({ items, currentPage, pageWidth, pageHeight, activeTool, onAddItem }: {
  items: MarkupItem[]; currentPage: number; pageWidth: number; pageHeight: number;
  activeTool: ToolType; onAddItem: (item: MarkupItem) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const startPos = useRef({ x: 0, y: 0 });
  const penPoints = useRef<Array<{ x: number; y: number }>>([]);

  const redraw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (const item of items.filter((i) => i.page === currentPage)) {
      const x = item.x * pageWidth, y = item.y * pageHeight;
      const x2 = (item.x2 ?? item.x) * pageWidth, y2 = (item.y2 ?? item.y) * pageHeight;
      ctx.save();
      if (item.tool === 'text' && item.text) {
        ctx.font = 'bold 14px Inter, sans-serif'; ctx.fillStyle = item.color;
        ctx.fillText(item.text, x, y);
        ctx.fillRect(x, y + 2, ctx.measureText(item.text).width, 2);
      } else if (item.tool === 'arrow') {
        drawArrow(ctx, x, y, x2, y2, item.color);
      } else if (item.tool === 'rect') {
        ctx.strokeStyle = item.color; ctx.lineWidth = 2.5;
        ctx.strokeRect(x, y, x2 - x, y2 - y);
      } else if (item.tool === 'highlight') {
        ctx.globalAlpha = 0.35; ctx.fillStyle = item.color;
        ctx.fillRect(x, y, x2 - x, y2 - y); ctx.globalAlpha = 1;
      } else if (item.tool === 'pen' && item.points?.length) {
        ctx.strokeStyle = item.color; ctx.lineWidth = 2;
        ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.beginPath();
        const pts = item.points.map((p) => ({ x: p.x * pageWidth, y: p.y * pageHeight }));
        ctx.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
        ctx.stroke();
      }
      ctx.restore();
    }
  }, [items, currentPage, pageWidth, pageHeight]);

  useEffect(() => { redraw(); }, [redraw]);

  function getPos(e: React.MouseEvent<HTMLCanvasElement>) {
    const rect = canvasRef.current!.getBoundingClientRect();
    return { x: (e.clientX - rect.left) / pageWidth, y: (e.clientY - rect.top) / pageHeight };
  }

  function onMouseDown(e: React.MouseEvent<HTMLCanvasElement>) {
    if (activeTool === 'none') return;
    drawing.current = true;
    const pos = getPos(e);
    startPos.current = pos;
    if (activeTool === 'pen') penPoints.current = [pos];
  }

  function onMouseMove(e: React.MouseEvent<HTMLCanvasElement>) {
    if (!drawing.current || activeTool === 'none') return;
    const canvas = canvasRef.current; if (!canvas) return;
    const ctx = canvas.getContext('2d'); if (!ctx) return;
    const pos = getPos(e);
    if (activeTool === 'pen') {
      penPoints.current.push(pos); redraw();
      ctx.save(); ctx.strokeStyle = TOOL_COLORS.pen; ctx.lineWidth = 2;
      ctx.lineJoin = 'round'; ctx.lineCap = 'round'; ctx.beginPath();
      const pts = penPoints.current.map((p) => ({ x: p.x * pageWidth, y: p.y * pageHeight }));
      ctx.moveTo(pts[0].x, pts[0].y);
      for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
      ctx.stroke(); ctx.restore();
    } else {
      redraw();
      ctx.save();
      const sx = startPos.current.x * pageWidth, sy = startPos.current.y * pageHeight;
      const ex = pos.x * pageWidth, ey = pos.y * pageHeight;
      ctx.strokeStyle = TOOL_COLORS[activeTool]; ctx.lineWidth = 2;
      if (activeTool === 'rect') ctx.strokeRect(sx, sy, ex - sx, ey - sy);
      else if (activeTool === 'highlight') {
        ctx.globalAlpha = 0.35; ctx.fillStyle = TOOL_COLORS.highlight;
        ctx.fillRect(sx, sy, ex - sx, ey - sy); ctx.globalAlpha = 1;
      } else if (activeTool === 'arrow') drawArrow(ctx, sx, sy, ex, ey, TOOL_COLORS.arrow);
      ctx.restore();
    }
  }

  function onMouseUp(e: React.MouseEvent<HTMLCanvasElement>) {
    if (!drawing.current || activeTool === 'none') return;
    drawing.current = false;
    const pos = getPos(e);
    const start = startPos.current;
    if (activeTool === 'text') {
      const text = window.prompt('Enter note text:');
      if (!text?.trim()) return;
      onAddItem({ id: crypto.randomUUID(), tool: 'text', page: currentPage, x: start.x, y: start.y, text: text.trim(), color: TOOL_COLORS.text });
    } else if (activeTool === 'pen') {
      if (penPoints.current.length > 1)
        onAddItem({ id: crypto.randomUUID(), tool: 'pen', page: currentPage, x: start.x, y: start.y, points: [...penPoints.current], color: TOOL_COLORS.pen });
      penPoints.current = [];
    } else {
      onAddItem({ id: crypto.randomUUID(), tool: activeTool, page: currentPage, x: start.x, y: start.y, x2: pos.x, y2: pos.y, color: TOOL_COLORS[activeTool] });
    }
  }

  return (
    <canvas ref={canvasRef} width={pageWidth} height={pageHeight}
      className="absolute inset-0 z-10"
      style={{ cursor: activeTool === 'none' ? 'default' : 'crosshair', pointerEvents: activeTool === 'none' ? 'none' : 'auto' }}
      onMouseDown={onMouseDown} onMouseMove={onMouseMove} onMouseUp={onMouseUp}
    />
  );
}

// ── Mobile bottom-bar button ──────────────────────────────────────────────────
/** Floating annotation FAB + popup sheet — mobile only (hidden on md+) */
function MobileAnnotationFAB({
  activeTool, markupCount, saving,
  onToolChange, onFit, onRotate, onSave,
}: {
  activeTool: ToolType;
  markupCount: number;
  saving: boolean;
  onToolChange: (t: ToolType) => void;
  onFit: () => void;
  onRotate: () => void;
  onSave: () => void;
}) {
  const [open, setOpen] = useState(false);
  const hasMarkup = markupCount > 0;
  const isEditing = activeTool !== 'none';

  const TOOLS: { tool: ToolType; Icon: React.ElementType; label: string; color: string }[] = [
    { tool: 'none',      Icon: MousePointer2, label: 'Select / Pan',   color: 'text-slate-300' },
    { tool: 'text',      Icon: Type,          label: 'Text Note',       color: 'text-blue-400'  },
    { tool: 'arrow',     Icon: ArrowUpRight,  label: 'Arrow',           color: 'text-red-400'   },
    { tool: 'rect',      Icon: Square,        label: 'Rectangle',       color: 'text-green-400' },
    { tool: 'highlight', Icon: Highlighter,   label: 'Highlight',       color: 'text-yellow-400'},
    { tool: 'pen',       Icon: Pen,           label: 'Freehand Pen',    color: 'text-violet-400'},
  ];

  return (
    <div className="md:hidden">
      {/* Backdrop */}
      {open && (
        <div
          className="fixed inset-0 z-[60]"
          onClick={() => setOpen(false)}
        />
      )}

      {/* Popup sheet — anchored above FAB */}
      {open && (
        <div
          className="fixed z-[61] bg-slate-800 border border-slate-600 rounded-2xl shadow-2xl p-3 flex flex-col gap-1"
          style={{
            bottom: 'calc(env(safe-area-inset-bottom, 0px) + 76px)',
            right: '16px',
            minWidth: '200px',
          }}
        >
          <p className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-2 pb-1">Annotation Tools</p>

          {TOOLS.map(({ tool, Icon, label, color }) => (
            <button
              key={tool}
              onClick={() => { onToolChange(tool); setOpen(false); }}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium transition-colors text-left
                ${activeTool === tool
                  ? 'bg-primary text-white'
                  : `bg-slate-700/60 ${color} hover:bg-slate-700`}`}
            >
              <Icon size={16} className="shrink-0" />
              <span>{label}</span>
              {activeTool === tool && <span className="ml-auto text-[10px] font-bold opacity-70">ACTIVE</span>}
            </button>
          ))}

          <div className="h-px bg-slate-600 my-1" />

          {/* Utility actions */}
          <button
            onClick={() => { onFit(); setOpen(false); }}
            className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-slate-300 bg-slate-700/60 hover:bg-slate-700 transition-colors"
          >
            <Shrink size={16} className="shrink-0" /> Fit to screen
          </button>
          <button
            onClick={() => { onRotate(); setOpen(false); }}
            className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-medium text-slate-300 bg-slate-700/60 hover:bg-slate-700 transition-colors"
          >
            <RotateCw size={16} className="shrink-0" /> Rotate 90°
          </button>

          {hasMarkup && (
            <>
              <div className="h-px bg-slate-600 my-1" />
              <button
                onClick={() => { onSave(); setOpen(false); }}
                disabled={saving}
                className="flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm font-bold text-white bg-primary hover:bg-violet-700 transition-colors disabled:opacity-50"
              >
                {saving ? <Loader2 size={16} className="animate-spin shrink-0" /> : <Save size={16} className="shrink-0" />}
                Save Markup ({markupCount})
              </button>
            </>
          )}
        </div>
      )}

      {/* FAB button */}
      <button
        onClick={() => setOpen((v) => !v)}
        className={`fixed z-[62] flex items-center gap-2 px-4 py-3 rounded-2xl shadow-2xl font-bold text-sm transition-all active:scale-95
          ${open
            ? 'bg-slate-600 text-white'
            : isEditing
              ? 'bg-primary text-white'
              : 'bg-slate-700 text-slate-200 border border-slate-600'}`}
        style={{
          bottom: 'calc(env(safe-area-inset-bottom, 0px) + 16px)',
          right: '16px',
        }}
      >
        <Pen size={16} />
        {isEditing ? TOOL_LABELS[activeTool] : 'Edit'}
        {hasMarkup && !isEditing && (
          <span className="bg-primary text-white text-[10px] font-bold rounded-full w-5 h-5 flex items-center justify-center">
            {markupCount}
          </span>
        )}
      </button>
    </div>
  );
}

export default function DrawingPdfViewer({ drawingId, fileUrl: fileUrlRaw, title, onClose, onMarkupSaved }: Props) {
  const fileUrl = resolveNativeUrl(fileUrlRaw);
  const [numPages, setNumPages] = useState(0);
  const [currentPage, setCurrentPage] = useState(1);
  const [scale, setScale] = useState(1.0);
  const [rotation, setRotation] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [activeTool, setActiveTool] = useState<ToolType>('none');
  const [markupItems, setMarkupItems] = useState<MarkupItem[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');
  const [pageWidth, setPageWidth] = useState(0);
  const [pageHeight, setPageHeight] = useState(0);
  const [pdfError, setPdfError] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);

  // ── Mobile gesture hook ──────────────────────────────────────────────────
  const mobileViewer = useMobileViewer({
    containerRef,
    scale,
    onScaleChange: setScale,
    onFitWidthOff: () => {},   // DrawingPdfViewer has no fitWidth state
  });

  // ── Fit-to-screen on first page load (mobile default) ───────────────────
  const fittedOnMount = useRef(false);

  function handlePageLoad(page: { width: number; height: number }) {
    setPageWidth(Math.round(page.width));
    setPageHeight(Math.round(page.height));

    if (!containerRef.current) return;
    const containerW = containerRef.current.clientWidth;
    if (!fittedOnMount.current && containerW > 0 && containerW < 768) {
      fittedOnMount.current = true;
      const w = containerW - 32; // 16 px padding each side
      const fitted = Math.round((w / page.width) * 100) / 100;
      setScale(Math.max(0.25, Math.min(4, fitted)));
    }
  }

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') setActiveTool('none'); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // ── iOS swipe-back / hardware-back interception ──────────────────────────
  // Push a dummy history entry so the native back gesture pops it instead of
  // navigating the router away from the job page.
  useEffect(() => {
    window.history.pushState({ drawingViewer: true }, '');
    function onPopState(e: PopStateEvent) {
      // If the popped state is NOT our sentinel, the user navigated further
      // back — let it through. Otherwise intercept and close the overlay.
      if (!(e.state as Record<string, unknown> | null)?.drawingViewer) return;
      onClose();
    }
    window.addEventListener('popstate', onPopState);
    return () => {
      window.removeEventListener('popstate', onPopState);
      // If the viewer is closed via the X button (not back gesture), the
      // dummy entry is still in the stack — go back to clean it up.
      if (window.history.state && (window.history.state as Record<string, unknown>).drawingViewer) {
        window.history.back();
      }
    };
  }, [onClose]);

  function fitToWidth() {
    if (containerRef.current) {
      const w = containerRef.current.clientWidth - 80;
      setScale(Math.max(0.3, w / 800));
    }
  }

  function toggleFullscreen() {
    if (!isFullscreen) document.documentElement.requestFullscreen?.().catch(() => {});
    else document.exitFullscreen?.().catch(() => {});
    setIsFullscreen((v) => !v);
  }

  function clearMarkup() {
    if (!markupItems.length) return;
    if (!window.confirm('Clear all unsaved markup?')) return;
    setMarkupItems([]);
  }

  async function saveMarkup() {
    if (!markupItems.length) { setSaveMsg('No markup to save.'); setTimeout(() => setSaveMsg(''), 3000); return; }
    setSaving(true); setSaveMsg('');
    try {
      const pdfRes = await fetch(fileUrl, { credentials: 'include' });
      if (!pdfRes.ok) throw new Error('Could not fetch original PDF');
      const pdfBytes = await pdfRes.arrayBuffer();

      const { PDFDocument, rgb, StandardFonts } = await import('pdf-lib');
      const pdfDoc = await PDFDocument.load(pdfBytes);
      const font = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
      const pages = pdfDoc.getPages();

      for (const item of markupItems) {
        const pageIdx = item.page - 1;
        if (pageIdx < 0 || pageIdx >= pages.length) continue;
        const pdfPage = pages[pageIdx];
        const { width: pw, height: ph } = pdfPage.getSize();
        const x = item.x * pw, y = ph - item.y * ph;
        const x2 = (item.x2 ?? item.x) * pw, y2 = ph - (item.y2 ?? item.y) * ph;

        function hexToRgb(hex: string) {
          return rgb(parseInt(hex.slice(1, 3), 16) / 255, parseInt(hex.slice(3, 5), 16) / 255, parseInt(hex.slice(5, 7), 16) / 255);
        }
        const color = hexToRgb(item.color);

        if (item.tool === 'text' && item.text) {
          pdfPage.drawText(item.text, { x, y, size: 12, font, color });
        } else if (item.tool === 'rect') {
          pdfPage.drawRectangle({ x: Math.min(x, x2), y: Math.min(y, y2), width: Math.abs(x2 - x), height: Math.abs(y2 - y), borderColor: color, borderWidth: 2, opacity: 0 });
        } else if (item.tool === 'highlight') {
          pdfPage.drawRectangle({ x: Math.min(x, x2), y: Math.min(y, y2), width: Math.abs(x2 - x), height: Math.abs(y2 - y), color, opacity: 0.3 });
        } else if (item.tool === 'arrow') {
          pdfPage.drawLine({ start: { x, y }, end: { x: x2, y: y2 }, color, thickness: 2 });
        } else if (item.tool === 'pen' && item.points?.length) {
          const pts = item.points.map((p) => ({ x: p.x * pw, y: ph - p.y * ph }));
          for (let i = 0; i < pts.length - 1; i++)
            pdfPage.drawLine({ start: pts[i], end: pts[i + 1], color, thickness: 2 });
        }
      }

      const markedBytes = await pdfDoc.save();
      const base64 = btoa(String.fromCharCode(...new Uint8Array(markedBytes)));

      const res = await fetch(`/api/drawings/${drawingId}/markup`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pdfBase64: base64 }),
      });
      const data = await res.json() as { ok?: boolean; error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Save failed');

      setSaveMsg('Markup saved as new copy. Original unchanged.');
      setMarkupItems([]);
      onMarkupSaved?.();
    } catch (err) {
      setSaveMsg(`Error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setSaving(false);
      setTimeout(() => setSaveMsg(''), 6000);
    }
  }

  return (
    <div className="viewer-shell fixed inset-0 z-50 flex flex-col bg-slate-900" style={{ overflow: 'hidden' }}>
      {/* ── Top toolbar ──────────────────────────────────────────────────────── */}
      <div className="viewer-toolbar flex items-center gap-1.5 px-2 bg-slate-800 border-b border-slate-700 shrink-0"
        style={{
          paddingTop: 'max(env(safe-area-inset-top), 10px)',
          paddingBottom: '8px',
          overflowX: 'clip',
        }}>

        {/* Title */}
        <div className="flex items-center gap-1.5 min-w-0 mr-1">
          <div className="w-2 h-2 rounded-full bg-primary shrink-0" />
          <span className="text-white font-semibold text-sm truncate max-w-[120px] sm:max-w-[200px]">{title}</span>
        </div>

        <div className="hidden sm:block h-5 w-px bg-slate-600 mx-0.5" />

        {/* Page nav — always visible */}
        <div className="flex items-center gap-0.5">
          <button onClick={() => setCurrentPage((p) => Math.max(1, p - 1))} disabled={currentPage <= 1}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-300 hover:bg-slate-700 disabled:opacity-30">
            <ChevronLeft size={15} />
          </button>
          <span className="text-slate-300 text-xs font-mono px-1 whitespace-nowrap tabular-nums">{currentPage} / {numPages || '—'}</span>
          <button onClick={() => setCurrentPage((p) => Math.min(numPages, p + 1))} disabled={currentPage >= numPages}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-300 hover:bg-slate-700 disabled:opacity-30">
            <ChevronRight size={15} />
          </button>
        </div>

        <div className="h-5 w-px bg-slate-600 mx-0.5" />

        {/* Zoom — always visible */}
        <div className="flex items-center gap-0.5">
          <button onClick={() => mobileViewer.zoomOut()} className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-300 hover:bg-slate-700" title="Zoom out"><ZoomOut size={14} /></button>
          <span className="text-slate-400 text-xs font-mono w-10 text-center tabular-nums">{Math.round(scale * 100)}%</span>
          <button onClick={() => mobileViewer.zoomIn()} className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-300 hover:bg-slate-700" title="Zoom in"><ZoomIn size={14} /></button>
        </div>

        {/* Rotate + Fullscreen — desktop only */}
        <div className="hidden md:flex items-center gap-0.5">
          <div className="h-5 w-px bg-slate-600 mx-0.5" />
          <button onClick={() => setRotation((r) => (r + 90) % 360)} className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-300 hover:bg-slate-700" title="Rotate 90°"><RotateCw size={14} /></button>
          <button onClick={toggleFullscreen} className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-300 hover:bg-slate-700">
            {isFullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
          </button>
        </div>

        {/* Markup tools — desktop only */}
        <div className="hidden md:flex items-center gap-0.5 bg-slate-700/60 rounded-xl px-1.5 py-1 ml-1">
          {(['text', 'arrow', 'rect', 'highlight', 'pen'] as ToolType[]).map((tool) => {
            const Icon = { text: Type, arrow: ArrowUpRight, rect: Square, highlight: Highlighter, pen: Pen }[tool];
            return (
              <button key={tool} onClick={() => setActiveTool((t) => t === tool ? 'none' : tool)}
                title={TOOL_LABELS[tool]}
                className={`p-1.5 rounded-lg transition-colors ${activeTool === tool ? 'bg-primary text-white' : 'text-slate-300 hover:bg-slate-600'}`}>
                <Icon size={13} />
              </button>
            );
          })}
        </div>

        <div className="hidden md:flex items-center gap-0.5 ml-0.5">
          <button onClick={clearMarkup} disabled={!markupItems.length}
            className="flex items-center gap-1 px-2 py-1.5 rounded-xl text-xs font-semibold text-slate-300 hover:bg-slate-700 disabled:opacity-30">
            <Trash2 size={12} /> Clear
          </button>
          <button onClick={() => void saveMarkup()} disabled={saving || !markupItems.length}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-primary hover:bg-violet-700 text-white text-xs font-bold disabled:opacity-40">
            {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
            Save Markup
          </button>
        </div>

        {/* Spacer */}
        <div className="flex-1" />

        <button onClick={onClose} className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-700 hover:text-white ml-0.5">
          <X size={17} />
        </button>
      </div>

      {saveMsg && (
        <div className={`px-4 py-2 text-xs font-semibold text-center shrink-0 ${saveMsg.startsWith('Error') ? 'bg-red-900/60 text-red-200' : 'bg-emerald-900/60 text-emerald-200'}`}>
          {saveMsg}
        </div>
      )}

      {activeTool !== 'none' && (
        <div className="hidden md:block px-4 py-1.5 bg-primary/20 border-b border-primary/30 text-xs text-violet-200 text-center shrink-0">
          <span className="font-bold">{TOOL_LABELS[activeTool]}</span> active — draw on the PDF. Press Esc to deselect.
        </div>
      )}

      {/* ── PDF area ─────────────────────────────────────────────────────────── */}
      <div
        ref={containerRef}
        className="viewer-canvas flex-1 overflow-auto flex justify-center items-start py-4 px-4 bg-slate-800"
        style={{
          ...mobileViewer.containerStyle,
          paddingBottom: 'max(1rem, env(safe-area-inset-bottom))',
          overflowX: 'clip',
        }}
        onWheel={(e) => {
          if (e.ctrlKey || e.metaKey) { e.preventDefault(); setScale((s) => Math.max(0.25, Math.min(5, s - e.deltaY * 0.002))); }
        }}
      >
        {pdfError ? (
          <div className="flex flex-col items-center gap-3 text-slate-400 mt-20">
            <X size={32} className="text-red-400" />
            <p className="text-sm">{pdfError}</p>
          </div>
        ) : (
          <div className="relative shadow-2xl inline-block">
            <Document file={fileUrl} onLoadSuccess={({ numPages: n }) => { setNumPages(n); setCurrentPage(1); }}
              onLoadError={(err) => setPdfError(err.message)}
              loading={<div className="flex items-center gap-3 text-slate-400 mt-20 justify-center"><Loader2 size={22} className="animate-spin text-primary" /><span className="text-sm">Loading drawing…</span></div>}>
              <Page pageNumber={currentPage} scale={scale} rotate={rotation}
                onLoadSuccess={handlePageLoad}
                renderTextLayer={false} renderAnnotationLayer={false} />
            </Document>
            {pageWidth > 0 && pageHeight > 0 && (
              <MarkupCanvas items={markupItems} currentPage={currentPage}
                pageWidth={pageWidth} pageHeight={pageHeight}
                activeTool={activeTool} onAddItem={(item) => setMarkupItems((p) => [...p, item])} />
            )}
          </div>
        )}
      </div>

      {/* ── Mobile floating toolbar (hidden on md+) ─────────────────────────── */}
      <MobileAnnotationFAB
        activeTool={activeTool}
        markupCount={markupItems.length}
        saving={saving}
        onToolChange={setActiveTool}
        onFit={() => mobileViewer.fitToScreen()}
        onRotate={() => setRotation((r) => (r + 90) % 360)}
        onSave={() => void saveMarkup()}
      />

      {/* Unsaved markup badge — desktop only */}
      {markupItems.length > 0 && (
        <div className="hidden md:block absolute bottom-4 right-4 bg-primary text-white text-xs font-bold px-3 py-1.5 rounded-full shadow-lg pointer-events-none">
          {markupItems.length} unsaved markup{markupItems.length !== 1 ? 's' : ''}
        </div>
      )}
    </div>
  );
}
