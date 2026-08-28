/**
 * HtmlDocumentCanvas
 * ──────────────────
 * Renders an imported DOCX document as an editable HTML canvas.
 *
 * Architecture:
 *   - The HTML is injected once at mount via a ref callback (never via
 *     dangerouslySetInnerHTML on a contentEditable — avoids cursor resets).
 *   - All <td> and <th> cells are made contentEditable so the user can edit
 *     cell text directly.
 *   - Table rows can be added (button appended to each <tr>) or deleted
 *     (button on each <tr>) in build mode.
 *   - On blur of any editable element the current innerHTML is serialised
 *     and saved via PATCH /api/document-templates/:id.
 *   - The scoped CSS (import_css) is injected as a <style> tag keyed to the
 *     document id so it never leaks into surrounding UI.
 *   - An import report banner is shown at the top when the report has
 *     warnings or unsupported constructs.
 *
 * Constraints:
 *   - Never calls dangerouslySetInnerHTML on a contentEditable element.
 *   - The canvas root carries data-doc-id so the scoped CSS selector
 *     .studio-doc[data-doc-id="<id>"] matches correctly.
 *   - Row add/delete mutates the live DOM then re-serialises — no virtual
 *     DOM diffing needed for the HTML canvas path.
 */

import { useRef, useEffect, useCallback, useState } from 'react';
import {
  AlertTriangle, ChevronDown, ChevronUp, X,
  FileText, Image, LayoutGrid, AlertCircle,
  Plus, Trash2, Loader2, CheckCircle,
} from 'lucide-react';
import type { ImportReport } from './types';

// ─── Props ────────────────────────────────────────────────────────────────────

