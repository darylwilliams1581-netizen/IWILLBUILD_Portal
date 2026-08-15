/**
 * EmailSentToast
 * A self-dismissing notification that slides in from the bottom-right.
 *
 * variant="success"  → green  "✓ Email sent successfully"
 * variant="warning"  → amber  "Email sent, but the activity note could not be saved"
 * variant="error"    → red    arbitrary message
 *
 * Fades out after `duration` ms (default 4000).
 * Call `onDismiss` to remove it from the parent's state.
 */
import { useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { CheckCircle2, AlertTriangle, XCircle, X } from 'lucide-react';

export type ToastVariant = 'success' | 'warning' | 'error';

export interface EmailSentToastProps {
  id: string;
  variant: ToastVariant;
  title: string;
  subtitle?: string;
  duration?: number;
  onDismiss: (id: string) => void;
}

const STYLES: Record<ToastVariant, { bg: string; border: string; icon: string; titleCls: string }> = {
  success: {
    bg: 'bg-emerald-50',
    border: 'border-emerald-200',
    icon: 'text-emerald-500',
    titleCls: 'text-emerald-900',
  },
  warning: {
    bg: 'bg-amber-50',
    border: 'border-amber-200',
    icon: 'text-amber-500',
    titleCls: 'text-amber-900',
  },
  error: {
    bg: 'bg-red-50',
    border: 'border-red-200',
    icon: 'text-red-500',
    titleCls: 'text-red-900',
  },
};

const ICONS: Record<ToastVariant, typeof CheckCircle2> = {
  success: CheckCircle2,
  warning: AlertTriangle,
  error: XCircle,
};

export default function EmailSentToast({
  id,
  variant,
  title,
  subtitle,
  duration = 4000,
  onDismiss,
}: EmailSentToastProps) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const s = STYLES[variant];
  const Icon = ICONS[variant];

  useEffect(() => {
    timerRef.current = setTimeout(() => onDismiss(id), duration);
    return () => { if (timerRef.current) clearTimeout(timerRef.current); };
  }, [id, duration, onDismiss]);

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 24, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 12, scale: 0.96 }}
      transition={{ duration: 0.22, ease: 'easeOut' }}
      className={`flex items-start gap-3 px-4 py-3.5 rounded-2xl border shadow-lg min-w-[260px] max-w-sm ${s.bg} ${s.border}`}
    >
      <Icon size={18} className={`${s.icon} shrink-0 mt-0.5`} />
      <div className="flex-1 min-w-0">
        <p className={`text-sm font-semibold leading-snug ${s.titleCls}`}>{title}</p>
        {subtitle && <p className="text-xs text-gray-500 mt-0.5 leading-snug">{subtitle}</p>}
      </div>
      <button
        onClick={() => onDismiss(id)}
        className="shrink-0 text-gray-400 hover:text-gray-600 transition-colors mt-0.5"
        aria-label="Dismiss"
      >
        <X size={14} />
      </button>
    </motion.div>
  );
}

/* ── Toast container — fixed bottom-right, stacks multiple toasts ── */
export function EmailToastContainer({ toasts, onDismiss }: {
  toasts: EmailSentToastProps[];
  onDismiss: (id: string) => void;
}) {
  return (
    <div className="fixed bottom-6 right-4 md:right-6 z-[300] flex flex-col gap-2 items-end pointer-events-none">
      <AnimatePresence mode="popLayout">
        {toasts.map((t) => (
          <div key={t.id} className="pointer-events-auto">
            <EmailSentToast {...t} onDismiss={onDismiss} />
          </div>
        ))}
      </AnimatePresence>
    </div>
  );
}
