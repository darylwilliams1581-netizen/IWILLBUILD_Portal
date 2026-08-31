/**
 * table-grid-lines — focused regression tests for Studio HTML canvas table grid lines
 * ─────────────────────────────────────────────────────────────────────────────
 * G1  Screen CSS: document td/th have a visible 1px border
 * G2  Screen CSS: border-collapse: collapse on document tables
 * G3  Print CSS: td/th have a 0.5pt solid border
 * G4  Print CSS: border-collapse: collapse on tables
 * G5  Imported inline border wins (not overridden by scoped default)
 * G6  Layout table (.doc-columns-grid) has no border on screen
 * G7  Layout table (.doc-columns-grid) has no border in print
 * G8  .no-grid table has no border on screen
 * G9  colspan/rowspan attributes are preserved after canvas mount
 * G10 Risk Matrix table cells keep their own border rule
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act } from '@testing-library/react';
import React, { createRef } from 'react';
import HtmlDocumentCanvas from '../HtmlDocumentCanvas';
import type { HtmlDocumentCanvasHandle } from '../HtmlDocumentCanvas';
import type { ImportReport } from '../types';

let fetchMock = vi.fn();
beforeEach(() => {
  fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  document.querySelectorAll('[id^="html-canvas-css-"]').forEach((el) => el.remove());
  document.getElementById('html-canvas-row-controls-css')?.remove();
});

vi.mock('../useDocumentStore', () => ({
  useDocumentStore: () => ({ appendBlocks: vi.fn(), sourceJobId: null }),
}));

const TEMPLATE_ID = 77;
const CLEAN_REPORT: ImportReport = {
  messageCount: 0, warnings: [], imageCount: 0, pageBreakCount: 0, hadUnsupported: false,
};

function renderCanvas(htmlContent = '<p>Start</p>', importCss = '') {
  const ref = createRef<HtmlDocumentCanvasHandle>();
  const { container } = render(
    <HtmlDocumentCanvas
      ref={ref}
      templateId={TEMPLATE_ID}
      htmlContent={htmlContent}
      importCss={importCss}
      importReport={CLEAN_REPORT}
      mode="build"
    />,
  );
  return { container, ref };
}

function getCss() {
  return document.getElementById('html-canvas-css-' + TEMPLATE_ID)?.textContent ?? '';
}

// ─── G1: Screen td/th border ─────────────────────────────────────────────────

describe('G1 — Screen CSS: document td/th have a visible 1px border', () => {
  it('scoped CSS contains border: 1px solid for td/th', () => {
    renderCanvas();
    const screenCss = getCss().split('@media print')[0];
    expect(screenCss).toContain('border: 1px solid');
  });

  it('the border colour is not transparent or white', () => {
    renderCanvas();
    const screenCss = getCss().split('@media print')[0];
    expect(screenCss).not.toMatch(/border:\s*1px solid\s*(transparent|#fff|white)/i);
  });
});

// ─── G2: border-collapse ─────────────────────────────────────────────────────

describe('G2 — Screen CSS: border-collapse: collapse on document tables', () => {
  it('scoped CSS contains border-collapse: collapse', () => {
    renderCanvas();
    expect(getCss()).toContain('border-collapse: collapse');
  });

  it('scoped CSS contains border-spacing: 0', () => {
    renderCanvas();
    expect(getCss()).toContain('border-spacing: 0');
  });
});

// ─── G3: Print td/th border ──────────────────────────────────────────────────

describe('G3 — Print CSS: td/th have a 0.5pt solid border', () => {
  it('@media print block contains 0.5pt solid border for td/th', () => {
    renderCanvas();
    const printCss = getCss().split('@media print')[1] ?? '';
    expect(printCss).toContain('0.5pt solid');
  });

  it('print border is not transparent', () => {
    renderCanvas();
    const printCss = getCss().split('@media print')[1] ?? '';
    expect(printCss).not.toMatch(/0\.5pt solid\s*(transparent|#fff|white)/i);
  });
});

// ─── G4: Print border-collapse ───────────────────────────────────────────────

describe('G4 — Print CSS: border-collapse: collapse on tables', () => {
  it('@media print block contains border-collapse: collapse', () => {
    renderCanvas();
    const printCss = getCss().split('@media print')[1] ?? '';
    expect(printCss).toContain('border-collapse: collapse');
  });
});

// ─── G5: Imported inline border wins ─────────────────────────────────────────

describe('G5 — Imported inline border wins (not overridden by scoped default)', () => {
  it('inline style border on a td is preserved in the DOM after mount', async () => {
    const html = '<table><tbody><tr><td style="border: 2px solid #ff0000;">Red border</td></tr></tbody></table>';
    const { container } = renderCanvas(html);
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    const td = container.querySelector('td') as HTMLTableCellElement | null;
    expect(td).not.toBeNull();
    expect(td?.getAttribute('style')).toContain('border');
  });

  it('scoped CSS td/th border rule does NOT use !important (so inline wins)', () => {
    renderCanvas();
    const screenCss = getCss().split('@media print')[0];
    const lines = screenCss.split('\n');
    const borderLine = lines.find((l) => l.includes('border: 1px solid') && !l.includes('@media'));
    expect(borderLine).toBeDefined();
    expect(borderLine).not.toContain('!important');
  });
});

// ─── G6: Layout table borderless on screen ───────────────────────────────────

describe('G6 — Layout table (.doc-columns-grid) has no border on screen', () => {
  it('scoped CSS contains border: none for .doc-columns-grid td', () => {
    renderCanvas();
    const screenCss = getCss().split('@media print')[0];
    expect(screenCss).toContain('doc-columns-grid');
    const afterGrid = screenCss.slice(screenCss.indexOf('doc-columns-grid'));
    expect(afterGrid).toContain('border: none');
  });
});

// ─── G7: Layout table borderless in print ────────────────────────────────────

describe('G7 — Layout table (.doc-columns-grid) has no border in print', () => {
  it('@media print block contains border: none for .doc-columns-grid td', () => {
    renderCanvas();
    const printCss = getCss().split('@media print')[1] ?? '';
    expect(printCss).toContain('doc-columns-grid');
    const afterGrid = printCss.slice(printCss.indexOf('doc-columns-grid'));
    expect(afterGrid).toContain('border: none');
  });
});

// ─── G8: .no-grid table borderless ───────────────────────────────────────────

describe('G8 — .no-grid table has no border on screen', () => {
  it('scoped CSS contains border: none for .no-grid td', () => {
    renderCanvas();
    const screenCss = getCss().split('@media print')[0];
    expect(screenCss).toContain('no-grid');
    const afterNoGrid = screenCss.slice(screenCss.indexOf('no-grid'));
    expect(afterNoGrid).toContain('border: none');
  });
});

// ─── G9: colspan/rowspan preserved ───────────────────────────────────────────

describe('G9 — colspan/rowspan attributes are preserved after canvas mount', () => {
  it('colspan="2" survives mount', async () => {
    const html = '<table><thead><tr><th colspan="2">Header</th></tr></thead><tbody><tr><td>A</td><td>B</td></tr></tbody></table>';
    const { container } = renderCanvas(html);
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    const th = container.querySelector('th[colspan="2"]');
    expect(th).not.toBeNull();
    expect(th?.getAttribute('colspan')).toBe('2');
  });

  it('rowspan="2" survives mount', async () => {
    const html = '<table><tbody><tr><td rowspan="2">Merged</td><td>B</td></tr><tr><td>C</td></tr></tbody></table>';
    const { container } = renderCanvas(html);
    await act(async () => { await new Promise((r) => setTimeout(r, 20)); });
    const td = container.querySelector('td[rowspan="2"]');
    expect(td).not.toBeNull();
    expect(td?.getAttribute('rowspan')).toBe('2');
  });
});

// ─── G10: Risk Matrix table border ───────────────────────────────────────────

describe('G10 — Risk Matrix table cells keep their own border rule', () => {
  it('scoped CSS contains a .risk-matrix-table td/th border rule', () => {
    renderCanvas();
    const screenCss = getCss().split('@media print')[0];
    expect(screenCss).toContain('.risk-matrix-table');
    const afterRm = screenCss.slice(screenCss.indexOf('.risk-matrix-table'));
    expect(afterRm).toContain('border');
  });
});
