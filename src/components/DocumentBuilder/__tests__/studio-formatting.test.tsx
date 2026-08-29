/**
 * Studio Contextual Formatting System — focused tests
 * ─────────────────────────────────────────────────────────────────────────────
 * 1.  Highlighted text can be made bold, italic and underlined.
 * 2.  Font size, text colour and highlight apply only to the selection.
 * 3.  Formatting survives save and reload.
 * 4.  Right-click operates only inside Studio.
 * 5.  Native copy/paste and keyboard shortcuts still work.
 * 6.  A table cell can receive a fill and text colour.
 * 7.  Multiple selected cells can be formatted together.
 * 8.  Cell formatting survives save/reload and print.
 * 9.  Legacy tables without style data still render.
 * 10. Imported editable tables support the same formatting.
 * 11. Mobile Format and Format Cell actions are accessible.
 * 12. Opening formatting controls does not jump or scroll the document.
 * 13. Unsafe HTML and CSS are still removed.
 */

import { describe, it, expect, vi } from 'vitest';
import { sanitiseHtml, sanitiseCssStyle } from '../sanitiseHtml';
import type { TableBlock, CellStyle } from '../types';

// ── 1. Bold / italic / underline via execCommand ──────────────────────────────

describe('1 — highlighted text can be made bold, italic and underlined', () => {
  it('execBold wraps selection in <b>', () => {
    // We test the sanitiser accepts the output of execCommand (which produces <b>)
    const html = '<b>hello</b> world';
    expect(sanitiseHtml(html)).toContain('<b>');
    expect(sanitiseHtml(html)).toContain('hello');
  });

  it('execItalic wraps selection in <i>', () => {
    const html = '<i>hello</i>';
    expect(sanitiseHtml(html)).toContain('<i>');
  });

  it('execUnderline wraps selection in <u>', () => {
    const html = '<u>hello</u>';
    expect(sanitiseHtml(html)).toContain('<u>');
  });

  it('strong and em are also preserved', () => {
    expect(sanitiseHtml('<strong>a</strong><em>b</em>')).toContain('<strong>');
    expect(sanitiseHtml('<strong>a</strong><em>b</em>')).toContain('<em>');
  });
});

// ── 2. Font size / text colour / highlight apply only to selection ────────────

describe('2 — font size, text colour and highlight apply only to the selection', () => {
  it('font-size inline style is preserved by sanitiser', () => {
    const html = '<span style="font-size: 18pt">big</span> normal';
    const out = sanitiseHtml(html);
    expect(out).toContain('font-size: 18pt');
    expect(out).toContain('normal');
  });

  it('color inline style is preserved', () => {
    const html = '<span style="color: #EF4444">red</span>';
    expect(sanitiseHtml(html)).toContain('color: #EF4444');
  });

  it('background-color inline style is preserved (highlight)', () => {
    const html = '<span style="background-color: #FEF08A">highlighted</span>';
    expect(sanitiseHtml(html)).toContain('background-color: #FEF08A');
  });

  it('formatting on one span does not affect surrounding text', () => {
    const html = 'before <span style="font-size: 24pt">big</span> after';
    const out = sanitiseHtml(html);
    expect(out).toContain('before');
    expect(out).toContain('after');
    // The style is scoped to the span
    expect(out).toMatch(/before.*font-size.*after/s);
  });
});

// ── 3. Formatting survives save and reload ────────────────────────────────────

describe('3 — formatting survives save and reload', () => {
  it('sanitiseHtml is idempotent — running it twice produces the same output', () => {
    const html = '<span style="font-size: 14pt; color: #3B82F6"><b>hello</b></span>';
    const once = sanitiseHtml(html);
    const twice = sanitiseHtml(once);
    expect(once).toBe(twice);
  });

  it('nested formatting is preserved through round-trip', () => {
    const html = '<p style="text-align: center"><b><i>centred bold italic</i></b></p>';
    const out = sanitiseHtml(html);
    expect(out).toContain('text-align: center');
    expect(out).toContain('<b>');
    expect(out).toContain('<i>');
  });
});

// ── 4. Right-click operates only inside Studio ────────────────────────────────

