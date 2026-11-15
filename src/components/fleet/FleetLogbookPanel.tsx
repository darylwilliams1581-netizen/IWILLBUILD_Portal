import { useCallback, useEffect, useState } from 'react';
import { useSession } from '@/lib/auth/auth-client';
import { useMe } from '@/lib/usePermissions';
import { fetchTripLogs, type FleetAsset, type TripLogPage } from '@/lib/fleet-api';
import { listOwnerTrips, type PendingTrip } from '@/lib/tripLogbookStore';
import { LOGBOOK_CHANGED, notifyLogbook } from '@/lib/end-drive-logbook';
import { rememberDestination } from '@/lib/recent-destinations';
import LogbookRecordsPanel, { PendingTripRepair } from './LogbookRecordsPanel';
import CompactTripRow from './CompactTripRow';

export const OPEN_LOGBOOK_COMPLETION = 'iwb:open-logbook-completion';
const input = 'w-full border rounded-xl p-2 text-sm';
type Props = { asset: FleetAsset; onAssetUpdated: (asset: FleetAsset) => void };

export default function FleetLogbookPanel(props: Props) {
  const { user } = useSession();
  const { me } = useMe();
  if (!user?.id || me?.user?.id !== user.id || me.profile?.companyId !== props.asset.companyId) return null;
  const canManage = ['owner', 'admin'].includes(me.profile.role) || !!me.profile.permAdmin;
  return <LogbookContent key={`${me.profile.companyId}:${user.id}:${props.asset.id}`}
    {...props} userId={user.id} canManage={canManage} />;
}

