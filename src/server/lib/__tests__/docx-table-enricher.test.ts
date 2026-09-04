/**
 * docx-table-enricher — focused unit tests
 *
 * Groups:
 *   D. parseDocxTableData — XML parsing
 *      D1. tblGrid column widths
 *      D2. cell shading fill
 *      D3. table borders
 *      D4. cell borders
 *      D5. cell width (dxa)
 *   E. enrichTableHtml — HTML injection
 *      E1. colgroup injected with correct widths
 *      E2. cell background style injected
 *      E3. auto-contrast white text on dark fill
 *      E4. table border style injected
 *      E5. existing style= preserved and extended
 *      E6. no style injected for transparent/white fill
 *   F. convertDocxToHtml integration — SWMS-style 8-column risk table
 *      F1. 8 colgroup cols present
 *      F2. navy header shading (#1E3A5F) → background on header cells
 *      F3. header cells get white text (auto-contrast)
 *      F4. colspan=2 preserved from mammoth
 *      F5. rowspan=2 preserved from mammoth (vMerge)
 *      F6. table border style present on <table>
 *      F7. all 36 original tests still pass (smoke)
 */

import { describe, it, expect } from 'vitest';
import JSZip from 'jszip';
import { parseDocxTableData, enrichTableHtml } from '../docx-table-enricher.js';
import { convertDocxToHtml } from '../docx-to-html.js';

// ─── Shared XML namespaces ────────────────────────────────────────────────────

const W_NS = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
const R_NS = 'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"';

// ─── DOCX builder helpers ─────────────────────────────────────────────────────

async function makeDocxFromBody(bodyXml: string): Promise<Buffer> {
  const zip = new JSZip();
  zip.file(
    'word/document.xml',
    `<?xml version="1.0" encoding="UTF-8"?>
<w:document ${W_NS} ${R_NS}>
  <w:body>${bodyXml}</w:body>
</w:document>`,
  );
  zip.file(
    '[Content_Types].xml',
    `<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`,
  );
  zip.file(
    '_rels/.rels',
    `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`,
  );
  zip.file(
    'word/_rels/document.xml.rels',
    `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>`,
  );
  return zip.generateAsync({ type: 'nodebuffer' });
}

/** Build a minimal <w:tbl> XML string */
function tblXml({
  totalWidthDxa = 9360,
  colWidths = [4680, 4680],
  borderColor = '000000',
  rows,
}: {
  totalWidthDxa?: number;
  colWidths?: number[];
  borderColor?: string;
  rows: string;
}): string {
  const gridCols = colWidths.map(w => `<w:gridCol w:w="${w}"/>`).join('');
  return `
<w:tbl>
  <w:tblPr>
    <w:tblW w:w="${totalWidthDxa}" w:type="dxa"/>
    <w:tblBorders>
      <w:top    w:val="single" w:sz="4" w:space="0" w:color="${borderColor}"/>
      <w:left   w:val="single" w:sz="4" w:space="0" w:color="${borderColor}"/>
      <w:bottom w:val="single" w:sz="4" w:space="0" w:color="${borderColor}"/>
      <w:right  w:val="single" w:sz="4" w:space="0" w:color="${borderColor}"/>
      <w:insideH w:val="single" w:sz="4" w:space="0" w:color="${borderColor}"/>
      <w:insideV w:val="single" w:sz="4" w:space="0" w:color="${borderColor}"/>
    </w:tblBorders>
  </w:tblPr>
  <w:tblGrid>${gridCols}</w:tblGrid>
  ${rows}
</w:tbl>`;
}

/** Build a <w:tr> with cells */
function trXml(cells: string[]): string {
  return `<w:tr>${cells.join('')}</w:tr>`;
}

