import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { Helmet } from '@dr.pogodin/react-helmet';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { AlertCircle, CheckCircle2, Loader2, Mail, ShieldCheck } from 'lucide-react';

interface InviteDetails {
  email: string;
  name: string | null;
  role: string;
  companyName: string;
  existingAccount: boolean;
}

export default function AcceptInvitePage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const token = searchParams.get('token') ?? '';
  const [invite, setInvite] = useState<InviteDetails | null>(null);
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    let cancelled = false;
    if (!/^[a-f0-9]{64}$/.test(token)) {
      setError('This invitation link is invalid. Ask the company owner to send another.');
      setLoading(false);
      return;
    }
    fetch(`/api/team/invites/validate?token=${encodeURIComponent(token)}`, { credentials: 'include', cache: 'no-store' })
      .then(async (response) => {
        const data = await response.json() as { invite?: InviteDetails; error?: string };
        if (!response.ok) throw new Error(data.error ?? 'Could not validate this invitation.');
        if (!cancelled && data.invite) {
          setInvite(data.invite);
          setName(data.invite.name ?? '');
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not validate this invitation.');
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [token]);

  async function acceptInvitation(event: FormEvent) {
    event.preventDefault();
    if (!invite) return;
    if (!invite.existingAccount) {
      if (!name.trim()) { setError('Enter your name.'); return; }
      if (password.length < 8 || !/[a-zA-Z]/.test(password) || !/[0-9]/.test(password) || !/[^a-zA-Z0-9]/.test(password)) {
        setError('Use at least 8 characters, including a letter, number and symbol.');
        return;
      }
      if (password !== confirmPassword) { setError('The passwords do not match.'); return; }
      if (!acceptedTerms) { setError('Please accept the Terms and Privacy Policy to create your account.'); return; }
    }
    setSubmitting(true);
    setError('');
    try {
      const response = await fetch('/api/team/invites/accept', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, ...(invite.existingAccount ? {} : { name: name.trim(), password }) }),
      });
      const data = await response.json() as { ok?: boolean; message?: string; error?: string };
      if (!response.ok) throw new Error(data.error ?? 'Could not accept this invitation.');
      setSuccess(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not accept this invitation.');
    } finally {
      setSubmitting(false);
    }
  }

  const roleLabel = invite?.role === 'readonly' ? 'Read Only' : invite?.role ? invite.role[0].toUpperCase() + invite.role.slice(1) : '';

  return <main className="relative flex min-h-[100dvh] items-center justify-center overflow-hidden bg-[#0F1117] px-4 py-10 text-white">
    <Helmet>
      <title>Accept Team Invitation — IWILLBUILD</title>
      <meta name="robots" content="noindex" />
    </Helmet>
    <div className="absolute inset-0 opacity-[0.05]" style={{ backgroundImage: 'linear-gradient(rgba(124,58,237,0.8) 1px, transparent 1px), linear-gradient(90deg, rgba(124,58,237,0.8) 1px, transparent 1px)', backgroundSize: '40px 40px' }} />
    <section className="relative z-10 w-full max-w-md rounded-2xl border border-white/10 bg-[#171A23] p-6 shadow-2xl sm:p-8">
      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-violet-600/20 text-violet-300"><Mail size={21} /></div>
        <div><p className="text-xs font-bold uppercase tracking-wider text-violet-300">IWILLBUILD</p><h1 className="text-xl font-bold">Accept invitation</h1></div>
      </div>

      {loading ? <div className="flex items-center gap-2 py-8 text-sm text-slate-300"><Loader2 size={18} className="animate-spin" />Checking your invitation…</div> : null}
      {!loading && invite && !success ? <>
        <p className="text-sm leading-6 text-slate-300">You’ve been invited to join <strong className="text-white">{invite.companyName}</strong> as a <strong className="text-white">{roleLabel}</strong>.</p>
        <p className="mt-2 break-all text-sm text-slate-400">{invite.email}</p>
        <form onSubmit={acceptInvitation} className="mt-6 flex flex-col gap-4">
          {!invite.existingAccount ? <>
            <label className="text-xs font-semibold text-slate-300">Your name
              <input value={name} onChange={e => setName(e.target.value)} autoComplete="name" required className="mt-1.5 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-3 text-sm text-white outline-none focus:border-violet-500" />
            </label>
            <label className="text-xs font-semibold text-slate-300">Create a password
              <input type="password" value={password} onChange={e => setPassword(e.target.value)} autoComplete="new-password" required className="mt-1.5 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-3 text-sm text-white outline-none focus:border-violet-500" />
            </label>
            <label className="text-xs font-semibold text-slate-300">Confirm password
              <input type="password" value={confirmPassword} onChange={e => setConfirmPassword(e.target.value)} autoComplete="new-password" required className="mt-1.5 w-full rounded-lg border border-white/10 bg-white/5 px-3 py-3 text-sm text-white outline-none focus:border-violet-500" />
            </label>
            <label className="flex items-start gap-2 text-xs leading-5 text-slate-400">
              <input type="checkbox" checked={acceptedTerms} onChange={e => setAcceptedTerms(e.target.checked)} className="mt-1" />
              <span>I agree to the <Link className="text-violet-300 underline" to="/terms">Terms</Link> and acknowledge the <Link className="text-violet-300 underline" to="/privacy">Privacy Policy</Link>.</span>
            </label>
            <p className="text-xs leading-5 text-slate-500">Your invitation verifies this email address. You can reset your password later from the sign-in page.</p>
          </> : <div className="rounded-xl border border-white/10 bg-white/5 p-4 text-sm leading-6 text-slate-300">
            This email already has an IWILLBUILD login. Sign in to that account, then accept the invitation here.
            <Link to="/login" target="_blank" rel="noreferrer" className="mt-3 block font-semibold text-violet-300 underline">Open sign in in another tab</Link>
          </div>}
          {error && <div role="alert" className="flex gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-200"><AlertCircle size={14} className="mt-0.5 shrink-0" />{error}</div>}
          <button type="submit" disabled={submitting} className="mt-1 flex min-h-12 items-center justify-center gap-2 rounded-xl bg-violet-600 px-4 py-3 text-sm font-bold text-white hover:bg-violet-500 disabled:opacity-60">
            {submitting ? <Loader2 size={16} className="animate-spin" /> : <ShieldCheck size={16} />}
            {invite.existingAccount ? 'Accept invitation' : 'Create account and join'}
          </button>
        </form>
      </> : null}

      {success && invite ? <div className="py-2">
        <div className="flex items-center gap-3 rounded-xl border border-emerald-500/20 bg-emerald-500/10 p-4 text-emerald-200"><CheckCircle2 size={20} /><p className="text-sm font-semibold">You’ve joined {invite.companyName}.</p></div>
        <p className="mt-4 text-sm leading-6 text-slate-300">Sign in with <strong>{invite.email}</strong> and the password you just set.</p>
        <button type="button" onClick={() => navigate('/login', { replace: true })} className="mt-5 w-full rounded-xl bg-violet-600 px-4 py-3 text-sm font-bold hover:bg-violet-500">Go to sign in</button>
      </div> : null}
      {!loading && !invite && error ? <div role="alert" className="flex gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-3 text-sm text-red-200"><AlertCircle size={16} className="mt-0.5 shrink-0" />{error}</div> : null}
    </section>
  </main>;
}
