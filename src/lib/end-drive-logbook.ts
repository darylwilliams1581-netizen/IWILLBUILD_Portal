import {
  driveOwner, pendingCaptures, restoreCapture, retryDriveStops, stopLogbookDrive,
  type Owner,
} from './fleet-drive-logbook';
import { completeTrip, listOwnerTrips, syncPendingTrips, type InProgressTrip } from './tripLogbookStore';
import { rememberDestination } from './recent-destinations';

export const LOGBOOK_CHANGED = 'iwb:end-drive-logbook';
export const PURPOSES = ['Site travel', 'Client meeting', 'Materials / equipment pickup', 'Delivery', 'Office / depot', 'Vehicle servicing / repairs', 'Other — specify reason'] as const;
export interface CompletionAnswers {
  tripType: '' | 'business' | 'private';
  purpose: string;
  reason: string;
  destination: string;
  odometerEnd: string;
  prestartAtHome: boolean;
}
export const emptyAnswers: CompletionAnswers = {
  tripType: '', purpose: '', reason: '', destination: '', odometerEnd: '', prestartAtHome: false,
};
export const completionKey = (trip: InProgressTrip) => `iwb:completion:${trip.ownerKey}:${trip.clientTripId}`;
export const notifyLogbook = () => window.dispatchEvent(new Event(LOGBOOK_CHANGED));

/** All existing Stop buttons use this; the form is independent of their lifetime. */
export async function stopDrivingWithLogbook(sessionId: number) {
  try {
    const result = await stopLogbookDrive(sessionId);
    return { ...result, logbookRequested: result.logbookRequired };
  } finally { notifyLogbook(); }
}

/** Offline records remain usable; network recovery never changes their owner. */
export async function recoverDriveLogbook(owner: Owner) {
  let error = '';
  if (navigator.onLine) {
    const current = await driveOwner().catch(e => { error = e instanceof Error ? e.message : 'Connection unavailable'; return null; });
    if (!current) {
      const local = await listOwnerTrips(owner.companyId, owner.userId);
      return { active: local.active.filter(t => !!t.endDatetime), pending: local.pending, error };
    }
    if (current.companyId !== owner.companyId || current.userId !== owner.userId)
      throw Error('Account changed. Reopen the logbook under the original account.');
    try { await retryDriveStops(); } catch (e) { error = String(e instanceof Error ? e.message : e); }
    try {
      const captures = await pendingCaptures();
      for (const c of captures) {
        if (c.company_id === owner.companyId && c.user_id === owner.userId) await restoreCapture(c);
      }
    } catch (e) { error ||= String(e instanceof Error ? e.message : e); }
    const local = await listOwnerTrips(owner.companyId, owner.userId);
    for (const vehicleId of new Set(local.pending.map(t => t.vehicleId))) {
      await syncPendingTrips(owner.companyId, owner.userId, vehicleId);
    }
  }
  const local = await listOwnerTrips(owner.companyId, owner.userId);
  return { active: local.active.filter(t => !!t.endDatetime), pending: local.pending, error };
}

function reading(raw: string): number | null {
  const clean = raw.trim();
  if (!/^\d+(\.\d+)?$/.test(clean)) return null;
  const n = Number(clean);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

/** Queue and remove the active capture in one transaction; never invent a stop time. */
export async function saveDriveCompletion(trip: InProgressTrip, answers: CompletionAnswers, owner: Owner) {
  if (trip.companyId !== owner.companyId || trip.userId !== owner.userId)
    throw Error('This trip belongs to another account.');
  if (navigator.onLine) {
    const current = await driveOwner();
    if (current.companyId !== owner.companyId || current.userId !== owner.userId)
      throw Error('Account changed. Return to the original driver to save.');
  }
  if (!trip.endDatetime) throw Error('Stop this drive before completing its logbook.');
  if (!['business', 'private'].includes(answers.tripType)) throw Error('Select Business or Private.');
  const start = reading(trip.odometerStart ?? ''), end = reading(answers.odometerEnd);
  if (start === null) throw Error('The starting odometer needs recovery in the web logbook.');
  if (end === null || end < start) throw Error('Enter an end odometer at least equal to the starting reading.');
  const business = answers.tripType === 'business';
  if (business && !PURPOSES.includes(answers.purpose as typeof PURPOSES[number])) throw Error('Select a purpose.');
  if (business && (answers.destination.trim().length < 2 || answers.destination.trim().length > 500))
    throw Error('Enter a destination or journey description.');
  if (business && answers.purpose === 'Other — specify reason' && !answers.reason.trim()) throw Error('Enter a reason.');
  const id = await completeTrip(trip, {
    vehicleId: trip.vehicleId, startDatetime: trip.startDatetime, endDatetime: trip.endDatetime,
    startLat: trip.startPoint ? String(trip.startPoint.lat) : null,
    startLng: trip.startPoint ? String(trip.startPoint.lng) : null, endLat: null, endLng: null,
    odometerStart: trip.odometerStart, odometerEnd: String(end), km: (end - start).toFixed(1),
    businessOrPrivate: answers.tripType as 'business' | 'private',
    purpose: business ? answers.purpose : 'Private',
    destination: business ? answers.destination.trim() : null,
    reason: business && answers.purpose === 'Other — specify reason' ? answers.reason.trim() : null,
    prestartAtHome: business && answers.prestartAtHome,
  });
  if (!id) throw Error('This entry was already queued. Reopen the logbook to check its status.');
  if (business) rememberDestination(owner.companyId, owner.userId, answers.destination);
  try { localStorage.removeItem(completionKey(trip)); } catch { /* The committed queue is authoritative. */ }
  let synced = false;
  if (navigator.onLine) {
    try {
      await retryDriveStops();
      await syncPendingTrips(owner.companyId, owner.userId, trip.vehicleId);
      synced = !(await listOwnerTrips(owner.companyId, owner.userId)).pending.some(t => t.localId === id);
    } catch { /* Keep the durable queued record for retry. */ }
  }
  notifyLogbook();
  return { synced };
}
