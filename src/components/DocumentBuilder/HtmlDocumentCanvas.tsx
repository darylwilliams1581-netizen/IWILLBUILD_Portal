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

import { useRef, useEffect, useCallback, useState, useImperativeHandle, forwardRef } from 'react';
import {
  AlertTriangle, ChevronDown, ChevronUp, X,
  FileText, Image as ImageIcon, LayoutGrid, AlertCircle,
  Loader2, CheckCircle,
} from 'lucide-react';
import type { ImportReport } from './types';
import { sanitiseHtml } from './sanitiseHtml';

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

/**
 * Imperative handle exposed via ref so Document Tools can insert HTML
 * at the active caret without going through the block-append store.
 */
export interface HtmlDocumentCanvasHandle {
  /**
   * Insert sanitised HTML at the last known caret position inside the
   * .studio-doc canvas.  If no caret was saved, appends at the end.
   * Marks the document dirty and triggers a save.
   */
  insertHtml(fragment: string): void;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const STYLE_TAG_ID_PREFIX = 'html-canvas-css-';
const ROW_CTRL_CLASS = 'html-canvas-row-controls';
const ROW_BTN_CLASS  = 'html-canvas-row-btn';

// ─── Component ────────────────────────────────────────────────────────────────

const HtmlDocumentCanvas = forwardRef<HtmlDocumentCanvasHandle, HtmlDocumentCanvasProps>(
function HtmlDocumentCanvas(
{
  templateId,
  htmlContent,
  importCss,
  importReport,
  mode,
  onSaved,
  zoom = 100,
}: HtmlDocumentCanvasProps,
ref,
) {
  const canvasRef  = useRef<HTMLDivElement>(null);
  const isDirtyRef = useRef(false);
  const isSaving   = useRef(false);
  /**
   * Tracks whether the canvas has been initialised with real (non-empty)
   * content for the current templateId. Used to detect the async-load race:
   * if htmlContent was '' at mount time and later becomes populated (same
   * templateId), we initialise the DOM then — but only if the user has not
   * started editing (isDirtyRef is false).
   */
  const canvasInitialisedRef = useRef(false);
  /** Last saved Selection Range inside the canvas — preserved across toolbar focus loss */
  const savedRangeRef = useRef<Range | null>(null);

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

  // ── Preserve selection when focus leaves the canvas ───────────────────────
  // Saved before a toolbar button click steals focus so insertHtml can
  // restore the caret to the correct position.
  useEffect(() => {
    if (!isEditable) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const saveRange = () => {
      const sel = window.getSelection();
      if (sel && sel.rangeCount > 0) {
        const range = sel.getRangeAt(0);
        // Only save if the range is inside our canvas
        if (canvas.contains(range.commonAncestorContainer)) {
          savedRangeRef.current = range.cloneRange();
        }
      }
    };

    // Save on every selectionchange so we always have the freshest position
    document.addEventListener('selectionchange', saveRange);
    return () => document.removeEventListener('selectionchange', saveRange);
  }, [isEditable]);

  // ── Imperative handle: insertHtml ─────────────────────────────────────────
  useImperativeHandle(ref, () => ({
    insertHtml(fragment: string) {
      if (!isEditable) return;
      const canvas = canvasRef.current;
      if (!canvas) return;

      // Sanitise the incoming fragment through the shared allowlist
      const clean = sanitiseHtml(fragment);

      // Build a temporary container to parse the fragment into real nodes
      const tmp = document.createElement('div');
      tmp.innerHTML = clean;

      // Restore the saved selection, or fall back to end-of-canvas
      const sel = window.getSelection();
      let range: Range;

      if (savedRangeRef.current && canvas.contains(savedRangeRef.current.commonAncestorContainer)) {
        range = savedRangeRef.current.cloneRange();
      } else {
        // No valid saved range — append at end
        range = document.createRange();
        range.selectNodeContents(canvas);
        range.collapse(false);
      }

      // Focus the canvas so the selection is active
      canvas.focus({ preventScroll: true });

      if (sel) {
        sel.removeAllRanges();
        sel.addRange(range);
      }

      // Delete any current selection content, then insert
      range.deleteContents();

      // Insert nodes from the fragment (may be multiple top-level nodes)
      const frag = document.createDocumentFragment();
      while (tmp.firstChild) frag.appendChild(tmp.firstChild);
      range.insertNode(frag);

      // Collapse selection to just after the inserted content
      range.collapse(false);
      if (sel) {
        sel.removeAllRanges();
        sel.addRange(range);
      }
      savedRangeRef.current = range.cloneRange();

      // Attach row controls to any newly inserted tables
      attachRowControls(canvas, () => { isDirtyRef.current = true; });

      // Mark dirty and trigger save (same path as typing)
      isDirtyRef.current = true;

      // Dispatch an input event so the dirty flag is picked up by any
      // external listeners and the save-status indicator updates
      canvas.dispatchEvent(new Event('input', { bubbles: true }));

      // Trigger an immediate save so the toolbar action is persisted
      // without requiring the user to blur the canvas manually.
      void (async () => {
        if (isSaving.current) return;
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
          isDirtyRef.current = true;
          setTimeout(() => setSaveStatus('idle'), 4000);
        } finally {
          isSaving.current = false;
        }
      })();
    },
  }), [isEditable, templateId, onSaved]);

  // ── Mount: set innerHTML once, wire editability ────────────────────────────
  // Memoised on templateId only — does NOT re-run when htmlContent changes
  // after mount, so React never replaces the live DOM.
  // Defence-in-depth: sanitise stored HTML at mount time so that any content
  // that bypassed earlier sanitisation (e.g. legacy imports) cannot execute.
  const mountCanvas = useCallback(
    (el: HTMLDivElement | null) => {
      if (!el) return;
      (canvasRef as React.MutableRefObject<HTMLDivElement | null>).current = el;
      // Reset initialisation tracking whenever the canvas element mounts
      // (which happens on templateId change or first mount).
      canvasInitialisedRef.current = false;
      isDirtyRef.current = false;
      const sanitised = sanitiseHtml(htmlContent ?? '');
      el.innerHTML = sanitised;
      // Mark as initialised only if we actually received content.
      // If htmlContent was empty (async load not yet complete), leave
      // canvasInitialisedRef false so the effect below can initialise later.
      if (sanitised.trim() !== '') {
        canvasInitialisedRef.current = true;
      }
      if (isEditable) {
        attachRowControls(el, () => { isDirtyRef.current = true; });
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [templateId, isEditable],
  );

  // ── Async-load initialisation ──────────────────────────────────────────────
  // Handles the race where htmlContent was '' at mount time (parent still
  // fetching) and later becomes populated with the same templateId.
  // Only fires when:
  //   1. The canvas element exists.
  //   2. The canvas has NOT yet been initialised with real content.
  //   3. htmlContent is now non-empty.
  //   4. The user has NOT started editing (isDirtyRef is false).
  useEffect(() => {
    const el = canvasRef.current;
    if (!el) return;
    if (canvasInitialisedRef.current) return;
    if (!htmlContent || htmlContent.trim() === '') return;
    if (isDirtyRef.current) return;
    // Content has arrived — initialise the canvas now.
    const sanitised = sanitiseHtml(htmlContent);
    el.innerHTML = sanitised;
    canvasInitialisedRef.current = true;
  }, [htmlContent]);

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
);

HtmlDocumentCanvas.displayName = 'HtmlDocumentCanvas';
export default HtmlDocumentCanvas;

// ─── Import CSS sanitiser ─────────────────────────────────────────────────────

/**
 * Strip structural layout rules from Word-imported CSS that would conflict
 * with Studio's canonical 5 mm margin model.
 *
 * Removed categories (belt-and-suspenders, regardless of cascade order):
 *   • @page { … }          — Word page margins must not override @page { margin: 5mm }
 *   • html { … }           — root margin/padding must not leak into the canvas
 *   • body { … }           — same
 *   • .studio-doc { … }    — must not re-introduce padding/margin on the canvas root
 *   • Word section/wrapper selectors that carry outer page margins:
 *       .WordSection*, .Section*, .MsoNormal (margin/padding only — see below),
 *       div[class*="Section"], div[class*="WordSection"]
 *
 * Preserved (legitimate document spacing):
 *   • p, li, h1–h6, blockquote spacing
 *   • table, td, th, col spacing and borders
 *   • img, figure sizing
 *   • Any other selector not in the blocked list
 *
 * Algorithm: line-by-line state machine that tracks brace depth.
 * When a blocked selector or @page at-rule opens a block, the entire
 * block (including nested braces) is consumed and discarded.
 * Everything else is passed through verbatim.
 */
function sanitiseImportCss(css: string): string {
  if (!css) return '';

  // Selectors whose ENTIRE rule block must be dropped.
  // Matched against the trimmed selector line (before the opening brace).
  const BLOCKED_SELECTOR_RE = /^(html|body|\.studio-doc(\[|$)|\.WordSection|\.Section[0-9]|div\[class\*="(Section|WordSection)"\])/i;

  const lines = css.split('\n');
  const out: string[] = [];

  let skipDepth = 0;   // brace depth of the block being skipped (0 = not skipping)
  let braceDepth = 0;  // overall brace depth (for @media nesting awareness)
  let skipAtRule = false; // true when we're inside a skipped @-rule block

  for (let i = 0; i < lines.length; i++) {
    const raw  = lines[i];
    const line = raw.trim();

    // ── Count braces in this line ────────────────────────────────────────────
    const opens  = (raw.match(/\{/g) ?? []).length;
    const closes = (raw.match(/\}/g) ?? []).length;

    // ── Currently skipping a blocked block ───────────────────────────────────
    if (skipDepth > 0 || skipAtRule) {
      skipDepth += opens - closes;
      if (skipDepth <= 0) {
        skipDepth  = 0;
        skipAtRule = false;
      }
      continue; // discard this line
    }

    // ── @page at-rule: skip the entire block ─────────────────────────────────
    if (/^@page\b/.test(line)) {
      if (opens > 0) {
        skipDepth  = opens - closes;
        skipAtRule = skipDepth <= 0; // single-line @page {} — already closed
        if (skipDepth < 0) skipDepth = 0;
      }
      // Whether single-line or multi-line, discard this line
      continue;
    }

    // ── Selector line that opens a blocked block ──────────────────────────────
    // A selector line ends with { (possibly with other content after it).
    // We check the part before the first { against the blocked list.
    if (opens > 0 && !line.startsWith('@') && !line.startsWith('}')) {
      const selectorPart = line.split('{')[0].trim();
      // Handle comma-separated selectors: block if ALL selectors are blocked,
      // or if any individual selector matches (conservative — drop the whole rule
      // if any selector in the list is a structural one).
      const selectors = selectorPart.split(',').map((s) => s.trim());
      const hasBlockedSelector = selectors.some((s) => BLOCKED_SELECTOR_RE.test(s));

      if (hasBlockedSelector) {
        skipDepth = opens - closes;
        if (skipDepth <= 0) skipDepth = 0; // single-line rule already closed
        continue; // discard
      }
    }

    // ── Pass through ─────────────────────────────────────────────────────────
    braceDepth += opens - closes;
    out.push(raw);
  }

  return out.join('\n').trim();
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
 * • Canvas: 5 mm internal padding on .studio-doc (scoped CSS rule).
 * • Print:  5 mm @page margins; .studio-doc padding reset to 0 in @media print
 *           so the @page margin is the sole margin — no double-margin.
 * • Tables: fluid width (max-width: 100%), cells word-wrap, no fixed
 *   widths that cause horizontal clipping.
 * • Images / banners: max-width: 100%, height: auto.
 * • box-sizing: border-box on everything inside the scope so padding
 *   never pushes content outside the printable width.
 *
 * CSS emission order (cascade safety)
 * ─────────────────────────────────────
 *   1. baseRules   — box-sizing, 5 mm screen padding, table/image constraints
 *   2. importCss   — Word converter output, pre-sanitised by sanitiseImportCss()
 *                    (structural @page / html / body / .studio-doc rules stripped)
 *   3. printRules  — @page { margin: 5mm } + @media print resets (LAST = wins)
 *
 * Emitting printRules AFTER importCss ensures Studio's @page and @media print
 * blocks always win the cascade even if the sanitiser misses an edge case.
 */
function buildScopedStyles(docId: string, importCss: string): string {
  const scope = `.studio-doc[data-doc-id="${docId}"]`;

  // ── Base layout rules (canvas + print) ────────────────────────────────────
  const baseRules = `
/* ── box-sizing reset inside canvas ─────────────────────────────────────── */
${scope}, ${scope} * {
  box-sizing: border-box;
}

/* ── 5 mm internal padding on the canvas root (on-screen only) ──────────── */
${scope} {
  padding: 5mm;
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
  border-spacing: 0;
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
  /* default visible grid line — overridden by imported inline borders */
  border: 1px solid #cbd5e1;
  padding: 4px 8px;
}

/* ── layout-only tables must NOT show a grid ─────────────────────────────── */
/* .doc-columns-grid = two-column layout wrapper; .no-grid = explicit opt-out */
${scope} table.doc-columns-grid,
${scope} table.no-grid {
  border: none;
}
${scope} table.doc-columns-grid td,
${scope} table.doc-columns-grid th,
${scope} table.no-grid td,
${scope} table.no-grid th {
  border: none;
  padding: 0;
}

/* ── Risk Matrix / PPE / banner tables keep their own styling ────────────── */
/* These are div-based, not table-based, so the td/th rule above does not    */
/* affect them. The .risk-matrix-table IS a real table — give it its own     */
/* cell border so the colour-coded cells still show their fill correctly.    */
${scope} .risk-matrix-table td,
${scope} .risk-matrix-table th {
  border: 1px solid #94a3b8;
  padding: 4px 8px;
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
  margin: 5mm;
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
    border-collapse: collapse !important;
    border-spacing: 0 !important;
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
    /* printer-safe grid line (0.5pt ≈ 0.67px) */
    border: 0.5pt solid #555 !important;
  }

  /* layout tables stay borderless in print */
  ${scope} table.doc-columns-grid td,
  ${scope} table.doc-columns-grid th,
  ${scope} table.no-grid td,
  ${scope} table.no-grid th {
    border: none !important;
  }
}
`.trim();

  const parts = [baseRules, sanitiseImportCss(importCss), printRules];
  return parts.filter(Boolean).join('\n');
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