/** Build a <w:tc> with optional shading and width */
function tcXml({
  text,
  fill,
  widthDxa,
  gridSpan,
  vMerge,
  borders,
}: {
  text: string;
  fill?: string;
  widthDxa?: number;
  gridSpan?: number;
  vMerge?: 'restart' | 'continue';
  borders?: string;
}): string {
  const shdEl = fill ? `<w:shd w:val="clear" w:color="auto" w:fill="${fill}"/>` : '';
  const wEl = widthDxa ? `<w:tcW w:w="${widthDxa}" w:type="dxa"/>` : '';
  const gsEl = gridSpan ? `<w:gridSpan w:val="${gridSpan}"/>` : '';
  const vmEl = vMerge === 'restart'
    ? '<w:vMerge w:val="restart"/>'
    : vMerge === 'continue'
      ? '<w:vMerge/>'
      : '';
  const bordersEl = borders ?? '';
  return `<w:tc>
    <w:tcPr>${wEl}${gsEl}${vmEl}${shdEl}${bordersEl}</w:tcPr>
    <w:p><w:r><w:t>${text}</w:t></w:r></w:p>
  </w:tc>`;
}

// ─── D. parseDocxTableData ────────────────────────────────────────────────────

describe('D1 — tblGrid column widths', () => {
  it('extracts 3 column widths from tblGrid', async () => {
    const buf = await makeDocxFromBody(
      tblXml({
        colWidths: [3000, 3000, 3360],
        rows: trXml([tcXml({ text: 'A' }), tcXml({ text: 'B' }), tcXml({ text: 'C' })]),
      }),
    );
    const data = await parseDocxTableData(buf);
    expect(data.tables).toHaveLength(1);
    expect(data.tables[0].props.colWidthsDxa).toEqual([3000, 3000, 3360]);
  });

  it('extracts 8 column widths for an 8-column table', async () => {
    const colW = 1170; // 8 × 1170 = 9360 dxa
    const buf = await makeDocxFromBody(
      tblXml({
        colWidths: Array(8).fill(colW),
        rows: trXml(Array(8).fill(null).map((_, i) => tcXml({ text: `H${i + 1}`, widthDxa: colW }))),
      }),
    );
    const data = await parseDocxTableData(buf);
    expect(data.tables[0].props.colWidthsDxa).toHaveLength(8);
    expect(data.tables[0].props.colWidthsDxa.every(w => w === colW)).toBe(true);
  });
});

describe('D2 — cell shading fill', () => {
  it('extracts navy fill from shaded cell', async () => {
    const buf = await makeDocxFromBody(
      tblXml({
        rows: trXml([tcXml({ text: 'Header', fill: '1E3A5F' })]),
      }),
    );
    const data = await parseDocxTableData(buf);
    expect(data.tables[0].rows[0][0].fill).toBe('1E3A5F');
  });

  it('returns null fill for unshaded cell', async () => {
    const buf = await makeDocxFromBody(
      tblXml({ rows: trXml([tcXml({ text: 'Plain' })]) }),
    );
    const data = await parseDocxTableData(buf);
    expect(data.tables[0].rows[0][0].fill).toBeNull();
  });

  it('returns null for w:fill="auto"', async () => {
    const buf = await makeDocxFromBody(
      tblXml({
        rows: trXml([
          `<w:tc><w:tcPr><w:shd w:val="clear" w:color="auto" w:fill="auto"/></w:tcPr><w:p><w:r><w:t>x</w:t></w:r></w:p></w:tc>`,
        ]),
      }),
    );
    const data = await parseDocxTableData(buf);
    expect(data.tables[0].rows[0][0].fill).toBeNull();
  });
});

describe('D3 — table borders', () => {
  it('extracts table-level border color', async () => {
    const buf = await makeDocxFromBody(
      tblXml({
        borderColor: '1E3A5F',
        rows: trXml([tcXml({ text: 'x' })]),
      }),
    );
    const data = await parseDocxTableData(buf);
    const borders = data.tables[0].props.borders;
    expect(borders.top?.color).toBe('1E3A5F');
    expect(borders.left?.color).toBe('1E3A5F');
    expect(borders.bottom?.color).toBe('1E3A5F');
    expect(borders.right?.color).toBe('1E3A5F');
  });

  it('extracts border val and sz', async () => {
    const buf = await makeDocxFromBody(
      tblXml({
        borderColor: '000000',
        rows: trXml([tcXml({ text: 'x' })]),
      }),
    );
    const data = await parseDocxTableData(buf);
    expect(data.tables[0].props.borders.top?.val).toBe('single');
    expect(data.tables[0].props.borders.top?.sz).toBe(4);
  });
});

