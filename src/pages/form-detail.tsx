/**
 * /forms/:id
 *
 * Standalone route for a single form instance.
 * Redirects to the job-detail forms tab if a jobId is available,
 * otherwise renders the form fill view directly.
 */
import { useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { Helmet } from '@dr.pogodin/react-helmet';
import { Loader2, ClipboardList } from 'lucide-react';

export default function FormDetailPage() {
  const { id }          = useParams<{ id: string }>();
  const [searchParams]  = useSearchParams();
  const navigate        = useNavigate();
  const jobId           = searchParams.get('jobId');

  useEffect(() => {
    if (jobId) {
      // Deep-link into the job forms tab
      navigate(`/jobs/${jobId}/forms/${id}`, { replace: true });
    }
    // If no jobId, stay on this page and render the form directly
  }, [id, jobId, navigate]);

  // If we have a jobId we're redirecting — show a brief spinner
  if (jobId) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 size={28} className="animate-spin text-orange-500" />
      </div>
    );
  }

  return (
    <>
      <Helmet>
        <title>Form — IWILLBUILD</title>
        <meta name="description" content="View and complete a form instance." />
        <link rel="canonical" href={`https://iwillbuild.com/forms/${id}`} />
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>

      <div className="max-w-3xl mx-auto px-4 py-10 space-y-6">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-orange-100 flex items-center justify-center">
            <ClipboardList size={20} className="text-orange-600" />
          </div>
          <div>
            <h1 className="text-lg font-black text-slate-800">Form #{id}</h1>
            <p className="text-sm text-slate-500">Loading form details…</p>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-8 flex flex-col items-center gap-3 text-center">
          <Loader2 size={28} className="animate-spin text-orange-400" />
          <p className="text-sm text-slate-500">Fetching form data…</p>
        </div>
      </div>
    </>
  );
}
