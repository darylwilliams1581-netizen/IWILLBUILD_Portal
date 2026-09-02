/**
 * /timesheets — Redirect to the Finance workspace Timesheets tab.
 *
 * Timesheets now live inside the Finance shell at
 * /finance?financeTab=timesheets so the shared Finance header, tab row,
 * and portal layout are used consistently.
 *
 * This page exists solely to honour deep links and bookmarks that point
 * to /timesheets directly.
 */
// @seo-exempt
import { useEffect } from 'react';
import { useNavigate } from 'react-router';
import { Helmet } from '@dr.pogodin/react-helmet';

export default function TimesheetsPage() {
  const navigate = useNavigate();

  useEffect(() => {
    navigate('/finance?financeTab=timesheets', { replace: true });
  }, [navigate]);

  return (
    <>
      <Helmet>
        <title>Timesheets — IWIllBUILD</title>
        <meta name="description" content="Timesheets — redirecting to Finance workspace." />
        <link rel="canonical" href="https://iwillbuild.com/finance" />
        <meta name="robots" content="noindex,nofollow" />
      </Helmet>
      <h1 className="sr-only">Timesheets</h1>
    </>
  );
}
