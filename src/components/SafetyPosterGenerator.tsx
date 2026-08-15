import { useState, useRef, useEffect } from 'react';
import { X, Printer, Save, Loader2, ChevronLeft, Download } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { openPrintWindow } from '@/lib/print-html';
import { downloadPosterAsPdf } from '@/lib/poster-pdf';
import {
  PosterRiskMatrix, PosterEmergencyContacts, PosterEmergencyAssembly,
  PosterLifeSavingRules, PosterPPE, PosterLiftSafely, PosterSiteRules,
} from './safety-posters/index';
import type {
  RiskMatrixData, EmergencyContactsData, EmergencyAssemblyData,
  LifeSavingRulesData, PPEData, LiftSafelyData, SiteRulesData,
} from './safety-posters/index';

// ── Poster catalogue ──────────────────────────────────────────────────────────

export type PosterType =
  | 'risk_matrix'
  | 'emergency_contacts'
  | 'emergency_assembly'
  | 'life_saving_rules'
  | 'ppe'
  | 'lift_safely'
  | 'site_rules';

interface PosterDef {
  type: PosterType;
  label: string;
  description: string;
  icon: string;
  fields: FieldDef[];
}

interface FieldDef {
  key: string;
  label: string;
  placeholder?: string;
  multiline?: boolean;
  optional?: boolean;
}

