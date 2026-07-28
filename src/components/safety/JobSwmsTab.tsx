import { useState, useEffect, useCallback } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import {
  Search, Plus, Loader2, Wand2, Trash2, Printer,
  HardHat, Building2, X, Check, AlertCircle, CheckSquare, Square,
  Link2, Copy, CheckCircle2, Users, Clock, ChevronDown, ChevronUp,
} from 'lucide-react';
import SwmsPrintModal from './SwmsPrintModal';
import type { JobSwms, SwmsTemplate } from './safety-types';
import { JOB_SWMS_STATUSES, statusBadge, fmtDate } from './safety-types';

// ── JobSwmsEditModal ──────────────────────────────────────────────────────────

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
        transition={{ duration: 0.2, ease: 'easeOut' as const }}
        className="relative bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-3xl max-h-[95vh] sm:max-h-[92vh] flex flex-col"
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 bg-violet-50 rounded-md"><HardHat size={16} className="text-primary" /></div>
            <div>
              <h2 className="font-heading font-bold text-base leading-tight">Edit Job SWMS</h2>
              <p className="text-xs text-slate-400 mt-0.5">{initial.job_name ?? `Job #${initial.job_id}`}</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-md text-slate-600 hover:text-slate-800 hover:bg-slate-100 transition-colors"><X size={16} /></button>
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
                <div><label className={labelCls}>PPE Required</label><textarea value={form.ppe} onChange={(e) => set('ppe', e.target.value)} rows={5} className={textareaCls} /></div>
                <div><label className={labelCls}>Plant &amp; Equipment</label><textarea value={form.plantEquipment} onChange={(e) => set('plantEquipment', e.target.value)} rows={5} className={textareaCls} /></div>
                <div><label className={labelCls}>Training &amp; Competency</label><textarea value={form.trainingCompetency} onChange={(e) => set('trainingCompetency', e.target.value)} rows={5} className={textareaCls} /></div>
                <div><label className={labelCls}>Sign-off Requirements</label><textarea value={form.signOffRequirements} onChange={(e) => set('signOffRequirements', e.target.value)} rows={5} className={textareaCls} /></div>
                <div><label className={labelCls}>Permits &amp; Approvals</label><textarea value={form.permitsApprovals} onChange={(e) => set('permitsApprovals', e.target.value)} rows={4} className={textareaCls} /></div>
                <div><label className={labelCls}>Monitoring &amp; Review</label><textarea value={form.monitoringReview} onChange={(e) => set('monitoringReview', e.target.value)} rows={4} className={textareaCls} /></div>
              </div>
            </div>

            <div>
              <p className={sectionHeadCls}><span className="w-5 h-px bg-slate-200 inline-block" />Response &amp; Environment<span className="flex-1 h-px bg-slate-200 inline-block" /></p>
              <div className="grid grid-cols-1 gap-4">
                <div><label className={labelCls}>Emergency Controls</label><textarea value={form.emergencyControls} onChange={(e) => set('emergencyControls', e.target.value)} rows={5} className={textareaCls} /></div>
                <div><label className={labelCls}>Environmental Controls</label><textarea value={form.environmentalControls} onChange={(e) => set('environmentalControls', e.target.value)} rows={5} className={textareaCls} /></div>
                <div><label className={labelCls}>Notes</label><textarea value={form.notes} onChange={(e) => set('notes', e.target.value)} rows={3} className={textareaCls} /></div>
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
              <button type="submit" disabled={saving} className="flex-1 px-4 py-2.5 bg-primary hover:bg-violet-700 text-white rounded-lg text-sm font-bold transition-colors disabled:opacity-60 flex items-center justify-center gap-2">
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