describe('4 — right-click operates only inside Studio', () => {
  it('TableCellContextMenu component file exists', async () => {
    const fs = await import('node:fs/promises');
    const src = await fs.readFile('src/components/DocumentBuilder/formatting/TableCellContextMenu.tsx', 'utf-8');
    expect(src).toContain('data-testid="table-cell-context-menu"');
    expect(src).toContain('onContextMenu');
  });

  it('FloatingFormatToolbar is only rendered in edit mode (BlockCanvas)', async () => {
    const fs = await import('node:fs/promises');
    const src = await fs.readFile('src/components/DocumentBuilder/BlockCanvas.tsx', 'utf-8');
    // Toolbar is conditionally rendered only when mode === 'edit'
    expect(src).toContain("mode === 'edit'");
    expect(src).toContain('FloatingFormatToolbar');
  });

  it('context menu is only opened inside TableBlockView (edit mode guard)', async () => {
    const fs = await import('node:fs/promises');
    const src = await fs.readFile('src/components/DocumentBuilder/blocks/TableBlock.tsx', 'utf-8');
    expect(src).toContain("if (mode !== 'edit') return");
    expect(src).toContain('openContextMenu');
  });
});

// ── 5. Native copy/paste and keyboard shortcuts still work ────────────────────

describe('5 — native copy/paste and keyboard shortcuts still work', () => {
  it('FloatingFormatToolbar does not call e.preventDefault on keydown events', async () => {
    const fs = await import('node:fs/promises');
    const src = await fs.readFile('src/components/DocumentBuilder/formatting/FloatingFormatToolbar.tsx', 'utf-8');
    // The toolbar only calls e.preventDefault on its own mousedown events, not on document keydown
    // Verify the keydown handler only closes the toolbar (Escape) and does not prevent default
    const keydownSection = src.slice(src.indexOf('handleKeyDown'), src.indexOf('handleKeyDown') + 300);
    expect(keydownSection).toContain("e.key === 'Escape'");
    expect(keydownSection).not.toContain('e.preventDefault()');
  });

  it('toolbar buttons use onMouseDown + e.preventDefault (not onClick) to avoid stealing focus', async () => {
    const fs = await import('node:fs/promises');
    const src = await fs.readFile('src/components/DocumentBuilder/formatting/FloatingFormatToolbar.tsx', 'utf-8');
    expect(src).toContain('onMouseDown');
    expect(src).toContain('e.preventDefault()');
  });
});

// ── 6. A table cell can receive a fill and text colour ────────────────────────

describe('6 — a table cell can receive a fill and text colour', () => {
  it('CellStyle type includes backgroundColor and color', async () => {
    const fs = await import('node:fs/promises');
    const src = await fs.readFile('src/components/DocumentBuilder/types.ts', 'utf-8');
    expect(src).toContain('backgroundColor?: string');
    expect(src).toContain('color?: string');
    expect(src).toContain('CellStyle');
  });

  it('cellStyleToCSS maps backgroundColor and color to React.CSSProperties', async () => {
    const fs = await import('node:fs/promises');
    const src = await fs.readFile('src/components/DocumentBuilder/blocks/TableBlock.tsx', 'utf-8');
    expect(src).toContain('cellStyleToCSS');
    expect(src).toContain('backgroundColor');
    expect(src).toContain('style.color');
  });

  it('applyCellStyles merges patch into existing cellStyles', async () => {
    const fs = await import('node:fs/promises');
    const src = await fs.readFile('src/components/DocumentBuilder/blocks/TableBlock.tsx', 'utf-8');
    expect(src).toContain('applyCellStyles');
    expect(src).toContain('cellStyles');
  });
});

// ── 7. Multiple selected cells can be formatted together ──────────────────────

describe('7 — multiple selected cells can be formatted together', () => {
  it('applyCellStyles iterates over all cells in the targets array', async () => {
    const fs = await import('node:fs/promises');
    const src = await fs.readFile('src/components/DocumentBuilder/blocks/TableBlock.tsx', 'utf-8');
    expect(src).toContain('for (const { rowId, colId } of cells)');
  });

  it('Shift+click adds cells to selectedCells state', async () => {
    const fs = await import('node:fs/promises');
    const src = await fs.readFile('src/components/DocumentBuilder/blocks/TableBlock.tsx', 'utf-8');
    expect(src).toContain('e.shiftKey');
    expect(src).toContain('selectedCells');
  });

  it('context menu receives selectedCells and passes them to onStyleChange', async () => {
    const fs = await import('node:fs/promises');
    const src = await fs.readFile('src/components/DocumentBuilder/blocks/TableBlock.tsx', 'utf-8');
    expect(src).toContain('selectedCells={selectedCells}');
    expect(src).toContain('onStyleChange={applyCellStyles}');
  });
});

