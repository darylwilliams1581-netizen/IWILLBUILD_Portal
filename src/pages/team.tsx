import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Helmet } from '@dr.pogodin/react-helmet';
import { Users, Plus, Search, Crown, Shield, HardHat, Truck, Eye, UserCheck, Mail, Phone, MoreHorizontal, CheckCircle2, Clock, XCircle, X, ChevronDown, Loader2, AlertCircle, Trash2, Edit2, Lock, ShieldCheck, RefreshCw, ShieldAlert } from 'lucide-react';
import { ArrowLeft } from 'lucide-react';
import { useNavigate } from "react-router";
import { usePermissions } from '@/lib/usePermissions';
import { goBack } from '@/lib/navigation';
import { useViewOnly } from '@/components/ViewOnlyGuard';
import HomeIconPermissions from '@/components/team/HomeIconPermissions';
import DesktopTopBar from '@/components/DesktopTopBar';
import DesktopDock from '@/components/DesktopDock';
import PortalSidebar from '@/components/PortalSidebar';

// ── Role definitions ──────────────────────────────────────────────────────────
type Role = 'owner' | 'admin' | 'manager' | 'supervisor' | 'worker' | 'readonly';
type Status = 'active' | 'invited' | 'inactive';
interface RoleConfig {
  label: string;
  color: string;
  bg: string;
  border: string;
  avatarBg: string;
  icon: React.ElementType;
  description: string;
}
const ROLE_CONFIG: Record<Role, RoleConfig> = {
  owner: {
    label: 'Owner',
    color: 'text-amber-700',
    bg: 'bg-amber-50',
    border: 'border-amber-300',
    avatarBg: 'from-amber-500 to-violet-700',
    icon: Crown,
    description: 'Full control. Cannot be removed or demoted by Admins.'
  },
  admin: {
    label: 'Admin',
    color: 'text-blue-700',
    bg: 'bg-blue-50',
    border: 'border-blue-200',
    avatarBg: 'from-blue-500 to-blue-700',
    icon: Shield,
    description: 'Manage team, settings and all features.'
  },
  manager: {
    label: 'Manager',
    color: 'text-violet-700',
    bg: 'bg-violet-50',
    border: 'border-violet-200',
    avatarBg: 'from-violet-500 to-violet-700',
    icon: UserCheck,
    description: 'Manage jobs, fleet and team operations.'
  },
  supervisor: {
    label: 'Supervisor',
    color: 'text-indigo-700',
    bg: 'bg-indigo-50',
    border: 'border-indigo-200',
    avatarBg: 'from-indigo-500 to-indigo-700',
    icon: HardHat,
    description: 'Oversee jobs and field crews.'
  },
  worker: {
    label: 'Worker',
    color: 'text-emerald-700',
    bg: 'bg-emerald-50',
    border: 'border-emerald-200',
    avatarBg: 'from-emerald-500 to-emerald-700',
    icon: Truck,
    description: 'Day-to-day tasks and field work.'
  },
  readonly: {
    label: 'Read Only',
    color: 'text-slate-600',
    bg: 'bg-slate-100',
    border: 'border-slate-200',
    avatarBg: 'from-slate-400 to-slate-600',
    icon: Eye,
    description: 'View-only access across the portal.'
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
  description: string;
}
const PERMISSIONS: PermDef[] = [{
  key: 'jobs',
  label: 'Jobs',
  description: 'View and manage jobs'
}, {
  key: 'fleet',
  label: 'Fleet',
  description: 'View and manage fleet assets'
}, {
  key: 'forms',
  label: 'Forms',
  description: 'Access form templates'
}, {
  key: 'files',
  label: 'Files',
  description: 'Access file storage'
}, {
  key: 'estimating',
  label: 'Estimating',
  description: 'View and create estimates'
}, {
  key: 'invoices',
  label: 'Invoices',
  description: 'View and create invoices'
}, {
  key: 'dazzaAi',
  label: 'System Tools',
  description: 'Access advanced system tools (owner-managed)'
}, {
  key: 'seeDollars',
  label: 'See Dollars',
  description: 'View financial figures'
}, {
  key: 'inviteUsers',
  label: 'Invite Users',
  description: 'Invite new team members'
}, {
  key: 'deleteRecords',
  label: 'Delete Records',
  description: 'Permanently delete records'
}, {
  key: 'admin',
  label: 'Admin Access',
  description: 'Full admin privileges'
}];
// NOTE: PERMISSIONS array kept for API save body compatibility — UI toggles removed in favour of HomeIconPermissions

interface TeamMember {
  id: number;
  userId: string;
  name: string;
  email: string;
  phone: string;
  role: string;
  status: string;
  emailVerified?: boolean;
  verificationMethod?: string | null;
  permissions: Record<string, boolean>;
  joinedAt: string | null;
}
const fadeUp = {
  hidden: {
    opacity: 0,
    y: 10
  },
  visible: {
    opacity: 1,
    y: 0,
    transition: {
      duration: 0.22,
      ease: 'easeOut' as const
    }
  }
} as const;
const stagger = {
  hidden: {},
  visible: {
    transition: {
      staggerChildren: 0.04
    }
  }
} as const;

// ── Avatar ────────────────────────────────────────────────────────────────────
function Avatar({
  name,
  role
}: {
  name: string;
  role: string;
}) {
  const cfg = ROLE_CONFIG[role as Role] ?? ROLE_CONFIG.worker;
  const initials = name.split(' ').map(n => n[0]).join('').slice(0, 2).toUpperCase();
  return <div className={`w-11 h-11 rounded-xl flex items-center justify-center text-white font-black text-sm shrink-0 bg-gradient-to-br ${cfg.avatarBg}`}>
      {initials}
    </div>;
}

// ── Role badge ────────────────────────────────────────────────────────────────
function RoleBadge({
  role
}: {
  role: string;
}) {
  const cfg = ROLE_CONFIG[role as Role] ?? ROLE_CONFIG.worker;
  const Icon = cfg.icon;
  return <span className={`inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full border ${cfg.bg} ${cfg.border} ${cfg.color}`}>
      <Icon size={10} />
      {cfg.label}
    </span>;
}

// ── Invite Modal ──────────────────────────────────────────────────────────────
function InviteModal({
  callerIsOwner,
  onClose,
  onSuccess
}: {
  callerIsOwner: boolean;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('worker');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim() || !email.trim()) {
      setError('Name and email are required.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const res = await fetch('/api/team/invite', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim().toLowerCase(),
          role
        })
      });
      const data = (await res.json()) as {
        ok?: boolean;
        message?: string;
        error?: string;
      };
      if (!res.ok) {
        setError(data.error ?? 'Invite failed');
        setLoading(false);
        return;
      }
      setSuccess(data.message ?? 'Invite sent!');
      setTimeout(() => {
        onSuccess();
        onClose();
      }, 1800);
    } catch {
      setError('Network error. Please try again.');
      setLoading(false);
    }
  }

  // Roles available to invite (owner cannot be invited — must be promoted)
  const inviteRoles: Array<{
    value: Role;
    label: string;
    desc: string;
  }> = [...(callerIsOwner ? [{
    value: 'admin' as Role,
    label: 'Admin',
    desc: 'Manage team, settings and all features'
  }] : []), {
    value: 'manager',
    label: 'Manager',
    desc: 'Manage jobs, fleet and team operations'
  }, {
    value: 'supervisor',
    label: 'Supervisor',
    desc: 'Oversee jobs and field crews'
  }, {
    value: 'worker',
    label: 'Worker',
    desc: 'Day-to-day tasks and field work'
  }, {
    value: 'readonly',
    label: 'Read Only',
    desc: 'View-only access'
  }];
  return <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <motion.div initial={{
      opacity: 0,
      scale: 0.96,
      y: 8
    }} animate={{
      opacity: 1,
      scale: 1,
      y: 0
    }} exit={{
      opacity: 0,
      scale: 0.96,
      y: 8
    }} transition={{
      duration: 0.18,
      ease: 'easeOut'
    }} className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md p-6 z-10">
        <div className="flex items-center justify-between mb-5">
          <h2 className="font-heading font-bold text-lg text-slate-900">Invite Team Member</h2>
          <button onClick={onClose} className="text-slate-600 hover:text-slate-800 transition-colors"><X size={18} /></button>
        </div>

        {success ? <div className="flex flex-col items-center gap-3 py-6 text-center">
            <CheckCircle2 size={36} className="text-emerald-500" />
            <p className="text-sm font-semibold text-slate-700">{success}</p>
          </div> : <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Full Name</label>
              <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Jake Parrish" className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Email Address</label>
              <input type="email" value={email} onChange={e => setEmail(e.target.value)} placeholder="jake@example.com" className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors" />
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Role</label>
              <div className="relative">
                <select value={role} onChange={e => setRole(e.target.value as Role)} className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm appearance-none focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors">
                  {inviteRoles.map(r => <option key={r.value} value={r.value}>{r.label} — {r.desc}</option>)}
                </select>
                <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
              </div>
            </div>

            {error && <div className="flex items-center gap-2 text-red-600 text-xs bg-red-50 border border-red-200 rounded-lg px-3 py-2">
                <AlertCircle size={13} />{error}
              </div>}

            <p className="text-xs text-slate-400">
              They'll be able to sign up at <span className="font-semibold">/signup</span> using this email.
            </p>

            <div className="flex gap-3 pt-1">
              <button type="button" onClick={onClose} className="flex-1 border border-slate-200 text-slate-600 text-sm font-semibold py-2.5 rounded-lg hover:bg-slate-50 transition-colors">Cancel</button>
              <button type="submit" disabled={loading} className="flex-1 bg-primary hover:bg-violet-700 text-white text-sm font-bold py-2.5 rounded-lg transition-colors flex items-center justify-center gap-2 disabled:opacity-60">
                {loading ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                Send Invite
              </button>
            </div>
          </form>}
      </motion.div>
    </div>;
}

