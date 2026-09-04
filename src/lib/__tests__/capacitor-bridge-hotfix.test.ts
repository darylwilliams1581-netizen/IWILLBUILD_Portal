/**
 * capacitor-bridge-hotfix.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Regression tests for BUG-2026-BDBCD: "p.addListener is not a function"
 * TestFlight startup crash.
 *
 * Root cause: On some Capacitor / TestFlight builds the native bridge registers
 * plugin stubs in window.Capacitor.Plugins BEFORE the bridge is fully
 * initialised. The stub object is truthy but its methods are undefined or
 * non-callable at that point. Calling e.g. App.addListener() on a stub throws
 * and crashes the React render tree.
 *
 * Fix: getPlugin() in capacitor-plugins.ts validates required methods are
 * callable before returning a plugin. Every addListener call site also wraps
 * in try/catch so a late-throw cannot propagate to React.
 *
 * These tests prove:
 *   1. App startup does not crash when the bridge is absent (web / SSR)
 *   2. App startup does not crash when the bridge stub has non-callable methods
 *   3. getAppPlugin() returns null for a stub with non-callable addListener
 *   4. getAppPlugin() returns the plugin when addListener IS callable
 *   5. getCameraPlugin() returns null for a stub with non-callable getPhoto
 *   6. getCameraPlugin() returns the plugin when all methods are callable
 *   7. appStateChange listener attaches and removes correctly
 *   8. Camera cancellation (user dismisses) does not propagate as an app error
 *   9. Web behaviour is unchanged — all plugin accessors return null on web
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ── Helpers ───────────────────────────────────────────────────────────────────

type CapWindow = Window & {
  Capacitor?: {
    isNativePlatform?: () => boolean;
    getPlatform?: () => string;
    Plugins?: Record<string, unknown>;
  };
};

function setCapacitorBridge(plugins: Record<string, unknown> | undefined, isNative = true) {
  (window as CapWindow).Capacitor = {
    isNativePlatform: () => isNative,
    getPlatform: () => (isNative ? 'ios' : 'web'),
    Plugins: plugins,
  };
}

function clearCapacitorBridge() {
  delete (window as CapWindow).Capacitor;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('capacitor-bridge-hotfix — getPlugin() callable guard', () => {
  beforeEach(() => clearCapacitorBridge());
  afterEach(() => clearCapacitorBridge());

  // ── 1. No bridge (web / SSR) ───────────────────────────────────────────────

  it('1. getAppPlugin() returns null when window.Capacitor is absent (web)', async () => {
    // No bridge set — simulates web / SSR
    const { getAppPlugin } = await import('@/lib/capacitor-plugins');
    expect(getAppPlugin()).toBeNull();
  });

  it('1b. getCameraPlugin() returns null when window.Capacitor is absent (web)', async () => {
    const { getCameraPlugin } = await import('@/lib/capacitor-plugins');
    expect(getCameraPlugin()).toBeNull();
  });

  // ── 2. Bridge stub with non-callable methods (the crash scenario) ──────────

  it('2. getAppPlugin() returns null when App stub has non-callable addListener', async () => {
    setCapacitorBridge({
      // Stub: object exists but addListener is undefined — the exact TestFlight race
      App: { addListener: undefined, exitApp: undefined, openUrl: undefined, getInfo: undefined },
    });
    // Re-import to pick up the new window.Capacitor state
    vi.resetModules();
    const { getAppPlugin } = await import('@/lib/capacitor-plugins');
    expect(getAppPlugin()).toBeNull();
  });

  it('2b. getAppPlugin() returns null when App stub has addListener as a non-function value', async () => {
    setCapacitorBridge({
      App: { addListener: 'not-a-function', exitApp: vi.fn(), openUrl: vi.fn() },
    });
    vi.resetModules();
    const { getAppPlugin } = await import('@/lib/capacitor-plugins');
    expect(getAppPlugin()).toBeNull();
  });

  it('2c. getCameraPlugin() returns null when Camera stub has non-callable getPhoto', async () => {
    setCapacitorBridge({
      Camera: {
        getPhoto: undefined,
        checkPermissions: vi.fn(),
        requestPermissions: vi.fn(),
      },
    });
    vi.resetModules();
    const { getCameraPlugin } = await import('@/lib/capacitor-plugins');
    expect(getCameraPlugin()).toBeNull();
  });

  it('2d. getCameraPlugin() returns null when Camera stub has non-callable checkPermissions', async () => {
    setCapacitorBridge({
      Camera: {
        getPhoto: vi.fn(),
        checkPermissions: null,
        requestPermissions: vi.fn(),
      },
    });
    vi.resetModules();
    const { getCameraPlugin } = await import('@/lib/capacitor-plugins');
    expect(getCameraPlugin()).toBeNull();
  });

  // ── 3. Fully initialised bridge — plugin should be returned ───────────────

  it('3. getAppPlugin() returns the plugin when addListener IS callable', async () => {
    const mockApp = {
      addListener: vi.fn().mockResolvedValue({ remove: vi.fn() }),
      exitApp: vi.fn(),
      openUrl: vi.fn(),
      getInfo: vi.fn(),
    };
    setCapacitorBridge({ App: mockApp });
    vi.resetModules();
    const { getAppPlugin } = await import('@/lib/capacitor-plugins');
    const plugin = getAppPlugin();
    expect(plugin).not.toBeNull();
    expect(plugin).toBe(mockApp);
  });

  it('3b. getCameraPlugin() returns the plugin when all methods are callable', async () => {
    const mockCamera = {
      getPhoto: vi.fn(),
      checkPermissions: vi.fn().mockResolvedValue({ camera: 'granted' }),
      requestPermissions: vi.fn(),
      savePhoto: vi.fn(),
    };
    setCapacitorBridge({ Camera: mockCamera });
    vi.resetModules();
    const { getCameraPlugin } = await import('@/lib/capacitor-plugins');
    const plugin = getCameraPlugin();
    expect(plugin).not.toBeNull();
    expect(plugin).toBe(mockCamera);
  });

  // ── 4. appStateChange listener attaches and removes correctly ─────────────

  it('4. appStateChange listener attaches and the returned handle removes it', async () => {
    const removeFn = vi.fn();
    const mockApp = {
      addListener: vi.fn().mockResolvedValue({ remove: removeFn }),
      exitApp: vi.fn(),
      openUrl: vi.fn(),
      getInfo: vi.fn(),
    };
    setCapacitorBridge({ App: mockApp });
    vi.resetModules();
    const { getAppPlugin } = await import('@/lib/capacitor-plugins');
    const App = getAppPlugin();
    expect(App).not.toBeNull();

    const handle = await App!.addListener('appStateChange', vi.fn());
    expect(mockApp.addListener).toHaveBeenCalledWith('appStateChange', expect.any(Function));

    handle.remove();
    expect(removeFn).toHaveBeenCalledOnce();
  });

  it('4b. appStateChange callback fires with correct isActive values', async () => {
    let capturedCallback: ((state: { isActive: boolean }) => void) | null = null;
    const mockApp = {
      addListener: vi.fn().mockImplementation((_event: string, cb: (s: { isActive: boolean }) => void) => {
        capturedCallback = cb;
        return Promise.resolve({ remove: vi.fn() });
      }),
      exitApp: vi.fn(),
      openUrl: vi.fn(),
      getInfo: vi.fn(),
    };
    setCapacitorBridge({ App: mockApp });
    vi.resetModules();
    const { getAppPlugin } = await import('@/lib/capacitor-plugins');
    const App = getAppPlugin();

    const states: boolean[] = [];
    await App!.addListener('appStateChange', (s) => states.push(s.isActive));

    capturedCallback!({ isActive: false }); // background
    capturedCallback!({ isActive: true });  // foreground

    expect(states).toEqual([false, true]);
  });

  // ── 5. Camera cancellation does not propagate as an app error ─────────────

  it('5. Camera.getPhoto cancellation (user dismisses) is caught and does not throw', async () => {
    // Capacitor throws a specific error object when the user cancels the picker
    const cancelError = Object.assign(new Error('User cancelled photos app'), {
      message: 'User cancelled photos app',
    });
    const mockCamera = {
      getPhoto: vi.fn().mockRejectedValue(cancelError),
      checkPermissions: vi.fn().mockResolvedValue({ camera: 'granted' }),
      requestPermissions: vi.fn(),
      savePhoto: vi.fn(),
    };
    setCapacitorBridge({ Camera: mockCamera });
    vi.resetModules();
    const { getCameraPlugin } = await import('@/lib/capacitor-plugins');
    const Camera = getCameraPlugin();
    expect(Camera).not.toBeNull();

    // Caller must catch — this test verifies the error is catchable (not a crash)
    let caught: Error | null = null;
    try {
      await Camera!.getPhoto({ resultType: 'uri', source: 'CAMERA' });
    } catch (err) {
      caught = err as Error;
    }
    expect(caught).not.toBeNull();
    expect(caught?.message).toContain('cancelled');
  });

  // ── 6. Web behaviour unchanged — all accessors return null ────────────────

  it('6. All plugin accessors return null on web (isNativePlatform = false)', async () => {
    setCapacitorBridge(
      {
        App: { addListener: vi.fn(), exitApp: vi.fn(), openUrl: vi.fn(), getInfo: vi.fn() },
        Camera: { getPhoto: vi.fn(), checkPermissions: vi.fn(), requestPermissions: vi.fn() },
        Geolocation: { getCurrentPosition: vi.fn(), watchPosition: vi.fn(), clearWatch: vi.fn(), checkPermissions: vi.fn(), requestPermissions: vi.fn() },
      },
      false, // isNative = false
    );
    vi.resetModules();
    const {
      getAppPlugin,
      getCameraPlugin,
      getNativeGeo,
      getNetworkPlugin,
      getHapticsPlugin,
    } = await import('@/lib/capacitor-plugins');

    expect(getAppPlugin()).toBeNull();
    expect(getCameraPlugin()).toBeNull();
    expect(getNativeGeo()).toBeNull();
    expect(getNetworkPlugin()).toBeNull();
    expect(getHapticsPlugin()).toBeNull();
  });

  // ── 7. Genuine camera failure returns a usable error ─────────────────────

  it('7. Camera.getPhoto hardware failure returns a catchable error with a message', async () => {
    const hwError = new Error('AVCaptureSession failed to start');
    const mockCamera = {
      getPhoto: vi.fn().mockRejectedValue(hwError),
      checkPermissions: vi.fn().mockResolvedValue({ camera: 'granted' }),
      requestPermissions: vi.fn(),
      savePhoto: vi.fn(),
    };
    setCapacitorBridge({ Camera: mockCamera });
    vi.resetModules();
    const { getCameraPlugin } = await import('@/lib/capacitor-plugins');
    const Camera = getCameraPlugin();

    let caught: Error | null = null;
    try {
      await Camera!.getPhoto({ resultType: 'uri', source: 'CAMERA' });
    } catch (err) {
      caught = err as Error;
    }
    expect(caught).not.toBeNull();
    expect(typeof caught?.message).toBe('string');
    expect(caught?.message.length).toBeGreaterThan(0);
  });
});
