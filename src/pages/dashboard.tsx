import { motion } from 'motion/react';
import { Helmet } from '@dr.pogodin/react-helmet';
import {
  HardHat,
  Users,
  Truck,
  Download,
  Bot,
  TrendingUp,
  AlertCircle,
  CheckCircle2,
  Clock,
  Bell,
  ChevronRight,
} from 'lucide-react';
import { Link } from 'react-router-dom';
import PortalSidebar from '@/components/PortalSidebar';

const metrics = [
  {
    label: 'Active Jobs',
    value: '14',
    sub: '3 starting this week',
    icon: HardHat,
    color: 'text-primary',
    bg: 'bg-orange-50',
  },
  {
    label: 'Crew On-Site',
    value: '87',
    sub: '12 sites staffed',
    icon: Users,
    color: 'text-blue-600',
    bg: 'bg-blue-50',
  },
  {
    label: 'Fleet Active',
    value: '23/31',
    sub: '8 in maintenance',
    icon: Truck,
    color: 'text-emerald-600',
    bg: 'bg-emerald-50',
  },
  {
    label: 'Downloads',
    value: '142',
    sub: '18 new this month',
    icon: Download,
    color: 'text-purple-600',
    bg: 'bg-purple-50',
  },
];

const recentJobs = [
  { name: 'Riverside Commercial Complex', status: 'In Progress', progress: 68, due: '14 Aug 2026' },
  { name: 'Northgate Residential Stage 2', status: 'In Progress', progress: 42, due: '22 Sep 2026' },
  { name: 'CBD Office Fitout — Level 12', status: 'On Hold', progress: 25, due: '01 Oct 2026' },
  { name: 'Warehouse Extension — Acacia Ridge', status: 'Completed', progress: 100, due: '10 Jun 2026' },
];

const statusConfig: Record<string, { color: string; icon: typeof CheckCircle2 }> = {
  'In Progress': { color: 'text-blue-600 bg-blue-50', icon: Clock },
  'On Hold': { color: 'text-amber-600 bg-amber-50', icon: AlertCircle },
  'Completed': { color: 'text-emerald-600 bg-emerald-50', icon: CheckCircle2 },
};

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.07 },
  },
} as const;

const itemVariants = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.35, ease: 'easeOut' as const } },
} as const;

