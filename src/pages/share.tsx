/**
 * /share/:token — Public shared document viewer
 * ─────────────────────────────────────────────────────────────────────────────
 * No login required. Shows a shared form submission (read-only).
 * No portal sidebar, no financial data.
 */
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Helmet } from '@dr.pogodin/react-helmet';
import { FileText, Download, AlertTriangle, Clock, CheckCircle2, Loader2 } from 'lucide-react';

interface ShareData {
  type: 'form_submission';
  link: { id: number; expiresAt: string; createdAt: string };
  submission: {
    id: number;
    job_name: string;
    job_number: string;
    template_name: string;
    status: string;
    answers_json: string | null;
    submitted_at: string | null;
    external_submitter_name: string | null;
    external_submitter_email: string | null;
    company_name: string;
  };
  fields: Array<{
    id: number;
    field_type: string;
    label: string;
    required: number;
    options_json: string | null;
    sort_order: number;
    page_number: number | null;
    instruction_text: string | null;
    instruction_image_url: string | null;
  }>;
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    draft:       { label: 'Draft',       cls: 'bg-slate-100 text-slate-600' },
    sent:        { label: 'Sent',        cls: 'bg-blue-100 text-blue-700' },
    in_progress: { label: 'In Progress', cls: 'bg-amber-100 text-amber-700' },
    submitted:   { label: 'Submitted',   cls: 'bg-emerald-100 text-emerald-700' },
    locked:      { label: 'Locked',      cls: 'bg-slate-200 text-slate-700' },
  };
  const s = map[status] ?? { label: status, cls: 'bg-slate-100 text-slate-600' };
  return (
    <span className={`text-xs font-semibold px-2.5 py-1 rounded-full ${s.cls}`}>
      {s.label}
    </span>
  );
}

function FieldAnswer({ field, answers }: {
  field: ShareData['fields'][number];
  answers: Record<string, unknown>;
}) {
  const value = answers[String(field.id)];

  if (field.field_type === 'section_heading') {
    return (
      <div className="col-span-2 pt-4 pb-1 border-b border-slate-200">
        <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wide">{field.label}</h3>
      </div>
    );
  }

  if (field.field_type === 'instruction' || field.field_type === 'instruction_image') {
    return (
      <div className="col-span-2 bg-blue-50 border border-blue-100 rounded-lg p-3">
        <p className="text-xs text-blue-700">{field.instruction_text ?? field.label}</p>
        {field.instruction_image_url && (
          <img src={field.instruction_image_url} alt="Instruction" className="mt-2 max-h-40 rounded" />
        )}
      </div>
    );
  }

  if (field.field_type === 'page_break') {
    return <div className="col-span-2 border-t-2 border-dashed border-slate-200 my-2" />;
  }

  const displayValue = (() => {
    if (value === undefined || value === null || value === '') return '—';
    if (field.field_type === 'yes_no') return value ? 'Yes' : 'No';
    if (field.field_type === 'checkbox') return value ? '✓ Checked' : '✗ Unchecked';
    if (field.field_type === 'signature') return value ? '✓ Signed' : '—';
    if (field.field_type === 'photo') return value ? '📷 Photo attached' : '—';
    if (Array.isArray(value)) return value.join(', ');
    return String(value);
  })();

  return (
    <div className="flex flex-col gap-1">
      <span className="text-xs font-medium text-slate-500">
        {field.label}
        {field.required ? <span className="text-red-400 ml-0.5">*</span> : null}
      </span>
      <span className="text-sm text-slate-800 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 min-h-[36px]">
        {displayValue}
      </span>
    </div>
  );
}

export default function SharePage() {
  const { token } = useParams<{ token: string }>();
  const [data, setData] = useState<ShareData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) { setError('Invalid link.'); setLoading(false); return; }
    fetch(`/api/share/${token}`)
      .then(async (r) => {
        const body = await r.json() as { error?: string } & ShareData;
        if (!r.ok) throw new Error(body.error ?? 'Failed to load');
        setData(body as ShareData);
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [token]);

  const answers: Record<string, unknown> = (() => {
    if (!data?.submission?.answers_json) return {};
    try { return JSON.parse(data.submission.answers_json) as Record<string, unknown>; }
    catch { return {}; }
  })();

  return (
    <>
      <Helmet>
        <title>Shared Document — IWILLBUILD</title>
        <meta name="description" content="View a shared document from IWILLBUILD." />
        <link rel="canonical" href={`${typeof window !== 'undefined' ? window.location.origin : ''}/share/${token ?? ''}`} />
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>

      <div className="min-h-screen bg-slate-50">
        {/* Header */}
        <header className="bg-white border-b border-slate-200 px-4 py-3 flex items-center gap-3">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 bg-primary rounded-lg flex items-center justify-center">
              <FileText size={14} className="text-white" />
            </div>
            <span className="font-bold text-slate-800 text-sm">IWILLBUILD</span>
          </div>
          <span className="text-slate-300">|</span>
          <span className="text-xs text-slate-500">Shared Document</span>
        </header>

        <main className="max-w-2xl mx-auto px-4 py-8">
          {loading && (
            <div className="flex items-center justify-center py-20 gap-3 text-slate-500">
              <Loader2 size={20} className="animate-spin" />
              <span className="text-sm">Loading document…</span>
            </div>
          )}

          {!loading && error && (
            <div className="bg-white border border-red-200 rounded-2xl p-8 text-center">
              <AlertTriangle size={40} className="text-red-400 mx-auto mb-4" />
              <h1 className="text-lg font-bold text-slate-800 mb-2">Document Unavailable</h1>
              <p className="text-sm text-slate-500">{error}</p>
            </div>
          )}

          {!loading && data && (
            <div className="flex flex-col gap-5">
              {/* Document header */}
              <div className="bg-white border border-slate-200 rounded-2xl p-6">
                <div className="flex items-start justify-between gap-4 mb-4">
                  <div>
                    <h1 className="text-lg font-bold text-slate-800">
                      {data.submission.template_name}
                    </h1>
                    <p className="text-sm text-slate-500 mt-0.5">
                      {data.submission.job_number} — {data.submission.job_name}
                    </p>
                    <p className="text-xs text-slate-400 mt-0.5">{data.submission.company_name}</p>
                  </div>
                  <StatusBadge status={data.submission.status} />
                </div>

                {data.submission.submitted_at && (
                  <div className="flex items-center gap-2 text-xs text-emerald-600 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
                    <CheckCircle2 size={13} />
                    Submitted {new Date(data.submission.submitted_at).toLocaleDateString('en-AU', {
                      day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit',
                    })}
                    {data.submission.external_submitter_name && ` by ${data.submission.external_submitter_name}`}
                  </div>
                )}

                <div className="flex items-center gap-2 text-xs text-slate-400 mt-3">
                  <Clock size={11} />
                  Link expires {new Date(data.link.expiresAt).toLocaleDateString('en-AU')}
                </div>
              </div>

              {/* Form answers */}
              <div className="bg-white border border-slate-200 rounded-2xl p-6">
                <h2 className="text-sm font-bold text-slate-700 mb-4">Form Answers</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {data.fields.map((field) => (
                    <FieldAnswer key={field.id} field={field} answers={answers} />
                  ))}
                </div>
                {data.fields.length === 0 && (
                  <p className="text-sm text-slate-400 text-center py-4">No fields in this form.</p>
                )}
              </div>

              {/* Download hint */}
              <div className="flex items-center gap-2 text-xs text-slate-400 justify-center">
                <Download size={12} />
                Use your browser's print function to save as PDF
              </div>
            </div>
          )}
        </main>
      </div>
    </>
  );
}
