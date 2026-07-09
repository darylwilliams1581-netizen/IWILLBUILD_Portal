/**
 * PageEditor HTML ↔ Blocks Bridge
 * ─────────────────────────────────────────────────────────────────────────────
 * Converts between:
 *   - The page editor's contenteditable HTML (what the user sees/types)
 *   - The underlying DocumentBlock[] JSON (what gets stored / exported to PDF)
 *
 * Block mapping:
 *   h1–h4              → HeadingBlock
 *   p                  → TextBlock (plain) or RichTextBlock (has inline formatting)
 *   ul / ol            → RichTextBlock wrapping the list
 *   table              → TableBlock
 *   hr                 → DividerBlock
 *   [data-block-id]    → preserved as-is (special blocks: field, banner, etc.)
 *   .sys-field-token   → SystemFieldBlock (inline token)
 *   Everything else    → RichTextBlock
 *
 * Word paste sanitiser:
 *   mode = 'keep'   → preserve headings, bold, italic, underline, lists, tables,
 *                     text-align, and safe inline colours. Strip all mso-* noise.
 *   mode = 'studio' → same structure but strip all inline colours / font sizes.
 *   mode = 'plain'  → extract plain text only, wrap in <p> tags.
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
      const align = b.align && b.align !== 'left' ? ` style="text-align:${b.align}"` : '';
      return `<${tag} data-block-id="${b.id}"${align}>${escHtml(b.content)}</${tag}>`;
    }

    case 'text': {
      const b = block as TextBlock;
      const align = b.align && b.align !== 'left' ? ` style="text-align:${b.align}"` : '';
      let inner = escHtml(b.content);
      if (b.bold)   inner = `<strong>${inner}</strong>`;
      if (b.italic) inner = `<em>${inner}</em>`;
      return `<p data-block-id="${b.id}"${align}>${inner}</p>`;
    }

    case 'rich_text': {
      const b = block as RichTextBlock;
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
      const label = getSpecialBlockLabel(block);
      return `<div data-block-id="${block.id}" data-block-type="${block.type}" data-block-json="${escAttr(JSON.stringify(block))}" class="special-block-chip" contenteditable="false">${escHtml(label)}</div>`;
    }

    default:
      return `<p data-block-id="${block.id}"></p>`;
  }
}

function getSpecialBlockLabel(block: DocumentBlock): string {
  switch (block.type) {
    case 'field':          return `Field: ${(block as { label: string }).label}`;
    case 'system_field':   return `⚙ System: ${(block as { label: string }).label}`;
    case 'banner':         return `Banner: ${(block as { title: string }).title}`;
    case 'safety_badge_row': return 'Safety Badges';
    case 'columns':        return 'Columns Layout';
    case 'image':          return 'Image';
    default:               return block.type;
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
    const blockId   = el.getAttribute('data-block-id') ?? nanoid(10);
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
      const text  = el.textContent?.trim() ?? '';
      if (text) {
        blocks.push({
          id: blockId, type: 'heading', content: text, level,
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
      blocks.push({ id: blockId, type: 'rich_text', html: el.outerHTML });
      continue;
    }

    // ── Paragraphs ────────────────────────────────────────────────────────
    if (tag === 'p') {
      const text  = el.textContent?.trim() ?? '';
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
    if (el.textContent?.trim()) {
      blocks.push({ id: blockId, type: 'rich_text', html: el.outerHTML });
    }
  }

  return blocks;
}

function tableElToBlock(el: HTMLElement, blockId: string): TableBlock | null {
  const rows = Array.from(el.querySelectorAll('tr'));
  if (rows.length === 0) return null;

  const headerCells = Array.from(rows[0].querySelectorAll('th, td'));
  const columns = headerCells.map((th) => ({
    id:       nanoid(8),
    header:   th.textContent?.trim() ?? '',
    cellType: 'text' as const,
    width:    1,
  }));

  const dataRows = rows.slice(1).map((tr) => {
    const cells: Record<string, string> = {};
    const tds = Array.from(tr.querySelectorAll('td, th'));
    columns.forEach((col, i) => {
      cells[col.id] = tds[i]?.innerHTML?.trim() ?? '';
    });
    return { id: nanoid(8), cells };
  });

  return {
    id: blockId, type: 'table', mode: 'static',
    columns, rows: dataRows, stripedRows: true,
  };
}

// ── Rich paste sanitiser ──────────────────────────────────────────────────────

export type PasteMode = 'keep' | 'studio' | 'plain';

/**
 * Detect whether clipboard HTML originated from Microsoft Word / Office.
 */
