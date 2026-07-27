/**
 * /lists — Office Lists view
 *
 * Desktop-only data table feature. Gives office users a SharePoint-style
 * interface to inspect, filter, sort, and export key IWILLBUILD records.
 *
 * Lists: Jobs | Tasks | Notes | Incidents | Attendance | Costs
 *
 * Design principles:
 *  - Compact rows, sticky header, no cards, no hero sections
 *  - Search + filter toolbar above table
 *  - Pagination
 *  - CSV export of current filtered view
 *  - Company isolation enforced server-side
 */

import { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Helmet } from '@dr.pogodin/react-helmet';
import {
  Search, Download, ChevronUp, ChevronDown, ChevronsUpDown,
  Loader2, AlertCircle, ChevronLeft, ChevronRight,
  HardHat, CheckSquare, StickyNote, ShieldAlert,
  LogIn, DollarSign, Filter, X,
} from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────

type ListType = 'jobs' | 'tasks' | 'notes' | 'incidents' | 'attendance' | 'costs';

interface ListMeta {
  key: ListType;
  label: string;
  icon: React.ElementType;
  description: string;
}

const LIST_DEFS: ListMeta[] = [
  { key: 'jobs',       label: 'Jobs',       icon: HardHat,     description: 'All jobs with status, customer, and progress' },
  { key: 'tasks',      label: 'Tasks',      icon: CheckSquare, description: 'Job tasks and to-dos across all jobs' },
  { key: 'notes',      label: 'Notes',      icon: StickyNote,  description: 'Notes and comments attached to jobs' },
  { key: 'incidents',  label: 'Incidents',  icon: ShieldAlert, description: 'Safety incidents and corrective actions' },
  { key: 'attendance', label: 'Attendance', icon: LogIn,       description: 'Sign-in / sign-out records across all jobs' },
  { key: 'costs',      label: 'Costs',      icon: DollarSign,  description: 'Job costs, purchases, and expenses' },
];

interface ColDef {
  key: string;
  label: string;
  sortable?: boolean;
  width?: string;
  render?: (val: unknown, row: Record<string, unknown>) => React.ReactNode;
}

// ── Column definitions per list ───────────────────────────────────────────────

function fmtDate(v: unknown): string {
  if (!v) return '—';
  const s = String(v);
  if (s.length >= 10) return s.slice(0, 10);
  return s;
}

function fmtDateTime(v: unknown): string {
  if (!v) return '—';
  const s = String(v);
  // "2026-07-15T04:30:00.000Z" → "2026-07-15 14:30" (local)
  try {
    const d = new Date(s);
    if (isNaN(d.getTime())) return s.slice(0, 16).replace('T', ' ');
    return d.toLocaleString('en-AU', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false });
  } catch {
    return s.slice(0, 16).replace('T', ' ');
  }
}

function statusBadge(status: unknown): React.ReactNode {
  const s = String(status ?? '').toLowerCase();
  const map: Record<string, string> = {
    active: 'bg-green-100 text-green-700',
    'in progress': 'bg-blue-100 text-blue-700',
    complete: 'bg-gray-100 text-gray-600',
    completed: 'bg-gray-100 text-gray-600',
    cancelled: 'bg-red-100 text-red-600',
    open: 'bg-orange-100 text-orange-700',
    closed: 'bg-gray-100 text-gray-600',
    pending: 'bg-yellow-100 text-yellow-700',
    'not started': 'bg-gray-100 text-gray-500',
    draft: 'bg-gray-100 text-gray-500',
    investigating: 'bg-purple-100 text-purple-700',
  };
  const cls = map[s] ?? 'bg-gray-100 text-gray-600';
  return (
    <span className={`inline-block px-1.5 py-0.5 rounded text-[11px] font-medium ${cls}`}>
      {String(status ?? '—')}
    </span>
  );
}

function severityBadge(sev: unknown): React.ReactNode {
  const s = String(sev ?? '').toLowerCase();
  const map: Record<string, string> = {
    critical: 'bg-red-100 text-red-700',
    high: 'bg-orange-100 text-orange-700',
    medium: 'bg-yellow-100 text-yellow-700',
    low: 'bg-green-100 text-green-700',
  };
  const cls = map[s] ?? 'bg-gray-100 text-gray-600';
  return (
    <span className={`inline-block px-1.5 py-0.5 rounded text-[11px] font-medium ${cls}`}>
      {String(sev ?? '—')}
    </span>
  );
}

