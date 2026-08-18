import { incident_detail } from 'virtual:content';
/**
 * /incidents/:id and /incidents/new — Incident detail / create form
 * Full incident record with corrective actions and third parties.
 */
import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useNavigate, useLocation, useSearchParams } from 'react-router-dom';
import { Helmet } from '@dr.pogodin/react-helmet';
import {
  ChevronLeft, ChevronDown, AlertTriangle, Plus, Trash2, CheckCircle2,
  Lock, Loader2, Users, ClipboardCheck, X, Save,
  ShieldAlert, Home, ChevronRight, Paperclip, FileText, Image, Download, Printer,
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import {
  INCIDENT_TYPES, SEVERITY_OPTIONS, STATUS_OPTIONS,
  statusBadge,
  type Incident,
} from './incidents';
import MobileOverflowMenu from '@/components/MobileOverflowMenu';
import { useUploadQueue } from '@/hooks/useUploadQueue';
import FormSection from '@/components/FormSection';
import PhotoEditor from '@/components/PhotoEditor';
import type { JobPhoto } from '@/components/JobPhotos';
import PortalSidebar from '@/components/PortalSidebar';

// ── Types ─────────────────────────────────────────────────────────────────────

interface CorrectiveAction {
  id?: number;
  action: string;
  owner: string;
  due_date: string;
  status: 'open' | 'in progress' | 'complete';
  notes: string;
  completed_at?: string | null;
}

interface ThirdParty {
  id?: number;
  name: string;
  company_org: string;
  role_type: string;
  contact_phone: string;
  contact_email: string;
  involvement: string;
  injury_damage_alleged: boolean;
  statement_taken: boolean;
  is_witness: boolean;
}

interface Attachment {
  id: number;
  file_type: 'image' | 'pdf' | 'document';
  original_name: string;
  mime_type: string;
  size_bytes: number;
  public_url: string;
  created_at: string;
}

interface FullIncident extends Incident {
  immediate_action_taken: string | null;
  person_injured: string | null;
  medical_treatment_required: boolean | number;
  witnesses: string | null;
  notes: string | null;
  manager_sign_off: string | null;
  closed_by: string | null;
  corrective_actions: CorrectiveAction[] | null;
  third_parties: ThirdParty[] | null;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function today() {
  return new Date().toISOString().slice(0, 10);
}

function nowTime() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function emptyThirdParty(): ThirdParty {
  return {
    name: '', company_org: '', role_type: '', contact_phone: '',
    contact_email: '', involvement: '',
    injury_damage_alleged: false, statement_taken: false, is_witness: false,
  };
}

function emptyAction(): CorrectiveAction {
  return { action: '', owner: '', due_date: '', status: 'open', notes: '' };
}

// ── Job selector ──────────────────────────────────────────────────────────────

interface JobOption { id: number; name: string; job_number: string | null; customer_name: string | null; }

function JobSelector({
  jobId, jobName, jobNumber, customerName,
  onChange, disabled,
}: {
  jobId: string; jobName: string; jobNumber: string; customerName: string;
  onChange: (patch: { jobId: string; jobName: string; jobNumber: string; customerName: string }) => void;
  disabled?: boolean;
}) {
  const [jobs, setJobs] = useState<JobOption[]>([]);
  const [open, setOpen] = useState(false);
  const [manual, setManual] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch('/api/forms/jobs-list')
      .then(r => r.ok ? r.json() : [])
      .then((d: JobOption[]) => setJobs(d))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!open) return;
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  // If jobId is set but not in the list, show manual mode
  const selectedJob = jobs.find(j => String(j.id) === jobId);
  const displayLabel = jobId === '0' ? 'No job / not on site'
    : selectedJob ? `${selectedJob.name}${selectedJob.job_number ? ` · #${selectedJob.job_number}` : ''}`
    : jobName || 'Select job…';

  function selectJob(job: JobOption | null) {
    if (!job) {
      onChange({ jobId: '0', jobName: '', jobNumber: '', customerName: '' });
    } else {
      onChange({
        jobId: String(job.id),
        jobName: job.name,
        jobNumber: job.job_number ?? '',
        customerName: job.customer_name ?? '',
      });
    }
    setOpen(false);
    setManual(false);
  }

  if (manual) {
    return (
      <div className="space-y-2">
        <div className="grid grid-cols-1 gap-2">
          <input
            type="text" value={jobName}
            onChange={e => onChange({ jobId: '', jobName: e.target.value, jobNumber, customerName })}
            disabled={disabled} placeholder="Job name"
            className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm disabled:bg-slate-50"
          />
          <input
            type="text" value={jobNumber}
            onChange={e => onChange({ jobId: '', jobName, jobNumber: e.target.value, customerName })}
            disabled={disabled} placeholder="Job number (optional)"
            className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm disabled:bg-slate-50"
          />
          <input
            type="text" value={customerName}
            onChange={e => onChange({ jobId: '', jobName, jobNumber, customerName: e.target.value })}
            disabled={disabled} placeholder="Customer / client (optional)"
            className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm disabled:bg-slate-50"
          />
        </div>
        {!disabled && (
          <button type="button" onClick={() => setManual(false)}
            className="text-xs text-violet-600 hover:underline">
            ← Back to job selector
          </button>
        )}
      </div>
    );
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button" disabled={disabled}
        onClick={() => !disabled && setOpen(o => !o)}
        className={`w-full flex items-center justify-between px-3 py-2.5 rounded-xl border text-sm transition-colors disabled:cursor-default disabled:bg-slate-50 disabled:text-slate-400 ${
          open ? 'border-slate-300 ring-2 ring-violet-400 bg-white' : 'border-slate-200 bg-white hover:border-slate-300'
        }`}
      >
        <span className={jobId ? 'text-slate-700 font-medium' : 'text-slate-400'}>{displayLabel}</span>
        <ChevronDown size={15} className={`text-slate-400 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {/* Selected job detail pill */}
      {jobId && jobId !== '0' && selectedJob?.customer_name && (
        <p className="text-xs text-slate-400 mt-1 pl-1">{selectedJob.customer_name}</p>
      )}

      {open && (
        <div className="absolute z-30 left-0 right-0 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg overflow-hidden">
          <div className="max-h-60 overflow-y-auto divide-y divide-slate-50">
            {/* No job option */}
            <button type="button" onClick={() => selectJob(null)}
              className={`w-full flex items-center gap-3 px-4 py-3 text-sm text-left transition-colors ${
                jobId === '0' ? 'bg-slate-50 text-slate-700 font-semibold' : 'text-slate-500 hover:bg-slate-50'
              }`}
            >
              <span className="text-slate-400 text-xs">—</span>
              No job / not on site
            </button>
            {jobs.map(job => (
              <button key={job.id} type="button" onClick={() => selectJob(job)}
                className={`w-full flex flex-col px-4 py-2.5 text-left transition-colors ${
                  String(job.id) === jobId ? 'bg-violet-50 text-violet-700' : 'text-slate-700 hover:bg-slate-50'
                }`}
              >
                <span className="text-sm font-medium">{job.name}</span>
                <span className="text-xs text-slate-400">
                  {[job.job_number ? `#${job.job_number}` : null, job.customer_name].filter(Boolean).join(' · ')}
                </span>
              </button>
            ))}
            {jobs.length === 0 && (
              <p className="px-4 py-3 text-xs text-slate-400">No jobs found</p>
            )}
          </div>
          <div className="px-4 py-2 border-t border-slate-100 flex justify-between items-center">
            <button type="button" onClick={() => { setManual(true); setOpen(false); }}
              className="text-xs text-violet-600 hover:underline">
              Enter manually
            </button>
            <button type="button" onClick={() => setOpen(false)}
              className="text-xs font-semibold text-slate-500">Done</button>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Toggle chip ───────────────────────────────────────────────────────────────

function YesNo({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div>
      <p className="text-xs text-slate-500 mb-1.5">{label}</p>
      <div className="flex gap-2">
        {[false, true].map(opt => (
          <button
            key={String(opt)}
            type="button"
            onClick={() => !disabled && onChange(opt)}
            disabled={disabled}
            className={`flex-1 py-2 rounded-xl border-2 text-sm font-semibold transition-colors disabled:cursor-default ${
              value === opt
                ? opt
                  ? 'border-red-500 bg-red-50 text-red-700'
                  : 'border-emerald-500 bg-emerald-50 text-emerald-700'
                : 'border-slate-200 text-slate-500'
            }`}
          >
            {opt ? 'Yes' : 'No'}
          </button>
        ))}
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function IncidentDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const isNew = id === 'new';
  const incidentId = isNew ? null : parseInt(id ?? '0', 10);

  // Pre-fill from job context if navigated from a job
  const prefillJobId = searchParams.get('jobId');
  const prefillJobName = searchParams.get('jobName');
  const returnTo: string = (location.state as { returnTo?: string } | null)?.returnTo ?? '/incidents';

  const [incident, setIncident] = useState<FullIncident | null>(null);
  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const saveSuccessTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [closing, setClosing] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [showCloseModal, setShowCloseModal] = useState(false);
  const [closeBy, setCloseBy] = useState('');
  const [showAddAction, setShowAddAction] = useState(false);
  const [showAddThirdParty, setShowAddThirdParty] = useState(false);
  const [newAction, setNewAction] = useState<CorrectiveAction>(emptyAction());
  const [newThirdParty, setNewThirdParty] = useState<ThirdParty>(emptyThirdParty());
  const [savingAction, setSavingAction] = useState(false);
  const [savingThirdParty, setSavingThirdParty] = useState(false);
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Form state
  const [form, setForm] = useState({
    jobId: prefillJobId ?? '',
    jobName: prefillJobName ?? '',
    jobNumber: '',
    customerName: '',
    siteAddress: '',
    incidentDate: today(),
    incidentTime: nowTime(),
    reportedBy: '',
    location: '',
    incidentType: '',
    severity: 'medium',
    description: '',
    immediateActionTaken: '',
    injuryOccurred: false,
    personInjured: '',
    medicalTreatmentRequired: false,
    propertyDamage: false,
    environmentalImpact: false,
    witnesses: '',
    thirdPartiesInvolved: false,
    notes: '',
    status: 'open',
  });

  const [correctiveActions, setCorrectiveActions] = useState<CorrectiveAction[]>([]);
  const [thirdParties, setThirdParties] = useState<ThirdParty[]>([]);
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [lightboxUrl, setLightboxUrl] = useState<JobPhoto | null>(null);

  /** Map an incident Attachment → minimal JobPhoto for PhotoEditor (readOnly) */
  function toJobPhoto(a: Attachment): JobPhoto {
    return {
      id: a.id,
      jobId: 0,
      companyId: 0,
      filename: a.original_name,
      originalName: a.original_name,
      label: null,
      mimeType: a.mime_type,
      sizeBytes: a.size_bytes,
      uploadedByUserId: null,
      uploadedByName: null,
      createdAt: a.created_at,
      url: a.public_url,
      thumbnailUrl: a.public_url,
      previewUrl: a.public_url,
      imageWidth: null,
      imageHeight: null,
      status: 'draft',
      lockedAt: null,
      lockedByUserId: null,
      lockedByName: null,
      mediaAssetId: null,
    };
  }

  // Load existing
  const loadIncident = useCallback(async () => {
    if (!incidentId) return;
    setLoading(true);
    try {
      const r = await fetch(`/api/incidents/${incidentId}`);
      if (!r.ok) { navigate('/incidents'); return; }
      const data = await r.json() as FullIncident;
      setIncident(data);
      setForm({
        jobId: String(data.job_id ?? ''),
        jobName: data.job_name ?? '',
        jobNumber: data.job_number ?? '',
        customerName: data.customer_name ?? '',
        siteAddress: data.site_address ?? '',
        incidentDate: data.incident_date ?? today(),
        incidentTime: data.incident_time ?? '',
        reportedBy: data.reported_by ?? '',
        location: data.location ?? '',
        incidentType: data.incident_type ?? '',
        severity: data.severity ?? 'medium',
        description: data.description ?? '',
        immediateActionTaken: data.immediate_action_taken ?? '',
        injuryOccurred: Boolean(data.injury_occurred),
        personInjured: data.person_injured ?? '',
        medicalTreatmentRequired: Boolean(data.medical_treatment_required),
        propertyDamage: Boolean(data.property_damage),
        environmentalImpact: Boolean(data.environmental_impact),
        witnesses: data.witnesses ?? '',
        thirdPartiesInvolved: Boolean(data.third_parties_involved),
        notes: data.notes ?? '',
        status: data.status ?? 'open',
      });
      setCorrectiveActions(
        typeof data.corrective_actions === 'string'
          ? JSON.parse(data.corrective_actions)
          : (data.corrective_actions ?? [])
      );
      setThirdParties(
        typeof data.third_parties === 'string'
          ? JSON.parse(data.third_parties)
          : (data.third_parties ?? [])
      );
      // Load attachments
      const ar = await fetch(`/api/incidents/${incidentId}/attachments`);
      if (ar.ok) {
        const ad = await ar.json() as { attachments: Attachment[] };
        setAttachments(ad.attachments ?? []);
      }
    } finally {
      setLoading(false);
    }
  }, [incidentId, navigate]);

  useEffect(() => { void loadIncident(); }, [loadIncident]);

  function updateForm(patch: Partial<typeof form>) {
    setForm(prev => {
      const next = { ...prev, ...patch };
      // Auto-save on existing records
      if (incidentId) {
        if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current);
        autoSaveTimer.current = setTimeout(() => {
          void fetch(`/api/incidents/${incidentId}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(formToBody(next)),
          });
        }, 1500);
      }
      return next;
    });
    const keys = Object.keys(patch);
    if (keys.some(k => errors[k])) {
      setErrors(prev => { const n = { ...prev }; keys.forEach(k => delete n[k]); return n; });
    }
  }

  function formToBody(f: typeof form) {
    return {
      jobId: f.jobId ? parseInt(f.jobId, 10) : null,
      jobNumber: f.jobNumber || null,
      jobName: f.jobName || null,
      customerName: f.customerName || null,
      siteAddress: f.siteAddress || null,
      incidentDate: f.incidentDate,
      incidentTime: f.incidentTime || null,
      reportedBy: f.reportedBy,
      location: f.location || null,
      incidentType: f.incidentType,
      severity: f.severity,
      description: f.description,
      immediateActionTaken: f.immediateActionTaken || null,
      injuryOccurred: f.injuryOccurred,
      personInjured: f.personInjured || null,
      medicalTreatmentRequired: f.medicalTreatmentRequired,
      propertyDamage: f.propertyDamage,
      environmentalImpact: f.environmentalImpact,
      witnesses: f.witnesses || null,
      thirdPartiesInvolved: f.thirdPartiesInvolved,
      notes: f.notes || null,
      status: f.status,
    };
  }

  function validate(): boolean {
    const e: Record<string, string> = {};
    if (!form.incidentDate) e.incidentDate = 'Date is required';
    if (!form.reportedBy.trim()) e.reportedBy = 'Reported by is required';
    if (!form.incidentType) e.incidentType = 'Incident type is required';
    if (!form.severity) e.severity = 'Severity is required';
    if (!form.description.trim()) e.description = 'Description is required';
    if (form.thirdPartiesInvolved && thirdParties.length === 0) {
      e.thirdParties = 'Add at least one third party record';
    }
    setErrors(e);
    return Object.keys(e).length === 0;
  }

  async function handleSave() {
    if (!validate()) return;
    setSaving(true);
    setSaveSuccess(false);
    if (saveSuccessTimer.current) clearTimeout(saveSuccessTimer.current);
    try {
      if (isNew) {
        const r = await fetch('/api/incidents', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(formToBody(form)),
        });
        const d = await r.json() as { id?: number; error?: string };
        if (!r.ok) throw new Error(d.error ?? 'Failed');
        navigate(`/incidents/${d.id!}`, { replace: true });
      } else {
        await fetch(`/api/incidents/${incidentId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(formToBody(form)),
        });
        await loadIncident();
        setSaveSuccess(true);
        saveSuccessTimer.current = setTimeout(() => setSaveSuccess(false), 3500);
      }
    } catch (e) {
      setErrors({ general: String(e) });
    } finally {
      setSaving(false);
    }
  }

  async function handleClose() {
    if (!incidentId) return;
    setClosing(true);
    try {
      const r = await fetch(`/api/incidents/${incidentId}/close`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ closedBy: closeBy }),
      });
      if (!r.ok) throw new Error('Failed');
      setShowCloseModal(false);
      await loadIncident();
    } finally {
      setClosing(false);
    }
  }

  async function handleAddAction() {
    if (!newAction.action.trim()) return;
    if (!incidentId) return;
    setSavingAction(true);
    try {
      const r = await fetch(`/api/incidents/${incidentId}/corrective-actions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newAction),
      });
      const d = await r.json() as { id?: number };
      if (r.ok) {
        setCorrectiveActions(prev => [...prev, { ...newAction, id: d.id }]);
        setNewAction(emptyAction());
        setShowAddAction(false);
      }
    } finally {
      setSavingAction(false);
    }
  }

  async function handleUpdateActionStatus(action: CorrectiveAction, newStatus: CorrectiveAction['status']) {
    if (!incidentId || !action.id) return;
    const updated = { ...action, status: newStatus };
    setCorrectiveActions(prev => prev.map(a => a.id === action.id ? updated : a));
    await fetch(`/api/incidents/${incidentId}/corrective-actions/${action.id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updated),
    });
  }

  async function handleAddThirdParty() {
    if (!newThirdParty.name.trim() && !newThirdParty.company_org.trim()) return;
    if (!newThirdParty.involvement.trim()) return;
    if (!incidentId) {
      // For new incidents, store locally until saved
      setThirdParties(prev => [...prev, { ...newThirdParty }]);
      setNewThirdParty(emptyThirdParty());
      setShowAddThirdParty(false);
      return;
    }
    setSavingThirdParty(true);
    try {
      const r = await fetch(`/api/incidents/${incidentId}/third-parties`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newThirdParty.name || null,
          companyOrg: newThirdParty.company_org || null,
          roleType: newThirdParty.role_type || null,
          contactPhone: newThirdParty.contact_phone || null,
          contactEmail: newThirdParty.contact_email || null,
          involvement: newThirdParty.involvement,
          injuryDamageAlleged: newThirdParty.injury_damage_alleged,
          statementTaken: newThirdParty.statement_taken,
          isWitness: newThirdParty.is_witness,
        }),
      });
      const d = await r.json() as { id?: number };
      if (r.ok) {
        setThirdParties(prev => [...prev, { ...newThirdParty, id: d.id }]);
        setNewThirdParty(emptyThirdParty());
        setShowAddThirdParty(false);
      }
    } finally {
      setSavingThirdParty(false);
    }
  }

  async function handleDeleteThirdParty(tp: ThirdParty) {
    if (!incidentId || !tp.id) {
      setThirdParties(prev => prev.filter(p => p !== tp));
      return;
    }
    await fetch(`/api/incidents/${incidentId}/third-parties/${tp.id}`, { method: 'DELETE' });
    setThirdParties(prev => prev.filter(p => p.id !== tp.id));
  }



  async function handleDeleteAttachment(a: Attachment) {
    if (!incidentId) return;
    await fetch(`/api/incidents/${incidentId}/attachments/${a.id}`, { method: 'DELETE' });
    setAttachments(prev => prev.filter(x => x.id !== a.id));
  }

  const isClosed = incident?.status === 'closed';
  const pageTitle = isNew ? 'New Incident' : `Incident #${incidentId}`;

  // ── Attachment upload queue ────────────────────────────────────────────────
  const attachQ = useUploadQueue({
    endpoint: incidentId ? `/api/incidents/${incidentId}/attachments` : '/api/incidents/0/attachments',
    fieldName: 'files',
    accept: 'image/*,application/pdf',
    multiple: true,
    onSuccess: (results) => {
      const resp = results[0]?.response as { attachments?: Attachment[] } | undefined;
      if (resp?.attachments) setAttachments(prev => [...prev, ...resp.attachments!.filter(a => a.id)]);
    },
  });
  const uploadingFiles = attachQ.isUploading;
  const fileInputRef = attachQ.inputRef;

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 size={28} className="animate-spin text-red-400" />
      </div>
    );
  }

  return (
    <>
      <Helmet>
        <title>{pageTitle} — IWILLBUILD</title>
        <meta name="description" content="Incident record detail and corrective actions." />
        <link rel="canonical" href={`https://iwillbuild.com/incidents/${id}`} />
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>

      <div className="flex flex-col min-h-dvh bg-slate-50 lg-portal">
        <PortalSidebar />
        {/* Header */}
        <div className="bg-red-700 text-white px-4 safe-top pb-3 flex flex-col gap-0 min-w-0 overflow-x-clip">
          {/* Breadcrumb */}
          <div className="flex items-center gap-1.5 text-xs text-red-300 pt-1 mb-1.5 min-w-0 overflow-hidden">
            <button
              type="button"
              onClick={() => navigate('/home')}
              className="flex items-center gap-1 hover:text-white transition-colors"
            >
              <Home size={11} /> Home
            </button>
            <ChevronRight size={10} className="text-red-400" />
            <button
              type="button"
              onClick={() => navigate(returnTo)}
              className="hover:text-white transition-colors"
            >
              Incidents
            </button>
            <ChevronRight size={10} className="text-red-400" />
            <span className="text-red-100 font-medium truncate max-w-[120px]">{pageTitle}</span>
          </div>
          <div className="flex items-center gap-3 min-w-0">
            <button type="button" onClick={() => navigate(returnTo)} className="p-1.5 rounded-lg bg-white/20">
              <ChevronLeft size={20} />
            </button>
            <div className="flex-1 min-w-0">
              <h1 className="font-bold text-sm">{pageTitle}</h1>
              {!isNew && incident && (
                <p className="text-xs text-red-200">{incident.incident_type}</p>
              )}
            </div>
            {!isNew && incident && !isClosed && (
              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${statusBadge(incident.status)}`}>
                {incident.status.charAt(0).toUpperCase() + incident.status.slice(1)}
              </span>
            )}
            {isClosed && (
              <span className="flex items-center gap-1 text-xs bg-slate-600 px-2 py-0.5 rounded-full">
                <Lock size={11} /> Closed
              </span>
            )}
            {/* Overflow menu — secondary actions */}
            {!isNew && !isClosed && (
              <MobileOverflowMenu
                surface="dark"
                items={[
                  {
                    label: 'Print / Download PDF',
                    icon: <Printer size={15} />,
                    href: `/api/incidents/${incidentId}/pdf`,
                    onSelect: () => {},
                  },
                  {
                    label: 'Close Incident',
                    icon: <Lock size={15} />,
                    onSelect: () => setShowCloseModal(true),
                    destructive: true,
                  },
                ]}
              />
            )}
            {!isNew && isClosed && (
              <MobileOverflowMenu
                surface="dark"
                items={[
                  {
                    label: 'Print / Download PDF',
                    icon: <Printer size={15} />,
                    href: `/api/incidents/${incidentId}/pdf`,
                    onSelect: () => {},
                  },
                ]}
              />
            )}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3 pb-32">

          {errors.general && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-xl text-xs text-red-600">
              {errors.general}
            </div>
          )}

          {/* ── Section completion booleans ── */}
          {(() => {
            const detailsComplete = !!(form.incidentDate && form.reportedBy && form.incidentType && form.severity);
            const whatHappenedComplete = !!(form.description.trim());
            const impactsComplete = form.injuryOccurred !== null && form.propertyDamage !== null && form.environmentalImpact !== null;
            const statusComplete = !!(form.status);

            return (
              <>
                {/* Incident details */}
                <FormSection
                  title="Incident Details"
                  icon={<AlertTriangle size={13} />}
                  complete={detailsComplete}
                  fillRatio={[form.incidentDate, form.reportedBy, form.incidentType, form.severity].filter(Boolean).length / 4}
                  required
                  accent="red"
                  alwaysOpen={isNew}
                  defaultOpen
                >
                  <div>
                    <label className="text-xs text-slate-500 mb-1 block">Date <span className="text-red-500">*</span></label>
                    <input
                      type="date"
                      value={form.incidentDate}
                      onChange={e => updateForm({ incidentDate: e.target.value })}
                      disabled={isClosed}
                      className={`w-full border rounded-xl px-3 py-2 text-sm disabled:bg-slate-50 disabled:text-slate-400 ${errors.incidentDate ? 'border-red-400' : 'border-slate-200'}`}
                    />
                    {errors.incidentDate && <p className="text-xs text-red-500 mt-0.5">{errors.incidentDate}</p>}
                  </div>
                  <div>
                    <label className="text-xs text-slate-500 mb-1 block">Time</label>
                    <input
                      type="time"
                      value={form.incidentTime}
                      onChange={e => updateForm({ incidentTime: e.target.value })}
                      disabled={isClosed}
                      className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm disabled:bg-slate-50 disabled:text-slate-400"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-slate-500 mb-1 block">Reported by <span className="text-red-500">*</span></label>
                    <input
                      type="text"
                      value={form.reportedBy}
                      onChange={e => updateForm({ reportedBy: e.target.value })}
                      disabled={isClosed}
                      placeholder="Name"
                      className={`w-full border rounded-xl px-3 py-2 text-sm disabled:bg-slate-50 disabled:text-slate-400 ${errors.reportedBy ? 'border-red-400' : 'border-slate-200'}`}
                    />
                    {errors.reportedBy && <p className="text-xs text-red-500 mt-0.5">{errors.reportedBy}</p>}
                  </div>
                  <div>
                    <label className="text-xs text-slate-500 mb-1 block">Location / site address</label>
                    <input
                      type="text"
                      value={form.location}
                      onChange={e => updateForm({ location: e.target.value })}
                      disabled={isClosed}
                      placeholder="Where did this occur?"
                      className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm disabled:bg-slate-50 disabled:text-slate-400"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-slate-500 mb-1 block">Incident type <span className="text-red-500">*</span></label>
                    <select
                      value={form.incidentType}
                      onChange={e => updateForm({ incidentType: e.target.value })}
                      disabled={isClosed}
                      className={`w-full border rounded-xl px-3 py-2 text-sm disabled:bg-slate-50 disabled:text-slate-400 ${errors.incidentType ? 'border-red-400' : 'border-slate-200'}`}
                    >
                      <option value="">Select type…</option>
                      {INCIDENT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                    </select>
                    {errors.incidentType && <p className="text-xs text-red-500 mt-0.5">{errors.incidentType}</p>}
                  </div>
                  <div>
                    <label className="text-xs text-slate-500 mb-1.5 block">Severity <span className="text-red-500">*</span></label>
                    <div className="flex flex-col gap-2">
                      {SEVERITY_OPTIONS.map(s => (
                        <button
                          key={s.value}
                          type="button"
                          onClick={() => !isClosed && updateForm({ severity: s.value })}
                          disabled={isClosed}
                          className={`w-full py-2.5 rounded-xl border-2 text-sm font-semibold transition-colors disabled:cursor-default text-left px-4 ${
                            form.severity === s.value
                              ? `${s.color} border-current`
                              : 'border-slate-200 text-slate-500'
                          }`}
                        >
                          {s.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </FormSection>

                {/* Job link */}
                <FormSection
                  title="Job (optional)"
                  icon={<ChevronRight size={13} />}
                  complete={!!(form.jobId)}
                  accent="violet"
                  defaultOpen={false}
                >
                  <JobSelector
                    jobId={form.jobId}
                    jobName={form.jobName}
                    jobNumber={form.jobNumber}
                    customerName={form.customerName}
                    onChange={patch => updateForm(patch)}
                    disabled={isClosed}
                  />
                </FormSection>

                {/* What Happened */}
                <FormSection
                  title="What Happened"
                  icon={<AlertTriangle size={13} />}
                  complete={whatHappenedComplete}
                  fillRatio={form.description.trim() ? 1 : 0}
                  required
                  accent="red"
                  defaultOpen
                >
                  <div>
                    <label className="text-xs text-slate-500 mb-1 block">Description <span className="text-red-500">*</span></label>
                    <textarea
                      value={form.description}
                      onChange={e => updateForm({ description: e.target.value })}
                      disabled={isClosed}
                      placeholder="Describe what happened…"
                      rows={4}
                      className={`w-full border rounded-xl px-3 py-2 text-sm resize-none disabled:bg-slate-50 disabled:text-slate-400 ${errors.description ? 'border-red-400' : 'border-slate-200'}`}
                    />
                    {errors.description && <p className="text-xs text-red-500">{errors.description}</p>}
                  </div>
                  <div>
                    <label className="text-xs text-slate-500 mb-1 block">Immediate action taken</label>
                    <textarea
                      value={form.immediateActionTaken}
                      onChange={e => updateForm({ immediateActionTaken: e.target.value })}
                      disabled={isClosed}
                      placeholder="What was done immediately after the incident?"
                      rows={2}
                      className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm resize-none disabled:bg-slate-50 disabled:text-slate-400"
                    />
                  </div>
                </FormSection>

                {/* Impacts */}
                <FormSection
                  title="Impacts"
                  icon={<ShieldAlert size={13} />}
                  complete={impactsComplete}
                  fillRatio={[form.injuryOccurred, form.propertyDamage, form.environmentalImpact].filter(v => v !== null).length / 3}
                  required
                  accent="violet"
                  defaultOpen
                >
                  <YesNo label="Was anyone injured?" value={form.injuryOccurred} onChange={v => updateForm({ injuryOccurred: v })} disabled={isClosed} />
                  {form.injuryOccurred && (
                    <div className="space-y-2 pl-2 border-l-2 border-red-200">
                      <div>
                        <label className="text-xs text-slate-500 mb-1 block">Person injured</label>
                        <input
                          type="text"
                          value={form.personInjured}
                          onChange={e => updateForm({ personInjured: e.target.value })}
                          disabled={isClosed}
                          placeholder="Name"
                          className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm disabled:bg-slate-50 disabled:text-slate-400"
                        />
                      </div>
                      <YesNo label="Medical treatment required?" value={form.medicalTreatmentRequired} onChange={v => updateForm({ medicalTreatmentRequired: v })} disabled={isClosed} />
                    </div>
                  )}
                  <YesNo label="Property damage?" value={form.propertyDamage} onChange={v => updateForm({ propertyDamage: v })} disabled={isClosed} />
                  <YesNo label="Environmental impact?" value={form.environmentalImpact} onChange={v => updateForm({ environmentalImpact: v })} disabled={isClosed} />
                  <div>
                    <label className="text-xs text-slate-500 mb-1 block">Witnesses</label>
                    <input
                      type="text"
                      value={form.witnesses}
                      onChange={e => updateForm({ witnesses: e.target.value })}
                      disabled={isClosed}
                      placeholder="Names of witnesses"
                      className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm disabled:bg-slate-50 disabled:text-slate-400"
                    />
                  </div>
                </FormSection>

                {/* Third parties */}
                <FormSection
                  title="Third Parties"
                  icon={<Users size={13} />}
                  complete={form.thirdPartiesInvolved === false || (form.thirdPartiesInvolved === true && thirdParties.length > 0)}
                  fillRatio={form.thirdPartiesInvolved !== null ? 1 : 0}
                  required={false}
                  accent="blue"
                  defaultOpen={false}
                >
            <YesNo
              label="Were any third parties involved?"
              value={form.thirdPartiesInvolved}
              onChange={v => updateForm({ thirdPartiesInvolved: v })}
              disabled={isClosed}
            />
            {errors.thirdParties && <p className="text-xs text-red-500">{errors.thirdParties}</p>}

            {form.thirdPartiesInvolved && (
              <div className="space-y-3">
                {thirdParties.map((tp, idx) => (
                  <div key={tp.id ?? idx} className="bg-slate-50 rounded-xl p-3 border border-slate-100">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-slate-700">{tp.name || tp.company_org || 'Unknown'}</p>
                        {tp.role_type && <p className="text-xs text-slate-400">{tp.role_type}</p>}
                        <p className="text-xs text-slate-500 mt-1 line-clamp-2">{tp.involvement}</p>
                      </div>
                      {!isClosed && (
                        <button type="button" onClick={() => handleDeleteThirdParty(tp)} className="p-1 text-slate-300 hover:text-red-500">
                          <Trash2 size={14} />
                        </button>
                      )}
                    </div>
                    <div className="flex gap-2 mt-2 flex-wrap">
                      {tp.injury_damage_alleged && <span className="text-xs bg-red-50 text-red-600 px-2 py-0.5 rounded-full">Injury/damage alleged</span>}
                      {tp.statement_taken && <span className="text-xs bg-blue-50 text-blue-600 px-2 py-0.5 rounded-full">Statement taken</span>}
                      {tp.is_witness && <span className="text-xs bg-purple-50 text-purple-600 px-2 py-0.5 rounded-full">Witness</span>}
                    </div>
                  </div>
                ))}

                {!isClosed && !showAddThirdParty && (
                  <button
                    type="button"
                    onClick={() => setShowAddThirdParty(true)}
                    className="w-full py-2.5 rounded-xl border-2 border-dashed border-slate-200 text-slate-500 text-sm flex items-center justify-center gap-2"
                  >
                    <Plus size={14} /> Add third party
                  </button>
                )}

                {showAddThirdParty && (
                  <div className="bg-slate-50 rounded-xl p-3 border border-slate-200 space-y-2">
                    <div className="grid grid-cols-1 gap-2">
                      <input
                        type="text"
                        value={newThirdParty.name}
                        onChange={e => setNewThirdParty(p => ({ ...p, name: e.target.value }))}
                        placeholder="Name"
                        className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
                      />
                      <input
                        type="text"
                        value={newThirdParty.company_org}
                        onChange={e => setNewThirdParty(p => ({ ...p, company_org: e.target.value }))}
                        placeholder="Company / organisation"
                        className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
                      />
                    </div>
                    <select
                      value={newThirdParty.role_type}
                      onChange={e => setNewThirdParty(p => ({ ...p, role_type: e.target.value }))}
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
                    >
                      <option value="">Role / type…</option>
                      {incident_detail.THIRD_PARTY_ROLES.map(r => <option key={r} value={r}>{r}</option>)}
                    </select>
                    <div className="grid grid-cols-1 gap-2">
                      <input
                        type="tel"
                        value={newThirdParty.contact_phone}
                        onChange={e => setNewThirdParty(p => ({ ...p, contact_phone: e.target.value }))}
                        placeholder="Phone (optional)"
                        className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
                      />
                      <input
                        type="email"
                        value={newThirdParty.contact_email}
                        onChange={e => setNewThirdParty(p => ({ ...p, contact_email: e.target.value }))}
                        placeholder="Email (optional)"
                        className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm"
                      />
                    </div>
                    <textarea
                      value={newThirdParty.involvement}
                      onChange={e => setNewThirdParty(p => ({ ...p, involvement: e.target.value }))}
                      placeholder="Involvement description (required)"
                      rows={2}
                      className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm resize-none"
                    />
                    <div className="flex gap-4 flex-wrap pt-1">
                      {[
                        { key: 'injury_damage_alleged' as const, label: 'Injury/damage alleged' },
                        { key: 'statement_taken' as const, label: 'Statement taken' },
                        { key: 'is_witness' as const, label: 'Witness' },
                      ].map(({ key, label }) => (
                        <label key={key} className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={newThirdParty[key]}
                            onChange={e => setNewThirdParty(p => ({ ...p, [key]: e.target.checked }))}
                            className="rounded w-4 h-4"
                          />
                          {label}
                        </label>
                      ))}
                    </div>
                    <div className="flex gap-2 pt-1">
                      <button type="button" onClick={() => setShowAddThirdParty(false)} className="flex-1 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-600 font-medium">
                        Cancel
                      </button>
                      <button
                        type="button"
                        onClick={handleAddThirdParty}
                        disabled={savingThirdParty || (!newThirdParty.name.trim() && !newThirdParty.company_org.trim()) || !newThirdParty.involvement.trim()}
                        className="flex-1 py-2.5 rounded-xl bg-red-600 text-white text-sm font-semibold disabled:opacity-40"
                      >
                        {savingThirdParty ? <Loader2 size={14} className="animate-spin mx-auto" /> : 'Add'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
                </FormSection>

                {/* Corrective actions */}
                {!isNew && (
                  <FormSection
                    title="Corrective Actions"
                    icon={<ClipboardCheck size={13} />}
                    complete={correctiveActions.length > 0 && correctiveActions.every(ca => ca.status === 'complete')}
                    fillRatio={correctiveActions.length > 0 ? correctiveActions.filter(ca => ca.status === 'complete').length / correctiveActions.length : 0}
                    accent="violet"
                    defaultOpen={correctiveActions.length > 0}
                    headerRight={
                      !isClosed ? (
                        <button
                          type="button"
                          onClick={() => setShowAddAction(!showAddAction)}
                          className="text-xs text-red-600 flex items-center gap-1 py-0.5"
                        >
                          <Plus size={12} /> Add
                        </button>
                      ) : undefined
                    }
                  >
                    {correctiveActions.length === 0 && !showAddAction && (
                      <p className="text-xs text-slate-400">No corrective actions yet.</p>
                    )}
                    {correctiveActions.map((ca, idx) => (
                      <div key={ca.id ?? idx} className="border border-slate-100 rounded-xl p-3 space-y-1.5">
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-sm text-slate-700 flex-1">{ca.action}</p>
                          <select
                            value={ca.status}
                            onChange={e => handleUpdateActionStatus(ca, e.target.value as CorrectiveAction['status'])}
                            disabled={isClosed}
                            className="text-xs border border-slate-200 rounded-lg px-1.5 py-1 disabled:bg-slate-50"
                          >
                            <option value="open">Open</option>
                            <option value="in progress">In progress</option>
                            <option value="complete">Complete</option>
                          </select>
                        </div>
                        <div className="flex gap-3 text-xs text-slate-400">
                          {ca.owner && <span>Owner: {ca.owner}</span>}
                          {ca.due_date && <span>Due: {new Date(ca.due_date).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}</span>}
                          {ca.status === 'complete' && <CheckCircle2 size={12} className="text-emerald-500" />}
                        </div>
                        {ca.notes && <p className="text-xs text-slate-400 italic">{ca.notes}</p>}
                      </div>
                    ))}
                    {showAddAction && (
                      <div className="bg-slate-50 rounded-xl p-3 border border-slate-200 space-y-2">
                        <textarea
                          value={newAction.action}
                          onChange={e => setNewAction(p => ({ ...p, action: e.target.value }))}
                          placeholder="Corrective action (required)"
                          rows={2}
                          className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs resize-none"
                        />
                        <input
                          type="text"
                          value={newAction.owner}
                          onChange={e => setNewAction(p => ({ ...p, owner: e.target.value }))}
                          placeholder="Owner"
                          className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs"
                        />
                        <input
                          type="date"
                          value={newAction.due_date}
                          onChange={e => setNewAction(p => ({ ...p, due_date: e.target.value }))}
                          className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs"
                        />
                        <textarea
                          value={newAction.notes}
                          onChange={e => setNewAction(p => ({ ...p, notes: e.target.value }))}
                          placeholder="Notes (optional)"
                          rows={1}
                          className="w-full border border-slate-200 rounded-lg px-2 py-1.5 text-xs resize-none"
                        />
                        <div className="flex gap-2">
                          <button type="button" onClick={() => setShowAddAction(false)} className="flex-1 py-1.5 rounded-lg border border-slate-200 text-xs text-slate-600">
                            <X size={12} className="inline mr-1" /> Cancel
                          </button>
                          <button
                            type="button"
                            onClick={handleAddAction}
                            disabled={savingAction || !newAction.action.trim()}
                            className="flex-1 py-1.5 rounded-lg bg-red-600 text-white text-xs font-semibold disabled:opacity-40"
                          >
                            {savingAction ? <Loader2 size={12} className="animate-spin mx-auto" /> : 'Add action'}
                          </button>
                        </div>
                      </div>
                    )}
                  </FormSection>
                )}

          {/* Status + Notes */}
                <FormSection
                  title="Status & Notes"
                  icon={<ClipboardCheck size={13} />}
                  complete={!!(form.status)}
                  required
                  accent="violet"
                  defaultOpen
                >
                  {!isClosed && (
                    <div>
                      <label className="text-xs text-slate-500 mb-1.5 block">Status</label>
                      <div className="flex flex-col gap-2">
                        {STATUS_OPTIONS.filter(s => s.value !== 'closed').map(s => (
                          <button
                            key={s.value}
                            type="button"
                            onClick={() => updateForm({ status: s.value })}
                            className={`w-full py-2 rounded-xl border-2 text-xs font-semibold transition-colors text-left px-4 ${
                              form.status === s.value
                                ? `${s.color} border-current`
                                : 'border-slate-200 text-slate-500'
                            }`}
                          >
                            {s.label}
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                  <div>
                    <label className="text-xs text-slate-500 mb-1 block">Notes</label>
                    <textarea
                      value={form.notes}
                      onChange={e => updateForm({ notes: e.target.value })}
                      disabled={isClosed}
                      placeholder="Additional notes…"
                      rows={2}
                      className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm resize-none disabled:bg-slate-50 disabled:text-slate-400"
                    />
                  </div>
                </FormSection>

                {/* Attachments */}
                {!isNew && (
                  <FormSection
                    title="Photos & Attachments"
                    icon={<Paperclip size={13} />}
                    complete={attachments.length > 0}
                    accent="violet"
                    defaultOpen={attachments.length > 0}
                    headerRight={
                      !isClosed ? (
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          disabled={uploadingFiles}
                          className="flex items-center gap-1.5 text-xs font-semibold text-red-600 bg-red-50 px-3 py-1 rounded-lg disabled:opacity-50"
                        >
                          {uploadingFiles ? <Loader2 size={12} className="animate-spin" /> : <Plus size={12} />}
                          Add
                        </button>
                      ) : attachments.length > 0 ? (
                        <span className="bg-slate-100 text-slate-500 text-xs px-1.5 py-0.5 rounded-full">{attachments.length}</span>
                      ) : undefined
                    }
                  >
                    <input ref={fileInputRef} type="file" accept="image/*,application/pdf" multiple className="hidden" onChange={attachQ.handleInputChange} />
                    {attachments.length === 0 && (
                      <div
                        className={`border-2 border-dashed border-slate-200 rounded-xl p-6 text-center ${!isClosed ? 'cursor-pointer hover:border-red-300 hover:bg-red-50/30 transition-colors' : ''}`}
                        onClick={() => !isClosed && fileInputRef.current?.click()}
                      >
                        <Paperclip size={20} className="mx-auto text-slate-300 mb-2" />
                        <p className="text-xs text-slate-400">{isClosed ? 'No attachments' : 'Tap to add photos or PDFs'}</p>
                      </div>
                    )}
                    {attachments.length > 0 && (
                      <div className="space-y-3">
                        {attachments.filter(a => a.file_type === 'image').length > 0 && (
                          <div>
                            <p className="text-xs text-slate-400 mb-2 flex items-center gap-1"><Image size={11} /> Photos</p>
                            <div className="grid grid-cols-3 gap-2">
                              {attachments.filter(a => a.file_type === 'image').map(a => (
                                <div key={a.id} className="relative group aspect-square rounded-xl overflow-hidden bg-slate-100">
                                  <img src={a.public_url} alt={a.original_name} className="w-full h-full object-cover cursor-pointer" onClick={() => setLightboxUrl(toJobPhoto(a))} />
                                  {!isClosed && (
                                    <button type="button" onClick={() => handleDeleteAttachment(a)} className="absolute top-1 right-1 bg-black/60 text-white rounded-full p-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                                      <X size={11} />
                                    </button>
                                  )}
                                </div>
                              ))}
                              {!isClosed && (
                                <button type="button" onClick={() => fileInputRef.current?.click()} className="aspect-square rounded-xl border-2 border-dashed border-slate-200 flex items-center justify-center text-slate-300 hover:border-red-300 hover:text-red-400 transition-colors">
                                  <Plus size={20} />
                                </button>
                              )}
                            </div>
                          </div>
                        )}
                        {attachments.filter(a => a.file_type !== 'image').length > 0 && (
                          <div>
                            <p className="text-xs text-slate-400 mb-2 flex items-center gap-1"><FileText size={11} /> Documents</p>
                            <div className="space-y-1.5">
                              {attachments.filter(a => a.file_type !== 'image').map(a => (
                                <div key={a.id} className="flex items-center gap-3 bg-slate-50 rounded-xl px-3 py-2.5">
                                  <FileText size={16} className="text-red-400 shrink-0" />
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium text-slate-700 truncate">{a.original_name}</p>
                                    <p className="text-xs text-slate-400">{(a.size_bytes / 1024).toFixed(0)} KB</p>
                                  </div>
                                  <a href={a.public_url} target="_blank" rel="noopener noreferrer" className="text-slate-400 hover:text-red-500 transition-colors"><Download size={15} /></a>
                                  {!isClosed && <button type="button" onClick={() => handleDeleteAttachment(a)} className="text-slate-300 hover:text-red-500 transition-colors"><Trash2 size={14} /></button>}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </FormSection>
                )}

                {/* Closed info */}
                {isClosed && incident && (
                  <div className="bg-slate-100 rounded-2xl p-4 text-xs text-slate-500 space-y-1">
                    <p className="font-semibold text-slate-600">Incident closed</p>
                    {incident.closed_at && <p>Closed: {new Date(incident.closed_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}</p>}
                    {incident.closed_by && <p>By: {incident.closed_by}</p>}
                  </div>
                )}
              </>
            );
          })()}
        </div>

        {/* Bottom actions */}
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-100 safe-bottom">
          {/* Save success banner — slides up above the action bar */}
          <AnimatePresence>
            {saveSuccess && (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 8 }}
                transition={{ duration: 0.18 }}
                className="flex items-center gap-2 px-4 py-2.5 bg-emerald-50 border-t border-emerald-200 text-emerald-700 text-sm font-medium"
              >
                <CheckCircle2 size={15} className="shrink-0" />
                Incident saved
              </motion.div>
            )}
          </AnimatePresence>
          <div className="flex gap-3 p-4">
            {!isClosed && (
              <button
                type="button"
                onClick={handleSave}
                disabled={saving}
                className="flex-1 py-3 rounded-xl bg-red-600 text-white text-sm font-bold flex items-center justify-center gap-2"
              >
                {saving ? <Loader2 size={16} className="animate-spin" /> : <><Save size={15} /> {isNew ? 'Create Incident' : 'Save'}</>}
              </button>
            )}
            {isClosed && (
              <button
                type="button"
                onClick={() => navigate(returnTo)}
                className="flex-1 py-3 rounded-xl bg-slate-100 text-slate-600 text-sm font-semibold"
              >
                Back to register
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Photo viewer */}
      {lightboxUrl && (
        <PhotoEditor
          photo={lightboxUrl}
          readOnly
          onClose={() => setLightboxUrl(null)}
          onSaved={() => setLightboxUrl(null)}
        />
      )}

      {/* Close modal */}
      {showCloseModal && (
        <div className="fixed inset-0 bg-black/50 flex items-end justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-5 w-full max-w-sm space-y-4 max-h-[90dvh] overflow-y-auto"
            style={{ paddingBottom: 'max(1.25rem, env(safe-area-inset-bottom))' }}
          >
            <h3 className="font-bold text-slate-800">Close Incident</h3>
            <p className="text-sm text-slate-500">This will mark the incident as closed. This action cannot be undone.</p>
            <div>
              <label className="text-xs text-slate-500 mb-1 block">Closed by</label>
              <input
                type="text"
                value={closeBy}
                onChange={e => setCloseBy(e.target.value)}
                placeholder="Your name"
                className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm"
              />
            </div>
            <div className="flex gap-3">
              <button type="button" onClick={() => setShowCloseModal(false)} className="flex-1 py-3 rounded-xl border border-slate-200 text-slate-600 text-sm font-semibold">
                Cancel
              </button>
              <button
                type="button"
                onClick={handleClose}
                disabled={closing}
                className="flex-1 py-3 rounded-xl bg-slate-800 text-white text-sm font-bold"
              >
                {closing ? <Loader2 size={16} className="animate-spin mx-auto" /> : 'Close Incident'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
