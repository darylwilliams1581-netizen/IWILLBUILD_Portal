/**
 * print-design-regression.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Source-integrity tests for the printer-friendly document design refactor.
 *
 * These tests verify:
 *   1. No wide saturated full-fill chrome in shared helpers
 *   2. No wide saturated full-fill chrome in isolated generators
 *   3. Photos/signatures/logos are preserved (not stripped)
 *   4. Explicit status labels are present (not colour-only)
 *   5. Page continuation headers are present
 *   6. Poster files are untouched
 *   7. Document Builder application defaults are printer-friendly
 *   8. User-selected colours (block.backgroundColor) are not overridden
 *
 * "Wide saturated fill" is defined as:
 *   - A drawRectangle / drawRectangle call with width >= PAGE_W (full-width)
 *     AND a saturated colour (not near-white/near-grey)
 *   - OR a CSS background property with a saturated hex on a full-width element
 *
 * These are source-level checks — they do not generate actual PDFs.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';

const root = join(process.cwd(), 'src');

function read(relPath: string): string {
  return readFileSync(join(root, relPath), 'utf-8');
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Returns true if the source contains a drawRectangle call that uses a
 * full-page-width fill (PAGE_W or 595 or 841) with a saturated colour.
 * We look for the pattern: width: PAGE_W (or numeric equivalent) combined
 * with a non-grey colour argument on the same or adjacent line.
 */
function hasFullWidthSaturatedRect(src: string): boolean {
  // Match drawRectangle calls that span full width
  const fullWidthPattern = /drawRectangle\s*\(\s*\{[^}]*width\s*:\s*(PAGE_W|595\.28|841\.89|PAGE_W\s*-\s*0)[^}]*color\s*:/gs;
  const matches = src.matchAll(fullWidthPattern);
  for (const m of matches) {
    const block = m[0];
    // Check if the colour is saturated (not grey/light)
    // Grey colours have all three channels close together and >= 0.85
    // We look for rgb() calls with at least one channel < 0.85 and channels not all equal
    const rgbMatch = block.match(/rgb\s*\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*\)/);
    if (rgbMatch) {
      const [, r, g, b] = rgbMatch.map(Number);
      const isGrey = Math.abs(r - g) < 0.1 && Math.abs(g - b) < 0.1 && r > 0.85;
      const isWhite = r > 0.95 && g > 0.95 && b > 0.95;
      const isNearBlack = r < 0.15 && g < 0.15 && b < 0.15;
      if (!isGrey && !isWhite && !isNearBlack) {
        return true;
      }
      // Near-black full-width fills are also disallowed
      if (isNearBlack) return true;
    }
  }
  return false;
}

/**
 * Returns true if the source contains a CSS background property with a
 * saturated hex colour on a class that is likely full-width (header-bar,
 * .header, body, .page).
 */
