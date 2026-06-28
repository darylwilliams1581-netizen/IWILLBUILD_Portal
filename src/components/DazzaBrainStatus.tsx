/**
 * DazzaBrainStatus
 * ─────────────────────────────────────────────────────────────────────────────
 * Admin panel for the Dazza Brain — shows brain stats, recent interactions,
 * top brain entries, and the pending hive queue for approval/rejection.
 *
 * Visible to admins and owners only.
 * Nothing auto-approves — every hive entry requires explicit admin action.
 */
import { useState, useEffect, useCallback } from 'react';
import {
  Brain, Zap, Clock, CheckCircle2, XCircle, AlertTriangle,
  RefreshCw, ChevronDown, ChevronUp, Loader2, BookOpen,
  BarChart2, Shield, Lightbulb, Database,
} from 'lucide-react';

// ── Types ─────────────────────────────────────────────────────────────────────

interface BrainStatus {
  totalEntries: number;
  pendingHive: number;
  totalInteractions: number;
  recentInteractions: Array<{
    question_summary: string;
    answer_source: string;
    confidence_level: string;
    conflict_detected: boolean | number;
    tokens_used: number;
    created_at: string;
  }>;
  topEntries: Array<{
    id: number;
    title: string;
    category: string;
    usage_count: number;
    confidence: string | null;
  }>;
  pendingEntries: Array<{
    id: number;
    question: string;
    suggested_title: string;
    suggested_category: string;
    source_type: string;
    created_at: string;
  }>;
}

interface PendingDetail {
  id: number;
  question: string;
  suggested_title: string;
  suggested_content: string;
  suggested_category: string;
  source_type: string;
}

// ── Source badge ──────────────────────────────────────────────────────────────

