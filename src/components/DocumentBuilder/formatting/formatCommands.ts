/**
 * Low-level execCommand wrappers for the Studio contextual formatting system.
 *
 * All commands operate on the current browser selection. They are intentionally
 * thin wrappers so they can be called from both the floating toolbar and the
 * table-cell context menu without duplicating logic.
 *
 * NOTE: document.execCommand is deprecated but remains the most reliable
 * cross-browser mechanism for contentEditable formatting. It is the same
 * approach used by Google Docs, Notion, and every major rich-text editor.
 * We use it here because the Studio blocks are plain contentEditable divs,
 * not a Lexical/ProseMirror document model.
 */

// ── Saved selection ───────────────────────────────────────────────────────────

let _savedRange: Range | null = null;

/** Save the current selection so it can be restored after a toolbar interaction. */
export function saveSelection(): void {
  const sel = window.getSelection();
  if (sel && sel.rangeCount > 0) {
    _savedRange = sel.getRangeAt(0).cloneRange();
  }
}

/** Restore the previously saved selection. */
export function restoreSelection(): void {
  if (!_savedRange) return;
  const sel = window.getSelection();
  if (!sel) return;
  sel.removeAllRanges();
  sel.addRange(_savedRange);
}

/** Clear the saved selection. */
export function clearSavedSelection(): void {
  _savedRange = null;
}

// ── Basic inline formatting ───────────────────────────────────────────────────

export function execBold(): void {
  document.execCommand('bold', false);
}

export function execItalic(): void {
  document.execCommand('italic', false);
}

export function execUnderline(): void {
  document.execCommand('underline', false);
}

export function execStrikethrough(): void {
  document.execCommand('strikeThrough', false);
}

// ── Font size ─────────────────────────────────────────────────────────────────

/**
 * Apply a font size to the selection using a <span> with inline style.
 * execCommand('fontSize') only accepts 1-7 HTML sizes; we wrap in a span instead.
 */
export function execFontSize(px: number): void {
  restoreSelection();
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return;
  const range = sel.getRangeAt(0);
  const span = document.createElement('span');
  span.style.fontSize = `${px}pt`;
  try {
    range.surroundContents(span);
  } catch {
    // surroundContents throws if the range partially spans an element boundary.
    // Fall back to extracting and re-inserting.
    const fragment = range.extractContents();
    span.appendChild(fragment);
    range.insertNode(span);
  }
  // Re-select the span contents
  const newRange = document.createRange();
  newRange.selectNodeContents(span);
  sel.removeAllRanges();
  sel.addRange(newRange);
}

// ── Colour ────────────────────────────────────────────────────────────────────

export function execTextColor(color: string): void {
  restoreSelection();
  document.execCommand('foreColor', false, color);
}

export function execHighlight(color: string): void {
  restoreSelection();
  document.execCommand('hiliteColor', false, color);
}

// ── Alignment ─────────────────────────────────────────────────────────────────

export function execAlign(align: 'left' | 'center' | 'right' | 'justify'): void {
  const cmd = {
    left:    'justifyLeft',
    center:  'justifyCenter',
    right:   'justifyRight',
    justify: 'justifyFull',
  }[align];
  document.execCommand(cmd, false);
}

// ── Lists ─────────────────────────────────────────────────────────────────────

export function execBulletList(): void {
  document.execCommand('insertUnorderedList', false);
}

export function execNumberedList(): void {
  document.execCommand('insertOrderedList', false);
}

// ── Heading / paragraph style ─────────────────────────────────────────────────

export function execHeading(tag: 'p' | 'h1' | 'h2' | 'h3' | 'h4'): void {
  document.execCommand('formatBlock', false, `<${tag}>`);
}

// ── Hyperlink ─────────────────────────────────────────────────────────────────

export function execLink(url: string): void {
  restoreSelection();
  if (!url) {
    document.execCommand('unlink', false);
    return;
  }
  document.execCommand('createLink', false, url);
  // Force target=_blank on newly created link
  const sel = window.getSelection();
  if (sel && sel.anchorNode) {
    let node: Node | null = sel.anchorNode;
    while (node && (node as Element).tagName !== 'A') {
      node = node.parentElement;
    }
    if (node) {
      (node as HTMLAnchorElement).target = '_blank';
      (node as HTMLAnchorElement).rel = 'noopener noreferrer';
    }
  }
}

export function execUnlink(): void {
  document.execCommand('unlink', false);
}

// ── Clear formatting ──────────────────────────────────────────────────────────

export function execClearFormatting(): void {
  document.execCommand('removeFormat', false);
  document.execCommand('unlink', false);
}

// ── Query state ───────────────────────────────────────────────────────────────

export interface FormatState {
  bold: boolean;
  italic: boolean;
  underline: boolean;
  strikethrough: boolean;
  justifyLeft: boolean;
  justifyCenter: boolean;
  justifyRight: boolean;
  justifyFull: boolean;
}

export function queryFormatState(): FormatState {
  const q = (cmd: string) => {
    try { return document.queryCommandState(cmd); } catch { return false; }
  };
  return {
    bold:          q('bold'),
    italic:        q('italic'),
    underline:     q('underline'),
    strikethrough: q('strikeThrough'),
    justifyLeft:   q('justifyLeft'),
    justifyCenter: q('justifyCenter'),
    justifyRight:  q('justifyRight'),
    justifyFull:   q('justifyFull'),
  };
}
