import { describe, it, expect } from 'vitest';
import { resolveDownloadUrl, nativeApiOrigin } from '@/lib/native-api';
import { readFileSync } from 'fs';
import { resolve } from 'path';

const nativeApiSrc  = readFileSync(resolve(__dirname, '../../lib/native-api.ts'), 'utf8');
const mainSrc       = readFileSync(resolve(__dirname, '../../main.tsx'), 'utf8');
const authClientSrc = readFileSync(resolve(__dirname, '../../lib/auth/auth-client.tsx'), 'utf8');
const authSrc       = readFileSync(resolve(__dirname, '../../lib/auth/auth.ts'), 'utf8');
const nativeUrlSrc  = readFileSync(resolve(__dirname, '../../lib/native-url.ts'), 'utf8');

describe("Native API Gate", () => {

  it("1. native-api.ts contains shouldRewrite logic for /api/ paths", () => {
    expect(nativeApiSrc).toContain("startsWith(\"/api/\")");
    expect(nativeApiSrc).toContain("PROD_ORIGIN");
    expect(nativeApiSrc).toContain("resolveDownloadUrl");
  });

  it("2. shouldRewrite returns false for absolute https:// URLs", () => {
    expect(nativeApiSrc).toContain("startsWith(\"https://\")");
    const abs = "https://iwillbuild.com/api/files/1/download";
    expect(resolveDownloadUrl(abs)).toBe(abs);
  });

  it("3. resolveDownloadUrl is no-op on web", () => {
    expect(resolveDownloadUrl("/api/jobs")).toBe("/api/jobs");
    expect(resolveDownloadUrl("/auth/sign-in")).toBe("/auth/sign-in");
  });

  it("4. nativeApiOrigin returns empty string on web", () => {
    expect(nativeApiOrigin()).toBe("");
  });

  it("5. XHR patch present in native-api.ts", () => {
    expect(nativeApiSrc).toContain("XMLHttpRequest.prototype.open");
    expect(nativeApiSrc).toContain("patchXHR");
    expect(nativeApiSrc).toContain("patchFetchForNative");
  });

  it("6. auth-client.tsx handles capacitor://localhost", () => {
    expect(authClientSrc).toContain("capacitor://localhost");
    expect(authClientSrc).toContain("https://iwillbuild.com");
  });

  it("7. auth-client.tsx handles null origin", () => {
    expect(authClientSrc).toContain("origin === 'null'");
  });

  it("8. native-url.ts hardcodes iwillbuild.com (no VITE_PROD_HOST)", () => {
    const code = nativeUrlSrc.replace(/\/\/[^\n]*/g, "");
    expect(code).toContain("iwillbuild.com");
    expect(code).not.toContain("VITE_PROD_HOST");
  });

  it("9. auth.ts disableCSRFCheck scoped to AIRO_PREVIEW (not unconditionally true)", () => {
    expect(authSrc).toContain("disableCSRFCheck");
    expect(authSrc).toContain("AIRO_PREVIEW");
    expect(authSrc).not.toContain("disableCSRFCheck: true");
  });

  it("10. main.tsx calls patchFetchForNative before installSessionFetchInterceptor", () => {
    expect(mainSrc).toContain("patchFetchForNative");
    const pi = mainSrc.indexOf("patchFetchForNative()");
    const ii = mainSrc.indexOf("installSessionFetchInterceptor()");
    expect(pi).toBeGreaterThan(-1);
    expect(ii).toBeGreaterThan(-1);
    expect(pi).toBeLessThan(ii);
  });

});
