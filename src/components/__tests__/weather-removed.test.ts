/**
 * Regression: WeatherWidget and useWeatherWidget must not exist in the
 * codebase, and no runtime reference to open-meteo.com must remain.
 *
 * These checks guard against accidental re-introduction of the weather
 * feature that caused cross-platform failures in TestFlight, the Capacitor
 * shell, and Edge browser.
 */

import { describe, it, expect } from 'vitest';
import { existsSync } from 'fs';
import { resolve } from 'path';
import { readFileSync, readdirSync, statSync } from 'fs';

const ROOT = resolve(__dirname, '../../../src');

// ── File-existence checks ─────────────────────────────────────────────────────

describe('Weather widget removal', () => {
  it('WeatherWidget.tsx has been deleted', () => {
    expect(existsSync(resolve(ROOT, 'components/WeatherWidget.tsx'))).toBe(false);
  });

  it('useWeatherWidget.ts has been deleted', () => {
    expect(existsSync(resolve(ROOT, 'hooks/useWeatherWidget.ts'))).toBe(false);
  });
});

// ── Source-scan: no runtime references remain ─────────────────────────────────

/** Recursively collect all .ts / .tsx files under a directory. */
function collectSourceFiles(dir: string): string[] {
  const results: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = resolve(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      // Skip node_modules and test directories to keep the scan fast
      if (entry === 'node_modules' || entry === '__tests__' || entry === 'dist') continue;
      results.push(...collectSourceFiles(full));
    } else if (/\.(ts|tsx)$/.test(entry) && !entry.endsWith('.test.ts') && !entry.endsWith('.test.tsx')) {
      results.push(full);
    }
  }
  return results;
}

describe('No residual weather references in source', () => {
  const files = collectSourceFiles(ROOT);

  it('no source file imports WeatherWidget', () => {
    const hits = files.filter(f => readFileSync(f, 'utf8').includes('WeatherWidget'));
    expect(hits, `Found WeatherWidget in: ${hits.join(', ')}`).toHaveLength(0);
  });

  it('no source file imports useWeatherWidget', () => {
    const hits = files.filter(f => readFileSync(f, 'utf8').includes('useWeatherWidget'));
    expect(hits, `Found useWeatherWidget in: ${hits.join(', ')}`).toHaveLength(0);
  });

  it('no source file references open-meteo.com', () => {
    const hits = files.filter(f => readFileSync(f, 'utf8').includes('open-meteo'));
    expect(hits, `Found open-meteo reference in: ${hits.join(', ')}`).toHaveLength(0);
  });
});
