/**
 * BugWidgetStatusCentre
 * ─────────────────────────────────────────────────────────────────────────────
 * Shows the current user's recent bug reports with their public Case status.
 * Embedded as a tab inside BugReportModal.
 *
 * Public statuses (never expose internal details):
 *   received → investigating → issue_confirmed → repair_being_tested → resolved
 *   → more_info_required
 */
import { useState, useEffect, useCallback } from 'react';
import { Clock, CheckCircle2, AlertCircle, Search, Loader2, ChevronRight, RefreshCw } from 'lucide-react';

interface UserReport {
  id: number;
  category: string;
  description: string;
  status: string;
  created_at: string;
  updated_at: string;
  // Joined from incident_communications if a public message exists
  public_status?: string;
  public_message?: string;
  workaround?: string;
  comm_id?: string;
}

const PUBLIC_STATUS_LABELS: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  received:            { label: 'Received', color: 'text-slate-500', icon: <Clock size={11} /> },
  investigating:       { label: 'Investigating', color: 'text-violet-600', icon: <Search size={11} /> },
  issue_confirmed:     { label: 'Issue confirmed', color: 'text-orange-600', icon: <AlertCircle size={11} /> },
  repair_being_tested: { label: 'Repair being tested', color: 'text-blue-600', icon: <Loader2 size={11} className="animate-spin" /> },
  resolved:            { label: 'Resolved', color: 'text-emerald-600', icon: <CheckCircle2 size={11} /> },
  more_info_required:  { label: 'More info needed', color: 'text-amber-600', icon: <AlertCircle size={11} /> },
};

// Map internal bug_report status → public label
function toPublicStatus(status: string): string {
  if (status === 'resolved') return 'resolved';
  if (status === 'in_progress') return 'investigating';
  if (status === 'open') return 'received';
  return 'received';
}

function timeAgo(dateStr: string): string {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function formatCaseId(id: number): string {
  return `BUG-${String(id).padStart(4, '0')}`;
}

interface Props {
  onStillHavingTrouble?: (commId: string) => void;
}

export default function BugWidgetStatusCentre({ onStillHavingTrouble }: Props) {
  const [reports, setReports] = useState<UserReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<number | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/bug-reports/my-reports', { credentials: 'include' });
      if (!res.ok) { setLoading(false); return; }
      const d = await res.json() as { reports?: UserReport[] };
      setReports(d.reports ?? []);
    } catch { /* ignore */ }
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-10 text-slate-400">
        <Loader2 size={16} className="animate-spin" />
      </div>
    );
  }

  if (!reports.length) {
    return (
      <div className="flex flex-col items-center justify-center py-10 text-slate-400 gap-2">
        <CheckCircle2 size={24} className="opacity-30" />
        <p className="text-sm">No reports yet</p>
        <p className="text-xs text-slate-400">Your submitted reports will appear here.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center justify-between px-1 mb-1">
        <p className="text-xs text-slate-500">Your recent reports</p>
        <button onClick={() => void load()} className="p-1 rounded-lg hover:bg-slate-100 text-slate-400">
          <RefreshCw size={11} />
        </button>
      </div>

      {reports.map(report => {
        const publicStatus = report.public_status ?? toPublicStatus(report.status);
        const statusInfo = PUBLIC_STATUS_LABELS[publicStatus] ?? PUBLIC_STATUS_LABELS.received;
        const isExpanded = expanded === report.id;

        return (
          <div
            key={report.id}
            className="border border-slate-200 rounded-xl overflow-hidden"
          >
            <button
              onClick={() => setExpanded(isExpanded ? null : report.id)}
              className="w-full text-left px-3 py-2.5 flex items-center gap-3 hover:bg-slate-50 transition-colors"
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-[10px] font-bold text-slate-400">{formatCaseId(report.id)}</span>
                  <span className={`flex items-center gap-1 text-[10px] font-semibold ${statusInfo.color}`}>
                    {statusInfo.icon} {statusInfo.label}
                  </span>
                </div>
                <p className="text-xs text-slate-700 truncate">{report.description.slice(0, 80)}</p>
                <p className="text-[10px] text-slate-400 mt-0.5">{timeAgo(report.created_at)}</p>
              </div>
              <ChevronRight
                size={13}
                className={`text-slate-400 flex-shrink-0 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
              />
            </button>

            {isExpanded && (
              <div className="px-3 pb-3 border-t border-slate-100 bg-slate-50">
                <div className="pt-2.5">
                  {report.public_message && (
                    <div className="bg-white rounded-xl border border-slate-200 px-3 py-2 mb-2">
                      <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">Latest update</p>
                      <p className="text-xs text-slate-700">{report.public_message}</p>
                    </div>
                  )}

                  {report.workaround && (
                    <div className="bg-amber-50 rounded-xl border border-amber-200 px-3 py-2 mb-2">
                      <p className="text-[10px] font-bold text-amber-600 uppercase tracking-wider mb-1">Workaround</p>
                      <p className="text-xs text-slate-700">{report.workaround}</p>
                    </div>
                  )}

                  {publicStatus === 'resolved' && (
                    <div className="flex gap-2 mt-2">
                      <button
                        className="flex-1 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-colors"
                        onClick={() => setExpanded(null)}
                      >
                        Working now
                      </button>
                      {report.comm_id && onStillHavingTrouble && (
                        <button
                          className="flex-1 py-1.5 rounded-xl border border-red-300 text-red-600 hover:bg-red-50 text-xs font-semibold transition-colors"
                          onClick={() => onStillHavingTrouble(report.comm_id!)}
                        >
                          Still having trouble
                        </button>
                      )}
                    </div>
                  )}

                  {publicStatus === 'more_info_required' && (
                    <a
                      href="mailto:support@iwillbuild.com"
                      className="block text-center py-1.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-white text-xs font-bold transition-colors mt-2"
                    >
                      Contact support
                    </a>
                  )}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
