import { useState, useEffect, useRef } from 'react';
import { Helmet } from '@dr.pogodin/react-helmet';
import { motion, AnimatePresence } from 'motion/react';
import {
  ShieldAlert, ShieldCheck, FileText, AlertTriangle, Plus, Search,
  Loader2, X, Check, ChevronRight, Download, Trash2, Copy,
  ClipboardList, BookOpen, Image, Menu, AlertCircle, ExternalLink,
  Users, Calendar, Building2, ChevronDown,
} from 'lucide-react';
import PortalSidebar from '@/components/PortalSidebar';
import { useMe } from '@/lib/usePermissions';

// ── Types ─────────────────────────────────────────────────────────────────────

interface SwmsTemplate {
  id: number;
  title: string;
  work_activity: string | null;
  hazards: string | null;
  risks: string | null;
  controls: string | null;
  ppe: string | null;
  plant_equipment: string | null;
  training_competency: string | null;
  emergency_controls: string | null;
  environmental_controls: string | null;
  sign_off_requirements: string | null;
  revision_number: string;
  review_date: string | null;
  status: string;
  created_at: string;
}

interface SafetyPlan {
  id: number;
  job_id: number | null;
  title: string;
  project_value: string | null;
  is_principal_contractor: number;
  site_address: string | null;
  site_supervisor: string | null;
  first_aid_officer: string | null;
  emergency_contact: string | null;
  nearest_hospital: string | null;
  emergency_assembly_point: string | null;
  evacuation_notes: string | null;
  site_rules: string | null;
  high_risk_activities: string | null;
  status: string;
  job_name: string | null;
  job_number: string | null;
  created_at: string;
}

interface SafetyDocument {
  id: number;
  title: string;
  doc_type: string;
  original_name: string;
  mime_type: string;
  size_bytes: number;
  review_date: string | null;
  notes: string | null;
  created_at: string;
}

