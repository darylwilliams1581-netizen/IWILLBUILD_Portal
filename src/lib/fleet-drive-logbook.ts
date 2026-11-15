import {
  generateUuid,
  makeOwnerKey,
  getPendingTrips,
  loadActiveTrip,
  putActiveTrip,
  type InProgressTrip,
} from "./tripLogbookStore";
export const DRIVE_STOPPED = "iwb:drive-stop-requested";
export type Owner = { companyId: number; userId: string };
export type Capture = {
  company_id: number;
  user_id: string;
  vehicle_id: number;
  session_id: number;
  client_trip_id: string;
  odometer_start: string;
  start_at: string;
  end_at: string | null;
  period_id: number;
  asset_name?: string;
};
async function driveFetch(url: string, init: RequestInit = {}) {
  const controller = new AbortController(),
    timer = setTimeout(() => controller.abort(), 15000);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}
export async function driveOwner(): Promise<Owner> {
  const r = await driveFetch("/api/me", { credentials: "include" });
  if (!r.ok) throw Error("Please sign in again");
  const me = await r.json();
  const companyId = me.profile?.companyId,
    userId = me.user?.id;
  if (!companyId || !userId) throw Error("Driver account unavailable");
  return { companyId, userId };
}
async function json(r: Response) {
  const d = await r.json();
  if (!r.ok) throw Error(d.error || "Drive request failed");
  return d;
}
function store(key: string, value: unknown) {
  localStorage.setItem(key, JSON.stringify(value));
}
function read<T>(key: string): T | null {
  try {
    return JSON.parse(localStorage.getItem(key) || "null");
  } catch {
    return null;
  }
}
export async function restoreCapture(c: Capture): Promise<InProgressTrip> {
  const ownerKey = makeOwnerKey(c.company_id, c.user_id, c.vehicle_id);
  store(`iwb:drive:${c.session_id}`, {
    companyId: c.company_id,
    userId: c.user_id,
    vehicleId: c.vehicle_id,
    startKey: `iwb:start:${ownerKey}`,
  });
  const current = await loadActiveTrip(c.company_id, c.user_id, c.vehicle_id);
  if (current && current.clientTripId !== c.client_trip_id)
    throw Error("An older unfinished trip needs recovery before this drive.");
  const trip: InProgressTrip = {
    ...current,
    assetName: c.asset_name ?? current?.assetName,
    ownerKey,
    companyId: c.company_id,
    userId: c.user_id,
    vehicleId: c.vehicle_id,
    clientTripId: c.client_trip_id,
    startDatetime: c.start_at,
    odometerStart: c.odometer_start,
    startPoint: current?.startPoint ?? null,
    driverSessionId: c.session_id,
    periodId: c.period_id,
    endDatetime: c.end_at ?? current?.endDatetime,
  };
  const pending = await getPendingTrips(c.company_id, c.user_id, c.vehicle_id);
  if (!pending.some((p) => p.clientTripId === c.client_trip_id))
    await putActiveTrip(trip);
  return trip;
}
export async function pendingCaptures(): Promise<Capture[]> {
  return (
    await json(
      await driveFetch("/api/fleet/logbook-pending", {
        credentials: "include",
      }),
    )
  ).captures;
}
const starting = new Map<string, { odometer: string | null; promise: ReturnType<typeof createDrive> }>();
export async function startLogbookDrive(
  vehicleId: number,
  odometer: string | null,
) {
  const owner = await driveOwner(),
    key = `iwb:start:${makeOwnerKey(owner.companyId, owner.userId, vehicleId)}`;
  const running = starting.get(key);
  if (running) {
    if (running.odometer !== odometer) throw Error('A start is already in progress with a different odometer.');
    return running.promise;
  }
  const promise = createDrive(owner, key, vehicleId, odometer).finally(() => starting.delete(key));
  starting.set(key, { odometer, promise });
  return promise;
}
async function createDrive(owner: Owner, key: string, vehicleId: number, odometer: string | null) {
  const old = read<{ clientTripId: string; odometerStart: string | null }>(key);
  // Retrying after a lost response uses the original reading and ID.
  if (old && old.odometerStart !== odometer)
    throw Error(
      "A previous start is unconfirmed. Retry with its original odometer " +
        old.odometerStart +
        ".",
    );
  const active = await loadActiveTrip(owner.companyId, owner.userId, vehicleId);
  if (active && active.clientTripId !== old?.clientTripId)
    throw Error(
      "Finish the existing logbook entry before starting another drive.",
    );
  const request = old ?? {
    clientTripId: generateUuid(),
    odometerStart: odometer,
  };
  store(key, request);
  const response = await driveFetch("/api/fleet/driver-sessions", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...request,
        fleetAssetId: vehicleId,
        expectedCompanyId: owner.companyId,
        expectedUserId: owner.userId,
      }),
    });
  // Definitive validation rejection created no session. Allow a corrected reading.
  // Ambiguous failures and conflicts keep the original request for safe retry.
  if (response.status === 400 || response.status === 422) localStorage.removeItem(key);
  const d = await json(response);
  const s = d.session;
  if (s.status !== "active") {
    localStorage.removeItem(key);
    throw Error(
      "The previous drive already stopped. Complete its logbook before starting another.",
    );
  }
  store(`iwb:drive:${s.id}`, { ...owner, vehicleId, startKey: key });
  if (s.client_trip_id)
    await restoreCapture({
      company_id: owner.companyId,
      user_id: owner.userId,
      vehicle_id: vehicleId,
      session_id: s.id,
      client_trip_id: s.client_trip_id,
      odometer_start: s.odometer_start,
      start_at: s.start_at,
      end_at: s.end_at ?? null,
      period_id: s.period_id,
      asset_name: s.asset_name,
    });
  return s;
}
type StopRequest = Owner & {
  sessionId: number;
  stoppedAt: string;
  vehicleId?: number;
};
async function sendStop(request: StopRequest) {
  const owner = await driveOwner();
  if (owner.companyId !== request.companyId || owner.userId !== request.userId)
    throw Error("Return to the original account to finish stopping this drive");
  const d = await json(
    await driveFetch(`/api/fleet/driver-sessions/${request.sessionId}/stop`, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        stoppedAt: request.stoppedAt,
        expectedCompanyId: owner.companyId,
        expectedUserId: owner.userId,
      }),
    }),
  );
  if (d.logbook) await restoreCapture(d.logbook);
  if (!d.logbook && d.ownedByCurrentDriver) {
    const older = await loadActiveTrip(
      owner.companyId,
      owner.userId,
      d.fleetAssetId,
    );
    if (older) {
      await putActiveTrip({
        ...older,
        endDatetime: older.endDatetime ?? d.endedAt,
        legacyRecovery: true,
      });
      d.legacyLocalTrip = true;
    }
  }
  store(`iwb:stopped:${request.sessionId}`, request.stoppedAt);
  localStorage.removeItem(`iwb:stop:${request.sessionId}`);
  const local = read<{ startKey: string }>(`iwb:drive:${request.sessionId}`);
  if (local) localStorage.removeItem(local.startKey);
  return d;
}
const stopping = new Map<
  number,
  Promise<{
    fleetAssetId: number;
    logbookRequired: boolean;
    awaitingOriginalDriver?: boolean;
    summary?: unknown;
  }>
