/**
 * PdfPageBlock — Studio canvas renderer for imported PDF pages.
 *
 * Architecture:
 * - Uses pdfjs-dist v4 (bundled in package.json) directly — no react-pdf.
 * - Worker is served from /pdf.worker.min.mjs (already in public/).
 * - One PDF document is loaded per unique fetchUrl and shared across all
 *   blocks that reference the same source via a module-level WeakRef cache.
 * - Each block renders its own page onto a <canvas> element.
 * - Lazy rendering: IntersectionObserver defers off-screen pages.
 * - Print: canvas is converted to a data-URL image so the browser can
 *   print it reliably (canvas elements are often blank in print).
 * - Temporary object URLs are revoked immediately after use.
 * - No blob: or object: URLs are ever stored in block JSON.
 *
 * States: loading skeleton → rendered page | error + Retry + Download
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import { FileText, RefreshCw, Download, AlertCircle } from 'lucide-react';
import type { PdfPageBlock } from '../types';

// ── PDF.js worker setup ───────────────────────────────────────────────────────
// Imported lazily so SSR build (which stubs pdfjs-dist) never executes this.
// The worker file is already in public/ as pdf.worker.min.mjs.

let pdfjsLib: typeof import('pdfjs-dist') | null = null;
let pdfjsInitialised = false;

async function getPdfjs() {
  if (pdfjsLib) return pdfjsLib;
  const lib = await import('pdfjs-dist');
  if (!pdfjsInitialised) {
    lib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
    pdfjsInitialised = true;
  }
  pdfjsLib = lib;
  return lib;
}

// ── Shared document cache ─────────────────────────────────────────────────────
// Key: the authenticated fetch URL (templateId-based, not storageKey).
// Value: the resolved PDFDocumentProxy promise.
// Using a plain Map (module-level singleton) — entries are never evicted
// within a session, which is acceptable for document builder usage.

const docCache = new Map<string, Promise<import('pdfjs-dist').PDFDocumentProxy>>();

function getCachedDoc(
  fetchUrl: string,
  withCredentials: boolean,
): Promise<import('pdfjs-dist').PDFDocumentProxy> {
  const existing = docCache.get(fetchUrl);
  if (existing) return existing;

  const promise = getPdfjs().then((lib) =>
    lib.getDocument({
      url: fetchUrl,
      withCredentials,
    }).promise
  );
  docCache.set(fetchUrl, promise);
  // If the load fails, remove from cache so a retry can re-fetch
  promise.catch(() => docCache.delete(fetchUrl));
  return promise;
}

// ── Print image cache ─────────────────────────────────────────────────────────
// Maps "fetchUrl:pageIndex" → data URL for print. Populated on render,
// cleared when the component unmounts. Never stored in block JSON.

const printImageCache = new Map<string, string>();

// ── Types ─────────────────────────────────────────────────────────────────────

type RenderState = 'idle' | 'loading' | 'rendered' | 'error';

interface Props {
  block: PdfPageBlock;
  /** templateId used to build the auth-gated fetch URL */
  templateId?: number | string;
  /** Whether this is a print preview render (renders immediately, no lazy) */
  forPrint?: boolean;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function buildFetchUrl(block: PdfPageBlock, templateId?: number | string): string {
  // Prefer the auth-gated proxy endpoint when we have a templateId.
  // Fall back to the public downloadUrl stored on the block (legacy / tests).
  if (templateId) {
    return `/api/document-templates/${templateId}/pdf-bytes`;
  }
  return block.downloadUrl ?? `/airo-assets/uploads/pdf-imports/${block.storageKey}`;
}

// ── Main component ────────────────────────────────────────────────────────────

