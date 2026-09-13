import { describe, expect, it, vi } from 'vitest';
import { finishLoginNavigation } from '../login-navigation';

function createControls() {
  return {
    navigate: vi.fn(),
    invalidateMe: vi.fn(),
    invalidateSubscription: vi.fn(),
    blurActiveElement: vi.fn(),
  };
}

describe('finishLoginNavigation', () => {
  it('keeps a native login inside the SPA and routes to app home', () => {
    const controls = createControls();

    finishLoginNavigation({
      destination: '/jobs/42',
      isNative: true,
      ...controls,
    });

    expect(controls.invalidateMe).toHaveBeenCalledOnce();
    expect(controls.invalidateSubscription).toHaveBeenCalledOnce();
    expect(controls.blurActiveElement).toHaveBeenCalledOnce();
    expect(controls.navigate).toHaveBeenCalledWith('/home', { replace: true });
  });

  it('uses the requested destination in a web browser', () => {
    const controls = createControls();

    finishLoginNavigation({
      destination: '/jobs/42',
      isNative: false,
      ...controls,
    });

    expect(controls.invalidateMe).toHaveBeenCalledOnce();
    expect(controls.invalidateSubscription).toHaveBeenCalledOnce();
    expect(controls.blurActiveElement).not.toHaveBeenCalled();
    expect(controls.navigate).toHaveBeenCalledWith('/jobs/42', { replace: true });
  });
});
