import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useSession } from '@/lib/auth/auth-client';
import { useMe } from '@/lib/usePermissions';
import { useFieldSheetScrollLock } from '@/lib/useFieldSheetScrollLock';
import RecentDestinationChips from './RecentDestinationChips';
import {
  completionKey, emptyAnswers, LOGBOOK_CHANGED, PURPOSES,
  recoverDriveLogbook, saveDriveCompletion, type CompletionAnswers,
} from '@/lib/end-drive-logbook';
import type { Owner } from '@/lib/fleet-drive-logbook';
import { listOwnerTrips, type InProgressTrip, type PendingTrip } from '@/lib/tripLogbookStore';

/** Mounted above route/badge lifetimes; only logbook captures can open it. */
export default function EndDriveLogbookDialog() {
  const { user } = useSession();
  const { me } = useMe();
  const companyId = me?.user?.id === user?.id ? me?.profile?.companyId : undefined;
  const [records, setRecords] = useState<InProgressTrip[]>([]);
  const [pending, setPending] = useState<PendingTrip[]>([]);
  const [dismissed, setDismissed] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);
  const [loadedOwner, setLoadedOwner] = useState('');
  const ownerKey = user?.id && companyId ? `${companyId}:${user.id}` : '';
  const reload = () => setRefreshKey(k => k + 1);

  useEffect(() => {
    setDismissed([]); setMessage(''); setError('');
  }, [ownerKey]);
  useEffect(() => {
    const open = () => { setDismissed([]); reload(); };
    window.addEventListener('iwb:open-logbook-completion', open);
    return () => window.removeEventListener('iwb:open-logbook-completion', open);
  }, []);

  useEffect(() => {
    let cancelled = false, running = false, again = false;
    async function refresh() {
      if (!user?.id || !companyId) return;
      if (running) { again = true; return; }
      running = true;
      try {
        // Show this owner's durable stopped capture immediately, even if Wi-Fi
        // claims to be online while the API is unreachable.
        const local = await listOwnerTrips(companyId, user.id);
        if (!cancelled) {
          setLoadedOwner(ownerKey); setRecords(local.active.filter(t => !!t.endDatetime)); setPending(local.pending);
        }
        const result = await recoverDriveLogbook({ companyId, userId: user.id });
        if (!cancelled) {
          setLoadedOwner(ownerKey); setRecords(result.active); setPending(result.pending);
          setError(result.error);
        }
      } catch (e) {
        if (!cancelled) {
          setLoadedOwner(''); setRecords([]); setPending([]);
          setError(e instanceof Error ? e.message : 'Unable to recover the logbook.');
        }
      } finally {
        running = false;
        if (again && !cancelled) { again = false; void refresh(); }
      }
    }
    void refresh();
    const timer = window.setInterval(() => void refresh(), 30000);
    const listener = () => void refresh();
    window.addEventListener(LOGBOOK_CHANGED, listener);
    window.addEventListener('online', listener);
    window.addEventListener('focus', listener);
    return () => {
      cancelled = true; clearInterval(timer);
      window.removeEventListener(LOGBOOK_CHANGED, listener);
      window.removeEventListener('online', listener);
      window.removeEventListener('focus', listener);
    };
  }, [user?.id, companyId, ownerKey, refreshKey]);

  if (!user?.id || !companyId || loadedOwner !== ownerKey) return null;
  const mine = records.filter(t => t.userId === user.id && t.companyId === companyId);
  const trip = mine.find(t => !dismissed.includes(t.clientTripId));
  const owner = { companyId, userId: user.id };
  return <>
    {trip && <CompletionForm key={`${trip.ownerKey}:${trip.clientTripId}`} trip={trip} owner={owner}
      onClose={() => setDismissed(ids => [...ids, trip.clientTripId])}
      onSaved={synced => {
        setRecords(items => items.filter(t => t.clientTripId !== trip.clientTripId));
        setMessage(synced ? 'Trip saved.' : 'Trip saved on this device — awaiting upload.'); reload();
      }} />}
    {!trip && (mine.length > 0 || pending.length > 0 || message) && <div role="status"
      className="fixed bottom-20 left-4 right-4 z-[180] rounded-xl border border-amber-200 bg-amber-50 text-amber-950 p-3 shadow-lg text-sm sm:left-auto sm:max-w-sm">
      {message && <p>{message}</p>}
      {mine.length > 0 && <button className="underline font-semibold" onClick={() => setDismissed([])}>Complete drive logbook ({mine.length})</button>}
      {pending.length > 0 && <><p>{pending.length} trip(s) awaiting upload.</p>
        {pending.map(t => t.errorMsg && <p key={t.localId}>{t.errorMsg}</p>)}
        <button className="underline font-semibold" onClick={reload}>Retry upload</button></>}
      {error && <p>{error}</p>}
      {message && !mine.length && !pending.length && <button className="ml-3 underline" onClick={() => setMessage('')}>Dismiss</button>}
    </div>}
  </>;
}

