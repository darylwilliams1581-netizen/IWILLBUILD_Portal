/**
 * SessionSummaryCard
 *
 * Shown after a driving session is stopped.
 * Displays drive time, distance, avg/max speed, and collision count
 * — only for metrics that are enabled in fleet analytics settings.
 *
 * No speed is shown on the live map. This card only appears post-session.
 */
import { motion } from 'motion/react';
import {
  CheckCircle2, Clock, Route, Gauge, TrendingUp,
  AlertTriangle, X, ChevronRight,
} from 'lucide-react';
import type { FleetAnalyticsSettings } from '@/lib/useFleetAnalytics';

export interface SessionSummary {
  drive_time_seconds: number | null;
  total_distance_km: number | null;
  avg_speed_kmh: number | null;
  max_speed_kmh: number | null;
  collision_count: number;
  settings: FleetAnalyticsSettings;
}

interface Props {
  assetName: string;
  summary: SessionSummary;
  onClose: () => void;
}

function fmtDuration(secs: number): string {
  if (secs < 60) return `${secs}s`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins}m`;
  const hrs  = Math.floor(mins / 60);
  const rem  = mins % 60;
  return rem > 0 ? `${hrs}h ${rem}m` : `${hrs}h`;
}

function fmtDist(km: number): string {
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return `${km.toFixed(1)} km`;
}

interface StatRowProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  highlight?: boolean;
}

function StatRow({ icon, label, value, highlight }: StatRowProps) {
  return (
    <div className={`flex items-center justify-between py-2.5 px-3 rounded-lg ${
      highlight ? 'bg-amber-50 border border-amber-200' : 'bg-slate-50'
    }`}>
      <div className="flex items-center gap-2.5">
        <span className={`${highlight ? 'text-amber-600' : 'text-slate-500'}`}>{icon}</span>
        <span className="text-sm text-slate-600">{label}</span>
      </div>
      <span className={`text-sm font-bold ${highlight ? 'text-amber-700' : 'text-slate-800'}`}>
        {value}
      </span>
    </div>
  );
}

export default function SessionSummaryCard({ assetName, summary, onClose }: Props) {
  const { settings } = summary;

  const hasAnyMetric =
    (settings.track_drive_time && summary.drive_time_seconds !== null) ||
    (settings.track_distance   && summary.total_distance_km  !== null) ||
    (settings.track_speed      && (summary.avg_speed_kmh !== null || summary.max_speed_kmh !== null));

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.96, y: 8 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.96, y: 8 }}
      transition={{ duration: 0.18 }}
      className="bg-white rounded-2xl shadow-2xl border border-border w-full max-w-sm"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-5 py-4 border-b border-border">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-green-100 flex items-center justify-center">
            <CheckCircle2 size={16} className="text-green-600" />
          </div>
          <div>
            <h3 className="font-heading font-bold text-sm">Session Complete</h3>
            <p className="text-xs text-muted-foreground">{assetName}</p>
          </div>
        </div>
        <button
          onClick={onClose}
          className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
        >
          <X size={15} />
        </button>
      </div>

      {/* Stats */}
      <div className="px-5 py-4 flex flex-col gap-2">
        {!hasAnyMetric && (
          <p className="text-sm text-muted-foreground text-center py-2">
            Analytics tracking is disabled. Enable metrics in Fleet Settings.
          </p>
        )}

        {settings.track_drive_time && summary.drive_time_seconds !== null && (
          <StatRow
            icon={<Clock size={15} />}
            label="Drive time"
            value={fmtDuration(summary.drive_time_seconds)}
          />
        )}

        {settings.track_distance && summary.total_distance_km !== null && (
          <StatRow
            icon={<Route size={15} />}
            label="Distance"
            value={fmtDist(summary.total_distance_km)}
          />
        )}

        {settings.track_speed && summary.avg_speed_kmh !== null && (
          <StatRow
            icon={<Gauge size={15} />}
            label="Avg speed"
            value={`${summary.avg_speed_kmh} km/h`}
          />
        )}

        {settings.track_speed && summary.max_speed_kmh !== null && (
          <StatRow
            icon={<TrendingUp size={15} />}
            label="Max speed"
            value={`${summary.max_speed_kmh} km/h`}
            highlight={
              settings.enable_speeding_alerts &&
              summary.max_speed_kmh > settings.speeding_threshold_kmh
            }
          />
        )}

        {summary.collision_count > 0 && (
          <StatRow
            icon={<AlertTriangle size={15} />}
            label="Collision events"
            value={String(summary.collision_count)}
            highlight
          />
        )}
      </div>

      {/* Footer */}
      <div className="px-5 pb-4">
        <button
          onClick={onClose}
          className="w-full flex items-center justify-center gap-1.5 px-4 py-2.5 bg-primary text-white text-sm font-semibold rounded-lg hover:bg-primary/90 transition-colors"
        >
          Done
          <ChevronRight size={14} />
        </button>
      </div>
    </motion.div>
  );
}
