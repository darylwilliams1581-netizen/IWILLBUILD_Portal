/**
 * canvas-print-layout — regression tests for Studio HTML canvas layout fixes
 * ─────────────────────────────────────────────────────────────────────────────
 * P1  Wide 8-column SWMS table fits within A4 printable width
 * P2  Images and banners cannot exceed the printable width
 * P3  Canvas padding is reduced (≤ 30 px at 100% zoom)
 * P4  Print margins are small and consistent (8 mm @page rule present)
 * P5  All CSS is scoped to .studio-doc — app navigation and modal styling unaffected
 * P6  box-sizing: border-box applied inside scope
 * P7  Table min-width override present (prevents horizontal clipping)
 * P8  Table cells word-break and overflow-wrap set
 * P9  @page size A4 rule present in print CSS
 * P10 Row controls hidden on print
 * P11 importCss is appended after base + print rules
 * P12 buildScopedStyles is pure — no global side-effects
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render } from '@testing-library/react';
import React from 'react';
import HtmlDocumentCanvas from '../HtmlDocumentCanvas';
import type { ImportReport } from '../types';

// ─── Mocks ────────────────────────────────────────────────────────────────────

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
  document.querySelectorAll('[id^="html-canvas-css-"]').forEach((el) => el.remove());
  document.getElementById('html-canvas-row-controls-css')?.remove();
});

// ─── Helpers ──────────────────────────────────────────────────────────────────

const TEMPLATE_ID = 99;

const CLEAN_REPORT: ImportReport = {
  messageCount: 0,
  warnings: [],
  imageCount: 0,
  pageBreakCount: 0,
  hadUnsupported: false,
};

/** 8-column SWMS table with fixed pixel widths (as mammoth might emit) */
const WIDE_SWMS_TABLE = `
<table style="width:1200px;min-width:900px;">
  <colgroup>
    <col style="width:150px"/><col style="width:150px"/>
    <col style="width:150px"/><col style="width:150px"/>
    <col style="width:150px"/><col style="width:150px"/>
    <col style="width:150px"/><col style="width:150px"/>
  </colgroup>
  <tbody>
    <tr>
      <th>Activity</th><th>Hazard</th><th>Risk</th><th>Control</th>
      <th>Residual</th><th>Responsible</th><th>PPE</th><th>Sign-off</th>
    </tr>
    <tr>
      <td>Excavation</td><td>Cave-in</td><td>High</td><td>Shore walls</td>
      <td>Medium</td><td>Site supervisor</td><td>Hard hat, boots</td><td></td>
    </tr>
  </tbody>
</table>
`;

const BANNER_HTML = `
<div class="banner" style="width:1400px;min-width:800px;">
  <img src="/test-banner.png" style="width:1400px;" alt="banner" />
</div>
`;

function getInjectedCss(templateId: number): string {
  const tag = document.getElementById(`html-canvas-css-${templateId}`);
  return tag?.textContent ?? '';
}

function renderCanvas(html = '<p>Hello</p>', importCss = '', templateId = TEMPLATE_ID) {
  return render(
    <HtmlDocumentCanvas
      templateId={templateId}
      htmlContent={html}
      importCss={importCss}
      importReport={CLEAN_REPORT}
      mode="build"
    />,
  );
}

// ─── P1: Wide 8-column SWMS table fits within A4 ─────────────────────────────

describe('P1 — wide 8-column SWMS table fits within A4', () => {
  it('injected CSS sets table width to 100%', () => {
    renderCanvas(WIDE_SWMS_TABLE);
    const css = getInjectedCss(TEMPLATE_ID);
    expect(css).toContain('width: 100%');
    expect(css).toContain('max-width: 100%');
  });

  it('injected CSS overrides inline fixed table widths', () => {
    renderCanvas(WIDE_SWMS_TABLE);
    const css = getInjectedCss(TEMPLATE_ID);
    // Must use !important to beat inline style="width:1200px"
    expect(css).toMatch(/table\s*\{[^}]*width:\s*100%\s*![^}]*\}/s);
  });

  it('injected CSS removes table min-width', () => {
    renderCanvas(WIDE_SWMS_TABLE);
    const css = getInjectedCss(TEMPLATE_ID);
    expect(css).toMatch(/min-width:\s*0\s*!important/);
  });

  it('injected CSS sets table-layout: auto', () => {
    renderCanvas(WIDE_SWMS_TABLE);
    const css = getInjectedCss(TEMPLATE_ID);
    expect(css).toContain('table-layout: auto');
  });

  it('injected CSS overrides col fixed widths', () => {
    renderCanvas(WIDE_SWMS_TABLE);
    const css = getInjectedCss(TEMPLATE_ID);
    // col width override
    expect(css).toMatch(/col\[style\*="width"\]|colgroup col/);
    expect(css).toMatch(/width:\s*auto\s*!important/);
  });
});

