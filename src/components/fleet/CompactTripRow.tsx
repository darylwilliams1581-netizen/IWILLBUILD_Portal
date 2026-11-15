import { useState } from 'react';
import { AlertCircle, AlertTriangle, Check, ChevronDown, Loader2, Pencil, Play, Square, WifiOff } from 'lucide-react';
import { amendTrip, TRIP_PURPOSES, type FleetTripLog, type AmendTripPayload } from '@/lib/fleet-api';
import type { PendingTrip } from '@/lib/tripLogbookStore';
function fmtTime(iso: string) { return new Date(iso).toLocaleTimeString('en-AU', {hour:'2-digit',minute:'2-digit'}); }
function fmtDate(iso:string) { return new Date(iso).toLocaleDateString('en-AU', {day:'numeric',month:'short'}); }
function isOdometerVerified(trip: FleetTripLog | PendingTrip) { return trip.odometerStart != null && trip.odometerEnd != null; }
function TripRow({
  trip,
  pending = false,
  vehicleId,
  canEdit = false,
  onAmended,
}: {
  trip: FleetTripLog | PendingTrip;
  pending?: boolean;
  vehicleId?: number;
  canEdit?: boolean;
  onAmended?: (updated: FleetTripLog) => void;
}) {
  const verified = isOdometerVerified(trip);
  const isPending = pending;
  const bop = trip.businessOrPrivate;
  const serverTrip = !isPending ? (trip as FleetTripLog) : null;
  const isAutoClosed = serverTrip?.autoClosed === true;
  const isAmended = !!serverTrip?.amendedAt;

  // ── Inline edit state ──────────────────────────────────────────────────────
  const [editing, setEditing] = useState(false);
  const [editBop, setEditBop] = useState<'business' | 'private'>(bop as 'business' | 'private');
  const [editPurpose, setEditPurpose] = useState(trip.purpose);
  const [editReason, setEditReason] = useState(trip.reason ?? '');
  const [editDest, setEditDest] = useState(trip.destination ?? '');
  const [editOdoStart, setEditOdoStart] = useState(trip.odometerStart ?? '');
  const [editOdoEnd, setEditOdoEnd] = useState(trip.odometerEnd ?? '');
  const [editEndTime, setEditEndTime] = useState('');
  const [editNote, setEditNote] = useState('');
  const [editBusy, setEditBusy] = useState(false);
  const [editError, setEditError] = useState('');

  function openEdit() {
    if (!serverTrip) return;
    setEditBop(serverTrip.businessOrPrivate);
    setEditPurpose(serverTrip.purpose);
    setEditReason(serverTrip.reason ?? '');
    setEditDest(serverTrip.destination ?? '');
    setEditOdoStart(serverTrip.odometerStart ?? '');
    setEditOdoEnd(serverTrip.odometerEnd ?? '');
    // Pre-fill end time in local datetime-local format
    const endDate = new Date(serverTrip.endDatetime);
    const local = new Date(endDate.getTime() - endDate.getTimezoneOffset() * 60000)
      .toISOString().slice(0, 16);
    setEditEndTime(local);
    setEditNote(isAutoClosed ? 'Corrected auto-closed trip' : '');
    setEditError('');
    setEditing(true);
  }

  async function saveEdit() {
    if (!serverTrip || !vehicleId || editBusy) return;
    setEditBusy(true);
    setEditError('');
    try {
      const payload: AmendTripPayload = {
        businessOrPrivate: editBop,
        purpose: editPurpose,
        reason: editReason || null,
        destination: editDest || null,
        amendedNote: editNote || (isAutoClosed ? 'Driver correction of auto-closed trip' : 'Amended'),
      };
      if (editOdoStart && editOdoEnd) {
        payload.odometerStart = editOdoStart;
        payload.odometerEnd = editOdoEnd;
      }
      if (editEndTime) {
        payload.endDatetime = new Date(editEndTime).toISOString();
      }
      const updated = await amendTrip(vehicleId, serverTrip.id, payload);
      setEditing(false);
      onAmended?.(updated);
    } catch (e) {
      setEditError(e instanceof Error ? e.message : 'Could not save');
    } finally {
      setEditBusy(false);
    }
  }

  return (
    <div className={`px-5 py-4 ${isPending ? 'bg-amber-50/50' : ''} ${isAutoClosed ? 'bg-red-50/40' : ''}`}>
      <div className="flex items-start justify-between gap-3 mb-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className={`inline-flex items-center text-xs font-bold px-2 py-0.5 rounded-full border ${
              bop === 'business'
                ? 'bg-violet-50 border-violet-200 text-primary'
                : 'bg-slate-50 border-slate-200 text-slate-600'
            }`}>
              {bop === 'business' ? 'Business' : 'Private'}
            </span>
            {!verified && (
              <span className="inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full border bg-amber-50 border-amber-200 text-amber-700">
                <AlertTriangle size={9} /> Unverified distance
              </span>
            )}
            {isPending && (
              <span className="inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full border bg-amber-100 border-amber-300 text-amber-700">
                <WifiOff size={9} /> Pending sync
              </span>
            )}
            {(trip as PendingTrip).syncStatus === 'error' && (
              <span className="inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full border bg-red-50 border-red-200 text-red-600">
                <AlertCircle size={9} /> Sync error
              </span>
            )}
            {isAutoClosed && (
              <span className="inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full border bg-red-100 border-red-300 text-red-700">
                <AlertTriangle size={9} /> Auto-closed — needs correction
              </span>
            )}
            {isAmended && !isAutoClosed && (
              <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border bg-blue-50 border-blue-200 text-blue-600">
                <Pencil size={9} /> Amended
              </span>
            )}
          </div>
          <p className="text-sm font-semibold text-foreground">{trip.purpose}</p>
          {trip.destination && <p className="text-xs text-muted-foreground mt-0.5">{trip.destination}</p>}
          {trip.reason && <p className="text-xs text-muted-foreground mt-0.5 italic">{trip.reason}</p>}
          {verified && (
            <p className="text-xs text-muted-foreground mt-0.5">
              Odo: {trip.odometerStart} → {trip.odometerEnd} km
            </p>
          )}
          {isAmended && serverTrip?.amendedNote && (
            <p className="text-xs text-blue-500 mt-0.5 italic">Note: {serverTrip.amendedNote}</p>
          )}
        </div>
        <div className="flex items-start gap-2 shrink-0">
          <div className="text-right">
            <p className="text-base font-bold text-primary">{trip.km} km</p>
            <p className="text-xs text-muted-foreground">{fmtDate(trip.startDatetime)}</p>
          </div>
          {canEdit && serverTrip && !isPending && (
            <button
              onClick={openEdit}
              className="mt-0.5 p-1.5 rounded-lg text-muted-foreground hover:text-primary hover:bg-muted transition-colors"
              title="Edit this trip"
              aria-label="Edit trip"
            >
              <Pencil size={13} />
            </button>
          )}
        </div>
      </div>
      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <Play size={10} className="text-emerald-500" />
          {fmtTime(trip.startDatetime)}
        </span>
        <span className="flex items-center gap-1">
          <Square size={10} className="text-red-400" />
          {fmtTime(trip.endDatetime)}
        </span>
      </div>

      {/* ── Inline edit form ─────────────────────────────────────────────── */}
      {editing && serverTrip && (
        <div className="mt-3 pt-3 border-t border-border space-y-3">
          {isAutoClosed && (
            <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs text-red-700">
              <AlertTriangle size={11} className="shrink-0 mt-0.5" />
              This trip was auto-closed after 12 hours. Please correct the details below.
            </div>
          )}

          {/* Business / Private */}
          <div className="flex gap-2">
            {(['business', 'private'] as const).map(v => (
              <button
                key={v}
                onClick={() => setEditBop(v)}
                className={`flex-1 py-1.5 rounded-lg text-xs font-semibold border transition-colors ${
                  editBop === v
                    ? 'bg-primary text-white border-primary'
                    : 'bg-white text-muted-foreground border-border'
                }`}
              >
                {v === 'business' ? 'Business' : 'Private'}
              </button>
            ))}
          </div>

          {/* Purpose */}
          <select
            value={editPurpose}
            onChange={e => setEditPurpose(e.target.value)}
            className="w-full border border-border rounded-lg px-3 py-2 text-sm bg-white"
          >
            {TRIP_PURPOSES.map(p => <option key={p} value={p}>{p}</option>)}
          </select>

          {/* Reason (Other only) */}
          {/^Other/.test(editPurpose) && editBop === 'business' && (
            <textarea
              value={editReason}
              onChange={e => setEditReason(e.target.value)}
              placeholder="Explain the reason…"
              rows={2}
              className="w-full border border-border rounded-lg px-3 py-2 text-sm resize-none"
            />
          )}

          {/* Destination */}
          {editBop === 'business' && (
            <input
              type="text"
              value={editDest}
              onChange={e => setEditDest(e.target.value)}
              placeholder="Destination / journey description"
              className="w-full border border-border rounded-lg px-3 py-2 text-sm"
            />
          )}

          {/* Odometer */}
          <div className="flex gap-2">
            <input
              type="number"
              value={editOdoStart}
              onChange={e => setEditOdoStart(e.target.value)}
              placeholder="Odo start (km)"
              className="flex-1 border border-border rounded-lg px-3 py-2 text-sm"
            />
            <input
              type="number"
              value={editOdoEnd}
              onChange={e => setEditOdoEnd(e.target.value)}
              placeholder="Odo end (km)"
              className="flex-1 border border-border rounded-lg px-3 py-2 text-sm"
            />
          </div>

          {/* End time (especially useful for auto-closed trips) */}
          <div>
            <label className="text-xs text-muted-foreground mb-1 block">Trip end time</label>
            <input
              type="datetime-local"
              value={editEndTime}
              onChange={e => setEditEndTime(e.target.value)}
              className="w-full border border-border rounded-lg px-3 py-2 text-sm"
            />
          </div>

          {/* Amendment note */}
          <input
            type="text"
            value={editNote}
            onChange={e => setEditNote(e.target.value)}
            placeholder="Reason for amendment (optional)"
            className="w-full border border-border rounded-lg px-3 py-2 text-sm"
          />

          {editError && (
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs text-red-700">
              <AlertCircle size={11} className="shrink-0" /> {editError}
            </div>
          )}

          <div className="flex gap-2">
            <button
              onClick={saveEdit}
              disabled={editBusy}
              className="flex-1 flex items-center justify-center gap-1.5 py-2 bg-primary text-white rounded-lg text-sm font-semibold disabled:opacity-50"
            >
              {editBusy ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
              Save correction
            </button>
            <button
              onClick={() => setEditing(false)}
              disabled={editBusy}
              className="px-4 py-2 border border-border rounded-lg text-sm text-muted-foreground"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Logbook period odometer modal ────────────────────────────────────────────

export default function CompactTripRow({
  trip,
  expanded,
  onToggle,
  vehicleId,
  canEdit,
  onAmended,
}: {
  trip: FleetTripLog;
  expanded: boolean;
  onToggle: () => void;
  vehicleId: number;
  canEdit: boolean;
  onAmended: (updated: FleetTripLog) => void;
}) {
  const bop = trip.businessOrPrivate;
  const isAutoClosed = trip.autoClosed === true;
  const isAmended    = !!trip.amendedAt;
  const verified     = isOdometerVerified(trip);

  return (
    <div className={`${isAutoClosed ? 'bg-red-50/40' : ''}`}>
      {/* Summary row — tap to expand */}
      <button
        onClick={onToggle}
        className="w-full text-left px-4 py-2.5 flex items-center gap-3 hover:bg-muted/40 transition-colors"
        aria-expanded={expanded}
      >
        {/* B/P pill */}
        <span className={`shrink-0 inline-flex items-center text-[10px] font-bold px-1.5 py-0.5 rounded border ${
          bop === 'business'
            ? 'bg-violet-50 border-violet-200 text-primary'
            : 'bg-slate-50 border-slate-200 text-slate-500'
        }`}>
          {bop === 'business' ? 'Biz' : 'Priv'}
        </span>

        {/* Date + time */}
        <span className="shrink-0 text-xs text-muted-foreground w-[72px]">
          {fmtDate(trip.startDatetime)}<br />
          <span className="text-[10px]">{fmtTime(trip.startDatetime)}</span>
        </span>

        {/* Purpose + destination */}
        <span className="flex-1 min-w-0">
          <span className="block text-xs font-semibold text-foreground truncate">{trip.purpose}</span>
          {trip.destination && (
            <span className="block text-[10px] text-muted-foreground truncate">{trip.destination}</span>
          )}
        </span>

        {/* Badges */}
        <span className="shrink-0 flex flex-col items-end gap-0.5">
          <span className="text-sm font-bold text-primary">{trip.km} km</span>
          <span className="flex gap-1">
            {!verified && <AlertTriangle size={9} className="text-amber-500" />}
            {isAutoClosed && <AlertTriangle size={9} className="text-red-500" />}
            {isAmended && <Pencil size={9} className="text-blue-400" />}
          </span>
        </span>

        <ChevronDown size={13} className={`shrink-0 text-muted-foreground transition-transform ${expanded ? 'rotate-180' : ''}`} />
      </button>

      {/* Expanded detail + edit */}
      {expanded && (
        <div className="px-4 pb-4 pt-1 border-t border-border/50 bg-muted/20">
          <TripRow
            trip={trip}
            vehicleId={vehicleId}
            canEdit={canEdit}
            onAmended={onAmended}
          />
        </div>
      )}
    </div>
  );
}

