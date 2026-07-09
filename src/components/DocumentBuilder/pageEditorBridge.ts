/**
 * PageEditor HTML ↔ Blocks Bridge
 * ─────────────────────────────────────────────────────────────────────────────
 * Converts between:
 *   - The page editor's contenteditable HTML (what the user sees/types)
 *   - The underlying DocumentBlock[] JSON (what gets stored / exported to PDF)
 *
 * Rules:
 *   - heading[1-4]   → HeadingBlock
 *   - p               → TextBlock (plain) or RichTextBlock (has inline formatting)
 *   - ul / ol         → RichTextBlock wrapping the list
 *   - table           → TableBlock (static mode)
 *   - hr              → DividerBlock
 *   - [data-block-id] → preserved as-is (special blocks: field, banner, etc.)
 *   - Everything else → RichTextBlock
 */

import { nanoid } from 'nanoid';
import type { DocumentBlock, HeadingBlock, TextBlock, RichTextBlock, DividerBlock, TableBlock } from './types';

// ── Blocks → HTML (deserialise for display) ───────────────────────────────────

export function blocksToHtml(blocks: DocumentBlock[]): string {
  return blocks.map(blockToHtml).join('\n');
}

function blockToHtml(block: DocumentBlock): string {
  switch (block.type) {
    case 'heading': {
      const b = block as HeadingBlock;
      const tag = `h${b.level}`;
      const align = b.align !== 'left' ? ` style="text-align:${b.align}"` : '';
      return `<${tag} data-block-id="${b.id}"${align}>${escHtml(b.content)}</${tag}>`;
    }

    case 'text': {
      const b = block as TextBlock;
      const align = b.align !== 'left' ? ` style="text-align:${b.align}"` : '';
      let inner = escHtml(b.content);
      if (b.bold) inner = `<strong>${inner}</strong>`;
      if (b.italic) inner = `<em>${inner}</em>`;
      return `<p data-block-id="${b.id}"${align}>${inner}</p>`;
    }

    case 'rich_text': {
      const b = block as RichTextBlock;
      // Wrap in a div so we can attach the block id
      return `<div data-block-id="${b.id}" data-block-type="rich_text">${b.html}</div>`;
    }

    case 'divider':
      return `<hr data-block-id="${block.id}" />`;

    case 'page_break':
      return `<div data-block-id="${block.id}" data-block-type="page_break" class="page-break-marker" contenteditable="false">— Page Break —</div>`;

    case 'spacer':
      return `<div data-block-id="${block.id}" data-block-type="spacer" style="height:${(block as { height: number }).height}px" contenteditable="false"></div>`;

    case 'table': {
      const b = block as TableBlock;
      const cols = b.columns;
      let html = `<table data-block-id="${b.id}" data-block-type="table"><thead><tr>`;
      for (const col of cols) {
        html += `<th>${escHtml(col.header)}</th>`;
      }
      html += '</tr></thead><tbody>';
      for (const row of b.rows) {
        html += '<tr>';
        for (const col of cols) {
          html += `<td>${escHtml(row.cells[col.id] ?? '')}</td>`;
        }
        html += '</tr>';
      }
      html += '</tbody></table>';
      return html;
    }

    case 'banner':
    case 'field':
    case 'system_field':
    case 'safety_badge_row':
    case 'columns':
    case 'image': {
      // Special blocks: render as a non-editable placeholder chip
      const label = getSpecialBlockLabel(block);
      return `<div data-block-id="${block.id}" data-block-type="${block.type}" data-block-json="${escAttr(JSON.stringify(block))}" class="special-block-chip" contenteditable="false">${escHtml(label)}</div>`;
    }

    default:
      return `<p data-block-id="${block.id}"></p>`;
  }
}

function getSpecialBlockLabel(block: DocumentBlock): string {
  switch (block.type) {
    case 'field': return `📝 Field: ${(block as { label: string }).label}`;
    case 'system_field': return `⚙️ System: ${(block as { label: string }).label}`;
    case 'banner': return `📢 Banner: ${(block as { title: string }).title}`;
    case 'safety_badge_row': return '🦺 Safety Badges';
    case 'columns': return '⬛ Columns Layout';
    case 'image': return `🖼️ Image`;
    default: return block.type;
  }
}

// ── HTML → Blocks (serialise on save) ────────────────────────────────────────