export default function PdfPageBlockView({ block, templateId, forPrint = false }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<RenderState>('idle');
  const [errorMsg, setErrorMsg] = useState('');
  const [retryCount, setRetryCount] = useState(0);
  const [aspectRatio, setAspectRatio] = useState<number>(1.414); // A4 default
  const printKeyRef = useRef('');

  const fetchUrl = buildFetchUrl(block, templateId);
  const printCacheKey = `${fetchUrl}:${block.pageIndex}`;

  // ── Render one page onto the canvas ────────────────────────────────────────

  const renderPage = useCallback(async () => {
    setState('loading');
    setErrorMsg('');

    try {
      const pdfDoc = await getCachedDoc(fetchUrl, !!templateId);
      // pageNumber is 1-based in PDF.js; block.pageIndex is 0-based
      const pageNum = block.pageIndex + 1;
      if (pageNum < 1 || pageNum > pdfDoc.numPages) {
        throw new Error(`Page ${pageNum} out of range (PDF has ${pdfDoc.numPages} pages)`);
      }

      const page = await pdfDoc.getPage(pageNum);
      const canvas = canvasRef.current;
      if (!canvas) return; // unmounted

      // Fit to container width, respect device pixel ratio
      const containerWidth = canvas.parentElement?.clientWidth ?? 794; // A4 ~794px
      const viewport = page.getViewport({ scale: 1 });
      const scale = (containerWidth / viewport.width) * (window.devicePixelRatio ?? 1);
      const scaledViewport = page.getViewport({ scale });

      canvas.width = scaledViewport.width;
      canvas.height = scaledViewport.height;
      canvas.style.width = `${scaledViewport.width / (window.devicePixelRatio ?? 1)}px`;
      canvas.style.height = `${scaledViewport.height / (window.devicePixelRatio ?? 1)}px`;

      setAspectRatio(viewport.height / viewport.width);

      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas 2D context unavailable');

      await page.render({ canvasContext: ctx, viewport: scaledViewport }).promise;

      // Cache a data URL for print (canvas → image avoids blank-canvas print bug)
      const dataUrl = canvas.toDataURL('image/png');
      printImageCache.set(printCacheKey, dataUrl);
      printKeyRef.current = printCacheKey;

      setState('rendered');
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error('[PdfPageBlock] render error:', msg);
      setErrorMsg(msg);
      setState('error');
    }
  }, [fetchUrl, block.pageIndex, templateId, printCacheKey]);

  // ── Lazy rendering via IntersectionObserver ────────────────────────────────

  useEffect(() => {
    if (forPrint) {
      // Print mode: render immediately, no lazy
      renderPage();
      return;
    }

    const el = containerRef.current;
    if (!el) return;

    // If already in viewport on mount, render immediately
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          observer.disconnect();
          renderPage();
        }
      },
      { rootMargin: '200px' }, // pre-render 200px before entering viewport
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [renderPage, forPrint, retryCount]); // retryCount forces re-observe on retry

  // ── Cleanup print cache on unmount ─────────────────────────────────────────

  useEffect(() => {
    return () => {
      if (printKeyRef.current) {
        printImageCache.delete(printKeyRef.current);
      }
    };
  }, []);

  // ── Download link ──────────────────────────────────────────────────────────

  const downloadUrl = block.downloadUrl
    ?? (templateId ? `/api/document-templates/${templateId}/source-document/download` : undefined);

  // ── Render ─────────────────────────────────────────────────────────────────

  const printDataUrl = printImageCache.get(printCacheKey);

  return (
    <div
      ref={containerRef}
      className="pdf-page-block relative w-full overflow-hidden"
      data-testid="pdf-page-block"
      data-page-index={block.pageIndex}
      data-storage-key={block.storageKey}
      style={{ aspectRatio: state === 'rendered' ? undefined : `1 / ${aspectRatio}` }}
    >
      {/* ── Loading skeleton ── */}
      {state === 'idle' || state === 'loading' ? (
        <div
          className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-slate-50 animate-pulse"
          aria-label="Loading PDF page"
          role="status"
        >
          <FileText size={28} className="text-slate-300" />
          <p className="text-xs text-slate-400">
            {block.sourceFileName} — Page {block.pageNumber} of {block.totalPages}
          </p>
          <p className="text-[10px] text-slate-300">Loading…</p>
        </div>
      ) : null}

      {/* ── Error state ── */}
      {state === 'error' ? (
        <div
          className="absolute inset-0 flex flex-col items-center justify-center gap-2 bg-red-50 px-4 text-center"
          role="alert"
        >
          <AlertCircle size={24} className="text-red-400" />
          <p className="text-xs font-semibold text-red-600">
            {block.sourceFileName} — Page {block.pageNumber} of {block.totalPages}
          </p>
          <p className="text-[10px] text-red-500 max-w-xs">{errorMsg || 'Failed to render PDF page.'}</p>
          <div className="flex items-center gap-2 mt-1">
            <button
              type="button"
              onClick={() => setRetryCount((n) => n + 1)}
              className="flex items-center gap-1 px-2 py-1 rounded text-[10px] bg-red-100 hover:bg-red-200 text-red-700 transition-colors"
            >
              <RefreshCw size={10} /> Retry
            </button>
            {downloadUrl && (
              <a
                href={downloadUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 px-2 py-1 rounded text-[10px] bg-slate-100 hover:bg-slate-200 text-slate-600 transition-colors"
              >
                <Download size={10} /> Download PDF
              </a>
            )}
          </div>
        </div>
      ) : null}

      {/* ── Canvas (visible when rendered) ── */}
      <canvas
        ref={canvasRef}
        className={`block w-full h-auto ${state === 'rendered' ? 'opacity-100' : 'opacity-0 absolute inset-0'}`}
        aria-label={`${block.sourceFileName} page ${block.pageNumber}`}
        role="img"
      />

      {/* ── Print image (hidden on screen, visible only in @media print) ── */}
      {printDataUrl && (
        <img
          src={printDataUrl}
          alt={`${block.sourceFileName} page ${block.pageNumber}`}
          className="pdf-print-image hidden print:block w-full h-auto"
          style={{ pageBreakBefore: block.pageIndex === 0 ? 'auto' : 'always' }}
        />
      )}

      {/* ── Download link (shown below rendered page) ── */}
      {state === 'rendered' && downloadUrl && (
        <div className="flex justify-end px-1 pt-0.5 pb-1 studio-no-print">
          <a
            href={downloadUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1 text-[10px] text-slate-400 hover:text-primary transition-colors"
          >
            <Download size={9} /> Download original PDF
          </a>
        </div>
      )}
    </div>
  );
}

// ── Print readiness helper ────────────────────────────────────────────────────
// Called by the print trigger to wait until all visible pdf_page blocks
// have rendered their print images. Returns a promise that resolves when
// all blocks are ready (or after a 10 s timeout).

export function waitForPdfPagesReady(timeoutMs = 10_000): Promise<void> {
  return new Promise((resolve) => {
    const deadline = Date.now() + timeoutMs;

    function check() {
      const blocks = document.querySelectorAll('[data-testid="pdf-page-block"]');
      const allReady = Array.from(blocks).every((el) => {
        const key = `${el.getAttribute('data-storage-key') ?? ''}:${el.getAttribute('data-page-index') ?? ''}`;
        return printImageCache.has(key);
      });

      if (allReady || Date.now() >= deadline) {
        resolve();
      } else {
        requestAnimationFrame(check);
      }
    }

    check();
  });
}

// ── Export cache for tests ────────────────────────────────────────────────────
export { docCache as _docCache, printImageCache as _printImageCache };
