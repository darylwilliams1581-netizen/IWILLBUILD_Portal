/**
 * /timesheets — Legacy redirect.
 *
 * Timesheets has been removed from the user-facing product.
 * Any bookmarks or deep links to /timesheets are redirected to /home
 * so users land somewhere useful without a 404 or broken page.
 *
 * Backend data and APIs are preserved — this is a UI-only removal.
 */
// @seo-exempt
import { useEffect } from 'react';
import { useNavigate } from 'react-router';
import { Helmet } from '@dr.pogodin/react-helmet';

export default function TimesheetsPage() {
  const navigate = useNavigate();

  useEffect(() => {
    navigate('/home', { replace: true });
  }, [navigate]);

  return (
    <>
      <Helmet>
        <title>Timesheets — IWIllBUIlD</title>
        <meta name="description" content="Timesheets — redirecting to Finance workspace." />
        <link rel="canonical" href="https://iwillbuild.com/finance" />
        <meta name="robots" content="noindex,nofollow" />
      </Helmet>
      <h1 className="sr-only">Timesheets</h1>
    </>
  );
}
