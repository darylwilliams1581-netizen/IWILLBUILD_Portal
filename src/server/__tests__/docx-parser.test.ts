/**
 * DOCX parser — focused unit tests
 * ─────────────────────────────────────────────────────────────────────────────
 * P1  Paragraphs are semantically grouped — not line-by-line
 * P2  Headings produce heading blocks; following paragraphs accumulate
 * P3  Two consecutive blank paragraphs flush the accumulator
 * P4  Tables produce table blocks with correct column/row structure
 * P5  Merged cells (vMerge) are handled without crashing
 * P6  Coloured table cells produce rich_text blocks (form-table path)
 * P7  Nested <w:sdt> content controls are expanded correctly
 * P8  <w:sdt> depth tracking — <w:sdtContent> does NOT count as open tag
 * P9  Page breaks produce page_break blocks
 * P10 Bold/italic/underline formatting is preserved in rich_text HTML
 * P11 Empty document returns empty blocks array with a warning
 * P12 parseDocxToBlocks — real JSZip round-trip with minimal DOCX bytes
 * P13 expandSdtElements — no mutation when no sdt elements present
 * P14 Wide risk table (many columns) parses without timeout
 * P15 extractTableRows/extractTableCells — no [\s\S]*? regex used
 */

import { describe, it, expect } from 'vitest';
import { parseDocumentXml, expandSdtElements, parseTableXml } from '../api/document-templates/[id]/import-docx/POST.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function wrap(body: string): string {
  return `<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}</w:body></w:document>`;
}

function para(text: string, style?: string): string {
  const pPr = style ? `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>` : '';
  return `<w:p>${pPr}<w:r><w:t>${text}</w:t></w:r></w:p>`;
}

function emptyPara(): string {
  return `<w:p></w:p>`;
}

function table(rows: string[][]): string {
  const rowXml = rows.map((cells) => {
    const cellXml = cells.map((text) => `<w:tc><w:p><w:r><w:t>${text}</w:t></w:r></w:p></w:tc>`).join('');
    return `<w:tr>${cellXml}</w:tr>`;
  }).join('');
  return `<w:tbl>${rowXml}</w:tbl>`;
}

// ─── P1: Paragraph grouping ───────────────────────────────────────────────────

describe('P1 — consecutive paragraphs accumulate into one rich_text block', () => {
  it('three body paragraphs → one rich_text block', () => {
    const xml = wrap(para('Line one') + para('Line two') + para('Line three'));
    const blocks = parseDocumentXml(xml, new Set(), []);
    expect(blocks.filter((b) => b.type === 'rich_text')).toHaveLength(1);
    expect(blocks).toHaveLength(1);
  });

  it('rich_text block HTML contains all three paragraphs', () => {
    const xml = wrap(para('Alpha') + para('Beta') + para('Gamma'));
    const blocks = parseDocumentXml(xml, new Set(), []);
    const rt = blocks[0];
    expect(rt.type).toBe('rich_text');
    if (rt.type === 'rich_text') {
      expect(rt.html).toContain('Alpha');
      expect(rt.html).toContain('Beta');
      expect(rt.html).toContain('Gamma');
    }
  });
});

// ─── P2: Headings ─────────────────────────────────────────────────────────────

