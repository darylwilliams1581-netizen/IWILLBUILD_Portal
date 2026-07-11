import { useState, useEffect } from 'react';
import { motion } from 'motion/react';
import { Helmet } from '@dr.pogodin/react-helmet';
import {
  HardHat,
  Plus,
  Search,
  MapPin,
  ChevronRight,
  Menu,
  Loader2,
  AlertCircle,
  UserCheck,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import FleetHeaderIcon from '@/components/FleetHeaderIcon';
import PortalSidebar from '@/components/PortalSidebar';
import PortalErrorBoundary from '@/components/PortalErrorBoundary';
import NewJobModal from '@/components/NewJobModal';
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

  function openMobileMenu() {
    window.dispatchEvent(new Event('portal:open-menu'));
  }

  return (
    <div className="portal-page">
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

      <PortalSidebar />
      <NewJobModal open={showNewJob} onClose={() => setShowNewJob(false)} onCreated={handleCreated} />

      <PortalErrorBoundary inline>
      <div className="portal-main">
        {/* Top bar */}
        <header className="h-16 bg-white border-b border-border flex items-center justify-between px-4 md:px-6 shrink-0">
          <div className="flex items-center gap-3">
            <button
              onClick={openMobileMenu}
              className="md:hidden p-2 -ml-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
            >
              <Menu size={20} />
            </button>
            <HardHat size={18} className="text-primary shrink-0" />
            <h1 className="font-heading font-bold text-base md:text-lg">{workPlural}</h1>
            {!loading && (
              <span className="text-xs bg-muted text-muted-foreground font-semibold px-2 py-0.5 rounded-full">
                {jobs.length}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <FleetHeaderIcon />
            <button
              onClick={() => !isViewOnly && setShowNewJob(true)}
              disabled={isViewOnly}
              title={isViewOnly ? 'Subscribe to continue' : undefined}
              className="flex items-center gap-2 bg-primary hover:bg-orange-600 text-white text-sm font-bold px-3 md:px-4 py-2 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Plus size={15} />
              <span className="hidden sm:inline">{addWorkLabel}</span>
            </button>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-4 md:p-6 flex flex-col gap-4">

          {/* Summary cards */}
          {!loading && jobs.length > 0 && (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { label: 'In Progress', count: counts.active,    color: 'text-emerald-600', bg: 'bg-emerald-50' },
                { label: 'Quoting',     count: counts.quoting,   color: 'text-amber-600',   bg: 'bg-amber-50' },
                { label: 'On Hold',     count: counts.onHold,    color: 'text-orange-600',  bg: 'bg-orange-50' },
                { label: 'Completed',   count: counts.completed, color: 'text-blue-600',    bg: 'bg-blue-50' },
              ].map((s) => (
                <div key={s.label} className={`${s.bg} rounded-lg p-4 border border-white`}>
                  <div className={`text-2xl font-black ${s.color}`}>{s.count}</div>
                  <div className="text-xs font-semibold text-muted-foreground mt-0.5">{s.label}</div>
                </div>
              ))}
            </div>
          )}

          {/* Search + filter */}
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
              <input
                type="text"
                placeholder="Search jobs, clients, locations…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full pl-9 pr-4 py-2.5 bg-white border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors"
              />
            </div>
            {customers.length > 0 && (
              <div className="relative">
                <UserCheck size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground pointer-events-none" />
                <select
                  value={customerFilter ?? ''}
                  onChange={(e) => setCustomerFilter(e.target.value ? Number(e.target.value) : null)}
                  className="pl-8 pr-8 py-2.5 bg-white border border-border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors appearance-none cursor-pointer"
                >
                  <option value="">All customers</option>
                  {customers.map((c) => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
              </div>
            )}
            <div className="scroll-x-hide flex gap-1.5 pb-0.5">
              {['All', 'Works in Progress', 'Quoting', 'On Hold', 'Completed'].map((f) => (
                <button
                  key={f}
                  onClick={() => setActiveFilter(f)}
                  className={`text-xs font-bold px-3 py-1.5 rounded-full border transition-colors whitespace-nowrap ${
                    activeFilter === f
                      ? 'bg-primary text-white border-primary'
                      : 'bg-white text-muted-foreground border-border hover:border-primary hover:text-primary'
                  }`}
                >
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
              <div className="w-14 h-14 rounded-xl bg-orange-50 flex items-center justify-center mb-4">
                <HardHat size={26} className="text-primary" />
              </div>
              <p className="font-heading font-bold text-base text-foreground mb-1">No {workPlural.toLowerCase()} yet</p>
              <p className="text-sm text-muted-foreground mb-6 max-w-xs">
                Create your first {workSingular.toLowerCase()} to start tracking work, crew, and progress.
              </p>
              <button
                onClick={() => !isViewOnly && setShowNewJob(true)}
                disabled={isViewOnly}
                title={isViewOnly ? 'Subscribe to continue' : undefined}
                className="inline-flex items-center gap-2 bg-primary hover:bg-orange-600 text-white text-sm font-bold px-5 py-2.5 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Plus size={15} />
                {addWorkLabel}
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
            <motion.div variants={stagger} initial="hidden" animate="visible" className="flex flex-col gap-2">
              {filtered.map((job) => {
                const s = getStatusStyle(job.status);
                return (
                  <motion.div key={job.id} variants={fadeUp}>
                    <a
                      href={`/jobs/${job.id}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => handleJobClick(`/jobs/${job.id}`, e)}
                      className="block bg-white border border-border rounded-xl hover:border-primary/40 hover:shadow-sm transition-all duration-150 group"
                      style={{ WebkitTapHighlightColor: 'transparent' } as React.CSSProperties}
                    >
                      {/* Main row — min 64px touch target on mobile */}
                      <div className="flex items-center gap-3 px-4 py-4 min-h-[64px]">
                        {/* Status dot */}
                        <span className={`w-2.5 h-2.5 rounded-full shrink-0 ${s.dot}`} aria-hidden="true" />

                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap mb-0.5">
                            <h2 className="font-bold text-sm text-foreground truncate">{job.name}</h2>
                            {job.jobNumber && (
                              <span className="text-xs font-mono text-muted-foreground shrink-0">{job.jobNumber}</span>
                            )}
                          </div>
                          <div className="flex items-center gap-2 text-xs text-muted-foreground flex-wrap">
                            <span className={`inline-flex items-center gap-1 font-semibold ${s.color}`}>
                              {job.status}
                            </span>
                            {job.client && (
                              <>
                                <span className="text-border">·</span>
                                <span className="truncate max-w-[120px]">{job.client}</span>
                              </>
                            )}
                            {job.address && (
                              <>
                                <span className="text-border hidden sm:inline">·</span>
                                <span className="hidden sm:flex items-center gap-1 truncate max-w-[160px]">
                                  <MapPin size={10} />{job.address}
                                </span>
                              </>
                            )}
                          </div>
                        </div>

                        <ChevronRight size={18} className="text-muted-foreground group-hover:text-primary transition-colors shrink-0" />
                      </div>

                      {/* Notes preview — only if present */}
                      {job.notes && (
                        <p className="px-4 pb-3 text-xs text-muted-foreground line-clamp-1 border-t border-border pt-2 -mt-1">
                          {job.notes}
                        </p>
                      )}
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
