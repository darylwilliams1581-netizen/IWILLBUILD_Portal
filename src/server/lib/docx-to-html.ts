/**
 * docx-to-html.ts
 * ───────────────
 * DOCX buffer → sanitised semantic HTML + scoped CSS + import report.
 *
 * Uses mammoth for the heavy OOXML lifting (runs, hyperlinks, numbering,
 * style-maps, image extraction).  Post-processing adds:
 *   • document-root-scoped CSS (.studio-doc[data-doc-id="<id>"])
 *   • page-break normalisation  (<w:pageBreak/> → <div class="page-break">)
 *   • strict allowlist sanitisation (no script/style/on* attributes)
 *   • image extraction callback → stable asset descriptors
 *   • import report collected from mammoth messages + unsupported constructs
 *
 * This file has NO database / storage / Express dependencies so it can be
 * imported and unit-tested in isolation.
 */

/* eslint-disable security/detect-unsafe-regex */
import mammoth from 'mammoth';
import { parseDocxTableData, enrichTableHtml } from './docx-table-enricher.js';

// ─── Public types ─────────────────────────────────────────────────────────────

export interface ExtractedImage {
  /** Stable key derived from content-type + SHA-like index, e.g. "img-1-image/png" */
  assetKey: string;
  /** MIME type reported by mammoth, e.g. "image/png" */
  contentType: string;
  /** Raw bytes of the image */
  buffer: Buffer;
  /** Placeholder src written into the HTML, e.g. "__IMG_ASSET_img-1-image/png__" */
  placeholder: string;
}

export interface ImportReport {
  /** Total number of mammoth warning/info messages */
  messageCount: number;
  /** Deduplicated list of human-readable warning strings (max 20) */
  warnings: string[];
  /** Number of images found in the document */
  imageCount: number;
  /** Number of page-break markers found */
  pageBreakCount: number;
  /** Whether any unsupported constructs were silently dropped */
  hadUnsupported: boolean;
}

export interface DocxToHtmlResult {
  /** Sanitised HTML fragment (no <html>/<head>/<body> wrapper) */
  html: string;
  /** Scoped CSS string ready to inject as <style> or store in import_css */
  css: string;
  /** Extracted images with stable asset keys */
  images: ExtractedImage[];
  /** Human-readable import report */
  report: ImportReport;
}

// ─── Sanitiser allowlist ──────────────────────────────────────────────────────

/**
 * Tags we allow through.  Everything else is stripped (content kept).
 * We intentionally omit <script>, <style>, <iframe>, <object>, <embed>,
 * <form>, <input>, <button>, <select>, <textarea>, <link>, <meta>.
 */
const ALLOWED_TAGS = new Set([
  'p', 'br', 'hr',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
  'strong', 'b', 'em', 'i', 'u', 's', 'del', 'ins', 'mark', 'sub', 'sup',
  'span', 'a',
  'ul', 'ol', 'li',
  'table', 'thead', 'tbody', 'tfoot', 'tr', 'th', 'td', 'caption', 'colgroup', 'col',
  'div', 'section', 'article', 'header', 'footer', 'main', 'aside',
  'blockquote', 'pre', 'code',
  'img',
  'figure', 'figcaption',
]);

/**
 * Attributes allowed per-tag (or globally via '*').
 * 'on*' event handlers are never allowed — they are stripped in the
 * attribute-level pass regardless of this map.
 */
const ALLOWED_ATTRS: Record<string, Set<string>> = {
  '*':     new Set(['class', 'id', 'style', 'lang', 'dir', 'title', 'aria-label', 'aria-hidden', 'role', 'data-doc-id']),
  'a':     new Set(['href', 'target', 'rel']),
  'img':   new Set(['src', 'alt', 'width', 'height', 'loading']),
  'td':    new Set(['colspan', 'rowspan']),
  'th':    new Set(['colspan', 'rowspan', 'scope']),
  'col':   new Set(['span', 'width']),
  'table': new Set(['border', 'cellpadding', 'cellspacing', 'width']),
};

// ─── Sanitiser ────────────────────────────────────────────────────────────────

/**
 * Strict allowlist HTML sanitiser — pure regex, no DOM dependency.
 *
 * Strategy:
 *   1. Strip all HTML comments.
 *   2. For each tag: if not in ALLOWED_TAGS → strip tag (keep inner text).
 *   3. For each attribute on an allowed tag: keep only if in ALLOWED_ATTRS.
 *   4. Force rel="noopener noreferrer" on <a target="_blank">.
 *   5. Reject javascript: / data: hrefs.
 */