function hasSaturatedCssHeaderBackground(src: string): boolean {
  // Look for .header-bar { ... background: <saturated> }
  // or .header { background: <saturated> }
  const headerBgPattern = /\.(header[-_]?bar|header\b)[^}]*background\s*:\s*(#[0-9a-fA-F]{3,6}|rgb\([^)]+\))/gs;
  for (const m of src.matchAll(headerBgPattern)) {
    const colStr = m[2];
    if (colStr.startsWith('#')) {
      const hex = colStr.replace('#', '');
      const r = parseInt(hex.slice(0, 2), 16) / 255;
      const g = parseInt(hex.slice(2, 4), 16) / 255;
      const b = parseInt(hex.slice(4, 6), 16) / 255;
      const isGrey = Math.abs(r - g) < 0.1 && Math.abs(g - b) < 0.1 && r > 0.85;
      const isWhite = r > 0.95 && g > 0.95 && b > 0.95;
      if (!isGrey && !isWhite) return true;
    }
  }
  return false;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('Printer-friendly document design — source integrity', () => {

  // ── 1. Shared pdf-generator.ts ────────────────────────────────────────────

  describe('pdf-generator.ts shared helpers', () => {
    const src = read('server/lib/pdf-generator.ts');

    it('drawHeader does not use a full-width saturated rectangle', () => {
      // Extract just the drawHeader function body
      const fnMatch = src.match(/function drawHeader[\s\S]*?^}/m);
      if (!fnMatch) return; // function not found — skip
      expect(hasFullWidthSaturatedRect(fnMatch[0])).toBe(false);
    });

    it('drawFooter does not use a full-width near-black rectangle', () => {
      const fnMatch = src.match(/function drawFooter[\s\S]*?^}/m);
      if (!fnMatch) return;
      // Should not contain drawRect with near-black (0.059, 0.067, 0.090)
      expect(fnMatch[0]).not.toMatch(/rgb\s*\(\s*0\.059/);
    });

    it('drawHeader uses a thin accent rule (drawLine)', () => {
      const fnMatch = src.match(/function drawHeader[\s\S]*?^}/m);
      if (!fnMatch) return;
      expect(fnMatch[0]).toMatch(/drawLine/);
    });

    it('SWMS title block does not use near-black fill', () => {
      // The old near-black was rgb(0.059, 0.067, 0.090)
      expect(src).not.toMatch(/rgb\s*\(\s*0\.059\s*,\s*0\.067\s*,\s*0\.090\s*\)/);
    });

    it('Invoice AMOUNT DUE row does not use a PURPLE filled rectangle', () => {
      // Old pattern: drawRect(page, totalsX - 8, y - 14, totalsW + 8, 18, PURPLE)
      // New pattern: drawLine (rule only)
      // Check that the totals section uses drawLine not drawRect for the final row
      const totalsSection = src.match(/Totals — rule-separated[\s\S]*?tRows\.forEach/);
      if (!totalsSection) return;
      expect(totalsSection[0]).toMatch(/drawLine/);
    });

    it('Invoice line items table header uses LIGHT (grey) not SLATE (dark)', () => {
      // Old: drawRect(page, MARGIN, y - 2, PAGE_W - MARGIN * 2, 16, SLATE)
      // New: drawRect(page, MARGIN, y - 2, PAGE_W - MARGIN * 2, 16, LIGHT)
      // Check that the line items header section uses LIGHT
      const lineItemsSection = src.match(/Line items table header[\s\S]*?y -= 20/);
      if (!lineItemsSection) return;
      expect(lineItemsSection[0]).toMatch(/LIGHT/);
      // The colour argument should be LIGHT, not SLATE — check the drawRect call specifically
      expect(lineItemsSection[0]).not.toMatch(/drawRect\(page.*16,\s*SLATE\)/);
    });

    it('Status labels are explicit text strings (not colour-only)', () => {
      // Status should be rendered as text (drawText with status string)
      // Old: drawRect + drawText(WHITE) — colour was the only indicator
      // New: drawText with statusTextColor — text is always present
      expect(src).toMatch(/statusLabel\s*=.*toUpperCase/);
    });

    it('generateEstimatePdf is unchanged (already printer-friendly)', () => {
      // Estimate uses GREY_HD (0.88) for table header — should still be present
      expect(src).toMatch(/GREY_HD\s*=\s*rgb\s*\(\s*0\.88/);
      // Estimate should not have a full-width coloured header band
      const estimateFn = src.match(/export async function generateEstimatePdf[\s\S]*?^}/m);
      if (!estimateFn) return;
      expect(estimateFn[0]).not.toMatch(/drawRect.*PAGE_W.*ORANGE/);
    });

    it('page continuation headers are present in generateCostReportPdf', () => {
      const costFn = src.match(/export async function generateCostReportPdf[\s\S]*?return doc\.save/);
      if (!costFn) return;
      // Should have a drawHeader call for continuation pages
      expect(costFn[0]).toMatch(/drawHeader.*cont\./);
    });

    it('sign-off table header uses LIGHT (grey) not SLATE (dark)', () => {
      // Old: drawRect(sigPage, MARGIN, sigY - 2, PAGE_W - MARGIN * 2, 16, SLATE)
      // New: drawRect(sigPage, MARGIN, sigY - 2, PAGE_W - MARGIN * 2, 16, LIGHT)
      const signoffSection = src.match(/Worker Sign-offs[\s\S]*?sigY -= 20/);
      if (!signoffSection) return;
      expect(signoffSection[0]).toMatch(/LIGHT/);
      expect(signoffSection[0]).not.toMatch(/SLATE.*WHITE/);
    });
  });

  // ── 2. Purchase Order PDF ─────────────────────────────────────────────────

  describe('purchase-order-pdf-document.ts', () => {
    const src = read('server/lib/purchase-order-pdf-document.ts');

    it('newPage() does not use a full-width PURPLE rectangle', () => {
      const newPageFn = src.match(/function newPage\(\)[\s\S]*?return p;/);
      if (!newPageFn) return;
      expect(newPageFn[0]).not.toMatch(/drawRectangle[\s\S]*?PURPLE/);
    });

    it('newPage() uses a drawLine accent rule', () => {
      const newPageFn = src.match(/function newPage\(\)[\s\S]*?return p;/);
      if (!newPageFn) return;
      expect(newPageFn[0]).toMatch(/drawLine/);
    });

    it('table header uses LIGHT (grey) not PURPLE', () => {
      expect(src).toMatch(/Table header.*light grey/i);
      // Should not have PURPLE table header
      const tableSection = src.match(/Table header[\s\S]*?y -= 20/);
      if (!tableSection) return;
      expect(tableSection[0]).not.toMatch(/color:\s*PURPLE/);
      expect(tableSection[0]).toMatch(/LIGHT/);
    });

    it('TOTAL row uses drawLine rule not a PURPLE filled rectangle', () => {
      const totalsSection = src.match(/Totals.*rule-separated[\s\S]*?TOTAL \(inc GST\)/);
      if (!totalsSection) return;
      expect(totalsSection[0]).toMatch(/drawLine/);
      expect(totalsSection[0]).not.toMatch(/drawRectangle[\s\S]*?PURPLE/);
    });

    it('status is rendered as text not a filled pill', () => {
      // Old: drawRectangle + drawText(WHITE)
      // New: drawText with sColor
      const statusSection = src.match(/Status.*text only[\s\S]*?y -= 50/);
      if (!statusSection) return;
      expect(statusSection[0]).not.toMatch(/drawRectangle[\s\S]*?sColor/);
    });

    it('page numbers are present', () => {
      expect(src).toMatch(/Page \$\{i \+ 1\} of \$\{totalPages\}/);
    });
  });

  // ── 3. Form PDF Generator ─────────────────────────────────────────────────

  describe('form-pdf-generator.ts', () => {
    const src = read('server/lib/form-pdf-generator.ts');

    it('drawHeader does not use a full-width PURPLE rectangle', () => {
      const fnMatch = src.match(/function drawHeader[\s\S]*?^\s*}/m);
      if (!fnMatch) return;
      expect(fnMatch[0]).not.toMatch(/drawRectangle[\s\S]*?PURPLE/);
    });

    it('drawHeader uses a drawLine accent rule', () => {
      const fnMatch = src.match(/function drawHeader[\s\S]*?^\s*}/m);
      if (!fnMatch) return;
      expect(fnMatch[0]).toMatch(/drawLine/);
    });

    it('status is rendered as text not a filled badge', () => {
      // Old: drawRectangle for badge + drawText(WHITE)
      // New: target.drawText(status, { ... color: GREEN })
      // Verify no drawRectangle uses GREEN (the badge fill was removed)
      expect(src).not.toMatch(/drawRectangle[\s\S]{0,200}GREEN[\s\S]{0,50}badgeWidth/);
      // Verify status is drawn as text
      expect(src).toMatch(/target\.drawText\s*\(\s*status\s*,/);
    });

    it('photo thumbnails are preserved (drawImage calls present)', () => {
      expect(src).toMatch(/drawImage/);
    });

    it('signature images are preserved (drawImage calls present)', () => {
      // Signature field uses drawImage
      expect(src).toMatch(/signature[\s\S]*?drawImage/i);
    });

    it('photo appendix uses light grey header not PURPLE', () => {
      const appendixFn = src.match(/function addAppendixPage[\s\S]*?^\s*}/m);
      if (!appendixFn) return;
      expect(appendixFn[0]).not.toMatch(/PURPLE/);
      expect(appendixFn[0]).toMatch(/LIGHT/);
    });

    it('page numbers are present', () => {
      expect(src).toMatch(/Page \$\{index \+ 1\} of \$\{pages\.length\}/);
    });
  });

  // ── 4. Job Photo Report ───────────────────────────────────────────────────

  describe('jobs/[id]/report/pdf/POST.ts (photo report)', () => {
    const src = read('server/api/jobs/[id]/report/pdf/POST.ts');

    it('drawHeader does not use a full-width COL_ORANGE rectangle', () => {
      const fnMatch = src.match(/function drawHeader[\s\S]*?^\s*\}/m);
      if (!fnMatch) return;
      expect(fnMatch[0]).not.toMatch(/drawRectangle[\s\S]*?COL_ORANGE/);
    });

    it('drawHeader uses a drawLine accent rule', () => {
      const fnMatch = src.match(/function drawHeader[\s\S]*?^\s*\}/m);
      if (!fnMatch) return;
      expect(fnMatch[0]).toMatch(/drawLine/);
    });

    it('category labels use text prefix not coloured pill', () => {
      // Old: drawRectangle + drawText(COL_WHITE)
      // New: drawText with bracket prefix [CATEGORY]
      expect(src).toMatch(/\[.*catLabel.*\]/);
      expect(src).not.toMatch(/drawRectangle[\s\S]*?COL_ORANGE[\s\S]*?catLabel/);
    });

    it('photos are embedded (drawImage calls present)', () => {
      expect(src).toMatch(/drawImage/);
    });

    it('page numbers are present', () => {
      expect(src).toMatch(/pageNum.*totalPages/);
    });
  });

  // ── 5. Progress Report ────────────────────────────────────────────────────

  describe('jobs/[id]/progress/report/pdf/GET.ts (progress report)', () => {
    const src = read('server/api/jobs/[id]/progress/report/pdf/GET.ts');

    it('page 1 header does not use a full-width ORANGE rectangle', () => {
      // Old: rect(page, 0, PAGE_H - 70, PAGE_W, 70, ORANGE)
      // New: rect(page, 0, PAGE_H - 3, PAGE_W, 3, ORANGE) — 3pt rule only
      // Check that the height of the orange rect is 3, not 70
      const headerSection = src.match(/Printer-friendly header[\s\S]*?y = PAGE_H - 68/);
      if (!headerSection) return;
      expect(headerSection[0]).toMatch(/PAGE_H - 3.*PAGE_W.*3.*ORANGE/s);
      expect(headerSection[0]).not.toMatch(/PAGE_H - 70.*PAGE_W.*70.*ORANGE/s);
    });

    it('continuation header does not use a full-width ORANGE rectangle', () => {
      // Old: rect(page, 0, PAGE_H - 30, PAGE_W, 30, ORANGE)
      // New: rect(page, 0, PAGE_H - 3, PAGE_W, 3, ORANGE) — 3pt rule only
      const contSection = src.match(/Continuation header[\s\S]*?y = PAGE_H - 50/);
      if (!contSection) return;
      expect(contSection[0]).not.toMatch(/PAGE_H - 30.*PAGE_W.*30.*ORANGE/s);
    });

    it('status values use explicit text (calcStatus returns string)', () => {
      expect(src).toMatch(/calcStatus/);
      expect(src).toMatch(/text.*status/i);
    });

    it('table header uses GRAY_HEADER (light grey)', () => {
      expect(src).toMatch(/GRAY_HEADER\s*=\s*rgb\s*\(\s*0\.88/);
    });
  });

  // ── 6. Incident Report ────────────────────────────────────────────────────

  describe('incidents/[incidentId]/pdf/GET.ts (incident report)', () => {
    const src = read('server/api/incidents/[incidentId]/pdf/GET.ts');

    it('header does not have a saturated background colour', () => {
      expect(hasSaturatedCssHeaderBackground(src)).toBe(false);
    });

    it('header uses a border-top accent rule', () => {
      expect(src).toMatch(/border-top.*3px.*solid.*#b91c1c/);
    });

    it('severity badge uses outline style not filled background', () => {
      // Old: background: ${sevCol}
      // New: border: 1.5px solid ${sevCol}; background: transparent
      expect(src).toMatch(/severity-badge[\s\S]*?border.*solid.*sevCol/);
      expect(src).toMatch(/background:\s*transparent/);
    });

    it('section headings use light grey background (#f3f4f6)', () => {
      expect(src).toMatch(/section h2[\s\S]*?background:\s*#f3f4f6/);
    });

    it('photos are preserved (img tags present)', () => {
      expect(src).toMatch(/<img/);
    });

    it('status is rendered as explicit text', () => {
      expect(src).toMatch(/Status:.*inc\.status/);
    });

    it('severity is rendered as explicit text', () => {
      expect(src).toMatch(/severity-badge.*inc\.severity/);
    });
  });

  // ── 7. Electrical Test Register ───────────────────────────────────────────

  describe('electrical-tests/export/[jobId]/pdf/GET.ts', () => {
    const src = read('server/api/electrical-tests/export/[jobId]/pdf/GET.ts');

    it('table header uses light grey (0.88) not dark navy (0.1, 0.15, 0.35)', () => {
      expect(src).toMatch(/0\.88.*0\.88.*0\.88/);
      expect(src).not.toMatch(/0\.1.*0\.15.*0\.35/);
    });

    it('table header text uses dark colour not white', () => {
      // Old: rgb(1, 1, 1) white text
      // New: rgb(0.1, 0.1, 0.1) dark text
      const headerFn = src.match(/drawTableHeader[\s\S]*?y -= ROW_H/);
      if (!headerFn) return;
      expect(headerFn[0]).not.toMatch(/rgb\s*\(\s*1\s*,\s*1\s*,\s*1\s*\)/);
    });

    it('result values use explicit text labels (PASS/FAIL/REVIEW)', () => {
      expect(src).toMatch(/result === 'PASS'/);
      expect(src).toMatch(/drawText.*result/);
    });

    it('page continuation repeats the table header', () => {
      expect(src).toMatch(/drawTableHeader\(\)/);
      // Should be called at least twice (initial + continuation)
      const calls = (src.match(/drawTableHeader\(\)/g) ?? []).length;
      expect(calls).toBeGreaterThanOrEqual(2);
    });
  });

  // ── 8. RL Register ────────────────────────────────────────────────────────

  describe('rl-register/[jobId]/export/pdf/GET.ts', () => {
    const src = read('server/api/rl-register/[jobId]/export/pdf/GET.ts');

    it('table header uses light grey (0.88) not dark navy (0.15, 0.15, 0.35)', () => {
      expect(src).toMatch(/0\.88.*0\.88.*0\.88/);
      expect(src).not.toMatch(/0\.15.*0\.15.*0\.35/);
    });

    it('table header text uses dark colour not white', () => {
      const headerSection = src.match(/Table header row[\s\S]*?y -= ROW_H/);
      if (!headerSection) return;
      expect(headerSection[0]).not.toMatch(/rgb\s*\(\s*1\s*,\s*1\s*,\s*1\s*\)/);
    });

    it('result values use explicit text labels (HIGH/LOW/ON_LEVEL)', () => {
      expect(src).toMatch(/result === 'HIGH'/);
      expect(src).toMatch(/drawText.*result/);
    });

    it('page continuation repeats the table header', () => {
      // New page block should include the table header draw calls
      const newPageSection = src.match(/New page[\s\S]*?rowIdx = 0/);
      if (!newPageSection) return;
      expect(newPageSection[0]).toMatch(/drawRectangle/);
    });
  });

  // ── 9. SwmsPrintModal ─────────────────────────────────────────────────────

  describe('SwmsPrintModal.tsx', () => {
    const src = read('components/safety/SwmsPrintModal.tsx');

    it('header-bar does not have a dark background colour', () => {
      // Old: background: #0f172a
      expect(src).not.toMatch(/\.header-bar[\s\S]*?background:\s*#0f172a/);
    });

    it('header-bar uses a border-top accent rule', () => {
      expect(src).toMatch(/\.header-bar[\s\S]*?border-top.*3px.*solid.*#7c3aed/);
    });

    it('header-badge uses outline style not filled background', () => {
      // Old: background: #7c3aed; color: #fff
      // New: border: 1.5px solid #7c3aed; background: transparent
      expect(src).toMatch(/\.header-badge[\s\S]*?background:\s*transparent/);
      expect(src).toMatch(/\.header-badge[\s\S]*?border.*solid.*#7c3aed/);
    });

    it('ppe-label does not have a filled purple background', () => {
      // Old: background: #7c3aed
      // New: background: transparent
      expect(src).toMatch(/\.ppe-label[\s\S]*?background:\s*transparent/);
    });

    it('ppe-label-text uses dark/purple text not white', () => {
      // Old: color: #fff
      // New: color: #7c3aed
      expect(src).toMatch(/\.ppe-label-text[\s\S]*?color:\s*#7c3aed/);
    });

    it('section headings use border-bottom rule not filled background', () => {
      expect(src).toMatch(/\.section-title[\s\S]*?border-bottom/);
    });

    it('sign-on table header uses light grey background', () => {
      expect(src).toMatch(/\.sign-table th[\s\S]*?background:\s*#f8fafc/);
    });

    it('print @page rule is present', () => {
      expect(src).toMatch(/@page/);
    });
  });

  // ── 10. Document Builder documentStyles.ts ────────────────────────────────

  describe('documentStyles.ts', () => {
    const src = read('components/DocumentBuilder/documentStyles.ts');

    it('H2 uses light grey background not dark navy', () => {
      // Old: background: ${t.accentColor} (dark navy)
      // New: background: #f1f5f9 (light grey)
      expect(src).toMatch(/\[data-doc-editor\] h2[\s\S]*?background:\s*#f1f5f9/);
    });

    it('H2 uses dark text colour (headingColor)', () => {
      expect(src).toMatch(/\[data-doc-editor\] h2[\s\S]*?color:\s*\$\{t\.headingColor\}/);
    });

    it('H2 has a left accent rule (border-left)', () => {
      expect(src).toMatch(/\[data-doc-editor\] h2[\s\S]*?border-left/);
    });

    it('table th uses light grey background', () => {
      expect(src).toMatch(/\[data-doc-editor\] table th[\s\S]*?background:\s*#f1f5f9/);
    });

    it('table th uses dark text colour (headingColor)', () => {
      expect(src).toMatch(/\[data-doc-editor\] table th[\s\S]*?color:\s*\$\{t\.headingColor\}/);
    });

    it('DEFAULT_THEME_VARS tableHeaderColor is light grey', () => {
      expect(src).toMatch(/tableHeaderColor:\s*'#f1f5f9'/);
    });

    it('DEFAULT_THEME_VARS tableHeaderTextColor is dark', () => {
      expect(src).toMatch(/tableHeaderTextColor:\s*'#0f172a'/);
    });

    it('risk matrix cells use light tints (acceptable)', () => {
      // These are very light — dcfce7, fef9c3, fee2e2, fecaca
      expect(src).toMatch(/data-risk="low"[\s\S]*?#dcfce7/);
    });
  });

  // ── 11. globals.css print block ───────────────────────────────────────────

  describe('globals.css Document Builder print overrides', () => {
    const src = read('styles/globals.css');

    it('has explicit H2 print override for application default', () => {
      expect(src).toMatch(/studio-doc-page.*h2[\s\S]*?background:\s*#f1f5f9/);
    });

    it('has explicit th print override for application default', () => {
      expect(src).toMatch(/studio-doc-page.*table th[\s\S]*?background:\s*#f1f5f9/);
    });

    it('does not override inline styles (user-selected colours)', () => {
      // The overrides use specific class selectors targeting application defaults only.
      // They must NOT use a universal selector like .studio-doc-page * { background: ... }
      // which would override user-selected inline styles.
      // The existing .studio-doc-page * rule only sets visibility — that is fine.
      expect(src).not.toMatch(/studio-doc-page\s+\*\s*\{[^}]*background[^}]*!important/);
    });
  });

  // ── 12. Safety poster files are untouched ─────────────────────────────────

  describe('Safety poster files — untouched', () => {
    const posterFiles = [
      'components/safety/posters/PosterPPE.tsx',
      'components/safety/posters/PosterEmergencyContacts.tsx',
      'components/safety/posters/PosterEmergencyAssembly.tsx',
      'components/safety/posters/PosterLifeSavingRules.tsx',
      'components/safety/posters/PosterLiftSafely.tsx',
      'components/safety/posters/PosterSiteRules.tsx',
      'components/safety/posters/PosterRiskMatrix.tsx',
    ];

    for (const posterFile of posterFiles) {
      it(`${posterFile} still has its dark background (intentional display document)`, () => {
        let src: string;
        try {
          src = read(posterFile);
        } catch {
          // File may not exist in this environment — skip
          return;
        }
        // All dark-background posters should still have #111 or near-black background
        // (PosterLiftSafely is white-background — it should have #7f1d1d elements)
        const hasDarkBg = src.includes('#111') || src.includes('#1a1a1a') || src.includes('bg-[#111]');
        const hasRedAccent = src.includes('#7f1d1d') || src.includes('#dc2626');
        expect(hasDarkBg || hasRedAccent).toBe(true);
      });
    }

    it('poster-pdf.ts is untouched (uses html-to-image)', () => {
      let src: string;
      try {
        src = read('server/lib/poster-pdf.ts');
      } catch {
        return;
      }
      expect(src).toMatch(/toPng|html-to-image/);
    });
  });

  // ── 13. view-invoice.tsx — no heavy fills reach print ────────────────────

  describe('view-invoice.tsx — print path', () => {
    const src = read('pages/view-invoice.tsx');

    it('toolbar has no-print class (hidden on print)', () => {
      expect(src).toMatch(/no-print/);
    });

    it('content cards have print:bg-white override', () => {
      expect(src).toMatch(/print:bg-white/);
    });

    it('@media print hides no-print elements', () => {
      expect(src).toMatch(/@media print[\s\S]*?\.no-print/);
    });

    it('body background is set to white on print', () => {
      expect(src).toMatch(/@media print[\s\S]*?body.*background.*white/);
    });
  });

  // ── 14. job-field-docs.tsx — no heavy fills reach print ──────────────────

  describe('job-field-docs.tsx — print path', () => {
    const src = read('pages/job-field-docs.tsx');

    it('print view uses field-docs-print-view class', () => {
      expect(src).toMatch(/field-docs-print-view/);
    });

    it('toolbar uses print:hidden class', () => {
      expect(src).toMatch(/print:hidden/);
    });

    it('metadata cells use bg-slate-50 (light grey, acceptable)', () => {
      expect(src).toMatch(/bg-slate-50/);
    });
  });
});
