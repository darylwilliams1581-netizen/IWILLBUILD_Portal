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
    const index = source('index.html');

    expect(routes).toContain('Loading IWILLBUILD…');
    expect(routes).toContain("background: '#f1f5f9'");
    expect(index).toContain('body { margin: 0; background: #f1f5f9; }');
  });

  it('calculates local greetings after hydration', () => {
    const home = source('src/pages/home.tsx');
    const topBar = source('src/components/DesktopTopBar.tsx');

    expect(home).not.toContain('const hour = new Date().getHours()');
    expect(home).toContain("greeting: 'Welcome'");
    expect(home).toContain('const now = new Date();');
    expect(topBar).toContain('function getGreeting(name: string, now: Date | null)');
    expect(topBar).toContain('const [localNow, setLocalNow] = useState<Date | null>(null)');
  });

  it('fully hides adjacent home pages on narrow iOS viewports', () => {
    expect(source('src/components/home/PagedHomeScreen.tsx')).toContain("overflowX: 'hidden'");
  });

  it('wraps Plan Manager controls and SMS recovery controls on phones', () => {
    const plans = source('src/pages/plan-manager.tsx');
    const account = source('src/components/settings/MyAccountTab.tsx');

    expect(plans).toContain('flex flex-wrap items-center gap-3');
    expect(plans).toContain('flex w-full sm:w-auto items-center justify-center');
    expect(account).toContain('flex flex-col sm:flex-row gap-2');
    expect(account).toContain('flex-1 min-w-0');
    expect(account).toContain('flex w-full sm:w-auto items-center justify-center');
  });
});
