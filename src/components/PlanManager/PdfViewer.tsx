/**
 * PdfViewer — renders a PDF using react-pdf with zoom/rotate/page nav/thumbnail strip.
 * Overlays AnnotationCanvas on each page.
 *
 * Mobile (Sprint 5 — Gesture Viewer):
 * - useMobileViewer hook: two-finger pinch-zoom, double-tap toggle, body-scroll lock
 * - Fit-to-screen is the default open state on mobile (fitWidth=true on mount)
 * - "Reset zoom" added to the mobile "…" overflow menu
 * - Thumbnail strip hidden on mobile (< md)
 * - Rotate buttons hidden on mobile (in overflow menu)
 * - overflow-x: hidden on outer shell prevents sideways page scroll
 * - Safe-area bottom padding via env(safe-area-inset-bottom)
 * - Tested at 375 / 390 / 430 px viewport widths
 */
import { useState, useRef, useCallback, useEffect, type MouseEvent as ReactMouseEvent } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';
import {
  ZoomIn, ZoomOut, RotateCcw, RotateCw,
  ChevronLeft, ChevronRight, Maximize2, Minimize2,
  Loader2, AlertCircle, Shrink,
} from 'lucide-react';
import AnnotationCanvas from './AnnotationCanvas';
import type { Annotation, AnnotationStyle, ToolType } from './types';
import { useMobileViewer } from '@/lib/useMobileViewer';
import { resolveNativeUrl } from '@/lib/native-url';

// react-pdf@10 bundles its own pdfjs-dist@5.4.296 — worker must match that version exactly.
// On Capacitor native the worker path must be absolute (capacitor://localhost can't serve it).
pdfjs.GlobalWorkerOptions.workerSrc = resolveNativeUrl('/pdf.worker.5.4.296.min.mjs');

interface Props {
  fileUrl: string;
  currentPage: number;
  totalPages: number;
  scale: number;
  rotation: number;
  fitWidth: boolean;
  activeTool: ToolType;
  activeStyle: AnnotationStyle;
  isLocked: boolean;
  annotations: Map<number, Annotation[]>;
  undoTrigger: number;
  onPageChange: (page: number) => void;
  onScaleChange: (scale: number) => void;
  onRotate: (delta: 90 | -90) => void;
  onFitWidth: (fit: boolean) => void;
  onTotalPages: (n: number) => void;
  onAnnotationsChange: (pageNo: number, anns: Annotation[]) => void;
  onUndoAvailableChange: (available: boolean) => void;
}

const SCALE_STEPS = [0.25, 0.33, 0.5, 0.67, 0.75, 0.9, 1.0, 1.1, 1.25, 1.5, 1.75, 2.0, 2.5, 3.0, 4.0];

function nextScale(current: number, dir: 1 | -1) {
  const idx = SCALE_STEPS.findIndex(s => s >= current);
  if (dir === 1) return SCALE_STEPS[Math.min(idx + 1, SCALE_STEPS.length - 1)];
  return SCALE_STEPS[Math.max(idx - 2, 0)];
}

