/**
 * docx-table-enricher.ts
 * ──────────────────────
 * Post-processes mammoth HTML to inject table-style properties extracted
 * directly from the raw word/document.xml XML.
 *
 * Mammoth emits bare <table><tr><td> with no shading, borders, or widths.
 * This module reads the DOCX zip, parses the XML with lightweight regex
 * (no DOM / xmldom dependency), and injects inline style= attributes onto
 * <table>, <tr>, <th>, and <td> elements.
 *
 * Properties enriched:
 *   • Cell background fill  (w:shd @w:fill)
 *   • Cell/table borders    (w:tblBorders / w:tcBorders — single/thick/double)
 *   • Column widths         (w:tblGrid → w:gridCol @w:w, converted dxa→%)
 *   • Cell widths           (w:tcW @w:w, dxa→%)
 *
 * colspan / rowspan are already correct from mammoth — we do NOT touch them.
 *
 * Design constraints:
 *   • Pure regex XML parsing — no xmldom, no DOMParser, no native addons
 *   • No database / storage / Express imports
 *   • Idempotent: safe to call on already-enriched HTML
 *   • Cells remain plain HTML — never rasterised
 */

/* eslint-disable security/detect-unsafe-regex */
import JSZip from 'jszip';

// ─── Types ────────────────────────────────────────────────────────────────────

interface BorderSpec {
  val: string;   // e.g. "single", "thick", "double", "none", "nil"
  sz: number;    // eighths of a point (e.g. 4 = 0.5pt, 8 = 1pt)
  color: string; // hex without #, or "auto"
}

interface CellProps {
  fill: string | null;          // hex without # (e.g. "1E3A5F"), null = transparent
  widthPct: number | null;      // percentage of table width, null = auto
  borders: Partial<Record<'top' | 'right' | 'bottom' | 'left', BorderSpec>>;
}

interface TableProps {
  totalWidthDxa: number;        // w:tblW @w:w in dxa (twips)
  colWidthsDxa: number[];       // w:tblGrid → w:gridCol @w:w values
  borders: Partial<Record<'top' | 'right' | 'bottom' | 'left' | 'insideH' | 'insideV', BorderSpec>>;
}

// ─── XML helpers (regex-based, no DOM) ───────────────────────────────────────

/** Extract the text content of the first matching element */
function xmlAttr(xml: string, attr: string): string {
  const re = new RegExp(`${attr}="([^"]*)"`, 'i');
  return re.exec(xml)?.[1] ?? '';
}

/** Extract all occurrences of a self-closing or paired element */
function xmlAll(xml: string, tag: string): string[] {
  const results: string[] = [];
  // Match both <w:tag .../> and <w:tag ...>...</w:tag>
  const re = new RegExp(`<${tag}(?:\\s[^>]*)?>(?:[\\s\\S]*?)<\\/${tag}>|<${tag}(?:\\s[^>]*)?/>`, 'gi');
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml)) !== null) results.push(m[0]);
  return results;
}

/** Extract the first occurrence of a paired element (including its children) */
function xmlFirst(xml: string, tag: string): string | null {
  const re = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, 'i');
  return re.exec(xml)?.[0] ?? null;
}

/** Extract opening tag attributes string */
function xmlOpenTag(xml: string, tag: string): string | null {
  const re = new RegExp(`<${tag}((?:\\s[^>]*)?)(?:/>|>)`, 'i');
  return re.exec(xml)?.[0] ?? null;
}

// ─── Border parsing ───────────────────────────────────────────────────────────

const BORDER_SIDES = ['top', 'left', 'bottom', 'right', 'insideH', 'insideV'] as const;

function parseBorderEl(xml: string, side: string): BorderSpec | null {
  // Match e.g. <w:top w:val="single" w:sz="4" w:color="000000"/>
  const re = new RegExp(`<w:${side}\\s([^>]*?)(?:/>|>)`, 'i');
  const m = re.exec(xml);
  if (!m) return null;
  const attrs = m[1];
  const val = xmlAttr(attrs, 'w:val');
  if (!val || val === 'nil' || val === 'none') return null;
  const sz = parseInt(xmlAttr(attrs, 'w:sz') || '4', 10);
  const color = xmlAttr(attrs, 'w:color') || 'auto';
  return { val, sz, color };
}

function parseBorders(bordersXml: string): Partial<Record<string, BorderSpec>> {
  const result: Partial<Record<string, BorderSpec>> = {};
  for (const side of BORDER_SIDES) {
    const b = parseBorderEl(bordersXml, side);
    if (b) result[side] = b;
  }
  return result;
}

// ─── dxa → percentage conversion ─────────────────────────────────────────────

/** Convert dxa (twips, 1/1440 inch) width to a percentage of total table width */
function dxaToPct(dxa: number, totalDxa: number): number {
  if (!totalDxa) return 0;
  return Math.round((dxa / totalDxa) * 1000) / 10; // 1 decimal place
}

// ─── CSS value builders ───────────────────────────────────────────────────────

