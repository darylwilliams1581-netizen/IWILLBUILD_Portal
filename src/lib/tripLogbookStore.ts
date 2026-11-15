/**
 * Offline-first trip logbook store using IndexedDB.
 *
 * SECURITY / ISOLATION
 * ────────────────────
 * All active trips and pending trips are scoped by a composite owner key:
 *   `${companyId}:${userId}:${vehicleId}`
 *
 * This prevents legacy ownerless records from being assigned to whoever next
 * signs in. On open, any records without a valid owner key are quarantined in
 * a separate store and never uploaded automatically.
 *
 * IDEMPOTENCY
 * ───────────
 * A stable clientTripId (UUID) is generated at trip-start time and persisted
 * with the active trip. The same ID is sent on every POST attempt (immediate
 * save + retries). The server enforces a UNIQUE constraint on
 * (vehicle_id, client_trip_id) and returns the existing row on duplicate.
 *
 * ATOMICITY
 * ─────────
 * Completing a trip (queue + clear active) is done in a single IndexedDB
 * transaction across both object stores. A crash between the two operations
 * cannot lose or duplicate a trip.
 *
 * SYNC GUARD
 * ──────────
 * syncPendingTrips() is guarded by a per-vehicle in-memory lock so overlapping
 * calls (e.g. mount + online event) do not race.
 *
 * DB VERSION HISTORY
 * ──────────────────
 * v1 — original: pending_trips (keyPath: localId), active_trip (keyPath: vehicleId)
 *      active_trip keyed by vehicleId — single driver per vehicle, no owner scoping.
 * v2 — BREAKING: active_trip store recreated with keyPath: ownerKey.
 *      All v1 active_trip records are quarantined (no ownerKey → cannot be attributed).
 *      pending_trips: ownerKey index added; ownerless records quarantined on read.
 *      quarantine store added.
 *
 * VERSIONCHANGE / CONNECTION MANAGEMENT
 * ──────────────────────────────────────
 * On versionchange (another tab opening a newer DB version), the connection is
 * closed immediately so the upgrade is not blocked. Callers must re-open after.
 * Connections are closed after each public API call to avoid blocking future upgrades.
 */

// ── Types ─────────────────────────────────────────────────────────────────────

export interface LocalGpsPoint {
  lat: number;
  lng: number;
  capturedAt: string; // ISO string (serialisable)
}

/** A trip that is currently in progress (Start pressed, End not yet). */
export interface InProgressTrip {
  assetName?: string;
  /** Composite key: `${companyId}:${userId}:${vehicleId}` */
  ownerKey: string;
  driverSessionId?: number;
  periodId?: number;
  legacyRecovery?: boolean;
  vehicleId: number;
  companyId: number;
  userId: string;
  endDatetime?: string;
  startPoint: LocalGpsPoint | null; // null = started without GPS
  startDatetime: string;            // ISO — captured independently of GPS
  odometerStart: string | null;     // odometer reading at trip start
  clientTripId: string;             // stable UUID for idempotent POST
}

/** A completed trip waiting to be synced (or already synced). */
export interface PendingTrip {
  localId: string;           // uuid-style local key
  /** Composite key: `${companyId}:${userId}:${vehicleId}` */
  ownerKey: string;
  driverSessionId?: number;
  periodId?: number;
  legacyRecovery?: boolean;
  vehicleId: number;
  companyId: number;
  userId: string;
  startDatetime: string;
  endDatetime: string;
  startLat: string | null;
  startLng: string | null;
  endLat: string | null;
  endLng: string | null;
  km: string;
  odometerStart: string | null;
  odometerEnd: string | null;
  clientTripId: string;      // stable UUID — same as the one in InProgressTrip
  purpose: string;
  reason: string | null;
  /** ATO-required: free-text destination / journey description for business trips. */
  destination?: string | null;
  businessOrPrivate: 'business' | 'private';
  prestartAtHome: boolean;
  syncStatus: 'pending' | 'synced' | 'error';
  serverId?: number;         // set after successful sync
  errorMsg?: string;
}

