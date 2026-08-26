/**
 * /work-field — backward-compat redirect page.
 *
 * The Work & Field launcher has been removed. The 14 job-feature icons now
 * live directly on the home screen (Page 1 — Work & Field).
 *
 * Redirect rules:
 *   /work-field           → /  (home screen)
 *   /work-field/:slug     → /?picker=<key>  (home screen + auto-open picker)
 *
 * These redirects preserve all existing bookmarks and deep links.
 *
 * @seo-exempt
 */
import { useEffect } from 'react';
import { useParams, useNavigate } from 'react-router';
import { Helmet } from '@dr.pogodin/react-helmet';
import { getFeatureByLauncherSlug } from '@/lib/jobFeatureRegistry';

export default function WorkFieldRedirect() {
  const { featureSlug } = useParams<{ featureSlug?: string }>();
  const navigate = useNavigate();

  useEffect(() => {
    if (featureSlug) {
      // /work-field/:slug → /?picker=<key>
      const feature = getFeatureByLauncherSlug(featureSlug);
      if (feature) {
        navigate(`/?picker=${feature.key}`, { replace: true });
        return;
      }
    }
    // /work-field → /
    navigate('/', { replace: true });
  }, [featureSlug, navigate]);

  // Render nothing — redirect fires immediately
  return (
    <>
      <Helmet>
        <title>Redirecting — IWILLBUILD</title>
        <meta name="description" content="Redirecting to home screen" />
        <link rel="canonical" href="https://iwillbuild.com/" />
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>
      <h1 className="sr-only">Redirecting</h1>
    </>
  );
}
