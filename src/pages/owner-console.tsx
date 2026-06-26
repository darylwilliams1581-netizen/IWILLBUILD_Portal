import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { Helmet } from '@dr.pogodin/react-helmet';
import {
  Building2, Users, UserCheck, UserX, Clock, Wifi, LogIn,
  RefreshCw, Shield, ChevronRight, Activity,
  Circle, Loader2,
} from 'lucide-react';
import PortalSidebar from '@/components/PortalSidebar';
import { usePermissions } from '@/lib/usePermissions';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Stats {
  totalCompanies: number;
  totalUsers: number;
  activeUsers: number;
  invitedUsers: number;
  inactiveUsers: number;
  onlineNow: number;
  loginsToday: number;
}

interface Company {
  id: number;
  name: string;
  owner: string;
  totalUsers: number;
  activeUsers: number;
  createdAt: string;
  status: string;
}

interface OcUser {
  id: number;
  userId: string;
  name: string;
  email: string;
  company: string;
  companyId: number | null;
  role: string;
  status: string;
  lastLoginAt: string | null;
  lastActiveAt: string | null;
  onlineNow: boolean;
  createdAt: string;
}

interface ActivityEvent {
  id: number;
  userId: string;
  companyId: number;
  eventType: string;
  metadataJson: string | null;
  createdAt: string;
  userName: string | null;
  userEmail: string | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return 'Never';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

function fmtDate(dateStr: string | null): string {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' });
}

function roleBadge(role: string) {
  const map: Record<string, string> = {
    owner: 'bg-orange-100 text-orange-700 border-orange-200',
    admin: 'bg-blue-100 text-blue-700 border-blue-200',
    viewer: 'bg-slate-100 text-slate-600 border-slate-200',
  };
  return map[role] ?? 'bg-slate-100 text-slate-600 border-slate-200';
}

function statusBadge(status: string) {
  const map: Record<string, string> = {
    active: 'bg-green-100 text-green-700 border-green-200',
    invited: 'bg-amber-100 text-amber-700 border-amber-200',
    inactive: 'bg-slate-100 text-slate-500 border-slate-200',
  };
  return map[status] ?? 'bg-slate-100 text-slate-500 border-slate-200';
}

function eventBadge(type: string) {
  const map: Record<string, string> = {
    login: 'bg-green-100 text-green-700',
    logout: 'bg-slate-100 text-slate-600',
    active: 'bg-blue-100 text-blue-700',
  };
  return map[type] ?? 'bg-slate-100 text-slate-600';
}

// ── Stat Card ─────────────────────────────────────────────────────────────────

function StatCard({
  label, value, icon: Icon, color, sub,
}: {
  label: string;
  value: number | string;
  icon: React.ElementType;
  color: string;
  sub?: string;
}) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5 flex items-start gap-4">
      <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${color}`}>
        <Icon size={20} />
      </div>
      <div className="min-w-0">
        <p className="text-2xl font-black text-slate-900 leading-none">{value}</p>
        <p className="text-xs font-semibold text-slate-500 mt-1">{label}</p>
        {sub && <p className="text-[11px] text-slate-400 mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

// ── Tab button ────────────────────────────────────────────────────────────────

function Tab({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 text-sm font-semibold rounded-xl transition-colors ${
        active ? 'bg-primary text-white shadow-sm' : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100'
      }`}
    >
      {children}
    </button>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function OwnerConsolePage() {
  const navigate = useNavigate();
  const { isOwner, loading: permsLoading } = usePermissions();

  const [migrated, setMigrated] = useState(false);
  const [stats, setStats] = useState<Stats | null>(null);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [users, setUsers] = useState<OcUser[]>([]);
  const [activity, setActivity] = useState<ActivityEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState<'overview' | 'companies' | 'users' | 'activity'>('overview');
  const [userSearch, setUserSearch] = useState('');

  // Run migration once on mount
  useEffect(() => {
    fetch('/api/migrate-owner-console', { method: 'POST', credentials: 'include' })
      .then(() => setMigrated(true))
      .catch(() => setMigrated(true));
  }, []);

  const loadData = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    else setRefreshing(true);
    try {
      const [s, c, u, a] = await Promise.all([
        fetch('/api/owner-console/stats', { credentials: 'include' }).then((r) => r.json()),
        fetch('/api/owner-console/companies', { credentials: 'include' }).then((r) => r.json()),
        fetch('/api/owner-console/users', { credentials: 'include' }).then((r) => r.json()),
        fetch('/api/owner-console/activity?limit=100', { credentials: 'include' }).then((r) => r.json()),
      ]);
      setStats(s);
      setCompanies(c.companies ?? []);
      setUsers(u.users ?? []);
      setActivity(a.events ?? []);
    } catch (e) {
      console.error('Owner console load error:', e);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    if (migrated && !permsLoading && isOwner) {
      void loadData();
    }
  }, [migrated, permsLoading, isOwner, loadData]);

  // Access guard
  if (!permsLoading && !isOwner) {
    return (
      <div className="flex h-screen bg-[#F4F5F7]">
        <PortalSidebar />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center max-w-sm">
            <div className="w-16 h-16 rounded-2xl bg-red-50 border border-red-200 flex items-center justify-center mx-auto mb-4">
              <Shield size={28} className="text-red-400" />
            </div>
            <h2 className="text-xl font-black text-slate-900 mb-2">Access Denied</h2>
            <p className="text-sm text-slate-500 mb-6">Owner access is required to view the Owner Console.</p>
            <button
              onClick={() => navigate('/dashboard')}
              className="px-5 py-2.5 bg-primary text-white rounded-xl text-sm font-bold hover:bg-orange-600 transition-colors"
            >
              Back to Dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }

  const filteredUsers = users.filter((u) => {
    if (!userSearch) return true;
    const q = userSearch.toLowerCase();
    return (
      u.name.toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q) ||
      u.company.toLowerCase().includes(q) ||
      u.role.toLowerCase().includes(q)
    );
  });

  return (
    <div className="flex h-screen bg-[#F4F5F7] overflow-hidden">
      <PortalSidebar />

      <div className="flex-1 flex flex-col overflow-hidden">
        <Helmet>
          <title>Owner Console — IWILLBUILD Portal</title>
          <meta name="description" content="Owner-only control room for managing companies, users, and activity." />
          <link rel="canonical" href="https://iwillbuild.com/owner-console" />
          <meta name="robots" content="noindex" />
        </Helmet>
        {/* Header */}
        <div className="bg-white border-b border-slate-200 px-6 py-4 flex items-center gap-4 shrink-0">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <Shield size={16} className="text-primary" />
              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Owner Only</p>
            </div>
            <h1 className="font-heading font-black text-xl text-slate-900">Owner Console</h1>
          </div>
          <button
            onClick={() => void loadData(true)}
            disabled={refreshing}
            className="flex items-center gap-2 px-4 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-sm font-semibold text-slate-600 transition-colors disabled:opacity-50"
          >
            <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
            Refresh
          </button>
        </div>

        {/* Tabs */}
        <div className="bg-white border-b border-slate-200 px-6 py-2 flex gap-1 shrink-0">
          <Tab active={tab === 'overview'} onClick={() => setTab('overview')}>Overview</Tab>
          <Tab active={tab === 'companies'} onClick={() => setTab('companies')}>
            Companies {companies.length > 0 && <span className="ml-1 text-xs opacity-70">({companies.length})</span>}
          </Tab>
          <Tab active={tab === 'users'} onClick={() => setTab('users')}>
            Users {users.length > 0 && <span className="ml-1 text-xs opacity-70">({users.length})</span>}
          </Tab>
          <Tab active={tab === 'activity'} onClick={() => setTab('activity')}>Activity Log</Tab>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="flex items-center justify-center py-24">
              <div className="flex flex-col items-center gap-3">
                <Loader2 size={28} className="animate-spin text-primary" />
                <p className="text-sm text-slate-400">Loading Owner Console…</p>
              </div>
            </div>
          ) : (
            <>
              {/* ── Overview ── */}
              {tab === 'overview' && (
                <div className="flex flex-col gap-6 max-w-5xl">
                  {/* Stat cards */}
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                    <StatCard label="Total Companies" value={stats?.totalCompanies ?? 0} icon={Building2} color="bg-blue-50 text-blue-600" />
                    <StatCard label="Total Users" value={stats?.totalUsers ?? 0} icon={Users} color="bg-slate-100 text-slate-600" />
                    <StatCard label="Active Users" value={stats?.activeUsers ?? 0} icon={UserCheck} color="bg-green-50 text-green-600" />
                    <StatCard label="Invited" value={stats?.invitedUsers ?? 0} icon={Clock} color="bg-amber-50 text-amber-600" />
                    <StatCard label="Inactive" value={stats?.inactiveUsers ?? 0} icon={UserX} color="bg-red-50 text-red-500" />
                    <StatCard label="Online Now" value={stats?.onlineNow ?? 0} icon={Wifi} color="bg-emerald-50 text-emerald-600" sub="Active in last 5 min" />
                    <StatCard label="Logins Today" value={stats?.loginsToday ?? 0} icon={LogIn} color="bg-primary/10 text-primary" />
                  </div>

                  {/* Quick company list */}
                  <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                    <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                      <h2 className="font-bold text-slate-800">Companies</h2>
                      <button onClick={() => setTab('companies')} className="text-xs text-primary font-semibold flex items-center gap-1 hover:underline">
                        View all <ChevronRight size={12} />
                      </button>
                    </div>
                    {companies.length === 0 ? (
                      <p className="text-sm text-slate-400 text-center py-8">No companies found</p>
                    ) : (
                      <div className="divide-y divide-slate-100">
                        {companies.slice(0, 5).map((c) => (
                          <div key={c.id} className="px-5 py-3 flex items-center gap-4">
                            <div className="w-8 h-8 rounded-lg bg-blue-50 border border-blue-100 flex items-center justify-center shrink-0">
                              <Building2 size={14} className="text-blue-500" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold text-slate-800 truncate">{c.name}</p>
                              <p className="text-xs text-slate-400">Owner: {c.owner}</p>
                            </div>
                            <div className="text-right shrink-0">
                              <p className="text-sm font-bold text-slate-700">{c.totalUsers}</p>
                              <p className="text-[11px] text-slate-400">users</p>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Recent activity */}
                  <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                    <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                      <h2 className="font-bold text-slate-800">Recent Activity</h2>
                      <button onClick={() => setTab('activity')} className="text-xs text-primary font-semibold flex items-center gap-1 hover:underline">
                        View all <ChevronRight size={12} />
                      </button>
                    </div>
                    {activity.length === 0 ? (
                      <p className="text-sm text-slate-400 text-center py-8">No activity recorded yet. Activity is tracked from the next login.</p>
                    ) : (
                      <div className="divide-y divide-slate-100">
                        {activity.slice(0, 8).map((e) => (
                          <div key={e.id} className="px-5 py-3 flex items-center gap-3">
                            <Activity size={13} className="text-slate-300 shrink-0" />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm text-slate-700 truncate">
                                <span className="font-semibold">{e.userName ?? e.userEmail ?? e.userId}</span>
                              </p>
                            </div>
                            <span className={`text-[11px] font-bold px-2 py-0.5 rounded-lg ${eventBadge(e.eventType)}`}>
                              {e.eventType}
                            </span>
                            <span className="text-[11px] text-slate-400 shrink-0">{timeAgo(e.createdAt)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* ── Companies ── */}
              {tab === 'companies' && (
                <div className="max-w-5xl">
                  <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                    <div className="px-5 py-4 border-b border-slate-100">
                      <h2 className="font-bold text-slate-800">All Companies</h2>
                      <p className="text-xs text-slate-400 mt-0.5">{companies.length} {companies.length === 1 ? 'company' : 'companies'}</p>
                    </div>
                    {companies.length === 0 ? (
                      <p className="text-sm text-slate-400 text-center py-12">No companies found</p>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-slate-100 bg-slate-50">
                              <th className="text-left px-5 py-3 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Company</th>
                              <th className="text-left px-5 py-3 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Owner</th>
                              <th className="text-center px-4 py-3 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Users</th>
                              <th className="text-center px-4 py-3 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Active</th>
                              <th className="text-left px-5 py-3 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Created</th>
                              <th className="text-left px-5 py-3 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Status</th>
                              <th className="px-5 py-3" />
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {companies.map((c) => (
                              <tr key={c.id} className="hover:bg-slate-50 transition-colors">
                                <td className="px-5 py-3.5">
                                  <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-lg bg-blue-50 border border-blue-100 flex items-center justify-center shrink-0">
                                      <Building2 size={13} className="text-blue-500" />
                                    </div>
                                    <span className="font-semibold text-slate-800">{c.name}</span>
                                  </div>
                                </td>
                                <td className="px-5 py-3.5 text-slate-600">{c.owner}</td>
                                <td className="px-4 py-3.5 text-center font-bold text-slate-700">{c.totalUsers}</td>
                                <td className="px-4 py-3.5 text-center font-bold text-green-600">{c.activeUsers}</td>
                                <td className="px-5 py-3.5 text-slate-500">{fmtDate(c.createdAt)}</td>
                                <td className="px-5 py-3.5">
                                  <span className="text-[11px] font-bold px-2 py-0.5 rounded-lg border bg-green-100 text-green-700 border-green-200">
                                    {c.status}
                                  </span>
                                </td>
                                <td className="px-5 py-3.5">
                                  <a
                                    href="/settings"
                                    className="text-xs font-semibold text-primary hover:underline flex items-center gap-1"
                                  >
                                    Manage <ChevronRight size={11} />
                                  </a>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* ── Users ── */}
              {tab === 'users' && (
                <div className="max-w-6xl">
                  <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                    <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-4">
                      <div className="flex-1">
                        <h2 className="font-bold text-slate-800">All Users</h2>
                        <p className="text-xs text-slate-400 mt-0.5">{users.length} total</p>
                      </div>
                      <input
                        type="text"
                        value={userSearch}
                        onChange={(e) => setUserSearch(e.target.value)}
                        placeholder="Search name, email, company…"
                        className="w-56 px-3 py-2 text-sm border border-slate-200 rounded-xl bg-slate-50 focus:outline-none focus:border-primary/60 focus:bg-white transition-colors"
                      />
                    </div>
                    {filteredUsers.length === 0 ? (
                      <p className="text-sm text-slate-400 text-center py-12">No users found</p>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b border-slate-100 bg-slate-50">
                              <th className="text-left px-5 py-3 text-[11px] font-bold text-slate-400 uppercase tracking-wider">User</th>
                              <th className="text-left px-5 py-3 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Company</th>
                              <th className="text-left px-4 py-3 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Role</th>
                              <th className="text-left px-4 py-3 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Status</th>
                              <th className="text-left px-5 py-3 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Last Login</th>
                              <th className="text-left px-5 py-3 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Last Active</th>
                              <th className="text-center px-4 py-3 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Online</th>
                              <th className="text-left px-5 py-3 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Joined</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {filteredUsers.map((u) => (
                              <tr key={u.id} className="hover:bg-slate-50 transition-colors">
                                <td className="px-5 py-3.5">
                                  <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center text-white font-black text-xs shrink-0">
                                      {(u.name || u.email || '?')[0].toUpperCase()}
                                    </div>
                                    <div className="min-w-0">
                                      <p className="font-semibold text-slate-800 truncate">{u.name}</p>
                                      <p className="text-[11px] text-slate-400 truncate">{u.email}</p>
                                    </div>
                                  </div>
                                </td>
                                <td className="px-5 py-3.5 text-slate-600 truncate max-w-[140px]">{u.company}</td>
                                <td className="px-4 py-3.5">
                                  <span className={`text-[11px] font-bold px-2 py-0.5 rounded-lg border capitalize ${roleBadge(u.role)}`}>
                                    {u.role}
                                  </span>
                                </td>
                                <td className="px-4 py-3.5">
                                  <span className={`text-[11px] font-bold px-2 py-0.5 rounded-lg border capitalize ${statusBadge(u.status)}`}>
                                    {u.status}
                                  </span>
                                </td>
                                <td className="px-5 py-3.5 text-slate-500 text-xs">{timeAgo(u.lastLoginAt)}</td>
                                <td className="px-5 py-3.5 text-slate-500 text-xs">{timeAgo(u.lastActiveAt)}</td>
                                <td className="px-4 py-3.5 text-center">
                                  <Circle
                                    size={10}
                                    className={u.onlineNow ? 'text-emerald-500 fill-emerald-500' : 'text-slate-300 fill-slate-300'}
                                  />
                                </td>
                                <td className="px-5 py-3.5 text-slate-500 text-xs">{fmtDate(u.createdAt)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* ── Activity Log ── */}
              {tab === 'activity' && (
                <div className="max-w-4xl">
                  <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                    <div className="px-5 py-4 border-b border-slate-100">
                      <h2 className="font-bold text-slate-800">Activity Log</h2>
                      <p className="text-xs text-slate-400 mt-0.5">
                        {activity.length} recent events · login and logout events · tracked from next sign-in
                      </p>
                    </div>
                    {activity.length === 0 ? (
                      <div className="text-center py-16">
                        <Activity size={28} className="text-slate-200 mx-auto mb-3" />
                        <p className="text-sm font-semibold text-slate-400">No activity recorded yet</p>
                        <p className="text-xs text-slate-300 mt-1">Events will appear here after the next user login</p>
                      </div>
                    ) : (
                      <div className="divide-y divide-slate-100">
                        {activity.map((e) => (
                          <div key={e.id} className="px-5 py-3.5 flex items-center gap-4">
                            <div className={`w-2 h-2 rounded-full shrink-0 ${
                              e.eventType === 'login' ? 'bg-emerald-500' :
                              e.eventType === 'logout' ? 'bg-slate-400' : 'bg-blue-400'
                            }`} />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm text-slate-700">
                                <span className="font-semibold">{e.userName ?? e.userEmail ?? e.userId}</span>
                                {e.userEmail && e.userName && (
                                  <span className="text-slate-400 ml-1 text-xs">({e.userEmail})</span>
                                )}
                              </p>
                            </div>
                            <span className={`text-[11px] font-bold px-2.5 py-1 rounded-lg ${eventBadge(e.eventType)}`}>
                              {e.eventType}
                            </span>
                            <span className="text-xs text-slate-400 shrink-0 w-24 text-right">{timeAgo(e.createdAt)}</span>
                            <span className="text-[11px] text-slate-300 shrink-0 hidden lg:block">
                              {new Date(e.createdAt).toLocaleString('en-AU', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })}
                            </span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