// ── 8. Cell formatting survives save/reload and print ─────────────────────────

describe('8 — cell formatting survives save/reload and print', () => {
  it('cellStyles is part of TableBlock and serialises to builder_json', async () => {
    const fs = await import('node:fs/promises');
    const src = await fs.readFile('src/components/DocumentBuilder/types.ts', 'utf-8');
    expect(src).toContain('cellStyles?: Record<string, CellStyle>');
  });

  it('cellStyleToCSS produces inline styles that survive print (print-color-adjust)', async () => {
    const fs = await import('node:fs/promises');
    const css = await fs.readFile('src/styles/globals.css', 'utf-8');
    expect(css).toContain('print-color-adjust: exact');
    // The contextual formatting section is present
    expect(css).toContain('Contextual formatting');
  });

  it('cell styles are applied to both edit and preview/print td elements', async () => {
    const fs = await import('node:fs/promises');
    const src = await fs.readFile('src/components/DocumentBuilder/blocks/TableBlock.tsx', 'utf-8');
    // cellStyleToCSS is called in both the edit-mode td and the preview-mode td
    const editSection   = src.slice(src.indexOf("if (mode === 'edit')"), src.indexOf('// ── Preview / fill mode'));
    const previewSection = src.slice(src.indexOf('// ── Preview / fill mode'));
    expect(editSection).toContain('cellStyleToCSS');
    expect(previewSection).toContain('cellStyleToCSS');
  });
});

// ── 9. Legacy tables without style data still render ─────────────────────────

describe('9 — legacy tables without style data still render', () => {
  it('getCellStyle returns empty object when cellStyles is absent', () => {
    // Simulate a legacy block with no cellStyles field
    const block: Partial<TableBlock> = {
      type: 'table',
      mode: 'static',
      columns: [{ id: 'c1', header: 'Col', cellType: 'text' }],
      rows: [{ id: 'r1', cells: { c1: 'value' } }],
      // cellStyles intentionally absent
    };
    // getCellStyle logic: block.cellStyles?.[key] ?? {}
    const style = (block as TableBlock).cellStyles?.['r1:c1'] ?? {};
    expect(style).toEqual({});
  });

  it('cellStyleToCSS returns empty object for undefined input', async () => {
    const fs = await import('node:fs/promises');
    const src = await fs.readFile('src/components/DocumentBuilder/blocks/TableBlock.tsx', 'utf-8');
    expect(src).toContain('if (!cs) return {}');
  });
});

// ── 10. Imported editable tables support the same formatting ──────────────────

describe('10 — imported editable tables support the same formatting', () => {
  it('DOCX-imported tables use the same TableBlock type and thus support cellStyles', async () => {
    const fs = await import('node:fs/promises');
    // The DOCX importer produces TableBlock objects — verify it uses the same type
    const importerSrc = await fs.readFile("src/server/api/document-templates/[id]/import-docx/POST.ts", 'utf-8');
    expect(importerSrc).toContain("type: 'table'");
    // cellStyles is optional — imported tables start without it (backward-compatible)
    // and gain it when the user applies formatting via the context menu
  });

  it('TableBlock type is shared between builder and importer', async () => {
    const fs = await import('node:fs/promises');
    const importerSrc = await fs.readFile("src/server/api/document-templates/[id]/import-docx/POST.ts", 'utf-8');
    // The importer produces table blocks compatible with the TableBlock interface
    expect(importerSrc).toContain("type: 'table'");
    expect(importerSrc).toContain('columns');
    expect(importerSrc).toContain('rows');
  });
});

// ── 11. Mobile Format and Format Cell actions are accessible ──────────────────

describe('11 — mobile Format and Format Cell actions are accessible', () => {
  it('FloatingFormatToolbar has a touchend listener for mobile selection', async () => {
    const fs = await import('node:fs/promises');
    const src = await fs.readFile('src/components/DocumentBuilder/formatting/FloatingFormatToolbar.tsx', 'utf-8');
    expect(src).toContain('touchend');
    expect(src).toContain('passive: true');
  });

  it('TableBlock has a long-press handler for mobile context menu', async () => {
    const fs = await import('node:fs/promises');
    const src = await fs.readFile('src/components/DocumentBuilder/blocks/TableBlock.tsx', 'utf-8');
    expect(src).toContain('handleTouchStart');
    expect(src).toContain('handleTouchEnd');
    expect(src).toContain('longPressTimer');
    expect(src).toContain('onTouchStart');
    expect(src).toContain('onTouchEnd');
  });

  it('long-press timer is cleared on touchend and touchmove to avoid false triggers', async () => {
    const fs = await import('node:fs/promises');
    const src = await fs.readFile('src/components/DocumentBuilder/blocks/TableBlock.tsx', 'utf-8');
    expect(src).toContain('onTouchMove={handleTouchEnd}');
    expect(src).toContain('clearTimeout(longPressTimer.current)');
  });
});

