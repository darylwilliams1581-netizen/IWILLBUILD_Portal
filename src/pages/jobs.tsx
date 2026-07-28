import { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { Helmet } from '@dr.pogodin/react-helmet';
import {
  HardHat,
  Plus,
  Search,
  MapPin,
  ChevronRight,
  Loader2,
  AlertCircle,
  UserCheck,
  ArrowLeft,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';

import PortalErrorBoundary from '@/components/PortalErrorBoundary';
import NewJobModal from '@/components/NewJobModal';
import DesktopTopBar from '@/components/DesktopTopBar';
import DesktopDock from '@/components/DesktopDock';
import { fetchJobs, getStatusStyle, type Job } from '@/lib/jobs-api';
import { fetchCustomers, type Customer } from '@/lib/customers-api';
import { useViewOnly } from '@/components/ViewOnlyGuard';
import { useTerminology } from '@/lib/useTerminology';

const fadeUp = {
  hidden: { opacity: 0, y: 10 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.25, ease: 'easeOut' as const } },
} as const;

const stagger = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.05 } },
} as const;

export default function JobsPage() {
  const navigate = useNavigate();
  const { workSingular, workPlural, addWorkLabel } = useTerminology();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState('All');
  const [customerFilter, setCustomerFilter] = useState<number | null>(null);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [showNewJob, setShowNewJob] = useState(false);
  const { isViewOnly } = useViewOnly();

  useEffect(() => {
    loadJobs();
    // Load customers for filter dropdown (non-blocking)
    fetchCustomers('active').then(setCustomers).catch(() => {});
  }, []);

  async function loadJobs() {
    setLoading(true);
    setError('');
    try {
      const data = await fetchJobs();
      setJobs(data);
    } catch {
      setError('Failed to load jobs. Please refresh.');
    } finally {
      setLoading(false);
    }
  }

  function handleCreated(job: Job) {
    setJobs((prev) => [job, ...prev]);
    setShowNewJob(false);
    navigate(`/jobs/${job.id}`);
  }

  /** Navigate to job on plain left-click; open new tab on ctrl/cmd/middle-click. */
  function handleJobClick(path: string, e: React.MouseEvent) {
    // Middle-click or modifier key → let browser open new tab natively
    if (e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
    e.preventDefault();
    navigate(path);
  }

  const filtered = jobs.filter((j) => {
    const matchesFilter = activeFilter === 'All' || j.status === activeFilter;
    const matchesCustomer = !customerFilter || j.customerId === customerFilter;
    const q = search.toLowerCase();
    const matchesSearch =
      !q ||
      j.name.toLowerCase().includes(q) ||
      (j.client ?? '').toLowerCase().includes(q) ||
      (j.address ?? '').toLowerCase().includes(q) ||
      (j.jobNumber ?? '').toLowerCase().includes(q);
    return matchesFilter && matchesSearch && matchesCustomer;
  });

  // Summary counts
  const counts = {
    active: jobs.filter((j) => j.status === 'Works in Progress').length,
    quoting: jobs.filter((j) => ['Quoting', 'Submitted', 'Awaiting Approval'].includes(j.status)).length,
    onHold: jobs.filter((j) => j.status === 'On Hold').length,
    completed: jobs.filter((j) => ['Completed', 'Closed'].includes(j.status)).length,
  };

  return (
    <div className="min-h-screen bg-[#f5f6f8] flex flex-col md:pt-[112px]">
      <DesktopTopBar />
      <DesktopDock />
      <Helmet>
        <title>Jobs — IWILLBUILD Portal</title>
        <meta name="description" content="Manage and track all construction jobs — schedules, crews, attendance, forms and files in one place." />
        <link rel="canonical" href="https://iwillbuild.com/jobs" />
        <meta name="robots" content="noindex" />
        <meta property="og:title" content="Jobs — IWILLBUILD Portal" />
        <meta property="og:description" content="Manage and track all construction jobs — schedules, crews, attendance, forms and files in one place." />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://iwillbuild.com/jobs" />
        <meta property="og:image" content="https://iwillbuild.com/airo-assets/images/pages/home/og-image" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="Jobs — IWILLBUILD Portal" />
        <meta name="twitter:description" content="Manage and track all construction jobs — schedules, crews, attendance, forms and files in one place." />
        <meta name="twitter:image" content="https://iwillbuild.com/airo-assets/images/pages/home/og-image" />
      </Helmet>

      <NewJobModal open={showNewJob} onClose={() => setShowNewJob(false)} onCreated={handleCreated} />

      <PortalErrorBoundary inline>
      <div className="flex flex-col flex-1 min-h-0">
        {/* ── Mobile header ── */}
        <header className="md:hidden h-14 bg-white border-b border-gray-200 flex items-center justify-between px-4 shrink-0 sticky top-0 z-30 safe-top">
          <div className="flex items-center gap-2">
            <button onClick={() => navigate('/home')} className="p-1.5 -ml-1 rounded text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors" aria-label="Back">
              <ArrowLeft size={18} />
            </button>
            <HardHat size={16} className="text-primary shrink-0" />
            <h1 className="font-heading font-bold text-base text-gray-900">{workPlural}</h1>
            {!loading && <span className="text-xs bg-gray-100 text-gray-500 font-semibold px-1.5 py-0.5 rounded-full">{jobs.length}</span>}
          </div>
          <div className="flex items-center gap-2">
            <button onClick={() => !isViewOnly && setShowNewJob(true)} disabled={isViewOnly} title={isViewOnly ? 'Subscribe to continue' : undefined}
              className="flex items-center gap-1.5 bg-primary hover:bg-violet-700 text-white text-xs font-bold px-3 py-1.5 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
              <Plus size={13} />{addWorkLabel}
            </button>
          </div>
        </header>

        {/* ── Desktop op-page-header ── */}
        <header className="op-page-header hidden md:flex sticky top-0 z-30">
          <button onClick={() => navigate('/home')} className="p-1 -ml-0.5 rounded text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors shrink-0" aria-label="Back">
            <ArrowLeft size={15} />
          </button>
          <HardHat size={14} className="text-primary shrink-0" />
          <span className="op-page-title flex-1 min-w-0">{workPlural}</span>
          {!loading && <span className="text-[11px] bg-gray-100 text-gray-500 font-semibold px-1.5 py-0.5 rounded">{jobs.length}</span>}
          <div className="ml-auto flex items-center gap-2">
            <button onClick={() => !isViewOnly && setShowNewJob(true)} disabled={isViewOnly} title={isViewOnly ? 'Subscribe to continue' : undefined}
              className="op-btn op-btn-primary disabled:opacity-50 disabled:cursor-not-allowed">
              <Plus size={12} />{addWorkLabel}
            </button>
          </div>
        </header>

        {/* ── Desktop toolbar: stats + search + filters ── */}
        {!loading && jobs.length > 0 && (
          <div className="hidden md:flex op-toolbar">
            {[
              { label: 'In Progress', count: counts.active,    color: 'text-emerald-700' },
              { label: 'Quoting',     count: counts.quoting,   color: 'text-amber-700' },
              { label: 'On Hold',     count: counts.onHold,    color: 'text-violet-800' },
              { label: 'Completed',   count: counts.completed, color: 'text-blue-700' },
            ].map((s) => (
              <span key={s.label} className="flex items-center gap-1 text-[12px] text-gray-500 pr-3 border-r border-gray-200 last:border-0">
                <span className={`font-black text-sm ${s.color}`}>{s.count}</span>{s.label}
              </span>
            ))}
            <div className="flex-1" />
            <div className="relative">
              <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              <input type="text" placeholder="Search…" value={search} onChange={(e) => setSearch(e.target.value)} className="op-toolbar-search pl-7 w-52" />
            </div>
            {customers.length > 0 && (
              <select value={customerFilter ?? ''} onChange={(e) => setCustomerFilter(e.target.value ? Number(e.target.value) : null)}
                className="op-toolbar-search appearance-none cursor-pointer pr-2 w-36">
                <option value="">All customers</option>
                {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            )}
            <div className="flex gap-1">
              {['All', 'Works in Progress', 'Quoting', 'On Hold', 'Completed'].map((f) => (
                <button key={f} onClick={() => setActiveFilter(f)} className={`op-filter-pill ${activeFilter === f ? 'active' : ''}`}>
                  {f === 'Works in Progress' ? 'In Progress' : f}
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="flex-1 overflow-y-auto p-3 md:p-4 flex flex-col gap-3">

          {/* Mobile summary cards */}
          {!loading && jobs.length > 0 && (
            <div className="md:hidden grid grid-cols-2 gap-2">
              {[
                { label: 'In Progress', count: counts.active,    color: 'text-emerald-600', bg: 'bg-emerald-50' },
                { label: 'Quoting',     count: counts.quoting,   color: 'text-amber-600',   bg: 'bg-amber-50' },
                { label: 'On Hold',     count: counts.onHold,    color: 'text-violet-700',  bg: 'bg-violet-50' },
                { label: 'Completed',   count: counts.completed, color: 'text-blue-600',    bg: 'bg-blue-50' },
              ].map((s) => (
                <div key={s.label} className={`${s.bg} rounded-lg px-3 py-2 border border-white flex items-center gap-2`}>
                  <div className={`text-xl font-black ${s.color}`}>{s.count}</div>
                  <div className="text-xs font-semibold text-muted-foreground">{s.label}</div>
                </div>
              ))}
            </div>
          )}

          {/* Mobile search + filter */}
          <div className="md:hidden flex flex-col gap-2">
            <div className="relative">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input type="text" placeholder="Search jobs, clients, locations…" value={search} onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-4 py-2.5 bg-white border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors" />
            </div>
            {customers.length > 0 && (
              <div className="relative">
                <UserCheck size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                <select value={customerFilter ?? ''} onChange={(e) => setCustomerFilter(e.target.value ? Number(e.target.value) : null)}
                  className="w-full pl-8 pr-8 py-2.5 bg-white border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors appearance-none cursor-pointer">
                  <option value="">All customers</option>
                  {customers.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
            )}
            <div className="scroll-x-hide flex gap-1.5 pb-0.5">
              {['All', 'Works in Progress', 'Quoting', 'On Hold', 'Completed'].map((f) => (
                <button key={f} onClick={() => setActiveFilter(f)}
                  className={`text-xs font-bold px-3 py-1.5 rounded-full border transition-colors whitespace-nowrap ${activeFilter === f ? 'bg-primary text-white border-primary' : 'bg-white text-muted-foreground border-border hover:border-primary hover:text-primary'}`}>
                  {f === 'Works in Progress' ? 'In Progress' : f}
                </button>
              ))}
            </div>
          </div>

          {/* Loading */}
          {loading && (
            <div className="flex items-center justify-center py-20">
              <Loader2 size={24} className="animate-spin text-primary" />
            </div>
          )}

          {/* Error */}
          {error && (
            <div className="flex items-center gap-3 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-700">
              <AlertCircle size={16} className="shrink-0" />
              {error}
              <button onClick={loadJobs} className="ml-auto font-semibold underline">Retry</button>
            </div>
          )}

          {/* Empty state */}
          {!loading && !error && jobs.length === 0 && (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <div className="w-14 h-14 rounded-xl bg-violet-50 flex items-center justify-center mb-4">
                <HardHat size={26} className="text-primary" />
              </div>
              <p className="font-heading font-bold text-base text-foreground mb-1">No {workPlural.toLowerCase()} yet</p>
              <p className="text-sm text-muted-foreground mb-6 max-w-xs">
                Create your first {workSingular.toLowerCase()} to start tracking work, crew, and progress.
              </p>
              <button onClick={() => !isViewOnly && setShowNewJob(true)} disabled={isViewOnly} title={isViewOnly ? 'Subscribe to continue' : undefined}
                className="inline-flex items-center gap-2 bg-primary hover:bg-violet-700 text-white text-sm font-bold px-5 py-2.5 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed">
                <Plus size={15} />{addWorkLabel}
              </button>
            </div>
          )}

          {/* No results from filter/search */}
          {!loading && !error && jobs.length > 0 && filtered.length === 0 && (
            <div className="text-center py-12 text-muted-foreground text-sm">
              No {workPlural.toLowerCase()} match your search or filter.
            </div>
          )}

          {/* Job list */}
          {!loading && filtered.length > 0 && (
            <motion.div
              variants={stagger}
              initial="hidden"
              animate="visible"
              className="bg-white border border-gray-200 rounded-md overflow-hidden"
            >
              {filtered.map((job, idx) => {
                const s = getStatusStyle(job.status);
                return (
                  <motion.div key={job.id} variants={fadeUp}>
                    <a
                      href={`/jobs/${job.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => handleJobClick(`/jobs/${job.id}`, e)}
                      className={`block hover:bg-gray-50 transition-colors duration-100 group ${idx > 0 ? 'border-t border-gray-100' : ''}`}
                      style={{ WebkitTapHighlightColor: 'transparent' } as React.CSSProperties}
                    >
                      <div className="flex items-center gap-3 px-4 py-3 md:py-1.5 min-h-[44px] md:min-h-0">
                        <span className={`w-2 h-2 rounded-full shrink-0 ${s.dot}`} aria-hidden="true" />
                        <div className="flex items-center gap-2 min-w-0 flex-1 md:flex-none md:w-56 lg:w-72">
                          <h2 className="font-semibold text-sm text-gray-900 truncate leading-snug">{job.name}</h2>
                          {job.jobNumber && <span className="text-[11px] font-mono text-gray-400 shrink-0 hidden sm:inline">{job.jobNumber}</span>}
                        </div>
                        <span className={`hidden md:inline-flex items-center text-[11px] font-semibold shrink-0 w-28 ${s.color}`}>{job.status}</span>
                        {job.client && <span className="hidden md:block text-[12px] text-gray-500 truncate flex-1 min-w-0 max-w-[140px]">{job.client}</span>}
                        {job.address && (
                          <span className="hidden lg:flex items-center gap-1 text-[11px] text-gray-400 truncate flex-1 min-w-0 max-w-[180px]">
                            <MapPin size={9} className="shrink-0" />{job.address}
                          </span>
                        )}
                        {job.notes && <span className="hidden xl:block text-[11px] text-gray-400 truncate flex-1 min-w-0 italic">{job.notes}</span>}
                        {/* Mobile: status + client below name */}
                        <div className="flex-1 min-w-0 md:hidden">
                          <div className="flex items-center gap-1.5 text-xs text-muted-foreground flex-wrap mt-0.5">
                            <span className={`font-semibold ${s.color}`}>{job.status}</span>
                            {job.client && <><span className="text-border">·</span><span className="truncate max-w-[100px]">{job.client}</span></>}
                          </div>
                        </div>
                        <ChevronRight size={13} className="text-gray-300 group-hover:text-primary transition-colors shrink-0 ml-auto" />
                      </div>
                    </a>
                  </motion.div>
                );
              })}
            </motion.div>
          )}
        </div>
      </div>
      </PortalErrorBoundary>
    </div>
  );
}
