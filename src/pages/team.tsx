import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Helmet } from '@dr.pogodin/react-helmet';
import {
  Users,
  Plus,
  Search,
  Shield,
  HardHat,
  Truck,
  Mail,
  Phone,
  MoreHorizontal,
  CheckCircle2,
  Clock,
  XCircle,
  X,
  ChevronDown,
  Loader2,
  AlertCircle,
  Trash2,
  Edit2,
  ToggleLeft,
  ToggleRight,
} from 'lucide-react';
import PortalSidebar from '@/components/PortalSidebar';

type Role = 'admin' | 'supervisor' | 'operator' | 'viewer';
type Status = 'active' | 'invited' | 'inactive';

interface Permission {
  key: string;
  label: string;
  description: string;
}

const PERMISSIONS: Permission[] = [
  { key: 'jobs',          label: 'Jobs',           description: 'View and manage jobs' },
  { key: 'fleet',         label: 'Fleet',          description: 'View and manage fleet assets' },
  { key: 'forms',         label: 'Forms',          description: 'Access form templates' },
  { key: 'files',         label: 'Files',          description: 'Access file storage' },
  { key: 'estimating',    label: 'Estimating',     description: 'View and create estimates' },
  { key: 'dazzaAi',       label: 'Dazza AI',       description: 'Use the AI assistant' },
  { key: 'seeDollars',    label: 'See Dollars',    description: 'View financial figures' },
  { key: 'inviteUsers',   label: 'Invite Users',   description: 'Invite new team members' },
  { key: 'deleteRecords', label: 'Delete Records', description: 'Permanently delete records' },
  { key: 'admin',         label: 'Admin Access',   description: 'Full admin privileges' },
];

interface TeamMember {
  id: number;
  userId: string;
  name: string;
  email: string;
  phone: string;
  role: Role;
  status: Status;
  permissions: Record<string, boolean>;
  joinedAt: string | null;
}

const roleConfig: Record<Role, { label: string; color: string; bg: string; icon: typeof Shield }> = {
  admin:      { label: 'Admin',      color: 'text-blue-700',   bg: 'bg-blue-50 border-blue-200',     icon: Shield },
  supervisor: { label: 'Supervisor', color: 'text-violet-700', bg: 'bg-violet-50 border-violet-200', icon: HardHat },
  operator:   { label: 'Operator',   color: 'text-amber-700',  bg: 'bg-amber-50 border-amber-200',   icon: Truck },
  viewer:     { label: 'Viewer',     color: 'text-slate-600',  bg: 'bg-slate-100 border-slate-200',  icon: Users },
};

const statusConfig: Record<Status, { label: string; color: string; icon: typeof CheckCircle2 }> = {
  active:   { label: 'Active',   color: 'text-emerald-600', icon: CheckCircle2 },
  invited:  { label: 'Invited',  color: 'text-amber-600',   icon: Clock },
  inactive: { label: 'Inactive', color: 'text-slate-400',   icon: XCircle },
};

const fadeUp = {
  hidden: { opacity: 0, y: 10 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.22, ease: 'easeOut' as const } },
} as const;

const stagger = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.04 } },
} as const;

// ── Invite Modal ──────────────────────────────────────────────────────────────
function InviteModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('operator');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !email.trim()) { setError('Name and email are required.'); return; }
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/team/invite', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ name: name.trim(), email: email.trim().toLowerCase(), role }),
      });
      const data = await res.json() as { ok?: boolean; message?: string; error?: string };
      if (!res.ok) { setError(data.error ?? 'Invite failed'); setLoading(false); return; }
      setSuccess(data.message ?? 'Invite sent!');
      setTimeout(() => { onSuccess(); onClose(); }, 1800);
    } catch {
      setError('Network error. Please try again.');
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 8 }}
        transition={{ duration: 0.18, ease: 'easeOut' }}
        className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 z-10"
      >
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-heading font-bold text-lg text-slate-900">Invite Team Member</h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
            <X size={18} />
          </button>
        </div>

        {success ? (
          <div className="flex flex-col items-center gap-3 py-6 text-center">
            <CheckCircle2 size={36} className="text-emerald-500" />
            <p className="text-sm font-semibold text-slate-700">{success}</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Full Name</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Jake Parrish"
                className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Email Address</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="jake@example.com"
                className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors"
              />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Role</label>
              <div className="relative">
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value as Role)}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm appearance-none focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors"
                >
                  <option value="admin">Admin — full access</option>
                  <option value="supervisor">Supervisor — manage jobs + fleet</option>
                  <option value="operator">Operator — day-to-day tasks</option>
                  <option value="viewer">Viewer — read only</option>
                </select>
                <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              </div>
            </div>

            {error && (
              <div className="flex items-center gap-2 text-red-600 text-xs bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                <AlertCircle size={13} />
                {error}
              </div>
            )}

            <p className="text-xs text-slate-400">
              They'll receive an invite link to set up their account at <span className="font-semibold">/signup</span>.
            </p>

            <div className="flex gap-3 pt-1">
              <button type="button" onClick={onClose} className="flex-1 border border-slate-200 text-slate-600 text-sm font-semibold py-2.5 rounded-lg hover:bg-slate-50 transition-colors">
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading}
                className="flex-1 bg-primary hover:bg-orange-600 text-white text-sm font-bold py-2.5 rounded-lg transition-colors flex items-center justify-center gap-2 disabled:opacity-60"
              >
                {loading ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                Send Invite
              </button>
            </div>
          </form>
        )}
      </motion.div>
    </div>
  );
}

