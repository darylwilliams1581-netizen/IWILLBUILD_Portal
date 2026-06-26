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
} from 'lucide-react';
import PortalSidebar from '@/components/PortalSidebar';
import JobPhotos from '@/components/JobPhotos';
import JobEstimates from '@/components/JobEstimates';
import FilePanel from '@/components/FilePanel';
import JobNotes from '@/components/job/JobNotes';
import JobTodos from '@/components/job/JobTodos';
import JobProgress from '@/components/job/JobProgress';
import JobForms from '@/components/job/JobForms';
import { fetchJob, updateJob, getStatusStyle, JOB_STATUSES, type Job } from '@/lib/jobs-api';

type Tab = 'details' | 'estimates' | 'progress' | 'todos' | 'photos' | 'files' | 'forms' | 'notes';

export default function JobDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const [job, setJob] = useState<Job | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [statusOpen, setStatusOpen] = useState(false);
  const [userRole, setUserRole] = useState<string>('');
  const [formRunnerActive, setFormRunnerActive] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>(() => {
    const t = searchParams.get('tab');
    if (t === 'photos' || t === 'estimates' || t === 'files' || t === 'notes' || t === 'todos' || t === 'progress' || t === 'forms') return t;
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
  });

  useEffect(() => {
    if (id) loadJob(parseInt(id, 10));
    // Fetch user role for permission checks
    fetch('/api/me', { credentials: 'include' })
      .then((r) => r.json())
      .then((d: { profile?: { role?: string } }) => { if (d.profile?.role) setUserRole(d.profile.role); })
      .catch(() => {});
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
      });
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
      });
      setJob(updated);
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
    <div className="flex h-screen bg-[#F4F5F7] overflow-hidden">
      <Helmet>
        <title>{job ? `${job.jobNumber ?? job.name} — IWILLBUILD` : 'Job — IWILLBUILD'}</title>
        <meta name="description" content={job ? `Job details for ${job.name}${job.client ? ` — ${job.client}` : ''}` : 'Job details — IWILLBUILD Portal'} />
        <link rel="canonical" href={`https://iwillbuild.com/jobs/${id}`} />
        <meta name="robots" content="noindex" />
      </Helmet>

      <PortalSidebar />

      <div className="flex-1 flex flex-col overflow-hidden min-w-0">
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
        <div className={`flex-1 min-h-0 ${formRunnerActive ? 'overflow-hidden flex flex-col' : 'overflow-y-auto p-4 md:p-6'}`}>

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
              <button onClick={() => navigate('/jobs')} className="ml-auto font-semibold underline">Back to Jobs</button>
            </div>
          )}

          {job && (
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, ease: 'easeOut' as const }}
              className={formRunnerActive ? 'flex-1 min-h-0 flex flex-col' : 'max-w-2xl flex flex-col gap-4'}
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

                {/* Quick status change */}
                <div className="relative">
                  <button
                    onClick={() => setStatusOpen(!statusOpen)}
                    className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground hover:text-foreground border border-border rounded-lg px-3 py-1.5 hover:bg-muted transition-colors"
                  >
                    Change Status <ChevronDown size={12} />
                  </button>
                  {statusOpen && (
                    <>
                      <div className="fixed inset-0 z-10" onClick={() => setStatusOpen(false)} />
                      <div className="absolute right-0 top-full mt-1 bg-white border border-border rounded-xl shadow-lg z-20 py-1 min-w-[200px] max-h-72 overflow-y-auto">
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
              <div className="flex flex-wrap gap-1 bg-white rounded-xl border border-border p-1">
                {([
                  { key: 'details',   label: 'Details',   icon: FileText },
                  { key: 'estimates', label: 'Estimates', icon: Calculator },
                  { key: 'progress',  label: 'Progress',  icon: TrendingUp },
                  { key: 'todos',     label: 'To-do',     icon: CheckSquare },
                  { key: 'photos',    label: 'Photos',    icon: Camera },
                  { key: 'files',     label: 'Files',     icon: FolderOpen },
                  { key: 'forms',     label: 'Forms',     icon: ClipboardList },
                  { key: 'notes',     label: 'Notes',     icon: StickyNote },
                ] as const).map(({ key, label, icon: Icon }) => (
                  <button
                    key={key}
                    onClick={() => { setActiveTab(key); if (key !== 'forms') setFormRunnerActive(false); }}
                    className={`flex-1 flex items-center justify-center gap-1.5 py-2 px-2 rounded-lg text-xs font-semibold transition-colors min-w-[60px] ${
                      activeTab === key
                        ? 'bg-slate-900 text-white'
                        : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <Icon size={13} />
                    <span className="hidden sm:inline">{label}</span>
                  </button>
                ))}
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
                  <h2 className="font-heading font-bold text-sm text-muted-foreground uppercase tracking-wider">Job Details</h2>

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
                        <label className="block text-xs font-semibold mb-1.5">Client Name</label>
                        <input
                          type="text"
                          value={form.client}
                          onChange={(e) => setForm((f) => ({ ...f, client: e.target.value }))}
                          className="w-full px-3 py-2.5 border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors"
                        />
                      </div>
                      <div>
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
                    </div>
                  ) : (
                    <div className="flex flex-col gap-3">
                      <DetailRow icon={HardHat} label="Job Title" value={job.name} />
                      {job.jobNumber && <DetailRow icon={FileText} label="Job Number" value={job.jobNumber} mono />}
                      {job.client && <DetailRow icon={User} label="Client" value={job.client} />}
                      {job.address && <DetailRow icon={MapPin} label="Site Address" value={job.address} />}
                      <DetailRow
                        icon={Calendar}
                        label="Created"
                        value={new Date(job.createdAt).toLocaleDateString('en-AU', {
                          weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
                        })}
                      />
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

              {/* ── Details quick camera card ── */}

              {/* ── Photos tab ── */}
              {activeTab === 'photos' && (
                <JobPhotos jobId={job.id} />
              )}

              {/* ── Estimates tab ── */}
              {activeTab === 'estimates' && (
                <JobEstimates jobId={job.id} />
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

              {/* ── Progress tab ── */}
              {activeTab === 'progress' && (
                <JobProgress jobId={job.id} />
              )}

              {/* ── Forms tab ── */}
              {activeTab === 'forms' && (
                <div className={formRunnerActive ? 'flex-1 min-h-0 flex flex-col overflow-hidden' : undefined}>
                  <JobForms jobId={job.id} userRole={userRole} onRunnerActive={setFormRunnerActive} />
                </div>
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
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="p-1.5 rounded-md bg-muted shrink-0 mt-0.5">
        <Icon size={13} className="text-muted-foreground" />
      </div>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className={`text-sm font-medium text-foreground ${mono ? 'font-mono' : ''}`}>{value}</p>
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