export default function PdfViewer({
  fileUrl, currentPage, totalPages, scale, rotation, fitWidth,
  activeTool, activeStyle, isLocked, annotations, undoTrigger,
  onPageChange, onScaleChange, onRotate, onFitWidth, onTotalPages,
  onAnnotationsChange, onUndoAvailableChange,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  // outerColRef observes the fixed-size column wrapper (not the scroll container)
  // so the ResizeObserver for fit-width only fires on true layout changes
  // (window resize, revision panel open/close) — not on PDF content overflow.
  const outerColRef = useRef<HTMLDivElement>(null);
  const [pageWidth, setPageWidth] = useState(0);
  const [pageHeight, setPageHeight] = useState(0);
  // Thumbnail strip: hidden on mobile by default, togglable on desktop
  const [thumbnailsOpen, setThumbnailsOpen] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  // ── Mobile gesture hook ────────────────────────────────────────────────────
  const mobileViewer = useMobileViewer({
    containerRef,
    scale,
    onScaleChange,
    onFitWidthOff: () => onFitWidth(false),
  });

  // ── Fit-to-screen on first page load (mobile default) ─────────────────────
  // On desktop fitWidth is already handled by the ResizeObserver below.
  // On mobile we trigger it once the first page dimensions are known.
  const fittedOnMount = useRef(false);

  // ── Fit-width: re-fit when the layout column resizes ──────────────────────
  // Observe outerColRef (the fixed-size flex column) NOT the scroll container.
  // The scroll container grows with content (minWidth: min-content), so
  // observing it creates a feedback loop: zoom in → container widens →
  // observer fires → scale recalculated → zoom in further.
  useEffect(() => {
    if (!fitWidth || !outerColRef.current) return;
    const obs = new ResizeObserver(() => {
      // Read available width from the scroll container's client width
      // (which is constrained by the outer column, not by content overflow).
      const w = containerRef.current?.clientWidth ?? 0;
      if (w > 0 && pageWidth > 0) {
        const padding = 48; // p-6 = 24px each side
        onScaleChange(Math.round(((w - padding) / pageWidth) * 100) / 100);
      }
    });
    obs.observe(outerColRef.current);
    return () => obs.disconnect();
  }, [fitWidth, pageWidth, onScaleChange]);

  const handleDocumentLoad = useCallback(({ numPages }: { numPages: number }) => {
    onTotalPages(numPages);
    setLoadError(null);
  }, [onTotalPages]);

  const handlePageLoad = useCallback((page: { width: number; height: number }) => {
    setPageWidth(page.width);
    setPageHeight(page.height);

    if (!containerRef.current) return;
    const containerW = containerRef.current.clientWidth;

    if (fitWidth && containerW > 0) {
      // Desktop fit-width
      const w = containerW - 48; // padding
      onScaleChange(Math.round((w / page.width) * 100) / 100);
    } else if (!fittedOnMount.current && containerW > 0 && containerW < 768) {
      // Mobile: auto-fit to screen on first load
      fittedOnMount.current = true;
      const w = containerW - 32; // 16px padding each side
      const fitted = Math.round((w / page.width) * 100) / 100;
      onScaleChange(Math.max(0.25, Math.min(4, fitted)));
      onFitWidth(true);
    }
  }, [fitWidth, onScaleChange, onFitWidth]);

  const scaledW = Math.round(pageWidth * scale);
  const scaledH = Math.round(pageHeight * scale);

  // ── Mouse drag-to-pan (desktop hand tool) ─────────────────────────────────
  const isPanTool = activeTool === 'pan';
  const panRef = useRef<{ startX: number; startY: number; scrollLeft: number; scrollTop: number } | null>(null);

  const handleMouseDown = useCallback((e: ReactMouseEvent<HTMLDivElement>) => {
    if (!isPanTool || e.button !== 0) return;
    const el = containerRef.current;
    if (!el) return;
    panRef.current = { startX: e.clientX, startY: e.clientY, scrollLeft: el.scrollLeft, scrollTop: el.scrollTop };
    el.style.cursor = 'grabbing';
    e.preventDefault();
  }, [isPanTool]);

  const handleMouseMove = useCallback((e: ReactMouseEvent<HTMLDivElement>) => {
    if (!panRef.current) return;
    const el = containerRef.current;
    if (!el) return;
    const dx = e.clientX - panRef.current.startX;
    const dy = e.clientY - panRef.current.startY;
    el.scrollLeft = panRef.current.scrollLeft - dx;
    el.scrollTop = panRef.current.scrollTop - dy;
  }, []);

  const handleMouseUp = useCallback(() => {
    if (!panRef.current) return;
    panRef.current = null;
    if (containerRef.current) containerRef.current.style.cursor = '';
  }, []);

  // Release pan if mouse leaves the container mid-drag
  const handleMouseLeave = useCallback(() => {
    if (panRef.current) {
      panRef.current = null;
      if (containerRef.current) containerRef.current.style.cursor = '';
    }
  }, []);

  return (
    // The viewer shell is fixed inset-0 so there's no risk of causing page scroll.
    // We need both axes free so the user can scroll/pan when zoomed in.
    <div className="flex flex-1 min-h-0 overflow-hidden">

      {/* Thumbnail strip — hidden on mobile (md: show) */}
      {thumbnailsOpen && (
        <div className="hidden md:flex w-24 flex-shrink-0 bg-slate-950 border-r border-slate-700 overflow-y-auto flex-col gap-2 p-2">
          <Document file={fileUrl} onLoadError={() => {}}>
            {Array.from({ length: totalPages }, (_, i) => i + 1).map(pg => (
              <button
                key={pg}
                onClick={() => onPageChange(pg)}
                className={[
                  'w-full rounded border-2 overflow-hidden transition-colors',
                  pg === currentPage ? 'border-violet-600' : 'border-transparent hover:border-slate-600',
                ].join(' ')}
              >
                <Page
                  pageNumber={pg}
                  width={80}
                  renderAnnotationLayer={false}
                  renderTextLayer={false}
                />
                <div className="text-center text-[10px] text-slate-500 py-0.5">{pg}</div>
              </button>
            ))}
          </Document>
        </div>
      )}

      {/* Main viewer */}
      <div className="flex flex-col flex-1 min-w-0">

        {/* Toolbar */}
        <div className="flex items-center gap-1 px-2 py-2 bg-slate-900 border-b border-slate-700 flex-shrink-0">

          {/* Thumbnail toggle — desktop only */}
          <button
            onClick={() => setThumbnailsOpen(s => !s)}
            title={thumbnailsOpen ? 'Hide thumbnails' : 'Show thumbnails'}
            className="hidden md:flex w-8 h-8 rounded-lg items-center justify-center text-slate-400 hover:text-slate-100 hover:bg-slate-700 transition-colors"
          >
            {thumbnailsOpen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
          </button>

          <div className="hidden md:block w-px h-5 bg-slate-700 mx-1" />

          {/* Page nav — always visible */}
          <button
            onClick={() => onPageChange(currentPage - 1)}
            disabled={currentPage <= 1}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-100 hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronLeft size={16} />
          </button>
          <span className="text-xs text-slate-300 min-w-[54px] text-center tabular-nums">
            {currentPage} / {totalPages}
          </span>
          <button
            onClick={() => onPageChange(currentPage + 1)}
            disabled={currentPage >= totalPages}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-100 hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronRight size={16} />
          </button>

          <div className="w-px h-5 bg-slate-700 mx-1" />

          {/* Zoom — always visible */}
          <button
            onClick={() => { mobileViewer.zoomOut(); }}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-100 hover:bg-slate-700 transition-colors"
            title="Zoom out"
          >
            <ZoomOut size={14} />
          </button>
          <button
            onClick={() => onFitWidth(!fitWidth)}
            className={[
              'px-2 h-8 rounded-lg text-xs font-mono transition-colors min-w-[46px] text-center',
              fitWidth ? 'bg-violet-500/20 text-violet-400' : 'text-slate-300 hover:bg-slate-700',
            ].join(' ')}
            title="Toggle fit-width"
          >
            {fitWidth ? 'Fit' : `${Math.round(scale * 100)}%`}
          </button>
          <button
            onClick={() => { mobileViewer.zoomIn(); }}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-100 hover:bg-slate-700 transition-colors"
            title="Zoom in"
          >
            <ZoomIn size={14} />
          </button>

          {/* Rotate — desktop only */}
          <div className="hidden md:flex items-center gap-1">
            <div className="w-px h-5 bg-slate-700 mx-1" />
            <button
              onClick={() => onRotate(-90)}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-100 hover:bg-slate-700 transition-colors"
              title="Rotate left"
            >
              <RotateCcw size={14} />
            </button>
            <button
              onClick={() => onRotate(90)}
              className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-100 hover:bg-slate-700 transition-colors"
              title="Rotate right"
            >
              <RotateCw size={14} />
            </button>
          </div>

          {/* Mobile-only: fit + reset + rotate inline in the same row */}
          <div className="md:hidden flex items-center gap-0.5 ml-0.5">
            <div className="w-px h-5 bg-slate-700 mx-0.5" />
            <button
              onClick={() => { mobileViewer.fitToScreen(); onFitWidth(true); }}
              title="Fit"
              className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${fitWidth ? 'text-violet-400 bg-violet-500/20' : 'text-slate-400 hover:text-slate-100 hover:bg-slate-700'}`}
            >
              <Shrink size={14} />
            </button>
            <button
              onClick={() => { mobileViewer.resetZoom(); onFitWidth(false); }}
              title="Reset"
              className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-100 hover:bg-slate-700 transition-colors"
            >
              <Maximize2 size={14} />
            </button>
            <div className="w-px h-5 bg-slate-700 mx-0.5" />
            <button
              onClick={() => onRotate(-90)}
              title="Rotate left"
              className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-100 hover:bg-slate-700 transition-colors"
            >
              <RotateCcw size={14} />
            </button>
            <button
              onClick={() => onRotate(90)}
              title="Rotate right"
              className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-100 hover:bg-slate-700 transition-colors"
            >
              <RotateCw size={14} />
            </button>
          </div>

          {/* Spacer */}
          <div className="flex-1" />
        </div>

        {/* PDF canvas area */}
        <div
          ref={containerRef}
          className="flex-1 overflow-auto bg-slate-950 p-4 md:p-6"
          style={{
            ...mobileViewer.containerStyle,
            // Safe-area bottom padding for iPhone home indicator
            paddingBottom: 'max(1rem, env(safe-area-inset-bottom))',
            // Hand tool: show grab cursor; inline style is overridden to grabbing on mousedown
            cursor: isPanTool ? 'grab' : undefined,
            // Use min-content sizing so the scroll container grows to fit the PDF
            // when zoomed in, rather than clipping it
            minWidth: 'min-content',
          }}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={handleMouseLeave}
        >
          {/* Inner wrapper centres the PDF when it's smaller than the container,
              but lets it overflow naturally when zoomed in */}
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'flex-start', minHeight: '100%' }}>
          {loadError ? (
            <div className="flex flex-col items-center justify-center gap-3 text-slate-400">
              <AlertCircle size={32} className="text-red-400" />
              <p className="text-sm">{loadError}</p>
            </div>
          ) : (
            <Document
              file={fileUrl}
              onLoadSuccess={handleDocumentLoad}
              onLoadError={(err) => setLoadError(err.message ?? 'Failed to load PDF')}
              loading={
                <div className="flex items-center gap-2 text-slate-400 mt-20">
                  <Loader2 size={20} className="animate-spin" />
                  <span className="text-sm">Loading PDF…</span>
                </div>
              }
            >
              <div className="relative inline-block shadow-2xl">
                <Page
                  pageNumber={currentPage}
                  scale={scale}
                  rotate={rotation}
                  onLoadSuccess={handlePageLoad}
                  renderAnnotationLayer={false}
                  renderTextLayer={false}
                />
                {/* Annotation overlay */}
                {scaledW > 0 && scaledH > 0 && (
                  <AnnotationCanvas
                    pageNo={currentPage}
                    width={scaledW}
                    height={scaledH}
                    scale={scale}
                    annotations={annotations.get(currentPage) ?? []}
                    activeTool={activeTool}
                    activeStyle={activeStyle}
                    isLocked={isLocked}
                    externalUndo={undoTrigger}
                    onAnnotationsChange={(anns) => onAnnotationsChange(currentPage, anns)}
                    onUndoAvailableChange={onUndoAvailableChange}
                  />
                )}
              </div>
            </Document>
          )}
          </div>
        </div>
      </div>
    </div>
  );
}