const POSTER_CATALOGUE: PosterDef[] = [
  {
    type: 'risk_matrix',
    label: 'Risk Matrix',
    description: '5×5 risk matrix with hierarchy of controls, likelihood/consequence ratings, and risk level actions.',
    icon: '📊',
    fields: [
      { key: 'projectName', label: 'Project / Job Name', placeholder: 'e.g. Site A — Civil Works', optional: true },
      { key: 'siteAddress', label: 'Site Address', placeholder: 'e.g. 123 Main St, Brisbane', optional: true },
      { key: 'date', label: 'Date', placeholder: 'e.g. June 2026', optional: true },
    ],
  },
  {
    type: 'emergency_contacts',
    label: 'Emergency Contacts',
    description: 'Emergency contacts board with services, site supervisor, first aid officer, hospital, and medical centre.',
    icon: '📞',
    fields: [
      { key: 'projectName', label: 'Project / Job Name', placeholder: 'e.g. Site A — Civil Works', optional: true },
      { key: 'siteAddress', label: 'Site Address', optional: true },
      { key: 'siteSupervisor', label: 'Site Supervisor Name', placeholder: 'e.g. John Smith' },
      { key: 'siteSupervisorPhone', label: 'Site Supervisor Phone', placeholder: 'e.g. 0400 000 000' },
      { key: 'firstAidOfficer', label: 'First Aid Officer Name', placeholder: 'e.g. Jane Doe' },
      { key: 'firstAidOfficerPhone', label: 'First Aid Officer Phone', placeholder: 'e.g. 0400 000 001' },
      { key: 'nearestHospital', label: 'Nearest Hospital', placeholder: 'e.g. Royal Brisbane Hospital' },
      { key: 'nearestHospitalAddress', label: 'Hospital Address', optional: true },
      { key: 'medicalCentre', label: 'Nearest Medical Centre', optional: true },
      { key: 'medicalCentreAddress', label: 'Medical Centre Address', optional: true },
      { key: 'electricityEmergency', label: 'Electricity Emergency Number', placeholder: '13 19 62', optional: true },
      { key: 'gasEmergency', label: 'Gas Emergency Number', optional: true },
      { key: 'waterEmergency', label: 'Water Emergency Number', optional: true },
      { key: 'extraService1Label', label: 'Extra Service 1 — Label', optional: true },
      { key: 'extraService1Number', label: 'Extra Service 1 — Number', optional: true },
      { key: 'extraService2Label', label: 'Extra Service 2 — Label', optional: true },
      { key: 'extraService2Number', label: 'Extra Service 2 — Number', optional: true },
    ],
  },
  {
    type: 'emergency_assembly',
    label: 'Emergency Assembly Point',
    description: 'Emergency assembly point / muster point poster with in-an-emergency steps, contacts, and safety reminders.',
    icon: '🏃',
    fields: [
      { key: 'projectName', label: 'Project / Job Name', optional: true },
      { key: 'siteAddress', label: 'Site Address', optional: true },
      { key: 'assemblyPointDescription', label: 'Assembly Point Description', placeholder: 'Describe where the assembly point is located on site', multiline: true },
      { key: 'siteSupervisor', label: 'Site Supervisor Name' },
      { key: 'siteSupervisorPhone', label: 'Site Supervisor Phone' },
      { key: 'firstAidOfficer', label: 'First Aid Officer Name' },
      { key: 'firstAidOfficerPhone', label: 'First Aid Officer Phone' },
      { key: 'nearestHospital', label: 'Nearest Hospital' },
      { key: 'electricityEmergency', label: 'Electricity Emergency Number', placeholder: '13 19 62', optional: true },
    ],
  },
  {
    type: 'life_saving_rules',
    label: 'Life Saving Rules',
    description: '12 life saving rules in a grid layout — working at heights, road safety, permit to work, confined space, PPE, and more.',
    icon: '🛡️',
    fields: [
      { key: 'projectName', label: 'Project / Job Name', optional: true },
      { key: 'siteAddress', label: 'Site Address', optional: true },
    ],
  },
  {
    type: 'ppe',
    label: 'PPE Requirements',
    description: 'PPE requirements poster with icon strip, personal commitments, and site-specific requirements.',
    icon: '🪖',
    fields: [
      { key: 'projectName', label: 'Project / Job Name', optional: true },
      { key: 'siteAddress', label: 'Site Address', optional: true },
      { key: 'additionalRequirements', label: 'Additional Site PPE Requirements', placeholder: 'e.g. P2 respirators required in all cutting areas', multiline: true, optional: true },
    ],
  },
  {
    type: 'lift_safely',
    label: 'Lift and Move Safely',
    description: 'Manual handling poster with correct lifting technique and key rules for safe lifting.',
    icon: '🏋️',
    fields: [
      { key: 'projectName', label: 'Project / Job Name', optional: true },
      { key: 'siteAddress', label: 'Site Address', optional: true },
    ],
  },
  {
    type: 'site_rules',
    label: 'Site Rules',
    description: '12-rule site rules poster covering induction, PPE, alcohol/drugs, mobile phones, plant, hazard reporting, and environmental controls.',
    icon: '📋',
    fields: [
      { key: 'projectName', label: 'Project / Job Name', optional: true },
      { key: 'siteAddress', label: 'Site Address', optional: true },
      { key: 'siteSpeedLimit', label: 'Site Speed Limit (km/h)', placeholder: '10', optional: true },
      { key: 'additionalRules', label: 'Additional Site Rules', multiline: true, optional: true },
    ],
  },
];

// ── Poster renderer ───────────────────────────────────────────────────────────