export default function DashboardPage() {
  return (
    <div className="flex h-screen overflow-hidden bg-[#F4F5F7]">
      <Helmet>
        <title>Dashboard — IWILLBUILD Portal</title>
        <meta name="description" content="IWILLBUILD internal dashboard — overview of active jobs, crew on-site, fleet status, and quick access to all portal modules." />
        <link rel="canonical" href="https://iwillbuild.com.au/dashboard" />
        <meta name="robots" content="noindex" />
      </Helmet>

      <PortalSidebar />

      {/* Main content */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar */}
        <header className="h-16 bg-white border-b border-border flex items-center justify-between px-6 shrink-0">
          <div>
            <h1 className="font-heading font-bold text-lg text-foreground">Dashboard</h1>
            <p className="text-xs text-muted-foreground">Thursday, 25 June 2026</p>
          </div>
          <div className="flex items-center gap-3">
            <button className="relative p-2 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors duration-150">
              <Bell size={18} />
              <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-primary rounded-full" />
            </button>
            <div className="flex items-center gap-2 pl-3 border-l border-border">
              <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-white text-xs font-bold">
                DM
              </div>
              <div className="hidden sm:block">
                <p className="text-sm font-medium text-foreground leading-none">Darren M.</p>
                <p className="text-xs text-muted-foreground">Site Manager</p>
              </div>
            </div>
          </div>
        </header>

        {/* Scrollable content */}
        <main className="flex-1 overflow-y-auto p-6">
          {/* Metrics */}
          <motion.div
            variants={containerVariants}
            initial="hidden"
            animate="visible"
            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6"
          >
            {metrics.map((m) => (
              <motion.div
                key={m.label}
                variants={itemVariants}
                whileHover={{ y: -2, boxShadow: '0 4px 16px rgba(0,0,0,0.08)' }}
                className="bg-white rounded-lg border border-border p-5 cursor-default transition-shadow duration-150"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className={`p-2 rounded-md ${m.bg}`}>
                    <m.icon size={18} className={m.color} />
                  </div>
                  <TrendingUp size={14} className="text-muted-foreground" />
                </div>
                <p className="font-heading font-bold text-2xl text-foreground">{m.value}</p>
                <p className="text-sm font-medium text-foreground mt-0.5">{m.label}</p>
                <p className="text-xs text-muted-foreground mt-1">{m.sub}</p>
              </motion.div>
            ))}
          </motion.div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {/* Recent Jobs */}
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
              <div className="divide-y divide-border">
                {recentJobs.map((job) => {
                  const sc = statusConfig[job.status];
                  const StatusIcon = sc.icon;
                  return (
                    <div key={job.name} className="px-5 py-4">
                      <div className="flex items-start justify-between gap-3 mb-2">
                        <p className="text-sm font-medium text-foreground leading-snug">{job.name}</p>
                        <span className={`inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded-full shrink-0 ${sc.color}`}>
                          <StatusIcon size={11} />
                          {job.status}
                        </span>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${job.progress}%` }}
                            transition={{ duration: 0.8, delay: 0.3, ease: 'easeOut' as const }}
                            className={`h-full rounded-full ${job.progress === 100 ? 'bg-emerald-500' : 'bg-primary'}`}
                          />
                        </div>
                        <span className="text-xs text-muted-foreground shrink-0">{job.progress}%</span>
                        <span className="text-xs text-muted-foreground shrink-0">Due {job.due}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </motion.div>

            {/* Quick Access */}
            <motion.div
              variants={itemVariants}
              initial="hidden"
              animate="visible"
              className="bg-white rounded-lg border border-border"
            >
              <div className="px-5 py-4 border-b border-border">
                <h2 className="font-heading font-semibold text-sm text-foreground">Quick Access</h2>
              </div>
              <div className="p-4 flex flex-col gap-2">
                {[
                  { label: 'Manage Jobs', icon: HardHat, href: '/jobs', desc: '14 active sites' },
                  { label: 'Fleet Status', icon: Truck, href: '/fleet', desc: '23 vehicles active' },
                  { label: 'Downloads', icon: Download, href: '/downloads', desc: 'Plans & compliance' },
                  { label: 'Dazza AI', icon: Bot, href: '/dazza-ai', desc: 'Ask anything' },
                ].map((item) => (
                  <Link
                    key={item.href}
                    to={item.href}
                    className="flex items-center gap-3 p-3 rounded-md hover:bg-muted transition-colors duration-150 group"
                  >
                    <div className="p-2 rounded-md bg-muted group-hover:bg-primary/10 transition-colors duration-150">
                      <item.icon size={16} className="text-muted-foreground group-hover:text-primary transition-colors duration-150" />
                    </div>
                    <div>
                      <p className="text-sm font-medium text-foreground">{item.label}</p>
                      <p className="text-xs text-muted-foreground">{item.desc}</p>
                    </div>
                    <ChevronRight size={14} className="ml-auto text-muted-foreground group-hover:text-primary transition-colors duration-150" />
                  </Link>
                ))}
              </div>

              {/* Dazza AI teaser */}
              <div className="mx-4 mb-4 p-4 rounded-lg bg-[#1A1D23] text-white">
                <div className="flex items-center gap-2 mb-2">
                  <Bot size={16} className="text-primary" />
                  <span className="text-sm font-semibold">Dazza AI</span>
                </div>
                <p className="text-xs text-white/60 mb-3">Your on-site AI assistant. Ask about jobs, crew, or compliance.</p>
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
