/**
 * /forms/fill/:token — Public form fill page
 * No login required. Anyone with the link can fill out the form.
 */
import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { Helmet } from '@dr.pogodin/react-helmet';
import { motion } from 'motion/react';
import {
  FileText, Loader2, AlertTriangle, CheckCircle2,
  User, Mail, ChevronRight, AlertCircle,
} from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────

interface FormField {
  id: number;
  field_type: string;
  label: string;
  required: boolean;
  options_json: string | null;
  sort_order: number;
  instruction_text: string | null;
}

interface FormTemplate {
  id: number;
  name: string;
  description: string | null;
  form_type: string;
  company_name: string;
  company_logo: string | null;
}

// ── Field renderer ────────────────────────────────────────────────────────────

function FieldInput({
  field,
  value,
  onChange,
}: {
  field: FormField;
  value: unknown;
  onChange: (v: unknown) => void;
}) {
  const inp = 'w-full px-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-400 bg-white';
  const options: string[] = field.options_json ? (JSON.parse(field.options_json) as string[]) : [];

  switch (field.field_type) {
    case 'text':
    case 'email':
    case 'phone':
    case 'number':
      return (
        <input
          type={field.field_type === 'number' ? 'number' : field.field_type === 'email' ? 'email' : field.field_type === 'phone' ? 'tel' : 'text'}
          value={String(value ?? '')}
          onChange={e => onChange(e.target.value)}
          required={field.required}
          className={inp}
        />
      );
    case 'textarea':
      return (
        <textarea
          value={String(value ?? '')}
          onChange={e => onChange(e.target.value)}
          required={field.required}
          rows={3}
          className={inp}
        />
      );
    case 'date':
      return (
        <input
          type="date"
          value={String(value ?? '')}
          onChange={e => onChange(e.target.value)}
          required={field.required}
          className={inp}
        />
      );
    case 'select':
    case 'dropdown':
      return (
        <select
          value={String(value ?? '')}
          onChange={e => onChange(e.target.value)}
          required={field.required}
          className={inp}
        >
          <option value="">Select…</option>
          {options.map(o => <option key={o} value={o}>{o}</option>)}
        </select>
      );
    case 'radio':
      return (
        <div className="space-y-2">
          {options.map(o => (
            <label key={o} className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name={`field-${field.id}`}
                value={o}
                checked={value === o}
                onChange={() => onChange(o)}
                required={field.required}
                className="accent-violet-600"
              />
              <span className="text-sm text-slate-700">{o}</span>
            </label>
          ))}
        </div>
      );
    case 'checkbox':
      return (
        <div className="space-y-2">
          {options.map(o => {
            const checked = Array.isArray(value) ? (value as string[]).includes(o) : false;
            return (
              <label key={o} className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={() => {
                    const arr = Array.isArray(value) ? [...(value as string[])] : [];
                    onChange(checked ? arr.filter(v => v !== o) : [...arr, o]);
                  }}
                  className="accent-violet-600"
                />
                <span className="text-sm text-slate-700">{o}</span>
              </label>
            );
          })}
        </div>
      );
    case 'boolean':
    case 'yes_no':
      return (
        <div className="flex gap-3">
          {['Yes', 'No'].map(opt => (
            <label key={opt} className="flex items-center gap-2 cursor-pointer">
              <input
                type="radio"
                name={`field-${field.id}`}
                value={opt}
                checked={value === opt}
                onChange={() => onChange(opt)}
                className="accent-violet-600"
              />
              <span className="text-sm text-slate-700">{opt}</span>
            </label>
          ))}
        </div>
      );
    default:
      return (
        <input
          type="text"
          value={String(value ?? '')}
          onChange={e => onChange(e.target.value)}
          required={field.required}
          className={inp}
        />
      );
  }
}

// ── Main Page ─────────────────────────────────────────────────────────────────

