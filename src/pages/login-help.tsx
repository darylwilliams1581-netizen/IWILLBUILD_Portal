/**
 * /login-help — Public login help page
 * Helps users who can't log in: forgot password, no email received, browser tips.
 */
import { Link } from 'react-router-dom';
import { Helmet } from '@dr.pogodin/react-helmet';
import {
  KeyRound, Mail, HelpCircle, Monitor, RefreshCw,
  ChevronRight, AlertCircle, CheckCircle2, ExternalLink
} from 'lucide-react';

const SUPPORT_EMAIL = 'support@iwillbuild.com';

interface HelpSection {
  icon: React.ReactNode;
  title: string;
  color: string;
  steps: Array<{ heading: string; body: React.ReactNode }>;
}

const sections: HelpSection[] = [
  {
    icon: <KeyRound size={22} />,
    title: 'Forgot your password?',
    color: 'text-violet-600',
    steps: [
      {
        heading: 'Reset via email',
        body: (
          <>
            Go to the{' '}
            <Link to="/forgot-password" className="text-violet-600 underline font-medium">
              Forgot Password
            </Link>{' '}
            page and enter your email address. You'll receive a reset link within a few minutes.
          </>
        ),
      },
      {
        heading: 'Link not arriving?',
        body: "Check your spam/junk folder. The email comes from noreply@iwillbuild.com. If it's not there after 5 minutes, see the \"Didn't receive an email\" section below.",
      },
      {
        heading: 'Reset link expired?',
        body: 'Reset links expire after 30 minutes. Simply request a new one from the Forgot Password page.',
      },
    ],
  },
  {
    icon: <Mail size={22} />,
    title: "Didn't receive an email?",
    color: 'text-blue-500',
    steps: [
      {
        heading: 'Check spam and junk folders',
        body: 'Emails from IWILLBUILD may be filtered by your email provider. Search for "iwillbuild" in all folders.',
      },
      {
        heading: 'Work email blocking messages?',
        body: 'Some corporate email systems (Microsoft 365, Google Workspace) block automated emails. Ask your IT team to whitelist noreply@iwillbuild.com, or use a personal email address.',
      },
      {
        heading: 'Wait a few minutes',
        body: 'Email delivery can occasionally be delayed by 2–5 minutes due to provider queues. If nothing arrives after 10 minutes, contact support.',
      },
      {
        heading: 'Resend verification email',
        body: (
          <>
            If you're waiting for a verification email, you can request a new one from the{' '}
            <Link to="/login" className="text-violet-600 underline font-medium">
              login page
            </Link>{' '}
            by clicking "Resend verification email".
          </>
        ),
      },
    ],
  },
  {
    icon: <RefreshCw size={22} />,
    title: 'Clear cache and cookies',
    color: 'text-purple-500',
    steps: [
      {
        heading: 'Why this helps',
        body: 'Stale cookies or cached login state can prevent you from logging in, especially after a password reset or account change.',
      },
      {
        heading: 'Chrome / Edge',
        body: (
          <span>
            Press <kbd className="bg-slate-100 border border-slate-300 rounded px-1.5 py-0.5 text-xs font-mono">Ctrl+Shift+Delete</kbd> (Windows) or{' '}
            <kbd className="bg-slate-100 border border-slate-300 rounded px-1.5 py-0.5 text-xs font-mono">⌘+Shift+Delete</kbd> (Mac). Select "Cookies and other site data" and "Cached images and files", then click Clear data.
          </span>
        ),
      },
      {
        heading: 'Safari',
        body: 'Go to Safari → Settings → Privacy → Manage Website Data. Search for "iwillbuild" and remove it.',
      },
      {
        heading: 'Try a private/incognito window',
        body: 'Open a private window (Ctrl+Shift+N / ⌘+Shift+N) and try logging in. If it works there, clearing your regular browser cache will fix it.',
      },
    ],
  },
  {
    icon: <Monitor size={22} />,
    title: 'Supported browsers',
    color: 'text-green-500',
    steps: [
      {
        heading: 'Recommended browsers',
        body: (
          <ul className="list-disc list-inside space-y-1 text-slate-600">
            <li>Google Chrome (latest)</li>
            <li>Microsoft Edge (latest)</li>
            <li>Mozilla Firefox (latest)</li>
            <li>Apple Safari 16+</li>
          </ul>
        ),
      },
      {
        heading: 'Not supported',
        body: 'Internet Explorer is not supported. If you are using IE, please switch to a modern browser.',
      },
      {
        heading: 'Mobile browsers',
        body: 'Chrome for Android and Safari for iOS are fully supported. The portal is mobile-responsive.',
      },
    ],
  },
];