function renderPoster(type: PosterType, data: Record<string, string>) {
  switch (type) {
    case 'risk_matrix':        return <PosterRiskMatrix data={data as RiskMatrixData} />;
    case 'emergency_contacts': return <PosterEmergencyContacts data={data as EmergencyContactsData} />;
    case 'emergency_assembly': return <PosterEmergencyAssembly data={data as EmergencyAssemblyData} />;
    case 'life_saving_rules':  return <PosterLifeSavingRules data={data as LifeSavingRulesData} />;
    case 'ppe':                return <PosterPPE data={data as PPEData} />;
    case 'lift_safely':        return <PosterLiftSafely data={data as LiftSafelyData} />;
    case 'site_rules':         return <PosterSiteRules data={data as SiteRulesData} />;
    default:                   return null;
  }
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  onClose: () => void;
  onSaved: (poster: Record<string, unknown>) => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function SafetyPosterGenerator({ onClose, onSaved }: Props) {
  const [step, setStep] = useState<'pick' | 'fill' | 'preview'>('pick');
  const [selected, setSelected] = useState<PosterDef | null>(null);
  const [formData, setFormData] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const printRef = useRef<HTMLDivElement>(null);
  const posterWrapRef = useRef<HTMLDivElement>(null);
  const [posterScale, setPosterScale] = useState(1);

  // Scale the poster preview to fit the container width on mobile
  useEffect(() => {
    if (!posterWrapRef.current) return;
    const POSTER_WIDTH = 794; // A4 at 96dpi
    const obs = new ResizeObserver((entries) => {
      const w = entries[0]?.contentRect.width ?? 0;
      if (w > 0 && w < POSTER_WIDTH) {
        setPosterScale(Math.round((w / POSTER_WIDTH) * 1000) / 1000);
      } else {
        setPosterScale(1);
      }
    });
    obs.observe(posterWrapRef.current);
    return () => obs.disconnect();
  }, [step]); // re-run when entering preview step

  function handlePick(def: PosterDef) {
    setSelected(def);
    setFormData({});
    setStep('fill');
  }

  function handlePreview() {
    setStep('preview');
  }

  async function handleSave() {
    if (!selected) return;
    setSaving(true);
    try {
      const title = formData.projectName
        ? `${selected.label} — ${formData.projectName}`
        : selected.label;
      const r = await fetch('/api/safety/generated-posters', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ posterType: selected.type, title, data: formData }),
      });
      const d = await r.json() as { poster?: Record<string, unknown>; error?: string };
      if (r.ok && d.poster) {
        onSaved(d.poster);
      }
    } finally {
      setSaving(false);
    }
  }

  function handlePrint() {
    if (!printRef.current) return;
    // innerHTML is from a React-rendered DOM ref — all content was set via
    // React's JSX renderer which escapes text nodes automatically.  No
    // user-supplied raw HTML is injected into this ref.
    const html = printRef.current.innerHTML;
    openPrintWindow(
      `<!DOCTYPE html><html><head><title>Safety Poster</title><style>body{margin:0;padding:20px;background:#fff;}@media print{body{padding:0;}}</style></head><body>${html}</body></html>`,
      true,
    );
  }

  async function handleDownloadPdf() {
    if (!printRef.current || !selected) return;
    setDownloadingPdf(true);
    try {
      const title = formData.projectName
        ? `${selected.label} — ${formData.projectName}`
        : selected.label;
      const safeFilename = title.replace(/[^a-z0-9]+/gi, '-').toLowerCase();
      await downloadPosterAsPdf(printRef.current, safeFilename);
    } catch (err) {
      console.error('Poster PDF download failed:', err);
      alert('Failed to generate PDF. Please try Print / PDF instead.');
    } finally {
      setDownloadingPdf(false);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black/60 flex items-start justify-center overflow-y-auto py-6 px-4"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 24 }}
        className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200 bg-slate-50">
          <div className="flex items-center gap-3">
            {step !== 'pick' && (
              <button onClick={() => setStep(step === 'preview' ? 'fill' : 'pick')} className="p-1.5 rounded-lg hover:bg-slate-200 transition-colors text-slate-500">
                <ChevronLeft size={16} />
              </button>
            )}
            <div>
              <h2 className="font-heading font-bold text-slate-800 text-lg">
                {step === 'pick' ? 'Generate Safety Poster' : step === 'fill' ? `Configure — ${selected?.label}` : `Preview — ${selected?.label}`}
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                {step === 'pick' ? 'Choose a poster type to generate' : step === 'fill' ? 'Fill in site-specific details' : 'Review your poster before saving'}
              </p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-slate-200 transition-colors text-slate-400"><X size={16} /></button>
        </div>

        <div className="p-6">
          <AnimatePresence mode="wait">

            {/* Step 1 — Pick poster type */}
            {step === 'pick' && (
              <motion.div key="pick" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                  {POSTER_CATALOGUE.map((def) => (
                    <button
                      key={def.type}
                      onClick={() => handlePick(def)}
                      className="text-left p-4 border border-slate-200 rounded-xl hover:border-primary hover:bg-violet-50 transition-all group"
                    >
                      <div className="text-2xl mb-2">{def.icon}</div>
                      <div className="font-bold text-sm text-slate-800 group-hover:text-primary mb-1">{def.label}</div>
                      <div className="text-xs text-slate-400 leading-relaxed">{def.description}</div>
                    </button>
                  ))}
                </div>
              </motion.div>
            )}

            {/* Step 2 — Fill fields */}
            {step === 'fill' && selected && (
              <motion.div key="fill" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
                  {selected.fields.map((f) => (
                    <div key={f.key} className={f.multiline ? 'sm:col-span-2' : ''}>
                      <label className="block text-xs font-semibold text-slate-600 mb-1">
                        {f.label}
                        {f.optional && <span className="text-slate-400 font-normal ml-1">(optional)</span>}
                      </label>
                      {f.multiline ? (
                        <textarea
                          value={formData[f.key] ?? ''}
                          onChange={(e) => setFormData((p) => ({ ...p, [f.key]: e.target.value }))}
                          placeholder={f.placeholder}
                          rows={3}
                          className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 resize-none"
                        />
                      ) : (
                        <input
                          type="text"
                          value={formData[f.key] ?? ''}
                          onChange={(e) => setFormData((p) => ({ ...p, [f.key]: e.target.value }))}
                          placeholder={f.placeholder}
                          className="w-full border border-slate-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30"
                        />
                      )}
                    </div>
                  ))}
                </div>
                <div className="flex justify-end">
                  <button
                    onClick={handlePreview}
                    className="flex items-center gap-2 bg-primary hover:bg-violet-700 text-white font-bold px-6 py-2.5 rounded-xl transition-colors"
                  >
                    Preview Poster →
                  </button>
                </div>
              </motion.div>
            )}

            {/* Step 3 — Preview */}
            {step === 'preview' && selected && (
              <motion.div key="preview" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                {/* Action bar */}
                <div className="flex items-center justify-between mb-4">
                  <p className="text-sm text-slate-500">Review your poster. Save it to your library or print directly.</p>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleDownloadPdf}
                      disabled={downloadingPdf}
                      className="flex items-center gap-2 border border-slate-200 text-slate-600 font-semibold text-sm px-4 py-2 rounded-xl hover:bg-slate-50 transition-colors disabled:opacity-50"
                    >
                      {downloadingPdf ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
                      Download PDF
                    </button>
                    <button
                      onClick={handlePrint}
                      className="flex items-center gap-2 border border-slate-200 text-slate-600 font-semibold text-sm px-4 py-2 rounded-xl hover:bg-slate-50 transition-colors"
                    >
                      <Printer size={14} /> Print / PDF
                    </button>
                    <button
                      onClick={handleSave}
                      disabled={saving}
                      className="flex items-center gap-2 bg-primary hover:bg-violet-700 text-white font-bold text-sm px-5 py-2 rounded-xl transition-colors disabled:opacity-50"
                    >
                      {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
                      Save to Library
                    </button>
                  </div>
                </div>

                {/* Poster preview — scales to fit phone width */}
                <div
                  ref={posterWrapRef}
                  className="border border-slate-200 rounded-xl overflow-hidden bg-white"
                  style={{
                    // Reserve the correct height so the container doesn't collapse
                    // when the inner content is scaled down
                    minHeight: posterScale < 1 ? `calc(${posterScale} * 1122px)` : undefined,
                  }}
                >
                  <div
                    ref={printRef}
                    style={{
                      transformOrigin: 'top left',
                      transform: posterScale < 1 ? `scale(${posterScale})` : undefined,
                      width: posterScale < 1 ? '794px' : undefined,
                    }}
                  >
                    {renderPoster(selected.type, formData)}
                  </div>
                </div>
              </motion.div>
            )}

          </AnimatePresence>
        </div>
      </motion.div>
    </motion.div>
  );
}
