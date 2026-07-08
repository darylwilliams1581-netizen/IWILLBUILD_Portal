/**
 * Skip Logic Editor
 * ─────────────────────────────────────────────────────────────────────────────
 * Rendered inside FieldCard (FormFieldBuilder) below the existing show/hide
 * logic editor. Lets builders define skip rules on any field.
 *
 * Features:
 *   - Add / edit / delete skip rules
 *   - Multiple conditions per rule (AND / OR)
 *   - Target: specific field, section, or end of form
 *   - Cycle detection with warning + blocked save
 *   - "Skip rules" badge showing rule count
 *   - Preview text: "If [Q1] = No, skip to Signature"
 */

import { useState, useMemo } from 'react';
import { Plus, Trash2, ChevronDown, ToggleLeft, ToggleRight, AlertTriangle, SkipForward, Info } from 'lucide-react';
import { nanoid } from 'nanoid';
import { motion, AnimatePresence } from 'motion/react';
import type { FormField } from '@/components/FormFieldBuilder';
import {
  type SkipRule,
  type SkipCondition,
  type SkipAction,
  type SkipOperator,
  type SkipTargetType,
  SKIP_OPERATOR_LABELS,
  SKIP_NO_VALUE_OPS,
  autoSkipDescription,
  parseSkipRules,
  serializeSkipRules,
} from '@/lib/skip-logic-types';
import {
  wouldCreateCycle,
  validOperatorsForFieldType,
  operatorNeedsValue,
} from '@/lib/skip-logic-engine';

// ── Shared style tokens ───────────────────────────────────────────────────────

const inp = 'w-full bg-white border border-slate-200 rounded-lg px-2.5 py-1.5 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/60 transition-colors';
const sel = `${inp} appearance-none pr-6 cursor-pointer`;
const lbl = 'text-[10px] font-bold text-slate-400 uppercase tracking-wider';

// ── Props ─────────────────────────────────────────────────────────────────────

interface SkipLogicEditorProps {
  /** The field this editor belongs to */
  field: FormField;
  /** All fields in the form (for target selection) */
  allFields: FormField[];
  /** Called when rules change — parent should persist logicJson */
  onChange: (newLogicJson: string) => void;
}

// ── Main component ────────────────────────────────────────────────────────────

export default function SkipLogicEditor({ field, allFields, onChange }: SkipLogicEditorProps) {
  const [expanded, setExpanded] = useState(false);

  const rules = useMemo(() => parseSkipRules(field.logicJson), [field.logicJson]);

  // Fields that can be used as conditions (all fields before this one, excluding layout)
  const conditionFields = useMemo(
    () => allFields.filter(
      (f) => f.id !== field.id &&
        !['section', 'instruction', 'instruction_image', 'page_break'].includes(f.fieldType),
    ),
    [allFields, field.id],
  );

  // Fields that can be jump targets (all fields after this one + sections)
  const targetFields = useMemo(() => {
    const idx = allFields.findIndex((f) => f.id === field.id);
    return allFields.slice(idx + 1);
  }, [allFields, field.id]);

  function updateRules(newRules: SkipRule[]) {
    onChange(serializeSkipRules(field.logicJson, newRules));
  }

  function addRule() {
    const firstCondField = conditionFields[0];
    const newRule: SkipRule = {
      id: nanoid(10),
      description: '',
      conditionMode: 'AND',
      conditions: [
        {
          id: nanoid(8),
          fieldId: firstCondField?.id ?? field.id,
          fieldLabel: firstCondField?.label || `Field #${firstCondField?.id ?? field.id}`,
          operator: 'equals',
          value: '',
        },
      ],
      action: {
        targetType: 'end',
        targetFieldId: undefined,
        targetLabel: undefined,
      },
      enabled: true,
    };
    updateRules([...rules, newRule]);
  }

  function updateRule(ruleId: string, patch: Partial<SkipRule>) {
    updateRules(rules.map((r) => r.id === ruleId ? { ...r, ...patch } : r));
  }

  function removeRule(ruleId: string) {
    updateRules(rules.filter((r) => r.id !== ruleId));
  }

  const enabledCount = rules.filter((r) => r.enabled).length;

  return (
    <div className="flex flex-col gap-2">
      {/* Header toggle */}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex items-center justify-between w-full px-3 py-2 rounded-xl border border-slate-200 bg-white hover:border-primary/40 hover:bg-orange-50/30 transition-colors"
      >
        <div className="flex items-center gap-2">
          <SkipForward size={13} className="text-primary" />
          <span className="text-xs font-semibold text-slate-700">Skip logic</span>
          {enabledCount > 0 && (
            <span className="px-1.5 py-0.5 rounded-full bg-primary text-white text-[9px] font-bold leading-none">
              {enabledCount}
            </span>
          )}
          {enabledCount > 0 && rules[0] && (
            <span className="text-[10px] text-slate-400 truncate max-w-[140px]">
              {autoSkipDescription(rules[0])}
            </span>
          )}
        </div>
        <ChevronDown
          size={12}
          className={`text-slate-400 transition-transform ${expanded ? 'rotate-180' : ''}`}
        />
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.15 }}
            className="overflow-hidden"
          >
            <div className="flex flex-col gap-2 pt-1">
              {/* Empty state */}
              {rules.length === 0 && (
                <div className="flex flex-col items-center gap-2 py-5 text-center bg-slate-50 rounded-xl border border-dashed border-slate-200">
                  <SkipForward size={18} className="text-slate-300" />
                  <p className="text-xs font-semibold text-slate-500">No skip rules yet</p>
                  <p className="text-[10px] text-slate-400 max-w-[180px] leading-relaxed">
                    Route users to a different question, section, or the end of the form based on their answer.
                  </p>
                </div>
              )}

              {/* Rule cards */}
              {rules.map((rule) => (
                <SkipRuleCard
                  key={rule.id}
                  rule={rule}
                  field={field}
                  allFields={allFields}
                  conditionFields={conditionFields}
                  targetFields={targetFields}
                  onUpdate={(patch) => updateRule(rule.id, patch)}
                  onRemove={() => removeRule(rule.id)}
                />
              ))}

              {/* Add rule button */}
              <button
                type="button"
                onClick={addRule}
                className="flex items-center gap-1.5 text-xs font-semibold text-primary hover:text-orange-600 transition-colors py-1"
              >
                <Plus size={12} /> Add skip rule
              </button>

              {/* Help tip */}
              <div className="flex items-start gap-2 px-2.5 py-2 bg-slate-50 border border-slate-100 rounded-lg">
                <Info size={11} className="text-slate-400 flex-shrink-0 mt-0.5" />
                <p className="text-[10px] text-slate-400 leading-relaxed">
                  Rules are evaluated in order. The first matching rule wins. Skipped required fields are automatically made optional.
                </p>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ── Skip Rule Card ────────────────────────────────────────────────────────────

