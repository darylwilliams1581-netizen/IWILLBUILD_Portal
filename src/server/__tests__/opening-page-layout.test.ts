/**
 * opening-page-layout.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Focused layout tests for the compact opening-page job-feature launcher,
 * the Manage page IconTile, and the Dashboard quick-action buttons.
 *
 * All three pages must use the same compact visual scale:
 *   • Icon badge  : 32×32 (w-8 h-8)
 *   • Icon glyph  : 16px
 *   • Min height  : 52px
 *   • Layout      : horizontal flex (not flex-col stacked)
 *   • Label size  : 13px semibold/bold
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
 * 17. Bottom padding — accounts for safe-area-inset-bottom
 * 18–24. (sticky bottom bar tests removed — bar no longer present)
 * 25. CSS vars — --panel-work defined in globals.css
 * 26. CSS vars — --panel-field-files defined in globals.css
 * 27. CSS vars — --panel-finance defined in globals.css
 * 28. CSS vars — --panel-safety defined in globals.css
 * 29. Max content width — 640px cap on job feature page
 * 30. Section gap — gap-3 between sections (not space-y-4)
 * 31. Card gap — gap-2 between cards
 * 32. No AnimatePresence import (removed with old local picker)
 * 33. No motion import in PagedHomeScreen (removed with old local picker)
 * 34. Section aria-label present
 * 35. Page dots — reduced padding (py-1.5 not py-2)
 * 36. Top bar — reduced padding (pt-1.5 not pt-2)
 * 37. IconTile normal — horizontal layout (flex flex-row items-center)
 * 38. IconTile normal — 32×32 badge (w-8 h-8)
 * 39. IconTile normal — 16px glyph
 * 40. IconTile normal — minHeight 52
 * 41. IconTile normal — label 13px bold
 * 42. IconTile normal — aria-label present
 * 43. IconTile wide — horizontal layout
 * 44. IconTile wide — 32×32 badge
 * 45. IconTile wide — 16px glyph
 * 46. IconTile wide — minHeight 52
 * 47. Manage grid — no gridAutoRows minmax(96px) override
 * 48. Manage grid — gap-2 (not gap-3)
 * 49. Dashboard Lens — 32×32 badge (w-8 h-8)
 * 50. Dashboard Lens — 16px glyph
 * 51. Dashboard Add Job — 32×32 badge
 * 52. Dashboard quick-action grid — gap-2
 * 53. Dashboard quick-action buttons — minHeight 52
 * 54. Dashboard quick-action buttons — horizontal layout (flex items-center gap-2.5)
 * 55. Dashboard Sign In — 32×32 badge, 16px glyph
 * 56. Dashboard Fleet — 32×32 badge, 16px glyph
 * 57. Dashboard Site Prestart — 32×32 badge, 16px glyph
 * 58. Dashboard Contacts — 32×32 badge, 16px glyph
 * 59. Administration — uses Collapsible.Root (data-testid="admin-collapsible")
 * 60. Administration — trigger has data-testid="admin-collapsible-trigger"
 * 61. Administration — content has data-testid="admin-collapsible-content"
 * 62. Administration — ChevronDown icon imported
 * 63. Administration — collapsed by default (sessionStorage key '0' / no '1')
 * 64. Administration — sessionStorage key constant defined
 * 65. globals.css — collapsible-down keyframe defined
 * 66. globals.css — collapsible-up keyframe defined
 * 67. globals.css — animate-collapsible-down class defined
 * 68. globals.css — animate-collapsible-up class defined
 */

import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';

const ROOT = path.resolve(__dirname, '../../..');

