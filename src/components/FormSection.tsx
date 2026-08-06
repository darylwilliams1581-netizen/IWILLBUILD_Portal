/**
 * FormSection
 * ─────────────────────────────────────────────────────────────────────────────
 * A collapsible form section card with a drag-race green-light completion
 * indicator on the left edge.
 *
 * Usage:
 *   <FormSection
 *     title="Incident Details"
 *     icon={<AlertTriangle size={13} className="text-red-500" />}
 *     complete={isDetailsComplete}
 *     required            // shows a red dot on the title when incomplete
 *     defaultOpen         // starts expanded (default: true)
 *   >
 *     {/* form fields *\/}
 *   </FormSection>
 *
 * Completion indicator:
 *   - Amber pulsing dot  → section has required fields, none filled yet
 *   - Amber solid dot    → section partially filled
 *   - Green solid dot    → all required fields filled (complete=true)
 *   - Grey dot           → optional section, no required fields
 *
 * The left-border colour transitions amber → green as the section completes.
 */

import { useState, type ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

export type SectionState = 'empty' | 'partial' | 'complete' | 'optional';

interface FormSectionProps {
  title: string;
  icon?: ReactNode;
  /** Pass true when all required fields in this section are filled */
  complete?: boolean;
  /** Pass a 0–1 float for partial fill (e.g. 2/4 fields = 0.5) */
  fillRatio?: number;
  /** If true, shows a required indicator and uses amber/green states */
  required?: boolean;
  /** Start expanded (default true) */
  defaultOpen?: boolean;
  /** Disable collapse — section stays open always */
  alwaysOpen?: boolean;
  children: ReactNode;
  /** Extra content rendered in the header row (right side) */
  headerRight?: ReactNode;
  /** Accent colour for the left border and dot — defaults to 'violet' */
  accent?: 'violet' | 'rose' | 'amber' | 'emerald' | 'red' | 'blue';
}

const ACCENT: Record<string, { border: string; dot: string; dotComplete: string; dotPartial: string }> = {
  violet:  { border: 'border-l-violet-500',  dot: 'bg-amber-400',  dotComplete: 'bg-emerald-500', dotPartial: 'bg-amber-400' },
  rose:    { border: 'border-l-rose-500',    dot: 'bg-amber-400',  dotComplete: 'bg-emerald-500', dotPartial: 'bg-amber-400' },
  amber:   { border: 'border-l-amber-500',   dot: 'bg-amber-400',  dotComplete: 'bg-emerald-500', dotPartial: 'bg-amber-400' },
  emerald: { border: 'border-l-emerald-500', dot: 'bg-slate-300',  dotComplete: 'bg-emerald-500', dotPartial: 'bg-emerald-400' },
  red:     { border: 'border-l-red-500',     dot: 'bg-amber-400',  dotComplete: 'bg-emerald-500', dotPartial: 'bg-amber-400' },
  blue:    { border: 'border-l-blue-500',    dot: 'bg-amber-400',  dotComplete: 'bg-emerald-500', dotPartial: 'bg-amber-400' },
};

export default function FormSection({
  title,
  icon,
  complete = false,
  fillRatio,
  required = false,
  defaultOpen = true,
  alwaysOpen = false,
  children,
  headerRight,
  accent = 'violet',
}: FormSectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  const isOpen = alwaysOpen || open;

  const colors = ACCENT[accent] ?? ACCENT.violet;

  // Determine dot state
  const dotClass = (() => {
    if (!required) return 'bg-slate-300'; // optional — grey
    if (complete) return colors.dotComplete;
    if (fillRatio !== undefined && fillRatio > 0) return colors.dotPartial;
    return colors.dot; // empty required
  })();

  // Pulse only when required + empty
  const pulse = required && !complete && (fillRatio === undefined || fillRatio === 0);

  // Left border colour
  const borderClass = complete
    ? 'border-l-emerald-500'
    : required
      ? `border-l-amber-400`
      : 'border-l-slate-200';

  return (
    <div
      className={`bg-white rounded-2xl shadow-sm border border-slate-100 border-l-4 overflow-hidden ${borderClass} transition-colors duration-500`}
    >
      {/* ── Header ── */}
      <button
        type="button"
        onClick={() => !alwaysOpen && setOpen(o => !o)}
        className={`w-full flex items-center gap-2.5 px-4 py-3 text-left ${alwaysOpen ? 'cursor-default' : 'hover:bg-slate-50/60 active:bg-slate-100/60'} transition-colors`}
        aria-expanded={isOpen}
      >
        {/* Completion dot */}
        <span className="relative flex shrink-0 items-center justify-center w-4 h-4">
          <span
            className={`w-2.5 h-2.5 rounded-full ${dotClass} transition-colors duration-500`}
          />
          {pulse && (
            <span
              className={`absolute inset-0 rounded-full ${dotClass} opacity-60 animate-ping`}
            />
          )}
        </span>

        {/* Icon */}
        {icon && <span className="shrink-0 text-slate-400">{icon}</span>}

        {/* Title */}
        <span className="flex-1 text-xs font-semibold text-slate-600 uppercase tracking-wide leading-none">
          {title}
          {required && !complete && (
            <span className="ml-1 text-red-400 text-[10px] align-super">*</span>
          )}
        </span>

        {/* Header right slot */}
        {headerRight && (
          <span className="shrink-0" onClick={e => e.stopPropagation()}>
            {headerRight}
          </span>
        )}

        {/* Chevron */}
        {!alwaysOpen && (
          <motion.span
            animate={{ rotate: isOpen ? 180 : 0 }}
            transition={{ duration: 0.2 }}
            className="shrink-0 text-slate-300"
          >
            <ChevronDown size={15} />
          </motion.span>
        )}
      </button>

      {/* ── Body ── */}
      <AnimatePresence initial={false}>
        {isOpen && (
          <motion.div
            key="body"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: 'easeInOut' as const }}
            style={{ overflow: 'hidden' }}
          >
            <div className="px-4 pb-4 space-y-3">
              {children}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
