/**
 * /jobs/:id/signin
 *
 * QR scan landing page — mobile-first, works unauthenticated.
 *
 * Query params:
 *   mode  : 'signin' | 'signout'
 *   token : signed QR token
 *
 * Authenticated users: action applied immediately (no form).
 * Guests: full check-in form required.
 */
import { useState, useEffect } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { Helmet } from '@dr.pogodin/react-helmet';
import {
  LogIn, LogOut, Loader2, CheckCircle2, AlertCircle,
  HardHat, User, Phone, Mail, CreditCard, Calendar,
  MessageSquare, Shield,
} from 'lucide-react';

type Mode = 'signin' | 'signout';
type Stage = 'loading' | 'form' | 'success' | 'error';

interface GuestForm {
  full_name: string;
  phone_number: string;
  email: string;
  white_card_number: string;
  white_card_expiry: string;
  contact_name: string;
  contact_phone: string;
  reason_for_visit: string;
}

const EMPTY_FORM: GuestForm = {
  full_name: '',
  phone_number: '',
  email: '',
  white_card_number: '',
  white_card_expiry: '',
  contact_name: '',
  contact_phone: '',
  reason_for_visit: '',
};

export default function JobSignInPage() {
  const { id } = useParams<{ id: string }>();
  const [searchParams] = useSearchParams();

  const mode  = (searchParams.get('mode') ?? 'signin') as Mode;
  const token = searchParams.get('token') ?? '';
  const jobId = parseInt(id ?? '0');

  const [stage, setStage]       = useState<Stage>('loading');
  const [message, setMessage]   = useState('');
  const [isGuest, setIsGuest]   = useState(false);
  const [form, setForm]         = useState<GuestForm>(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Partial<GuestForm>>({});
  const [jobName, setJobName]   = useState<string>('');

  // ── On mount: try authenticated action first ──────────────────────────────
  useEffect(() => {
    if (!token) {
      setStage('error');
      setMessage('Invalid or missing QR code. Please scan a valid QR code.');
      return;
    }

    void tryAuthenticatedAction();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function tryAuthenticatedAction() {
    setStage('loading');
    try {
      const endpoint = mode === 'signin' ? 'signin-qr' : 'signout-qr';
      const res = await fetch(`/api/jobs/${jobId}/${endpoint}`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });
      const data = await res.json() as {
        ok?: boolean;
        isGuest?: boolean;
        message?: string;
        error?: string;
        missing?: string[];
        alreadySignedIn?: boolean;
        notSignedIn?: boolean;
      };

      if (res.status === 400 && data.missing && data.missing.length > 0) {
        // Server says guest fields required — show form
        setIsGuest(true);
        setStage('form');
        return;
      }

      if (!res.ok) {
        setStage('error');
        setMessage(data.error ?? 'Something went wrong. Please try again.');
        return;
      }

      // Success (authenticated or already-state)
      setMessage(data.message ?? (mode === 'signin' ? 'Signed in successfully.' : 'Signed out successfully.'));
      setStage('success');
    } catch {
      // Network error — show form (assume guest)
      setIsGuest(true);
      setStage('form');
    }
  }

  function validate(): boolean {
    const errs: Partial<GuestForm> = {};
    if (!form.full_name.trim())         errs.full_name         = 'Required';
    if (!form.phone_number.trim())      errs.phone_number      = 'Required';
    if (!form.white_card_number.trim()) errs.white_card_number = 'Required';
    if (!form.white_card_expiry.trim()) errs.white_card_expiry = 'Required';
    if (!form.contact_name.trim())      errs.contact_name      = 'Required';
    if (!form.contact_phone.trim())     errs.contact_phone     = 'Required';
    if (!form.reason_for_visit.trim())  errs.reason_for_visit  = 'Required';
    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  }

  async function submitGuestForm() {
    if (!validate()) return;
    setSubmitting(true);
    try {
      const endpoint = mode === 'signin' ? 'signin-qr' : 'signout-qr';
      const res = await fetch(`/api/jobs/${jobId}/${endpoint}`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, ...form }),
      });
      const data = await res.json() as { ok?: boolean; message?: string; error?: string };
      if (!res.ok) {
        setStage('error');
        setMessage(data.error ?? 'Submission failed. Please try again.');
        return;
      }
      setMessage(data.message ?? (mode === 'signin' ? 'Check-in recorded.' : 'Sign-out recorded.'));
      setStage('success');
    } catch {
      setStage('error');
      setMessage('Network error. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  function Field({
    label, name, type = 'text', placeholder, required = true,
  }: {
    label: string;
    name: keyof GuestForm;
    type?: string;
    placeholder?: string;
    required?: boolean;
  }) {
    return (
      <div>
        <label className="block text-sm font-semibold text-slate-700 mb-1">
          {label}{required && <span className="text-red-500 ml-0.5">*</span>}
        </label>
        <input
          type={type}
          value={form[name]}
          onChange={(e) => {
            setForm((f) => ({ ...f, [name]: e.target.value }));
            if (fieldErrors[name]) setFieldErrors((fe) => ({ ...fe, [name]: undefined }));
          }}
          placeholder={placeholder}
          className={`w-full px-3 py-3 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-400/40 transition-colors ${
            fieldErrors[name]
              ? 'border-red-400 bg-red-50'
              : 'border-slate-200 bg-white'
          }`}
        />
        {fieldErrors[name] && (
          <p className="text-xs text-red-500 mt-1">{fieldErrors[name]}</p>
        )}
      </div>
    );
  }

  const isSignIn = mode === 'signin';

  return (
    <>
      <Helmet>
        <title>{isSignIn ? 'Job Sign In' : 'Job Sign Out'} — IWILLBUILD</title>
        <meta name="description" content="Scan to sign in or sign out of a job site. Guests complete a check-in form." />
        <link rel="canonical" href={`https://iwillbuild.com/jobs/${jobId}/signin`} />
        <meta name="robots" content="noindex, nofollow" />
      </Helmet>

      <div className="min-h-screen bg-slate-50 flex flex-col">
        {/* Header */}
        <div className={`px-4 py-5 text-white ${isSignIn ? 'bg-green-600' : 'bg-slate-700'}`}>
          <div className="max-w-md mx-auto flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center flex-shrink-0">
              {isSignIn ? <LogIn size={20} /> : <LogOut size={20} />}
            </div>
            <div>
              <h1 className="text-lg font-bold">
                {isSignIn ? 'Job Sign In' : 'Job Sign Out'}
              </h1>
              {jobName && <p className="text-sm opacity-80">{jobName}</p>}
            </div>
          </div>
        </div>

        <div className="flex-1 flex flex-col items-center justify-start px-4 py-6">
          <div className="w-full max-w-md space-y-4">

            {/* ── Loading ─────────────────────────────────────────────── */}
            {stage === 'loading' && (
              <div className="bg-white rounded-2xl border border-slate-200 p-8 flex flex-col items-center gap-3 text-center">
                <Loader2 size={32} className="animate-spin text-orange-500" />
                <p className="text-slate-600 font-medium">Verifying QR code…</p>
              </div>
            )}

            {/* ── Success ─────────────────────────────────────────────── */}
            {stage === 'success' && (
              <div className="bg-white rounded-2xl border border-green-200 p-8 flex flex-col items-center gap-3 text-center">
                <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center">
                  <CheckCircle2 size={32} className="text-green-600" />
                </div>
                <h2 className="text-xl font-bold text-slate-800">
                  {isSignIn ? 'Signed In' : 'Signed Out'}
                </h2>
                <p className="text-slate-500 text-sm">{message}</p>
                <p className="text-xs text-slate-400 mt-2">
                  {new Date().toLocaleString('en-AU')}
                </p>
              </div>
            )}

            {/* ── Error ───────────────────────────────────────────────── */}
            {stage === 'error' && (
              <div className="bg-white rounded-2xl border border-red-200 p-8 flex flex-col items-center gap-3 text-center">
                <div className="w-16 h-16 rounded-full bg-red-100 flex items-center justify-center">
                  <AlertCircle size={32} className="text-red-500" />
                </div>
                <h2 className="text-xl font-bold text-slate-800">Unable to process</h2>
                <p className="text-slate-500 text-sm">{message}</p>
                <p className="text-xs text-slate-400 mt-1">
                  If this QR code has expired, please ask for a new one to be generated.
                </p>
              </div>
            )}

            {/* ── Guest form ───────────────────────────────────────────── */}
            {stage === 'form' && (
              <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
                <div className="px-5 py-4 border-b border-slate-100 bg-slate-50">
                  <div className="flex items-center gap-2">
                    <HardHat size={18} className="text-orange-500" />
                    <h2 className="font-bold text-slate-800">
                      {isSignIn ? 'Guest Check-In' : 'Guest Sign-Out'}
                    </h2>
                  </div>
                  <p className="text-xs text-slate-500 mt-1">
                    Please complete all required fields to {isSignIn ? 'sign in to' : 'sign out of'} this job.
                  </p>
                </div>

                <div className="p-5 space-y-4">
                  {/* Personal details */}
                  <div>
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-3 flex items-center gap-1.5">
                      <User size={11} />
                      Your details
                    </p>
                    <div className="space-y-3">
                      <Field label="Full name" name="full_name" placeholder="Jane Smith" />
                      <Field label="Phone number" name="phone_number" type="tel" placeholder="+61 4xx xxx xxx" />
                      <Field label="Email" name="email" type="email" placeholder="jane@example.com" required={false} />
                    </div>
                  </div>

                  {/* White card */}
                  <div>
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-3 flex items-center gap-1.5">
                      <Shield size={11} />
                      White card / induction
                    </p>
                    <div className="space-y-3">
                      <Field label="White card number" name="white_card_number" placeholder="WC-XXXXXXXX" />
                      <Field label="White card expiry" name="white_card_expiry" type="date" />
                    </div>
                  </div>

                  {/* Emergency contact */}
                  <div>
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-wide mb-3 flex items-center gap-1.5">
                      <Phone size={11} />
                      Emergency contact
                    </p>
                    <div className="space-y-3">
                      <Field label="Contact name" name="contact_name" placeholder="John Smith" />
                      <Field label="Contact phone" name="contact_phone" type="tel" placeholder="+61 4xx xxx xxx" />
                    </div>
                  </div>

                  {/* Reason */}
                  <div>
                    <label className="block text-sm font-semibold text-slate-700 mb-1">
                      Reason for visit<span className="text-red-500 ml-0.5">*</span>
                    </label>
                    <textarea
                      value={form.reason_for_visit}
                      onChange={(e) => {
                        setForm((f) => ({ ...f, reason_for_visit: e.target.value }));
                        if (fieldErrors.reason_for_visit) setFieldErrors((fe) => ({ ...fe, reason_for_visit: undefined }));
                      }}
                      rows={3}
                      placeholder="Briefly describe why you are visiting this site…"
                      className={`w-full px-3 py-3 border rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-orange-400/40 resize-none transition-colors ${
                        fieldErrors.reason_for_visit ? 'border-red-400 bg-red-50' : 'border-slate-200 bg-white'
                      }`}
                    />
                    {fieldErrors.reason_for_visit && (
                      <p className="text-xs text-red-500 mt-1">{fieldErrors.reason_for_visit}</p>
                    )}
                  </div>

                  <button
                    onClick={submitGuestForm}
                    disabled={submitting}
                    className={`w-full flex items-center justify-center gap-2 py-3.5 text-white font-bold rounded-xl transition-colors ${
                      isSignIn
                        ? 'bg-green-600 hover:bg-green-700 disabled:opacity-50'
                        : 'bg-slate-700 hover:bg-slate-800 disabled:opacity-50'
                    }`}
                  >
                    {submitting ? (
                      <Loader2 size={18} className="animate-spin" />
                    ) : isSignIn ? (
                      <LogIn size={18} />
                    ) : (
                      <LogOut size={18} />
                    )}
                    {submitting
                      ? 'Submitting…'
                      : isSignIn ? 'Sign In to Job' : 'Sign Out of Job'}
                  </button>
                </div>
              </div>
            )}

          </div>
        </div>
      </div>
    </>
  );
}
