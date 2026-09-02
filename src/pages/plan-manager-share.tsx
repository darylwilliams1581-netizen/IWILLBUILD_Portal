/**
 * /plan-manager/share/:token — public view-only page for a shared drawing.
 * No login required. Renders PDF with annotations in read-only mode.
 */
import { useState, useEffect, useCallback } from 'react';
import { useParams } from "react-router";
import { Helmet } from '@dr.pogodin/react-helmet';
import { Document, Page, pdfjs } from 'react-pdf';
import 'react-pdf/dist/Page/AnnotationLayer.css';
import 'react-pdf/dist/Page/TextLayer.css';
import { ZoomIn, ZoomOut, ChevronLeft, ChevronRight, RotateCcw, RotateCw, Loader2, AlertCircle, Lock, Map } from 'lucide-react';
import AnnotationCanvas from '@/components/PlanManager/AnnotationCanvas';
import type { Annotation } from '@/components/PlanManager/types';
import { resolveNativeUrl } from '@/lib/native-url';

// react-pdf@10 bundles its own pdfjs-dist@5.4.296 — worker must match that version exactly.
// On Capacitor native the worker path must be absolute.
pdfjs.GlobalWorkerOptions.workerSrc = resolveNativeUrl('/pdf.worker.5.4.296.min.mjs');
interface ShareData {
  drawing: {
    id: number;
    title: string;
    source_file_path: string;
    source_file_name: string;
    page_count: number;
    revision_no: number;
    revision_name: string;
    locked: boolean;
  };
  annotations: Array<Record<string, unknown>>;
  scope: string;
  expiresAt: string;
}
const SCALE_STEPS = [0.5, 0.67, 0.75, 0.9, 1.0, 1.1, 1.25, 1.5, 1.75, 2.0, 2.5, 3.0];
function nextScale(current: number, dir: 1 | -1) {
  const idx = SCALE_STEPS.findIndex(s => s >= current);
  if (dir === 1) return SCALE_STEPS[Math.min(idx + 1, SCALE_STEPS.length - 1)];
  return SCALE_STEPS[Math.max(idx - 2, 0)];
}
export default function PlanManagerSharePage() {
  const {
    token
  } = useParams<{
    token: string;
  }>();
  const [data, setData] = useState<ShareData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [scale, setScale] = useState(1.0);
  const [rotation, setRotation] = useState(0);
  const [pageWidth, setPageWidth] = useState(0);
  const [pageHeight, setPageHeight] = useState(0);
  useEffect(() => {
    if (!token) return;
    fetch(`/api/plan-manager/share/validate?token=${token}`).then(r => r.json() as Promise<ShareData & {
      error?: string;
    }>).then(d => {
      if (d.error) {
        setError(d.error);
        return;
      }
      setData(d);
      setTotalPages(d.drawing.page_count || 1);
    }).catch(() => setError('Failed to load drawing')).finally(() => setLoading(false));
  }, [token]);

  // Group annotations by page
  const annotationsByPage = useCallback((pageNo: number): Annotation[] => {
    if (!data) return [];
    return data.annotations.filter(a => Number(a.page_no) === pageNo).map(a => ({
      id: String(a.id),
      dbId: a.id as number,
      type: a.type as Annotation['type'],
      pageNo: a.page_no as number,
      geometry: JSON.parse(String(a.geometry_json ?? '{}')),
      style: JSON.parse(String(a.style_json ?? '{}')),
      label: a.label as string | undefined,
      isLocked: true
    }));
  }, [data]);
  const scaledW = Math.round(pageWidth * scale);
  const scaledH = Math.round(pageHeight * scale);
  if (loading) {
    return <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="flex items-center gap-3 text-slate-400">
          <Loader2 size={24} className="animate-spin" />
          <span>Loading drawing…</span>
        </div>
      </div>;
  }
  if (error || !data) {
    return <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
        <div className="flex flex-col items-center gap-4 text-center max-w-sm">
          <AlertCircle size={40} className="text-red-400" />
          <h1 className="text-lg font-bold text-slate-100">Drawing Unavailable</h1>
          <p className="text-sm text-slate-400">{error ?? 'This link is invalid or has expired.'}</p>
        </div>
      </div>;
  }
  return <>
      <Helmet>
        <title>{data.drawing.title} — IWIIlBUILD Plan Manager</title>
        <meta name="description" content={`View-only shared drawing: ${data.drawing.title}`} />
        <link rel="canonical" href={`https://iwillbuild.com/plan-manager/share/${token}`} />
        <meta name="robots" content="noindex" />
      </Helmet>

      <div className="flex flex-col h-screen bg-slate-950 text-slate-100">
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 bg-slate-900 border-b border-slate-700 flex-shrink-0">
          <div className="w-8 h-8 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center">
            <Map size={15} className="text-indigo-400" />
          </div>
          <div className="min-w-0">
            <p className="text-sm font-bold text-slate-100 truncate">{data.drawing.title}</p>
            <div className="flex items-center gap-2 text-[10px] text-slate-500">
              <span>{data.drawing.revision_name} (Rev {data.drawing.revision_no})</span>
              {data.drawing.locked && <span className="flex items-center gap-1 text-amber-400">
                  <Lock size={9} /> Locked
                </span>}
              <span>·</span>
              <span>View only</span>
            </div>
          </div>

          <div className="flex-1" />

          {/* Viewer controls */}
          <div className="flex items-center gap-1">
            <button onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage <= 1} className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-100 hover:bg-slate-700 disabled:opacity-30 transition-colors">
              <ChevronLeft size={16} />
            </button>
            <span className="text-xs text-slate-300 min-w-[60px] text-center">{currentPage} / {totalPages}</span>
            <button onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage >= totalPages} className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-100 hover:bg-slate-700 disabled:opacity-30 transition-colors">
              <ChevronRight size={16} />
            </button>
            <div className="w-px h-5 bg-slate-700 mx-1" />
            <button onClick={() => setScale(s => nextScale(s, -1))} className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-100 hover:bg-slate-700 transition-colors">
              <ZoomOut size={14} />
            </button>
            <span className="text-xs text-slate-300 min-w-[44px] text-center">{Math.round(scale * 100)}%</span>
            <button onClick={() => setScale(s => nextScale(s, 1))} className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-100 hover:bg-slate-700 transition-colors">
              <ZoomIn size={14} />
            </button>
            <div className="w-px h-5 bg-slate-700 mx-1" />
            <button onClick={() => setRotation(r => (r - 90 + 360) % 360)} className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-100 hover:bg-slate-700 transition-colors">
              <RotateCcw size={14} />
            </button>
            <button onClick={() => setRotation(r => (r + 90) % 360)} className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-slate-100 hover:bg-slate-700 transition-colors">
              <RotateCw size={14} />
            </button>
          </div>
        </div>

        {/* PDF */}
        <div className="flex-1 overflow-auto bg-slate-950 flex justify-center p-6">
          <Document file={resolveNativeUrl(data.drawing.source_file_path)} onLoadSuccess={({
          numPages
        }) => setTotalPages(numPages)} loading={<div className="flex items-center gap-2 text-slate-400 mt-20">
                <Loader2 size={20} className="animate-spin" />
                <span className="text-sm">Loading PDF…</span>
              </div>}>
            <div className="relative inline-block shadow-2xl">
              <Page pageNumber={currentPage} scale={scale} rotate={rotation} onLoadSuccess={p => {
              setPageWidth(p.width);
              setPageHeight(p.height);
            }} renderAnnotationLayer={false} renderTextLayer={false} />
              {scaledW > 0 && scaledH > 0 && <AnnotationCanvas pageNo={currentPage} width={scaledW} height={scaledH} scale={scale} annotations={annotationsByPage(currentPage)} activeTool="select" activeStyle={{
              color: '#ef4444',
              strokeWidth: 2,
              opacity: 1
            }} isLocked={true} onAnnotationsChange={() => {}} />}
            </div>
          </Document>
        </div>

        {/* Footer */}
        <div className="px-4 py-2 bg-slate-900 border-t border-slate-700 text-[10px] text-slate-600 text-center flex-shrink-0">
          Shared via IWIIlBUILD Plan Manager · View only · Expires {new Date(data.expiresAt).toLocaleDateString('en-AU', {
          day: 'numeric',
          month: 'short',
          year: 'numeric'
        })}
        </div>
      </div>
    </>;
}
