// SwmsBodyBuilder.tsx — Upgraded SWMS Body Builder (Quick + Advanced modes)
// Stores structured body as JSON in swms_body column; preserves all legacy fields.
import { useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  X, Check, Loader2, AlertCircle, AlertTriangle, ChevronRight, ChevronDown,
  Plus, Trash2, Copy, GripVertical, ChevronLeft, Zap, Settings2,
  ShieldAlert, HardHat, ClipboardList, Wrench, Users, FileText,
  TriangleAlert, Flame, Leaf, BookOpen, Link2, PenLine, CheckSquare,
} from 'lucide-react';
import {
  type SwmsBodyData, type WorkStep, type CriticalControl, type PlantItem,
  type PpeRow, type HRCWEntry, type TaskRequirement, type EnvControl,
  type EmergencyAction, type CompetencyRow, type DefinitionRow, type RelatedDoc,
  type RiskLevel, type BuildMode, type ControlFlag,
  blankSwmsBody, validateSwmsBody,
  HRCW_CATEGORIES, PPE_ITEMS, TASK_REQUIREMENT_TYPES, ENV_CONTROL_OPTIONS,
  EMERGENCY_MODULE_TYPES, COMPETENCY_OPTIONS, DOCUMENT_TYPE_LABELS,
} from './swms-body-types';
import type { SwmsTemplate } from './safety-types';
import { SWMS_STATUSES } from './safety-types';

// ─── Helpers ──────────────────────────────────────────────────────────────────
function uid() { return Math.random().toString(36).slice(2, 9); }

const RISK_COLORS: Record<RiskLevel, string> = {
  extreme: 'bg-red-600 text-white',
  high: 'bg-orange-500 text-white',
  medium: 'bg-yellow-400 text-slate-900',
  low: 'bg-green-500 text-white',
  '': 'bg-slate-100 text-slate-500',
};

const RISK_LABELS: Record<RiskLevel, string> = {
  extreme: 'E — Extreme',
  high: 'H — High',
  medium: 'M — Medium',
  low: 'L — Low',
  '': 'Select',
};

function RiskBadge({ value, onChange }: { value: RiskLevel; onChange: (v: RiskLevel) => void }) {
  const levels: RiskLevel[] = ['extreme', 'high', 'medium', 'low', ''];
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value as RiskLevel)}
      className={`text-xs font-bold px-2 py-1 rounded border-0 cursor-pointer focus:outline-none focus:ring-2 focus:ring-primary/30 ${RISK_COLORS[value]}`}
    >
      {levels.map((l) => (
        <option key={l} value={l} className="bg-white text-slate-900">{RISK_LABELS[l]}</option>
      ))}
    </select>
  );
}

// ─── Section definitions ──────────────────────────────────────────────────────
interface Section {
  id: string;
  label: string;
  icon: React.ReactNode;
  quickBuild: boolean;
}

const QUICK_SECTIONS: Section[] = [
  { id: 'identity',   label: 'Identity',                icon: <FileText size={14} />,    quickBuild: true },
  { id: 'purpose',    label: 'Purpose & Scope',         icon: <ClipboardList size={14} />, quickBuild: true },
  { id: 'hrcw',       label: 'High-Risk Work',          icon: <TriangleAlert size={14} />, quickBuild: true },
  { id: 'critical',   label: 'Critical Controls',       icon: <ShieldAlert size={14} />,  quickBuild: true },
  { id: 'plant',      label: 'Plant & Equipment',       icon: <Wrench size={14} />,       quickBuild: true },
  { id: 'ppe',        label: 'PPE Requirements',        icon: <HardHat size={14} />,      quickBuild: true },
  { id: 'sequence',   label: 'Sequence of Work',        icon: <ClipboardList size={14} />, quickBuild: true },
  { id: 'emergency',  label: 'Emergency Response',      icon: <Flame size={14} />,        quickBuild: true },
  { id: 'signoff',    label: 'Sign-On & Declaration',   icon: <PenLine size={14} />,      quickBuild: true },
];

const ADVANCED_SECTIONS: Section[] = [
  { id: 'task-req',   label: 'Task Requirements',       icon: <CheckSquare size={14} />,  quickBuild: false },
  { id: 'env',        label: 'Environmental Controls',  icon: <Leaf size={14} />,         quickBuild: false },
  { id: 'competency', label: 'Training & Competency',   icon: <Users size={14} />,        quickBuild: false },
  { id: 'definitions',label: 'Definitions',             icon: <BookOpen size={14} />,     quickBuild: false },
  { id: 'related',    label: 'Related Documents',       icon: <Link2 size={14} />,        quickBuild: false },
];

