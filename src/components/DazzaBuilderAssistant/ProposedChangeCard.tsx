/**
 * ProposedChangeCard — shows a proposed change summary with Apply/Undo actions.
 */
import { CheckCircle2, Undo2, AlertTriangle, ChevronDown, ChevronUp, Ban } from 'lucide-react';
import { useState } from 'react';
import type { BuilderContext, ProposedChange } from './types';

interface Props {
  change: ProposedChange;
  /** The current builder context — used to detect stale/mismatched proposals. */
  builderContext: BuilderContext;
  onApply: (change: ProposedChange) => void;
  onUndo: () => void;
  isApplying: boolean;
}

/**
 * Returns a human-readable reason why Apply should be blocked, or null if it's safe.
 * Uses canonicalTemplateId (from URL route) as the authoritative open-template ID
 * so a null store templateId doesn't falsely block a valid proposal.
 */
function getApplyBlockReason(change: ProposedChange, ctx: BuilderContext): string | null {
  if (change.targetBuilderType !== ctx.builderType) {
    return `Proposal targets "${change.targetBuilderType}" builder but current builder is "${ctx.builderType}".`;
  }
  // Effective open template ID: prefer store value, fall back to canonical route ID
  const effectiveId = ctx.templateId ?? ctx.canonicalTemplateId ?? null;
  if (change.targetTemplateId !== null && change.targetTemplateId !== effectiveId) {
    return `Proposal targets template #${change.targetTemplateId} but template #${effectiveId ?? 'none'} is open. Re-run the request.`;
  }
  if (change.targetTemplateId === null && change.operations[0]?.op !== 'createNewTemplate') {
    return 'No template is open and the proposal has no createNewTemplate operation. Open a template first.';
  }
  return null;
}

export default function ProposedChangeCard({ change, builderContext, onApply, onUndo, isApplying }: Props) {
  const [expanded, setExpanded] = useState(false);
  const blockReason = getApplyBlockReason(change, builderContext);
  const isBlocked = blockReason !== null;

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

      {/* Stale/mismatch warning */}
      {isBlocked && (
        <div className="mx-3 mb-2 flex items-start gap-1.5 rounded-lg bg-amber-50 border border-amber-200 px-2.5 py-2">
          <Ban size={12} className="text-amber-600 shrink-0 mt-0.5" />
          <p className="text-xs text-amber-800 leading-snug">{blockReason}</p>
        </div>
      )}

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
          <div>
            <p className="text-[10px] font-semibold text-violet-600 uppercase tracking-wide">Target</p>
            <p className="text-xs text-violet-800">
              {change.targetTemplateId === null ? 'New template (will be created on Apply)' : `Template #${change.targetTemplateId}`}
              {' · '}{change.targetBuilderType}
            </p>
          </div>
        </div>
      )}

      {/* Actions */}
      <div className="px-3 py-2 flex gap-2 border-t border-violet-200">
        <button
          type="button"
          onClick={() => onApply(change)}
          disabled={isApplying || isBlocked}
          title={isBlocked ? blockReason ?? undefined : undefined}
          className="flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg bg-violet-600 hover:bg-violet-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-semibold transition-colors"
        >
          <CheckCircle2 size={12} />
          {isApplying ? 'Applying…' : isBlocked ? 'Cannot Apply' : 'Apply'}
        </button>
        <button
          type="button"
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
