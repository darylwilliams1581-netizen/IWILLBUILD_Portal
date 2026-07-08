/**
 * DrawingPdfViewer
 * Full-screen PDF viewer with zoom/pan/rotate/fit, page navigation,
 * markup tools (text, arrow, rect, highlight, pen), and markup save.
 */
import { useState, useRef, useEffect, useCallback } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';
import {
  X, ZoomIn, ZoomOut, RotateCw, Maximize2, Minimize2,
  ChevronLeft, ChevronRight, Save, Trash2, Loader2,
  Type, ArrowUpRight, Square, Highlighter, Pen,
} from 'lucide-react';

// Versioned filename forces cache-bust — must match installed pdfjs-dist version
pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.6.1.200.min.mjs';

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
  none: '#f97316', text: '#1e40af', arrow: '#dc2626',
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

export default function DrawingPdfViewer({ drawingId, fileUrl, title, onClose, onMarkupSaved }: Props) {
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

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') setActiveTool('none'); }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

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
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-900">
      {/* Top toolbar */}
      <div className="flex items-center gap-2 px-3 py-2 bg-slate-800 border-b border-slate-700 shrink-0 flex-wrap">
        <div className="flex items-center gap-2 mr-1 min-w-0">
          <div className="w-2 h-2 rounded-full bg-primary shrink-0" />
          <span className="text-white font-semibold text-sm truncate max-w-[180px]">{title}</span>
        </div>

        <div className="h-5 w-px bg-slate-600 mx-1" />

        {/* Page nav */}
        <div className="flex items-center gap-0.5">
          <button onClick={() => setCurrentPage((p) => Math.max(1, p - 1))} disabled={currentPage <= 1}
            className="p-1.5 rounded-lg text-slate-300 hover:bg-slate-700 disabled:opacity-30">
            <ChevronLeft size={15} />
          </button>
          <span className="text-slate-300 text-xs font-mono px-1 whitespace-nowrap">{currentPage} / {numPages || '—'}</span>
          <button onClick={() => setCurrentPage((p) => Math.min(numPages, p + 1))} disabled={currentPage >= numPages}
            className="p-1.5 rounded-lg text-slate-300 hover:bg-slate-700 disabled:opacity-30">
            <ChevronRight size={15} />
          </button>
        </div>

        <div className="h-5 w-px bg-slate-600 mx-1" />

        {/* Zoom */}
        <div className="flex items-center gap-0.5">
          <button onClick={() => setScale((s) => Math.max(0.25, s - 0.15))} className="p-1.5 rounded-lg text-slate-300 hover:bg-slate-700"><ZoomOut size={14} /></button>
          <span className="text-slate-400 text-xs font-mono w-11 text-center">{Math.round(scale * 100)}%</span>
          <button onClick={() => setScale((s) => Math.min(5, s + 0.15))} className="p-1.5 rounded-lg text-slate-300 hover:bg-slate-700"><ZoomIn size={14} /></button>
          <button onClick={fitToWidth} className="px-2 py-1 rounded-lg text-slate-300 hover:bg-slate-700 text-xs">Fit</button>
        </div>

        <div className="h-5 w-px bg-slate-600 mx-1" />

        <button onClick={() => setRotation((r) => (r + 90) % 360)} className="p-1.5 rounded-lg text-slate-300 hover:bg-slate-700" title="Rotate 90°"><RotateCw size={14} /></button>
        <button onClick={toggleFullscreen} className="p-1.5 rounded-lg text-slate-300 hover:bg-slate-700">
          {isFullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
        </button>

        <div className="flex-1" />

        {/* Markup tools */}
        <div className="flex items-center gap-0.5 bg-slate-700/60 rounded-xl px-1.5 py-1">
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

        <button onClick={clearMarkup} disabled={!markupItems.length}
          className="flex items-center gap-1 px-2 py-1.5 rounded-xl text-xs font-semibold text-slate-300 hover:bg-slate-700 disabled:opacity-30">
          <Trash2 size={12} /> Clear
        </button>

        <button onClick={() => void saveMarkup()} disabled={saving || !markupItems.length}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-primary hover:bg-orange-600 text-white text-xs font-bold disabled:opacity-40">
          {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
          Save Markup
        </button>

        <button onClick={onClose} className="p-1.5 rounded-lg text-slate-400 hover:bg-slate-700 hover:text-white ml-1"><X size={17} /></button>
      </div>

      {saveMsg && (
        <div className={`px-4 py-2 text-xs font-semibold text-center shrink-0 ${saveMsg.startsWith('Error') ? 'bg-red-900/60 text-red-200' : 'bg-emerald-900/60 text-emerald-200'}`}>
          {saveMsg}
        </div>
      )}

      {activeTool !== 'none' && (
        <div className="px-4 py-1.5 bg-primary/20 border-b border-primary/30 text-xs text-orange-200 text-center shrink-0">
          <span className="font-bold">{TOOL_LABELS[activeTool]}</span> active — draw on the PDF. Press Esc to deselect.
        </div>
      )}

      {/* PDF area */}
      <div ref={containerRef} className="flex-1 overflow-auto flex justify-center items-start py-6 px-4 bg-slate-800"
        onWheel={(e) => {
          if (e.ctrlKey || e.metaKey) { e.preventDefault(); setScale((s) => Math.max(0.25, Math.min(5, s - e.deltaY * 0.002))); }
        }}>
        {pdfError ? (
          <div className="flex flex-col items-center gap-3 text-slate-400 mt-20">
            <X size={32} className="text-red-400" />
            <p className="text-sm">{pdfError}</p>
          </div>
        ) : (
          <div className="relative shadow-2xl">
            <Document file={fileUrl} onLoadSuccess={({ numPages: n }) => { setNumPages(n); setCurrentPage(1); }}
              onLoadError={(err) => setPdfError(err.message)}
              loading={<div className="flex items-center gap-3 text-slate-400 mt-20 min-w-[400px] justify-center"><Loader2 size={22} className="animate-spin text-primary" /><span className="text-sm">Loading drawing…</span></div>}>
              <Page pageNumber={currentPage} scale={scale} rotate={rotation}
                onLoadSuccess={(page) => { setPageWidth(Math.round(page.width)); setPageHeight(Math.round(page.height)); }}
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

      {markupItems.length > 0 && (
        <div className="absolute bottom-4 right-4 bg-primary text-white text-xs font-bold px-3 py-1.5 rounded-full shadow-lg pointer-events-none">
          {markupItems.length} unsaved markup{markupItems.length !== 1 ? 's' : ''}
        </div>
      )}
    </div>
  );
}
