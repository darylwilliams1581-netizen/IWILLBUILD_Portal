import { useState, useEffect, useRef, useCallback } from 'react';
import { Helmet } from '@dr.pogodin/react-helmet';
import { motion, AnimatePresence } from 'motion/react';
import {
  ShieldAlert, ShieldCheck, FileText, AlertTriangle, Plus, Search,
  Loader2, X, Check, ChevronRight, Download, Trash2, Copy,
  ClipboardList, BookOpen, Image, Menu, AlertCircle, ExternalLink,
  Users, Calendar, Building2, ChevronDown, Wand2, Bot, Send,
  Sparkles, FileDown, Package, RefreshCw, Printer, CheckSquare, Square,
  HardHat, ChevronLeft,
} from 'lucide-react';
import PortalSidebar from '@/components/PortalSidebar';
import SafetyPosterGenerator from '@/components/SafetyPosterGenerator';
import PPEBanner from '@/components/safety-posters/PPEBanner';

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

interface GeneratedPoster {
  id: number;
  title: string;
  poster_type: string;
  data_json: string;
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
const JOB_SWMS_STATUSES = ['draft', 'reviewed', 'approved', 'archived'] as const;

function statusBadge(status: string) {
  const map: Record<string, string> = {
    draft: 'bg-amber-50 text-amber-700 border-amber-200',
    active: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    reviewed: 'bg-blue-50 text-blue-700 border-blue-200',
    approved: 'bg-emerald-50 text-emerald-700 border-emerald-200',
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

  const labelCls = 'block text-xs font-bold text-slate-600 uppercase tracking-wide mb-1.5';
  const inputCls = 'w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors bg-white';
  const textareaCls = `${inputCls} resize-y`;
  const sectionHeadCls = 'flex items-center gap-2 text-xs font-bold text-slate-400 uppercase tracking-widest mb-3 mt-1';

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <motion.div
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 40 }}
        transition={{ duration: 0.2, ease: 'easeOut' }}
        className="relative bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-3xl max-h-[95vh] sm:max-h-[92vh] flex flex-col"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 bg-orange-50 rounded-md"><ShieldAlert size={16} className="text-primary" /></div>
            <div>
              <h2 className="font-heading font-bold text-base leading-tight">{isEdit ? 'Edit SWMS' : 'New SWMS Template'}</h2>
              <p className="text-xs text-slate-400 mt-0.5">Safe Work Method Statement</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"><X size={16} /></button>
        </div>

