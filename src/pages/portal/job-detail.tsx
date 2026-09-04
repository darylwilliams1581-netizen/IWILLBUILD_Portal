/**
 * /portal/jobs/:id?token=...
 * Customer portal job detail — shows job info, estimates (with approve/decline),
 * and invoices (with Pay Now via Stripe).
 */
import { useState, useEffect } from 'react';
import { useParams, useSearchParams, Link } from "react-router";
import { Helmet } from '@dr.pogodin/react-helmet';
import { motion, AnimatePresence } from 'motion/react';
import { HardHat, FileText, Receipt, ChevronLeft, Loader2, AlertCircle, CheckCircle, XCircle, Clock, DollarSign, Check, X, CreditCard, Building2, MapPin, Calendar } from 'lucide-react';
interface PortalJob {
  id: number;
  job_number: string;
  name: string;
  status: string;
  address?: string;
  description?: string;
  start_date?: string;
  end_date?: string;
}
interface PortalEstimate {
  id: number;
  estimate_number: string;
  title: string;
  status: string;
  total_inc_gst: number;
  total_ex_gst: number;
  created_at: string;
  approved_at?: string;
  notes?: string;
}
interface PortalInvoice {
  id: number;
  invoice_number: string;
  title: string;
  status: string;
  total_inc_gst: number;
  due_date?: string;
  paid_at?: string;
  created_at: string;
}
function fmtMoney(n?: number | null) {
  if (n == null) return '—';
  return new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency: 'AUD'
  }).format(n);
}
function fmtDate(iso?: string | null) {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString('en-AU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric'
  });
}
const EST_STATUS: Record<string, {
  label: string;
  color: string;
  icon: React.ElementType;
}> = {
  pending: {
    label: 'Awaiting your review',
    color: 'text-amber-600',
    icon: Clock
  },
  approved: {
    label: 'Approved',
    color: 'text-emerald-600',
    icon: CheckCircle
  },
  declined: {
    label: 'Declined',
    color: 'text-red-500',
    icon: XCircle
  },
  sent: {
    label: 'Sent',
    color: 'text-blue-600',
    icon: FileText
  }
};
const INV_STATUS: Record<string, {
  label: string;
  color: string;
  bg: string;
}> = {
  unpaid: {
    label: 'Unpaid',
    color: 'text-violet-800',
    bg: 'bg-violet-50 border-violet-200'
  },
  overdue: {
    label: 'Overdue',
    color: 'text-red-700',
    bg: 'bg-red-50 border-red-200'
  },
  partial: {
    label: 'Partial',
    color: 'text-amber-700',
    bg: 'bg-amber-50 border-amber-200'
  },
  paid: {
    label: 'Paid',
    color: 'text-emerald-700',
    bg: 'bg-emerald-50 border-emerald-200'
  },
  cancelled: {
    label: 'Cancelled',
    color: 'text-slate-500',
    bg: 'bg-slate-100 border-slate-200'
  }
};
export default function PortalJobDetailPage() {
  const {
    id
  } = useParams<{
    id: string;
  }>();
  const [params] = useSearchParams();
  const token = params.get('token') ?? sessionStorage.getItem('portalToken') ?? '';
  const [job, setJob] = useState<PortalJob | null>(null);
  const [estimates, setEstimates] = useState<PortalEstimate[]>([]);
  const [invoices, setInvoices] = useState<PortalInvoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  // Estimate action state
  const [actionEstId, setActionEstId] = useState<number | null>(null);
  const [actionNotes, setActionNotes] = useState('');
  const [actionSaving, setActionSaving] = useState(false);
  const [actionDone, setActionDone] = useState<Record<number, 'approved' | 'declined'>>({});

  // Invoice pay state
  const [payingId, setPayingId] = useState<number | null>(null);
  const companyName = sessionStorage.getItem('portalCompanyName') ?? 'Your contractor';
  useEffect(() => {
    if (!id || !token) {
      setError('Invalid link');
      setLoading(false);
      return;
    }
    fetch(`/api/portal/jobs/${id}?token=${encodeURIComponent(token)}`).then(r => r.json() as Promise<{
      job?: PortalJob;
      estimates?: PortalEstimate[];
      invoices?: PortalInvoice[];
      error?: string;
    }>).then(data => {
      if (data.error) {
        setError(data.error);
        return;
      }
      setJob(data.job ?? null);
      setEstimates(data.estimates ?? []);
      setInvoices(data.invoices ?? []);
    }).catch(() => setError('Failed to load job details')).finally(() => setLoading(false));
  }, [id, token]);
  async function handleEstimateAction(estId: number, action: 'approve' | 'decline') {
    setActionSaving(true);
    try {
      const res = await fetch(`/api/portal/estimates/${estId}/approve`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          token,
          action,
          notes: actionNotes || undefined
        })
      });
      const data = (await res.json()) as {
        ok?: boolean;
        status?: string;
        error?: string;
      };
      if (data.ok) {
        setActionDone(prev => ({
          ...prev,
          [estId]: action === 'approve' ? 'approved' : 'declined'
        }));
        setEstimates(prev => prev.map(e => e.id === estId ? {
          ...e,
          status: data.status ?? e.status
        } : e));
        setActionEstId(null);
        setActionNotes('');
      }
    } finally {
      setActionSaving(false);
    }
  }
  async function handlePay(invoiceId: number) {
    setPayingId(invoiceId);
    try {
      const res = await fetch(`/api/portal/invoices/${invoiceId}/pay`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          token
        })
      });
      const data = (await res.json()) as {
        checkoutUrl?: string;
        error?: string;
      };
      if (data.checkoutUrl) {
        window.location.href = data.checkoutUrl;
      } else {
        alert(data.error ?? 'Payment setup failed. Please try again.');
        setPayingId(null);
      }
    } catch {
      alert('Payment setup failed. Please try again.');
      setPayingId(null);
    }
  }
  if (loading) return <div className="min-h-screen bg-slate-50 flex items-center justify-center">
      <Loader2 size={28} className="text-violet-400 animate-spin" />
    </div>;
  if (error) return <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-2xl border border-red-200 p-8 max-w-sm w-full text-center">
        <AlertCircle size={32} className="text-red-400 mx-auto mb-3" />
        <p className="font-semibold text-slate-700">{error}</p>
        <Link to={`/portal/dashboard?token=${token}`} className="mt-4 inline-block text-sm text-violet-600 hover:underline">
          ← Back to dashboard
        </Link>
      </div>
    </div>;
  return <>
      <Helmet>
        <title>{job?.name ?? 'Job'} — Client Portal — IWIllBUIlD</title>
        <meta name="description" content="View job details, estimates, and invoices in your IWIllBUIlD client portal." />
        <link rel="canonical" href="https://iwillbuild.com/portal/jobs" />
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>

      <div className="min-h-screen bg-slate-50">
        {/* Header */}
        <header className="bg-white border-b border-slate-200 sticky top-0 z-20 safe-top">
          <div className="max-w-3xl mx-auto px-4 py-4 flex items-center gap-3">
            <Link to={`/portal/dashboard?token=${token}`} className="flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-700 transition-colors">
              <ChevronLeft size={16} /> Dashboard
            </Link>
            <div className="flex-1" />
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-lg bg-violet-500 flex items-center justify-center">
                <Building2 size={14} className="text-white" />
              </div>
              <span className="text-sm font-semibold text-slate-600 hidden sm:block">{companyName}</span>
            </div>
          </div>
        </header>

        <main className="max-w-3xl mx-auto px-4 py-8 flex flex-col gap-6">
          {/* Job header */}
          {job && <motion.div initial={{
          opacity: 0,
          y: 8
        }} animate={{
          opacity: 1,
          y: 0
        }} className="bg-white rounded-2xl border border-slate-200 p-6">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-xl bg-violet-50 flex items-center justify-center shrink-0">
                  <HardHat size={22} className="text-violet-600" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-slate-400 mb-0.5">{job.job_number}</p>
                  <h1 className="text-xl font-black text-slate-800">{job.name}</h1>
                  {job.address && <div className="flex items-center gap-1.5 mt-1.5 text-sm text-slate-500">
                      <MapPin size={13} /> {job.address}
                    </div>}
                  {(job.start_date || job.end_date) && <div className="flex items-center gap-1.5 mt-1 text-xs text-slate-400">
                      <Calendar size={11} />
                      {job.start_date && <span>Start: {fmtDate(job.start_date)}</span>}
                      {job.end_date && <span>· End: {fmtDate(job.end_date)}</span>}
                    </div>}
                  {job.description && <p className="text-sm text-slate-500 mt-2 leading-relaxed">{job.description}</p>}
                </div>
              </div>
            </motion.div>}

          {/* Estimates */}
          <section>
            <h2 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-2">
              <FileText size={14} /> Estimates
            </h2>
            {estimates.length === 0 ? <div className="bg-white rounded-2xl border border-slate-200 p-6 text-center text-slate-400">
                <FileText size={28} className="mx-auto mb-2 text-slate-200" />
                <p className="text-sm">No estimates yet</p>
              </div> : <div className="flex flex-col gap-3">
                {estimates.map((est, i) => {
              const sc = EST_STATUS[est.status] ?? EST_STATUS.sent;
              const Icon = sc.icon;
              const isDone = actionDone[est.id];
              const canAct = (est.status === 'pending' || est.status === 'sent') && !isDone;
              return <motion.div key={est.id} initial={{
                opacity: 0,
                y: 6
              }} animate={{
                opacity: 1,
                y: 0
              }} transition={{
                delay: i * 0.05
              }} className="bg-white rounded-2xl border border-slate-200 p-5">
                      <div className="flex items-start justify-between gap-3 mb-3">
                        <div>
                          <p className="text-xs text-slate-400 font-semibold">{est.estimate_number}</p>
                          <p className="font-bold text-slate-800">{est.title || est.estimate_number}</p>
                          <p className="text-xs text-slate-400 mt-0.5">{fmtDate(est.created_at)}</p>
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-lg font-black text-slate-800">{fmtMoney(est.total_inc_gst)}</p>
                          <p className="text-xs text-slate-400">inc. GST</p>
                        </div>
                      </div>

                      <div className={`flex items-center gap-1.5 text-xs font-semibold ${sc.color} mb-3`}>
                        <Icon size={12} /> {sc.label}
                        {isDone && <span className="ml-1 text-slate-400">— {isDone === 'approved' ? 'You approved this' : 'You declined this'}</span>}
                      </div>

                      {/* Action buttons */}
                      {canAct && actionEstId !== est.id && <div className="flex gap-2">
                          <button onClick={() => setActionEstId(est.id)} className="flex-1 py-2 rounded-xl bg-emerald-500 text-white text-sm font-semibold hover:bg-emerald-600 transition-colors flex items-center justify-center gap-1.5">
                            <Check size={14} /> Approve
                          </button>
                          <button onClick={() => {
                    setActionEstId(est.id);
                  }} className="flex-1 py-2 rounded-xl border border-red-200 text-red-500 text-sm font-semibold hover:bg-red-50 transition-colors flex items-center justify-center gap-1.5">
                            <X size={14} /> Decline
                          </button>
                        </div>}

                      {/* Confirm panel */}
                      <AnimatePresence>
                        {actionEstId === est.id && <motion.div initial={{
                    opacity: 0,
                    height: 0
                  }} animate={{
                    opacity: 1,
                    height: 'auto'
                  }} exit={{
                    opacity: 0,
                    height: 0
                  }} className="overflow-hidden">
                            <div className="pt-3 border-t border-slate-100 mt-3">
                              <textarea value={actionNotes} onChange={e => setActionNotes(e.target.value)} placeholder="Add a note (optional)…" rows={2} className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm text-slate-700 focus:outline-none focus:border-violet-400 resize-none mb-3" />
                              <div className="flex gap-2">
                                <button onClick={() => handleEstimateAction(est.id, 'approve')} disabled={actionSaving} className="flex-1 py-2 rounded-xl bg-emerald-500 text-white text-sm font-semibold hover:bg-emerald-600 disabled:opacity-50 transition-colors flex items-center justify-center gap-1.5">
                                  {actionSaving ? <Loader2 size={13} className="animate-spin" /> : <Check size={13} />}
                                  Confirm Approve
                                </button>
                                <button onClick={() => handleEstimateAction(est.id, 'decline')} disabled={actionSaving} className="flex-1 py-2 rounded-xl border border-red-200 text-red-500 text-sm font-semibold hover:bg-red-50 disabled:opacity-50 transition-colors flex items-center justify-center gap-1.5">
                                  {actionSaving ? <Loader2 size={13} className="animate-spin" /> : <X size={13} />}
                                  Confirm Decline
                                </button>
                                <button onClick={() => {
                          setActionEstId(null);
                          setActionNotes('');
                        }} className="px-3 py-2 rounded-xl border border-slate-200 text-slate-400 text-sm hover:bg-slate-50 transition-colors">
                                  Cancel
                                </button>
                              </div>
                            </div>
                          </motion.div>}
                      </AnimatePresence>
                    </motion.div>;
            })}
              </div>}
          </section>

          {/* Invoices */}
          <section>
            <h2 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-3 flex items-center gap-2">
              <Receipt size={14} /> Invoices
            </h2>
            {invoices.length === 0 ? <div className="bg-white rounded-2xl border border-slate-200 p-6 text-center text-slate-400">
                <Receipt size={28} className="mx-auto mb-2 text-slate-200" />
                <p className="text-sm">No invoices yet</p>
              </div> : <div className="flex flex-col gap-3">
                {invoices.map((inv, i) => {
              const sc = INV_STATUS[inv.status] ?? INV_STATUS.unpaid;
              const canPay = ['unpaid', 'overdue', 'partial'].includes(inv.status);
              return <motion.div key={inv.id} initial={{
                opacity: 0,
                y: 6
              }} animate={{
                opacity: 1,
                y: 0
              }} transition={{
                delay: i * 0.05
              }} className="bg-white rounded-2xl border border-slate-200 p-5">
                      <div className="flex items-start justify-between gap-3 mb-3">
                        <div>
                          <p className="text-xs text-slate-400 font-semibold">{inv.invoice_number}</p>
                          <p className="font-bold text-slate-800">{inv.title || inv.invoice_number}</p>
                          {inv.due_date && <p className="text-xs text-slate-400 mt-0.5">Due: {fmtDate(inv.due_date)}</p>}
                        </div>
                        <div className="text-right shrink-0">
                          <p className="text-lg font-black text-slate-800">{fmtMoney(inv.total_inc_gst)}</p>
                          <span className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded-full border ${sc.bg} ${sc.color}`}>
                            {sc.label}
                          </span>
                        </div>
                      </div>

                      {canPay && <button onClick={() => handlePay(inv.id)} disabled={payingId === inv.id} className="w-full py-2.5 rounded-xl bg-violet-500 text-white text-sm font-bold hover:bg-violet-700 disabled:opacity-50 transition-colors flex items-center justify-center gap-2">
                          {payingId === inv.id ? <><Loader2 size={14} className="animate-spin" /> Redirecting to payment…</> : <><CreditCard size={14} /> Pay {fmtMoney(inv.total_inc_gst)}</>}
                        </button>}

                      {inv.status === 'paid' && inv.paid_at && <div className="flex items-center gap-1.5 text-xs text-emerald-600 font-semibold">
                          <CheckCircle size={12} /> Paid on {fmtDate(inv.paid_at)}
                        </div>}
                    </motion.div>;
            })}
              </div>}
          </section>

          {/* Outstanding summary */}
          {invoices.some(i => ['unpaid', 'overdue', 'partial'].includes(i.status)) && <div className="bg-violet-50 border border-violet-200 rounded-2xl p-4 flex items-center gap-3">
              <DollarSign size={18} className="text-violet-600 shrink-0" />
              <div>
                <p className="text-sm font-bold text-violet-800">
                  Total outstanding: {fmtMoney(invoices.filter(i => ['unpaid', 'overdue', 'partial'].includes(i.status)).reduce((s, i) => s + i.total_inc_gst, 0))}
                </p>
                <p className="text-xs text-violet-700 mt-0.5">Pay each invoice above using the Pay button.</p>
              </div>
            </div>}
        </main>
      </div>
    </>;
}
