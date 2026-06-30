/**
 * /view/estimate/:id — Read-only estimate viewer (opens in new tab)
 * Authenticated. Shows estimate lines, totals, status. Print/download support.
 */
import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Helmet } from '@dr.pogodin/react-helmet';
import { Printer, Download, X, Loader2, AlertTriangle, FileText } from 'lucide-react';
import {
  fetchEstimate, estimateTotals, lineCalc, getEstimateStatusStyle,
  type Estimate, type EstimateLine,
} from '@/lib/estimates-api';

function fmtMoney(n: number) {
  return n.toLocaleString('en-AU', { style: 'currency', currency: 'AUD' });
}

export default function ViewEstimatePage() {
  const { id } = useParams<{ id: string }>();
  const [estimate, setEstimate] = useState<Estimate | null>(null);
  const [lines, setLines] = useState<EstimateLine[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!id) { setError('Invalid estimate ID'); setLoading(false); return; }
    const numId = parseInt(id, 10);
    if (isNaN(numId)) { setError('Invalid estimate ID'); setLoading(false); return; }
    fetchEstimate(numId)
      .then(({ estimate: est, lines: ls }) => { setEstimate(est); setLines(ls); })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false));
  }, [id]);

  const totals = estimate ? estimateTotals(lines, estimate.markupPercent, estimate.gstMode) : null;
  const statusStyle = estimate ? getEstimateStatusStyle(estimate.status) : null;

  return (
    <>
      <Helmet>
        <title>{estimate ? `${estimate.title} — Estimate — IWILLBUILD` : 'Estimate Viewer — IWILLBUILD'}</title>
        <meta name="description" content="Authenticated estimate viewer — IWILLBUILD portal" />
        <link rel="canonical" href={`https://iwillbuild.com/view/estimate/${id ?? ''}`} />
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>

      <div className="min-h-screen bg-gray-950 flex flex-col">
        {/* Toolbar */}
        <div className="bg-gray-900 border-b border-gray-800 px-4 py-3 flex items-center gap-3 shrink-0 no-print">
          <div className="flex-1 min-w-0">
            {estimate && (
              <>
                <p className="text-sm font-semibold text-white truncate">{estimate.title}</p>
                <p className="text-xs text-gray-400">
                  Estimate #{estimate.id}
                  {statusStyle && (
                    <span className={`ml-2 inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-xs font-semibold border ${statusStyle.bg} ${statusStyle.color}`}>
                      {estimate.status}
                    </span>
                  )}
                </p>
              </>
            )}
          </div>
          {estimate && (
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => window.print()}
                className="flex items-center gap-1.5 text-xs bg-gray-800 hover:bg-gray-700 text-gray-200 border border-gray-700 px-3 py-1.5 rounded-lg transition-colors"
              >
                <Printer size={13} />
                Print
              </button>
              <a
                href={`/estimates/${estimate.id}`}
                className="flex items-center gap-1.5 text-xs bg-orange-500 hover:bg-orange-600 text-white px-3 py-1.5 rounded-lg font-semibold transition-colors"
              >
                <Download size={13} />
                Open Editor
              </a>
              <button
                onClick={() => window.close()}
                className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition-colors"
                title="Close tab"
              >
                <X size={16} />
              </button>
            </div>
          )}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto">
          {loading && (
            <div className="flex items-center justify-center py-24">
              <Loader2 size={28} className="animate-spin text-orange-500" />
            </div>
          )}

          {!loading && error && (
            <div className="flex flex-col items-center justify-center gap-4 py-24 text-center px-8">
              <div className="w-16 h-16 bg-red-900/30 rounded-2xl flex items-center justify-center">
                <AlertTriangle size={28} className="text-red-400" />
              </div>
              <div>
                <p className="text-white font-semibold mb-1">Estimate unavailable</p>
                <p className="text-gray-400 text-sm">{error}</p>
              </div>
            </div>
          )}

          {!loading && estimate && totals && (
            <div className="max-w-4xl mx-auto px-4 py-8">
              {/* Header card */}
              <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 mb-6 print:bg-white print:border-gray-200">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <div className="w-8 h-8 bg-orange-500 rounded-lg flex items-center justify-center shrink-0">
                        <FileText size={16} className="text-white" />
                      </div>
                      <h1 className="text-xl font-bold text-white print:text-gray-900">{estimate.title}</h1>
                    </div>
                    <p className="text-sm text-gray-400 print:text-gray-500">
                      Estimate #{estimate.id} · Created {new Date(estimate.createdAt).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })}
                    </p>
                  </div>
                  {statusStyle && (
                    <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-bold border ${statusStyle.bg} ${statusStyle.color}`}>
                      <span className={`w-2 h-2 rounded-full ${statusStyle.dot}`} />
                      {estimate.status}
                    </span>
                  )}
                </div>
                {estimate.notes && (
                  <p className="mt-4 text-sm text-gray-300 print:text-gray-600 bg-gray-800 print:bg-gray-50 rounded-lg px-4 py-3">
                    {estimate.notes}
                  </p>
                )}
              </div>

              {/* Lines table */}
              <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden mb-6 print:bg-white print:border-gray-200">
                <div className="px-6 py-4 border-b border-gray-800 print:border-gray-200">
                  <h2 className="text-sm font-bold text-gray-300 print:text-gray-700 uppercase tracking-wider">
                    Line Items ({lines.length})
                  </h2>
                </div>
                {lines.length === 0 ? (
                  <div className="px-6 py-8 text-center text-gray-500 text-sm">No line items</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-gray-800 print:border-gray-200">
                          <th className="text-left px-6 py-3 text-xs font-semibold text-gray-400 print:text-gray-500 uppercase tracking-wider">Description</th>
                          <th className="text-right px-4 py-3 text-xs font-semibold text-gray-400 print:text-gray-500 uppercase tracking-wider w-20">Qty</th>
                          <th className="text-left px-4 py-3 text-xs font-semibold text-gray-400 print:text-gray-500 uppercase tracking-wider w-16">Unit</th>
                          <th className="text-right px-4 py-3 text-xs font-semibold text-gray-400 print:text-gray-500 uppercase tracking-wider w-28">Rate</th>
                          <th className="text-right px-6 py-3 text-xs font-semibold text-gray-400 print:text-gray-500 uppercase tracking-wider w-28">Amount</th>
                        </tr>
                      </thead>
                      <tbody>
                        {lines.map((line, i) => (
                          <tr key={line.id} className={`border-b border-gray-800 print:border-gray-100 ${i % 2 === 0 ? '' : 'bg-gray-800/30 print:bg-gray-50'}`}>
                            <td className="px-6 py-3 text-gray-200 print:text-gray-800">{line.description}</td>
                            <td className="px-4 py-3 text-right text-gray-300 print:text-gray-600">{line.quantity}</td>
                            <td className="px-4 py-3 text-gray-400 print:text-gray-500">{line.unit ?? ''}</td>
                            <td className="px-4 py-3 text-right text-gray-300 print:text-gray-600">{fmtMoney(parseFloat(line.rate) || 0)}</td>
                            <td className="px-6 py-3 text-right font-semibold text-white print:text-gray-900">{fmtMoney(lineCalc(line))}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Totals */}
              <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 print:bg-white print:border-gray-200">
                <div className="max-w-xs ml-auto space-y-2">
                  <div className="flex justify-between text-sm">
                    <span className="text-gray-400 print:text-gray-500">Subtotal</span>
                    <span className="text-gray-200 print:text-gray-700">{fmtMoney(totals.subtotal)}</span>
                  </div>
                  {parseFloat(estimate.markupPercent) > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-400 print:text-gray-500">Markup ({estimate.markupPercent}%)</span>
                      <span className="text-gray-200 print:text-gray-700">{fmtMoney(totals.markupAmount)}</span>
                    </div>
                  )}
                  {totals.gst > 0 && (
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-400 print:text-gray-500">GST (10%)</span>
                      <span className="text-gray-200 print:text-gray-700">{fmtMoney(totals.gst)}</span>
                    </div>
                  )}
                  <div className="flex justify-between text-base font-bold border-t border-gray-700 print:border-gray-300 pt-2 mt-2">
                    <span className="text-white print:text-gray-900">Total</span>
                    <span className="text-orange-400 print:text-orange-600">{fmtMoney(totals.total)}</span>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white; }
        }
      `}</style>
    </>
  );
}