function borderCss(b: BorderSpec): string {
  const widthPt = b.sz / 8;
  const style = b.val === 'double' ? 'double' : b.val === 'thick' ? 'solid' : 'solid';
  const color = b.color === 'auto' ? '#000' : `#${b.color}`;
  return `${Math.max(widthPt, 0.5).toFixed(1)}pt ${style} ${color}`;
}

function cellStyleString(props: CellProps, tableBorders: TableProps['borders']): string {
  const parts: string[] = [];

  // Background fill
  if (props.fill && props.fill !== 'auto' && props.fill !== 'FFFFFF' && props.fill !== 'ffffff') {
    parts.push(`background:#${props.fill}!important`);
    // Auto-contrast text colour: dark fill → white text
    const lum = hexLuminance(props.fill);
    if (lum < 0.4) parts.push('color:#fff!important');
  }

  // Width
  if (props.widthPct !== null && props.widthPct > 0) {
    parts.push(`width:${props.widthPct}%`);
  }

  // Cell-level borders (override table borders)
  const sides: Array<['top' | 'right' | 'bottom' | 'left', 'top' | 'right' | 'bottom' | 'left']> = [
    ['top', 'top'], ['right', 'right'], ['bottom', 'bottom'], ['left', 'left'],
  ];
  for (const [cssSide, xmlSide] of sides) {
    const b = props.borders[xmlSide] ?? tableBorders[xmlSide];
    if (b) parts.push(`border-${cssSide}:${borderCss(b)}`);
  }

  return parts.join(';');
}

/** Approximate relative luminance from a 6-char hex string */
function hexLuminance(hex: string): number {
  const r = parseInt(hex.slice(0, 2), 16) / 255;
  const g = parseInt(hex.slice(2, 4), 16) / 255;
  const b = parseInt(hex.slice(4, 6), 16) / 255;
  const toLinear = (c: number) => c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
  return 0.2126 * toLinear(r) + 0.7152 * toLinear(g) + 0.0722 * toLinear(b);
}

// ─── DOCX XML parser ──────────────────────────────────────────────────────────

export interface ParsedTableData {
  tables: Array<{
    props: TableProps;
    rows: Array<Array<CellProps>>;
  }>;
}

/**
 * Parse word/document.xml from a DOCX buffer and extract table style data.
 * Returns one entry per <w:tbl> in document order.
 */
export async function parseDocxTableData(docxBuffer: Buffer): Promise<ParsedTableData> {
  const zip = await JSZip.loadAsync(docxBuffer);
  const docXmlFile = zip.file('word/document.xml');
  if (!docXmlFile) return { tables: [] };

  const docXml = await docXmlFile.async('string');
  const tables: ParsedTableData['tables'] = [];

  // Split on <w:tbl> boundaries — each chunk is one table
  const tblChunks = xmlAll(docXml, 'w:tbl');

  for (const tblXml of tblChunks) {
    // ── Table-level properties ──────────────────────────────────────────────
    const tblPrXml = xmlFirst(tblXml, 'w:tblPr') ?? '';
    const tblBordersXml = xmlFirst(tblPrXml, 'w:tblBorders') ?? '';
    const tableBorders = parseBorders(tblBordersXml) as TableProps['borders'];

    // Table total width
    const tblWTag = xmlOpenTag(tblPrXml, 'w:tblW') ?? '';
    const tblWType = xmlAttr(tblWTag, 'w:type');
    const tblWVal = parseInt(xmlAttr(tblWTag, 'w:w') || '0', 10);
    // Only use dxa widths; pct/nil/auto → use a standard A4 width (9360 dxa = 6.5")
    const totalWidthDxa = (tblWType === 'dxa' && tblWVal > 0) ? tblWVal : 9360;

    // Column widths from tblGrid
    const tblGridXml = xmlFirst(tblXml, 'w:tblGrid') ?? '';
    const gridColTags = xmlAll(tblGridXml, 'w:gridCol');
    const colWidthsDxa = gridColTags.map(tag => {
      const w = parseInt(xmlAttr(tag, 'w:w') || '0', 10);
      return w;
    });

    const tableProps: TableProps = { totalWidthDxa, colWidthsDxa, borders: tableBorders };

    // ── Rows ────────────────────────────────────────────────────────────────
    const rowChunks = xmlAll(tblXml, 'w:tr');
    const rows: Array<Array<CellProps>> = [];

    for (const rowXml of rowChunks) {
      const cellChunks = xmlAll(rowXml, 'w:tc');
      const cells: CellProps[] = [];

      for (const tcXml of cellChunks) {
        const tcPrXml = xmlFirst(tcXml, 'w:tcPr') ?? '';

        // Fill / shading
        const shdTag = xmlOpenTag(tcPrXml, 'w:shd') ?? '';
        const fill = xmlAttr(shdTag, 'w:fill') || null;
        const normalFill = fill && fill !== 'auto' && /^[0-9A-Fa-f]{6}$/.test(fill) ? fill.toUpperCase() : null;

        // Cell width
        const tcWTag = xmlOpenTag(tcPrXml, 'w:tcW') ?? '';
        const tcWType = xmlAttr(tcWTag, 'w:type');
        const tcWVal = parseInt(xmlAttr(tcWTag, 'w:w') || '0', 10);
        let widthPct: number | null = null;
        if (tcWType === 'dxa' && tcWVal > 0) {
          widthPct = dxaToPct(tcWVal, totalWidthDxa);
        } else if (tcWType === 'pct' && tcWVal > 0) {
          // OOXML pct is in fiftieths of a percent
          widthPct = Math.round(tcWVal / 50) / 10;
        }

        // Cell borders
        const tcBordersXml = xmlFirst(tcPrXml, 'w:tcBorders') ?? '';
        const cellBorders = parseBorders(tcBordersXml) as CellProps['borders'];

        cells.push({ fill: normalFill, widthPct, borders: cellBorders });
      }

      rows.push(cells);
    }

    tables.push({ props: tableProps, rows });
  }

  return { tables };
}

