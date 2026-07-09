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

/**
 * Sanitise pasted HTML from Word / Google Docs / browsers.
 * Strips dangerous tags, preserves useful formatting.
 */
export function sanitisePastedHtml(raw: string): string {
  if (typeof document === 'undefined') return '';

  const container = document.createElement('div');
  container.innerHTML = raw;

  // Remove dangerous / noise elements
  const STRIP_TAGS = ['script', 'style', 'meta', 'link', 'head', 'object', 'embed', 'iframe', 'form', 'input', 'button'];
  for (const tag of STRIP_TAGS) {
    container.querySelectorAll(tag).forEach((el) => el.remove());
  }

  // Strip Word/Office namespace elements (o:p, w:*, etc.)
  const wordEls = container.querySelectorAll('[class*="Mso"], [style*="mso-"]');
  wordEls.forEach((el) => {
    // Keep the text content, just unwrap the element
    const span = document.createElement('span');
    span.innerHTML = el.innerHTML;
    el.replaceWith(span);
  });

  // Strip all class and id attributes (Word adds tons of noise)
  container.querySelectorAll('*').forEach((el) => {
    el.removeAttribute('class');
    el.removeAttribute('id');
    el.removeAttribute('lang');
    el.removeAttribute('xml:lang');
    // Strip Word-specific style properties but keep useful ones
    const style = (el as HTMLElement).style;
    if (style) {
      const keep: Record<string, string> = {};
      if (style.fontWeight === 'bold' || style.fontWeight === '700') keep.fontWeight = 'bold';
      if (style.fontStyle === 'italic') keep.fontStyle = 'italic';
      if (style.textDecoration?.includes('underline')) keep.textDecoration = 'underline';
      if (style.textAlign && style.textAlign !== 'left') keep.textAlign = style.textAlign;
      (el as HTMLElement).removeAttribute('style');
      Object.assign((el as HTMLElement).style, keep);
    }
  });

  // Convert <b> → <strong>, <i> → <em>
  container.querySelectorAll('b').forEach((el) => {
    const strong = document.createElement('strong');
    strong.innerHTML = el.innerHTML;
    el.replaceWith(strong);
  });
  container.querySelectorAll('i').forEach((el) => {
    const em = document.createElement('em');
    em.innerHTML = el.innerHTML;
    el.replaceWith(em);
  });

  // Collapse empty paragraphs from Word (multiple <p><br></p> etc.)
  container.querySelectorAll('p').forEach((p) => {
    if (!p.textContent?.trim() && !p.querySelector('img')) {
      p.remove();
    }
  });

  return container.innerHTML;
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
