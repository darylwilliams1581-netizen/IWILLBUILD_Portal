import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Helmet } from '@dr.pogodin/react-helmet';
import {
  RefreshCw, Shield, ChevronRight, Activity, Loader2,
  ShieldCheck, FileText, ClipboardList, CheckCircle2, XCircle, ChevronDown, ExternalLink,
  ShieldAlert, X, Bot,
  Mail, BarChart2, StickyNote, Receipt,
  Send, Ban, RotateCcw, Server, AlertCircle,
  Play, Info, Clock, Copy, Check, Plus, Database,
  Settings, Users, Building2, LogOut,
} from 'lucide-react';
import { usePermissions } from '@/lib/usePermissions';
import DesktopTopBar from '@/components/DesktopTopBar';
import DesktopDock from '@/components/DesktopDock';
import { useSupportMode } from '@/lib/useSupportMode';
import OverviewTab from '@/components/owner-console/OverviewTab';
import CompaniesTab from '@/components/owner-console/CompaniesTab';
import UsersTab from '@/components/owner-console/UsersTab';
import ActivityTab from '@/components/owner-console/ActivityTab';
import OwnerUsageTab from '@/components/owner-console/OwnerUsageTab';
import SystemStorageTab from '@/components/owner-console/SystemStorageTab';
import CancellationFeedbackTab from '@/components/owner-console/CancellationFeedbackTab';
import SystemAITab from '@/components/owner-console/SystemAITab';

import ManualVerifyModal from '@/components/ManualVerifyModal';
import UserActionModal from '@/components/owner-console/UserActionModal';
import DeveloperAuditLogTab from '@/components/owner-console/DeveloperAuditLogTab';
import ActivityLogTab from '@/components/owner-console/ActivityLogTab';
import EmailLogTab from '@/components/owner-console/EmailLogTab';
import PlatformEmailTab from '@/components/owner-console/PlatformEmailTab';
import CompanyHealthTab from '@/components/owner-console/CompanyHealthTab';
import SupportNotesTab from '@/components/owner-console/SupportNotesTab';
import AccountingSmokeTestTab from '@/components/owner-console/AccountingSmokeTestTab';

import SwmsMasterLibraryTab from '@/components/owner-console/SwmsMasterLibraryTab';
import OrphanActionModal from '@/components/owner-console/OrphanActionModal';
import type { UserAction, OcUserForActions } from '@/components/owner-console/UserActionsMenu';
import type { OrphanAction, OrphanUser } from '@/components/owner-console/OrphanActionsMenu';

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
  isOrphan?: boolean;
  orphanReason?: string | null;
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

function auditActionLabel(type: string): string {
  const map: Record<string, string> = {
    enter_support_mode: 'Entered support mode',
    exit_support_mode: 'Exited support mode',
    update_setup_checklist: 'Updated checklist',
  };
  return map[type] ?? type.replace(/_/g, ' ');
}