/** A legacy record that had no ownerKey — quarantined, never auto-uploaded. */
export interface QuarantinedRecord {
  quarantineId: string;
  detectedAt: string;
  rawData: unknown;
}

// ── DB bootstrap ──────────────────────────────────────────────────────────────

const DB_NAME    = 'iwb_fleet_logbook';
const DB_VERSION = 2;

const STORE_PENDING     = 'pending_trips';
const STORE_ACTIVE      = 'active_trip';
const STORE_QUARANTINE  = 'quarantine';

/**
 * Open the IndexedDB, running the versioned upgrade if needed.
 *
 * v1 → v2 migration:
 *   - active_trip store is DELETED and RECREATED with keyPath: 'ownerKey'.
 *     All existing v1 records (keyed by vehicleId) are quarantined first because
 *     they have no ownerKey and cannot be attributed to a specific user.
 *   - pending_trips: ownerKey index added.
 *   - quarantine store created.
 *
 * Connection is registered for versionchange so it closes itself when another
 * tab opens a newer version, preventing upgrade blocks.
 */
function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);

    req.onupgradeneeded = (event) => {
      const db = req.result;
      const oldVersion = event.oldVersion;
      const tx = (event.target as IDBOpenDBRequest).transaction!;

      if (oldVersion < 1) {
        // ── Fresh install ──────────────────────────────────────────────────────
        const pendingStore = db.createObjectStore(STORE_PENDING, { keyPath: 'localId' });
        pendingStore.createIndex('byOwnerKey', 'ownerKey', { unique: false });
        const activeStore = db.createObjectStore(STORE_ACTIVE, { keyPath: 'ownerKey' });
        activeStore.createIndex('byVehicle', 'vehicleId', { unique: false });
        db.createObjectStore(STORE_QUARANTINE, { keyPath: 'quarantineId' });

      } else if (oldVersion < 2) {
        // ── v1 → v2 ───────────────────────────────────────────────────────────
        // Step 1: quarantine all existing active_trip records (keyed by vehicleId,
        //         no ownerKey — cannot be attributed to a specific user).
        if (db.objectStoreNames.contains(STORE_ACTIVE)) {
          const activeStore = tx.objectStore(STORE_ACTIVE);
          const getAllReq = activeStore.getAll();
          getAllReq.onsuccess = () => {
            const legacyRecords = getAllReq.result as unknown[];
            if (legacyRecords.length > 0) {
              // Create quarantine store first (may not exist yet)
              let quarantineStore: IDBObjectStore;
              if (!db.objectStoreNames.contains(STORE_QUARANTINE)) {
                quarantineStore = db.createObjectStore(STORE_QUARANTINE, { keyPath: 'quarantineId' });
              } else {
                quarantineStore = tx.objectStore(STORE_QUARANTINE);
              }
              for (const record of legacyRecords) {
                quarantineStore.put({
                  quarantineId: generateUuid(),
                  detectedAt: new Date().toISOString(),
                  rawData: record,
                });
              }
            }
          };
          // Step 2: delete the old vehicleId-keyed store
          db.deleteObjectStore(STORE_ACTIVE);
        }

        // Step 3: create the new ownerKey-keyed active_trip store
        const newActiveStore = db.createObjectStore(STORE_ACTIVE, { keyPath: 'ownerKey' });
        newActiveStore.createIndex('byVehicle', 'vehicleId', { unique: false });

        // Step 4: add ownerKey index to pending_trips
        if (db.objectStoreNames.contains(STORE_PENDING)) {
          const pendingStore = tx.objectStore(STORE_PENDING);
          if (!pendingStore.indexNames.contains('byOwnerKey')) {
            pendingStore.createIndex('byOwnerKey', 'ownerKey', { unique: false });
          }
        }

        // Step 5: create quarantine store if not already created above
        if (!db.objectStoreNames.contains(STORE_QUARANTINE)) {
          db.createObjectStore(STORE_QUARANTINE, { keyPath: 'quarantineId' });
        }
      }
    };

    req.onsuccess = () => {
      const db = req.result;
      // Close connection when another tab opens a newer version — prevents blocking upgrades
      db.onversionchange = () => {
        db.close();
      };
      resolve(db);
    };
    req.onerror   = () => reject(req.error);
    req.onblocked = () => reject(new Error('IndexedDB upgrade blocked — close other tabs and retry'));
  });
}