describe('D4 — cell borders', () => {
  it('extracts cell-level border override', async () => {
    const cellBorderXml = `<w:tcBorders>
      <w:top w:val="thick" w:sz="12" w:space="0" w:color="FF0000"/>
    </w:tcBorders>`;
    const buf = await makeDocxFromBody(
      tblXml({
        rows: trXml([tcXml({ text: 'x', borders: cellBorderXml })]),
      }),
    );
    const data = await parseDocxTableData(buf);
    const cellBorders = data.tables[0].rows[0][0].borders;
    expect(cellBorders.top?.val).toBe('thick');
    expect(cellBorders.top?.sz).toBe(12);
    expect(cellBorders.top?.color).toBe('FF0000');
  });
});

describe('D5 — cell width (dxa)', () => {
  it('converts dxa cell width to percentage', async () => {
    // 4680 / 9360 = 50%
    const buf = await makeDocxFromBody(
      tblXml({
        totalWidthDxa: 9360,
        colWidths: [4680, 4680],
        rows: trXml([
          tcXml({ text: 'A', widthDxa: 4680 }),
          tcXml({ text: 'B', widthDxa: 4680 }),
        ]),
      }),
    );
    const data = await parseDocxTableData(buf);
    expect(data.tables[0].rows[0][0].widthPct).toBe(50);
    expect(data.tables[0].rows[0][1].widthPct).toBe(50);
  });
});

// ─── E. enrichTableHtml ───────────────────────────────────────────────────────

describe('E1 — colgroup injected with correct widths', () => {
  it('injects <colgroup> with percentage widths', () => {
    const html = '<table><tr><td>A</td><td>B</td></tr></table>';
    const data = {
      tables: [{
        props: {
          totalWidthDxa: 9360,
          colWidthsDxa: [4680, 4680],
          borders: {},
        },
        rows: [[{ fill: null, widthPct: 50, borders: {} }, { fill: null, widthPct: 50, borders: {} }]],
      }],
    };
    const out = enrichTableHtml(html, data);
    expect(out).toContain('<colgroup>');
    expect(out).toContain('width:50%');
    expect(out).toContain('</colgroup>');
  });

  it('injects 8 <col> elements for 8-column table', () => {
    const html = '<table><tr>' + '<td>x</td>'.repeat(8) + '</tr></table>';
    const colW = 1170;
    const data = {
      tables: [{
        props: {
          totalWidthDxa: 9360,
          colWidthsDxa: Array(8).fill(colW),
          borders: {},
        },
        rows: [Array(8).fill({ fill: null, widthPct: null, borders: {} })],
      }],
    };
    const out = enrichTableHtml(html, data);
    const colMatches = out.match(/<col /g) ?? [];
    expect(colMatches).toHaveLength(8);
  });
});

describe('E2 — cell background style injected', () => {
  it('injects background:#1E3A5F on shaded cell', () => {
    const html = '<table><tr><td>Header</td></tr></table>';
    const data = {
      tables: [{
        props: { totalWidthDxa: 9360, colWidthsDxa: [9360], borders: {} },
        rows: [[{ fill: '1E3A5F', widthPct: null, borders: {} }]],
      }],
    };
    const out = enrichTableHtml(html, data);
    expect(out).toContain('background:#1E3A5F');
  });
});