export function htmlToBlocks(html: string): DocumentBlock[] {
  if (typeof document === 'undefined') return [];

  const container = document.createElement('div');
  container.innerHTML = html;
  const blocks: DocumentBlock[] = [];

  for (const child of Array.from(container.childNodes)) {
    if (child.nodeType !== Node.ELEMENT_NODE) continue;
    const el = child as HTMLElement;
    const blockId = el.getAttribute('data-block-id') ?? nanoid(10);
    const blockType = el.getAttribute('data-block-type');

    // ── Special blocks (field, banner, etc.) — restore from JSON ──────────
    if (blockType && ['field', 'system_field', 'banner', 'safety_badge_row', 'columns', 'image', 'page_break', 'spacer'].includes(blockType)) {
      if (blockType === 'page_break') {
        blocks.push({ id: blockId, type: 'page_break' });
        continue;
      }
      if (blockType === 'spacer') {
        const h = parseInt(el.style.height ?? '16', 10);
        blocks.push({ id: blockId, type: 'spacer', height: h });
        continue;
      }
      const jsonAttr = el.getAttribute('data-block-json');
      if (jsonAttr) {
        try {
          const restored = JSON.parse(jsonAttr) as DocumentBlock;
          blocks.push(restored);
          continue;
        } catch { /* fall through */ }
      }
      continue;
    }

    // ── Table ──────────────────────────────────────────────────────────────
    if (el.tagName === 'TABLE' || blockType === 'table') {
      const tableBlock = tableElToBlock(el, blockId);
      if (tableBlock) blocks.push(tableBlock);
      continue;
    }

    // ── Rich text wrapper div ──────────────────────────────────────────────
    if (blockType === 'rich_text') {
      const inner = el.innerHTML.trim();
      if (inner) blocks.push({ id: blockId, type: 'rich_text', html: inner });
      continue;
    }

    // ── Headings ──────────────────────────────────────────────────────────
    const tag = el.tagName.toLowerCase();
    if (['h1', 'h2', 'h3', 'h4'].includes(tag)) {
      const level = parseInt(tag[1], 10) as 1 | 2 | 3 | 4;
      const text = el.textContent?.trim() ?? '';
      if (text) {
        blocks.push({
          id: blockId,
          type: 'heading',
          content: text,
          level,
          align: (el.style.textAlign as 'left' | 'center' | 'right') || 'left',
        });
      }
      continue;
    }

    // ── HR → divider ───────────────────────────────────────────────────────
    if (tag === 'hr') {
      blocks.push({ id: blockId, type: 'divider', style: 'solid', thickness: 1 });
      continue;
    }

    // ── Lists → rich_text ─────────────────────────────────────────────────
    if (tag === 'ul' || tag === 'ol') {
      const html = el.outerHTML;
      blocks.push({ id: blockId, type: 'rich_text', html });
      continue;
    }

    // ── Paragraphs ────────────────────────────────────────────────────────
    if (tag === 'p') {
      const text = el.textContent?.trim() ?? '';
      if (!text) continue;
      const inner = el.innerHTML;
      const hasFormatting = /<(strong|em|u|s|a|span|mark|code|sub|sup)/i.test(inner);
      const align = (el.style.textAlign as 'left' | 'center' | 'right' | 'justify') || 'left';
      if (hasFormatting) {
        blocks.push({ id: blockId, type: 'rich_text', html: `<p>${inner}</p>` });
      } else {
        blocks.push({ id: blockId, type: 'text', content: text, align });
      }
      continue;
    }

    // ── Anything else with text content → rich_text ───────────────────────
    const outerHtml = el.outerHTML;
    if (el.textContent?.trim()) {
      blocks.push({ id: blockId, type: 'rich_text', html: outerHtml });
    }
  }

  return blocks;
}

function tableElToBlock(el: HTMLElement, blockId: string): TableBlock | null {
  const rows = Array.from(el.querySelectorAll('tr'));
  if (rows.length === 0) return null;

  const headerCells = Array.from(rows[0].querySelectorAll('th, td'));
  const columns = headerCells.map((th) => ({
    id: nanoid(8),
    header: th.textContent?.trim() ?? '',
    cellType: 'text' as const,
    width: 1,
  }));

  const dataRows = rows.slice(1).map((tr) => {
    const cells: Record<string, string> = {};
    const tds = Array.from(tr.querySelectorAll('td, th'));
    columns.forEach((col, i) => {
      cells[col.id] = tds[i]?.textContent?.trim() ?? '';
    });
    return { id: nanoid(8), cells };
  });

  return {
    id: blockId,
    type: 'table',
    mode: 'static',
    columns,
    rows: dataRows,
    stripedRows: true,
  };
}

// ── Rich paste sanitiser ──────────────────────────────────────────────────────

export type PasteMode = 'keep' | 'studio' | 'plain';

/**
 * Detect whether clipboard HTML originated from Microsoft Word / Office.
 * Word embeds a SourceApp comment or mso- style properties.
 */
export function isWordPaste(html: string): boolean {
  return (
    /urn:schemas-microsoft-com|mso-|MsoNormal|WordDocument|w:WordDocument/i.test(html) ||
    html.includes('<!--StartFragment-->') && /mso-/i.test(html)
  );
}

