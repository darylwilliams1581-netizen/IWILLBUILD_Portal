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
import { ClipboardList } from 'lucide-react';

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

  // No jobId — redirect to the forms list so the user isn't stuck on a spinner.
  // The /forms page can locate the form instance from there.
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
            <p className="text-sm text-slate-500">No job context provided.</p>
          </div>
        </div>

        <div className="bg-white border border-slate-200 rounded-xl p-8 flex flex-col items-center gap-4 text-center">
          <ClipboardList size={32} className="text-slate-300" />
          <p className="text-sm font-semibold text-slate-700">Form context missing</p>
          <p className="text-sm text-slate-500 max-w-sm">
            This link doesn't include a job reference. Open the form from the job it belongs to, or browse all forms below.
          </p>
          <button
            onClick={() => navigate('/studio?tab=forms')}
            className="mt-2 px-5 py-2 bg-primary hover:bg-orange-600 text-white text-sm font-bold rounded-lg transition-colors"
          >
            Go to Forms
          </button>
        </div>
      </div>
    </>
  );
}