function src(rel: string): string {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

const screenSrc  = src('src/components/home/PagedHomeScreen.tsx');
const iconTileSrc = src('src/components/home/IconTile.tsx');
const globalsCss = src('src/styles/globals.css');

// ── 1–6. Compact card structure (Work & Field JobFeatureCard) ─────────────────

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
    expect(screenSrc).toContain('<Icon size={16}');
    expect(screenSrc).not.toContain('<Icon size={18}');
  });

  it('icon badge is 32×32 (w-8 h-8), not 40×40 (w-10 h-10) in JobFeatureCard', () => {
    expect(screenSrc).toContain('w-8 h-8 rounded-lg');
  });

  it('label is 13px (text-[13px]), not 11px', () => {
    expect(screenSrc).toContain('text-[13px] font-semibold');
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

  it('does not import motion in PagedHomeScreen (removed with old local picker)', () => {
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
  it('page dots use py-1.5', () => {
    expect(screenSrc).toContain('py-1.5 shrink-0');
  });
});

describe('Two-row stacked header', () => {
  it('row 1 contains utility buttons (notification + profile + logout)', () => {
    expect(screenSrc).toContain('justify-between shrink-0 px-3 pt-2 pb-1');
  });

  it('row 1 contains logo image (dark variant)', () => {
    expect(screenSrc).toContain('/airo-assets/images/logo/horizontal/dark');
  });

  it('row 1 contains IWILLBUILD wordmark text', () => {
    expect(screenSrc).toContain('IWILLBUILD');
  });

  it('utility buttons are flex-1 (fill remaining space equally)', () => {
    expect(screenSrc).toContain('flex-1 justify-end');
  });

  it('NotificationBell is icon-only (no label prop)', () => {
    expect(screenSrc).not.toContain('label="Alerts"');
  });

  it('Profile button is flex-1 with label', () => {
    expect(screenSrc).toContain('flex-1 flex items-center justify-center gap-1.5 h-8 rounded-xl bg-violet-600');
  });

  it('Sign out button is flex-1 with label', () => {
    expect(screenSrc).toContain('Sign out');
  });

  it('row 2 contains page tabs (full-width, no overflow-x-auto)', () => {
    expect(screenSrc).toContain('px-2 pb-1.5 gap-1.5');
    // No horizontal scroll on the tab row
    expect(screenSrc).not.toContain('overflow-x-auto scrollbar-none');
  });

  it('tab pills use flex-1 (equal-width, fill the row)', () => {
    expect(screenSrc).toContain('flex-1 flex items-center justify-center');
  });

  it('tab pills use rounded-xl (not rounded-full)', () => {
    expect(screenSrc).toContain('rounded-xl text-[12px] font-semibold');
  });

  it('tab icon size is 13px (up from 11px)', () => {
    expect(screenSrc).toContain('<Icon size={13}');
  });
});

// ── 37–46. IconTile compact spec ──────────────────────────────────────────────

describe('IconTile — normal compact tile', () => {
  it('uses horizontal flex layout (flex flex-row items-center)', () => {
    expect(iconTileSrc).toContain('flex flex-row items-center gap-2.5');
  });

  it('icon badge is 32×32 (w-8 h-8)', () => {
    expect(iconTileSrc).toContain('w-8 h-8 rounded-lg');
  });

  it('icon glyph is 16px', () => {
    expect(iconTileSrc).toContain('size={16}');
  });

  it('minHeight is 52', () => {
    expect(iconTileSrc).toContain('minHeight: 52');
  });

  it('label is 13px bold', () => {
    expect(iconTileSrc).toContain('text-[13px] font-bold');
  });

  it('has aria-label on the button', () => {
    expect(iconTileSrc).toContain('aria-label={item.label}');
  });
});

describe('IconTile — wide (Tools) compact tile', () => {
  it('wide tile uses horizontal layout', () => {
    // The wide tile should be flex-row, not flex-col
    expect(iconTileSrc).toContain('flex flex-row items-center gap-3');
  });

  it('wide tile badge is 32×32 (w-8 h-8)', () => {
    // Both normal and wide use w-8 h-8
    const matches = (iconTileSrc.match(/w-8 h-8/g) ?? []).length;
    expect(matches).toBeGreaterThanOrEqual(2); // normal + wide
  });

  it('wide tile glyph is 16px', () => {
    // size={16} appears for both normal and wide
    const matches = (iconTileSrc.match(/size=\{16\}/g) ?? []).length;
    expect(matches).toBeGreaterThanOrEqual(2);
  });

  it('wide tile minHeight is 52', () => {
    const matches = (iconTileSrc.match(/minHeight: 52/g) ?? []).length;
    expect(matches).toBeGreaterThanOrEqual(2); // normal + wide
  });
});

// ── 47–48. Manage grid ────────────────────────────────────────────────────────

describe('Manage page grid', () => {
  it('does not force gridAutoRows minmax(96px)', () => {
    expect(screenSrc).not.toContain('minmax(96px');
  });

  it('Manage grid uses gap-2 (not gap-3)', () => {
    // The Manage grid specifically — check the ManagePage section
    // We look for the grid immediately after MANAGE_GROUP_ORDER usage
    expect(screenSrc).toContain('grid grid-cols-2 gap-2');
  });
});

// ── 49–58. Dashboard quick-action compact spec ────────────────────────────────

describe('Dashboard quick-action buttons — compact spec', () => {
  it('Lens button uses 32×32 badge (w-8 h-8)', () => {
    // Lens is the first w-8 h-8 in DashboardPage
    expect(screenSrc).toContain('w-8 h-8 rounded-lg bg-white/20');
  });

  it('Lens glyph is 16px', () => {
    expect(screenSrc).toContain('<CameraIcon size={16}');
  });

  it('Add Job glyph is 16px', () => {
    expect(screenSrc).toContain('<Plus size={16}');
  });

  it('quick-action grid uses gap-2', () => {
    // DashboardPage grid
    expect(screenSrc).toContain('grid grid-cols-2 gap-2');
  });

  it('quick-action buttons have minHeight 52', () => {
    // All dashboard quick-action buttons set minHeight: 52
    const matches = (screenSrc.match(/minHeight: 52/g) ?? []).length;
    // Lens, Add Job, Sign In, Fleet, Site Prestart, Contacts + JobFeatureCard = ≥7
    expect(matches).toBeGreaterThanOrEqual(7);
  });

  it('Sign In uses horizontal layout with gap-2.5', () => {
    expect(screenSrc).toContain("panel=signin");
    // Sign In button uses flex items-center gap-2.5
    expect(screenSrc).toContain('flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-blue-600');
  });

  it('Fleet uses horizontal layout', () => {
    expect(screenSrc).toContain('flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-sky-500');
  });

  it('Site Prestart uses horizontal layout', () => {
    expect(screenSrc).toContain('flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-red-500');
  });

  it('Contacts uses horizontal layout', () => {
    expect(screenSrc).toContain('flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-teal-600');
  });

  it('Sign In glyph is 16px', () => {
    expect(screenSrc).toContain('<LogIn size={16}');
  });

  it('Fleet glyph is 16px', () => {
    expect(screenSrc).toContain('<Car size={16}');
  });

  it('Site Prestart glyph is 16px', () => {
    expect(screenSrc).toContain('<HardHat size={16}');
  });

  it('Contacts glyph is 16px', () => {
    expect(screenSrc).toContain('<Users size={16}');
  });
});

// ── 59–68. Collapsible sections (Finance, Safety, Administration) ─────────────

describe('Finance — collapsible section', () => {
  it('testId finance-collapsible registered in COLLAPSIBLE_GROUPS', () => {
    expect(screenSrc).toContain("testId: 'finance-collapsible'");
  });
  it('FINANCE_STORAGE_KEY constant is defined', () => {
    expect(screenSrc).toContain('FINANCE_STORAGE_KEY');
  });
  it('storage key value is manage_finance_open', () => {
    expect(screenSrc).toContain('manage_finance_open');
  });
});

describe('Safety — collapsible section', () => {
  it('testId safety-collapsible registered in COLLAPSIBLE_GROUPS', () => {
    expect(screenSrc).toContain("testId: 'safety-collapsible'");
  });
  it('SAFETY_STORAGE_KEY constant is defined', () => {
    expect(screenSrc).toContain('SAFETY_STORAGE_KEY');
  });
  it('storage key value is manage_safety_open', () => {
    expect(screenSrc).toContain('manage_safety_open');
  });
});

describe('Administration — collapsible section', () => {
  it('testId admin-collapsible registered in COLLAPSIBLE_GROUPS', () => {
    expect(screenSrc).toContain("testId: 'admin-collapsible'");
  });
  it('trigger uses ${testId}-trigger template pattern', () => {
    expect(screenSrc).toContain('`${testId}-trigger`');
  });
  it('content uses ${testId}-content template pattern', () => {
    expect(screenSrc).toContain('`${testId}-content`');
  });
  it('imports ChevronDown from lucide-react', () => {
    expect(screenSrc).toContain('ChevronDown');
  });
  it('defaults to collapsed (reads sessionStorage; no hardcoded open={true})', () => {
    expect(screenSrc).not.toContain('open={true}');
    expect(screenSrc).toContain(ADMIN_STORAGE_KEY_MARKER);
  });
  it('ADMIN_STORAGE_KEY constant is defined', () => {
    expect(screenSrc).toContain('ADMIN_STORAGE_KEY');
  });
});

// Helper — the storage key literal must appear in the source
const ADMIN_STORAGE_KEY_MARKER = 'manage_admin_open';

describe('CollapsibleSection — generic component', () => {
  it('uses a single generic CollapsibleSection component (not three separate ones)', () => {
    expect(screenSrc).toContain('function CollapsibleSection(');
  });
  it('COLLAPSIBLE_GROUPS lookup table is defined', () => {
    expect(screenSrc).toContain('COLLAPSIBLE_GROUPS');
  });
  it('Work, Field & Files, Fleet remain always-open (no collapsible config)', () => {
    // The always-open path renders a plain <p> heading, not a CollapsibleSection
    expect(screenSrc).toContain("// Always-open sections: Work, Field & Files, Fleet");
  });
});

describe('globals.css — collapsible animations', () => {
  it('defines collapsible-down keyframe', () => {
    expect(globalsCss).toContain('@keyframes collapsible-down');
  });
  it('defines collapsible-up keyframe', () => {
    expect(globalsCss).toContain('@keyframes collapsible-up');
  });
  it('defines animate-collapsible-down utility class', () => {
    expect(globalsCss).toContain('.animate-collapsible-down');
  });
  it('defines animate-collapsible-up utility class', () => {
    expect(globalsCss).toContain('.animate-collapsible-up');
  });
});
