import { useState } from 'react';
import { motion } from 'motion/react';
import { Helmet } from '@dr.pogodin/react-helmet';
import {
  HardHat,
  Plus,
  Search,
  Filter,
  MapPin,
  Calendar,
  ChevronRight,
  Clock,
  CheckCircle2,
  AlertCircle,
  Circle,
  DollarSign,
  Users,
  FileText,
  Camera,
} from 'lucide-react';
import PortalSidebar from '@/components/PortalSidebar';

type JobStatus = 'active' | 'pending' | 'completed' | 'on-hold';

interface Job {
  id: string;
  name: string;
  client: string;
  location: string;
  status: JobStatus;
  progress: number;
  value: string;
  startDate: string;
  dueDate: string;
  crew: number;
  forms: number;
  photos: number;
  notes: string;
}

const jobs: Job[] = [
  {
    id: 'JOB-001',
    name: 'Riverside Residential Build',
    client: 'M. Thompson',
    location: 'Bulimba, QLD',
    status: 'active',
    progress: 68,
    value: '$420,000',
    startDate: '12 Mar 2026',
    dueDate: '15 Sep 2026',
    crew: 6,
    forms: 14,
    photos: 87,
    notes: 'Frame complete. Roofing starts Monday.',
  },
  {
    id: 'JOB-002',
    name: 'Commercial Fitout — Level 3',
    client: 'Apex Property Group',
    location: 'Brisbane CBD, QLD',
    status: 'active',
    progress: 42,
    value: '$185,000',
    startDate: '01 Apr 2026',
    dueDate: '30 Jul 2026',
    crew: 4,
    forms: 8,
    photos: 43,
    notes: 'Electrical rough-in underway. Plumbing next week.',
  },
  {
    id: 'JOB-003',
    name: 'Deck & Pergola — Carindale',
    client: 'S. & J. Nguyen',
    location: 'Carindale, QLD',
    status: 'active',
    progress: 85,
    value: '$38,500',
    startDate: '10 May 2026',
    dueDate: '05 Jul 2026',
    crew: 2,
    forms: 5,
    photos: 31,
    notes: 'Decking boards down. Pergola posts set.',
  },
  {
    id: 'JOB-004',
    name: 'Warehouse Extension — Hemmant',
    client: 'Coastal Logistics Pty Ltd',
    location: 'Hemmant, QLD',
    status: 'pending',
    progress: 0,
    value: '$290,000',
    startDate: '14 Jul 2026',
    dueDate: '20 Dec 2026',
    crew: 0,
    forms: 1,
    photos: 0,
    notes: 'Estimate approved. Awaiting DA approval.',
  },
  {
    id: 'JOB-005',
    name: 'Bathroom Reno — Ascot',
    client: 'P. Hartley',
    location: 'Ascot, QLD',
    status: 'completed',
    progress: 100,
    value: '$22,000',
    startDate: '03 Feb 2026',
    dueDate: '28 Feb 2026',
    crew: 2,
    forms: 6,
    photos: 54,
    notes: 'Signed off 28 Feb. Final invoice paid.',
  },
  {
    id: 'JOB-006',
    name: 'Retaining Wall — Kenmore',
    client: 'D. & L. Payne',
    location: 'Kenmore, QLD',
    status: 'on-hold',
    progress: 20,
    value: '$14,800',
    startDate: '22 Apr 2026',
    dueDate: '10 Jun 2026',
    crew: 0,
    forms: 2,
    photos: 9,
    notes: 'On hold — neighbour dispute. Awaiting council mediation.',
  },
];

const statusConfig: Record<JobStatus, { label: string; color: string; bg: string; icon: typeof Circle }> = {
  active:    { label: 'Active',     color: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-200',   icon: CheckCircle2 },
  pending:   { label: 'Pending',    color: 'text-amber-700',   bg: 'bg-amber-50 border-amber-200',       icon: Clock },
  completed: { label: 'Completed',  color: 'text-blue-700',    bg: 'bg-blue-50 border-blue-200',         icon: CheckCircle2 },
  'on-hold': { label: 'On Hold',    color: 'text-red-700',     bg: 'bg-red-50 border-red-200',           icon: AlertCircle },
};

const filters: { label: string; value: JobStatus | 'all' }[] = [
  { label: 'All Jobs', value: 'all' },
  { label: 'Active', value: 'active' },
  { label: 'Pending', value: 'pending' },
  { label: 'On Hold', value: 'on-hold' },
  { label: 'Completed', value: 'completed' },
];

const fadeUp = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.3, ease: 'easeOut' as const } },
} as const;

