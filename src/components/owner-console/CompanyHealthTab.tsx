/**
 * CompanyHealthTab — Developer Console tab showing per-company health metrics.
 */
import { useState, useEffect, useCallback } from 'react';
import { BarChart2, RefreshCw, Search, Users, Briefcase, CheckCircle2, AlertCircle, Clock, Package } from 'lucide-react';

interface CompanyHealth {
  company_id: number;
  company_name: string;
  plan: string;
  subscription_status: string;
  created_at: string;
  total_users: number;
  active_users: number;
  inactive_users: number;
  unverified_users: number;
  invited_users: number;
  job_count: number;
  last_login_at: string | null;
  starter_pack_loaded: number;
  open_support_notes: number;
}

function planColor(plan: string): string {
  const map: Record<string, string> = {
    solo: 'bg-slate-100 text-slate-600',
    team: 'bg-blue-100 text-blue-700',
    business: 'bg-purple-100 text-purple-700',
    enterprise: 'bg-violet-100 text-violet-800',
  };
  return map[plan?.toLowerCase()] ?? 'bg-slate-100 text-slate-500';
}

function subStatusColor(status: string): string {
  const map: Record<string, string> = {
    active: 'text-emerald-600',
    trial: 'text-blue-500',
    past_due: 'text-amber-500',
    cancelled: 'text-red-500',
    expired: 'text-red-400',
  };
  return map[status?.toLowerCase()] ?? 'text-slate-500';
}

export default function CompanyHealthTab() {
  const [companies, setCompanies] = useState<CompanyHealth[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/developer/company-health', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json();
        setCompanies(data.companies ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void load(); }, []);

  const filtered = companies.filter(c =>
    !search || c.company_name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h2 className="text-lg font-bold text-slate-800 flex items-center gap-2">
            <BarChart2 size={18} className="text-slate-500" />
            Company Health
          </h2>
          <p className="text-sm text-slate-500 mt-0.5">At-a-glance health metrics for every company.</p>
        </div>
        <button
          onClick={load}
          disabled={loading}
          className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700 border border-slate-200 rounded-lg px-3 py-1.5 transition-colors disabled:opacity-50"
        >
          <RefreshCw size={12} className={loading ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {/* Search */}
      <div className="relative w-64">
        <Search size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          placeholder="Search companies…"
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="pl-8 pr-3 py-1.5 text-sm border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-primary/30 w-full"
        />
      </div>

      {/* Cards */}
      {loading && companies.length === 0 ? (
        <div className="py-16 text-center text-slate-400 text-sm">Loading…</div>
      ) : filtered.length === 0 ? (
        <div className="py-16 text-center text-slate-400 text-sm">No companies found.</div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {filtered.map(c => (
            <div key={c.company_id} className="bg-white rounded-2xl border border-slate-200 p-5">
              {/* Company header */}
              <div className="flex items-start justify-between gap-3 mb-4">
                <div>
                  <div className="flex items-center gap-2 flex-wrap">
                    <h3 className="font-bold text-slate-800">{c.company_name}</h3>
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${planColor(c.plan)}`}>
                      {c.plan}
                    </span>
                    <span className={`text-xs font-medium ${subStatusColor(c.subscription_status)}`}>
                      {c.subscription_status}
                    </span>
                  </div>
                  <div className="text-xs text-slate-400 mt-0.5">
                    ID #{c.company_id} · Created {new Date(c.created_at).toLocaleDateString('en-AU')}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {c.starter_pack_loaded ? (
                    <span className="flex items-center gap-1 text-xs text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">
                      <Package size={10} /> Starter pack
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-xs text-slate-400 bg-slate-50 px-2 py-0.5 rounded-full">
                      <Package size={10} /> No starter pack
                    </span>
                  )}
                  {c.open_support_notes > 0 && (
                    <span className="flex items-center gap-1 text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full">
                      <AlertCircle size={10} /> {c.open_support_notes} note{c.open_support_notes !== 1 ? 's' : ''}
                    </span>
                  )}
                </div>
              </div>

              {/* Metrics grid */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-slate-50 rounded-xl p-3">
                  <div className="flex items-center gap-1.5 text-slate-500 text-xs mb-1">
                    <Users size={11} /> Users
                  </div>
                  <div className="font-bold text-slate-800 text-lg">{c.total_users}</div>
                  <div className="text-xs text-slate-400 mt-0.5">
                    {c.active_users} active · {c.inactive_users} inactive
                  </div>
                </div>
                <div className="bg-slate-50 rounded-xl p-3">
                  <div className="flex items-center gap-1.5 text-slate-500 text-xs mb-1">
                    <AlertCircle size={11} /> Unverified
                  </div>
                  <div className={`font-bold text-lg ${c.unverified_users > 0 ? 'text-amber-500' : 'text-emerald-600'}`}>
                    {c.unverified_users}
                  </div>
                  <div className="text-xs text-slate-400 mt-0.5">
                    {c.invited_users} invited
                  </div>
                </div>
                <div className="bg-slate-50 rounded-xl p-3">
                  <div className="flex items-center gap-1.5 text-slate-500 text-xs mb-1">
                    <Briefcase size={11} /> Jobs
                  </div>
                  <div className="font-bold text-slate-800 text-lg">{c.job_count}</div>
                  <div className="text-xs text-slate-400 mt-0.5">total projects</div>
                </div>
                <div className="bg-slate-50 rounded-xl p-3">
                  <div className="flex items-center gap-1.5 text-slate-500 text-xs mb-1">
                    <Clock size={11} /> Last login
                  </div>
                  <div className="font-bold text-slate-800 text-sm">
                    {c.last_login_at
                      ? new Date(c.last_login_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })
                      : '—'}
                  </div>
                  <div className="text-xs text-slate-400 mt-0.5">
                    {c.last_login_at
                      ? new Date(c.last_login_at).toLocaleTimeString('en-AU', { hour: '2-digit', minute: '2-digit' })
                      : 'Never'}
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