// ── AddJobSwmsModal ───────────────────────────────────────────────────────────

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
        transition={{ duration: 0.2, ease: 'easeOut' as const }}
        className="relative bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-2xl max-h-[90vh] flex flex-col"
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 bg-violet-50 rounded-md"><HardHat size={16} className="text-primary" /></div>
            <div>
              <h2 className="font-heading font-bold text-base">Add SWMS to Job</h2>
              <p className="text-xs text-slate-400">Select a job and one or more templates</p>
            </div>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-md text-slate-600 hover:text-slate-800 hover:bg-slate-100 transition-colors"><X size={16} /></button>
        </div>

        <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-5">
          {loading && <div className="flex items-center justify-center py-10"><Loader2 size={20} className="animate-spin text-primary" /></div>}
          {!loading && (
            <>
              <div>
                <label className="block text-xs font-bold text-slate-600 uppercase tracking-wide mb-2">Select Job</label>
                <div className="relative mb-2">
                  <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input value={jobSearch} onChange={(e) => setJobSearch(e.target.value)} placeholder="Search jobs\u2026" className="w-full pl-8 pr-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 bg-white" />
                </div>
                <div className="border border-slate-200 rounded-xl overflow-hidden max-h-44 overflow-y-auto">
                  {filteredJobs.length === 0 && <p className="text-sm text-slate-400 text-center py-6">No jobs found</p>}
                  {filteredJobs.map((j) => (
                    <button key={j.id} onClick={() => setSelectedJob(j.id)}
                      className={`w-full flex items-center gap-3 px-4 py-2.5 text-left text-sm transition-colors border-b border-slate-100 last:border-0 ${selectedJob === j.id ? 'bg-violet-50 text-primary font-semibold' : 'hover:bg-slate-50 text-slate-700'}`}>
                      {selectedJob === j.id ? <CheckSquare size={14} className="text-primary shrink-0" /> : <Square size={14} className="text-slate-300 shrink-0" />}
                      <span className="flex-1 truncate">{j.name}</span>
                      {j.job_number && <span className="text-xs text-slate-400 shrink-0">{j.job_number}</span>}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-xs font-bold text-slate-600 uppercase tracking-wide">Select Templates</label>
                  {selectedTpls.size > 0 && <span className="text-xs font-semibold text-primary">{selectedTpls.size} selected</span>}
                </div>
                <div className="relative mb-2">
                  <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input value={tplSearch} onChange={(e) => setTplSearch(e.target.value)} placeholder="Search templates\u2026" className="w-full pl-8 pr-3 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 bg-white" />
                </div>
                <div className="border border-slate-200 rounded-xl overflow-hidden max-h-52 overflow-y-auto">
                  {filteredTpls.length === 0 && <p className="text-sm text-slate-400 text-center py-6">No templates found &mdash; create some in the SWMS Library first</p>}
                  {filteredTpls.map((t) => (
                    <button key={t.id} onClick={() => toggleTpl(t.id)}
                      className={`w-full flex items-center gap-3 px-4 py-2.5 text-left text-sm transition-colors border-b border-slate-100 last:border-0 ${selectedTpls.has(t.id) ? 'bg-violet-50' : 'hover:bg-slate-50'}`}>
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
          <button onClick={() => void handleAdd()} disabled={saving || !selectedJob || selectedTpls.size === 0} className="flex-1 px-4 py-2.5 bg-primary hover:bg-violet-700 text-white rounded-lg text-sm font-bold transition-colors disabled:opacity-50 flex items-center justify-center gap-2">
            {saving ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
            Add {selectedTpls.size > 0 ? `${selectedTpls.size} SWMS` : 'SWMS'}
          </button>
        </div>
      </motion.div>
    </div>
  );
}

// ── JobSwmsTab ────────────────────────────────────────────────────────────────

interface Signoff {
  id: number;
  worker_name: string;
  company_name: string | null;
  role: string | null;
  white_card_number: string | null;
  signed_at: string;
}

/** Inline sign-off panel for a single job SWMS */
function SignoffPanel({ swmsId, onClose }: { swmsId: number; onClose: () => void }) {
  const [signoffs,    setSignoffs]    = useState<Signoff[]>([]);
  const [shareUrl,    setShareUrl]    = useState('');
  const [loading,     setLoading]     = useState(true);
  const [generating,  setGenerating]  = useState(false);
  const [copied,      setCopied]      = useState(false);

  useEffect(() => {
    Promise.all([
      fetch(`/api/safety/job-swms/${swmsId}/signoffs`, { credentials: 'include' }).then(r => r.json()),
      fetch(`/api/safety/job-swms/${swmsId}/share-token`, { method: 'POST', credentials: 'include' }).then(r => r.json()),
    ]).then(([signoffData, tokenData]) => {
      setSignoffs((signoffData as { signoffs?: Signoff[] }).signoffs ?? []);
      setShareUrl((tokenData as { url?: string }).url ?? '');
    }).catch(() => {}).finally(() => setLoading(false));
  }, [swmsId]);

  async function regenerate() {
    setGenerating(true);
    try {
      const r = await fetch(`/api/safety/job-swms/${swmsId}/share-token`, { method: 'POST', credentials: 'include' });
      const d = await r.json() as { url?: string };
      setShareUrl(d.url ?? '');
    } finally { setGenerating(false); }
  }

  function copyLink() {
    if (!shareUrl) return;
    navigator.clipboard.writeText(shareUrl).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {});
  }

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.2 }}
      className="overflow-hidden"
    >
      <div className="border-t border-slate-100 bg-slate-50 px-4 py-4 space-y-4">
        {/* Share link */}
        <div>
          <p className="text-xs font-bold text-slate-600 uppercase tracking-wide mb-2">Sign-off Link</p>
          <p className="text-xs text-slate-500 mb-2">Share this link with workers. They can read the SWMS and sign off on their phone — no login required.</p>
          {loading ? (
            <div className="flex items-center gap-2 text-xs text-slate-400"><Loader2 size={12} className="animate-spin" /> Generating link…</div>
          ) : shareUrl ? (
            <div className="flex items-center gap-2">
              <div className="flex-1 min-w-0 bg-white border border-slate-200 rounded-lg px-3 py-2 text-xs text-slate-600 truncate font-mono">
                {shareUrl}
              </div>
              <button
                onClick={copyLink}
                className={`flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold transition-colors shrink-0 ${
                  copied ? 'bg-emerald-500 text-white' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-100'
                }`}
              >
                {copied ? <><CheckCircle2 size={12} /> Copied!</> : <><Copy size={12} /> Copy</>}
              </button>
            </div>
          ) : (
            <button onClick={regenerate} disabled={generating} className="flex items-center gap-1.5 text-xs font-semibold text-violet-700 hover:text-violet-800 transition-colors">
              {generating ? <Loader2 size={12} className="animate-spin" /> : <Link2 size={12} />}
              Generate link
            </button>
          )}
        </div>

        {/* Signoffs list */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <p className="text-xs font-bold text-slate-600 uppercase tracking-wide">
              Sign-offs ({signoffs.length})
            </p>
            <button onClick={onClose} className="text-xs text-slate-600 hover:text-slate-800 transition-colors flex items-center gap-1">
              <ChevronUp size={12} /> Hide
            </button>
          </div>
          {loading ? (
            <div className="flex items-center gap-2 text-xs text-slate-400"><Loader2 size={12} className="animate-spin" /> Loading…</div>
          ) : signoffs.length === 0 ? (
            <p className="text-xs text-slate-400 italic">No sign-offs yet. Share the link above with workers.</p>
          ) : (
            <div className="space-y-1.5">
              {signoffs.map(s => (
                <div key={s.id} className="flex items-center gap-2 bg-white border border-slate-200 rounded-lg px-3 py-2">
                  <CheckCircle2 size={13} className="text-emerald-500 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-semibold text-slate-800">{s.worker_name}</p>
                    <p className="text-[10px] text-slate-500">
                      {[s.role, s.company_name, s.white_card_number ? `WC: ${s.white_card_number}` : null].filter(Boolean).join(' · ')}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 text-[10px] text-slate-400 shrink-0">
                    <Clock size={9} />
                    {fmtDate(s.signed_at)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}

export default function JobSwmsTab() {
  const [list, setList] = useState<JobSwms[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<JobSwms | null>(null);
  const [printing, setPrinting] = useState<JobSwms | null>(null);
  const [deleting, setDeleting] = useState<number | null>(null);
  const [expandedSignoffs, setExpandedSignoffs] = useState<Set<number>>(new Set());

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
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-48">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by title or job\u2026" className="w-full pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 bg-white" />
        </div>
        <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="px-3 py-2 border border-slate-200 rounded-lg text-sm bg-white focus:outline-none focus:ring-2 focus:ring-primary/30">
          <option value="all">All statuses</option>
          {JOB_SWMS_STATUSES.map((s) => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)} {statusCounts[s] ? `(${statusCounts[s]})` : ''}</option>)}
        </select>
        <button onClick={() => setShowAdd(true)} className="flex items-center gap-2 bg-primary hover:bg-violet-700 text-white text-sm font-bold px-4 py-2 rounded-lg transition-colors shrink-0">
          <Plus size={15} />Add SWMS to Job
        </button>
      </div>

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
          <div className="w-14 h-14 bg-violet-50 rounded-xl flex items-center justify-center mb-4"><HardHat size={24} className="text-primary" /></div>
          <p className="font-heading font-bold text-slate-700 mb-1">No job SWMS yet</p>
          <p className="text-sm text-slate-400 mb-5 max-w-xs">Assign SWMS templates to specific jobs. Workers sign on before starting work.</p>
          <button onClick={() => setShowAdd(true)} className="flex items-center gap-2 bg-primary hover:bg-violet-700 text-white text-sm font-bold px-5 py-2.5 rounded-lg transition-colors">
            <Plus size={15} />Add SWMS to Job
          </button>
        </div>
      )}

      {!loading && filtered.length > 0 && (
        <div className="flex flex-col gap-2">
          {filtered.map((j) => {
            const signoffsOpen = expandedSignoffs.has(j.id);
            return (
              <div key={j.id} className="bg-white border border-slate-200 rounded-xl overflow-hidden hover:border-slate-300 transition-colors">
                <div className="p-4 flex items-start justify-between gap-3">
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
                    {j.status === 'draft' && (
                      <button onClick={() => void handleStatusChange(j, 'reviewed')} className="px-2 py-1 rounded-md text-xs font-semibold text-blue-600 bg-blue-50 hover:bg-blue-100 transition-colors">Review</button>
                    )}
                    {j.status === 'reviewed' && (
                      <button onClick={() => void handleStatusChange(j, 'approved')} className="px-2 py-1 rounded-md text-xs font-semibold text-emerald-600 bg-emerald-50 hover:bg-emerald-100 transition-colors">Approve</button>
                    )}
                    {/* Sign-off toggle */}
                    <button
                      onClick={() => setExpandedSignoffs(prev => {
                        const next = new Set(prev);
                        next.has(j.id) ? next.delete(j.id) : next.add(j.id);
                        return next;
                      })}
                      className={`flex items-center gap-1 px-2 py-1 rounded-md text-xs font-semibold transition-colors ${
                        signoffsOpen ? 'bg-emerald-100 text-emerald-700' : 'text-slate-500 hover:bg-slate-100'
                      }`}
                      title="Sign-off management"
                    >
                      <Users size={12} />
                      {signoffsOpen ? <ChevronUp size={11} /> : <ChevronDown size={11} />}
                    </button>
                    <button onClick={() => setPrinting(j)} className="p-1.5 rounded-lg text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition-colors" title="Print / PDF"><Printer size={14} /></button>
                    <button onClick={() => setEditing(j)} className="p-1.5 rounded-lg text-slate-400 hover:text-primary hover:bg-violet-50 transition-colors" title="Edit"><Wand2 size={14} /></button>
                    <button onClick={() => void handleDelete(j.id, j.title)} disabled={deleting === j.id} className="p-1.5 rounded-lg text-slate-400 hover:text-red-600 hover:bg-red-50 transition-colors" title="Delete">
                      {deleting === j.id ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
                    </button>
                  </div>
                </div>
                <AnimatePresence>
                  {signoffsOpen && <SignoffPanel key={j.id} swmsId={j.id} onClose={() => setExpandedSignoffs(prev => { const next = new Set(prev); next.delete(j.id); return next; })} />}
                </AnimatePresence>
              </div>
            );
          })}
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
