/**
 * DriverJobCard
 * ─────────────────────────────────────────────────────────────────────────────
 * Shows the driver's currently assigned / active job.
 * Fetches active jobs for the current user from /api/jobs (status filter:
 * "Works in Progress" or "Ready to Start") and displays the most relevant one.
 *
 * Props:
 *   jobId  — if provided, loads that specific job directly
 *   onJobSelect — callback when driver picks a job from the list
 */
import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import {
  Briefcase,
  MapPin,
  User,
  Calendar,
  ChevronRight,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  Clock,
  ChevronDown,
  ChevronUp,
  ExternalLink,
} from 'lucide-react';
import { fetchJobs, getStatusStyle, type Job } from '@/lib/jobs-api';

const ACTIVE_STATUSES = ['Works in Progress', 'Ready to Start', 'Works Approved'];

interface DriverJobCardProps {
  /** Pre-selected job ID — skips the picker and shows this job directly */
  jobId?: number | null;
  /** Called when driver selects a job from the picker */
  onJobSelect?: (job: Job | null) => void;
  /** Compact mode — less padding, used inside the driver page */
  compact?: boolean;
}

function formatDate(dateStr: string | null): string {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
}

function StatusBadge({ status }: { status: string }) {
  const s = getStatusStyle(status);
  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border ${s.bg} ${s.color}`}>
      <span className={`w-1.5 h-1.5 rounded-full ${s.dot}`} />
      {status}
    </span>
  );
}

export default function DriverJobCard({ jobId, onJobSelect, compact = false }: DriverJobCardProps) {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showPicker, setShowPicker] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async (silent = false) => {
    if (!silent) setLoading(true);
    else setRefreshing(true);
    setError('');
    try {
      const all = await fetchJobs();
      const active = all.filter(j => ACTIVE_STATUSES.includes(j.status));
      setJobs(active);

      // If a specific jobId was passed, find and select it
      if (jobId) {
        const found = all.find(j => j.id === jobId);
        if (found) {
          setSelectedJob(found);
          onJobSelect?.(found);
        }
      } else if (active.length === 1 && !selectedJob) {
        // Auto-select if only one active job
        setSelectedJob(active[0]);
        onJobSelect?.(active[0]);
      }
    } catch {
      setError('Could not load jobs');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [jobId, onJobSelect, selectedJob]);

  useEffect(() => { void load(); }, []);  // eslint-disable-line react-hooks/exhaustive-deps

  function selectJob(job: Job) {
    setSelectedJob(job);
    onJobSelect?.(job);
    setShowPicker(false);
  }

  function clearJob() {
    setSelectedJob(null);
    onJobSelect?.(null);
    setShowPicker(false);
  }

  // ── Loading skeleton ──────────────────────────────────────────────────────
  if (loading) {
    return (
      <div className={`bg-gray-900 rounded-2xl border border-gray-800 ${compact ? 'p-4' : 'p-5'} animate-pulse`}>
        <div className="flex items-center gap-2 mb-3">
          <div className="w-4 h-4 rounded bg-gray-700" />
          <div className="h-3 w-20 rounded bg-gray-700" />
        </div>
        <div className="h-5 w-48 rounded bg-gray-700 mb-2" />
        <div className="h-3 w-32 rounded bg-gray-700" />
      </div>
    );
  }

  // ── Error state ───────────────────────────────────────────────────────────
  if (error) {
    return (
      <div className={`bg-gray-900 rounded-2xl border border-red-900/50 ${compact ? 'p-4' : 'p-5'}`}>
        <div className="flex items-center gap-2 text-red-400">
          <AlertCircle size={16} />
          <span className="text-sm">{error}</span>
          <button onClick={() => void load(true)} className="ml-auto text-gray-400 hover:text-white">
            <RefreshCw size={14} className={refreshing ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>
    );
  }

  // ── No active jobs ────────────────────────────────────────────────────────
  if (jobs.length === 0) {
    return (
      <div className={`bg-gray-900 rounded-2xl border border-gray-800 ${compact ? 'p-4' : 'p-5'}`}>
        <div className="flex items-center gap-2 mb-1">
          <Briefcase size={14} className="text-gray-500" />
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide">Current Job</span>
        </div>
        <p className="text-gray-400 text-sm mt-2">No active jobs assigned to you right now.</p>
        <Link to="/jobs" className="inline-flex items-center gap-1 text-orange-400 text-sm mt-2 hover:text-orange-300">
          View all jobs <ExternalLink size={12} />
        </Link>
      </div>
    );
  }

  return (
    <div className={`bg-gray-900 rounded-2xl border border-gray-800 overflow-hidden ${compact ? '' : ''}`}>

      {/* Header row */}
      <div className={`flex items-center justify-between ${compact ? 'px-4 pt-4 pb-2' : 'px-5 pt-5 pb-3'}`}>
        <div className="flex items-center gap-2">
          <Briefcase size={14} className="text-orange-400" />
          <span className="text-xs font-semibold text-gray-400 uppercase tracking-wide">Current Job</span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => void load(true)}
            className="text-gray-500 hover:text-gray-300 transition-colors"
            aria-label="Refresh jobs"
          >
            <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} />
          </button>
          {jobs.length > 1 && (
            <button
              onClick={() => setShowPicker(p => !p)}
              className="flex items-center gap-1 text-xs text-orange-400 hover:text-orange-300 font-medium"
            >
              Change
              {showPicker ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            </button>
          )}
        </div>
      </div>

      {/* Job picker dropdown */}
      <AnimatePresence>
        {showPicker && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="overflow-hidden border-b border-gray-800"
          >
            <div className={`${compact ? 'px-4' : 'px-5'} pb-3 space-y-1`}>
              {selectedJob && (
                <button
                  onClick={clearJob}
                  className="w-full text-left px-3 py-2 rounded-xl text-sm text-gray-400 hover:bg-gray-800 transition-colors"
                >
                  Clear selection
                </button>
              )}
              {jobs.map(job => (
                <button
                  key={job.id}
                  onClick={() => selectJob(job)}
                  className={`w-full text-left px-3 py-2.5 rounded-xl transition-colors ${
                    selectedJob?.id === job.id
                      ? 'bg-orange-500/10 border border-orange-500/30'
                      : 'hover:bg-gray-800'
                  }`}
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-white text-sm font-semibold truncate">{job.name}</p>
                      {job.jobNumber && (
                        <p className="text-gray-500 text-xs">{job.jobNumber}</p>
                      )}
                    </div>
                    <div className="shrink-0 flex items-center gap-2">
                      <StatusBadge status={job.status} />
                      {selectedJob?.id === job.id && (
                        <CheckCircle2 size={14} className="text-orange-400" />
                      )}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Selected job detail */}
      {selectedJob ? (
        <div className={`${compact ? 'px-4 pb-4' : 'px-5 pb-5'}`}>
          {/* Job name + number */}
          <div className="mb-3">
            <h3 className="text-white font-bold text-base leading-tight">{selectedJob.name}</h3>
            {selectedJob.jobNumber && (
              <p className="text-gray-500 text-xs mt-0.5">{selectedJob.jobNumber}</p>
            )}
          </div>

          {/* Status badge */}
          <div className="mb-3">
            <StatusBadge status={selectedJob.status} />
          </div>

          {/* Detail rows */}
          <div className="space-y-2">
            {selectedJob.client && (
              <div className="flex items-start gap-2.5">
                <User size={13} className="text-gray-500 mt-0.5 shrink-0" />
                <span className="text-gray-300 text-sm">{selectedJob.client}</span>
              </div>
            )}
            {selectedJob.address && (
              <div className="flex items-start gap-2.5">
                <MapPin size={13} className="text-gray-500 mt-0.5 shrink-0" />
                <span className="text-gray-300 text-sm leading-snug">{selectedJob.address}</span>
              </div>
            )}
            {selectedJob.scheduledStartDate && (
              <div className="flex items-start gap-2.5">
                <Calendar size={13} className="text-gray-500 mt-0.5 shrink-0" />
                <span className="text-gray-300 text-sm">
                  Started {formatDate(selectedJob.scheduledStartDate)}
                </span>
              </div>
            )}
            {selectedJob.expectedCompletionDate && (
              <div className="flex items-start gap-2.5">
                <Clock size={13} className="text-gray-500 mt-0.5 shrink-0" />
                <span className="text-gray-300 text-sm">
                  Due {formatDate(selectedJob.expectedCompletionDate)}
                </span>
              </div>
            )}
          </div>

          {/* Link to full job */}
          <Link
            to={`/jobs/${selectedJob.id}`}
            className="inline-flex items-center gap-1.5 mt-4 text-orange-400 hover:text-orange-300 text-sm font-medium transition-colors"
          >
            Open job details
            <ChevronRight size={14} />
          </Link>
        </div>
      ) : (
        /* No job selected yet — show picker prompt */
        <div className={`${compact ? 'px-4 pb-4' : 'px-5 pb-5'}`}>
          <p className="text-gray-400 text-sm mb-3">
            {jobs.length} active {jobs.length === 1 ? 'job' : 'jobs'} available — select one to track.
          </p>
          <div className="space-y-2">
            {jobs.slice(0, 3).map(job => (
              <button
                key={job.id}
                onClick={() => selectJob(job)}
                className="w-full flex items-center justify-between gap-3 bg-gray-800 hover:bg-gray-750 rounded-xl px-3 py-3 transition-colors text-left"
              >
                <div className="min-w-0">
                  <p className="text-white text-sm font-semibold truncate">{job.name}</p>
                  {job.address && (
                    <p className="text-gray-500 text-xs truncate mt-0.5">{job.address}</p>
                  )}
                </div>
                <div className="shrink-0 flex items-center gap-2">
                  <StatusBadge status={job.status} />
                  <ChevronRight size={14} className="text-gray-600" />
                </div>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
