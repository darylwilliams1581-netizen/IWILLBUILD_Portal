/**
 * /hazard/:token — Public hazard share page
 *
 * Mobile-first, no authentication required.
 * Shows: company name, hazard title/description/category/risk level,
 * controls, snapshot photo, status, and any public comments/closures.
 * Allows: add a comment, mark closed.
 */

import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router';
import { Helmet } from '@dr.pogodin/react-helmet';
import { ShieldAlert, CheckCircle2, MessageSquare, Loader2, AlertTriangle, XCircle } from 'lucide-react';
import { riskLevelStyle, statusStyle, STATUS_OPTIONS, RISK_LEVEL_OPTIONS } from './risk-register';

// ── Types ─────────────────────────────────────────────────────────────────────

interface PublicHazard {
  id: number;
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

interface PublicComment {
  id: number;
  commenter_name: string;
  comment: string;
  action_taken: string;
  previous_status: string | null;
  new_status: string | null;
  created_at: string;
}

interface PublicHazardData {
  hazard: PublicHazard;
  company: { name: string } | null;
  comments: PublicComment[];
}

// ── Page ──────────────────────────────────────────────────────────────────────

export default function HazardPublicPage() {
  const { token } = useParams<{ token: string }>();
  const [data, setData] = useState<PublicHazardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [revoked, setRevoked] = useState(false);

  // Form state
  const [name, setName] = useState('');
  const [comment, setComment] = useState('');
  const [markClosed, setMarkClosed] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (!token) return;
    void (async () => {
      try {
        const r = await fetch(`/api/public/hazard/${token}`);
        if (r.status === 410) { setRevoked(true); setLoading(false); return; }
        if (!r.ok) { setError('This link is not valid or has expired.'); setLoading(false); return; }
        setData(await r.json() as PublicHazardData);
      } catch {
        setError('Failed to load hazard details.');
      } finally {
        setLoading(false);
      }
    })();
  }, [token]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!name.trim()) { setSubmitError('Please enter your name.'); return; }
    if (!comment.trim()) { setSubmitError('Please add a comment.'); return; }
    setSubmitting(true);
    setSubmitError('');
    try {
      const r = await fetch(`/api/public/hazard/${token}/close`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ commenter_name: name, comment, mark_closed: markClosed }),
      });
      if (!r.ok) {
        const d = await r.json() as { error?: string };
        throw new Error(d.error ?? 'Submission failed');
      }
      const result = await r.json() as { new_status: string };
      // Update local state
      setData(prev => prev ? {
        ...prev,
        hazard: { ...prev.hazard, status: result.new_status },
        comments: [...prev.comments, {
          id: Date.now(),
          commenter_name: name,
          comment,
          action_taken: markClosed ? 'closed' : 'comment',
          previous_status: prev.hazard.status,
          new_status: result.new_status,
          created_at: new Date().toISOString(),
        }],
      } : prev);
      setSubmitted(true);
    } catch (err) {
      setSubmitError(err instanceof Error ? err.message : 'Submission failed');
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) return (
    <div className="min-h-screen bg-slate-50 flex items-center justify-center">
      <Loader2 size={32} className="animate-spin text-orange-400" />
    </div>
  );

  if (revoked) return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 text-center">
      <Helmet><title>Link Revoked — IWillBuild</title></Helmet>
      <XCircle size={48} className="text-slate-300 mb-4" />
      <h1 className="text-xl font-bold text-slate-700 mb-2">This link has been revoked</h1>
      <p className="text-slate-400 text-sm">The person who shared this hazard has disabled the link.</p>
    </div>
  );

  if (error || !data) return (
    <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6 text-center">
      <Helmet><title>Hazard Not Found — IWillBuild</title></Helmet>
      <AlertTriangle size={48} className="text-slate-300 mb-4" />
      <h1 className="text-xl font-bold text-slate-700 mb-2">Hazard not found</h1>
      <p className="text-slate-400 text-sm">{error ?? 'This link is not valid or has expired.'}</p>
    </div>
  );

  const { hazard, company, comments } = data;
  const isClosed = hazard.status === 'closed';
  const statusLabel = STATUS_OPTIONS.find(s => s.value === hazard.status)?.label ?? hazard.status;
  const riskLabel = RISK_LEVEL_OPTIONS.find(r => r.value === hazard.risk_level)?.label ?? hazard.risk_level;

  return (
    <div className="min-h-screen bg-slate-50">
      <Helmet>
        <title>{hazard.title} — Hazard Register</title>
        <meta name="description" content={`Hazard: ${hazard.title}. Risk level: ${riskLabel}. Status: ${statusLabel}.`} />
        <meta name="robots" content="noindex, nofollow" />
        <link rel="canonical" href={`https://iwillbuild.com/hazard/${token ?? ''}`} />
      </Helmet>

      {/* Header */}
      <div className="bg-orange-600 text-white px-4 pt-10 pb-6">
        <div className="max-w-lg mx-auto">
          <div className="flex items-center gap-2 mb-1">
            <ShieldAlert size={18} className="text-orange-200" />
            <span className="text-orange-200 text-xs font-semibold uppercase tracking-wide">Hazard Register</span>
          </div>
          {company && <p className="text-orange-100 text-sm mb-2">{company.name}</p>}
          <h1 className="text-xl font-bold leading-snug">{hazard.title}</h1>
          <div className="flex items-center gap-2 mt-3 flex-wrap">
            <span className={`text-xs font-bold px-3 py-1 rounded-full border ${riskLevelStyle(hazard.risk_level)}`}>
              {riskLabel} risk
            </span>
            <span className={`text-xs font-semibold px-3 py-1 rounded-full ${statusStyle(hazard.status)}`}>
              {statusLabel}
            </span>
          </div>
        </div>
      </div>

      <div className="max-w-lg mx-auto px-4 py-6 space-y-5">

        {/* Snapshot photo */}
        {hazard.photo_url && (
          <div className="rounded-2xl overflow-hidden shadow-sm border border-slate-100">
            <img
              src={hazard.photo_url}
              alt="Hazard photo"
              className="w-full object-cover max-h-72"
              loading="eager"
            />
          </div>
        )}

        {/* Details card */}
        <div className="bg-white rounded-2xl shadow-sm border border-slate-100 divide-y divide-slate-50">
          {hazard.category && (
            <div className="px-4 py-3">
              <p className="text-xs text-slate-400 mb-0.5">Category</p>
              <p className="text-sm font-medium text-slate-800">{hazard.category}</p>
            </div>
          )}
          {hazard.description && (
            <div className="px-4 py-3">
              <p className="text-xs text-slate-400 mb-0.5">Description</p>
              <p className="text-sm text-slate-700">{hazard.description}</p>
            </div>
          )}
          {hazard.hazard_source && (
            <div className="px-4 py-3">
              <p className="text-xs text-slate-400 mb-0.5">Hazard source</p>
              <p className="text-sm text-slate-700">{hazard.hazard_source}</p>
            </div>
          )}
          {hazard.who_is_at_risk && (
            <div className="px-4 py-3">
              <p className="text-xs text-slate-400 mb-0.5">Who is at risk</p>
              <p className="text-sm text-slate-700">{hazard.who_is_at_risk}</p>
            </div>
          )}
          {hazard.existing_controls && (
            <div className="px-4 py-3">
              <p className="text-xs text-slate-400 mb-0.5">Existing controls</p>
              <p className="text-sm text-slate-700">{hazard.existing_controls}</p>
            </div>
          )}
          {hazard.additional_controls && (
            <div className="px-4 py-3 bg-amber-50">
              <p className="text-xs font-semibold text-amber-700 mb-0.5">Additional controls required</p>
              <p className="text-sm text-amber-800">{hazard.additional_controls}</p>
            </div>
          )}
          <div className="px-4 py-3">
            <p className="text-xs text-slate-400 mb-0.5">Date identified</p>
            <p className="text-sm text-slate-700">
              {new Date(hazard.identified_date).toLocaleDateString('en-AU', { day: 'numeric', month: 'long', year: 'numeric' })}
            </p>
          </div>
        </div>

        {/* Existing public comments */}
        {comments.length > 0 && (
          <div className="space-y-3">
            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Comments & actions</p>
            {comments.map(c => (
              <div key={c.id} className={`bg-white rounded-2xl border shadow-sm px-4 py-3 ${c.action_taken === 'closed' ? 'border-emerald-200' : 'border-slate-100'}`}>
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm font-semibold text-slate-800">{c.commenter_name}</p>
                  {c.action_taken === 'closed' && (
                    <span className="flex items-center gap-1 text-xs font-semibold text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full shrink-0">
                      <CheckCircle2 size={10} /> Closed
                    </span>
                  )}
                </div>
                <p className="text-sm text-slate-600 mt-1">{c.comment}</p>
                <p className="text-xs text-slate-400 mt-1.5">
                  {new Date(c.created_at).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
            ))}
          </div>
        )}

        {/* Comment / close form */}
        {submitted ? (
          <div className="bg-emerald-50 border border-emerald-200 rounded-2xl px-5 py-6 text-center">
            <CheckCircle2 size={32} className="text-emerald-500 mx-auto mb-2" />
            <p className="font-bold text-emerald-800 text-base">Submitted</p>
            <p className="text-emerald-600 text-sm mt-1">
              {markClosed ? 'The hazard has been marked closed.' : 'Your comment has been recorded.'}
            </p>
          </div>
        ) : (
          <div className="bg-white rounded-2xl shadow-sm border border-slate-100 px-4 py-5">
            <div className="flex items-center gap-2 mb-4">
              <MessageSquare size={16} className="text-orange-500" />
              <p className="font-semibold text-slate-800 text-sm">Add a comment</p>
            </div>
            <form onSubmit={e => void handleSubmit(e)} className="space-y-3">
              {submitError && (
                <div className="bg-red-50 border border-red-200 text-red-700 text-sm px-3 py-2 rounded-xl">{submitError}</div>
              )}
              <div>
                <label className="text-xs font-semibold text-slate-600 mb-1 block">Your name <span className="text-red-500">*</span></label>
                <input
                  type="text"
                  value={name}
                  onChange={e => setName(e.target.value)}
                  placeholder="Enter your name"
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400"
                  required
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-slate-600 mb-1 block">Comment <span className="text-red-500">*</span></label>
                <textarea
                  value={comment}
                  onChange={e => setComment(e.target.value)}
                  rows={3}
                  placeholder="Describe what you observed or the action taken…"
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-orange-400 resize-none"
                  required
                />
              </div>
              {!isClosed && (
                <label className="flex items-center gap-2.5 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={markClosed}
                    onChange={e => setMarkClosed(e.target.checked)}
                    className="w-4 h-4 rounded accent-emerald-600"
                  />
                  <span className="text-sm text-slate-700">Mark this hazard as closed</span>
                </label>
              )}
              <button
                type="submit"
                disabled={submitting}
                className="w-full py-3 rounded-xl bg-orange-500 hover:bg-orange-600 text-white text-sm font-bold transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
              >
                {submitting ? <Loader2 size={14} className="animate-spin" /> : <MessageSquare size={14} />}
                {submitting ? 'Submitting…' : markClosed ? 'Submit & close hazard' : 'Submit comment'}
              </button>
            </form>
          </div>
        )}

        {/* Footer */}
        <p className="text-center text-xs text-slate-300 pb-6">
          Powered by IWillBuild · Hazard Register
        </p>
      </div>
    </div>
  );
}