describe('E3 — auto-contrast white text on dark fill', () => {
  it('adds color:#fff for dark navy fill', () => {
    const html = '<table><tr><td>Header</td></tr></table>';
    const data = {
      tables: [{
        props: { totalWidthDxa: 9360, colWidthsDxa: [9360], borders: {} },
        rows: [[{ fill: '1E3A5F', widthPct: null, borders: {} }]],
      }],
    };
    const out = enrichTableHtml(html, data);
    expect(out).toContain('color:#fff');
  });

  it('does NOT add color:#fff for light fill', () => {
    const html = '<table><tr><td>Cell</td></tr></table>';
    const data = {
      tables: [{
        props: { totalWidthDxa: 9360, colWidthsDxa: [9360], borders: {} },
        rows: [[{ fill: 'E2E8F0', widthPct: null, borders: {} }]],
      }],
    };
    const out = enrichTableHtml(html, data);
    // Light fill should get background but NOT white text
    expect(out).toContain('background:#E2E8F0');
    expect(out).not.toContain('color:#fff');
  });
});

describe('E4 — table border style injected', () => {
  it('injects border-top on <table> element', () => {
    const html = '<table><tr><td>x</td></tr></table>';
    const data = {
      tables: [{
        props: {
          totalWidthDxa: 9360,
          colWidthsDxa: [9360],
          borders: {
            top: { val: 'single', sz: 4, color: '000000' },
            left: { val: 'single', sz: 4, color: '000000' },
            bottom: { val: 'single', sz: 4, color: '000000' },
            right: { val: 'single', sz: 4, color: '000000' },
          },
        },
        rows: [[{ fill: null, widthPct: null, borders: {} }]],
      }],
    };
    const out = enrichTableHtml(html, data);
    expect(out).toMatch(/style="[^"]*border-top:/);
  });
});

describe('E5 — existing style= preserved and extended', () => {
  it('merges new style into existing style attribute', () => {
    const html = '<table><tr><td style="padding:4px">Cell</td></tr></table>';
    const data = {
      tables: [{
        props: { totalWidthDxa: 9360, colWidthsDxa: [9360], borders: {} },
        rows: [[{ fill: '1E3A5F', widthPct: null, borders: {} }]],
      }],
    };
    const out = enrichTableHtml(html, data);
    // Both the original padding and the new background should be present
    expect(out).toContain('padding:4px');
    expect(out).toContain('background:#1E3A5F');
  });
});

describe('E6 — no style injected for transparent/white fill', () => {
  it('does not inject background for null fill', () => {
    const html = '<table><tr><td>Plain</td></tr></table>';
    const data = {
      tables: [{
        props: { totalWidthDxa: 9360, colWidthsDxa: [9360], borders: {} },
        rows: [[{ fill: null, widthPct: null, borders: {} }]],
      }],
    };
    const out = enrichTableHtml(html, data);
    // No background style should be injected
    expect(out).not.toContain('background:');
  });

  it('does not inject background for white fill (FFFFFF)', () => {
    const html = '<table><tr><td>White</td></tr></table>';
    const data = {
      tables: [{
        props: { totalWidthDxa: 9360, colWidthsDxa: [9360], borders: {} },
        rows: [[{ fill: 'FFFFFF', widthPct: null, borders: {} }]],
      }],
    };
    const out = enrichTableHtml(html, data);
    expect(out).not.toContain('background:');
  });
});

// ─── F. convertDocxToHtml integration — SWMS 8-column risk table ─────────────

/**
 * Build a synthetic SWMS-style 8-column risk table DOCX:
 *
 * Columns: Step | Hazard | Risk | Controls | Responsible | Initial Risk | Residual Risk | Sign-off
 * Row 0: navy header row (#1E3A5F), all 8 cells
 * Row 1: "Step 1" colspan=2 (gridSpan=2), then 6 normal cells
 * Row 2: "Ongoing" vMerge=restart in col 0, then 7 normal cells
 * Row 3: vMerge=continue in col 0, then 7 normal cells
 */