function SourceBadge({ source }: { source: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    local_tool:    { label: 'Calculator',    cls: 'bg-slate-100 text-slate-600' },
    portal_data:   { label: 'Portal Data',   cls: 'bg-blue-100 text-blue-700' },
    brain_entry:   { label: 'Brain Entry',   cls: 'bg-violet-100 text-violet-700' },
    openai:        { label: 'AI Reasoning',  cls: 'bg-amber-100 text-amber-700' },
    'portal+openai': { label: 'Portal + AI', cls: 'bg-emerald-100 text-emerald-700' },
    'brain+openai':  { label: 'Brain + AI',  cls: 'bg-purple-100 text-purple-700' },
    no_key:        { label: 'No API Key',    cls: 'bg-red-100 text-red-600' },
  };
  const { label, cls } = map[source] ?? { label: source, cls: 'bg-slate-100 text-slate-500' };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wide ${cls}`}>
      {label}
    </span>
  );
}

function ConfidenceBadge({ level }: { level: string }) {
  const map: Record<string, string> = {
    High:   'bg-emerald-100 text-emerald-700',
    Medium: 'bg-amber-100 text-amber-700',
    Low:    'bg-red-100 text-red-600',
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold ${map[level] ?? 'bg-slate-100 text-slate-500'}`}>
      {level}
    </span>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export default function DazzaBrainStatus({ supportCompanyId }: { supportCompanyId?: number | null }) {
  const [status, setStatus] = useState<BrainStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedPending, setExpandedPending] = useState<number | null>(null);
  const [pendingDetails, setPendingDetails] = useState<Record<number, PendingDetail>>({});
  const [actionLoading, setActionLoading] = useState<number | null>(null);
  const [actionMsg, setActionMsg] = useState<string | null>(null);
  const [showInteractions, setShowInteractions] = useState(false);
  const [editingEntry, setEditingEntry] = useState<number | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editContent, setEditContent] = useState('');
  const [editCategory, setEditCategory] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const url = supportCompanyId
        ? `/api/dazza/brain/status?supportCompanyId=${supportCompanyId}`
        : '/api/dazza/brain/status';
      const res = await fetch(url);
      if (!res.ok) throw new Error(`${res.status}`);
      setStatus(await res.json() as BrainStatus);
    } catch (e) {
      setError(String((e as Error).message ?? e));
    } finally {
      setLoading(false);
    }
  }, [supportCompanyId]);

  useEffect(() => { void load(); }, [load]);

  async function fetchPendingDetail(id: number) {
    if (pendingDetails[id]) {
      setExpandedPending(expandedPending === id ? null : id);
      return;
    }
    try {
      const res = await fetch(`/api/dazza/brain/hive/detail/${id}`);
      if (res.ok) {
        const data = await res.json() as PendingDetail;
        setPendingDetails((prev) => ({ ...prev, [id]: data }));
      }
    } catch { /* non-blocking */ }
    setExpandedPending(expandedPending === id ? null : id);
  }

  function startEdit(entry: BrainStatus['pendingEntries'][number]) {
    setEditingEntry(entry.id);
    setEditTitle(entry.suggested_title);
    setEditContent(pendingDetails[entry.id]?.suggested_content ?? '');
    setEditCategory(entry.suggested_category);
  }

  async function approveEntry(id: number) {
    setActionLoading(id);
    setActionMsg(null);
    try {
      const detail = pendingDetails[id];
      const body: Record<string, unknown> = { id };
      if (editingEntry === id) {
        body.title = editTitle;
        body.content = editContent;
        body.category = editCategory;
      } else if (detail) {
        body.title = detail.suggested_title;
        body.content = detail.suggested_content;
        body.category = detail.suggested_category;
      }
      const res = await fetch('/api/dazza/brain/hive/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (!res.ok) throw new Error(`${res.status}`);
      setActionMsg(`✅ Entry approved and added to brain.`);
      setEditingEntry(null);
      await load();
    } catch (e) {
      setActionMsg(`❌ Failed: ${String((e as Error).message ?? e)}`);
    } finally {
      setActionLoading(null);
    }
  }

  async function rejectEntry(id: number) {
    setActionLoading(id);
    setActionMsg(null);
    try {
      const res = await fetch('/api/dazza/brain/hive/reject', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      if (!res.ok) throw new Error(`${res.status}`);
      setActionMsg(`Entry rejected.`);
      setEditingEntry(null);
      await load();
    } catch (e) {
      setActionMsg(`❌ Failed: ${String((e as Error).message ?? e)}`);
    } finally {
      setActionLoading(null);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 size={20} className="animate-spin text-primary mr-2" />
        <span className="text-sm text-slate-500">Loading brain status…</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center gap-2 text-red-600 text-sm py-8 px-4">
        <AlertTriangle size={16} />
        <span>Failed to load brain status: {error}</span>
        <button onClick={load} className="ml-2 text-primary underline text-xs">Retry</button>
      </div>
    );
  }

  if (!status) return null;

  return (
    <div className="flex flex-col gap-5 p-4 max-w-4xl">

      {/* ── Header ── */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Brain size={18} className="text-primary" />
          <h2 className="text-base font-bold text-slate-800">Dazza Brain Status</h2>
        </div>
        <button
          onClick={load}
          className="flex items-center gap-1.5 text-xs text-slate-500 hover:text-primary transition-colors"
        >
          <RefreshCw size={12} /> Refresh
        </button>
      </div>

      {/* ── Stats row ── */}
      <div className="grid grid-cols-3 gap-3">
        {[
          { icon: BookOpen,  label: 'Brain Entries',   value: status.totalEntries,    cls: 'text-violet-600' },
          { icon: Lightbulb, label: 'Pending Hive',    value: status.pendingHive,     cls: status.pendingHive > 0 ? 'text-amber-600' : 'text-slate-400' },
          { icon: BarChart2, label: 'Total Interactions', value: status.totalInteractions, cls: 'text-blue-600' },
        ].map(({ icon: Icon, label, value, cls }) => (
          <div key={label} className="bg-white border border-slate-200 rounded-xl p-3 flex flex-col gap-1">
            <div className="flex items-center gap-1.5">
              <Icon size={13} className={cls} />
              <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide">{label}</span>
            </div>
            <span className={`text-2xl font-black ${cls}`}>{value}</span>
          </div>
        ))}
      </div>

      {/* ── Action message ── */}
      {actionMsg && (
        <div className={`text-sm px-3 py-2 rounded-lg border ${actionMsg.startsWith('✅') ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-red-50 border-red-200 text-red-700'}`}>
          {actionMsg}
        </div>
      )}

      {/* ── Pending Hive Queue ── */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-100 bg-amber-50">
          <Lightbulb size={14} className="text-amber-600" />
          <h3 className="text-sm font-bold text-slate-700">Pending Hive Queue</h3>
          {status.pendingHive > 0 && (
            <span className="ml-auto bg-amber-500 text-white text-[10px] font-bold px-2 py-0.5 rounded-full">
              {status.pendingHive} pending
            </span>
          )}
        </div>

        {status.pendingEntries.length === 0 ? (
          <div className="px-4 py-6 text-sm text-slate-400 text-center">
            No pending hive entries. Dazza will queue useful AI answers here for your review.
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {status.pendingEntries.map((entry) => {
              const isExpanded = expandedPending === entry.id;
              const isEditing = editingEntry === entry.id;
              const detail = pendingDetails[entry.id];
              const isActing = actionLoading === entry.id;

              return (
                <div key={entry.id} className="px-4 py-3">
                  {/* Row header */}
                  <div className="flex items-start gap-2">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-semibold text-slate-700 truncate">{entry.suggested_title}</p>
                      <p className="text-[10px] text-slate-400 mt-0.5 truncate">Q: {entry.question}</p>
                      <div className="flex items-center gap-2 mt-1">
                        <span className="text-[10px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded">{entry.suggested_category}</span>
                        <SourceBadge source={entry.source_type} />
                        <span className="text-[10px] text-slate-300">{new Date(entry.created_at).toLocaleDateString('en-AU')}</span>
                      </div>
                    </div>
                    <button
                      onClick={() => void fetchPendingDetail(entry.id)}
                      className="text-slate-400 hover:text-primary transition-colors shrink-0 mt-0.5"
                    >
                      {isExpanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                    </button>
                  </div>

                  {/* Expanded detail + edit + actions */}
                  {isExpanded && (
                    <div className="mt-3 flex flex-col gap-3">
                      {isEditing ? (
                        <div className="flex flex-col gap-2">
                          <div>
                            <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1 block">Title</label>
                            <input
                              value={editTitle}
                              onChange={(e) => setEditTitle(e.target.value)}
                              className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary/40"
                            />
                          </div>
                          <div>
                            <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1 block">Category</label>
                            <input
                              value={editCategory}
                              onChange={(e) => setEditCategory(e.target.value)}
                              className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary/40"
                            />
                          </div>
                          <div>
                            <label className="text-[10px] font-semibold text-slate-400 uppercase tracking-wide mb-1 block">Content</label>
                            <textarea
                              value={editContent}
                              onChange={(e) => setEditContent(e.target.value)}
                              rows={5}
                              className="w-full border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs focus:outline-none focus:ring-1 focus:ring-primary/40 resize-none"
                            />
                          </div>
                        </div>
                      ) : (
                        detail && (
                          <div className="bg-slate-50 rounded-lg p-3 text-xs text-slate-600 leading-relaxed whitespace-pre-wrap max-h-40 overflow-y-auto">
                            {detail.suggested_content || 'Loading content…'}
                          </div>
                        )
                      )}

                      <div className="flex items-center gap-2 flex-wrap">
                        {!isEditing ? (
                          <button
                            onClick={() => startEdit(entry)}
                            className="text-[11px] font-semibold text-slate-500 hover:text-primary border border-slate-200 px-2.5 py-1 rounded-lg transition-colors"
                          >
                            Edit before approving
                          </button>
                        ) : (
                          <button
                            onClick={() => setEditingEntry(null)}
                            className="text-[11px] font-semibold text-slate-500 hover:text-primary border border-slate-200 px-2.5 py-1 rounded-lg transition-colors"
                          >
                            Cancel edit
                          </button>
                        )}
                        <button
                          onClick={() => void approveEntry(entry.id)}
                          disabled={isActing}
                          className="flex items-center gap-1 text-[11px] font-bold text-white bg-emerald-600 hover:bg-emerald-700 px-3 py-1 rounded-lg transition-colors disabled:opacity-50"
                        >
                          {isActing ? <Loader2 size={11} className="animate-spin" /> : <CheckCircle2 size={11} />}
                          Approve
                        </button>
                        <button
                          onClick={() => void rejectEntry(entry.id)}
                          disabled={isActing}
                          className="flex items-center gap-1 text-[11px] font-bold text-white bg-red-500 hover:bg-red-600 px-3 py-1 rounded-lg transition-colors disabled:opacity-50"
                        >
                          {isActing ? <Loader2 size={11} className="animate-spin" /> : <XCircle size={11} />}
                          Reject
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Top Brain Entries ── */}
      {status.topEntries.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-100">
            <Database size={14} className="text-violet-600" />
            <h3 className="text-sm font-bold text-slate-700">Top Brain Entries</h3>
            <span className="ml-auto text-[10px] text-slate-400">{status.totalEntries} total approved</span>
          </div>
          <div className="divide-y divide-slate-100">
            {status.topEntries.map((entry) => (
              <div key={entry.id} className="flex items-center gap-3 px-4 py-2.5">
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-semibold text-slate-700 truncate">{entry.title}</p>
                  <p className="text-[10px] text-slate-400">{entry.category}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {entry.confidence && <ConfidenceBadge level={entry.confidence} />}
                  <span className="text-[10px] text-slate-400">{entry.usage_count} uses</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Recent Interactions ── */}
      <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
        <button
          onClick={() => setShowInteractions((v) => !v)}
          className="w-full flex items-center gap-2 px-4 py-3 border-b border-slate-100 hover:bg-slate-50 transition-colors"
        >
          <Clock size={14} className="text-blue-600" />
          <h3 className="text-sm font-bold text-slate-700">Recent Interactions</h3>
          <span className="ml-auto text-[10px] text-slate-400 mr-1">{status.totalInteractions} total</span>
          {showInteractions ? <ChevronUp size={13} className="text-slate-400" /> : <ChevronDown size={13} className="text-slate-400" />}
        </button>

        {showInteractions && (
          <div className="divide-y divide-slate-100">
            {status.recentInteractions.length === 0 ? (
              <div className="px-4 py-4 text-sm text-slate-400 text-center">No interactions yet.</div>
            ) : (
              status.recentInteractions.map((interaction, i) => (
                <div key={i} className="px-4 py-2.5 flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <p className="text-xs text-slate-600 truncate">{interaction.question_summary}</p>
                    <div className="flex items-center gap-2 mt-1 flex-wrap">
                      <SourceBadge source={interaction.answer_source} />
                      <ConfidenceBadge level={interaction.confidence_level} />
                      {(interaction.conflict_detected === 1 || interaction.conflict_detected === true) && (
                        <span className="text-[10px] bg-orange-100 text-orange-600 px-1.5 py-0.5 rounded font-bold">⚡ Conflict</span>
                      )}
                      {interaction.tokens_used > 0 && (
                        <span className="text-[10px] text-slate-300">{interaction.tokens_used} tokens</span>
                      )}
                    </div>
                  </div>
                  <span className="text-[10px] text-slate-300 shrink-0 mt-0.5">
                    {new Date(interaction.created_at).toLocaleDateString('en-AU')}
                  </span>
                </div>
              ))
            )}
          </div>
        )}
      </div>

      {/* ── How it works ── */}
      <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
        <div className="flex items-center gap-2 mb-3">
          <Shield size={13} className="text-slate-500" />
          <h4 className="text-xs font-bold text-slate-600 uppercase tracking-wide">How Dazza Brain Works</h4>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-[11px] text-slate-500 leading-relaxed">
          {[
            { icon: '1️⃣', text: 'Every question checks portal data first — no AI needed for lookups.' },
            { icon: '2️⃣', text: 'If OpenAI is configured, it adds reasoning on top of portal data.' },
            { icon: '3️⃣', text: 'Portal data always wins if OpenAI conflicts with it.' },
            { icon: '4️⃣', text: 'Useful AI answers are queued here for your review — nothing auto-saves.' },
            { icon: '5️⃣', text: 'You approve or reject each entry before it enters the brain.' },
            { icon: '6️⃣', text: 'Approved entries are used in future answers, labelled as "Brain Entry".' },
          ].map(({ icon, text }) => (
            <div key={text} className="flex gap-2">
              <span className="shrink-0">{icon}</span>
              <span>{text}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
