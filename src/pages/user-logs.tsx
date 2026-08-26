/**
 * UserLogsPage — /user-logs
 *
 * Report builder: pick users, jobs, date range, log types → Generate Report.
 * No table headers. Each section renders as a clean card-list.
 * Desktop only (op-* classes, min-width: 768px guard in globals.css).
 */
import { useState, useCallback, useRef } from 'react';
import { Helmet } from '@dr.pogodin/react-helmet';
import {
  Search, ChevronDown, X, Calendar, RefreshCw, Download,
  UserCheck, Truck, Clock, Activity, Users, Briefcase,
  CheckCircle2, AlertCircle, ChevronRight, LayoutDashboard,
} from 'lucide-react';
import { format, formatDistanceToNow, parseISO } from 'date-fns';
import DesktopTopBar from '@/components/DesktopTopBar';
import DesktopDock from '@/components/DesktopDock';
import PortalSidebar from '@/components/PortalSidebar';

// ── Types ─────────────────────────────────────────────────────────────────────

interface UserOption {
  user_id: string;
  name: string;
  email: string;
  role: string;
  status: string;
}

interface JobOption {
  id: number;
  job_number: string;
  title: string;
  status: string;
}

type LogType = 'signin' | 'fleet' | 'timeentries' | 'activity';

interface SigninRow {
  id: number;
  user_name: string | null;
  user_email: string | null;
  job_name: string | null;
  job_number: string | null;
  action: string;
  source: string;
  actor_type: string;
  notes: string | null;
  created_at: string;
}

interface FleetRow {
  id: number;
  user_name: string | null;
  user_email: string | null;
  fleet_name: string | null;
  fleet_registration: string | null;
  job_name: string | null;
  job_number: string | null;
  started_at: string;
  ended_at: string | null;
  duration_minutes: number | null;
  meter_start: number | null;
  meter_end: number | null;
  note: string | null;
  source: string | null;
}

interface TimeEntryRow {
  id: number;
  user_name: string | null;
  user_email: string | null;
  job_name: string | null;
  job_number: string | null;
  entry_date: string;
  clock_in: string | null;
  clock_out: string | null;
  break_minutes: number | null;
  total_minutes: number | null;
  hourly_rate: number | null;
  status: string;
  notes: string | null;
  approved_by_name: string | null;
  approved_at: string | null;
}

interface ActivityRow {
  id: number;
  user_id: string;
  email: string | null;
  event_type: string;
  entity_type: string | null;
  entity_id: string | null;
  description: string | null;
  ip_address: string | null;
  success: number;
  created_at: string;
}

