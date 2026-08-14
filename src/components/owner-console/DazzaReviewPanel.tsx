/**
 * DazzaReviewPanel — Owner-only Dazza Review section inside a Bug Case.
 *
 * Behaviour:
 * - On first mount (owner opens case), calls ensure endpoint once.
 * - Idempotent: refreshing / multiple tabs never trigger a second AI call.
 * - Shows versioned comments in append-only order.
 * - Detects new evidence and shows "Review New Evidence" button (no auto-AI).
 * - Copy buttons only copy text — no code changes, no deploys.
 */
import { useState, useEffect, useRef, useCallback } from 'react';
import {
  Bot, Loader2, RefreshCw, Copy, CheckCircle2, AlertTriangle,
  ChevronDown, ChevronUp, Zap, Search, Wrench, Send, Shield,
  Clock, RotateCcw, FileText,
} from 'lucide-react';
import type { BugReportRow } from '@/lib/bugReportBundleClient';

// ── Types ─────────────────────────────────────────────────────────────────────

interface DazzaComment {
  id: string;
  version_label: string;
  review_status: 'queued' | 'reviewing' | 'complete' | 'failed';
  what_happened: string | null;
  what_found: string | null;
  likely_cause: string | null;
  recommended_fix: string | null;
  airo_prompt: string | null;
  confidence: number | null;
  failure_reason: string | null;
  created_at: string;
  completed_at: string | null;
}

interface Props {
  report: BugReportRow;
  /** Snapshot of evidence fields used to detect new evidence after initial review */
  evidenceSnapshot: string;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function fmtDate(d: string | null): string {
  if (!d) return '';
  return new Date(d).toLocaleString('en-AU', {
    day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
  });
}

function bulletLines(text: string | null): string[] {
  if (!text) return [];
  return text.split('\n').map(l => l.trim()).filter(Boolean);
}

const VERSION_COLORS: Record<string, string> = {
  'Dazza Initial Review':         'bg-violet-600',
  'Dazza Evidence Update':        'bg-indigo-600',
  'Dazza Recurrence Review':      'bg-amber-600',
  'Dazza Post-Fix Verification':  'bg-emerald-600',
};

function versionColor(label: string): string {
  return VERSION_COLORS[label] ?? 'bg-slate-600';
}

// ── Copy button ───────────────────────────────────────────────────────────────

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  function handleCopy() {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {});
  }
  return (
    <button
      onClick={handleCopy}
      className="flex items-center gap-1 text-[10px] font-semibold text-slate-500 hover:text-slate-700 transition-colors"
    >
      {copied ? <CheckCircle2 size={10} className="text-emerald-500" /> : <Copy size={10} />}
      {copied ? 'Copied!' : label}
    </button>
  );
}

// ── Single comment card ───────────────────────────────────────────────────────

