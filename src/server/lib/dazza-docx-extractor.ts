/**
 * dazza-docx-extractor.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Structured DOCX extraction for Dazza attachment evidence.
 *
 * ROOT CAUSE FIXED HERE:
 *   The old extractor used mammoth.extractRawText(), which strips all heading
 *   and table structure.  Dazza received a flat wall of text with no section
 *   boundaries, no table rows, and no cell values.  When asked to compare a
 *   document against the attachment, Dazza could not identify individual
 *   sections or table contents, so it produced vague proposals with object-
 *   valued fields that rendered as [object Object].
 *
 * THIS EXTRACTOR:
 *   Uses mammoth.convertToHtml() to get the full structural HTML, then parses
 *   it into a bounded, readable Markdown representation that preserves:
 *     - Heading levels (H1–H6 → # ## ### etc.)
 *     - Paragraphs (separated by blank lines)
 *     - Tables (rendered as Markdown pipe tables with header row)
 *     - Source filename and section locations
 *
 *   The output is plain text — no JavaScript objects are passed to the model.
 *   Every cell value is a string.  Tables are rendered as:
 *
 *     | Column A | Column B | Column C |
 *     |----------|----------|----------|
 *     | value 1  | value 2  | value 3  |
 *
 *   Headings are rendered as:
 *
 *     ## Section Name
 *
 *   This gives Dazza enough structure to:
 *     - Identify which sections are present in the attachment
 *     - Identify which sections are absent
 *     - Match attachment sections to document blocks by heading text
 *     - Propose actual block-level operations with readable replacement content
 *
 * TRUST BOUNDARY:
 *   The extracted Markdown is still UNTRUSTED EXTERNAL DATA.
 *   It is wrapped in the standard [UNTRUSTED_EVIDENCE] block before injection.
 *   The model is instructed that embedded commands are inert quoted data.
 *
 * BOUNDS:
 *   - Max 12,000 chars per DOCX (up from 8,000 — structured output is denser)
 *   - Tables are truncated at MAX_TABLE_ROWS rows (default 50)
 *   - Total combined limit is still DAZZA_ATTACHMENT_MAX_EXTRACT_CHARS (16,000)
 *
 * SECTION INDEX:
 *   The extractor also returns a DocxSectionIndex — a list of all headings
 *   found in the document with their heading level and character offset.
 *   This is used by the whole-document comparison logic to report which
 *   sections are present, absent, or broken.
 */

import mammoth from 'mammoth';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface DocxSection {
  /** Heading text (empty string for body paragraphs between headings) */
  heading: string;
  /** Heading level 1–6, or 0 for body paragraphs */
  level: number;
  /** Paragraphs under this heading (before the next heading) */
  paragraphs: string[];
  /** Tables under this heading (before the next heading) */
  tables: DocxTable[];
}

export interface DocxTable {
  /** Row index of the header row (always 0) */
  headerRow: string[];
  /** Data rows */
  dataRows: string[][];
  /** Total rows in the source (before truncation) */
  totalRows: number;
}

export interface DocxExtractionResult {
  /** Structured sections */
  sections: DocxSection[];
  /** Flat Markdown representation for injection into the model prompt */
  markdown: string;
  /** Total characters in the markdown output */
  charCount: number;
  /** Number of headings found */
  headingCount: number;
  /** Number of tables found */
  tableCount: number;
  /** Number of paragraphs found */
  paragraphCount: number;
  /** Whether the output was truncated to fit the char budget */
  truncated: boolean;
}

// ── Constants ─────────────────────────────────────────────────────────────────

/** Max rows per table before truncation */
const MAX_TABLE_ROWS = 50;

/** Max chars per DOCX extraction */
const MAX_DOCX_CHARS = 12_000;

// ── HTML node helpers ─────────────────────────────────────────────────────────

/**
 * Minimal HTML parser — extracts structure from mammoth's HTML output.
 * We use a regex-based approach rather than a DOM parser to avoid adding
 * a browser-DOM dependency to the server bundle.
 *
 * mammoth produces clean, predictable HTML:
 *   <h1>…</h1>  <h2>…</h2>  …  <h6>…</h6>
 *   <p>…</p>
 *   <table><tr><td>…</td>…</tr>…</table>
 *   <strong>…</strong>  <em>…</em>  <br>
 *
 * We strip inline tags and extract text content.
 */

/** Strip all HTML tags and decode basic entities */
function stripTags(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&#x27;/g, "'")
    .trim();
}