const COLS: Record<ListType, ColDef[]> = {
  jobs: [
    { key: 'job_number',          label: 'Job #',       sortable: true, width: '90px' },
    { key: 'name',                label: 'Job Name',    sortable: true },
    { key: 'customer_name',       label: 'Customer',    sortable: false },
    { key: 'site_address',        label: 'Site',        sortable: false },
    { key: 'status',              label: 'Status',      sortable: true, width: '110px', render: (v) => statusBadge(v) },
    { key: 'start_date',          label: 'Start',       sortable: true, width: '95px',  render: (v) => fmtDate(v) },
    { key: 'expected_completion', label: 'Due',         sortable: true, width: '95px',  render: (v) => fmtDate(v) },
    { key: 'supervisor_name',     label: 'Supervisor',  sortable: false, width: '120px' },
    { key: 'progress_percent',    label: 'Progress',    sortable: true,  width: '80px',
      render: (v) => v != null ? (
        <div className="flex items-center gap-1.5">
          <div className="flex-1 h-1.5 bg-gray-200 rounded-full overflow-hidden" style={{ minWidth: 40 }}>
            <div className="h-full bg-primary rounded-full" style={{ width: `${Math.min(100, Number(v))}%` }} />
          </div>
          <span className="text-[11px] text-gray-500 tabular-nums">{Number(v)}%</span>
        </div>
      ) : '—'
    },
  ],
  tasks: [
    { key: 'title',         label: 'Task',       sortable: true },
    { key: 'job_name',      label: 'Job',        sortable: false },
    { key: 'job_number',    label: 'Job #',      sortable: false, width: '80px' },
    { key: 'assigned_name', label: 'Assigned To',sortable: true,  width: '130px' },
    { key: 'status',        label: 'Status',     sortable: true,  width: '110px', render: (v) => statusBadge(v) },
    { key: 'start_date',    label: 'Start',      sortable: true,  width: '95px',  render: (v) => fmtDate(v) },
    { key: 'due_date',      label: 'Due',        sortable: true,  width: '95px',  render: (v) => fmtDate(v) },
    { key: 'notes',         label: 'Notes',      sortable: false, render: (v) => v ? <span className="text-gray-500 text-[12px] line-clamp-1">{String(v)}</span> : '—' },
  ],
  notes: [
    { key: 'body',        label: 'Note',       sortable: false,
      render: (v) => <span className="text-[12px] line-clamp-2 text-gray-700">{String(v ?? '')}</span>
    },
    { key: 'job_name',    label: 'Job',        sortable: false, width: '160px' },
    { key: 'note_type',   label: 'Type',       sortable: false, width: '80px',
      render: (v) => <span className="text-[11px] text-gray-500 capitalize">{String(v ?? '')}</span>
    },
    { key: 'author_name', label: 'Created By', sortable: true,  width: '130px' },
    { key: 'created_at',  label: 'Date',       sortable: true,  width: '140px', render: (v) => fmtDateTime(v) },
  ],
  incidents: [
    { key: 'incident_number',       label: 'Incident #',  sortable: true,  width: '100px' },
    { key: 'job_name',              label: 'Job',         sortable: false, width: '140px' },
    { key: 'incident_type',         label: 'Type',        sortable: true },
    { key: 'severity',              label: 'Severity',    sortable: true,  width: '90px', render: (v) => severityBadge(v) },
    { key: 'status',                label: 'Status',      sortable: true,  width: '110px', render: (v) => statusBadge(v) },
    { key: 'incident_date',         label: 'Date',        sortable: true,  width: '95px',  render: (v) => fmtDate(v) },
    { key: 'reported_by_name',      label: 'Reported By', sortable: false, width: '130px' },
    { key: 'corrective_action_count', label: 'Actions',  sortable: false, width: '70px',
      render: (v) => <span className="tabular-nums text-[12px]">{String(v ?? 0)}</span>
    },
  ],
  attendance: [
    { key: 'user_name',     label: 'User',       sortable: true },
    { key: 'user_email',    label: 'Email',      sortable: false },
    { key: 'job_name',      label: 'Job',        sortable: false },
    { key: 'job_number',    label: 'Job #',      sortable: false, width: '80px' },
    { key: 'signed_in_at',  label: 'Signed In',  sortable: true,  width: '140px', render: (v) => fmtDateTime(v) },
    { key: 'signed_out_at', label: 'Signed Out', sortable: true,  width: '140px', render: (v) => v ? fmtDateTime(v) : <span className="text-orange-500 text-[11px]">Still on site</span> },
    { key: 'duration_hours',label: 'Duration',   sortable: false, width: '80px',
      render: (v) => v != null ? <span className="tabular-nums text-[12px]">{Number(v).toFixed(1)}h</span> : '—'
    },
    { key: 'source',        label: 'Source',     sortable: false, width: '80px',
      render: (v) => <span className="text-[11px] text-gray-400 capitalize">{String(v ?? '')}</span>
    },
  ],
  costs: [
    { key: 'job_name',     label: 'Job',         sortable: false },
    { key: 'job_number',   label: 'Job #',       sortable: false, width: '80px' },
    { key: 'description',  label: 'Description', sortable: true },
    { key: 'category',     label: 'Category',    sortable: true,  width: '110px' },
    { key: 'amount',       label: 'Amount',      sortable: true,  width: '90px',
      render: (v) => v != null ? <span className="tabular-nums text-[12px] font-medium">${Number(v).toFixed(2)}</span> : '—'
    },
    { key: 'gst_amount',   label: 'GST',         sortable: false, width: '80px',
      render: (v) => v != null ? <span className="tabular-nums text-[12px] text-gray-500">${Number(v).toFixed(2)}</span> : '—'
    },
    { key: 'purchase_date',label: 'Date',        sortable: true,  width: '95px',  render: (v) => fmtDate(v) },
    { key: 'supplier',     label: 'Supplier',    sortable: false, width: '120px' },
    { key: 'cost_type',    label: 'Type',        sortable: false, width: '80px',
      render: (v) => <span className="text-[11px] text-gray-500 capitalize">{String(v ?? '')}</span>
    },
  ],
};

