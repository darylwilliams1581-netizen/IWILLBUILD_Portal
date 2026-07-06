/**
 * PdfViewer — renders a PDF using react-pdf with zoom/rotate/page nav/thumbnail strip.
 * Overlays AnnotationCanvas on each page.
 */
import React, { useState, useRef, useCallback, useEffect } from 'react';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';
import {
  ZoomIn, ZoomOut, RotateCcw, RotateCw,
  ChevronLeft, ChevronRight, Maximize2, Minimize2,
  Loader2, AlertCircle,
} from 'lucide-react';
import AnnotationCanvas from './AnnotationCanvas';
import type { Annotation, AnnotationStyle, ToolType } from './types';

// Use the bundled worker from pdfjs-dist
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  'pdfjs-dist/build/pdf.worker.min.mjs',
  import.meta.url,
).toString();

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
  onPageChange: (page: number) => void;
  onScaleChange: (scale: number) => void;
  onRotate: (delta: 90 | -90) => void;
  onFitWidth: (fit: boolean) => void;
  onTotalPages: (n: number) => void;
  onAnnotationsChange: (pageNo: number, anns: Annotation[]) => void;
}

const SCALE_STEPS = [0.25, 0.33, 0.5, 0.67, 0.75, 0.9, 1.0, 1.1, 1.25, 1.5, 1.75, 2.0, 2.5, 3.0, 4.0];

function nextScale(current: number, dir: 1 | -1) {
  const idx = SCALE_STEPS.findIndex(s => s >= current);
  if (dir === 1) return SCALE_STEPS[Math.min(idx + 1, SCALE_STEPS.length - 1)];
  return SCALE_STEPS[Math.max(idx - 2, 0)];
}

export default function PdfViewer({
  fileUrl, currentPage, totalPages, scale, rotation, fitWidth,
  activeTool, activeStyle, isLocked, annotations,
  onPageChange, onScaleChange, onRotate, onFitWidth, onTotalPages, onAnnotationsChange,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [pageWidth, setPageWidth] = useState(0);
  const [pageHeight, setPageHeight] = useState(0);
  const [thumbnailsOpen, setThumbnailsOpen] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Fit-width: measure container and set scale accordingly
  useEffect(() => {
    if (!fitWidth || !containerRef.current) return;
    const obs = new ResizeObserver(entries => {
      const w = entries[0]?.contentRect.width ?? 0;
      if (w > 0 && pageWidth > 0) {
        onScaleChange(Math.round((w / pageWidth) * 100) / 100);
      }
    });
    obs.observe(containerRef.current);
    return () => obs.disconnect();
  }, [fitWidth, pageWidth, onScaleChange]);

  const handleDocumentLoad = useCallback(({ numPages }: { numPages: number }) => {
    onTotalPages(numPages);
    setLoadError(null);
  }, [onTotalPages]);

  const handlePageLoad = useCallback((page: { width: number; height: number }) => {
    setPageWidth(page.width);
    setPageHeight(page.height);
    if (fitWidth && containerRef.current) {
      const w = containerRef.current.clientWidth - 48; // padding
      onScaleChange(Math.round((w / page.width) * 100) / 100);
    }
  }, [fitWidth, onScaleChange]);

  const scaledW = Math.round(pageWidth * scale);
  const scaledH = Math.round(pageHeight * scale);

  return (
    <div className="flex flex-1 min-h-0 overflow-hidden">
      {/* Thumbnail strip */}
      {thumbnailsOpen && (
        <div className="w-24 flex-shrink-0 bg-slate-950 border-r border-slate-700 overflow-y-auto flex flex-col gap-2 p-2">
          <Document file={fileUrl} onLoadError={() => {}}>
            {Array.from({ length: totalPages }, (_, i) => i + 1).map(pg => (
              <button
                key={pg}
                onClick={() => onPageChange(pg)}
                className={[
                  'w-full rounded border-2 overflow-hidden transition-colors',
                  pg === currentPage ? 'border-orange-500' : 'border-transparent hover:border-slate-600',
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
        <div className="flex items-center gap-1 px-3 py-2 bg-slate-900 border-b border-slate-700 flex-shrink-0">
          {/* Thumbnail toggle */}
          <button
            onClick={() => setThumbnailsOpen(s => !s)}
            title={thumbnailsOpen ? 'Hide thumbnails' : 'Show thumbnails'}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-100 hover:bg-slate-700 transition-colors"
          >
            {thumbnailsOpen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
          </button>

          <div className="w-px h-5 bg-slate-700 mx-1" />

          {/* Page nav */}
          <button
            onClick={() => onPageChange(currentPage - 1)}
            disabled={currentPage <= 1}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-100 hover:bg-slate-700 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronLeft size={16} />
          </button>
          <span className="text-xs text-slate-300 min-w-[70px] text-center">
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

          {/* Zoom */}
          <button
            onClick={() => { onScaleChange(nextScale(scale, -1)); onFitWidth(false); }}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-100 hover:bg-slate-700 transition-colors"
          >
            <ZoomOut size={14} />
          </button>
          <button
            onClick={() => onFitWidth(!fitWidth)}
            className={[
              'px-2 h-8 rounded-lg text-xs font-mono transition-colors min-w-[52px] text-center',
              fitWidth ? 'bg-orange-500/20 text-orange-400' : 'text-slate-300 hover:bg-slate-700',
            ].join(' ')}
            title="Toggle fit-width"
          >
            {fitWidth ? 'Fit' : `${Math.round(scale * 100)}%`}
          </button>
          <button
            onClick={() => { onScaleChange(nextScale(scale, 1)); onFitWidth(false); }}
            className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-100 hover:bg-slate-700 transition-colors"
          >
            <ZoomIn size={14} />
          </button>

          <div className="w-px h-5 bg-slate-700 mx-1" />

          {/* Rotate */}
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

        {/* PDF canvas area */}
        <div ref={containerRef} className="flex-1 overflow-auto bg-slate-950 flex justify-center p-6">
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
                    onAnnotationsChange={(anns) => onAnnotationsChange(currentPage, anns)}
                  />
                )}
              </div>
            </Document>
          )}
        </div>
      </div>
    </div>
  );
}