interface SkipRuleCardProps {
  rule: SkipRule;
  field: FormField;
  allFields: FormField[];
  conditionFields: FormField[];
  targetFields: FormField[];
  onUpdate: (patch: Partial<SkipRule>) => void;
  onRemove: () => void;
}

function SkipRuleCard({
  rule,
  field,
  allFields,
  conditionFields,
  targetFields,
  onUpdate,
  onRemove,
}: SkipRuleCardProps) {
  const [collapsed, setCollapsed] = useState(false);

  // Cycle check for the current action target
  const cycleCheck = useMemo(() => {
    if (rule.action.targetType === 'end') return { hasCycle: false, cyclePath: [] };
    if (!rule.action.targetFieldId) return { hasCycle: false, cyclePath: [] };
    return wouldCreateCycle(allFields, field.id, rule.action.targetFieldId);
  }, [allFields, field.id, rule.action.targetFieldId, rule.action.targetType]);

  function updateCondition(condId: string, patch: Partial<SkipCondition>) {
    onUpdate({
      conditions: rule.conditions.map((c) => c.id === condId ? { ...c, ...patch } : c),
    });
  }

  function addCondition() {
    const firstField = conditionFields[0];
    const newCond: SkipCondition = {
      id: nanoid(8),
      fieldId: firstField?.id ?? field.id,
      fieldLabel: firstField?.label || `Field #${firstField?.id ?? field.id}`,
      operator: 'equals',
      value: '',
    };
    onUpdate({ conditions: [...rule.conditions, newCond] });
  }

  function removeCondition(condId: string) {
    onUpdate({ conditions: rule.conditions.filter((c) => c.id !== condId) });
  }

  function updateAction(patch: Partial<SkipAction>) {
    onUpdate({ action: { ...rule.action, ...patch } });
  }

  return (
    <div className={`rounded-xl border transition-colors ${
      cycleCheck.hasCycle
        ? 'border-red-300 bg-red-50/40'
        : rule.enabled
          ? 'border-slate-200 bg-white'
          : 'border-slate-100 bg-slate-50 opacity-60'
    }`}>
      {/* Card header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-100">
        <button
          type="button"
          onClick={() => setCollapsed((v) => !v)}
          className="flex-1 text-left min-w-0"
        >
          <p className="text-xs font-semibold text-slate-700 truncate">
            {rule.description || autoSkipDescription(rule)}
          </p>
        </button>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {cycleCheck.hasCycle && (
            <span title={`Circular route: ${cycleCheck.cyclePath.join(' → ')}`}>
              <AlertTriangle size={12} className="text-red-400" />
            </span>
          )}
          {/* Enable toggle */}
          <button
            type="button"
            onClick={() => onUpdate({ enabled: !rule.enabled })}
            title={rule.enabled ? 'Disable rule' : 'Enable rule'}
            className="text-slate-400 hover:text-primary transition-colors"
          >
            {rule.enabled
              ? <ToggleRight size={16} className="text-primary" />
              : <ToggleLeft size={16} />}
          </button>
          {/* Delete */}
          <button
            type="button"
            onClick={onRemove}
            className="text-slate-300 hover:text-red-400 transition-colors"
            title="Delete rule"
          >
            <Trash2 size={12} />
          </button>
          {/* Collapse */}
          <button
            type="button"
            onClick={() => setCollapsed((v) => !v)}
            className="text-slate-300 hover:text-slate-500 transition-colors"
          >
            <ChevronDown size={12} className={`transition-transform ${collapsed ? '-rotate-90' : ''}`} />
          </button>
        </div>
      </div>

      {!collapsed && (
        <div className="p-3 flex flex-col gap-3">
          {/* Cycle warning */}
          {cycleCheck.hasCycle && (
            <div className="flex items-start gap-2 px-2.5 py-2 bg-red-50 border border-red-200 rounded-lg">
              <AlertTriangle size={12} className="text-red-500 flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-[10px] font-bold text-red-700">Circular route detected</p>
                <p className="text-[10px] text-red-600 mt-0.5">
                  This rule creates a loop: {cycleCheck.cyclePath.join(' → ')}. Change the target to fix it.
                </p>
              </div>
            </div>
          )}

          {/* IF section */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className={`${lbl} text-primary`}>IF</span>
              {rule.conditions.length > 1 && (
                <div className="flex items-center gap-1">
                  {(['AND', 'OR'] as const).map((m) => (
                    <button
                      key={m}
                      type="button"
                      onClick={() => onUpdate({ conditionMode: m })}
                      className={`px-2 py-0.5 rounded text-[10px] font-bold transition-colors ${
                        rule.conditionMode === m
                          ? 'bg-primary text-white'
                          : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                      }`}
                    >
                      {m}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="flex flex-col gap-2">
              {rule.conditions.map((cond) => (
                <SkipConditionRow
                  key={cond.id}
                  cond={cond}
                  conditionFields={conditionFields}
                  onChange={(patch) => updateCondition(cond.id, patch)}
                  onRemove={() => removeCondition(cond.id)}
                  canRemove={rule.conditions.length > 1}
                />
              ))}
            </div>

            <button
              type="button"
              onClick={addCondition}
              className="mt-2 flex items-center gap-1 text-[10px] font-semibold text-primary hover:text-orange-600 transition-colors"
            >
              <Plus size={10} /> Add condition
            </button>
          </div>

          {/* THEN section */}
          <div>
            <span className={`${lbl} block mb-2`}>THEN SKIP TO</span>
            <SkipActionRow
              action={rule.action}
              targetFields={targetFields}
              onChange={updateAction}
            />
          </div>

          {/* Description override */}
          <div>
            <label className={`${lbl} block mb-1`}>Rule label (optional)</label>
            <input
              type="text"
              value={rule.description ?? ''}
              onChange={(e) => onUpdate({ description: e.target.value })}
              placeholder={autoSkipDescription(rule)}
              className={inp}
            />
          </div>
        </div>
      )}
    </div>
  );
}

// ── Condition row ─────────────────────────────────────────────────────────────

interface SkipConditionRowProps {
  cond: SkipCondition;
  conditionFields: FormField[];
  onChange: (patch: Partial<SkipCondition>) => void;
  onRemove: () => void;
  canRemove: boolean;
}

function SkipConditionRow({ cond, conditionFields, onChange, onRemove, canRemove }: SkipConditionRowProps) {
  const triggerField = conditionFields.find((f) => f.id === cond.fieldId) ?? null;
  const validOps = triggerField
    ? validOperatorsForFieldType(triggerField.fieldType)
    : (Object.keys(SKIP_OPERATOR_LABELS) as SkipOperator[]);

  const needsValue = operatorNeedsValue(cond.operator);

  // For yes_no / single_choice: show a dropdown for the value
  const isYesNo = triggerField?.fieldType === 'yes_no';
  const isChoice = triggerField?.fieldType === 'single_choice' || triggerField?.fieldType === 'multi_select';
  const choiceOptions = isChoice
    ? (() => {
        try { return JSON.parse(triggerField?.optionsJson ?? '[]') as string[]; } catch { return []; }
      })()
    : [];

  return (
    <div className="flex flex-col gap-1.5 p-2 bg-slate-50 rounded-lg border border-slate-100">
      {/* Field selector */}
      <div className="flex items-center gap-1.5">
        <select
          value={cond.fieldId}
          onChange={(e) => {
            const f = conditionFields.find((cf) => cf.id === Number(e.target.value));
            onChange({
              fieldId: Number(e.target.value),
              fieldLabel: f?.label || `Field #${e.target.value}`,
              operator: 'equals',
              value: '',
            });
          }}
          className={`${sel} flex-1 min-w-0`}
        >
          <option value="">— select field —</option>
          {conditionFields.map((f) => (
            <option key={f.id} value={f.id}>{f.label || `Field #${f.id}`}</option>
          ))}
        </select>
        {canRemove && (
          <button
            type="button"
            onClick={onRemove}
            className="text-slate-300 hover:text-red-400 transition-colors flex-shrink-0"
          >
            <Trash2 size={11} />
          </button>
        )}
      </div>

      {/* Operator */}
      <select
        value={cond.operator}
        onChange={(e) => onChange({ operator: e.target.value as SkipOperator, value: '' })}
        className={sel}
      >
        {validOps.map((op) => (
          <option key={op} value={op}>{SKIP_OPERATOR_LABELS[op]}</option>
        ))}
      </select>

      {/* Value */}
      {needsValue && (
        isYesNo ? (
          <select
            value={cond.value ?? ''}
            onChange={(e) => onChange({ value: e.target.value })}
            className={sel}
          >
            <option value="">— select —</option>
            <option value="yes">Yes</option>
            <option value="no">No</option>
          </select>
        ) : isChoice && choiceOptions.length > 0 ? (
          <select
            value={cond.value ?? ''}
            onChange={(e) => onChange({ value: e.target.value })}
            className={sel}
          >
            <option value="">— select —</option>
            {choiceOptions.map((o) => (
              <option key={o} value={o}>{o}</option>
            ))}
          </select>
        ) : (
          <input
            type="text"
            value={cond.value ?? ''}
            onChange={(e) => onChange({ value: e.target.value })}
            placeholder="comparison value"
            className={inp}
          />
        )
      )}
    </div>
  );
}

// ── Action row ────────────────────────────────────────────────────────────────

interface SkipActionRowProps {
  action: SkipAction;
  targetFields: FormField[];
  onChange: (patch: Partial<SkipAction>) => void;
}

function SkipActionRow({ action, targetFields, onChange }: SkipActionRowProps) {
  const sectionFields = targetFields.filter((f) => f.fieldType === 'section');
  const questionFields = targetFields.filter(
    (f) => !['section', 'instruction', 'instruction_image', 'page_break'].includes(f.fieldType),
  );

  return (
    <div className="flex flex-col gap-1.5 p-2 bg-orange-50/40 rounded-lg border border-orange-100">
      {/* Target type */}
      <div className="flex gap-1.5">
        {([
          { type: 'field' as SkipTargetType, label: 'Question' },
          { type: 'section' as SkipTargetType, label: 'Section' },
          { type: 'end' as SkipTargetType, label: 'End form' },
        ]).map(({ type, label }) => (
          <button
            key={type}
            type="button"
            onClick={() => onChange({ targetType: type, targetFieldId: undefined, targetLabel: undefined })}
            className={`flex-1 py-1.5 rounded-lg text-[10px] font-bold border transition-colors ${
              action.targetType === type
                ? 'bg-primary border-primary text-white'
                : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Target field selector */}
      {action.targetType === 'field' && (
        <select
          value={action.targetFieldId ?? ''}
          onChange={(e) => {
            const f = questionFields.find((qf) => qf.id === Number(e.target.value));
            onChange({
              targetFieldId: Number(e.target.value) || undefined,
              targetLabel: f?.label || `Field #${e.target.value}`,
            });
          }}
          className={sel}
        >
          <option value="">— select question —</option>
          {questionFields.map((f) => (
            <option key={f.id} value={f.id}>{f.label || `Field #${f.id}`}</option>
          ))}
        </select>
      )}

      {action.targetType === 'section' && (
        <select
          value={action.targetFieldId ?? ''}
          onChange={(e) => {
            const f = sectionFields.find((sf) => sf.id === Number(e.target.value));
            onChange({
              targetFieldId: Number(e.target.value) || undefined,
              targetLabel: f?.label || `Section #${e.target.value}`,
            });
          }}
          className={sel}
        >
          <option value="">— select section —</option>
          {sectionFields.length === 0 ? (
            <option disabled value="">No sections in this form</option>
          ) : (
            sectionFields.map((f) => (
              <option key={f.id} value={f.id}>{f.label || `Section #${f.id}`}</option>
            ))
          )}
        </select>
      )}

      {action.targetType === 'end' && (
        <p className="text-[10px] text-slate-500 italic px-1">
          The form will end immediately — the thank-you screen will be shown.
        </p>
      )}
    </div>
  );
}