const stagger = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.06 } },
} as const;

export default function JobsPage() {
  const [search, setSearch] = useState('');
  const [activeFilter, setActiveFilter] = useState<JobStatus | 'all'>('all');
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);

  const filtered = jobs.filter((j) => {
    const matchesFilter = activeFilter === 'all' || j.status === activeFilter;
    const matchesSearch =
      j.name.toLowerCase().includes(search.toLowerCase()) ||
      j.client.toLowerCase().includes(search.toLowerCase()) ||
      j.location.toLowerCase().includes(search.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  return (
    <div className="flex h-screen bg-slate-100 overflow-hidden">
      <Helmet>
        <title>Jobs — IWILLBUILD Portal</title>
        <meta name="description" content="Manage and track all construction jobs in the IWILLBUILD portal." />
        <link rel="canonical" href="https://iwillbuild.com/jobs" />
        <meta name="robots" content="noindex" />
      </Helmet>

      <PortalSidebar />

      <div className="flex-1 flex flex-col overflow-hidden">
        {/* Top bar */}
        <header className="h-16 bg-white border-b border-slate-200 flex items-center justify-between px-6 shrink-0">
          <div className="flex items-center gap-3">
            <HardHat size={20} className="text-primary" />
            <h1 className="font-heading font-bold text-lg">Jobs</h1>
            <span className="text-xs bg-slate-100 text-slate-500 font-semibold px-2 py-0.5 rounded-full">
              {jobs.length} total
            </span>
          </div>
          <button className="flex items-center gap-2 bg-primary hover:bg-orange-600 text-white text-sm font-bold px-4 py-2 rounded-lg transition-colors">
            <Plus size={15} />
            New Job
          </button>
        </header>

        <div className="flex-1 overflow-auto">
          <div className="p-6 flex flex-col gap-5">

            {/* Search + filter bar */}
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  placeholder="Search jobs, clients, locations…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="w-full pl-9 pr-4 py-2.5 bg-white border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-colors"
                />
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <Filter size={14} className="text-slate-400 shrink-0" />
                {filters.map((f) => (
                  <button
                    key={f.value}
                    onClick={() => setActiveFilter(f.value)}
                    className={`text-xs font-bold px-3 py-1.5 rounded-full border transition-colors ${
                      activeFilter === f.value
                        ? 'bg-primary text-white border-primary'
                        : 'bg-white text-slate-600 border-slate-200 hover:border-primary hover:text-primary'
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Summary cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                { label: 'Active', count: jobs.filter(j => j.status === 'active').length, color: 'text-emerald-600', bg: 'bg-emerald-50' },
                { label: 'Pending', count: jobs.filter(j => j.status === 'pending').length, color: 'text-amber-600', bg: 'bg-amber-50' },
                { label: 'On Hold', count: jobs.filter(j => j.status === 'on-hold').length, color: 'text-red-600', bg: 'bg-red-50' },
                { label: 'Completed', count: jobs.filter(j => j.status === 'completed').length, color: 'text-blue-600', bg: 'bg-blue-50' },
              ].map((s) => (
                <div key={s.label} className={`${s.bg} rounded-xl p-4 border border-white`}>
                  <div className={`text-2xl font-black ${s.color}`}>{s.count}</div>
                  <div className="text-xs font-semibold text-slate-500 mt-0.5">{s.label}</div>
                </div>
              ))}
            </div>

            {/* Job list */}
            <motion.div
              variants={stagger}
              initial="hidden"
              animate="visible"
              className="flex flex-col gap-3"
            >
              {filtered.length === 0 && (
                <div className="text-center py-16 text-slate-400 text-sm">No jobs match your search.</div>
              )}
              {filtered.map((job) => {
                const s = statusConfig[job.status];
                const StatusIcon = s.icon;
                return (
                  <motion.div
                    key={job.id}
                    variants={fadeUp}
                    onClick={() => setSelectedJob(selectedJob?.id === job.id ? null : job)}
                    className="bg-white border border-slate-200 rounded-xl p-5 cursor-pointer hover:border-primary/40 hover:shadow-md transition-all duration-150"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <span className="text-xs font-mono text-slate-400">{job.id}</span>
                          <span className={`inline-flex items-center gap-1 text-xs font-bold px-2 py-0.5 rounded-full border ${s.bg} ${s.color}`}>
                            <StatusIcon size={11} />
                            {s.label}
                          </span>
                        </div>
                        <h2 className="font-bold text-base text-slate-900 truncate">{job.name}</h2>
                        <div className="flex items-center gap-4 mt-1 text-xs text-slate-500 flex-wrap">
                          <span className="flex items-center gap-1"><Users size={11} />{job.client}</span>
                          <span className="flex items-center gap-1"><MapPin size={11} />{job.location}</span>
                          <span className="flex items-center gap-1"><Calendar size={11} />Due {job.dueDate}</span>
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="font-black text-slate-800">{job.value}</div>
                        <div className="text-xs text-slate-400 mt-0.5">contract value</div>
                      </div>
                      <ChevronRight
                        size={16}
                        className={`text-slate-300 shrink-0 mt-1 transition-transform duration-150 ${selectedJob?.id === job.id ? 'rotate-90' : ''}`}
                      />
                    </div>

                    {/* Progress bar */}
                    {job.status !== 'pending' && (
                      <div className="mt-4">
                        <div className="flex justify-between text-xs text-slate-400 mb-1">
                          <span>Progress</span>
                          <span className="font-semibold text-slate-600">{job.progress}%</span>
                        </div>
                        <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${job.progress}%` }}
                            transition={{ duration: 0.6, ease: 'easeOut' as const, delay: 0.1 }}
                            className={`h-full rounded-full ${
                              job.progress === 100 ? 'bg-blue-500' :
                              job.progress > 60 ? 'bg-emerald-500' :
                              job.progress > 30 ? 'bg-amber-500' : 'bg-red-400'
                            }`}
                          />
                        </div>
                      </div>
                    )}

                    {/* Expanded detail */}
                    {selectedJob?.id === job.id && (
                      <motion.div
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: 'auto' }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.2 }}
                        className="mt-4 pt-4 border-t border-slate-100"
                      >
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-3">
                          {[
                            { icon: Calendar, label: 'Start', value: job.startDate },
                            { icon: Users, label: 'Crew', value: `${job.crew} on site` },
                            { icon: FileText, label: 'Forms', value: `${job.forms} completed` },
                            { icon: Camera, label: 'Photos', value: `${job.photos} uploaded` },
                          ].map((d) => (
                            <div key={d.label} className="bg-slate-50 rounded-lg p-3">
                              <div className="flex items-center gap-1.5 text-xs text-slate-400 mb-1">
                                <d.icon size={11} />
                                {d.label}
                              </div>
                              <div className="text-sm font-bold text-slate-700">{d.value}</div>
                            </div>
                          ))}
                        </div>
                        {job.notes && (
                          <div className="bg-amber-50 border border-amber-100 rounded-lg p-3 text-sm text-amber-800">
                            <span className="font-bold">Note: </span>{job.notes}
                          </div>
                        )}
                        <div className="flex gap-2 mt-3">
                          <button className="text-xs font-bold text-primary hover:underline flex items-center gap-1">
                            <FileText size={12} /> View Forms
                          </button>
                          <span className="text-slate-200">|</span>
                          <button className="text-xs font-bold text-primary hover:underline flex items-center gap-1">
                            <Camera size={12} /> View Photos
                          </button>
                          <span className="text-slate-200">|</span>
                          <button className="text-xs font-bold text-primary hover:underline flex items-center gap-1">
                            <DollarSign size={12} /> View Estimate
                          </button>
                        </div>
                      </motion.div>
                    )}
                  </motion.div>
                );
              })}
            </motion.div>

          </div>
        </div>
      </div>
    </div>
  );
}
