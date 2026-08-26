import { useState, useEffect, useRef, useCallback } from 'react';
import { useParams, useNavigate, useSearchParams, useLocation } from "react-router";
import { motion } from 'motion/react';
import { Helmet } from '@dr.pogodin/react-helmet';
import { HardHat, ChevronLeft, Edit2, ChevronDown, Calculator, FolderOpen, StickyNote, TrendingUp, ClipboardList, ShieldAlert, Receipt, Clock, UserCheck, DollarSign, Users, CalendarCheck, CalendarClock, Layers, Image, FileText, Check, X, Loader2, AlertCircle, CheckSquare, Download, Mail, BookOpen, ChevronUp } from 'lucide-react';
import SendDocumentEmailModal from '@/components/SendDocumentEmailModal';
import type { JobEmailContext, SendSuccessPayload } from '@/components/SendDocumentEmailModal';
import { EmailToastContainer } from '@/components/EmailSentToast';
import type { EmailSentToastProps } from '@/components/EmailSentToast';
import JobEstimates from '@/components/JobEstimates';
import FilePanel from '@/components/FilePanel';
import NotesPanel from '@/components/notes/NotesPanel';
import JobProgress from '@/components/job/JobProgress';
import JobForms from '@/components/job/JobForms';
import JobSafety from '@/components/job/JobSafety';
import JobCosts from '@/components/job/JobCosts';
import JobDelays from '@/components/job/JobDelays';
import JobInvoices from '@/components/job/JobInvoices';
import CustomerSelectorComponent from '@/components/CustomerSelector';
import JobPlanManagerTab from '@/components/PlanManager/JobPlanManagerTab';
import JobPurchaseOrders from '@/components/job/JobPurchaseOrders';
import JobTodos from '@/components/job/JobTodos';
import AssetSelectorComponent from '@/components/AssetManager/AssetSelector';
import { fetchJob, updateJob, getStatusStyle, JOB_STATUSES, type Job } from '@/lib/jobs-api';
import { fetchCustomer } from '@/lib/customers-api';
import { useTerminology } from '@/lib/useTerminology';
import JobDetailsDashboard, { type JobSummary, type Customer } from '@/components/job/JobDetailsDashboard';
import JobPhotosTab from '@/components/job/JobPhotosTab';
import JobAttendanceTab from '@/components/job/JobAttendanceTab';
import DesktopTopBar from '@/components/DesktopTopBar';
import DesktopDock from '@/components/DesktopDock';
import PortalSidebar from '@/components/PortalSidebar';
type Tab = 'details' | 'estimates' | 'costs' | 'invoices' | 'purchase-orders' | 'progress' | 'delays' | 'photos' | 'files' | 'forms' | 'notes' | 'safety' | 'drawings' | 'attendance' | 'tasks';

// ── Wrapper components to adapt actual selectors to JobDetailsDashboard interface ──

const CustomerSelectorWrapper: React.ComponentType<{
  value: Customer | null;
  onChange: (c: Customer | null) => void;
}> = ({
  value,
  onChange
}) => <CustomerSelectorComponent value={value as any} onChange={onChange as any} />;
const AssetSelectorWrapper: React.ComponentType<{
  value: number | null;
  onChange: (id: number | null, name?: string) => void;
}> = ({
  value,
  onChange
}) => <AssetSelectorComponent value={value} onChange={(id, name) => onChange(id, name ?? undefined)} />;

// ── Nav definition ────────────────────────────────────────────────────────────

type NavItem = {
  readonly key: Tab;
  readonly label: string;
  readonly icon: typeof FileText;
};
const NAV_GROUPS: Array<{
  label: string;
  items: NavItem[];
}> = [{
  label: 'Job',
  items: [{
    key: 'details' as const,
    label: 'Details',
    icon: FileText
  }]
}, {
  label: 'Work',
  items: [{
    key: 'tasks' as const,
    label: 'Tasks',
    icon: CheckSquare
  }, {
    key: 'notes' as const,
    label: 'Notes',
    icon: StickyNote
  }, {
    key: 'delays' as const,
    label: 'Delays',
    icon: Clock
  }, {
    key: 'progress' as const,
    label: 'Progress',
    icon: TrendingUp
  }, {
    key: 'attendance' as const,
    label: 'Attendance',
    icon: UserCheck
  }]
}, {
  label: 'Field & Files',
  items: [{
    key: 'photos' as const,
    label: 'Photos',
    icon: Image
  }, {
    key: 'drawings' as const,
    label: 'Drawings',
    icon: Layers
  }, {
    key: 'files' as const,
    label: 'Files',
    icon: FolderOpen
  }]
}, {
  label: 'Finance',
  items: [{
    key: 'estimates' as const,
    label: 'Estimates',
    icon: Calculator
  }, {
    key: 'purchase-orders' as const,
    label: 'Purchase Orders',
    icon: Receipt
  }, {
    key: 'invoices' as const,
    label: 'Invoices',
    icon: DollarSign
  }, {
    key: 'costs' as const,
    label: 'Job Ledger',
    icon: BookOpen
  }]
}, {
  label: 'Safety',
  items: [{
    key: 'forms' as const,
    label: 'Forms',
    icon: ClipboardList
  }, {
    key: 'safety' as const,
    label: 'Safety',
    icon: ShieldAlert
  }]
}];
const ALL_NAV_ITEMS = NAV_GROUPS.flatMap(g => g.items);

