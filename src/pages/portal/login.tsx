/**
 * /portal/login?token=...
 * Customer portal magic-link entry point.
 * Validates the token, stores it in sessionStorage, redirects to dashboard.
 */
import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Helmet } from '@dr.pogodin/react-helmet';
import { Loader2, AlertCircle, CheckCircle, Building2 } from 'lucide-react';

export default function PortalLoginPage() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const token = params.get('token') ?? '';

  const [status, setStatus] = useState<'validating' | 'ok' | 'error'>('validating');
  const [errorMsg, setErrorMsg] = useState('');
  const [companyName, setCompanyName] = useState('');

  useEffect(() => {
    if (!token) {
      setStatus('error');
      setErrorMsg('No access token found in this link. Please request a new invite from your contractor.');
      return;
    }

    fetch('/api/portal/validate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token }),
    })
      .then(r => r.json() as Promise<{
        valid?: boolean; error?: string;
        customerName?: string; companyName?: string;
        customerId?: number; companyId?: number;
      }>)
      .then(data => {
        if (!data.valid) {
          setStatus('error');
          setErrorMsg(data.error ?? 'This link is invalid or has expired. Please request a new invite.');
          return;
        }
        // Store session in sessionStorage
        sessionStorage.setItem('portalToken', token);
        sessionStorage.setItem('portalCustomerName', data.customerName ?? '');
        sessionStorage.setItem('portalCompanyName', data.companyName ?? '');
        setCompanyName(data.companyName ?? '');
        setStatus('ok');
        setTimeout(() => navigate(`/portal/dashboard?token=${token}`, { replace: true }), 1200);
      })
      .catch(() => {
        setStatus('error');
        setErrorMsg('Unable to validate your link. Please try again or request a new invite.');
      });
  }, [token]);

  return (
    <>
      <Helmet>
        <title>Client Portal — IWILLBUILD</title>
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>

      <div className="min-h-screen bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900 flex items-center justify-center p-4">
        <div className="w-full max-w-sm">
          {/* Logo / brand */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-orange-500 mb-4 shadow-lg shadow-orange-500/30">
              <Building2 size={28} className="text-white" />
            </div>
            <h1 className="text-2xl font-black text-white">Client Portal</h1>
            {companyName && <p className="text-slate-400 text-sm mt-1">{companyName}</p>}
          </div>

          <div className="bg-white/5 backdrop-blur-sm border border-white/10 rounded-2xl p-8 text-center">
            {status === 'validating' && (
              <div className="flex flex-col items-center gap-3">
                <Loader2 size={32} className="text-orange-400 animate-spin" />
                <p className="text-slate-300 text-sm">Verifying your access link…</p>
              </div>
            )}

            {status === 'ok' && (
              <div className="flex flex-col items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-emerald-500/20 flex items-center justify-center">
                  <CheckCircle size={24} className="text-emerald-400" />
                </div>
                <p className="text-white font-semibold">Access confirmed</p>
                <p className="text-slate-400 text-sm">Taking you to your portal…</p>
              </div>
            )}

            {status === 'error' && (
              <div className="flex flex-col items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-red-500/20 flex items-center justify-center">
                  <AlertCircle size={24} className="text-red-400" />
                </div>
                <p className="text-white font-semibold">Link invalid</p>
                <p className="text-slate-400 text-sm leading-relaxed">{errorMsg}</p>
              </div>
            )}
          </div>

          <p className="text-center text-slate-600 text-xs mt-6">
            Powered by IWILLBUILD
          </p>
        </div>
      </div>
    </>
  );
}