/** Extract text content of a single tag match */
function innerText(tagHtml: string): string {
  return stripTags(tagHtml.replace(/^<[^>]+>/, '').replace(/<\/[^>]+>$/, ''));
}

// ── Table parser ──────────────────────────────────────────────────────────────

/**
 * Parse a <table>…</table> HTML string into a DocxTable.
 * Handles <tr>, <td>, <th> — ignores nested tables (mammoth doesn't produce them).
 */
function parseTable(tableHtml: string): DocxTable {
  // Extract all rows
  const rowMatches = tableHtml.match(/<tr[^>]*>([\s\S]*?)<\/tr>/gi) ?? [];
  const allRows: string[][] = rowMatches.map((rowHtml) => {
    const cellMatches = rowHtml.match(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi) ?? [];
    return cellMatches.map((cellHtml) => stripTags(cellHtml).replace(/\s+/g, ' ').trim());
  });

  if (allRows.length === 0) {
    return { headerRow: [], dataRows: [], totalRows: 0 };
  }

  const totalRows = allRows.length;
  const headerRow = allRows[0];
  const dataRows = allRows.slice(1, MAX_TABLE_ROWS + 1);

  return { headerRow, dataRows, totalRows };
}

// ── Markdown renderer ─────────────────────────────────────────────────────────

/**
 * Render a DocxTable as a Markdown pipe table.
 * Empty cells are rendered as a single space so the pipe structure is clear.
 */
function renderTableMarkdown(table: DocxTable): string {
  if (table.headerRow.length === 0 && table.dataRows.length === 0) return '';

  const cols = Math.max(
    table.headerRow.length,
    ...table.dataRows.map((r) => r.length),
  );
  if (cols === 0) return '';

  const pad = (cell: string) => ` ${cell || ' '} `;
  const separator = Array.from({ length: cols }, () => '---').join(' | ');

  const lines: string[] = [];

  // Header row
  const headerCells = Array.from({ length: cols }, (_, i) => pad(table.headerRow[i] ?? ''));
  lines.push(`|${headerCells.join('|')}|`);
  lines.push(`| ${separator} |`);

  // Data rows
  for (const row of table.dataRows) {
    const cells = Array.from({ length: cols }, (_, i) => pad(row[i] ?? ''));
    lines.push(`|${cells.join('|')}|`);
  }

  if (table.totalRows > table.dataRows.length + 1) {
    lines.push(`*(${table.totalRows - table.dataRows.length - 1} more rows truncated)*`);
  }

  return lines.join('\n');
}

/**
 * Render a DocxSection as Markdown.
 */
function renderSectionMarkdown(section: DocxSection): string {
  const lines: string[] = [];

  if (section.heading) {
    const prefix = '#'.repeat(Math.max(1, Math.min(6, section.level)));
    lines.push(`${prefix} ${section.heading}`);
    lines.push('');
  }

  for (const para of section.paragraphs) {
    if (para.trim()) {
      lines.push(para);
      lines.push('');
    }
  }

  for (const table of section.tables) {
    const tableMarkdown = renderTableMarkdown(table);
    if (tableMarkdown) {
      lines.push(tableMarkdown);
      lines.push('');
    }
  }

  return lines.join('\n');
}

// ── Main extractor ────────────────────────────────────────────────────────────

/**
 * Extract structured content from a DOCX buffer.
 *
 * Returns a DocxExtractionResult with:
 *   - sections: structured sections with headings, paragraphs, tables
 *   - markdown: flat Markdown for injection into the model prompt
 *   - statistics: headingCount, tableCount, paragraphCount, charCount, truncated
 *
 * Never throws — returns an error section if mammoth fails.
 */