        {/* Scrollable body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto">
          <div className="p-6 flex flex-col gap-6">

            {/* ── Identity ── */}
            <div>
              <p className={sectionHeadCls}><span className="w-5 h-px bg-slate-200 inline-block" />Identity<span className="flex-1 h-px bg-slate-200 inline-block" /></p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="sm:col-span-3">
                  <label className={labelCls}>Title <span className="text-red-500">*</span></label>
                  <input value={form.title} onChange={(e) => set('title', e.target.value)} className={inputCls} placeholder="e.g. Working at Heights — Scaffolding" autoFocus />
                </div>
                <div className="sm:col-span-3">
                  <label className={labelCls}>Work Activity</label>
                  <input value={form.workActivity} onChange={(e) => set('workActivity', e.target.value)} className={inputCls} placeholder="Describe the specific work activity covered by this SWMS" />
                </div>
                <div>
                  <label className={labelCls}>Revision No.</label>
                  <input value={form.revisionNumber} onChange={(e) => set('revisionNumber', e.target.value)} className={inputCls} placeholder="1" />
                </div>
                <div>
                  <label className={labelCls}>Review Date</label>
                  <input type="date" value={form.reviewDate} onChange={(e) => set('reviewDate', e.target.value)} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Status</label>
                  <select value={form.status} onChange={(e) => set('status', e.target.value)} className={inputCls}>
                    {SWMS_STATUSES.map((s) => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
                  </select>
                </div>
              </div>
            </div>

            {/* ── Hazard & Risk ── */}
            <div>
              <p className={sectionHeadCls}><span className="w-5 h-px bg-slate-200 inline-block" />Hazard &amp; Risk<span className="flex-1 h-px bg-slate-200 inline-block" /></p>
              <div className="flex flex-col gap-4">
                <div>
                  <label className={labelCls}>Hazards</label>
                  <textarea value={form.hazards} onChange={(e) => set('hazards', e.target.value)} rows={6} className={textareaCls} placeholder={"• Contact with rotating parts\n• Flying debris\n• Electric shock from damaged tools"} />
                </div>
                <div>
                  <label className={labelCls}>Risks</label>
                  <textarea value={form.risks} onChange={(e) => set('risks', e.target.value)} rows={6} className={textareaCls} placeholder={"• Laceration or amputation — HIGH\n• Eye injury from flying debris — HIGH\n• Electric shock — HIGH"} />
                </div>
                <div>
                  <label className={labelCls}>Controls / Risk Mitigation</label>
                  <textarea value={form.controls} onChange={(e) => set('controls', e.target.value)} rows={7} className={textareaCls} placeholder={"• Inspect all tools before use; remove from service any damaged tool\n• Use the correct tool for the task\n• Ensure all guards are in place before use\n• Isolate and tag out defective equipment"} />
                </div>
              </div>
            </div>

            {/* ── Requirements ── */}
            <div>
              <p className={sectionHeadCls}><span className="w-5 h-px bg-slate-200 inline-block" />Requirements<span className="flex-1 h-px bg-slate-200 inline-block" /></p>
              <div className="grid grid-cols-1 gap-4">
                <div>
                  <label className={labelCls}>PPE Required</label>
                  <textarea value={form.ppe} onChange={(e) => set('ppe', e.target.value)} rows={5} className={textareaCls} placeholder={"• Safety glasses or goggles (mandatory)\n• Face shield for grinding\n• Hearing protection\n• Steel-capped boots\n• Hi-vis vest"} />
                </div>
                <div>
                  <label className={labelCls}>Plant &amp; Equipment</label>
                  <textarea value={form.plantEquipment} onChange={(e) => set('plantEquipment', e.target.value)} rows={5} className={textareaCls} placeholder={"• Portable power tools (grinders, drills, saws)\n• Extension leads — heavy duty\n• RCD / safety switch\n• Tool storage / carry cases"} />
                </div>
                <div>
                  <label className={labelCls}>Training &amp; Competency</label>
                  <textarea value={form.trainingCompetency} onChange={(e) => set('trainingCompetency', e.target.value)} rows={5} className={textareaCls} placeholder={"• Competency in operation of specific tools\n• White Card (General Construction Induction)\n• Tool-specific training records on file"} />
                </div>
                <div>
                  <label className={labelCls}>Sign-off Requirements</label>
                  <textarea value={form.signOffRequirements} onChange={(e) => set('signOffRequirements', e.target.value)} rows={5} className={textareaCls} placeholder={"• All workers must read and sign this SWMS before commencing work\n• Supervisor to countersign"} />
                </div>
              </div>
            </div>

            {/* ── Response & Environment ── */}
            <div>
              <p className={sectionHeadCls}><span className="w-5 h-px bg-slate-200 inline-block" />Response &amp; Environment<span className="flex-1 h-px bg-slate-200 inline-block" /></p>
              <div className="grid grid-cols-1 gap-4">
                <div>
                  <label className={labelCls}>Emergency Controls</label>
                  <textarea value={form.emergencyControls} onChange={(e) => set('emergencyControls', e.target.value)} rows={5} className={textareaCls} placeholder={"• First aid kit accessible at all times\n• Nearest hospital: [name & address]\n• Emergency contact: [name & phone]\n• Call 000 for serious injury"} />
                </div>
                <div>
                  <label className={labelCls}>Environmental Controls</label>
                  <textarea value={form.environmentalControls} onChange={(e) => set('environmentalControls', e.target.value)} rows={5} className={textareaCls} placeholder={"• Contain and dispose of waste correctly\n• Prevent dust and debris leaving site\n• No discharge to stormwater"} />
                </div>
              </div>
            </div>

          </div>

          {/* Footer */}
          <div className="px-6 pb-6 flex flex-col gap-3">
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
  const [printing, setPrinting] = useState<SwmsTemplate | null>(null);

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
                <button onClick={() => setPrinting(s)} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors" title="Print / PDF">
                  <Printer size={14} />
                </button>
                <a href={`/api/safety/swms/${s.id}/export?format=pdf`} target="_blank" rel="noopener noreferrer" className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors" title="Export PDF">
                  <FileDown size={14} />
                </a>
                <a href={`/api/safety/swms/${s.id}/export?format=docx`} target="_blank" rel="noopener noreferrer" className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors" title="Export DOCX">
                  <FileText size={14} />
                </a>
                <button onClick={() => { setEditing(s); setShowModal(true); }} className="p-1.5 rounded-lg text-slate-400 hover:text-primary hover:bg-orange-50 transition-colors" title="Edit">
                  <Wand2 size={14} />
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
        {printing && <SwmsPrintModal swms={printing} onClose={() => setPrinting(null)} />}
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
  const [deleting, setDeleting] = useState<number | null>(null);

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

  async function handleDelete(id: number, title: string) {
    if (!confirm(`Delete "${title}"? This cannot be undone.`)) return;
    setDeleting(id);
    try {
      const r = await fetch(`/api/safety/plans/${id}`, { method: 'DELETE', credentials: 'include' });
      if (r.ok) {
        setPlans((prev) => prev.filter((p) => p.id !== id));
      } else {
        const d = await r.json();
        alert(d.error ?? 'Failed to delete plan.');
      }
    } catch {
      alert('Failed to delete plan.');
    } finally {
      setDeleting(null);
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
              <div className="flex items-center gap-1 shrink-0">
                <a href={`/api/safety/plans/${p.id}/pack`} target="_blank" rel="noopener noreferrer" className="p-1.5 rounded-lg text-slate-400 hover:text-emerald-600 hover:bg-emerald-50 transition-colors" title="Download Safety Pack (Plan + all SWMS)">
                  <Package size={14} />
                </a>
                <a href={`/api/safety/plans/${p.id}/export?format=pdf`} target="_blank" rel="noopener noreferrer" className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors" title="Export PDF">
                  <FileDown size={14} />
                </a>
                <a href={`/api/safety/plans/${p.id}/export?format=docx`} target="_blank" rel="noopener noreferrer" className="p-1.5 rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors" title="Export DOCX">
                  <FileText size={14} />
                </a>
                <button onClick={() => { setEditing(p); setShowModal(true); }} className="p-1.5 rounded-lg text-slate-400 hover:text-primary hover:bg-orange-50 transition-colors" title="Edit">
                  <Wand2 size={14} />
                </button>
                <button onClick={() => handleDelete(p.id, p.title)} disabled={deleting === p.id} className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors" title="Delete plan">
                  {deleting === p.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                </button>
              </div>
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
  const [generated, setGenerated] = useState<GeneratedPoster[]>([]);
  const [loading, setLoading] = useState(true);
  const [showUpload, setShowUpload] = useState(false);
  const [showGenerator, setShowGenerator] = useState(false);
  const [deleting, setDeleting] = useState<number | null>(null);
  const [deletingGen, setDeletingGen] = useState<number | null>(null);

  useEffect(() => {
    Promise.all([
      fetch('/api/safety/posters', { credentials: 'include' }).then((r) => r.json()),
      fetch('/api/safety/generated-posters', { credentials: 'include' }).then((r) => r.json()),
    ]).then(([pd, gd]) => {
      setPosters(pd.posters ?? []);
      setGenerated(gd.posters ?? []);
    }).catch(() => {}).finally(() => setLoading(false));
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

  async function handleDeleteGenerated(id: number) {
    if (!confirm('Delete this generated poster?')) return;
    setDeletingGen(id);
    try {
      await fetch(`/api/safety/generated-posters/${id}`, { method: 'DELETE', credentials: 'include' });
      setGenerated((prev) => prev.filter((p) => p.id !== id));
    } finally {
      setDeletingGen(null);
    }
  }

  const totalCount = posters.length + generated.length;

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-slate-500">{totalCount} poster{totalCount !== 1 ? 's' : ''}</p>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowGenerator(true)}
            className="flex items-center gap-1.5 px-3 py-2 bg-primary hover:bg-orange-600 text-white rounded-lg text-sm font-bold transition-colors"
          >
            <Wand2 size={14} /><span className="hidden sm:inline">Generate Poster</span>
          </button>
          <button onClick={() => setShowUpload(true)} className="flex items-center gap-2 border border-slate-200 text-slate-600 text-sm font-semibold px-3 py-2 rounded-lg hover:bg-slate-50 transition-colors">
            <Plus size={14} /><span className="hidden sm:inline">Upload</span>
          </button>
        </div>
      </div>

      {loading && <div className="flex items-center justify-center py-16"><Loader2 size={22} className="animate-spin text-primary" /></div>}

      {!loading && totalCount === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-14 h-14 bg-orange-50 rounded-xl flex items-center justify-center mb-4"><Image size={24} className="text-primary" /></div>
          <p className="font-heading font-bold text-slate-700 mb-1">No site posters yet</p>
          <p className="text-sm text-slate-400 mb-5 max-w-xs">Generate professional safety posters — risk matrix, emergency contacts, PPE, life saving rules, and more.</p>
          <div className="flex items-center gap-3">
            <button onClick={() => setShowGenerator(true)} className="flex items-center gap-2 bg-primary hover:bg-orange-600 text-white text-sm font-bold px-5 py-2.5 rounded-lg transition-colors">
              <Wand2 size={14} />Generate Poster
            </button>
            <button onClick={() => setShowUpload(true)} className="flex items-center gap-2 border border-slate-200 text-slate-600 text-sm font-semibold px-4 py-2.5 rounded-lg hover:bg-slate-50 transition-colors">
              <Plus size={14} />Upload Poster
            </button>
          </div>
        </div>
      )}

      {/* Generated posters */}
      {!loading && generated.length > 0 && (
        <div>
          <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 px-1">Generated Posters</div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {generated.map((p) => (
              <div key={p.id} className="bg-white border border-slate-200 rounded-xl p-4 flex items-center gap-3 hover:border-slate-300 transition-colors">
                <div className="w-10 h-10 bg-orange-50 rounded-lg flex items-center justify-center shrink-0">
                  <Wand2 size={16} className="text-primary" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-sm text-slate-800 truncate">{p.title}</p>
                  <p className="text-xs text-slate-400 mt-0.5 capitalize">{p.poster_type.replace(/_/g, ' ')} · Generated</p>
                </div>
                <button onClick={() => handleDeleteGenerated(p.id)} disabled={deletingGen === p.id} className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors shrink-0">
                  {deletingGen === p.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Uploaded posters */}
      {!loading && posters.length > 0 && (
        <div>
          {generated.length > 0 && <div className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-2 px-1 mt-2">Uploaded Posters</div>}
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
        {showGenerator && (
          <SafetyPosterGenerator
            onClose={() => setShowGenerator(false)}
            onSaved={(p) => { setGenerated((prev) => [p as GeneratedPoster, ...prev]); setShowGenerator(false); }}
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

      <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 flex items-start gap-3">
        <Sparkles size={16} className="text-primary shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-bold text-orange-800">Dazza AI Safety Assistant</p>
          <p className="text-xs text-orange-700 mt-0.5">Use the AI tab to draft SWMS documents, get SWMS suggestions from your job scope, and generate safety plan content — all powered by GPT-4o.</p>
        </div>
      </div>
    </div>
  );
}

// ── Dazza Safety AI Tab ───────────────────────────────────────────────────────

type AiMode = 'swms' | 'plan' | 'suggest';

interface AiMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

interface SwmsSuggestion {
  title: string;
  work_activity: string;
  reason: string;
}

const AI_MODES: Array<{ id: AiMode; label: string; icon: typeof Bot; desc: string; placeholder: string }> = [
  {
    id: 'swms',
    label: 'Draft SWMS',
    icon: ShieldAlert,
    desc: 'Describe a work activity and Dazza will draft a full SWMS with hazards, controls, PPE and legislation.',
    placeholder: 'e.g. Excavation work adjacent to existing services on a residential site in Queensland…',
  },
  {
    id: 'suggest',
    label: 'Suggest SWMS',
    icon: Sparkles,
    desc: 'Paste your job scope or description and Dazza will identify which SWMS documents you need.',
    placeholder: 'e.g. Two-storey residential build including slab, framing, roofing, electrical rough-in, plumbing, tiling and painting…',
  },
  {
    id: 'plan',
    label: 'Draft Safety Plan',
    icon: ClipboardList,
    desc: 'Get help drafting site rules, emergency procedures, high-risk activity lists and other safety plan sections.',
    placeholder: 'e.g. Write site rules for a commercial fitout in a live shopping centre with public access…',
  },
];

function DazzaAiTab() {
  const [mode, setMode] = useState<AiMode>('swms');
  const [messages, setMessages] = useState<AiMessage[]>([]);
  const [input, setInput] = useState('');
  const [streaming, setStreaming] = useState(false);
  const [suggestions, setSuggestions] = useState<SwmsSuggestion[]>([]);
  const [draftJson, setDraftJson] = useState<Record<string, string> | null>(null);
  const [copyMsg, setCopyMsg] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const currentMode = AI_MODES.find((m) => m.id === mode)!;

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streaming]);

  function clearChat() {
    setMessages([]);
    setSuggestions([]);
    setDraftJson(null);
    setCopyMsg('');
  }

  async function handleSend() {
    const prompt = input.trim();
    if (!prompt || streaming) return;
    setInput('');
    setSuggestions([]);
    setDraftJson(null);

    const userMsg: AiMessage = { id: Date.now().toString(), role: 'user', content: prompt };
    setMessages((prev) => [...prev, userMsg]);
    setStreaming(true);

    const assistantId = (Date.now() + 1).toString();
    setMessages((prev) => [...prev, { id: assistantId, role: 'assistant', content: '' }]);

    try {
      const res = await fetch('/api/safety/ai/draft', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ mode, prompt }),
      });

      if (!res.ok) {
        const err = await res.json() as { error?: string };
        setMessages((prev) => prev.map((m) => m.id === assistantId ? { ...m, content: `Error: ${err.error ?? 'Request failed'}` } : m));
        setStreaming(false);
        return;
      }

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let fullText = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        const chunk = decoder.decode(value);
        const lines = chunk.split('\n');
        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6).trim();
          if (data === '[DONE]') break;
          try {
            const parsed = JSON.parse(data) as { delta?: string; error?: string };
            if (parsed.delta) {
              fullText += parsed.delta;
              setMessages((prev) => prev.map((m) => m.id === assistantId ? { ...m, content: fullText } : m));
            }
          } catch { /* skip */ }
        }
      }

      // Parse structured output
      if (mode === 'suggest') {
        try {
          const jsonMatch = fullText.match(/\[[\s\S]*\]/);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]) as SwmsSuggestion[];
            setSuggestions(parsed);
          }
        } catch { /* raw text fallback */ }
      } else if (mode === 'swms') {
        try {
          const jsonMatch = fullText.match(/\{[\s\S]*\}/);
          if (jsonMatch) {
            const parsed = JSON.parse(jsonMatch[0]) as Record<string, string>;
            setDraftJson(parsed);
          }
        } catch { /* raw text fallback */ }
      }
    } catch (err) {
      setMessages((prev) => prev.map((m) => m.id === assistantId ? { ...m, content: 'Connection error. Please try again.' } : m));
    } finally {
      setStreaming(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  async function copyDraft() {
    if (!draftJson) return;
    const text = Object.entries(draftJson).map(([k, v]) => `${k.replace(/_/g, ' ').toUpperCase()}\n${v}`).join('\n\n');
    await navigator.clipboard.writeText(text);
    setCopyMsg('Copied!');
    setTimeout(() => setCopyMsg(''), 2000);
  }

  return (
    <div className="flex flex-col gap-4 max-w-3xl">
      {/* Mode selector */}
      <div className="flex gap-2 flex-wrap">
        {AI_MODES.map((m) => {
          const Icon = m.icon;
          return (
            <button
              key={m.id}
              onClick={() => { setMode(m.id); clearChat(); }}
              className={`flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold transition-colors border ${
                mode === m.id
                  ? 'bg-slate-900 text-white border-slate-900'
                  : 'bg-white text-slate-600 border-slate-200 hover:border-slate-300 hover:bg-slate-50'
              }`}
            >
              <Icon size={13} />
              {m.label}
            </button>
          );
        })}
        {messages.length > 0 && (
          <button onClick={clearChat} className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold text-slate-400 hover:text-slate-600 border border-slate-200 hover:bg-slate-50 transition-colors ml-auto">
            <RefreshCw size={12} />Clear
          </button>
        )}
      </div>

      {/* Mode description */}
      <div className="bg-orange-50 border border-orange-100 rounded-xl p-4 flex items-start gap-3">
        <Bot size={16} className="text-primary shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-bold text-orange-900">{currentMode.label}</p>
          <p className="text-xs text-orange-700 mt-0.5">{currentMode.desc}</p>
        </div>
      </div>

      {/* Chat messages */}
      {messages.length > 0 && (
        <div className="flex flex-col gap-3 bg-white border border-slate-200 rounded-xl p-4 max-h-[480px] overflow-y-auto">
          {messages.map((msg) => (
            <div key={msg.id} className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>
              <div className={`w-7 h-7 rounded-full flex items-center justify-center shrink-0 ${msg.role === 'user' ? 'bg-slate-800' : 'bg-primary'}`}>
                {msg.role === 'user' ? <Users size={13} className="text-white" /> : <Bot size={13} className="text-white" />}
              </div>
              <div className={`flex-1 min-w-0 rounded-xl px-4 py-3 text-sm leading-relaxed whitespace-pre-wrap ${
                msg.role === 'user' ? 'bg-slate-100 text-slate-800' : 'bg-slate-50 text-slate-700 border border-slate-200'
              }`}>
                {msg.content || (streaming && msg.role === 'assistant' ? <span className="inline-flex gap-1"><span className="w-1.5 h-1.5 bg-primary rounded-full animate-bounce" style={{ animationDelay: '0ms' }} /><span className="w-1.5 h-1.5 bg-primary rounded-full animate-bounce" style={{ animationDelay: '150ms' }} /><span className="w-1.5 h-1.5 bg-primary rounded-full animate-bounce" style={{ animationDelay: '300ms' }} /></span> : '')}
              </div>
            </div>
          ))}
          <div ref={bottomRef} />
        </div>
      )}

      {/* SWMS Suggestions structured output */}
      {suggestions.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl p-4">
          <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Suggested SWMS Documents ({suggestions.length})</p>
          <div className="flex flex-col gap-2">
            {suggestions.map((s, i) => (
              <div key={i} className="flex items-start gap-3 p-3 bg-orange-50 border border-orange-100 rounded-lg">
                <div className="w-6 h-6 bg-primary rounded-full flex items-center justify-center shrink-0 mt-0.5">
                  <ShieldAlert size={12} className="text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-bold text-slate-800">{s.title}</p>
                  {s.work_activity && <p className="text-xs text-slate-500 mt-0.5">{s.work_activity}</p>}
                  {s.reason && <p className="text-xs text-orange-700 mt-1 italic">{s.reason}</p>}
                </div>
              </div>
            ))}
          </div>
          <p className="text-xs text-slate-400 mt-3">Go to SWMS Library → New SWMS to create each of these documents.</p>
        </div>
      )}

      {/* SWMS Draft structured output */}
      {draftJson && (
        <div className="bg-white border border-emerald-200 rounded-xl p-4">
          <div className="flex items-center justify-between mb-3">
            <p className="text-xs font-bold text-emerald-700 uppercase tracking-wider">Draft SWMS Ready</p>
            <button onClick={copyDraft} className="flex items-center gap-1.5 text-xs font-semibold text-emerald-700 hover:text-emerald-900 transition-colors">
              {copyMsg ? <Check size={12} /> : <Copy size={12} />}
              {copyMsg || 'Copy all'}
            </button>
          </div>
          <div className="flex flex-col gap-3">
            {Object.entries(draftJson).map(([key, val]) => (
              <div key={key}>
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-1">{key.replace(/_/g, ' ')}</p>
                <p className="text-sm text-slate-700 leading-relaxed">{val}</p>
              </div>
            ))}
          </div>
          <p className="text-xs text-slate-400 mt-4">Go to SWMS Library → New SWMS and paste this content to create the document.</p>
        </div>
      )}

      {/* Input */}
      <div className="bg-white border border-slate-200 rounded-xl p-3 flex gap-3 items-end">
        <textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={currentMode.placeholder}
          rows={3}
          disabled={streaming}
          className="flex-1 resize-none text-sm text-slate-700 placeholder:text-slate-400 focus:outline-none disabled:opacity-50 leading-relaxed"
        />
        <button
          onClick={handleSend}
          disabled={!input.trim() || streaming}
          className="flex items-center gap-1.5 bg-primary hover:bg-orange-600 disabled:opacity-40 text-white text-xs font-bold px-4 py-2.5 rounded-lg transition-colors shrink-0"
        >
          {streaming ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
          {streaming ? 'Thinking…' : 'Ask Dazza'}
        </button>
      </div>
      <p className="text-xs text-slate-400 -mt-2">Requires OpenAI API key configured in settings. Press Enter to send, Shift+Enter for new line.</p>
    </div>
  );
}

// ── SWMS Print Modal ──────────────────────────────────────────────────────────

interface SwmsPrintData {
  title: string;
  work_activity?: string | null;
  revision_number?: string;
  review_date?: string | null;
  status?: string;
  hazards?: string | null;
  risks?: string | null;
  controls?: string | null;
  ppe?: string | null;
  plant_equipment?: string | null;
  training_competency?: string | null;
  emergency_controls?: string | null;
  environmental_controls?: string | null;
  sign_off_requirements?: string | null;
  permits_approvals?: string | null;
  monitoring_review?: string | null;
  notes?: string | null;
  // job context (optional)
  job_name?: string | null;
  job_number?: string | null;
  client_name?: string | null;
  job_site_address?: string | null;
  supervisor?: string | null;
}

function nl2bullets(text: string | null | undefined) {
  if (!text?.trim()) return null;
  const lines = text.split('\n').map((l) => l.replace(/^[-•*]\s*/, '').trim()).filter(Boolean);
  if (lines.length === 0) return null;
  return lines;
}

function PrintSection({ title, content }: { title: string; content: string | null | undefined }) {
  const bullets = nl2bullets(content);
  if (!bullets) return null;
  return (
    <div className="mb-4">
      <h3 className="text-xs font-bold uppercase tracking-widest text-slate-500 border-b border-slate-200 pb-1 mb-2">{title}</h3>
      <ul className="list-none space-y-0.5">
        {bullets.map((b, i) => (
          <li key={i} className="text-xs text-slate-700 flex gap-2">
            <span className="text-slate-400 shrink-0 mt-0.5">•</span>
            <span>{b}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function SwmsPrintModal({ swms, onClose }: { swms: SwmsPrintData; onClose: () => void }) {
  const printRef = useRef<HTMLDivElement>(null);

  function handlePrint() {
    const content = printRef.current;
    if (!content) return;
    const win = window.open('', '_blank', 'width=900,height=700');
    if (!win) return;
    win.document.write(`<!DOCTYPE html><html><head>
      <title>SWMS — ${swms.title}</title>
      <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: Arial, Helvetica, sans-serif; font-size: 11px; color: #1e293b; background: #fff; padding: 20mm 18mm; }
        .print-root { max-width: 100%; }
        .header-bar { background: #0f172a; color: #fff; padding: 12px 16px; border-radius: 4px; margin-bottom: 16px; display: flex; justify-content: space-between; align-items: flex-start; }
        .header-bar h1 { font-size: 16px; font-weight: 800; letter-spacing: -0.3px; }
        .header-bar .sub { font-size: 10px; opacity: 0.7; margin-top: 2px; }
        .header-bar .badge { background: #f97316; color: #fff; font-size: 9px; font-weight: 700; padding: 3px 8px; border-radius: 20px; white-space: nowrap; }
        .meta-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-bottom: 16px; }
        .meta-cell { border: 1px solid #e2e8f0; border-radius: 4px; padding: 6px 10px; }
        .meta-cell .label { font-size: 8px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: #94a3b8; margin-bottom: 2px; }
        .meta-cell .value { font-size: 11px; font-weight: 600; color: #1e293b; }
        .section-title { font-size: 8px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; color: #64748b; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px; margin-bottom: 6px; margin-top: 14px; }
        ul.bullets { list-style: none; padding: 0; }
        ul.bullets li { display: flex; gap: 6px; margin-bottom: 3px; font-size: 10.5px; color: #334155; }
        ul.bullets li::before { content: "•"; color: #94a3b8; flex-shrink: 0; }
        .two-col { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
        .divider { border: none; border-top: 1px solid #e2e8f0; margin: 14px 0; }
        .sign-table { width: 100%; border-collapse: collapse; margin-top: 8px; }
        .sign-table th { background: #f8fafc; font-size: 8px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; color: #64748b; padding: 6px 8px; border: 1px solid #e2e8f0; text-align: left; }
        .sign-table td { border: 1px solid #e2e8f0; padding: 0; height: 28px; }
        .disclaimer { margin-top: 16px; background: #fef9f0; border: 1px solid #fed7aa; border-radius: 4px; padding: 10px 12px; }
        .disclaimer p { font-size: 9px; color: #92400e; line-height: 1.5; }
        .disclaimer strong { font-weight: 700; }
        .footer { margin-top: 20px; display: flex; justify-content: space-between; font-size: 8px; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 8px; }
        @media print { body { padding: 10mm 12mm; } @page { margin: 10mm; } }
      </style>
    </head><body><div class="print-root">${content.innerHTML}</div></body></html>`);
    win.document.close();
    win.focus();
    setTimeout(() => { win.print(); }, 400);
  }

  const today = new Date().toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/70" onClick={onClose} />
      <motion.div
        initial={{ opacity: 0, scale: 0.97 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.97 }}
        transition={{ duration: 0.15 }}
        className="relative bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[92vh] flex flex-col"
      >
        {/* Modal header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 bg-slate-100 rounded-md"><Printer size={15} className="text-slate-600" /></div>
            <div>
              <h2 className="font-heading font-bold text-sm">Print Preview</h2>
              <p className="text-xs text-slate-400">{swms.title}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button onClick={handlePrint} className="flex items-center gap-2 bg-primary hover:bg-orange-600 text-white text-sm font-bold px-4 py-2 rounded-lg transition-colors">
              <Printer size={14} />Print / Save PDF
            </button>
            <button onClick={onClose} className="p-1.5 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"><X size={16} /></button>
          </div>
        </div>

        {/* Scrollable preview */}
        <div className="flex-1 overflow-y-auto p-6 bg-slate-50">
          <div ref={printRef} className="bg-white rounded-xl shadow-sm border border-slate-200 p-8 max-w-3xl mx-auto text-[11px] leading-relaxed">

            {/* Header bar */}
            <div className="bg-slate-900 text-white rounded-lg px-5 py-4 flex justify-between items-start mb-5">
              <div>
                <div className="text-[9px] font-bold uppercase tracking-widest text-slate-400 mb-1">Safe Work Method Statement</div>
                <h1 className="text-base font-extrabold leading-tight">{swms.title}</h1>
                {swms.work_activity && <p className="text-[10px] text-slate-300 mt-1">{swms.work_activity}</p>}
              </div>
              <span className="bg-primary text-white text-[9px] font-bold px-2.5 py-1 rounded-full shrink-0 ml-4">
                {(swms.status ?? 'draft').toUpperCase()}
              </span>
            </div>

            {/* Meta grid */}
            <div className="grid grid-cols-3 gap-2 mb-5">
              {[
                ['Revision', `Rev ${swms.revision_number ?? '1'}`],
                ['Review Date', swms.review_date ? fmtDate(swms.review_date) : '—'],
                ['Print Date', today],
                ...(swms.job_number ? [['Job No.', swms.job_number]] : []),
                ...(swms.job_name ? [['Job', swms.job_name]] : []),
                ...(swms.client_name ? [['Client', swms.client_name]] : []),
                ...(swms.job_site_address ? [['Site Address', swms.job_site_address]] : []),
                ...(swms.supervisor ? [['Supervisor', swms.supervisor]] : []),
              ].map(([label, value]) => (
                <div key={label} className="border border-slate-200 rounded-lg px-3 py-2">
                  <div className="text-[8px] font-bold uppercase tracking-widest text-slate-400 mb-0.5">{label}</div>
                  <div className="text-[11px] font-semibold text-slate-800">{value}</div>
                </div>
              ))}
            </div>

            <hr className="border-slate-200 mb-4" />

            {/* Two-column hazard/risk/controls */}
            <div className="grid grid-cols-2 gap-5 mb-4">
              <PrintSection title="Hazards Identified" content={swms.hazards} />
              <PrintSection title="Risks" content={swms.risks} />
            </div>
            <PrintSection title="Control Measures / Risk Mitigation" content={swms.controls} />

            <hr className="border-slate-200 my-4" />

            {/* PPE banner — compact icon strip above the PPE requirements section */}
            <div className="mb-4" style={{ pageBreakInside: 'avoid' }}>
              <PPEBanner />
            </div>

            <div className="grid grid-cols-2 gap-5">
              <PrintSection title="PPE Required" content={swms.ppe} />
              <PrintSection title="Plant & Equipment" content={swms.plant_equipment} />
              <PrintSection title="Training & Competency" content={swms.training_competency} />
              <PrintSection title="Sign-off Requirements" content={swms.sign_off_requirements} />
              <PrintSection title="Emergency Controls" content={swms.emergency_controls} />
              <PrintSection title="Environmental Controls" content={swms.environmental_controls} />
              {swms.permits_approvals && <PrintSection title="Permits & Approvals" content={swms.permits_approvals} />}
              {swms.monitoring_review && <PrintSection title="Monitoring & Review" content={swms.monitoring_review} />}
              {swms.notes && <PrintSection title="Notes" content={swms.notes} />}
            </div>

            <hr className="border-slate-200 my-5" />

            {/* Sign-on register */}
            <div className="mb-5">
              <h3 className="text-[9px] font-bold uppercase tracking-widest text-slate-500 border-b border-slate-200 pb-1.5 mb-3">
                Worker Sign-On Register
              </h3>
              <p className="text-[9px] text-slate-500 mb-3">
                All workers must read and understand this SWMS before commencing work. By signing below, you confirm you have read, understood, and agree to comply with all controls listed in this document.
              </p>
              <table className="w-full border-collapse text-[10px]">
                <thead>
                  <tr className="bg-slate-50">
                    {['#', 'Full Name', 'Company / Trade', 'Date', 'Signature'].map((h) => (
                      <th key={h} className="border border-slate-200 px-2 py-1.5 text-left text-[8px] font-bold uppercase tracking-wide text-slate-500">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {Array.from({ length: 12 }).map((_, i) => (
                    <tr key={i}>
                      <td className="border border-slate-200 px-2 py-0 h-7 text-slate-400 text-[9px] w-6">{i + 1}</td>
                      <td className="border border-slate-200 px-2 py-0 h-7 w-40" />
                      <td className="border border-slate-200 px-2 py-0 h-7 w-32" />
                      <td className="border border-slate-200 px-2 py-0 h-7 w-20" />
                      <td className="border border-slate-200 px-2 py-0 h-7 w-36" />
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Disclaimer */}
            <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 mb-4">
              <p className="text-[9px] text-amber-800 leading-relaxed">
                <strong>Disclaimer:</strong> This Safe Work Method Statement has been prepared to assist in managing workplace health and safety risks associated with the described work activity. It is the responsibility of the principal contractor, site supervisor, and all workers to ensure this document is reviewed, understood, and followed at all times. This document must be reviewed and updated whenever there is a change in work conditions, personnel, equipment, or legislation. Compliance with this SWMS does not guarantee the elimination of all risks — workers must remain vigilant and report any new hazards immediately to their supervisor. This document does not replace the need for site-specific risk assessments or compliance with applicable WHS legislation, codes of practice, and Australian Standards.
              </p>
            </div>

            {/* Footer */}
            <div className="flex justify-between items-center text-[8px] text-slate-400 border-t border-slate-200 pt-3">
              <span>IWILLBUILD Portal — Safety Management System</span>
              <span>Rev {swms.revision_number ?? '1'} · Printed {today}</span>
            </div>

          </div>
        </div>
      </motion.div>
    </div>
  );
}

// ── Job SWMS Tab ───────────────────────────────────────────────────────────────

interface JobSwms {
  id: number;
  job_id: number;
  template_id: number | null;
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
  permits_approvals: string | null;
  monitoring_review: string | null;
  notes: string | null;
  revision_number: string;
  review_date: string | null;
  status: string;
  reviewed_at: string | null;
  approved_at: string | null;
  job_name: string | null;
  job_number: string | null;
  client_name: string | null;
  job_site_address: string | null;
  supervisor: string | null;
  created_at: string;
  updated_at: string;
}

function JobSwmsEditModal({ initial, onClose, onSaved }: {
  initial: JobSwms;
  onClose: () => void;
  onSaved: (updated: JobSwms) => void;
}) {
  const [form, setForm] = useState({
    title: initial.title ?? '',
    workActivity: initial.work_activity ?? '',
    hazards: initial.hazards ?? '',
    risks: initial.risks ?? '',
    controls: initial.controls ?? '',
    ppe: initial.ppe ?? '',
    plantEquipment: initial.plant_equipment ?? '',
    trainingCompetency: initial.training_competency ?? '',
    emergencyControls: initial.emergency_controls ?? '',
    environmentalControls: initial.environmental_controls ?? '',
    signOffRequirements: initial.sign_off_requirements ?? '',
    permitsApprovals: initial.permits_approvals ?? '',
    monitoringReview: initial.monitoring_review ?? '',
    notes: initial.notes ?? '',
    revisionNumber: initial.revision_number ?? '1',
    reviewDate: initial.review_date?.slice(0, 10) ?? '',
    status: initial.status ?? 'draft',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.title.trim()) { setError('Title is required'); return; }
    setSaving(true); setError('');
    try {
      const r = await fetch(`/api/safety/job-swms/${initial.id}`, {
        method: 'PUT', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? 'Failed');
      onSaved(d.jobSwms);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  const labelCls = 'block text-xs font-bold text-slate-600 uppercase tracking-wide mb-1.5';
  const inputCls = 'w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors bg-white';
  const textareaCls = `${inputCls} resize-y`;
  const sectionHeadCls = 'flex items-center gap-2 text-xs font-bold text-slate-400 uppercase tracking-widest mb-3 mt-1';

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <motion.div
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 40 }}
        transition={{ duration: 0.2, ease: 'easeOut' }}
        className="relative bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-3xl max-h-[95vh] sm:max-h-[92vh] flex flex-col"
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 bg-orange-50 rounded-md"><HardHat size={16} className="text-primary" /></div>
            <div>
              <h2 className="font-heading font-bold text-base leading-tight">Edit Job SWMS</h2>
              <p className="text-xs text-slate-400 mt-0.5">{initial.job_name ?? `Job #${initial.job_id}`}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"><X size={16} /></button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto">
          <div className="p-6 flex flex-col gap-6">

            <div>
              <p className={sectionHeadCls}><span className="w-5 h-px bg-slate-200 inline-block" />Identity<span className="flex-1 h-px bg-slate-200 inline-block" /></p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="sm:col-span-3">
                  <label className={labelCls}>Title <span className="text-red-500">*</span></label>
                  <input value={form.title} onChange={(e) => set('title', e.target.value)} className={inputCls} autoFocus />
                </div>
                <div className="sm:col-span-3">
                  <label className={labelCls}>Work Activity</label>
                  <input value={form.workActivity} onChange={(e) => set('workActivity', e.target.value)} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Revision No.</label>
                  <input value={form.revisionNumber} onChange={(e) => set('revisionNumber', e.target.value)} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Review Date</label>
                  <input type="date" value={form.reviewDate} onChange={(e) => set('reviewDate', e.target.value)} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>Status</label>
                  <select value={form.status} onChange={(e) => set('status', e.target.value)} className={inputCls}>
                    {JOB_SWMS_STATUSES.map((s) => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
                  </select>
                </div>
              </div>
            </div>

            <div>
              <p className={sectionHeadCls}><span className="w-5 h-px bg-slate-200 inline-block" />Hazard &amp; Risk<span className="flex-1 h-px bg-slate-200 inline-block" /></p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>Hazards</label>
                  <textarea value={form.hazards} onChange={(e) => set('hazards', e.target.value)} rows={6} className={textareaCls} />
                </div>
                <div>
                  <label className={labelCls}>Risks</label>
                  <textarea value={form.risks} onChange={(e) => set('risks', e.target.value)} rows={6} className={textareaCls} />
                </div>
                <div className="sm:col-span-2">
                  <label className={labelCls}>Controls / Risk Mitigation</label>
                  <textarea value={form.controls} onChange={(e) => set('controls', e.target.value)} rows={7} className={textareaCls} />
                </div>
              </div>
            </div>

            <div>
              <p className={sectionHeadCls}><span className="w-5 h-px bg-slate-200 inline-block" />Requirements<span className="flex-1 h-px bg-slate-200 inline-block" /></p>
              <div className="grid grid-cols-1 gap-4">
                <div>
                  <label className={labelCls}>PPE Required</label>
                  <textarea value={form.ppe} onChange={(e) => set('ppe', e.target.value)} rows={5} className={textareaCls} />
                </div>
                <div>
                  <label className={labelCls}>Plant &amp; Equipment</label>
                  <textarea value={form.plantEquipment} onChange={(e) => set('plantEquipment', e.target.value)} rows={5} className={textareaCls} />
                </div>
                <div>
                  <label className={labelCls}>Training &amp; Competency</label>
                  <textarea value={form.trainingCompetency} onChange={(e) => set('trainingCompetency', e.target.value)} rows={5} className={textareaCls} />
                </div>
                <div>
                  <label className={labelCls}>Sign-off Requirements</label>
                  <textarea value={form.signOffRequirements} onChange={(e) => set('signOffRequirements', e.target.value)} rows={5} className={textareaCls} />
                </div>
                <div>
                  <label className={labelCls}>Permits &amp; Approvals</label>
                  <textarea value={form.permitsApprovals} onChange={(e) => set('permitsApprovals', e.target.value)} rows={4} className={textareaCls} />
                </div>
                <div>
                  <label className={labelCls}>Monitoring &amp; Review</label>
                  <textarea value={form.monitoringReview} onChange={(e) => set('monitoringReview', e.target.value)} rows={4} className={textareaCls} />
                </div>
              </div>
            </div>

            <div>
              <p className={sectionHeadCls}><span className="w-5 h-px bg-slate-200 inline-block" />Response &amp; Environment<span className="flex-1 h-px bg-slate-200 inline-block" /></p>
              <div className="grid grid-cols-1 gap-4">
                <div>
                  <label className={labelCls}>Emergency Controls</label>
                  <textarea value={form.emergencyControls} onChange={(e) => set('emergencyControls', e.target.value)} rows={5} className={textareaCls} />
                </div>
                <div>
                  <label className={labelCls}>Environmental Controls</label>
                  <textarea value={form.environmentalControls} onChange={(e) => set('environmentalControls', e.target.value)} rows={5} className={textareaCls} />
                </div>
                <div>
                  <label className={labelCls}>Notes</label>
                  <textarea value={form.notes} onChange={(e) => set('notes', e.target.value)} rows={3} className={textareaCls} />
                </div>
              </div>
            </div>

          </div>

          <div className="px-6 pb-6 flex flex-col gap-3">
            {error && (
              <div className="flex items-center gap-2 text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm">
                <AlertCircle size={14} className="shrink-0" />{error}
              </div>
            )}
            <div className="flex gap-3 pt-2 border-t border-slate-100">
              <button type="button" onClick={onClose} disabled={saving} className="flex-1 px-4 py-2.5 border border-slate-200 rounded-lg text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-50">Cancel</button>
              <button type="submit" disabled={saving} className="flex-1 px-4 py-2.5 bg-primary hover:bg-orange-600 text-white rounded-lg text-sm font-bold transition-colors disabled:opacity-60 flex items-center justify-center gap-2">
                {saving ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                Save Changes
              </button>
            </div>
          </div>
        </form>
      </motion.div>
    </div>
  );
}

// ── Add-from-template picker ───────────────────────────────────────────────────

interface Job { id: number; name: string; job_number: string | null; }

function AddJobSwmsModal({ onClose, onAdded }: {
  onClose: () => void;
  onAdded: (items: JobSwms[]) => void;
}) {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [templates, setTemplates] = useState<SwmsTemplate[]>([]);
  const [selectedJob, setSelectedJob] = useState<number | null>(null);
  const [selectedTpls, setSelectedTpls] = useState<Set<number>>(new Set());
  const [jobSearch, setJobSearch] = useState('');
  const [tplSearch, setTplSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([
      fetch('/api/jobs', { credentials: 'include' }).then((r) => r.json()),
      fetch('/api/safety/swms', { credentials: 'include' }).then((r) => r.json()),
    ]).then(([jd, sd]) => {
      setJobs(jd.jobs ?? []);
      setTemplates((sd.swms ?? []).filter((s: SwmsTemplate) => s.status !== 'archived'));
    }).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const filteredJobs = jobs.filter((j) =>
    !jobSearch || j.name.toLowerCase().includes(jobSearch.toLowerCase()) ||
    (j.job_number ?? '').toLowerCase().includes(jobSearch.toLowerCase())
  );
  const filteredTpls = templates.filter((t) =>
    !tplSearch || t.title.toLowerCase().includes(tplSearch.toLowerCase())
  );

  function toggleTpl(id: number) {
    setSelectedTpls((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  async function handleAdd() {
    if (!selectedJob) { setError('Select a job first'); return; }
    if (selectedTpls.size === 0) { setError('Select at least one SWMS template'); return; }
    setSaving(true); setError('');
    try {
      const r = await fetch('/api/safety/job-swms', {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ jobId: selectedJob, templateIds: Array.from(selectedTpls) }),
      });
      const d = await r.json();
      if (!r.ok) throw new Error(d.error ?? 'Failed');
      onAdded(d.jobSwms ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <motion.div
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 40 }}
        transition={{ duration: 0.2, ease: 'easeOut' }}
        className="relative bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-2xl max-h-[90vh] flex flex-col"
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 bg-orange-50 rounded-md"><HardHat size={16} className="text-primary" /></div>
            <div>
              <h2 className="font-heading font-bold text-base">Add SWMS to Job</h2>
              <p className="text-xs text-slate-400">Select a job and one or more templates</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"><X size={16} /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-5">
          {loading && <div className="flex items-center justify-center py-10"><Loader2 size={20} className="animate-spin text-primary" /></div>}

          {!loading && (
            <>
              {/* Job picker */}
              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase tracking-wide mb-2">Select Job</label>
                <div className="relative mb-2">
                  <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input value={jobSearch} onChange={(e) => setJobSearch(e.target.value)} placeholder="Search jobs…" className="w-full pl-8 pr-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 bg-white" />
                </div>
                <div className="border border-slate-200 rounded-xl overflow-hidden max-h-44 overflow-y-auto">
                  {filteredJobs.length === 0 && <p className="text-sm text-slate-400 text-center py-6">No jobs found</p>}
                  {filteredJobs.map((j) => (
                    <button
                      key={j.id}
                      onClick={() => setSelectedJob(j.id)}
                      className={`w-full flex items-center gap-3 px-4 py-2.5 text-left text-sm transition-colors border-b border-slate-100 last:border-0 ${selectedJob === j.id ? 'bg-orange-50 text-primary font-semibold' : 'hover:bg-slate-50 text-slate-700'}`}
                    >
                      {selectedJob === j.id ? <CheckSquare size={14} className="text-primary shrink-0" /> : <Square size={14} className="text-slate-300 shrink-0" />}
                      <span className="flex-1 truncate">{j.name}</span>
                      {j.job_number && <span className="text-xs text-slate-400 shrink-0">{j.job_number}</span>}
                    </button>
                  ))}
                </div>
              </div>

              {/* Template picker */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-xs font-bold text-slate-600 uppercase tracking-wide">Select Templates</label>
                  {selectedTpls.size > 0 && <span className="text-xs font-semibold text-primary">{selectedTpls.size} selected</span>}
                </div>
                <div className="relative mb-2">
                  <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input value={tplSearch} onChange={(e) => setTplSearch(e.target.value)} placeholder="Search templates…" className="w-full pl-8 pr-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 bg-white" />
                </div>
                <div className="border border-slate-200 rounded-xl overflow-hidden max-h-52 overflow-y-auto">
                  {filteredTpls.length === 0 && <p className="text-sm text-slate-400 text-center py-6">No templates found — create some in the SWMS Library first</p>}
                  {filteredTpls.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => toggleTpl(t.id)}
                      className={`w-full flex items-center gap-3 px-4 py-2.5 text-left text-sm transition-colors border-b border-slate-100 last:border-0 ${selectedTpls.has(t.id) ? 'bg-orange-50' : 'hover:bg-slate-50'}`}
                    >
                      {selectedTpls.has(t.id) ? <CheckSquare size={14} className="text-primary shrink-0" /> : <Square size={14} className="text-slate-300 shrink-0" />}
                      <span className="flex-1 truncate font-medium text-slate-800">{t.title}</span>
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full border shrink-0 ${statusBadge(t.status)}`}>{t.status}</span>
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          {error && (
            <div className="flex items-center gap-2 text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm">
              <AlertCircle size={14} className="shrink-0" />{error}
            </div>
          )}
        </div>

        <div className="px-6 pb-6 flex gap-3 border-t border-slate-100 pt-4">
          <button onClick={onClose} disabled={saving} className="flex-1 px-4 py-2.5 border border-slate-200 rounded-lg text-sm font-semibold text-slate-700 hover:bg-slate-50 transition-colors disabled:opacity-50">Cancel</button>
          <button onClick={handleAdd} disabled={saving || !selectedJob || selectedTpls.size === 0} className="flex-1 px-4 py-2.5 bg-primary hover:bg-orange-600 text-white rounded-lg text-sm font-bold transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
            Add {selectedTpls.size > 0 ? `${selectedTpls.size} SWMS` : 'SWMS'}
          </button>
        </div>
      </motion.div>
    </div>
  );
}

function JobSwmsTab() {
  const [list, setList] = useState<JobSwms[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<JobSwms | null>(null);
  const [printing, setPrinting] = useState<JobSwms | null>(null);
  const [deleting, setDeleting] = useState<number | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    fetch('/api/safety/job-swms', { credentials: 'include' })
      .then((r) => r.json())
      .then((d) => setList(d.jobSwms ?? []))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  async function handleDelete(id: number, title: string) {
    if (!confirm(`Delete "${title}"? This cannot be undone.`)) return;
    setDeleting(id);
    try {
      const r = await fetch(`/api/safety/job-swms/${id}`, { method: 'DELETE', credentials: 'include' });
      if (r.ok) setList((prev) => prev.filter((j) => j.id !== id));
      else { const d = await r.json(); alert(d.error ?? 'Failed to delete'); }
    } finally { setDeleting(null); }
  }

  async function handleStatusChange(item: JobSwms, newStatus: string) {
    const r = await fetch(`/api/safety/job-swms/${item.id}`, {
      method: 'PUT', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...item, workActivity: item.work_activity, plantEquipment: item.plant_equipment, trainingCompetency: item.training_competency, emergencyControls: item.emergency_controls, environmentalControls: item.environmental_controls, signOffRequirements: item.sign_off_requirements, permitsApprovals: item.permits_approvals, monitoringReview: item.monitoring_review, revisionNumber: item.revision_number, reviewDate: item.review_date, status: newStatus }),
    });
    if (r.ok) {
      const d = await r.json();
      setList((prev) => prev.map((j) => j.id === item.id ? d.jobSwms : j));
    }
  }

  const filtered = list.filter((j) => {
    const matchSearch = !search ||
      j.title.toLowerCase().includes(search.toLowerCase()) ||
      (j.job_name ?? '').toLowerCase().includes(search.toLowerCase()) ||
      (j.job_number ?? '').toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === 'all' || j.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const statusCounts = list.reduce((acc, j) => { acc[j.status] = (acc[j.status] ?? 0) + 1; return acc; }, {} as Record<string, number>);

  return (
    <div className="flex flex-col gap-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-48">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by title or job…" className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 bg-white" />
        </div>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/30">
          <option value="all">All statuses</option>
          {JOB_SWMS_STATUSES.map((s) => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)} {statusCounts[s] ? `(${statusCounts[s]})` : ''}</option>)}
        </select>
        <button onClick={() => setShowAdd(true)} className="flex items-center gap-2 bg-primary hover:bg-orange-600 text-white text-sm font-bold px-4 py-2 rounded-lg transition-colors shrink-0">
          <Plus size={15} />Add SWMS to Job
        </button>
      </div>

      {/* Status summary chips */}
      {list.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {(['draft', 'reviewed', 'approved'] as const).map((s) => (
            <button key={s} onClick={() => setStatusFilter(statusFilter === s ? 'all' : s)}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border transition-colors ${statusFilter === s ? 'bg-slate-900 text-white border-slate-900' : `${statusBadge(s)} hover:opacity-80`}`}>
              {statusCounts[s] ?? 0} {s}
            </button>
          ))}
        </div>
      )}

      {loading && <div className="flex items-center justify-center py-16"><Loader2 size={22} className="animate-spin text-primary" /></div>}

      {!loading && filtered.length === 0 && (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <div className="w-14 h-14 bg-orange-50 rounded-xl flex items-center justify-center mb-4"><HardHat size={24} className="text-primary" /></div>
          <p className="font-heading font-bold text-slate-700 mb-1">No job SWMS yet</p>
          <p className="text-sm text-slate-400 mb-5 max-w-xs">Assign SWMS templates to specific jobs. Workers sign on before starting work.</p>
          <button onClick={() => setShowAdd(true)} className="flex items-center gap-2 bg-primary hover:bg-orange-600 text-white text-sm font-bold px-5 py-2.5 rounded-lg transition-colors">
            <Plus size={15} />Add SWMS to Job
          </button>
        </div>
      )}

      {!loading && filtered.length > 0 && (
        <div className="flex flex-col gap-2">
          {filtered.map((j) => (
            <div key={j.id} className="bg-white border border-slate-200 rounded-xl p-4 flex items-start justify-between gap-3 hover:border-slate-300 transition-colors">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap mb-1">
                  <span className={`text-xs font-bold px-2 py-0.5 rounded-full border ${statusBadge(j.status)}`}>
                    {j.status.charAt(0).toUpperCase() + j.status.slice(1)}
                  </span>
                  <span className="text-xs text-slate-400">Rev {j.revision_number}</span>
                  {j.review_date && <span className="text-xs text-slate-400">Review: {fmtDate(j.review_date)}</span>}
                  {j.approved_at && <span className="text-xs text-emerald-600 font-semibold">Approved {fmtDate(j.approved_at)}</span>}
                </div>
                <h3 className="font-bold text-sm text-slate-800 truncate">{j.title}</h3>
                <div className="flex items-center gap-3 mt-1 flex-wrap">
                  {j.job_name && (
                    <span className="flex items-center gap-1 text-xs text-slate-500">
                      <Building2 size={11} className="text-slate-400" />
                      {j.job_name}{j.job_number ? ` · ${j.job_number}` : ''}
                    </span>
                  )}
                  {j.client_name && <span className="text-xs text-slate-400">{j.client_name}</span>}
                  {j.job_site_address && <span className="text-xs text-slate-400 truncate max-w-xs">{j.job_site_address}</span>}
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {/* Quick status advance */}
                {j.status === 'draft' && (
                  <button onClick={() => handleStatusChange(j, 'reviewed')} className="px-2 py-1 rounded-md text-xs font-semibold text-blue-600 bg-blue-50 hover:bg-blue-100 transition-colors" title="Mark as Reviewed">
                    Review
                  </button>
                )}
                {j.status === 'reviewed' && (
                  <button onClick={() => handleStatusChange(j, 'approved')} className="px-2 py-1 rounded-md text-xs font-semibold text-emerald-600 bg-emerald-50 hover:bg-emerald-100 transition-colors" title="Mark as Approved">
                    Approve
                  </button>
                )}
                <button onClick={() => setPrinting(j)} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors" title="Print / PDF">
                  <Printer size={14} />
                </button>
                <button onClick={() => setEditing(j)} className="p-1.5 rounded-lg text-slate-400 hover:text-primary hover:bg-orange-50 transition-colors" title="Edit">
                  <Wand2 size={14} />
                </button>
                <button onClick={() => handleDelete(j.id, j.title)} disabled={deleting === j.id} className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors" title="Delete">
                  {deleting === j.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      <AnimatePresence>
        {showAdd && <AddJobSwmsModal onClose={() => setShowAdd(false)} onAdded={(items) => { setList((prev) => [...items, ...prev]); setShowAdd(false); }} />}
        {editing && <JobSwmsEditModal initial={editing} onClose={() => setEditing(null)} onSaved={(updated) => { setList((prev) => prev.map((j) => j.id === updated.id ? updated : j)); setEditing(null); }} />}
        {printing && <SwmsPrintModal swms={printing} onClose={() => setPrinting(null)} />}
      </AnimatePresence>
    </div>
  );
}


const TABS = [
  { id: 'dashboard', label: 'Dashboard',    icon: ShieldCheck },
  { id: 'swms',      label: 'SWMS Library', icon: ShieldAlert },
  { id: 'jobswms',   label: 'Job SWMS',     icon: HardHat },
  { id: 'plans',     label: 'Safety Plans', icon: ClipboardList },
  { id: 'policies',  label: 'Policies',     icon: BookOpen },
  { id: 'posters',   label: 'Posters',      icon: Image },
  { id: 'ai',        label: 'Dazza AI',     icon: Bot },
] as const;

type TabId = typeof TABS[number]['id'];

export default function SafetyPage() {
  const [activeTab, setActiveTab] = useState<TabId>('dashboard');

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
        <meta property="og:title" content="Safety — IWILLBUILD Portal" />
        <meta property="og:description" content="Safety management — SWMS, site safety plans, policies, procedures and site posters." />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://iwillbuild.com/safety" />
        <meta property="og:image" content="https://iwillbuild.com/og-image.png" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="Safety — IWILLBUILD Portal" />
        <meta name="twitter:description" content="Safety management — SWMS, site safety plans, policies, procedures and site posters." />
        <meta name="twitter:image" content="https://iwillbuild.com/og-image.png" />
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
            {activeTab === 'jobswms'   && <JobSwmsTab />}
            {activeTab === 'plans'     && <SafetyPlansTab />}
            {activeTab === 'policies'  && <PoliciesTab />}
            {activeTab === 'posters'   && <PostersTab />}
            {activeTab === 'ai'        && <DazzaAiTab />}
          </motion.div>
        </div>
      </div>
    </div>
  );
}
