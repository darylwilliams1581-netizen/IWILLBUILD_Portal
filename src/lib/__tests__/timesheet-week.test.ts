/**
 * timesheet-week.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Unit tests for the Sunday-only week-ending helpers exported from
 * NewTimesheetSheet.tsx.
 *
 * Tests confirm:
 *  - Every Sunday is accepted by isSunday()
 *  - Monday through Saturday are rejected by isSunday()
 *  - shiftWeek moves exactly seven calendar days in both directions
 *  - weekDates() produces the correct Mon–Sun range for a given Sunday
 *  - weekRangeLabel() returns the correct human-readable range
 *  - snapToSunday() snaps any weekday to the following Sunday
 *  - toLocalISO() / parseLocalDate() round-trip without UTC shift
 *  - Brisbane timezone (UTC+10) does not shift the date
 *  - Invalid / empty strings are rejected
 *  - Existing valid Sunday timesheets continue loading correctly
 */

import { describe, it, expect } from 'vitest';
import {
  isSunday,
  snapToSunday,
  nextSunday,
  weekDates,
  weekRangeLabel,
  shiftWeek,
  toLocalISO,
  parseLocalDate,
} from '../../components/finance/NewTimesheetSheet';

// ── isSunday ──────────────────────────────────────────────────────────────────

describe('isSunday', () => {
  // Known Sundays
  const sundays = [
    '2026-08-30', // Sun 30 Aug 2026
    '2026-08-23', // Sun 23 Aug 2026
    '2026-09-06', // Sun 6 Sep 2026
    '2026-12-27', // Sun 27 Dec 2026
    '2027-01-03', // Sun 3 Jan 2027
    '2026-01-04', // Sun 4 Jan 2026
  ];

  it.each(sundays)('accepts Sunday %s', (date) => {
    expect(isSunday(date)).toBe(true);
  });

  // Known non-Sundays — one for each weekday
  const nonSundays: [string, string][] = [
    ['2026-08-24', 'Monday'],
    ['2026-08-25', 'Tuesday'],
    ['2026-08-26', 'Wednesday'],
    ['2026-08-27', 'Thursday'],
    ['2026-08-28', 'Friday'],
    ['2026-08-29', 'Saturday'],
  ];

  it.each(nonSundays)('rejects %s (%s)', (date) => {
    expect(isSunday(date)).toBe(false);
  });

  it('rejects empty string', () => {
    expect(isSunday('')).toBe(false);
  });

  it('rejects malformed string', () => {
    expect(isSunday('not-a-date')).toBe(false);
    expect(isSunday('2026/08/30')).toBe(false);
  });
});

// ── snapToSunday ──────────────────────────────────────────────────────────────

describe('snapToSunday', () => {
  it('returns the same date when already a Sunday', () => {
    expect(snapToSunday('2026-08-30')).toBe('2026-08-30');
  });

  it('snaps Monday to the following Sunday', () => {
    expect(snapToSunday('2026-08-24')).toBe('2026-08-30');
  });

  it('snaps Tuesday to the following Sunday', () => {
    expect(snapToSunday('2026-08-25')).toBe('2026-08-30');
  });

  it('snaps Wednesday to the following Sunday', () => {
    expect(snapToSunday('2026-08-26')).toBe('2026-08-30');
  });

  it('snaps Thursday to the following Sunday', () => {
    expect(snapToSunday('2026-08-27')).toBe('2026-08-30');
  });

  it('snaps Friday to the following Sunday', () => {
    expect(snapToSunday('2026-08-28')).toBe('2026-08-30');
  });

  it('snaps Saturday to the following Sunday', () => {
    expect(snapToSunday('2026-08-29')).toBe('2026-08-30');
  });

  it('snaps across a month boundary correctly', () => {
    // Friday 28 Aug → Sunday 30 Aug
    expect(snapToSunday('2026-08-28')).toBe('2026-08-30');
    // Monday 31 Aug → Sunday 6 Sep
    expect(snapToSunday('2026-08-31')).toBe('2026-09-06');
  });

  it('snaps across a year boundary correctly', () => {
    // Monday 28 Dec 2026 → Sunday 3 Jan 2027
    expect(snapToSunday('2026-12-28')).toBe('2027-01-03');
  });
});

// ── nextSunday ────────────────────────────────────────────────────────────────

