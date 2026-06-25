import { useState } from 'react';
import { motion } from 'motion/react';
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
} from 'lucide-react';
import PortalSidebar from '@/components/PortalSidebar';

type Role = 'admin' | 'supervisor' | 'operator' | 'viewer';
type Status = 'active' | 'invited' | 'inactive';

interface TeamMember {
  id: string;
  name: string;
  email: string;
  phone: string;
  role: Role;
  status: Status;
  company: string;
  lastSeen: string;
  initials: string;
  color: string;
}

const team: TeamMember[] = [
  {
    id: 'USR-001',
    name: 'Darren Walsh',
    email: 'darren@iwillbuild.com.au',
    phone: '0412 345 678',
    role: 'admin',
    status: 'active',
    company: 'IWILLBUILD Pty Ltd',
    lastSeen: 'Just now',
    initials: 'DW',
    color: '#1263d8',
  },
  {
    id: 'USR-002',
    name: 'Mick Thornton',
    email: 'mick.t@iwillbuild.com.au',
    phone: '0423 456 789',
    role: 'supervisor',
    status: 'active',
    company: 'IWILLBUILD Pty Ltd',
    lastSeen: '2 hours ago',
    initials: 'MT',
    color: '#0f8b8d',
  },
  {
    id: 'USR-003',
    name: 'Sarah Nguyen',
    email: 'sarah.n@iwillbuild.com.au',
    phone: '0434 567 890',
    role: 'supervisor',
    status: 'active',
    company: 'IWILLBUILD Pty Ltd',
    lastSeen: 'Yesterday',
    initials: 'SN',
    color: '#7c3aed',
  },
  {
    id: 'USR-004',
    name: 'Jake Parrish',
    email: 'jake.p@iwillbuild.com.au',
    phone: '0445 678 901',
    role: 'operator',
    status: 'active',
    company: 'IWILLBUILD Pty Ltd',
    lastSeen: 'Today 7:30am',
    initials: 'JP',
    color: '#d97706',
  },
  {
    id: 'USR-005',
    name: 'Bree Callahan',
    email: 'bree.c@iwillbuild.com.au',
    phone: '0456 789 012',
    role: 'operator',
    status: 'active',
    company: 'IWILLBUILD Pty Ltd',
    lastSeen: 'Today 8:15am',
    initials: 'BC',
    color: '#059669',
  },
  {
    id: 'USR-006',
    name: 'Tom Reeves',
    email: 'tom.r@contractor.com.au',
    phone: '0467 890 123',
    role: 'viewer',
    status: 'invited',
    company: 'Reeves Electrical',
    lastSeen: 'Never',
    initials: 'TR',
    color: '#64748b',
  },
  {
    id: 'USR-007',
    name: 'Lisa Park',
    email: 'lisa.p@iwillbuild.com.au',
    phone: '0478 901 234',
    role: 'viewer',
    status: 'inactive',
    company: 'IWILLBUILD Pty Ltd',
    lastSeen: '3 weeks ago',
    initials: 'LP',
    color: '#94a3b8',
  },
];

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
  visible: { opacity: 1, y: 0, transition: { duration: 0.25, ease: 'easeOut' as const } },
} as const;

const stagger = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.05 } },
} as const;

export default function TeamPage() {
  const [search, setSearch] = useState('');

  const filtered = team.filter(
    (m) =>
      m.name.toLowerCase().includes(search.toLowerCase()) ||
      m.email.toLowerCase().includes(search.toLowerCase()) ||
      m.role.toLowerCase().includes(search.toLowerCase()) ||
      m.company.toLowerCase().includes(search.toLowerCase())
  );

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
            <span className="text-xs bg-slate-100 text-slate-500 font-semibold px-2 py-0.5 rounded-full">
              {team.length} members
            </span>
          </div>
          <button className="flex items-center gap-2 bg-primary hover:bg-orange-600 text-white text-sm font-bold px-4 py-2 rounded-lg transition-colors">
            <Plus size={15} />
            Invite Member
          </button>
        </header>

        <div className="flex-1 overflow-auto">
          <div className="p-6 flex flex-col gap-5">

            {/* Summary */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label: 'Active',   count: team.filter(m => m.status === 'active').length,   color: 'text-emerald-600', bg: 'bg-emerald-50' },
                { label: 'Invited',  count: team.filter(m => m.status === 'invited').length,  color: 'text-amber-600',   bg: 'bg-amber-50' },
                { label: 'Inactive', count: team.filter(m => m.status === 'inactive').length, color: 'text-slate-400',   bg: 'bg-slate-100' },
                { label: 'Admins',   count: team.filter(m => m.role === 'admin').length,      color: 'text-blue-600',    bg: 'bg-blue-50' },
              ].map((s) => (
                <div key={s.label} className={`${s.bg} rounded-xl p-4 border border-white`}>
                  <div className={`text-2xl font-black ${s.color}`}>{s.count}</div>
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

            {/* Member list */}
            <motion.div
              variants={stagger}
              initial="hidden"
              animate="visible"
              className="flex flex-col gap-3"
            >
              {filtered.map((member) => {
                const role = roleConfig[member.role];
                const status = statusConfig[member.status];
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
                      className="w-11 h-11 rounded-xl flex items-center justify-center text-white font-black text-sm shrink-0"
                      style={{ background: member.color }}
                    >
                      {member.initials}
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
                        <span className="flex items-center gap-1"><Phone size={10} />{member.phone}</span>
                        <span className="text-slate-300">{member.company}</span>
                      </div>
                    </div>

                    {/* Last seen */}
                    <div className="text-right shrink-0 hidden sm:block">
                      <div className="text-xs text-slate-400">Last seen</div>
                      <div className="text-xs font-semibold text-slate-600 mt-0.5">{member.lastSeen}</div>
                    </div>

                    {/* Actions */}
                    <button className="text-slate-300 hover:text-slate-600 transition-colors shrink-0">
                      <MoreHorizontal size={18} />
                    </button>
                  </motion.div>
                );
              })}

              {filtered.length === 0 && (
                <div className="text-center py-16 text-slate-400 text-sm">No members match your search.</div>
              )}
            </motion.div>

          </div>
        </div>
      </div>
    </div>
  );
}
