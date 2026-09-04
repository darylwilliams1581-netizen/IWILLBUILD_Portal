/**
 * HtmlDocumentCanvas — focused component tests
 * ─────────────────────────────────────────────
 * G1  DOM initialisation — innerHTML set once at mount, not on re-render
 * G2  Cursor / scroll stability — no remount on parent re-render
 * G3  contentEditable root — typing, selection, paste work natively
 * G4  Table cell editing — td/th are editable inside the contentEditable root
 * G5  Add row — clones row, clears text, preserves colspan/rowspan, calls onMutate
 * G6  Delete row — removes row, respects minimum-1-row guard, calls onMutate
 * G7  Serialise — serialiseCanvas strips row-control nodes and contenteditable attrs
 * G8  Scoped CSS — style tag injected with correct id, contains doc-id selector
 * G9  Print / page-break styles — .page-break rules present in injected CSS
 * G10 Image selection — img elements are inside the contentEditable root
 * G11 Import report banner — shown only when hadUnsupported or warnings exist
 * G12 Report banner dismiss — X button hides the banner
 * G13 Report warnings expand — toggle button shows/hides warning list
 * G14 Save on blur — PATCH called with serialised HTML; onSaved fires
 * G15 Save skipped when not dirty — no PATCH if nothing changed
 * G16 Save error — error status shown, isDirty reset for retry
 * G17 Preview / use mode — canvas not contentEditable, no row controls
 * G18 Blur inside canvas — focus moving between cells does NOT trigger save
 * G19 attachRowControls idempotency — calling twice does not double-attach
 * G20 serialiseCanvas export — exported function works standalone
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act, fireEvent, screen, waitFor } from '@testing-library/react';
import React from 'react';
import HtmlDocumentCanvas, {
  attachRowControls,
  serialiseCanvas,
} from '../HtmlDocumentCanvas';
import type { ImportReport } from '../types';

// ─── Mocks ────────────────────────────────────────────────────────────────────

// fetch mock — default: success
let fetchMock = vi.fn();
beforeEach(() => {
  fetchMock = vi.fn().mockResolvedValue({
    ok: true,
    json: async () => ({ ok: true }),
  });
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  // Clean up injected style tags between tests
  document.querySelectorAll('[id^="html-canvas-css-"]').forEach((el) => el.remove());
  document.getElementById('html-canvas-row-controls-css')?.remove();
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

const TEMPLATE_ID = 42;

const CLEAN_REPORT: ImportReport = {
  messageCount: 0,
  warnings: [],
  imageCount: 0,
  pageBreakCount: 0,
  hadUnsupported: false,
};

const WARN_REPORT: ImportReport = {
  messageCount: 3,
  warnings: ['Unsupported style: "CustomHeading"', 'Image format not supported'],
  imageCount: 2,
  pageBreakCount: 1,
  hadUnsupported: true,
};

const TABLE_HTML = `
<table>
  <tbody>
    <tr><td>A1</td><td colspan="2">A2</td></tr>
    <tr><td>B1</td><td>B2</td><td>B3</td></tr>
  </tbody>
</table>
`.trim();

const PAGE_BREAK_HTML = `<p>Page one</p><div class="page-break"></div><p>Page two</p>`;

function renderCanvas(
  overrides: Partial<React.ComponentProps<typeof HtmlDocumentCanvas>> = {},
) {
  return render(
    <HtmlDocumentCanvas
      templateId={TEMPLATE_ID}
      htmlContent="<p>Hello world</p>"
      importCss=""
      importReport={null}
      mode="build"
      {...overrides}
    />,
  );
}

function getRoot() {
  return document.querySelector('[data-testid="html-canvas-root"]') as HTMLDivElement;
}

// ─── G1: DOM initialisation ───────────────────────────────────────────────────

describe('G1 — DOM initialisation', () => {
  it('sets innerHTML at mount', () => {
    renderCanvas({ htmlContent: '<p>Hello world</p>' });
    const root = getRoot();
    expect(root.innerHTML).toContain('Hello world');
  });

  it('does NOT replace innerHTML on parent re-render', () => {
    const { rerender } = renderCanvas({ htmlContent: '<p>Original</p>' });
    const root = getRoot();
    // Simulate user typing — mutate the DOM directly
    root.innerHTML = '<p>User typed this</p>';
    // Re-render with same templateId — should NOT reset innerHTML
    rerender(
      <HtmlDocumentCanvas
        templateId={TEMPLATE_ID}
        htmlContent="<p>Original</p>"
        importCss=""
        importReport={null}
        mode="build"
      />,
    );
    expect(root.innerHTML).toContain('User typed this');
  });

  it('re-initialises when templateId changes', () => {
    const { rerender } = renderCanvas({ htmlContent: '<p>Doc A</p>' });
    const rootA = getRoot();
    rootA.innerHTML = '<p>Edited A</p>';

    rerender(
      <HtmlDocumentCanvas
        templateId={99}
        htmlContent="<p>Doc B</p>"
        importCss=""
        importReport={null}
        mode="build"
      />,
    );
    const rootB = getRoot();
    expect(rootB.innerHTML).toContain('Doc B');
    expect(rootB.innerHTML).not.toContain('Edited A');
  });
});

// ─── G2: Cursor / scroll stability ───────────────────────────────────────────

describe('G2 — cursor / scroll stability', () => {
  it('the same DOM node is used before and after re-render', () => {
    const { rerender } = renderCanvas({ htmlContent: '<p>Stable</p>' });
    const before = getRoot();
    rerender(
      <HtmlDocumentCanvas
        templateId={TEMPLATE_ID}
        htmlContent="<p>Stable</p>"
        importCss=""
        importReport={null}
        mode="build"
      />,
    );
    const after = getRoot();
    expect(before).toBe(after);
  });

  it('does not reset scroll container scrollTop on re-render', () => {
    const { rerender } = renderCanvas();
    const scroll = document.querySelector('[data-testid="canvas-scroll"]') as HTMLElement;
    Object.defineProperty(scroll, 'scrollTop', { writable: true, value: 400 });
    rerender(
      <HtmlDocumentCanvas
        templateId={TEMPLATE_ID}
        htmlContent="<p>Updated</p>"
        importCss=""
        importReport={null}
        mode="build"
      />,
    );
    expect(scroll.scrollTop).toBe(400);
  });
});

// ─── G3: contentEditable root ─────────────────────────────────────────────────

describe('G3 — contentEditable root', () => {
  it('canvas root has contentEditable="true" in build mode', () => {
    renderCanvas({ mode: 'build' });
    expect(getRoot().getAttribute('contenteditable')).toBe('true');
  });

  it('canvas root does NOT have contentEditable in preview mode', () => {
    renderCanvas({ mode: 'preview' });
    const root = getRoot();
    expect(root.getAttribute('contenteditable')).toBeNull();
  });

  it('canvas root does NOT have contentEditable in use mode', () => {
    renderCanvas({ mode: 'use' });
    const root = getRoot();
    expect(root.getAttribute('contenteditable')).toBeNull();
  });

  it('carries data-doc-id matching templateId', () => {
    renderCanvas({ templateId: 77 });
    expect(document.querySelector('[data-doc-id="77"]')).not.toBeNull();
  });

  it('onInput marks dirty flag (indirectly via save trigger)', async () => {
    const onSaved = vi.fn();
    renderCanvas({ onSaved });
    const root = getRoot();
    // Simulate typing
    fireEvent.input(root);
    // Blur to trigger save
    fireEvent.blur(root, { relatedTarget: null });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(onSaved).toHaveBeenCalledTimes(1);
  });
});

// ─── G4: Table cell editing ───────────────────────────────────────────────────

describe('G4 — table cell editing', () => {
  it('td cells inside the contentEditable root are editable', () => {
    renderCanvas({ htmlContent: TABLE_HTML });
    const root = getRoot();
    // The root is contentEditable — all descendants including td are editable
    expect(root.getAttribute('contenteditable')).toBe('true');
    const cells = root.querySelectorAll('td');
    expect(cells.length).toBeGreaterThan(0);
  });

  it('row controls are attached to each tr in build mode', () => {
    renderCanvas({ htmlContent: TABLE_HTML });
    const root = getRoot();
    const controls = root.querySelectorAll('[data-testid="row-controls"]');
    expect(controls.length).toBe(2); // 2 rows
  });

  it('row controls are NOT present in preview mode', () => {
    renderCanvas({ htmlContent: TABLE_HTML, mode: 'preview' });
    const root = getRoot();
    expect(root.querySelectorAll('[data-testid="row-controls"]').length).toBe(0);
  });
});

// ─── G5: Add row ──────────────────────────────────────────────────────────────

describe('G5 — add row', () => {
  it('inserts a new row after the target row', () => {
    renderCanvas({ htmlContent: TABLE_HTML });
    const root = getRoot();
    const tbody = root.querySelector('tbody')!;
    const before = tbody.querySelectorAll('tr').length;

    const addBtn = tbody.querySelector('[data-testid="row-add-btn"]') as HTMLButtonElement;
    fireEvent.mouseDown(addBtn);

    expect(tbody.querySelectorAll('tr').length).toBe(before + 1);
  });

  it('new row cells are empty', () => {
    renderCanvas({ htmlContent: TABLE_HTML });
    const root = getRoot();
    const tbody = root.querySelector('tbody')!;
    const addBtn = tbody.querySelector('[data-testid="row-add-btn"]') as HTMLButtonElement;
    fireEvent.mouseDown(addBtn);

    // The new row is inserted after the first row (index 1)
    const newRow = tbody.querySelectorAll('tr')[1];
    const cells = newRow.querySelectorAll('td, th');
    cells.forEach((cell) => {
      // textContent may be empty string or whitespace after cloning
      expect(cell.textContent?.trim()).toBe('');
    });
  });

  it('preserves colspan on cloned row', () => {
    renderCanvas({ htmlContent: TABLE_HTML });
    const root = getRoot();
    const tbody = root.querySelector('tbody')!;
    // First row has a td with colspan="2"
    const firstRow = tbody.querySelectorAll('tr')[0];
    const addBtn = firstRow.querySelector('[data-testid="row-add-btn"]') as HTMLButtonElement;
    fireEvent.mouseDown(addBtn);

    const newRow = tbody.querySelectorAll('tr')[1];
    const colspanCell = newRow.querySelector('[colspan="2"]');
    expect(colspanCell).not.toBeNull();
  });

  it('marks dirty after add', () => {
    const onSaved = vi.fn();
    renderCanvas({ htmlContent: TABLE_HTML, onSaved });
    const root = getRoot();
    const addBtn = root.querySelector('[data-testid="row-add-btn"]') as HTMLButtonElement;
    fireEvent.mouseDown(addBtn);
    // Blur to trigger save
    fireEvent.blur(root, { relatedTarget: null });
    return waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
  });

  it('new row gets its own row controls', () => {
    renderCanvas({ htmlContent: TABLE_HTML });
    const root = getRoot();
    const tbody = root.querySelector('tbody')!;
    const before = tbody.querySelectorAll('[data-testid="row-controls"]').length;
    const addBtn = tbody.querySelector('[data-testid="row-add-btn"]') as HTMLButtonElement;
    fireEvent.mouseDown(addBtn);
    const after = tbody.querySelectorAll('[data-testid="row-controls"]').length;
    expect(after).toBe(before + 1);
  });
});

// ─── G6: Delete row ───────────────────────────────────────────────────────────

describe('G6 — delete row', () => {
  it('removes the target row', () => {
    renderCanvas({ htmlContent: TABLE_HTML });
    const root = getRoot();
    const tbody = root.querySelector('tbody')!;
    const before = tbody.querySelectorAll('tr').length;
    const delBtn = tbody.querySelector('[data-testid="row-delete-btn"]') as HTMLButtonElement;
    fireEvent.mouseDown(delBtn);
    expect(tbody.querySelectorAll('tr').length).toBe(before - 1);
  });

  it('does NOT delete the last remaining row', () => {
    const singleRow = `<table><tbody><tr><td>Only</td></tr></tbody></table>`;
    renderCanvas({ htmlContent: singleRow });
    const root = getRoot();
    const tbody = root.querySelector('tbody')!;
    const delBtn = tbody.querySelector('[data-testid="row-delete-btn"]') as HTMLButtonElement;
    fireEvent.mouseDown(delBtn);
    expect(tbody.querySelectorAll('tr').length).toBe(1);
  });

  it('marks dirty after delete', () => {
    const onSaved = vi.fn();
    renderCanvas({ htmlContent: TABLE_HTML, onSaved });
    const root = getRoot();
    const delBtn = root.querySelector('[data-testid="row-delete-btn"]') as HTMLButtonElement;
    fireEvent.mouseDown(delBtn);
    fireEvent.blur(root, { relatedTarget: null });
    return waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
  });
});

// ─── G7: serialiseCanvas ──────────────────────────────────────────────────────

describe('G7 — serialiseCanvas', () => {
  it('strips row-control nodes from output', () => {
    renderCanvas({ htmlContent: TABLE_HTML });
    const root = getRoot();
    const html = serialiseCanvas(root);
    expect(html).not.toContain('html-canvas-row-controls');
    expect(html).not.toContain('row-add-btn');
    expect(html).not.toContain('row-delete-btn');
  });

  it('strips contenteditable attributes from output', () => {
    renderCanvas({ htmlContent: '<p>Text</p>' });
    const root = getRoot();
    const html = serialiseCanvas(root);
    expect(html).not.toContain('contenteditable');
  });

  it('preserves actual content', () => {
    renderCanvas({ htmlContent: '<p>Keep me</p>' });
    const root = getRoot();
    const html = serialiseCanvas(root);
    expect(html).toContain('Keep me');
  });

  it('does not mutate the live DOM', () => {
    renderCanvas({ htmlContent: TABLE_HTML });
    const root = getRoot();
    const before = root.querySelectorAll('[data-testid="row-controls"]').length;
    serialiseCanvas(root);
    const after = root.querySelectorAll('[data-testid="row-controls"]').length;
    expect(after).toBe(before);
  });
});

// ─── G8: Scoped CSS ───────────────────────────────────────────────────────────

describe('G8 — scoped CSS injection', () => {
  it('injects a style tag with id html-canvas-css-<templateId>', () => {
    renderCanvas({ templateId: 42, importCss: '.foo { color: red; }' });
    const tag = document.getElementById('html-canvas-css-42');
    expect(tag).not.toBeNull();
    expect(tag?.tagName).toBe('STYLE');
  });

  it('style tag content contains the doc-id selector', () => {
    renderCanvas({ templateId: 42, importCss: '' });
    const tag = document.getElementById('html-canvas-css-42');
    expect(tag?.textContent).toContain('[data-doc-id="42"]');
  });

  it('style tag content includes the importCss', () => {
    renderCanvas({ templateId: 42, importCss: '.custom { font-size: 14px; }' });
    const tag = document.getElementById('html-canvas-css-42');
    expect(tag?.textContent).toContain('.custom');
  });

  it('updates style tag when importCss prop changes', () => {
    const { rerender } = renderCanvas({ templateId: 42, importCss: '.old { }' });
    rerender(
      <HtmlDocumentCanvas
        templateId={42}
        htmlContent="<p>x</p>"
        importCss=".new { color: blue; }"
        importReport={null}
        mode="build"
      />,
    );
    const tag = document.getElementById('html-canvas-css-42');
    expect(tag?.textContent).toContain('.new');
    expect(tag?.textContent).not.toContain('.old');
  });
});

// ─── G9: Print / page-break styles ───────────────────────────────────────────

describe('G9 — print and page-break styles', () => {
  it('injected CSS contains @media print rule', () => {
    renderCanvas({ templateId: 42 });
    const tag = document.getElementById('html-canvas-css-42');
    expect(tag?.textContent).toContain('@media print');
  });

  it('injected CSS contains .page-break rule', () => {
    renderCanvas({ templateId: 42 });
    const tag = document.getElementById('html-canvas-css-42');
    expect(tag?.textContent).toContain('.page-break');
  });

  it('page-break div is rendered inside the canvas', () => {
    renderCanvas({ htmlContent: PAGE_BREAK_HTML });
    const root = getRoot();
    expect(root.querySelector('.page-break')).not.toBeNull();
  });
});

// ─── G10: Image selection ─────────────────────────────────────────────────────

describe('G10 — image selection', () => {
  it('img elements are inside the contentEditable root', () => {
    const imgHtml = '<p><img src="/test.png" alt="test" /></p>';
    renderCanvas({ htmlContent: imgHtml });
    const root = getRoot();
    expect(root.getAttribute('contenteditable')).toBe('true');
    const img = root.querySelector('img');
    expect(img).not.toBeNull();
    // img is a descendant of the contentEditable root — browser allows selection
    expect(root.contains(img)).toBe(true);
  });
});

// ─── G11: Import report banner ────────────────────────────────────────────────

describe('G11 — import report banner', () => {
  it('banner NOT shown when importReport is null', () => {
    renderCanvas({ importReport: null });
    expect(screen.queryByTestId('import-report-banner')).toBeNull();
  });

  it('banner NOT shown when report is clean (no warnings, no unsupported)', () => {
    renderCanvas({ importReport: CLEAN_REPORT });
    expect(screen.queryByTestId('import-report-banner')).toBeNull();
  });

  it('banner shown when hadUnsupported is true', () => {
    renderCanvas({
      importReport: { ...CLEAN_REPORT, hadUnsupported: true },
    });
    expect(screen.getByTestId('import-report-banner')).toBeTruthy();
  });

  it('banner shown when warnings exist', () => {
    renderCanvas({ importReport: WARN_REPORT });
    expect(screen.getByTestId('import-report-banner')).toBeTruthy();
  });

  it('banner shows hadUnsupported text', () => {
    renderCanvas({
      importReport: { ...CLEAN_REPORT, hadUnsupported: true },
    });
    expect(screen.getByTestId('import-report-banner').textContent).toContain(
      'unsupported constructs were dropped',
    );
  });

  it('banner shows image count when imageCount > 0', () => {
    renderCanvas({ importReport: WARN_REPORT });
    expect(screen.getByTestId('import-report-banner').textContent).toContain('2 images');
  });

  it('banner shows page break count when pageBreakCount > 0', () => {
    renderCanvas({ importReport: WARN_REPORT });
    expect(screen.getByTestId('import-report-banner').textContent).toContain('1 page break');
  });
});

// ─── G12: Report banner dismiss ───────────────────────────────────────────────

describe('G12 — report banner dismiss', () => {
  it('clicking dismiss hides the banner', async () => {
    renderCanvas({ importReport: WARN_REPORT });
    const dismissBtn = screen.getByLabelText('Dismiss import report');
    await act(async () => { fireEvent.click(dismissBtn); });
    expect(screen.queryByTestId('import-report-banner')).toBeNull();
  });
});

// ─── G13: Report warnings expand ─────────────────────────────────────────────

describe('G13 — report warnings expand/collapse', () => {
  it('warnings list is hidden by default', () => {
    renderCanvas({ importReport: WARN_REPORT });
    expect(screen.queryByText('Unsupported style: "CustomHeading"')).toBeNull();
  });

  it('clicking toggle shows warnings', async () => {
    renderCanvas({ importReport: WARN_REPORT });
    const toggleBtn = screen.getByRole('button', { name: /2 warnings/i });
    await act(async () => { fireEvent.click(toggleBtn); });
    expect(screen.getByText('Unsupported style: "CustomHeading"')).toBeTruthy();
  });

  it('clicking toggle again hides warnings', async () => {
    renderCanvas({ importReport: WARN_REPORT });
    const toggleBtn = screen.getByRole('button', { name: /2 warnings/i });
    await act(async () => { fireEvent.click(toggleBtn); });
    await act(async () => { fireEvent.click(toggleBtn); });
    expect(screen.queryByText('Unsupported style: "CustomHeading"')).toBeNull();
  });
});

// ─── G14: Save on blur ────────────────────────────────────────────────────────

describe('G14 — save on blur', () => {
  it('calls PATCH with serialised HTML on blur after input', async () => {
    const onSaved = vi.fn();
    renderCanvas({ onSaved });
    const root = getRoot();
    fireEvent.input(root);
    fireEvent.blur(root, { relatedTarget: null });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, opts] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`/api/document-templates/${TEMPLATE_ID}`);
    expect((opts as RequestInit & { method: string }).method).toBe('PATCH');
    const body = JSON.parse(opts.body as string) as { htmlContent: string };
    expect(body).toHaveProperty('htmlContent');
    expect(onSaved).toHaveBeenCalledTimes(1);
  });

  it('saved HTML does not contain row-control markup', async () => {
    renderCanvas({ htmlContent: TABLE_HTML });
    const root = getRoot();
    fireEvent.input(root);
    fireEvent.blur(root, { relatedTarget: null });
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const body = JSON.parse(fetchMock.mock.calls[0][1].body as string) as { htmlContent: string };
    expect(body.htmlContent).not.toContain('html-canvas-row-controls');
  });

  it('shows "Saving…" status during fetch', async () => {
    let resolve!: (v: unknown) => void;
    fetchMock.mockReturnValue(new Promise((r) => { resolve = r; }));
    renderCanvas();
    const root = getRoot();
    fireEvent.input(root);
    act(() => { fireEvent.blur(root, { relatedTarget: null }); });
    expect(screen.getByRole('status').textContent).toContain('Saving');
    resolve({ ok: true, json: async () => ({ ok: true }) });
  });

  it('shows "Saved" after successful save', async () => {
    renderCanvas();
    const root = getRoot();
    fireEvent.input(root);
    fireEvent.blur(root, { relatedTarget: null });
    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('Saved'));
  });
});

// ─── G15: Save skipped when not dirty ────────────────────────────────────────

describe('G15 — save skipped when not dirty', () => {
  it('does NOT call PATCH if no input event fired', async () => {
    renderCanvas();
    const root = getRoot();
    fireEvent.blur(root, { relatedTarget: null });
    await new Promise((r) => setTimeout(r, 50));
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

// ─── G16: Save error ─────────────────────────────────────────────────────────

describe('G16 — save error handling', () => {
  it('shows error status on fetch failure', async () => {
    fetchMock.mockRejectedValue(new Error('Network error'));
    renderCanvas();
    const root = getRoot();
    fireEvent.input(root);
    fireEvent.blur(root, { relatedTarget: null });
    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toContain('Save failed'),
    );
  });

  it('shows error status on non-ok response', async () => {
    fetchMock.mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'Forbidden' }),
    });
    renderCanvas();
    const root = getRoot();
    fireEvent.input(root);
    fireEvent.blur(root, { relatedTarget: null });
    await waitFor(() =>
      expect(screen.getByRole('status').textContent).toContain('Forbidden'),
    );
  });
});

// ─── G17: Preview / use mode ─────────────────────────────────────────────────

describe('G17 — preview and use mode', () => {
  it('no row controls in preview mode', () => {
    renderCanvas({ htmlContent: TABLE_HTML, mode: 'preview' });
    expect(document.querySelectorAll('[data-testid="row-controls"]').length).toBe(0);
  });

  it('no row controls in use mode', () => {
    renderCanvas({ htmlContent: TABLE_HTML, mode: 'use' });
    expect(document.querySelectorAll('[data-testid="row-controls"]').length).toBe(0);
  });

  it('no editable hint bar in preview mode', () => {
    renderCanvas({ mode: 'preview' });
    expect(screen.queryByText(/Changes save automatically/)).toBeNull();
  });

  it('editable hint bar shown in build mode', () => {
    renderCanvas({ mode: 'build' });
    expect(screen.getByText(/Changes save automatically/)).toBeTruthy();
  });
});

// ─── G18: Blur inside canvas does not trigger save ────────────────────────────

describe('G18 — blur inside canvas (focus moves between cells)', () => {
  it('does NOT call PATCH when relatedTarget is inside the canvas', async () => {
    renderCanvas({ htmlContent: TABLE_HTML });
    const root = getRoot();
    const cells = root.querySelectorAll('td');
    fireEvent.input(root);
    // Blur from root to a child cell — relatedTarget is inside the canvas
    fireEvent.blur(root, { relatedTarget: cells[1] });
    await new Promise((r) => setTimeout(r, 50));
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

// ─── G19: attachRowControls idempotency ──────────────────────────────────────

describe('G19 — attachRowControls idempotency', () => {
  it('calling attachRowControls twice does not double-attach controls', () => {
    const div = document.createElement('div');
    div.innerHTML = TABLE_HTML;
    document.body.appendChild(div);
    const onMutate = vi.fn();
    attachRowControls(div, onMutate);
    attachRowControls(div, onMutate);
    const controls = div.querySelectorAll('[data-testid="row-controls"]');
    expect(controls.length).toBe(2); // 2 rows, 1 control each
    div.remove();
  });
});

// ─── G20: serialiseCanvas standalone ─────────────────────────────────────────

describe('G20 — serialiseCanvas standalone export', () => {
  it('works on a plain div without rendering the component', () => {
    const div = document.createElement('div');
    div.innerHTML = `<p contenteditable="true">Text</p><div class="html-canvas-row-controls">ctrl</div>`;
    const result = serialiseCanvas(div);
    expect(result).toContain('Text');
    expect(result).not.toContain('html-canvas-row-controls');
    expect(result).not.toContain('contenteditable');
  });

  it('does not mutate the source element', () => {
    const div = document.createElement('div');
    div.innerHTML = `<p contenteditable="true">Text</p>`;
    serialiseCanvas(div);
    expect(div.querySelector('[contenteditable]')).not.toBeNull();
  });
});
