/**
 * Monitoring Tab — timeline/board style progress per inspection
 */
import { useState, useEffect } from 'react';
import { Activity, Loader2, AlertTriangle, CheckCircle2, Clock, ChevronRight } from 'lucide-react';

interface MonitoringItem {
  id: number; report_no: string | null; report_title: string | null;
  inspection_date: string | null; overall_status: string;
  asset_name: string; asset_acronym: string | null;
  open_defects: number; total_defects: number;
  tender_count: number; latest_tender_status: string | null;
  next_due: string | null; created_at: string;
}

const PIPELINE_STAGES = [
  { key: 'draft',           label: 'Created',    color: 'bg-slate-600' },
  { key: 'in_progress',     label: 'In Progress', color: 'bg-blue-500' },
  { key: 'action_required', label: 'Action Req.', color: 'bg-violet-500' },
  { key: 'complete',        label: 'Complete',   color: 'bg-emerald-500' },
  { key: 'closed',          label: 'Closed',     color: 'bg-slate-500' },
];

function stageIndex(status: string) {
  const idx = PIPELINE_STAGES.findIndex((s) => s.key === status);
  return idx >= 0 ? idx : 0;
}

function ProgressBar({ status }: { status: string }) {
  const current = stageIndex(status);
  return (
    <div className="flex items-center gap-0.5 mt-2">
      {PIPELINE_STAGES.map((stage, i) => (
        <div key={stage.key} className="flex items-center gap-0.5 flex-1">
          <div className={`h-1.5 rounded-full flex-1 transition-colors ${i <= current ? stage.color : 'bg-slate-200'}`} />
          {i < PIPELINE_STAGES.length - 1 && <ChevronRight size={8} className={i < current ? 'text-slate-400' : 'text-slate-300'} />}
        </div>
      ))}
    </div>
  );
}

export default function AMMonitoringTab() {
  const [items, setItems] = useState<MonitoringItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    fetch('/api/asset-manager/monitoring', { credentials: 'include' })
      .then((r) => r.json() as Promise<{ items?: MonitoringItem[] }>)
      .then((d) => setItems(d.items ?? []))
      .catch(() => setError('Failed to load monitoring data'))
      .finally(() => setLoading(false));
  }, []);

  const overdue = items.filter((i) => i.next_due && new Date(i.next_due) < new Date());
  const actionRequired = items.filter((i) => i.overall_status === 'action_required');

  return (
    <div className="p-6 flex flex-col gap-5">
      {/* Summary chips */}
      {!loading && items.length > 0 && (
        <div className="flex flex-wrap gap-3">
          <div className="flex items-center gap-2 bg-white border border-slate-200 rounded-xl px-4 py-2.5">
            <Activity size={14} className="text-violet-600" />
            <span className="text-sm font-bold text-slate-800">{items.length}</span>
            <span className="text-xs text-slate-500">active inspections</span>
          </div>
          {overdue.length > 0 && (
            <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-xl px-4 py-2.5">
              <Clock size={14} className="text-red-500" />
              <span className="text-sm font-bold text-red-700">{overdue.length}</span>
              <span className="text-xs text-red-600">overdue</span>
            </div>
          )}
          {actionRequired.length > 0 && (
            <div className="flex items-center gap-2 bg-violet-50 border border-violet-200 rounded-xl px-4 py-2.5">
              <AlertTriangle size={14} className="text-violet-600" />
              <span className="text-sm font-bold text-violet-800">{actionRequired.length}</span>
              <span className="text-xs text-violet-700">action required</span>
            </div>
          )}
        </div>
      )}

      {error && (
        <div className="flex items-center gap-2 bg-red-50 border border-red-200 rounded-lg px-4 py-3 text-sm text-red-600">
          <AlertTriangle size={14} />{error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16"><Loader2 size={20} className="animate-spin text-slate-400" /></div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 text-center">
          <Activity size={32} className="text-slate-300 mb-3" />
          <p className="text-sm text-slate-500">No active inspections to monitor</p>
          <p className="text-xs text-slate-400 mt-1">Create inspections in the Inspections tab to see them here</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {items.map((item) => {
            const isOverdue = item.next_due && new Date(item.next_due) < new Date();
            return (
              <div key={item.id} className={`bg-white border rounded-xl p-4 flex flex-col gap-3 ${isOverdue ? 'border-red-200' : 'border-slate-200'}`}>
                {/* Header */}
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-slate-800 truncate">{item.report_title || item.report_no || `Inspection #${item.id}`}</p>
                    <p className="text-xs text-slate-500 mt-0.5">{item.asset_name}{item.asset_acronym ? ` (${item.asset_acronym})` : ''}</p>
                  </div>
                  {isOverdue && <AlertTriangle size={14} className="text-red-500 flex-shrink-0 mt-0.5" />}
                </div>

                {/* Progress bar */}
                <ProgressBar status={item.overall_status} />
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-semibold text-slate-500">
                    {PIPELINE_STAGES[stageIndex(item.overall_status)]?.label ?? item.overall_status}
                  </span>
                  {item.inspection_date && (
                    <span className="text-[10px] text-slate-500">
                      {new Date(item.inspection_date).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </span>
                  )}
                </div>

                {/* Stats */}
                <div className="flex items-center gap-3 flex-wrap">
                  {item.total_defects > 0 && (
                    <div className={`flex items-center gap-1 text-xs ${item.open_defects > 0 ? 'text-violet-700' : 'text-emerald-600'}`}>
                      {item.open_defects > 0 ? <AlertTriangle size={11} /> : <CheckCircle2 size={11} />}
                      <span>{item.open_defects} open / {item.total_defects} defects</span>
                    </div>
                  )}
                  {item.tender_count > 0 && (
                    <div className="flex items-center gap-1 text-xs text-slate-500">
                      <span>{item.tender_count} tender{item.tender_count !== 1 ? 's' : ''}</span>
                      {item.latest_tender_status && (
                        <span className="text-slate-400">· {item.latest_tender_status}</span>
                      )}
                    </div>
                  )}
                </div>

                {/* Next action */}
                {item.next_due && (
                  <div className={`flex items-center gap-1.5 text-xs rounded-lg px-2.5 py-1.5 ${isOverdue ? 'bg-red-50 text-red-600' : 'bg-slate-100 text-slate-600'}`}>
                    <Clock size={11} />
                    <span>{isOverdue ? 'Overdue: ' : 'Due: '}{new Date(item.next_due).toLocaleDateString('en-AU', { day: 'numeric', month: 'short' })}</span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
