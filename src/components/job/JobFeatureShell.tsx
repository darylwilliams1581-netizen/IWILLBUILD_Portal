/**
 * JobFeatureShell — Shared standalone feature wrapper (Path B).
 *
 * Renders the header (Back, feature icon+name, job name+number, Change Job)
 * and wraps the canonical feature component as children.
 *
 * Used by every standalone /jobs/:id/<feature> page that is reached
 * via the Work & Field launcher or directly via a deep link.
 *
 * BACK NAVIGATION — deterministic, not history-dependent:
 *   - If `backTo` is provided, Back navigates there explicitly.
 *   - Otherwise falls back to navigate(-1) when history depth > 1.
 *   - Safe fallback: /work-field (never an arbitrary external URL).
 *   - backTo is validated to be an internal path (starts with /).
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
  /**
   * Explicit back destination.
   * Must be an internal path starting with "/".
   * If omitted, falls back to navigate(-1) or /work-field.
   */
  backTo?: string;
  /** Called when user taps "Change Job" — should navigate back to the launcher picker */
  onChangeJob: () => void;
  /**
   * Optional desktop-only toolbar actions rendered in the header right slot,
   * to the left of the Change Job button.
   * Use for feature-specific actions (e.g. Upload, Camera, Select for Photos).
   */
  desktopActions?: ReactNode;
  /** The canonical feature component */
  children: ReactNode;
}

/** Validate that a back destination is a safe internal path */
function isSafeBackPath(path: string | undefined): path is string {
  if (!path) return false;
  // Must start with / and not be an external URL
  return path.startsWith('/') && !path.startsWith('//');
}

export default function JobFeatureShell({
  Icon,
  featureLabel,
  jobName,
  jobNumber,
  backTo,
  onChangeJob,
  desktopActions,
  children,
}: JobFeatureShellProps) {
  const navigate = useNavigate();

  function handleBack() {
    if (isSafeBackPath(backTo)) {
      navigate(backTo);
      return;
    }
    // Check if there is real history to go back to (history.length > 1 means
    // we didn't land here directly from a bookmark/deep link)
    if (window.history.length > 1) {
      navigate(-1);
      return;
    }
    // Safe fallback for direct deep links
    navigate('/work-field');
  }

  // Derive a display back label for the header
  const backLabel = isSafeBackPath(backTo)
    ? backTo === '/work-field' ? 'Work & Field' : 'Back'
    : 'Back';

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* ── Mobile header ── */}
      <header className="md:hidden h-14 bg-white border-b border-gray-200 flex items-center justify-between px-4 shrink-0 sticky top-0 z-30 safe-top">
        <div className="flex items-center gap-2 min-w-0">
          <button
            onClick={handleBack}
            className="p-1.5 -ml-1 rounded text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors shrink-0"
            aria-label={backLabel}
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
          onClick={handleBack}
          className="p-1 -ml-0.5 rounded text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors shrink-0"
          aria-label={backLabel}
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
        <div className="ml-auto flex items-center gap-2 shrink-0">
          {desktopActions}
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
