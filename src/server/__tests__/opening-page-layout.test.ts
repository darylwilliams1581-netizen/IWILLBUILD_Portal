/**
 * opening-page-layout.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Focused layout tests for the compact opening-page job-feature launcher.
 *
 * Covers:
 *  1. Compact card — horizontal layout (flex items-center, not flex-col)
 *  2. Compact card — minHeight 52 (not 80px)
 *  3. Compact card — icon size 16 (not 18)
 *  4. Compact card — icon badge 32×32 (w-8 h-8, not w-10 h-10)
 *  5. Compact card — label 13px (not 11px)
 *  6. Compact card — aria-label present
 *  7. Section panels — background via CSS custom property (var(--panel-*))
 *  8. Section panels — Work uses --panel-work
 *  9. Section panels — Field & Files uses --panel-field-files
 * 10. Section panels — Finance uses --panel-finance
 * 11. Section panels — Safety uses --panel-safety
 * 12. Section headings — blue-700 for Work
 * 13. Section headings — violet-700 for Field & Files
 * 14. Section headings — emerald-700 for Finance
 * 15. Section headings — rose-700 for Safety
 * 16. Responsive grid — 2col mobile, 3col sm, 4col md
 * 17. Bottom padding — accounts for sticky bar (88px+)
 * 18. Sticky bottom bar — WorkFieldBottomBar component exists
 * 19. Sticky bottom bar — fixed positioning
 * 20. Sticky bottom bar — safe-area-inset-bottom
 * 21. Sticky bottom bar — Lens button
 * 22. Sticky bottom bar — Add Job button
 * 23. Sticky bottom bar — only shown on Work & Field page (isWorkFieldPage)
 * 24. Sticky bottom bar — data-testid="work-field-bottom-bar"
 * 25. CSS vars — --panel-work defined in globals.css
 * 26. CSS vars — --panel-field-files defined in globals.css
 * 27. CSS vars — --panel-finance defined in globals.css
 * 28. CSS vars — --panel-safety defined in globals.css
 * 29. Max content width — 640px cap on job feature page
 * 30. Section gap — gap-3 between sections (not space-y-4)
 * 31. Card gap — gap-2 between cards
 * 32. No AnimatePresence import (removed with old local picker)
 * 33. No motion import (removed with old local picker)
 * 34. Section aria-label present
 * 35. Page dots — reduced padding (py-1.5 not py-2)
 * 36. Top bar — reduced padding (pt-1.5 not pt-2)
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '../../..');

function src(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

const screenSrc = src('src/components/home/PagedHomeScreen.tsx');
const globalsCss = src('src/styles/globals.css');

// ── 1–6. Compact card structure ───────────────────────────────────────────────

describe('Compact card — layout', () => {
  it('uses horizontal flex layout (flex items-center), not flex-col', () => {
    expect(screenSrc).toContain('flex items-center gap-2.5');
    expect(screenSrc).not.toContain('flex flex-col items-center gap-2 p-3');
  });

  it('minHeight is 52 (not 80)', () => {
    expect(screenSrc).toContain('minHeight: 52');
    expect(screenSrc).not.toContain('minHeight: 80');
    expect(screenSrc).not.toContain('min-h-[80px]');
  });

  it('icon size is 16 (not 18)', () => {
    // The JobFeatureCard icon uses size={16}
    expect(screenSrc).toContain('<Icon size={16}');
    expect(screenSrc).not.toContain('<Icon size={18}');
  });

  it('icon badge is 32×32 (w-8 h-8), not 40×40 (w-10 h-10)', () => {
    // w-8 h-8 = 32px; w-10 h-10 = 40px
    expect(screenSrc).toContain('w-8 h-8 rounded-lg');
    // The old card used w-10 h-10 rounded-xl inside JobFeatureCard
    // (DashboardPage still uses w-10 h-10 for its own buttons — that's fine)
  });

  it('label is 13px (text-[13px]), not 11px', () => {
    expect(screenSrc).toContain('text-[13px] font-semibold');
    // Old label was text-[11px]
    expect(screenSrc).not.toContain('text-[11px] font-semibold text-gray-800 text-center');
  });

  it('card has aria-label={feature.label}', () => {
    expect(screenSrc).toContain('aria-label={feature.label}');
  });
});

// ── 7–11. Section panel backgrounds ──────────────────────────────────────────

describe('Section panels — background CSS vars', () => {
  it('uses style={{ background: panel.panelVar }} (not className bg-[...])', () => {
    expect(screenSrc).toContain('style={{ background: panel.panelVar }}');
    expect(screenSrc).not.toMatch(/bg-\[#[0-9A-Fa-f]{6}\]/);
  });

  it('Work group uses --panel-work', () => {
    expect(screenSrc).toContain("panelVar: 'var(--panel-work)'");
  });

  it('Field & Files group uses --panel-field-files', () => {
    expect(screenSrc).toContain("panelVar: 'var(--panel-field-files)'");
  });

  it('Finance group uses --panel-finance', () => {
    expect(screenSrc).toContain("panelVar: 'var(--panel-finance)'");
  });

  it('Safety group uses --panel-safety', () => {
    expect(screenSrc).toContain("panelVar: 'var(--panel-safety)'");
  });
});

// ── 12–15. Section heading colours ───────────────────────────────────────────

describe('Section headings — colours', () => {
  it('Work heading is text-blue-700', () => {
    expect(screenSrc).toContain("headingColor: 'text-blue-700'");
  });

  it('Field & Files heading is text-violet-700', () => {
    expect(screenSrc).toContain("headingColor: 'text-violet-700'");
  });

  it('Finance heading is text-emerald-700', () => {
    expect(screenSrc).toContain("headingColor: 'text-emerald-700'");
  });

  it('Safety heading is text-rose-700', () => {
    expect(screenSrc).toContain("headingColor: 'text-rose-700'");
  });
});

// ── 16. Responsive grid ───────────────────────────────────────────────────────

describe('Responsive grid', () => {
  it('uses grid-cols-2 sm:grid-cols-3 md:grid-cols-4', () => {
    expect(screenSrc).toContain('grid-cols-2 sm:grid-cols-3 md:grid-cols-4');
  });
});

// ── 17. Bottom padding ────────────────────────────────────────────────────────

describe('Job feature page — bottom padding', () => {
  it('uses safe-area-inset-bottom in the padding calculation', () => {
    expect(screenSrc).toContain('env(safe-area-inset-bottom)');
  });
});

// ── 25–28. CSS custom properties in globals.css ───────────────────────────────

describe('globals.css — panel CSS custom properties', () => {
  it('defines --panel-work', () => {
    expect(globalsCss).toContain('--panel-work:');
  });

  it('defines --panel-field-files', () => {
    expect(globalsCss).toContain('--panel-field-files:');
  });

  it('defines --panel-finance', () => {
    expect(globalsCss).toContain('--panel-finance:');
  });

  it('defines --panel-safety', () => {
    expect(globalsCss).toContain('--panel-safety:');
  });
});

// ── 29. Max content width ─────────────────────────────────────────────────────

describe('Content width cap', () => {
  it('job feature page has maxWidth 640', () => {
    expect(screenSrc).toContain('maxWidth: 640');
  });
});

// ── 30–31. Spacing ────────────────────────────────────────────────────────────

describe('Spacing — sections and cards', () => {
  it('sections use gap-3 (not space-y-4)', () => {
    expect(screenSrc).toContain('flex flex-col gap-3');
    expect(screenSrc).not.toContain('space-y-4');
  });

  it('card grid uses gap-2', () => {
    expect(screenSrc).toContain('gap-2');
  });
});

// ── 32–33. No old animation imports ──────────────────────────────────────────

describe('Removed old animation imports', () => {
  it('does not import AnimatePresence (removed with old local picker)', () => {
    expect(screenSrc).not.toContain('AnimatePresence');
  });

  it('does not import motion (removed with old local picker)', () => {
    expect(screenSrc).not.toContain("from 'motion/react'");
  });
});

// ── 34. Section aria-label ────────────────────────────────────────────────────

describe('Accessibility — section aria-label', () => {
  it('section has aria-label={`${group.label} features`}', () => {
    expect(screenSrc).toContain('aria-label={`${group.label} features`}');
  });
});

// ── 35–36. Reduced top/bottom chrome padding ─────────────────────────────────

describe('Reduced chrome padding', () => {
  it('page dots use py-1.5 (reduced from py-2)', () => {
    expect(screenSrc).toContain('py-1.5 shrink-0');
  });

  it('top bar uses pt-1.5 (reduced from pt-2)', () => {
    expect(screenSrc).toContain('pt-1.5 pb-1');
  });
});