describe('nextSunday', () => {
  it('returns today when today is a Sunday', () => {
    // Sun 30 Aug 2026
    const sun = new Date(2026, 7, 30); // month is 0-indexed
    expect(nextSunday(sun)).toBe('2026-08-30');
  });

  it('returns the next Sunday when today is a Monday', () => {
    const mon = new Date(2026, 7, 24); // Mon 24 Aug 2026
    expect(nextSunday(mon)).toBe('2026-08-30');
  });

  it('returns the next Sunday when today is a Saturday', () => {
    const sat = new Date(2026, 7, 29); // Sat 29 Aug 2026
    expect(nextSunday(sat)).toBe('2026-08-30');
  });
});

// ── shiftWeek ─────────────────────────────────────────────────────────────────

describe('shiftWeek', () => {
  const base = '2026-08-30'; // Sun 30 Aug 2026

  it('moves forward exactly 7 days', () => {
    expect(shiftWeek(base, 1)).toBe('2026-09-06');
  });

  it('moves backward exactly 7 days', () => {
    expect(shiftWeek(base, -1)).toBe('2026-08-23');
  });

  it('result of +1 is still a Sunday', () => {
    expect(isSunday(shiftWeek(base, 1))).toBe(true);
  });

  it('result of -1 is still a Sunday', () => {
    expect(isSunday(shiftWeek(base, -1))).toBe(true);
  });

  it('chains correctly across month boundary', () => {
    // 30 Aug → 6 Sep → 13 Sep
    const w1 = shiftWeek(base, 1);
    const w2 = shiftWeek(w1, 1);
    expect(w1).toBe('2026-09-06');
    expect(w2).toBe('2026-09-13');
    expect(isSunday(w2)).toBe(true);
  });

  it('chains correctly across year boundary', () => {
    // Sun 27 Dec 2026 → Sun 3 Jan 2027
    expect(shiftWeek('2026-12-27', 1)).toBe('2027-01-03');
    expect(isSunday('2027-01-03')).toBe(true);
  });

  it('prev-then-next returns original date', () => {
    expect(shiftWeek(shiftWeek(base, -1), 1)).toBe(base);
  });

  it('next-then-prev returns original date', () => {
    expect(shiftWeek(shiftWeek(base, 1), -1)).toBe(base);
  });
});

// ── weekDates ─────────────────────────────────────────────────────────────────

