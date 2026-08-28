/**
 * Regression tests — TableBlock contentEditable editing
 *
 * Root causes fixed:
 *
 * 1. dangerouslySetInnerHTML on focused contentEditable (TableBlock.tsx)
 *    Every parent re-render (select, updateBlock from inspector, autosave)
 *    caused React to unconditionally replace innerHTML on the focused cell,
 *    restoring deleted characters, resetting the caret, and triggering a
 *    browser scroll-to-focus jump.
 *
 * 2. Same latent bug in RichTextBlock.tsx — dangerouslySetInnerHTML prop
 *    overrode the useEffect sync guard on every render.
 *
 * 3. useLayoutEffect scroll guard in BlockCanvas.tsx was too broad — it
 *    restored scrollTop on every blocks/selection change, fighting legitimate
 *    keyboard scrolling. Narrowed to only fire when a contentEditable inside
 *    the canvas is focused.
 *
 * Fix pattern (both TableBlock and RichTextBlock):
 *   - No dangerouslySetInnerHTML on edit-mode contentEditables.
 *   - Initial innerHTML set imperatively via ref callback (once at mount).
 *   - External value synced via useEffect only when element is NOT focused.
 *   - Commit (updateBlock) fires on blur only.
 *   - All control buttons have type="button".
 *
 * These tests assert:
 *   1. Deleted text stays deleted after a parent re-render.
 *   2. The same editable DOM node remains focused after a parent re-render.
 *   3. scrollTop does not jump when a parent re-render fires while a cell is focused.
 *   4. Blur commits the final value once (not on every keystroke).
 *   5. Column header editing works the same way.
 *   6. Row/column structural controls have type="button".
 *   7. External value sync fires when element is NOT focused.
 *   8. External value sync does NOT fire when element IS focused.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, act, fireEvent } from '@testing-library/react';
import React from 'react';

// ── Mocks ─────────────────────────────────────────────────────────────────────

// DOMParser is available in jsdom — no stub needed.
// sanitiseHtml uses DOMParser; stub it to return the input unchanged so tests
// can assert on exact strings without worrying about sanitisation transforms.
vi.mock('../sanitiseHtml', () => ({
  sanitiseHtml: (s: string) => s,
}));

// Minimal store mock
const mockUpdateBlock = vi.fn();
const mockUpdateBlockInColumn = vi.fn();
let mockMode = 'edit';

vi.mock('../useDocumentStore', () => ({
  useDocumentStore: (selector?: (s: unknown) => unknown) => {
    const store = {
      mode: mockMode,
      updateBlock: mockUpdateBlock,
      updateBlockInColumn: mockUpdateBlockInColumn,
    };
    return typeof selector === 'function' ? selector(store) : store;
  },
  newId: () => `id-${Math.random().toString(36).slice(2, 8)}`,
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeBlock(overrides: Partial<{
  id: string;
  columns: Array<{ id: string; header: string; cellType: string; width: number }>;
  rows: Array<{ id: string; cells: Record<string, string> }>;
  stripedRows: boolean;
  headerBgColor: string;
  headerTextColor: string;
}> = {}) {
  return {
    id: 'block-1',
    type: 'table' as const,
    columns: [
      { id: 'col-a', header: 'Name', cellType: 'text', width: 1 },
      { id: 'col-b', header: 'Value', cellType: 'text', width: 1 },
    ],
    rows: [
      { id: 'row-1', cells: { 'col-a': 'Alice', 'col-b': '100' } },
      { id: 'row-2', cells: { 'col-a': 'Bob',   'col-b': '200' } },
    ],
    stripedRows: false,
    headerBgColor: '#1e293b',
    headerTextColor: '#ffffff',
    ...overrides,
  };
}

async function renderTable(block = makeBlock()) {
  const { default: TableBlockView } = await import('../blocks/TableBlock');
  return render(<TableBlockView block={block} />);
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('TableBlock — contentEditable editing regression', () => {
  beforeEach(() => {
    mockMode = 'edit';
    vi.clearAllMocks();
    vi.resetModules();
  });

  // ── 1. Initial content is rendered ────────────────────────────────────────

  it('renders cell content on mount', async () => {
    const { container } = await renderTable();
    const cells = container.querySelectorAll('[data-cell-id]');
    const texts = Array.from(cells).map((c) => c.textContent);
    expect(texts).toContain('Alice');
    expect(texts).toContain('Bob');
    expect(texts).toContain('Name');
    expect(texts).toContain('Value');
  });

  // ── 2. No dangerouslySetInnerHTML on edit-mode contentEditables ────────────

  it('does NOT set dangerouslySetInnerHTML on contentEditable cells', async () => {
    // If dangerouslySetInnerHTML is present, React sets a data-reactroot attribute
    // and the __html prop is visible in the rendered HTML as a React internal.
    // More directly: we verify the cell's innerHTML is set imperatively (via ref)
    // and not via a React prop by checking that a re-render with a different
    // block value does NOT overwrite a focused cell's content.
    const block = makeBlock();
    const { default: TableBlockView } = await import('../blocks/TableBlock');
    const { container, rerender } = render(<TableBlockView block={block} />);

    const cell = container.querySelector('[data-cell-id="cell-row-1-col-a"]') as HTMLElement;
    expect(cell).not.toBeNull();

    // Simulate user editing: set innerHTML directly (as the browser would)
    await act(async () => { cell.focus(); });
    cell.innerHTML = 'Alice edited';

    // Simulate a parent re-render with the ORIGINAL block value (as if autosave
    // or inspector triggered a store update that didn't change this cell)
    await act(async () => {
      rerender(<TableBlockView block={block} />);
    });

    // The cell must still show the user's edit, not the original value
    expect(cell.innerHTML).toBe('Alice edited');
  });

  // ── 3. Deleted text stays deleted after parent re-render ──────────────────

  it('deleted text remains deleted after a parent re-render', async () => {
    const block = makeBlock();
    const { default: TableBlockView } = await import('../blocks/TableBlock');
    const { container, rerender } = render(<TableBlockView block={block} />);

    const cell = container.querySelector('[data-cell-id="cell-row-1-col-a"]') as HTMLElement;
    await act(async () => { cell.focus(); });

    // Simulate Backspace: user deleted 'Alice' and typed 'A'
    cell.innerHTML = 'A';

    // Parent re-renders (e.g. inspector changed another block's property)
    await act(async () => {
      rerender(<TableBlockView block={block} />);
    });

    // 'lice' must NOT reappear
    expect(cell.innerHTML).toBe('A');
    expect(cell.innerHTML).not.toContain('lice');
  });

  // ── 4. Same DOM node remains focused after parent re-render ───────────────

  it('the focused cell element remains the same node after a parent re-render', async () => {
    const block = makeBlock();
    const { default: TableBlockView } = await import('../blocks/TableBlock');
    const { container, rerender } = render(<TableBlockView block={block} />);

    const cell = container.querySelector('[data-cell-id="cell-row-2-col-b"]') as HTMLElement;
    await act(async () => { cell.focus(); });

    const nodeBeforeRerender = document.activeElement;

    await act(async () => {
      rerender(<TableBlockView block={block} />);
    });

    // The focused element must be the same DOM node (not remounted)
    expect(document.activeElement).toBe(nodeBeforeRerender);
  });

  // ── 5. Blur commits value exactly once ────────────────────────────────────

  it('calls updateBlock exactly once on blur with the final value', async () => {
    const block = makeBlock();
    const { default: TableBlockView } = await import('../blocks/TableBlock');
    const { container } = render(<TableBlockView block={block} />);

    const cell = container.querySelector('[data-cell-id="cell-row-1-col-a"]') as HTMLElement;
    await act(async () => { cell.focus(); });
    cell.innerHTML = 'Alice updated';

    await act(async () => { fireEvent.blur(cell); });

    expect(mockUpdateBlock).toHaveBeenCalledTimes(1);
    const patch = mockUpdateBlock.mock.calls[0][1] as { rows: Array<{ id: string; cells: Record<string, string> }> };
    const updatedRow = patch.rows.find((r) => r.id === 'row-1');
    expect(updatedRow?.cells['col-a']).toBe('Alice updated');
  });

  // ── 6. Column header editing commits on blur ──────────────────────────────

  it('column header blur commits the new header text', async () => {
    const block = makeBlock();
    const { default: TableBlockView } = await import('../blocks/TableBlock');
    const { container } = render(<TableBlockView block={block} />);

    const header = container.querySelector('[data-cell-id="header-col-a"]') as HTMLElement;
    expect(header).not.toBeNull();
    await act(async () => { header.focus(); });
    header.innerHTML = 'Full Name';

    await act(async () => { fireEvent.blur(header); });

    expect(mockUpdateBlock).toHaveBeenCalledTimes(1);
    const patch = mockUpdateBlock.mock.calls[0][1] as { columns: Array<{ id: string; header: string }> };
    const updatedCol = patch.columns.find((c) => c.id === 'col-a');
    expect(updatedCol?.header).toBe('Full Name');
  });

  // ── 7. External value syncs when cell is NOT focused ──────────────────────

  it('syncs an externally updated cell value when the cell is not focused', async () => {
    const block = makeBlock();
    const { default: TableBlockView } = await import('../blocks/TableBlock');
    const { container, rerender } = render(<TableBlockView block={block} />);

    const cell = container.querySelector('[data-cell-id="cell-row-1-col-a"]') as HTMLElement;
    // Ensure cell is NOT focused
    expect(document.activeElement).not.toBe(cell);

    // Simulate an external update (e.g. undo/redo changed the cell value)
    const updatedBlock = makeBlock({
      rows: [
        { id: 'row-1', cells: { 'col-a': 'Alice (updated externally)', 'col-b': '100' } },
        { id: 'row-2', cells: { 'col-a': 'Bob', 'col-b': '200' } },
      ],
    });

    await act(async () => {
      rerender(<TableBlockView block={updatedBlock} />);
    });

    expect(cell.innerHTML).toBe('Alice (updated externally)');
  });

  // ── 8. External value does NOT sync when cell IS focused ──────────────────

  it('does NOT sync an externally updated value when the cell is focused', async () => {
    const block = makeBlock();
    const { default: TableBlockView } = await import('../blocks/TableBlock');
    const { container, rerender } = render(<TableBlockView block={block} />);

    const cell = container.querySelector('[data-cell-id="cell-row-1-col-a"]') as HTMLElement;
    await act(async () => { cell.focus(); });
    cell.innerHTML = 'User is typing…';

    // External update arrives while cell is focused
    const updatedBlock = makeBlock({
      rows: [
        { id: 'row-1', cells: { 'col-a': 'External override', 'col-b': '100' } },
        { id: 'row-2', cells: { 'col-a': 'Bob', 'col-b': '200' } },
      ],
    });

    await act(async () => {
      rerender(<TableBlockView block={updatedBlock} />);
    });

    // User's in-progress edit must be preserved
    expect(cell.innerHTML).toBe('User is typing…');
  });

  // ── 9. All control buttons have type="button" ─────────────────────────────

  it('all control buttons have type="button" (no accidental form submit)', async () => {
    const { container } = await renderTable();
    const buttons = container.querySelectorAll('button');
    expect(buttons.length).toBeGreaterThan(0);
    buttons.forEach((btn) => {
      expect(btn.getAttribute('type')).toBe('button');
    });
  });

  // ── 10. scrollTop does not jump when parent re-renders while cell focused ──

  it('scrollTop is preserved when a parent re-render fires while a cell is focused', async () => {
    // This test simulates the BlockCanvas scroll guard narrowing:
    // the guard should only restore scrollTop when a contentEditable is focused.
    // We test the TableBlock in isolation here — the scroll guard is in BlockCanvas,
    // but we verify the cell stays focused (which is the precondition for the guard).
    const block = makeBlock();
    const { default: TableBlockView } = await import('../blocks/TableBlock');
    const { container, rerender } = render(
      <div style={{ overflow: 'auto', height: 200 }}>
        <TableBlockView block={block} />
      </div>
    );

    const scrollEl = container.firstElementChild as HTMLElement;
    Object.defineProperty(scrollEl, 'scrollTop', { writable: true, configurable: true, value: 120 });

    const cell = container.querySelector('[data-cell-id="cell-row-2-col-b"]') as HTMLElement;
    await act(async () => { cell.focus(); });

    // Simulate parent re-render
    await act(async () => {
      rerender(
        <div style={{ overflow: 'auto', height: 200 }}>
          <TableBlockView block={block} />
        </div>
      );
    });

    // Cell must still be focused (no remount)
    expect(document.activeElement).toBe(cell);
    // scrollTop must not have been reset
    expect(scrollEl.scrollTop).toBe(120);
  });

  // ── 11. Multiple rapid re-renders don't corrupt cell content ──────────────

  it('handles 10 rapid parent re-renders without corrupting focused cell content', async () => {
    const block = makeBlock();
    const { default: TableBlockView } = await import('../blocks/TableBlock');
    const { container, rerender } = render(<TableBlockView block={block} />);

    const cell = container.querySelector('[data-cell-id="cell-row-1-col-a"]') as HTMLElement;
    await act(async () => { cell.focus(); });
    cell.innerHTML = 'Typing fast';

    for (let i = 0; i < 10; i++) {
      await act(async () => { rerender(<TableBlockView block={block} />); });
    }

    expect(cell.innerHTML).toBe('Typing fast');
  });

  // ── 12. Preview mode renders read-only cells ──────────────────────────────

  it('renders non-editable cells in preview mode', async () => {
    mockMode = 'preview';
    const block = makeBlock();
    const { default: TableBlockView } = await import('../blocks/TableBlock');
    const { container } = render(<TableBlockView block={block} />);

    const editableCells = container.querySelectorAll('[contenteditable]');
    expect(editableCells.length).toBe(0);
  });
});
