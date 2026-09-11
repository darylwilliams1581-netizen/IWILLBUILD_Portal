import { useEffect, useState } from 'react';
import { useParams } from 'react-router';
import { Helmet } from '@dr.pogodin/react-helmet';
import { AlertTriangle, CheckCircle2, Loader2, MessageSquare } from 'lucide-react';

interface PublicHazard {
  title: string;
  description: string | null;
  category: string | null;
  hazard_source: string | null;
  who_is_at_risk: string | null;
  existing_controls: string | null;
  additional_controls: string | null;
  likelihood: string;
  consequence: string;
  risk_level: string;
  status: string;
  identified_date: string;
  photo_url: string | null;
}

interface PublicPayload {
  company: { name: string };
  hazard: PublicHazard;
}

export default function HazardPublicPage() {
  const { token = '' } = useParams();
  const [data, setData] = useState<PublicPayload | null>(null);
  const [error, setError] = useState('');
  const [name, setName] = useState('');
  const [comment, setComment] = useState('');
  const [sending, setSending] = useState<'comment' | 'close' | null>(null);
  const [message, setMessage] = useState('');

  useEffect(() => {
    let active = true;
    fetch(`/api/public/hazard/${encodeURIComponent(token)}`)
      .then(async response => {
        if (!response.ok) throw new Error((await response.json().catch(() => null))?.error || 'This hazard link is unavailable');
        return response.json() as Promise<PublicPayload>;
      })
      .then(payload => { if (active) setData(payload); })
      .catch(reason => { if (active) setError(reason instanceof Error ? reason.message : 'This hazard link is unavailable'); });
    return () => { active = false; };
  }, [token]);

  async function respond(action: 'comment' | 'close') {
    setMessage('');
    if (!name.trim() || !comment.trim()) {
      setMessage('Enter your name and a comment.');
      return;
    }
    setSending(action);
    try {
      const response = await fetch(`/api/public/hazard/${encodeURIComponent(token)}/close`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, name: name.trim(), comment: comment.trim() }),
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.error || 'Could not send your response');
      setComment('');
      setMessage(action === 'close' ? 'Hazard closed. Thank you.' : 'Comment sent. Thank you.');
      if (action === 'close') setData(current => current ? { ...current, hazard: { ...current.hazard, status: 'closed' } } : current);
    } catch (reason) {
      setMessage(reason instanceof Error ? reason.message : 'Could not send your response');
    } finally {
      setSending(null);
    }
  }

  if (error) return <main className="min-h-screen bg-slate-100 p-4 flex items-center justify-center">
      <div className="w-full max-w-lg rounded-2xl bg-white p-6 text-center shadow-sm">
        <AlertTriangle className="mx-auto mb-3 text-amber-500" size={32} />
        <h1 className="text-lg font-bold text-slate-900">Hazard link unavailable</h1>
        <p className="mt-2 text-sm text-slate-600">{error}</p>
      </div>
    </main>;

  if (!data) return <main className="min-h-screen bg-slate-100 flex items-center justify-center"><Loader2 className="animate-spin text-violet-600" size={30} /></main>;

  const hazard = data.hazard;
  return <main className="min-h-screen bg-slate-100 px-3 py-6 sm:py-10">
      <Helmet><title>{hazard.title} — {data.company.name}</title><meta name="robots" content="noindex, nofollow" /></Helmet>
      <div className="mx-auto w-full max-w-2xl overflow-hidden rounded-2xl bg-white shadow-sm">
        <header className="bg-slate-900 px-5 py-5 text-white">
          <p className="text-xs font-semibold uppercase tracking-wider text-violet-300">{data.company.name}</p>
          <h1 className="mt-1 text-xl font-bold">{hazard.title}</h1>
          <div className="mt-3 flex flex-wrap gap-2 text-xs">
            <span className="rounded-full bg-white/10 px-2.5 py-1 capitalize">{hazard.risk_level} risk</span>
            <span className="rounded-full bg-white/10 px-2.5 py-1 capitalize">{hazard.status.replace('_', ' ')}</span>
            {hazard.category && <span className="rounded-full bg-white/10 px-2.5 py-1">{hazard.category}</span>}
          </div>
        </header>

        {hazard.photo_url && <img src={hazard.photo_url} alt="Hazard" className="max-h-80 w-full object-cover" />}

        <section className="space-y-4 p-5 text-sm text-slate-700">
          {hazard.description && <Detail label="Description" value={hazard.description} />}
          {hazard.hazard_source && <Detail label="Hazard source" value={hazard.hazard_source} />}
          {hazard.who_is_at_risk && <Detail label="Who is at risk" value={hazard.who_is_at_risk} />}
          {hazard.existing_controls && <Detail label="Existing controls" value={hazard.existing_controls} />}
          {hazard.additional_controls && <Detail label="Additional controls required" value={hazard.additional_controls} highlight />}
          <div className="grid grid-cols-2 gap-3 border-t border-slate-100 pt-4 text-xs">
            <Detail label="Likelihood" value={hazard.likelihood.replace('_', ' ')} />
            <Detail label="Consequence" value={hazard.consequence} />
          </div>
        </section>

        <section className="border-t border-slate-200 bg-slate-50 p-5">
          <h2 className="flex items-center gap-2 font-bold text-slate-900"><MessageSquare size={17} /> Respond</h2>
          <p className="mt-1 text-xs text-slate-500">Add a comment, or confirm the hazard has been addressed and close it.</p>
          <div className="mt-4 space-y-3">
            <input value={name} onChange={event => setName(event.target.value)} maxLength={200} placeholder="Your name" className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm" />
            <textarea value={comment} onChange={event => setComment(event.target.value)} maxLength={2000} rows={4} placeholder="Comment or work completed" className="w-full resize-none rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm" />
            {message && <p className="text-sm text-slate-700">{message}</p>}
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <button type="button" disabled={!!sending} onClick={() => void respond('comment')} className="rounded-xl border border-violet-200 bg-white px-4 py-2.5 text-sm font-semibold text-violet-700 disabled:opacity-50">
                {sending === 'comment' ? 'Sending…' : 'Send comment'}
              </button>
              <button type="button" disabled={!!sending || hazard.status === 'closed'} onClick={() => void respond('close')} className="flex items-center justify-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-50">
                <CheckCircle2 size={16} /> {hazard.status === 'closed' ? 'Hazard closed' : sending === 'close' ? 'Closing…' : 'Close hazard'}
              </button>
            </div>
          </div>
        </section>
      </div>
    </main>;
}

function Detail({ label, value, highlight = false }: { label: string; value: string; highlight?: boolean }) {
  return <div className={highlight ? 'rounded-xl bg-amber-50 p-3' : ''}>
      <p className={`text-xs font-semibold ${highlight ? 'text-amber-700' : 'text-slate-500'}`}>{label}</p>
      <p className={`mt-1 whitespace-pre-wrap capitalize ${highlight ? 'text-amber-900' : 'text-slate-800'}`}>{value}</p>
    </div>;
}
