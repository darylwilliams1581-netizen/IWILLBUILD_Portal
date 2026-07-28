/**
 * /incidents — Company Incident Register
 * Source of truth for all company incidents, near misses, injuries,
 * property damage, environmental events, vehicle/plant incidents,
 * public/client complaints, and safety issues.
 */
import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Helmet } from '@dr.pogodin/react-helmet';
import DesktopTopBar from '@/components/DesktopTopBar';
import DesktopDock from '@/components/DesktopDock';
import {
  AlertTriangle, Plus, Filter, X, ChevronRight,
  Loader2, CheckCircle2, Clock, Search, Home, ChevronLeft,
} from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface Incident {
  id: number;
  job_id: number | null;
  job_number: string | null;
  job_name: string | null;
  customer_name: string | null;
  site_address: string | null;
  incident_date: string;
  incident_time: string | null;
  reported_by: string;
  location: string | null;
  incident_type: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  description: string;
  status: 'open' | 'investigating' | 'action required' | 'closed';
  injury_occurred: boolean | number;
  property_damage: boolean | number;
  environmental_impact: boolean | number;
  third_parties_involved: boolean | number;
  corrective_action_count?: number;
  corrective_actions_complete?: number;
  created_at: string;
  closed_at: string | null;
}

// ── Constants ─────────────────────────────────────────────────────────────────

export const INCIDENT_TYPES = [
  'Injury',
  'Near miss',
  'Property damage',
  'Environmental spill',
  'Vehicle incident',
  'Plant/equipment incident',
  'Public/client complaint',
  'Unsafe condition',
  'Other',
];

export const SEVERITY_OPTIONS: { value: string; label: string; color: string }[] = [
  { value: 'low',      label: 'Low',      color: 'bg-emerald-100 text-emerald-700' },
  { value: 'medium',   label: 'Medium',   color: 'bg-amber-100 text-amber-700' },
  { value: 'high',     label: 'High',     color: 'bg-violet-100 text-violet-800' },
  { value: 'critical', label: 'Critical', color: 'bg-red-100 text-red-700' },
];

export const STATUS_OPTIONS: { value: string; label: string; color: string }[] = [
  { value: 'open',             label: 'Open',             color: 'bg-blue-100 text-blue-700' },
  { value: 'investigating',    label: 'Investigating',    color: 'bg-amber-100 text-amber-700' },
  { value: 'action required',  label: 'Action Required',  color: 'bg-violet-100 text-violet-800' },
  { value: 'closed',           label: 'Closed',           color: 'bg-slate-100 text-slate-500' },
];

export function severityBadge(severity: string) {
  return SEVERITY_OPTIONS.find(s => s.value === severity)?.color ?? 'bg-slate-100 text-slate-500';
}