export function CompletionForm({ trip, owner, onClose, onSaved }: {
  trip: InProgressTrip; owner: Owner; onClose: () => void; onSaved: (synced: boolean) => void;
}) {
  const [answers, setAnswers] = useState<CompletionAnswers>(() => {
    try { return { ...emptyAnswers, ...JSON.parse(localStorage.getItem(completionKey(trip)) || '{}') }; }
    catch { return { ...emptyAnswers }; }
  });
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const busy = useRef(false);
  const firstInput = useRef<HTMLButtonElement>(null);
  useFieldSheetScrollLock(true);
  useEffect(() => { firstInput.current?.focus(); }, []);
  function change(update: Partial<CompletionAnswers>) {
    const next = { ...answers, ...update }; setAnswers(next);
    try { localStorage.setItem(completionKey(trip), JSON.stringify(next)); setError(''); }
    catch { setError('Cannot preserve this form on this device. Keep it open until saved.'); }
  }
  async function save() {
    if (busy.current) return;
    busy.current = true; setSaving(true); setError('');
    try { const result = await saveDriveCompletion(trip, answers, owner); onSaved(result.synced); }
    catch (e) { setError(e instanceof Error ? e.message : 'Unable to save. Your answers are retained.'); }
    finally { busy.current = false; setSaving(false); }
  }
  return createPortal(<div className="fixed inset-0 z-[200] bg-black/50 flex items-center justify-center p-4">
    <div role="dialog" aria-modal="true" aria-labelledby="end-drive-title"
      className="bg-white rounded-2xl shadow-xl w-full max-w-sm max-h-[90dvh] overflow-y-auto p-5"
      onKeyDown={e => {
        if (e.key !== 'Tab') return;
        const controls = Array.from(e.currentTarget.querySelectorAll<HTMLElement>('button:not(:disabled),select:not(:disabled),input:not(:disabled)'));
        const first = controls[0], last = controls[controls.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last?.focus(); }
        if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first?.focus(); }
      }}>
      <h2 id="end-drive-title" className="font-bold text-lg">Drive logbook</h2>
      <p className="text-sm mt-2">{trip.assetName || `Vehicle ${trip.vehicleId}`}</p>
      <p className="text-xs text-muted-foreground">Stopped {new Date(trip.endDatetime!).toLocaleString()}</p>
      <p className="text-sm mt-2">Starting odometer: {trip.odometerStart ?? 'Missing'} km</p>
      <fieldset disabled={saving} className="mt-4">
        <legend className="text-sm font-semibold">Trip type</legend>
        <div className="flex gap-2 mt-2">{(['business', 'private'] as const).map((type, i) => <button
          ref={i === 0 ? firstInput : undefined} key={type} type="button" aria-pressed={answers.tripType === type}
          onClick={() => change({ tripType: type })}
          className={`flex-1 p-2 rounded-xl border-2 ${answers.tripType === type ? 'border-primary text-primary bg-primary/10' : 'border-slate-200'}`}>
          {type === 'business' ? 'Business' : 'Private'}</button>)}</div>
        {answers.tripType === 'business' && <>
          <label htmlFor="drive-purpose" className="block text-sm mt-3">Purpose</label>
          <select id="drive-purpose" value={answers.purpose} onChange={e => change({ purpose: e.target.value })} className="w-full border rounded-xl p-2 mt-1">
            <option value="">Select purpose…</option>{PURPOSES.map(p => <option key={p}>{p}</option>)}</select>
          <label htmlFor="drive-destination" className="block text-sm mt-3">Destination / journey description</label>
          <RecentDestinationChips companyId={owner.companyId} userId={owner.userId}
            onSelect={destination => change({ destination })} />
          <input id="drive-destination" maxLength={500} value={answers.destination} onChange={e => change({ destination: e.target.value })} className="w-full border rounded-xl p-2 mt-1" />
          {answers.purpose === 'Other — specify reason' && <><label htmlFor="drive-reason" className="block text-sm mt-3">Reason</label>
            <input id="drive-reason" maxLength={1000} value={answers.reason} onChange={e => change({ reason: e.target.value })} className="w-full border rounded-xl p-2 mt-1" /></>}
          <label className="flex gap-2 text-sm mt-3"><input type="checkbox" checked={answers.prestartAtHome} onChange={e => change({ prestartAtHome: e.target.checked })} />Pre-start completed at home</label>
        </>}
        <label htmlFor="drive-end-odometer" className="block text-sm mt-3">Ending odometer (km)</label>
        <input id="drive-end-odometer" type="number" inputMode="decimal" min={trip.odometerStart ?? '0'} step="any" value={answers.odometerEnd}
          onChange={e => change({ odometerEnd: e.target.value })} className="w-full border rounded-xl p-2 mt-1" />
      </fieldset>
      {error && <p role="alert" className="text-sm text-red-700 mt-3">{error}</p>}
      <button disabled={saving} onClick={() => void save()} className="w-full mt-4 p-3 rounded-xl bg-primary text-white font-semibold disabled:opacity-50">{saving ? 'Saving…' : 'Save trip'}</button>
      <button disabled={saving} onClick={onClose} className="w-full mt-2 p-2 text-sm text-slate-600">Finish later — kept on this device</button>
    </div>
  </div>, document.body);
}
