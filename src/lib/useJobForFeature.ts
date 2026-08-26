/**
 * useJobForFeature — Shared data hook for standalone job-feature pages.
 *
 * Fetches the job by ID from the URL params, validates it belongs to the
 * authenticated user's company (server enforces this), and returns the
 * job data plus loading/error state.
 *
 * The server-side /api/jobs/:id endpoint already enforces:
 *   - Authenticated session
 *   - Job belongs to the user's company
 *   - User belongs to the company
 *
 * This hook does NOT trust a client-provided companyId.
 */
import { useState, useEffect } from 'react';
import { useParams } from 'react-router';
import { fetchJob, type Job } from '@/lib/jobs-api';

interface UseJobResult {
  jobId: number | null;
  job: Job | null;
  loading: boolean;
  error: string | null;
}

export function useJobForFeature(): UseJobResult {
  const { jobId } = useParams<{ jobId: string }>();
  const id = jobId ? parseInt(jobId, 10) : null;

  const [job, setJob] = useState<Job | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id || isNaN(id)) {
      setError('Invalid job ID');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    fetchJob(id)
      .then(j => { setJob(j); })
      .catch(() => { setError('Job not found or access denied'); })
      .finally(() => setLoading(false));
  }, [id]);

  return { jobId: id, job, loading, error };
}
