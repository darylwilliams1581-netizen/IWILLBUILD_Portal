/**
 * /external/form/:token — External form completion page
 * ─────────────────────────────────────────────────────────────────────────────
 * No login required. External party fills in and submits a job form.
 * No portal sidebar, no financial data, mobile-friendly.
 */
import { useEffect, useState, useCallback, useRef } from 'react';
import { useParams } from "react-router";
import { Helmet } from '@dr.pogodin/react-helmet';
import { FileText, CheckCircle2, AlertTriangle, Loader2, ChevronRight, ChevronLeft, Send, Navigation, MapPin, ExternalLink, AlertCircle } from 'lucide-react';

// ── GPS structured answer (mirrors FormRunner) ────────────────────────────────
interface GpsAnswer {
  lat: number;
  lng: number;
  accuracy: number;
  timestamp: string;
  address?: string;
}
interface FormField {
  id: number;
  field_type: string;
  label: string;
  required: number;
  options_json: string | null;
  sort_order: number;
  page_number: number | null;
  instruction_text: string | null;
  instruction_image_url: string | null;
}
interface FormData {
  submission: {
    id: number;
    job_name: string;
    job_number: string;
    template_name: string;
    template_description: string | null;
    status: string;
    answers_json: string | null;
    submitted_at: string | null;
    external_submitter_name: string | null;
    external_submitter_email: string | null;
    company_name: string;
  };
  fields: FormField[];
  linkId: number;
}
function FieldInput({
  field,
  value,
  onChange,
  disabled
}: {
  field: FormField;
  value: unknown;
  onChange: (v: unknown) => void;
  disabled: boolean;
}) {
  const options: string[] = (() => {
    if (!field.options_json) return [];
    try {
      return JSON.parse(field.options_json) as string[];
    } catch {
      return [];
    }
  })();
  const base = 'w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm text-slate-800 bg-white focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary disabled:bg-slate-50 disabled:text-slate-400';
  if (field.field_type === 'section_heading') {
    return <div className="pt-4 pb-1 border-b border-slate-200">
        <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wide">{field.label}</h3>
      </div>;
  }
  if (field.field_type === 'instruction' || field.field_type === 'instruction_image') {
    return <div className="bg-blue-50 border border-blue-100 rounded-xl p-3">
        <p className="text-xs text-blue-700">{field.instruction_text ?? field.label}</p>
        {field.instruction_image_url && <img src={field.instruction_image_url} alt="Instruction" className="mt-2 max-h-48 rounded-lg" />}
      </div>;
  }
  if (field.field_type === 'page_break') {
    return <div className="border-t-2 border-dashed border-slate-200 my-2" />;
  }
  if (field.field_type === 'short_text' || field.field_type === 'link_url') {
    return <input type={field.field_type === 'link_url' ? 'url' : 'text'} className={base} value={String(value ?? '')} onChange={e => onChange(e.target.value)} disabled={disabled} placeholder={field.label} />;
  }
  if (field.field_type === 'long_text') {
    return <textarea className={`${base} resize-none`} rows={4} value={String(value ?? '')} onChange={e => onChange(e.target.value)} disabled={disabled} placeholder={field.label} />;
  }
  if (field.field_type === 'number') {
    return <input type="number" className={base} value={String(value ?? '')} onChange={e => onChange(e.target.value)} disabled={disabled} />;
  }
  if (field.field_type === 'date') {
    return <input type="date" className={base} value={String(value ?? '')} onChange={e => onChange(e.target.value)} disabled={disabled} />;
  }
  if (field.field_type === 'yes_no') {
    return <div className="flex gap-3">
        {['Yes', 'No'].map(opt => <button key={opt} type="button" disabled={disabled} onClick={() => onChange(opt === 'Yes')} className={`flex-1 py-2.5 rounded-xl border text-sm font-semibold transition-colors ${value === (opt === 'Yes') ? 'bg-primary text-white border-primary' : 'bg-white text-slate-600 border-slate-200 hover:border-primary/50'} disabled:opacity-50`}>
            {opt}
          </button>)}
      </div>;
  }
  if (field.field_type === 'checkbox') {
    return <label className="flex items-center gap-3 cursor-pointer">
        <input type="checkbox" checked={Boolean(value)} onChange={e => onChange(e.target.checked)} disabled={disabled} className="w-5 h-5 rounded border-slate-300 text-primary focus:ring-primary" />
        <span className="text-sm text-slate-700">{field.label}</span>
      </label>;
  }
  if (field.field_type === 'single_choice') {
    return <div className="flex flex-col gap-2">
        {options.map(opt => <label key={opt} className="flex items-center gap-3 cursor-pointer">
            <input type="radio" name={`field_${field.id}`} value={opt} checked={value === opt} onChange={() => onChange(opt)} disabled={disabled} className="w-4 h-4 text-primary border-slate-300 focus:ring-primary" />
            <span className="text-sm text-slate-700">{opt}</span>
          </label>)}
      </div>;
  }
  if (field.field_type === 'multi_choice') {
    const selected: string[] = Array.isArray(value) ? value as string[] : [];
    return <div className="flex flex-col gap-2">
        {options.map(opt => <label key={opt} className="flex items-center gap-3 cursor-pointer">
            <input type="checkbox" checked={selected.includes(opt)} onChange={e => {
          if (e.target.checked) onChange([...selected, opt]);else onChange(selected.filter(s => s !== opt));
        }} disabled={disabled} className="w-4 h-4 rounded text-primary border-slate-300 focus:ring-primary" />
            <span className="text-sm text-slate-700">{opt}</span>
          </label>)}
      </div>;
  }
  if (field.field_type === 'linear_scale' || field.field_type === 'rating') {
    const max = field.field_type === 'rating' ? 5 : 10;
    return <div className="flex gap-2 flex-wrap">
        {Array.from({
        length: max
      }, (_, i) => i + 1).map(n => <button key={n} type="button" disabled={disabled} onClick={() => onChange(n)} className={`w-10 h-10 rounded-xl border text-sm font-bold transition-colors ${value === n ? 'bg-primary text-white border-primary' : 'bg-white text-slate-600 border-slate-200 hover:border-primary/50'} disabled:opacity-50`}>
            {n}
          </button>)}
      </div>;
  }
  if (field.field_type === 'signature') {
    return <div className="border border-slate-200 rounded-xl p-4 bg-slate-50 text-center">
        <p className="text-xs text-slate-400 mb-2">Signature field — type your full name to sign</p>
        <input type="text" className={base} value={String(value ?? '')} onChange={e => onChange(e.target.value)} disabled={disabled} placeholder="Type your full name as signature" />
      </div>;
  }
  if (field.field_type === 'location_gps' || field.field_type === 'location') {
    const gps = value && typeof value === 'object' && 'lat' in (value as object) ? value as GpsAnswer : null;
    const [capturing, setCapturing] = useState(false);
    const [gpsError, setGpsError] = useState<string | null>(null);
    const captureGps = () => {
      if (!navigator.geolocation) {
        setGpsError('GPS not available on this device.');
        return;
      }
      setCapturing(true);
      setGpsError(null);
      navigator.geolocation.getCurrentPosition(pos => {
        const answer: GpsAnswer = {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          accuracy: Math.round(pos.coords.accuracy),
          timestamp: new Date().toISOString()
        };
        onChange(answer);
        setCapturing(false);
      }, err => {
        setGpsError(err.code === 1 ? 'Location permission denied.' : 'Could not get location. Try again.');
        setCapturing(false);
      }, {
        enableHighAccuracy: true,
        timeout: 15000
      });
    };
    const mapsUrl = gps ? `https://www.google.com/maps?q=${gps.lat},${gps.lng}` : null;
    return <div className="flex flex-col gap-2">
        <button type="button" onClick={captureGps} disabled={capturing || disabled} className="flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-sm font-semibold text-slate-700 w-fit transition-colors disabled:opacity-60">
          {capturing ? <Loader2 size={14} className="animate-spin text-primary" /> : <Navigation size={14} className="text-primary" />}
          {capturing ? 'Getting location…' : gps ? 'Re-capture GPS' : 'Capture GPS location'}
        </button>

        {gps && <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2.5 flex items-start gap-2.5">
            <MapPin size={14} className="text-emerald-600 mt-0.5 shrink-0" />
            <div className="flex flex-col gap-0.5 flex-1 min-w-0">
              <p className="text-xs font-semibold text-emerald-700">
                {gps.lat.toFixed(6)}, {gps.lng.toFixed(6)}
                <span className="font-normal text-emerald-500 ml-1.5">±{gps.accuracy}m</span>
              </p>
              <p className="text-[11px] text-emerald-500">
                Captured {new Date(gps.timestamp).toLocaleString('en-AU', {
              day: 'numeric',
              month: 'short',
              hour: '2-digit',
              minute: '2-digit'
            })}
              </p>
              {mapsUrl && <a href={mapsUrl} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-[11px] text-emerald-600 hover:underline w-fit mt-0.5">
                  <ExternalLink size={10} /> View on map
                </a>}
            </div>
          </div>}

        {gpsError && <p className="text-xs text-red-600 flex items-center gap-1">
            <AlertCircle size={11} /> {gpsError}
          </p>}

        <input type="text" className={base} value={gps?.address ?? (typeof value === 'string' ? value : '')} onChange={e => {
        if (gps) onChange({
          ...gps,
          address: e.target.value
        });else onChange(e.target.value);
      }} disabled={disabled} placeholder="Or enter address manually…" />
      </div>;
  }

  // photo — note only text description for external (no file upload in this version)
  if (field.field_type === 'photo') {
    return <div className="border border-dashed border-slate-300 rounded-xl p-4 text-center bg-slate-50">
        <p className="text-xs text-slate-400">Photo upload not available on external forms.</p>
        <p className="text-xs text-slate-400 mt-1">Please describe the photo or attach separately.</p>
        <textarea className={`${base} mt-2 resize-none`} rows={2} value={String(value ?? '')} onChange={e => onChange(e.target.value)} disabled={disabled} placeholder="Describe what the photo would show…" />
      </div>;
  }

  // Fallback
  return <input type="text" className={base} value={String(value ?? '')} onChange={e => onChange(e.target.value)} disabled={disabled} />;
}
export default function ExternalFormPage() {
  const {
    token
  } = useParams<{
    token: string;
  }>();
  const [data, setData] = useState<FormData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [answers, setAnswers] = useState<Record<string, unknown>>({});
  const [submitterName, setSubmitterName] = useState('');
  const [submitterEmail, setSubmitterEmail] = useState('');
  const [saving, setSaving] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({});
  useEffect(() => {
    if (!token) {
      setError('Invalid link.');
      setLoading(false);
      return;
    }
    fetch(`/api/external/form/${token}`).then(async r => {
      const body = (await r.json()) as {
        error?: string;
      } & FormData;
      if (!r.ok) throw new Error(body.error ?? 'Failed to load');
      setData(body as FormData);
      // Pre-fill existing answers
      if (body.submission?.answers_json) {
        try {
          setAnswers(JSON.parse(body.submission.answers_json) as Record<string, unknown>);
        } catch {/* ignore */}
      }
      if (body.submission?.external_submitter_name) setSubmitterName(body.submission.external_submitter_name);
      if (body.submission?.external_submitter_email) setSubmitterEmail(body.submission.external_submitter_email);
      // Already submitted
      if (body.submission?.status === 'submitted' || body.submission?.status === 'locked') {
        setSubmitted(true);
      }
    }).catch((e: Error) => setError(e.message)).finally(() => setLoading(false));
  }, [token]);
  const setAnswer = useCallback((fieldId: number, value: unknown) => {
    setAnswers(prev => ({
      ...prev,
      [String(fieldId)]: value
    }));
    setValidationErrors(prev => {
      const next = {
        ...prev
      };
      delete next[String(fieldId)];
      return next;
    });
  }, []);

  // Determine pages
  const pages = (() => {
    if (!data) return [[]];
    const pageBreakIndices = data.fields.map((f, i) => ({
      f,
      i
    })).filter(({
      f
    }) => f.field_type === 'page_break').map(({
      i
    }) => i);
    if (pageBreakIndices.length === 0) return [data.fields];
    const result: FormField[][] = [];
    let start = 0;
    for (const idx of pageBreakIndices) {
      result.push(data.fields.slice(start, idx));
      start = idx + 1;
    }
    result.push(data.fields.slice(start));
    return result.filter(p => p.length > 0);
  })();
  const totalPages = pages.length;
  const currentFields = pages[currentPage - 1] ?? [];
  const validatePage = () => {
    const errors: Record<string, string> = {};
    for (const field of currentFields) {
      if (!field.required) continue;
      if (['section_heading', 'instruction', 'instruction_image', 'page_break'].includes(field.field_type)) continue;
      const val = answers[String(field.id)];
      if (val === undefined || val === null || val === '') {
        errors[String(field.id)] = 'This field is required';
      }
    }
    setValidationErrors(errors);
    return Object.keys(errors).length === 0;
  };
  const handleSaveDraft = async () => {
    if (!token) return;
    setSaving(true);
    try {
      await fetch(`/api/external/form/${token}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          action: 'save_draft',
          answers,
          submitterName,
          submitterEmail
        })
      });
    } catch {/* non-fatal */}
    setSaving(false);
  };
  const handleNext = async () => {
    if (!validatePage()) return;
    if (currentPage < totalPages) {
      await handleSaveDraft();
      setCurrentPage(p => p + 1);
      window.scrollTo(0, 0);
    }
  };
  const handleBack = () => {
    setCurrentPage(p => Math.max(1, p - 1));
    window.scrollTo(0, 0);
  };
  const handleSubmit = async () => {
    if (!validatePage()) return;
    if (!token) return;
    setSaving(true);
    try {
      const r = await fetch(`/api/external/form/${token}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          action: 'submit',
          answers,
          submitterName,
          submitterEmail
        })
      });
      const body = (await r.json()) as {
        error?: string;
        ok?: boolean;
      };
      if (!r.ok) throw new Error(body.error ?? 'Failed to submit');
      setSubmitted(true);
    } catch (e: unknown) {
      setError((e as Error).message);
    }
    setSaving(false);
  };
  const isLocked = data?.submission?.status === 'submitted' || data?.submission?.status === 'locked' || submitted;
  return <>
      <Helmet>
        <title>
          {data ? `${data.submission.template_name} — ${data.submission.company_name}` : 'Form — IWILLBUILD'}
        </title>
        <meta name="description" content="Complete and submit a form from IWILLBUILD." />
        <link rel="canonical" href={`${typeof window !== 'undefined' ? window.location.origin : ''}/external/form/${token ?? ''}`} />
        <meta name="robots" content="noindex, nofollow" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
      </Helmet>

      <div className="min-h-screen bg-slate-50">
        {/* Header */}
        <header className="bg-white border-b border-slate-200 px-4 py-3 flex items-center gap-3 sticky top-0 z-10">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-primary rounded-lg flex items-center justify-center">
              <FileText size={14} className="text-white" />
            </div>
            <span className="font-bold text-slate-800 text-sm">IWILLBUILD</span>
          </div>
          {data && <>
              <span className="text-slate-300">|</span>
              <span className="text-xs text-slate-500 truncate">{data.submission.template_name}</span>
            </>}
        </header>

        <main className="max-w-xl mx-auto px-4 py-6">
          {loading && <div className="flex items-center justify-center py-20 gap-3 text-slate-500">
              <Loader2 size={20} className="animate-spin" />
              <span className="text-sm">Loading form…</span>
            </div>}

          {!loading && error && <div className="bg-white border border-red-200 rounded-2xl p-8 text-center">
              <AlertTriangle size={40} className="text-red-400 mx-auto mb-4" />
              <h1 className="text-lg font-bold text-slate-800 mb-2">Form Unavailable</h1>
              <p className="text-sm text-slate-500">{error}</p>
            </div>}

          {!loading && submitted && !error && <div className="bg-white border border-emerald-200 rounded-2xl p-10 text-center">
              <CheckCircle2 size={48} className="text-emerald-500 mx-auto mb-4" />
              <h1 className="text-xl font-bold text-slate-800 mb-2">Form Submitted</h1>
              <p className="text-sm text-slate-500">
                Thank you — this form has been submitted successfully.
              </p>
              {data?.submission?.company_name && <p className="text-xs text-slate-400 mt-2">
                  Submitted to {data.submission.company_name}
                </p>}
            </div>}

          {!loading && data && !submitted && !error && <div className="flex flex-col gap-5">
              {/* Form header */}
              <div className="bg-white border border-slate-200 rounded-2xl p-5">
                <h1 className="text-base font-bold text-slate-800">{data.submission.template_name}</h1>
                {data.submission.template_description && <p className="text-xs text-slate-500 mt-1">{data.submission.template_description}</p>}
                <p className="text-xs text-slate-400 mt-1">
                  {data.submission.job_number} — {data.submission.job_name} · {data.submission.company_name}
                </p>
                {totalPages > 1 && <div className="mt-3 flex items-center gap-3">
                    <div className="flex-1 bg-slate-100 rounded-full h-1.5">
                      <div className="bg-primary h-1.5 rounded-full transition-all" style={{
                  width: `${currentPage / totalPages * 100}%`
                }} />
                    </div>
                    {/* Page dots */}
                    <div className="flex items-center gap-1.5 shrink-0">
                      {Array.from({
                  length: totalPages
                }, (_, i) => <div key={i} className={`rounded-full transition-all ${i + 1 === currentPage ? 'w-5 h-2 bg-primary' : i + 1 < currentPage ? 'w-2 h-2 bg-emerald-400' : 'w-2 h-2 bg-slate-200'}`} />)}
                    </div>
                    <span className="text-xs text-slate-400 shrink-0">
                      {currentPage}/{totalPages}
                    </span>
                  </div>}
              </div>

              {/* Submitter info */}
              <div className="bg-white border border-slate-200 rounded-2xl p-5 flex flex-col gap-3">
                <p className="text-xs font-semibold text-slate-600">Your Details (optional)</p>
                <input type="text" className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary" placeholder="Your name" value={submitterName} onChange={e => setSubmitterName(e.target.value)} disabled={isLocked} />
                <input type="email" className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary" placeholder="Your email (optional)" value={submitterEmail} onChange={e => setSubmitterEmail(e.target.value)} disabled={isLocked} />
              </div>

              {/* Fields */}
              <div className="bg-white border border-slate-200 rounded-2xl p-5 flex flex-col gap-5">
                {currentFields.map(field => <div key={field.id} className="flex flex-col gap-1.5">
                    {!['section_heading', 'instruction', 'instruction_image', 'page_break', 'checkbox'].includes(field.field_type) && <label className="text-sm font-medium text-slate-700">
                        {field.label}
                        {field.required ? <span className="text-red-400 ml-0.5">*</span> : null}
                      </label>}
                    <FieldInput field={field} value={answers[String(field.id)]} onChange={v => setAnswer(field.id, v)} disabled={isLocked} />
                    {validationErrors[String(field.id)] && <p className="text-xs text-red-500">{validationErrors[String(field.id)]}</p>}
                  </div>)}
              </div>

              {/* Navigation */}
              <div className="flex items-center gap-3">
                {currentPage > 1 && <button type="button" onClick={handleBack} disabled={saving} className="flex items-center gap-1.5 text-sm text-slate-600 border border-slate-200 bg-white hover:bg-slate-50 px-4 py-2.5 rounded-xl font-medium transition-colors disabled:opacity-50">
                    <ChevronLeft size={15} />
                    Back
                  </button>}

                <div className="flex-1" />

                {currentPage < totalPages ? <button type="button" onClick={() => void handleNext()} disabled={saving} className="flex items-center gap-1.5 text-sm bg-primary hover:bg-violet-700 text-white px-5 py-2.5 rounded-xl font-bold transition-colors disabled:opacity-50">
                    {saving ? <Loader2 size={14} className="animate-spin" /> : null}
                    Next
                    <ChevronRight size={15} />
                  </button> : <button type="button" onClick={() => void handleSubmit()} disabled={saving || isLocked} className="flex items-center gap-1.5 text-sm bg-emerald-600 hover:bg-emerald-700 text-white px-6 py-2.5 rounded-xl font-bold transition-colors disabled:opacity-50">
                    {saving ? <Loader2 size={14} className="animate-spin" /> : <Send size={14} />}
                    Submit Form
                  </button>}
              </div>

              {/* Save draft hint */}
              {!isLocked && <p className="text-xs text-slate-400 text-center">
                  Your progress is saved automatically as you navigate between pages.
                </p>}
            </div>}
        </main>
      </div>
    </>;
}
