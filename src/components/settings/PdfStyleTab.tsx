import { useState, useEffect } from 'react';
import {
  Save, Loader2, CheckCircle2, AlertCircle, FileText,
  ToggleLeft, ToggleRight, Lock,
} from 'lucide-react';

export interface PdfStyle {
  headerText: string;
  footerText: string;
  estimateDisclaimer: string;
  formDisclaimer: string;
  paymentTerms: string;
  acceptanceNote: string;
  showLogoOnEstimates: boolean;
  showLogoOnForms: boolean;
  showFooterOnEstimates: boolean;
  showFooterOnForms: boolean;
}

const DEFAULTS: PdfStyle = {
  headerText: '',
  footerText: '',
  estimateDisclaimer: '',
  formDisclaimer: '',
  paymentTerms: '',
  acceptanceNote: '',
  showLogoOnEstimates: true,
  showLogoOnForms: true,
  showFooterOnEstimates: true,
  showFooterOnForms: true,
};

const labelClass = 'block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1.5';
const inputClass = 'w-full border border-slate-200 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors bg-white';
const textareaClass = `${inputClass} resize-y min-h-[72px]`;

interface ToggleRowProps {
  label: string;
  description: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}
function ToggleRow({ label, description, checked, onChange, disabled }: ToggleRowProps) {
  return (
    <div className="flex items-center justify-between gap-4 py-3 border-b border-slate-100 last:border-0">
      <div>
        <p className="text-sm font-semibold text-slate-700">{label}</p>
        <p className="text-xs text-slate-400 mt-0.5">{description}</p>
      </div>
      <button
        type="button"
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`flex-shrink-0 transition-colors ${disabled ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}
        aria-pressed={checked}
      >
        {checked
          ? <ToggleRight size={28} className="text-primary" />
          : <ToggleLeft size={28} className="text-slate-300" />
        }
      </button>
    </div>
  );
}

interface Props {
  isAdmin: boolean;
}

export default function PdfStyleTab({ isAdmin }: Props) {
  const [style, setStyle] = useState<PdfStyle>(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saveState, setSaveState] = useState<'idle' | 'saved' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  // Run migration on mount (admin only)
  useEffect(() => {
    if (!isAdmin) return;
    fetch('/api/migrate-pdf-settings', { method: 'POST', credentials: 'include' })
      .catch(() => { /* silent */ });
  }, [isAdmin]);

  // Load saved settings
  useEffect(() => {
    setLoading(true);
    fetch('/api/company-settings', { credentials: 'include' })
      .then((r) => r.json())
      .then((d: { pdf?: Partial<PdfStyle> }) => {
        if (d.pdf && typeof d.pdf === 'object') {
          setStyle({ ...DEFAULTS, ...d.pdf });
        }
      })
      .catch(() => { /* use defaults */ })
      .finally(() => setLoading(false));
  }, []);

  function set<K extends keyof PdfStyle>(key: K, value: PdfStyle[K]) {
    setStyle((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!isAdmin) return;
    setSaving(true);
    setErrorMsg('');
    try {
      const res = await fetch('/api/company-settings', {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ section: 'pdf', data: style }),
      });
      const data = await res.json() as { ok?: boolean; error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Failed to save');
      setSaveState('saved');
      setTimeout(() => setSaveState('idle'), 3000);
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : 'Failed to save');
      setSaveState('error');
    } finally {
      setSaving(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-slate-400 text-sm py-8">
        <Loader2 size={16} className="animate-spin" /> Loading PDF style settings…
      </div>
    );
  }

  return (
    <form onSubmit={(e) => void handleSave(e)} className="flex flex-col gap-6">

      {/* Read-only notice for non-admins */}
      {!isAdmin && (
        <div className="flex items-center gap-2 text-sm text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-4 py-3">
          <Lock size={14} className="flex-shrink-0" />
          Only Owners and Admins can edit PDF style settings. Your current settings are shown below.
        </div>
      )}

      {/* ── Header & Footer text ─────────────────────────────────────────── */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 flex flex-col gap-4">
        <h2 className="font-bold text-base text-slate-800 flex items-center gap-2">
          <FileText size={16} className="text-primary" /> Header &amp; Footer
        </h2>

        <div>
          <label className={labelClass}>Header Text</label>
          <input
            type="text"
            value={style.headerText}
            onChange={(e) => set('headerText', e.target.value)}
            disabled={!isAdmin}
            className={inputClass}
            placeholder="e.g. IWILLBUILD Pty Ltd — Licensed Builder QLD"
          />
          <p className="text-xs text-slate-400 mt-1">Appears below the company name in the PDF header. Leave blank to use company name only.</p>
        </div>

        <div>
          <label className={labelClass}>Footer Text</label>
          <textarea
            value={style.footerText}
            onChange={(e) => set('footerText', e.target.value)}
            disabled={!isAdmin}
            className={textareaClass}
            placeholder="e.g. Thank you for your business. All prices are in AUD and include GST where applicable."
          />
          <p className="text-xs text-slate-400 mt-1">Shown at the bottom of every PDF when footer is enabled.</p>
        </div>
      </div>

      {/* ── Disclaimers & Terms ──────────────────────────────────────────── */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 flex flex-col gap-4">
        <h2 className="font-bold text-base text-slate-800">Disclaimers &amp; Terms</h2>

        <div>
          <label className={labelClass}>Estimate / Quote Disclaimer</label>
          <textarea
            value={style.estimateDisclaimer}
            onChange={(e) => set('estimateDisclaimer', e.target.value)}
            disabled={!isAdmin}
            className={textareaClass}
            placeholder="e.g. This quote is valid for 30 days from the date of issue. Prices are subject to change after this period."
          />
        </div>

        <div>
          <label className={labelClass}>Form / Report Disclaimer</label>
          <textarea
            value={style.formDisclaimer}
            onChange={(e) => set('formDisclaimer', e.target.value)}
            disabled={!isAdmin}
            className={textareaClass}
            placeholder="e.g. This document is a record of work completed on site. Accuracy is the responsibility of the signing party."
          />
        </div>

        <div>
          <label className={labelClass}>Payment Terms</label>
          <textarea
            value={style.paymentTerms}
            onChange={(e) => set('paymentTerms', e.target.value)}
            disabled={!isAdmin}
            className={textareaClass}
            placeholder="e.g. Payment is due within 14 days of invoice. Late payments may incur a 2% monthly fee."
          />
          <p className="text-xs text-slate-400 mt-1">Shown on estimate/quote PDFs below the totals.</p>
        </div>

        <div>
          <label className={labelClass}>Acceptance Note</label>
          <textarea
            value={style.acceptanceNote}
            onChange={(e) => set('acceptanceNote', e.target.value)}
            disabled={!isAdmin}
            className={textareaClass}
            placeholder="e.g. By signing below, the client accepts the scope and pricing outlined in this quote."
          />
          <p className="text-xs text-slate-400 mt-1">Shown at the bottom of estimate PDFs as a signature/acceptance prompt.</p>
        </div>
      </div>

      {/* ── Display Toggles ──────────────────────────────────────────────── */}
      <div className="bg-white border border-slate-200 rounded-xl p-6 flex flex-col gap-0">
        <h2 className="font-bold text-base text-slate-800 mb-3">Display Options</h2>
        <p className="text-xs text-slate-400 mb-4">Logo upload is coming in a future release. Toggles are saved and will apply automatically once logo upload is available.</p>

        <ToggleRow
          label="Show logo on estimates / quotes"
          description="Display company logo in the PDF header of estimate printouts"
          checked={style.showLogoOnEstimates}
          onChange={(v) => set('showLogoOnEstimates', v)}
          disabled={!isAdmin}
        />
        <ToggleRow
          label="Show logo on forms / reports"
          description="Display company logo in the PDF header of completed form printouts"
          checked={style.showLogoOnForms}
          onChange={(v) => set('showLogoOnForms', v)}
          disabled={!isAdmin}
        />
        <ToggleRow
          label="Show footer on estimates / quotes"
          description="Include footer text and disclaimer at the bottom of estimate PDFs"
          checked={style.showFooterOnEstimates}
          onChange={(v) => set('showFooterOnEstimates', v)}
          disabled={!isAdmin}
        />
        <ToggleRow
          label="Show footer on forms / reports"
          description="Include footer text and disclaimer at the bottom of form PDFs"
          checked={style.showFooterOnForms}
          onChange={(v) => set('showFooterOnForms', v)}
          disabled={!isAdmin}
        />
      </div>

      {/* ── Save ─────────────────────────────────────────────────────────── */}
      {isAdmin && (
        <div>
          {errorMsg && (
            <div className="flex items-center gap-2 text-red-600 text-xs bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-3">
              <AlertCircle size={13} /> {errorMsg}
            </div>
          )}
          <div className="flex items-center justify-between">
            <span className={`flex items-center gap-1.5 text-xs font-semibold transition-all duration-300 ${saveState === 'saved' ? 'text-emerald-600' : 'text-transparent'}`}>
              <CheckCircle2 size={13} /> Saved
            </span>
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-2 bg-primary hover:bg-orange-600 text-white text-sm font-bold px-4 py-2 rounded-lg transition-colors disabled:opacity-60"
            >
              {saving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
              Save PDF Style
            </button>
          </div>
        </div>
      )}
    </form>
  );
}