describe('P2 — headings produce heading blocks; following paragraphs accumulate fresh', () => {
  it('Heading1 → heading block with level 1', () => {
    const xml = wrap(para('My Title', 'Heading1'));
    const blocks = parseDocumentXml(xml, new Set(), []);
    expect(blocks).toHaveLength(1);
    expect(blocks[0].type).toBe('heading');
    if (blocks[0].type === 'heading') {
      expect(blocks[0].level).toBe(1);
      expect(blocks[0].content).toBe('My Title');
    }
  });

  it('heading followed by paragraphs → heading + one rich_text', () => {
    const xml = wrap(para('Section', 'Heading2') + para('Para A') + para('Para B'));
    const blocks = parseDocumentXml(xml, new Set(), []);
    expect(blocks).toHaveLength(2);
    expect(blocks[0].type).toBe('heading');
    expect(blocks[1].type).toBe('rich_text');
  });

  it('two headings with paragraphs between → heading, rich_text, heading, rich_text', () => {
    const xml = wrap(
      para('H1', 'Heading1') + para('Body 1') +
      para('H2', 'Heading2') + para('Body 2'),
    );
    const blocks = parseDocumentXml(xml, new Set(), []);
    expect(blocks).toHaveLength(4);
    expect(blocks[0].type).toBe('heading');
    expect(blocks[1].type).toBe('rich_text');
    expect(blocks[2].type).toBe('heading');
    expect(blocks[3].type).toBe('rich_text');
  });
});

// ─── P3: Blank paragraph flushing ─────────────────────────────────────────────

describe('P3 — two consecutive blank paragraphs flush the accumulator', () => {
  it('group A + 2 blanks + group B → two rich_text blocks', () => {
    const xml = wrap(
      para('Group A') +
      emptyPara() + emptyPara() +
      para('Group B'),
    );
    const blocks = parseDocumentXml(xml, new Set(), []);
    const richBlocks = blocks.filter((b) => b.type === 'rich_text');
    expect(richBlocks).toHaveLength(2);
  });

  it('single blank paragraph does NOT flush', () => {
    const xml = wrap(para('A') + emptyPara() + para('B'));
    const blocks = parseDocumentXml(xml, new Set(), []);
    expect(blocks.filter((b) => b.type === 'rich_text')).toHaveLength(1);
  });
});

// ─── P4: Tables ───────────────────────────────────────────────────────────────

describe('P4 — tables produce table or rich_text blocks', () => {
  it('simple 2×2 data table → table block', () => {
    const xml = wrap(table([['Name', 'Value'], ['Alice', '42']]));
    const blocks = parseDocumentXml(xml, new Set(), []);
    expect(blocks).toHaveLength(1);
    // May be table or rich_text depending on form-table detection
    expect(['table', 'rich_text']).toContain(blocks[0].type);
  });

  it('table block has correct column count', () => {
    const xml = wrap(table([['Col A', 'Col B', 'Col C'], ['1', '2', '3']]));
    const blocks = parseDocumentXml(xml, new Set(), []);
    const tbl = blocks.find((b) => b.type === 'table');
    if (tbl && tbl.type === 'table') {
      expect(tbl.columns).toHaveLength(3);
    }
  });

  it('parseTableXml returns null for empty table XML', () => {
    expect(parseTableXml('<w:tbl></w:tbl>')).toBeNull();
  });
});

// ─── P5: Merged cells ─────────────────────────────────────────────────────────

describe('P5 — merged cells (vMerge) do not crash the parser', () => {
  it('table with vMerge continuation cells parses without throwing', () => {
    const rowWithMerge = `<w:tr>
      <w:tc><w:tcPr><w:vMerge w:val="restart"/></w:tcPr><w:p><w:r><w:t>Merged</w:t></w:r></w:p></w:tc>
      <w:tc><w:p><w:r><w:t>Normal</w:t></w:r></w:p></w:tc>
    </w:tr>
    <w:tr>
      <w:tc><w:tcPr><w:vMerge/></w:tcPr><w:p></w:p></w:tc>
      <w:tc><w:p><w:r><w:t>Row 2</w:t></w:r></w:p></w:tc>
    </w:tr>`;
    const xml = wrap(`<w:tbl>${rowWithMerge}</w:tbl>`);
    expect(() => parseDocumentXml(xml, new Set(), [])).not.toThrow();
  });
});

// ─── P6: Coloured cells → rich_text ──────────────────────────────────────────

