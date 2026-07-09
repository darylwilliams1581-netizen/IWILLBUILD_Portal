/**
 * documentStyles.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Professional document CSS injected into the PageEditor contenteditable surface.
 *
 * Design reference: MLCH SWMS series + PP-010 Procedure document.
 * Goals:
 *   - Heading hierarchy that matches a professionally authored DOCX
 *   - Consistent paragraph spacing (not too tight, not too loose)
 *   - Professional table styles with header row, striped rows, borders
 *   - Detail grid rows (label: value pairs) that align cleanly
 *   - Form field rows with dotted underlines
 *   - Section dividers
 *   - Print @page rules for correct PDF output
 */

export interface DocumentThemeVars {
  textColor: string;
  headingColor: string;
  accentColor: string;       // primary brand / heading bar colour
  accentText: string;        // text on accent background
  tableHeaderColor: string;
  tableHeaderTextColor: string;
  borderColor: string;
  mutedColor: string;
}

export const DEFAULT_THEME_VARS: DocumentThemeVars = {
  textColor: '#1e293b',
  headingColor: '#0f172a',
  accentColor: '#1e3a5f',       // dark navy — matches SWMS header bars
  accentText: '#ffffff',
  tableHeaderColor: '#1e3a5f',
  tableHeaderTextColor: '#ffffff',
  borderColor: '#cbd5e1',
  mutedColor: '#64748b',
};