export function statusBadge(status: string) {
  return STATUS_OPTIONS.find(s => s.value === status)?.color ?? 'bg-slate-100 text-slate-500';
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function IncidentsPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [loading, setLoading] = useState(true);
  const [showFilters, setShowFilters] = useState(false);
  const [search, setSearch] = useState('');

  // Filter state
  const [filterStatus, setFilterStatus] = useState(searchParams.get('status') ?? '');
  const [filterSeverity, setFilterSeverity] = useState(searchParams.get('severity') ?? '');
  const [filterType, setFilterType] = useState(searchParams.get('type') ?? '');
  const [filterJobLinked, setFilterJobLinked] = useState(searchParams.get('jobLinked') ?? '');
  const [filterDateFrom, setFilterDateFrom] = useState('');
  const [filterDateTo, setFilterDateTo] = useState('');

  const loadIncidents = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (filterStatus) params.set('status', filterStatus);
      if (filterSeverity) params.set('severity', filterSeverity);
      if (filterType) params.set('incidentType', filterType);
      if (filterJobLinked) params.set('jobLinked', filterJobLinked);
      if (filterDateFrom) params.set('dateFrom', filterDateFrom);
      if (filterDateTo) params.set('dateTo', filterDateTo);
      const r = await fetch(`/api/incidents?${params.toString()}`);
      if (r.ok) setIncidents(await r.json() as Incident[]);
    } finally {
      setLoading(false);
    }
  }, [filterStatus, filterSeverity, filterType, filterJobLinked, filterDateFrom, filterDateTo]);

  useEffect(() => { void loadIncidents(); }, [loadIncidents]);

  const activeFilterCount = [filterStatus, filterSeverity, filterType, filterJobLinked, filterDateFrom, filterDateTo].filter(Boolean).length;

  function clearFilters() {
    setFilterStatus('');
    setFilterSeverity('');
    setFilterType('');
    setFilterJobLinked('');
    setFilterDateFrom('');
    setFilterDateTo('');
    setSearchParams({});
  }

  // Client-side search filter
  const filtered = search.trim()
    ? incidents.filter(i =>
        i.description.toLowerCase().includes(search.toLowerCase()) ||
        i.reported_by.toLowerCase().includes(search.toLowerCase()) ||
        (i.job_name ?? '').toLowerCase().includes(search.toLowerCase()) ||
        (i.location ?? '').toLowerCase().includes(search.toLowerCase()) ||
        i.incident_type.toLowerCase().includes(search.toLowerCase())
      )
    : incidents;

  return (
    <div className="min-h-screen bg-[#f5f6f8] flex flex-col md:pt-[112px]">
      <DesktopTopBar />
      <DesktopDock />
      <Helmet>
        <title>Incident Register — IWILLBUILD</title>
        <meta name="description" content="Company incident register — injuries, near misses, property damage, and safety events." />
        <link rel="canonical" href="https://iwillbuild.com/incidents" />
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>

      <div className="flex flex-col min-h-screen bg-slate-50">
        {/* Header */}
        <div className="bg-red-700 text-white px-4 safe-top pb-3">
          {/* Breadcrumb row */}
          <div className="flex items-center gap-1.5 text-xs text-red-300 mb-2 pt-1">
            <button
              type="button"
              onClick={() => navigate('/home')}
              className="flex items-center gap-1 hover:text-white transition-colors"
            >
              <Home size={11} /> Home
            </button>
            <ChevronRight size={10} className="text-red-400" />
            <span className="text-red-100 font-medium">Incident Register</span>
          </div>
          <div className="flex items-center justify-between gap-3 mb-3">
            <div className="flex items-center gap-2">
              <AlertTriangle size={20} className="text-red-200" />
              <h1 className="font-bold text-base">Incident Register</h1>
            </div>
            <button
              type="button"
              onClick={() => navigate('/incidents/new')}
              className="flex items-center gap-1.5 bg-white/20 hover:bg-white/30 px-3 py-1.5 rounded-xl text-sm font-semibold"
            >
              <Plus size={14} /> New
            </button>
          </div>

          {/* Search */}
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-red-300" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search incidents…"
              className="w-full bg-white/15 border border-white/20 rounded-xl pl-8 pr-3 py-2 text-sm text-white placeholder-red-300 focus:outline-none focus:bg-white/25"
            />
          </div>
        </div>

        {/* Filter bar */}
        <div className="bg-white border-b border-slate-100 px-4 py-2 flex items-center gap-2">
          <button
            type="button"
            onClick={() => setShowFilters(!showFilters)}
            className={`flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors ${
              activeFilterCount > 0
                ? 'bg-red-50 border-red-200 text-red-700'
                : 'border-slate-200 text-slate-600'
            }`}
          >
            <Filter size={12} />
            Filters
            {activeFilterCount > 0 && (
              <span className="bg-red-600 text-white text-xs rounded-full w-4 h-4 flex items-center justify-center leading-none">
                {activeFilterCount}
              </span>
            )}
          </button>
          {activeFilterCount > 0 && (
            <button type="button" onClick={clearFilters} className="text-xs text-slate-400 flex items-center gap-1">
              <X size={11} /> Clear
            </button>
          )}
          <span className="ml-auto text-xs text-slate-400">{filtered.length} record{filtered.length !== 1 ? 's' : ''}</span>
        </div>

        {/* Filter panel */}
        {showFilters && (
          <div className="bg-white border-b border-slate-100 px-4 py-3 grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs text-slate-500 mb-1 block">Status</label>
              <select
                value={filterStatus}
                onChange={e => setFilterStatus(e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs"
              >
                <option value="">All statuses</option>
                {STATUS_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-slate-500 mb-1 block">Severity</label>
              <select
                value={filterSeverity}
                onChange={e => setFilterSeverity(e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs"
              >
                <option value="">All severities</option>
                {SEVERITY_OPTIONS.map(s => <option key={s.value} value={s.value}>{s.label}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-slate-500 mb-1 block">Type</label>
              <select
                value={filterType}
                onChange={e => setFilterType(e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs"
              >
                <option value="">All types</option>
                {INCIDENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-slate-500 mb-1 block">Job linked</label>
              <select
                value={filterJobLinked}
                onChange={e => setFilterJobLinked(e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs"
              >
                <option value="">All</option>
                <option value="yes">Linked to job</option>
                <option value="no">No job</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-slate-500 mb-1 block">Date from</label>
              <input
                type="date"
                value={filterDateFrom}
                onChange={e => setFilterDateFrom(e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs"
              />
            </div>
            <div>
              <label className="text-xs text-slate-500 mb-1 block">Date to</label>
              <input
                type="date"
                value={filterDateTo}
                onChange={e => setFilterDateTo(e.target.value)}
                className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs"
              />
            </div>
          </div>
        )}

        {/* List */}
        <div className="flex-1 overflow-y-auto p-4">
          {loading ? (
            <div className="flex justify-center py-16">
              <Loader2 size={28} className="animate-spin text-red-400" />
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-16">
              <AlertTriangle size={36} className="text-slate-200 mx-auto mb-3" />
              <p className="text-slate-400 text-sm font-medium">
                {activeFilterCount > 0 || search ? 'No incidents match your filters' : 'No incidents recorded'}
              </p>
              {!activeFilterCount && !search && (
                <p className="text-slate-300 text-xs mt-1">Tap New to record an incident</p>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {filtered.map(incident => {
                const caCount = Number(incident.corrective_action_count ?? 0);
                const caComplete = Number(incident.corrective_actions_complete ?? 0);
                return (
                  <button
                    key={incident.id}
                    type="button"
                    onClick={() => navigate(`/incidents/${incident.id}`)}
                    className="w-full text-left bg-white rounded-2xl p-4 shadow-sm border border-slate-100 hover:border-red-200 transition-colors"
                  >
                    <div className="flex items-start justify-between gap-2 mb-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-slate-800 leading-snug truncate">
                          {incident.incident_type}
                        </p>
                        <p className="text-xs text-slate-500 mt-0.5 line-clamp-1">{incident.description}</p>
                      </div>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${severityBadge(incident.severity)}`}>
                          {incident.severity.charAt(0).toUpperCase() + incident.severity.slice(1)}
                        </span>
                        <ChevronRight size={14} className="text-slate-300" />
                      </div>
                    </div>

                    <div className="flex items-center gap-2 flex-wrap">
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusBadge(incident.status)}`}>
                        {incident.status.charAt(0).toUpperCase() + incident.status.slice(1)}
                      </span>
                      {incident.job_name && (
                        <span className="text-xs text-slate-400 truncate max-w-[120px]">{incident.job_name}</span>
                      )}
                      {caCount > 0 && (
                        <span className={`text-xs flex items-center gap-1 ${caComplete === caCount ? 'text-emerald-600' : 'text-amber-600'}`}>
                          {caComplete === caCount
                            ? <CheckCircle2 size={11} />
                            : <Clock size={11} />
                          }
                          {caComplete}/{caCount} actions
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-3 text-xs text-slate-400 mt-2">
                      <span>{new Date(incident.incident_date).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                      <span>· {incident.reported_by}</span>
                      {incident.location && <span className="truncate max-w-[100px]">· {incident.location}</span>}
                    </div>

                    {/* Flags */}
                    {(Boolean(incident.injury_occurred) || Boolean(incident.property_damage) || Boolean(incident.environmental_impact)) && (
                      <div className="flex gap-1.5 mt-2">
                        {Boolean(incident.injury_occurred) && (
                          <span className="text-xs bg-red-50 text-red-600 px-2 py-0.5 rounded-full">Injury</span>
                        )}
                        {Boolean(incident.property_damage) && (
                          <span className="text-xs bg-violet-50 text-violet-700 px-2 py-0.5 rounded-full">Property damage</span>
                        )}
                        {Boolean(incident.environmental_impact) && (
                          <span className="text-xs bg-green-50 text-green-600 px-2 py-0.5 rounded-full">Environmental</span>
                        )}
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