// ── Filter options per list ───────────────────────────────────────────────────

const STATUS_OPTIONS: Record<ListType, string[]> = {
  jobs:       ['Active', 'In Progress', 'Complete', 'Cancelled', 'Draft'],
  tasks:      ['Not Started', 'In Progress', 'Complete', 'Cancelled'],
  notes:      [],
  incidents:  ['Open', 'Investigating', 'Closed'],
  attendance: [],
  costs:      [],
};

// ── Hooks ─────────────────────────────────────────────────────────────────────

interface ListData {
  rows: Record<string, unknown>[];
  total: number;
}

function useListData(
  listType: ListType,
  params: {
    q: string;
    status: string;
    severity: string;
    dateFrom: string;
    dateTo: string;
    page: number;
    pageSize: number;
    sortBy: string;
    sortDir: 'asc' | 'desc';
  }
) {
  const [data, setData] = useState<ListData>({ rows: [], total: 0 });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const abortRef = useRef<AbortController | null>(null);

  const fetch_ = useCallback(() => {
    if (abortRef.current) abortRef.current.abort();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    setLoading(true);
    setError('');

    const qs = new URLSearchParams();
    if (params.q)        qs.set('q', params.q);
    if (params.status)   qs.set('status', params.status);
    if (params.severity) qs.set('severity', params.severity);
    if (params.dateFrom) qs.set('dateFrom', params.dateFrom);
    if (params.dateTo)   qs.set('dateTo', params.dateTo);
    qs.set('page', String(params.page));
    qs.set('pageSize', String(params.pageSize));
    if (params.sortBy)  qs.set('sortBy', params.sortBy);
    qs.set('sortDir', params.sortDir);

    fetch(`/api/lists/${listType}?${qs}`, { credentials: 'include', signal: ctrl.signal })
      .then((r) => r.ok ? r.json() : Promise.reject(r.status))
      .then((d: ListData) => { setData(d); setLoading(false); })
      .catch((e) => {
        if (e instanceof DOMException && e.name === 'AbortError') return;
        setError('Failed to load data');
        setLoading(false);
      });
  }, [listType, params.q, params.status, params.severity, params.dateFrom, params.dateTo, params.page, params.pageSize, params.sortBy, params.sortDir]);

  useEffect(() => { fetch_(); }, [fetch_]);

  return { data, loading, error, refresh: fetch_ };
}