export default function FormFillPage() {
  const { token } = useParams<{ token: string }>();

  const [template, setTemplate] = useState<FormTemplate | null>(null);
  const [fields,   setFields]   = useState<FormField[]>([]);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState('');

  const [submitterName,  setSubmitterName]  = useState('');
  const [submitterEmail, setSubmitterEmail] = useState('');
  const [answers,        setAnswers]        = useState<Record<string, unknown>>({});
  const [submitting,     setSubmitting]     = useState(false);
  const [submitError,    setSubmitError]    = useState('');
  const [submitted,      setSubmitted]      = useState(false);

  useEffect(() => {
    if (!token) return;
    fetch(`/api/public/form/${token}`)
      .then(r => r.json())
      .then((data: { template?: FormTemplate; fields?: FormField[]; error?: string }) => {
        if (data.error) { setError(data.error); return; }
        setTemplate(data.template ?? null);
        setFields(data.fields ?? []);
      })
      .catch(() => setError('Failed to load form'))
      .finally(() => setLoading(false));
  }, [token]);

  function setAnswer(fieldId: number, value: unknown) {
    setAnswers(prev => ({ ...prev, [fieldId]: value }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setSubmitError('');
    try {
      const res = await fetch(`/api/public/form/${token}/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          submitterName:  submitterName.trim() || undefined,
          submitterEmail: submitterEmail.trim() || undefined,
          answers,
        }),
      });
      const data = await res.json() as { ok?: boolean; error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Failed to submit');
      setSubmitted(true);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Failed to submit');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Loader2 size={28} className="animate-spin text-violet-600" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="max-w-sm w-full text-center space-y-4">
          <div className="w-16 h-16 rounded-2xl bg-red-100 flex items-center justify-center mx-auto">
            <AlertTriangle size={28} className="text-red-500" />
          </div>
          <h1 className="text-lg font-bold text-slate-800">Form Unavailable</h1>
          <p className="text-sm text-slate-500">{error}</p>
        </div>
      </div>
    );
  }

  if (!template) return null;

  return (
    <div className="min-h-screen bg-slate-50">
      <Helmet>
        <title>{template.name} — {template.company_name}</title>
        <meta name="description" content={template.description ?? `Fill out the ${template.name} form`} />
        <meta name="robots" content="noindex" />
        <link rel="canonical" href={`https://iwillbuild.com/forms/fill/${token ?? ''}`} />
      </Helmet>

      {/* Header */}
      <div className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-violet-500 flex items-center justify-center shrink-0">
            <FileText size={16} className="text-white" />
          </div>
          <div className="min-w-0">
            <p className="text-xs font-bold text-violet-800 uppercase tracking-wide">{template.company_name}</p>
            <p className="text-sm font-bold text-slate-800 truncate">{template.name}</p>
          </div>
        </div>
      </div>

      <div className="max-w-2xl mx-auto px-4 py-6">
        {submitted ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-white border border-emerald-200 rounded-2xl p-10 text-center space-y-4"
          >
            <div className="w-16 h-16 rounded-2xl bg-emerald-100 flex items-center justify-center mx-auto">
              <CheckCircle2 size={32} className="text-emerald-500" />
            </div>
            <h2 className="text-lg font-bold text-slate-800">Form Submitted</h2>
            <p className="text-sm text-slate-500">
              Thank you! Your response has been recorded.
            </p>
            <p className="text-xs text-slate-400">You can now close this page.</p>
          </motion.div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-5">
            {template.description && (
              <div className="bg-white border border-slate-200 rounded-xl px-4 py-3">
                <p className="text-sm text-slate-600">{template.description}</p>
              </div>
            )}

            {/* Submitter info */}
            <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-4">
              <p className="text-xs font-bold text-slate-500 uppercase tracking-wide">Your Details</p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase tracking-wide mb-1">Name</label>
                  <div className="relative">
                    <User size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      value={submitterName}
                      onChange={e => setSubmitterName(e.target.value)}
                      placeholder="Your name"
                      className="w-full pl-8 pr-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-400"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-600 uppercase tracking-wide mb-1">Email</label>
                  <div className="relative">
                    <Mail size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="email"
                      value={submitterEmail}
                      onChange={e => setSubmitterEmail(e.target.value)}
                      placeholder="your@email.com"
                      className="w-full pl-8 pr-3 py-2.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-violet-400"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* Form fields */}
            {fields.length > 0 && (
              <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-5">
                {fields.map((field, idx) => (
                  <div key={field.id}>
                    <label className="block text-sm font-semibold text-slate-700 mb-1.5">
                      {idx + 1}. {field.label}
                      {field.required && <span className="text-red-500 ml-1">*</span>}
                    </label>
                    {field.instruction_text && (
                      <p className="text-xs text-slate-500 mb-2">{field.instruction_text}</p>
                    )}
                    <FieldInput
                      field={field}
                      value={answers[field.id]}
                      onChange={v => setAnswer(field.id, v)}
                    />
                  </div>
                ))}
              </div>
            )}

            {submitError && (
              <div className="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">
                <AlertCircle size={14} />{submitError}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting}
              className="w-full py-3 text-sm font-bold text-white bg-violet-500 hover:bg-violet-700 rounded-xl transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {submitting ? <Loader2 size={16} className="animate-spin" /> : <ChevronRight size={16} />}
              {submitting ? 'Submitting…' : 'Submit Form'}
            </button>

            <p className="text-center text-xs text-slate-400 pb-4">
              Powered by IWILLBUILD
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