>();
export function stopLogbookDrive(sessionId: number) {
  const running = stopping.get(sessionId);
  if (running) return running;
  const clickedAt = new Date(
    Math.floor(Date.now() / 1000) * 1000,
  ).toISOString();
  stoppedInMemory.add(sessionId);
  // Stop GPS at the click, even while identity/network requests are waiting.
  window.dispatchEvent(
    new CustomEvent(DRIVE_STOPPED, { detail: { sessionId } }),
  );
  const task = (async () => {
    const local = read<Owner & { vehicleId: number }>(`iwb:drive:${sessionId}`);
    const key = `iwb:stop:${sessionId}`;
    // Persist before the network identity check, including while it is hung.
    if (local && !read<StopRequest>(key))
      store(key, { ...local, sessionId, stoppedAt: clickedAt });
    const owner = await driveOwner().catch((e) => {
      if (local) return local;
      throw e;
    });
    if (local && (local.companyId !== owner.companyId || local.userId !== owner.userId))
      throw Error("Return to the original account to finish stopping this drive");
    const request = read<StopRequest>(key) ?? {
      ...owner,
      vehicleId: local?.vehicleId,
      sessionId,
      stoppedAt: clickedAt,
    };
    if (
      request.companyId !== owner.companyId ||
      request.userId !== owner.userId
    )
      throw Error("This pending stop belongs to another account");
    store(key, request);
    if (request.vehicleId) {
      const active = await loadActiveTrip(
        owner.companyId,
        owner.userId,
        request.vehicleId,
      );
      if (active)
        await putActiveTrip({
          ...active,
          endDatetime: active.endDatetime ?? request.stoppedAt,
        });
    }
    try {
      const d = await sendStop(request);
      return {
        fleetAssetId: d.fleetAssetId,
        logbookRequired: !!d.logbook || !!d.legacyLocalTrip,
        awaitingOriginalDriver: d.awaitingOriginalDriver,
        summary: d.summary,
      };
    } catch (e) {
      if (!navigator.onLine && request.vehicleId)
        return {
          fleetAssetId: request.vehicleId,
          logbookRequired: !!(await loadActiveTrip(
            owner.companyId,
            owner.userId,
            request.vehicleId,
          )),
        };
      throw e;
    }
  })().finally(() => stopping.delete(sessionId));
  stopping.set(sessionId, task);
  return task;
}
export async function retryDriveStops() {
  const owner = await driveOwner();
  for (const key of Object.keys(localStorage).filter((k) =>
    k.startsWith("iwb:stop:"),
  )) {
    const r = read<StopRequest>(key);
    if (r && r.companyId === owner.companyId && r.userId === owner.userId)
      await sendStop(r);
  }
}
const stoppedInMemory = new Set<number>();
export function stopRequested(sessionId: number) {
  return stoppedInMemory.has(sessionId) || localStorage.getItem(`iwb:stop:${sessionId}`) !== null
    || localStorage.getItem(`iwb:stopped:${sessionId}`) !== null;
}