// ── Sort header cell ──────────────────────────────────────────────────────────

function SortTh({
  col, sortBy, sortDir, onSort,
}: {
  col: ColDef;
  sortBy: string;
  sortDir: 'asc' | 'desc';
  onSort: (key: string) => void;
}) {
  const active = sortBy === col.key;
  return (
    <th
      style={{ width: col.width }}
      className={`px-3 py-2 text-left text-[11px] font-semibold text-gray-500 uppercase tracking-wide whitespace-nowrap select-none border-b border-gray-200 bg-gray-50 ${col.sortable ? 'cursor-pointer hover:bg-gray-100' : ''}`}
      onClick={() => col.sortable && onSort(col.key)}
    >
      <span className="flex items-center gap-1">
        {col.label}
        {col.sortable && (
          active
            ? (sortDir === 'asc' ? <ChevronUp size={12} className="text-primary" /> : <ChevronDown size={12} className="text-primary" />)
            : <ChevronsUpDown size={12} className="text-gray-300" />
        )}
      </span>
    </th>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

const PAGE_SIZE = 50;

export default function ListsPage() {
  const [searchParams, setSearchParams] = useSearchParams();

  const activeList = (searchParams.get('list') as ListType) || 'jobs';
  const setActiveList = (l: ListType) => {
    setSearchParams({ list: l });
    setPage(1);
    setQ('');
    setStatus('');
    setSeverity('');
    setDateFrom('');
    setDateTo('');
    setSortBy('');
    setSortDir('desc');
  };

  const [q, setQ]             = useState('');
  const [debouncedQ, setDebouncedQ] = useState('');
  const [status, setStatus]   = useState('');
  const [severity, setSeverity] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo]   = useState('');
  const [page, setPage]       = useState(1);
  const [sortBy, setSortBy]   = useState('');
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc');
  const [showFilters, setShowFilters] = useState(false);

  // Debounce search
  useEffect(() => {
    const t = setTimeout(() => { setDebouncedQ(q); setPage(1); }, 350);
    return () => clearTimeout(t);
  }, [q]);

  const { data, loading, error } = useListData(activeList, {
    q: debouncedQ,
    status,
    severity,
    dateFrom,
    dateTo,
    page,
    pageSize: PAGE_SIZE,
    sortBy,
    sortDir,
  });

  function handleSort(key: string) {
    if (sortBy === key) {
      setSortDir((d) => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortBy(key);
      setSortDir('desc');
    }
    setPage(1);
  }

  function handleCsvExport() {
    const qs = new URLSearchParams();
    if (debouncedQ) qs.set('q', debouncedQ);
    if (status)     qs.set('status', status);
    if (severity)   qs.set('severity', severity);
    if (dateFrom)   qs.set('dateFrom', dateFrom);
    if (dateTo)     qs.set('dateTo', dateTo);
    if (sortBy)     qs.set('sortBy', sortBy);
    qs.set('sortDir', sortDir);
    qs.set('format', 'csv');
    window.open(`/api/lists/${activeList}?${qs}`, '_blank');
  }

  function clearFilters() {
    setStatus('');
    setSeverity('');
    setDateFrom('');
    setDateTo('');
    setPage(1);
  }

  const totalPages = Math.max(1, Math.ceil(data.total / PAGE_SIZE));
  const cols = COLS[activeList];
  const listMeta = LIST_DEFS.find((l) => l.key === activeList)!;
  const hasFilters = !!(status || severity || dateFrom || dateTo);
  const statusOpts = STATUS_OPTIONS[activeList];

  return (
    <>
      <Helmet>
        <title>Lists — IWILLBUILD</title>
        <meta name="description" content="View, filter, and export system records as tables." />
        <link rel="canonical" href="https://iwillbuild.com/lists" />
      </Helmet>

      <div className="portal-page">
        <main className="portal-main flex flex-col min-h-0 overflow-hidden">

          {/* ── Page header ── */}
          <div className="shrink-0 px-5 pt-5 pb-3 border-b border-gray-200 bg-white">
            <div className="flex items-center justify-between gap-4">
              <div>
                <h1 className="text-[18px] font-bold text-gray-900 leading-tight">Lists</h1>
                <p className="text-[12px] text-gray-400 mt-0.5">View and export system records</p>
              </div>
            </div>

            {/* ── List selector tabs ── */}
            <div className="flex items-center gap-1 mt-3 -mb-px overflow-x-auto">
              {LIST_DEFS.map((l) => {
                const Icon = l.icon;
                const active = l.key === activeList;
                return (
                  <button
                    key={l.key}
                    onClick={() => setActiveList(l.key)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-medium rounded-t border-b-2 transition-colors whitespace-nowrap ${
                      active
                        ? 'border-primary text-primary bg-orange-50'
                        : 'border-transparent text-gray-500 hover:text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    <Icon size={13} />
                    {l.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* ── Toolbar ── */}
          <div className="shrink-0 px-4 py-2.5 bg-white border-b border-gray-200 flex items-center gap-2 flex-wrap">
            {/* Search */}
            <div className="relative flex-1 min-w-[180px] max-w-[320px]">
              <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              <input
                type="text"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={`Search ${listMeta.label.toLowerCase()}…`}
                className="w-full pl-7 pr-3 py-1.5 text-[12px] border border-gray-200 rounded bg-white focus:outline-none focus:ring-1 focus:ring-primary focus:border-primary placeholder-gray-400"
              />
              {q && (
                <button onClick={() => setQ('')} className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
                  <X size={12} />
                </button>
              )}
            </div>

            {/* Filter toggle */}
            <button
              onClick={() => setShowFilters((v) => !v)}
              className={`flex items-center gap-1.5 px-2.5 py-1.5 text-[12px] rounded border transition-colors ${
                showFilters || hasFilters
                  ? 'border-primary text-primary bg-orange-50'
                  : 'border-gray-200 text-gray-500 hover:border-gray-300 hover:text-gray-700'
              }`}
            >
              <Filter size={12} />
              Filters
              {hasFilters && (
                <span className="ml-0.5 w-4 h-4 rounded-full bg-primary text-white text-[10px] flex items-center justify-center font-bold">
                  {[status, severity, dateFrom, dateTo].filter(Boolean).length}
                </span>
              )}
            </button>

            {hasFilters && (
              <button onClick={clearFilters} className="text-[11px] text-gray-400 hover:text-gray-600 flex items-center gap-1">
                <X size={11} /> Clear
              </button>
            )}

            <div className="flex-1" />

            {/* Record count */}
            {!loading && (
              <span className="text-[11px] text-gray-400 tabular-nums">
                {data.total.toLocaleString()} record{data.total !== 1 ? 's' : ''}
              </span>
            )}

            {/* CSV export */}
            <button
              onClick={handleCsvExport}
              className="flex items-center gap-1.5 px-2.5 py-1.5 text-[12px] font-medium text-gray-600 border border-gray-200 rounded hover:bg-gray-50 hover:border-gray-300 transition-colors"
            >
              <Download size={13} />
              Export CSV
            </button>
          </div>

          {/* ── Filter panel ── */}
          {showFilters && (
            <div className="shrink-0 px-4 py-2.5 bg-gray-50 border-b border-gray-200 flex items-center gap-3 flex-wrap">
              {/* Status filter */}
              {statusOpts.length > 0 && (
                <div className="flex items-center gap-1.5">
                  <label className="text-[11px] text-gray-500 font-medium">Status</label>
                  <select
                    value={status}
                    onChange={(e) => { setStatus(e.target.value); setPage(1); }}
                    className="text-[12px] border border-gray-200 rounded px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-primary"
                  >
                    <option value="">All</option>
                    {statusOpts.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              )}

              {/* Severity filter (incidents only) */}
              {activeList === 'incidents' && (
                <div className="flex items-center gap-1.5">
                  <label className="text-[11px] text-gray-500 font-medium">Severity</label>
                  <select
                    value={severity}
                    onChange={(e) => { setSeverity(e.target.value); setPage(1); }}
                    className="text-[12px] border border-gray-200 rounded px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-primary"
                  >
                    <option value="">All</option>
                    {lists.SEVERITY_OPTIONS.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              )}

              {/* Date range */}
              <div className="flex items-center gap-1.5">
                <label className="text-[11px] text-gray-500 font-medium">From</label>
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => { setDateFrom(e.target.value); setPage(1); }}
                  className="text-[12px] border border-gray-200 rounded px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
              <div className="flex items-center gap-1.5">
                <label className="text-[11px] text-gray-500 font-medium">To</label>
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => { setDateTo(e.target.value); setPage(1); }}
                  className="text-[12px] border border-gray-200 rounded px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
            </div>
          )}

          {/* ── Table area ── */}
          <div className="flex-1 overflow-auto min-h-0">
            {error ? (
              <div className="flex items-center gap-2 p-6 text-red-600 text-[13px]">
                <AlertCircle size={16} /> {error}
              </div>
            ) : (
              <table className="w-full border-collapse text-[12px]" style={{ minWidth: 600 }}>
                <thead className="sticky top-0 z-10">
                  <tr>
                    {cols.map((col) => (
                      <SortTh key={col.key} col={col} sortBy={sortBy} sortDir={sortDir} onSort={handleSort} />
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <tr>
                      <td colSpan={cols.length} className="px-3 py-8 text-center text-gray-400">
                        <div className="flex items-center justify-center gap-2">
                          <Loader2 size={16} className="animate-spin" />
                          <span className="text-[12px]">Loading…</span>
                        </div>
                      </td>
                    </tr>
                  ) : data.rows.length === 0 ? (
                    <tr>
                      <td colSpan={cols.length} className="px-3 py-12 text-center text-gray-400 text-[12px]">
                        No records found
                        {(debouncedQ || hasFilters) && (
                          <button onClick={() => { setQ(''); clearFilters(); }} className="ml-2 text-primary hover:underline">
                            Clear search
                          </button>
                        )}
                      </td>
                    </tr>
                  ) : (
                    data.rows.map((row, i) => (
                      <tr
                        key={String(row.id ?? i)}
                        className="border-b border-gray-100 hover:bg-orange-50/40 transition-colors"
                      >
                        {cols.map((col) => {
                          const val = row[col.key];
                          return (
                            <td
                              key={col.key}
                              style={{ width: col.width, maxWidth: col.width ? undefined : 260 }}
                              className="px-3 py-2 text-gray-700 align-top"
                            >
                              {col.render
                                ? col.render(val, row)
                                : val != null && val !== ''
                                  ? <span className="line-clamp-2">{String(val)}</span>
                                  : <span className="text-gray-300">—</span>
                              }
                            </td>
                          );
                        })}
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            )}
          </div>

          {/* ── Pagination ── */}
          {!loading && data.total > PAGE_SIZE && (
            <div className="shrink-0 px-4 py-2.5 border-t border-gray-200 bg-white flex items-center justify-between gap-3">
              <span className="text-[11px] text-gray-400">
                Page {page} of {totalPages} · {data.total.toLocaleString()} total
              </span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="p-1 rounded border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <ChevronLeft size={14} />
                </button>
                {/* Page number pills */}
                {Array.from({ length: Math.min(7, totalPages) }, (_, i) => {
                  let p: number;
                  if (totalPages <= 7) {
                    p = i + 1;
                  } else if (page <= 4) {
                    p = i + 1;
                  } else if (page >= totalPages - 3) {
                    p = totalPages - 6 + i;
                  } else {
                    p = page - 3 + i;
                  }
                  return (
                    <button
                      key={p}
                      onClick={() => setPage(p)}
                      className={`w-7 h-7 text-[11px] rounded border transition-colors ${
                        p === page
                          ? 'border-primary bg-primary text-white font-semibold'
                          : 'border-gray-200 text-gray-500 hover:bg-gray-50'
                      }`}
                    >
                      {p}
                    </button>
                  );
                })}
                <button
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  className="p-1 rounded border border-gray-200 text-gray-500 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <ChevronRight size={14} />
                </button>
              </div>
            </div>
          )}

        </main>
      </div>
    </>
  );
}