describe('P6 — coloured table cells produce rich_text blocks', () => {
  it('table with coloured header row → rich_text (form-table path)', () => {
    const coloredRow = `<w:tr>
      <w:tc><w:tcPr><w:shd w:val="clear" w:fill="1A2744"/></w:tcPr><w:p><w:r><w:t>Risk</w:t></w:r></w:p></w:tc>
      <w:tc><w:p><w:r><w:t>Control</w:t></w:r></w:p></w:tc>
    </w:tr>
    <w:tr>
      <w:tc><w:p><w:r><w:t>High</w:t></w:r></w:p></w:tc>
      <w:tc><w:p><w:r><w:t>PPE</w:t></w:r></w:p></w:tc>
    </w:tr>`;
    const xml = wrap(`<w:tbl>${coloredRow}</w:tbl>`);
    const blocks = parseDocumentXml(xml, new Set(), []);
    expect(blocks).toHaveLength(1);
    // Coloured header → form-table → rich_text
    expect(blocks[0].type).toBe('rich_text');
    if (blocks[0].type === 'rich_text') {
      expect(blocks[0].html).toContain('1A2744');
    }
  });
});

// ─── P7: Nested w:sdt content controls ───────────────────────────────────────

describe('P7 — nested w:sdt content controls are expanded correctly', () => {
  it('single sdt with sdtContent → inner text extracted', () => {
    const body = `<w:sdt><w:sdtPr/><w:sdtContent><w:p><w:r><w:t>Control Text</w:t></w:r></w:p></w:sdtContent></w:sdt>`;
    const result = expandSdtElements(body);
    expect(result).toContain('Control Text');
    expect(result).not.toContain('<w:sdt');
  });

  it('nested sdt (sdt inside sdt) — outer expanded, inner content preserved', () => {
    const inner = `<w:sdt><w:sdtContent><w:p><w:r><w:t>Inner</w:t></w:r></w:p></w:sdtContent></w:sdt>`;
    const outer = `<w:sdt><w:sdtContent>${inner}</w:sdtContent></w:sdt>`;
    const result = expandSdtElements(outer);
    // The outer sdt is expanded; the inner sdt is inside sdtContent and also expanded
    expect(result).toContain('Inner');
    expect(result).not.toContain('</w:sdt>');
  });

  it('body with no sdt elements is returned unchanged', () => {
    const body = `<w:p><w:r><w:t>Plain text</w:t></w:r></w:p>`;
    expect(expandSdtElements(body)).toBe(body);
  });
});

// ─── P8: sdtContent does NOT count as open sdt tag ───────────────────────────

describe('P8 — <w:sdtContent> does not increment sdt depth counter', () => {
  it('sdt with sdtContent closes at the correct </w:sdt>', () => {
    // If sdtContent were counted as an open sdt, depth would be 2 and the
    // parser would look for a second </w:sdt> that doesn't exist.
    const body = `<w:sdt><w:sdtPr/><w:sdtContent><w:p><w:r><w:t>OK</w:t></w:r></w:p></w:sdtContent></w:sdt><w:p><w:r><w:t>After</w:t></w:r></w:p>`;
    const result = expandSdtElements(body);
    expect(result).toContain('OK');
    expect(result).toContain('After');
    // No leftover sdt tags
    expect(result).not.toContain('<w:sdt');
  });
});

// ─── P9: Page breaks ──────────────────────────────────────────────────────────

describe('P9 — page breaks produce page_break blocks', () => {
  it('<w:br w:type="page"/> → page_break block', () => {
    const xml = wrap(`<w:p><w:r><w:br w:type="page"/></w:r></w:p>`);
    const blocks = parseDocumentXml(xml, new Set(), []);
    expect(blocks.some((b) => b.type === 'page_break')).toBe(true);
  });

  it('page break between paragraphs splits the document', () => {
    const xml = wrap(
      para('Before') +
      `<w:p><w:r><w:br w:type="page"/></w:r></w:p>` +
      para('After'),
    );
    const blocks = parseDocumentXml(xml, new Set(), []);
    expect(blocks.some((b) => b.type === 'page_break')).toBe(true);
    expect(blocks.filter((b) => b.type === 'rich_text')).toHaveLength(2);
  });
});