// ── Edit Member Modal ─────────────────────────────────────────────────────────
function EditMemberModal({
  member,
  callerIsOwner,
  callerIsAdmin,
  onClose,
  onSuccess
}: {
  member: TeamMember;
  callerIsOwner: boolean;
  callerIsAdmin: boolean;
  onClose: () => void;
  onSuccess: () => void;
}) {
  const targetIsOwner = member.role === 'owner';
  const targetIsAdmin = member.role === 'admin';
  const targetIsDeveloper = member.role === 'developer' || member.role === 'platform_owner';

  // Profile is protected — admin cannot modify owner or developer profiles
  const targetIsProtected = targetIsOwner || targetIsDeveloper;
  const viewerIsRestricted = !callerIsOwner && targetIsProtected;

  // Permissions/role/status are locked whenever the viewer is restricted (non-owner viewing owner/developer)
  const permsLocked = viewerIsRestricted;
  const roleLocked = viewerIsRestricted;
  const statusLocked = viewerIsRestricted;
  const [role, setRole] = useState<Role>(member.role as Role);
  const [status, setStatus] = useState<Status>(member.status as Status);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Available roles based on caller privilege
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
    setLoading(true);
    try {
      const body = {
        role,
        status
      };
      const res = await fetch(`/api/team/${member.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify(body)
      });
      const data = (await res.json()) as {
        error?: string;
      };
      if (!res.ok) {
        setError(data.error ?? 'Update failed');
        setLoading(false);
        return;
      }
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
        credentials: 'include'
      });
      const data = (await res.json()) as {
        error?: string;
      };
      if (!res.ok) {
        setError(data.error ?? 'Failed to remove member');
        setLoading(false);
        return;
      }
      onSuccess();
      onClose();
    } catch {
      setError('Network error.');
      setLoading(false);
    }
  }

  // Can the caller remove this member?
  // Owners and developers/platform_owners are protected — only the platform owner can remove them,
  // and even then only via account deletion tools (not the team modal).
  // Admins can remove regular members but NOT owners or developers.
  const canRemove = callerIsOwner && !targetIsOwner && !targetIsDeveloper || !targetIsOwner && !targetIsAdmin && !targetIsDeveloper && callerIsAdmin;
  return <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <motion.div initial={{
      opacity: 0,
      scale: 0.96,
      y: 8
    }} animate={{
      opacity: 1,
      scale: 1,
      y: 0
    }} exit={{
      opacity: 0,
      scale: 0.96,
      y: 8
    }} transition={{
      duration: 0.18,
      ease: 'easeOut'
    }} className="relative bg-white rounded-2xl shadow-2xl w-full max-w-lg p-6 z-10 max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between mb-5">
          <div className="flex items-center gap-3">
            <Avatar name={member.name} role={member.role} />
            <div>
              <h2 className="font-heading font-bold text-lg text-slate-900 leading-tight">{member.name}</h2>
              <p className="text-xs text-slate-400">{member.email}</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-600 hover:text-slate-800 transition-colors"><X size={18} /></button>
        </div>

        {/* Protected profile notice */}
        {viewerIsRestricted && <div className="flex items-center gap-2 bg-slate-100 border border-slate-300 rounded-xl px-4 py-3 mb-4 text-xs text-slate-600 font-semibold">
            <Lock size={13} className="shrink-0 text-slate-500" />
            {targetIsOwner ? 'Owner accounts can only be modified by another Owner.' : 'Developer accounts are protected and cannot be modified by Admins.'}
          </div>}

        <div className={['flex flex-col gap-5 transition-opacity', viewerIsRestricted ? 'opacity-40 pointer-events-none select-none' : ''].join(' ')}>
          {/* Role + Status */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Role</label>
              {roleLocked ? <div className="flex items-center gap-2 px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-500">
                  <Lock size={12} className="text-slate-400" />
                  <RoleBadge role={member.role} />
                </div> : <div className="relative">
                  <select value={role} onChange={e => setRole(e.target.value as Role)} className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm appearance-none focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors">
                    {availableRoles.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                  </select>
                  <ChevronDown size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                </div>}
            </div>
            <div>
              <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5">Status</label>
              {statusLocked ? <div className="flex items-center gap-2 px-3 py-2.5 bg-slate-50 border border-slate-200 rounded-lg text-sm text-slate-500">
                  <Lock size={12} className="text-slate-400" />
                  Active
                </div> : <div className="relative">
                  <select value={status} onChange={e => setStatus(e.target.value as Status)} className="w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm appearance-none focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors">
                    <option value="active">Active</option>
                    <option value="invited">Invited</option>
                    <option value="inactive">Inactive</option>
                  </select>
                  <ChevronDown size={13} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                </div>}
            </div>
          </div>

          {/* Home Screen Icon Permissions */}
          <div className="border-t border-slate-100 pt-4">
            <HomeIconPermissions memberId={member.userId} memberRole={member.role} canEdit={callerIsOwner || callerIsAdmin} />
          </div>

          {error && <div className="flex items-center gap-2 text-red-600 text-xs bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              <AlertCircle size={13} />{error}
            </div>}

          <div className="flex gap-3 pt-1">
            {canRemove && <button type="button" onClick={handleRemove} disabled={loading} className="flex items-center gap-1.5 border border-red-200 text-red-500 text-sm font-semibold px-3 py-2.5 rounded-lg hover:bg-red-50 transition-colors disabled:opacity-50">
                <Trash2 size={13} />Remove User
              </button>}
            <div className="flex-1" />
            <button type="button" onClick={onClose} className="border border-slate-200 text-slate-600 text-sm font-semibold px-4 py-2.5 rounded-lg hover:bg-slate-50 transition-colors">
              Cancel
            </button>
            {(!roleLocked || callerIsOwner) && <button type="button" onClick={handleSave} disabled={loading} className="bg-primary hover:bg-violet-700 text-white text-sm font-bold px-4 py-2.5 rounded-lg transition-colors flex items-center gap-2 disabled:opacity-60">
                {loading ? <Loader2 size={13} className="animate-spin" /> : null}
                Save Changes
              </button>}
          </div>
        </div>
      </motion.div>
    </div>;
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
  const [verifyingUserId, setVerifyingUserId] = useState<string | null>(null);
  const {
    isViewOnly
  } = useViewOnly();
  const [resendingUserId, setResendingUserId] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState('');
  const {
    isOwner,
    isAdmin
  } = usePermissions();
  const navigate = useNavigate();
  const canManageVerification = isOwner || isAdmin;
  const loadTeam = useCallback(async () => {
    try {
      const res = await fetch('/api/team', {
        credentials: 'include'
      });
      if (!res.ok) {
        const d = (await res.json()) as {
          error?: string;
        };
        setError(d.error ?? 'Failed to load team');
        setLoading(false);
        return;
      }
      const data = (await res.json()) as {
        members: TeamMember[];
      };
      setMembers(data.members);
    } catch {
      setError('Network error loading team');
    } finally {
      setLoading(false);
    }
  }, []);
  useEffect(() => {
    loadTeam();
  }, [loadTeam]);
  async function handleManualVerify(userId: string) {
    setVerifyingUserId(userId);
    setActionMsg('');
    try {
      const res = await fetch('/api/team/verify-user', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify({
          userId
        })
      });
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
      };
      if (res.ok && data.ok) {
        setActionMsg('User verified successfully.');
        loadTeam();
      } else {
        setActionMsg(data.error ?? 'Failed to verify user.');
      }
    } catch {
      setActionMsg('Network error. Please try again.');
    } finally {
      setVerifyingUserId(null);
      setOpenMenuId(null);
    }
  }
  async function handleResendVerification(userId: string) {
    setResendingUserId(userId);
    setActionMsg('');
    try {
      const res = await fetch('/api/team/resend-verification', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify({
          userId
        })
      });
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
      };
      if (res.ok && data.ok) {
        setActionMsg('Verification email resent.');
      } else {
        setActionMsg(data.error ?? 'Failed to resend.');
      }
    } catch {
      setActionMsg('Network error. Please try again.');
    } finally {
      setResendingUserId(null);
      setOpenMenuId(null);
    }
  }
  useEffect(() => {
    loadTeam();
  }, [loadTeam]);
  const filtered = members.filter(m => m.name.toLowerCase().includes(search.toLowerCase()) || m.email.toLowerCase().includes(search.toLowerCase()) || m.role.toLowerCase().includes(search.toLowerCase()));
  const stats = [{
    label: 'Owners',
    count: members.filter(m => m.role === 'owner').length,
    color: 'text-amber-700',
    bg: 'bg-amber-50',
    border: 'border-amber-200',
    icon: Crown
  }, {
    label: 'Admins',
    count: members.filter(m => m.role === 'admin').length,
    color: 'text-blue-700',
    bg: 'bg-blue-50',
    border: 'border-blue-200',
    icon: Shield
  }, {
    label: 'Active',
    count: members.filter(m => m.status === 'active').length,
    color: 'text-emerald-700',
    bg: 'bg-emerald-50',
    border: 'border-emerald-200',
    icon: CheckCircle2
  }, {
    label: 'Invited',
    count: members.filter(m => m.status === 'invited').length,
    color: 'text-violet-700',
    bg: 'bg-violet-50',
    border: 'border-violet-200',
    icon: Clock
  }];
  return <div className="flex-1 bg-slate-50 flex flex-col lg-portal">
      <PortalSidebar />
      <DesktopTopBar />
      <DesktopDock />
      <Helmet>
        <title>Team — IWIIlBUILD Portal</title>
        <meta name="description" content="Manage team members, roles and access for the IWIIlBUILD portal." />
        <link rel="canonical" href="https://iwillbuild.com/team" />
        <meta name="robots" content="noindex" />
        <meta property="og:title" content="Team — IWIIlBUILD Portal" />
        <meta property="og:description" content="Manage team members, roles and access for the IWIIlBUILD portal." />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://iwillbuild.com/team" />
        <meta property="og:image" content="https://iwillbuild.com/airo-assets/images/pages/home/og-image" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="Team — IWIIlBUILD Portal" />
        <meta name="twitter:description" content="Manage team members, roles and access for the IWIIlBUILD portal." />
        <meta name="twitter:image" content="https://iwillbuild.com/airo-assets/images/pages/home/og-image" />
      </Helmet>

      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar */}
        <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-4 md:px-6 shrink-0 sticky top-0 z-30 safe-top">
          <div className="flex items-center gap-3">
            <button onClick={() => goBack(navigate, '/home')} className="p-2 -ml-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors" aria-label="Back to Home">
              <ArrowLeft size={20} />
            </button>
            <Users size={18} className="text-primary shrink-0" />
            <h1 className="font-heading font-bold text-base md:text-lg">Team</h1>
            {!loading && <span className="text-xs bg-slate-100 text-slate-500 font-semibold px-2 py-0.5 rounded-full">
                {members.filter(m => m.status !== 'inactive').length} member{members.filter(m => m.status !== 'inactive').length !== 1 ? 's' : ''}
              </span>}
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => !isViewOnly && setShowInvite(true)} disabled={isViewOnly} title={isViewOnly ? 'Subscribe to continue' : undefined} className="flex items-center gap-2 bg-primary hover:bg-violet-700 text-white text-sm font-bold px-4 py-2 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
              <Plus size={15} />
              Invite Member
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-auto">
          <div className="p-6 flex flex-col gap-5">

            {/* Summary stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {stats.map(s => {
              const Icon = s.icon;
              return <div key={s.label} className={`${s.bg} border ${s.border} rounded-xl p-4`}>
                    <div className="flex items-center justify-between mb-1">
                      <div className={`text-2xl font-black ${s.color}`}>{loading ? '—' : s.count}</div>
                      <Icon size={16} className={`${s.color} opacity-60`} />
                    </div>
                    <div className="text-xs font-semibold text-slate-500">{s.label}</div>
                  </div>;
            })}
            </div>

            {/* Search */}
            <div className="relative">
              <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input type="text" placeholder="Search by name, email or role…" value={search} onChange={e => setSearch(e.target.value)} className="w-full pl-9 pr-4 py-2.5 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors" />
            </div>

            {/* Error */}
            {error && <div className="flex items-center gap-2 text-red-600 text-sm bg-red-50 border border-red-200 rounded-xl px-4 py-3">
                <AlertCircle size={15} />{error}
              </div>}

            {/* Action message */}
            {actionMsg && <div className="flex items-center gap-2 text-emerald-700 text-sm bg-emerald-50 border border-emerald-200 rounded-xl px-4 py-3">
                <CheckCircle2 size={15} />{actionMsg}
              </div>}

            {/* Loading */}
            {loading && <div className="flex items-center justify-center py-16 text-slate-400 gap-2">
                <Loader2 size={18} className="animate-spin" />
                <span className="text-sm">Loading team…</span>
              </div>}

            {/* Member list */}
            {!loading && !error && <motion.div variants={stagger} initial="hidden" animate="visible" className="flex flex-col gap-3">
                {filtered.map(member => {
              const statusCfg = STATUS_CONFIG[member.status as Status] ?? STATUS_CONFIG.active;
              const StatusIcon = statusCfg.icon;
              const memberIsOwner = member.role === 'owner';
              return <motion.div key={member.id} variants={fadeUp} className={`bg-white border rounded-xl p-4 flex items-center gap-4 hover:shadow-sm transition-all duration-150 ${memberIsOwner ? 'border-amber-200 hover:border-amber-300' : 'border-slate-200 hover:border-primary/30'}`}>
                      <Avatar name={member.name} role={member.role} />

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="font-bold text-slate-900">{member.name}</span>
                          <RoleBadge role={member.role} />
                          <span className={`inline-flex items-center gap-1 text-xs font-semibold ${statusCfg.color}`}>
                            <StatusIcon size={11} />
                            {statusCfg.label}
                          </span>
                          {/* Verification badge */}
                          {member.emailVerified ? <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-600 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded-full">
                              <ShieldCheck size={10} />
                              Verified
                              {member.verificationMethod && member.verificationMethod !== 'email' && <span className="text-emerald-400">({member.verificationMethod.replace('_', ' ')})</span>}
                            </span> : <span className="inline-flex items-center gap-1 text-xs font-semibold text-amber-600 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded-full">
                              <ShieldAlert size={10} />
                              Unverified
                            </span>}
                        </div>
                        <div className="flex items-center gap-4 mt-1 text-xs text-slate-400 flex-wrap">
                          <span className="flex items-center gap-1"><Mail size={10} />{member.email}</span>
                          {member.phone && <span className="flex items-center gap-1"><Phone size={10} />{member.phone}</span>}
                        </div>

                        {/* Permission chips */}
                        {(() => {
                    const isOwnerMember = member.role === 'owner' || member.role === 'admin';
                    const chips = PERMISSIONS.filter(p => isOwnerMember ? true : member.permissions?.[p.key]).map(p => p.label);
                    if (chips.length === 0) return null;
                    return <div className="flex flex-wrap gap-1 mt-2">
                              {chips.map(label => <span key={label} className="inline-flex items-center text-[10px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-500 border border-slate-200">
                                  {label}
                                </span>)}
                            </div>;
                  })()}
                      </div>

                      {/* Actions */}
                      <div className="relative shrink-0">
                        <button onClick={() => setOpenMenuId(openMenuId === member.id ? null : member.id)} className="text-slate-300 hover:text-slate-600 transition-colors p-1">
                          <MoreHorizontal size={18} />
                        </button>
                        <AnimatePresence>
                          {openMenuId === member.id && <motion.div initial={{
                      opacity: 0,
                      scale: 0.95,
                      y: -4
                    }} animate={{
                      opacity: 1,
                      scale: 1,
                      y: 0
                    }} exit={{
                      opacity: 0,
                      scale: 0.95,
                      y: -4
                    }} transition={{
                      duration: 0.12
                    }} className="absolute right-0 top-8 bg-white border border-slate-200 rounded-xl shadow-lg z-20 min-w-[180px] py-1 overflow-hidden">
                              <button onClick={() => {
                        setEditMember(member);
                        setOpenMenuId(null);
                      }} className="flex items-center gap-2 w-full px-4 py-2.5 text-sm text-slate-700 hover:bg-slate-50 transition-colors">
                                <Edit2 size={13} />
                                {memberIsOwner && !isOwner ? 'View Member' : 'Edit Member'}
                              </button>
                              {/* Verification actions — admin/owner only */}
                              {canManageVerification && !member.emailVerified && <>
                                  <div className="border-t border-slate-100 my-1" />
                                  <button onClick={() => handleManualVerify(member.userId)} disabled={verifyingUserId === member.userId} className="flex items-center gap-2 w-full px-4 py-2.5 text-sm text-emerald-700 hover:bg-emerald-50 transition-colors disabled:opacity-50">
                                    {verifyingUserId === member.userId ? <Loader2 size={13} className="animate-spin" /> : <ShieldCheck size={13} />}
                                    Mark as verified
                                  </button>
                                  <button onClick={() => handleResendVerification(member.userId)} disabled={resendingUserId === member.userId} className="flex items-center gap-2 w-full px-4 py-2.5 text-sm text-blue-700 hover:bg-blue-50 transition-colors disabled:opacity-50">
                                    {resendingUserId === member.userId ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
                                    Resend verification
                                  </button>
                                </>}
                            </motion.div>}
                        </AnimatePresence>
                      </div>
                    </motion.div>;
            })}

                {filtered.length === 0 && !loading && <div className="text-center py-16 text-slate-400 text-sm">
                    {search ? 'No members match your search.' : 'No team members yet. Invite someone to get started.'}
                  </div>}
              </motion.div>}

            {/* Role legend */}
            {!loading && !error && members.length > 0 && <div className="bg-white border border-slate-200 rounded-xl p-4">
                <h3 className="text-xs font-semibold text-slate-400 uppercase tracking-wider mb-3">Role Reference</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {(Object.entries(ROLE_CONFIG) as Array<[Role, RoleConfig]>).map(([key, cfg]) => {
                const Icon = cfg.icon;
                return <div key={key} className="flex items-start gap-2.5">
                        <span className={`inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full border shrink-0 mt-0.5 ${cfg.bg} ${cfg.border} ${cfg.color}`}>
                          <Icon size={9} />{cfg.label}
                        </span>
                        <span className="text-xs text-slate-400">{cfg.description}</span>
                      </div>;
              })}
                </div>
              </div>}
          </div>
        </div>
      </div>

      {/* Click-away for menu */}
      {openMenuId !== null && <div className="fixed inset-0 z-10" onClick={() => setOpenMenuId(null)} />}

      {/* Modals */}
      <AnimatePresence>
        {showInvite && <InviteModal callerIsOwner={isOwner} onClose={() => setShowInvite(false)} onSuccess={loadTeam} />}
        {editMember && <EditMemberModal member={editMember} callerIsOwner={isOwner} callerIsAdmin={isAdmin} onClose={() => setEditMember(null)} onSuccess={loadTeam} />}
      </AnimatePresence>
    </div>;
}
