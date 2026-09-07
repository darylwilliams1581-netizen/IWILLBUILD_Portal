import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OfflineQueueSyncError, readOfflineQueue, useOfflineQueue } from './useOfflineQueue';

vi.mock('./capacitor-plugins', () => ({
  getAppPlugin: vi.fn().mockResolvedValue(null),
}));

function setOnline(value: boolean) {
  Object.defineProperty(window.navigator, 'onLine', { configurable: true, value });
}

describe('useOfflineQueue', () => {
  beforeEach(() => {
    localStorage.clear();
    setOnline(false);
  });

  it('stores actions immediately and preserves their order', () => {
    const sync = vi.fn(async () => undefined);
    const { result } = renderHook(() => useOfflineQueue<{ action: string }>('attendance-test', sync));

    act(() => {
      result.current.enqueue({ action: 'signin' });
      result.current.enqueue({ action: 'signout' });
    });

    expect(readOfflineQueue<{ action: string }>('attendance-test').map((item) => item.payload.action))
      .toEqual(['signin', 'signout']);
    expect(sync).not.toHaveBeenCalled();
  });

  it('coalesces draft saves with the same dedupe key', () => {
    const { result } = renderHook(() => useOfflineQueue<{ value: number }>('draft-test', async () => undefined));

    act(() => {
      result.current.enqueue({ value: 1 }, { dedupeKey: 'draft-42' });
      result.current.enqueue({ value: 2 }, { dedupeKey: 'draft-42' });
    });

    const saved = readOfflineQueue<{ value: number }>('draft-test');
    expect(saved).toHaveLength(1);
    expect(saved[0].payload.value).toBe(2);
  });

  it('keeps a permanent failure and blocks newer ordered actions', async () => {
    setOnline(true);
    const sync = vi.fn(async () => {
      throw new OfflineQueueSyncError('Sign in again', false);
    });
    const { result } = renderHook(() => useOfflineQueue<{ action: string }>('failure-test', sync));

    act(() => {
      result.current.enqueue({ action: 'signin' });
      result.current.enqueue({ action: 'signout' });
    });

    await waitFor(() => expect(result.current.queue[0]?.status).toBe('failed'));
    expect(result.current.queue).toHaveLength(2);
    expect(sync).toHaveBeenCalledTimes(1);
  });

  it('prunes queue entries older than seven days', () => {
    const old = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
    localStorage.setItem('offline_queue_old-test', JSON.stringify([{
      id: 'old', payload: {}, queuedAt: old, updatedAt: old, attempts: 0, status: 'saved',
    }]));
    expect(readOfflineQueue('old-test')).toEqual([]);
  });
});
