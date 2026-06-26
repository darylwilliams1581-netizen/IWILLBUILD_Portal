import { motion } from 'motion/react';
import { useState, useEffect } from 'react';
import { Helmet } from '@dr.pogodin/react-helmet';
import {
  HardHat,
  Users,
  Truck,
  Download,
  Bot,
  Bell,
  ChevronRight,
  Plus,
  Menu,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import PortalSidebar from '@/components/PortalSidebar';
import { useSession } from '@/lib/auth/auth-client';
import { fetchJobs, type Job } from '@/lib/jobs-api';

// ─── Quick actions ────────────────────────────────────────────────────────────
const quickActions = [
  { label: 'Add a Job',       icon: HardHat,  href: '/jobs',      desc: 'Track a new site or project' },
  { label: 'Add Fleet Asset', icon: Truck,    href: '/fleet',     desc: 'Register a vehicle or plant' },
  { label: 'Invite Team',     icon: Users,    href: '/team',      desc: 'Add crew members' },
  { label: 'Ask Dazza AI',    icon: Bot,      href: '/dazza-ai',  desc: 'Your on-site AI assistant' },
];

// ─── Animation variants ───────────────────────────────────────────────────────
const containerVariants = {
  hidden: { opacity: 0 },
  visible: { opacity: 1, transition: { staggerChildren: 0.07 } },
} as const;

const itemVariants = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.35, ease: 'easeOut' as const } },
} as const;

