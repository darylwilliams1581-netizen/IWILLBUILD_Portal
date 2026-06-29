import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate, useSearchParams, Link } from 'react-router-dom';
import { motion } from 'motion/react';
import { Helmet } from '@dr.pogodin/react-helmet';
import {
  HardHat,
  ChevronLeft,
  Edit2,
  Check,
  X,
  MapPin,
  User,
  Calendar,
  FileText,
  Loader2,
  AlertCircle,
  Menu,
  ChevronDown,
  Camera,
  Calculator,
  FolderOpen,
  StickyNote,
  CheckSquare,
  TrendingUp,
  Upload,
  ClipboardList,
  ShieldAlert,
  Receipt,
  Clock,
  UserCheck,
  Phone,
  Mail,
  ExternalLink,
  DollarSign,
  Users,
  CalendarCheck,
  CalendarClock,
} from 'lucide-react';
import PortalSidebar from '@/components/PortalSidebar';
import JobPhotos from '@/components/JobPhotos';
import JobEstimates from '@/components/JobEstimates';
import FilePanel from '@/components/FilePanel';
import JobNotes from '@/components/job/JobNotes';
import JobTodos from '@/components/job/JobTodos';
import JobProgress from '@/components/job/JobProgress';
import JobForms from '@/components/job/JobForms';
import JobSafety from '@/components/job/JobSafety';
import JobCosts from '@/components/job/JobCosts';
import JobDelays from '@/components/job/JobDelays';
import JobInvoices from '@/components/job/JobInvoices';
import CustomerSelector from '@/components/CustomerSelector';
import { fetchJob, updateJob, getStatusStyle, JOB_STATUSES, type Job } from '@/lib/jobs-api';
import { fetchCustomer, type Customer } from '@/lib/customers-api';
import { useTerminology } from '@/lib/useTerminology';

type Tab = 'details' | 'estimates' | 'costs' | 'invoices' | 'progress' | 'todos' | 'delays' | 'photos' | 'files' | 'forms' | 'notes' | 'safety';