/**
 * Full Word-aware HTML sanitiser.
 *
 * mode = 'keep'   → preserve headings, bold, italic, underline, lists, tables,
 *                   text-align, and safe inline colours. Strip all mso-* noise.
 * mode = 'studio' → same structure but strip all inline colours / font sizes so
 *                   the document inherits Studio's theme.
 * mode = 'plain'  → extract plain text only, wrap in <p> tags.
 */
export function sanitisePastedHtml(raw: string, mode: PasteMode = 'keep'): string {
  if (typeof document === 'undefined') return '';

  if (mode === 'plain') {
    return rawToPlainHtml(raw);
  }

  const container = document.createElement('div');
  container.innerHTML = raw;

  // ── 1. Remove dangerous / noise elements ─────────────────────────────────
  const STRIP_TAGS = [
    'script', 'style', 'meta', 'link', 'head', 'object', 'embed',
    'iframe', 'form', 'input', 'button', 'xml', 'o\\:p',
  ];
  for (const tag of STRIP_TAGS) {
    try { container.querySelectorAll(tag).forEach((el) => el.remove()); } catch { /* namespace tags */ }
  }

  // Remove XML/Office namespace elements (o:p, w:sdt, etc.) by tag name pattern
  const allEls = Array.from(container.querySelectorAll('*'));
  for (const el of allEls) {
    if (el.tagName.includes(':')) {
      // Unwrap — keep inner content
      el.replaceWith(...Array.from(el.childNodes));
    }
  }

  // ── 2. Remove Word comment / annotation markup ────────────────────────────
  // Word wraps tracked changes in <ins>/<del> — keep <ins> content, drop <del>
  container.querySelectorAll('del').forEach((el) => el.remove());
  container.querySelectorAll('ins').forEach((el) => {
    el.replaceWith(...Array.from(el.childNodes));
  });

  // ── 3. Normalise semantic tags ────────────────────────────────────────────
  // <b> → <strong>, <i> → <em>
  container.querySelectorAll('b').forEach((el) => {
    const s = document.createElement('strong');
    s.innerHTML = el.innerHTML;
    el.replaceWith(s);
  });
  container.querySelectorAll('i').forEach((el) => {
    const em = document.createElement('em');
    em.innerHTML = el.innerHTML;
    el.replaceWith(em);
  });

  // ── 4. Detect heading level from Word MsoHeading styles ──────────────────
  // Word often emits headings as <p class="MsoHeading1"> etc.
  const MSO_HEADING_RE = /MsoHeading(\d)/i;
  container.querySelectorAll('p, div').forEach((el) => {
    const cls = el.getAttribute('class') ?? '';
    const m = MSO_HEADING_RE.exec(cls);
    if (m) {
      const level = Math.min(parseInt(m[1], 10), 4);
      const heading = document.createElement(`h${level}`);
      heading.innerHTML = el.innerHTML;
      // Carry text-align if present
      const ta = (el as HTMLElement).style?.textAlign;
      if (ta) heading.style.textAlign = ta;
      el.replaceWith(heading);
    }
  });

  // ── 5. Detect list items from Word MsoListParagraph ──────────────────────
  // Word emits lists as <p class="MsoListParagraph"> with a leading bullet/number span
  const listGroups: { ordered: boolean; items: string[] }[] = [];
  let currentGroup: { ordered: boolean; items: string[] } | null = null;

  const listCandidates = Array.from(
    container.querySelectorAll('p[class*="MsoList"], p[class*="msolist"]')
  );
  for (const el of listCandidates) {
    const inner = el.innerHTML;
    // Detect ordered: starts with digit+dot or roman numeral
    const text = el.textContent ?? '';
    const isOrdered = /^\s*\d+[.)]\s/.test(text) || /^\s*[ivxIVX]+[.)]\s/.test(text);
    if (!currentGroup || currentGroup.ordered !== isOrdered) {
      currentGroup = { ordered: isOrdered, items: [] };
      listGroups.push(currentGroup);
    }
    // Strip leading bullet character / number from the text
    const cleaned = inner.replace(/^[\s\u00b7\u2022\u25cf\u2013\-\d+.)\s]+/, '').trim();
    currentGroup.items.push(cleaned || inner);
    el.remove();
  }

  // ── 6. Per-element style cleaning ────────────────────────────────────────
  container.querySelectorAll('*').forEach((node) => {
    const el = node as HTMLElement;

    // Remove noisy attributes
    el.removeAttribute('class');
    el.removeAttribute('id');
    el.removeAttribute('lang');
    el.removeAttribute('xml:lang');
    el.removeAttribute('data-contrast');
    el.removeAttribute('data-ccp-props');
    el.removeAttribute('xmlns');

    const style = el.style;
    if (!style) return;

    const keep: Record<string, string> = {};

    // Always preserve structural formatting
    if (style.fontWeight === 'bold' || parseInt(style.fontWeight) >= 600) keep.fontWeight = 'bold';
    if (style.fontStyle === 'italic') keep.fontStyle = 'italic';
    if (style.textDecoration?.includes('underline')) keep.textDecoration = 'underline';
    if (style.textDecoration?.includes('line-through')) {
      keep.textDecoration = (keep.textDecoration ? keep.textDecoration + ' ' : '') + 'line-through';
    }
    if (style.textAlign && style.textAlign !== 'left') keep.textAlign = style.textAlign;

    if (mode === 'keep') {
      // Preserve safe visual properties
      if (style.color && !isMsoColor(style.color)) keep.color = style.color;
      if (style.backgroundColor && !isMsoColor(style.backgroundColor)) keep.backgroundColor = style.backgroundColor;
      // Preserve font-size but clamp to reasonable range (10–36px)
      if (style.fontSize) {
        const px = parsePxSize(style.fontSize);
        if (px >= 10 && px <= 36) keep.fontSize = `${px}px`;
      }
    }
    // mode === 'studio': only structural formatting, no colours/sizes

    el.removeAttribute('style');
    Object.assign(el.style, keep);
  });

  // ── 7. Remove empty paragraphs (Word adds many) ───────────────────────────
  container.querySelectorAll('p').forEach((p) => {
    if (!p.textContent?.trim() && !p.querySelector('img, table, br')) {
      p.remove();
    }
  });

  // ── 8. Strip external images (http/https src) ────────────────────────────
  // Word pastes often embed external image URLs that render as broken tokens.
  // Replace them with a readable placeholder span so the document stays clean.
  container.querySelectorAll('img').forEach((img) => {
    const src = img.getAttribute('src') ?? '';
    if (src.startsWith('http://') || src.startsWith('https://') || src.startsWith('file://')) {
      const alt = img.getAttribute('alt') || src.split('/').pop() || 'image';
      const chip = document.createElement('span');
      chip.style.cssText = 'display:inline-block;padding:2px 8px;background:#f1f5f9;border:1px dashed #cbd5e1;border-radius:4px;color:#94a3b8;font-size:11px;font-family:ui-monospace,monospace;';
      chip.textContent = `[image: ${alt}]`;
      img.replaceWith(chip);
    }
  });

  // ── 9. Clean up tables ────────────────────────────────────────────────────
  container.querySelectorAll('table').forEach((tbl) => {
    tbl.removeAttribute('style');
    tbl.removeAttribute('class');
    tbl.removeAttribute('width');
    tbl.removeAttribute('cellpadding');
    tbl.removeAttribute('cellspacing');
    tbl.removeAttribute('border');
    // Remove empty rows
    tbl.querySelectorAll('tr').forEach((tr) => {
      if (!tr.textContent?.trim()) tr.remove();
    });
  });

  // ── 9. Unwrap redundant wrapper divs / spans ──────────────────────────────
  // Spans with no style left → unwrap
  container.querySelectorAll('span').forEach((span) => {
    if (!span.getAttribute('style') && !span.getAttribute('class')) {
      span.replaceWith(...Array.from(span.childNodes));
    }
  });

  // ── 10. Collapse consecutive <br> into paragraph breaks ──────────────────
  // Replace 2+ consecutive <br> with a paragraph boundary
  let html = container.innerHTML;
  html = html.replace(/(<br\s*\/?>\s*){2,}/gi, '</p><p>');

  return html;
}

// ── Plain text fallback ───────────────────────────────────────────────────────

function rawToPlainHtml(raw: string): string {
  if (typeof document === 'undefined') return '';
  const tmp = document.createElement('div');
  tmp.innerHTML = raw;
  const text = tmp.textContent ?? tmp.innerText ?? '';
  return text
    .split(/\n\n+/)
    .map((para) => `<p>${para.replace(/\n/g, '<br>').trim()}</p>`)
    .filter((p) => p !== '<p></p>')
    .join('');
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Returns true for mso- generated colour tokens we should discard */
function isMsoColor(color: string): boolean {
  return /windowtext|window|btnface|highlight/i.test(color);
}

/** Parse a CSS size string to px number (handles pt, em, rem, %) */
function parsePxSize(size: string): number {
  const n = parseFloat(size);
  if (size.endsWith('pt')) return Math.round(n * 1.333);
  if (size.endsWith('em') || size.endsWith('rem')) return Math.round(n * 13);
  return Math.round(n); // assume px
}

// ── Utilities ─────────────────────────────────────────────────────────────────

function escHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function escAttr(s: string): string {
  return s.replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}
