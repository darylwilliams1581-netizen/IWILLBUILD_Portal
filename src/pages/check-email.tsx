import { useState } from 'react';
import { Helmet } from '@dr.pogodin/react-helmet';
import { Mail, RefreshCw, CheckCircle, ArrowLeft } from 'lucide-react';
import { Link, useLocation } from "react-router";
export default function CheckEmailPage() {
  const location = useLocation();
  const email = (location.state as {
    email?: string;
  } | null)?.email ?? '';
  const [resending, setResending] = useState(false);
  const [resent, setResent] = useState(false);
  const [error, setError] = useState('');
  async function handleResend() {
    if (resending || resent) return;
    setResending(true);
    setError('');
    try {
      const res = await fetch('/api/auth/resend-verification', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify({
          email
        })
      });
      if (res.status === 429) {
        setError('Too many requests. Please wait a few minutes before trying again.');
        return;
      }
      setResent(true);
    } catch {
      setError('Failed to resend. Please try again.');
    } finally {
      setResending(false);
    }
  }
  return <>
      <Helmet>
        <title>Check Your Email — IWIllBUIlD Portal</title>
        <meta name="description" content="Verify your email address to activate your IWIllBUIlD Portal account." />
        <meta name="robots" content="noindex, nofollow" />
        <link rel="canonical" href="https://iwillbuild.com/check-email" />
        <meta name="robots" content="noindex, nofollow" />
        <meta property="og:title" content="Check Your Email — IWIllBUIlD Portal" />
        <meta property="og:description" content="Verify your email address to activate your IWIllBUIlD Portal account." />
        <meta property="og:type" content="website" />
        <meta property="og:url" content="https://iwillbuild.com/check-email" />
        <meta property="og:image" content="https://iwillbuild.com/airo-assets/images/pages/home/og-image" />
        <meta name="twitter:card" content="summary_large_image" />
        <meta name="twitter:title" content="Check Your Email — IWIllBUIlD Portal" />
        <meta name="twitter:description" content="Verify your email address to activate your IWIllBUIlD Portal account." />
        <meta name="twitter:image" content="https://iwillbuild.com/airo-assets/images/pages/home/og-image" />
        <script type="application/ld+json">{JSON.stringify({
          '@context': 'https://schema.org',
          '@type': 'WebPage',
          '@id': 'https://iwillbuild.com/check-email#webpage',
          name: 'Check Your Email — IWIllBUIlD Portal',
          url: 'https://iwillbuild.com/check-email',
          description: 'Verify your email address to activate your IWIllBUIlD Portal account.',
          isPartOf: {
            '@id': 'https://iwillbuild.com/#website'
          }
        })}</script>
      </Helmet>

      <div className="min-h-screen bg-[#0F1117] flex items-center justify-center px-4">
        {/* Blueprint grid background */}
        <div className="fixed inset-0 pointer-events-none opacity-[0.04]" style={{
        backgroundImage: `
              linear-gradient(rgba(249,115,22,0.6) 1px, transparent 1px),
              linear-gradient(90deg, rgba(249,115,22,0.6) 1px, transparent 1px)
            `,
        backgroundSize: '40px 40px'
      }} />

        <div className="relative w-full max-w-md">
          {/* Logo */}
          <div className="text-center mb-8">
            <div className="inline-flex items-center gap-2 mb-2">
              <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-sm">IW</span>
              </div>
              <span className="text-white font-bold text-lg tracking-tight">IWIllBUIlD</span>
            </div>
          </div>

          {/* Card */}
          <div className="bg-[#1A1D27] border border-white/10 rounded-2xl p-8 shadow-2xl text-center">
            {/* Icon */}
            <div className="w-16 h-16 bg-primary/10 border border-primary/20 rounded-2xl flex items-center justify-center mx-auto mb-6">
              <Mail size={28} className="text-primary" />
            </div>

            <h1 className="text-2xl font-bold text-white mb-3">Check your email</h1>
            <p className="text-white/60 text-sm leading-relaxed mb-2">
              We've sent a verification link to
            </p>
            {email && <p className="text-white font-semibold text-sm mb-4 break-all">{email}</p>}
            <p className="text-white/50 text-sm leading-relaxed mb-8">
              Click the link in the email to activate your account. The link expires in 24 hours.
            </p>

            {/* Resend */}
            {resent ? <div className="flex items-center justify-center gap-2 text-green-400 text-sm font-medium mb-6">
                <CheckCircle size={16} />
                Verification email resent!
              </div> : <div className="mb-6">
                <p className="text-white/40 text-xs mb-3">Didn't receive it? Check your spam folder, or</p>
                <button onClick={handleResend} disabled={resending} className="flex items-center gap-2 mx-auto text-sm font-semibold text-primary hover:text-violet-400 disabled:opacity-50 transition-colors">
                  <RefreshCw size={14} className={resending ? 'animate-spin' : ''} />
                  {resending ? 'Sending...' : 'Resend verification email'}
                </button>
              </div>}

            {error && <p className="text-red-400 text-xs mb-4">{error}</p>}

            {/* Tips */}
            <div className="bg-white/5 rounded-xl p-4 text-left mb-6">
              <p className="text-white/50 text-xs font-semibold uppercase tracking-wider mb-2">Tips</p>
              <ul className="space-y-1.5 text-white/40 text-xs">
                <li>• Check your spam or junk folder</li>
                <li>• Add <span className="text-white/60">noreply@iwillbuild.com</span> to your contacts</li>
                <li>• Allow a few minutes for delivery</li>
              </ul>
            </div>

            <Link to="/login" className="inline-flex items-center gap-1.5 text-white/40 hover:text-white/70 text-sm transition-colors">
              <ArrowLeft size={14} />
              Back to login
            </Link>
          </div>
        </div>
      </div>
    </>;
}