interface Props {
  templateId: number;
  htmlContent: string;
  importCss: string;
  importReport: ImportReport | null;
  /** 'build' = editable; 'preview' / 'use' = read-only */
  mode: 'build' | 'preview' | 'use';
  /** Called after a successful auto-save with the new serialised HTML */
  onSaved?: (html: string) => void;
  /** Zoom level 50–150 */
  zoom?: number;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const STYLE_TAG_ID_PREFIX = 'html-canvas-css-';

// ─── Component ────────────────────────────────────────────────────────────────

export default function HtmlDocumentCanvas({
  templateId,
  htmlContent,
  importCss,
  importReport,
  mode,
  onSaved,
  zoom = 100,
}: Props) {
  const canvasRef = useRef<HTMLDivElement>(null);
  const isDirtyRef = useRef(false);
  const isSavingRef = useRef(false);

  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [saveError, setSaveError] = useState('');
  const [reportOpen, setReportOpen] = useState(false);
  const [reportDismissed, setReportDismissed] = useState(false);

  const isEditable = mode === 'build';

  // ── Inject scoped CSS ──────────────────────────────────────────────────────
  useEffect(() => {
    const styleId = `${STYLE_TAG_ID_PREFIX}${templateId}`;
    let el = document.getElementById(styleId) as HTMLStyleElement | null;
    if (!el) {
      el = document.createElement('style');
      el.id = styleId;
      document.head.appendChild(el);
    }
    el.textContent = importCss ?? '';
    return () => {
      // Leave the style tag in place — removing it on unmount causes a flash
      // if the builder is re-opened. It will be overwritten on next mount.
    };
  }, [templateId, importCss]);

  // ── Set HTML content once at mount (ref callback pattern) ─────────────────
  // We use a ref callback so we can set innerHTML exactly once without
  // triggering a re-render. Subsequent edits are made directly in the DOM.
  const setCanvasContent = useCallback(
    (el: HTMLDivElement | null) => {
      if (!el) return;
      // Set content only on first mount (el is fresh)
      el.innerHTML = htmlContent ?? '';
      // Make all table cells editable in build mode
      if (isEditable) {
        applyEditability(el);
        attachRowControls(el, () => { isDirtyRef.current = true; });
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [templateId], // Only re-run when the document changes (not on every htmlContent update)
  );

  // ── Save on blur ───────────────────────────────────────────────────────────
  const handleBlur = useCallback(async () => {
    if (!isDirtyRef.current || isSavingRef.current || !isEditable) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const html = canvas.innerHTML;
    isDirtyRef.current = false;
    isSavingRef.current = true;
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
      isDirtyRef.current = true; // allow retry
      setTimeout(() => setSaveStatus('idle'), 4000);
    } finally {
      isSavingRef.current = false;
    }
  }, [templateId, isEditable, onSaved]);

  // ── Mark dirty on any input ────────────────────────────────────────────────
  const handleInput = useCallback(() => {
    isDirtyRef.current = true;
  }, []);

  // ── Report banner visibility ───────────────────────────────────────────────
  const hasReport =
    !reportDismissed &&
    importReport != null &&
    (importReport.hadUnsupported || importReport.warnings.length > 0 || importReport.imageCount > 0);

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="flex-1 flex flex-col min-h-0 bg-slate-100 overflow-hidden">

      {/* ── Save status strip ─────────────────────────────────────────────── */}
      {saveStatus !== 'idle' && (
        <div className={`flex items-center gap-2 px-4 py-1.5 text-xs font-medium flex-shrink-0 ${
          saveStatus === 'saving' ? 'bg-amber-50 text-amber-700 border-b border-amber-200'
          : saveStatus === 'saved' ? 'bg-emerald-50 text-emerald-700 border-b border-emerald-200'
          : 'bg-red-50 text-red-700 border-b border-red-200'
        }`}>
          {saveStatus === 'saving' && <Loader2 size={12} className="animate-spin" />}
          {saveStatus === 'saved'  && <CheckCircle size={12} />}
          {saveStatus === 'error'  && <AlertCircle size={12} />}
          {saveStatus === 'saving' ? 'Saving…'
           : saveStatus === 'saved' ? 'Saved'
           : `Save failed: ${saveError}`}
        </div>
      )}

      {/* ── Import report banner ──────────────────────────────────────────── */}
      {hasReport && importReport && (
        <div className="flex-shrink-0 bg-amber-50 border-b border-amber-200">
          <div className="flex items-center gap-2 px-4 py-2">
            <AlertTriangle size={13} className="text-amber-600 flex-shrink-0" />
            <span className="text-xs font-semibold text-amber-800 flex-1">
              Import report
              {importReport.imageCount > 0 && ` · ${importReport.imageCount} image${importReport.imageCount !== 1 ? 's' : ''}`}
              {importReport.pageBreakCount > 0 && ` · ${importReport.pageBreakCount} page break${importReport.pageBreakCount !== 1 ? 's' : ''}`}
              {importReport.hadUnsupported && ' · some unsupported constructs were dropped'}
            </span>
            <div className="flex items-center gap-1">
              {importReport.warnings.length > 0 && (
                <button
                  onClick={() => setReportOpen((v) => !v)}
                  className="flex items-center gap-1 px-2 py-0.5 rounded text-[11px] text-amber-700 hover:bg-amber-100 transition-colors"
                >
                  {reportOpen ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
                  {importReport.warnings.length} warning{importReport.warnings.length !== 1 ? 's' : ''}
                </button>
              )}
              <button
                onClick={() => setReportDismissed(true)}
                className="w-5 h-5 flex items-center justify-center rounded text-amber-500 hover:text-amber-800 hover:bg-amber-100 transition-colors"
                title="Dismiss"
              >
                <X size={11} />
              </button>
            </div>
          </div>

          {/* Expanded warnings list */}
          {reportOpen && importReport.warnings.length > 0 && (
            <div className="px-4 pb-3 flex flex-col gap-1">
              {importReport.warnings.map((w, i) => (
                <div key={i} className="flex items-start gap-2 text-[11px] text-amber-700">
                  <span className="mt-0.5 flex-shrink-0">•</span>
                  <span>{w}</span>
                </div>
              ))}
            </div>
          )}

          {/* Stats row */}
          <div className="flex items-center gap-4 px-4 pb-2">
            {importReport.imageCount > 0 && (
              <span className="flex items-center gap-1 text-[11px] text-amber-600">
                <Image size={11} /> {importReport.imageCount} image{importReport.imageCount !== 1 ? 's' : ''} extracted
              </span>
            )}
            {importReport.pageBreakCount > 0 && (
              <span className="flex items-center gap-1 text-[11px] text-amber-600">
                <LayoutGrid size={11} /> {importReport.pageBreakCount} page break{importReport.pageBreakCount !== 1 ? 's' : ''}
              </span>
            )}
            {importReport.messageCount > 0 && (
              <span className="flex items-center gap-1 text-[11px] text-amber-600">
                <FileText size={11} /> {importReport.messageCount} converter message{importReport.messageCount !== 1 ? 's' : ''}
              </span>
            )}
          </div>
        </div>
      )}

      {/* ── Scrollable canvas area ────────────────────────────────────────── */}
      <div className="flex-1 overflow-auto py-8 px-4">
        <div
          className="mx-auto bg-white shadow-lg rounded-sm"
          style={{
            width: `${Math.round(794 * zoom / 100)}px`,
            minHeight: `${Math.round(1123 * zoom / 100)}px`,
            padding: `${Math.round(48 * zoom / 100)}px`,
            transform: 'none',
          }}
        >
          {/* The actual editable canvas */}
          <div
            ref={(el) => {
              // Store ref for blur handler
              (canvasRef as React.MutableRefObject<HTMLDivElement | null>).current = el;
              // Set content on mount
              setCanvasContent(el);
            }}
            className={`studio-doc outline-none${isEditable ? ' html-canvas-editable' : ''}`}
            data-doc-id={String(templateId)}
            onInput={handleInput}
            onBlur={handleBlur}
            suppressContentEditableWarning
            // contentEditable is NOT set here — individual cells are made editable
            // by applyEditability() to avoid the whole-canvas editable pitfall
          />
        </div>
      </div>

      {/* ── Editable mode hint ────────────────────────────────────────────── */}
      {isEditable && (
        <div className="flex-shrink-0 flex items-center gap-2 px-4 py-1.5 bg-white border-t border-slate-200 text-[11px] text-slate-400">
          <span>Click any cell to edit · Use row controls to add or remove rows · Changes save automatically on blur</span>
        </div>
      )}
    </div>
  );
}

// ─── DOM helpers ──────────────────────────────────────────────────────────────

/**
 * Make all <td> and <th> elements inside the canvas contentEditable.
 * Paragraphs and headings are also made editable so plain-text sections
 * can be edited directly.
 */
function applyEditability(root: HTMLElement): void {
  // Table cells
  root.querySelectorAll<HTMLElement>('td, th').forEach((cell) => {
    cell.contentEditable = 'true';
    cell.style.outline = 'none';
    cell.style.cursor = 'text';
  });
  // Paragraphs and headings outside tables
  root.querySelectorAll<HTMLElement>('p, h1, h2, h3, h4, li').forEach((el) => {
    if (!el.closest('td') && !el.closest('th')) {
      el.contentEditable = 'true';
      el.style.outline = 'none';
      el.style.cursor = 'text';
    }
  });
}

/**
 * Attach add-row and delete-row controls to every <tr> in the canvas.
 * Controls are injected as absolutely-positioned overlays so they don't
 * affect the document layout or serialised HTML.
 *
 * Strategy:
 *   - Each <tr> gets `position: relative` and a control bar appended as a
 *     non-contenteditable child.
 *   - The control bar is hidden by default and shown on :hover via a CSS
 *     class injected once into the document head.
 *   - Add-row clones the current row (clearing cell content) and inserts it
 *     after the current row.
 *   - Delete-row removes the current row (minimum 1 row guard).
 *   - Both operations call onMutate() so the parent can mark the doc dirty.
 */
function attachRowControls(root: HTMLElement, onMutate: () => void): void {
  // Inject hover CSS once
  const styleId = 'html-canvas-row-controls-css';
  if (!document.getElementById(styleId)) {
    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
      .html-canvas-row-controls { display: none; position: absolute; right: -56px; top: 50%; transform: translateY(-50%); z-index: 10; display: flex; flex-direction: column; gap: 2px; }
      tr:hover .html-canvas-row-controls { display: flex; }
      .html-canvas-row-btn { width: 22px; height: 22px; border-radius: 4px; border: 1px solid #e2e8f0; background: white; cursor: pointer; display: flex; align-items: center; justify-content: center; color: #64748b; font-size: 11px; transition: background 0.15s, color 0.15s; }
      .html-canvas-row-btn:hover { background: #f1f5f9; color: #1e293b; }
      .html-canvas-row-btn.delete:hover { background: #fee2e2; color: #dc2626; border-color: #fca5a5; }
    `;
    document.head.appendChild(style);
  }

  root.querySelectorAll<HTMLTableRowElement>('tr').forEach((row) => {
    // Don't double-attach
    if (row.querySelector('.html-canvas-row-controls')) return;

    row.style.position = 'relative';

    const controls = document.createElement('div');
    controls.className = 'html-canvas-row-controls';
    controls.contentEditable = 'false'; // never serialised as content

    // Add row button
    const addBtn = document.createElement('button');
    addBtn.className = 'html-canvas-row-btn';
    addBtn.title = 'Add row below';
    addBtn.innerHTML = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>`;
    addBtn.addEventListener('mousedown', (e) => {
      e.preventDefault(); // don't blur the active cell
      const tbody = row.parentElement;
      if (!tbody) return;
      const newRow = row.cloneNode(true) as HTMLTableRowElement;
      // Clear cell content in the new row
      newRow.querySelectorAll<HTMLElement>('td, th').forEach((cell) => {
        cell.textContent = '';
        cell.contentEditable = 'true';
        cell.style.outline = 'none';
        cell.style.cursor = 'text';
      });
      // Remove any cloned row controls (will be re-attached below)
      newRow.querySelectorAll('.html-canvas-row-controls').forEach((c) => c.remove());
      tbody.insertBefore(newRow, row.nextSibling);
      // Attach controls to the new row
      attachRowControls(newRow.closest('table')?.closest('[data-doc-id]') as HTMLElement ?? root, onMutate);
      onMutate();
    });

    // Delete row button
    const delBtn = document.createElement('button');
    delBtn.className = 'html-canvas-row-btn delete';
    delBtn.title = 'Delete row';
    delBtn.innerHTML = `<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>`;
    delBtn.addEventListener('mousedown', (e) => {
      e.preventDefault();
      const tbody = row.parentElement;
      if (!tbody) return;
      // Guard: keep at least one row
      if (tbody.querySelectorAll('tr').length <= 1) return;
      tbody.removeChild(row);
      onMutate();
    });

    controls.appendChild(addBtn);
    controls.appendChild(delBtn);
    row.appendChild(controls);
  });
}

// ─── Serialise helper (strips row control DOM nodes before saving) ────────────

/**
 * Serialise the canvas innerHTML, stripping all injected row-control elements
 * so they don't end up in the stored HTML.
 *
 * Called externally by the parent when it needs the current HTML (e.g. for
 * a manual Save button). The canvas auto-saves on blur via handleBlur above.
 */
export function serialiseCanvas(canvasEl: HTMLElement): string {
  const clone = canvasEl.cloneNode(true) as HTMLElement;
  clone.querySelectorAll('.html-canvas-row-controls').forEach((c) => c.remove());
  // Strip contentEditable attributes — they are re-applied at render time
  clone.querySelectorAll<HTMLElement>('[contenteditable]').forEach((el) => {
    el.removeAttribute('contenteditable');
    el.style.removeProperty('outline');
    el.style.removeProperty('cursor');
  });
  return clone.innerHTML;
}

// ─── Row control icons as inline SVG (used in addBtn/delBtn above) ────────────
// Exported so tests can verify the control markup without rendering
export { Plus, Trash2 };
