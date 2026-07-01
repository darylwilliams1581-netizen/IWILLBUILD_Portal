import { useState } from 'react';
import { motion } from 'motion/react';
import { ShieldCheck, X, Check, Loader2, AlertCircle } from 'lucide-react';
import type { SafetyPlan } from './safety-types';
import { PLAN_STATUSES, HIGH_RISK_ACTIVITIES } from './safety-types';

interface Props {
  initial?: SafetyPlan | null;
  jobs: Array<{ id: number; name: string; jobNumber: string | null }>;
  onClose: () => void;
  onSaved: (p: SafetyPlan) => void;
}

export default function PlanFormModal({ initial, jobs, onClose, onSaved }: Props) {
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
