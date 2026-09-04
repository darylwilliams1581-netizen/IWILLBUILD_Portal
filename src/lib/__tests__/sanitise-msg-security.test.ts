/**
 * CP9 Security Tests — sanitiseMsg (client + server)
 * ────────────────────────────────────────────────────
 * M1  Normal path string is redacted
 * M2  Normal URL is redacted
 * M3  JWT token is redacted
 * M4  Long alphanumeric string (≥40 chars) is redacted
 * M5  GPS coordinates are redacted
 * M6  Output is truncated to 300 chars
 * M7  10 KB path-like input completes in < 500 ms (ReDoS guard)
 * M8  100 KB path-like input completes in < 500 ms (ReDoS guard)
 * M9  10 KB slash-only input completes in < 500 ms (ReDoS guard — old pattern exploit)
 * M10 100 KB slash-only input completes in < 500 ms (ReDoS guard — old pattern exploit)
 * M11 Valid path with extension is redacted
 * M12 Path without extension is NOT redacted as [file]
 * M13 Normal message text is preserved
 */

import { describe, it, expect } from 'vitest';
import type { DiagEvent } from '../diagnosticBuffer';
import { sanitiseMsg as sanitiseMsgServer } from '../../server/api/bug-reports/support-bundle-generator';
import { buildSanitisedDiagnostics } from '../../lib/bugReportBundleClient';

describe('sanitiseMsg (server) — CP9 security', () => {
  it('M1: redacts a local filesystem path', () => {
    const out = sanitiseMsgServer('Error reading /app/src/server/entry.ts');
    expect(out).toContain('[file]');
    expect(out).not.toContain('/app/src/server/entry.ts');
  });

  it('M2: redacts a URL', () => {
    const out = sanitiseMsgServer('Failed to fetch https://api.example.com/v1/users?token=abc');
    expect(out).toContain('[url]');
    expect(out).not.toContain('api.example.com');
  });

  it('M3: redacts a JWT token', () => {
    const jwt = 'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c';
    const out = sanitiseMsgServer(`Auth failed: ${jwt}`);
    expect(out).toContain('[redacted]');
    expect(out).not.toContain('eyJhbGciOiJIUzI1NiJ9');
  });

  it('M4: redacts long alphanumeric strings ≥40 chars', () => {
    const key = 'a'.repeat(40);
    const out = sanitiseMsgServer(`API key: ${key}`);
    expect(out).toContain('[redacted]');
    expect(out).not.toContain(key);
  });

  it('M5: redacts GPS coordinates', () => {
    const out = sanitiseMsgServer('Location: lat=27.4698, lng=153.0251');
    expect(out).toContain('[location]');
    expect(out).not.toContain('27.4698');
  });

  it('M6: truncates output to 300 chars', () => {
    const out = sanitiseMsgServer('x'.repeat(1000));
    expect(out.length).toBeLessThanOrEqual(300);
  });

  it('M7: 10 KB path-like input completes in < 500 ms', () => {
    const input = '/app/src/'.repeat(1111); // ~10 KB
    const start = Date.now();
    sanitiseMsgServer(input);
    expect(Date.now() - start).toBeLessThan(500);
  });

  it('M8: 100 KB path-like input completes in < 500 ms', () => {
    const input = '/app/src/'.repeat(11111); // ~100 KB
    const start = Date.now();
    sanitiseMsgServer(input);
    expect(Date.now() - start).toBeLessThan(500);
  });

  it('M9: 10 KB slash-only input completes in < 500 ms (old pattern exploit)', () => {
    // The old pattern /(?:\/[a-zA-Z0-9_.-]+)+\.[a-zA-Z]{2,4}/g would catastrophically
    // backtrack on a string of slashes with no dot at the end.
    const input = '/'.repeat(10_000);
    const start = Date.now();
    sanitiseMsgServer(input);
    expect(Date.now() - start).toBeLessThan(500);
  });

  it('M10: 100 KB slash-only input completes in < 500 ms (old pattern exploit)', () => {
    const input = '/'.repeat(100_000);
    const start = Date.now();
    sanitiseMsgServer(input);
    expect(Date.now() - start).toBeLessThan(500);
  });

  it('M11: valid path with extension is redacted', () => {
    const out = sanitiseMsgServer('Could not open /var/log/app.log');
    expect(out).toContain('[file]');
  });

  it('M12: path without extension is NOT redacted as [file]', () => {
    const out = sanitiseMsgServer('Route /api/users/123 not found');
    // /api/users/123 has no dot-extension — should not be replaced with [file]
    expect(out).not.toContain('[file]');
  });

  it('M13: normal message text is preserved', () => {
    const out = sanitiseMsgServer('Database connection timeout after 30s');
    expect(out).toContain('Database connection timeout');
  });
});

describe('sanitiseMsg (client-side path) — CP9 ReDoS guard', () => {
  // The client-side sanitiseMsg is private, but it's exercised through
  // buildSanitisedDiagnostics. We verify the ReDoS guard by passing a crafted
  // event message and confirming it completes in bounded time.
  const now = new Date().toISOString();
  function makeEvent(msg: string): DiagEvent {
    return {
      ts: Date.now(),
      type: 'error',
      msg,
    };
  }

  it('M7c: 10 KB slash-only message completes in < 500 ms', () => {
    const input = '/'.repeat(10_000);
    const start = Date.now();
    buildSanitisedDiagnostics([makeEvent(input)], now);
    expect(Date.now() - start).toBeLessThan(500);
  });

  it('M8c: 100 KB slash-only message completes in < 500 ms', () => {
    const input = '/'.repeat(100_000);
    const start = Date.now();
    buildSanitisedDiagnostics([makeEvent(input)], now);
    expect(Date.now() - start).toBeLessThan(500);
  });

  it('M9c: normal message text is preserved through the pipeline', () => {
    const result = buildSanitisedDiagnostics([makeEvent('Database timeout after 30s')], now);
    expect(JSON.stringify(result)).toContain('Database timeout');
  });
});