export default function JobDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { workSingular, workPlural } = useTerminology();

  const [job, setJob] = useState<Job | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [statusOpen, setStatusOpen] = useState(false);
  const [userRole, setUserRole] = useState<string>('');
  const [formRunnerActive, setFormRunnerActive] = useState(false);
  const [costSummary, setCostSummary] = useState<{ actual: number; approved: number } | null>(null);
  const [linkedCustomer, setLinkedCustomer] = useState<Customer | null>(null);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [activeTab, setActiveTab] = useState<Tab>(() => {
    const t = searchParams.get('tab');
    if (t === 'photos' || t === 'estimates' || t === 'costs' || t === 'invoices' || t === 'files' || t === 'notes' || t === 'todos' || t === 'delays' || t === 'progress' || t === 'forms' || t === 'safety') return t as Tab;
    return 'details';
  });

  // Edit form state
  const [form, setForm] = useState({
    name: '',
    jobNumber: '',
    client: '',
    address: '',
    status: '',
    notes: '',
    scheduledStartDate: '',
    expectedCompletionDate: '',
    actualStartDate: '',
    actualCompletionDate: '',
    assignedSupervisorUserId: '',
    assignedTeamLabel: '',
  });
  useEffect(() => {
    if (id) loadJob(parseInt(id, 10));
    // Fetch user role for permission checks
    fetch('/api/me', { credentials: 'include' })
      .then((r) => r.json())
      .then((d: { profile?: { role?: string } }) => { if (d.profile?.role) setUserRole(d.profile.role); })
      .catch(() => {});
    // Fetch cost summary for header bar
    if (id) {
      fetch(`/api/jobs/${id}/costs`, { credentials: 'include' })
        .then((r) => r.json())
        .then((d: { costs?: Array<{ amount: string | number }>; approvedTotal?: number }) => {
          const actual = (d.costs ?? []).reduce((s, c) => s + parseFloat(String(c.amount ?? 0)), 0);
          setCostSummary({ actual, approved: d.approvedTotal ?? 0 });
        })
        .catch(() => {});
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
        expectedCompletionDate: data.expectedCompletionDate ?? '',
        actualStartDate: data.actualStartDate ?? '',
        actualCompletionDate: data.actualCompletionDate ?? '',
        assignedSupervisorUserId: data.assignedSupervisorUserId ?? '',
        assignedTeamLabel: data.assignedTeamLabel ?? '',
      });
      // Load linked customer if present
      if (data.customerId) {
        fetchCustomer(data.customerId)
          .then(({ customer }) => { setLinkedCustomer(customer); setEditingCustomer(customer); })
          .catch(() => {});
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
    if (!form.name.trim()) { setSaveError('Job title is required'); return; }
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
        scheduledStartDate: form.scheduledStartDate || null,
        expectedCompletionDate: form.expectedCompletionDate || null,
        actualStartDate: form.actualStartDate || null,
        actualCompletionDate: form.actualCompletionDate || null,
        assignedSupervisorUserId: form.assignedSupervisorUserId || null,
        assignedTeamLabel: form.assignedTeamLabel.trim() || null,
      });
      setJob(updated);
      setLinkedCustomer(editingCustomer);
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
    });
    setEditingCustomer(linkedCustomer);
    setSaveError('');
    setEditing(false);
  }

  async function handleStatusChange(newStatus: string) {
    if (!job) return;
    setStatusOpen(false);
    try {
      const updated = await updateJob(job.id, { status: newStatus });
      setJob(updated);
      setForm((f) => ({ ...f, status: newStatus }));
    } catch {
      // silent — status badge will revert on next load
    }
  }

  function openMobileMenu() {
    window.dispatchEvent(new Event('portal:open-menu'));
  }

  const statusStyle = job ? getStatusStyle(job.status) : null;

  return (
    <div className="portal-page">
      <Helmet>
        <title>{job ? `${job.jobNumber ?? job.name} — IWILLBUILD` : 'Job — IWILLBUILD'}</title>
        <meta name="description" content={job ? `Job details for ${job.name}${job.client ? ` — ${job.client}` : ''}` : 'Job details — IWILLBUILD Portal'} />
        <link rel="canonical" href={`https://iwillbuild.com/jobs/${id}`} />
        <meta name="robots" content="noindex" />
      </Helmet>

      <PortalSidebar />

      <div className="portal-main">
        {/* Top bar */}
        <header className="h-16 bg-white border-b border-border flex items-center justify-between px-4 md:px-6 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <button
              onClick={openMobileMenu}
              className="md:hidden p-2 -ml-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors shrink-0"
            >
              <Menu size={20} />
            </button>
            <Link
              to="/jobs"
              className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors text-sm shrink-0"
            >
              <ChevronLeft size={16} />
              <span className="hidden sm:inline">Jobs</span>
            </Link>
            <span className="text-border">|</span>
            <HardHat size={16} className="text-primary shrink-0" />
            <h1 className="font-heading font-bold text-sm md:text-base truncate">
              {job ? (job.jobNumber ? `${job.jobNumber} — ${job.name}` : job.name) : 'Loading…'}
            </h1>
          </div>
          {job && !editing && (
            <button
              onClick={() => setEditing(true)}
              className="flex items-center gap-2 text-sm font-semibold text-primary hover:bg-orange-50 px-3 py-1.5 rounded-lg transition-colors shrink-0"
            >
              <Edit2 size={14} />
              <span className="hidden sm:inline">Edit</span>
            </button>
          )}
          {editing && (
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={handleCancel}
                disabled={saving}
                className="flex items-center gap-1.5 text-sm font-semibold text-muted-foreground hover:text-foreground px-3 py-1.5 rounded-lg hover:bg-muted transition-colors"
              >
                <X size={14} />
                <span className="hidden sm:inline">Cancel</span>
              </button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-1.5 text-sm font-bold bg-primary hover:bg-orange-600 text-white px-3 py-1.5 rounded-lg transition-colors disabled:opacity-60"
              >
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                <span className="hidden sm:inline">Save</span>
              </button>
            </div>
          )}
        </header>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 md:p-6">

          {/* Loading */}
          {loading && (
            <div className="flex items-center justify-center py-20">
              <Loader2 size={24} className="animate-spin text-primary" />
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="flex items-center gap-3 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700 max-w-lg">
              <AlertCircle size={16} className="shrink-0" />
              {error}
              <button onClick={() => navigate('/jobs')} className="ml-auto font-semibold underline">Back to {workPlural}</button>
            </div>
          )}

          {job && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, ease: 'easeOut' as const }}
              className={formRunnerActive ? 'max-w-2xl flex flex-col gap-4' : 'max-w-2xl flex flex-col gap-4'}
            >
              {/* Status bar */}
              <div className="bg-white rounded-xl border border-border p-4 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  {statusStyle && (
                    <span className={`inline-flex items-center gap-1.5 text-sm font-bold px-3 py-1 rounded-full border ${statusStyle.bg} ${statusStyle.color}`}>
                      <span className={`w-2 h-2 rounded-full ${statusStyle.dot}`} />
                      {job.status}
                    </span>
                  )}
                  <span className="text-xs text-muted-foreground">
                    Updated {new Date(job.updatedAt).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}
                  </span>
                </div>

                {/* Cost mini-summary */}
                {costSummary && (costSummary.actual > 0 || costSummary.approved > 0) && (
                  <button
                    onClick={() => setActiveTab('costs')}
                    className="hidden sm:flex items-center gap-3 text-xs border border-slate-200 rounded-lg px-3 py-1.5 hover:bg-slate-50 transition-colors"
                  >
                    <span className="text-slate-500">Costs</span>
                    <span className="font-bold text-slate-800">${costSummary.actual.toLocaleString('en-AU', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}</span>
                    {costSummary.approved > 0 && (
                      <>
                        <span className="text-slate-300">/</span>
                        <span className={`font-semibold ${costSummary.actual > costSummary.approved ? 'text-red-600' : 'text-emerald-600'}`}>
                          {costSummary.actual > costSummary.approved ? '⚠ Over' : `${((costSummary.actual / costSummary.approved) * 100).toFixed(0)}%`}
                        </span>
                      </>
                    )}
                    <Receipt size={11} className="text-slate-400" />
                  </button>
                )}

                {/* Quick status change */}
                <div className="relative shrink-0">
                  <button
                    onClick={() => setStatusOpen(!statusOpen)}
                    className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground border border-border rounded-lg px-3 py-1.5 hover:bg-muted transition-colors"
                  >
                    Change Status <ChevronDown size={12} />
                  </button>
                  {statusOpen && (
                    <>
                      <div className="fixed inset-0 z-40" onClick={() => setStatusOpen(false)} />
                      <div className="absolute right-0 top-full mt-1 bg-white border border-border rounded-xl shadow-xl z-50 py-1 min-w-[200px] max-h-72 overflow-y-auto">
                        {JOB_STATUSES.map((s) => {
                          const st = getStatusStyle(s);
                          return (
                            <button
                              key={s}
                              onClick={() => handleStatusChange(s)}
                              className={`w-full text-left px-4 py-2 text-sm flex items-center gap-2 hover:bg-muted transition-colors ${job.status === s ? 'font-bold' : ''}`}
                            >
                              <span className={`w-2 h-2 rounded-full shrink-0 ${st.dot}`} />
                              {s}
                              {job.status === s && <Check size={12} className="ml-auto text-primary" />}
                            </button>
                          );
                        })}
                      </div>
                    </>
                  )}
                </div>
              </div>

              {/* Tabs */}
              <div className="scroll-x-hide bg-white rounded-xl border border-border p-1">
                <div className="flex gap-1 min-w-max">
                {([
                  { key: 'details',   label: 'Details',   icon: FileText },
                  { key: 'estimates', label: 'Estimates', icon: Calculator },
                  { key: 'costs',     label: 'Costs',     icon: Receipt },
                  { key: 'invoices',  label: 'Invoices',  icon: DollarSign },
                  { key: 'progress',  label: 'Progress',  icon: TrendingUp },
                  { key: 'todos',     label: 'To-do',     icon: CheckSquare },
                  { key: 'delays',    label: 'Delays',    icon: Clock },
                  { key: 'photos',    label: 'Photos',    icon: Camera },
                  { key: 'files',     label: 'Files',     icon: FolderOpen },
                  { key: 'forms',     label: 'Forms',     icon: ClipboardList },
                  { key: 'safety',    label: 'Safety',    icon: ShieldAlert },
                  { key: 'notes',     label: 'Notes',     icon: StickyNote },
                ] as const).map(({ key, label, icon: Icon }) => (
                  <button
                    key={key}
                    onClick={() => { setActiveTab(key); setStatusOpen(false); if (key !== 'forms') setFormRunnerActive(false); }}
                    className={`flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
                      activeTab === key
                        ? 'bg-slate-900 text-white'
                        : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <Icon size={13} />
                    <span>{label}</span>
                  </button>
                ))}
                </div>
              </div>

              {/* Save error */}
              {saveError && (
                <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-4 py-2.5 text-sm text-red-700">
                  <AlertCircle size={14} className="shrink-0" />
                  {saveError}
                </div>
              )}

              {/* ── Details tab ── */}
              {activeTab === 'details' && (
                <QuickCameraCard jobId={job.id} onPhotoTab={() => setActiveTab('photos')} />
              )}

              {activeTab === 'details' && (
                <div className="bg-white rounded-xl border border-border p-5 flex flex-col gap-4">
                  <h2 className="font-heading font-bold text-sm text-muted-foreground uppercase tracking-wider">{workSingular} Details</h2>

                  {editing ? (
                    <div className="flex flex-col gap-4">
                      <div>
                        <label className="block text-xs font-semibold mb-1.5">Job Title <span className="text-red-500">*</span></label>
                        <input
                          type="text"
                          value={form.name}
                          onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                          className="w-full px-3 py-2.5 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-semibold mb-1.5">Job Number</label>
                          <input
                            type="text"
                            value={form.jobNumber}
                            onChange={(e) => setForm((f) => ({ ...f, jobNumber: e.target.value }))}
                            className="w-full px-3 py-2.5 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-semibold mb-1.5">Status</label>
                          <select
                            value={form.status}
                            onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
                            className="w-full px-3 py-2.5 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors bg-white"
                          >
                            {JOB_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                          </select>
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs font-semibold mb-1.5">Link Customer <span className="text-muted-foreground font-normal">(optional)</span></label>
                        <CustomerSelector
                          value={editingCustomer}
                          onChange={(c) => {
                            setEditingCustomer(c);
                            if (c && !form.client) setForm((f) => ({ ...f, client: c.name }));
                          }}
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold mb-1.5">Client Name</label>
                        <input
                          type="text"
                          value={form.client}
                          onChange={(e) => setForm((f) => ({ ...f, client: e.target.value }))}
                          className="w-full px-3 py-2.5 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors"
                        />
                      </div>                      <div>
                        <label className="block text-xs font-semibold mb-1.5">Site Address / Suburb</label>
                        <input
                          type="text"
                          value={form.address}
                          onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
                          className="w-full px-3 py-2.5 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-semibold mb-1.5">Description / Notes</label>
                        <textarea
                          value={form.notes}
                          onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                          rows={4}
                          className="w-full px-3 py-2.5 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors resize-none"
                        />
                      </div>

                      {/* ── Schedule ── */}
                      <div className="pt-2 border-t border-border">
                        <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider mb-3">Schedule</p>
                        <div className="grid grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs font-semibold mb-1.5">Scheduled Start</label>
                            <input
                              type="date"
                              value={form.scheduledStartDate}
                              onChange={(e) => setForm((f) => ({ ...f, scheduledStartDate: e.target.value }))}
                              className="w-full px-3 py-2.5 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-semibold mb-1.5">Expected Completion</label>
                            <input
                              type="date"
                              value={form.expectedCompletionDate}
                              onChange={(e) => setForm((f) => ({ ...f, expectedCompletionDate: e.target.value }))}
                              className="w-full px-3 py-2.5 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-semibold mb-1.5">Actual Start</label>
                            <input
                              type="date"
                              value={form.actualStartDate}
                              onChange={(e) => setForm((f) => ({ ...f, actualStartDate: e.target.value }))}
                              className="w-full px-3 py-2.5 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-semibold mb-1.5">Actual Completion</label>
                            <input
                              type="date"
                              value={form.actualCompletionDate}
                              onChange={(e) => setForm((f) => ({ ...f, actualCompletionDate: e.target.value }))}
                              className="w-full px-3 py-2.5 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors"
                            />
                          </div>
                        </div>
                        <div className="mt-3">
                          <label className="block text-xs font-semibold mb-1.5">Team / Crew Label</label>
                          <input
                            type="text"
                            value={form.assignedTeamLabel}
                            onChange={(e) => setForm((f) => ({ ...f, assignedTeamLabel: e.target.value }))}
                            placeholder="e.g. Crew A, Framing Team"
                            className="w-full px-3 py-2.5 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors"
                          />
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-3">
                      <DetailRow icon={HardHat} label="Job Title" value={job.name} />
                      {job.jobNumber && <DetailRow icon={FileText} label="Job Number" value={job.jobNumber} mono />}
                      {job.client && <DetailRow icon={User} label="Client" value={job.client} />}
                      {job.address && (
                        <DetailRow
                          icon={MapPin}
                          label="Site Address"
                          value={job.address}
                          href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(job.address)}`}
                        />
                      )}
                      <DetailRow
                        icon={Calendar}
                        label="Created"
                        value={new Date(job.createdAt).toLocaleDateString('en-AU', {
                          weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
                        })}
                      />

                      {/* ── Schedule fields (view mode) ── */}
                      {(job.scheduledStartDate || job.expectedCompletionDate || job.actualStartDate || job.actualCompletionDate || job.assignedTeamLabel) && (
                        <div className="pt-2 border-t border-border flex flex-col gap-3">
                          <p className="text-xs font-bold text-muted-foreground uppercase tracking-wider">Schedule</p>
                          {job.scheduledStartDate && (
                            <DetailRow
                              icon={CalendarClock}
                              label="Scheduled Start"
                              value={new Date(job.scheduledStartDate).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })}
                            />
                          )}
                          {job.expectedCompletionDate && (
                            <DetailRow
                              icon={CalendarCheck}
                              label="Expected Completion"
                              value={new Date(job.expectedCompletionDate).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })}
                            />
                          )}
                          {job.actualStartDate && (
                            <DetailRow
                              icon={CalendarClock}
                              label="Actual Start"
                              value={new Date(job.actualStartDate).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })}
                            />
                          )}
                          {job.actualCompletionDate && (
                            <DetailRow
                              icon={CalendarCheck}
                              label="Actual Completion"
                              value={new Date(job.actualCompletionDate).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })}
                            />
                          )}
                          {job.assignedTeamLabel && (
                            <DetailRow icon={Users} label="Team / Crew" value={job.assignedTeamLabel} />
                          )}
                        </div>
                      )}
                      {job.notes && (
                        <div className="pt-2 border-t border-border">
                          <p className="text-xs font-semibold text-muted-foreground mb-1.5">Notes</p>
                          <p className="text-sm text-foreground whitespace-pre-wrap">{job.notes}</p>
                        </div>
                      )}
                      {!job.client && !job.address && !job.notes && (
                        <p className="text-sm text-muted-foreground italic">
                          No additional details. Click Edit to add client, address, and notes.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* ── Linked customer card (view mode only) ── */}
              {activeTab === 'details' && !editing && linkedCustomer && (
                <div className="bg-white rounded-xl border border-border p-5">
                  <div className="flex items-center justify-between mb-3">
                    <h2 className="font-heading font-bold text-sm text-muted-foreground uppercase tracking-wider">Linked Customer</h2>
                    <Link
                      to={`/customers/${linkedCustomer.id}`}
                      className="flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
                    >
                      Open Customer <ExternalLink size={11} />
                    </Link>
                  </div>
                  <div className="flex items-start gap-3">
                    <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                      <span className="text-primary font-black text-sm">{linkedCustomer.name[0].toUpperCase()}</span>
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-bold text-sm text-foreground">{linkedCustomer.name}</p>
                      {linkedCustomer.contact_person && (
                        <p className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5"><User size={10} />{linkedCustomer.contact_person}</p>
                      )}
                      <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1">
                        {linkedCustomer.phone && (
                          <a href={`tel:${linkedCustomer.phone}`} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors"><Phone size={10} />{linkedCustomer.phone}</a>
                        )}
                        {linkedCustomer.mobile && (
                          <a href={`tel:${linkedCustomer.mobile}`} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors"><Phone size={10} />{linkedCustomer.mobile}</a>
                        )}
                        {linkedCustomer.email && (
                          <a href={`mailto:${linkedCustomer.email}`} className="flex items-center gap-1 text-xs text-muted-foreground hover:text-primary transition-colors"><Mail size={10} />{linkedCustomer.email}</a>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* ── Details quick camera card ── */}

              {/* ── Photos tab ── */}
              {activeTab === 'photos' && (
                <JobPhotos jobId={job.id} />
              )}

              {/* ── Estimates tab ── */}
              {activeTab === 'estimates' && (
                <JobEstimates jobId={job.id} />
              )}

              {/* ── Costs tab ── */}
              {activeTab === 'costs' && (
                <JobCosts jobId={job.id} />
              )}

              {/* ── Files tab ── */}
              {activeTab === 'files' && (
                <div className="bg-white rounded-xl border border-border">
                  <FilePanel jobId={job.id} />
                </div>
              )}

              {/* ── Notes tab ── */}
              {activeTab === 'notes' && (
                <JobNotes jobId={job.id} initialNotes={job.notes ?? null} />
              )}

              {/* ── To-do tab ── */}
              {activeTab === 'todos' && (
                <JobTodos jobId={job.id} />
              )}

              {/* ── Delays tab ── */}
              {activeTab === 'delays' && (
                <JobDelays jobId={job.id} />
              )}

              {/* ── Progress tab ── */}
              {activeTab === 'progress' && (
                <JobProgress jobId={job.id} />
              )}

              {/* ── Forms tab ── */}
              {activeTab === 'forms' && (
                <div>
                  <JobForms jobId={job.id} userRole={userRole} job={job} onRunnerActive={setFormRunnerActive} />
                </div>
              )}

              {/* ── Safety tab ── */}
              {activeTab === 'safety' && (
                <JobSafety jobId={job.id} />
              )}

              {/* ── Invoices tab ── */}
              {activeTab === 'invoices' && (
                <JobInvoices jobId={job.id} job={job} />
              )}

            </motion.div>
          )}
        </div>
      </div>
    </div>
  );
}