export default function LoginHelpPage() {
  return (
    <div className="min-h-screen bg-slate-50">
      <Helmet>
        <title>Login Help — IWILLBUILD Portal</title>
        <meta name="description" content="Troubleshoot login issues with the IWILLBUILD portal. Reset your password, resend verification emails, and fix common browser problems." />
        <link rel="canonical" href="https://iwillbuild.com/login-help" />
        <meta name="robots" content="noindex" />
      </Helmet>
      {/* Header */}
      <div className="bg-white border-b border-slate-200">
        <div className="max-w-3xl mx-auto px-4 py-5 flex items-center justify-between">
          <Link to="/login" className="flex items-center gap-2 text-slate-700 hover:text-violet-600 transition-colors">
            <span className="font-bold text-lg tracking-tight">
              <span className="text-violet-600">IWB</span> Portal
            </span>
          </Link>
          <Link
            to="/login"
            className="text-sm text-slate-500 hover:text-violet-600 flex items-center gap-1 transition-colors"
          >
            Back to login <ChevronRight size={14} />
          </Link>
        </div>
      </div>

      <div className="max-w-3xl mx-auto px-4 py-10">
        {/* Title */}
        <div className="mb-8">
          <div className="flex items-center gap-2 text-violet-600 mb-2">
            <HelpCircle size={20} />
            <span className="text-sm font-medium uppercase tracking-wide">Login help</span>
          </div>
          <h1 className="text-2xl font-bold text-slate-900">Having trouble logging in?</h1>
          <p className="text-slate-500 mt-1">
            Work through the steps below. Most login issues are resolved in under 2 minutes.
          </p>
        </div>

        {/* Quick links */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-8">
          <Link
            to="/forgot-password"
            className="flex items-center gap-3 bg-violet-50 border border-violet-200 rounded-xl p-4 hover:bg-violet-100 transition-colors"
          >
            <div className="w-9 h-9 rounded-lg bg-violet-500 flex items-center justify-center text-white shrink-0">
              <KeyRound size={16} />
            </div>
            <div>
              <div className="font-semibold text-slate-800 text-sm">Reset password</div>
              <div className="text-xs text-slate-500">Get a reset link by email</div>
            </div>
            <ChevronRight size={16} className="ml-auto text-slate-400" />
          </Link>
          <a
            href={`mailto:${SUPPORT_EMAIL}`}
            className="flex items-center gap-3 bg-slate-100 border border-slate-200 rounded-xl p-4 hover:bg-slate-200 transition-colors"
          >
            <div className="w-9 h-9 rounded-lg bg-slate-600 flex items-center justify-center text-white shrink-0">
              <Mail size={16} />
            </div>
            <div>
              <div className="font-semibold text-slate-800 text-sm">Contact support</div>
              <div className="text-xs text-slate-500">{SUPPORT_EMAIL}</div>
            </div>
            <ExternalLink size={14} className="ml-auto text-slate-400" />
          </a>
        </div>

        {/* Help sections */}
        <div className="space-y-6">
          {sections.map((section) => (
            <div key={section.title} className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
              <div className="flex items-center gap-3 px-6 py-4 border-b border-slate-100">
                <span className={section.color}>{section.icon}</span>
                <h2 className="font-semibold text-slate-800">{section.title}</h2>
              </div>
              <div className="divide-y divide-slate-100">
                {section.steps.map((step, i) => (
                  <div key={i} className="px-6 py-4 flex gap-3">
                    <div className="w-5 h-5 rounded-full bg-slate-100 flex items-center justify-center shrink-0 mt-0.5">
                      <CheckCircle2 size={12} className="text-slate-400" />
                    </div>
                    <div>
                      <div className="font-medium text-slate-700 text-sm mb-0.5">{step.heading}</div>
                      <div className="text-sm text-slate-500 leading-relaxed">{step.body}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Still stuck */}
        <div className="mt-8 bg-amber-50 border border-amber-200 rounded-2xl p-6 flex gap-4">
          <AlertCircle size={20} className="text-amber-500 shrink-0 mt-0.5" />
          <div>
            <div className="font-semibold text-slate-800 mb-1">Still can't get in?</div>
            <p className="text-sm text-slate-600 mb-3">
              If you've tried everything above and still can't log in, contact our support team. Include your email address and a description of what's happening.
            </p>
            <a
              href={`mailto:${SUPPORT_EMAIL}?subject=Login%20Help%20Request&body=Hi%20IWILLBUILD%20Support%2C%0A%0AI%20am%20having%20trouble%20logging%20in.%0A%0AEmail%3A%20%0AWhat%20I%20tried%3A%20%0AError%20message%20(if%20any)%3A%20`}
              className="inline-flex items-center gap-2 bg-amber-500 text-white px-4 py-2 rounded-lg text-sm font-medium hover:bg-amber-600 transition-colors"
            >
              <Mail size={14} />
              Email support
            </a>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-8 text-center text-xs text-slate-400">
          <Link to="/login" className="hover:text-violet-600 transition-colors">Back to login</Link>
          {' · '}
          <Link to="/forgot-password" className="hover:text-violet-600 transition-colors">Reset password</Link>
          {' · '}
          <a href={`mailto:${SUPPORT_EMAIL}`} className="hover:text-violet-600 transition-colors">Contact support</a>
        </div>
      </div>
    </div>
  );
}
