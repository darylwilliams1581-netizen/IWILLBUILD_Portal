/**
 * /timesheets — retired from the visible product.
 * Bookmarks still resolve. Stored timesheet data is unchanged.
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
        <title>IWIllBUIlD</title>
        <meta name="robots" content="noindex,nofollow" />
      </Helmet>
      <h1 className="sr-only">Redirecting</h1>
    </>
  );
}
