/**
 * Shared primitives for the Work workspace tabs.
 * Keeps each tab file lean.
 */
import { Loader2, AlertCircle, Search, X, ChevronLeft, ChevronRight } from 'lucide-react';

// ── Loading state ─────────────────────────────────────────────────────────────

export function WorkLoading({ label }: { label: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 gap-3 text-muted-foreground">
      <Loader2 size={24} className="animate-spin" />
      <p className="text-sm">Loading {label}…</p>
    </div>
  );
}

// ── Error state ───────────────────────────────────────────────────────────────

export function WorkError({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center py-20 gap-3 text-destructive">
      <AlertCircle size={24} />
      <p className="text-sm font-medium">{message}</p>
      {onRetry && (
        <button
          onClick={onRetry}
          className="text-xs text-primary underline underline-offset-2 hover:no-underline"
        >
          Try again
        </button>
      )}
    </div>
  );
}

// ── Empty state ───────────────────────────────────────────────────────────────

export function WorkEmpty({
  icon: Icon,
  title,
  subtitle,
  action,
}: {
  icon: React.ElementType;
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center py-20 gap-3 text-muted-foreground">
      <div className="w-12 h-12 rounded-2xl bg-muted flex items-center justify-center">
        <Icon size={22} className="text-muted-foreground" />
      </div>
      <p className="text-sm font-semibold text-foreground">{title}</p>
      {subtitle && <p className="text-xs text-center max-w-xs">{subtitle}</p>}
      {action}
    </div>
  );
}

// ── Search bar ────────────────────────────────────────────────────────────────

export function WorkSearchBar({
  value,
  onChange,
  placeholder = 'Search…',
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <div className="flex items-center gap-2 bg-muted rounded-xl px-3 py-2 min-w-0 flex-1">
      <Search size={14} className="text-muted-foreground shrink-0" />
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="flex-1 bg-transparent text-sm text-foreground placeholder-muted-foreground outline-none min-w-0"
      />
      {value && (
        <button onClick={() => onChange('')} className="text-muted-foreground hover:text-foreground shrink-0">
          <X size={13} />
        </button>
      )}
    </div>
  );
}

// ── Pagination controls ───────────────────────────────────────────────────────

export function WorkPagination({
  hasMore,
  hasPrev,
  onNext,
  onPrev,
  loading,
}: {
  hasMore: boolean;
  hasPrev: boolean;
  onNext: () => void;
  onPrev: () => void;
  loading?: boolean;
}) {
  if (!hasMore && !hasPrev) return null;
  return (
    <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-border">
      <button
        onClick={onPrev}
        disabled={!hasPrev || loading}
        className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        <ChevronLeft size={14} /> Prev
      </button>
      <button
        onClick={onNext}
        disabled={!hasMore || loading}
        className="flex items-center gap-1 text-xs font-medium text-muted-foreground hover:text-foreground disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        Next <ChevronRight size={14} />
      </button>
    </div>
  );
}

// ── Status badge ──────────────────────────────────────────────────────────────

const STATUS_COLOURS: Record<string, string> = {
  Open:        'bg-blue-100 text-blue-700',
  'In Progress': 'bg-amber-100 text-amber-700',
  Completed:   'bg-green-100 text-green-700',
  Cancelled:   'bg-gray-100 text-gray-500',
  Active:      'bg-green-100 text-green-700',
  Closed:      'bg-gray-100 text-gray-500',
  delay:       'bg-orange-100 text-orange-700',
  condition:   'bg-sky-100 text-sky-700',
  signin:      'bg-green-100 text-green-700',
  signout:     'bg-gray-100 text-gray-500',
};

export function StatusBadge({ status }: { status: string }) {
  const cls = STATUS_COLOURS[status] ?? 'bg-muted text-muted-foreground';
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold ${cls}`}>
      {status}
    </span>
  );
}

// ── Job link chip ─────────────────────────────────────────────────────────────

export function JobChip({
  jobId,
  jobName,
  jobNumber,
}: {
  jobId: number | null;
  jobName: string | null;
  jobNumber?: string | null;
}) {
  if (!jobId || !jobName) return <span className="text-muted-foreground text-xs">—</span>;
  return (
    <a
      href={`/jobs/${jobId}`}
      className="inline-flex items-center gap-1 text-xs text-primary hover:underline underline-offset-2 font-medium truncate max-w-[160px]"
      title={jobName}
    >
      {jobNumber ? <span className="font-mono text-[10px] text-muted-foreground">{jobNumber}</span> : null}
      <span className="truncate">{jobName}</span>
    </a>
  );
}

// ── Back-to-job banner ────────────────────────────────────────────────────────

export function BackToJobBanner({
  jobId,
  jobName,
  onClear,
}: {
  jobId: number;
  jobName: string | null;
  onClear: () => void;
}) {
  return (
    <div className="flex items-center gap-2 px-4 py-2 bg-violet-50 border-b border-violet-100 text-sm">
      <span className="text-violet-700 font-medium truncate flex-1">
        Filtered to: <strong>{jobName ?? `Job #${jobId}`}</strong>
      </span>
      <a
        href={`/jobs/${jobId}`}
        className="text-xs text-violet-600 hover:underline shrink-0"
      >
        Back to Job
      </a>
      <button
        onClick={onClear}
        className="text-violet-400 hover:text-violet-700 shrink-0"
        aria-label="Clear job filter"
      >
        <X size={14} />
      </button>
    </div>
  );
}

// ── Date formatter ────────────────────────────────────────────────────────────

export function fmtDate(val: string | null | undefined): string {
  if (!val) return '—';
  try {
    return new Date(val).toLocaleDateString('en-AU', {
      day: '2-digit', month: 'short', year: 'numeric',
    });
  } catch {
    return String(val);
  }
}

export function fmtDateTime(val: string | null | undefined): string {
  if (!val) return '—';
  try {
    return new Date(val).toLocaleString('en-AU', {
      day: '2-digit', month: 'short', year: 'numeric',
      hour: '2-digit', minute: '2-digit',
    });
  } catch {
    return String(val);
  }
}