// ── Edit Member Modal ─────────────────────────────────────────────────────────
function EditMemberModal({
  member,
  onClose,
  onSuccess,
}: {
  member: TeamMember;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [role, setRole] = useState<Role>(member.role);
  const [status, setStatus] = useState<Status>(member.status);
  const [perms, setPerms] = useState<Record<string, boolean>>({ ...member.permissions });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  function togglePerm(key: string) {
    setPerms((p) => ({ ...p, [key]: !p[key] }));
  }

  async function handleSave() {
    setError('');
    setLoading(true);
    try {
      const body = {
        role,
        status,
        permJobs: perms.jobs,
        permFleet: perms.fleet,
        permForms: perms.forms,
        permFiles: perms.files,
        permEstimating: perms.estimating,
        permDazzaAi: perms.dazzaAi,
        permAdmin: perms.admin,
        permSeeDollars: perms.seeDollars,
        permInviteUsers: perms.inviteUsers,
        permDeleteRecords: perms.deleteRecords,
      };
      const res = await fetch(`/api/team/${member.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
      });
      const data = await res.json() as { error?: string };
      if (!res.ok) { setError(data.error ?? 'Update failed'); setLoading(false); return; }
      onSuccess();
      onClose();
    } catch {
      setError('Network error. Please try again.');
      setLoading(false);
    }
  }

  async function handleRemove() {
    if (!confirm(`Remove ${member.name} from the team? They will be set to inactive.`)) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/team/${member.id}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!res.ok) { setError('Failed to remove member'); setLoading(false); return; }
      onSuccess();
      onClose();
    } catch {
      setError('Network error.');
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 8 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.96, y: 8 }}
        transition={{ duration: 0.18, ease: 'easeOut' }}
        className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 z-10 max-h-[90vh] overflow-y-auto"
      >
        <div className="flex items-center justify-between mb-5">
          <div>
            <h2 className="font-heading font-bold text-lg text-slate-900">{member.name}</h2>
            <p className="text-xs text-slate-400">{member.email}</p>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 transition-colors">
            <X size={18} />
          </button>
        </div>

        <div className="flex flex-col gap-5">
          {/* Role + Status */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Role</label>
              <div className="relative">
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value as Role)}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm appearance-none focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors"
                >
                  <option value="admin">Admin</option>
                  <option value="supervisor">Supervisor</option>
                  <option value="operator">Operator</option>
                  <option value="viewer">Viewer</option>
                </select>
                <ChevronDown size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              </div>
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Status</label>
              <div className="relative">
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as Status)}
                  className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm appearance-none focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors"
                >
                  <option value="active">Active</option>
                  <option value="invited">Invited</option>
                  <option value="inactive">Inactive</option>
                </select>
                <ChevronDown size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              </div>
            </div>
          </div>

          {/* Permissions */}
          <div>
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-3">Permissions</h3>
            <div className="flex flex-col gap-2">
              {PERMISSIONS.map((p) => {
                const on = perms[p.key] ?? false;
                return (
                  <button
                    key={p.key}
                    type="button"
                    onClick={() => togglePerm(p.key)}
                    className={`flex items-center justify-between px-3 py-2.5 rounded-lg border transition-colors text-left ${
                      on
                        ? 'bg-primary/5 border-primary/20'
                        : 'bg-slate-50 border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <div>
                      <div className={`text-sm font-semibold ${on ? 'text-slate-900' : 'text-slate-500'}`}>{p.label}</div>
                      <div className="text-xs text-slate-400">{p.description}</div>
                    </div>
                    {on
                      ? <ToggleRight size={22} className="text-primary shrink-0" />
                      : <ToggleLeft size={22} className="text-slate-300 shrink-0" />
                    }
                  </button>
                );
              })}
            </div>
          </div>

          {error && (
            <div className="flex items-center gap-2 text-red-600 text-xs bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              <AlertCircle size={13} />
              {error}
            </div>
          )}

          <div className="flex gap-3 pt-1">
            <button
              type="button"
              onClick={handleRemove}
              disabled={loading}
              className="flex items-center gap-1.5 border border-red-200 text-red-500 text-sm font-semibold px-3 py-2.5 rounded-lg hover:bg-red-50 transition-colors disabled:opacity-50"
            >
              <Trash2 size={13} />
              Remove
            </button>
            <div className="flex-1" />
            <button type="button" onClick={onClose} className="border border-slate-200 text-slate-600 text-sm font-semibold px-4 py-2.5 rounded-lg hover:bg-slate-50 transition-colors">
              Cancel
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={loading}
              className="bg-primary hover:bg-orange-600 text-white text-sm font-bold px-4 py-2.5 rounded-lg transition-colors flex items-center gap-2 disabled:opacity-60"
            >
              {loading ? <Loader2 size={13} className="animate-spin" /> : null}
              Save Changes
            </button>
          </div>
        </div>
      </motion.div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function TeamPage() {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [showInvite, setShowInvite] = useState(false);
  const [editMember, setEditMember] = useState<TeamMember | null>(null);
  const [openMenuId, setOpenMenuId] = useState<number | null>(null);

  const loadTeam = useCallback(async () => {
    try {
      const res = await fetch('/api/team', { credentials: 'include' });
      if (!res.ok) {
        const d = await res.json() as { error?: string };
        setError(d.error ?? 'Failed to load team');
        setLoading(false);
        return;
      }
      const data = await res.json() as { members: TeamMember[] };
      setMembers(data.members);
    } catch {
      setError('Network error loading team');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadTeam(); }, [loadTeam]);

  const filtered = members.filter(
    (m) =>
      m.name.toLowerCase().includes(search.toLowerCase()) ||
      m.email.toLowerCase().includes(search.toLowerCase()) ||
      m.role.toLowerCase().includes(search.toLowerCase())
  );

  const stats = [
    { label: 'Active',   count: members.filter(m => m.status === 'active').length,   color: 'text-emerald-600', bg: 'bg-emerald-50' },
    { label: 'Invited',  count: members.filter(m => m.status === 'invited').length,  color: 'text-amber-600',   bg: 'bg-amber-50' },
    { label: 'Inactive', count: members.filter(m => m.status === 'inactive').length, color: 'text-slate-400',   bg: 'bg-slate-100' },
    { label: 'Admins',   count: members.filter(m => m.role === 'admin').length,      color: 'text-blue-600',    bg: 'bg-blue-50' },
  ];

  return (
    <div className="flex h-screen bg-slate-100 overflow-hidden">
      <Helmet>
        <title>Team — IWILLBUILD Portal</title>
        <meta name="description" content="Manage team members, roles and access for the IWILLBUILD portal." />
        <link rel="canonical" href="https://iwillbuild.com/team" />
        <meta name="robots" content="noindex" />
      </Helmet>

      <PortalSidebar />

      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar */}
        <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-6 shrink-0">
          <div className="flex items-center gap-3">
            <Users size={20} className="text-primary" />
            <h1 className="font-heading font-bold text-lg">Team</h1>
            {!loading && (
              <span className="text-xs bg-slate-100 text-slate-500 font-semibold px-2 py-0.5 rounded-full">
                {members.length} member{members.length !== 1 ? 's' : ''}
              </span>
            )}
          </div>
          <button
            onClick={() => setShowInvite(true)}
            className="flex items-center gap-2 bg-primary hover:bg-orange-600 text-white text-sm font-bold px-4 py-2 rounded-lg transition-colors"
          >
            <Plus size={15} />
            Invite Member
          </button>
        </header>

        <div className="flex-1 overflow-auto">
          <div className="p-6 flex flex-col gap-5">

            {/* Summary stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {stats.map((s) => (
                <div key={s.label} className={`${s.bg} rounded-xl p-4 border border-white`}>
                  <div className={`text-2xl font-black ${s.color}`}>{loading ? '—' : s.count}</div>
                  <div className="text-xs font-semibold text-slate-500 mt-0.5">{s.label}</div>
                </div>
              ))}
            </div>

            {/* Search */}
            <div className="relative">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input
                type="text"
                placeholder="Search by name, email, role…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-4 py-2.5 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors"
              />
            </div>

            {/* Error */}
            {error && (
              <div className="flex items-center gap-2 text-red-600 text-sm bg-red-50 border border-red-200 rounded-xl px-4 py-3">
                <AlertCircle size={15} />
                {error}
              </div>
            )}

            {/* Loading */}
            {loading && (
              <div className="flex items-center justify-center py-16 text-slate-400 gap-2">
                <Loader2 size={18} className="animate-spin" />
                <span className="text-sm">Loading team…</span>
              </div>
            )}

            {/* Member list */}
            {!loading && !error && (
              <motion.div
                variants={stagger}
                initial="hidden"
                animate="visible"
                className="flex flex-col gap-3"
              >
                {filtered.map((member) => {
                  const role = roleConfig[member.role] ?? roleConfig.viewer;
                  const status = statusConfig[member.status] ?? statusConfig.active;
                  const RoleIcon = role.icon;
                  const StatusIcon = status.icon;

                  return (
                    <motion.div
                      key={member.id}
                      variants={fadeUp}
                      className="bg-white border border-slate-200 rounded-xl p-4 flex items-center gap-4 hover:border-primary/30 hover:shadow-sm transition-all duration-150"
                    >
                      {/* Avatar */}
                      <div
                        className="w-11 h-11 rounded-xl flex items-center justify-center text-white font-black text-sm shrink-0 bg-gradient-to-br from-slate-600 to-slate-800"
                      >
                        {member.name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase()}
                      </div>

                      {/* Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-slate-900">{member.name}</span>
                          <span className={`inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full border ${role.bg} ${role.color}`}>
                            <RoleIcon size={10} />
                            {role.label}
                          </span>
                          <span className={`inline-flex items-center gap-1 text-xs font-semibold ${status.color}`}>
                            <StatusIcon size={11} />
                            {status.label}
                          </span>
                        </div>
                        <div className="flex items-center gap-4 mt-1 text-xs text-slate-400 flex-wrap">
                          <span className="flex items-center gap-1"><Mail size={10} />{member.email}</span>
                          {member.phone && <span className="flex items-center gap-1"><Phone size={10} />{member.phone}</span>}
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="relative shrink-0">
                        <button
                          onClick={() => setOpenMenuId(openMenuId === member.id ? null : member.id)}
                          className="text-slate-300 hover:text-slate-600 transition-colors p-1"
                        >
                          <MoreHorizontal size={18} />
                        </button>
                        <AnimatePresence>
                          {openMenuId === member.id && (
                            <motion.div
                              initial={{ opacity: 0, scale: 0.95, y: -4 }}
                              animate={{ opacity: 1, scale: 1, y: 0 }}
                              exit={{ opacity: 0, scale: 0.95, y: -4 }}
                              transition={{ duration: 0.12 }}
                              className="absolute right-0 top-8 bg-white border border-slate-200 rounded-xl shadow-lg z-20 min-w-[140px] py-1 overflow-hidden"
                            >
                              <button
                                onClick={() => { setEditMember(member); setOpenMenuId(null); }}
                                className="flex items-center gap-2 w-full px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
                              >
                                <Edit2 size={13} />
                                Edit Member
                              </button>
                            </motion.div>
                          )}
                        </AnimatePresence>
                      </div>
                    </motion.div>
                  );
                })}

                {filtered.length === 0 && !loading && (
                  <div className="text-center py-16 text-slate-400 text-sm">
                    {search ? 'No members match your search.' : 'No team members yet. Invite someone to get started.'}
                  </div>
                )}
              </motion.div>
            )}
          </div>
        </div>
      </div>

      {/* Click-away for menu */}
      {openMenuId !== null && (
        <div className="fixed inset-0 z-10" onClick={() => setOpenMenuId(null)} />
      )}

      {/* Modals */}
      <AnimatePresence>
        {showInvite && (
          <InviteModal
            onClose={() => setShowInvite(false)}
            onSuccess={loadTeam}
          />
        )}
        {editMember && (
          <EditMemberModal
            member={editMember}
            onClose={() => setEditMember(null)}
            onSuccess={loadTeam}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