export function buildDocumentCss(
  t: DocumentThemeVars,
  _margin: string,
): string {
  return `
/* ── Reset inside editor ─────────────────────────────────────────────────── */
[data-doc-editor] * { box-sizing: border-box; }
[data-doc-editor] { font-family: 'Calibri', 'Segoe UI', Arial, sans-serif; }

/* ── Placeholder ─────────────────────────────────────────────────────────── */
[data-doc-editor]:empty:before {
  content: attr(data-placeholder);
  color: #94a3b8;
  pointer-events: none;
  font-style: italic;
}

/* ── Body text ───────────────────────────────────────────────────────────── */
[data-doc-editor] p {
  margin: 0 0 5pt;
  font-size: 10.5pt;
  line-height: 1.45;
  color: ${t.textColor};
}
[data-doc-editor] p:last-child { margin-bottom: 0; }

/* ── Heading hierarchy ───────────────────────────────────────────────────── */
/* H1 — Document title */
[data-doc-editor] h1 {
  font-size: 18pt;
  font-weight: 700;
  color: ${t.headingColor};
  margin: 0 0 10pt;
  line-height: 1.2;
  letter-spacing: -0.01em;
  border-bottom: 2.5px solid ${t.accentColor};
  padding-bottom: 5pt;
}

/* H2 — Major section (e.g. "1. SCOPE", "2. RESPONSIBILITIES") */
[data-doc-editor] h2 {
  font-size: 12pt;
  font-weight: 700;
  color: ${t.accentText};
  background: ${t.accentColor};
  margin: 14pt 0 6pt;
  padding: 4pt 8pt;
  line-height: 1.3;
  letter-spacing: 0.01em;
  text-transform: uppercase;
}

/* H3 — Sub-section */
[data-doc-editor] h3 {
  font-size: 11pt;
  font-weight: 700;
  color: ${t.headingColor};
  margin: 10pt 0 4pt;
  border-left: 3px solid ${t.accentColor};
  padding-left: 7pt;
  line-height: 1.3;
}

/* H4 — Minor heading */
[data-doc-editor] h4 {
  font-size: 10.5pt;
  font-weight: 700;
  color: ${t.headingColor};
  margin: 8pt 0 3pt;
  line-height: 1.3;
}

/* ── Inline formatting ───────────────────────────────────────────────────── */
[data-doc-editor] strong, [data-doc-editor] b { font-weight: 700; }
[data-doc-editor] em, [data-doc-editor] i     { font-style: italic; }
[data-doc-editor] u                           { text-decoration: underline; }
[data-doc-editor] s                           { text-decoration: line-through; }
[data-doc-editor] a                           { color: #1d4ed8; text-decoration: underline; }
[data-doc-editor] code {
  font-family: 'Consolas', 'Courier New', monospace;
  font-size: 9pt;
  background: #f1f5f9;
  border: 1px solid #e2e8f0;
  border-radius: 3px;
  padding: 0 3pt;
}

/* ── Lists ───────────────────────────────────────────────────────────────── */
[data-doc-editor] ul,
[data-doc-editor] ol {
  margin: 4pt 0 8pt 18pt;
  padding: 0;
}
[data-doc-editor] li {
  font-size: 10.5pt;
  line-height: 1.45;
  margin-bottom: 2pt;
  color: ${t.textColor};
}
[data-doc-editor] ul li { list-style-type: disc; }
[data-doc-editor] ul ul li { list-style-type: circle; }
[data-doc-editor] ol li { list-style-type: decimal; }

/* ── Blockquote / callout ────────────────────────────────────────────────── */
[data-doc-editor] blockquote {
  border-left: 3px solid ${t.accentColor};
  margin: 8pt 0;
  padding: 4pt 10pt;
  color: ${t.mutedColor};
  font-style: italic;
  background: #f8fafc;
}

/* ── Horizontal rule / section divider ───────────────────────────────────── */
[data-doc-editor] hr {
  border: none;
  border-top: 1.5px solid ${t.borderColor};
  margin: 10pt 0;
}

/* ── Tables — professional SWMS style ───────────────────────────────────── */
[data-doc-editor] table {
  width: 100%;
  border-collapse: collapse;
  margin: 8pt 0 10pt;
  font-size: 9.5pt;
  table-layout: fixed;
  page-break-inside: avoid;
}
[data-doc-editor] table th {
  background: ${t.tableHeaderColor};
  color: ${t.tableHeaderTextColor};
  font-weight: 700;
  font-size: 9pt;
  padding: 5pt 7pt;
  border: 1px solid ${t.tableHeaderColor};
  text-align: left;
  vertical-align: middle;
  line-height: 1.3;
}
[data-doc-editor] table td {
  padding: 4pt 7pt;
  border: 1px solid ${t.borderColor};
  vertical-align: top;
  line-height: 1.4;
  min-height: 20pt;
  font-size: 9.5pt;
  color: ${t.textColor};
}
/* Striped rows */
[data-doc-editor] table tbody tr:nth-child(even) td {
  background: #f8fafc;
}
/* Risk matrix colour coding */
[data-doc-editor] td[data-risk="low"]    { background: #dcfce7 !important; }
[data-doc-editor] td[data-risk="medium"] { background: #fef9c3 !important; }
[data-doc-editor] td[data-risk="high"]   { background: #fee2e2 !important; }
[data-doc-editor] td[data-risk="extreme"]{ background: #fecaca !important; font-weight: 700; }

/* ── Detail grid (label: value pairs) ───────────────────────────────────── */
/* Used for document header info rows: Job No, Date, Client, etc. */
[data-doc-editor] .detail-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 0;
  border: 1px solid ${t.borderColor};
  margin: 6pt 0 10pt;
  font-size: 9.5pt;
}
[data-doc-editor] .detail-row {
  display: contents;
}
[data-doc-editor] .detail-label {
  background: #f1f5f9;
  font-weight: 700;
  padding: 4pt 7pt;
  border-right: 1px solid ${t.borderColor};
  border-bottom: 1px solid ${t.borderColor};
  color: ${t.headingColor};
  font-size: 9pt;
}
[data-doc-editor] .detail-value {
  padding: 4pt 7pt;
  border-bottom: 1px solid ${t.borderColor};
  color: ${t.textColor};
}

/* ── Form field rows ─────────────────────────────────────────────────────── */
[data-doc-editor] .form-row {
  display: flex;
  align-items: baseline;
  gap: 8pt;
  margin-bottom: 6pt;
  font-size: 10pt;
}
[data-doc-editor] .form-label {
  font-weight: 700;
  color: ${t.headingColor};
  white-space: nowrap;
  min-width: 100pt;
  font-size: 9.5pt;
}
[data-doc-editor] .form-value {
  flex: 1;
  border-bottom: 1px solid ${t.borderColor};
  min-height: 14pt;
  padding-bottom: 1pt;
}

/* ── Special block chips ─────────────────────────────────────────────────── */
[data-doc-editor] .special-block-chip {
  display: block;
  margin: 5pt 0;
  padding: 4pt 8pt;
  background: #f0f9ff;
  border: 1.5px dashed #7dd3fc;
  border-radius: 4px;
  color: #0369a1;
  font-size: 8.5pt;
  font-family: 'Consolas', 'Courier New', monospace;
  cursor: default;
  user-select: none;
  line-height: 1.4;
}

/* ── System field tokens ─────────────────────────────────────────────────── */
[data-doc-editor] .sys-field-token {
  display: inline-flex;
  align-items: center;
  gap: 3pt;
  padding: 1pt 5pt;
  background: #eff6ff;
  border: 1px solid #bfdbfe;
  border-radius: 3px;
  color: #1d4ed8;
  font-size: 8.5pt;
  font-family: 'Consolas', 'Courier New', monospace;
  cursor: default;
  user-select: none;
  white-space: nowrap;
}

/* ── Page break marker ───────────────────────────────────────────────────── */
[data-doc-editor] .page-break-marker {
  display: block;
  text-align: center;
  color: #94a3b8;
  font-size: 8pt;
  letter-spacing: 0.08em;
  border-top: 1.5px dashed #e2e8f0;
  border-bottom: 1.5px dashed #e2e8f0;
  padding: 3pt 0;
  margin: 8pt 0;
  cursor: default;
  user-select: none;
  font-family: 'Consolas', 'Courier New', monospace;
}

/* ── Page ruler (visual page boundary in editor) ─────────────────────────── */
.doc-page-ruler {
  position: absolute;
  left: 0; right: 0;
  height: 0;
  border-top: 2px dashed #94a3b8;
  pointer-events: none;
  z-index: 10;
}
.doc-page-ruler::after {
  content: attr(data-label);
  position: absolute;
  right: 10px;
  top: 4px;
  font-size: 8pt;
  color: #94a3b8;
  letter-spacing: 0.05em;
  font-family: 'Consolas', 'Courier New', monospace;
  background: white;
  padding: 0 4px;
}

/* ── Print / PDF export ──────────────────────────────────────────────────── */
@media print {
  .doc-page-ruler { display: none; }
  .page-sheet { box-shadow: none !important; }
  [data-doc-editor] h2 { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  [data-doc-editor] table th { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  [data-doc-editor] .special-block-chip { display: none; }
}
`;
}
