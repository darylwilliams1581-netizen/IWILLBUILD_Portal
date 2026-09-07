import { beforeEach, describe, expect, it, vi } from 'vitest';

const cache = vi.hoisted(() => ({
  cacheActiveJobs: vi.fn(async () => undefined),
  cacheJob: vi.fn(async () => undefined),
  cacheJobs: vi.fn(async () => undefined),
  readCachedActiveJobs: vi.fn(async () => []),
  readCachedJob: vi.fn(async () => null),
  readCachedJobs: vi.fn(async () => []),
}));

vi.mock('./offlineJobCache', () => cache);

import { fetchActiveJobs, fetchJob } from './jobs-api';

describe('jobs API offline fallback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', vi.fn());
  });

  it('returns cached active jobs and filters them locally when offline', async () => {
    vi.mocked(fetch).mockRejectedValue(new TypeError('offline'));
    cache.readCachedActiveJobs.mockResolvedValue([
      { id: 1, name: 'Depot Upgrade', jobNumber: 'J-1', status: 'Works in Progress' },
      { id: 2, name: 'Office Fitout', jobNumber: 'J-2', status: 'Ready to Start' },
    ]);

    await expect(fetchActiveJobs('depot')).resolves.toEqual([
      { id: 1, name: 'Depot Upgrade', jobNumber: 'J-1', status: 'Works in Progress' },
    ]);
  });

  it('returns a cached job header when the network request fails', async () => {
    vi.mocked(fetch).mockRejectedValue(new TypeError('offline'));
    cache.readCachedJob.mockResolvedValue({ id: 4, name: 'Bridge', status: 'Works in Progress' });

    await expect(fetchJob(4)).resolves.toMatchObject({ id: 4, name: 'Bridge' });
  });
});
