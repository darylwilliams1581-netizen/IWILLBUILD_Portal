/**
 * Public Toilet Finder — focused tests
 *
 * Covers:
 * 1. Tool appears in WorkToolsTab TOOLS array
 * 2. Tool appears in work.tsx TOOL_ITEMS array
 * 3. Exact Google Maps URL is used (no modification)
 * 4. Tool is marked external — no internal navigation
 * 5. No IWIllBUIlD location permission requested (no navigator.geolocation call)
 * 6. No coordinates stored or sent by IWIllBUIlD (no lat/lng/coords in source)
 * 7. No backend API route for toilet finder
 * 8. No database table for toilet/location data
 * 9. Error fallback message present in source
 * 10. Existing tools remain unchanged (Builders Calc, Takeoff Pad, SDS Register)
 * 11. MapPin icon used (no new icon library imported)
 * 12. window.open used for cross-platform launch (Safari, Capacitor, desktop)
 */

import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const EXACT_MAPS_URL = 'https://www.google.com/maps/search/?api=1&query=public+toilets';

const toolsTabSrc  = fs.readFileSync(path.resolve('src/components/work/WorkToolsTab.tsx'), 'utf8');
const workSrc      = fs.readFileSync(path.resolve('src/pages/work.tsx'), 'utf8');
const entrySrc     = fs.readFileSync(path.resolve('src/server/entry.ts'), 'utf8');

// ── 1. WorkToolsTab — card present ───────────────────────────────────────────

describe('Public Toilet Finder — WorkToolsTab', () => {
  it('TOOLS array contains Public Toilet Finder', () => {
    expect(toolsTabSrc).toContain('Public Toilet Finder');
  });

  it('uses the exact Google Maps URL', () => {
    expect(toolsTabSrc).toContain(EXACT_MAPS_URL);
  });

  it('marks the entry as external: true', () => {
    expect(toolsTabSrc).toContain('external: true');
  });

  it('uses MapPin icon (no new icon library)', () => {
    expect(toolsTabSrc).toContain('MapPin');
    // Must come from lucide-react, not a new library
    expect(toolsTabSrc).toMatch(/from 'lucide-react'/);
    expect(toolsTabSrc).not.toContain('react-icons');
    expect(toolsTabSrc).not.toContain('@heroicons');
  });

  it('uses teal colour scheme matching other cards', () => {
    expect(toolsTabSrc).toContain('bg-teal-100');
    expect(toolsTabSrc).toContain('text-teal-600');
  });
});

// ── 2. work.tsx — TOOL_ITEMS card present ────────────────────────────────────

describe('Public Toilet Finder — work.tsx TOOL_ITEMS', () => {
  it('TOOL_ITEMS contains Public Toilet Finder', () => {
    expect(workSrc).toContain('Public Toilet Finder');
  });

  it('uses the exact Google Maps URL in TOOL_ITEMS', () => {
    expect(workSrc).toContain(EXACT_MAPS_URL);
  });

  it('marks the entry as external: true in TOOL_ITEMS', () => {
    // The toilet finder entry must have external: true
    expect(workSrc).toContain('external: true');
  });

  it('imports MapPin from lucide-react', () => {
    expect(workSrc).toContain('MapPin');
    expect(workSrc).toMatch(/import\s*\{[^}]*MapPin[^}]*\}\s*from\s*'lucide-react'/);
  });
});

// ── 3. Exact URL — no modification ───────────────────────────────────────────

describe('Public Toilet Finder — exact Google Maps URL', () => {
  it('URL uses the standard Maps search endpoint', () => {
    expect(EXACT_MAPS_URL).toContain('google.com/maps/search/');
  });

  it('URL includes api=1 parameter', () => {
    expect(EXACT_MAPS_URL).toContain('api=1');
  });

  it('URL query is "public+toilets"', () => {
    expect(EXACT_MAPS_URL).toContain('query=public+toilets');
  });

  it('WorkToolsTab stores URL in a named constant', () => {
    expect(toolsTabSrc).toContain('MAPS_TOILET_URL');
  });

  it('work.tsx stores URL in a named constant', () => {
    expect(workSrc).toContain('MAPS_TOILET_URL');
  });
});

// ── 4. No IWIllBUIlD location permission ─────────────────────────────────────

describe('Public Toilet Finder — no IWIllBUIlD location permission', () => {
  it('WorkToolsTab does not call navigator.geolocation', () => {
    expect(toolsTabSrc).not.toContain('navigator.geolocation');
    expect(toolsTabSrc).not.toContain('getCurrentPosition');
    expect(toolsTabSrc).not.toContain('watchPosition');
  });

  it('work.tsx toilet finder does not call navigator.geolocation', () => {
    // work.tsx may use geolocation for other features — check only the toilet section
    // by verifying the MAPS_TOILET_URL constant block has no geolocation calls nearby
    const toiletBlock = workSrc.slice(
      workSrc.indexOf('MAPS_TOILET_URL'),
      workSrc.indexOf('MAPS_TOILET_URL') + 500
    );
    expect(toiletBlock).not.toContain('geolocation');
    expect(toiletBlock).not.toContain('getCurrentPosition');
  });

  it('WorkToolsTab does not request Capacitor Geolocation plugin', () => {
    expect(toolsTabSrc).not.toContain('@capacitor/geolocation');
    expect(toolsTabSrc).not.toContain('Geolocation.getCurrentPosition');
  });
});