// ─── HTML enricher ────────────────────────────────────────────────────────────

/**
 * Inject table-style properties into mammoth HTML.
 *
 * Walks <table> elements in the HTML in the same order as the parsed XML data,
 * then walks <tr>/<td>/<th> within each table and merges style= attributes.
 *
 * Existing style= attributes on cells are preserved and extended (not replaced).
 */
export function enrichTableHtml(html: string, data: ParsedTableData): string {
  let tableIdx = 0;

  return html.replace(/<table([^>]*)>([\s\S]*?)<\/table>/gi, (fullMatch, tableAttrs, tableBody) => {
    const tableData = data.tables[tableIdx++];
    if (!tableData) return fullMatch;

    const { props: tableProps } = tableData;

    // Build colgroup if we have column widths
    let colgroup = '';
    if (tableProps.colWidthsDxa.length > 0) {
      const cols = tableProps.colWidthsDxa.map(dxa => {
        const pct = dxaToPct(dxa, tableProps.totalWidthDxa);
        return `<col style="width:${pct}%">`;
      }).join('');
      colgroup = `<colgroup>${cols}</colgroup>`;
    }

    // Enrich cells within this table
    let rowIdx = 0;
    const enrichedBody = tableBody.replace(/<tr([^>]*)>([\s\S]*?)<\/tr>/gi, (rowMatch, rowAttrs, rowBody) => {
      const rowData = tableData.rows[rowIdx++];
      if (!rowData) return rowMatch;

      let cellIdx = 0;
      const enrichedRow = rowBody.replace(/<(td|th)([^>]*)>/gi, (cellOpen, cellTag, cellAttrs) => {
        const cellProps = rowData[cellIdx++];
        if (!cellProps) return cellOpen;

        const styleStr = cellStyleString(cellProps, tableProps.borders);
        if (!styleStr) return cellOpen;

        // Merge with existing style= if present
        const existingStyle = /style="([^"]*)"/i.exec(cellAttrs)?.[1] ?? '';
        const mergedStyle = existingStyle ? `${existingStyle};${styleStr}` : styleStr;

        // Replace or inject style= attribute
        if (/style="/i.test(cellAttrs)) {
          const newAttrs = cellAttrs.replace(/style="[^"]*"/i, `style="${mergedStyle}"`);
          return `<${cellTag}${newAttrs}>`;
        }
        return `<${cellTag}${cellAttrs} style="${mergedStyle}">`;
      });

      return `<tr${rowAttrs}>${enrichedRow}</tr>`;
    });

    // Inject table-level border style if present
    const tblBorderParts: string[] = [];
    if (tableProps.borders.top) tblBorderParts.push(`border-top:${borderCss(tableProps.borders.top)}`);
    if (tableProps.borders.left) tblBorderParts.push(`border-left:${borderCss(tableProps.borders.left)}`);
    if (tableProps.borders.bottom) tblBorderParts.push(`border-bottom:${borderCss(tableProps.borders.bottom)}`);
    if (tableProps.borders.right) tblBorderParts.push(`border-right:${borderCss(tableProps.borders.right)}`);

    const existingTableStyle = /style="([^"]*)"/i.exec(tableAttrs)?.[1] ?? '';
    const tableStyleStr = tblBorderParts.length > 0
      ? (existingTableStyle ? `${existingTableStyle};${tblBorderParts.join(';')}` : tblBorderParts.join(';'))
      : existingTableStyle;

    let newTableAttrs = tableAttrs;
    if (tableStyleStr) {
      if (/style="/i.test(tableAttrs)) {
        newTableAttrs = tableAttrs.replace(/style="[^"]*"/i, `style="${tableStyleStr}"`);
      } else {
        newTableAttrs = `${tableAttrs} style="${tableStyleStr}"`;
      }
    }

    return `<table${newTableAttrs}>${colgroup}${enrichedBody}</table>`;
  });
}