interface LogsResult {
  ok: boolean;
  signin: SigninRow[];
  fleet: FleetRow[];
  timeentries: TimeEntryRow[];
  activity: ActivityRow[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtTime(iso: string | null | undefined): string {
  if (!iso) return '—';
  try { return format(parseISO(iso), 'd MMM yyyy, h:mm a'); } catch { return iso; }
}

function fmtDate(iso: string | null | undefined): string {
  if (!iso) return '—';
  try { return format(parseISO(iso), 'd MMM yyyy'); } catch { return iso; }
}

function fmtDuration(mins: number | null | undefined): string {
  if (!mins) return '—';
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h === 0) return `${m}m`;
  if (m === 0) return `${h}h`;
  return `${h}h ${m}m`;
}

function fmtMeter(v: number | null | undefined): string {
  if (v == null) return '—';
  return v.toLocaleString();
}

function ago(iso: string): string {
  try { return formatDistanceToNow(parseISO(iso), { addSuffix: true }); } catch { return iso; }
}

// ── Sub-components ────────────────────────────────────────────────────────────

function SectionHeader({ icon: Icon, label, count, color }: {
  icon: React.ElementType; label: string; count: number; color: string;
}) {
  return (
    <div className="flex items-center gap-2 mb-3">
      <div className={`w-7 h-7 rounded flex items-center justify-center ${color}`}>
        <Icon size={14} className="text-white" />
      </div>
      <span className="text-sm font-semibold text-gray-800">{label}</span>
      <span className="ml-auto text-xs text-gray-400 tabular-nums">{count} record{count !== 1 ? 's' : ''}</span>
    </div>
  );
}

function EmptySection({ label }: { label: string }) {
  return (
    <div className="text-center py-8 text-gray-400 text-sm">
      No {label} found for the selected filters.
    </div>
  );
}

// ── Sign-in section ───────────────────────────────────────────────────────────
function SigninSection({ rows }: { rows: SigninRow[] }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 p-4 mb-4">
      <SectionHeader icon={UserCheck} label="Site Sign-ins" count={rows.length} color="bg-blue-500" />
      {rows.length === 0 ? <EmptySection label="sign-ins" /> : (
        <div className="divide-y divide-gray-50">
          {rows.map((r) => (
            <div key={r.id} className="py-2.5 flex items-start gap-3">
              <div className="w-7 h-7 rounded-full bg-blue-50 flex items-center justify-center shrink-0 mt-0.5">
                <span className="text-[10px] font-bold text-blue-600">
                  {(r.user_name || r.user_email || '?')[0].toUpperCase()}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium text-gray-800">{r.user_name || r.user_email || 'Unknown'}</span>
                  <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded uppercase tracking-wide ${
                    r.action === 'signin' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
                  }`}>{r.action}</span>
                  {r.source && r.source !== 'portal' && (
                    <span className="text-[10px] text-gray-400 bg-gray-50 px-1.5 py-0.5 rounded">{r.source}</span>
                  )}
                </div>
                <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                  {r.job_name && (
                    <span className="text-xs text-gray-500 flex items-center gap-1">
                      <Briefcase size={10} className="text-gray-400" />
                      {r.job_number ? `#${r.job_number} ` : ''}{r.job_name}
                    </span>
                  )}
                  <span className="text-xs text-gray-400">{fmtTime(r.created_at)}</span>
                </div>
                {r.notes && <p className="text-xs text-gray-400 mt-0.5 italic">{r.notes}</p>}
              </div>
              <span className="text-[10px] text-gray-300 shrink-0 mt-1">{ago(r.created_at)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Fleet section ─────────────────────────────────────────────────────────────
function FleetSection({ rows }: { rows: FleetRow[] }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 p-4 mb-4">
      <SectionHeader icon={Truck} label="Vehicle Usage" count={rows.length} color="bg-violet-500" />
      {rows.length === 0 ? <EmptySection label="vehicle usage" /> : (
        <div className="divide-y divide-gray-50">
          {rows.map((r) => (
            <div key={r.id} className="py-2.5 flex items-start gap-3">
              <div className="w-7 h-7 rounded-full bg-violet-50 flex items-center justify-center shrink-0 mt-0.5">
                <Truck size={12} className="text-violet-600" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium text-gray-800">{r.user_name || r.user_email || 'Unknown'}</span>
                  <ChevronRight size={12} className="text-gray-300" />
                  <span className="text-sm text-gray-700">{r.fleet_name || 'Unknown vehicle'}</span>
                  {r.fleet_registration && (
                    <span className="text-[10px] font-mono bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">{r.fleet_registration}</span>
                  )}
                  {!r.ended_at && (
                    <span className="text-[10px] font-semibold bg-green-100 text-green-700 px-1.5 py-0.5 rounded">In use</span>
                  )}
                </div>
                <div className="flex items-center gap-3 mt-0.5 flex-wrap text-xs text-gray-500">
                  <span>{fmtTime(r.started_at)}</span>
                  {r.ended_at && <><span className="text-gray-300">→</span><span>{fmtTime(r.ended_at)}</span></>}
                  {r.duration_minutes != null && (
                    <span className="font-medium text-gray-700">{fmtDuration(r.duration_minutes)}</span>
                  )}
                  {r.job_name && (
                    <span className="flex items-center gap-1">
                      <Briefcase size={10} className="text-gray-400" />
                      {r.job_number ? `#${r.job_number} ` : ''}{r.job_name}
                    </span>
                  )}
                </div>
                {(r.meter_start != null || r.meter_end != null) && (
                  <div className="text-xs text-gray-400 mt-0.5">
                    Meter: {fmtMeter(r.meter_start)} → {r.meter_end != null ? fmtMeter(r.meter_end) : 'ongoing'}
                  </div>
                )}
                {r.note && <p className="text-xs text-gray-400 mt-0.5 italic">{r.note}</p>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Time entries section ──────────────────────────────────────────────────────
function TimeEntriesSection({ rows }: { rows: TimeEntryRow[] }) {
  const totalMins = rows.reduce((s, r) => s + (r.total_minutes ?? 0), 0);
  return (
    <div className="bg-white rounded-xl border border-gray-100 p-4 mb-4">
      <SectionHeader icon={Clock} label="Time Entries" count={rows.length} color="bg-violet-500" />
      {rows.length > 0 && (
        <div className="flex items-center gap-4 mb-3 p-2.5 bg-violet-50 rounded-lg">
          <div className="text-center">
            <div className="text-lg font-bold text-violet-700">{fmtDuration(totalMins)}</div>
            <div className="text-[10px] text-violet-500">Total hours</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-bold text-violet-700">{rows.length}</div>
            <div className="text-[10px] text-violet-500">Entries</div>
          </div>
          <div className="text-center">
            <div className="text-lg font-bold text-violet-700">
              {rows.filter(r => r.status === 'approved').length}
            </div>
            <div className="text-[10px] text-violet-500">Approved</div>
          </div>
        </div>
      )}
      {rows.length === 0 ? <EmptySection label="time entries" /> : (
        <div className="divide-y divide-gray-50">
          {rows.map((r) => (
            <div key={r.id} className="py-2.5 flex items-start gap-3">
              <div className="w-7 h-7 rounded-full bg-violet-50 flex items-center justify-center shrink-0 mt-0.5">
                <span className="text-[10px] font-bold text-violet-600">
                  {(r.user_name || '?')[0].toUpperCase()}
                </span>
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-sm font-medium text-gray-800">{r.user_name || r.user_email || 'Unknown'}</span>
                  <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded uppercase tracking-wide ${
                    r.status === 'approved' ? 'bg-green-100 text-green-700'
                    : r.status === 'pending' ? 'bg-amber-100 text-amber-700'
                    : 'bg-gray-100 text-gray-600'
                  }`}>{r.status}</span>
                  {r.total_minutes != null && (
                    <span className="text-xs font-semibold text-violet-700">{fmtDuration(r.total_minutes)}</span>
                  )}
                </div>
                <div className="flex items-center gap-3 mt-0.5 flex-wrap text-xs text-gray-500">
                  <span>{fmtDate(r.entry_date)}</span>
                  {r.clock_in && <span>{r.clock_in.slice(0, 5)}</span>}
                  {r.clock_out && <><span className="text-gray-300">→</span><span>{r.clock_out.slice(0, 5)}</span></>}
                  {r.break_minutes ? <span className="text-gray-400">{r.break_minutes}m break</span> : null}
                  {r.job_name && (
                    <span className="flex items-center gap-1">
                      <Briefcase size={10} className="text-gray-400" />
                      {r.job_number ? `#${r.job_number} ` : ''}{r.job_name}
                    </span>
                  )}
                </div>
                {r.approved_by_name && (
                  <div className="text-xs text-gray-400 mt-0.5 flex items-center gap-1">
                    <CheckCircle2 size={10} className="text-green-500" />
                    Approved by {r.approved_by_name}
                    {r.approved_at ? ` · ${fmtDate(r.approved_at)}` : ''}
                  </div>
                )}
                {r.notes && <p className="text-xs text-gray-400 mt-0.5 italic">{r.notes}</p>}
              </div>
              {r.hourly_rate != null && (
                <div className="text-xs font-semibold text-gray-600 shrink-0 mt-1">
                  ${r.hourly_rate}/hr
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Activity section ──────────────────────────────────────────────────────────
function ActivitySection({ rows }: { rows: ActivityRow[] }) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 p-4 mb-4">
      <SectionHeader icon={Activity} label="Platform Activity" count={rows.length} color="bg-gray-600" />
      {rows.length === 0 ? <EmptySection label="activity" /> : (
        <div className="divide-y divide-gray-50">
          {rows.map((r) => (
            <div key={r.id} className="py-2 flex items-start gap-3">
              <div className={`w-5 h-5 rounded-full flex items-center justify-center shrink-0 mt-0.5 ${
                r.success ? 'bg-green-100' : 'bg-red-100'
              }`}>
                {r.success
                  ? <CheckCircle2 size={11} className="text-green-600" />
                  : <AlertCircle  size={11} className="text-red-500" />
                }
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-medium text-gray-700">{r.email || r.user_id}</span>
                  <span className="text-[10px] bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded font-mono">{r.event_type}</span>
                  {r.entity_type && (
                    <span className="text-[10px] text-gray-400">{r.entity_type}{r.entity_id ? ` #${r.entity_id}` : ''}</span>
                  )}
                </div>
                {r.description && <p className="text-xs text-gray-500 mt-0.5">{r.description}</p>}
                <div className="flex items-center gap-3 mt-0.5 text-[10px] text-gray-400">
                  <span>{fmtTime(r.created_at)}</span>
                  {r.ip_address && <span className="font-mono">{r.ip_address}</span>}
                </div>
              </div>
              <span className="text-[10px] text-gray-300 shrink-0 mt-1">{ago(r.created_at)}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── User picker dropdown ──────────────────────────────────────────────────────
function UserPicker({
  users,
  selected,
  onChange,
}: {
  users: UserOption[];
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const ref = useRef<HTMLDivElement>(null);

  const filtered = users.filter(u =>
    !q || u.name.toLowerCase().includes(q.toLowerCase()) || u.email.toLowerCase().includes(q.toLowerCase())
  );

  const toggle = (id: string) => {
    onChange(selected.includes(id) ? selected.filter(x => x !== id) : [...selected, id]);
  };

  const selectedUsers = users.filter(u => selected.includes(u.user_id));

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 h-9 px-3 rounded-lg border border-gray-200 bg-white text-sm text-gray-700 hover:border-gray-300 transition-colors min-w-[180px] max-w-[280px]"
      >
        <Users size={14} className="text-gray-400 shrink-0" />
        <span className="flex-1 text-left truncate">
          {selected.length === 0
            ? 'All users'
            : selected.length === 1
            ? selectedUsers[0]?.name || 'Unknown'
            : `${selected.length} users`}
        </span>
        {selected.length > 0 && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onChange([]); }}
            className="text-gray-300 hover:text-gray-600 transition-colors"
          >
            <X size={12} />
          </button>
        )}
        <ChevronDown size={13} className={`text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1 w-72 bg-white border border-gray-200 rounded-xl shadow-xl z-50 overflow-hidden">
          <div className="p-2 border-b border-gray-100">
            <div className="flex items-center gap-2 px-2 py-1.5 bg-gray-50 rounded-lg">
              <Search size={13} className="text-gray-400" />
              <input
                autoFocus
                value={q}
                onChange={e => setQ(e.target.value)}
                placeholder="Search users..."
                className="flex-1 bg-transparent text-sm outline-none text-gray-700 placeholder-gray-400"
              />
            </div>
          </div>
          <div className="max-h-56 overflow-y-auto py-1">
            {filtered.length === 0 && (
              <div className="px-4 py-3 text-sm text-gray-400 text-center">No users found</div>
            )}
            {filtered.map(u => (
              <button
                key={u.user_id}
                type="button"
                onClick={() => toggle(u.user_id)}
                className="w-full flex items-center gap-3 px-3 py-2 hover:bg-gray-50 transition-colors text-left"
              >
                <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold shrink-0 ${
                  selected.includes(u.user_id) ? 'bg-violet-500 text-white' : 'bg-gray-100 text-gray-600'
                }`}>
                  {u.name[0]?.toUpperCase() || '?'}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-gray-800 truncate">{u.name}</div>
                  <div className="text-[10px] text-gray-400 truncate">{u.email}</div>
                </div>
                {selected.includes(u.user_id) && (
                  <CheckCircle2 size={14} className="text-violet-600 shrink-0" />
                )}
              </button>
            ))}
          </div>
          {selected.length > 0 && (
            <div className="border-t border-gray-100 p-2">
              <button
                type="button"
                onClick={() => { onChange([]); setOpen(false); }}
                className="w-full text-xs text-gray-500 hover:text-gray-700 py-1 transition-colors"
              >
                Clear selection
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Job picker dropdown ───────────────────────────────────────────────────────
function JobPicker({
  jobs,
  selected,
  onChange,
}: {
  jobs: JobOption[];
  selected: number | null;
  onChange: (id: number | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');

  const filtered = jobs.filter(j =>
    !q
    || j.title.toLowerCase().includes(q.toLowerCase())
    || j.job_number.toLowerCase().includes(q.toLowerCase())
  );

  const selectedJob = jobs.find(j => j.id === selected);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="flex items-center gap-2 h-9 px-3 rounded-lg border border-gray-200 bg-white text-sm text-gray-700 hover:border-gray-300 transition-colors min-w-[180px] max-w-[260px]"
      >
        <Briefcase size={14} className="text-gray-400 shrink-0" />
        <span className="flex-1 text-left truncate">
          {selectedJob ? `#${selectedJob.job_number} ${selectedJob.title}` : 'All jobs'}
        </span>
        {selected && (
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onChange(null); }}
            className="text-gray-300 hover:text-gray-600 transition-colors"
          >
            <X size={12} />
          </button>
        )}
        <ChevronDown size={13} className={`text-gray-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1 w-80 bg-white border border-gray-200 rounded-xl shadow-xl z-50 overflow-hidden">
          <div className="p-2 border-b border-gray-100">
            <div className="flex items-center gap-2 px-2 py-1.5 bg-gray-50 rounded-lg">
              <Search size={13} className="text-gray-400" />
              <input
                autoFocus
                value={q}
                onChange={e => setQ(e.target.value)}
                placeholder="Search jobs..."
                className="flex-1 bg-transparent text-sm outline-none text-gray-700 placeholder-gray-400"
              />
            </div>
          </div>
          <div className="max-h-56 overflow-y-auto py-1">
            <button
              type="button"
              onClick={() => { onChange(null); setOpen(false); }}
              className="w-full flex items-center gap-3 px-3 py-2 hover:bg-gray-50 transition-colors text-left"
            >
              <span className="text-sm text-gray-500">All jobs</span>
              {!selected && <CheckCircle2 size={14} className="text-violet-600 ml-auto" />}
            </button>
            {filtered.map(j => (
              <button
                key={j.id}
                type="button"
                onClick={() => { onChange(j.id); setOpen(false); }}
                className="w-full flex items-center gap-3 px-3 py-2 hover:bg-gray-50 transition-colors text-left"
              >
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-medium text-gray-800 truncate">{j.title}</div>
                  <div className="text-[10px] text-gray-400">#{j.job_number} · {j.status}</div>
                </div>
                {selected === j.id && <CheckCircle2 size={14} className="text-violet-600 shrink-0" />}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Log type toggle ───────────────────────────────────────────────────────────
const LOG_TYPE_OPTIONS: { key: LogType; label: string; icon: React.ElementType; color: string }[] = [
  { key: 'signin',      label: 'Site Sign-ins',      icon: UserCheck, color: 'bg-blue-500' },
  { key: 'fleet',       label: 'Vehicle Usage',      icon: Truck,     color: 'bg-violet-500' },
  { key: 'timeentries', label: 'Time Entries',        icon: Clock,     color: 'bg-violet-500' },
  { key: 'activity',    label: 'Platform Activity',  icon: Activity,  color: 'bg-gray-600' },
];

function LogTypeToggle({
  selected,
  onChange,
}: {
  selected: Set<LogType>;
  onChange: (s: Set<LogType>) => void;
}) {
  const toggle = (key: LogType) => {
    const next = new Set(selected);
    if (next.has(key)) { if (next.size > 1) next.delete(key); }
    else next.add(key);
    onChange(next);
  };

  return (
    <div className="flex items-center gap-1.5 flex-wrap">
      {LOG_TYPE_OPTIONS.map(({ key, label, icon: Icon, color }) => {
        const active = selected.has(key);
        return (
          <button
            key={key}
            type="button"
            onClick={() => toggle(key)}
            className={`flex items-center gap-1.5 h-8 px-3 rounded-lg text-xs font-medium transition-all ${
              active
                ? `${color} text-white shadow-sm`
                : 'bg-white border border-gray-200 text-gray-500 hover:border-gray-300'
            }`}
          >
            <Icon size={12} />
            {label}
          </button>
        );
      })}
    </div>
  );
}

// ── CSV export ────────────────────────────────────────────────────────────────
function exportCsv(data: LogsResult, types: Set<LogType>) {
  const lines: string[] = ['\uFEFF']; // BOM

  function esc(v: unknown): string {
    if (v == null) return '';
    const s = String(v);
    if (s.includes(',') || s.includes('"') || s.includes('\n')) return `"${s.replace(/"/g, '""')}"`;
    return s;
  }

  if (types.has('signin') && data.signin.length > 0) {
    lines.push('SITE SIGN-INS');
    lines.push(['User', 'Email', 'Action', 'Job', 'Job#', 'Source', 'Notes', 'Date/Time'].join(','));
    data.signin.forEach(r => lines.push([
      esc(r.user_name), esc(r.user_email), esc(r.action),
      esc(r.job_name), esc(r.job_number), esc(r.source), esc(r.notes), esc(r.created_at),
    ].join(',')));
    lines.push('');
  }

  if (types.has('fleet') && data.fleet.length > 0) {
    lines.push('VEHICLE USAGE');
    lines.push(['User', 'Vehicle', 'Rego', 'Job', 'Job#', 'Started', 'Ended', 'Duration (min)', 'Meter Start', 'Meter End', 'Note'].join(','));
    data.fleet.forEach(r => lines.push([
      esc(r.user_name), esc(r.fleet_name), esc(r.fleet_registration),
      esc(r.job_name), esc(r.job_number), esc(r.started_at), esc(r.ended_at),
      esc(r.duration_minutes), esc(r.meter_start), esc(r.meter_end), esc(r.note),
    ].join(',')));
    lines.push('');
  }

  if (types.has('timeentries') && data.timeentries.length > 0) {
    lines.push('TIME ENTRIES');
    lines.push(['User', 'Email', 'Date', 'Clock In', 'Clock Out', 'Break (min)', 'Total (min)', 'Hourly Rate', 'Status', 'Job', 'Job#', 'Approved By', 'Notes'].join(','));
    data.timeentries.forEach(r => lines.push([
      esc(r.user_name), esc(r.user_email), esc(r.entry_date), esc(r.clock_in), esc(r.clock_out),
      esc(r.break_minutes), esc(r.total_minutes), esc(r.hourly_rate), esc(r.status),
      esc(r.job_name), esc(r.job_number), esc(r.approved_by_name), esc(r.notes),
    ].join(',')));
    lines.push('');
  }

  if (types.has('activity') && data.activity.length > 0) {
    lines.push('PLATFORM ACTIVITY');
    lines.push(['Email', 'Event Type', 'Entity Type', 'Entity ID', 'Description', 'IP Address', 'Success', 'Date/Time'].join(','));
    data.activity.forEach(r => lines.push([
      esc(r.email), esc(r.event_type), esc(r.entity_type), esc(r.entity_id),
      esc(r.description), esc(r.ip_address), esc(r.success ? 'Yes' : 'No'), esc(r.created_at),
    ].join(',')));
  }

  const blob = new Blob([lines.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `user-logs-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function UserLogsPage() {
  // Filter state
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const [selectedJob,   setSelectedJob]   = useState<number | null>(null);
  const [dateFrom,      setDateFrom]       = useState('');
  const [dateTo,        setDateTo]         = useState('');
  const [logTypes,      setLogTypes]       = useState<Set<LogType>>(
    new Set(['signin', 'fleet', 'timeentries', 'activity'])
  );

  // Data state
  const [users,   setUsers]   = useState<UserOption[]>([]);
  const [jobs,    setJobs]    = useState<JobOption[]>([]);
  const [result,  setResult]  = useState<LogsResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error,   setError]   = useState<string | null>(null);
  const [hasRun,  setHasRun]  = useState(false);

  // Load users + jobs on mount
  const loadedRef = useRef(false);
  const loadMeta = useCallback(async () => {
    if (loadedRef.current) return;
    loadedRef.current = true;
    try {
      const [uRes, jRes] = await Promise.all([
        fetch('/api/user-logs/users', { credentials: 'include' }),
        fetch('/api/forms/jobs-list',  { credentials: 'include' }),
      ]);
      if (uRes.ok) { const d = await uRes.json(); setUsers(d.users ?? []); }
      if (jRes.ok) { const d = await jRes.json(); setJobs(d.jobs ?? []); }
    } catch { /* silent */ }
  }, []);

  // Trigger meta load on first render
  useState(() => { loadMeta(); });

  async function generate() {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      if (selectedUsers.length === 1) params.set('userId', selectedUsers[0]);
      if (selectedJob)   params.set('jobId',    String(selectedJob));
      if (dateFrom)      params.set('dateFrom', dateFrom);
      if (dateTo)        params.set('dateTo',   dateTo);
      params.set('types', [...logTypes].join(','));

      const res = await fetch(`/api/user-logs?${params}`, { credentials: 'include' });
      if (!res.ok) throw new Error(`Server error ${res.status}`);
      const data: LogsResult = await res.json();
      setResult(data);
      setHasRun(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load logs');
    } finally {
      setLoading(false);
    }
  }

  const totalRecords = result
    ? (result.signin?.length ?? 0) + (result.fleet?.length ?? 0)
      + (result.timeentries?.length ?? 0) + (result.activity?.length ?? 0)
    : 0;

  return (
    <div className="flex-1 bg-[#f5f6f8] flex flex-col lg-portal">
      <PortalSidebar />
      <DesktopTopBar />
      <DesktopDock />
      <Helmet>
        <title>User Logs — IWILLBUILD</title>
        <meta name="description" content="View site sign-ins, vehicle usage, time entries and platform activity across your team." />
        <link rel="canonical" href="https://iwillbuild.com/user-logs" />
        <meta name="robots" content="noindex" />
      </Helmet>
      {/* ── Page header ── */}
      {/* ── Breadcrumb ── */}
      <div className="bg-white border-b border-gray-100 px-6 py-2 flex items-center gap-1.5 text-[12px] text-gray-400">
        <a
          href="/?page=2"
          className="flex items-center gap-1 text-gray-400 hover:text-primary transition-colors"
        >
          <LayoutDashboard size={12} />
          Home
        </a>
        <ChevronRight size={11} className="text-gray-300" />
        <span className="text-gray-600 font-medium">User Logs</span>
      </div>

      <div className="bg-white border-b border-gray-100 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-heading font-bold text-base text-gray-900">User Logs</h1>
            <p className="text-xs text-gray-400 mt-0.5">
              Site sign-ins · vehicle usage · time entries · platform activity
            </p>
          </div>
          {result && totalRecords > 0 && (
            <button
              type="button"
              onClick={() => exportCsv(result, logTypes)}
              className="flex items-center gap-2 h-9 px-4 rounded-lg bg-gray-800 text-white text-sm font-medium hover:bg-gray-900 transition-colors"
            >
              <Download size={14} />
              Export CSV
            </button>
          )}
        </div>
      </div>

      {/* ── Filter bar ── */}
      <div className="bg-white border-b border-gray-100 px-6 py-3">
        <div className="flex items-center gap-3 flex-wrap">
          {/* User picker */}
          <UserPicker
            users={users}
            selected={selectedUsers}
            onChange={setSelectedUsers}
          />

          {/* Job picker */}
          <JobPicker
            jobs={jobs}
            selected={selectedJob}
            onChange={setSelectedJob}
          />

          {/* Date from */}
          <div className="flex items-center gap-1.5 h-9 px-3 rounded-lg border border-gray-200 bg-white">
            <Calendar size={13} className="text-gray-400" />
            <input
              type="date"
              value={dateFrom}
              onChange={e => setDateFrom(e.target.value)}
              className="text-sm text-gray-700 outline-none bg-transparent w-32"
              placeholder="From"
            />
          </div>

          {/* Date to */}
          <div className="flex items-center gap-1.5 h-9 px-3 rounded-lg border border-gray-200 bg-white">
            <Calendar size={13} className="text-gray-400" />
            <input
              type="date"
              value={dateTo}
              onChange={e => setDateTo(e.target.value)}
              className="text-sm text-gray-700 outline-none bg-transparent w-32"
              placeholder="To"
            />
          </div>

          {/* Divider */}
          <div className="w-px h-6 bg-gray-200" />

          {/* Log type toggles */}
          <LogTypeToggle selected={logTypes} onChange={setLogTypes} />

          {/* Divider */}
          <div className="w-px h-6 bg-gray-200" />

          {/* Generate button */}
          <button
            type="button"
            onClick={generate}
            disabled={loading}
            className="flex items-center gap-2 h-9 px-5 rounded-lg bg-violet-500 text-white text-sm font-semibold hover:bg-violet-700 disabled:opacity-60 transition-colors shadow-sm ml-auto"
          >
            {loading
              ? <RefreshCw size={14} className="animate-spin" />
              : <RefreshCw size={14} />
            }
            {loading ? 'Loading…' : 'Generate Report'}
          </button>
        </div>
      </div>

      {/* ── Report body ── */}
      <div className="px-6 py-5 max-w-5xl">
        {/* Error */}
        {error && (
          <div className="mb-4 flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            <AlertCircle size={15} className="shrink-0" />
            {error}
          </div>
        )}

        {/* Empty state — not yet run */}
        {!hasRun && !loading && (
          <div className="flex flex-col items-center justify-center py-24 text-center">
            <div className="w-14 h-14 rounded-2xl bg-gray-100 flex items-center justify-center mb-4">
              <Activity size={24} className="text-gray-400" />
            </div>
            <p className="text-sm font-medium text-gray-600">Select your filters and generate a report</p>
            <p className="text-xs text-gray-400 mt-1">
              Choose users, jobs, date range and log types above, then click Generate Report.
            </p>
          </div>
        )}

        {/* Loading skeleton */}
        {loading && (
          <div className="space-y-4">
            {[1, 2, 3].map(i => (
              <div key={i} className="bg-white rounded-xl border border-gray-100 p-4 animate-pulse">
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-7 h-7 rounded bg-gray-100" />
                  <div className="h-4 w-32 bg-gray-100 rounded" />
                </div>
                {[1, 2, 3].map(j => (
                  <div key={j} className="flex items-center gap-3 py-2.5 border-t border-gray-50">
                    <div className="w-7 h-7 rounded-full bg-gray-100 shrink-0" />
                    <div className="flex-1 space-y-1.5">
                      <div className="h-3 w-40 bg-gray-100 rounded" />
                      <div className="h-2.5 w-64 bg-gray-50 rounded" />
                    </div>
                  </div>
                ))}
              </div>
            ))}
          </div>
        )}

        {/* Results */}
        {hasRun && !loading && result && (
          <>
            {/* Summary bar */}
            <div className="flex items-center gap-4 mb-5 p-3 bg-white rounded-xl border border-gray-100">
              <span className="text-sm font-semibold text-gray-800">
                {totalRecords === 0 ? 'No records found' : `${totalRecords} total record${totalRecords !== 1 ? 's' : ''}`}
              </span>
              <div className="flex items-center gap-3 ml-auto text-xs text-gray-400">
                {logTypes.has('signin')      && <span className="flex items-center gap-1"><UserCheck size={11} className="text-blue-500" />{result.signin.length} sign-ins</span>}
                {logTypes.has('fleet')       && <span className="flex items-center gap-1"><Truck     size={11} className="text-violet-600" />{result.fleet.length} vehicle</span>}
                {logTypes.has('timeentries') && <span className="flex items-center gap-1"><Clock     size={11} className="text-violet-500" />{result.timeentries.length} time</span>}
                {logTypes.has('activity')    && <span className="flex items-center gap-1"><Activity  size={11} className="text-gray-500" />{result.activity.length} activity</span>}
              </div>
            </div>

            {logTypes.has('signin')      && <SigninSection      rows={result.signin}      />}
            {logTypes.has('fleet')       && <FleetSection       rows={result.fleet}       />}
            {logTypes.has('timeentries') && <TimeEntriesSection rows={result.timeentries} />}
            {logTypes.has('activity')    && <ActivitySection    rows={result.activity}    />}
          </>
        )}
      </div>
    </div>
  );
}
