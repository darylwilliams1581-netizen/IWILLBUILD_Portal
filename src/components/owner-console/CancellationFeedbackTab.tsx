/**
 * CancellationFeedbackTab
 * Owner Console tab showing all cancellation feedback submitted by customers.
 */
import { useState, useEffect } from 'react';
import { MessageSquareOff, RefreshCw, Loader2, Building2, Calendar } from 'lucide-react';

interface FeedbackRow {
  id: number;
  companyName: string;
  plan: string;
  reason: string | null;
  comment: string | null;
  createdAt: string;
}

const PLAN_LABELS: Record<string, string> = {
  solo: 'Solo',
  team: 'Team',
  business: 'Business',
  enterprise: 'Enterprise',
  trial: 'Trial',
  unknown: '—',
};

const PLAN_COLORS: Record<string, string> = {
  solo: 'bg-blue-50 text-blue-700',
  team: 'bg-violet-50 text-violet-700',
  business: 'bg-emerald-50 text-emerald-700',
  enterprise: 'bg-amber-50 text-amber-700',
  trial: 'bg-slate-100 text-slate-500',
  unknown: 'bg-slate-100 text-slate-400',
};

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-AU', {
    day: 'numeric', month: 'short', year: 'numeric',
  });
}

export default function CancellationFeedbackTab() {
  const [rows, setRows] = useState<FeedbackRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  async function load(quiet = false) {
    if (!quiet) setLoading(true);
    else setRefreshing(true);
    try {
      const res = await fetch('/api/owner-console/cancellation-feedback', { credentials: 'include' });
      if (res.ok) {
        const data = await res.json() as FeedbackRow[];
        setRows(data);
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }

  useEffect(() => { load(); }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 size={24} className="animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-6 max-w-5xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-heading font-black text-xl text-slate-900">Cancellation Feedback</h2>
          <p className="text-sm text-slate-400 mt-0.5">
            Reasons customers gave when cancelling their subscription.
          </p>
        </div>
        <button
          onClick={() => load(true)}
          disabled={refreshing}
          className="flex items-center gap-2 text-sm text-slate-500 hover:text-slate-700 border border-slate-200 rounded-xl px-3 py-2 transition-colors disabled:opacity-50"
        >
          <RefreshCw size={13} className={refreshing ? 'animate-spin' : ''} />
          Refresh
        </button>
      </div>

      {/* Summary chips */}
      {rows.length > 0 && (() => {
        const counts: Record<string, number> = {};
        rows.forEach((r) => {
          const key = r.reason ?? 'No reason given';
          counts[key] = (counts[key] ?? 0) + 1;
        });
        const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
        return (
          <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-5">
            <h3 className="text-sm font-bold text-slate-700 mb-3">Reason breakdown</h3>
            <div className="flex flex-wrap gap-2">
              {sorted.map(([reason, count]) => (
                <span
                  key={reason}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-slate-100 text-slate-700 text-xs font-semibold"
                >
                  {reason}
                  <span className="bg-slate-300 text-slate-700 rounded-full px-1.5 py-0.5 text-xs font-bold leading-none">
                    {count}
                  </span>
                </span>
              ))}
            </div>
          </div>
        );
      })()}

      {/* Table */}
      {rows.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm flex flex-col items-center justify-center py-16 gap-3">
          <div className="p-4 bg-slate-50 rounded-2xl">
            <MessageSquareOff size={28} className="text-slate-300" />
          </div>
          <p className="text-sm font-semibold text-slate-400">No cancellation feedback yet</p>
          <p className="text-xs text-slate-300">Feedback will appear here when customers cancel their subscription.</p>
        </div>
      ) : (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 bg-slate-50">
                  <th className="text-left px-5 py-3 text-xs font-bold text-slate-400 uppercase tracking-wider">Company</th>
                  <th className="text-left px-4 py-3 text-xs font-bold text-slate-400 uppercase tracking-wider">Plan</th>
                  <th className="text-left px-4 py-3 text-xs font-bold text-slate-400 uppercase tracking-wider">Reason</th>
                  <th className="text-left px-4 py-3 text-xs font-bold text-slate-400 uppercase tracking-wider">Comment</th>
                  <th className="text-left px-4 py-3 text-xs font-bold text-slate-400 uppercase tracking-wider">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {rows.map((row) => (
                  <tr key={row.id} className="hover:bg-slate-50 transition-colors">
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-2.5">
                        <div className="w-7 h-7 rounded-lg bg-blue-50 border border-blue-100 flex items-center justify-center shrink-0">
                          <Building2 size={13} className="text-blue-500" />
                        </div>
                        <span className="font-semibold text-slate-800 text-sm">{row.companyName}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3.5">
                      <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold ${PLAN_COLORS[row.plan] ?? 'bg-slate-100 text-slate-500'}`}>
                        {PLAN_LABELS[row.plan] ?? row.plan}
                      </span>
                    </td>
                    <td className="px-4 py-3.5">
                      {row.reason ? (
                        <span className="text-slate-700 text-sm">{row.reason}</span>
                      ) : (
                        <span className="text-slate-300 text-xs italic">No reason given</span>
                      )}
                    </td>
                    <td className="px-4 py-3.5 max-w-xs">
                      {row.comment ? (
                        <p className="text-slate-600 text-xs leading-relaxed line-clamp-3">{row.comment}</p>
                      ) : (
                        <span className="text-slate-300 text-xs">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3.5 whitespace-nowrap">
                      <div className="flex items-center gap-1.5 text-xs text-slate-400">
                        <Calendar size={11} />
                        {fmtDate(row.createdAt)}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="px-5 py-3 border-t border-slate-100 bg-slate-50">
            <p className="text-xs text-slate-400">{rows.length} response{rows.length !== 1 ? 's' : ''} total</p>
          </div>
        </div>
      )}
    </div>
  );
}