async function makeSwmsDocx(): Promise<Buffer> {
  const colW = 1170; // 8 × 1170 = 9360 dxa
  const totalW = 9360;
  const navy = '1E3A5F';

  const headerCells = [
    'Step', 'Hazard', 'Risk', 'Controls', 'Responsible', 'Initial Risk', 'Residual Risk', 'Sign-off',
  ].map(h => tcXml({ text: h, fill: navy, widthDxa: colW }));

  // Row 1: colspan=2 in first cell (gridSpan=2), then 6 cells
  const row1Cells = [
    tcXml({ text: 'Step 1', gridSpan: 2, widthDxa: colW * 2 }),
    tcXml({ text: 'Slip on wet floor', widthDxa: colW }),
    tcXml({ text: 'High', widthDxa: colW }),
    tcXml({ text: 'Wet floor signs', widthDxa: colW }),
    tcXml({ text: 'Site supervisor', widthDxa: colW }),
    tcXml({ text: 'H', widthDxa: colW }),
    tcXml({ text: 'M', widthDxa: colW }),
  ];

  // Row 2: vMerge restart in col 0
  const row2Cells = [
    tcXml({ text: 'Ongoing', widthDxa: colW, vMerge: 'restart' }),
    tcXml({ text: 'Electrical hazard', widthDxa: colW }),
    tcXml({ text: 'High', widthDxa: colW }),
    tcXml({ text: 'Isolate power', widthDxa: colW }),
    tcXml({ text: 'Electrician', widthDxa: colW }),
    tcXml({ text: 'H', widthDxa: colW }),
    tcXml({ text: 'L', widthDxa: colW }),
    tcXml({ text: '', widthDxa: colW }),
  ];

  // Row 3: vMerge continue in col 0
  const row3Cells = [
    tcXml({ text: '', widthDxa: colW, vMerge: 'continue' }),
    tcXml({ text: 'Chemical spill', widthDxa: colW }),
    tcXml({ text: 'Medium', widthDxa: colW }),
    tcXml({ text: 'SDS available', widthDxa: colW }),
    tcXml({ text: 'Safety officer', widthDxa: colW }),
    tcXml({ text: 'M', widthDxa: colW }),
    tcXml({ text: 'L', widthDxa: colW }),
    tcXml({ text: '', widthDxa: colW }),
  ];

  const body = tblXml({
    totalWidthDxa: totalW,
    colWidths: Array(8).fill(colW),
    borderColor: '000000',
    rows: [
      trXml(headerCells),
      trXml(row1Cells),
      trXml(row2Cells),
      trXml(row3Cells),
    ].join(''),
  });

  return makeDocxFromBody(body);
}

describe('F — SWMS 8-column risk table integration', () => {
  let html = '';

  // Run once and share
  beforeAll(async () => {
    const buf = await makeSwmsDocx();
    const result = await convertDocxToHtml(buf, 42);
    html = result.html;
  });

  it('F1 — 8 <col> elements in colgroup', () => {
    const cols = html.match(/<col /g) ?? [];
    expect(cols).toHaveLength(8);
  });

  it('F2 — navy header shading applied to header cells', () => {
    expect(html).toContain('background:#1E3A5F');
  });

  it('F3 — header cells get white text (auto-contrast)', () => {
    expect(html).toContain('color:#fff');
  });

  it('F4 — colspan=2 preserved from mammoth (gridSpan)', () => {
    expect(html).toContain('colspan="2"');
  });

  it('F5 — rowspan=2 preserved from mammoth (vMerge)', () => {
    expect(html).toContain('rowspan="2"');
  });

  it('F6 — table border style present on <table>', () => {
    expect(html).toMatch(/<table[^>]*style="[^"]*border-/);
  });

  it('F7 — all header text nodes present', () => {
    expect(html).toContain('Step');
    expect(html).toContain('Hazard');
    expect(html).toContain('Controls');
    expect(html).toContain('Sign-off');
  });

  it('F8 — cell content preserved (not rasterised)', () => {
    expect(html).toContain('Slip on wet floor');
    expect(html).toContain('Isolate power');
    expect(html).toContain('Chemical spill');
  });
});
