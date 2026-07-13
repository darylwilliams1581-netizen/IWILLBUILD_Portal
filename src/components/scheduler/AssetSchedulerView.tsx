/**
 * AssetSchedulerView
 * Timeline view showing fleet assets as rows with booking bars.
 * Supports creating, editing and deleting bookings.
 */
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Link } from 'react-router-dom';
import {
  Loader2, Plus, X, Truck, AlertCircle, ChevronLeft, ChevronRight,
  Pencil, Trash2, CalendarDays, Briefcase, CheckCircle2,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface AssetBooking {
  id: number;
  fleet_asset_id: number;
  job_id: number | null;
  title: string;
  start_date: string;   // YYYY-MM-DD
  end_date: string;     // YYYY-MM-DD
  start_time: string | null;
  end_time: string | null;
  notes: string | null;
  status: string;
  asset_name: string;
  asset_type: string | null;
  asset_rego: string | null;
  asset_make_model: string | null;
  job_name: string | null;
  job_number: string | null;
  job_client: string | null;
}

export interface FleetAsset {
  id: number;
  name: string;
  type: string | null;
  make_model: string | null;
  rego: string | null;
  status: string;
}

type TimeWindow = 'week' | 'month' | '3months';

const WINDOW_LABELS: Record<TimeWindow, string> = {
  week:     'Week',
  month:    'Month',
  '3months':'3 Months',
};

const DAY_WIDTH: Record<TimeWindow, number> = {
  week:     60,
  month:    36,
  '3months':14,
};

const STATUS_COLORS: Record<string, string> = {
  booked:     'bg-orange-500',
  confirmed:  'bg-emerald-500',
  in_use:     'bg-blue-500',
  completed:  'bg-slate-400',
  cancelled:  'bg-red-400',
};

const STATUS_LABELS: Record<string, string> = {
  booked:    'Booked',
  confirmed: 'Confirmed',
  in_use:    'In Use',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

// ─── Date helpers ─────────────────────────────────────────────────────────────

function toDateStr(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

function windowDays(tw: TimeWindow): number {
  if (tw === 'week')  return 7;
  if (tw === 'month') return 30;
  return 90;
}

function buildDays(anchor: Date, tw: TimeWindow): Date[] {
  const days: Date[] = [];
  const count = windowDays(tw);
  for (let i = 0; i < count; i++) days.push(addDays(anchor, i));
  return days;
}

function fmtFull(d: Date): string {
  return d.toLocaleDateString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

function isToday(d: Date): boolean {
  const t = new Date();
  return d.getFullYear() === t.getFullYear() && d.getMonth() === t.getMonth() && d.getDate() === t.getDate();
}

// ─── Booking bar position calc ────────────────────────────────────────────────

function bookingPosition(
  booking: AssetBooking,
  days: Date[],
  dayWidth: number,
): { left: number; width: number } | null {
  const start    = new Date(booking.start_date + 'T00:00:00');
  const end      = new Date(booking.end_date   + 'T00:00:00');
  const winStart = days[0];
  const winEnd   = days[days.length - 1];

  if (end < winStart || start > winEnd) return null;

  const clampedStart = start < winStart ? winStart : start;
  const clampedEnd   = end   > winEnd   ? winEnd   : end;

  const startIdx = days.findIndex(d => toDateStr(d) === toDateStr(clampedStart));
  const endIdx   = days.findIndex(d => toDateStr(d) === toDateStr(clampedEnd));

  const left  = (startIdx < 0 ? 0 : startIdx) * dayWidth;
  const width = ((endIdx < 0 ? days.length - 1 : endIdx) - (startIdx < 0 ? 0 : startIdx) + 1) * dayWidth;

  return { left, width };
}

// ─── Booking Form Modal ───────────────────────────────────────────────────────

interface BookingFormProps {
  assets: FleetAsset[];
  initial?: Partial<AssetBooking> & { fleet_asset_id?: number; start_date?: string };
  onClose: () => void;
  onSaved: (booking: AssetBooking) => void;
  onDeleted?: (id: number) => void;
}

function BookingFormModal({ assets, initial, onClose, onSaved, onDeleted }: BookingFormProps) {
  const isEdit = !!initial?.id;
  const [fleetAssetId, setFleetAssetId] = useState<number>(initial?.fleet_asset_id ?? (assets[0]?.id ?? 0));
  const [title, setTitle]               = useState(initial?.title ?? '');
  const [startDate, setStartDate]       = useState(initial?.start_date ?? toDateStr(new Date()));
  const [endDate, setEndDate]           = useState(initial?.end_date ?? toDateStr(new Date()));
  const [startTime, setStartTime]       = useState(initial?.start_time ?? '');
  const [endTime, setEndTime]           = useState(initial?.end_time ?? '');
  const [notes, setNotes]               = useState(initial?.notes ?? '');
  const [status, setStatus]             = useState(initial?.status ?? 'booked');
  const [saving, setSaving]             = useState(false);
  const [deleting, setDeleting]         = useState(false);
  const [error, setError]               = useState('');

  // Auto-title from asset name when creating
  useEffect(() => {
    if (!isEdit && !title) {
      const asset = assets.find(a => a.id === fleetAssetId);
      if (asset) setTitle(asset.name);
    }
  }, [fleetAssetId, assets, isEdit, title]);

  async function handleSave() {
    if (!fleetAssetId || !startDate || !endDate) {
      setError('Asset, start date and end date are required.');
      return;
    }
    if (endDate < startDate) {
      setError('End date must be on or after start date.');
      return;
    }
    setSaving(true); setError('');
    try {
      const fallbackTitle = assets.find(a => a.id === fleetAssetId)?.name ?? '';
      const body = {
        fleet_asset_id: fleetAssetId,
        title: title.trim() || fallbackTitle,
        start_date: startDate,
        end_date: endDate,
        start_time: startTime || null,
        end_time: endTime || null,
        notes: notes.trim() || null,
        status,
      };
      const url    = isEdit ? `/api/fleet/asset-bookings/${initial!.id}` : '/api/fleet/asset-bookings';
      const method = isEdit ? 'PATCH' : 'POST';
      const res    = await fetch(url, {
        method, credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json() as { booking?: AssetBooking; error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Save failed');
      onSaved(data.booking!);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!initial?.id || !confirm('Delete this booking?')) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/fleet/asset-bookings/${initial.id}`, { method: 'DELETE', credentials: 'include' });
      if (!res.ok) throw new Error('Delete failed');
      onDeleted?.(initial.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed');
    } finally {
      setDeleting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm"
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 8 }}
        transition={{ duration: 0.18 }}
        className="bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-orange-50 rounded-lg flex items-center justify-center">
              <Truck size={15} className="text-orange-500" />
            </div>
            <h2 className="font-bold text-sm text-slate-800">{isEdit ? 'Edit Booking' : 'New Asset Booking'}</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors">
            <X size={15} />
          </button>
        </div>

        {/* Body */}
        <div className="px-5 py-4 flex flex-col gap-3">
          {error && (
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-xs text-red-700">
              <AlertCircle size={13} className="shrink-0" />{error}
            </div>
          )}

          {/* Asset */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Asset *</label>
            <select
              value={fleetAssetId}
              onChange={e => setFleetAssetId(Number(e.target.value))}
              disabled={isEdit}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 bg-white disabled:bg-slate-50"
            >
              {assets.map(a => (
                <option key={a.id} value={a.id}>
                  {a.name}{a.rego ? ` — ${a.rego}` : ''}{a.type ? ` (${a.type})` : ''}
                </option>
              ))}
            </select>
          </div>

          {/* Title */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Booking title</label>
            <input
              type="text"
              value={title}
              onChange={e => setTitle(e.target.value)}
              placeholder="e.g. Site A — Excavation"
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
            />
          </div>

          {/* Dates */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">Start date *</label>
              <input
                type="date"
                value={startDate}
                onChange={e => { setStartDate(e.target.value); if (e.target.value > endDate) setEndDate(e.target.value); }}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">End date *</label>
              <input
                type="date"
                value={endDate}
                min={startDate}
                onChange={e => setEndDate(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
              />
            </div>
          </div>

          {/* Times (optional) */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">
                Start time <span className="font-normal text-slate-400">(optional)</span>
              </label>
              <input
                type="time"
                value={startTime}
                onChange={e => setStartTime(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-600 mb-1">
                End time <span className="font-normal text-slate-400">(optional)</span>
              </label>
              <input
                type="time"
                value={endTime}
                onChange={e => setEndTime(e.target.value)}
                className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
              />
            </div>
          </div>

          {/* Status */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">Status</label>
            <select
              value={status}
              onChange={e => setStatus(e.target.value)}
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 bg-white"
            >
              {Object.entries(STATUS_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs font-semibold text-slate-600 mb-1">
              Notes <span className="font-normal text-slate-400">(optional)</span>
            </label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={2}
              placeholder="Any additional details..."
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 resize-none"
            />
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-5 py-4 border-t border-slate-100 bg-slate-50">
          <div>
            {isEdit && (
              <button
                onClick={handleDelete}
                disabled={deleting || saving}
                className="flex items-center gap-1.5 text-xs font-semibold text-red-600 hover:text-red-700 hover:bg-red-50 px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50"
              >
                {deleting ? <Loader2 size={12} className="animate-spin" /> : <Trash2 size={12} />}
                Delete
              </button>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button onClick={onClose} className="px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-200 rounded-lg transition-colors">
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving || deleting}
              className="flex items-center gap-1.5 px-4 py-1.5 bg-orange-500 hover:bg-orange-600 text-white text-xs font-bold rounded-lg transition-colors disabled:opacity-50"
            >
              {saving ? <Loader2 size={12} className="animate-spin" /> : <CheckCircle2 size={12} />}
              {isEdit ? 'Save Changes' : 'Create Booking'}
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

// ─── Booking Popover ──────────────────────────────────────────────────────────

interface BookingPopoverProps {
  booking: AssetBooking;
  onEdit: () => void;
  onClose: () => void;
  anchorRef: React.RefObject<HTMLDivElement | null>;
}

function BookingPopover({ booking, onEdit, onClose, anchorRef }: BookingPopoverProps) {
  const popRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (
        popRef.current && !popRef.current.contains(e.target as Node) &&
        anchorRef.current && !anchorRef.current.contains(e.target as Node)
      ) {
        onClose();
      }
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [onClose, anchorRef]);

  const statusColor = STATUS_COLORS[booking.status] ?? 'bg-slate-400';
  const statusLabel = STATUS_LABELS[booking.status] ?? booking.status;

  return (
    <div
      ref={popRef}
      className="absolute z-30 top-full mt-1 left-0 w-64 bg-white border border-slate-200 rounded-xl shadow-xl p-3 text-xs"
    >
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-1.5">
          <span className={`w-2 h-2 rounded-full ${statusColor} shrink-0`} />
          <span className="font-bold text-slate-800 leading-tight">{booking.title}</span>
        </div>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-600 shrink-0"><X size={12} /></button>
      </div>

      <div className="flex flex-col gap-1 text-slate-600 mb-3">
        <div className="flex items-center gap-1.5">
          <CalendarDays size={11} className="text-slate-400 shrink-0" />
          <span>
            {new Date(booking.start_date + 'T00:00:00').toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}
            {booking.start_date !== booking.end_date && (
              <> – {new Date(booking.end_date + 'T00:00:00').toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}</>
            )}
            {booking.start_time && (
              <> · {booking.start_time.slice(0, 5)}{booking.end_time ? `–${booking.end_time.slice(0, 5)}` : ''}</>
            )}
          </span>
        </div>
        {booking.job_name && (
          <div className="flex items-center gap-1.5">
            <Briefcase size={11} className="text-slate-400 shrink-0" />
            <Link
              to={`/job-detail?id=${booking.job_id}`}
              className="text-orange-600 hover:underline truncate"
              onClick={onClose}
            >
              {booking.job_number ? `#${booking.job_number} ` : ''}{booking.job_name}
            </Link>
          </div>
        )}
        {booking.notes && <p className="text-slate-500 mt-1 leading-relaxed">{booking.notes}</p>}
        <span className={`self-start mt-1 px-1.5 py-0.5 rounded-full text-[10px] font-bold text-white ${statusColor}`}>
          {statusLabel}
        </span>
      </div>

      <button
        onClick={onEdit}
        className="w-full flex items-center justify-center gap-1.5 py-1.5 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
      >
        <Pencil size={11} />Edit Booking
      </button>
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

interface Props {
  timeWindow: TimeWindow;
  anchorDate: Date;
  onWindowChange: (tw: TimeWindow) => void;
  onNavigate: (dir: -1 | 1) => void;
  onGoToday: () => void;
  windowLabel: string;
}

export default function AssetSchedulerView({
  timeWindow, anchorDate, onWindowChange, onNavigate, onGoToday, windowLabel,
}: Props) {
  const [assets,   setAssets]   = useState<FleetAsset[]>([]);
  const [bookings, setBookings] = useState<AssetBooking[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState('');

  // Modal state
  const [formOpen,    setFormOpen]    = useState(false);
  const [editBooking, setEditBooking] = useState<AssetBooking | null>(null);
  const [newDefaults, setNewDefaults] = useState<{ fleet_asset_id: number; start_date: string } | null>(null);

  // Popover state
  const [popoverBooking, setPopoverBooking] = useState<AssetBooking | null>(null);
  const popoverAnchorRef = useRef<HTMLDivElement | null>(null);

  const days     = useMemo(() => buildDays(anchorDate, timeWindow), [anchorDate, timeWindow]);
  const dayWidth = DAY_WIDTH[timeWindow];

  const load = useCallback(() => {
    setLoading(true); setError('');
    const start = toDateStr(days[0]);
    const end   = toDateStr(days[days.length - 1]);
    fetch(`/api/fleet/asset-bookings?startDate=${start}&endDate=${end}`, { credentials: 'include' })
      .then(r => r.json())
      .then((d: { bookings?: AssetBooking[]; assets?: FleetAsset[] }) => {
        setBookings(d.bookings ?? []);
        setAssets(d.assets ?? []);
      })
      .catch(() => setError('Failed to load asset bookings.'))
      .finally(() => setLoading(false));
  }, [days]);

  useEffect(() => { load(); }, [load]);

  // Group bookings by asset
  const bookingsByAsset = useMemo(() => {
    const map = new Map<number, AssetBooking[]>();
    for (const b of bookings) {
      const arr = map.get(b.fleet_asset_id) ?? [];
      arr.push(b);
      map.set(b.fleet_asset_id, arr);
    }
    return map;
  }, [bookings]);

  function handleCellClick(assetId: number, date: string) {
    setPopoverBooking(null);
    setEditBooking(null);
    setNewDefaults({ fleet_asset_id: assetId, start_date: date });
    setFormOpen(true);
  }

  function handleEditFromPopover() {
    if (!popoverBooking) return;
    setEditBooking(popoverBooking);
    setPopoverBooking(null);
    setNewDefaults(null);
    setFormOpen(true);
  }

  function handleSaved(booking: AssetBooking) {
    setBookings(prev => {
      const idx = prev.findIndex(b => b.id === booking.id);
      if (idx >= 0) {
        const next = [...prev];
        next[idx] = booking;
        return next;
      }
      return [...prev, booking];
    });
    setFormOpen(false);
    setEditBooking(null);
    setNewDefaults(null);
  }

  function handleDeleted(id: number) {
    setBookings(prev => prev.filter(b => b.id !== id));
    setFormOpen(false);
    setEditBooking(null);
    setPopoverBooking(null);
  }

  const totalWidth = days.length * dayWidth;
  const showEveryDay   = dayWidth >= 36;
  const showEveryOther = dayWidth >= 20;

  return (
    <div className="flex flex-col h-full">
      {/* Sub-toolbar */}
      <div className="flex items-center gap-2 px-4 py-2 border-b border-slate-100 bg-white shrink-0 flex-wrap">
        {/* Window toggle */}
        <div className="flex items-center bg-slate-100 rounded-lg p-0.5 gap-0.5">
          {(Object.keys(WINDOW_LABELS) as TimeWindow[]).map(key => (
            <button
              key={key}
              onClick={() => onWindowChange(key)}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                timeWindow === key ? 'bg-white text-slate-800 shadow-sm' : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              {WINDOW_LABELS[key]}
            </button>
          ))}
        </div>

        {/* Period nav */}
        <div className="flex items-center gap-1">
          <button onClick={() => onNavigate(-1)} className="p-1.5 rounded-md hover:bg-slate-100 text-slate-500 hover:text-slate-700 transition-colors">
            <ChevronLeft size={14} />
          </button>
          <span className="text-xs font-semibold text-slate-700 min-w-[140px] text-center px-1">{windowLabel}</span>
          <button onClick={() => onNavigate(1)} className="p-1.5 rounded-md hover:bg-slate-100 text-slate-500 hover:text-slate-700 transition-colors">
            <ChevronRight size={14} />
          </button>
          <button onClick={onGoToday} className="px-2.5 py-1 text-xs font-semibold text-orange-600 hover:bg-orange-50 rounded-md transition-colors border border-orange-200 ml-1">
            Today
          </button>
        </div>

        <div className="ml-auto flex items-center gap-2">
          {/* Status legend */}
          <div className="hidden lg:flex items-center gap-3">
            {Object.entries(STATUS_LABELS).slice(0, 4).map(([k, v]) => (
              <div key={k} className="flex items-center gap-1">
                <span className={`w-2 h-2 rounded-full ${STATUS_COLORS[k]}`} />
                <span className="text-[10px] text-slate-500">{v}</span>
              </div>
            ))}
          </div>
          <button
            onClick={() => { setEditBooking(null); setNewDefaults(null); setFormOpen(true); }}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-orange-500 hover:bg-orange-600 text-white text-xs font-bold rounded-lg transition-colors"
          >
            <Plus size={12} />New Booking
          </button>
        </div>
      </div>

      {/* Loading / error */}
      {loading && (
        <div className="flex items-center justify-center py-16">
          <Loader2 size={22} className="animate-spin text-orange-500" />
        </div>
      )}
      {!loading && error && (
        <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl m-4 p-4">
          <AlertCircle size={16} />{error}
          <button onClick={load} className="ml-auto text-xs font-semibold underline">Retry</button>
        </div>
      )}

      {/* Empty state */}
      {!loading && !error && assets.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <div className="w-14 h-14 bg-orange-50 rounded-2xl flex items-center justify-center mb-4">
            <Truck size={24} className="text-orange-400" />
          </div>
          <p className="font-bold text-slate-700 mb-1">No fleet assets yet</p>
          <p className="text-sm text-slate-400 mb-4">Add assets in the Fleet module first.</p>
          <Link to="/fleet" className="text-xs font-bold text-orange-600 hover:underline">Go to Fleet</Link>
        </div>
      )}

      {/* Timeline grid */}
      {!loading && !error && assets.length > 0 && (
        <div className="flex-1 overflow-auto">
          <div className="flex min-w-max">
            {/* Sticky asset label column */}
            <div className="w-44 shrink-0 sticky left-0 z-20 bg-white border-r border-slate-200">
              <div className="h-9 border-b border-slate-200 flex items-center px-3">
                <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Asset</span>
              </div>
              {assets.map(a => (
                <div key={a.id} className="h-11 border-b border-slate-100 last:border-0 flex flex-col justify-center px-3 hover:bg-slate-50/50 transition-colors">
                  <Link to={`/fleet/${a.id}`} className="text-xs font-bold text-slate-800 hover:text-orange-600 transition-colors truncate leading-tight">
                    {a.name}
                  </Link>
                  <p className="text-[10px] text-slate-400 truncate mt-0.5">
                    {[a.type, a.rego].filter(Boolean).join(' · ') || a.make_model || '—'}
                  </p>
                </div>
              ))}
            </div>

            {/* Scrollable timeline */}
            <div className="flex-1 overflow-x-auto">
              <div style={{ width: totalWidth }}>
                {/* Day header */}
                <div className="h-9 border-b border-slate-200 flex sticky top-0 bg-white z-10">
                  {days.map((d, i) => {
                    const show = showEveryDay || (showEveryOther && i % 2 === 0) || i % 7 === 0;
                    return (
                      <div
                        key={i}
                        style={{ width: dayWidth }}
                        className={`shrink-0 flex items-center justify-center border-r border-slate-100 ${isToday(d) ? 'bg-orange-50' : ''}`}
                      >
                        {show && (
                          <span className={`text-[10px] font-semibold ${isToday(d) ? 'text-orange-600' : 'text-slate-500'}`}>
                            {dayWidth >= 36
                              ? d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })
                              : d.getDate()}
                          </span>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Asset rows */}
                {assets.map(asset => (
                  <div
                    key={asset.id}
                    className="relative flex border-b border-slate-100 last:border-0 hover:bg-slate-50/30 transition-colors"
                    style={{ height: 44 }}
                  >
                    {/* Day grid cells (non-interactive background) */}
                    <div className="absolute inset-0 flex pointer-events-none">
                      {days.map((d, i) => (
                        <div
                          key={i}
                          style={{ width: dayWidth }}
                          className={`h-full border-r border-slate-100 shrink-0 ${isToday(d) ? 'bg-orange-50/40' : ''}`}
                        />
                      ))}
                    </div>

                    {/* Clickable cells */}
                    <div className="absolute inset-0 flex">
                      {days.map((d, i) => (
                        <div
                          key={i}
                          style={{ width: dayWidth }}
                          className="h-full shrink-0 cursor-pointer hover:bg-orange-50/30 transition-colors"
                          onClick={() => handleCellClick(asset.id, toDateStr(d))}
                          title={`Book ${asset.name} on ${fmtFull(d)}`}
                        />
                      ))}
                    </div>

                    {/* Booking bars */}
                    {(bookingsByAsset.get(asset.id) ?? []).map(b => {
                      const pos = bookingPosition(b, days, dayWidth);
                      if (!pos) return null;
                      const color    = STATUS_COLORS[b.status] ?? 'bg-slate-400';
                      const isActive = popoverBooking?.id === b.id;
                      return (
                        <div
                          key={b.id}
                          className={`absolute top-2 h-7 rounded-md ${color} text-white text-[10px] font-semibold flex items-center px-2 cursor-pointer hover:brightness-110 transition-all shadow-sm overflow-hidden whitespace-nowrap z-10 ${isActive ? 'ring-2 ring-white ring-offset-1' : ''}`}
                          style={{ left: pos.left + 2, width: Math.max(pos.width - 4, 20) }}
                          onClick={e => { e.stopPropagation(); setPopoverBooking(b); }}
                          title={b.title}
                        >
                          <span className="truncate">{b.title}</span>
                        </div>
                      );
                    })}

                    {/* Today line */}
                    {(() => {
                      const todayIdx = days.findIndex(d => isToday(d));
                      if (todayIdx < 0) return null;
                      return (
                        <div
                          className="absolute top-0 bottom-0 w-0.5 bg-orange-400 z-20 pointer-events-none"
                          style={{ left: todayIdx * dayWidth + dayWidth / 2 }}
                        />
                      );
                    })()}

                    {/* Popover */}
                    {popoverBooking && popoverBooking.fleet_asset_id === asset.id && (
                      <div
                        className="absolute top-0 z-30"
                        style={{ left: (() => {
                          const pos = bookingPosition(popoverBooking, days, dayWidth);
                          return pos ? pos.left + 2 : 0;
                        })() }}
                      >
                        <BookingPopover
                          booking={popoverBooking}
                          onEdit={handleEditFromPopover}
                          onClose={() => setPopoverBooking(null)}
                          anchorRef={popoverAnchorRef}
                        />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Summary footer */}
          <div className="px-4 py-2 border-t border-slate-100 bg-slate-50 text-[10px] text-slate-400 flex items-center gap-4">
            <span>{assets.length} assets</span>
            <span>{bookings.length} bookings in view</span>
            <span className="ml-auto">Click any cell to book · Click a bar to view/edit</span>
          </div>
        </div>
      )}

      {/* Booking form modal */}
      <AnimatePresence>
        {formOpen && (
          <BookingFormModal
            assets={assets}
            initial={
              editBooking ?? (
                newDefaults
                  ? { fleet_asset_id: newDefaults.fleet_asset_id, start_date: newDefaults.start_date, end_date: newDefaults.start_date }
                  : undefined
              )
            }
            onClose={() => { setFormOpen(false); setEditBooking(null); setNewDefaults(null); }}
            onSaved={handleSaved}
            onDeleted={handleDeleted}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
