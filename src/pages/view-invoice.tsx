/**
 * /view/invoice/:id — Read-only invoice viewer (opens in new tab)
 * Authenticated. Shows invoice lines, totals, payments, status. Print support.
 */
import { useEffect, useState } from 'react';
import { useParams } from "react-router";
import { Helmet } from '@dr.pogodin/react-helmet';
import { Printer, X, Loader2, AlertTriangle, Receipt } from 'lucide-react';
import OutlookEmailButton from '@/components/OutlookEmailButton';
import { fetchInvoice, fmtMoney, STATUS_LABELS, STATUS_COLORS, type Invoice, type InvoiceStatus } from '@/lib/invoices-api';
export default function ViewInvoicePage() {
  const {
    id
  } = useParams<{
    id: string;
  }>();
  const [invoice, setInvoice] = useState<Invoice | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  useEffect(() => {
    if (!id) {
      setError('Invalid invoice ID');
      setLoading(false);
      return;
    }
    const numId = parseInt(id, 10);
    if (isNaN(numId)) {
      setError('Invalid invoice ID');
      setLoading(false);
      return;
    }
    fetchInvoice(numId).then(setInvoice).catch((e: Error) => setError(e.message)).finally(() => setLoading(false));
  }, [id]);
  const status = invoice?.status;
  const sc = status ? STATUS_COLORS[status] : null;
  const sl = status ? STATUS_LABELS[status] : '';
  return <>
      <Helmet>
        <title>{invoice ? `${invoice.invoice_number} — Invoice — IWIllBUIlD` : 'Invoice Viewer — IWIllBUIlD'}</title>
        <meta name="description" content="Authenticated invoice viewer — IWIllBUIlD portal" />
        <link rel="canonical" href={`https://iwillbuild.com/view/invoice/${id ?? ''}`} />
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>

      <div className="min-h-screen bg-gray-950 flex flex-col">
        {/* Toolbar */}
        <div className="bg-gray-900 border-b border-gray-800 px-4 py-3 flex items-center gap-3 shrink-0 no-print">
          <div className="flex-1 min-w-0">
            {invoice && <>
                <p className="text-sm font-semibold text-white truncate">{invoice.title || invoice.invoice_number}</p>
                <p className="text-xs text-gray-400">{invoice.invoice_number}{invoice.customer_name ? ` · ${invoice.customer_name}` : ''}</p>
              </>}
          </div>
          {invoice && <div className="flex items-center gap-2 shrink-0">
              <button onClick={() => window.print()} className="flex items-center gap-1.5 text-xs bg-gray-800 hover:bg-gray-700 text-gray-200 border border-gray-700 px-3 py-1.5 rounded-lg transition-colors">
                <Printer size={13} />
                Print
              </button>
              <OutlookEmailButton context={{
            kind: 'invoice',
            invoiceNumber: invoice.invoiceNumber ?? `#${invoice.id}`,
            customerName: invoice.customerName ?? undefined,
            totalAmount: fmtMoney(Number(invoice.totalAmount ?? 0)),
            dueDate: invoice.dueDate ? new Date(invoice.dueDate).toLocaleDateString('en-AU', {
              day: 'numeric',
              month: 'short',
              year: 'numeric'
            }) : undefined,
            status: STATUS_LABELS[invoice.status as InvoiceStatus] ?? invoice.status,
            link: window.location.href
          }} size="sm" showCopy />
              <a href={`/invoices/${invoice.id}`} className="flex items-center gap-1.5 text-xs bg-violet-500 hover:bg-violet-700 text-white px-3 py-1.5 rounded-lg font-semibold transition-colors">
                Open Editor
              </a>
              <button onClick={() => window.close()} className="w-8 h-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-white hover:bg-gray-800 transition-colors" title="Close tab">
                <X size={16} />
              </button>
            </div>}
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto">
          {loading && <div className="flex items-center justify-center py-24">
              <Loader2 size={28} className="animate-spin text-violet-600" />
            </div>}

          {!loading && error && <div className="flex flex-col items-center justify-center gap-4 py-24 text-center px-8">
              <div className="w-16 h-16 bg-red-900/30 rounded-2xl flex items-center justify-center">
                <AlertTriangle size={28} className="text-red-400" />
              </div>
              <div>
                <p className="text-white font-semibold mb-1">Invoice unavailable</p>
                <p className="text-gray-400 text-sm">{error}</p>
              </div>
            </div>}

          {!loading && invoice && <div className="max-w-4xl mx-auto px-4 py-8">
              {/* Header */}
              <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 mb-6 print:bg-white print:border-gray-200">
                <div className="flex items-start justify-between gap-4 flex-wrap">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <div className="w-8 h-8 bg-violet-500 rounded-lg flex items-center justify-center shrink-0">
                        <Receipt size={16} className="text-white" />
                      </div>
                      <h1 className="text-xl font-bold text-white print:text-gray-900">{invoice.title || invoice.invoice_number}</h1>
                    </div>
                    <p className="text-sm text-gray-400 print:text-gray-500">
                      {invoice.invoice_number}
                      {invoice.customer_name ? ` · ${invoice.customer_name}` : ''}
                      {invoice.issue_date ? ` · Issued ${new Date(invoice.issue_date).toLocaleDateString('en-AU', {
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric'
                  })}` : ''}
                      {invoice.due_date ? ` · Due ${new Date(invoice.due_date).toLocaleDateString('en-AU', {
                    day: 'numeric',
                    month: 'long',
                    year: 'numeric'
                  })}` : ''}
                    </p>
                  </div>
                  {sc && <span className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-bold border ${sc.bg} ${sc.text} ${sc.border}`}>
                      <span className={`w-2 h-2 rounded-full ${sc.dot}`} />
                      {sl}
                    </span>}
                </div>
                {invoice.notes && <p className="mt-4 text-sm text-gray-300 print:text-gray-600 bg-gray-800 print:bg-gray-50 rounded-lg px-4 py-3">
                    {invoice.notes}
                  </p>}
              </div>

              {/* Lines */}
              <div className="bg-gray-900 border border-gray-800 rounded-2xl overflow-hidden mb-6 print:bg-white print:border-gray-200">
                <div className="px-6 py-4 border-b border-gray-800 print:border-gray-200">
                  <h2 className="text-sm font-bold text-gray-300 print:text-gray-700 uppercase tracking-wider">
                    Line Items ({(invoice.lines ?? []).length})
                  </h2>
                </div>
                {(invoice.lines ?? []).length === 0 ? <div className="px-6 py-8 text-center text-gray-500 text-sm">No line items</div> : <div className="overflow-x-auto">
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
                        {(invoice.lines ?? []).map((line, i) => <tr key={line.id} className={`border-b border-gray-800 print:border-gray-100 ${i % 2 === 0 ? '' : 'bg-gray-800/30 print:bg-gray-50'}`}>
                            <td className="px-6 py-3 text-gray-200 print:text-gray-800">{line.description}</td>
                            <td className="px-4 py-3 text-right text-gray-300 print:text-gray-600">{line.quantity}</td>
                            <td className="px-4 py-3 text-gray-400 print:text-gray-500">{line.unit ?? ''}</td>
                            <td className="px-4 py-3 text-right text-gray-300 print:text-gray-600">{fmtMoney(line.rate)}</td>
                            <td className="px-6 py-3 text-right font-semibold text-white print:text-gray-900">{fmtMoney(line.amount)}</td>
                          </tr>)}
                      </tbody>
                    </table>
                  </div>}
              </div>

              {/* Totals + Payments */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Payments */}
                {(invoice.payments ?? []).length > 0 && <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 print:bg-white print:border-gray-200">
                    <h3 className="text-sm font-bold text-gray-300 print:text-gray-700 uppercase tracking-wider mb-4">Payments</h3>
                    <div className="space-y-2">
                      {(invoice.payments ?? []).map(p => <div key={p.id} className="flex justify-between text-sm">
                          <span className="text-gray-400 print:text-gray-500">
                            {new Date(p.payment_date).toLocaleDateString('en-AU')}
                            {p.method ? ` · ${p.method}` : ''}
                          </span>
                          <span className="text-emerald-400 print:text-emerald-600 font-semibold">{fmtMoney(p.amount)}</span>
                        </div>)}
                    </div>
                  </div>}

                {/* Totals */}
                <div className="bg-gray-900 border border-gray-800 rounded-2xl p-6 print:bg-white print:border-gray-200 md:col-start-2">
                  <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                      <span className="text-gray-400 print:text-gray-500">Subtotal</span>
                      <span className="text-gray-200 print:text-gray-700">{fmtMoney(invoice.subtotal)}</span>
                    </div>
                    {parseFloat(invoice.gst_amount) > 0 && <div className="flex justify-between text-sm">
                        <span className="text-gray-400 print:text-gray-500">GST (10%)</span>
                        <span className="text-gray-200 print:text-gray-700">{fmtMoney(invoice.gst_amount)}</span>
                      </div>}
                    <div className="flex justify-between text-base font-bold border-t border-gray-700 print:border-gray-300 pt-2 mt-2">
                      <span className="text-white print:text-gray-900">Total</span>
                      <span className="text-violet-400 print:text-violet-700">{fmtMoney(invoice.total)}</span>
                    </div>
                    {parseFloat(invoice.amount_paid) > 0 && <>
                        <div className="flex justify-between text-sm">
                          <span className="text-gray-400 print:text-gray-500">Amount Paid</span>
                          <span className="text-emerald-400 print:text-emerald-600">{fmtMoney(invoice.amount_paid)}</span>
                        </div>
                        <div className="flex justify-between text-sm font-bold">
                          <span className="text-gray-300 print:text-gray-700">Balance Due</span>
                          <span className="text-white print:text-gray-900">{fmtMoney(invoice.balance_due)}</span>
                        </div>
                      </>}
                  </div>
                </div>
              </div>

              {invoice.terms && <div className="mt-6 bg-gray-900 border border-gray-800 rounded-2xl p-6 print:bg-white print:border-gray-200">
                  <h3 className="text-sm font-bold text-gray-300 print:text-gray-700 uppercase tracking-wider mb-2">Terms</h3>
                  <p className="text-sm text-gray-400 print:text-gray-600">{invoice.terms}</p>
                </div>}
            </div>}
        </div>
      </div>

      <style>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white; }
        }
      `}</style>
    </>;
}
