import { useState, useEffect, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Helmet } from '@dr.pogodin/react-helmet';
import {
  Building2, Users, UserCheck, UserX, Clock, Wifi, LogIn,
  RefreshCw, Shield, ChevronRight, Activity, Circle, Loader2,
  ShieldCheck, Settings, FileText, ClipboardList, LogOut,
  CheckCircle2, XCircle, ChevronDown, ExternalLink,
  ShieldAlert, Plus, X, BookOpen,
} from 'lucide-react';
import PortalSidebar from '@/components/PortalSidebar';
import { usePermissions } from '@/lib/usePermissions';
import { useSupportMode } from '@/lib/useSupportMode';
import OwnerUsageTab from '@/components/owner-console/OwnerUsageTab';
import SystemStorageTab from '@/components/owner-console/SystemStorageTab';
import CancellationFeedbackTab from '@/components/owner-console/CancellationFeedbackTab';
import ManualVerifyModal from '@/components/ManualVerifyModal';

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
  emailVerified?: boolean;
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

interface AuditEvent {
  id: number;
  ownerUserId: string;
  targetCompanyId: number;
  actionType: string;
  entityType: string | null;
  entityId: string | null;
  summary: string | null;
  createdAt: string;
  ownerName: string | null;
  ownerEmail: string | null;
}