// ── Page ──────────────────────────────────────────────────────────────────────

export default function JobDetailPage() {
  const {
    id,
    formInstanceId
  } = useParams<{
    id: string;
    formInstanceId?: string;
  }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const {
    workSingular,
    workPlural
  } = useTerminology();
  const [job, setJob] = useState<Job | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [statusOpen, setStatusOpen] = useState(false);
  const [userRole, setUserRole] = useState<string>('');
  const [costSummary, setCostSummary] = useState<{
    actual: number;
    approved: number;
  } | null>(null);
  const [linkedCustomer, setLinkedCustomer] = useState<Customer | null>(null);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [teamMembers, setTeamMembers] = useState<Array<{
    userId: string;
    name: string;
    role: string;
  }>>([]);
  const [linkedAssetId, setLinkedAssetId] = useState<number | null>(null);
  const [linkedAssetName, setLinkedAssetName] = useState<string>('');
  const [editingAssetId, setEditingAssetId] = useState<number | null>(null);
  const [jobSummary, setJobSummary] = useState<JobSummary | null>(null);
  const [downloadingZip, setDownloadingZip] = useState(false);
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [emailDefaults, setEmailDefaults] = useState<{
    to: string;
    subject: string;
    message: string;
    job?: JobEmailContext;
  } | null>(null);
  const [loadingEmailDefaults, setLoadingEmailDefaults] = useState(false);
  const [emailToasts, setEmailToasts] = useState<EmailSentToastProps[]>([]);
  const dismissToast = (id: string) => setEmailToasts(prev => prev.filter(t => t.id !== id));
  const handleEmailSuccess = (payload: SendSuccessPayload) => {
    const id = `toast-${Date.now()}`;
    setEmailToasts(prev => [...prev, {
      id,
      ...payload,
      onDismiss: dismissToast
    }]);
  };
  const handleOpenEmail = async () => {
    if (!job) return;
    setLoadingEmailDefaults(true);
    try {
      const res = await fetch(`/api/jobs/${job.id}/compose-defaults`, {
        credentials: 'include'
      });
      const data = (await res.json()) as {
        to?: string;
        subject?: string;
        message?: string;
        job?: JobEmailContext;
      };
      setEmailDefaults({
        to: data.to ?? '',
        subject: data.subject ?? '',
        message: data.message ?? '',
        job: data.job
      });
    } catch {
      setEmailDefaults({
        to: '',
        subject: '',
        message: ''
      });
    } finally {
      setLoadingEmailDefaults(false);
      setShowEmailModal(true);
    }
  };
  const handleDownloadJobZip = async () => {
    if (!job) return;
    setDownloadingZip(true);
    try {
      const res = await fetch(`/api/jobs/${job.id}/export-zip`);
      if (!res.ok) throw new Error('Export failed');
      const blob = await res.blob();
      const disposition = res.headers.get('Content-Disposition') ?? '';
      const match = /filename="([^"]+)"/.exec(disposition);
      const filename = match?.[1] ?? `iwillbuild-job-${job.jobNumber ?? job.id}-${new Date().toISOString().slice(0, 10)}.zip`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      // silent — user will see no download
    } finally {
      setDownloadingZip(false);
    }
  };
  // ── Tab state — URL-driven so refresh and deep links work ────────────────
  const location = useLocation();
  const resolveTab = useCallback((): Tab => {
    if (formInstanceId) return 'forms';
    const t = new URLSearchParams(location.search).get('tab');
    if (t === 'photos' || t === 'estimates' || t === 'costs' || t === 'invoices' || t === 'purchase-orders' || t === 'files' || t === 'notes' || t === 'delays' || t === 'progress' || t === 'forms' || t === 'safety' || t === 'drawings' || t === 'attendance' || t === 'tasks') return t as Tab;
    return 'details';
  }, [location.search, formInstanceId]);
  const activeTab = resolveTab();
  const [form, setForm] = useState({
    name: '',
    jobNumber: '',
    client: '',
    address: '',
    status: '',
    notes: '',
    scheduledStartDate: '',
    scheduledStartTime: '',
    expectedCompletionDate: '',
    scheduledEndTime: '',
    actualStartDate: '',
    actualCompletionDate: '',
    assignedSupervisorUserId: '',
    assignedTeamLabel: ''
  });
  useEffect(() => {
    if (id) loadJob(parseInt(id, 10));
    fetch('/api/me', {
      credentials: 'include'
    }).then(r => r.json()).then((d: {
      profile?: {
        role?: string;
      };
    }) => {
      if (d.profile?.role) setUserRole(d.profile.role);
    }).catch(() => {});
    fetch('/api/team/members', {
      credentials: 'include'
    }).then(r => r.ok ? r.json() : Promise.reject()).then((d: {
      members?: Array<{
        userId: string;
        name: string;
        role: string;
      }>;
    }) => {
      setTeamMembers(d.members ?? []);
    }).catch(() => {});
    if (id) {
      fetch(`/api/jobs/${id}/costs`, {
        credentials: 'include'
      }).then(r => r.json()).then((d: {
        costs?: Array<{
          amount: string | number;
        }>;
        approvedTotal?: number;
      }) => {
        const actual = (d.costs ?? []).reduce((s, c) => s + parseFloat(String(c.amount ?? 0)), 0);
        setCostSummary({
          actual,
          approved: d.approvedTotal ?? 0
        });
      }).catch(() => {});
    }
    // ── Summary data for the Details dashboard ────────────────────────────
    if (id) {
      Promise.all([fetch(`/api/jobs/${id}/todos`, {
        credentials: 'include'
      }).then(r => r.ok ? r.json() : {
        todos: []
      }), fetch(`/api/jobs/${id}/signin-status`, {
        credentials: 'include'
      }).then(r => r.ok ? r.json() : {
        currentlyOnSite: []
      }), fetch(`/api/jobs/${id}/photos?limit=1`, {
        credentials: 'include'
      }).then(r => r.ok ? r.json() : {
        total: 0
      })]).then(([todosData, attendanceData, photosData]: [{
        todos?: Array<{
          status?: string;
        }>;
      }, {
        currentlyOnSite?: unknown[];
      }, {
        total?: number;
        photos?: unknown[];
      }]) => {
        const todos = todosData.todos ?? [];
        setJobSummary({
          tasksTotal: todos.length,
          tasksDone: todos.filter(t => t.status === 'done' || t.status === 'completed').length,
          onSiteCount: (attendanceData.currentlyOnSite ?? []).length,
          photosCount: photosData.total ?? (photosData.photos ?? []).length
        });
      }).catch(() => {});
    }
  }, [id]);
  async function loadJob(jobId: number) {
    setLoading(true);
    setError('');
    try {
      const data = await fetchJob(jobId);
      setJob(data);
      setForm({
        name: data.name,
        jobNumber: data.jobNumber ?? '',
        client: data.client ?? '',
        address: data.address ?? '',
        status: data.status,
        notes: data.notes ?? '',
        scheduledStartDate: data.scheduledStartDate ?? '',
        scheduledStartTime: (data as unknown as Record<string, unknown>).scheduledStartTime as string ?? '',
        expectedCompletionDate: data.expectedCompletionDate ?? '',
        scheduledEndTime: (data as unknown as Record<string, unknown>).scheduledEndTime as string ?? '',
        actualStartDate: data.actualStartDate ?? '',
        actualCompletionDate: data.actualCompletionDate ?? '',
        assignedSupervisorUserId: data.assignedSupervisorUserId ?? '',
        assignedTeamLabel: data.assignedTeamLabel ?? ''
      });
      // Load asset link (asset_id returned via raw SQL in GET handler)
      const assetId = (data as unknown as Record<string, unknown>).assetId as number | null ?? null;
      setLinkedAssetId(assetId);
      setEditingAssetId(assetId);
      if (assetId) {
        fetch(`/api/asset-manager/assets/${assetId}`, {
          credentials: 'include'
        }).then(r => r.json() as Promise<{
          asset?: {
            name: string;
          };
        }>).then(d => {
          if (d.asset) setLinkedAssetName(d.asset.name);
        }).catch(() => {});
      }
      if (data.customerId) {
        fetchCustomer(data.customerId).then(({
          customer
        }) => {
          setLinkedCustomer(customer);
          setEditingCustomer(customer);
        }).catch(() => {});
      } else {
        setLinkedCustomer(null);
        setEditingCustomer(null);
      }
    } catch {
      setError('Job not found or failed to load.');
    } finally {
      setLoading(false);
    }
  }
  async function handleSave() {
    if (!job) return;
    if (!form.name.trim()) {
      setSaveError('Job title is required');
      return;
    }
    setSaving(true);
    setSaveError('');
    try {
      const updated = await updateJob(job.id, {
        name: form.name.trim(),
        jobNumber: form.jobNumber.trim() || undefined,
        client: form.client.trim() || undefined,
        address: form.address.trim() || undefined,
        status: form.status,
        notes: form.notes.trim() || undefined,
        customerId: editingCustomer?.id ?? null,
        assetId: editingAssetId ?? null,
        scheduledStartDate: form.scheduledStartDate || null,
        expectedCompletionDate: form.expectedCompletionDate || null,
        scheduledStartTime: form.scheduledStartTime || null,
        scheduledEndTime: form.scheduledEndTime || null,
        actualStartDate: form.actualStartDate || null,
        actualCompletionDate: form.actualCompletionDate || null,
        assignedSupervisorUserId: form.assignedSupervisorUserId || null,
        assignedTeamLabel: form.assignedTeamLabel.trim() || null
      });
      setJob(updated);
      setLinkedCustomer(editingCustomer);
      setLinkedAssetId(editingAssetId);
      setEditing(false);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }
  function handleCancel() {
    if (!job) return;
    setForm({
      name: job.name,
      jobNumber: job.jobNumber ?? '',
      client: job.client ?? '',
      address: job.address ?? '',
      status: job.status,
      notes: job.notes ?? '',
      scheduledStartDate: job.scheduledStartDate ?? '',
      scheduledStartTime: (job as unknown as Record<string, unknown>).scheduledStartTime as string ?? '',
      expectedCompletionDate: job.expectedCompletionDate ?? '',
      scheduledEndTime: (job as unknown as Record<string, unknown>).scheduledEndTime as string ?? '',
      actualStartDate: job.actualStartDate ?? '',
      actualCompletionDate: job.actualCompletionDate ?? '',
      assignedSupervisorUserId: job.assignedSupervisorUserId ?? '',
      assignedTeamLabel: job.assignedTeamLabel ?? ''
    });
    setEditingCustomer(linkedCustomer);
    setEditingAssetId(linkedAssetId);
    setSaveError('');
    setEditing(false);
  }
  async function handleStatusChange(newStatus: string) {
    if (!job) return;
    setStatusOpen(false);
    try {
      const updated = await updateJob(job.id, {
        status: newStatus
      });
      setJob(updated);
      setForm(f => ({
        ...f,
        status: newStatus
      }));
    } catch {
      // silent
    }
  }
  // ── Mobile section dropdown state ────────────────────────────────────────
  const [sectionOpen, setSectionOpen] = useState(false);
  const sectionDropdownRef = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    if (!sectionOpen) return;
    function handleOutside(e: MouseEvent) {
      if (sectionDropdownRef.current && !sectionDropdownRef.current.contains(e.target as Node)) {
        setSectionOpen(false);
      }
    }
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [sectionOpen]);

  // Close on Escape
  useEffect(() => {
    if (!sectionOpen) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setSectionOpen(false);
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [sectionOpen]);

  function switchTab(tab: Tab) {
    setStatusOpen(false);
    setSectionOpen(false);
    const params = new URLSearchParams(searchParams.toString());
    if (tab === 'details') {
      params.delete('tab');
    } else {
      params.set('tab', tab);
    }
    const search = params.toString();
    navigate(`/jobs/${id}${search ? `?${search}` : ''}`, { replace: false });
  }

  const statusStyle = job ? getStatusStyle(job.status) : null;
  return <div className="min-h-dvh bg-[#f5f6f8] flex flex-col lg-portal">
      <PortalSidebar />
      <DesktopTopBar />
      <DesktopDock />
      <Helmet>
        <title>{job ? `${job.jobNumber ?? job.name} — IWILLBUILD` : 'Job — IWILLBUILD'}</title>
        <meta name="description" content={job ? `Job details for ${job.name}${job.client ? ` — ${job.client}` : ''}` : 'Job details — IWILLBUILD Portal'} />
        <link rel="canonical" href={`https://iwillbuild.com/jobs/${id}`} />
        <meta name="robots" content="noindex" />
      </Helmet>

      <div className="flex flex-col flex-1 min-h-0">
        {/* ── Mobile top bar ── */}
        <header className="md:hidden h-14 bg-white border-b border-gray-200 flex items-center justify-between px-4 shrink-0 sticky top-0 z-30 safe-top">
          <div className="flex items-center gap-2 min-w-0">
            <button onClick={() => navigate('/jobs')} className="p-1.5 -ml-1 rounded text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors shrink-0" aria-label="Back">
              <ChevronLeft size={18} />
            </button>
            <HardHat size={15} className="text-primary shrink-0" />
            <h1 className="font-heading font-bold text-sm truncate text-gray-900">
              {job ? job.jobNumber ? `${job.jobNumber} — ${job.name}` : job.name : 'Loading…'}
            </h1>
          </div>
          <div className="flex items-center gap-2 shrink-0">
          {job && !editing && <>
              <button onClick={() => void handleOpenEmail()} disabled={loadingEmailDefaults} className="flex items-center gap-1.5 text-xs font-semibold text-primary hover:bg-violet-50 px-2.5 py-1.5 rounded transition-colors shrink-0 disabled:opacity-50">
                {loadingEmailDefaults ? <Loader2 size={13} className="animate-spin" /> : <Mail size={13} />}
                <span className="hidden sm:inline">Email</span>
              </button>
            <button onClick={() => setEditing(true)} className="flex items-center gap-1.5 text-xs font-semibold text-primary hover:bg-violet-50 px-2.5 py-1.5 rounded transition-colors shrink-0">
              <Edit2 size={13} /><span className="hidden sm:inline">Edit</span>
            </button>
            <button onClick={() => void handleDownloadJobZip()} disabled={downloadingZip} title="Download job ZIP" className="flex items-center gap-1.5 text-xs font-semibold text-slate-500 hover:bg-slate-100 px-2.5 py-1.5 rounded transition-colors shrink-0 disabled:opacity-50">
              {downloadingZip ? <Loader2 size={13} className="animate-spin" /> : <Download size={13} />}
              <span className="hidden sm:inline">ZIP</span>
            </button>
            </>}
          {editing && <div className="flex items-center gap-2 shrink-0">
              <button onClick={handleCancel} disabled={saving} className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground px-2.5 py-1.5 rounded hover:bg-muted transition-colors">
                <X size={13} /><span className="hidden sm:inline">Cancel</span>
              </button>
              <button onClick={handleSave} disabled={saving} className="flex items-center gap-1.5 text-xs font-bold bg-primary hover:bg-violet-700 text-white px-2.5 py-1.5 rounded transition-colors disabled:opacity-60">
                {saving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                <span className="hidden sm:inline">Save</span>
              </button>
            </div>}
          </div>
        </header>

        {/* ── Desktop op-page-header ── */}
        <header className="op-page-header hidden md:flex sticky top-0 z-30">
          <button onClick={() => navigate('/jobs')} className="p-1 -ml-0.5 rounded text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors shrink-0" aria-label="Back">
            <ChevronLeft size={15} />
          </button>
          <HardHat size={14} className="text-primary shrink-0" />
          <span className="op-page-title flex-1 min-w-0 truncate">
            {job ? job.jobNumber ? `${job.jobNumber} — ${job.name}` : job.name : 'Loading…'}
          </span>
          <div className="ml-auto flex items-center gap-2 shrink-0">
            {job && !editing && <>
                <button onClick={() => void handleOpenEmail()} disabled={loadingEmailDefaults} className="op-btn op-btn-ghost disabled:opacity-50">
                  {loadingEmailDefaults ? <Loader2 size={12} className="animate-spin" /> : <Mail size={12} />}Email
                </button>
                <button onClick={() => setEditing(true)} className="op-btn op-btn-ghost">
                  <Edit2 size={12} />Edit
                </button>
                <button onClick={() => void handleDownloadJobZip()} disabled={downloadingZip} title="Download job ZIP" className="op-btn op-btn-ghost disabled:opacity-50">
                  {downloadingZip ? <Loader2 size={12} className="animate-spin" /> : <Download size={12} />}ZIP
                </button>
              </>}
            {editing && <div className="flex items-center gap-1.5">
                <button onClick={handleCancel} disabled={saving} className="op-btn op-btn-ghost">
                  <X size={12} />Cancel
                </button>
                <button onClick={handleSave} disabled={saving} className="op-btn op-btn-primary disabled:opacity-60">
                  {saving ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}Save
                </button>
              </div>}
          </div>
        </header>

        {/* ── Body ── */}
        <div className="flex-1 overflow-y-auto min-h-0">

          {loading && <div className="flex items-center justify-center py-20">
              <Loader2 size={24} className="animate-spin text-primary" />
            </div>}

          {error && <div className="flex items-center gap-3 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700 max-w-lg m-6">
              <AlertCircle size={16} className="shrink-0" />
              {error}
              <button onClick={() => navigate('/jobs')} className="ml-auto font-semibold underline">Back to {workPlural}</button>
            </div>}

          {job && <motion.div initial={{
          opacity: 0,
          y: 10
        }} animate={{
          opacity: 1,
          y: 0
        }} transition={{
          duration: 0.3,
          ease: 'easeOut' as const
        }} className="flex flex-col min-h-full">

              {/* ── Sticky job meta + pill nav ── */}
              <div className="sticky top-0 z-20 bg-white border-b border-gray-200 shrink-0">

                {/* ── Status bar ── */}
                <div className="px-4 md:px-4 py-2 flex flex-col gap-1.5">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3 flex-wrap">
                      {statusStyle && <span className={`inline-flex items-center gap-1.5 text-sm font-bold px-3 py-1 rounded-full border ${statusStyle.bg} ${statusStyle.color}`}>
                          <span className={`w-2 h-2 rounded-full ${statusStyle.dot}`} />
                          {job.status}
                        </span>}
                      <span className="text-xs text-muted-foreground hidden sm:inline">
                        Updated {new Date(job.updatedAt).toLocaleDateString('en-AU', {
                      day: 'numeric',
                      month: 'short',
                      year: 'numeric'
                    })}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      {/* Cost mini-summary */}
                      {costSummary && (costSummary.actual > 0 || costSummary.approved > 0) && <button onClick={() => switchTab('costs')} className="hidden sm:flex items-center gap-3 text-xs border border-slate-200 rounded-lg px-3 py-1.5 hover:bg-slate-50 transition-colors">
                          <span className="text-slate-500">Costs</span>
                          <span className="font-bold text-slate-800">${costSummary.actual.toLocaleString('en-AU', {
                        minimumFractionDigits: 0,
                        maximumFractionDigits: 0
                      })}</span>
                          {costSummary.approved > 0 && <>
                              <span className="text-slate-300">/</span>
                              <span className={`font-semibold ${costSummary.actual > costSummary.approved ? 'text-red-600' : 'text-emerald-600'}`}>
                                {costSummary.actual > costSummary.approved ? '⚠ Over' : `${(costSummary.actual / costSummary.approved * 100).toFixed(0)}%`}
                              </span>
                            </>}
                          <Receipt size={11} className="text-slate-400" />
                        </button>}

                      {/* Quick status change */}
                      <div className="relative shrink-0">
                        <button onClick={() => setStatusOpen(!statusOpen)} className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground border border-border rounded-lg px-3 py-1.5 hover:bg-muted transition-colors">
                          Change Status <ChevronDown size={12} />
                        </button>
                        {statusOpen && <>
                            <div className="fixed inset-0 z-40" onClick={() => setStatusOpen(false)} />
                            <div className="absolute right-0 top-full mt-1 bg-white border border-border rounded-xl shadow-xl z-50 py-1 min-w-[200px] max-h-72 overflow-y-auto">
                              {JOB_STATUSES.map(s => {
                          const st = getStatusStyle(s);
                          return <button key={s} onClick={() => handleStatusChange(s)} className={`w-full text-left px-4 py-2 text-sm flex items-center gap-2 hover:bg-muted transition-colors ${job.status === s ? 'font-bold' : ''}`}>
                                    <span className={`w-2 h-2 rounded-full shrink-0 ${st.dot}`} />
                                    {s}
                                    {job.status === s && <Check size={12} className="ml-auto text-primary" />}
                                  </button>;
                        })}
                            </div>
                          </>}
                      </div>
                    </div>
                  </div>

                  {/* ── Schedule summary strip ── */}
                  {(job.scheduledStartDate || job.expectedCompletionDate || job.actualStartDate || job.actualCompletionDate || job.assignedSupervisorUserId || job.assignedTeamLabel) && <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-500 border-t border-slate-100 pt-2">
                      {job.scheduledStartDate && <span className="flex items-center gap-1">
                          <CalendarClock size={11} className="text-slate-400 shrink-0" />
                          <span className="text-slate-400">Sched. Start:</span>
                          <span className="font-medium text-slate-700">
                            {(() => {
                      const [y, m, d] = job.scheduledStartDate!.split('-').map(Number);
                      return new Date(y, m - 1, d).toLocaleDateString('en-AU', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric'
                      });
                    })()}
                            {job.scheduledStartTime && <span className="ml-1 text-violet-700">{fmtJobTime(job.scheduledStartTime)}</span>}
                          </span>
                        </span>}
                      {job.expectedCompletionDate && <span className="flex items-center gap-1">
                          <CalendarCheck size={11} className="text-slate-400 shrink-0" />
                          <span className="text-slate-400">Exp. Completion:</span>
                          <span className="font-medium text-slate-700">
                            {(() => {
                      const [y, m, d] = job.expectedCompletionDate!.split('-').map(Number);
                      return new Date(y, m - 1, d).toLocaleDateString('en-AU', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric'
                      });
                    })()}
                            {job.scheduledEndTime && <span className="ml-1 text-slate-500">{fmtJobTime(job.scheduledEndTime)}</span>}
                          </span>
                        </span>}
                      {job.actualStartDate && <span className="flex items-center gap-1">
                          <CalendarClock size={11} className="text-emerald-500 shrink-0" />
                          <span className="text-slate-400">Actual Start:</span>
                          <span className="font-medium text-emerald-700">
                            {(() => {
                      const [y, m, d] = job.actualStartDate!.split('-').map(Number);
                      return new Date(y, m - 1, d).toLocaleDateString('en-AU', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric'
                      });
                    })()}
                          </span>
                        </span>}
                      {job.actualCompletionDate && <span className="flex items-center gap-1">
                          <CalendarCheck size={11} className="text-emerald-500 shrink-0" />
                          <span className="text-slate-400">Actual Completion:</span>
                          <span className="font-medium text-emerald-700">
                            {(() => {
                      const [y, m, d] = job.actualCompletionDate!.split('-').map(Number);
                      return new Date(y, m - 1, d).toLocaleDateString('en-AU', {
                        day: 'numeric',
                        month: 'short',
                        year: 'numeric'
                      });
                    })()}
                          </span>
                        </span>}
                      {job.assignedSupervisorUserId && <span className="flex items-center gap-1">
                          <UserCheck size={11} className="text-slate-400 shrink-0" />
                          <span className="text-slate-400">Supervisor:</span>
                          <span className="font-medium text-slate-700">
                            {teamMembers.find(m => m.userId === job.assignedSupervisorUserId)?.name ?? 'Assigned'}
                          </span>
                        </span>}
                      {job.assignedTeamLabel && <span className="flex items-center gap-1">
                          <Users size={11} className="text-slate-400 shrink-0" />
                          <span className="text-slate-400">Team:</span>
                          <span className="font-medium text-slate-700">{job.assignedTeamLabel}</span>
                        </span>}
                    </div>}
                </div>

                {/* ── Section dropdown nav (mobile + tablet — hidden on desktop) ── */}
                <div
                  className="md:hidden border-t border-gray-100"
                  data-testid="job-pill-nav"
                  ref={sectionDropdownRef}
                >
                  {/* Trigger */}
                  <button
                    type="button"
                    aria-haspopup="listbox"
                    aria-expanded={sectionOpen}
                    aria-label="Select section"
                    data-testid="job-section-trigger"
                    onClick={() => setSectionOpen(v => !v)}
                    className="w-full flex items-center gap-3 px-4 py-3 bg-white text-sm font-semibold text-slate-800 min-h-[44px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-inset"
                  >
                    {(() => {
                      const active = ALL_NAV_ITEMS.find(i => i.key === activeTab);
                      const Icon = active?.icon ?? FileText;
                      return (
                        <>
                          <Icon size={15} className="text-primary shrink-0" />
                          <span className="flex-1 text-left">{active?.label ?? 'Details'}</span>
                          {sectionOpen
                            ? <ChevronUp size={15} className="text-slate-400 shrink-0" />
                            : <ChevronDown size={15} className="text-slate-400 shrink-0" />}
                        </>
                      );
                    })()}
                  </button>

                  {/* Dropdown panel — fixed position so it escapes the sticky header */}
                  {sectionOpen && (
                    <>
                      {/* Backdrop */}
                      <div
                        className="fixed inset-0 z-40"
                        aria-hidden="true"
                        onClick={() => setSectionOpen(false)}
                      />
                      {/* Options panel — anchored below the trigger container */}
                      <div
                        role="listbox"
                        aria-label="Job sections"
                        data-testid="job-section-dropdown"
                        className="fixed left-0 right-0 z-50 bg-white border-b border-gray-200 shadow-xl overflow-y-auto"
                        style={(() => {
                          const rect = sectionDropdownRef.current?.getBoundingClientRect();
                          const top = rect ? rect.bottom : 156;
                          const maxH = `calc(100dvh - ${top}px - 16px)`;
                          return { top, maxHeight: maxH };
                        })()}
                      >
                        {NAV_GROUPS.map(group => (
                          <div key={group.label}>
                            <p className="px-4 pt-3 pb-1 text-[10px] font-bold uppercase tracking-widest text-slate-400 select-none">
                              {group.label}
                            </p>
                            {group.items.map(({ key, label, icon: Icon }) => {
                              const active = activeTab === key;
                              return (
                                <button
                                  key={key}
                                  role="option"
                                  aria-selected={active}
                                  data-testid={`job-pill-${key}`}
                                  onClick={() => switchTab(key)}
                                  className={[
                                    'w-full flex items-center gap-3 px-4 min-h-[44px] text-sm font-medium transition-colors',
                                    'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary',
                                    active
                                      ? 'bg-violet-50 text-violet-700'
                                      : 'text-slate-700 hover:bg-slate-50 active:bg-slate-100',
                                  ].join(' ')}
                                >
                                  <Icon
                                    size={15}
                                    className={active ? 'text-violet-600 shrink-0' : 'text-slate-400 shrink-0'}
                                  />
                                  <span className="flex-1 text-left">{label}</span>
                                  {active && <Check size={14} className="text-violet-600 shrink-0 mr-1" />}
                                </button>
                              );
                            })}
                          </div>
                        ))}
                        <div className="h-3" aria-hidden="true" />
                      </div>
                    </>
                  )}
                </div>
              </div>{/* end sticky wrapper */}

              {/* ── Two-column layout: side nav + content ── */}
              <div className="flex flex-1 min-h-0">

                {/* ── Left side nav (desktop only) ── */}
                <aside className="op-side-nav hidden md:flex flex-col">
                  <nav className="flex flex-col">
                    {NAV_GROUPS.map(group => <div key={group.label}>
                        <p className="op-side-nav-group-label">{group.label}</p>
                        <div className="flex flex-col">
                          {group.items.map(({
                      key,
                      label,
                      icon: Icon
                    }) => <button key={key} onClick={() => switchTab(key)} className={`op-side-nav-item ${activeTab === key ? 'active' : ''}`}>
                              <Icon size={13} className="shrink-0" />
                              {label}
                            </button>)}
                        </div>
                      </div>)}
                  </nav>
                </aside>

                {/* ── Content area ── */}
                {/* pb-24 on mobile reserves space above the bottom safe area */}
                <div className="flex-1 p-4 md:p-6 pb-24 md:pb-6 min-w-0">

                  {/* Save error */}
                  {saveError && <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-4 py-2.5 text-sm text-red-700 mb-4">
                      <AlertCircle size={14} className="shrink-0" />
                      {saveError}
                    </div>}

                  {/* ── Details dashboard ── */}
                  {activeTab === 'details' && <JobDetailsDashboard job={job} summary={jobSummary} costSummary={costSummary} linkedCustomer={linkedCustomer} linkedAssetId={linkedAssetId} linkedAssetName={linkedAssetName} teamMembers={teamMembers} editing={editing} saving={saving} saveError={saveError} form={form} editingCustomer={editingCustomer} editingAssetId={editingAssetId} JOB_STATUSES={JOB_STATUSES} onEdit={() => setEditing(true)} onCancelEdit={() => {
                setEditing(false);
                setSaveError('');
              }} onSave={handleSave} onFormChange={patch => setForm(f => ({
                ...f,
                ...patch
              }))} onTabSwitch={tab => switchTab(tab as Tab)} CustomerSelector={CustomerSelectorWrapper} AssetSelector={AssetSelectorWrapper} onEditingCustomerChange={setEditingCustomer} onEditingAssetIdChange={(id, name) => {
                setEditingAssetId(id);
                if (name !== null && name !== undefined) setLinkedAssetName(name);
              }} workSingular={workSingular} />}

                  {/* ── Photos — embedded in tab panel ── */}
                  {activeTab === 'photos' && <JobPhotosTab jobId={job.id} jobName={job.name} />}
                  {/* ── Drawings ── */}
                  {activeTab === 'drawings' && <JobPlanManagerTab jobId={job.id} jobName={job.name} />}

                  {/* ── To-do removed — use Notes tab (Tagged Actions) instead ── */}

                  {/* ── Tasks ── */}
                  {activeTab === 'tasks' && <JobTodos jobId={job.id} />}

                  {/* ── Delays ── */}
                  {activeTab === 'delays' && <JobDelays jobId={job.id} />}

                  {/* ── Notes ── */}
                  {activeTab === 'notes' && <NotesPanel entityType="job" entityId={job.id} entityLabel={job.name} userRole={userRole} />}

                  {/* ── Estimates ── */}
                  {activeTab === 'estimates' && <JobEstimates jobId={job.id} />}

                  {/* ── Progress ── */}
                  {activeTab === 'progress' && <JobProgress jobId={job.id} />}

                  {/* ── Forms ── */}
                  {activeTab === 'forms' && <JobForms jobId={job.id} userRole={userRole} job={job} initialFormInstanceId={formInstanceId ? parseInt(formInstanceId, 10) : undefined} />}

                  {/* ── Safety ── */}
                  {activeTab === 'safety' && <JobSafety jobId={job.id} />}

                  {/* ── Costs ── */}
                  {activeTab === 'costs' && <JobCosts jobId={job.id} />}

                  {/* ── Invoices ── */}
                  {activeTab === 'invoices' && <JobInvoices jobId={job.id} job={job} />}

                  {/* ── Purchase Orders ── */}
                  {activeTab === 'purchase-orders' && <JobPurchaseOrders jobId={job.id} />}

                  {/* ── Files ── */}
                  {activeTab === 'files' && <div className="bg-white rounded-xl border border-border">
                      <FilePanel jobId={job.id} />
                    </div>}

                  {/* ── Attendance ── */}
                  {activeTab === 'attendance' && <JobAttendanceTab jobId={job.id} jobName={job.name} />}

                </div>
              </div>
            </motion.div>}
        </div>
      </div>

      {/* ── Email compose modal ── */}
      {showEmailModal && emailDefaults && job && <SendDocumentEmailModal endpoint={`/api/jobs/${job.id}/send-email`} documentLabel="Job correspondence" documentType="job" documentId={job.id} documentName={job.jobNumber ? `${job.jobNumber} — ${job.name}` : job.name} defaultTo={emailDefaults.to} defaultSubject={emailDefaults.subject} defaultMessage={emailDefaults.message} job={emailDefaults.job} jobId={job.id} onSuccess={handleEmailSuccess} onClose={() => {
      setShowEmailModal(false);
      setEmailDefaults(null);
    }} />}

      {/* ── Email sent toasts ── */}
      <EmailToastContainer toasts={emailToasts} onDismiss={dismissToast} />
    </div>;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtJobTime(timeStr: string | null | undefined): string {
  if (!timeStr) return '';
  const [hStr, mStr] = timeStr.split(':');
  const h = parseInt(hStr, 10);
  const m = mStr ?? '00';
  const ampm = h < 12 ? 'am' : 'pm';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${m}${ampm}`;
}