// ── Stat Card ─────────────────────────────────────────────────────────────────

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
    { label: 'Fleet Assets', icon: Building2, href: '/fleet' },
    { label: 'Files', icon: FileText, href: '/files' },
    { label: 'Support Inbox', icon: Mail, href: 'https://outlook.office.com/mail/?realm=iwillbuild.com&login_hint=support@iwillbuild.com', external: true },
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
                onClick={() => action.external ? window.open(action.href, '_blank', 'noopener,noreferrer') : navigate(action.href)}
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
  const { isPlatformOwner, loading: permsLoading } = usePermissions();
  const supportMode = useSupportMode();

  const [migrated, setMigrated] = useState(false);
  const [stats, setStats] = useState<Stats | null>(null);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [users, setUsers] = useState<OcUser[]>([]);
  const [activity, setActivity] = useState<ActivityEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [tab, setTab] = useState<'overview' | 'companies' | 'users' | 'activity' | 'support-setup' | 'usage' | 'storage' | 'cancellation-feedback' | 'system-ai' | 'audit-log' | 'activity-log' | 'email-log' | 'platform-email' | 'company-health' | 'support-notes' | 'accounting-smoke' | 'health-check' | 'swms-seed'>(
    (searchParams.get('tab') as 'support-setup' | 'health-check' | null) === 'support-setup' ? 'support-setup'
    : (searchParams.get('tab') as 'health-check' | null) === 'health-check' ? 'health-check'
    : 'overview'
  );
  const [userSearch, setUserSearch] = useState('');
  const [supportCompany, setSupportCompany] = useState<Company | null>(null);
  const [enteringSupport, setEnteringSupport] = useState<number | null>(null);
  const [filterCompanyId, setFilterCompanyId] = useState<number | null>(null);

  // User filter state
  const [filterStatus, setFilterStatus] = useState('');
  const [filterRole, setFilterRole] = useState('');
  const [filterVerified, setFilterVerified] = useState('');

  // User action modal state
  const [pendingAction, setPendingAction] = useState<{ action: UserAction; user: OcUserForActions } | null>(null);
  const [actionToast, setActionToast] = useState<string | null>(null);

  // Orphan action modal state
  const [pendingOrphanAction, setPendingOrphanAction] = useState<{ action: OrphanAction; user: OrphanUser } | null>(null);

  // Create company modal state
  const [showCreateCompany, setShowCreateCompany] = useState(false);
  const [createForm, setCreateForm] = useState({ name: '', plan: 'team', abn: '', phone: '', email: '' });
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');

  // Manual verify modal state
  const [verifyTarget, setVerifyTarget] = useState<{ id: string; name: string; email: string } | null>(null);

  // ── Safety migration state ────────────────────────────────────────────────────
  const [safetyMigStatus, setSafetyMigStatus] = useState<'idle' | 'running' | 'done' | 'error'>('idle');
  const [safetyMigResults, setSafetyMigResults] = useState<string[]>([]);

  const runSafetyMigration = useCallback(async () => {
    setSafetyMigStatus('running');
    setSafetyMigResults([]);
    try {
      const res = await fetch('/api/migrate-safety', { method: 'POST', credentials: 'include' });
      const data = await res.json() as { ok: boolean; results: string[] };
      setSafetyMigResults(data.results ?? []);
      setSafetyMigStatus(data.ok ? 'done' : 'error');
    } catch (e) {
      setSafetyMigResults([`Error: ${String(e)}`]);
      setSafetyMigStatus('error');
    }
  }, []);

  // ── Annette / Health Check state ─────────────────────────────────────────────
  const [annetteStatus, setAnnetteStatus] = useState<'idle' | 'running' | 'done' | 'error'>('idle');
  const [annetteReport, setAnnetteReport] = useState('');
  const [annetteRunAt, setAnnetteRunAt] = useState<string | null>(null);
  const [annetteWarnings, setAnnetteWarnings] = useState<string[]>([]);
  const [annetteCopied, setAnnetteCopied] = useState(false);
  const annetteReportRef = useRef<HTMLDivElement>(null);

  const runAnnette = useCallback(async () => {
    setAnnetteStatus('running');
    setAnnetteReport('');
    setAnnetteWarnings([]);
    setAnnetteRunAt(null);
    try {
      const res = await fetch('/api/dazza/annette', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ supportCompanyId: null }),
      });
      if (!res.ok || !res.body) {
        const d = await res.json() as { error?: string };
        setAnnetteReport(`⚠️ Error: ${d.error ?? 'Failed to start Health Check'}`);
        setAnnetteStatus('error');
        return;
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let fullText = '';
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          try {
            const parsed = JSON.parse(line.slice(6)) as { text?: string; done?: boolean; warnings?: string[]; error?: boolean };
            if (parsed.text) { fullText += parsed.text; setAnnetteReport(fullText); }
            if (parsed.done) {
              setAnnetteWarnings(parsed.warnings ?? []);
              setAnnetteRunAt(new Date().toLocaleString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }));
              setAnnetteStatus(parsed.error ? 'error' : 'done');
            }
          } catch { /* skip */ }
        }
      }
    } catch (e) {
      setAnnetteReport(`⚠️ Network error: ${e instanceof Error ? e.message : String(e)}`);
      setAnnetteStatus('error');
    }
  }, []);

  async function copyAnnetteReport() {
    await navigator.clipboard.writeText(annetteReport);
    setAnnetteCopied(true);
    setTimeout(() => setAnnetteCopied(false), 2000);
  }

  // ── Annette markdown renderer ─────────────────────────────────────────────────
  function renderAnnetteReport(text: string): React.ReactNode[] {
    const lines = text.split('\n');
    const nodes: React.ReactNode[] = [];
    let key = 0;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.startsWith('## ')) {
        const content = line.slice(3);
        const contentHead = content.slice(0, 8);
        const emoji = contentHead.match(/^[\u{1F300}-\u{1FFFF}\u2600-\u27BF\u{1F004}\u{1F0CF}]/u)?.[0] ?? '';
        const rest = emoji ? content.slice(emoji.length).trim() : content;
        nodes.push(<div key={key++} className="flex items-center gap-2 mt-6 mb-2 pb-2 border-b border-slate-200">{emoji && <span className="text-lg leading-none">{emoji}</span>}<h2 className="font-heading font-black text-sm text-slate-800 uppercase tracking-wider">{rest}</h2></div>);
        continue;
      }
      if (line.startsWith('### ')) { nodes.push(<h3 key={key++} className="font-bold text-sm text-slate-700 mt-3 mb-1">{line.slice(4)}</h3>); continue; }
      if (line.startsWith('- ') || line.startsWith('• ')) {
        nodes.push(<div key={key++} className="flex items-start gap-2 py-0.5 pl-1"><span className="text-primary mt-1.5 shrink-0 text-[8px]">●</span><span className="text-sm text-slate-700 leading-relaxed">{line.slice(2)}</span></div>);
        continue;
      }
      if (line.trim() === '') { nodes.push(<div key={key++} className="h-1" />); continue; }
      nodes.push(<p key={key++} className="text-sm text-slate-700 leading-relaxed">{line}</p>);
    }
    return nodes;
  }

  // ── Run migrations ────────────────────────────────────────────────────────────
  useEffect(() => {
    Promise.all([
      fetch('/api/migrate-owner-console', { method: 'POST', credentials: 'include' }),
      fetch('/api/migrate-support-mode', { method: 'POST', credentials: 'include' }),
      fetch('/api/migrate-account-recovery', { method: 'POST', credentials: 'include' }),
      fetch('/api/migrate-safety', { method: 'POST', credentials: 'include' }),
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
    if (migrated && !permsLoading && isPlatformOwner) {
      void loadData();
    }
  }, [migrated, permsLoading, isPlatformOwner, loadData]);

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
  if (!permsLoading && !isPlatformOwner) {
    return (
      <div className="flex-1 bg-[#F4F5F7] flex flex-col overflow-hidden lg:pt-[104px]">
        <DesktopTopBar />
        <DesktopDock />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center max-w-sm">
            <div className="w-16 h-16 rounded-2xl bg-red-50 border border-red-200 flex items-center justify-center mx-auto mb-4">
              <Shield size={28} className="text-red-400" />
            </div>
            <h2 className="text-xl font-black text-slate-900 mb-2">Access Denied</h2>
            <p className="text-sm text-slate-500 mb-6">Platform developer access is required to view the Developer Console.</p>
            <button
              onClick={() => navigate('/dashboard')}
              className="px-5 py-2.5 bg-primary text-white rounded-xl text-sm font-bold hover:bg-violet-700 transition-colors"
            >
              Back to Dashboard
            </button>
          </div>
        </div>
      </div>
    );
  }

  const filteredActivity = filterCompanyId
    ? activity.filter((a) => a.companyId === filterCompanyId)
    : activity;

  const filterCompanyName = filterCompanyId
    ? companies.find((c) => c.id === filterCompanyId)?.name
    : null;

  return (
    <div className="flex-1 bg-[#F4F5F7] flex flex-col overflow-hidden lg:pt-[104px]">
      <DesktopTopBar />
      <DesktopDock />

      <div className="flex flex-col h-full overflow-hidden">
        <Helmet>
          <title>Developer Console — IWILLBUILD Portal</title>
          <meta name="description" content="Owner-only control room for managing companies, users, and activity." />
          <link rel="canonical" href="https://iwillbuild.com/owner-console" />
          <meta name="robots" content="noindex" />
          <meta property="og:title" content="Developer Console — IWILLBUILD Portal" />
          <meta property="og:description" content="Owner-only control room for managing companies, users, and activity." />
          <meta property="og:type" content="website" />
          <meta property="og:url" content="https://iwillbuild.com/owner-console" />
          <meta property="og:image" content="https://iwillbuild.com/airo-assets/images/pages/home/og-image" />
          <meta name="twitter:card" content="summary_large_image" />
          <meta name="twitter:title" content="Developer Console — IWILLBUILD Portal" />
          <meta name="twitter:description" content="Owner-only control room for managing companies, users, and activity." />
          <meta name="twitter:image" content="https://iwillbuild.com/airo-assets/images/pages/home/og-image" />
        </Helmet>

        {/* Header */}
        <div className="bg-white border-b border-slate-200 px-6 py-4 flex items-center gap-4 shrink-0">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5">
              <Shield size={16} className="text-primary" />
              <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">Owner Only</p>
            </div>
            <h1 className="font-heading font-black text-xl text-slate-900">Developer Console</h1>
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
          <Tab active={tab === 'system-ai'} onClick={() => { setTab('system-ai'); setSearchParams({}); }}>
            <span className="flex items-center gap-1.5">
              <Bot size={12} />
              System AI
            </span>
          </Tab>
          <Tab active={tab === 'audit-log'} onClick={() => { setTab('audit-log'); setSearchParams({}); }}>
            <span className="flex items-center gap-1.5">
              <ShieldCheck size={12} />
              Audit Log
            </span>
          </Tab>
          <Tab active={tab === 'activity-log'} onClick={() => { setTab('activity-log'); setSearchParams({}); }}>
            <span className="flex items-center gap-1.5">
              <Activity size={12} />
              Activity Log
            </span>
          </Tab>
          <Tab active={tab === 'email-log'} onClick={() => { setTab('email-log'); setSearchParams({}); }}>
            <span className="flex items-center gap-1.5">
              <Mail size={12} />
              Email Log
            </span>
          </Tab>
          <Tab active={tab === 'platform-email'} onClick={() => { setTab('platform-email'); setSearchParams({}); }}>
            <span className="flex items-center gap-1.5">
              <Mail size={12} />
              Email Settings
            </span>
          </Tab>
          <Tab active={tab === 'company-health'} onClick={() => { setTab('company-health'); setSearchParams({}); }}>
            <span className="flex items-center gap-1.5">
              <BarChart2 size={12} />
              Company Health
            </span>
          </Tab>
          <Tab active={tab === 'support-notes'} onClick={() => { setTab('support-notes'); setSearchParams({}); }}>
            <span className="flex items-center gap-1.5">
              <StickyNote size={12} />
              Support Notes
            </span>
          </Tab>
          <Tab active={tab === 'accounting-smoke'} onClick={() => { setTab('accounting-smoke'); setSearchParams({}); }}>
            <span className="flex items-center gap-1.5">
              <Receipt size={12} />
              Accounting Tests
            </span>
          </Tab>
          <Tab active={tab === 'health-check'} onClick={() => { setTab('health-check'); setSearchParams({ tab: 'health-check' }); }}>
            <span className="flex items-center gap-1.5">
              <Activity size={12} />
              Health Check
            </span>
          </Tab>
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
                <p className="text-sm text-slate-400">Loading Developer Console…</p>
              </div>
            </div>
          ) : (
            <>
              {/* ── Overview ── */}
              {tab === 'overview' && (
                <OverviewTab
                  stats={stats}
                  companies={companies}
                  activity={activity}
                  enteringSupport={enteringSupport}
                  onEnterSupport={handleEnterSupport}
                  onViewCompanies={() => { setTab('companies'); setFilterCompanyId(null); setSearchParams({}); }}
                  onViewActivity={() => { setTab('activity'); setFilterCompanyId(null); setSearchParams({}); }}
                />
              )}

              {/* ── Companies ── */}
              {tab === 'companies' && (
                <CompaniesTab
                  companies={companies}
                  supportMode={supportMode}
                  enteringSupport={enteringSupport}
                  onEnterSupport={handleEnterSupport}
                  onViewUsers={handleViewUsers}
                  onViewActivity={handleViewActivity}
                  onCreateCompany={() => setShowCreateCompany(true)}
                />
              )}

              {/* ── Users ── */}
              {tab === 'users' && (
                <UsersTab
                  users={users}
                  companies={companies}
                  filterStatus={filterStatus}
                  filterRole={filterRole}
                  filterVerified={filterVerified}
                  filterCompanyId={filterCompanyId}
                  userSearch={userSearch}
                  onFilterStatus={setFilterStatus}
                  onFilterRole={setFilterRole}
                  onFilterVerified={setFilterVerified}
                  onFilterCompanyId={setFilterCompanyId}
                  onUserSearch={setUserSearch}
                  onClearFilters={() => { setFilterStatus(''); setFilterRole(''); setFilterVerified(''); setFilterCompanyId(null); }}
                  onUserAction={async (action, target) => {
                    if (action === 'impersonate') {
                      const r = await fetch(`/api/developer/users/${target.userId}/impersonate`, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        credentials: 'include',
                        body: JSON.stringify({ reason: 'Developer support session' }),
                      });
                      if (r.ok) {
                        window.location.href = '/dashboard';
                      } else {
                        const d = await r.json() as { error?: string };
                        alert(d.error ?? 'Failed to start impersonation.');
                      }
                      return;
                    }
                    if (action === 'view-sessions') {
                      const r = await fetch(`/api/developer/users/${target.userId}/sessions`, { credentials: 'include' });
                      if (r.ok) {
                        const d = await r.json() as { sessions: Array<{ id: string; ipAddress: string; userAgent: string; createdAt: string }>; total: number };
                        const list = d.sessions.map(s => `\u2022 ${s.ipAddress} \u2014 ${s.userAgent?.slice(0, 60)} (${new Date(s.createdAt).toLocaleString('en-AU')})`).join('\n');
                        alert(`${d.total} active session(s) for ${target.email}:\n\n${list || 'None'}`);
                      }
                      return;
                    }
                    if (action === 'revoke-sessions') {
                      if (!confirm(`Force logout ${target.email}? All their active sessions will be revoked.`)) return;
                      const r = await fetch(`/api/developer/users/${target.userId}/sessions`, {
                        method: 'DELETE',
                        headers: { 'Content-Type': 'application/json' },
                        credentials: 'include',
                        body: JSON.stringify({ reason: 'Force logout by developer' }),
                      });
                      if (r.ok) {
                        setActionToast(`Sessions revoked for ${target.email}`);
                        setTimeout(() => setActionToast(''), 3000);
                      }
                      return;
                    }
                    setPendingAction({ action, user: target });
                  }}
                  onOrphanAction={(action, user) => setPendingOrphanAction({ action, user })}
                  actionToast={actionToast}
                />
              )}

              {/* ── Activity ── */}
              {tab === 'activity' && (
                <ActivityTab
                  activity={filteredActivity}
                  filterCompanyName={filterCompanyName}
                  onClearFilter={() => setFilterCompanyId(null)}
                />
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
                        className="px-5 py-2.5 bg-primary text-white rounded-xl text-sm font-bold hover:bg-violet-700 transition-colors"
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

              {/* ── System AI ── */}
              {tab === 'system-ai' && (
                <SystemAITab companies={companies.map((c) => ({ id: c.id, name: c.name, totalUsers: c.totalUsers }))} />
              )}

              {/* ── Developer Audit Log ── */}
              {tab === 'audit-log' && <DeveloperAuditLogTab />}

              {/* ── Activity Log ── */}
              {tab === 'activity-log' && <ActivityLogTab />}

              {/* ── Email Delivery Log ── */}
              {tab === 'email-log' && <EmailLogTab />}

              {/* ── Platform Email Settings ── */}
              {tab === 'platform-email' && <PlatformEmailTab />}

              {/* ── Company Health ── */}
              {tab === 'company-health' && <CompanyHealthTab />}

              {/* ── Support Notes ── */}
              {tab === 'support-notes' && <SupportNotesTab />}
              {tab === 'accounting-smoke' && <AccountingSmokeTestTab />}

              {tab === 'swms-seed' && <SwmsMasterLibraryTab />}

              {/* ── Health Check (Annette) ── */}
              {tab === 'health-check' && (
                <div className="max-w-3xl">

                  {/* Safety DB Migration card */}
                  <div className="bg-white border border-slate-200 rounded-xl p-5 mb-6">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-9 h-9 rounded-lg bg-violet-100 flex items-center justify-center">
                        <Database size={16} className="text-violet-700" />
                      </div>
                      <div>
                        <p className="font-bold text-sm text-slate-800">Safety DB Migration</p>
                        <p className="text-xs text-slate-500">Adds swms_body, build_mode, document_type columns — idempotent, safe to re-run</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <button
                        onClick={runSafetyMigration}
                        disabled={safetyMigStatus === 'running'}
                        className="flex items-center gap-2 bg-violet-700 hover:bg-violet-800 disabled:opacity-50 text-white text-sm font-bold px-4 py-2 rounded-lg transition-colors"
                      >
                        {safetyMigStatus === 'running' ? (
                          <><Loader2 size={13} className="animate-spin" />Running…</>
                        ) : safetyMigStatus === 'done' ? (
                          <><RefreshCw size={13} />Run again</>
                        ) : (
                          <><Play size={13} />Run Migration</>
                        )}
                      </button>
                      {safetyMigStatus === 'done' && <span className="text-xs text-emerald-600 font-semibold">✓ Complete</span>}
                      {safetyMigStatus === 'error' && <span className="text-xs text-red-600 font-semibold">✗ Error — see results</span>}
                    </div>
                    {safetyMigResults.length > 0 && (
                      <div className="mt-3 bg-slate-50 border border-slate-200 rounded-lg p-3 max-h-48 overflow-y-auto">
                        {safetyMigResults.map((r, i) => (
                          <p key={i} className={`text-xs font-mono leading-relaxed ${r.startsWith('✗') ? 'text-red-600' : r.startsWith('~') ? 'text-slate-400' : 'text-emerald-700'}`}>{r}</p>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Dazza Health Check */}
                  <div className="mb-6">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-600 to-purple-700 flex items-center justify-center shadow-sm">
                        <Activity size={18} className="text-white" />
                      </div>
                      <div>
                        <h2 className="font-heading font-black text-xl text-slate-900">Dazza Health Check</h2>
                        <p className="text-xs text-slate-500">v1 — Company health check</p>
                      </div>
                    </div>
                    <p className="text-sm text-slate-600 leading-relaxed mt-3">
                      Analyses live portal data and produces a prioritised action report — urgent items, things needing attention, missing information, and suggested next steps.
                    </p>
                  </div>

                  {/* Run card */}
                  <div className="bg-white border border-slate-200 rounded-xl p-5 mb-5">
                    <div className="flex items-center justify-between gap-4 flex-wrap">
                      <div>
                        <p className="font-bold text-sm text-slate-800">Run health check</p>
                        <p className="text-xs text-slate-500 mt-0.5">Analyses jobs, to-dos, fleet, estimates, and forms. Takes 10–20 seconds.</p>
                        {annetteRunAt && (
                          <p className="text-xs text-slate-400 mt-1 flex items-center gap-1">
                            <Clock size={10} />
                            Last run: {annetteRunAt}
                          </p>
                        )}
                      </div>
                      <button
                        onClick={runAnnette}
                        disabled={annetteStatus === 'running'}
                        className="flex items-center gap-2 bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white text-sm font-bold px-5 py-2.5 rounded-xl transition-colors shrink-0"
                      >
                        {annetteStatus === 'running' ? (
                          <><Loader2 size={14} className="animate-spin" />Running…</>
                        ) : annetteStatus === 'done' ? (
                          <><RefreshCw size={14} />Run again</>
                        ) : (
                          <><Play size={14} />Run Health Check</>
                        )}
                      </button>
                    </div>
                    {annetteStatus === 'running' && (
                      <div className="mt-4">
                        <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <div className="h-full bg-violet-500 rounded-full animate-pulse w-3/4" />
                        </div>
                        <p className="text-xs text-slate-400 mt-1.5">Analysing portal data…</p>
                      </div>
                    )}
                  </div>

                  {/* Streaming report */}
                  {(annetteStatus === 'running' || annetteStatus === 'done' || annetteStatus === 'error') && annetteReport && (
                    <div className="bg-white border border-slate-200 rounded-xl overflow-hidden mb-5">
                      <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 bg-slate-50">
                        <div className="flex items-center gap-2">
                          {annetteStatus === 'done' && <CheckCircle2 size={13} className="text-emerald-500" />}
                          {annetteStatus === 'running' && <Loader2 size={13} className="text-violet-500 animate-spin" />}
                          {annetteStatus === 'error' && <AlertCircle size={13} className="text-red-500" />}
                          <span className="text-xs font-semibold text-slate-600">
                            {annetteStatus === 'running' ? 'Generating report…' : annetteStatus === 'error' ? 'Report completed with errors' : 'Report complete'}
                          </span>
                        </div>
                        {annetteStatus === 'done' && (
                          <button
                            onClick={copyAnnetteReport}
                            className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-slate-700 transition-colors px-2 py-1 rounded-lg hover:bg-slate-100"
                          >
                            {annetteCopied ? <><Check size={11} className="text-emerald-500" />Copied</> : <><Copy size={11} />Copy</>}
                          </button>
                        )}
                      </div>
                      <div ref={annetteReportRef} className="px-5 py-4 flex flex-col gap-0.5">
                        {renderAnnetteReport(annetteReport)}
                        {annetteStatus === 'running' && (
                          <span className="inline-block w-1.5 h-4 bg-violet-400 animate-pulse rounded-sm ml-0.5" />
                        )}
                      </div>
                      {annetteWarnings.length > 0 && (
                        <div className="mx-4 mb-4 bg-amber-50 border border-amber-200 rounded-xl p-3">
                          <p className="text-xs font-bold text-amber-700 flex items-center gap-1.5 mb-1.5">
                            <Info size={11} />
                            {annetteWarnings.length} module{annetteWarnings.length > 1 ? 's' : ''} failed to load
                          </p>
                          {annetteWarnings.map((w, i) => (
                            <p key={i} className="text-xs text-amber-600 font-mono">{w}</p>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {annetteStatus === 'idle' && (
                    <div className="bg-slate-50 border border-dashed border-slate-200 rounded-xl p-8 text-center mb-5">
                      <Activity size={28} className="text-slate-300 mx-auto mb-3" />
                      <p className="text-sm font-semibold text-slate-500">No report yet</p>
                      <p className="text-xs text-slate-400 mt-1">Click "Run Health Check" to analyse your company data.</p>
                    </div>
                  )}

                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 flex gap-3">
                    <Info size={13} className="text-slate-400 shrink-0 mt-0.5" />
                    <p className="text-xs text-slate-500 leading-relaxed">
                      Reports are based on data currently in your IWILLBUILD portal. For WHS, building code, or legal compliance matters, always verify with a competent person or the current official standard. Dazza Health Check does not provide legal or professional advice.
                    </p>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* ── User Action Modal ─────────────────────────────────────────────────── */}
      {pendingAction && (
        <UserActionModal
          action={pendingAction.action}
          user={pendingAction.user}
          onClose={() => setPendingAction(null)}
          onSuccess={(action, userId, extra) => {
            setPendingAction(null);
            // Update local user state immediately
            setUsers(prev => prev.map(u => {
              if (u.userId !== userId) return u;
              if (action === 'verify') return { ...u, emailVerified: true };
              if (action === 'deactivate') return { ...u, status: 'inactive' };
              if (action === 'reactivate') return { ...u, status: 'active' };
              if (action === 'change-role' && extra?.role) return { ...u, role: extra.role as string };
              return u;
            }));
            // Show toast
            const msgs: Record<UserAction, string> = {
              verify: 'Email verified successfully.',
              'resend-verification': extra?.emailSent ? 'Verification email sent.' : 'Could not send email — use manual verify instead.',
              deactivate: 'Account deactivated. User is now blocked from logging in.',
              reactivate: 'Account reactivated.',
              'change-role': `Role changed to ${extra?.role ?? 'new role'}.`,
            };
            setActionToast(msgs[action]);
            setTimeout(() => setActionToast(null), 4000);
          }}
        />
      )}

      {/* ── Orphan Action Modal ───────────────────────────────────────────────── */}
      {pendingOrphanAction && (
        <OrphanActionModal
          action={pendingOrphanAction.action}
          user={pendingOrphanAction.user}
          onClose={() => setPendingOrphanAction(null)}
          onSuccess={(action, userId) => {
            setPendingOrphanAction(null);
            if (action === 'delete-orphan') {
              setUsers(prev => prev.filter(u => u.userId !== userId));
              setActionToast('Orphaned account deleted.');
            } else if (action === 'assign-company') {
              // Reload data to get the new profile
              void loadData(true);
              setActionToast('User assigned to company. Profile created.');
            } else if (action === 'verify-orphan') {
              setUsers(prev => prev.map(u => u.userId === userId ? { ...u, emailVerified: true } : u));
              setActionToast('Email verified.');
            } else if (action === 'send-reset' || action === 'resume-setup') {
              setActionToast('Password reset email sent.');
            }
            setTimeout(() => setActionToast(null), 4000);
          }}
        />
      )}

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
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl bg-primary hover:bg-violet-700 text-white text-sm font-bold disabled:opacity-60 transition-colors"
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
          setUsers(prev => prev.map(u =>
            u.userId === userId
              ? { ...u, emailVerified: true, verificationMethod: 'manual_owner' } as typeof u
              : u
          ));
        }}
      />

      {/* Action toast */}
      {actionToast && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 px-5 py-3 bg-slate-900 text-white text-sm font-semibold rounded-xl shadow-2xl flex items-center gap-2 animate-in fade-in slide-in-from-bottom-2 duration-200">
          <CheckCircle2 size={15} className="text-emerald-400 shrink-0" />
          {actionToast}
        </div>
      )}
    </div>
  );
}