interface SafetyPoster {
  id: number;
  title: string;
  poster_type: string;
  original_name: string;
  mime_type: string;
  size_bytes: number;
  notes: string | null;
  created_at: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtBytes(b: number) {
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`;
  return `${(b / 1024 / 1024).toFixed(1)} MB`;
}

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
}

const SWMS_STATUSES = ['draft', 'active', 'archived'] as const;
const PLAN_STATUSES = ['draft', 'active', 'archived'] as const;

function statusBadge(status: string) {
  const map: Record<string, string> = {
    draft: 'bg-amber-50 text-amber-700 border-amber-200',
    active: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    archived: 'bg-slate-100 text-slate-500 border-slate-200',
  };
  return map[status] ?? 'bg-slate-100 text-slate-500 border-slate-200';
}

const HIGH_RISK_ACTIVITIES = [
  'Working at heights (>2m)',
  'Excavation / trenching',
  'Confined spaces',
  'Demolition',
  'Asbestos removal',
  'Electrical work',
  'Crane / rigging operations',
  'Pressurised systems',
  'Hot work (welding/cutting)',
  'Hazardous chemicals',
  'Tilt-up construction',
  'Formwork / falsework',
  'Tunnelling',
  'Diving operations',
];

const POLICY_TYPES = [
  'WHS Policy',
  'Environmental Policy',
  'Drug & Alcohol Policy',
  'Fatigue Management',
  'Manual Handling',
  'Excavation & Underground Services',
  'Working Near Electrical Assets',
  'PPE Policy',
  'Training & Competency',
  'Consultation & Communication',
  'Risk Management',
  'Spill Response',
  'Document Control',
  'Bullying / Harassment / Equal Opportunity',
  'Other',
];

const POSTER_TYPES = [
  'Emergency Contacts',
  'Emergency Assembly Point',
  'Risk Matrix',
  'Life Saving Rules',
  'PPE / Safety Icons',
  'Sign-on Poster',
  'Incident Reporting',
  'Other',
];

// ── SWMS Form Modal ───────────────────────────────────────────────────────────

interface SwmsFormModalProps {
  initial?: SwmsTemplate | null;
  onClose: () => void;
  onSaved: (s: SwmsTemplate) => void;
}

function SwmsFormModal({ initial, onClose, onSaved }: SwmsFormModalProps) {
  const isEdit = !!initial;
  const [form, setForm] = useState({
    title: initial?.title ?? '',
    workActivity: initial?.work_activity ?? '',
    hazards: initial?.hazards ?? '',
    risks: initial?.risks ?? '',
    controls: initial?.controls ?? '',
    ppe: initial?.ppe ?? '',
    plantEquipment: initial?.plant_equipment ?? '',
    trainingCompetency: initial?.training_competency ?? '',
    emergencyControls: initial?.emergency_controls ?? '',
    environmentalControls: initial?.environmental_controls ?? '',
    signOffRequirements: initial?.sign_off_requirements ?? '',
    revisionNumber: initial?.revision_number ?? '1',
    reviewDate: initial?.review_date?.slice(0, 10) ?? '',
    status: initial?.status ?? 'draft',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim()) { setError('Title is required'); return; }
    setSaving(true); setError('');
    try {
      const url = isEdit ? `/api/safety/swms/${initial!.id}` : '/api/safety/swms';
      const method = isEdit ? 'PUT' : 'POST';
      const r = await fetch(url, {
        method, credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? 'Failed');
      onSaved(d.swms);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  const labelCls = 'block text-xs font-semibold text-slate-700 mb-1';
  const inputCls = 'w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors';
  const textareaCls = `${inputCls} resize-none`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.96 }}
        transition={{ duration: 0.15 }}
        className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto mobile-sheet"
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 sticky top-0 bg-white z-10">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-orange-50 rounded-md"><ShieldAlert size={16} className="text-primary" /></div>
            <h2 className="font-heading font-bold text-base">{isEdit ? 'Edit SWMS' : 'New SWMS Template'}</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"><X size={16} /></button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 flex flex-col gap-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className={labelCls}>Title <span className="text-red-500">*</span></label>
              <input value={form.title} onChange={(e) => set('title', e.target.value)} className={inputCls} placeholder="e.g. Working at Heights — Scaffolding" autoFocus />
            </div>
            <div className="sm:col-span-2">
              <label className={labelCls}>Work Activity</label>
              <input value={form.workActivity} onChange={(e) => set('workActivity', e.target.value)} className={inputCls} placeholder="Describe the work activity" />
            </div>
            <div>
              <label className={labelCls}>Hazards</label>
              <textarea value={form.hazards} onChange={(e) => set('hazards', e.target.value)} rows={3} className={textareaCls} placeholder="List identified hazards…" />
            </div>
            <div>
              <label className={labelCls}>Risks</label>
              <textarea value={form.risks} onChange={(e) => set('risks', e.target.value)} rows={3} className={textareaCls} placeholder="Describe the risks…" />
            </div>
            <div className="sm:col-span-2">
              <label className={labelCls}>Controls / Risk Mitigation</label>
              <textarea value={form.controls} onChange={(e) => set('controls', e.target.value)} rows={4} className={textareaCls} placeholder="Control measures to eliminate or minimise risks…" />
            </div>
            <div>
              <label className={labelCls}>PPE Required</label>
              <textarea value={form.ppe} onChange={(e) => set('ppe', e.target.value)} rows={2} className={textareaCls} placeholder="Hard hat, hi-vis, safety boots…" />
            </div>
            <div>
              <label className={labelCls}>Plant & Equipment</label>
              <textarea value={form.plantEquipment} onChange={(e) => set('plantEquipment', e.target.value)} rows={2} className={textareaCls} placeholder="List plant and equipment required…" />
            </div>
            <div>
              <label className={labelCls}>Training & Competency</label>
              <textarea value={form.trainingCompetency} onChange={(e) => set('trainingCompetency', e.target.value)} rows={2} className={textareaCls} placeholder="Required licences, tickets, training…" />
            </div>
            <div>
              <label className={labelCls}>Emergency Controls</label>
              <textarea value={form.emergencyControls} onChange={(e) => set('emergencyControls', e.target.value)} rows={2} className={textareaCls} placeholder="Emergency procedures…" />
            </div>
            <div>
              <label className={labelCls}>Environmental Controls</label>
              <textarea value={form.environmentalControls} onChange={(e) => set('environmentalControls', e.target.value)} rows={2} className={textareaCls} placeholder="Environmental protection measures…" />
            </div>
            <div>
              <label className={labelCls}>Sign-off Requirements</label>
              <textarea value={form.signOffRequirements} onChange={(e) => set('signOffRequirements', e.target.value)} rows={2} className={textareaCls} placeholder="Who must sign on before work begins…" />
            </div>
            <div>
              <label className={labelCls}>Revision Number</label>
              <input value={form.revisionNumber} onChange={(e) => set('revisionNumber', e.target.value)} className={inputCls} placeholder="1" />
            </div>
            <div>
              <label className={labelCls}>Review Date</label>
              <input type="date" value={form.reviewDate} onChange={(e) => set('reviewDate', e.target.value)} className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Status</label>
              <select value={form.status} onChange={(e) => set('status', e.target.value)} className={`${inputCls} bg-white`}>
                {SWMS_STATUSES.map((s) => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
              </select>
            </div>
          </div>

          {error && (
            <div className="flex items-center gap-2 text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm">
              <AlertCircle size={14} className="shrink-0" />{error}
            </div>
          )}

          <div className="flex gap-3 pt-2 border-t border-slate-100">
            <button type="button" onClick={onClose} disabled={saving} className="flex-1 px-4 py-2.5 border border-slate-200 rounded-lg text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-50">Cancel</button>
            <button type="submit" disabled={saving} className="flex-1 px-4 py-2.5 bg-primary hover:bg-orange-600 text-white rounded-lg text-sm font-bold transition-colors disabled:opacity-60 flex items-center justify-center gap-2">
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
              {isEdit ? 'Save Changes' : 'Create SWMS'}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}

// ── Safety Plan Form Modal ────────────────────────────────────────────────────

interface PlanFormModalProps {
  initial?: SafetyPlan | null;
  jobs: Array<{ id: number; name: string; jobNumber: string | null }>;
  onClose: () => void;
  onSaved: (p: SafetyPlan) => void;
}

function PlanFormModal({ initial, jobs, onClose, onSaved }: PlanFormModalProps) {
  const isEdit = !!initial;
  const [form, setForm] = useState({
    jobId: initial?.job_id ? String(initial.job_id) : '',
    title: initial?.title ?? '',
    projectValue: initial?.project_value ?? '',
    isPrincipalContractor: initial?.is_principal_contractor ? 'true' : 'false',
    siteAddress: initial?.site_address ?? '',
    siteSupervisor: initial?.site_supervisor ?? '',
    firstAidOfficer: initial?.first_aid_officer ?? '',
    emergencyContact: initial?.emergency_contact ?? '',
    nearestHospital: initial?.nearest_hospital ?? '',
    emergencyAssemblyPoint: initial?.emergency_assembly_point ?? '',
    evacuationNotes: initial?.evacuation_notes ?? '',
    siteRules: initial?.site_rules ?? '',
    highRiskActivities: initial?.high_risk_activities ?? '',
    status: initial?.status ?? 'draft',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim()) { setError('Title is required'); return; }
    setSaving(true); setError('');
    try {
      const url = isEdit ? `/api/safety/plans/${initial!.id}` : '/api/safety/plans';
      const method = isEdit ? 'PUT' : 'POST';
      const r = await fetch(url, {
        method, credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? 'Failed');
      onSaved(d.plan);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  const labelCls = 'block text-xs font-semibold text-slate-700 mb-1';
  const inputCls = 'w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors';
  const textareaCls = `${inputCls} resize-none`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.96 }}
        transition={{ duration: 0.15 }}
        className="relative bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto mobile-sheet"
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 sticky top-0 bg-white z-10">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-orange-50 rounded-md"><ShieldCheck size={16} className="text-primary" /></div>
            <h2 className="font-heading font-bold text-base">{isEdit ? 'Edit Safety Plan' : 'New Site Safety Plan'}</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"><X size={16} /></button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 flex flex-col gap-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="sm:col-span-2">
              <label className={labelCls}>Plan Title <span className="text-red-500">*</span></label>
              <input value={form.title} onChange={(e) => set('title', e.target.value)} className={inputCls} placeholder="e.g. Site Safety Plan — Riverside Build" autoFocus />
            </div>
            <div>
              <label className={labelCls}>Linked Job</label>
              <select value={form.jobId} onChange={(e) => set('jobId', e.target.value)} className={`${inputCls} bg-white`}>
                <option value="">— No job linked —</option>
                {jobs.map((j) => (
                  <option key={j.id} value={String(j.id)}>
                    {j.jobNumber ? `${j.jobNumber} — ` : ''}{j.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className={labelCls}>Project Value ($)</label>
              <input type="number" min="0" step="any" value={form.projectValue} onChange={(e) => set('projectValue', e.target.value)} className={inputCls} placeholder="0.00" />
            </div>
            <div className="sm:col-span-2">
              <label className="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" checked={form.isPrincipalContractor === 'true'} onChange={(e) => set('isPrincipalContractor', e.target.checked ? 'true' : 'false')} className="w-4 h-4 accent-primary" />
                <span className="text-sm font-semibold text-slate-700">Principal Contractor (project value &gt; $250,000)</span>
              </label>
            </div>
            <div className="sm:col-span-2">
              <label className={labelCls}>Site Address</label>
              <input value={form.siteAddress} onChange={(e) => set('siteAddress', e.target.value)} className={inputCls} placeholder="Full site address" />
            </div>
            <div>
              <label className={labelCls}>Site Supervisor</label>
              <input value={form.siteSupervisor} onChange={(e) => set('siteSupervisor', e.target.value)} className={inputCls} placeholder="Name" />
            </div>
            <div>
              <label className={labelCls}>First Aid Officer</label>
              <input value={form.firstAidOfficer} onChange={(e) => set('firstAidOfficer', e.target.value)} className={inputCls} placeholder="Name" />
            </div>
            <div>
              <label className={labelCls}>Emergency Contact</label>
              <input value={form.emergencyContact} onChange={(e) => set('emergencyContact', e.target.value)} className={inputCls} placeholder="Name & phone" />
            </div>
            <div>
              <label className={labelCls}>Nearest Hospital</label>
              <input value={form.nearestHospital} onChange={(e) => set('nearestHospital', e.target.value)} className={inputCls} placeholder="Hospital name & address" />
            </div>
            <div className="sm:col-span-2">
              <label className={labelCls}>Emergency Assembly Point</label>
              <input value={form.emergencyAssemblyPoint} onChange={(e) => set('emergencyAssemblyPoint', e.target.value)} className={inputCls} placeholder="Location description" />
            </div>
            <div className="sm:col-span-2">
              <label className={labelCls}>Evacuation Notes</label>
              <textarea value={form.evacuationNotes} onChange={(e) => set('evacuationNotes', e.target.value)} rows={2} className={textareaCls} placeholder="Evacuation procedures…" />
            </div>
            <div className="sm:col-span-2">
              <label className={labelCls}>Site Rules</label>
              <textarea value={form.siteRules} onChange={(e) => set('siteRules', e.target.value)} rows={3} className={textareaCls} placeholder="Site-specific rules and requirements…" />
            </div>
            <div className="sm:col-span-2">
              <label className={labelCls}>High-Risk Activities</label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 mt-1">
                {HIGH_RISK_ACTIVITIES.map((a) => {
                  const selected = form.highRiskActivities.includes(a);
                  return (
                    <label key={a} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selected}
                        onChange={(e) => {
                          const arr = form.highRiskActivities ? form.highRiskActivities.split('|') : [];
                          const next = e.target.checked ? [...arr, a] : arr.filter((x) => x !== a);
                          set('highRiskActivities', next.join('|'));
                        }}
                        className="w-3.5 h-3.5 accent-primary"
                      />
                      <span className="text-xs text-slate-700">{a}</span>
                    </label>
                  );
                })}
              </div>
            </div>
            <div>
              <label className={labelCls}>Status</label>
              <select value={form.status} onChange={(e) => set('status', e.target.value)} className={`${inputCls} bg-white`}>
                {PLAN_STATUSES.map((s) => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
              </select>
            </div>
          </div>

          {error && (
            <div className="flex items-center gap-2 text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm">
              <AlertCircle size={14} className="shrink-0" />{error}
            </div>
          )}

          <div className="flex gap-3 pt-2 border-t border-slate-100">
            <button type="button" onClick={onClose} disabled={saving} className="flex-1 px-4 py-2.5 border border-slate-200 rounded-lg text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-50">Cancel</button>
            <button type="submit" disabled={saving} className="flex-1 px-4 py-2.5 bg-primary hover:bg-orange-600 text-white rounded-lg text-sm font-bold transition-colors disabled:opacity-60 flex items-center justify-center gap-2">
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
              {isEdit ? 'Save Changes' : 'Create Plan'}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}

// ── Upload Document Modal ─────────────────────────────────────────────────────

interface UploadDocModalProps {
  endpoint: string;
  title: string;
  typeOptions: string[];
  typeField: string;
  extraFields?: React.ReactNode;
  onClose: () => void;
  onUploaded: (doc: SafetyDocument | SafetyPoster) => void;
}

function UploadDocModal({ endpoint, title, typeOptions, typeField, onClose, onUploaded }: UploadDocModalProps) {
  const [docTitle, setDocTitle] = useState('');
  const [docType, setDocType] = useState(typeOptions[0] ?? '');
  const [reviewDate, setReviewDate] = useState('');
  const [notes, setNotes] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!docTitle.trim()) { setError('Title is required'); return; }
    if (!file) { setError('Please select a file'); return; }
    setSaving(true); setError('');
    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('title', docTitle.trim());
      fd.append(typeField, docType);
      if (reviewDate) fd.append('reviewDate', reviewDate);
      if (notes) fd.append('notes', notes);
      const r = await fetch(endpoint, { method: 'POST', credentials: 'include', body: fd });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? 'Upload failed');
      onUploaded(d.document ?? d.poster);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setSaving(false);
    }
  }

  const inputCls = 'w-full px-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <motion.div
        initial={{ opacity: 0, scale: 0.96 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.96 }}
        transition={{ duration: 0.15 }}
        className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md max-h-[90vh] overflow-y-auto mobile-sheet"
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <h2 className="font-heading font-bold text-base">{title}</h2>
          <button onClick={onClose} className="p-1.5 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"><X size={16} /></button>
        </div>
        <form onSubmit={handleSubmit} className="p-6 flex flex-col gap-4">
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Title <span className="text-red-500">*</span></label>
            <input value={docTitle} onChange={(e) => setDocTitle(e.target.value)} className={inputCls} placeholder="Document title" autoFocus />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Type</label>
            <select value={docType} onChange={(e) => setDocType(e.target.value)} className={`${inputCls} bg-white`}>
              {typeOptions.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          {typeField === 'docType' && (
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Review Date</label>
              <input type="date" value={reviewDate} onChange={(e) => setReviewDate(e.target.value)} className={inputCls} />
            </div>
          )}
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">Notes</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className={`${inputCls} resize-none`} placeholder="Optional notes…" />
          </div>
          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1">File <span className="text-red-500">*</span></label>
            <div
              onClick={() => fileRef.current?.click()}
              className="border-2 border-dashed border-slate-200 rounded-xl p-6 text-center cursor-pointer hover:border-primary hover:bg-orange-50/30 transition-colors"
            >
              {file ? (
                <div className="flex items-center justify-center gap-2 text-sm font-semibold text-slate-700">
                  <FileText size={16} className="text-primary" />
                  {file.name}
                  <span className="text-xs text-slate-400">({fmtBytes(file.size)})</span>
                </div>
              ) : (
                <div>
                  <p className="text-sm font-semibold text-slate-500">Click to select file</p>
                  <p className="text-xs text-slate-400 mt-1">PDF, DOCX, PNG, JPG — max 20 MB</p>
                </div>
              )}
            </div>
            <input ref={fileRef} type="file" className="hidden" accept=".pdf,.doc,.docx,.png,.jpg,.jpeg,.xlsx,.xls,.csv,.txt,.zip" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
          </div>
          {error && (
            <div className="flex items-center gap-2 text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm">
              <AlertCircle size={14} className="shrink-0" />{error}
            </div>
          )}
          <div className="flex gap-3 pt-2 border-t border-slate-100">
            <button type="button" onClick={onClose} disabled={saving} className="flex-1 px-4 py-2.5 border border-slate-200 rounded-lg text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-50">Cancel</button>
            <button type="submit" disabled={saving} className="flex-1 px-4 py-2.5 bg-primary hover:bg-orange-600 text-white rounded-lg text-sm font-bold transition-colors disabled:opacity-60 flex items-center justify-center gap-2">
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
              Upload
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  );
}

// ── SWMS Library Tab ──────────────────────────────────────────────────────────

function SwmsLibraryTab() {
  const [swmsList, setSwmsList] = useState<SwmsTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<SwmsTemplate | null>(null);
  const [duplicating, setDuplicating] = useState<number | null>(null);
  const [seeding, setSeeding] = useState(false);
  const [seedMsg, setSeedMsg] = useState('');

  useEffect(() => {
    fetch('/api/safety/swms', { credentials: 'include' })
      .then((r) => r.json())
      .then((d) => setSwmsList(d.swms ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function handleSeed() {
    setSeeding(true); setSeedMsg('');
    try {
      const r = await fetch('/api/safety/swms/seed', { method: 'POST', credentials: 'include' });
      const d = await r.json();
      if (r.ok) {
        setSeedMsg(d.message ?? 'Templates added.');
        // Reload list
        const r2 = await fetch('/api/safety/swms', { credentials: 'include' });
        const d2 = await r2.json();
        setSwmsList(d2.swms ?? []);
      } else {
        setSeedMsg(d.error ?? 'Failed to seed templates.');
      }
    } catch {
      setSeedMsg('Failed to seed templates.');
    } finally {
      setSeeding(false);
    }
  }

  async function handleDuplicate(id: number) {
    setDuplicating(id);
    try {
      const r = await fetch(`/api/safety/swms/${id}/duplicate`, { method: 'POST', credentials: 'include' });
      const d = await r.json();
      if (r.ok && d.swms) setSwmsList((prev) => [d.swms, ...prev]);
    } finally {
      setDuplicating(null);
    }
  }

  async function handleArchive(id: number, current: string) {
    const next = current === 'archived' ? 'draft' : 'archived';
    const swms = swmsList.find((s) => s.id === id);
    if (!swms) return;
    const r = await fetch(`/api/safety/swms/${id}`, {
      method: 'PUT', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...swms, status: next }),
    });
    if (r.ok) {
      const d = await r.json();
      setSwmsList((prev) => prev.map((s) => s.id === id ? d.swms : s));
    }
  }

  const filtered = swmsList.filter((s) =>
    !search || s.title.toLowerCase().includes(search.toLowerCase()) ||
    (s.work_activity ?? '').toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search SWMS…" className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 bg-white" />
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <button
            onClick={handleSeed}
            disabled={seeding}
            className="flex items-center gap-1.5 px-3 py-2 border border-slate-200 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-50"
            title="Load 6 industry-standard SWMS templates"
          >
            {seeding ? <Loader2 size={13} className="animate-spin" /> : <BookOpen size={13} />}
            <span className="hidden sm:inline">Load Templates</span>
          </button>
          <button onClick={() => { setEditing(null); setShowModal(true); }} className="flex items-center gap-2 bg-primary hover:bg-orange-600 text-white text-sm font-bold px-4 py-2 rounded-lg transition-colors">
            <Plus size={15} /><span className="hidden sm:inline">New SWMS</span>
          </button>
        </div>
      </div>

      {seedMsg && (
        <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-lg px-3 py-2 text-sm">
          <Check size={14} className="shrink-0" />{seedMsg}
        </div>
      )}

      {loading && <div className="flex items-center justify-center py-16"><Loader2 size={22} className="animate-spin text-primary" /></div>}

      {!loading && filtered.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-14 h-14 bg-orange-50 rounded-xl flex items-center justify-center mb-4"><ShieldAlert size={24} className="text-primary" /></div>
          <p className="font-heading font-bold text-slate-700 mb-1">No SWMS templates yet</p>
          <p className="text-sm text-slate-400 mb-5 max-w-xs">Create reusable Safe Work Method Statements, or load 6 industry-standard templates to get started quickly.</p>
          <div className="flex items-center gap-3">
            <button onClick={handleSeed} disabled={seeding} className="flex items-center gap-2 border border-slate-200 text-slate-600 text-sm font-semibold px-4 py-2.5 rounded-lg hover:bg-slate-50 transition-colors disabled:opacity-50">
              {seeding ? <Loader2 size={14} className="animate-spin" /> : <BookOpen size={14} />}
              Load Templates
            </button>
            <button onClick={() => { setEditing(null); setShowModal(true); }} className="flex items-center gap-2 bg-primary hover:bg-orange-600 text-white text-sm font-bold px-5 py-2.5 rounded-lg transition-colors">
              <Plus size={15} />Create SWMS
            </button>
          </div>
        </div>
      )}

      {!loading && filtered.length > 0 && (
        <div className="flex flex-col gap-2">
          {filtered.map((s) => (
            <div key={s.id} className="bg-white border border-slate-200 rounded-xl p-4 flex items-start justify-between gap-3 hover:border-slate-300 transition-colors">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${statusBadge(s.status)}`}>
                    {s.status.charAt(0).toUpperCase() + s.status.slice(1)}
                  </span>
                  <span className="text-xs text-slate-400">Rev {s.revision_number}</span>
                  {s.review_date && <span className="text-xs text-slate-400">Review: {fmtDate(s.review_date)}</span>}
                </div>
                <h3 className="font-bold text-sm text-slate-800">{s.title}</h3>
                {s.work_activity && <p className="text-xs text-slate-500 mt-0.5 line-clamp-1">{s.work_activity}</p>}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button onClick={() => handleDuplicate(s.id)} disabled={duplicating === s.id} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors" title="Duplicate">
                  {duplicating === s.id ? <Loader2 size={14} className="animate-spin" /> : <Copy size={14} />}
                </button>
                <button onClick={() => { setEditing(s); setShowModal(true); }} className="p-1.5 rounded-lg text-slate-400 hover:text-primary hover:bg-orange-50 transition-colors" title="Edit">
                  <FileText size={14} />
                </button>
                <button onClick={() => handleArchive(s.id, s.status)} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors" title={s.status === 'archived' ? 'Unarchive' : 'Archive'}>
                  <ChevronDown size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <AnimatePresence>
        {showModal && (
          <SwmsFormModal
            initial={editing}
            onClose={() => { setShowModal(false); setEditing(null); }}
            onSaved={(s) => {
              setSwmsList((prev) => editing ? prev.map((x) => x.id === s.id ? s : x) : [s, ...prev]);
              setShowModal(false); setEditing(null);
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Safety Plans Tab ──────────────────────────────────────────────────────────

function SafetyPlansTab() {
  const [plans, setPlans] = useState<SafetyPlan[]>([]);
  const [jobs, setJobs] = useState<Array<{ id: number; name: string; jobNumber: string | null }>>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState<SafetyPlan | null>(null);
  const [seeding, setSeeding] = useState(false);
  const [seedMsg, setSeedMsg] = useState('');

  useEffect(() => {
    Promise.all([
      fetch('/api/safety/plans', { credentials: 'include' }).then((r) => r.json()),
      fetch('/api/jobs', { credentials: 'include' }).then((r) => r.json()),
    ]).then(([pd, jd]) => {
      setPlans(pd.plans ?? []);
      setJobs((jd.jobs ?? []).map((j: { id: number; name: string; jobNumber?: string | null }) => ({ id: j.id, name: j.name, jobNumber: j.jobNumber ?? null })));
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  async function handleSeed() {
    setSeeding(true); setSeedMsg('');
    try {
      const r = await fetch('/api/safety/plans/seed', { method: 'POST', credentials: 'include' });
      const d = await r.json();
      if (r.ok) {
        setSeedMsg(d.message ?? 'Plans added.');
        const r2 = await fetch('/api/safety/plans', { credentials: 'include' });
        const d2 = await r2.json();
        setPlans(d2.plans ?? []);
      } else {
        setSeedMsg(d.error ?? 'Failed to seed plans.');
      }
    } catch {
      setSeedMsg('Failed to seed plans.');
    } finally {
      setSeeding(false);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-slate-500">{plans.length} plan{plans.length !== 1 ? 's' : ''}</p>
        <div className="flex items-center gap-2">
          <button
            onClick={handleSeed}
            disabled={seeding}
            className="flex items-center gap-1.5 px-3 py-2 border border-slate-200 rounded-lg text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-50"
            title="Load 3 industry-standard Safety Plan templates"
          >
            {seeding ? <Loader2 size={13} className="animate-spin" /> : <BookOpen size={13} />}
            <span className="hidden sm:inline">Load Templates</span>
          </button>
          <button onClick={() => { setEditing(null); setShowModal(true); }} className="flex items-center gap-2 bg-primary hover:bg-orange-600 text-white text-sm font-bold px-4 py-2 rounded-lg transition-colors">
            <Plus size={15} /><span className="hidden sm:inline">New Plan</span>
          </button>
        </div>
      </div>

      {seedMsg && (
        <div className="flex items-center gap-2 bg-emerald-50 border border-emerald-200 text-emerald-700 rounded-lg px-3 py-2 text-sm">
          <Check size={14} className="shrink-0" />{seedMsg}
        </div>
      )}

      {loading && <div className="flex items-center justify-center py-16"><Loader2 size={22} className="animate-spin text-primary" /></div>}

      {!loading && plans.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-14 h-14 bg-orange-50 rounded-xl flex items-center justify-center mb-4"><ShieldCheck size={24} className="text-primary" /></div>
          <p className="font-heading font-bold text-slate-700 mb-1">No safety plans yet</p>
          <p className="text-sm text-slate-400 mb-5 max-w-xs">Create site-specific safety plans, or load 3 industry-standard templates to get started quickly.</p>
          <div className="flex items-center gap-3">
            <button onClick={handleSeed} disabled={seeding} className="flex items-center gap-2 border border-slate-200 text-slate-600 text-sm font-semibold px-4 py-2.5 rounded-lg hover:bg-slate-50 transition-colors disabled:opacity-50">
              {seeding ? <Loader2 size={14} className="animate-spin" /> : <BookOpen size={14} />}
              Load Templates
            </button>
            <button onClick={() => { setEditing(null); setShowModal(true); }} className="flex items-center gap-2 bg-primary hover:bg-orange-600 text-white text-sm font-bold px-5 py-2.5 rounded-lg transition-colors">
              <Plus size={15} />Create Plan
            </button>
          </div>
        </div>
      )}

      {!loading && plans.length > 0 && (
        <div className="flex flex-col gap-2">
          {plans.map((p) => (
            <div key={p.id} className="bg-white border border-slate-200 rounded-xl p-4 flex items-start justify-between gap-3 hover:border-slate-300 transition-colors">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${statusBadge(p.status)}`}>
                    {p.status.charAt(0).toUpperCase() + p.status.slice(1)}
                  </span>
                  {p.is_principal_contractor === 1 && (
                    <span className="text-xs font-bold px-2 py-0.5 rounded-full border bg-blue-50 text-blue-700 border-blue-200">Principal Contractor</span>
                  )}
                </div>
                <h3 className="font-bold text-sm text-slate-800">{p.title}</h3>
                <div className="flex items-center gap-3 mt-1 text-xs text-slate-500 flex-wrap">
                  {p.job_name && <span className="flex items-center gap-1"><Building2 size={10} />{p.job_number ? `${p.job_number} — ` : ''}{p.job_name}</span>}
                  {p.site_address && <span>{p.site_address}</span>}
                  {p.project_value && <span>${parseFloat(p.project_value).toLocaleString()}</span>}
                </div>
              </div>
              <button onClick={() => { setEditing(p); setShowModal(true); }} className="p-1.5 rounded-lg text-slate-400 hover:text-primary hover:bg-orange-50 transition-colors shrink-0">
                <FileText size={14} />
              </button>
            </div>
          ))}
        </div>
      )}

      <AnimatePresence>
        {showModal && (
          <PlanFormModal
            initial={editing}
            jobs={jobs}
            onClose={() => { setShowModal(false); setEditing(null); }}
            onSaved={(p) => {
              setPlans((prev) => editing ? prev.map((x) => x.id === p.id ? p : x) : [p, ...prev]);
              setShowModal(false); setEditing(null);
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Policies & Procedures Tab ─────────────────────────────────────────────────

function PoliciesTab() {
  const [docs, setDocs] = useState<SafetyDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [showUpload, setShowUpload] = useState(false);
  const [deleting, setDeleting] = useState<number | null>(null);

  useEffect(() => {
    fetch('/api/safety/documents?type=policy', { credentials: 'include' })
      .then((r) => r.json())
      .then((d) => setDocs(d.documents ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function handleDelete(id: number) {
    if (!confirm('Delete this document?')) return;
    setDeleting(id);
    try {
      await fetch(`/api/safety/documents/${id}`, { method: 'DELETE', credentials: 'include' });
      setDocs((prev) => prev.filter((d) => d.id !== id));
    } finally {
      setDeleting(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">{docs.length} document{docs.length !== 1 ? 's' : ''}</p>
        <button onClick={() => setShowUpload(true)} className="flex items-center gap-2 bg-primary hover:bg-orange-600 text-white text-sm font-bold px-4 py-2 rounded-lg transition-colors">
          <Plus size={15} /><span className="hidden sm:inline">Upload Document</span>
        </button>
      </div>

      {loading && <div className="flex items-center justify-center py-16"><Loader2 size={22} className="animate-spin text-primary" /></div>}

      {!loading && docs.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-14 h-14 bg-orange-50 rounded-xl flex items-center justify-center mb-4"><BookOpen size={24} className="text-primary" /></div>
          <p className="font-heading font-bold text-slate-700 mb-1">No policies uploaded yet</p>
          <p className="text-sm text-slate-400 mb-5 max-w-xs">Upload your WHS policies, procedures, and safety management documents.</p>
          <button onClick={() => setShowUpload(true)} className="flex items-center gap-2 bg-primary hover:bg-orange-600 text-white text-sm font-bold px-5 py-2.5 rounded-lg transition-colors">
            <Plus size={15} />Upload First Document
          </button>
        </div>
      )}

      {!loading && docs.length > 0 && (
        <div className="flex flex-col gap-2">
          {docs.map((d) => (
            <div key={d.id} className="bg-white border border-slate-200 rounded-xl p-4 flex items-center gap-3 hover:border-slate-300 transition-colors">
              <div className="w-9 h-9 bg-slate-100 rounded-lg flex items-center justify-center shrink-0">
                <FileText size={16} className="text-slate-500" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-sm text-slate-800 truncate">{d.title}</p>
                <div className="flex items-center gap-2 mt-0.5 text-xs text-slate-400 flex-wrap">
                  <span>{d.doc_type}</span>
                  <span>{fmtBytes(d.size_bytes)}</span>
                  {d.review_date && <span className="flex items-center gap-1"><Calendar size={10} />Review: {fmtDate(d.review_date)}</span>}
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <a href={`/api/safety/documents/${d.id}/download`} className="p-1.5 rounded-lg text-slate-400 hover:text-primary hover:bg-orange-50 transition-colors" title="Download">
                  <Download size={14} />
                </a>
                <button onClick={() => handleDelete(d.id)} disabled={deleting === d.id} className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors" title="Delete">
                  {deleting === d.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <AnimatePresence>
        {showUpload && (
          <UploadDocModal
            endpoint="/api/safety/documents"
            title="Upload Policy / Procedure"
            typeOptions={POLICY_TYPES}
            typeField="docType"
            onClose={() => setShowUpload(false)}
            onUploaded={(doc) => { setDocs((prev) => [doc as SafetyDocument, ...prev]); setShowUpload(false); }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Site Posters Tab ──────────────────────────────────────────────────────────

function PostersTab() {
  const [posters, setPosters] = useState<SafetyPoster[]>([]);
  const [loading, setLoading] = useState(true);
  const [showUpload, setShowUpload] = useState(false);
  const [deleting, setDeleting] = useState<number | null>(null);

  useEffect(() => {
    fetch('/api/safety/posters', { credentials: 'include' })
      .then((r) => r.json())
      .then((d) => setPosters(d.posters ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function handleDelete(id: number) {
    if (!confirm('Delete this poster?')) return;
    setDeleting(id);
    try {
      await fetch(`/api/safety/posters/${id}`, { method: 'DELETE', credentials: 'include' });
      setPosters((prev) => prev.filter((p) => p.id !== id));
    } finally {
      setDeleting(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-slate-500">{posters.length} poster{posters.length !== 1 ? 's' : ''}</p>
        <button onClick={() => setShowUpload(true)} className="flex items-center gap-2 bg-primary hover:bg-orange-600 text-white text-sm font-bold px-4 py-2 rounded-lg transition-colors">
          <Plus size={15} /><span className="hidden sm:inline">Upload Poster</span>
        </button>
      </div>

      {loading && <div className="flex items-center justify-center py-16"><Loader2 size={22} className="animate-spin text-primary" /></div>}

      {!loading && posters.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-14 h-14 bg-orange-50 rounded-xl flex items-center justify-center mb-4"><Image size={24} className="text-primary" /></div>
          <p className="font-heading font-bold text-slate-700 mb-1">No site posters yet</p>
          <p className="text-sm text-slate-400 mb-5 max-w-xs">Upload emergency contacts, risk matrix, life saving rules, and other site posters.</p>
          <button onClick={() => setShowUpload(true)} className="flex items-center gap-2 bg-primary hover:bg-orange-600 text-white text-sm font-bold px-5 py-2.5 rounded-lg transition-colors">
            <Plus size={15} />Upload First Poster
          </button>
        </div>
      )}

      {!loading && posters.length > 0 && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {posters.map((p) => (
            <div key={p.id} className="bg-white border border-slate-200 rounded-xl p-4 flex items-center gap-3 hover:border-slate-300 transition-colors">
              <div className="w-10 h-10 bg-orange-50 rounded-lg flex items-center justify-center shrink-0">
                <Image size={18} className="text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-sm text-slate-800 truncate">{p.title}</p>
                <p className="text-xs text-slate-400 mt-0.5">{p.poster_type} · {fmtBytes(p.size_bytes)}</p>
              </div>
              <button onClick={() => handleDelete(p.id)} disabled={deleting === p.id} className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors shrink-0">
                {deleting === p.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
              </button>
            </div>
          ))}
        </div>
      )}

      <AnimatePresence>
        {showUpload && (
          <UploadDocModal
            endpoint="/api/safety/posters"
            title="Upload Site Poster"
            typeOptions={POSTER_TYPES}
            typeField="posterType"
            onClose={() => setShowUpload(false)}
            onUploaded={(p) => { setPosters((prev) => [p as SafetyPoster, ...prev]); setShowUpload(false); }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Dashboard Tab ─────────────────────────────────────────────────────────────

function SafetyDashboardTab() {
  const [stats, setStats] = useState<{
    swmsTotal: number; swmsActive: number; swmsDraft: number;
    plansTotal: number; plansActive: number;
    docsTotal: number; postersTotal: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    Promise.all([
      fetch('/api/safety/swms', { credentials: 'include' }).then((r) => r.json()),
      fetch('/api/safety/plans', { credentials: 'include' }).then((r) => r.json()),
      fetch('/api/safety/documents', { credentials: 'include' }).then((r) => r.json()),
      fetch('/api/safety/posters', { credentials: 'include' }).then((r) => r.json()),
    ]).then(([sw, pl, dc, po]) => {
      const swmsList: SwmsTemplate[] = sw.swms ?? [];
      const plansList: SafetyPlan[] = pl.plans ?? [];
      setStats({
        swmsTotal: swmsList.length,
        swmsActive: swmsList.filter((s) => s.status === 'active').length,
        swmsDraft: swmsList.filter((s) => s.status === 'draft').length,
        plansTotal: plansList.length,
        plansActive: plansList.filter((p) => p.status === 'active').length,
        docsTotal: (dc.documents ?? []).length,
        postersTotal: (po.posters ?? []).length,
      });
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="flex items-center justify-center py-16"><Loader2 size={22} className="animate-spin text-primary" /></div>;

  const cards = [
    { label: 'SWMS Templates', value: stats?.swmsTotal ?? 0, sub: `${stats?.swmsActive ?? 0} active`, icon: ShieldAlert, color: 'text-primary', bg: 'bg-orange-50' },
    { label: 'Safety Plans', value: stats?.plansTotal ?? 0, sub: `${stats?.plansActive ?? 0} active`, icon: ShieldCheck, color: 'text-emerald-600', bg: 'bg-emerald-50' },
    { label: 'Policies & Docs', value: stats?.docsTotal ?? 0, sub: 'uploaded', icon: BookOpen, color: 'text-blue-600', bg: 'bg-blue-50' },
    { label: 'Site Posters', value: stats?.postersTotal ?? 0, sub: 'uploaded', icon: Image, color: 'text-purple-600', bg: 'bg-purple-50' },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {cards.map((c) => {
          const Icon = c.icon;
          return (
            <div key={c.label} className="bg-white border border-slate-200 rounded-xl p-4">
              <div className={`w-9 h-9 ${c.bg} rounded-lg flex items-center justify-center mb-3`}>
                <Icon size={18} className={c.color} />
              </div>
              <div className={`text-2xl font-black ${c.color}`}>{c.value}</div>
              <div className="text-xs font-bold text-slate-700 mt-0.5">{c.label}</div>
              <div className="text-xs text-slate-400">{c.sub}</div>
            </div>
          );
        })}
      </div>

      {stats?.swmsDraft && stats.swmsDraft > 0 ? (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-center gap-3">
          <AlertTriangle size={18} className="text-amber-600 shrink-0" />
          <div>
            <p className="text-sm font-bold text-amber-800">{stats.swmsDraft} SWMS template{stats.swmsDraft !== 1 ? 's' : ''} in draft</p>
            <p className="text-xs text-amber-700">Review and activate SWMS templates before assigning to jobs.</p>
          </div>
        </div>
      ) : null}

      <div className="bg-white border border-slate-200 rounded-xl p-5">
        <h3 className="font-heading font-bold text-sm text-slate-700 mb-3">Quick Links</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {[
            { label: 'SWMS Library', desc: 'Manage reusable SWMS templates', icon: ShieldAlert },
            { label: 'Site Safety Plans', desc: 'Job-specific safety plans', icon: ShieldCheck },
            { label: 'Policies & Procedures', desc: 'Company safety documents', icon: BookOpen },
            { label: 'Site Posters', desc: 'Emergency contacts, risk matrix', icon: Image },
          ].map((item) => {
            const Icon = item.icon;
            return (
              <div key={item.label} className="flex items-center gap-3 p-3 rounded-lg border border-slate-100 hover:border-primary/30 hover:bg-orange-50/30 transition-colors">
                <div className="w-8 h-8 bg-orange-50 rounded-lg flex items-center justify-center shrink-0">
                  <Icon size={15} className="text-primary" />
                </div>
                <div>
                  <p className="text-sm font-bold text-slate-700">{item.label}</p>
                  <p className="text-xs text-slate-400">{item.desc}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-xl p-4 flex items-start gap-3">
        <ExternalLink size={16} className="text-blue-600 shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-bold text-blue-800">Coming Next Phase</p>
          <p className="text-xs text-blue-700 mt-0.5">PDF generation, DOCX export, Dazza AI safety drafting assistant, SWMS suggestion from job scope, and safety plan pack generator.</p>
        </div>
      </div>
    </div>
  );
}

// ── Main Safety Page ──────────────────────────────────────────────────────────

const TABS = [
  { id: 'dashboard', label: 'Dashboard',   icon: ShieldCheck },
  { id: 'swms',      label: 'SWMS Library', icon: ShieldAlert },
  { id: 'plans',     label: 'Safety Plans', icon: ClipboardList },
  { id: 'policies',  label: 'Policies',     icon: BookOpen },
  { id: 'posters',   label: 'Posters',      icon: Image },
] as const;

type TabId = typeof TABS[number]['id'];

export default function SafetyPage() {
  const [activeTab, setActiveTab] = useState<TabId>('dashboard');
  const { me } = useMe();

  function openMobileMenu() {
    window.dispatchEvent(new Event('portal:open-menu'));
  }

  // Run migration on mount
  useEffect(() => {
    fetch('/api/migrate-safety', { method: 'POST', credentials: 'include' }).catch(() => {});
  }, []);

  return (
    <div className="portal-page">
      <Helmet>
        <title>Safety — IWILLBUILD Portal</title>
        <meta name="description" content="Safety management — SWMS, site safety plans, policies, procedures and site posters." />
        <link rel="canonical" href="https://iwillbuild.com/safety" />
        <meta name="robots" content="noindex" />
      </Helmet>

      <PortalSidebar />

      <div className="portal-main">
        {/* Header */}
        <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-4 md:px-6 shrink-0">
          <div className="flex items-center gap-3">
            <button onClick={openMobileMenu} className="md:hidden p-2 -ml-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors" aria-label="Open menu">
              <Menu size={20} />
            </button>
            <ShieldAlert size={18} className="text-primary shrink-0" />
            <h1 className="font-heading font-bold text-base md:text-lg">Safety</h1>
          </div>
        </header>

        {/* Tab bar */}
        <div className="bg-white border-b border-slate-200 px-4 md:px-6 shrink-0">
          <div className="scroll-x-hide flex gap-1 py-2">
            {TABS.map(({ id, label, icon: Icon }) => (
              <button
                key={id}
                onClick={() => setActiveTab(id)}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap ${
                  activeTab === id
                    ? 'bg-slate-900 text-white'
                    : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100'
                }`}
              >
                <Icon size={13} />
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 md:p-6">
          <motion.div
            key={activeTab}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
          >
            {activeTab === 'dashboard' && <SafetyDashboardTab />}
            {activeTab === 'swms'      && <SwmsLibraryTab />}
            {activeTab === 'plans'     && <SafetyPlansTab />}
            {activeTab === 'policies'  && <PoliciesTab />}
            {activeTab === 'posters'   && <PostersTab />}
          </motion.div>
        </div>
      </div>
    </div>
  );
}
