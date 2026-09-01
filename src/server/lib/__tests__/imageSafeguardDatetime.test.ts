/**
 * imageSafeguardDatetime.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Tests for the toMySQLDatetime() helper and its use in scanRunService.
 *
 * ISG-DT-01  toMySQLDatetime() output matches YYYY-MM-DD HH:MM:SS
 * ISG-DT-02  toMySQLDatetime() output contains no 'T' separator
 * ISG-DT-03  toMySQLDatetime() output contains no 'Z' suffix
 * ISG-DT-04  toMySQLDatetime() output contains no milliseconds
 * ISG-DT-05  createScanRun() SQL bindings contain no ISO 'T' or 'Z' characters
 * ISG-DT-06  markRunStarted() SQL bindings contain no ISO 'T' or 'Z' characters
 * ISG-DT-07  markRunCompleted() SQL bindings contain no ISO 'T' or 'Z' characters
 * ISG-DT-08  markRunFailed() SQL bindings contain no ISO 'T' or 'Z' characters
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── Mocks ─────────────────────────────────────────────────────────────────────

const capturedBindings: unknown[] = [];
const mockExecute = vi.fn(async (query: { queryChunks?: unknown[] }) => {
  // Drizzle sql`` tagged template produces an object with queryChunks.
  // Collect every non-SQL-fragment value so we can assert on datetime strings.
  if (query?.queryChunks) {
    for (const chunk of query.queryChunks) {
      if (
        chunk !== null &&
        typeof chunk === 'object' &&
        'value' in (chunk as object)
      ) {
        const val = (chunk as { value: unknown[] }).value;
        if (Array.isArray(val)) capturedBindings.push(...val);
      }
    }
  }
  return [];
});

vi.mock('../../db/client.js', () => ({
  db: { execute: mockExecute },
}));

// ── Import after mocks ────────────────────────────────────────────────────────

import {
  createScanRun,
  markRunStarted,
  markRunCompleted,
  markRunFailed,
} from '../imageSafeguard/scanRunService.js';

// ── Helper: extract toMySQLDatetime from the module ───────────────────────────
// The helper is not exported, so we test its contract via the public functions
// and also via a local re-implementation to verify the regex directly.

function toMySQLDatetime(d: Date): string {
  return d.toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, '');
}

const MYSQL_DATETIME_RE = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/;

// ── ISG-DT-01 through ISG-DT-04: helper contract ─────────────────────────────

describe('toMySQLDatetime helper', () => {
  const samples = [
    new Date('2026-09-01T17:02:06.564Z'),
    new Date('2000-01-01T00:00:00.000Z'),
    new Date('2099-12-31T23:59:59.999Z'),
  ];

  it('ISG-DT-01: output matches YYYY-MM-DD HH:MM:SS', () => {
    for (const d of samples) {
      expect(toMySQLDatetime(d)).toMatch(MYSQL_DATETIME_RE);
    }
  });

  it('ISG-DT-02: output contains no T separator', () => {
    for (const d of samples) {
      expect(toMySQLDatetime(d)).not.toContain('T');
    }
  });

  it('ISG-DT-03: output contains no Z suffix', () => {
    for (const d of samples) {
      expect(toMySQLDatetime(d)).not.toContain('Z');
    }
  });

  it('ISG-DT-04: output contains no milliseconds', () => {
    for (const d of samples) {
      expect(toMySQLDatetime(d)).not.toMatch(/\.\d+/);
    }
  });

  it('ISG-DT-01b: known value round-trips correctly', () => {
    expect(toMySQLDatetime(new Date('2026-09-01T17:02:06.564Z')))
      .toBe('2026-09-01 17:02:06');
  });
});

// ── ISG-DT-05 through ISG-DT-08: SQL binding assertions ──────────────────────

describe('scanRunService SQL bindings contain no ISO T/Z', () => {
  const range = {
    rangeStart: new Date('2026-06-28T17:01:00.000Z'),
    rangeEnd:   new Date('2026-09-01T17:01:00.000Z'),
    usedCursor: false,
  };

  function stringBindings(): string[] {
    return capturedBindings.filter((v): v is string => typeof v === 'string');
  }

  function assertNoISOSuffix(label: string) {
    const strings = stringBindings();
    const isoPattern = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}|\d{4}-\d{2}-\d{2}.*Z$/;
    const bad = strings.filter(s => isoPattern.test(s));
    expect(bad, `${label}: found ISO-format datetime bindings: ${JSON.stringify(bad)}`).toHaveLength(0);
  }

  beforeEach(() => {
    capturedBindings.length = 0;
    mockExecute.mockClear();
  });

  it('ISG-DT-05: createScanRun bindings have no T or Z in datetime strings', async () => {
    await createScanRun('test-user-id', range);
    assertNoISOSuffix('createScanRun');
    // Also verify at least one MySQL-format datetime was bound
    const strings = stringBindings();
    const mysqlDates = strings.filter(s => MYSQL_DATETIME_RE.test(s));
    expect(mysqlDates.length, 'expected at least one MySQL datetime binding').toBeGreaterThan(0);
  });

  it('ISG-DT-06: markRunStarted bindings have no T or Z in datetime strings', async () => {
    await markRunStarted('test-run-id');
    assertNoISOSuffix('markRunStarted');
  });

  it('ISG-DT-07: markRunCompleted bindings have no T or Z in datetime strings', async () => {
    await markRunCompleted(
      'test-run-id',
      { imagesConsidered: 10, imagesScanned: 8, imagesSkipped: 2, imagesWithSignal: 1, imagesFailed: 0 },
      'openai_vision',
      '1.0',
    );
    assertNoISOSuffix('markRunCompleted');
  });

  it('ISG-DT-08: markRunFailed bindings have no T or Z in datetime strings', async () => {
    await markRunFailed('test-run-id', 'classifier_error');
    assertNoISOSuffix('markRunFailed');
  });
});
