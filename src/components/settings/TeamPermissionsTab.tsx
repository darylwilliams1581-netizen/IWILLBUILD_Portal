/**
 * TeamPermissionsTab
 * ─────────────────────────────────────────────────────────────────────────────
 * Full team list with inline-expandable permission editor.
 * • All active permissions shown on the collapsed card (no truncation)
 * • Click a card to expand it and edit role/status/permissions inline
 * • No modal required — everything visible without opening anything
 */
import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from "react-router";
import { AnimatePresence, motion } from 'motion/react';
import { Users, ExternalLink, Loader2, AlertCircle, Crown, Shield, UserCheck, HardHat, Truck, Eye, CheckCircle2, Clock, XCircle, ToggleLeft, ToggleRight, Lock, ChevronDown, ChevronUp, Search, Save } from 'lucide-react';
import { usePermissions } from '@/lib/usePermissions';
type Role = 'owner' | 'admin' | 'manager' | 'supervisor' | 'worker' | 'readonly';
type Status = 'active' | 'invited' | 'inactive';
const ROLE_CONFIG: Record<Role, {
  label: string;
  color: string;
  bg: string;
  border: string;
  avatarBg: string;
  icon: React.ElementType;
}> = {
  owner: {
    label: 'Owner',
    color: 'text-amber-700',
    bg: 'bg-amber-50',
    border: 'border-amber-300',
    avatarBg: 'from-amber-500 to-violet-700',
    icon: Crown
  },
  admin: {
    label: 'Admin',
    color: 'text-blue-700',
    bg: 'bg-blue-50',
    border: 'border-blue-200',
    avatarBg: 'from-blue-500 to-blue-700',
    icon: Shield
  },
  manager: {
    label: 'Manager',
    color: 'text-violet-700',
    bg: 'bg-violet-50',
    border: 'border-violet-200',
    avatarBg: 'from-violet-500 to-violet-700',
    icon: UserCheck
  },
  supervisor: {
    label: 'Supervisor',
    color: 'text-indigo-700',
    bg: 'bg-indigo-50',
    border: 'border-indigo-200',
    avatarBg: 'from-indigo-500 to-indigo-700',
    icon: HardHat
  },
  worker: {
    label: 'Worker',
    color: 'text-emerald-700',
    bg: 'bg-emerald-50',
    border: 'border-emerald-200',
    avatarBg: 'from-emerald-500 to-emerald-700',
    icon: Truck
  },
  readonly: {
    label: 'Read Only',
    color: 'text-slate-600',
    bg: 'bg-slate-100',
    border: 'border-slate-200',
    avatarBg: 'from-slate-400 to-slate-600',
    icon: Eye
  }
};
const STATUS_CONFIG: Record<Status, {
  label: string;
  color: string;
  icon: React.ElementType;
}> = {
  active: {
    label: 'Active',
    color: 'text-emerald-600',
    icon: CheckCircle2
  },
  invited: {
    label: 'Invited',
    color: 'text-amber-600',
    icon: Clock
  },
  inactive: {
    label: 'Inactive',
    color: 'text-slate-400',
    icon: XCircle
  }
};
interface PermDef {
  key: string;
  label: string;
}
const PERMISSIONS: PermDef[] = [{
  key: 'jobs',
  label: 'Jobs'
}, {
  key: 'fleet',
  label: 'Fleet'
}, {
  key: 'forms',
  label: 'Forms'
}, {
  key: 'files',
  label: 'Files'
}, {
  key: 'estimating',
  label: 'Estimating'
}, {
  key: 'dazzaAi',
  label: 'System Tools'
}, {
  key: 'seeDollars',
  label: 'See Dollars'
}, {
  key: 'inviteUsers',
  label: 'Invite Users'
}, {
  key: 'deleteRecords',
  label: 'Delete Records'
}, {
  key: 'admin',
  label: 'Admin Access'
}];
interface TeamMember {
  id: number;
  userId: string;
  name: string;
  email: string;
  phone: string;
  role: string;
  status: string;
  permissions: Record<string, boolean>;
  joinedAt: string | null;
}
function Avatar({
  name,
  role
}: {
  name: string;
  role: string;
}) {
  const cfg = ROLE_CONFIG[role as Role] ?? ROLE_CONFIG.worker;
  const initials = name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
  return <div className={`w-9 h-9 rounded-xl flex items-center justify-center text-white font-black text-xs shrink-0 bg-gradient-to-br ${cfg.avatarBg}`}>
      {initials}
    </div>;
}
function RoleBadge({
  role
}: {
  role: string;
}) {
  const cfg = ROLE_CONFIG[role as Role] ?? ROLE_CONFIG.worker;
  const Icon = cfg.icon;
  return <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-1.5 py-0.5 rounded-full border ${cfg.bg} ${cfg.border} ${cfg.color}`}>
      <Icon size={9} />{cfg.label}
    </span>;
}

// ── Inline expanded editor ────────────────────────────────────────────────────
function InlineEditor({
  member,
  callerIsOwner,
  onClose,
  onSuccess
}: {
  member: TeamMember;
  callerIsOwner: boolean;
  onClose: () => void;
  onSuccess: (updated: TeamMember) => void;
}) {
  const targetIsOwner = member.role === 'owner';
  const permsLocked = targetIsOwner;
  const roleLocked = targetIsOwner && !callerIsOwner;
  const [role, setRole] = useState<Role>(member.role as Role);
  const [status, setStatus] = useState<Status>(member.status as Status);
  const [perms, setPerms] = useState<Record<string, boolean>>({
    ...member.permissions
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const availableRoles: Array<{
    value: Role;
    label: string;
  }> = [...(callerIsOwner ? [{
    value: 'owner' as Role,
    label: 'Owner'
  }] : []), {
    value: 'admin',
    label: 'Admin'
  }, {
    value: 'manager',
    label: 'Manager'
  }, {
    value: 'supervisor',
    label: 'Supervisor'
  }, {
    value: 'worker',
    label: 'Worker'
  }, {
    value: 'readonly',
    label: 'Read Only'
  }];
  async function handleSave() {
    setError('');
    setSaving(true);
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
        permDeleteRecords: perms.deleteRecords
      };
      const res = await fetch(`/api/team/${member.id}`, {
        method: 'PUT',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
      });
      const data = (await res.json()) as {
        error?: string;
      };
      if (!res.ok) {
        setError(data.error ?? 'Update failed');
        setSaving(false);
        return;
      }
      onSuccess({
        ...member,
        role,
        status,
        permissions: perms
      });
      onClose();
    } catch {
      setError('Network error.');
      setSaving(false);
    }
  }
  return <motion.div initial={{
    opacity: 0,
    height: 0
  }} animate={{
    opacity: 1,
    height: 'auto'
  }} exit={{
    opacity: 0,
    height: 0
  }} transition={{
    duration: 0.2,
    ease: 'easeOut'
  }} className="overflow-hidden">
      <div className="px-4 pb-4 pt-1 border-t border-slate-100 bg-slate-50/60">
        {targetIsOwner && !callerIsOwner && <div className="flex items-center gap-2 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2.5 mb-3 text-xs text-amber-700 font-semibold">
            <Lock size={12} /> Owner accounts can only be modified by another Owner.
          </div>}

        {/* Role + Status row */}
        <div className="grid grid-cols-2 gap-3 mb-3">
          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Role</label>
            {roleLocked ? <div className="flex items-center gap-1.5 px-3 py-2 bg-white border border-slate-200 rounded-lg text-xs text-slate-500">
                <Lock size={11} /> Owner
              </div> : <select value={role} onChange={e => setRole(e.target.value as Role)} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary">
                {availableRoles.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
              </select>}
          </div>
          <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1">Status</label>
            <select value={status} onChange={e => setStatus(e.target.value as Status)} disabled={targetIsOwner} className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary disabled:opacity-50">
              {(['active', 'invited', 'inactive'] as Status[]).map(s => <option key={s} value={s}>{STATUS_CONFIG[s].label}</option>)}
            </select>
          </div>
        </div>

        {/* Permissions grid */}
        <div className="mb-3">
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Permissions</label>
            {permsLocked && <span className="text-[10px] text-amber-600 font-semibold flex items-center gap-1"><Lock size={9} />Locked</span>}
          </div>
          <div className="grid grid-cols-2 gap-1">
            {PERMISSIONS.map(({
            key,
            label
          }) => {
            const on = perms[key] ?? false;
            return <button key={key} type="button" onClick={() => {
              if (!permsLocked) setPerms(p => ({
                ...p,
                [key]: !p[key]
              }));
            }} disabled={permsLocked} className={`flex items-center justify-between px-3 py-2 rounded-lg border text-xs transition-colors ${on ? 'bg-primary/5 border-primary/20 text-slate-800 font-semibold' : 'bg-white border-slate-200 text-slate-400'} ${permsLocked ? 'cursor-not-allowed opacity-60' : 'hover:border-primary/40 cursor-pointer'}`}>
                  <span>{label}</span>
                  {on ? <ToggleRight size={16} className="text-primary shrink-0" /> : <ToggleLeft size={16} className="text-slate-300 shrink-0" />}
                </button>;
          })}
          </div>
        </div>

        {error && <div className="flex items-center gap-2 text-red-600 text-xs bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-3">
            <AlertCircle size={12} />{error}
          </div>}

        <div className="flex gap-2">
          <button onClick={onClose} className="flex-1 border border-slate-200 text-slate-600 text-xs font-semibold py-2 rounded-lg hover:bg-white transition-colors">
            Cancel
          </button>
          <button onClick={handleSave} disabled={saving || targetIsOwner && !callerIsOwner} className="flex-1 bg-primary hover:bg-violet-700 text-white text-xs font-bold py-2 rounded-lg transition-colors flex items-center justify-center gap-1.5 disabled:opacity-60">
            {saving ? <Loader2 size={12} className="animate-spin" /> : <Save size={12} />}
            Save Changes
          </button>
        </div>
      </div>
    </motion.div>;
}

// ── Main Tab ──────────────────────────────────────────────────────────────────
export default function TeamPermissionsTab({
  isAdmin
}: {
  isAdmin: boolean;
}) {
  const navigate = useNavigate();
  const {
    isOwner,
    isPlatformOwner
  } = usePermissions();
  const effectiveAdmin = isAdmin || isPlatformOwner;
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const loadMembers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/team', {
        credentials: 'include'
      });
      if (!res.ok) throw new Error('Failed');
      const data = (await res.json()) as {
        members: TeamMember[];
      };
      setMembers(data.members);
    } catch {
      setError('Failed to load team members.');
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    void loadMembers();
  }, [loadMembers]);
  if (!effectiveAdmin) {
    return <div className="flex flex-col items-center justify-center py-16 text-slate-400">
        <Lock size={28} className="mb-2 opacity-40" />
        <p className="text-sm font-semibold">Admin access required to manage team permissions.</p>
      </div>;
  }
  const filtered = members.filter(m => m.name.toLowerCase().includes(search.toLowerCase()) || m.email.toLowerCase().includes(search.toLowerCase()));
  function handleUpdated(updated: TeamMember) {
    setMembers(prev => prev.map(m => m.id === updated.id ? updated : m));
  }
  return <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center">
            <Users size={18} className="text-slate-600" />
          </div>
          <div>
            <h2 className="font-heading font-bold text-lg text-slate-900">Team & Permissions</h2>
            <p className="text-sm text-slate-500">{members.length} member{members.length !== 1 ? 's' : ''}</p>
          </div>
        </div>
        <button onClick={() => navigate('/team')} className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-800 border border-slate-200 rounded-lg px-3 py-2 hover:bg-slate-50 transition-colors">
          <ExternalLink size={12} /> Full Team Page
        </button>
      </div>

      {/* Search */}
      <div className="relative mb-4">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search members…" className="w-full pl-9 pr-4 py-2.5 border border-slate-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors" />
      </div>

      {loading ? <div className="flex items-center justify-center py-12">
          <Loader2 size={20} className="animate-spin text-slate-400" />
        </div> : error ? <div className="flex items-center gap-2 text-red-600 text-sm bg-red-50 border border-red-200 rounded-xl px-4 py-3">
          <AlertCircle size={14} />{error}
        </div> : <div className="flex flex-col gap-2">
          {filtered.map(member => {
        const statusCfg = STATUS_CONFIG[member.status as Status] ?? STATUS_CONFIG.active;
        const StatusIcon = statusCfg.icon;
        const activePerms = PERMISSIONS.filter(p => member.permissions[p.key]);
        const isExpanded = expandedId === member.id;
        return <div key={member.id} className={`border rounded-xl transition-colors overflow-hidden ${isExpanded ? 'border-primary/30 bg-white shadow-sm' : 'border-slate-200 bg-white hover:border-slate-300'}`}>
                {/* Collapsed row — always visible */}
                <div className="flex items-start gap-3 p-3 cursor-pointer select-none" onClick={() => setExpandedId(isExpanded ? null : member.id)}>
                  <Avatar name={member.name} role={member.role} />

                  <div className="flex-1 min-w-0">
                    {/* Name + badges row */}
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-semibold text-slate-800">{member.name}</span>
                      <RoleBadge role={member.role} />
                      <span className={`flex items-center gap-0.5 text-[10px] font-semibold ${statusCfg.color}`}>
                        <StatusIcon size={9} />{statusCfg.label}
                      </span>
                    </div>

                    {/* Email */}
                    <p className="text-xs text-slate-400 truncate mt-0.5">{member.email}</p>

                    {/* ALL active permission chips — no truncation */}
                    {activePerms.length > 0 ? <div className="flex flex-wrap gap-1 mt-1.5">
                        {activePerms.map(p => <span key={p.key} className="text-[9px] font-semibold bg-primary/8 text-primary border border-primary/15 px-1.5 py-0.5 rounded-full">
                            {p.label}
                          </span>)}
                      </div> : <p className="text-[10px] text-slate-300 mt-1 italic">No permissions assigned</p>}
                  </div>

                  {/* Expand chevron */}
                  <div className={`shrink-0 mt-0.5 transition-colors ${isExpanded ? 'text-primary' : 'text-slate-300'}`}>
                    {isExpanded ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                  </div>
                </div>

                {/* Inline editor — expands below the row */}
                <AnimatePresence initial={false}>
                  {isExpanded && <InlineEditor member={member} callerIsOwner={isOwner} onClose={() => setExpandedId(null)} onSuccess={handleUpdated} />}
                </AnimatePresence>
              </div>;
      })}

          {filtered.length === 0 && <div className="text-center py-8 text-slate-400 text-sm">No members found.</div>}
        </div>}
    </div>;
}
