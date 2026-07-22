/**
 * AssetLinkedJobs — shows all jobs linked to this asset.
 * Each job opens in a new tab.
 */
import { useState, useEffect } from 'react';
import { Briefcase, ExternalLink, Loader2, Plus } from 'lucide-react';

interface LinkedJob {
  id: number;
  job_number: string | null;
  name: string;
  status: string;
  client: string | null;
  address: string | null;
  created_at: string;
}

const STATUS_STYLE: Record<string, { color: string; bg: string; dot: string }> = {
  'New':              { color: 'text-slate-700',   bg: 'bg-slate-100 border-slate-200',   dot: 'bg-slate-400' },
  'Quoting':          { color: 'text-amber-700',   bg: 'bg-amber-50 border-amber-200',    dot: 'bg-amber-400' },
  'Tender Request':   { color: 'text-violet-700',  bg: 'bg-violet-50 border-violet-200',  dot: 'bg-violet-400' },
  'Tender Awarded':   { color: 'text-indigo-700',  bg: 'bg-indigo-50 border-indigo-200',  dot: 'bg-indigo-500' },
  'Submitted':        { color: 'text-blue-700',    bg: 'bg-blue-50 border-blue-200',      dot: 'bg-blue-400' },
  'Works Approved':   { color: 'text-teal-700',    bg: 'bg-teal-50 border-teal-200',      dot: 'bg-teal-500' },
  'Works in Progress':{ color: 'text-emerald-700', bg: 'bg-emerald-50 border-emerald-200',dot: 'bg-emerald-500' },
  'Completed':        { color: 'text-green-700',   bg: 'bg-green-50 border-green-200',    dot: 'bg-green-500' },
  'Closed':           { color: 'text-gray-500',    bg: 'bg-gray-100 border-gray-200',     dot: 'bg-gray-400' },
};

function getStyle(status: string) {
  return STATUS_STYLE[status] ?? { color: 'text-slate-600', bg: 'bg-slate-100 border-slate-200', dot: 'bg-slate-400' };
}

function fmt(iso: string) {
  return new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
}

export default function AssetLinkedJobs({ assetId }: { assetId: number }) {
  const [jobs, setJobs] = useState<LinkedJob[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    fetch(`/api/jobs?assetId=${assetId}`, { credentials: 'include' })
      .then(r => r.json() as Promise<{ jobs?: LinkedJob[] }>)
      .then(d => setJobs(d.jobs ?? []))
      .catch(console.error)
      .finally(() => setLoading(false));
  }, [assetId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 size={20} className="animate-spin text-slate-400" />
      </div>
    );
  }

  return (
    <div className="p-6 flex flex-col gap-4 max-w-3xl">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-bold text-slate-700">Linked Jobs</h3>
          {jobs.length > 0 && (
            <span className="px-2 py-0.5 bg-slate-100 text-slate-500 text-[10px] font-bold rounded-full border border-slate-200">
              {jobs.length}
            </span>
          )}
        </div>
        <a
          href="/jobs"
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50 transition-colors"
        >
          <Plus size={12} />
          New Job
        </a>
      </div>

      {jobs.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center">
          <div className="text-slate-300 mb-3"><Briefcase size={28} /></div>
          <p className="text-sm font-semibold text-slate-500">No jobs linked to this asset</p>
          <p className="text-xs text-slate-400 mt-1 max-w-xs">
            When creating or editing a job, select this asset in the Asset field to link it here.
          </p>
          <a
            href="/jobs"
            target="_blank"
            rel="noreferrer"
            className="mt-4 flex items-center gap-1.5 px-4 py-2 bg-orange-500 hover:bg-orange-600 text-white text-xs font-semibold rounded-lg transition-colors"
          >
            <ExternalLink size={12} />
            Go to Jobs
          </a>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {jobs.map(job => {
            const style = getStyle(job.status);
            return (
              <a
                key={job.id}
                href={`/job-detail/${job.id}`}
                target="_blank"
                rel="noreferrer"
                className="bg-white border border-slate-200 rounded-xl px-4 py-3 flex items-start gap-3 hover:border-orange-200 hover:shadow-sm transition-all group"
              >
                <div className="w-8 h-8 rounded-lg bg-orange-50 border border-orange-100 flex items-center justify-center shrink-0">
                  <Briefcase size={14} className="text-orange-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    {job.job_number && (
                      <span className="text-xs font-mono text-slate-400">{job.job_number}</span>
                    )}
                    <span className="text-sm font-semibold text-slate-800 group-hover:text-orange-600 transition-colors">
                      {job.name}
                    </span>
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border ${style.bg} ${style.color}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${style.dot}`} />
                      {job.status}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 mt-0.5 flex-wrap">
                    {job.client && <span className="text-xs text-slate-400">{job.client}</span>}
                    {job.address && <span className="text-xs text-slate-400 truncate max-w-[200px]">{job.address}</span>}
                    <span className="text-xs text-slate-400">Created {fmt(job.created_at)}</span>
                  </div>
                </div>
                <ExternalLink size={13} className="text-slate-300 group-hover:text-orange-400 transition-colors shrink-0 mt-0.5" />
              </a>
            );
          })}
        </div>
      )}
    </div>
  );
}