// ─── Component ────────────────────────────────────────────────────────────────
export default function DashboardPage() {
  const { user } = useSession();
  const [jobs, setJobs] = useState<Job[]>([]);
  const [jobsLoaded, setJobsLoaded] = useState(false);

  useEffect(() => {
    fetchJobs()
      .then((data) => { setJobs(data); setJobsLoaded(true); })
      .catch(() => setJobsLoaded(true));
  }, []);

  const activeJobCount = jobs.filter((j) =>
    ['New', 'Quoting', 'Submitted', 'Awaiting Approval', 'Works Approved', 'Ready to Start', 'Works in Progress'].includes(j.status)
  ).length;

  const recentJobs = jobs.slice(0, 5);

  const initials = user?.name
    ? user.name.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase()
    : (user?.email?.[0] ?? '?').toUpperCase();

  const displayName = user?.name
    ? user.name.split(' ')[0] + (user.name.split(' ')[1] ? ' ' + user.name.split(' ')[1][0] + '.' : '')
    : 'User';

  const today = new Date().toLocaleDateString('en-AU', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  function openMobileMenu() {
    window.dispatchEvent(new Event('portal:open-menu'));
  }

  return (
    <div className="flex h-screen overflow-hidden bg-[#F4F5F7]">
      <Helmet>
        <title>Dashboard — IWILLBUILD Portal</title>
        <meta name="description" content="IWILLBUILD internal dashboard — overview of active jobs, crew, fleet, and quick access to all portal modules." />
        <link rel="canonical" href="https://iwillbuild.com/dashboard" />
        <meta name="robots" content="noindex" />
      </Helmet>

      <PortalSidebar />

      {/* ── Main content ── */}
      <div className="flex-1 flex flex-col overflow-hidden min-w-0">

        {/* Top bar */}
        <header className="h-16 bg-white border-b border-border flex items-center justify-between px-4 md:px-6 shrink-0">
          <div className="flex items-center gap-3">
            {/* Hamburger — mobile only */}
            <button
              onClick={openMobileMenu}
              className="md:hidden p-2 -ml-1 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors duration-150"
              aria-label="Open menu"
            >
              <Menu size={20} />
            </button>
            <div>
              <h1 className="font-heading font-bold text-base md:text-lg text-foreground leading-tight">Dashboard</h1>
              <p className="text-xs text-muted-foreground hidden sm:block">{today}</p>
            </div>
          </div>

          <div className="flex items-center gap-2 md:gap-3">
            <button className="relative p-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors duration-150">
              <Bell size={18} />
            </button>
            <div className="flex items-center gap-2 pl-2 md:pl-3 border-l border-border">
              <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-white text-xs font-bold shrink-0">
                {initials}
              </div>
              <div className="hidden sm:block">
                <p className="text-sm font-medium text-foreground leading-none">{displayName}</p>
                <p className="text-xs text-muted-foreground truncate max-w-[140px]">{user?.email ?? ''}</p>
              </div>
            </div>
          </div>
        </header>

        {/* Scrollable content */}
        <main className="flex-1 overflow-y-auto p-4 md:p-6">

          {/* ── Welcome banner (empty state) ── */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: 'easeOut' as const }}
            className="mb-6 rounded-xl bg-[#1A1D23] text-white px-5 py-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4"
          >
            <div>
              <p className="text-xs font-semibold text-primary uppercase tracking-wider mb-1">Getting started</p>
              <h2 className="font-heading font-bold text-lg leading-snug">
                Welcome{user?.name ? `, ${user.name.split(' ')[0]}` : ''}. Your portal is ready.
              </h2>
              <p className="text-sm text-white/50 mt-1">
                Add your first job, fleet asset, or team member to get started.
              </p>
            </div>
            <Link
              to="/jobs"
              className="inline-flex items-center gap-2 bg-primary hover:bg-orange-600 text-white text-sm font-semibold px-4 py-2.5 rounded-lg transition-colors duration-150 shrink-0"
            >
              <Plus size={15} />
              Add First Job
            </Link>
          </motion.div>

          {/* ── Metric cards ── */}
          <motion.div
            variants={containerVariants}
            initial="hidden"
            animate="visible"
            className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 mb-6"
          >
            {[
              {
                label: 'Active Jobs',
                value: jobsLoaded ? String(activeJobCount) : '—',
                sub: activeJobCount === 0 ? 'No jobs added yet' : `${activeJobCount} in progress`,
                icon: HardHat,
                color: 'text-primary',
                bg: 'bg-orange-50',
                href: '/jobs',
                cta: activeJobCount === 0 ? 'Add first job' : 'View jobs',
              },
              {
                label: 'Crew On-Site',
                value: '0',
                sub: 'No crew assigned',
                icon: Users,
                color: 'text-blue-600',
                bg: 'bg-blue-50',
                href: '/team',
                cta: 'Add team members',
              },
              {
                label: 'Fleet Active',
                value: '0',
                sub: 'No vehicles added',
                icon: Truck,
                color: 'text-emerald-600',
                bg: 'bg-emerald-50',
                href: '/fleet',
                cta: 'Add fleet asset',
              },
              {
                label: 'Downloads',
                value: '0',
                sub: 'No files uploaded',
                icon: Download,
                color: 'text-purple-600',
                bg: 'bg-purple-50',
                href: '/downloads',
                cta: 'Upload a file',
              },
            ].map((m) => (
              <motion.div
                key={m.label}
                variants={itemVariants}
                whileHover={{ y: -2, boxShadow: '0 4px 16px rgba(0,0,0,0.08)' }}
                className="bg-white rounded-lg border border-border p-4 md:p-5 cursor-default"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className={`p-2 rounded-md ${m.bg}`}>
                    <m.icon size={16} className={m.color} />
                  </div>
                </div>
                <p className="font-heading font-bold text-2xl text-foreground">{m.value}</p>
                <p className="text-sm font-medium text-foreground mt-0.5">{m.label}</p>
                <p className="text-xs text-muted-foreground mt-1 mb-3">{m.sub}</p>
                <Link
                  to={m.href}
                  className="inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
                >
                  {m.cta} <ChevronRight size={11} />
                </Link>
              </motion.div>
            ))}
          </motion.div>

          {/* ── Bottom panels ── */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">

            {/* Recent Jobs — real data */}
            <motion.div
              variants={itemVariants}
              initial="hidden"
              animate="visible"
              className="lg:col-span-2 bg-white rounded-lg border border-border"
            >
              <div className="flex items-center justify-between px-5 py-4 border-b border-border">
                <h2 className="font-heading font-semibold text-sm text-foreground">Recent Jobs</h2>
                <Link
                  to="/jobs"
                  className="text-xs text-primary font-medium flex items-center gap-1 hover:underline"
                >
                  View all <ChevronRight size={12} />
                </Link>
              </div>

              {!jobsLoaded ? (
                <div className="flex items-center justify-center py-12">
                  <div className="w-5 h-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                </div>
              ) : recentJobs.length === 0 ? (
                /* Empty state */
                <div className="flex flex-col items-center justify-center py-14 px-6 text-center">
                  <div className="w-12 h-12 rounded-xl bg-orange-50 flex items-center justify-center mb-4">
                    <HardHat size={22} className="text-primary" />
                  </div>
                  <p className="text-sm font-semibold text-foreground mb-1">No jobs yet</p>
                  <p className="text-xs text-muted-foreground mb-5 max-w-xs">
                    Once you add jobs they'll appear here with status.
                  </p>
                  <Link
                    to="/jobs"
                    className="inline-flex items-center gap-2 bg-primary hover:bg-orange-600 text-white text-xs font-semibold px-4 py-2 rounded-lg transition-colors duration-150"
                  >
                    <Plus size={13} />
                    Add First Job
                  </Link>
                </div>
              ) : (
                /* Real jobs list */
                <div className="divide-y divide-border">
                  {recentJobs.map((job) => (
                    <Link
                      key={job.id}
                      to={`/jobs/${job.id}`}
                      className="flex items-center justify-between px-5 py-3.5 hover:bg-muted/50 transition-colors group"
                    >
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-foreground truncate">{job.name}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {job.jobNumber && <span className="font-mono mr-2">{job.jobNumber}</span>}
                          {job.client ?? 'No client'}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0 ml-3">
                        <span className="text-xs font-semibold text-muted-foreground hidden sm:block">{job.status}</span>
                        <ChevronRight size={14} className="text-muted-foreground group-hover:text-primary transition-colors" />
                      </div>
                    </Link>
                  ))}
                </div>
              )}
            </motion.div>

            {/* Quick Actions */}
            <motion.div
              variants={itemVariants}
              initial="hidden"
              animate="visible"
              className="bg-white rounded-lg border border-border"
            >
              <div className="px-5 py-4 border-b border-border">
                <h2 className="font-heading font-semibold text-sm text-foreground">Quick Actions</h2>
              </div>
              <div className="p-4 flex flex-col gap-2">
                {quickActions.map((item) => (
                  <Link
                    key={item.href}
                    to={item.href}
                    className="flex items-center gap-3 p-3 rounded-md hover:bg-muted transition-colors duration-150 group"
                  >
                    <div className="p-2 rounded-md bg-muted group-hover:bg-primary/10 transition-colors duration-150 shrink-0">
                      <item.icon size={15} className="text-muted-foreground group-hover:text-primary transition-colors duration-150" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground">{item.label}</p>
                      <p className="text-xs text-muted-foreground truncate">{item.desc}</p>
                    </div>
                    <ChevronRight size={14} className="ml-auto text-muted-foreground group-hover:text-primary transition-colors duration-150 shrink-0" />
                  </Link>
                ))}
              </div>

              {/* Dazza AI teaser */}
              <div className="mx-4 mb-4 p-4 rounded-lg bg-[#1A1D23] text-white">
                <div className="flex items-center gap-2 mb-2">
                  <Bot size={16} className="text-primary" />
                  <span className="text-sm font-semibold">Dazza AI</span>
                </div>
                <p className="text-xs text-white/60 mb-3">
                  Your on-site AI assistant. Ask about jobs, crew, or compliance.
                </p>
                <Link
                  to="/dazza-ai"
                  className="inline-flex items-center gap-1.5 text-xs font-semibold text-primary hover:underline"
                >
                  Open Dazza <ChevronRight size={12} />
                </Link>
              </div>
            </motion.div>
          </div>
        </main>
      </div>
    </div>
  );
}