function LogbookContent({ asset, onAssetUpdated, userId, canManage }: Props & { userId: string; canManage: boolean }) {
  const [period, setPeriod] = useState<string | undefined>();
  const [page, setPage] = useState(1), [search, setSearch] = useState('');
  const [bop, setBop] = useState<'' | 'business' | 'private'>('');
  const [needs, setNeeds] = useState(false), [from, setFrom] = useState(''), [to, setTo] = useState('');
  const [data, setData] = useState<TripLogPage | null>(null), [totals, setTotals] = useState<TripLogPage | null>(null);
  const [loading, setLoading] = useState(false), [error, setError] = useState(''), [totalsError, setTotalsError] = useState('');
  const [expanded, setExpanded] = useState<number | null>(null), [refresh, setRefresh] = useState(0);
  const [pending, setPending] = useState<PendingTrip[]>([]), [unfinished, setUnfinished] = useState(0);
  const [toggleOpen, setToggleOpen] = useState(false), [odo, setOdo] = useState(''), [busy, setBusy] = useState(false);
  const reload = useCallback(() => setRefresh(n => n + 1), []);
  const selectPeriod = useCallback((value: string) => { setPeriod(value); setPage(1); setExpanded(null); }, []);
  useEffect(() => {
    window.addEventListener(LOGBOOK_CHANGED, reload);
    window.addEventListener('focus', reload); window.addEventListener('online', reload);
    return () => { window.removeEventListener(LOGBOOK_CHANGED, reload); window.removeEventListener('focus', reload); window.removeEventListener('online', reload); };
  }, [reload]);
  useEffect(() => {
    let cancelled = false;
    void listOwnerTrips(asset.companyId, userId).then(local => {
      if (cancelled) return;
      setPending(local.pending.filter(t => t.vehicleId === asset.id));
      setUnfinished(local.active.filter(t => t.vehicleId === asset.id && t.endDatetime).length);
    }).catch(() => { if (!cancelled) setError('Could not read pending trips on this device.'); });
    return () => { cancelled = true; };
  }, [asset.id, asset.companyId, userId, refresh]);
  useEffect(() => {
    if (period === undefined) return;
    let cancelled = false; setLoading(true); setError('');
    void fetchTripLogs(asset.id, { periodId: period ? Number(period) : null, search, bop, needsCompletion: needs,
      dateFrom: from, dateTo: to, page, perPage: 25 }).then(result => {
      if (cancelled) return;
      if (!Number.isFinite(result.total)) throw Error('The updated logbook service is not available yet. Please refresh after publishing.');
      setData(result);
      const last = Math.max(1, Math.ceil(result.total / 25));
      if (page > last) setPage(last);
    }).catch(e => { if (!cancelled) { setData(null); setError(e instanceof Error ? e.message : 'Could not load trips.'); } })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [asset.id, period, page, search, bop, needs, from, to, refresh]);
  useEffect(() => {
    if (period === undefined) return;
    let cancelled = false; setTotals(null); setTotalsError('');
    // Separate period query: filters and pagination must never change these totals.
    void fetchTripLogs(asset.id, { periodId: period ? Number(period) : null, page: 1, perPage: 1 }).then(result => {
      if (!cancelled && Number.isFinite(result.totalKm)) setTotals(result);
    }).catch(() => { if (!cancelled) setTotalsError('Period totals unavailable.'); });
    return () => { cancelled = true; };
  }, [asset.id, period, refresh]);

  async function toggleRecording() {
    if (busy) return;
    if (!/^\d+(\.\d{1,3})?$/.test(odo.trim())) { setError('Enter the actual odometer reading.'); return; }
    setBusy(true); setError('');
    try {
      const active = !asset.logbookActive;
      const response = await fetch(`/api/fleet/${asset.id}`, { method: 'PUT', credentials: 'include',
        headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ logbookActive: active,
          [active ? 'logbookOdometerStart' : 'logbookOdometerEnd']: odo.trim() }) });
      const result = await response.json();
      if (!response.ok) throw Error(result.error || 'Could not update logbook recording.');
      onAssetUpdated(result.asset); setToggleOpen(false); setOdo(''); notifyLogbook();
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not update recording.'); }
    finally { setBusy(false); }
  }
  const days = asset.logbookStartedAt ? Math.max(0, Math.floor((Date.now() - new Date(asset.logbookStartedAt).getTime()) / 86400000)) : 0;
  const pages = Math.max(1, Math.ceil((data?.total ?? 0) / 25));
  return <div className="space-y-4">
    <section className="bg-white border rounded-xl p-4">
      <div className="flex justify-between items-center gap-3">
        <div><h2 className="font-semibold">Logbook active</h2><p className="text-sm text-muted-foreground">Record trips for tax purposes. Track 12 continuous weeks.</p></div>
        <button type="button" role="switch" aria-label="Logbook active" aria-checked={!!asset.logbookActive}
          disabled={!canManage || busy} onClick={() => { setToggleOpen(true); setError(''); }}
          className={`shrink-0 rounded-full px-3 py-2 text-sm font-semibold ${asset.logbookActive ? 'bg-primary text-white' : 'bg-slate-200 text-slate-700'} disabled:opacity-60`}>
          {asset.logbookActive ? 'ON' : 'OFF'}</button>
      </div>
      {asset.logbookActive && <div className="mt-4 text-sm">
        <p>{days < 84 ? `Logbook recording in progress — Week ${Math.min(12, Math.floor(days / 7) + 1)} of 12` : '12-week period elapsed — recording continues'}</p>
        <progress aria-label="Logbook period progress" value={Math.min(84, days)} max={84} className="w-full h-2 my-2" />
        {asset.logbookStartedAt && <p>Started {new Date(asset.logbookStartedAt).toLocaleDateString('en-AU')}</p>}
      </div>}
      {toggleOpen && <div className="mt-3 border-t pt-3 space-y-2">
        <label className="block text-sm">{asset.logbookActive ? 'Period ending odometer (km)' : 'Period starting odometer (km)'}
          <input className={input} inputMode="decimal" value={odo} onChange={e => setOdo(e.target.value)} /></label>
        <button disabled={busy} className="rounded-lg bg-primary text-white px-3 py-2 text-sm" onClick={() => void toggleRecording()}>{busy ? 'Saving…' : 'Confirm'}</button>
        <button disabled={busy} className="ml-3 text-sm" onClick={() => setToggleOpen(false)}>Cancel</button>
      </div>}
    </section>
    <LogbookRecordsPanel key={`${asset.id}:${asset.logbookStartedAt}:${asset.logbookEndedAt}`}
      vehicleId={asset.id} pendingCount={pending.length} refreshKey={`${asset.updatedAt}:${refresh}`} onPeriodChange={selectPeriod} />
    {totals && <section aria-label="Whole-period totals" className="bg-white border rounded-xl p-4">
      <p className="text-xs text-muted-foreground mb-2">Saved trips across the entire selected period</p>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
        <p><strong>{totals.total}</strong><br />Trips</p><p><strong>{totals.totalKm.toFixed(1)}</strong><br />Total km</p>
        <p><strong>{totals.totalBusiness.toFixed(1)}</strong><br />Business km</p><p><strong>{totals.totalPrivate.toFixed(1)}</strong><br />Private km</p>
      </div>
    </section>}
    {totalsError && <p role="alert">{totalsError}</p>}
    {unfinished > 0 && <button className="text-primary underline text-sm" onClick={() => window.dispatchEvent(new Event(OPEN_LOGBOOK_COMPLETION))}>Complete unfinished drive ({unfinished})</button>}
    {pending.length > 0 && <details className="border rounded-xl p-3 bg-amber-50"><summary>{pending.length} trip(s) waiting to sync on this device</summary>
      <p className="text-xs my-2">These are separate from the saved period totals.</p>
      {pending.map(trip => <PendingTripRepair key={trip.localId} trip={trip} onSaved={notifyLogbook} />)}
      <button className="underline text-sm mt-2" onClick={notifyLogbook}>Retry upload</button>
    </details>}
    <section className="border rounded-xl bg-white overflow-hidden">
      <div className="p-3 space-y-2">
        <label className="block text-sm">Search trips<input className={input} placeholder="Purpose or destination" value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} /></label>
        <div className="grid grid-cols-2 gap-2">
          <label className="text-sm">From<input aria-label="From date" type="date" className={input} value={from} onChange={e => { setFrom(e.target.value); setPage(1); }} /></label>
          <label className="text-sm">To<input aria-label="To date" type="date" className={input} value={to} onChange={e => { setTo(e.target.value); setPage(1); }} /></label>
        </div>
        <label className="block text-sm">Trip type<select className={input} value={bop} onChange={e => { setBop(e.target.value as typeof bop); setPage(1); }}><option value="">All trips</option><option value="business">Business</option><option value="private">Private</option></select></label>
        <label className="flex gap-2 text-sm"><input type="checkbox" checked={needs} onChange={e => { setNeeds(e.target.checked); setPage(1); }} />Needs completion</label>
      </div>
      {error && <p role="alert" className="text-red-700 p-3">{error}</p>}
      <button className="text-sm text-primary underline px-3 pb-2" onClick={reload}>Refresh logbook</button>
      {loading ? <p role="status" className="p-4 text-sm">Loading trips…</p> : data && <>
        <div className="divide-y">{data.trips.map(trip => <CompactTripRow key={trip.id} trip={trip} vehicleId={asset.id}
          expanded={expanded === trip.id} onToggle={() => setExpanded(expanded === trip.id ? null : trip.id)}
          canEdit={canManage || trip.userId === userId} onAmended={updated => {
            if (updated.userId === userId && updated.businessOrPrivate === 'business') rememberDestination(asset.companyId, userId, updated.destination);
            reload();
          }} />)}</div>
        {!data.trips.length && <p className="p-4 text-sm">No trips match this selection.</p>}
        <div className="flex items-center justify-between gap-2 border-t p-3 text-sm">
          <button disabled={page <= 1} onClick={() => { setPage(p => p - 1); setExpanded(null); }} className="disabled:opacity-40">Previous</button>
          <span>{data.total ? `${(page - 1) * 25 + 1}–${Math.min(page * 25, data.total)} of ${data.total}` : '0 trips'}</span>
          <button disabled={page >= pages} onClick={() => { setPage(p => p + 1); setExpanded(null); }} className="disabled:opacity-40">Next</button>
        </div>
      </>}
    </section>
  </div>;
}