// ─── Props ────────────────────────────────────────────────────────────────────
interface Props {
  initial?: SwmsTemplate | null;
  onClose: () => void;
  onSaved: (s: SwmsTemplate) => void;
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function SwmsBodyBuilder({ initial, onClose, onSaved }: Props) {
  const isEdit = !!initial;

  // Parse existing swms_body or migrate from legacy fields
  function parseInitial(): SwmsBodyData {
    if (initial?.swms_body) {
      try { return JSON.parse(initial.swms_body as string); } catch { /* fall through */ }
    }
    // Migrate from legacy flat fields
    const base = blankSwmsBody();
    if (initial) {
      return {
        ...base,
        title: initial.title ?? '',
        category: initial.category ?? '',
        revisionNumber: initial.revision_number ?? '1',
        reviewDate: initial.review_date?.slice(0, 10) ?? '',
        authorName: initial.author_name ?? '',
        approvedByName: initial.approved_by_name ?? '',
        status: (initial.status as SwmsBodyData['status']) ?? 'draft',
        purpose: initial.purpose_scope ?? '',
        scope: initial.work_activity ?? '',
        legacyHazards: initial.hazards ?? undefined,
        legacyRisks: initial.risks ?? undefined,
        legacyControls: initial.controls ?? undefined,
      };
    }
    return base;
  }

  const [data, setData] = useState<SwmsBodyData>(parseInitial);
  const [step, setStep] = useState(0);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [savedId, setSavedId] = useState<number | null>(initial?.id ?? null);

  const allSections = data.buildMode === 'advanced'
    ? [...QUICK_SECTIONS, ...ADVANCED_SECTIONS]
    : QUICK_SECTIONS;

  const warnings = validateSwmsBody(data);
  const errorCount = warnings.filter((w) => w.severity === 'error').length;
  const warnCount = warnings.filter((w) => w.severity === 'warning').length;

  function set<K extends keyof SwmsBodyData>(key: K, value: SwmsBodyData[K]) {
    setData((d) => ({ ...d, [key]: value }));
  }

  // ─── Save ─────────────────────────────────────────────────────────────────
  async function handleSave(andClose = false) {
    setSaving(true); setSaveError('');
    try {
      const body = {
        title: data.title || data.purpose.slice(0, 80) || 'SWMS',
        category: data.category,
        workActivity: data.scope,
        purposeScope: data.purpose,
        authorName: data.authorName,
        approvedByName: data.approvedByName,
        revisionNumber: data.revisionNumber,
        reviewDate: data.reviewDate || null,
        status: data.status,
        // Legacy fields for backward compat
        hazards: data.legacyHazards ?? data.criticalControls.map((c) => c.criticalRisk).join('\n'),
        controls: data.legacyControls ?? data.criticalControls.map((c) => c.mandatoryControls).join('\n'),
        ppe: data.ppeRows.map((p) => `${p.item}: ${p.requirement}`).join('\n'),
        plantEquipment: data.plantItems.map((p) => p.item).join('\n'),
        emergencyControls: data.emergencyActions.map((a) => a.action).join('\n'),
        // Structured body
        swms_body: JSON.stringify(data),
        build_mode: data.buildMode,
        document_type: data.documentType,
      };

      const url = savedId ? `/api/safety/swms/${savedId}` : '/api/safety/swms';
      const method = savedId ? 'PUT' : 'POST';
      const r = await fetch(url, {
        method, credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const resp = await r.json();
      if (!r.ok) throw new Error(resp.error ?? 'Failed to save');

      if (!savedId) setSavedId(resp.swms?.id ?? null);
      onSaved(resp.swms);
      if (andClose) onClose();
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  // ─── Section renderers ────────────────────────────────────────────────────
  const inputCls = 'w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors bg-white';
  const textareaCls = `${inputCls} resize-y`;
  const labelCls = 'block text-xs font-bold text-slate-600 uppercase tracking-wide mb-1.5';
  const sectionHead = (title: string) => (
    <h3 className="text-sm font-bold text-slate-800 mb-4 pb-2 border-b border-slate-100">{title}</h3>
  );

  function renderIdentity() {
    return (
      <div className="flex flex-col gap-4">
        {sectionHead('Document Identity')}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <label className={labelCls}>SWMS Title <span className="text-red-500">*</span></label>
            <input value={data.title} onChange={(e) => set('title', e.target.value)} className={inputCls} placeholder="e.g. Working On or Near Exposed Live Parts" autoFocus />
          </div>
          <div>
            <label className={labelCls}>Category</label>
            <input value={data.category} onChange={(e) => set('category', e.target.value)} className={inputCls} placeholder="e.g. Electrical" />
          </div>
          <div>
            <label className={labelCls}>Document Type</label>
            <select value={data.documentType} onChange={(e) => set('documentType', e.target.value as SwmsBodyData['documentType'])} className={inputCls}>
              {Object.entries(DOCUMENT_TYPE_LABELS).map(([k, v]) => (
                <option key={k} value={k}>{v}</option>
              ))}
            </select>
          </div>
          <div>
            <label className={labelCls}>Author</label>
            <input value={data.authorName} onChange={(e) => set('authorName', e.target.value)} className={inputCls} placeholder="Full name" />
          </div>
          <div>
            <label className={labelCls}>Approved By</label>
            <input value={data.approvedByName} onChange={(e) => set('approvedByName', e.target.value)} className={inputCls} placeholder="Full name" />
          </div>
          <div>
            <label className={labelCls}>Revision No.</label>
            <input value={data.revisionNumber} onChange={(e) => set('revisionNumber', e.target.value)} className={inputCls} placeholder="1" />
          </div>
          <div>
            <label className={labelCls}>Review Date</label>
            <input type="date" value={data.reviewDate} onChange={(e) => set('reviewDate', e.target.value)} className={inputCls} />
          </div>
          <div>
            <label className={labelCls}>Status</label>
            <select value={data.status} onChange={(e) => set('status', e.target.value as SwmsBodyData['status'])} className={inputCls}>
              {SWMS_STATUSES.map((s) => <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>)}
            </select>
          </div>
        </div>
      </div>
    );
  }

  function renderPurpose() {
    return (
      <div className="flex flex-col gap-4">
        {sectionHead('Purpose & Scope')}
        <div>
          <label className={labelCls}>Purpose <span className="text-red-500">*</span></label>
          <p className="text-xs text-slate-400 mb-1.5">A short explanation of why this SWMS exists and what risk it manages.</p>
          <textarea value={data.purpose} onChange={(e) => set('purpose', e.target.value)} rows={3} className={textareaCls} placeholder="This SWMS establishes the safe work method for…" />
        </div>
        <div>
          <label className={labelCls}>Scope <span className="text-red-500">*</span></label>
          <p className="text-xs text-slate-400 mb-1.5">A concise description of the work included.</p>
          <textarea value={data.scope} onChange={(e) => set('scope', e.target.value)} rows={3} className={textareaCls} placeholder="This SWMS applies to all work involving…" />
        </div>
        <div>
          <label className={labelCls}>Included Activities</label>
          {data.includedActivities.map((act, i) => (
            <div key={i} className="flex gap-2 mb-2">
              <input value={act} onChange={(e) => {
                const arr = [...data.includedActivities]; arr[i] = e.target.value; set('includedActivities', arr);
              }} className={inputCls} placeholder={`Activity ${i + 1}`} />
              {data.includedActivities.length > 1 && (
                <button type="button" onClick={() => set('includedActivities', data.includedActivities.filter((_, j) => j !== i))}
                  className="p-2 text-slate-400 hover:text-red-500 transition-colors"><Trash2 size={14} /></button>
              )}
            </div>
          ))}
          <button type="button" onClick={() => set('includedActivities', [...data.includedActivities, ''])}
            className="flex items-center gap-1.5 text-xs text-primary font-semibold hover:underline mt-1">
            <Plus size={12} /> Add activity
          </button>
        </div>
        <div>
          <label className={labelCls}>Work Boundaries <span className="text-slate-400 font-normal">(optional)</span></label>
          <textarea value={data.workBoundaries} onChange={(e) => set('workBoundaries', e.target.value)} rows={2} className={textareaCls} placeholder="Limits, locations or exclusions for this work…" />
        </div>
      </div>
    );
  }

  function renderHRCW() {
    const toggleCat = (cat: string) => {
      const exists = data.hrcwCategories.find((h) => h.category === cat);
      if (exists) {
        set('hrcwCategories', data.hrcwCategories.filter((h) => h.category !== cat));
      } else {
        set('hrcwCategories', [...data.hrcwCategories, { id: uid(), category: cat, whyApplies: '', linkedWorkStep: '', requiredPermit: '', relatedSwms: '' }]);
      }
    };
    const updateEntry = (id: string, field: keyof HRCWEntry, value: string) => {
      set('hrcwCategories', data.hrcwCategories.map((h) => h.id === id ? { ...h, [field]: value } : h));
    };

    return (
      <div className="flex flex-col gap-4">
        {sectionHead('High-Risk Construction Work Interface')}

        {/* ── Three-state question ── */}
        <div className="flex flex-col gap-2">
          <p className="text-sm font-semibold text-slate-700">Does statutory High-Risk Construction Work (HRCW) apply to this work?</p>
          <p className="text-xs text-slate-500">WHS Regulation 2011 (Qld), Schedule 3 — 18 prescribed activities</p>
          <div className="flex gap-2 mt-1">
            {(['yes', 'no', 'unsure'] as const).map((opt) => (
              <button
                key={opt}
                type="button"
                onClick={() => set('hrcwApplies', opt)}
                className={`flex-1 py-2 rounded-lg text-sm font-bold border transition-colors capitalize
                  ${data.hrcwApplies === opt
                    ? opt === 'yes' ? 'bg-red-600 text-white border-red-600'
                      : opt === 'no' ? 'bg-emerald-600 text-white border-emerald-600'
                      : 'bg-amber-500 text-white border-amber-500'
                    : 'bg-white text-slate-600 border-slate-300 hover:border-slate-400'}`}
              >
                {opt === 'yes' ? 'Yes — HRCW applies' : opt === 'no' ? 'No — HRCW does not apply' : 'Unsure'}
              </button>
            ))}
          </div>
        </div>

        {/* ── Yes: show category checklist ── */}
        {data.hrcwApplies === 'yes' && (
          <>
            <p className="text-xs text-slate-500">Select all applicable HRCW categories:</p>
            <div className="grid grid-cols-1 gap-1.5 max-h-48 overflow-y-auto border border-slate-200 rounded-lg p-3">
              {HRCW_CATEGORIES.map((cat) => {
                const selected = data.hrcwCategories.some((h) => h.category === cat);
                return (
                  <label key={cat} className="flex items-start gap-2 cursor-pointer text-xs hover:bg-slate-50 rounded p-1">
                    <input type="checkbox" checked={selected} onChange={() => toggleCat(cat)} className="mt-0.5 rounded shrink-0" />
                    <span className={selected ? 'font-semibold text-slate-800' : 'text-slate-600'}>{cat}</span>
                  </label>
                );
              })}
            </div>
            {data.hrcwCategories.length > 0 && (
              <div className="flex flex-col gap-3">
                <p className="text-xs font-bold text-slate-600 uppercase tracking-wide">Selected categories — add details:</p>
                {data.hrcwCategories.map((entry) => (
                  <div key={entry.id} className="border border-slate-200 rounded-lg p-3 bg-slate-50">
                    <p className="text-xs font-bold text-primary mb-2">{entry.category}</p>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <div>
                        <label className="text-xs text-slate-500 mb-1 block">Why it applies</label>
                        <input value={entry.whyApplies} onChange={(e) => updateEntry(entry.id, 'whyApplies', e.target.value)} className={inputCls} placeholder="Brief explanation…" />
                      </div>
                      <div>
                        <label className="text-xs text-slate-500 mb-1 block">Linked work step</label>
                        <input value={entry.linkedWorkStep} onChange={(e) => updateEntry(entry.id, 'linkedWorkStep', e.target.value)} className={inputCls} placeholder="e.g. Step 3" />
                      </div>
                      <div>
                        <label className="text-xs text-slate-500 mb-1 block">Required permit / authority</label>
                        <input value={entry.requiredPermit} onChange={(e) => updateEntry(entry.id, 'requiredPermit', e.target.value)} className={inputCls} placeholder="e.g. Electrical permit to work" />
                      </div>
                      <div>
                        <label className="text-xs text-slate-500 mb-1 block">Related SWMS</label>
                        <input value={entry.relatedSwms} onChange={(e) => updateEntry(entry.id, 'relatedSwms', e.target.value)} className={inputCls} placeholder="e.g. MLCH-01" />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* ── No: require correct document type ── */}
        {data.hrcwApplies === 'no' && (
          <div className="flex flex-col gap-2 p-4 bg-emerald-50 border border-emerald-200 rounded-lg">
            <p className="text-sm font-semibold text-emerald-800">No statutory HRCW — select the correct document type:</p>
            <p className="text-xs text-emerald-700">A full SWMS is not required. Choose the appropriate document type for this work.</p>
            <div className="flex flex-col gap-2 mt-1">
              {(['task-specific-swms', 'safe-work-procedure', 'general-risk-assessment'] as const).map((dt) => (
                <label key={dt} className="flex items-center gap-2 cursor-pointer text-sm">
                  <input
                    type="radio"
                    name="documentType"
                    checked={data.documentType === dt}
                    onChange={() => set('documentType', dt)}
                    className="accent-emerald-600"
                  />
                  <span className={data.documentType === dt ? 'font-bold text-emerald-800' : 'text-slate-700'}>
                    {DOCUMENT_TYPE_LABELS[dt]}
                  </span>
                </label>
              ))}
            </div>
          </div>
        )}

        {/* ── Unsure: guidance ── */}
        {data.hrcwApplies === 'unsure' && (
          <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
            <p className="text-sm font-semibold text-amber-800 mb-1">Review the 18 HRCW categories above</p>
            <p className="text-xs text-amber-700">If any of the listed activities will be performed, select <strong>Yes</strong>. If none apply, select <strong>No</strong> and choose the correct document type. If still unsure, consult your WHS advisor before proceeding.</p>
          </div>
        )}
      </div>
    );
  }

  function renderCriticalControls() {
    const add = () => set('criticalControls', [...data.criticalControls, {
      id: uid(), criticalRisk: '', possibleOutcome: '', mandatoryControls: '', verificationMethod: '', responsibleRole: '', flags: [],
    }]);
    const remove = (id: string) => set('criticalControls', data.criticalControls.filter((c) => c.id !== id));
    const update = (id: string, field: keyof CriticalControl, value: unknown) =>
      set('criticalControls', data.criticalControls.map((c) => c.id === id ? { ...c, [field]: value } : c));
    const toggleFlag = (id: string, flag: ControlFlag) => {
      const ctrl = data.criticalControls.find((c) => c.id === id)!;
      const flags = ctrl.flags.includes(flag) ? ctrl.flags.filter((f) => f !== flag) : [...ctrl.flags, flag];
      update(id, 'flags', flags);
    };

    const flagLabels: Record<ControlFlag, string> = {
      critical: 'Critical', mandatory: 'Mandatory', 'client-requirement': 'Client Req.', 'permit-condition': 'Permit Cond.',
    };

    return (
      <div className="flex flex-col gap-4">
        {sectionHead('Fatal Hazards & Critical Controls')}
        <p className="text-xs text-slate-500">Limit to the most important fatal or life-changing risks (3–8 rows). Do not repeat minor hazards from the sequence table.</p>
        {data.criticalControls.map((ctrl, i) => (
          <div key={ctrl.id} className="border border-slate-200 rounded-lg p-3 bg-white">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-bold text-slate-500">Critical Risk {i + 1}</span>
              <button type="button" onClick={() => remove(ctrl.id)} className="p-1 text-slate-400 hover:text-red-500 transition-colors"><Trash2 size={13} /></button>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <div>
                <label className="text-xs text-slate-500 mb-1 block">Critical Risk</label>
                <input value={ctrl.criticalRisk} onChange={(e) => update(ctrl.id, 'criticalRisk', e.target.value)} className={inputCls} placeholder="e.g. Electrocution" />
              </div>
              <div>
                <label className="text-xs text-slate-500 mb-1 block">Possible Outcome</label>
                <input value={ctrl.possibleOutcome} onChange={(e) => update(ctrl.id, 'possibleOutcome', e.target.value)} className={inputCls} placeholder="e.g. Fatality or serious injury" />
              </div>
              <div>
                <label className="text-xs text-slate-500 mb-1 block">Responsible Role</label>
                <input value={ctrl.responsibleRole ?? ''} onChange={(e) => update(ctrl.id, 'responsibleRole', e.target.value)} className={inputCls} placeholder="e.g. Supervisor" />
              </div>
              <div className="sm:col-span-3">
                <label className="text-xs text-slate-500 mb-1 block">Mandatory Controls</label>
                <textarea value={ctrl.mandatoryControls} onChange={(e) => update(ctrl.id, 'mandatoryControls', e.target.value)} rows={2} className={textareaCls} placeholder="List the mandatory controls for this risk…" />
              </div>
              <div className="sm:col-span-2">
                <label className="text-xs text-slate-500 mb-1 block">Verification Method</label>
                <input value={ctrl.verificationMethod ?? ''} onChange={(e) => update(ctrl.id, 'verificationMethod', e.target.value)} className={inputCls} placeholder="How will compliance be verified?" />
              </div>
              <div>
                <label className="text-xs text-slate-500 mb-1 block">Flags</label>
                <div className="flex flex-wrap gap-1 mt-1">
                  {(['critical', 'mandatory', 'client-requirement', 'permit-condition'] as ControlFlag[]).map((flag) => (
                    <button key={flag} type="button" onClick={() => toggleFlag(ctrl.id, flag)}
                      className={`text-xs px-2 py-0.5 rounded-full border font-semibold transition-colors ${ctrl.flags.includes(flag) ? 'bg-primary text-white border-primary' : 'bg-white text-slate-500 border-slate-300 hover:border-primary'}`}>
                      {flagLabels[flag]}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>
        ))}
        <button type="button" onClick={add} className="flex items-center gap-2 text-sm font-semibold text-primary hover:underline">
          <Plus size={14} /> Add critical control
        </button>
      </div>
    );
  }

  function renderPlant() {
    const add = () => set('plantItems', [...data.plantItems, { id: uid(), item: '', requirement: '', inspectionRequired: '', notes: '' }]);
    const remove = (id: string) => set('plantItems', data.plantItems.filter((p) => p.id !== id));
    const update = (id: string, field: keyof PlantItem, value: string) =>
      set('plantItems', data.plantItems.map((p) => p.id === id ? { ...p, [field]: value } : p));

    return (
      <div className="flex flex-col gap-4">
        {sectionHead('Key Plant, Tools & Safety Equipment')}
        <p className="text-xs text-slate-500">Only include items selected for this SWMS. Do not output unused equipment.</p>
        {data.plantItems.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50">
                  <th className="text-left p-2 border border-slate-200 font-semibold text-slate-600">Item</th>
                  <th className="text-left p-2 border border-slate-200 font-semibold text-slate-600">Requirement</th>
                  <th className="text-left p-2 border border-slate-200 font-semibold text-slate-600">Inspection / Test</th>
                  <th className="w-8 border border-slate-200"></th>
                </tr>
              </thead>
              <tbody>
                {data.plantItems.map((p) => (
                  <tr key={p.id}>
                    <td className="p-1 border border-slate-200">
                      <input value={p.item} onChange={(e) => update(p.id, 'item', e.target.value)} className="w-full px-2 py-1 text-xs border-0 focus:outline-none focus:ring-1 focus:ring-primary/30 rounded" placeholder="e.g. Angle grinder" />
                    </td>
                    <td className="p-1 border border-slate-200">
                      <input value={p.requirement} onChange={(e) => update(p.id, 'requirement', e.target.value)} className="w-full px-2 py-1 text-xs border-0 focus:outline-none focus:ring-1 focus:ring-primary/30 rounded" placeholder="e.g. Guarded, tagged" />
                    </td>
                    <td className="p-1 border border-slate-200">
                      <input value={p.inspectionRequired} onChange={(e) => update(p.id, 'inspectionRequired', e.target.value)} className="w-full px-2 py-1 text-xs border-0 focus:outline-none focus:ring-1 focus:ring-primary/30 rounded" placeholder="e.g. Pre-start check" />
                    </td>
                    <td className="p-1 border border-slate-200 text-center">
                      <button type="button" onClick={() => remove(p.id)} className="text-slate-400 hover:text-red-500 transition-colors"><Trash2 size={12} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <button type="button" onClick={add} className="flex items-center gap-2 text-sm font-semibold text-primary hover:underline">
          <Plus size={14} /> Add item
        </button>
      </div>
    );
  }

  function renderPPE() {
    const togglePpe = (item: string) => {
      const exists = data.ppeRows.find((p) => p.item === item);
      if (exists) {
        set('ppeRows', data.ppeRows.filter((p) => p.item !== item));
      } else {
        set('ppeRows', [...data.ppeRows, { item, requirement: 'Mandatory' }]);
      }
    };
    const updateReq = (item: string, req: string) =>
      set('ppeRows', data.ppeRows.map((p) => p.item === item ? { ...p, requirement: req } : p));

    return (
      <div className="flex flex-col gap-4">
        {sectionHead('PPE Requirements')}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
          {PPE_ITEMS.map((item) => {
            const selected = data.ppeRows.some((p) => p.item === item);
            return (
              <label key={item} className={`flex items-center gap-2 p-2 rounded-lg border cursor-pointer text-xs transition-colors ${selected ? 'border-primary bg-orange-50 font-semibold text-primary' : 'border-slate-200 hover:border-slate-300 text-slate-600'}`}>
                <input type="checkbox" checked={selected} onChange={() => togglePpe(item)} className="rounded shrink-0" />
                {item}
              </label>
            );
          })}
        </div>
        {data.ppeRows.length > 0 && (
          <div>
            <p className="text-xs font-bold text-slate-600 uppercase tracking-wide mb-2">Selected PPE — set requirements:</p>
            <div className="overflow-x-auto">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50">
                    <th className="text-left p-2 border border-slate-200 font-semibold text-slate-600">PPE Item</th>
                    <th className="text-left p-2 border border-slate-200 font-semibold text-slate-600">Requirement</th>
                  </tr>
                </thead>
                <tbody>
                  {data.ppeRows.map((row) => (
                    <tr key={row.item}>
                      <td className="p-2 border border-slate-200 font-semibold text-slate-700">{row.item}</td>
                      <td className="p-1 border border-slate-200">
                        <input value={row.requirement} onChange={(e) => updateReq(row.item, e.target.value)} className="w-full px-2 py-1 text-xs border-0 focus:outline-none focus:ring-1 focus:ring-primary/30 rounded" placeholder="e.g. Mandatory, Class 1" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    );
  }

  function renderSequence() {
    const addStep = () => set('workSteps', [...data.workSteps, {
      id: uid(),
      sequenceNumber: data.workSteps.length + 1,
      sequenceOfWork: '',
      hazardsAndRisks: '',
      possibleConsequence: '',
      initialRisk: '',
      controlMeasures: '',
      residualRisk: '',
      responsiblePerson: '',
      expanded: true,
    }]);
    const removeStep = (id: string) => {
      const filtered = data.workSteps.filter((s) => s.id !== id);
      set('workSteps', filtered.map((s, i) => ({ ...s, sequenceNumber: i + 1 })));
    };
    const duplicateStep = (id: string) => {
      const idx = data.workSteps.findIndex((s) => s.id === id);
      const copy = { ...data.workSteps[idx], id: uid(), sequenceNumber: 0 };
      const arr = [...data.workSteps.slice(0, idx + 1), copy, ...data.workSteps.slice(idx + 1)];
      set('workSteps', arr.map((s, i) => ({ ...s, sequenceNumber: i + 1 })));
    };
    const updateStep = (id: string, field: keyof WorkStep, value: unknown) =>
      set('workSteps', data.workSteps.map((s) => s.id === id ? { ...s, [field]: value } : s));
    const toggleExpand = (id: string) =>
      set('workSteps', data.workSteps.map((s) => s.id === id ? { ...s, expanded: !s.expanded } : s));

    return (
      <div className="flex flex-col gap-3">
        {sectionHead('Sequence of Work & Control Measures')}
        <p className="text-xs text-slate-500">This is the main part of the SWMS. Controls must relate directly to the work step and hazard. Aim for 3–7 strong controls per step.</p>

        {data.workSteps.map((step) => (
          <div key={step.id} className="border border-slate-200 rounded-lg bg-white overflow-hidden">
            {/* Row header */}
            <div className="flex items-center gap-2 px-3 py-2 bg-slate-50 border-b border-slate-200">
              <GripVertical size={14} className="text-slate-300 shrink-0" />
              <span className="text-xs font-bold text-slate-500 w-6 shrink-0">{step.sequenceNumber}</span>
              <div className="flex-1 min-w-0">
                {step.expanded ? (
                  <input value={step.sequenceOfWork} onChange={(e) => updateStep(step.id, 'sequenceOfWork', e.target.value)}
                    className="w-full text-sm font-semibold bg-transparent border-0 focus:outline-none placeholder-slate-400"
                    placeholder="Describe this work step…" />
                ) : (
                  <p className="text-sm font-semibold text-slate-700 truncate">{step.sequenceOfWork || <span className="text-slate-400 font-normal">Untitled step</span>}</p>
                )}
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {!step.expanded && (
                  <>
                    <span className={`text-xs px-1.5 py-0.5 rounded font-bold ${RISK_COLORS[step.initialRisk]}`}>{step.initialRisk ? step.initialRisk[0].toUpperCase() : '?'}</span>
                    <span className="text-slate-300">→</span>
                    <span className={`text-xs px-1.5 py-0.5 rounded font-bold ${RISK_COLORS[step.residualRisk]}`}>{step.residualRisk ? step.residualRisk[0].toUpperCase() : '?'}</span>
                  </>
                )}
                <button type="button" onClick={() => duplicateStep(step.id)} className="p-1 text-slate-400 hover:text-primary transition-colors" title="Duplicate"><Copy size={13} /></button>
                <button type="button" onClick={() => removeStep(step.id)} className="p-1 text-slate-400 hover:text-red-500 transition-colors" title="Delete"><Trash2 size={13} /></button>
                <button type="button" onClick={() => toggleExpand(step.id)} className="p-1 text-slate-400 hover:text-slate-600 transition-colors">
                  {step.expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                </button>
              </div>
            </div>

            {/* Expanded body */}
            <AnimatePresence>
              {step.expanded && (
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} transition={{ duration: 0.15 }} className="overflow-hidden">
                  <div className="p-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="sm:col-span-2">
                      <label className="text-xs text-slate-500 mb-1 block">Sequence of Work</label>
                      <textarea value={step.sequenceOfWork} onChange={(e) => updateStep(step.id, 'sequenceOfWork', e.target.value)} rows={2} className={textareaCls} placeholder="Describe the specific work activity for this step…" />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="text-xs text-slate-500 mb-1 block">Hazards <span className="text-red-400">*</span></label>
                      <textarea value={step.hazardsAndRisks} onChange={(e) => updateStep(step.id, 'hazardsAndRisks', e.target.value)} rows={2} className={textareaCls} placeholder="• Identify the specific hazard (e.g. exposed rotating blade, live conductors)…" />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="text-xs text-slate-500 mb-1 block">Possible Consequence <span className="text-red-400">*</span></label>
                      <textarea value={step.possibleConsequence} onChange={(e) => updateStep(step.id, 'possibleConsequence', e.target.value)} rows={2} className={textareaCls} placeholder="• What injury or damage could result? (e.g. laceration, electrocution, property damage)…" />
                    </div>
                    <div>
                      <label className="text-xs text-slate-500 mb-1 block">Initial Risk</label>
                      <RiskBadge value={step.initialRisk} onChange={(v) => updateStep(step.id, 'initialRisk', v)} />
                    </div>
                    <div>
                      <label className="text-xs text-slate-500 mb-1 block">Residual Risk</label>
                      <RiskBadge value={step.residualRisk} onChange={(v) => updateStep(step.id, 'residualRisk', v)} />
                    </div>
                    <div className="sm:col-span-2">
                      <label className="text-xs text-slate-500 mb-1 block">Work Methods & Control Measures</label>
                      <p className="text-xs text-slate-400 mb-1">Use action verbs: Review, Confirm, Identify, Inspect, Isolate, Establish, Maintain, Prevent, Use, Monitor, Stop work</p>
                      <textarea value={step.controlMeasures} onChange={(e) => updateStep(step.id, 'controlMeasures', e.target.value)} rows={4} className={textareaCls} placeholder="• Inspect all tools before use&#10;• Isolate and tag out before commencing&#10;• Establish exclusion zone…" />
                    </div>
                    <div>
                      <label className="text-xs text-slate-500 mb-1 block">Responsible Person / Role</label>
                      <input value={step.responsiblePerson} onChange={(e) => updateStep(step.id, 'responsiblePerson', e.target.value)} className={inputCls} placeholder="e.g. Supervisor" />
                    </div>
                    {data.buildMode === 'advanced' && (
                      <>
                        <div>
                          <label className="text-xs text-slate-500 mb-1 block">Monitoring Method</label>
                          <input value={step.monitoringMethod ?? ''} onChange={(e) => updateStep(step.id, 'monitoringMethod', e.target.value)} className={inputCls} placeholder="How will compliance be monitored?" />
                        </div>
                        <div>
                          <label className="text-xs text-slate-500 mb-1 block">Stop-Work Trigger</label>
                          <input value={step.stopWorkTrigger ?? ''} onChange={(e) => updateStep(step.id, 'stopWorkTrigger', e.target.value)} className={inputCls} placeholder="When must work stop?" />
                        </div>
                        <div>
                          <label className="text-xs text-slate-500 mb-1 block">Linked Permit</label>
                          <input value={step.linkedPermit ?? ''} onChange={(e) => updateStep(step.id, 'linkedPermit', e.target.value)} className={inputCls} placeholder="e.g. Permit to work" />
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-slate-600">
                            <input type="checkbox" checked={!!step.isCriticalControl} onChange={(e) => updateStep(step.id, 'isCriticalControl', e.target.checked)} className="rounded" />
                            Mark as critical control
                          </label>
                        </div>
                      </>
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        ))}

        <button type="button" onClick={addStep} className="flex items-center gap-2 text-sm font-semibold text-primary hover:underline">
          <Plus size={14} /> Add work step
        </button>
      </div>
    );
  }

  function renderEmergency() {
    const updateAction = (id: string, action: string) =>
      set('emergencyActions', data.emergencyActions.map((a) => a.id === id ? { ...a, action } : a));
    const addAction = () => set('emergencyActions', [...data.emergencyActions, { id: uid(), action: '' }]);
    const removeAction = (id: string) => set('emergencyActions', data.emergencyActions.filter((a) => a.id !== id));
    const toggleModule = (mod: string) => {
      const has = data.emergencyModules.includes(mod);
      set('emergencyModules', has ? data.emergencyModules.filter((m) => m !== mod) : [...data.emergencyModules, mod]);
    };

    return (
      <div className="flex flex-col gap-4">
        {sectionHead('Emergency & Incident Response')}
        <p className="text-xs text-slate-500">Include task-specific emergency actions only. Do not repeat the entire project emergency plan.</p>
        <div className="flex flex-col gap-2">
          {data.emergencyActions.map((action) => (
            <div key={action.id} className="flex gap-2 items-center">
              <span className="text-slate-400 shrink-0"><Flame size={12} /></span>
              <input value={action.action} onChange={(e) => updateAction(action.id, e.target.value)} className={`${inputCls} flex-1`} placeholder="Emergency action…" />
              <button type="button" onClick={() => removeAction(action.id)} className="p-1.5 text-slate-400 hover:text-red-500 transition-colors"><Trash2 size={13} /></button>
            </div>
          ))}
          <button type="button" onClick={addAction} className="flex items-center gap-2 text-sm font-semibold text-primary hover:underline mt-1">
            <Plus size={14} /> Add action
          </button>
        </div>
        <div>
          <label className={labelCls}>Task-specific emergency modules <span className="text-slate-400 font-normal">(optional)</span></label>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
            {EMERGENCY_MODULE_TYPES.map((mod) => {
              const selected = data.emergencyModules.includes(mod);
              return (
                <label key={mod} className={`flex items-center gap-2 p-2 rounded-lg border cursor-pointer text-xs transition-colors ${selected ? 'border-red-400 bg-red-50 font-semibold text-red-700' : 'border-slate-200 hover:border-slate-300 text-slate-600'}`}>
                  <input type="checkbox" checked={selected} onChange={() => toggleModule(mod)} className="rounded shrink-0" />
                  {mod}
                </label>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  function renderSignOff() {
    const addWorker = () => set('workerSignOns', [...data.workerSignOns, { id: uid(), name: '', companyTrade: '', date: new Date().toISOString().slice(0, 10) }]);
    const removeWorker = (id: string) => set('workerSignOns', data.workerSignOns.filter((w) => w.id !== id));
    const updateWorker = (id: string, field: string, value: string) =>
      set('workerSignOns', data.workerSignOns.map((w) => w.id === id ? { ...w, [field]: value } : w));
    const updateSup = (field: string, value: string) =>
      set('supervisorDeclaration', { ...data.supervisorDeclaration, [field]: value });

    return (
      <div className="flex flex-col gap-5">
        {sectionHead('Worker Sign-On & Supervisor Declaration')}

        {/* Worker sign-on */}
        <div>
          <p className="text-xs font-bold text-slate-600 uppercase tracking-wide mb-2">Worker Sign-On</p>
          <p className="text-xs text-slate-500 mb-3 italic">
            "I confirm that this SWMS has been explained to me, I understand the hazards and controls, I have had the opportunity to ask questions, and I agree to follow the documented work method."
          </p>
          {data.workerSignOns.length > 0 && (
            <div className="overflow-x-auto mb-3">
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50">
                    <th className="text-left p-2 border border-slate-200 font-semibold text-slate-600">Name</th>
                    <th className="text-left p-2 border border-slate-200 font-semibold text-slate-600">Company / Trade</th>
                    <th className="text-left p-2 border border-slate-200 font-semibold text-slate-600">Date</th>
                    <th className="w-8 border border-slate-200"></th>
                  </tr>
                </thead>
                <tbody>
                  {data.workerSignOns.map((w) => (
                    <tr key={w.id}>
                      <td className="p-1 border border-slate-200">
                        <input value={w.name} onChange={(e) => updateWorker(w.id, 'name', e.target.value)} className="w-full px-2 py-1 text-xs border-0 focus:outline-none focus:ring-1 focus:ring-primary/30 rounded" placeholder="Full name" />
                      </td>
                      <td className="p-1 border border-slate-200">
                        <input value={w.companyTrade} onChange={(e) => updateWorker(w.id, 'companyTrade', e.target.value)} className="w-full px-2 py-1 text-xs border-0 focus:outline-none focus:ring-1 focus:ring-primary/30 rounded" placeholder="e.g. MLCH Electrical" />
                      </td>
                      <td className="p-1 border border-slate-200">
                        <input type="date" value={w.date} onChange={(e) => updateWorker(w.id, 'date', e.target.value)} className="w-full px-2 py-1 text-xs border-0 focus:outline-none focus:ring-1 focus:ring-primary/30 rounded" />
                      </td>
                      <td className="p-1 border border-slate-200 text-center">
                        <button type="button" onClick={() => removeWorker(w.id)} className="text-slate-400 hover:text-red-500 transition-colors"><Trash2 size={12} /></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <button type="button" onClick={addWorker} className="flex items-center gap-2 text-sm font-semibold text-primary hover:underline">
            <Plus size={14} /> Add worker
          </button>
        </div>

        {/* Supervisor declaration */}
        <div>
          <p className="text-xs font-bold text-slate-600 uppercase tracking-wide mb-2">Supervisor Declaration</p>
          <p className="text-xs text-slate-500 mb-3 italic">
            "I confirm that affected workers have been consulted and instructed in this SWMS, required controls are available, and the work will be monitored for compliance."
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="text-xs text-slate-500 mb-1 block">Name</label>
              <input value={data.supervisorDeclaration.name} onChange={(e) => updateSup('name', e.target.value)} className={inputCls} placeholder="Supervisor name" />
            </div>
            <div>
              <label className="text-xs text-slate-500 mb-1 block">Position</label>
              <input value={data.supervisorDeclaration.position} onChange={(e) => updateSup('position', e.target.value)} className={inputCls} placeholder="e.g. Site Supervisor" />
            </div>
            <div>
              <label className="text-xs text-slate-500 mb-1 block">Date</label>
              <input type="date" value={data.supervisorDeclaration.date} onChange={(e) => updateSup('date', e.target.value)} className={inputCls} />
            </div>
            <div className="sm:col-span-3">
              <label className="text-xs text-slate-500 mb-1 block">Comments (optional)</label>
              <textarea value={data.supervisorDeclaration.comments ?? ''} onChange={(e) => updateSup('comments', e.target.value)} rows={2} className={textareaCls} placeholder="Optional supervisor comments…" />
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ─── Advanced sections ────────────────────────────────────────────────────
  function renderTaskRequirements() {
    const add = () => set('taskRequirements', [...data.taskRequirements, { id: uid(), type: '', description: '' }]);
    const remove = (id: string) => set('taskRequirements', data.taskRequirements.filter((t) => t.id !== id));
    const update = (id: string, field: keyof TaskRequirement, value: string) =>
      set('taskRequirements', data.taskRequirements.map((t) => t.id === id ? { ...t, [field]: value } : t));

    return (
      <div className="flex flex-col gap-4">
        {sectionHead('Task-Specific Requirements')}
        <p className="text-xs text-slate-500">Only include sections that are relevant. Avoid repeating controls already covered in the sequence table.</p>
        {data.taskRequirements.map((req) => (
          <div key={req.id} className="border border-slate-200 rounded-lg p-3 bg-white">
            <div className="flex gap-2 mb-2">
              <select value={req.type} onChange={(e) => update(req.id, 'type', e.target.value)} className={`${inputCls} flex-1`}>
                <option value="">Select type…</option>
                {TASK_REQUIREMENT_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
              <button type="button" onClick={() => remove(req.id)} className="p-2 text-slate-400 hover:text-red-500 transition-colors"><Trash2 size={13} /></button>
            </div>
            <textarea value={req.description} onChange={(e) => update(req.id, 'description', e.target.value)} rows={2} className={textareaCls} placeholder="Describe the requirement…" />
          </div>
        ))}
        <button type="button" onClick={add} className="flex items-center gap-2 text-sm font-semibold text-primary hover:underline">
          <Plus size={14} /> Add requirement
        </button>
      </div>
    );
  }

  function renderEnvControls() {
    const toggleEnv = (type: string) => {
      const exists = data.envControls.find((e) => e.type === type);
      if (exists) {
        set('envControls', data.envControls.filter((e) => e.type !== type));
      } else {
        set('envControls', [...data.envControls, { type, description: '', responsiblePerson: '' }]);
      }
    };
    const updateEnv = (type: string, field: keyof EnvControl, value: string) =>
      set('envControls', data.envControls.map((e) => e.type === type ? { ...e, [field]: value } : e));

    return (
      <div className="flex flex-col gap-4">
        {sectionHead('Environmental & Site Controls')}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
          {ENV_CONTROL_OPTIONS.map((opt) => {
            const selected = data.envControls.some((e) => e.type === opt);
            return (
              <label key={opt} className={`flex items-center gap-2 p-2 rounded-lg border cursor-pointer text-xs transition-colors ${selected ? 'border-green-500 bg-green-50 font-semibold text-green-700' : 'border-slate-200 hover:border-slate-300 text-slate-600'}`}>
                <input type="checkbox" checked={selected} onChange={() => toggleEnv(opt)} className="rounded shrink-0" />
                {opt}
              </label>
            );
          })}
        </div>
        {data.envControls.length > 0 && (
          <div className="flex flex-col gap-2">
            {data.envControls.map((ctrl) => (
              <div key={ctrl.type} className="border border-slate-200 rounded-lg p-3 bg-slate-50">
                <p className="text-xs font-bold text-green-700 mb-2">{ctrl.type}</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div>
                    <label className="text-xs text-slate-500 mb-1 block">Description</label>
                    <input value={ctrl.description} onChange={(e) => updateEnv(ctrl.type, 'description', e.target.value)} className={inputCls} placeholder="Control description…" />
                  </div>
                  <div>
                    <label className="text-xs text-slate-500 mb-1 block">Responsible person</label>
                    <input value={ctrl.responsiblePerson ?? ''} onChange={(e) => updateEnv(ctrl.type, 'responsiblePerson', e.target.value)} className={inputCls} placeholder="e.g. Site Supervisor" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  function renderCompetency() {
    const toggleComp = (req: string) => {
      const exists = data.competencyRows.find((c) => c.requirement === req);
      if (exists) {
        set('competencyRows', data.competencyRows.filter((c) => c.requirement !== req));
      } else {
        set('competencyRows', [...data.competencyRows, { requirement: req, applies: true, evidenceOrAuth: '' }]);
      }
    };
    const updateComp = (req: string, field: keyof CompetencyRow, value: unknown) =>
      set('competencyRows', data.competencyRows.map((c) => c.requirement === req ? { ...c, [field]: value } : c));

    return (
      <div className="flex flex-col gap-4">
        {sectionHead('Training, Competency & Authorisations')}
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
          {COMPETENCY_OPTIONS.map((opt) => {
            const selected = data.competencyRows.some((c) => c.requirement === opt);
            return (
              <label key={opt} className={`flex items-center gap-2 p-2 rounded-lg border cursor-pointer text-xs transition-colors ${selected ? 'border-primary bg-orange-50 font-semibold text-primary' : 'border-slate-200 hover:border-slate-300 text-slate-600'}`}>
                <input type="checkbox" checked={selected} onChange={() => toggleComp(opt)} className="rounded shrink-0" />
                {opt}
              </label>
            );
          })}
        </div>
        {data.competencyRows.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50">
                  <th className="text-left p-2 border border-slate-200 font-semibold text-slate-600">Requirement</th>
                  <th className="text-left p-2 border border-slate-200 font-semibold text-slate-600">Evidence / Authorisation</th>
                </tr>
              </thead>
              <tbody>
                {data.competencyRows.map((row) => (
                  <tr key={row.requirement}>
                    <td className="p-2 border border-slate-200 font-semibold text-slate-700">{row.requirement}</td>
                    <td className="p-1 border border-slate-200">
                      <input value={row.evidenceOrAuth} onChange={(e) => updateComp(row.requirement, 'evidenceOrAuth', e.target.value)} className="w-full px-2 py-1 text-xs border-0 focus:outline-none focus:ring-1 focus:ring-primary/30 rounded" placeholder="e.g. Licence on file, VOC completed" />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  }

  function renderDefinitions() {
    const add = () => set('definitions', [...data.definitions, { id: uid(), term: '', definition: '' }]);
    const remove = (id: string) => set('definitions', data.definitions.filter((d) => d.id !== id));
    const update = (id: string, field: keyof DefinitionRow, value: string) =>
      set('definitions', data.definitions.map((d) => d.id === id ? { ...d, [field]: value } : d));

    return (
      <div className="flex flex-col gap-4">
        {sectionHead('Definitions')}
        <p className="text-xs text-slate-500">Only include definitions relevant to this document. Do not add a definitions section to simple SWMS where it is not required.</p>
        {data.definitions.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50">
                  <th className="text-left p-2 border border-slate-200 font-semibold text-slate-600 w-1/3">Term</th>
                  <th className="text-left p-2 border border-slate-200 font-semibold text-slate-600">Definition</th>
                  <th className="w-8 border border-slate-200"></th>
                </tr>
              </thead>
              <tbody>
                {data.definitions.map((def) => (
                  <tr key={def.id}>
                    <td className="p-1 border border-slate-200">
                      <input value={def.term} onChange={(e) => update(def.id, 'term', e.target.value)} className="w-full px-2 py-1 text-xs border-0 focus:outline-none focus:ring-1 focus:ring-primary/30 rounded" placeholder="Term" />
                    </td>
                    <td className="p-1 border border-slate-200">
                      <input value={def.definition} onChange={(e) => update(def.id, 'definition', e.target.value)} className="w-full px-2 py-1 text-xs border-0 focus:outline-none focus:ring-1 focus:ring-primary/30 rounded" placeholder="Definition" />
                    </td>
                    <td className="p-1 border border-slate-200 text-center">
                      <button type="button" onClick={() => remove(def.id)} className="text-slate-400 hover:text-red-500 transition-colors"><Trash2 size={12} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <button type="button" onClick={add} className="flex items-center gap-2 text-sm font-semibold text-primary hover:underline">
          <Plus size={14} /> Add definition
        </button>
      </div>
    );
  }

  function renderRelatedDocs() {
    const add = () => set('relatedDocs', [...data.relatedDocs, { id: uid(), type: '', document: '', revision: '', status: '' }]);
    const remove = (id: string) => set('relatedDocs', data.relatedDocs.filter((d) => d.id !== id));
    const update = (id: string, field: keyof RelatedDoc, value: string) =>
      set('relatedDocs', data.relatedDocs.map((d) => d.id === id ? { ...d, [field]: value } : d));

    return (
      <div className="flex flex-col gap-4">
        {sectionHead('Related SWMS, Permits & Documents')}
        {data.relatedDocs.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-collapse">
              <thead>
                <tr className="bg-slate-50">
                  <th className="text-left p-2 border border-slate-200 font-semibold text-slate-600">Type</th>
                  <th className="text-left p-2 border border-slate-200 font-semibold text-slate-600">Document</th>
                  <th className="text-left p-2 border border-slate-200 font-semibold text-slate-600">Rev.</th>
                  <th className="text-left p-2 border border-slate-200 font-semibold text-slate-600">Status</th>
                  <th className="w-8 border border-slate-200"></th>
                </tr>
              </thead>
              <tbody>
                {data.relatedDocs.map((doc) => (
                  <tr key={doc.id} className={doc.status === 'superseded' || doc.status === 'missing' ? 'bg-red-50' : ''}>
                    <td className="p-1 border border-slate-200">
                      <input value={doc.type} onChange={(e) => update(doc.id, 'type', e.target.value)} className="w-full px-2 py-1 text-xs border-0 focus:outline-none focus:ring-1 focus:ring-primary/30 rounded" placeholder="e.g. Related SWMS" />
                    </td>
                    <td className="p-1 border border-slate-200">
                      <input value={doc.document} onChange={(e) => update(doc.id, 'document', e.target.value)} className="w-full px-2 py-1 text-xs border-0 focus:outline-none focus:ring-1 focus:ring-primary/30 rounded" placeholder="Document name or number" />
                    </td>
                    <td className="p-1 border border-slate-200">
                      <input value={doc.revision} onChange={(e) => update(doc.id, 'revision', e.target.value)} className="w-full px-2 py-1 text-xs border-0 focus:outline-none focus:ring-1 focus:ring-primary/30 rounded" placeholder="Rev 1" />
                    </td>
                    <td className="p-1 border border-slate-200">
                      <select value={doc.status} onChange={(e) => update(doc.id, 'status', e.target.value)} className="w-full px-2 py-1 text-xs border-0 focus:outline-none focus:ring-1 focus:ring-primary/30 rounded bg-transparent">
                        <option value="">—</option>
                        <option value="current">Current</option>
                        <option value="superseded">Superseded ⚠</option>
                        <option value="missing">Missing ⚠</option>
                      </select>
                    </td>
                    <td className="p-1 border border-slate-200 text-center">
                      <button type="button" onClick={() => remove(doc.id)} className="text-slate-400 hover:text-red-500 transition-colors"><Trash2 size={12} /></button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <button type="button" onClick={add} className="flex items-center gap-2 text-sm font-semibold text-primary hover:underline">
          <Plus size={14} /> Add document
        </button>
      </div>
    );
  }

  function renderSection() {
    const id = allSections[step]?.id;
    switch (id) {
      case 'identity':    return renderIdentity();
      case 'purpose':     return renderPurpose();
      case 'hrcw':        return renderHRCW();
      case 'critical':    return renderCriticalControls();
      case 'plant':       return renderPlant();
      case 'ppe':         return renderPPE();
      case 'sequence':    return renderSequence();
      case 'emergency':   return renderEmergency();
      case 'signoff':     return renderSignOff();
      case 'task-req':    return renderTaskRequirements();
      case 'env':         return renderEnvControls();
      case 'competency':  return renderCompetency();
      case 'definitions': return renderDefinitions();
      case 'related':     return renderRelatedDocs();
      default:            return null;
    }
  }

  const currentSection = allSections[step];
  const isFirst = step === 0;
  const isLast = step === allSections.length - 1;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center sm:p-4">
      <div className="absolute inset-0 bg-black/60" onClick={onClose} />
      <motion.div
        initial={{ opacity: 0, y: 40 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 40 }}
        transition={{ duration: 0.2, ease: 'easeOut' as const }}
        className="relative bg-white rounded-t-2xl sm:rounded-2xl shadow-2xl w-full sm:max-w-4xl max-h-[96vh] sm:max-h-[92vh] flex flex-col"
      >
        {/* ── Header ── */}
        <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-200 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="p-1.5 bg-orange-50 rounded-md"><ShieldAlert size={16} className="text-primary" /></div>
            <div>
              <h2 className="font-heading font-bold text-base leading-tight">{isEdit ? 'Edit SWMS' : 'New SWMS'}</h2>
              <p className="text-xs text-slate-400 mt-0.5">{data.title || 'Safe Work Method Statement'}</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {/* Mode toggle — two explicit options */}
            <div className="flex items-center rounded-lg border border-slate-200 bg-slate-100 p-0.5 gap-0.5">
              <button
                type="button"
                onClick={() => { set('buildMode', 'quick'); setStep(0); }}
                className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-md transition-colors ${data.buildMode === 'quick' ? 'bg-white text-orange-600 shadow-sm border border-orange-200' : 'text-slate-500 hover:text-slate-700'}`}
                title="9 sections — Identity, HRCW, Controls, PPE, Sequence, Emergency, Sign-On"
              >
                <Zap size={12} />
                Quick
                <span className={`text-[10px] font-normal ${data.buildMode === 'quick' ? 'text-orange-400' : 'text-slate-400'}`}>9 sections</span>
              </button>
              <button
                type="button"
                onClick={() => { set('buildMode', 'advanced'); setStep(0); }}
                className={`flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-md transition-colors ${data.buildMode === 'advanced' ? 'bg-white text-slate-800 shadow-sm border border-slate-300' : 'text-slate-500 hover:text-slate-700'}`}
                title="14 sections — adds Task Requirements, Environmental Controls, Training & Competency, Definitions, Related Documents"
              >
                <Settings2 size={12} />
                Advanced
                <span className={`text-[10px] font-normal ${data.buildMode === 'advanced' ? 'text-slate-400' : 'text-slate-400'}`}>14 sections</span>
              </button>
            </div>
            {/* Validation badge */}
            {(errorCount > 0 || warnCount > 0) && (
              <div className={`flex items-center gap-1 text-xs font-bold px-2 py-1 rounded-lg ${errorCount > 0 ? 'bg-red-50 text-red-600' : 'bg-amber-50 text-amber-600'}`}>
                <AlertTriangle size={11} />
                {errorCount > 0 ? `${errorCount} error${errorCount > 1 ? 's' : ''}` : `${warnCount} warning${warnCount > 1 ? 's' : ''}`}
              </div>
            )}
            <button onClick={onClose} className="p-1.5 rounded-md text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors"><X size={16} /></button>
          </div>
        </div>

        {/* ── Step nav ── */}
        <div className="flex gap-0 overflow-x-auto border-b border-slate-200 shrink-0 bg-slate-50">
          {allSections.map((sec, i) => (
            <button
              key={sec.id}
              type="button"
              onClick={() => setStep(i)}
              className={`flex items-center gap-1.5 px-3 py-2.5 text-xs font-semibold whitespace-nowrap border-b-2 transition-colors shrink-0
                ${i === step ? 'border-primary text-primary bg-white' : 'border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-100'}
                ${!sec.quickBuild ? 'border-l border-l-violet-200 bg-violet-50/40' : ''}`}
              title={!sec.quickBuild ? 'Advanced mode only' : ''}
            >
              {sec.icon}
              <span className="hidden sm:inline">{sec.label}</span>
              <span className="sm:hidden">{i + 1}</span>
              {!sec.quickBuild && <span className="hidden sm:inline text-[9px] font-bold text-violet-400 uppercase tracking-wide ml-0.5">+</span>}
            </button>
          ))}
        </div>

        {/* ── Body ── */}
        <div className="flex-1 overflow-y-auto p-5">
          <AnimatePresence mode="wait">
            <motion.div
              key={step}
              initial={{ opacity: 0, x: 12 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -12 }}
              transition={{ duration: 0.15 }}
            >
              {renderSection()}
            </motion.div>
          </AnimatePresence>
        </div>

        {/* ── Footer ── */}
        <div className="px-5 py-3.5 border-t border-slate-200 shrink-0 bg-white">
          {saveError && (
            <div className="flex items-center gap-2 text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2 text-sm mb-3">
              <AlertCircle size={14} className="shrink-0" />{saveError}
            </div>
          )}
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => setStep((s) => Math.max(0, s - 1))} disabled={isFirst}
              className="flex items-center gap-1.5 px-3 py-2 border border-slate-200 rounded-lg text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-40">
              <ChevronLeft size={14} /> Back
            </button>
            <div className="flex-1 flex items-center justify-center gap-1">
              {allSections.map((_, i) => (
                <button key={i} type="button" onClick={() => setStep(i)}
                  className={`w-1.5 h-1.5 rounded-full transition-colors ${i === step ? 'bg-primary' : 'bg-slate-300 hover:bg-slate-400'}`} />
              ))}
            </div>
            <button type="button" onClick={() => handleSave(false)} disabled={saving}
              className="flex items-center gap-1.5 px-3 py-2 border border-slate-200 rounded-lg text-sm font-semibold text-slate-600 hover:bg-slate-50 transition-colors disabled:opacity-50">
              {saving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
              Save
            </button>
            {isLast ? (
              <button type="button" onClick={() => handleSave(true)} disabled={saving}
                className="flex items-center gap-1.5 px-4 py-2 bg-primary hover:bg-orange-600 text-white rounded-lg text-sm font-bold transition-colors disabled:opacity-60">
                {saving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                Save & Close
              </button>
            ) : (
              <button type="button" onClick={() => setStep((s) => Math.min(allSections.length - 1, s + 1))}
                className="flex items-center gap-1.5 px-4 py-2 bg-primary hover:bg-orange-600 text-white rounded-lg text-sm font-bold transition-colors">
                Next <ChevronRight size={14} />
              </button>
            )}
          </div>
        </div>
      </motion.div>
    </div>
  );
}
