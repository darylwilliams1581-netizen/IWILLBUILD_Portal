import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import { render, cleanup, waitFor, act, screen, fireEvent } from '@testing-library/react';
import { DriverSessionProvider, useDriverSessionContext } from '@/lib/DriverSessionContext';
import { stopDrivingWithLogbook } from '@/lib/end-drive-logbook';
import { useSessionTelemetry } from '@/lib/useSessionTelemetry';
import 'fake-indexeddb/auto';
import { IDBFactory } from 'fake-indexeddb';
const native = vi.hoisted(() => ({
  watch: vi.fn(), clear: vi.fn(), get: vi.fn(), foreground: undefined as ((s: { isActive: boolean }) => void) | undefined,
}));
vi.mock('@/lib/capacitor-plugins', () => ({
  isNative: () => true,
  getNativeGeo: async () => ({ watchPosition: native.watch, clearWatch: native.clear, getCurrentPosition: native.get }),
  getAppPlugin: () => ({ addListener: (_: string, fn: any) => { native.foreground = fn; return { remove: () => {} }; } }),
}));
let id = 100;
let delayStop: Promise<Response> | null = null;
let currentSession: object | null;
const reply = (data: unknown) => ({ ok: true, status: 200, json: async () => data }) as Response;
let context: ReturnType<typeof useDriverSessionContext>;
function Probe() {
  context = useDriverSessionContext();
  return <><button onClick={() => void context.stopSession(id)}>Stop</button><output>{context.session?.id ?? 'none'}</output></>;
}
beforeEach(() => {
  id++; vi.clearAllMocks(); localStorage.clear(); globalThis.indexedDB = new IDBFactory(); delayStop = null;
  currentSession = { id, status: 'active', fleet_asset_id: 7, start_at: '2026-11-15T00:00:00Z', asset_name: 'Hilux' };
  native.watch.mockResolvedValue('native-watch'); native.clear.mockResolvedValue(undefined);
  native.get.mockResolvedValue({ coords: { latitude: -19, longitude: 146 } });
  localStorage.setItem(`iwb:drive:${id}`, JSON.stringify({ companyId: 1, userId: 'driver', vehicleId: 7, startKey: 'start' }));
  vi.stubGlobal('fetch', vi.fn(async (url) => {
    if (url === '/api/me') return reply({ user: { id: 'driver' }, profile: { companyId: 1 } });
    if (url === '/api/fleet/driver-sessions/active') return reply({ session: currentSession });
    if (String(url).endsWith('/stop')) return delayStop || reply({ fleetAssetId: 7, endedAt: '2026-11-15T01:00:00Z', logbook: null, ownedByCurrentDriver: true });
    return reply({ stored: 0 });
  }));
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it('native GPS clears immediately while server Stop is still pending; foreground cannot restart it', async () => {
  let resolve!: (r: Response) => void; delayStop = new Promise(r => { resolve = r; });
  render(<DriverSessionProvider><Probe /></DriverSessionProvider>);
  await waitFor(() => expect(native.watch).toHaveBeenCalledTimes(1));
  fireEvent.click(screen.getByRole('button', { name: 'Stop' }));
  expect(native.clear).toHaveBeenCalledWith({ id: 'native-watch' });
  expect(screen.getByRole('status').textContent).toBe(String(id));
  await act(async () => native.foreground?.({ isActive: true }));
  expect(native.watch).toHaveBeenCalledTimes(1);
  await act(async () => resolve(reply({ fleetAssetId: 7, endedAt: '2026-11-15T01:00:00Z', logbook: null, ownedByCurrentDriver: true })));
  await waitFor(() => expect(screen.getByRole('status').textContent).toBe('none'));
});
it('watch ID arriving after Stop is cleared and a stale GPS callback cannot upload', async () => {
  let resolveWatch!: (id: string) => void; native.watch.mockReturnValue(new Promise(r => { resolveWatch = r; }));
  render(<DriverSessionProvider><Probe /></DriverSessionProvider>);
  await waitFor(() => expect(native.watch).toHaveBeenCalledTimes(1));
  await act(async () => { await stopDrivingWithLogbook(id); });
  await act(async () => resolveWatch('late-watch'));
  expect(native.clear).toHaveBeenCalledWith({ id: 'late-watch' });
  const before = vi.mocked(fetch).mock.calls.filter(([url]) => String(url).endsWith('/telemetry')).length;
  await act(async () => native.watch.mock.calls[0][1]({ coords: { latitude: -19, longitude: 146 } }, null));
  expect(vi.mocked(fetch).mock.calls.filter(([url]) => String(url).endsWith('/telemetry'))).toHaveLength(before);
});
it('restart with a pending Stop never starts GPS even if server still reports active', async () => {
  localStorage.setItem(`iwb:stop:${id}`, JSON.stringify({ companyId: 1, userId: 'driver', sessionId: id, stoppedAt: '2026-11-15T01:00:00Z' }));
  render(<DriverSessionProvider><Probe /></DriverSessionProvider>);
  await waitFor(() => expect(screen.getByRole('status').textContent).toBe(String(id)));
  expect(native.watch).not.toHaveBeenCalled(); expect(native.get).not.toHaveBeenCalled();
});
it('administrator stop discovered by polling shuts down the native watcher', async () => {
  render(<DriverSessionProvider><Probe /></DriverSessionProvider>);
  await waitFor(() => expect(native.watch).toHaveBeenCalledTimes(1));
  currentSession = null;
  await act(async () => context.refresh());
  expect(native.clear).toHaveBeenCalledWith({ id: 'native-watch' });
});
it('badge web telemetry watcher also shuts down at Stop and rejects late fixes', async () => {
  const watch = vi.fn().mockReturnValue(99), clear = vi.fn();
  vi.stubGlobal('navigator', { onLine: true, geolocation: { watchPosition: watch, clearWatch: clear } });
  function Telemetry() { useSessionTelemetry(id, { track_speed: true } as any); return null; }
  render(<Telemetry />); expect(watch).toHaveBeenCalledTimes(1);
  await act(async () => { await stopDrivingWithLogbook(id); });
  expect(clear).toHaveBeenCalledWith(99);
  await act(async () => watch.mock.calls[0][0]({ timestamp: Date.now(), coords: { latitude: -19, longitude: 146 } }));
  expect(vi.mocked(fetch).mock.calls.filter(([url]) => String(url).endsWith('/telemetry'))).toHaveLength(0);
});
