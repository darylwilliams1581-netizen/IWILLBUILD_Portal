import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { NavigateFunction } from 'react-router';
import { goBack } from './navigation';

describe('goBack', () => {
  const navigate = vi.fn() as unknown as NavigateFunction;

  beforeEach(() => {
    vi.clearAllMocks();
    window.history.replaceState({ idx: 0 }, '', '/jobs/42/camera');
  });

  it('uses one router history step when an in-app entry exists', () => {
    window.history.replaceState({ idx: 2 }, '', '/jobs/42/camera');

    goBack(navigate, '/jobs/42/photos');

    expect(navigate).toHaveBeenCalledWith(-1);
  });

  it('uses the field photos fallback for a shallow camera history', () => {
    goBack(navigate, '/jobs/42/photos');

    expect(navigate).toHaveBeenCalledWith('/jobs/42/photos', { replace: true });
  });

  it('uses the fallback when the current entry is not owned by React Router', () => {
    window.history.replaceState({}, '', '/jobs/42/camera');

    goBack(navigate, '/jobs/42/photos');

    expect(navigate).toHaveBeenCalledWith('/jobs/42/photos', { replace: true });
  });

  it('rejects external fallback paths', () => {
    goBack(navigate, '//example.com');

    expect(navigate).toHaveBeenCalledWith('/home', { replace: true });
  });

  it('escapes a same-page fallback instead of navigating in a loop', () => {
    goBack(navigate, '/jobs/42/camera');

    expect(navigate).toHaveBeenCalledWith('/home', { replace: true });
  });
});
