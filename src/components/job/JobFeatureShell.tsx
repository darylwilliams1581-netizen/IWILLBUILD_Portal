/**
 * JobFeatureShell — Shared standalone feature wrapper (Path B).
 *
 * Renders the header (Back, feature icon+name, job name+number, Change Job)
 * and wraps the canonical feature component as children.
 *
 * Used by every standalone /jobs/:jobId/<feature> page that is reached
 * via the Work & Field launcher.
 */
import { type ReactNode } from 'react';
import { useNavigate } from 'react-router';
import { ArrowLeft, RefreshCw, type LucideIcon } from 'lucide-react';

interface JobFeatureShellProps {
  /** Feature icon component */
  Icon: LucideIcon | React.ComponentType<{ size?: number; className?: string }>;
  /** Feature label (e.g. "Tasks") */
  featureLabel: string;
  /** Job name */
  jobName: string;
  /** Job number (optional) */
  jobNumber?: string | null;
  /** Called when user taps "Change Job" — should navigate back to the launcher picker */
  onChangeJob: () => void;
  /** The canonical feature component */
  children: ReactNode;
}

export default function JobFeatureShell({
  Icon,
  featureLabel,
  jobName,
  jobNumber,
  onChangeJob,
  children,
}: JobFeatureShellProps) {
  const navigate = useNavigate();

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* ── Mobile header ── */}
      <header className="md:hidden h-14 bg-white border-b border-gray-200 flex items-center justify-between px-4 shrink-0 sticky top-0 z-30 safe-top">
        <div className="flex items-center gap-2 min-w-0">
          <button
            onClick={() => navigate(-1)}
            className="p-1.5 -ml-1 rounded text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors shrink-0"
            aria-label="Back"
          >
            <ArrowLeft size={18} />
          </button>
          <Icon size={15} className="text-primary shrink-0" />
          <div className="min-w-0">
            <p className="font-heading font-bold text-sm text-gray-900 truncate leading-tight">
              {featureLabel}
            </p>
            <p className="text-[10px] text-gray-400 truncate leading-tight">
              {jobNumber ? `${jobNumber} — ${jobName}` : jobName}
            </p>
          </div>
        </div>
        <button
          onClick={onChangeJob}
          className="flex items-center gap-1.5 text-xs font-semibold text-primary hover:bg-violet-50 px-2.5 py-1.5 rounded transition-colors shrink-0"
          aria-label="Change job"
        >
          <RefreshCw size={12} />
          <span className="hidden sm:inline">Change Job</span>
        </button>
      </header>

      {/* ── Desktop header ── */}
      <header className="op-page-header hidden md:flex sticky top-0 z-30">
        <button
          onClick={() => navigate(-1)}
          className="p-1 -ml-0.5 rounded text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors shrink-0"
          aria-label="Back"
        >
          <ArrowLeft size={15} />
        </button>
        <Icon size={14} className="text-primary shrink-0 mt-0.5" />
        <div className="flex flex-col min-w-0">
          <h1 className="op-page-title">{featureLabel}</h1>
          <p className="op-page-subtitle">
            {jobNumber ? `${jobNumber} — ${jobName}` : jobName}
          </p>
        </div>
        <div className="ml-auto shrink-0">
          <button
            onClick={onChangeJob}
            className="flex items-center gap-1.5 text-xs font-semibold text-primary hover:bg-violet-50 px-3 py-1.5 rounded-lg border border-violet-200 transition-colors"
          >
            <RefreshCw size={12} />
            Change Job
          </button>
        </div>
      </header>

      {/* ── Content ── */}
      <div className="flex-1 min-h-0 overflow-y-auto">
        {children}
      </div>
    </div>
  );
}