// ─── P2: Images and banners cannot exceed printable width ─────────────────────

describe('P2 — images and banners cannot exceed printable width', () => {
  it('injected CSS sets max-width: 100% on img', () => {
    renderCanvas(BANNER_HTML);
    const css = getInjectedCss(TEMPLATE_ID);
    expect(css).toMatch(/img[^{]*\{[^}]*max-width:\s*100%/s);
  });

  it('injected CSS sets height: auto on img', () => {
    renderCanvas(BANNER_HTML);
    const css = getInjectedCss(TEMPLATE_ID);
    expect(css).toMatch(/img[^{]*\{[^}]*height:\s*auto/s);
  });

  it('injected CSS constrains .banner elements', () => {
    renderCanvas(BANNER_HTML);
    const css = getInjectedCss(TEMPLATE_ID);
    expect(css).toContain('.banner');
    expect(css).toMatch(/\.banner[^{]*\{[^}]*max-width:\s*100%/s);
  });

  it('injected CSS constrains [class*="banner"] elements', () => {
    renderCanvas(BANNER_HTML);
    const css = getInjectedCss(TEMPLATE_ID);
    expect(css).toContain('[class*="banner"]');
  });

  it('print CSS also enforces max-width: 100% on img', () => {
    renderCanvas(BANNER_HTML);
    const css = getInjectedCss(TEMPLATE_ID);
    // The @media print block contains img max-width override.
    // We verify both the @media print block exists and the img rule is present
    // within the overall CSS (the print block spans multiple nested braces).
    expect(css).toContain('@media print');
    // img max-width !important must appear somewhere after @media print
    const printStart = css.indexOf('@media print');
    const afterPrint = css.slice(printStart);
    expect(afterPrint).toContain('max-width: 100% !important');
  });
});

// ─── P3: Canvas padding is reduced ────────────────────────────────────────────

describe('P3 — canvas padding is reduced', () => {
  it('canvas wrapper padding at 100% zoom is ≤ 30 px', () => {
    const { container } = renderCanvas();
    // The page wrapper div has inline style padding
    const pageDiv = container.querySelector('[data-testid="canvas-scroll"] > div') as HTMLElement | null;
    expect(pageDiv).not.toBeNull();
    const paddingPx = parseInt(pageDiv!.style.padding, 10);
    // 26 px ≈ 7 mm — must be ≤ 30 px (old value was 48 px)
    expect(paddingPx).toBeLessThanOrEqual(30);
    expect(paddingPx).toBeGreaterThan(0);
  });

  it('canvas wrapper padding at 100% zoom is ≥ 20 px (not zero)', () => {
    const { container } = renderCanvas();
    const pageDiv = container.querySelector('[data-testid="canvas-scroll"] > div') as HTMLElement | null;
    const paddingPx = parseInt(pageDiv!.style.padding, 10);
    expect(paddingPx).toBeGreaterThanOrEqual(20);
  });

  it('canvas wrapper padding scales with zoom', () => {
    const { container } = render(
      <HtmlDocumentCanvas
        templateId={TEMPLATE_ID + 1}
        htmlContent="<p>zoom test</p>"
        importCss=""
        importReport={CLEAN_REPORT}
        mode="build"
        zoom={50}
      />,
    );
    const pageDiv = container.querySelector('[data-testid="canvas-scroll"] > div') as HTMLElement | null;
    const paddingPx = parseInt(pageDiv!.style.padding, 10);
    // At 50% zoom: Math.round(26 * 50 / 100) = 13
    expect(paddingPx).toBe(13);
  });
});

// ─── P4: Print margins are small and consistent ────────────────────────────────

describe('P4 — print margins are small and consistent', () => {
  it('injected CSS contains @page rule', () => {
    renderCanvas();
    const css = getInjectedCss(TEMPLATE_ID);
    expect(css).toContain('@page');
  });

  it('@page rule specifies A4 size', () => {
    renderCanvas();
    const css = getInjectedCss(TEMPLATE_ID);
    expect(css).toMatch(/@page\s*\{[^}]*size:\s*A4/s);
  });

  it('@page rule specifies 8 mm margin', () => {
    renderCanvas();
    const css = getInjectedCss(TEMPLATE_ID);
    expect(css).toMatch(/@page\s*\{[^}]*margin:\s*8mm/s);
  });

  it('@media print rule is present', () => {
    renderCanvas();
    const css = getInjectedCss(TEMPLATE_ID);
    expect(css).toContain('@media print');
  });

  it('print rule resets canvas margin and padding to 0', () => {
    renderCanvas();
    const css = getInjectedCss(TEMPLATE_ID);
    expect(css).toMatch(/margin:\s*0\s*!important/);
    expect(css).toMatch(/padding:\s*0\s*!important/);
  });
});

// ─── P5: All CSS scoped to .studio-doc ────────────────────────────────────────

describe('P5 — all CSS scoped to .studio-doc, no global leakage', () => {
  it('every non-@-rule selector in the base rules starts with .studio-doc', () => {
    // importCss is the converter's output and may contain unscoped rules —
    // that is expected and intentional (the converter scopes its own output).
    // We only verify that the base rules WE generate are all scoped.
    renderCanvas('<p>scope test</p>', '/* custom-import-marker */');
    const css = getInjectedCss(TEMPLATE_ID);

    // Extract only the base rules portion (before the importCss marker)
    const importMarker = '/* custom-import-marker */';
    const baseRules = css.slice(0, css.indexOf(importMarker));

    let insideAtBlock = 0;
    const violatingSelectors: string[] = [];

    for (const rawLine of baseRules.split('\n')) {
      const line = rawLine.trim();
      if (!line || line.startsWith('/*') || line.startsWith('*')) continue;

      if (line.startsWith('@')) {
        if (line.includes('{')) insideAtBlock++;
        continue;
      }
      if (line === '}') {
        if (insideAtBlock > 0) insideAtBlock--;
        continue;
      }

      if (insideAtBlock === 0 && line.includes('{') && !line.startsWith('}')) {
        if (!line.includes('.studio-doc')) {
          violatingSelectors.push(line);
        }
      }
    }

    expect(violatingSelectors).toHaveLength(0);
  });

  it('style tag id is scoped to the template id', () => {
    renderCanvas();
    const tag = document.getElementById(`html-canvas-css-${TEMPLATE_ID}`);
    expect(tag).not.toBeNull();
    // No generic global style tag
    const globalTag = document.getElementById('studio-doc-global-css');
    expect(globalTag).toBeNull();
  });

  it('importCss is wrapped inside the injected tag (not a separate global tag)', () => {
    const customCss = '.my-custom-class { font-size: 14px; }';
    renderCanvas('<p>test</p>', customCss);
    const css = getInjectedCss(TEMPLATE_ID);
    expect(css).toContain(customCss);
    // Confirm it's in the scoped tag, not a separate element
    const allStyleTags = Array.from(document.querySelectorAll('style'));
    const globalCustom = allStyleTags.find(
      (s) => s.textContent?.includes(customCss) && s.id !== `html-canvas-css-${TEMPLATE_ID}`,
    );
    expect(globalCustom).toBeUndefined();
  });
});

// ─── P6: box-sizing: border-box ───────────────────────────────────────────────

describe('P6 — box-sizing: border-box inside scope', () => {
  it('injected CSS sets box-sizing: border-box on scope and all children', () => {
    renderCanvas();
    const css = getInjectedCss(TEMPLATE_ID);
    expect(css).toContain('box-sizing: border-box');
    // Must apply to * inside scope
    expect(css).toMatch(/\.studio-doc[^,{]*\*\s*\{[^}]*box-sizing:\s*border-box/s);
  });
});

// ─── P7: Table min-width override ─────────────────────────────────────────────

describe('P7 — table min-width override prevents horizontal clipping', () => {
  it('injected CSS has min-width: 0 !important on table', () => {
    renderCanvas(WIDE_SWMS_TABLE);
    const css = getInjectedCss(TEMPLATE_ID);
    // Should appear in the base table rule
    expect(css).toMatch(/table\s*\{[^}]*min-width:\s*0\s*!important/s);
  });

  it('injected CSS has min-width: 0 !important on td and th', () => {
    renderCanvas(WIDE_SWMS_TABLE);
    const css = getInjectedCss(TEMPLATE_ID);
    expect(css).toMatch(/td[^{]*,\s*\n?[^{]*th\s*\{[^}]*min-width:\s*0\s*!important/s);
  });
});

// ─── P8: Table cells word-break ───────────────────────────────────────────────

describe('P8 — table cells allow long text to wrap', () => {
  it('injected CSS sets word-break: break-word on td and th', () => {
    renderCanvas(WIDE_SWMS_TABLE);
    const css = getInjectedCss(TEMPLATE_ID);
    expect(css).toContain('word-break: break-word');
  });

  it('injected CSS sets overflow-wrap: break-word on td and th', () => {
    renderCanvas(WIDE_SWMS_TABLE);
    const css = getInjectedCss(TEMPLATE_ID);
    expect(css).toContain('overflow-wrap: break-word');
  });
});

// ─── P9: @page size A4 ────────────────────────────────────────────────────────

describe('P9 — @page size A4 rule', () => {
  it('@page block contains size: A4', () => {
    renderCanvas();
    const css = getInjectedCss(TEMPLATE_ID);
    expect(css).toMatch(/@page\s*\{[^}]*size:\s*A4/s);
  });

  it('@page block contains margin: 8mm', () => {
    renderCanvas();
    const css = getInjectedCss(TEMPLATE_ID);
    expect(css).toMatch(/@page\s*\{[^}]*margin:\s*8mm/s);
  });
});

// ─── P10: Row controls hidden on print ────────────────────────────────────────

describe('P10 — row controls hidden on print', () => {
  it('print CSS hides html-canvas-row-controls class', () => {
    renderCanvas();
    const css = getInjectedCss(TEMPLATE_ID);
    expect(css).toContain('html-canvas-row-controls');
    expect(css).toMatch(/@media print[\s\S]*html-canvas-row-controls[\s\S]*display:\s*none/);
  });

  it('print CSS hides [data-testid="row-controls"]', () => {
    renderCanvas();
    const css = getInjectedCss(TEMPLATE_ID);
    expect(css).toMatch(/@media print[\s\S]*\[data-testid="row-controls"\][\s\S]*display:\s*none/);
  });
});

// ─── P11: importCss appended after base + print rules ─────────────────────────

describe('P11 — importCss appended after base and print rules', () => {
  it('importCss appears after @page and @media print blocks', () => {
    const customCss = '/* custom-import-marker */';
    renderCanvas('<p>test</p>', customCss);
    const css = getInjectedCss(TEMPLATE_ID);
    const pageIdx   = css.indexOf('@page');
    const printIdx  = css.indexOf('@media print');
    const customIdx = css.indexOf(customCss);
    expect(pageIdx).toBeGreaterThanOrEqual(0);
    expect(printIdx).toBeGreaterThanOrEqual(0);
    expect(customIdx).toBeGreaterThan(printIdx);
  });

  it('when importCss is empty, output still contains base and print rules', () => {
    renderCanvas('<p>test</p>', '');
    const css = getInjectedCss(TEMPLATE_ID);
    expect(css).toContain('@page');
    expect(css).toContain('@media print');
    expect(css).toContain('box-sizing: border-box');
  });
});

// ─── P12: No global side-effects ──────────────────────────────────────────────

describe('P12 — buildScopedStyles has no global side-effects', () => {
  it('two different template IDs produce independent style tags', () => {
    const ID_A = 201;
    const ID_B = 202;
    render(
      <HtmlDocumentCanvas
        templateId={ID_A}
        htmlContent="<p>A</p>"
        importCss=""
        importReport={CLEAN_REPORT}
        mode="build"
      />,
    );
    render(
      <HtmlDocumentCanvas
        templateId={ID_B}
        htmlContent="<p>B</p>"
        importCss=""
        importReport={CLEAN_REPORT}
        mode="build"
      />,
    );
    const tagA = document.getElementById(`html-canvas-css-${ID_A}`);
    const tagB = document.getElementById(`html-canvas-css-${ID_B}`);
    expect(tagA).not.toBeNull();
    expect(tagB).not.toBeNull();
    expect(tagA?.textContent).toContain(`data-doc-id="${ID_A}"`);
    expect(tagB?.textContent).toContain(`data-doc-id="${ID_B}"`);
    // Each tag's CSS must not reference the other doc's id
    expect(tagA?.textContent).not.toContain(`data-doc-id="${ID_B}"`);
    expect(tagB?.textContent).not.toContain(`data-doc-id="${ID_A}"`);
  });

  it('no style tag is injected outside the scoped id pattern', () => {
    renderCanvas();
    const allStyleTags = Array.from(document.querySelectorAll('style'));
    const unscoped = allStyleTags.filter(
      (s) =>
        !s.id.startsWith('html-canvas-css-') &&
        s.id !== 'html-canvas-row-controls-css' &&
        s.textContent?.includes('.studio-doc'),
    );
    expect(unscoped).toHaveLength(0);
  });
});
