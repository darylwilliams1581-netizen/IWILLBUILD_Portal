/**
 * ProposedChangeCard — shows a proposed change summary with Apply/Undo actions.
 */
import { CheckCircle2, Undo2, AlertTriangle, ChevronDown, ChevronUp } from 'lucide-react';
import { useState } from 'react';
import type { ProposedChange } from './types';

interface Props {
  change: ProposedChange;
  onApply: (change: ProposedChange) => void;
  onUndo: () => void;
  isApplying: boolean;
}

export default function ProposedChangeCard({ change, onApply, onUndo, isApplying }: Props) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="rounded-xl border border-violet-200 bg-violet-50 overflow-hidden">
      {/* Header */}
      <div className="px-3 py-2.5 flex items-start gap-2">
        <div className="w-5 h-5 rounded-full bg-violet-600 flex items-center justify-center shrink-0 mt-0.5">
          <CheckCircle2 size={12} className="text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-violet-900 leading-snug">Proposed change</p>
          <p className="text-xs text-violet-700 mt-0.5 leading-snug">{change.summary}</p>
        </div>
        <button
          onClick={() => setExpanded(v => !v)}
          className="shrink-0 text-violet-500 hover:text-violet-700 transition-colors"
          aria-label={expanded ? 'Collapse details' : 'Expand details'}
        >
          {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
        </button>
      </div>

      {/* Expanded details */}
      {expanded && (
        <div className="px-3 pb-2 space-y-1.5 border-t border-violet-200 pt-2">
          {change.affectedSections.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold text-violet-600 uppercase tracking-wide">Sections</p>
              <p className="text-xs text-violet-800">{change.affectedSections.join(', ')}</p>
            </div>
          )}
          {change.affectedItems.length > 0 && (
            <div>
              <p className="text-[10px] font-semibold text-violet-600 uppercase tracking-wide">Items</p>
              <p className="text-xs text-violet-800">{change.affectedItems.join(', ')}</p>
            </div>
          )}
          {change.validationImpact && (
            <div className="flex items-start gap-1.5">
              <AlertTriangle size={11} className="text-amber-500 mt-0.5 shrink-0" />
              <p className="text-xs text-amber-700">{change.validationImpact}</p>
            </div>
          )}
          <div>
            <p className="text-[10px] font-semibold text-violet-600 uppercase tracking-wide">Operations</p>
            <p className="text-xs text-violet-800">{change.operations.length} operation{change.operations.length !== 1 ? 's' : ''}</p>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="px-3 py-2 flex gap-2 border-t border-violet-200">
        <button
          onClick={() => onApply(change)}
          disabled={isApplying}
          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-700 disabled:opacity-50 text-white text-xs font-semibold transition-colors"
        >
          <CheckCircle2 size={12} />
          {isApplying ? 'Applying…' : 'Apply'}
        </button>
        <button
          onClick={onUndo}
          disabled={isApplying}
          className="flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-white border border-violet-200 hover:bg-violet-50 disabled:opacity-50 text-violet-700 text-xs font-semibold transition-colors"
        >
          <Undo2 size={12} />
          Undo
        </button>
      </div>
    </div>
  );
}