// ── Low-level IDB helpers ─────────────────────────────────────────────────────

function idbGet<T>(db: IDBDatabase, store: string, key: IDBValidKey): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(store, 'readonly');
    const req = tx.objectStore(store).get(key);
    req.onsuccess = () => resolve(req.result as T | undefined);
    req.onerror   = () => reject(req.error);
    tx.onabort    = () => reject(tx.error ?? new Error('IDB transaction aborted'));
  });
}

function idbPut(db: IDBDatabase, store: string, value: unknown): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(store, 'readwrite');
    const req = tx.objectStore(store).put(value);
    // Resolve only after the transaction commits, not just after the request succeeds
    tx.oncomplete = () => resolve();
    req.onerror   = () => reject(req.error);
    tx.onabort    = () => reject(tx.error ?? new Error('IDB transaction aborted'));
  });
}

function idbDelete(db: IDBDatabase, store: string, key: IDBValidKey): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(store, 'readwrite');
    const req = tx.objectStore(store).delete(key);
    tx.oncomplete = () => resolve();
    req.onerror   = () => reject(req.error);
    tx.onabort    = () => reject(tx.error ?? new Error('IDB transaction aborted'));
  });
}

function idbGetAll<T>(db: IDBDatabase, store: string): Promise<T[]> {
  return new Promise((resolve, reject) => {
    const tx  = db.transaction(store, 'readonly');
    const req = tx.objectStore(store).getAll();
    req.onsuccess = () => resolve(req.result as T[]);
    req.onerror   = () => reject(req.error);
    tx.onabort    = () => reject(tx.error ?? new Error('IDB transaction aborted'));
  });
}

// ── Owner key ─────────────────────────────────────────────────────────────────

export function makeOwnerKey(companyId: number, userId: string, vehicleId: number): string {
  return `${companyId}:${userId}:${vehicleId}`;
}

// ── UUID helper ───────────────────────────────────────────────────────────────

