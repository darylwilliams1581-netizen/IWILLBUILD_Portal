/**
 * HtmlDocumentCanvas
 * ──────────────────
 * Renders an imported DOCX document as a directly-editable HTML canvas.
 *
 * Architecture
 * ────────────
 * • The canvas root div is contentEditable="true" so typing, selection,
 *   paste, image selection, and keyboard navigation all work natively.
 * • innerHTML is set ONCE at mount via a ref callback — never via
 *   dangerouslySetInnerHTML on a contentEditable, which would reset the
 *   cursor on every React render.
 * • Subsequent edits are live DOM mutations; React never touches the
 *   canvas interior again.
 * • On blur the canvas is serialised via serialiseCanvas() (which strips
 *   injected row-control nodes and contentEditable attributes) and saved
 *   via PATCH /api/document-templates/:id.
 * • Table rows expose compact Add / Delete controls injected as
 *   non-serialised DOM overlays (contentEditable="false", stripped on
 *   serialise). Add clones the row and clears cell text; Delete removes
 *   the row with a minimum-1-row guard. Both preserve colspan/rowspan.
 * • Scoped CSS (import_css) is injected as a <style> tag keyed to the
 *   document id — never leaks into surrounding UI.
 * • Print styles and page-break divs are handled inside the scoped CSS.
 * • An import-report banner is shown only when dropped/approximated items
 *   exist (hadUnsupported or warnings.length > 0).
 *
 * Cursor / scroll stability
 * ─────────────────────────
 * • The ref callback is memoised on templateId only — it does NOT re-run
 *   when htmlContent changes after mount, so React never replaces the DOM.
 * • The canvas root carries data-doc-id so the scoped CSS selector
 *   .studio-doc[data-doc-id="<id>"] matches correctly.
 * • Row-control mousedown calls e.preventDefault() to prevent blurring
 *   the active cell before the mutation fires.
 */

import { useRef, useEffect, useCallback, useState } from 'react';
import {
  AlertTriangle, ChevronDown, ChevronUp, X,
  FileText, Image as ImageIcon, LayoutGrid, AlertCircle,
  Loader2, CheckCircle,
} from 'lucide-react';
import type { ImportReport } from './types';

// ─── Public API ───────────────────────────────────────────────────────────────

