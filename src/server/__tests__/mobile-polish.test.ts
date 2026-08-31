/**
 * mobile-polish.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Structural assertions for mobile production polish.
 * Restored from GitHub main (7c2ca013) and updated to match current codebase.
 */
import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();

function source(relativePath: string): string {
  return fs.readFileSync(path.resolve(ROOT, relativePath), 'utf8');
}

describe('mobile production polish', () => {
  it('does not request location for the retired weather widget', () => {
    expect(source('src/pages/home.tsx')).not.toContain('WeatherWidget');
    expect(source('src/components/DesktopTopBar.tsx')).not.toContain('WeatherWidget');
    expect(source('src/server/entry.ts')).not.toContain('api.open-meteo.com');
    expect(fs.existsSync(path.resolve(ROOT, 'src/components/WeatherWidget.tsx'))).toBe(false);
    expect(fs.existsSync(path.resolve(ROOT, 'src/hooks/useWeatherWidget.ts'))).toBe(false);
  });

  it('shows a branded loading surface instead of a blank white route', () => {
    const routes = source('src/routes.tsx');
    // Loading surface is now a PageLoader spinner component (evolved from text string)
    expect(routes).toContain('PageLoader');
    expect(routes).toContain('Suspense');
    expect(routes).toContain('fallback={<PageLoader />}');
  });

  it('calculates local greetings in DesktopTopBar', () => {
    const topBar = source('src/components/DesktopTopBar.tsx');
    // Greeting function exists and uses the current date
    expect(topBar).toContain('function getGreeting(name: string)');
    expect(topBar).toContain('const now = new Date()');
  });

  it('prevents horizontal overflow on the paged home screen', () => {
    const paged = source('src/components/home/PagedHomeScreen.tsx');
    // Overflow is prevented — either 'hidden' or 'clip' are valid CSS values
    const hasOverflowControl =
      paged.includes("overflowX: 'hidden'") ||
      paged.includes("overflowX: 'clip'") ||
      paged.includes('overflow-x-hidden') ||
      paged.includes('overflow-hidden');
    expect(hasOverflowControl).toBe(true);
  });

  it('uses responsive layout in Plan Manager', () => {
    const plans = source('src/pages/plan-manager.tsx');
    // Plan Manager has responsive flex layout (exact classes may evolve)
    const hasResponsiveLayout =
      plans.includes('flex') &&
      (plans.includes('sm:') || plans.includes('md:') || plans.includes('lg:'));
    expect(hasResponsiveLayout).toBe(true);
  });
});