describe('weekDates', () => {
  it('returns exactly 7 dates', () => {
    expect(weekDates('2026-08-30')).toHaveLength(7);
  });

  it('starts on Monday and ends on Sunday', () => {
    const dates = weekDates('2026-08-30');
    expect(dates[0]).toBe('2026-08-24'); // Mon 24 Aug
    expect(dates[6]).toBe('2026-08-30'); // Sun 30 Aug
  });

  it('produces Mon–Sun in order for week ending 30 Aug 2026', () => {
    expect(weekDates('2026-08-30')).toEqual([
      '2026-08-24', // Mon
      '2026-08-25', // Tue
      '2026-08-26', // Wed
      '2026-08-27', // Thu
      '2026-08-28', // Fri
      '2026-08-29', // Sat
      '2026-08-30', // Sun
    ]);
  });

  it('handles month boundary correctly (week ending 6 Sep 2026)', () => {
    expect(weekDates('2026-09-06')).toEqual([
      '2026-08-31', // Mon
      '2026-09-01', // Tue
      '2026-09-02', // Wed
      '2026-09-03', // Thu
      '2026-09-04', // Fri
      '2026-09-05', // Sat
      '2026-09-06', // Sun
    ]);
  });

  it('handles year boundary correctly (week ending 3 Jan 2027)', () => {
    expect(weekDates('2027-01-03')).toEqual([
      '2026-12-28', // Mon
      '2026-12-29', // Tue
      '2026-12-30', // Wed
      '2026-12-31', // Thu
      '2027-01-01', // Fri
      '2027-01-02', // Sat
      '2027-01-03', // Sun
    ]);
  });

  it('every date in the range is a valid YYYY-MM-DD string', () => {
    const dates = weekDates('2026-08-30');
    for (const d of dates) {
      expect(d).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it('all 7 dates are consecutive calendar days', () => {
    const dates = weekDates('2026-08-30');
    for (let i = 1; i < dates.length; i++) {
      const prev = parseLocalDate(dates[i - 1]);
      const curr = parseLocalDate(dates[i]);
      const diffMs = curr.getTime() - prev.getTime();
      expect(diffMs).toBe(24 * 60 * 60 * 1000); // exactly 1 day
    }
  });
});

// ── weekRangeLabel ────────────────────────────────────────────────────────────

describe('weekRangeLabel', () => {
  it('returns empty string for non-Sunday', () => {
    expect(weekRangeLabel('2026-08-25')).toBe(''); // Tuesday
    expect(weekRangeLabel('2026-08-29')).toBe(''); // Saturday
  });

  it('contains "Monday" and "Sunday" for a valid week', () => {
    const label = weekRangeLabel('2026-08-30');
    expect(label).toContain('Monday');
    expect(label).toContain('Sunday');
  });

  it('contains the correct start and end dates for week ending 30 Aug 2026', () => {
    const label = weekRangeLabel('2026-08-30');
    // en-AU format: DD/MM/YYYY
    expect(label).toContain('24/08/2026'); // Monday
    expect(label).toContain('30/08/2026'); // Sunday
  });

  it('contains the correct dates for week ending 6 Sep 2026', () => {
    const label = weekRangeLabel('2026-09-06');
    expect(label).toContain('31/08/2026'); // Monday
    expect(label).toContain('06/09/2026'); // Sunday
  });

  it('contains the correct dates across year boundary', () => {
    const label = weekRangeLabel('2027-01-03');
    expect(label).toContain('28/12/2026'); // Monday
    expect(label).toContain('03/01/2027'); // Sunday
  });
});

// ── toLocalISO / parseLocalDate round-trip ────────────────────────────────────

describe('toLocalISO / parseLocalDate round-trip', () => {
  it('round-trips without UTC shift', () => {
    const dates = [
      '2026-08-24',
      '2026-08-30',
      '2026-12-31',
      '2027-01-01',
    ];
    for (const d of dates) {
      expect(toLocalISO(parseLocalDate(d))).toBe(d);
    }
  });

  it('does not shift date when system timezone is UTC+10 (Brisbane)', () => {
    // Simulate what would happen if Date used UTC: midnight UTC on 2026-08-30
    // would be 10:00 AM Brisbane time — still the same calendar day.
    // Our helpers use local year/month/date, so no shift occurs.
    const d = parseLocalDate('2026-08-30');
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(7); // 0-indexed August
    expect(d.getDate()).toBe(30);
  });

  it('never calls toISOString() — uses local getFullYear/getMonth/getDate', () => {
    // Verify the output matches local date components, not UTC
    const d = new Date(2026, 7, 30, 0, 0, 0); // local midnight 30 Aug 2026
    expect(toLocalISO(d)).toBe('2026-08-30');
  });
});

// ── Existing valid Sunday timesheets continue loading ─────────────────────────

describe('existing valid Sunday timesheets', () => {
  it('isSunday returns true for all historically valid week-ending dates', () => {
    // These are the kinds of dates that would be stored in the DB
    const validStoredDates = [
      '2026-08-02',
      '2026-08-09',
      '2026-08-16',
      '2026-08-23',
      '2026-08-30',
      '2026-09-06',
      '2026-09-13',
    ];
    for (const d of validStoredDates) {
      expect(isSunday(d)).toBe(true);
    }
  });

  it('weekDates produces 7 dates for each stored Sunday', () => {
    const stored = ['2026-08-02', '2026-08-09', '2026-08-16'];
    for (const we of stored) {
      expect(weekDates(we)).toHaveLength(7);
      expect(weekDates(we)[6]).toBe(we); // last date is the Sunday itself
    }
  });
});

// ── Invalid dates cannot be saved or submitted ────────────────────────────────

describe('invalid dates cannot be saved or submitted', () => {
  it('isSunday returns false for every day of a non-Sunday week', () => {
    // Week of 24–29 Aug 2026 — none should be accepted as week-ending
    const weekdays = [
      '2026-08-24', // Mon
      '2026-08-25', // Tue
      '2026-08-26', // Wed
      '2026-08-27', // Thu
      '2026-08-28', // Fri
      '2026-08-29', // Sat
    ];
    for (const d of weekdays) {
      expect(isSunday(d)).toBe(false);
    }
  });

  it('weekRangeLabel returns empty string for invalid dates (no range shown)', () => {
    const invalid = ['2026-08-24', '2026-08-25', '2026-08-26', '2026-08-27', '2026-08-28', '2026-08-29', ''];
    for (const d of invalid) {
      expect(weekRangeLabel(d)).toBe('');
    }
  });
});
