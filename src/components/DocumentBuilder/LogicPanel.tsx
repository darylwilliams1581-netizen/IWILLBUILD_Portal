/**
 * Studio Conditional Logic — Logic Panel
 * ─────────────────────────────────────────────────────────────────────────────
 * Rendered inside BlockInspector when the "Logic" tab is active.
 * Shows all rules owned by the selected block + a global rule list.
 *
 * Layout:
 *   ┌─────────────────────────────────────────────────────┐
 *   │  Logic rules for this block                         │
 *   │  [+ Add rule]                                       │
 *   │  ─────────────────────────────────────────────────  │
 *   │  [Rule card 1]                                      │
 *   │  [Rule card 2]                                      │
 *   │  ─────────────────────────────────────────────────  │
 *   │  ⚠ Broken rules (if any)                           │
 *   └─────────────────────────────────────────────────────┘
 */

import { useMemo } from 'react';
import { Plus, Zap, AlertTriangle, Info } from 'lucide-react';
import { nanoid } from 'nanoid';
import { useDocumentStore } from './useDocumentStore';
import LogicRuleEditor from './LogicRuleEditor';
import type { LogicRule, LogicRuleValidation } from './types';

interface Props {
  blockId: string;
}

export default function LogicPanel({ blockId }: Props) {
  const { addLogicRule, getRulesForBlock, validateLogicRules, blocks } = useDocumentStore();

  const rules = getRulesForBlock(blockId);
  const brokenRules: LogicRuleValidation[] = useMemo(
    () => validateLogicRules(),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [blocks, getRulesForBlock(blockId).length],
  );
  const brokenMap = Object.fromEntries(brokenRules.map((v) => [v.ruleId, v.errors]));

  const handleAddRule = () => {
    const newRule: LogicRule = {
      id: nanoid(10),
      ownerBlockId: blockId,
      description: '',
      conditionMode: 'AND',
      conditions: [
        {
          id: nanoid(8),
          source: 'field',
          fieldId: '',
          fieldLabel: '',
          operator: 'equals',
          value: '',
        },
      ],
      actions: [
        {
          id: nanoid(8),
          action: 'show',
          targetBlockId: '',
          targetLabel: '',
        },
      ],
      enabled: true,
    };
    addLogicRule(newRule);
  };

  return (
    <div className="flex flex-col gap-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Zap size={12} className="text-primary" />
          <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">
            Logic Rules
          </span>
          {rules.length > 0 && (
            <span className="px-1.5 py-0.5 rounded-full bg-primary text-white text-[9px] font-bold">
              {rules.length}
            </span>
          )}
        </div>
        <button
          onClick={handleAddRule}
          className="flex items-center gap-1 text-[10px] font-semibold text-primary hover:text-violet-700 transition-colors"
        >
          <Plus size={11} /> Add rule
        </button>
      </div>

      {/* Empty state */}
      {rules.length === 0 && (
        <div className="flex flex-col items-center gap-2 py-6 text-center">
          <div className="w-10 h-10 rounded-xl bg-violet-50 border border-violet-100 flex items-center justify-center">
            <Zap size={16} className="text-primary" />
          </div>
          <p className="text-xs font-semibold text-slate-600">No logic rules yet</p>
          <p className="text-[10px] text-slate-500 max-w-[160px] leading-relaxed">
            Add a rule to show, hide, or require things based on field values.
          </p>
          <button
            onClick={handleAddRule}
            className="mt-1 flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary text-white text-xs font-semibold hover:bg-violet-700 transition-colors"
          >
            <Plus size={11} /> Add first rule
          </button>
        </div>
      )}

      {/* Rule cards */}
      {rules.length > 0 && (
        <div className="flex flex-col gap-2">
          {rules.map((rule) => (
            <LogicRuleEditor
              key={rule.id}
              rule={rule}
              validationErrors={brokenMap[rule.id] ?? []}
            />
          ))}
        </div>
      )}

      {/* Broken rules summary */}
      {brokenRules.length > 0 && (
        <div className="flex items-start gap-2 px-2.5 py-2 bg-amber-50 border border-amber-200 rounded-lg">
          <AlertTriangle size={12} className="text-amber-500 flex-shrink-0 mt-0.5" />
          <div>
            <p className="text-[10px] font-bold text-amber-700">
              {brokenRules.length} broken {brokenRules.length === 1 ? 'rule' : 'rules'} in this document
            </p>
            <p className="text-[10px] text-amber-600 mt-0.5">
              Referenced blocks or fields have been deleted. Update or remove the affected rules.
            </p>
          </div>
        </div>
      )}

      {/* Help tip */}
      <div className="flex items-start gap-2 px-2.5 py-2 bg-slate-50 border border-slate-100 rounded-lg">
        <Info size={11} className="text-slate-400 flex-shrink-0 mt-0.5" />
        <p className="text-[10px] text-slate-500 leading-relaxed">
          Rules on this block run when the document is filled out. Actions can target any block in the document.
        </p>
      </div>
    </div>
  );
}