export function sanitiseHtml(html: string): string {
  // 1. Strip comments
  let out = html.replace(/<!--[\s\S]*?-->/g, '');

  // 2 & 3. Process tags
  out = out.replace(/<(\/?)([a-zA-Z][a-zA-Z0-9]*)([^>]*)>/g, (match, slash, rawTag, attrStr) => {
    const tag = rawTag.toLowerCase();

    // Closing tag — allow if tag is allowed, no attributes needed
    if (slash === '/') {
      return ALLOWED_TAGS.has(tag) ? `</${tag}>` : '';
    }

    // Self-closing or opening — check tag allowlist
    if (!ALLOWED_TAGS.has(tag)) {
      // Strip the tag entirely (content will remain)
      return '';
    }

    // Filter attributes
    const allowedAttrs = new Set([
      ...(ALLOWED_ATTRS['*'] ?? []),
      ...(ALLOWED_ATTRS[tag] ?? []),
    ]);

    const filteredAttrs = filterAttributes(attrStr, allowedAttrs, tag);

    // Self-closing detection (img, br, hr, col)
    const selfClose = /\/$/.test(attrStr.trimEnd()) ? ' /' : '';
    return `<${tag}${filteredAttrs}${selfClose}>`;
  });

  return out;
}

function filterAttributes(attrStr: string, allowed: Set<string>, tag: string): string {
  if (!attrStr.trim()) return '';

  const result: string[] = [];
  // Match name="value", name='value', or name=value, or bare name
  const attrRe = /([a-zA-Z][a-zA-Z0-9_:-]*)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]*)))?/g;
  let m: RegExpExecArray | null;

  while ((m = attrRe.exec(attrStr)) !== null) {
    const name = m[1].toLowerCase();
    const value = m[2] ?? m[3] ?? m[4] ?? '';

    // Never allow event handlers
    if (name.startsWith('on')) continue;

    if (!allowed.has(name)) continue;

    // Sanitise href: reject javascript: and data: schemes
    if (name === 'href') {
      // Strip surrounding quotes that may have been captured as part of the value
      const trimmed = value.trim().replace(/^["']|["']$/g, '').toLowerCase().replace(/\s/g, '');
      if (trimmed.startsWith('javascript:') || trimmed.startsWith('data:')) continue;
    }

    // Sanitise style: strip expression() and url() with non-image schemes
    if (name === 'style') {
      const safeStyle = sanitiseStyle(value);
      if (safeStyle) result.push(` style="${safeStyle}"`);
      continue;
    }

    result.push(` ${name}="${escapeAttr(value)}"`);
  }

  // Force safe rel on blank-target links
  if (tag === 'a' && result.some(a => a.includes('target="_blank"'))) {
    if (!result.some(a => a.includes('rel='))) {
      result.push(' rel="noopener noreferrer"');
    }
  }

  return result.join('');
}

function sanitiseStyle(style: string): string {
  // Strip expression() — CSS injection vector
  let s = style.replace(/expression\s*\([^)]*\)/gi, '');
  // Strip url() unless it's a data:image or relative path (no javascript/vbscript)
  s = s.replace(/url\s*\(\s*(['"]?)([^)'"]*)\1\s*\)/gi, (full, _q, url) => {
    const u = url.trim().toLowerCase();
    if (u.startsWith('javascript:') || u.startsWith('vbscript:')) return '';
    return full;
  });
  return s.trim();
}

function escapeAttr(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ─── Scoped CSS builder ───────────────────────────────────────────────────────

/**
 * Build a scoped CSS block for the document canvas.
 * All rules are prefixed with `.studio-doc[data-doc-id="${docId}"]` so they
 * cannot leak into surrounding UI.
 *
 * @param docId  The document template ID (used as the scope anchor)
 */
export function buildScopedCss(docId: string | number): string {
  const scope = `.studio-doc[data-doc-id="${docId}"]`;
  return `
${scope} {
  font-family: 'Calibri', 'Arial', sans-serif;
  font-size: 11pt;
  line-height: 1.5;
  color: #1a1a1a;
  max-width: 210mm;
  margin: 0 auto;
  padding: 20mm 25mm;
  background: #fff;
  box-sizing: border-box;
}
${scope} h1 { font-size: 20pt; font-weight: 700; margin: 0.8em 0 0.4em; }
${scope} h2 { font-size: 16pt; font-weight: 700; margin: 0.7em 0 0.35em; }
${scope} h3 { font-size: 13pt; font-weight: 600; margin: 0.6em 0 0.3em; }
${scope} h4, ${scope} h5, ${scope} h6 { font-size: 11pt; font-weight: 600; margin: 0.5em 0 0.25em; }
${scope} p  { margin: 0.3em 0; }
${scope} ul, ${scope} ol { margin: 0.4em 0 0.4em 1.5em; padding: 0; }
${scope} li { margin: 0.15em 0; }
${scope} a  { color: #2563eb; text-decoration: underline; }
${scope} table {
  border-collapse: collapse;
  width: 100%;
  font-size: 10pt;
  margin: 0.6em 0;
}
${scope} th, ${scope} td {
  border: 1px solid #cbd5e1;
  padding: 4px 8px;
  vertical-align: top;
  text-align: left;
}
${scope} th {
  background: #1e293b;
  color: #fff;
  font-weight: 700;
}
${scope} img {
  max-width: 100%;
  height: auto;
  display: block;
  margin: 0.4em 0;
}
${scope} .page-break {
  page-break-after: always;
  border-top: 2px dashed #94a3b8;
  margin: 1.5em 0;
  height: 0;
}
${scope} blockquote {
  border-left: 3px solid #94a3b8;
  margin: 0.5em 0 0.5em 1em;
  padding: 0.2em 0.8em;
  color: #475569;
}
`.trim();
}

// ─── Page-break normalisation ─────────────────────────────────────────────────

/**
 * Mammoth renders <w:pageBreak/> as nothing or as a bare <br> with a class.
 * We normalise any remaining page-break markers to a consistent div.
 */
function normalisePageBreaks(html: string): { html: string; count: number } {
  let count = 0;
  // mammoth emits page breaks as <br class="page-break"> in some versions
  const out = html.replace(/<br\s+class="page-break"\s*\/?>/gi, () => {
    count++;
    return '<div class="page-break"></div>';
  });
  return { html: out, count };
}

// ─── Image extraction callback ────────────────────────────────────────────────

/**
 * Build a mammoth `convertImage` handler that:
 *   1. Captures each image buffer + content-type
 *   2. Assigns a stable asset key (index-based, deterministic per document)
 *   3. Writes a placeholder src so the caller can later swap in real URLs
 */
function makeImageHandler(collected: ExtractedImage[]) {
  return mammoth.images.imgElement(async (image) => {
    const idx = collected.length + 1;
    const ct = image.contentType ?? 'image/png';
    const assetKey = `img-${idx}-${ct.replace(/[^a-zA-Z0-9]/g, '_')}`;
    const placeholder = `__IMG_ASSET_${assetKey}__`;

    const buf = Buffer.from(await image.read());
    collected.push({ assetKey, contentType: ct, buffer: buf, placeholder });

    return { src: placeholder };
  });
}

// ─── Mammoth style map ────────────────────────────────────────────────────────

/**
 * Style map that preserves common Word heading styles and maps
 * "Normal" / body text to <p>.  Keeps table-of-contents entries as <p>.
 */
const STYLE_MAP = [
  "p[style-name='Heading 1'] => h1:fresh",
  "p[style-name='Heading 2'] => h2:fresh",
  "p[style-name='Heading 3'] => h3:fresh",
  "p[style-name='Heading 4'] => h4:fresh",
  "p[style-name='Heading 5'] => h5:fresh",
  "p[style-name='Heading 6'] => h6:fresh",
  "p[style-name='Title']     => h1:fresh",
  "p[style-name='Subtitle']  => h2:fresh",
  "p[style-name='TOC 1']     => p:fresh",
  "p[style-name='TOC 2']     => p:fresh",
  "p[style-name='TOC 3']     => p:fresh",
  "r[style-name='Strong']    => strong",
  "r[style-name='Emphasis']  => em",
  // Underline: mammoth does not emit <u> by default — map it explicitly
  "u => u",
].join('\n');

// ─── Main converter ───────────────────────────────────────────────────────────

/**
 * Convert a DOCX buffer to sanitised HTML + scoped CSS + import report.
 *
 * @param buffer  Raw DOCX bytes
 * @param docId   Document template ID — used to scope the CSS
 */
export async function convertDocxToHtml(
  buffer: Buffer,
  docId: string | number,
): Promise<DocxToHtmlResult> {
  const images: ExtractedImage[] = [];
  const convertImage = makeImageHandler(images);

  // Run mammoth
  const result = await mammoth.convertToHtml(
    { buffer },
    {
      styleMap: STYLE_MAP,
      convertImage,
      // Include default style map so bold/italic/underline/lists work
      includeDefaultStyleMap: true,
    },
  );

  let html = result.value;

  // Enrich tables with shading, borders, and column widths from raw DOCX XML
  const tableData = await parseDocxTableData(buffer);
  html = enrichTableHtml(html, tableData);

  // Normalise page breaks
  const { html: htmlAfterBreaks, count: pageBreakCount } = normalisePageBreaks(html);
  html = htmlAfterBreaks;

  // Sanitise
  html = sanitiseHtml(html);

  // Build scoped CSS
  const css = buildScopedCss(docId);

  // Build import report from mammoth messages
  const warnings: string[] = [];
  let hadUnsupported = false;

  for (const msg of result.messages) {
    const text: string = typeof msg === 'string' ? msg : (msg as { message?: string }).message ?? String(msg);
    if (!text) continue;
    // Deduplicate
    if (!warnings.includes(text) && warnings.length < 20) {
      warnings.push(text);
    }
    // Flag unsupported constructs
    if (/unsupported|ignored|not supported|unrecognised|unrecognized/i.test(text)) {
      hadUnsupported = true;
    }
  }

  const report: ImportReport = {
    messageCount: result.messages.length,
    warnings,
    imageCount: images.length,
    pageBreakCount,
    hadUnsupported,
  };

  return { html, css, images, report };
}