interface ChecklistItem {
  id: string;
  label: string;
  description: string;
  completed: boolean;
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

function auditActionLabel(type: string): string {
  const map: Record<string, string> = {
    enter_support_mode: 'Entered support mode',
    exit_support_mode: 'Exited support mode',
    update_setup_checklist: 'Updated checklist',
  };
  return map[type] ?? type.replace(/_/g, ' ');
}

// ── Stat Card ─────────────────────────────────────────────────────────────────

function StatCard({ label, value, icon: Icon, color, sub }: {
  label: string; value: number | string; icon: React.ElementType; color: string; sub?: string;
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

// ── Company Actions Dropdown ──────────────────────────────────────────────────

function CompanyActionsMenu({ company, onEnterSupport, onViewUsers, onViewActivity }: {
  company: Company;
  onEnterSupport: (c: Company) => void;
  onViewUsers: (c: Company) => void;
  onViewActivity: (c: Company) => void;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 px-3 py-1.5 text-xs font-bold text-slate-600 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors"
      >
        Actions <ChevronDown size={11} />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1 w-52 bg-white rounded-xl border border-slate-200 shadow-xl z-20 overflow-hidden">
            <button
              onClick={() => { setOpen(false); onEnterSupport(company); }}
              className="w-full flex items-center gap-2.5 px-4 py-3 text-sm font-semibold text-amber-700 hover:bg-amber-50 transition-colors"
            >
              <ShieldAlert size={14} />
              Support Setup
            </button>
            <button
              onClick={() => { setOpen(false); onViewUsers(company); }}
              className="w-full flex items-center gap-2.5 px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
            >
              <Users size={14} />
              View Users
            </button>
            <button
              onClick={() => { setOpen(false); onViewActivity(company); }}
              className="w-full flex items-center gap-2.5 px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
            >
              <Activity size={14} />
              View Activity
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// ── Support Setup Panel ───────────────────────────────────────────────────────

function SupportSetupPanel({ company, onExit }: { company: Company; onExit: () => void }) {
  const navigate = useNavigate();
  const [checklist, setChecklist] = useState<ChecklistItem[]>([]);
  const [percent, setPercent] = useState(0);
  const [done, setDone] = useState(0);
  const [total, setTotal] = useState(0);
  const [auditEvents, setAuditEvents] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState<string | null>(null);
  const [showAudit, setShowAudit] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [cl, au] = await Promise.all([
      fetch(`/api/support-mode/checklist?companyId=${company.id}`, { credentials: 'include' }).then((r) => r.json()),
      fetch(`/api/support-mode/audit?companyId=${company.id}&limit=50`, { credentials: 'include' }).then((r) => r.json()),
    ]);
    setChecklist(cl.checklist ?? []);
    setPercent(cl.percent ?? 0);
    setDone(cl.done ?? 0);
    setTotal(cl.total ?? 0);
    setAuditEvents(au.events ?? []);
    setLoading(false);
  }, [company.id]);

  useEffect(() => { void load(); }, [load]);

  const toggleItem = async (itemId: string, completed: boolean) => {
    setToggling(itemId);
    await fetch('/api/support-mode/checklist', {
      method: 'PUT',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ companyId: company.id, itemId, completed }),
    });
    await load();
    setToggling(null);
  };

  const quickActions = [
    { label: 'Edit Company Profile', icon: Settings, href: '/settings?tab=company' },
    { label: 'Manage Users', icon: Users, href: '/settings?tab=team' },
    { label: 'Configure Permissions', icon: ShieldCheck, href: '/settings?tab=team' },
    { label: 'Cost Guide', icon: FileText, href: '/estimating?tab=cost-guide' },
    { label: 'Form Templates', icon: ClipboardList, href: '/forms' },
    { label: 'PDF / Print Style', icon: FileText, href: '/settings?tab=pdf' },
    { label: 'Dazza AI Knowledge', icon: Activity, href: '/settings?tab=dazza' },
    { label: 'Fleet Assets', icon: Building2, href: '/fleet' },
    { label: 'Files', icon: FileText, href: '/files' },
  ];

  return (
    <div className="flex flex-col gap-6 max-w-4xl">
      {/* Header */}
      <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 flex items-start gap-4">
        <div className="w-10 h-10 rounded-xl bg-amber-500 flex items-center justify-center shrink-0">
          <ShieldAlert size={18} className="text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-black text-amber-900 text-lg leading-tight">{company.name}</p>
          <p className="text-sm text-amber-700 mt-0.5">Support Setup Mode — all actions are audited</p>
        </div>
        <button
          onClick={onExit}
          className="flex items-center gap-2 px-4 py-2 bg-white border border-amber-300 text-amber-700 font-bold text-sm rounded-xl hover:bg-amber-50 transition-colors shrink-0"
        >
          <LogOut size={13} />
          Exit Support Mode
        </button>
      </div>

      {/* Setup Checklist */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-bold text-slate-800">Setup Checklist</h2>
            <span className="text-sm font-black text-slate-700">{done}/{total} · {percent}%</span>
          </div>
          {/* Progress bar */}
          <div className="w-full h-2.5 bg-slate-100 rounded-full overflow-hidden">
            <div
              className="h-full bg-primary rounded-full transition-all duration-500"
              style={{ width: `${percent}%` }}
            />
          </div>
        </div>
        {loading ? (
          <div className="flex items-center justify-center py-10">
            <Loader2 size={20} className="animate-spin text-primary" />
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {checklist.map((item) => (
              <div key={item.id} className={`px-5 py-3.5 flex items-center gap-4 transition-colors ${item.completed ? 'bg-green-50/40' : ''}`}>
                <button
                  onClick={() => void toggleItem(item.id, !item.completed)}
                  disabled={toggling === item.id}
                  className="shrink-0 transition-transform hover:scale-110 disabled:opacity-50"
                >
                  {toggling === item.id ? (
                    <Loader2 size={20} className="animate-spin text-slate-400" />
                  ) : item.completed ? (
                    <CheckCircle2 size={20} className="text-green-500" />
                  ) : (
                    <XCircle size={20} className="text-slate-300 hover:text-slate-400" />
                  )}
                </button>
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-semibold ${item.completed ? 'text-slate-500 line-through' : 'text-slate-800'}`}>
                    {item.label}
                  </p>
                  <p className="text-xs text-slate-400 mt-0.5">{item.description}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Quick Actions */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100">
          <h2 className="font-bold text-slate-800">Quick Actions</h2>
          <p className="text-xs text-slate-400 mt-0.5">Navigate to setup areas for this company</p>
        </div>
        <div className="p-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {quickActions.map((action) => {
            const Icon = action.icon;
            return (
              <button
                key={action.label}
                onClick={() => navigate(action.href)}
                className="flex items-center gap-3 px-4 py-3 rounded-xl border border-slate-200 bg-slate-50 hover:bg-primary/5 hover:border-primary/30 transition-colors text-left group"
              >
                <div className="w-8 h-8 rounded-lg bg-white border border-slate-200 flex items-center justify-center shrink-0 group-hover:border-primary/30 transition-colors">
                  <Icon size={14} className="text-slate-500 group-hover:text-primary transition-colors" />
                </div>
                <span className="text-sm font-semibold text-slate-700 group-hover:text-slate-900 truncate">{action.label}</span>
                <ExternalLink size={11} className="text-slate-300 group-hover:text-primary ml-auto shrink-0 transition-colors" />
              </button>
            );
          })}
        </div>
      </div>

      {/* Audit Log */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <button
          onClick={() => setShowAudit((v) => !v)}
          className="w-full px-5 py-4 border-b border-slate-100 flex items-center justify-between hover:bg-slate-50 transition-colors"
        >
          <h2 className="font-bold text-slate-800">Support Audit Log</h2>
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-400">{auditEvents.length} events</span>
            <ChevronDown size={14} className={`text-slate-400 transition-transform ${showAudit ? 'rotate-180' : ''}`} />
          </div>
        </button>
        {showAudit && (
          auditEvents.length === 0 ? (
            <p className="text-sm text-slate-400 text-center py-8">No audit events yet for this company</p>
          ) : (
            <div className="divide-y divide-slate-100">
              {auditEvents.map((e) => (
                <div key={e.id} className="px-5 py-3 flex items-start gap-3">
                  <div className="w-1.5 h-1.5 rounded-full bg-amber-400 mt-2 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-slate-700">
                      <span className="font-semibold">{e.ownerName ?? e.ownerEmail ?? e.ownerUserId}</span>
                      {' — '}
                      <span className="text-slate-500">{auditActionLabel(e.actionType)}</span>
                    </p>
                    {e.summary && <p className="text-xs text-slate-400 mt-0.5 truncate">{e.summary}</p>}
                  </div>
                  <span className="text-[11px] text-slate-400 shrink-0">{timeAgo(e.createdAt)}</span>
                </div>
              ))}
            </div>
          )
        )}
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function OwnerConsolePage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { isOwner, loading: permsLoading } = usePermissions();
  const supportMode = useSupportMode();

  const [migrated, setMigrated] = useState(false);
  const [stats, setStats] = useState<Stats | null>(null);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [users, setUsers] = useState<OcUser[]>([]);
  const [activity, setActivity] = useState<ActivityEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState<'overview' | 'companies' | 'users' | 'activity' | 'support-setup' | 'usage' | 'storage' | 'cancellation-feedback'>(
    (searchParams.get('tab') as 'support-setup' | null) === 'support-setup' ? 'support-setup' : 'overview'
  );
  const [userSearch, setUserSearch] = useState('');
  const [supportCompany, setSupportCompany] = useState<Company | null>(null);
  const [enteringSupport, setEnteringSupport] = useState<number | null>(null);
  const [filterCompanyId, setFilterCompanyId] = useState<number | null>(null);

  // Create company modal state
  const [showCreateCompany, setShowCreateCompany] = useState(false);
  const [createForm, setCreateForm] = useState({ name: '', plan: 'team', abn: '', phone: '', email: '' });
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');

  // Manual verify modal state
  const [verifyTarget, setVerifyTarget] = useState<{ id: string; name: string; email: string } | null>(null);

  // Run migrations once on mount
  useEffect(() => {
    Promise.all([
      fetch('/api/migrate-owner-console', { method: 'POST', credentials: 'include' }),
      fetch('/api/migrate-support-mode', { method: 'POST', credentials: 'include' }),
      fetch('/api/migrate-account-recovery', { method: 'POST', credentials: 'include' }),
    ]).finally(() => setMigrated(true));
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
      setStats(s as Stats);
      setCompanies((c as { companies: Company[] }).companies ?? []);
      setUsers((u as { users: OcUser[] }).users ?? []);
      setActivity((a as { events: ActivityEvent[] }).events ?? []);
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

  // Sync tab from URL
  useEffect(() => {
    const t = searchParams.get('tab');
    if (t === 'support-setup') setTab('support-setup');
  }, [searchParams]);

  // If already in support mode, pre-populate supportCompany
  useEffect(() => {
    if (supportMode.active && supportMode.companyId && companies.length > 0) {
      const c = companies.find((co) => co.id === supportMode.companyId);
      if (c) setSupportCompany(c);
    }
  }, [supportMode.active, supportMode.companyId, companies]);

  const handleEnterSupport = async (company: Company) => {
    setEnteringSupport(company.id);
    const result = await supportMode.enter(company.id);
    setEnteringSupport(null);
    if (result.ok) {
      setSupportCompany(company);
      setTab('support-setup');
      setSearchParams({ tab: 'support-setup' });
    }
  };

  const handleExitSupport = async () => {
    await supportMode.exit();
    setSupportCompany(null);
    setTab('companies');
    setSearchParams({});
  };

  const handleViewUsers = (company: Company) => {
    setFilterCompanyId(company.id);
    setTab('users');
  };

  const handleViewActivity = (company: Company) => {
    setFilterCompanyId(company.id);
    setTab('activity');
  };

  const handleCreateCompany = async () => {
    if (!createForm.name.trim()) { setCreateError('Company name is required.'); return; }
    setCreating(true);
    setCreateError('');
    try {
      const res = await fetch('/api/owner-console/companies', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(createForm),
      });
      const data = await res.json() as { ok?: boolean; error?: string };
      if (!res.ok) { setCreateError(data.error ?? 'Failed to create company.'); setCreating(false); return; }
      setShowCreateCompany(false);
      setCreateForm({ name: '', plan: 'team', abn: '', phone: '', email: '' });
      void loadData(true);
    } catch {
      setCreateError('Something went wrong.');
    }
    setCreating(false);
  };

  // Access guard
  if (!permsLoading && !isOwner) {
    return (
      <div className="flex h-full bg-[#F4F5F7]">
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
    if (filterCompanyId && u.companyId !== filterCompanyId) return false;
    if (!userSearch) return true;
    const q = userSearch.toLowerCase();
    return (
      u.name.toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q) ||
      u.company.toLowerCase().includes(q) ||
      u.role.toLowerCase().includes(q)
    );
  });

  const filteredActivity = filterCompanyId
    ? activity.filter((a) => a.companyId === filterCompanyId)
    : activity;

  const filterCompanyName = filterCompanyId
    ? companies.find((c) => c.id === filterCompanyId)?.name
    : null;

  return (
    <div className="flex h-full bg-[#F4F5F7] overflow-hidden">
      <PortalSidebar />

      <div className="flex-1 flex flex-col overflow-hidden">
        <Helmet>
          <title>Owner Console — IWILLBUILD Portal</title>
          <meta name="description" content="Owner-only control room for managing companies, users, and activity." />
          <link rel="canonical" href="https://iwillbuild.com/owner-console" />
          <meta name="robots" content="noindex" />
          <meta property="og:title" content="Owner Console — IWILLBUILD Portal" />
          <meta property="og:description" content="Owner-only control room for managing companies, users, and activity." />
          <meta property="og:type" content="website" />
          <meta property="og:url" content="https://iwillbuild.com/owner-console" />
          <meta property="og:image" content="https://iwillbuild.com/og-image.png" />
          <meta name="twitter:card" content="summary_large_image" />
          <meta name="twitter:title" content="Owner Console — IWILLBUILD Portal" />
          <meta name="twitter:description" content="Owner-only control room for managing companies, users, and activity." />
          <meta name="twitter:image" content="https://iwillbuild.com/og-image.png" />
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
          {supportMode.active && (
            <div className="flex items-center gap-2 px-3 py-1.5 bg-amber-50 border border-amber-200 rounded-xl">
              <ShieldAlert size={13} className="text-amber-600" />
              <span className="text-xs font-bold text-amber-700 truncate max-w-[160px]">
                {supportMode.companyName}
              </span>
            </div>
          )}
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
        <div className="bg-white border-b border-slate-200 px-6 py-2 flex gap-1 shrink-0 flex-wrap">
          <Tab active={tab === 'overview'} onClick={() => { setTab('overview'); setSearchParams({}); }}>Overview</Tab>
          <Tab active={tab === 'companies'} onClick={() => { setTab('companies'); setFilterCompanyId(null); setSearchParams({}); }}>
            Companies {companies.length > 0 && <span className="ml-1 text-xs opacity-70">({companies.length})</span>}
          </Tab>
          <Tab active={tab === 'users'} onClick={() => { setTab('users'); setSearchParams({}); }}>
            Users {users.length > 0 && <span className="ml-1 text-xs opacity-70">({users.length})</span>}
          </Tab>
          <Tab active={tab === 'activity'} onClick={() => { setTab('activity'); setFilterCompanyId(null); setSearchParams({}); }}>Activity Log</Tab>
          <Tab active={tab === 'usage'} onClick={() => { setTab('usage'); setSearchParams({}); }}>Usage</Tab>
          <Tab active={tab === 'storage'} onClick={() => { setTab('storage'); setSearchParams({}); }}>System Storage</Tab>
          <Tab active={tab === 'cancellation-feedback'} onClick={() => { setTab('cancellation-feedback'); setSearchParams({}); }}>Cancellation Feedback</Tab>
          {(supportMode.active || tab === 'support-setup') && (
            <Tab active={tab === 'support-setup'} onClick={() => { setTab('support-setup'); setSearchParams({ tab: 'support-setup' }); }}>
              <span className="flex items-center gap-1.5">
                <ShieldAlert size={12} />
                Support Setup
                {supportMode.active && <span className="w-1.5 h-1.5 rounded-full bg-amber-400 inline-block" />}
              </span>
            </Tab>
          )}
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
                            <div className="text-right shrink-0 mr-3">
                              <p className="text-sm font-bold text-slate-700">{c.totalUsers}</p>
                              <p className="text-[11px] text-slate-400">users</p>
                            </div>
                            <button
                              onClick={() => void handleEnterSupport(c)}
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
                      <button onClick={() => setTab('activity')} className="text-xs text-primary font-semibold flex items-center gap-1 hover:underline">
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
              )}

              {/* ── Companies ── */}
              {tab === 'companies' && (
                <div className="max-w-5xl">
                  <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
                    <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between gap-4">
                      <div>
                        <h2 className="font-bold text-slate-800">All Companies</h2>
                        <p className="text-xs text-slate-400 mt-0.5">{companies.length} {companies.length === 1 ? 'company' : 'companies'}</p>
                      </div>
                      <button
                        onClick={() => setShowCreateCompany(true)}
                        className="flex items-center gap-2 px-3 py-2 bg-primary hover:bg-orange-600 text-white text-xs font-bold rounded-xl transition-colors"
                      >
                        <Plus size={13} /> Create Company
                      </button>
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
                              <th className="text-right px-5 py-3 text-[11px] font-bold text-slate-400 uppercase tracking-wider">Actions</th>
                            </tr>
                          </thead>
                          <tbody className="divide-y divide-slate-100">
                            {companies.map((c) => (
                              <tr key={c.id} className={`hover:bg-slate-50 transition-colors ${supportMode.active && supportMode.companyId === c.id ? 'bg-amber-50/50' : ''}`}>
                                <td className="px-5 py-3.5">
                                  <div className="flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-lg bg-blue-50 border border-blue-100 flex items-center justify-center shrink-0">
                                      <Building2 size={13} className="text-blue-500" />
                                    </div>
                                    <div>
                                      <span className="font-semibold text-slate-800">{c.name}</span>
                                      {supportMode.active && supportMode.companyId === c.id && (
                                        <span className="ml-2 text-[10px] font-bold bg-amber-100 text-amber-700 px-1.5 py-0.5 rounded">ACTIVE</span>
                                      )}
                                    </div>
                                  </div>
                                </td>
                                <td className="px-5 py-3.5 text-slate-600">{c.owner}</td>
                                <td className="px-4 py-3.5 text-center font-bold text-slate-700">{c.totalUsers}</td>
                                <td className="px-4 py-3.5 text-center font-bold text-green-600">{c.activeUsers}</td>
                                <td className="px-5 py-3.5 text-slate-500">{fmtDate(c.createdAt)}</td>
                                <td className="px-5 py-3.5 text-right">
                                  <CompanyActionsMenu
                                    company={c}
                                    onEnterSupport={handleEnterSupport}
                                    onViewUsers={handleViewUsers}
                                    onViewActivity={handleViewActivity}
                                  />
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
                    <div className="px-5 py-4 border-b border-slate-100 flex items-center gap-4 flex-wrap">
                      <div className="flex-1 min-w-0">
                        <h2 className="font-bold text-slate-800">All Users</h2>
                        <p className="text-xs text-slate-400 mt-0.5">
                          {filterCompanyName ? (
                            <span>Filtered: <span className="font-semibold text-slate-600">{filterCompanyName}</span> · <button onClick={() => setFilterCompanyId(null)} className="text-primary hover:underline">Clear</button></span>
                          ) : `${users.length} total`}
                        </p>
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
                                      <div className="flex items-center gap-1.5">
                                        <p className="font-semibold text-slate-800 truncate">{u.name}</p>
                                        {u.emailVerified === false ? (
                                          <span className="shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded border bg-amber-50 text-amber-700 border-amber-200">
                                            Unverified
                                          </span>
                                        ) : (
                                          <span className="shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded border bg-emerald-50 text-emerald-700 border-emerald-200">
                                            Verified{(u as unknown as { verificationMethod?: string }).verificationMethod && (u as unknown as { verificationMethod?: string }).verificationMethod !== 'email' ? ` (${(u as unknown as { verificationMethod?: string }).verificationMethod?.replace('_', ' ')})` : ''}
                                          </span>
                                        )}
                                      </div>
                                      <p className="text-[11px] text-slate-400 truncate">{u.email}</p>
                                      {u.emailVerified === false && isOwner && (
                                        <button
                                          onClick={() => setVerifyTarget({ id: u.id, name: u.name, email: u.email })}
                                          className="mt-1 text-[10px] font-bold text-primary hover:text-orange-600 underline underline-offset-2 transition-colors"
                                        >
                                          Verify manually
                                        </button>
                                      )}
                                    </div>
                                  </div>
                                </td>
                                <td className="px-5 py-3.5 text-slate-600 truncate max-w-[140px]">{u.company}</td>
                                <td className="px-4 py-3.5">
                                  <span className={`text-[11px] font-bold px-2 py-0.5 rounded-lg border capitalize ${roleBadge(u.role)}`}>{u.role}</span>
                                </td>
                                <td className="px-4 py-3.5">
                                  <span className={`text-[11px] font-bold px-2 py-0.5 rounded-lg border capitalize ${statusBadge(u.status)}`}>{u.status}</span>
                                </td>
                                <td className="px-5 py-3.5 text-slate-500 text-xs">{timeAgo(u.lastLoginAt)}</td>
                                <td className="px-5 py-3.5 text-slate-500 text-xs">{timeAgo(u.lastActiveAt)}</td>
                                <td className="px-4 py-3.5 text-center">
                                  <Circle size={10} className={u.onlineNow ? 'text-emerald-500 fill-emerald-500' : 'text-slate-300 fill-slate-300'} />
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
                    <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
                      <div>
                        <h2 className="font-bold text-slate-800">Activity Log</h2>
                        <p className="text-xs text-slate-400 mt-0.5">
                          {filterCompanyName ? (
                            <span>Filtered: <span className="font-semibold text-slate-600">{filterCompanyName}</span> · <button onClick={() => setFilterCompanyId(null)} className="text-primary hover:underline">Clear</button></span>
                          ) : `${filteredActivity.length} recent events`}
                        </p>
                      </div>
                    </div>
                    {filteredActivity.length === 0 ? (
                      <div className="text-center py-16">
                        <Activity size={28} className="text-slate-200 mx-auto mb-3" />
                        <p className="text-sm font-semibold text-slate-400">No activity recorded yet</p>
                        <p className="text-xs text-slate-300 mt-1">Events appear after the next user login</p>
                      </div>
                    ) : (
                      <div className="divide-y divide-slate-100">
                        {filteredActivity.map((e) => (
                          <div key={e.id} className="px-5 py-3.5 flex items-center gap-4">
                            <div className={`w-2 h-2 rounded-full shrink-0 ${e.eventType === 'login' ? 'bg-emerald-500' : e.eventType === 'logout' ? 'bg-slate-400' : 'bg-blue-400'}`} />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm text-slate-700">
                                <span className="font-semibold">{e.userName ?? e.userEmail ?? e.userId}</span>
                                {e.userEmail && e.userName && <span className="text-slate-400 ml-1 text-xs">({e.userEmail})</span>}
                              </p>
                            </div>
                            <span className={`text-[11px] font-bold px-2.5 py-1 rounded-lg ${eventBadge(e.eventType)}`}>{e.eventType}</span>
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

              {/* ── Support Setup ── */}
              {tab === 'support-setup' && (
                supportCompany ? (
                  <SupportSetupPanel company={supportCompany} onExit={handleExitSupport} />
                ) : (
                  <div className="max-w-lg">
                    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-8 text-center">
                      <div className="w-14 h-14 rounded-2xl bg-amber-50 border border-amber-200 flex items-center justify-center mx-auto mb-4">
                        <ShieldAlert size={24} className="text-amber-500" />
                      </div>
                      <h2 className="font-black text-slate-900 text-lg mb-2">No Company Selected</h2>
                      <p className="text-sm text-slate-500 mb-6">Select a company from the Companies tab to enter Support Setup mode.</p>
                      <button
                        onClick={() => setTab('companies')}
                        className="px-5 py-2.5 bg-primary text-white rounded-xl text-sm font-bold hover:bg-orange-600 transition-colors"
                      >
                        Go to Companies
                      </button>
                    </div>
                  </div>
                )
              )}

              {/* ── Usage ── */}
              {tab === 'usage' && <OwnerUsageTab />}

              {/* ── System Storage ── */}
              {tab === 'storage' && <SystemStorageTab />}
              {tab === 'cancellation-feedback' && <CancellationFeedbackTab />}
            </>
          )}
        </div>
      </div>

      {/* ── Create Company Modal ─────────────────────────────────────────────── */}
      {showCreateCompany && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-md border border-slate-200">
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100">
              <h2 className="font-heading font-black text-base text-slate-900">Create New Company</h2>
              <button onClick={() => { setShowCreateCompany(false); setCreateError(''); }} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 transition-colors">
                <X size={16} />
              </button>
            </div>
            <div className="px-6 py-5 flex flex-col gap-4">
              {createError && (
                <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-3 py-2.5 text-sm text-red-700">
                  <XCircle size={13} className="shrink-0" /> {createError}
                </div>
              )}
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Company Name *</label>
                <input
                  type="text"
                  value={createForm.name}
                  onChange={(e) => setCreateForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="Walsh Constructions Pty Ltd"
                  autoFocus
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/60 transition-colors"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Plan</label>
                <select
                  value={createForm.plan}
                  onChange={(e) => setCreateForm((f) => ({ ...f, plan: e.target.value }))}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/60 transition-colors"
                >
                  <option value="trial">Trial (30 days)</option>
                  <option value="solo">Solo — 1 user ($19/mo +GST)</option>
                  <option value="team">Team — 5 users ($79/mo +GST)</option>
                  <option value="business">Business — 10 users ($149/mo +GST)</option>
                  <option value="pro">Pro (legacy) — 10 users ($149/mo +GST)</option>
                  <option value="enterprise">Enterprise — Unlimited</option>
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">ABN</label>
                  <input
                    type="text"
                    value={createForm.abn}
                    onChange={(e) => setCreateForm((f) => ({ ...f, abn: e.target.value }))}
                    placeholder="12 345 678 901"
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/60 transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Phone</label>
                  <input
                    type="text"
                    value={createForm.phone}
                    onChange={(e) => setCreateForm((f) => ({ ...f, phone: e.target.value }))}
                    placeholder="0400 000 000"
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/60 transition-colors"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-500 uppercase tracking-wider mb-1.5">Admin Email (optional)</label>
                <input
                  type="email"
                  value={createForm.email}
                  onChange={(e) => setCreateForm((f) => ({ ...f, email: e.target.value }))}
                  placeholder="admin@company.com.au"
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-900 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/60 transition-colors"
                />
              </div>
            </div>
            <div className="flex gap-3 px-6 pb-5">
              <button
                onClick={() => { setShowCreateCompany(false); setCreateError(''); }}
                className="flex-1 py-2.5 rounded-xl border border-slate-200 text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => void handleCreateCompany()}
                disabled={creating}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-primary hover:bg-orange-600 text-white text-sm font-bold disabled:opacity-60 transition-colors"
              >
                {creating ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                Create Company
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Manual verify modal — owner only */}
      <ManualVerifyModal
        user={verifyTarget}
        onClose={() => setVerifyTarget(null)}
        onVerified={(userId) => {
          // Update local state so the Unverified badge disappears immediately
          setUsers(prev => prev.map(u =>
            u.id === userId
              ? { ...u, emailVerified: true, verificationMethod: 'manual_owner' } as typeof u
              : u
          ));
        }}
      />
    </div>
  );
}
