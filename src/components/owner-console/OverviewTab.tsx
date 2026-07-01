import { Building2, Users, UserCheck, UserX, Clock, Wifi, LogIn, ChevronRight, Activity, ShieldAlert, Loader2, ExternalLink, BookOpen } from 'lucide-react';

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

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return 'Never';
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'Just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function eventBadge(type: string): string {
  if (type === 'login_success' || type === 'login') return 'bg-emerald-50 text-emerald-700';
  if (type === 'logout') return 'bg-slate-100 text-slate-600';
  if (type.includes('fail') || type.includes('block')) return 'bg-red-50 text-red-600';
  return 'bg-blue-50 text-blue-600';
}

function StatCard({ label, value, icon: Icon, color, sub }: {
  label: string; value: number; icon: React.ElementType; color: string; sub?: string;
}) {
  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
      <div className="flex items-center gap-3 mb-2">
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${color}`}>
          <Icon size={16} />
        </div>
        <p className="text-xs font-semibold text-slate-500">{label}</p>
      </div>
      <p className="text-2xl font-black text-slate-900">{value.toLocaleString()}</p>
      {sub && <p className="text-[11px] text-slate-400 mt-0.5">{sub}</p>}
    </div>
  );
}

interface Props {
  stats: Stats | null;
  companies: Company[];
  activity: ActivityEvent[];
  enteringSupport: number | null;
  onEnterSupport: (c: Company) => Promise<void>;
  onViewCompanies: () => void;
  onViewActivity: () => void;
}

export default function OverviewTab({ stats, companies, activity, enteringSupport, onEnterSupport, onViewCompanies, onViewActivity }: Props) {
  return (
    <div className="flex flex-col gap-6 max-w-5xl">
      {/* GoDaddy Dev Dashboard shortcut */}
      <a
        href="https://dashboard.godaddy.com/venture?ventureId=97327aea-9a8c-4bb2-bad7-3bd8ec50d6c6&ua_placement=shared_header"
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-4 bg-white border border-slate-200 rounded-2xl px-5 py-4 shadow-sm hover:border-primary hover:shadow-md transition-all group"
      >
        <div className="w-10 h-10 rounded-xl bg-[#1BDBAD]/10 border border-[#1BDBAD]/30 flex items-center justify-center shrink-0">
          <svg width="20" height="20" viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M16 3C8.82 3 3 8.82 3 16s5.82 13 13 13 13-5.82 13-13S23.18 3 16 3zm0 23.4A10.4 10.4 0 1 1 16 5.6a10.4 10.4 0 0 1 0 20.8z" fill="#1BDBAD"/>
            <path d="M16 10.4a5.6 5.6 0 1 0 0 11.2A5.6 5.6 0 0 0 16 10.4z" fill="#1BDBAD"/>
          </svg>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-slate-800 group-hover:text-primary transition-colors">GoDaddy Developer Dashboard</p>
          <p className="text-xs text-slate-400 truncate">Open the IWILLBUILD Portal development workspace</p>
        </div>
        <ExternalLink size={15} className="text-slate-400 group-hover:text-primary transition-colors shrink-0" />
      </a>

      {/* System Map shortcut */}
      <a
        href="/docs/IWILLBUILD_SYSTEM_MAP.md"
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-4 bg-white border border-slate-200 rounded-2xl px-5 py-4 shadow-sm hover:border-primary hover:shadow-md transition-all group"
      >
        <div className="w-10 h-10 rounded-xl bg-violet-50 border border-violet-200 flex items-center justify-center shrink-0">
          <BookOpen size={18} className="text-violet-600" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-slate-800 group-hover:text-primary transition-colors">System Map / Product Bible</p>
          <p className="text-xs text-slate-400 truncate">Full platform architecture, modules, permissions, DB schema, API reference</p>
        </div>
        <ExternalLink size={15} className="text-slate-400 group-hover:text-primary transition-colors shrink-0" />
      </a>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        <StatCard label="Total Companies" value={stats?.totalCompanies ?? 0} icon={Building2} color="bg-blue-50 text-blue-600" />
        <StatCard label="Total Users" value={stats?.totalUsers ?? 0} icon={Users} color="bg-slate-100 text-slate-600" />
        <StatCard label="Active Users" value={stats?.activeUsers ?? 0} icon={UserCheck} color="bg-green-50 text-green-600" />
        <StatCard label="Invited" value={stats?.invitedUsers ?? 0} icon={Clock} color="bg-amber-50 text-amber-600" />
        <StatCard label="Inactive" value={stats?.inactiveUsers ?? 0} icon={UserX} color="bg-red-50 text-red-500" />
        <StatCard label="Online Now" value={stats?.onlineNow ?? 0} icon={Wifi} color="bg-emerald-50 text-emerald-600" sub="Active in last 5 min" />
        <StatCard label="Logins Today" value={stats?.loginsToday ?? 0} icon={LogIn} color="bg-primary/10 text-primary" />
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <h2 className="font-bold text-slate-800">Companies</h2>
          <button onClick={onViewCompanies} className="text-xs text-primary font-semibold flex items-center gap-1 hover:underline">
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
                <div className="text-right shrink-0 mr-3">
                  <p className="text-sm font-bold text-slate-700">{c.totalUsers}</p>
                  <p className="text-[11px] text-slate-400">users</p>
                </div>
                <button
                  onClick={() => void onEnterSupport(c)}
                  disabled={enteringSupport === c.id}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold text-amber-700 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-lg transition-colors disabled:opacity-50 shrink-0"
                >
                  {enteringSupport === c.id ? <Loader2 size={11} className="animate-spin" /> : <ShieldAlert size={11} />}
                  Support
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
          <h2 className="font-bold text-slate-800">Recent Activity</h2>
          <button onClick={onViewActivity} className="text-xs text-primary font-semibold flex items-center gap-1 hover:underline">
            View all <ChevronRight size={12} />
          </button>
        </div>
        {activity.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-8">No activity recorded yet.</p>
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
                <span className={`text-[11px] font-bold px-2 py-0.5 rounded-lg ${eventBadge(e.eventType)}`}>{e.eventType}</span>
                <span className="text-[11px] text-slate-400 shrink-0">{timeAgo(e.createdAt)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
