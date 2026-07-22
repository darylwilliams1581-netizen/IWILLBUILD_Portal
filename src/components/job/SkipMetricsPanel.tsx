/**
 * Skip Metrics Panel
 * ─────────────────────────────────────────────────────────────────────────────
 * Shows skip logic analytics for a form template.
 * Embedded in the form submissions view (JobForms).
 *
 * Displays:
 *   - Total skips per field
 *   - Most frequent trigger values per field
 *   - Recent skip audit entries
 */

import { useState, useEffect } from 'react';
import { SkipForward, TrendingUp, Loader2, AlertCircle, ChevronDown } from 'lucide-react';

interface SkipMetric {
  sourceFieldId: number;
  sourceFieldLabel: string;
  totalSkips: number;
  topTriggerValues: Array<{ value: string; count: number }>;
}

interface SkipAuditRow {
  id: number;
  submission_id: number;
  source_field_label: string;
  trigger_value: string;
  target_type: string;
  target_field_label: string | null;
  triggered_at: string;
}

interface Props {
  templateId: number;
}

export default function SkipMetricsPanel({ templateId }: Props) {
  const [metrics, setMetrics] = useState<SkipMetric[]>([]);
  const [entries, setEntries] = useState<SkipAuditRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!expanded) return;
    void load();
  }, [expanded, templateId]);

  async function load() {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/forms/skip-audit?templateId=${templateId}`, {
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Failed to load skip metrics');
      const data = await res.json() as { metrics: SkipMetric[]; entries: SkipAuditRow[] };
      setMetrics(data.metrics ?? []);
      setEntries((data.entries ?? []).slice(0, 20));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }

  const totalSkips = metrics.reduce((sum, m) => sum + m.totalSkips, 0);

  return (
    <div className="rounded-xl border border-slate-200 bg-white overflow-hidden">
      {/* Header */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 hover:bg-slate-50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <SkipForward size={14} className="text-primary" />
          <span className="text-sm font-semibold text-slate-700">Skip logic analytics</span>
          {totalSkips > 0 && (
            <span className="px-2 py-0.5 rounded-full bg-primary/10 text-primary text-xs font-bold">
              {totalSkips} skips
            </span>
          )}
        </div>
        <ChevronDown
          size={14}
          className={`text-slate-400 transition-transform ${expanded ? 'rotate-180' : ''}`}
        />
      </button>

      {expanded && (
        <div className="border-t border-slate-100 px-4 py-4 flex flex-col gap-4">
          {loading && (
            <div className="flex items-center gap-2 text-xs text-slate-400 py-4 justify-center">
              <Loader2 size={14} className="animate-spin" /> Loading skip data…
            </div>
          )}

          {error && (
            <div className="flex items-center gap-2 text-xs text-red-600 bg-red-50 border border-red-200 rounded-lg px-3 py-2">
              <AlertCircle size={12} /> {error}
            </div>
          )}

          {!loading && !error && metrics.length === 0 && (
            <div className="text-center py-6">
              <SkipForward size={24} className="text-slate-200 mx-auto mb-2" />
              <p className="text-sm font-semibold text-slate-400">No skips recorded yet</p>
              <p className="text-xs text-slate-300 mt-1">
                Skip metrics appear here once participants fill out the form.
              </p>
            </div>
          )}

          {!loading && metrics.length > 0 && (
            <>
              {/* Metrics per field */}
              <div>
                <div className="flex items-center gap-1.5 mb-3">
                  <TrendingUp size={12} className="text-slate-400" />
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">
                    Skips per field
                  </span>
                </div>
                <div className="flex flex-col gap-2">
                  {metrics
                    .sort((a, b) => b.totalSkips - a.totalSkips)
                    .map((m) => (
                      <div key={m.sourceFieldId} className="flex flex-col gap-1.5 p-3 bg-slate-50 rounded-xl border border-slate-100">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold text-slate-700 truncate">
                            {m.sourceFieldLabel || `Field #${m.sourceFieldId}`}
                          </span>
                          <span className="text-xs font-bold text-primary shrink-0 ml-2">
                            {m.totalSkips} {m.totalSkips === 1 ? 'skip' : 'skips'}
                          </span>
                        </div>
                        {m.topTriggerValues.length > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {m.topTriggerValues.map(({ value, count }) => (
                              <span
                                key={value}
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white border border-slate-200 text-[10px] text-slate-600"
                              >
                                <span className="font-semibold">{value || '(empty)'}</span>
                                <span className="text-slate-400">×{count}</span>
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                </div>
              </div>

              {/* Recent audit entries */}
              {entries.length > 0 && (
                <div>
                  <span className="text-xs font-bold text-slate-500 uppercase tracking-wider block mb-2">
                    Recent skips
                  </span>
                  <div className="overflow-x-auto">
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="border-b border-slate-100">
                          <th className="text-left py-1.5 pr-3 font-semibold text-slate-400 whitespace-nowrap">Field</th>
                          <th className="text-left py-1.5 pr-3 font-semibold text-slate-400 whitespace-nowrap">Trigger value</th>
                          <th className="text-left py-1.5 pr-3 font-semibold text-slate-400 whitespace-nowrap">Jumped to</th>
                          <th className="text-left py-1.5 font-semibold text-slate-400 whitespace-nowrap">When</th>
                        </tr>
                      </thead>
                      <tbody>
                        {entries.map((e) => (
                          <tr key={e.id} className="border-b border-slate-50 hover:bg-slate-50 transition-colors">
                            <td className="py-1.5 pr-3 text-slate-700 font-medium truncate max-w-[120px]">
                              {e.source_field_label || `Field #${e.submission_id}`}
                            </td>
                            <td className="py-1.5 pr-3 text-slate-500 truncate max-w-[100px]">
                              {e.trigger_value || <span className="italic text-slate-300">—</span>}
                            </td>
                            <td className="py-1.5 pr-3 text-slate-500 truncate max-w-[120px]">
                              {e.target_type === 'end'
                                ? <span className="font-semibold text-emerald-600">End of form</span>
                                : e.target_field_label || e.target_type}
                            </td>
                            <td className="py-1.5 text-slate-400 whitespace-nowrap">
                              {new Date(e.triggered_at).toLocaleString('en-AU', {
                                day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit',
                              })}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