export async function extractDocxStructured(
  buffer: Buffer,
  charBudget: number = MAX_DOCX_CHARS,
): Promise<DocxExtractionResult> {
  let html: string;

  try {
    const result = await mammoth.convertToHtml({ buffer });
    html = result.value;
  } catch {
    // Corrupt or unreadable .docx — return a minimal error result
    const errorMsg = '[Could not extract DOCX content — file may be corrupt or password-protected]';
    return {
      sections: [{ heading: '', level: 0, paragraphs: ['[Could not extract DOCX content]'], tables: [] }],
      markdown: errorMsg,
      charCount: errorMsg.length,
      headingCount: 0,
      tableCount: 0,
      paragraphCount: 0,
      truncated: false,
    };
  }

  // ── Parse HTML into sections ───────────────────────────────────────────────

  // Split HTML into top-level tokens: headings, paragraphs, tables
  // We process the HTML as a stream of tokens rather than a tree.
  const TOKEN_RE = /<(h[1-6]|p|table)[^>]*>([\s\S]*?)<\/(h[1-6]|p|table)>/gi;

  const sections: DocxSection[] = [];
  let currentSection: DocxSection = { heading: '', level: 0, paragraphs: [], tables: [] };

  let match: RegExpExecArray | null;
  while ((match = TOKEN_RE.exec(html)) !== null) {
    const tag = match[1].toLowerCase();
    const content = match[0];

    if (tag.startsWith('h') && tag.length === 2) {
      // Heading — start a new section
      const level = parseInt(tag[1], 10);
      const text = innerText(content);
      if (text) {
        // Save current section if it has content
        if (currentSection.heading || currentSection.paragraphs.length > 0 || currentSection.tables.length > 0) {
          sections.push(currentSection);
        }
        currentSection = { heading: text, level, paragraphs: [], tables: [] };
      }
    } else if (tag === 'p') {
      const text = innerText(content);
      if (text.trim()) {
        currentSection.paragraphs.push(text);
      }
    } else if (tag === 'table') {
      const table = parseTable(content);
      if (table.headerRow.length > 0 || table.dataRows.length > 0) {
        currentSection.tables.push(table);
      }
    }
  }

  // Push the last section
  if (currentSection.heading || currentSection.paragraphs.length > 0 || currentSection.tables.length > 0) {
    sections.push(currentSection);
  }

  // ── Statistics ─────────────────────────────────────────────────────────────

  const headingCount = sections.filter((s) => s.level > 0).length;
  const tableCount = sections.reduce((n, s) => n + s.tables.length, 0);
  const paragraphCount = sections.reduce((n, s) => n + s.paragraphs.length, 0);

  // ── Render Markdown with char budget ──────────────────────────────────────

  const budget = Math.min(charBudget, MAX_DOCX_CHARS);
  let markdown = '';
  let truncated = false;

  for (const section of sections) {
    const sectionMd = renderSectionMarkdown(section);
    if (markdown.length + sectionMd.length > budget) {
      // Truncate at section boundary
      const remaining = budget - markdown.length;
      if (remaining > 100) {
        markdown += sectionMd.slice(0, remaining) + '\n\n*(content truncated at character limit)*';
      } else {
        markdown += '\n\n*(content truncated at character limit)*';
      }
      truncated = true;
      break;
    }
    markdown += sectionMd;
  }

  if (!markdown.trim()) {
    markdown = '[No readable content found in DOCX]';
  }

  return {
    sections,
    markdown,
    charCount: markdown.length,
    headingCount,
    tableCount,
    paragraphCount,
    truncated,
  };
}

// ── Section index ─────────────────────────────────────────────────────────────

/**
 * Build a flat section index from extraction results.
 * Used by the whole-document comparison logic.
 */
export interface DocxSectionIndexEntry {
  heading: string;
  level: number;
  hasTables: boolean;
  tableCount: number;
  paragraphCount: number;
}

export function buildSectionIndex(result: DocxExtractionResult): DocxSectionIndexEntry[] {
  return result.sections
    .filter((s) => s.level > 0 || s.heading)
    .map((s) => ({
      heading: s.heading,
      level: s.level,
      hasTables: s.tables.length > 0,
      tableCount: s.tables.length,
      paragraphCount: s.paragraphs.length,
    }));
}

/**
 * Build a human-readable section summary for the model prompt.
 * Lists all headings found in the attachment with their table/paragraph counts.
 */
export function buildSectionSummary(result: DocxExtractionResult): string {
  const index = buildSectionIndex(result);
  if (index.length === 0) return '(no headings found — document may be unstructured)';

  return index.map((entry) => {
    const prefix = '  '.repeat(Math.max(0, entry.level - 1)) + '-';
    const details: string[] = [];
    if (entry.tableCount > 0) details.push(`${entry.tableCount} table${entry.tableCount > 1 ? 's' : ''}`);
    if (entry.paragraphCount > 0) details.push(`${entry.paragraphCount} paragraph${entry.paragraphCount > 1 ? 's' : ''}`);
    const detailStr = details.length > 0 ? ` (${details.join(', ')})` : '';
    return `${prefix} ${entry.heading}${detailStr}`;
  }).join('\n');
}
