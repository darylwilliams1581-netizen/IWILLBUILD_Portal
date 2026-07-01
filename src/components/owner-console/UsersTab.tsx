import { Filter, Circle } from 'lucide-react';
import UserActionsMenu from './UserActionsMenu';
import OrphanActionsMenu from './OrphanActionsMenu';
import type { UserAction, OcUserForActions } from './UserActionsMenu';
import type { OrphanAction, OrphanUser } from './OrphanActionsMenu';

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
  emailVerified?: boolean;
  isOrphan?: boolean;
  orphanReason?: string | null;
}

interface Company {
  id: number;
  name: string;
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

function fmtDate(dateStr: string | null): string {
  if (!dateStr) return '—';
  return new Date(dateStr).toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' });
}

function roleBadge(role: string): string {
  if (role === 'owner') return 'bg-primary/10 text-primary border-primary/20';
  if (role === 'admin') return 'bg-violet-50 text-violet-700 border-violet-200';
  if (role === 'member') return 'bg-blue-50 text-blue-700 border-blue-200';
  return 'bg-slate-100 text-slate-600 border-slate-200';
}

function statusBadge(status: string): string {
  if (status === 'active') return 'bg-emerald-50 text-emerald-700 border-emerald-200';
  if (status === 'invited') return 'bg-amber-50 text-amber-700 border-amber-200';
  return 'bg-slate-100 text-slate-500 border-slate-200';
}

interface Props {
  users: OcUser[];
  companies: Company[];
  filterStatus: string;
  filterRole: string;
  filterVerified: string;
  filterCompanyId: number | null;
  userSearch: string;
  onFilterStatus: (v: string) => void;
  onFilterRole: (v: string) => void;
  onFilterVerified: (v: string) => void;
  onFilterCompanyId: (v: number | null) => void;
  onUserSearch: (v: string) => void;
  onClearFilters: () => void;
  onUserAction: (action: UserAction, user: OcUserForActions) => Promise<void>;
  onOrphanAction: (action: OrphanAction, user: OrphanUser) => void;
  actionToast: string | null;
}

export default function UsersTab({
  users, companies,
  filterStatus, filterRole, filterVerified, filterCompanyId, userSearch,
  onFilterStatus, onFilterRole, onFilterVerified, onFilterCompanyId, onUserSearch, onClearFilters,
  onUserAction, onOrphanAction, actionToast,
}: Props) {
  const filterCompanyName = filterCompanyId ? companies.find((c) => c.id === filterCompanyId)?.name : null;

  const filteredUsers = users.filter((u) => {
    if (filterStatus === 'orphan') return !!u.isOrphan;
    if (filterStatus && u.status !== filterStatus) return false;
    if (filterCompanyId && u.companyId !== filterCompanyId) return false;
    if (filterRole && u.role !== filterRole) return false;
    if (filterVerified === 'verified' && u.emailVerified === false) return false;
    if (filterVerified === 'unverified' && u.emailVerified !== false) return false;
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
    <div className="max-w-6xl">
      {actionToast && (
        <div className="mb-4 px-4 py-3 bg-emerald-50 border border-emerald-200 rounded-xl text-sm font-semibold text-emerald-700">
          {actionToast}
        </div>
      )}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 flex flex-col gap-3">
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex-1 min-w-0">
              <h2 className="font-bold text-slate-800">All Users</h2>
              <p className="text-xs text-slate-400 mt-0.5">
                {filterCompanyName ? (
                  <span>Filtered: <span className="font-semibold text-slate-600">{filterCompanyName}</span> · <button onClick={() => onFilterCompanyId(null)} className="text-primary hover:underline">Clear</button></span>
                ) : (
                  <>
                    {filteredUsers.length} of {users.length} users
                    {users.filter(u => u.isOrphan).length > 0 && (
                      <span className="ml-2 text-amber-600 font-semibold">
                        · {users.filter(u => u.isOrphan).length} incomplete signup{users.filter(u => u.isOrphan).length !== 1 ? 's' : ''}
                      </span>
                    )}
                  </>
                )}
              </p>
            </div>
            <input
              type="text"
              value={userSearch}
              onChange={(e) => onUserSearch(e.target.value)}
              placeholder="Search name, email, company…"
              className="w-52 px-3 py-2 text-sm border border-slate-200 rounded-xl bg-slate-50 focus:outline-none focus:border-primary/60 focus:bg-white transition-colors"
            />
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <Filter size={12} className="text-slate-400 shrink-0" />
            <select value={filterStatus} onChange={(e) => onFilterStatus(e.target.value)} className="px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg bg-slate-50 focus:outline-none focus:border-primary/60 transition-colors">
              <option value="">All statuses</option>
              <option value="active">Active</option>
              <option value="invited">Invited</option>
              <option value="inactive">Inactive</option>
              <option value="orphan">Incomplete signup</option>
            </select>
            <select value={filterRole} onChange={(e) => onFilterRole(e.target.value)} className="px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg bg-slate-50 focus:outline-none focus:border-primary/60 transition-colors">
              <option value="">All roles</option>
              <option value="owner">Owner</option>
              <option value="admin">Admin</option>
              <option value="member">Member</option>
              <option value="viewer">Viewer</option>
            </select>
            <select value={filterVerified} onChange={(e) => onFilterVerified(e.target.value)} className="px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg bg-slate-50 focus:outline-none focus:border-primary/60 transition-colors">
              <option value="">All verification</option>
              <option value="verified">Verified</option>
              <option value="unverified">Unverified</option>
            </select>
            <select value={filterCompanyId?.toString() ?? ''} onChange={(e) => onFilterCompanyId(e.target.value ? Number(e.target.value) : null)} className="px-2.5 py-1.5 text-xs border border-slate-200 rounded-lg bg-slate-50 focus:outline-none focus:border-primary/60 transition-colors">
              <option value="">All companies</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            {(filterStatus || filterRole || filterVerified || filterCompanyId) && (
              <button onClick={onClearFilters} className="text-xs text-primary font-semibold hover:underline">
                Clear filters
              </button>
            )}
          </div>
        </div>

        {filteredUsers.length === 0 ? (
          <p className="text-sm text-slate-400 text-center py-12">No users match the current filters</p>
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
                  <th className="text-right px-4 py-3 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredUsers.map((u) => (
                  <tr key={u.userId} className={`hover:bg-slate-50 transition-colors ${u.status === 'inactive' ? 'opacity-60' : ''} ${u.isOrphan ? 'bg-amber-50/40' : ''}`}>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-white font-black text-xs shrink-0 ${u.isOrphan ? 'bg-amber-400' : u.status === 'inactive' ? 'bg-slate-400' : 'bg-primary'}`}>
                          {(u.name || u.email || '?')[0].toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 flex-wrap">
                            <p className="font-semibold text-slate-800 truncate">{u.name}</p>
                            {u.isOrphan ? (
                              <span className="shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded border bg-amber-50 text-amber-700 border-amber-300">Incomplete signup</span>
                            ) : u.emailVerified === false ? (
                              <span className="shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded border bg-amber-50 text-amber-700 border-amber-200">Unverified</span>
                            ) : (
                              <span className="shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded border bg-emerald-50 text-emerald-700 border-emerald-200">Verified</span>
                            )}
                          </div>
                          <p className="text-[11px] text-slate-400 truncate">{u.email}</p>
                          {u.isOrphan && <p className="text-[10px] text-amber-600 mt-0.5">No profile · No company</p>}
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3.5 text-slate-600 truncate max-w-[140px]">
                      {u.isOrphan ? <span className="text-amber-500 text-xs font-semibold">—</span> : u.company}
                    </td>
                    <td className="px-4 py-3.5">
                      {u.isOrphan ? (
                        <span className="text-[11px] font-bold px-2 py-0.5 rounded-lg border bg-amber-50 text-amber-600 border-amber-200">—</span>
                      ) : (
                        <span className={`text-[11px] font-bold px-2 py-0.5 rounded-lg border capitalize ${roleBadge(u.role)}`}>{u.role}</span>
                      )}
                    </td>
                    <td className="px-4 py-3.5">
                      {u.isOrphan ? (
                        <span className="text-[11px] font-bold px-2 py-0.5 rounded-lg border bg-amber-50 text-amber-700 border-amber-200">Orphan</span>
                      ) : (
                        <span className={`text-[11px] font-bold px-2 py-0.5 rounded-lg border capitalize ${statusBadge(u.status)}`}>{u.status}</span>
                      )}
                    </td>
                    <td className="px-5 py-3.5 text-slate-500 text-xs">{timeAgo(u.lastLoginAt)}</td>
                    <td className="px-5 py-3.5 text-slate-500 text-xs">{timeAgo(u.lastActiveAt)}</td>
                    <td className="px-4 py-3.5 text-center">
                      <Circle size={10} className={u.onlineNow ? 'text-emerald-500 fill-emerald-500' : 'text-slate-300 fill-slate-300'} />
                    </td>
                    <td className="px-5 py-3.5 text-slate-500 text-xs">{fmtDate(u.createdAt)}</td>
                    <td className="px-4 py-3.5 text-right">
                      {u.isOrphan ? (
                        <OrphanActionsMenu
                          user={{ userId: u.userId, name: u.name, email: u.email, emailVerified: u.emailVerified ?? false }}
                          onAction={(action, target) => onOrphanAction(action, target)}
                        />
                      ) : (
                        <UserActionsMenu
                          user={{ id: u.id, userId: u.userId, name: u.name, email: u.email, role: u.role, status: u.status, emailVerified: u.emailVerified, companyId: u.companyId }}
                          onAction={onUserAction}
                        />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
