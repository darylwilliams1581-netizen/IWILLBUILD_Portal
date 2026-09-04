/**
 * useAppLifecycle.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Focused regression tests for BUILD-21-IOS-REPAIR item 3:
 *   "appStateChange addListener is not a function" crash.
 *
 * Covers:
 *   1. Browser path — visibilitychange fires onForeground / onBackground
 *   2. Browser path — online/offline events fire onOnline / onOffline
 *   3. Native path — addListener attaches and fires onForeground / onBackground
 *   4. Native path — addListener handle.remove() is called on unmount
 *   5. Native path — stub with non-callable addListener does NOT crash
 *   6. Native path — bridge absent does NOT crash
 *   7. Native path — addListener promise rejection does NOT crash
 *   8. React remount — duplicate listeners are NOT registered (cleanup runs)
 *   9. Callback identity change does NOT re-run the effect (stable refs)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAppLifecycle } from '../useAppLifecycle';

// ── Bridge helpers ────────────────────────────────────────────────────────────

type CapWindow = Window & {
  Capacitor?: {
    isNativePlatform?: () => boolean;
    getPlatform?: () => string;
    Plugins?: Record<string, unknown>;
  };
};

function setNativeBridge(plugins: Record<string, unknown>) {
  (window as CapWindow).Capacitor = {
    isNativePlatform: () => true,
    getPlatform: () => 'ios',
    Plugins: plugins,
  };
}

function clearBridge() {
  delete (window as CapWindow).Capacitor;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('useAppLifecycle — browser path', () => {
  beforeEach(() => clearBridge());
  afterEach(() => clearBridge());

  it('1. calls onForeground when tab becomes visible', () => {
    const onForeground = vi.fn();
    renderHook(() => useAppLifecycle({ onForeground }));

    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    act(() => { document.dispatchEvent(new Event('visibilitychange')); });

    expect(onForeground).toHaveBeenCalledTimes(1);
  });

  it('2. calls onBackground when tab becomes hidden', () => {
    const onBackground = vi.fn();
    renderHook(() => useAppLifecycle({ onBackground }));

    Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
    act(() => { document.dispatchEvent(new Event('visibilitychange')); });

    expect(onBackground).toHaveBeenCalledTimes(1);
  });

  it('3. calls onOnline when window comes online', () => {
    const onOnline = vi.fn();
    renderHook(() => useAppLifecycle({ onOnline }));

    act(() => { window.dispatchEvent(new Event('online')); });

    expect(onOnline).toHaveBeenCalledTimes(1);
  });

  it('4. calls onOffline when window goes offline', () => {
    const onOffline = vi.fn();
    renderHook(() => useAppLifecycle({ onOffline }));

    act(() => { window.dispatchEvent(new Event('offline')); });

    expect(onOffline).toHaveBeenCalledTimes(1);
  });

  it('5. cleans up visibilitychange listener on unmount', () => {
    const onForeground = vi.fn();
    const { unmount } = renderHook(() => useAppLifecycle({ onForeground }));
    unmount();

    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    act(() => { document.dispatchEvent(new Event('visibilitychange')); });

    expect(onForeground).not.toHaveBeenCalled();
  });

  it('6. callback identity change does NOT re-run the effect', () => {
    // Each render creates a new function reference — the effect must NOT re-run
    let callCount = 0;
    const { rerender } = renderHook(() =>
      useAppLifecycle({ onForeground: () => { callCount++; } }),
    );
    // Re-render 5 times with new function identity each time
    for (let i = 0; i < 5; i++) rerender();

    // Fire one visibility event — should call exactly once (not 6 times)
    Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
    act(() => { document.dispatchEvent(new Event('visibilitychange')); });

    expect(callCount).toBe(1);
  });
});

describe('useAppLifecycle — native path', () => {
  beforeEach(() => clearBridge());
  afterEach(() => clearBridge());

  it('7. attaches addListener on native and fires onForeground', async () => {
    const onForeground = vi.fn();
    let capturedHandler: ((state: { isActive: boolean }) => void) | null = null;
    const removeHandle = vi.fn();

    setNativeBridge({
      App: {
        addListener: vi.fn((event: string, handler: (state: { isActive: boolean }) => void) => {
          capturedHandler = handler;
          return Promise.resolve({ remove: removeHandle });
        }),
      },
    });

    renderHook(() => useAppLifecycle({ onForeground }));

    // Wait for the addListener promise to resolve
    await act(async () => { await Promise.resolve(); });

    act(() => { capturedHandler?.({ isActive: true }); });

    expect(onForeground).toHaveBeenCalledTimes(1);
  });

  it('8. fires onBackground when isActive=false', async () => {
    const onBackground = vi.fn();
    let capturedHandler: ((state: { isActive: boolean }) => void) | null = null;

    setNativeBridge({
      App: {
        addListener: vi.fn((_event: string, handler: (state: { isActive: boolean }) => void) => {
          capturedHandler = handler;
          return Promise.resolve({ remove: vi.fn() });
        }),
      },
    });

    renderHook(() => useAppLifecycle({ onBackground }));
    await act(async () => { await Promise.resolve(); });

    act(() => { capturedHandler?.({ isActive: false }); });

    expect(onBackground).toHaveBeenCalledTimes(1);
  });

  it('9. calls handle.remove() on unmount', async () => {
    const removeHandle = vi.fn();

    setNativeBridge({
      App: {
        addListener: vi.fn(() => Promise.resolve({ remove: removeHandle })),
      },
    });

    const { unmount } = renderHook(() => useAppLifecycle({}));
    await act(async () => { await Promise.resolve(); });

    unmount();

    expect(removeHandle).toHaveBeenCalledTimes(1);
  });

  it('10. stub with non-callable addListener does NOT crash', () => {
    // Simulates the TestFlight cold-start race where the stub exists but
    // addListener is not yet a function.
    setNativeBridge({
      App: {
        addListener: undefined, // not callable
      },
    });

    expect(() => {
      renderHook(() => useAppLifecycle({ onForeground: vi.fn() }));
    }).not.toThrow();
  });

  it('11. bridge absent does NOT crash', () => {
    clearBridge(); // no window.Capacitor at all

    expect(() => {
      renderHook(() => useAppLifecycle({ onForeground: vi.fn() }));
    }).not.toThrow();
  });

  it('12. addListener promise rejection does NOT crash', async () => {
    setNativeBridge({
      App: {
        addListener: vi.fn(() => Promise.reject(new Error('bridge not ready'))),
      },
    });

    expect(() => {
      renderHook(() => useAppLifecycle({ onForeground: vi.fn() }));
    }).not.toThrow();

    // Let the rejection settle — must not throw unhandled
    await act(async () => { await new Promise(r => setTimeout(r, 10)); });
  });

  it('13. React remount does NOT register duplicate listeners', async () => {
    let addListenerCallCount = 0;
    const removeHandles: ReturnType<typeof vi.fn>[] = [];

    setNativeBridge({
      App: {
        addListener: vi.fn(() => {
          addListenerCallCount++;
          const removeHandle = vi.fn();
          removeHandles.push(removeHandle);
          return Promise.resolve({ remove: removeHandle });
        }),
      },
    });

    // First mount
    const { unmount: unmount1 } = renderHook(() => useAppLifecycle({}));
    await act(async () => { await Promise.resolve(); });
    expect(addListenerCallCount).toBe(1);

    // Unmount — cleanup must run
    unmount1();
    await act(async () => { await Promise.resolve(); });
    expect(removeHandles[0]).toHaveBeenCalledTimes(1);

    // Second mount (simulates React remount)
    const { unmount: unmount2 } = renderHook(() => useAppLifecycle({}));
    await act(async () => { await Promise.resolve(); });
    expect(addListenerCallCount).toBe(2);

    unmount2();
  });
});
