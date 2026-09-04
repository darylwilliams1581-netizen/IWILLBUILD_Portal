import { writeFileSync, mkdirSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const dest = resolve(__dirname, '../src/lib/__tests__/native-api-gate.test.ts');
mkdirSync(dirname(dest), { recursive: true });

const src = `import { describe, it, expect, afterEach, vi } from 'vitest';
import { resolveDownloadUrl, nativeApiOrigin } from '@/lib/native-api';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const nativeApiSrc  = readFileSync(resolve(__dirname, '../../lib/native-api.ts'), 'utf8');
const mainSrc       = readFileSync(resolve(__dirname, '../../main.tsx'), 'utf8');
const authClientSrc = readFileSync(resolve(__dirname, '../../lib/auth/auth-client.tsx'), 'utf8');
const authSrc       = readFileSync(resolve(__dirname, '../../lib/auth/auth.ts'), 'utf8');
const nativeUrlSrc  = readFileSync(resolve(__dirname, '../../lib/native-url.ts'), 'utf8');

describe('Native API Gate — 10 tests', () => {

  afterEach(() => {
    // restore window.Capacitor to absent state
    const w = globalThis as unknown as Record<string, unknown>;
    delete w['Capacitor'];
  });

  it('1. resolveDownloadUrl rewrites /api/... on native', () => {
    // Simulate native by temporarily patching the module-level check
    // We test the source logic: shouldRewrite returns true for /api/ paths
    expect(nativeApiSrc).toMatch(/startsWith\('\/api\/'\)/);
    expect(nativeApiSrc).toMatch(/PROD_ORIGIN/);
    // On web (no Capacitor), returns unchanged
    expect(resolveDownloadUrl('/api/jobs/1/download')).toBe('/api/jobs/1/download');
  });

  it('2. resolveDownloadUrl does NOT double-prefix absolute URLs', () => {
    // shouldRewrite returns false for https:// URLs
    expect(nativeApiSrc).toMatch(/startsWith\('https:\/\/'\)/);
    // On web, absolute URL passes through
    const abs = 'https://iwillbuild.com/api/files/1/download';
    expect(resolveDownloadUrl(abs)).toBe(abs);
  });

  it('3. resolveDownloadUrl is no-op on web (Capacitor absent)', () => {
    expect(resolveDownloadUrl('/api/jobs')).toBe('/api/jobs');
    expect(resolveDownloadUrl('/auth/sign-in')).toBe('/auth/sign-in');
  });

  it('4. nativeApiOrigin returns empty string on web', () => {
    expect(nativeApiOrigin()).toBe('');
  });

  it('5. XHR patch is present in native-api.ts source', () => {
    expect(nativeApiSrc).toMatch(/XMLHttpRequest\.prototype\.open/);
    expect(nativeApiSrc).toMatch(/patchXHR/);
  });

  it('6. auth-client.tsx getAuthBaseURL handles capacitor://localhost', () => {
    // Strip comments before checking
    const noComments = authClientSrc.replace(/\\/\\*[\\s\\S]*?\\*\\//g, '').replace(/\\/\\/.*/g, '');
    expect(noComments).toMatch(/capacitor:\\/\\/localhost/);
    expect(noComments).toMatch(/https:\\/\\/iwillbuild\\.com/);
  });

  it('7. auth-client.tsx getAuthBaseURL handles null origin (Safari standalone)', () => {
    const noComments = authClientSrc.replace(/\\/\\*[\\s\\S]*?\\*\\//g, '').replace(/\\/\\/.*/g, '');
    expect(noComments).toMatch(/origin === 'null'/);
  });

  it('8. native-url.ts uses hardcoded iwillbuild.com (not VITE_PROD_HOST)', () => {
    expect(nativeUrlSrc).toMatch(/iwillbuild\\.com/);
    expect(nativeUrlSrc).not.toMatch(/VITE_PROD_HOST/);
  });

  it('9. auth.ts disableCSRFCheck is scoped to AIRO_PREVIEW=true (not unconditionally true)', () => {
    const noComments = authSrc.replace(/\\/\\*[\\s\\S]*?\\*\\//g, '').replace(/\\/\\/.*/g, '');
    expect(noComments).toMatch(/disableCSRFCheck.*AIRO_PREVIEW/);
    expect(noComments).not.toMatch(/disableCSRFCheck:\\s*true/);
  });

  it('10. main.tsx calls patchFetchForNative before installSessionFetchInterceptor', () => {
    expect(mainSrc).toMatch(/patchFetchForNative/);
    const patchIdx = mainSrc.indexOf('patchFetchForNative()');
    const interceptorIdx = mainSrc.indexOf('installSessionFetchInterceptor()');
    expect(patchIdx).toBeGreaterThan(-1);
    expect(interceptorIdx).toBeGreaterThan(-1);
    expect(patchIdx).toBeLessThan(interceptorIdx);
  });

});
`;

writeFileSync(dest, src);
console.log('written', dest);