export function isWordPaste(html: string): boolean {
  return (
    /urn:schemas-microsoft-com|mso-|MsoNormal|WordDocument|w:WordDocument/i.test(html) ||
    (html.includes('<!--StartFragment-->') && /mso-/i.test(html))
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
  if (mode === 'plain') return rawToPlainHtml(raw);

  const container = document.createElement('div');
  container.innerHTML = raw;

  // ── 1. Remove dangerous / noise elements ─────────────────────────────────
  const STRIP_TAGS = [
    'script', 'style', 'meta', 'link', 'head', 'object', 'embed',
    'iframe', 'form', 'input', 'button', 'xml',
  ];
  for (const tag of STRIP_TAGS) {
    try { container.querySelectorAll(tag).forEach((el) => el.remove()); } catch { /* namespace tags */ }
  }

  // Remove XML/Office namespace elements (o:p, w:sdt, etc.)
  Array.from(container.querySelectorAll('*')).forEach((el) => {
    if (el.tagName.includes(':')) el.replaceWith(...Array.from(el.childNodes));
  });

  // ── 2. Remove Word tracked changes ───────────────────────────────────────
  container.querySelectorAll('del').forEach((el) => el.remove());
  container.querySelectorAll('ins').forEach((el) => el.replaceWith(...Array.from(el.childNodes)));

  // ── 3. Normalise semantic tags ────────────────────────────────────────────
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
  const MSO_HEADING_RE = /MsoHeading(\d)/i;
  container.querySelectorAll('p, div').forEach((el) => {
    const cls = el.getAttribute('class') ?? '';
    const m   = MSO_HEADING_RE.exec(cls);
    if (m) {
      const level   = Math.min(parseInt(m[1], 10), 4);
      const heading = document.createElement(`h${level}`);
      heading.innerHTML = el.innerHTML;
      const ta = (el as HTMLElement).style?.textAlign;
      if (ta) heading.style.textAlign = ta;
      el.replaceWith(heading);
    }
  });

  // ── 5. Detect heading from Word outline level / style name ────────────────
  // Word sometimes uses data-heading-level or aria-level attributes
  container.querySelectorAll('[aria-level]').forEach((el) => {
    const level = Math.min(parseInt(el.getAttribute('aria-level') ?? '2', 10), 4);
    if (!['H1','H2','H3','H4'].includes(el.tagName)) {
      const heading = document.createElement(`h${level}`);
      heading.innerHTML = el.innerHTML;
      el.replaceWith(heading);
    }
  });

  // ── 6. Reconstruct lists from MsoListParagraph ────────────────────────────
  // Word emits lists as consecutive <p class="MsoListParagraph"> elements.
  // Group them and wrap in <ul> or <ol>.
  const listCandidates = Array.from(
    container.querySelectorAll('p[class*="MsoList"], p[class*="msolist"]')
  );

  if (listCandidates.length > 0) {
    // Group consecutive list paragraphs
    const groups: { ordered: boolean; items: HTMLElement[]; anchor: HTMLElement }[] = [];
    let currentGroup: typeof groups[0] | null = null;

    for (const el of listCandidates) {
      const text      = el.textContent ?? '';
      const isOrdered = /^\s*\d+[.)]\s/.test(text) || /^\s*[ivxIVX]+[.)]\s/.test(text);
      if (!currentGroup || currentGroup.ordered !== isOrdered) {
        currentGroup = { ordered: isOrdered, items: [], anchor: el as HTMLElement };
        groups.push(currentGroup);
      }
      currentGroup.items.push(el as HTMLElement);
    }

    for (const group of groups) {
      const list = document.createElement(group.ordered ? 'ol' : 'ul');
      for (const el of group.items) {
        const li = document.createElement('li');
        // Strip leading bullet character / number from the text
        let inner = el.innerHTML;
        inner = inner.replace(/^[\s\u00b7\u2022\u25cf\u2013\-\d+.)]+/, '').trim();
        li.innerHTML = inner || el.innerHTML;
        list.appendChild(li);
        el.remove();
      }
      group.anchor.replaceWith(list);
    }
  }

  // ── 7. Per-element style cleaning ────────────────────────────────────────
  container.querySelectorAll('*').forEach((node) => {
    const el = node as HTMLElement;

    // Remove noisy attributes
    ['class', 'id', 'lang', 'xml:lang', 'data-contrast', 'data-ccp-props', 'xmlns',
     'v:shapes', 'o:spid', 'o:spt'].forEach((a) => el.removeAttribute(a));

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
      // Preserve font-size but clamp to reasonable range (9–28pt)
      if (style.fontSize) {
        const px = parsePxSize(style.fontSize);
        if (px >= 9 && px <= 36) keep.fontSize = `${px}px`;
      }
    }
    // mode === 'studio': only structural formatting, no colours/sizes

    el.removeAttribute('style');
    Object.assign(el.style, keep);
  });

  // ── 8. Remove empty paragraphs (Word adds many) ───────────────────────────
  container.querySelectorAll('p').forEach((p) => {
    if (!p.textContent?.trim() && !p.querySelector('img, table, br')) p.remove();
  });

  // ── 9. Strip external / embedded images ──────────────────────────────────
  // Word pastes often embed external image URLs or WMF data URIs.
  // Replace them with a readable placeholder chip.
  container.querySelectorAll('img').forEach((img) => {
    const src = img.getAttribute('src') ?? '';
    if (
      src.startsWith('http://') || src.startsWith('https://') ||
      src.startsWith('file://') || src.startsWith('data:image/wmf') ||
      src.startsWith('data:image/x-wmf')
    ) {
      const alt  = img.getAttribute('alt') || src.split('/').pop() || 'image';
      const chip = document.createElement('span');
      chip.className = 'special-block-chip';
      chip.setAttribute('contenteditable', 'false');
      chip.textContent = `[image: ${alt}]`;
      img.replaceWith(chip);
    }
  });

  // ── 10. Clean up tables ───────────────────────────────────────────────────
  container.querySelectorAll('table').forEach((tbl) => {
    ['style', 'class', 'width', 'cellpadding', 'cellspacing', 'border'].forEach((a) => tbl.removeAttribute(a));
    // Remove empty rows
    tbl.querySelectorAll('tr').forEach((tr) => {
      if (!tr.textContent?.trim()) tr.remove();
    });
    // Remove merged cell attributes that confuse the editor
    tbl.querySelectorAll('td, th').forEach((cell) => {
      cell.removeAttribute('width');
      cell.removeAttribute('height');
      cell.removeAttribute('bgcolor');
      cell.removeAttribute('valign');
    });
  });

  // ── 11. Unwrap bare spans with no remaining style ─────────────────────────
  container.querySelectorAll('span').forEach((span) => {
    if (!span.getAttribute('style') && !span.getAttribute('class') && !span.getAttribute('data-sys-field')) {
      span.replaceWith(...Array.from(span.childNodes));
    }
  });

  // ── 12. Collapse consecutive <br> into paragraph breaks ──────────────────
  let html = container.innerHTML;
  html = html.replace(/(<br\s*\/?>\s*){2,}/gi, '</p><p>');

  return html;
}

// ── Plain text fallback ───────────────────────────────────────────────────────

function rawToPlainHtml(raw: string): string {
  if (typeof document === 'undefined') return '';
  const tmp  = document.createElement('div');
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
  if (size.endsWith('pt'))  return Math.round(n * 1.333);
  if (size.endsWith('em') || size.endsWith('rem')) return Math.round(n * 13);
  return Math.round(n); // assume px
}

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
