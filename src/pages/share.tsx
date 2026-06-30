/**
 * /share/:token — Unified public document viewer
 * ─────────────────────────────────────────────────────────────────────────────
 * No login required. Renders any shared document type:
 * - Job Form / Completed Form (read-only or completable)
 * - Estimate / Quote
 * - Purchase Order / Work Order
 * - SWMS
 * - Invoice
 *
 * Uses the Document Engine share token system.
 * Falls back to legacy form-only viewer for old shared_links tokens.
 */
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Helmet } from '@dr.pogodin/react-helmet';
import {
  FileText, AlertTriangle, Loader2, CheckCircle2, Clock, Lock,
  Download, ExternalLink, MapPin,
} from 'lucide-react';
import ExternalFormPage from './external-form';

// ── GPS type (mirrors FormRunner) ─────────────────────────────────────────────
interface GpsAnswer {
  lat: number;
  lng: number;
  accuracy: number;
  timestamp: string;
  address?: string;
}
function isGpsAnswer(v: unknown): v is GpsAnswer {
  return typeof v === 'object' && v !== null && 'lat' in v && 'lng' in v;
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface SharedDocument {
  document: {
    id: number;
    documentType: string;
    title: string;
    status: string;
    version: number;
    isLocked: boolean;
    completedAt: string | null;
    createdAt: string;
    updatedAt: string;
  };
  share: {
    id: number;
    shareMode: string;
    expiresAt: string | null;
    submittedAt: string | null;
  };
  content: Record<string, unknown>;
}

// ── Document type renderers ───────────────────────────────────────────────────

function FormViewer({ content }: { content: Record<string, unknown> }) {
  const submission = content.submission as Record<string, unknown> | undefined;
  const fields = (content.fields as Array<Record<string, unknown>>) ?? [];

  const answers: Record<string, unknown> = (() => {
    if (!submission?.answers_json) return {};
    try { return JSON.parse(submission.answers_json as string) as Record<string, unknown>; }
    catch { return {}; }
  })();

  if (!submission) return <p className="text-sm text-slate-400">No form data available.</p>;

  return (
    <div className="flex flex-col gap-4">
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
        <p className="text-sm font-bold text-slate-800">{submission.template_name as string}</p>
        <p className="text-xs text-slate-500 mt-0.5">
          {submission.job_number as string} — {submission.job_name as string}
        </p>
        <p className="text-xs text-slate-400">{submission.company_name as string}</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {fields.map((field) => {
          const fid = String(field.id);
          const value = answers[fid];
          const ft = field.field_type as string;

          if (ft === 'section_heading') {
            return (
              <div key={fid} className="col-span-2 pt-3 pb-1 border-b border-slate-200">
                <h3 className="text-xs font-bold text-slate-600 uppercase tracking-wide">{field.label as string}</h3>
              </div>
            );
          }
          if (ft === 'instruction' || ft === 'instruction_image') {
            return (
              <div key={fid} className="col-span-2 bg-blue-50 border border-blue-100 rounded-lg p-3">
                <p className="text-xs text-blue-700">{(field.instruction_text ?? field.label) as string}</p>
              </div>
            );
          }
          if (ft === 'page_break') {
            return <div key={fid} className="col-span-2 border-t-2 border-dashed border-slate-200" />;
          }

          const display = (() => {
            if (value === undefined || value === null || value === '') return '—';
            if (ft === 'yes_no') return value ? 'Yes' : 'No';
            if (ft === 'checkbox') return value ? '✓ Checked' : '✗ Unchecked';
            if (ft === 'signature') {
              // Signature may be a JSON object with signatureDataUrl
              if (typeof value === 'object' && value !== null && 'signatureDataUrl' in value) {
                const sig = value as { signatureDataUrl?: string; name?: string; signedAt?: string };
                return (
                  <div className="flex flex-col gap-1">
                    {sig.name && <span className="text-xs font-semibold text-slate-600">{sig.name}</span>}
                    {sig.signatureDataUrl && (
                      <img src={sig.signatureDataUrl} alt="Signature" className="max-h-16 border border-slate-200 rounded-lg bg-white" />
                    )}
                    {sig.signedAt && <span className="text-[11px] text-slate-400">Signed {new Date(sig.signedAt).toLocaleString('en-AU', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>}
                  </div>
                );
              }
              return `✓ Signed: ${String(value)}`;
            }
            if (ft === 'photo') {
              // Photo may be a data URL or a storage URL
              if (typeof value === 'string' && (value.startsWith('data:image') || value.startsWith('http') || value.startsWith('/'))) {
                return <img src={value} alt="Photo" className="max-h-48 rounded-xl border border-slate-200 object-contain bg-slate-50" />;
              }
              return value ? '📷 Photo attached' : '—';
            }
            if (ft === 'location' || ft === 'location_gps') {
              if (isGpsAnswer(value)) {
                const mapsUrl = `https://www.google.com/maps?q=${value.lat},${value.lng}`;
                return (
                  <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2.5 flex items-start gap-2.5">
                    <MapPin size={13} className="text-emerald-600 mt-0.5 shrink-0" />
                    <div className="flex flex-col gap-0.5">
                      {value.address && <p className="text-sm font-medium text-emerald-800">{value.address}</p>}
                      <p className="text-xs font-mono text-emerald-700">
                        {value.lat.toFixed(6)}, {value.lng.toFixed(6)}
                        <span className="text-emerald-500 ml-1.5">±{value.accuracy}m</span>
                      </p>
                      <p className="text-[11px] text-emerald-500">
                        {new Date(value.timestamp).toLocaleString('en-AU', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </p>
                      <a href={mapsUrl} target="_blank" rel="noopener noreferrer"
                        className="flex items-center gap-1 text-[11px] text-emerald-600 hover:underline w-fit mt-0.5">
                        <ExternalLink size={10} /> View on map
                      </a>
                    </div>
                  </div>
                );
              }
              return <span className="text-sm text-slate-700 font-mono">{String(value)}</span>;
            }
            if (Array.isArray(value)) return value.join(', ');
            return String(value);
          })();

          return (
            <div key={fid} className="flex flex-col gap-1">
              <span className="text-xs font-medium text-slate-500">{field.label as string}</span>
              {typeof display === 'string' ? (
                <span className="text-sm text-slate-800 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2 min-h-[36px]">
                  {display}
                </span>
              ) : (
                <div className="text-sm text-slate-800">
                  {display}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function EstimateViewer({ content }: { content: Record<string, unknown> }) {
  const estimate = content.estimate as Record<string, unknown> | undefined;
  const lines = (content.lines as Array<Record<string, unknown>>) ?? [];
  if (!estimate) return <p className="text-sm text-slate-400">No estimate data.</p>;

  return (
    <div className="flex flex-col gap-4">
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
        <p className="text-sm font-bold text-slate-800">{estimate.title as string}</p>
        <p className="text-xs text-slate-500 mt-0.5">
          {estimate.job_number as string} — {estimate.job_name as string}
        </p>
        <p className="text-xs text-slate-400">{estimate.company_name as string}</p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-slate-200">
              <th className="text-left py-2 px-3 text-slate-500 font-semibold">Description</th>
              <th className="text-right py-2 px-3 text-slate-500 font-semibold">Qty</th>
              <th className="text-right py-2 px-3 text-slate-500 font-semibold">Unit</th>
              {estimate.rate !== undefined && <th className="text-right py-2 px-3 text-slate-500 font-semibold">Rate</th>}
              {estimate.amount !== undefined && <th className="text-right py-2 px-3 text-slate-500 font-semibold">Amount</th>}
            </tr>
          </thead>
          <tbody>
            {lines.map((l, i) => (
              <tr key={i} className="border-b border-slate-100">
                <td className="py-2 px-3 text-slate-700">{l.description as string}</td>
                <td className="py-2 px-3 text-right text-slate-600">{l.quantity as string}</td>
                <td className="py-2 px-3 text-right text-slate-500">{(l.unit as string) ?? '—'}</td>
                {l.rate !== undefined && <td className="py-2 px-3 text-right text-slate-600">${Number(l.rate).toFixed(2)}</td>}
                {l.amount !== undefined && <td className="py-2 px-3 text-right font-semibold text-slate-800">${Number(l.amount).toFixed(2)}</td>}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {estimate.grand_total !== undefined && (
        <div className="flex justify-end">
          <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-right">
            <p className="text-xs text-slate-500">Total (inc. GST)</p>
            <p className="text-xl font-bold text-slate-800">${Number(estimate.grand_total).toFixed(2)}</p>
          </div>
        </div>
      )}
    </div>
  );
}

function PurchaseOrderViewer({ content }: { content: Record<string, unknown> }) {
  const po = content.purchaseOrder as Record<string, unknown> | undefined;
  const lines = (content.lines as Array<Record<string, unknown>>) ?? [];
  if (!po) return <p className="text-sm text-slate-400">No purchase order data.</p>;

  const isCancelled = po.status === 'cancelled';

  return (
    <div className="flex flex-col gap-4">
      {isCancelled && (
        <div className="bg-red-50 border-2 border-red-300 rounded-xl p-4 text-center">
          <p className="text-sm font-bold text-red-700 uppercase tracking-wide">CANCELLED</p>
          {po.cancelled_note && <p className="text-xs text-red-600 mt-1">{po.cancelled_note as string}</p>}
          <p className="text-xs text-red-500 mt-1">Please note this purchase order has been cancelled.</p>
        </div>
      )}
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
        <p className="text-xs text-slate-400 font-medium">PO #{po.po_number as string}</p>
        <p className="text-sm font-bold text-slate-800">{po.title as string}</p>
        <p className="text-xs text-slate-500 mt-0.5">
          {po.job_number as string} — {po.job_name as string}
        </p>
        <p className="text-xs text-slate-400">{po.company_name as string}</p>
      </div>
      {po.instructions && (
        <div className="bg-blue-50 border border-blue-100 rounded-xl p-3">
          <p className="text-xs text-blue-700">{po.instructions as string}</p>
        </div>
      )}
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-slate-200">
              <th className="text-left py-2 px-3 text-slate-500 font-semibold">Description</th>
              <th className="text-right py-2 px-3 text-slate-500 font-semibold">Qty</th>
              <th className="text-right py-2 px-3 text-slate-500 font-semibold">Rate</th>
              <th className="text-right py-2 px-3 text-slate-500 font-semibold">Amount</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l, i) => (
              <tr key={i} className="border-b border-slate-100">
                <td className="py-2 px-3 text-slate-700">{l.description as string}</td>
                <td className="py-2 px-3 text-right text-slate-600">{l.qty as string}</td>
                <td className="py-2 px-3 text-right text-slate-600">${Number(l.rate).toFixed(2)}</td>
                <td className="py-2 px-3 text-right font-semibold text-slate-800">${Number(l.amount).toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex justify-end">
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-right flex flex-col gap-1">
          <div className="flex justify-between gap-8 text-xs text-slate-500">
            <span>Subtotal</span><span>${Number(po.subtotal).toFixed(2)}</span>
          </div>
          <div className="flex justify-between gap-8 text-xs text-slate-500">
            <span>GST</span><span>${Number(po.gst).toFixed(2)}</span>
          </div>
          <div className="flex justify-between gap-8 text-sm font-bold text-slate-800 border-t border-slate-200 pt-1 mt-1">
            <span>Total</span><span>${Number(po.total).toFixed(2)}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

function InvoiceViewer({ content }: { content: Record<string, unknown> }) {
  const invoice = content.invoice as Record<string, unknown> | undefined;
  const lines = (content.lines as Array<Record<string, unknown>>) ?? [];
  if (!invoice) return <p className="text-sm text-slate-400">No invoice data.</p>;

  return (
    <div className="flex flex-col gap-4">
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
        <p className="text-xs text-slate-400 font-medium">Invoice #{invoice.invoice_number as string}</p>
        <p className="text-sm font-bold text-slate-800">{invoice.title as string}</p>
        <p className="text-xs text-slate-500 mt-0.5">{invoice.company_name as string}</p>
        <div className="flex gap-4 mt-2 text-xs text-slate-500">
          {invoice.issue_date && <span>Issued: {invoice.issue_date as string}</span>}
          {invoice.due_date && <span>Due: {invoice.due_date as string}</span>}
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-slate-200">
              <th className="text-left py-2 px-3 text-slate-500 font-semibold">Description</th>
              <th className="text-right py-2 px-3 text-slate-500 font-semibold">Qty</th>
              <th className="text-right py-2 px-3 text-slate-500 font-semibold">Rate</th>
              <th className="text-right py-2 px-3 text-slate-500 font-semibold">Amount</th>
            </tr>
          </thead>
          <tbody>
            {lines.map((l, i) => (
              <tr key={i} className="border-b border-slate-100">
                <td className="py-2 px-3 text-slate-700">{l.description as string}</td>
                <td className="py-2 px-3 text-right text-slate-600">{l.quantity as string}</td>
                <td className="py-2 px-3 text-right text-slate-600">${Number(l.rate).toFixed(2)}</td>
                <td className="py-2 px-3 text-right font-semibold text-slate-800">${Number(l.amount).toFixed(2)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex justify-end">
        <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 text-right flex flex-col gap-1">
          <div className="flex justify-between gap-8 text-xs text-slate-500">
            <span>Subtotal</span><span>${Number(invoice.subtotal).toFixed(2)}</span>
          </div>
          <div className="flex justify-between gap-8 text-xs text-slate-500">
            <span>GST</span><span>${Number(invoice.gst_amount).toFixed(2)}</span>
          </div>
          <div className="flex justify-between gap-8 text-sm font-bold text-slate-800 border-t border-slate-200 pt-1 mt-1">
            <span>Total</span><span>${Number(invoice.total).toFixed(2)}</span>
          </div>
          {Number(invoice.amount_paid) > 0 && (
            <div className="flex justify-between gap-8 text-xs text-emerald-600">
              <span>Paid</span><span>-${Number(invoice.amount_paid).toFixed(2)}</span>
            </div>
          )}
          {Number(invoice.balance_due) > 0 && (
            <div className="flex justify-between gap-8 text-sm font-bold text-red-600 border-t border-slate-200 pt-1 mt-1">
              <span>Balance Due</span><span>${Number(invoice.balance_due).toFixed(2)}</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────

export default function SharePage() {
  const { token } = useParams<{ token: string }>();
  const [data, setData] = useState<SharedDocument | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [isLegacy, setIsLegacy] = useState(false);

  useEffect(() => {
    if (!token) { setError('Invalid link.'); setLoading(false); return; }

    // Try Document Engine first
    fetch(`/api/documents/share/${token}`)
      .then(async (r) => {
        if (r.status === 404) {
          // Fall back to legacy share endpoint
          const legacyR = await fetch(`/api/share/${token}`);
          if (legacyR.ok) {
            setIsLegacy(true);
            setLoading(false);
            return;
          }
          const legacyBody = await legacyR.json() as { error?: string };
          throw new Error(legacyBody.error ?? 'Link not found.');
        }
        const body = await r.json() as { error?: string } & SharedDocument;
        if (!r.ok) throw new Error(body.error ?? 'Failed to load');
        setData(body as SharedDocument);
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [token]);

  // Legacy form — delegate to ExternalFormPage via the old /external/form/:token route
  if (isLegacy) {
    return <ExternalFormPage />;
  }

  // Complete mode — delegate to ExternalFormPage
  if (data?.share.shareMode === 'complete') {
    return <ExternalFormPage />;
  }

  const doc = data?.document;

  const DOC_TYPE_LABELS: Record<string, string> = {
    job_form: 'Job Form',
    completed_form: 'Completed Form',
    estimate: 'Estimate / Quote',
    purchase_order: 'Purchase Order',
    work_order: 'Work Order',
    swms: 'SWMS',
    safety_plan: 'Safety Plan',
    incident_report: 'Incident Report',
    invoice: 'Invoice',
    general_report: 'Report',
  };

  return (
    <>
      <Helmet>
        <title>{doc ? `${doc.title} — IWILLBUILD` : 'Shared Document — IWILLBUILD'}</title>
        <meta name="description" content="View a shared document from IWILLBUILD." />
        <link rel="canonical" href={`${typeof window !== 'undefined' ? window.location.origin : ''}/share/${token ?? ''}`} />
        <meta name="robots" content="noindex, nofollow" />
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
          {doc && (
            <>
              <span className="text-slate-300">|</span>
              <span className="text-xs text-slate-500 truncate">
                {DOC_TYPE_LABELS[doc.documentType] ?? doc.documentType}
              </span>
            </>
          )}
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

          {!loading && data && doc && (
            <div className="flex flex-col gap-5">
              {/* Document header */}
              <div className="bg-white border border-slate-200 rounded-2xl p-6">
                <div className="flex items-start justify-between gap-4 mb-3">
                  <div>
                    <p className="text-xs text-slate-400 font-medium">
                      {DOC_TYPE_LABELS[doc.documentType] ?? doc.documentType} · v{doc.version}
                    </p>
                    <h1 className="text-lg font-bold text-slate-800">{doc.title}</h1>
                  </div>
                  <span className={`text-xs font-bold px-2.5 py-1 rounded-full shrink-0 ${
                    doc.status === 'submitted' || doc.status === 'completed'
                      ? 'bg-emerald-100 text-emerald-700'
                      : doc.status === 'draft'
                      ? 'bg-slate-100 text-slate-600'
                      : 'bg-blue-100 text-blue-700'
                  }`}>
                    {doc.status.replace(/_/g, ' ')}
                  </span>
                </div>

                <div className="flex items-center gap-3 text-xs text-slate-400 flex-wrap">
                  {doc.isLocked && (
                    <span className="flex items-center gap-1 text-amber-600">
                      <Lock size={11} /> Locked
                    </span>
                  )}
                  {doc.completedAt && (
                    <span className="flex items-center gap-1 text-emerald-600">
                      <CheckCircle2 size={11} />
                      Completed {new Date(doc.completedAt).toLocaleDateString('en-AU')}
                    </span>
                  )}
                  {data.share.expiresAt && (
                    <span className="flex items-center gap-1">
                      <Clock size={11} />
                      Link expires {new Date(data.share.expiresAt).toLocaleDateString('en-AU')}
                    </span>
                  )}
                </div>
              </div>

              {/* Document content */}
              <div className="bg-white border border-slate-200 rounded-2xl p-6">
                {(doc.documentType === 'job_form' || doc.documentType === 'completed_form') && (
                  <FormViewer content={data.content} />
                )}
                {doc.documentType === 'estimate' && (
                  <EstimateViewer content={data.content} />
                )}
                {(doc.documentType === 'purchase_order' || doc.documentType === 'work_order') && (
                  <PurchaseOrderViewer content={data.content} />
                )}
                {doc.documentType === 'invoice' && (
                  <InvoiceViewer content={data.content} />
                )}
                {!['job_form', 'completed_form', 'estimate', 'purchase_order', 'work_order', 'invoice'].includes(doc.documentType) && (
                  <p className="text-sm text-slate-400 text-center py-4">
                    Document type: {DOC_TYPE_LABELS[doc.documentType] ?? doc.documentType}
                  </p>
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