function CommentCard({ comment }: { comment: DazzaComment }) {
  const [expanded, setExpanded] = useState(true);
  const color = versionColor(comment.version_label);

  if (comment.review_status === 'reviewing' || comment.review_status === 'queued') {
    return (
      <div className="border border-violet-200 rounded-xl overflow-hidden">
        <div className={`flex items-center gap-2 px-4 py-2.5 ${color}`}>
          <Loader2 size={12} className="text-white animate-spin" />
          <span className="text-xs font-bold text-white">{comment.version_label}</span>
        </div>
        <div className="px-4 py-4 flex items-center gap-2 text-sm text-slate-500">
          <Loader2 size={14} className="animate-spin text-violet-400" />
          Dazza is reviewing the report, screenshots, diagnostics and related history…
        </div>
      </div>
    );
  }

  if (comment.review_status === 'failed') {
    return (
      <div className="border border-red-200 rounded-xl overflow-hidden">
        <div className={`flex items-center gap-2 px-4 py-2.5 ${color}`}>
          <AlertTriangle size={12} className="text-white" />
          <span className="text-xs font-bold text-white">{comment.version_label}</span>
          <span className="text-[10px] text-white/70 ml-auto">{fmtDate(comment.created_at)}</span>
        </div>
        <div className="px-4 py-3 flex items-start gap-2 text-xs text-red-600">
          <AlertTriangle size={13} className="shrink-0 mt-0.5" />
          <div>
            <p className="font-semibold">Dazza review failed.</p>
            {comment.failure_reason && (
              <p className="text-slate-500 mt-1 font-mono text-[10px]">{comment.failure_reason}</p>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Complete
  const fullReview = [
    `# ${comment.version_label}`,
    `\n## What happened\n${comment.what_happened ?? ''}`,
    `\n## What Dazza found\n${comment.what_found ?? ''}`,
    `\n## Likely cause\n${comment.likely_cause ?? ''}`,
    `\n## Recommended fix\n${comment.recommended_fix ?? ''}`,
    `\n## Airo fix prompt\n${comment.airo_prompt ?? ''}`,
  ].join('\n');

  return (
    <div className="border border-slate-200 rounded-xl overflow-hidden">
      {/* Header */}
      <button
        type="button"
        onClick={() => setExpanded(v => !v)}
        className={`w-full flex items-center gap-2 px-4 py-2.5 ${color} hover:opacity-90 transition-opacity`}
      >
        <Shield size={12} className="text-white shrink-0" />
        <span className="text-xs font-bold text-white flex-1 text-left">{comment.version_label}</span>
        {comment.confidence !== null && (
          <span className="text-[10px] text-white/80 font-semibold">
            {comment.confidence}% confidence
          </span>
        )}
        <span className="text-[10px] text-white/60">{fmtDate(comment.completed_at ?? comment.created_at)}</span>
        {expanded ? <ChevronUp size={12} className="text-white/70" /> : <ChevronDown size={12} className="text-white/70" />}
      </button>

      {expanded && (
        <div className="divide-y divide-slate-100">
          {/* What happened */}
          {comment.what_happened && (
            <div className="px-4 py-3">
              <p className="text-[10px] font-bold text-violet-600 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                <Zap size={10} /> What happened
              </p>
              <p className="text-xs text-slate-700 leading-relaxed">{comment.what_happened}</p>
            </div>
          )}

          {/* What Dazza found */}
          {comment.what_found && (
            <div className="px-4 py-3">
              <p className="text-[10px] font-bold text-blue-600 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                <Search size={10} /> What Dazza found
              </p>
              <ul className="flex flex-col gap-0.5">
                {bulletLines(comment.what_found).map((line, i) => (
                  <li key={i} className="text-xs text-slate-700 leading-relaxed flex items-start gap-1.5">
                    <span className="text-blue-400 shrink-0 mt-0.5">•</span>
                    <span>{line.replace(/^[•\-]\s*/, '')}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Likely cause */}
          {comment.likely_cause && (
            <div className="px-4 py-3">
              <p className="text-[10px] font-bold text-amber-600 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                <AlertTriangle size={10} /> Likely cause
              </p>
              <p className="text-xs text-slate-700 leading-relaxed whitespace-pre-wrap">{comment.likely_cause}</p>
            </div>
          )}

          {/* Recommended fix */}
          {comment.recommended_fix && (
            <div className="px-4 py-3">
              <p className="text-[10px] font-bold text-emerald-600 uppercase tracking-wider mb-1.5 flex items-center gap-1">
                <Wrench size={10} /> Recommended fix
              </p>
              <ul className="flex flex-col gap-0.5">
                {bulletLines(comment.recommended_fix).map((line, i) => (
                  <li key={i} className="text-xs text-slate-700 leading-relaxed flex items-start gap-1.5">
                    <span className="text-emerald-400 shrink-0 mt-0.5">•</span>
                    <span>{line.replace(/^[•\-]\s*/, '')}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Airo prompt */}
          {comment.airo_prompt && (
            <div className="px-4 py-3">
              <div className="flex items-center justify-between mb-1.5">
                <p className="text-[10px] font-bold text-orange-600 uppercase tracking-wider flex items-center gap-1">
                  <Send size={10} /> Airo fix prompt
                </p>
                <div className="flex items-center gap-3">
                  <CopyButton text={comment.airo_prompt} label="Copy Airo Prompt" />
                  <CopyButton text={fullReview} label="Copy Full Review" />
                </div>
              </div>
              <pre className="text-[11px] text-slate-700 leading-relaxed whitespace-pre-wrap font-mono bg-orange-50 border border-orange-100 rounded-lg p-3 max-h-48 overflow-y-auto">
                {comment.airo_prompt}
              </pre>
            </div>
          )}

          {/* Copy full review (if no airo prompt) */}
          {!comment.airo_prompt && (
            <div className="px-4 py-2 flex justify-end">
              <CopyButton text={fullReview} label="Copy Full Review" />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main panel ────────────────────────────────────────────────────────────────

export default function DazzaReviewPanel({ report, evidenceSnapshot }: Props) {
  const [comments, setComments]         = useState<DazzaComment[]>([]);
  const [loading, setLoading]           = useState(true);
  const [ensureError, setEnsureError]   = useState('');
  const [runningEvidence, setRunningEvidence] = useState(false);
  const [evidenceError, setEvidenceError]     = useState('');
  const [newEvidenceDetected, setNewEvidenceDetected] = useState(false);

  // Track the evidence snapshot at the time of the last completed review
  const lastReviewedSnapshot = useRef<string>('');
  const ensureCalled = useRef(false);

  const fetchComments = useCallback(async () => {
    try {
      const res = await fetch(`/api/bug-reports/${report.id}/dazza-review/comments`, {
        credentials: 'include',
      });
      if (!res.ok) return;
      const d = await res.json() as { comments?: DazzaComment[] };
      setComments(d.comments ?? []);
      return d.comments ?? [];
    } catch { return []; }
  }, [report.id]);

  // On mount: call ensure once, then poll if reviewing
  useEffect(() => {
    if (ensureCalled.current) return;
    ensureCalled.current = true;

    async function init() {
      setLoading(true);
      setEnsureError('');
      try {
        const res = await fetch(`/api/bug-reports/${report.id}/dazza-review/ensure`, {
          method: 'POST',
          credentials: 'include',
        });
        const d = await res.json() as { ok?: boolean; review?: DazzaComment; error?: string };
        if (!res.ok || !d.ok) {
          setEnsureError(d.error ?? `Server error ${res.status} — check logs.`);
        } else {
          await fetchComments();
          lastReviewedSnapshot.current = evidenceSnapshot;
        }
      } catch (err) {
        setEnsureError(err instanceof Error ? err.message : 'Network error starting review.');
      } finally { setLoading(false); }
    }

    void init();
  }, [report.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Poll while any comment is in reviewing/queued state
  useEffect(() => {
    const hasRunning = comments.some(
      c => c.review_status === 'reviewing' || c.review_status === 'queued',
    );
    if (!hasRunning) return;
    const timer = setInterval(async () => {
      const updated = await fetchComments();
      const stillRunning = (updated ?? []).some(
        c => c.review_status === 'reviewing' || c.review_status === 'queued',
      );
      if (!stillRunning) clearInterval(timer);
    }, 3000);
    return () => clearInterval(timer);
  }, [comments, fetchComments]);

  // Detect new evidence after last completed review
  useEffect(() => {
    const hasComplete = comments.some(c => c.review_status === 'complete');
    if (!hasComplete) return;
    if (lastReviewedSnapshot.current && evidenceSnapshot !== lastReviewedSnapshot.current) {
      setNewEvidenceDetected(true);
    }
  }, [evidenceSnapshot, comments]);

  async function handleReviewEvidence() {
    setRunningEvidence(true);
    setEvidenceError('');
    setNewEvidenceDetected(false);
    try {
      const res = await fetch(`/api/bug-reports/${report.id}/dazza-review/evidence`, {
        method: 'POST',
        credentials: 'include',
      });
      const d = await res.json() as { ok?: boolean; error?: string };
      if (!res.ok || !d.ok) {
        setEvidenceError(d.error ?? 'Review failed.');
        return;
      }
      lastReviewedSnapshot.current = evidenceSnapshot;
      await fetchComments();
    } catch {
      setEvidenceError('Network error.');
    } finally {
      setRunningEvidence(false);
    }
  }

  async function handleRetry(commentId: string) {
    // Mark failed comment as queued and re-run ensure
    try {
      await fetch(`/api/bug-reports/${report.id}/dazza-review/retry`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ commentId }),
      });
      await fetchComments();
    } catch { /* ignore */ }
  }

  const hasAnyFailed = comments.some(c => c.review_status === 'failed');
  const hasAnyComplete = comments.some(c => c.review_status === 'complete');

  return (
    <div className="border border-violet-200 rounded-2xl overflow-hidden bg-gradient-to-br from-violet-50/40 to-slate-50">
      {/* ── Panel header ── */}
      <div className="flex items-center justify-between px-4 py-3 bg-gradient-to-r from-violet-700 to-indigo-700">
        <div className="flex items-center gap-2">
          <Bot size={14} className="text-white" />
          <span className="text-xs font-black text-white tracking-widest uppercase">Dazza Review</span>
        </div>
        <div className="flex items-center gap-2">
          {comments.length > 0 && (
            <span className="text-[10px] text-violet-200">
              {comments.length} review{comments.length !== 1 ? 's' : ''}
            </span>
          )}
          <button
            onClick={() => void fetchComments()}
            className="p-1 rounded hover:bg-white/10 text-white/60 hover:text-white transition-colors"
            title="Refresh"
          >
            <RefreshCw size={11} />
          </button>
        </div>
      </div>

      <div className="p-4 flex flex-col gap-3">
        {/* Loading */}
        {loading && (
          <div className="flex items-center gap-2 py-4 text-sm text-slate-500">
            <Loader2 size={14} className="animate-spin text-violet-400" />
            Dazza is reviewing the report, screenshots, diagnostics and related history…
          </div>
        )}

        {/* Comments */}
        {!loading && comments.map(c => (
          <CommentCard key={c.id} comment={c} />
        ))}

        {/* Ensure error */}
        {!loading && ensureError && (
          <div className="flex flex-col gap-2 bg-red-50 border border-red-200 rounded-xl p-3">
            <div className="flex items-center gap-2 text-xs text-red-700 font-semibold">
              <AlertTriangle size={12} />
              Dazza review could not start
            </div>
            <p className="text-[11px] text-red-600 font-mono">{ensureError}</p>
            <button
              onClick={() => {
                ensureCalled.current = false;
                setEnsureError('');
                setLoading(true);
                // Re-trigger the init effect by resetting the guard
                const id = report.id;
                fetch(`/api/bug-reports/${id}/dazza-review/ensure`, {
                  method: 'POST', credentials: 'include',
                }).then(r => r.json()).then((d: { ok?: boolean; error?: string }) => {
                  if (d.ok) { void fetchComments(); }
                  else { setEnsureError(d.error ?? 'Retry failed.'); }
                }).catch(e => setEnsureError(String(e))).finally(() => setLoading(false));
              }}
              className="flex items-center justify-center gap-2 w-full py-2 rounded-lg bg-red-600 hover:bg-red-700 text-white text-xs font-bold transition-colors"
            >
              <RotateCcw size={11} />
              Retry
            </button>
          </div>
        )}

        {/* No reviews yet */}
        {!loading && comments.length === 0 && (
          <div className="flex items-center gap-2 py-3 text-xs text-slate-400">
            <Clock size={13} />
            No reviews yet — Dazza will start automatically.
          </div>
        )}

        {/* Retry button for failed reviews */}
        {!loading && hasAnyFailed && !hasAnyComplete && (
          <button
            onClick={() => void handleRetry(comments.find(c => c.review_status === 'failed')!.id)}
            className="flex items-center justify-center gap-2 w-full py-2 rounded-xl border border-red-200 text-red-600 hover:bg-red-50 text-xs font-semibold transition-colors"
          >
            <RotateCcw size={11} />
            Try Again
          </button>
        )}

        {/* New evidence notice */}
        {newEvidenceDetected && !runningEvidence && (
          <div className="flex flex-col gap-2 bg-amber-50 border border-amber-200 rounded-xl p-3">
            <div className="flex items-center gap-2 text-xs text-amber-700 font-semibold">
              <FileText size={12} />
              New evidence has been added since Dazza's last review.
            </div>
            <button
              onClick={() => void handleReviewEvidence()}
              className="flex items-center justify-center gap-2 w-full py-2 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold transition-colors"
            >
              <Bot size={11} />
              Review New Evidence
            </button>
          </div>
        )}

        {/* Running evidence review */}
        {runningEvidence && (
          <div className="flex items-center gap-2 py-2 text-xs text-slate-500">
            <Loader2 size={13} className="animate-spin text-violet-400" />
            Dazza is reviewing new evidence…
          </div>
        )}

        {evidenceError && (
          <p className="text-xs text-red-500 font-semibold">{evidenceError}</p>
        )}
      </div>
    </div>
  );
}
