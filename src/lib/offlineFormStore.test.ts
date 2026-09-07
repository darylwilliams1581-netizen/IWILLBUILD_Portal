import { beforeEach, describe, expect, it } from 'vitest';
import {
  cacheFormAnswers,
  cacheFormFields,
  cacheFormShell,
  readCachedFormAnswers,
  readCachedFormFields,
  readCachedFormShell,
} from './offlineFormStore';

describe('offlineFormStore', () => {
  beforeEach(() => localStorage.clear());

  it('caches template fields for offline reopening', () => {
    cacheFormFields(4, [{ id: 11, label: 'Hazard' }]);
    expect(readCachedFormFields(4)).toEqual([{ id: 11, label: 'Hazard' }]);
  });

  it('keeps answers separate for each submission', () => {
    cacheFormAnswers(8, { 11: 'Barricade installed' });
    cacheFormAnswers(9, { 11: 'Spotter assigned' });
    expect(readCachedFormAnswers(8)).toEqual({ 11: 'Barricade installed' });
  });

  it('caches the submission shell needed to reopen a form offline', () => {
    cacheFormShell(8, { submission: { id: 8 }, templateName: 'Site Check' });
    expect(readCachedFormShell(8)).toEqual({ submission: { id: 8 }, templateName: 'Site Check' });
  });
});