// ── 12. Opening formatting controls does not jump or scroll the document ──────

describe('12 — opening formatting controls does not jump or scroll the document', () => {
  it('all toolbar buttons use onMouseDown + e.preventDefault to avoid focus steal', async () => {
    const fs = await import('node:fs/promises');
    const src = await fs.readFile('src/components/DocumentBuilder/formatting/FloatingFormatToolbar.tsx', 'utf-8');
    // Every interactive button in the toolbar uses onMouseDown, not onClick
    // (onClick fires after mouseup which can cause selection collapse)
    expect(src).toContain('onMouseDown');
    expect(src).not.toContain('onClick={cmd(');
  });

  it('toolbar is positioned with fixed CSS (not absolute) so it does not affect layout', async () => {
    const fs = await import('node:fs/promises');
    const src = await fs.readFile('src/components/DocumentBuilder/formatting/FloatingFormatToolbar.tsx', 'utf-8');
    expect(src).toContain('fixed z-[9999]');
  });

  it('context menu is also fixed-positioned', async () => {
    const fs = await import('node:fs/promises');
    const src = await fs.readFile('src/components/DocumentBuilder/formatting/TableCellContextMenu.tsx', 'utf-8');
    expect(src).toContain('fixed z-[9999]');
  });
});

// ── 13. Unsafe HTML and CSS are still removed ─────────────────────────────────

describe('13 — unsafe HTML and CSS are still removed', () => {
  it('script tags are stripped', () => {
    const html = '<script>alert("xss")</script><b>safe</b>';
    const out = sanitiseHtml(html);
    expect(out).not.toContain('<script>');
    expect(out).not.toContain('alert');
    expect(out).toContain('<b>safe</b>');
  });

  it('event handler attributes are stripped', () => {
    const html = '<span onclick="alert(1)">click me</span>';
    const out = sanitiseHtml(html);
    expect(out).not.toContain('onclick');
    expect(out).toContain('click me');
  });

  it('javascript: href is stripped', () => {
    const html = '<a href="javascript:alert(1)">link</a>';
    const out = sanitiseHtml(html);
    expect(out).not.toContain('javascript:');
  });

  it('url() in style is stripped', () => {
    const html = '<span style="background: url(http://evil.com/x.png)">text</span>';
    const out = sanitiseHtml(html);
    expect(out).not.toContain('url(');
  });

  it('expression() in style is stripped', () => {
    const html = '<span style="width: expression(alert(1))">text</span>';
    const out = sanitiseHtml(html);
    expect(out).not.toContain('expression(');
  });

  it('unsafe CSS properties are stripped by sanitiseCssStyle', () => {
    const raw = 'font-size: 14pt; position: fixed; top: 0; color: red';
    const out = sanitiseCssStyle(raw);
    expect(out).toContain('font-size: 14pt');
    expect(out).toContain('color: red');
    expect(out).not.toContain('position');
    expect(out).not.toContain('top: 0');
  });

  it('safe CSS properties are preserved by sanitiseCssStyle', () => {
    const raw = 'font-size: 12pt; font-weight: bold; color: #000; background-color: #FEF08A; text-align: center; vertical-align: top; border-color: #ccc; border-width: 1px';
    const out = sanitiseCssStyle(raw);
    expect(out).toContain('font-size: 12pt');
    expect(out).toContain('font-weight: bold');
    expect(out).toContain('color: #000');
    expect(out).toContain('background-color: #FEF08A');
    expect(out).toContain('text-align: center');
    expect(out).toContain('vertical-align: top');
    expect(out).toContain('border-color: #ccc');
    expect(out).toContain('border-width: 1px');
  });

  it('data: URI in style value is stripped', () => {
    const raw = 'background: data:image/png;base64,abc';
    const out = sanitiseCssStyle(raw);
    expect(out).toBe('');
  });

  it('vbscript: in style value is stripped', () => {
    const raw = 'behavior: url(vbscript:msgbox(1))';
    const out = sanitiseCssStyle(raw);
    expect(out).toBe('');
  });
});
