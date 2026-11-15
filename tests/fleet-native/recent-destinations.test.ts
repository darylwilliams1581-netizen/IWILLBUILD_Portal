import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import { readRecentDestinations, rememberDestination } from '@/lib/recent-destinations';

beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());

it('keeps five unique destinations, most recent first, and moves reused entries to the front', () => {
  for (const name of ['Site A', 'Site B', 'Site C', 'Site D', 'Site E', 'Site F'])
    rememberDestination(1, 'driver', name);
  expect(readRecentDestinations(1, 'driver')).toEqual(['Site F', 'Site E', 'Site D', 'Site C', 'Site B']);
  rememberDestination(1, 'driver', '  site   c  ');
  expect(readRecentDestinations(1, 'driver')).toEqual(['site c', 'Site F', 'Site E', 'Site D', 'Site B']);
});
it('isolates drivers and companies and skips missing identity', () => {
  rememberDestination(1, 'driver', 'Company one site');
  rememberDestination(2, 'driver', 'Company two site');
  rememberDestination(1, 'other', 'Other driver site');
  rememberDestination(0, 'driver', 'Invalid company');
  rememberDestination(1, '', 'Missing driver');
  expect(readRecentDestinations(1, 'driver')).toEqual(['Company one site']);
  expect(readRecentDestinations(2, 'driver')).toEqual(['Company two site']);
  expect(readRecentDestinations(1, 'other')).toEqual(['Other driver site']);
  expect(readRecentDestinations(0, 'driver')).toEqual([]);
  expect(readRecentDestinations(1, '')).toEqual([]);
  expect(localStorage.length).toBe(3);
});
it('recovers malformed storage and rejects invalid suggestions', () => {
  rememberDestination(1, 'driver', 'Valid site');
  const key = localStorage.key(0)!;
  localStorage.setItem(key, '{bad json');
  expect(readRecentDestinations(1, 'driver')).toEqual([]);
  localStorage.setItem(key, JSON.stringify([null, 42, '', 'x', 'a'.repeat(501), '  Site A ', 'site a', 'Site B']));
  expect(readRecentDestinations(1, 'driver')).toEqual(['Site A', 'Site B']);
  rememberDestination(1, 'driver', null);
  rememberDestination(1, 'driver', ' ');
  expect(readRecentDestinations(1, 'driver')).toEqual(['Site A', 'Site B']);
});
it('treats unavailable storage as optional', () => {
  vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw Error('Denied'); });
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw Error('Full'); });
  expect(readRecentDestinations(1, 'driver')).toEqual([]);
  expect(() => rememberDestination(1, 'driver', 'Site A')).not.toThrow();
});