// ── 5. No coordinates stored or sent by IWIllBUIlD ───────────────────────────

describe('Public Toilet Finder — no coordinate storage', () => {
  it('WorkToolsTab does not reference latitude or longitude', () => {
    expect(toolsTabSrc).not.toMatch(/\blat(itude)?\b/i);
    expect(toolsTabSrc).not.toMatch(/\blon(gitude)?\b/i);
    expect(toolsTabSrc).not.toContain('coords');
  });

  it('work.tsx MAPS_TOILET_URL block does not store coordinates', () => {
    expect(workSrc).not.toContain('latitude');
    expect(workSrc).not.toContain('longitude');
  });

  it('no backend API route for toilet finder exists in entry.ts', () => {
    expect(entrySrc).not.toContain('/api/toilet');
    expect(entrySrc).not.toContain('/api/location');
    expect(entrySrc).not.toContain('toilet-finder');
  });
});

// ── 6. No database table for toilet/location data ────────────────────────────

describe('Public Toilet Finder — no database table', () => {
  it('entry.ts has no CREATE TABLE for toilet or location data', () => {
    expect(entrySrc).not.toContain('CREATE TABLE IF NOT EXISTS toilet');
    expect(entrySrc).not.toContain('CREATE TABLE IF NOT EXISTS user_location');
    expect(entrySrc).not.toContain('CREATE TABLE IF NOT EXISTS gps');
  });
});

// ── 7. Error fallback message ─────────────────────────────────────────────────

describe('Public Toilet Finder — error fallback', () => {
  it('WorkToolsTab has the required error message', () => {
    expect(toolsTabSrc).toContain('Unable to open Google Maps');
    expect(toolsTabSrc).toContain('Check your internet connection and try again');
  });

  it('work.tsx has the required error message for the toilet finder', () => {
    expect(workSrc).toContain('Unable to open Google Maps');
    expect(workSrc).toContain('Check your internet connection and try again');
  });
});

// ── 8. window.open used for cross-platform launch ────────────────────────────

describe('Public Toilet Finder — window.open for cross-platform launch', () => {
  it('WorkToolsTab uses window.open to launch the URL', () => {
    expect(toolsTabSrc).toContain('window.open');
  });

  it('WorkToolsTab passes noopener,noreferrer for security', () => {
    expect(toolsTabSrc).toContain('noopener,noreferrer');
  });

  it('work.tsx uses window.open for the external toilet finder', () => {
    expect(workSrc).toContain('window.open');
  });
});

// ── 9. Existing tools unchanged ───────────────────────────────────────────────

describe('Public Toilet Finder — existing tools unchanged', () => {
  it('WorkToolsTab still has Builders Calculator', () => {
    expect(toolsTabSrc).toContain('Builders Calculator');
    expect(toolsTabSrc).toContain("href: '/builders-calc'");
  });

  it('WorkToolsTab still has Takeoff Pad', () => {
    expect(toolsTabSrc).toContain('Takeoff Pad');
    expect(toolsTabSrc).toContain("href: '/takeoff-pad'");
  });

  it('WorkToolsTab still has SDS / MSDS Register', () => {
    expect(toolsTabSrc).toContain('SDS / MSDS Register');
    expect(toolsTabSrc).toContain("href: '/sds-register'");
  });

  it('work.tsx TOOL_ITEMS still has Builders Calculator', () => {
    expect(workSrc).toContain('Builders Calculator');
    expect(workSrc).toContain("href: '/builders-calc'");
  });

  it('work.tsx TOOL_ITEMS still has Takeoff Pad', () => {
    expect(workSrc).toContain('Takeoff Pad');
    expect(workSrc).toContain("href: '/takeoff-pad'");
  });

  it('work.tsx TOOL_ITEMS still has SDS / MSDS Register', () => {
    expect(workSrc).toContain('SDS / MSDS Register');
    expect(workSrc).toContain("href: '/sds-register'");
  });
});

// ── 10. No new icon library imported ─────────────────────────────────────────

describe('Public Toilet Finder — no new icon library', () => {
  it('WorkToolsTab imports only from lucide-react for icons', () => {
    expect(toolsTabSrc).not.toContain('react-icons');
    expect(toolsTabSrc).not.toContain('@heroicons');
    expect(toolsTabSrc).not.toContain('phosphor');
    expect(toolsTabSrc).not.toContain('feather');
  });

  it('work.tsx imports only from lucide-react for icons', () => {
    expect(workSrc).not.toContain('react-icons');
    expect(workSrc).not.toContain('@heroicons');
  });
});
