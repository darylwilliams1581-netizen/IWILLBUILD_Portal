import { describe, expect, it } from 'vitest';
import { toMySQLDatetime } from './datetime';

describe('toMySQLDatetime', () => {
  it('formats ISO timestamps for MySQL in UTC', () => {
    expect(toMySQLDatetime('2026-09-07T08:09:10.999Z')).toBe('2026-09-07 08:09:10');
  });

  it('rejects invalid values', () => {
    expect(toMySQLDatetime('not-a-date')).toBeNull();
    expect(toMySQLDatetime(null)).toBeNull();
  });
});
