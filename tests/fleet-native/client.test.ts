import { beforeEach, afterEach, it, expect, vi } from "vitest";
import "fake-indexeddb/auto";
import { IDBFactory } from "fake-indexeddb";
import {
  startLogbookDrive,
  stopLogbookDrive,
  retryDriveStops,
  DRIVE_STOPPED,
  restoreCapture,
} from "@/lib/fleet-drive-logbook";
import {
  loadActiveTrip,
  completeTrip,
  getPendingTrips,
  syncPendingTrips,
} from "@/lib/tripLogbookStore";
let user = "driver";
let requestId = "";
let failStart = false;
let offline = false;
let stopTime = "";
let saveFailure = false;
const owner = { user: { id: "driver" }, profile: { companyId: 1 } };
const started = "2026-11-14T00:00:00.000Z";
const capture = () => ({
  company_id: 1,
  user_id: "driver",
  vehicle_id: 7,
  session_id: 42,
  client_trip_id: requestId,
  odometer_start: "1000",
  start_at: started,
  end_at: stopTime || null,
  period_id: 3,
});
beforeEach(() => {
  globalThis.indexedDB = new IDBFactory();
  localStorage.clear();
  user = "driver";
  requestId = "";
  failStart = false;
  offline = false;
  stopTime = "";
  saveFailure = false;
  vi.spyOn(navigator, "onLine", "get").mockImplementation(() => !offline);
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input, init) => {
      const url = String(input),
        body = init?.body ? JSON.parse(String(init.body)) : {};
      if (offline) throw Error("Offline");
      const reply = (data: unknown, status = 200) =>
        ({ ok: status < 400, status, json: async () => data }) as Response;
      if (url === "/api/me") return reply({ ...owner, user: { id: user } });
      if (url === "/api/fleet/driver-sessions") {
        requestId = body.clientTripId;
        if (failStart) throw Error("Response lost");
        return reply({
          session: {
            id: 42,
            fleet_asset_id: 7,
            client_trip_id: requestId,
            odometer_start: "1000",
            start_at: started,
            period_id: 3,
            status: "active",
          },
        });
      }
      if (url.endsWith("/stop")) {
        stopTime = stopTime || body.stoppedAt;
        return reply({
          ok: true,
          fleetAssetId: 7,
          endedAt: stopTime,
          logbook: capture(),
        });
      }
      if (url.endsWith("/trip-logs"))
        return saveFailure
          ? reply({ error: "Try later" }, 500)
          : reply({ trip: { id: 9 } });
      throw Error("Unexpected URL " + url);
    }),
  );
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
it("lost start response retains a stable request ID across retry", async () => {
  failStart = true;
  await expect(startLogbookDrive(7, "1000")).rejects.toThrow("Response lost");
  const first = requestId;
  failStart = false;
  await startLogbookDrive(7, "1000");
  expect(requestId).toBe(first);
  expect((await loadActiveTrip(1, "driver", 7))?.driverSessionId).toBe(42);
});
it('concurrent Start calls reuse one server request and capture', async () => {
  const [a, b] = await Promise.all([startLogbookDrive(7, '1000'), startLogbookDrive(7, '1000')]);
  expect(a.id).toBe(b.id);
  expect(vi.mocked(fetch).mock.calls.filter(([url]) => url === '/api/fleet/driver-sessions')).toHaveLength(1);
});
it('timed-out session creation keeps its ID for retry', async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  const original = vi.mocked(fetch).getMockImplementation()!;
  let sentId = '';
  vi.mocked(fetch).mockImplementation(async (input, init) => {
    if (input === '/api/fleet/driver-sessions') {
      sentId = JSON.parse(String(init?.body)).clientTripId;
      return new Promise((_resolve, reject) => init?.signal?.addEventListener('abort', () => reject(new DOMException('Timed out', 'AbortError'))));
    }
    return original(input, init);
  });
  const attempt = startLogbookDrive(7, '1000').catch(e => e);
  await vi.waitFor(() => expect(sentId).not.toBe(''));
  await vi.advanceTimersByTimeAsync(15001);
  expect((await attempt).name).toBe('AbortError');
  vi.mocked(fetch).mockImplementation(original);
  vi.useRealTimers();
  await startLogbookDrive(7, '1000');
  expect(requestId).toBe(sentId);
});
it('Stop under another account cannot upload the original driver capture', async () => {
  await startLogbookDrive(7, '1000'); user = 'other';
  await expect(stopLogbookDrive(42)).rejects.toThrow('original account');
  expect(vi.mocked(fetch).mock.calls.filter(([url]) => String(url).endsWith('/stop'))).toHaveLength(0);
  const retained = JSON.parse(localStorage.getItem('iwb:stop:42')!);
  expect(retained.userId).toBe('driver');
  user = 'driver'; await retryDriveStops();
  expect(stopTime).toBe(retained.stoppedAt);
});
it('validation rejection allows a corrected reading, while ambiguous failure retains the request', async () => {
  const original = vi.mocked(fetch).getMockImplementation()!;
  vi.mocked(fetch).mockImplementation(async (input, init) => {
    if (input === '/api/fleet/driver-sessions') return { ok: false, status: 400, json: async () => ({ error: 'Odometer required' }) } as Response;
    return original(input, init);
  });
  await expect(startLogbookDrive(7, null)).rejects.toThrow('Odometer required');
  vi.mocked(fetch).mockImplementation(original);
  await expect(startLogbookDrive(7, '1000')).resolves.toMatchObject({ id: 42 });
});
it("Stop signals GPS before an identity request completes and retains the click time", async () => {
  await startLogbookDrive(7, "1000");
  const stopped = vi.fn();
  window.addEventListener(DRIVE_STOPPED, stopped);
  let resolve!: (value: Response) => void;
  vi.mocked(fetch).mockImplementationOnce(
    () =>
      new Promise((r) => {
        resolve = r;
      }),
  );
  const clicked = Date.now();
  const result = stopLogbookDrive(42);
  expect(stopped).toHaveBeenCalledTimes(1);
  resolve({ ok: true, json: async () => owner } as Response);
  await result;
  expect(new Date(stopTime).getTime()).toBeGreaterThanOrEqual(
    Math.floor(clicked / 1000) * 1000,
  );
  expect(new Date(stopTime).getTime()).toBeLessThanOrEqual(clicked + 1000);
  window.removeEventListener(DRIVE_STOPPED, stopped);
});
it("offline Stop immediately stops local tracking and keeps the original end time for reconnection", async () => {
  await startLogbookDrive(7, "1000");
  const stopped = vi.fn();
  window.addEventListener(DRIVE_STOPPED, stopped);
  offline = true;
  const result = await stopLogbookDrive(42);
  expect(stopped).toHaveBeenCalled();
  expect(result.logbookRequired).toBe(true);
  const pendingEnd = (await loadActiveTrip(1, "driver", 7))?.endDatetime;
  expect(pendingEnd).toBeTruthy();
  expect(localStorage.getItem("iwb:stop:42")).toBeTruthy();
  offline = false;
  await retryDriveStops();
  expect(stopTime).toBe(pendingEnd);
  expect(localStorage.getItem("iwb:stop:42")).toBeNull();
  window.removeEventListener(DRIVE_STOPPED, stopped);
});
it("recovery does not resurrect an active trip already queued for completion", async () => {
  await startLogbookDrive(7, "1000");
  await stopLogbookDrive(42);
  const active = (await loadActiveTrip(1, "driver", 7))!;
  await completeTrip(active, {
    vehicleId: 7,
    startDatetime: active.startDatetime,
    endDatetime: active.endDatetime!,
    startLat: null,
    startLng: null,
    endLat: null,
    endLng: null,
    odometerStart: "1000",
    odometerEnd: "1100",
    km: "100.0",
    businessOrPrivate: "private",
    purpose: "Private",
    reason: null,
    destination: null,
    prestartAtHome: false,
  });
  await restoreCapture(capture());
  expect(await loadActiveTrip(1, "driver", 7)).toBeNull();
  expect(await getPendingTrips(1, "driver", 7)).toHaveLength(1);
});
it("failed completion sync retains data and account switch cannot upload it", async () => {
  await startLogbookDrive(7, "1000");
  await stopLogbookDrive(42);
  const active = (await loadActiveTrip(1, "driver", 7))!;
  await completeTrip(active, {
    vehicleId: 7,
    startDatetime: active.startDatetime,
    endDatetime: active.endDatetime!,
    startLat: null,
    startLng: null,
    endLat: null,
    endLng: null,
    odometerStart: "1000",
    odometerEnd: "1100",
    km: "100.0",
    businessOrPrivate: "business",
    purpose: "Site travel",
    reason: null,
    destination: "Client site inspection",
    prestartAtHome: false,
  });
  saveFailure = true;
  expect(await syncPendingTrips(1, "driver", 7)).toBe(0);
  expect((await getPendingTrips(1, "driver", 7))[0].destination).toBe(
    "Client site inspection",
  );
  vi.mocked(fetch).mockClear();
  user = "other-driver";
  expect(await syncPendingTrips(1, "driver", 7)).toBe(0);
  expect(
    vi
      .mocked(fetch)
      .mock.calls.filter(([url]) => String(url).endsWith("/trip-logs")),
  ).toHaveLength(0);
  user = "driver";
  saveFailure = false;
  expect(await syncPendingTrips(1, "driver", 7)).toBe(1);
});
