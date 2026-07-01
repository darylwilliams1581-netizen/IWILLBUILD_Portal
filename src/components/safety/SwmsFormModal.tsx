import { useState } from 'react';
import { motion } from 'motion/react';
import { ShieldAlert, X, Check, Loader2, AlertCircle } from 'lucide-react';
import type { SwmsTemplate } from './safety-types';
import { SWMS_STATUSES } from './safety-types';

interface Props {
  initial?: SwmsTemplate | null;
  onClose: () => void;
  onSaved: (s: SwmsTemplate) => void;
}

export default function SwmsFormModal({ initial, onClose, onSaved }: Props) {
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
        transition={{ duration: 0.2, ease: 'easeOut' as const }}
        className="relative bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-3xl max-h-[95vh] sm:max-h-[92vh] flex flex-col"
      >
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

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto">
          <div className="p-6 flex flex-col gap-6">
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
