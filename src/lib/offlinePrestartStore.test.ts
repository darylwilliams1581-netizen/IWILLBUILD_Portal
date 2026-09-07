import { beforeEach, describe, expect, it } from 'vitest';
import {
  cacheSitePrestart,
  readCachedSitePrestart,
  readCachedSitePrestarts,
} from './offlinePrestartStore';

describe('offlinePrestartStore', () => {
  beforeEach(() => localStorage.clear());

  it('retains full cached fields when a later list response is partial', () => {
    cacheSitePrestart(7, { id: 3, job_name: 'Depot', planned_work: 'Pour slab' });
    cacheSitePrestart(7, { id: 3, job_name: 'Depot updated' });

    expect(readCachedSitePrestart<{ id: number; job_name: string; planned_work?: string }>(7, 3)).toEqual({
      id: 3,
      job_name: 'Depot updated',
      planned_work: 'Pour slab',
    });
  });

  it('keeps jobs in separate caches', () => {
    cacheSitePrestart(7, { id: 1, name: 'one' });
    cacheSitePrestart(8, { id: 2, name: 'two' });

    expect(readCachedSitePrestarts<{ id: number; name: string }>(7)).toEqual([{ id: 1, name: 'one' }]);
  });
});