function DetailRow({
  icon: Icon,
  label,
  value,
  mono = false,
  href,
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  mono?: boolean;
  href?: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="p-1.5 rounded-md bg-muted shrink-0 mt-0.5">
        <Icon size={13} className="text-muted-foreground" />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        {href ? (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className={`text-sm font-medium text-primary underline underline-offset-2 hover:text-orange-600 transition-colors ${mono ? 'font-mono' : ''}`}
          >
            {value}
          </a>
        ) : (
          <p className={`text-sm font-medium text-foreground ${mono ? 'font-mono' : ''}`}>{value}</p>
        )}
      </div>
    </div>
  );
}

// ── Quick camera card shown on Details tab ────────────────────────────────────

function QuickCameraCard({ jobId, onPhotoTab }: { jobId: number; onPhotoTab: () => void }) {
  const cameraRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadMsg, setUploadMsg] = useState('');

  async function doUpload(files: FileList | null) {
    if (!files || files.length === 0) return;
    const arr = Array.from(files);
    // Reject HEIC
    for (const f of arr) {
      const ext = f.name.split('.').pop()?.toLowerCase() ?? '';
      if (ext === 'heic' || ext === 'heif') {
        setUploadMsg('HEIC/HEIF not supported — convert to JPEG first.');
        return;
      }
    }
    setUploading(true);
    setUploadMsg('');
    const fd = new FormData();
    arr.forEach((f) => fd.append('photos', f));
    try {
      const res = await fetch(`/api/jobs/${jobId}/photos`, {
        method: 'POST',
        credentials: 'include',
        body: fd,
      });
      const data = await res.json() as { error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Upload failed');
      setUploadMsg(`${arr.length} photo${arr.length !== 1 ? 's' : ''} uploaded`);
      setTimeout(() => setUploadMsg(''), 3000);
    } catch (e) {
      setUploadMsg(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setUploading(false);
      if (cameraRef.current) cameraRef.current.value = '';
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  return (
    <div className="bg-white rounded-xl border border-border p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="font-heading font-bold text-sm text-muted-foreground uppercase tracking-wider">Photos</h2>
        <button
          onClick={onPhotoTab}
          className="text-xs font-semibold text-primary hover:underline"
        >
          View all →
        </button>
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <button
          onClick={() => cameraRef.current?.click()}
          disabled={uploading}
          className="flex items-center gap-2 bg-primary hover:bg-orange-600 disabled:opacity-50 text-white text-sm font-bold px-4 py-2.5 rounded-xl transition-colors shadow-sm"
        >
          {uploading ? <Loader2 size={15} className="animate-spin" /> : <Camera size={15} />}
          {uploading ? 'Uploading…' : 'Take Photo'}
        </button>
        <button
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="flex items-center gap-2 bg-slate-100 hover:bg-slate-200 disabled:opacity-50 text-slate-700 text-sm font-semibold px-4 py-2.5 rounded-xl transition-colors"
        >
          <Upload size={15} />
          Upload
        </button>
        {uploadMsg && (
          <span className={`text-xs font-semibold ${uploadMsg.includes('uploaded') ? 'text-emerald-600' : 'text-red-600'}`}>
            {uploadMsg}
          </span>
        )}
      </div>
      <input
        ref={cameraRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        capture="environment"
        className="hidden"
        onChange={(e) => doUpload(e.target.files)}
      />
      <input
        ref={fileRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        className="hidden"
        onChange={(e) => doUpload(e.target.files)}
      />
    </div>
  );
}