export function generateUuid(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback for environments without crypto.randomUUID
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

function localId(): string {
  return generateUuid();
}

// ── Quarantine helpers ────────────────────────────────────────────────────────

/**
 * Move a legacy record (no ownerKey) to the quarantine store.
 * These records are never auto-uploaded. The UI can surface them for manual review.
 * Uses a deterministic quarantineId based on content hash to avoid duplicate entries
 * on repeated reads.
 */
async function quarantineRecord(db: IDBDatabase, rawData: unknown): Promise<void> {
  // Use a content-based key to avoid creating duplicate quarantine entries
  // when getPendingTrips is called multiple times before the record is deleted.
  const contentKey = JSON.stringify(rawData).slice(0, 200);
  const quarantineId = 'q_' + btoa(contentKey).replace(/[^a-zA-Z0-9]/g, '').slice(0, 40);

  // Only write if not already quarantined
  const existing = await idbGet<QuarantinedRecord>(db, STORE_QUARANTINE, quarantineId);
  if (!existing) {
    const record: QuarantinedRecord = {
      quarantineId,
      detectedAt: new Date().toISOString(),
      rawData,
    };
    await idbPut(db, STORE_QUARANTINE, record);
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Save the start point for a vehicle so it survives a page reload.
 * Scoped by companyId + userId + vehicleId.
 *
 * If an active trip already exists for this owner (e.g. recovery after page reload),
 * the existing clientTripId is PRESERVED — a new UUID is only generated on first save.
 * This prevents double-click / concurrent calls from creating two pending IDs for the
 * same active trip.
 */
export async function saveActiveTrip(trip: Omit<InProgressTrip, 'clientTripId'>): Promise<string> {
  const db = await openDb();
  try {
    // Preserve existing clientTripId if a record already exists for this owner
    const existing = await idbGet<InProgressTrip>(db, STORE_ACTIVE, trip.ownerKey);
    const clientTripId = existing?.clientTripId ?? generateUuid();
    const record: InProgressTrip = { ...trip, clientTripId };
    await idbPut(db, STORE_ACTIVE, record);
    return clientTripId;
  } finally {
    db.close();
  }
}

/** Restore an authoritative server capture without changing its identity. */
export async function putActiveTrip(trip: InProgressTrip): Promise<void> {
  const db=await openDb();try { await idbPut(db,STORE_ACTIVE,trip); } finally {db.close();}
}
/** Explicit repair of an unsynced historical record; never edits a saved server record. */
export async function repairPendingTrip(ownerKey:string,localId:string,changes:Partial<PendingTrip>):Promise<void>{
 const db=await openDb();try{
  const item=await idbGet<PendingTrip>(db,STORE_PENDING,localId);
  if(!item||item.ownerKey!==ownerKey||item.syncStatus==='synced')throw Error('Pending record not available for this driver');
  const {destination,reason,odometerStart,odometerEnd}=changes;
  await idbPut(db,STORE_PENDING,{...item,destination,reason,odometerStart,odometerEnd,
    km:(Number(odometerEnd)-Number(odometerStart)).toFixed(1),legacyRecovery:true,syncStatus:'pending',errorMsg:undefined});
 }finally{db.close();}
}

/** Read only this signed-in driver's records, including offline recovery. */
export async function listOwnerTrips(companyId: number, userId: string) {
  const db = await openDb();
  try {
    const belongs = (t: InProgressTrip | PendingTrip) =>
      t.companyId === companyId && t.userId === userId &&
      t.ownerKey === makeOwnerKey(companyId, userId, t.vehicleId);
    const active = (await idbGetAll<InProgressTrip>(db, STORE_ACTIVE)).filter(belongs);
    const pending = (await idbGetAll<PendingTrip>(db, STORE_PENDING))
      .filter(t => belongs(t) && t.syncStatus !== 'synced');
    return { active, pending };
  } finally { db.close(); }
}

/** Load any in-progress trip for a specific owner (company+user+vehicle). */
export async function loadActiveTrip(
  companyId: number,
  userId: string,
  vehicleId: number,
): Promise<InProgressTrip | null> {
  const db = await openDb();
  try {
    const ownerKey = makeOwnerKey(companyId, userId, vehicleId);
    const row = await idbGet<InProgressTrip>(db, STORE_ACTIVE, ownerKey);

    if (!row) return null;

    // Validate that the record belongs to this owner (defence-in-depth)
    if (row.ownerKey !== ownerKey) {
      console.warn('[tripLogbookStore] loadActiveTrip: ownerKey mismatch — quarantining');
      await quarantineRecord(db, row);
      await idbDelete(db, STORE_ACTIVE, ownerKey);
      return null;
    }

    return row;
  } finally {
    db.close();
  }
}

/**
 * Atomically: queue the completed trip AND clear the active trip in one transaction.
 * This prevents a crash between the two operations from losing or duplicating a trip.
 *
 * IDEMPOTENCY: uses the clientTripId from the active trip record. If completeTrip is
 * called concurrently (e.g. double-tap), the second call will find no active trip and
 * return null — the first call's localId is the canonical one.
 *
 * Returns the localId of the queued trip, or null if the active trip was already cleared.
 */
export async function completeTrip(
  activeTrip: InProgressTrip,
  tripData: Omit<PendingTrip, 'localId' | 'syncStatus' | 'ownerKey' | 'companyId' | 'userId' | 'clientTripId'>,
): Promise<string | null> {
  const db = await openDb();
  try {
    const lid = localId();

    const pending: PendingTrip = {
      ...tripData,
      driverSessionId: activeTrip.driverSessionId,
      periodId: activeTrip.periodId,
      legacyRecovery: activeTrip.legacyRecovery,
      localId: lid,
      ownerKey: activeTrip.ownerKey,
      companyId: activeTrip.companyId,
      userId: activeTrip.userId,
      clientTripId: activeTrip.clientTripId,
      syncStatus: 'pending',
    };

    return await new Promise<string | null>((resolve, reject) => {
      let completed=false;
      const tx = db.transaction([STORE_PENDING, STORE_ACTIVE], 'readwrite');

      tx.oncomplete = () => resolve(completed ? lid : null);
      tx.onabort    = () => reject(tx.error ?? new Error('IDB transaction aborted during completeTrip'));
      tx.onerror    = () => reject(tx.error ?? new Error('IDB transaction error during completeTrip'));

      // Read, queue and clear inside ONE transaction. Concurrent completion sees the deletion.
      const getReq=tx.objectStore(STORE_ACTIVE).get(activeTrip.ownerKey);
      getReq.onerror=()=>tx.abort();
      getReq.onsuccess=()=>{
        const current=getReq.result as InProgressTrip|undefined;
        if(!current||current.clientTripId!==activeTrip.clientTripId)return;
        const putReq=tx.objectStore(STORE_PENDING).put(pending);putReq.onerror=()=>tx.abort();
        const delReq=tx.objectStore(STORE_ACTIVE).delete(activeTrip.ownerKey);delReq.onerror=()=>tx.abort();
        completed=true;
      };
    });
  } finally {
    db.close();
  }
}

/** Clear the in-progress trip for a specific owner (after End Trip). */
export async function clearActiveTrip(
  companyId: number,
  userId: string,
  vehicleId: number,
): Promise<void> {
  const db = await openDb();
  try {
    const ownerKey = makeOwnerKey(companyId, userId, vehicleId);
    await idbDelete(db, STORE_ACTIVE, ownerKey);
  } finally {
    db.close();
  }
}

/** Get all pending (unsynced) trips for a specific owner. */
export async function getPendingTrips(
  companyId: number,
  userId: string,
  vehicleId: number,
): Promise<PendingTrip[]> {
  const db = await openDb();
  try {
    const ownerKey = makeOwnerKey(companyId, userId, vehicleId);
    const all = await idbGetAll<PendingTrip>(db, STORE_PENDING);

    // Quarantine any records that lack an ownerKey (legacy ownerless records).
    // Use deterministic quarantine IDs to avoid duplicate entries on repeated reads.
    const ownerless = all.filter(t => !t.ownerKey);
    for (const record of ownerless) {
      console.warn('[tripLogbookStore] getPendingTrips: ownerless record found — quarantining', record.localId);
      await quarantineRecord(db, record);
      await idbDelete(db, STORE_PENDING, record.localId);
    }

    return all.filter(t => t.ownerKey === ownerKey);
  } finally {
    db.close();
  }
}

/** Mark a local trip as synced and store the server-assigned ID. */
export async function markSynced(localId: string, serverId: number): Promise<void> {
  const db = await openDb();
  try {
    const row = await idbGet<PendingTrip>(db, STORE_PENDING, localId);
    if (row) {
      await idbPut(db, STORE_PENDING, { ...row, syncStatus: 'synced', serverId });
    }
  } finally {
    db.close();
  }
}

/** Mark a local trip as errored with a message. */
export async function markSyncError(localId: string, msg: string): Promise<void> {
  const db = await openDb();
  try {
    const row = await idbGet<PendingTrip>(db, STORE_PENDING, localId);
    if (row) {
      await idbPut(db, STORE_PENDING, { ...row, syncStatus: 'error', errorMsg: msg });
    }
  } finally {
    db.close();
  }
}

// ── Sync lock ─────────────────────────────────────────────────────────────────
// Prevents overlapping sync calls for the same vehicle from racing.
const syncLocks = new Map<string, boolean>();

/**
 * Attempt to sync all pending trips for a specific owner to the server.
 *
 * IDENTITY CHECK: performs a fresh /api/me check before each upload to detect
 * cookie switches between preflight and POST. Fails closed on mismatches —
 * the record stays pending and will retry on the next sync cycle.
 *
 * Returns the number of trips successfully synced.
 * Sends the same clientTripId on every attempt — the server handles idempotency.
 */
async function syncFetch(url: string, init: RequestInit) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15000);
  try { return await fetch(url, { ...init, signal: controller.signal }); }
  finally { clearTimeout(timer); }
}

export async function syncPendingTrips(
  companyId: number,
  userId: string,
  vehicleId: number,
): Promise<number> {
  const lockKey = makeOwnerKey(companyId, userId, vehicleId);
  if (syncLocks.get(lockKey)) return 0; // Already syncing
  syncLocks.set(lockKey, true);

  try {
    const trips = await getPendingTrips(companyId, userId, vehicleId);
    const toSync = trips.filter(
      t => t.syncStatus === 'pending' || t.syncStatus === 'error',
    );

    let synced = 0;
    for (const trip of toSync) {
      try {
        // ── Fresh identity check before each upload ────────────────────────────
        // Detects cookie switches between preflight and POST.
        const meRes = await syncFetch('/api/me', { credentials: 'include' });
        if (!meRes.ok) {
          await markSyncError(trip.localId, 'Identity check failed — not authenticated');
          continue;
        }
        const me = await meRes.json() as { user?: { id: string }; profile?: { companyId: number } };
        if (me?.user?.id !== userId || me?.profile?.companyId !== companyId) {
          await markSyncError(trip.localId, 'Identity mismatch — session changed, skipping upload');
          continue;
        }

        const res = await syncFetch(`/api/fleet/${vehicleId}/trip-logs`, {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            startDatetime:    trip.startDatetime,
            endDatetime:      trip.endDatetime,
            startLat:         trip.startLat,
            startLng:         trip.startLng,
            endLat:           trip.endLat,
            endLng:           trip.endLng,
            km:               trip.km,
            odometerStart:    trip.odometerStart,
            odometerEnd:      trip.odometerEnd,
            clientTripId:     trip.clientTripId,
            driverSessionId: trip.driverSessionId,
            periodId: trip.periodId,
            legacyRecovery: trip.legacyRecovery,
            purpose:          trip.purpose,
            reason:           trip.reason,
            destination:      trip.destination,
            businessOrPrivate: trip.businessOrPrivate,
            prestartAtHome:   trip.prestartAtHome,
            // Canonical immutable fields sent for server-side identity verification
            expectedCompanyId: companyId,
            expectedUserId:    userId,
          }),
        });
        if (res.ok) {
          const data = await res.json() as { trip: { id: number } };
          await markSynced(trip.localId, data.trip.id);
          synced++;
        } else if (res.status === 409) {
          // Conflict: same clientTripId but different body/driver — keep pending, surface error
          const err = await res.json().catch(() => ({ error: `HTTP 409` })) as { error?: string };
          await markSyncError(trip.localId, err.error ?? 'Conflict: trip data mismatch');
        } else {
          const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` })) as { error?: string };
          await markSyncError(trip.localId, err.error ?? `HTTP ${res.status}`);
        }
      } catch {
        await markSyncError(trip.localId, 'Network error');
      }
    }
    return synced;
  } finally {
    syncLocks.set(lockKey, false);
  }
}

/** Count unsynced trips for a specific owner (for the UI badge). */
export async function countPendingTrips(
  companyId: number,
  userId: string,
  vehicleId: number,
): Promise<number> {
  const db = await openDb();
  try {
    const ownerKey = makeOwnerKey(companyId, userId, vehicleId);
    const all = await idbGetAll<PendingTrip>(db, STORE_PENDING);
    return all.filter(
      t => t.ownerKey === ownerKey && (t.syncStatus === 'pending' || t.syncStatus === 'error'),
    ).length;
  } finally {
    db.close();
  }
}

/** Check whether any quarantined (ownerless legacy) records exist. */
export async function hasQuarantinedRecords(): Promise<boolean> {
  const db = await openDb();
  try {
    const all = await idbGetAll<QuarantinedRecord>(db, STORE_QUARANTINE);
    return all.length > 0;
  } finally {
    db.close();
  }
}

/** Get all quarantined records for display in a recovery notice. */
export async function getQuarantinedRecords(): Promise<QuarantinedRecord[]> {
  const db = await openDb();
  try {
    return await idbGetAll<QuarantinedRecord>(db, STORE_QUARANTINE);
  } finally {
    db.close();
  }
}

// ── Last-purpose memory (scoped by owner) ─────────────────────────────────────

export function getLastPurposeKey(companyId: number, userId: string, vehicleId: number): string {
  return `iwb_trip_purpose_${companyId}_${userId}_${vehicleId}`;
}
