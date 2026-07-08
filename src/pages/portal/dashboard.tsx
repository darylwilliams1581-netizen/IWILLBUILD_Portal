/**
 * /portal/dashboard?token=...
 * Customer portal dashboard — lists all jobs with status, outstanding amounts,
 * pending estimates, and unpaid invoices.
 */
import { useState, useEffect, useCallback } from 'react';
import { useSearchParams, Link, useNavigate } from 'react-router-dom';
import { Helmet } from '@dr.pogodin/react-helmet';
import { motion } from 'motion/react';
import {
  Briefcase, FileText, Receipt, AlertCircle, Loader2,
  ChevronRight, Building2, LogOut, CheckCircle, Clock,
  DollarSign, HardHat,
} from 'lucide-react';

interface PortalJob {
  id: number;
  job_number: string;
  name: string;
  status: string;
  address?: string;
  description?: string;
  start_date?: string;
  end_date?: string;
  created_at: string;
  approved_estimates: number;
  pending_estimates: number;
  invoice_count: number;
  outstanding_amount?: number;
}

const JOB_STATUS: Record<string, { label: string; color: string; bg: string }> = {
  active:     { label: 'Active',     color: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-200' },
  pending:    { label: 'Pending',    color: 'text-amber-700',   bg: 'bg-amber-50 border-amber-200' },
  completed:  { label: 'Completed',  color: 'text-slate-600',   bg: 'bg-slate-100 border-slate-200' },
  on_hold:    { label: 'On Hold',    color: 'text-orange-700',  bg: 'bg-orange-50 border-orange-200' },
  cancelled:  { label: 'Cancelled',  color: 'text-red-600',     bg: 'bg-red-50 border-red-200' },
};

function fmtMoney(n?: number | null) {
  if (n == null) return null;
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(n);
}

function fmtDate(iso?: string) {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function PortalDashboardPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get('token') ?? sessionStorage.getItem('portalToken') ?? '';

  const [jobs, setJobs] = useState<PortalJob[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const customerName = sessionStorage.getItem('portalCustomerName') ?? '';
  const companyName = sessionStorage.getItem('portalCompanyName') ?? 'Your contractor';

  const loadJobs = useCallback(async () => {
    if (!token) { setError('No access token. Please use your invite link.'); setLoading(false); return; }
    setLoading(true);
    try {
      const res = await fetch(`/api/portal/jobs?token=${encodeURIComponent(token)}`);
      const data = await res.json() as { jobs?: PortalJob[]; error?: string };
      if (!res.ok) { setError(data.error ?? 'Failed to load'); return; }
      setJobs(data.jobs ?? []);
    } catch {
      setError('Unable to load your jobs. Please try refreshing.');
    } finally {
      setLoading(false);
    }
  }, [token]);

  useEffect(() => {
    // Migrate on first load
    fetch('/api/portal/migrate', { method: 'POST' }).catch(() => {});
    loadJobs();
  }, [loadJobs]);

  // Summary stats
  const totalOutstanding = jobs.reduce((s, j) => s + (j.outstanding_amount ?? 0), 0);
  const pendingEstimates = jobs.reduce((s, j) => s + j.pending_estimates, 0);
  const activeJobs = jobs.filter(j => j.status === 'active').length;

  function handleLogout() {
    sessionStorage.removeItem('portalToken');
    sessionStorage.removeItem('portalCustomerName');
    sessionStorage.removeItem('portalCompanyName');
    navigate('/portal/login');
  }

  return (
    <>
      <Helmet>
        <title>My Portal — IWILLBUILD</title>
        <meta name="description" content="View your jobs, estimates, and invoices in the IWILLBUILD client portal." />
        <link rel="canonical" href="https://iwillbuild.com/portal/dashboard" />
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>

      <div className="min-h-screen bg-slate-50">
        {/* Header */}
        <header className="bg-white border-b border-slate-200 sticky top-0 z-20">
          <div className="max-w-4xl mx-auto px-4 py-4 flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-orange-500 flex items-center justify-center shadow-sm">
              <Building2 size={18} className="text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-slate-800 truncate">{companyName}</p>
              {customerName && <p className="text-xs text-slate-400 truncate">{customerName}</p>}
            </div>
            <button
              onClick={handleLogout}
              className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-600 transition-colors px-3 py-1.5 rounded-lg hover:bg-slate-100"
            >
              <LogOut size={13} /> Sign out
            </button>
          </div>
        </header>

        <main className="max-w-4xl mx-auto px-4 py-8">
          {/* Welcome */}
          <div className="mb-6">
            <h1 className="text-2xl font-black text-slate-800">
              {customerName ? `Welcome back, ${customerName.split(' ')[0]}` : 'Your portal'}
            </h1>
            <p className="text-slate-500 text-sm mt-1">Here's a summary of your projects with {companyName}.</p>
          </div>

          {/* Summary cards */}
          {!loading && !error && (
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
              {[
                { label: 'Active jobs', value: String(activeJobs), icon: HardHat, color: 'text-emerald-600', bg: 'bg-emerald-50' },
                { label: 'Estimates to review', value: String(pendingEstimates), icon: FileText, color: 'text-amber-600', bg: 'bg-amber-50' },
                { label: 'Outstanding', value: totalOutstanding > 0 ? (fmtMoney(totalOutstanding) ?? '$0') : '$0', icon: DollarSign, color: 'text-orange-600', bg: 'bg-orange-50' },
              ].map(({ label, value, icon: Icon, color, bg }) => (
                <motion.div
                  key={label}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-white rounded-2xl border border-slate-200 p-5 flex items-center gap-4"
                >
                  <div className={`w-11 h-11 rounded-xl ${bg} flex items-center justify-center shrink-0`}>
                    <Icon size={20} className={color} />
                  </div>
                  <div>
                    <p className="text-xs text-slate-500">{label}</p>
                    <p className={`text-xl font-black ${color}`}>{value}</p>
                  </div>
                </motion.div>
              ))}
            </div>
          )}

          {/* Jobs list */}
          <div>
            <h2 className="text-sm font-bold text-slate-500 uppercase tracking-wider mb-3">Your Jobs</h2>

            {loading && (
              <div className="flex items-center justify-center gap-2 text-slate-400 py-16">
                <Loader2 size={20} className="animate-spin" />
                <span className="text-sm">Loading your jobs…</span>
              </div>
            )}

            {error && (
              <div className="flex items-center gap-3 bg-red-50 border border-red-200 rounded-2xl p-4 text-red-700">
                <AlertCircle size={18} />
                <p className="text-sm">{error}</p>
              </div>
            )}

            {!loading && !error && jobs.length === 0 && (
              <div className="text-center py-16 text-slate-400">
                <Briefcase size={40} className="mx-auto mb-3 text-slate-200" />
                <p className="font-semibold">No jobs yet</p>
                <p className="text-sm mt-1">Your jobs will appear here once {companyName} creates them.</p>
              </div>
            )}

            <div className="flex flex-col gap-3">
              {jobs.map((job, i) => {
                const sc = JOB_STATUS[job.status] ?? JOB_STATUS.pending;
                return (
                  <motion.div
                    key={job.id}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.04 }}
                  >
                    <Link
                      to={`/portal/jobs/${job.id}?token=${token}`}
                      className="block bg-white rounded-2xl border border-slate-200 p-5 hover:border-orange-300 hover:shadow-sm transition-all group"
                    >
                      <div className="flex items-start gap-4">
                        <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center shrink-0 group-hover:bg-orange-50 transition-colors">
                          <HardHat size={18} className="text-slate-400 group-hover:text-orange-500 transition-colors" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-1">
                            <span className="text-xs font-semibold text-slate-400">{job.job_number}</span>
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold border ${sc.bg} ${sc.color}`}>
                              {sc.label}
                            </span>
                          </div>
                          <p className="font-bold text-slate-800 truncate">{job.name}</p>
                          {job.address && <p className="text-xs text-slate-400 mt-0.5 truncate">{job.address}</p>}

                          {/* Badges */}
                          <div className="flex items-center gap-3 mt-2 flex-wrap">
                            {job.pending_estimates > 0 && (
                              <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200">
                                <Clock size={9} /> {job.pending_estimates} estimate{job.pending_estimates > 1 ? 's' : ''} to review
                              </span>
                            )}
                            {job.outstanding_amount != null && job.outstanding_amount > 0 && (
                              <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-orange-600 bg-orange-50 px-2 py-0.5 rounded-full border border-orange-200">
                                <Receipt size={9} /> {fmtMoney(job.outstanding_amount)} outstanding
                              </span>
                            )}
                            {job.approved_estimates > 0 && job.pending_estimates === 0 && (
                              <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                                <CheckCircle size={9} /> Estimate approved
                              </span>
                            )}
                          </div>
                        </div>
                        <ChevronRight size={16} className="text-slate-300 group-hover:text-orange-400 transition-colors shrink-0 mt-1" />
                      </div>
                    </Link>
                  </motion.div>
                );
              })}
            </div>
          </div>
        </main>
      </div>
    </>
  );
}
