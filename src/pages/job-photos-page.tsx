import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { ArrowLeft, Camera, Loader2 } from 'lucide-react';
import { Helmet } from '@dr.pogodin/react-helmet';
import JobPhotos from '@/components/JobPhotos';

interface Job {
  id: number;
  name: string;
  jobNumber?: string | null;
}

export default function JobPhotosPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const jobId = Number(id);

  const [job, setJob] = useState<Job | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!id) return;
    fetch(`/api/jobs/${id}`, { credentials: 'include' })
      .then(r => r.json())
      .then((data: { job?: Job } | Job) => {
        const j = 'job' in data ? data.job : data as Job;
        setJob(j ?? null);
      })
      .catch(() => setJob(null))
      .finally(() => setLoading(false));
  }, [id]);

  const title = job ? `${job.name} — Photos` : 'Job Photos';

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <Helmet>
        <title>{title} — IWILLBUILD</title>
        <meta name="robots" content="noindex" />
      </Helmet>

      {/* ── Top bar ── */}
      <div
        className="bg-white border-b border-gray-100 px-4 py-3 flex items-center gap-3 shrink-0"
        style={{ boxShadow: '0 1px 0 rgba(0,0,0,0.05)' }}
      >
        <button
          onClick={() => navigate('/home')}
          className="w-9 h-9 rounded-xl bg-gray-100 flex items-center justify-center text-gray-600 hover:bg-gray-200 active:bg-gray-300 transition-colors shrink-0"
        >
          <ArrowLeft size={18} />
        </button>

        <div className="flex items-center gap-2.5 flex-1 min-w-0">
          <div className="w-8 h-8 rounded-xl bg-orange-100 flex items-center justify-center shrink-0">
            <Camera size={15} className="text-orange-500" />
          </div>
          <div className="min-w-0">
            {loading ? (
              <div className="h-4 w-32 bg-gray-200 rounded animate-pulse" />
            ) : (
              <>
                <p className="text-gray-900 font-bold text-sm leading-tight truncate">
                  {job?.name ?? 'Job Photos'}
                </p>
                {job?.jobNumber && (
                  <p className="text-gray-400 text-xs font-mono leading-tight">{job.jobNumber}</p>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {/* ── Content ── */}
      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 size={24} className="animate-spin text-orange-400" />
          </div>
        ) : (
          <div className="px-4 py-4">
            <JobPhotos jobId={jobId} />
          </div>
        )}
      </div>
    </div>
  );
}