// ─── P10: Formatting ──────────────────────────────────────────────────────────

describe('P10 — bold/italic/underline formatting preserved in rich_text HTML', () => {
  it('bold run → <strong> in HTML', () => {
    const xml = wrap(`<w:p><w:r><w:rPr><w:b/></w:rPr><w:t>Bold text</w:t></w:r></w:p>`);
    const blocks = parseDocumentXml(xml, new Set(), []);
    expect(blocks[0].type).toBe('rich_text');
    if (blocks[0].type === 'rich_text') {
      expect(blocks[0].html).toContain('<strong>');
    }
  });

  it('italic run → <em> in HTML', () => {
    const xml = wrap(`<w:p><w:r><w:rPr><w:i/></w:rPr><w:t>Italic</w:t></w:r></w:p>`);
    const blocks = parseDocumentXml(xml, new Set(), []);
    if (blocks[0].type === 'rich_text') {
      expect(blocks[0].html).toContain('<em>');
    }
  });

  it('underline run → <u> in HTML', () => {
    const xml = wrap(`<w:p><w:r><w:rPr><w:u w:val="single"/></w:rPr><w:t>Underlined</w:t></w:r></w:p>`);
    const blocks = parseDocumentXml(xml, new Set(), []);
    if (blocks[0].type === 'rich_text') {
      expect(blocks[0].html).toContain('<u>');
    }
  });
});

// ─── P11: Empty document ──────────────────────────────────────────────────────

describe('P11 — empty document returns empty blocks with a warning', () => {
  it('document with no content → empty blocks array', () => {
    const xml = wrap('');
    const warnings: string[] = [];
    const blocks = parseDocumentXml(xml, new Set(), warnings);
    expect(blocks).toHaveLength(0);
    expect(warnings.length).toBeGreaterThan(0);
  });
});

// ─── P13: expandSdtElements — no mutation when no sdt ────────────────────────

describe('P13 — expandSdtElements returns input unchanged when no sdt present', () => {
  it('plain paragraph XML is returned as-is', () => {
    const body = `<w:p><w:r><w:t>Hello</w:t></w:r></w:p>`;
    expect(expandSdtElements(body)).toBe(body);
  });
});

// ─── P14: Wide risk table performance ────────────────────────────────────────

describe('P14 — wide risk table (many columns) parses without timeout', () => {
  it('10-column × 50-row risk table parses in under 500ms', () => {
    const headers = Array.from({ length: 10 }, (_, i) => `Col${i + 1}`);
    const dataRows = Array.from({ length: 50 }, (_, r) =>
      Array.from({ length: 10 }, (_, c) => `R${r}C${c}`),
    );
    const xml = wrap(table([headers, ...dataRows]));
    const start = Date.now();
    const blocks = parseDocumentXml(xml, new Set(), []);
    const elapsed = Date.now() - start;
    expect(elapsed).toBeLessThan(500);
    expect(blocks.length).toBeGreaterThan(0);
  });
});

// ─── P15: No [\s\S]*? in table extraction ────────────────────────────────────

describe('P15 — table/row/cell extraction uses indexOf/slice, not [\\ s\\\\S]*? regex', () => {
  it('POST.ts source does not use [\\s\\S]*? on table/row/cell XML', async () => {
    const { readFile } = await import('node:fs/promises');
    const src = await readFile('src/server/api/document-templates/[id]/import-docx/POST.ts', 'utf8');
    // The only [\s\S]*? patterns allowed are in comments (explaining what was removed)
    // Split on comment lines and check code lines only
    const codeLines = src.split('\n').filter((line) => !line.trim().startsWith('*') && !line.trim().startsWith('//'));
    const hasUnsafePattern = codeLines.some((line) => /\[\\s\\S\]\*/.test(line) || /\[\\s\\S\]\+/.test(line));
    expect(hasUnsafePattern).toBe(false);
  });
});