export interface HtmlDocumentCanvasProps {
  templateId: number;
  htmlContent: string;
  importCss: string;
  importReport: ImportReport | null;
  /** 'build' = editable; 'preview' / 'use' = read-only */
  mode: 'build' | 'preview' | 'use';
  /** Called after a successful auto-save with the clean serialised HTML */
  onSaved?: (html: string) => void;
  /** Zoom level 50–150 (default 100) */
  zoom?: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const STYLE_TAG_ID_PREFIX = 'html-canvas-css-';
const ROW_CTRL_CLASS = 'html-canvas-row-controls';
const ROW_BTN_CLASS  = 'html-canvas-row-btn';

// ─── Component ────────────────────────────────────────────────────────────────

export default function HtmlDocumentCanvas({
  templateId,
  htmlContent,
  importCss,
  importReport,
  mode,
  onSaved,
  zoom = 100,
}: HtmlDocumentCanvasProps) {
  const canvasRef  = useRef<HTMLDivElement>(null);
  const isDirtyRef = useRef(false);
  const isSaving   = useRef(false);

  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [saveError,  setSaveError]  = useState('');
  const [reportOpen,      setReportOpen]      = useState(false);
  const [reportDismissed, setReportDismissed] = useState(false);

  const isEditable = mode === 'build';

  // ── Inject / update scoped CSS ─────────────────────────────────────────────
  useEffect(() => {
    const id = `${STYLE_TAG_ID_PREFIX}${templateId}`;
    let tag = document.getElementById(id) as HTMLStyleElement | null;
    if (!tag) {
      tag = document.createElement('style');
      tag.id = id;
      document.head.appendChild(tag);
    }
    // Prepend print / page-break support inside the scoped selector
    tag.textContent = buildScopedStyles(String(templateId), importCss ?? '');
  }, [templateId, importCss]);

  // ── Mount: set innerHTML once, wire editability ────────────────────────────
  // Memoised on templateId only — does NOT re-run when htmlContent changes
  // after mount, so React never replaces the live DOM.
  const mountCanvas = useCallback(
    (el: HTMLDivElement | null) => {
      if (!el) return;
      (canvasRef as React.MutableRefObject<HTMLDivElement | null>).current = el;
      el.innerHTML = htmlContent ?? '';
      if (isEditable) {
        attachRowControls(el, () => { isDirtyRef.current = true; });
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [templateId, isEditable],
  );

  // ── Dirty flag ────────────────────────────────────────────────────────────
  const handleInput = useCallback(() => {
    isDirtyRef.current = true;
  }, []);

  // ── Save on blur ──────────────────────────────────────────────────────────
  // Uses serialiseCanvas() to strip row-control nodes before sending.
  const handleBlur = useCallback(
    async (e: React.FocusEvent<HTMLDivElement>) => {
      // Ignore blur events that stay inside the canvas (e.g. clicking a row btn)
      const related = e.relatedTarget as Node | null;
      if (related && e.currentTarget.contains(related)) return;

      if (!isDirtyRef.current || isSaving.current || !isEditable) return;
      const canvas = canvasRef.current;
      if (!canvas) return;

      const html = serialiseCanvas(canvas);
      isDirtyRef.current = false;
      isSaving.current   = true;
      setSaveStatus('saving');

      try {
        const res = await fetch(`/api/document-templates/${templateId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify({ htmlContent: html }),
        });
        const data = await res.json() as { ok?: boolean; error?: string };
        if (!res.ok || data.error) throw new Error(data.error ?? `HTTP ${res.status}`);
        setSaveStatus('saved');
        setSaveError('');
        onSaved?.(html);
        setTimeout(() => setSaveStatus('idle'), 2000);
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Save failed';
        setSaveError(msg);
        setSaveStatus('error');
        isDirtyRef.current = true; // allow retry on next blur
        setTimeout(() => setSaveStatus('idle'), 4000);
      } finally {
        isSaving.current = false;
      }
    },
    [templateId, isEditable, onSaved],
  );

  // ── Report banner visibility ───────────────────────────────────────────────
  const hasReport =
    !reportDismissed &&
    importReport != null &&
    (importReport.hadUnsupported || importReport.warnings.length > 0);

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="flex-1 flex flex-col min-h-0 bg-slate-100 overflow-hidden">

      {/* ── Save status strip ─────────────────────────────────────────────── */}
      {saveStatus !== 'idle' && (
        <div
          role="status"
          aria-live="polite"
          className={`flex items-center gap-2 px-4 py-1.5 text-xs font-medium flex-shrink-0 ${
            saveStatus === 'saving' ? 'bg-amber-50 text-amber-700 border-b border-amber-200'
            : saveStatus === 'saved' ? 'bg-emerald-50 text-emerald-700 border-b border-emerald-200'
            : 'bg-red-50 text-red-700 border-b border-red-200'
          }`}
        >
          {saveStatus === 'saving' && <Loader2 size={12} className="animate-spin" aria-hidden />}
          {saveStatus === 'saved'  && <CheckCircle size={12} aria-hidden />}
          {saveStatus === 'error'  && <AlertCircle size={12} aria-hidden />}
          {saveStatus === 'saving' ? 'Saving…'
           : saveStatus === 'saved' ? 'Saved'
           : `Save failed: ${saveError}`}
        </div>
      )}

      {/* ── Import report banner ──────────────────────────────────────────── */}
      {hasReport && importReport && (
        <div
          data-testid="import-report-banner"
          className="flex-shrink-0 bg-amber-50 border-b border-amber-200"
        >
          <div className="flex items-center gap-2 px-4 py-2">
            <AlertTriangle size={13} className="text-amber-600 flex-shrink-0" aria-hidden />
            <span className="text-xs font-semibold text-amber-800 flex-1">
              Import report
              {importReport.imageCount > 0 &&
                ` · ${importReport.imageCount} image${importReport.imageCount !== 1 ? 's' : ''}`}
              {importReport.pageBreakCount > 0 &&
                ` · ${importReport.pageBreakCount} page break${importReport.pageBreakCount !== 1 ? 's' : ''}`}
              {importReport.hadUnsupported &&
                ' · some unsupported constructs were dropped'}
            </span>
            <div className="flex items-center gap-1">
              {importReport.warnings.length > 0 && (
                <button
                  type="button"
                  onClick={() => setReportOpen((v) => !v)}
                  className="flex items-center gap-1 px-2 py-0.5 rounded text-[11px] text-amber-700 hover:bg-amber-100 transition-colors"
                  aria-expanded={reportOpen}
                >
                  {reportOpen
                    ? <ChevronUp size={11} aria-hidden />
                    : <ChevronDown size={11} aria-hidden />}
                  {importReport.warnings.length} warning{importReport.warnings.length !== 1 ? 's' : ''}
                </button>
              )}
              <button
                type="button"
                onClick={() => setReportDismissed(true)}
                className="w-5 h-5 flex items-center justify-center rounded text-amber-500 hover:text-amber-800 hover:bg-amber-100 transition-colors"
                aria-label="Dismiss import report"
              >
                <X size={11} aria-hidden />
              </button>
            </div>
          </div>

          {/* Expanded warnings list */}
          {reportOpen && importReport.warnings.length > 0 && (
            <div className="px-4 pb-3 flex flex-col gap-1">
              {importReport.warnings.map((w, i) => (
                <div key={i} className="flex items-start gap-2 text-[11px] text-amber-700">
                  <span className="mt-0.5 flex-shrink-0" aria-hidden>•</span>
                  <span>{w}</span>
                </div>
              ))}
            </div>
          )}

          {/* Stats row */}
          {(importReport.imageCount > 0 || importReport.pageBreakCount > 0 || importReport.messageCount > 0) && (
            <div className="flex items-center gap-4 px-4 pb-2">
              {importReport.imageCount > 0 && (
                <span className="flex items-center gap-1 text-[11px] text-amber-600">
                  <ImageIcon size={11} aria-hidden />
                  {importReport.imageCount} image{importReport.imageCount !== 1 ? 's' : ''} extracted
                </span>
              )}
              {importReport.pageBreakCount > 0 && (
                <span className="flex items-center gap-1 text-[11px] text-amber-600">
                  <LayoutGrid size={11} aria-hidden />
                  {importReport.pageBreakCount} page break{importReport.pageBreakCount !== 1 ? 's' : ''}
                </span>
              )}
              {importReport.messageCount > 0 && (
                <span className="flex items-center gap-1 text-[11px] text-amber-600">
                  <FileText size={11} aria-hidden />
                  {importReport.messageCount} converter message{importReport.messageCount !== 1 ? 's' : ''}
                </span>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Scrollable canvas area ────────────────────────────────────────── */}
      <div className="flex-1 overflow-auto py-8 px-4" data-testid="canvas-scroll">
        {/*
         * Canvas page dimensions mirror A4 at 96 dpi (794 × 1123 px).
         * Padding is reduced to ~7 mm (26 px) so the visible canvas margins
         * are tight and consistent with the 8 mm print margins.
         * The .studio-doc root fills the full padded width so imported
         * content never overflows horizontally.
         */}
        <div
          className="mx-auto bg-white shadow-lg rounded-sm"
          style={{
            width:     `${Math.round(794  * zoom / 100)}px`,
            minHeight: `${Math.round(1123 * zoom / 100)}px`,
            padding:   `${Math.round(26   * zoom / 100)}px`,
          }}
        >
          {/*
           * The canvas root is contentEditable so typing, selection, paste,
           * image selection, and keyboard navigation all work natively.
           * innerHTML is set once at mount via the ref callback — React never
           * touches this element's children again.
           */}
          <div
            ref={mountCanvas}
            className={`studio-doc outline-none${isEditable ? ' html-canvas-editable' : ''}`}
            data-doc-id={String(templateId)}
            data-testid="html-canvas-root"
            contentEditable={isEditable ? 'true' : undefined}
            suppressContentEditableWarning
            onInput={handleInput}
            onBlur={handleBlur}
            spellCheck={false}
          />
        </div>
      </div>

      {/* ── Editable mode hint ────────────────────────────────────────────── */}
      {isEditable && (
        <div className="flex-shrink-0 flex items-center gap-2 px-4 py-1.5 bg-white border-t border-slate-200 text-[11px] text-slate-400">
          <span>
            Click to edit · Use row controls to add or remove rows · Changes save automatically on blur
          </span>
        </div>
      )}
    </div>
  );
}

// ─── Scoped styles builder ────────────────────────────────────────────────────

/**
 * Prepend print / page-break rules inside the document's scoped selector,
 * then append the import_css from the converter.
 * All rules are scoped to .studio-doc[data-doc-id="<id>"] so they never
 * leak into surrounding UI.
 *
 * Layout goals
 * ────────────
 * • Canvas: ~7 mm visible margins (padding set on the wrapper div).
 * • Print:  8 mm @page margins; row controls and Studio chrome hidden.
 * • Tables: fluid width (max-width: 100%), cells word-wrap, no fixed
 *   widths that cause horizontal clipping.
 * • Images / banners: max-width: 100%, height: auto.
 * • box-sizing: border-box on everything inside the scope so padding
 *   never pushes content outside the printable width.
 */
function buildScopedStyles(docId: string, importCss: string): string {
  const scope = `.studio-doc[data-doc-id="${docId}"]`;

  // ── Base layout rules (canvas + print) ────────────────────────────────────
  const baseRules = `
/* ── box-sizing reset inside canvas ─────────────────────────────────────── */
${scope}, ${scope} * {
  box-sizing: border-box;
}

/* ── constrain all block-level and replaced content ─────────────────────── */
${scope} img,
${scope} figure,
${scope} svg,
${scope} video,
${scope} canvas,
${scope} .banner,
${scope} [class*="banner"],
${scope} [class*="header-image"],
${scope} [class*="logo"] {
  max-width: 100%;
  height: auto;
}

/* ── tables: fluid, no fixed widths, cells wrap ─────────────────────────── */
${scope} table {
  width: 100%;
  max-width: 100%;
  table-layout: auto;
  border-collapse: collapse;
  /* strip any fixed min-width injected by the converter */
  min-width: 0 !important;
}
${scope} table[style*="width"] {
  /* override inline fixed widths from DOCX converter */
  width: 100% !important;
  max-width: 100% !important;
}
${scope} col[style*="width"],
${scope} colgroup col {
  /* allow columns to flex rather than enforce DOCX pixel widths */
  width: auto !important;
}
${scope} td,
${scope} th {
  word-break: break-word;
  overflow-wrap: break-word;
  /* remove any min-width that forces horizontal scroll */
  min-width: 0 !important;
  max-width: none;
}

/* ── page-break divs ─────────────────────────────────────────────────────── */
${scope} .page-break {
  border: none;
  border-top: 2px dashed #cbd5e1;
  margin: 24px 0;
  height: 0;
  overflow: visible;
  position: relative;
}
${scope} .page-break::after {
  content: 'Page break';
  position: absolute;
  top: -9px;
  left: 50%;
  transform: translateX(-50%);
  background: white;
  padding: 0 8px;
  font-size: 10px;
  color: #94a3b8;
  font-family: sans-serif;
  pointer-events: none;
}
`.trim();

  // ── Print rules ───────────────────────────────────────────────────────────
  const printRules = `
@page {
  size: A4;
  margin: 8mm;
}
@media print {
  /* hide Studio chrome */
  .html-canvas-row-controls,
  .${ROW_CTRL_CLASS},
  [data-testid="row-controls"],
  [data-testid="canvas-scroll"] > *:not(.mx-auto),
  .studio-doc-toolbar,
  .document-actions-widget {
    display: none !important;
  }

  /* page-break support */
  ${scope} .page-break {
    page-break-after: always;
    break-after: page;
    border: none;
    margin: 0;
  }
  ${scope} .page-break::after {
    display: none;
  }

  /* canvas root: no extra margin/padding — @page handles margins */
  ${scope} {
    margin: 0 !important;
    padding: 0 !important;
    max-width: 100% !important;
    width: 100% !important;
  }

  /* keep tables and images within printable width */
  ${scope} table {
    width: 100% !important;
    max-width: 100% !important;
    min-width: 0 !important;
    table-layout: auto !important;
  }
  ${scope} img,
  ${scope} figure,
  ${scope} svg,
  ${scope} .banner,
  ${scope} [class*="banner"] {
    max-width: 100% !important;
    height: auto !important;
  }
  ${scope} td,
  ${scope} th {
    word-break: break-word !important;
    overflow-wrap: break-word !important;
    min-width: 0 !important;
  }
}
`.trim();

  const parts = [baseRules, printRules];
  if (importCss) parts.push(importCss);
  return parts.join('\n');
}

// ─── Row controls ─────────────────────────────────────────────────────────────

/**
 * Inject row-control CSS once into document.head (idempotent).
 */
function ensureRowControlCss(): void {
  const id = 'html-canvas-row-controls-css';
  if (document.getElementById(id)) return;
  const style = document.createElement('style');
  style.id = id;
  style.textContent = `
.${ROW_CTRL_CLASS} {
  display: none;
  position: absolute;
  right: -60px;
  top: 50%;
  transform: translateY(-50%);
  z-index: 20;
  flex-direction: column;
  gap: 2px;
  pointer-events: auto;
}
tr:hover .${ROW_CTRL_CLASS},
tr:focus-within .${ROW_CTRL_CLASS} { display: flex; }
.${ROW_BTN_CLASS} {
  width: 22px; height: 22px;
  border-radius: 4px;
  border: 1px solid #e2e8f0;
  background: white;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #64748b;
  transition: background 0.12s, color 0.12s;
}
.${ROW_BTN_CLASS}:hover { background: #f1f5f9; color: #1e293b; }
.${ROW_BTN_CLASS}.delete:hover { background: #fee2e2; color: #dc2626; border-color: #fca5a5; }
  `.trim();
  document.head.appendChild(style);
}

/**
 * Attach add-row / delete-row controls to every <tr> inside root.
 * Idempotent — skips rows that already have controls.
 * Preserves colspan/rowspan: clones the row structure but clears text content.
 */
export function attachRowControls(root: HTMLElement, onMutate: () => void): void {
  ensureRowControlCss();

  root.querySelectorAll<HTMLTableRowElement>('tr').forEach((row) => {
    if (row.querySelector(`.${ROW_CTRL_CLASS}`)) return; // already attached

    row.style.position = 'relative';

    const controls = document.createElement('div');
    controls.className = ROW_CTRL_CLASS;
    controls.contentEditable = 'false';
    controls.setAttribute('data-testid', 'row-controls');

    // ── Add row ──────────────────────────────────────────────────────────────
    const addBtn = document.createElement('button');
    addBtn.type  = 'button';
    addBtn.className = ROW_BTN_CLASS;
    addBtn.title = 'Add row below';
    addBtn.setAttribute('data-testid', 'row-add-btn');
    addBtn.innerHTML = svgPlus;
    addBtn.addEventListener('mousedown', (e) => {
      e.preventDefault(); // keep focus in current cell
      const parent = row.parentElement;
      if (!parent) return;

      // Clone row preserving colspan/rowspan; clear text content only
      const newRow = row.cloneNode(true) as HTMLTableRowElement;
      newRow.querySelectorAll<HTMLElement>('td, th').forEach((cell) => {
        // Preserve colspan/rowspan attributes — only clear text
        cell.textContent = '';
        cell.contentEditable = 'true';
      });
      // Strip cloned controls — attachRowControls will re-attach
      newRow.querySelectorAll(`.${ROW_CTRL_CLASS}`).forEach((c) => c.remove());
      parent.insertBefore(newRow, row.nextSibling);

      // Attach controls to the new row
      const tableRoot = newRow.closest('[data-doc-id]') as HTMLElement ?? root;
      attachRowControls(tableRoot, onMutate);
      onMutate();
    });

    // ── Delete row ───────────────────────────────────────────────────────────
    const delBtn = document.createElement('button');
    delBtn.type  = 'button';
    delBtn.className = `${ROW_BTN_CLASS} delete`;
    delBtn.title = 'Delete row';
    delBtn.setAttribute('data-testid', 'row-delete-btn');
    delBtn.innerHTML = svgTrash;
    delBtn.addEventListener('mousedown', (e) => {
      e.preventDefault();
      const parent = row.parentElement;
      if (!parent) return;
      // Guard: keep at least one row in the section (thead/tbody/tfoot)
      if (parent.querySelectorAll('tr').length <= 1) return;
      parent.removeChild(row);
      onMutate();
    });

    controls.appendChild(addBtn);
    controls.appendChild(delBtn);
    row.appendChild(controls);
  });
}

// ─── Serialise ────────────────────────────────────────────────────────────────

/**
 * Serialise the canvas innerHTML for storage.
 * Strips injected row-control nodes and removes contentEditable / cursor
 * style attributes so the stored HTML is clean.
 *
 * Exported so callers (e.g. a manual Save button) can get the current HTML
 * without triggering a blur.
 */
export function serialiseCanvas(canvasEl: HTMLElement): string {
  const clone = canvasEl.cloneNode(true) as HTMLElement;
  // Remove injected row-control overlays
  clone.querySelectorAll(`.${ROW_CTRL_CLASS}`).forEach((c) => c.remove());
  // Strip runtime editability attributes
  clone.querySelectorAll<HTMLElement>('[contenteditable]').forEach((el) => {
    el.removeAttribute('contenteditable');
    el.style.removeProperty('outline');
    el.style.removeProperty('cursor');
    if (!el.getAttribute('style')) el.removeAttribute('style');
  });
  return clone.innerHTML;
}

// ─── Inline SVG icons (avoids Lucide import in DOM helpers) ──────────────────

const svgPlus = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`;
const svgTrash = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>`;
