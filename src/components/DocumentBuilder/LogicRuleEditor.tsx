/**
 * Studio Conditional Logic — Rule Editor
 * ─────────────────────────────────────────────────────────────────────────────
 * Renders a single LogicRule as an editable IF / THEN card.
 * Used inside LogicPanel (one card per rule).
 *
 * Design:
 *   ┌─────────────────────────────────────────────────────┐
 *   │  IF  [field ▾]  [operator ▾]  [value]               │
 *   │  AND/OR  [+ Add condition]                          │
 *   │  ─────────────────────────────────────────────────  │
 *   │  THEN  [action ▾]  [target ▾]  [value?]             │
 *   │  [+ Add action]                                     │
 *   │  [Enable toggle]  [Delete rule]                     │
 *   └─────────────────────────────────────────────────────┘
 */

import { useState } from 'react';
import { Plus, Trash2, ChevronDown, ToggleLeft, ToggleRight, AlertTriangle, GripVertical } from 'lucide-react';
import { nanoid } from 'nanoid';
import { useDocumentStore } from './useDocumentStore';
import type {
  LogicRule,
  LogicCondition,
  LogicAction,
  LogicOperator,
  LogicActionType,
  ConditionSource,
  DocumentBlock,
} from './types';

// ── Shared style tokens ───────────────────────────────────────────────────────

const inp = 'w-full bg-white border border-slate-200 rounded-md px-2 py-1.5 text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary/60 transition-colors';
const sel = `${inp} appearance-none pr-6 cursor-pointer`;
const lbl = 'text-[10px] font-bold text-slate-400 uppercase tracking-wider';

// ── Operator labels ───────────────────────────────────────────────────────────

const OPERATOR_LABELS: Record<LogicOperator, string> = {
  equals:               'equals',
  not_equals:           'does not equal',
  contains:             'contains',
  not_contains:         'does not contain',
  is_empty:             'is empty',
  is_not_empty:         'is not empty',
  greater_than:         'greater than',
  less_than:            'less than',
  greater_than_or_equal:'≥',
  less_than_or_equal:   '≤',
  before_date:          'before date',
  after_date:           'after date',
  one_of:               'is one of',
  not_one_of:           'is not one of',
  is_true:              'is Yes / true',
  is_false:             'is No / false',
};

// Operators that don't need a right-hand value input
const NO_VALUE_OPS: LogicOperator[] = ['is_empty','is_not_empty','is_true','is_false'];

// ── Action labels ─────────────────────────────────────────────────────────────

const ACTION_LABELS: Record<LogicActionType, string> = {
  show:               'Show block',
  hide:               'Hide block',
  require:            'Require field',
  unrequire:          'Make optional',
  enable:             'Enable field',
  disable:            'Disable field',
  set_value:          'Set value',
  clear_value:        'Clear value',
  show_banner:        'Show banner/warning',
  require_approval:   'Require approval',
  require_signature:  'Require signature',
  require_upload:     'Require file upload',
  prevent_submission: 'Prevent submission',
  insert_section:     'Insert section',
};

// Actions that need a target block/field
const NEEDS_TARGET: LogicActionType[] = [
  'show','hide','require','unrequire','enable','disable',
  'set_value','clear_value','require_signature','require_upload','insert_section',
];

// ── Helpers ───────────────────────────────────────────────────────────────────

function collectFieldBlocks(blocks: DocumentBlock[]): DocumentBlock[] {
  const result: DocumentBlock[] = [];
  const visit = (bs: DocumentBlock[]) => {
    bs.forEach((b) => {
      if (b.type === 'field' || b.type === 'system_field') result.push(b);
      if (b.type === 'columns') b.columns.forEach((col) => visit(col.blocks));
    });
  };
  visit(blocks);
  return result;
}

function collectAllBlocks(blocks: DocumentBlock[]): DocumentBlock[] {
  const result: DocumentBlock[] = [];
  const visit = (bs: DocumentBlock[]) => {
    bs.forEach((b) => {
      result.push(b);
      if (b.type === 'columns') b.columns.forEach((col) => visit(col.blocks));
    });
  };
  visit(blocks);
  return result;
}

function blockLabel(b: DocumentBlock): string {
  if (b.type === 'field') return b.label || `Field (${b.id.slice(0,6)})`;
  if (b.type === 'system_field') return b.label || b.fieldKey;
  if (b.type === 'heading') return b.content?.slice(0,40) || `Heading (${b.id.slice(0,6)})`;
  return `${b.type} (${b.id.slice(0,6)})`;
}

// ── Main component ────────────────────────────────────────────────────────────

interface Props {
  rule: LogicRule;
  validationErrors?: string[];
}

export default function LogicRuleEditor({ rule, validationErrors = [] }: Props) {
  const { blocks, updateLogicRule, removeLogicRule } = useDocumentStore();
  const [collapsed, setCollapsed] = useState(false);

  const fieldBlocks = collectFieldBlocks(blocks);
  const allBlocks   = collectAllBlocks(blocks);

  const upd = (patch: Partial<LogicRule>) => updateLogicRule(rule.id, patch);

  // ── Condition helpers ─────────────────────────────────────────────────────

  const addCondition = () => {
    const newCond: LogicCondition = {
      id: nanoid(8),
      source: 'field',
      fieldId: fieldBlocks[0]?.id ?? '',
      fieldLabel: fieldBlocks[0] ? blockLabel(fieldBlocks[0]) : '',
      operator: 'equals',
      value: '',
    };
    upd({ conditions: [...rule.conditions, newCond] });
  };

  const updateCondition = (condId: string, patch: Partial<LogicCondition>) => {
    upd({
      conditions: rule.conditions.map((c) => c.id === condId ? { ...c, ...patch } : c),
    });
  };

  const removeCondition = (condId: string) => {
    upd({ conditions: rule.conditions.filter((c) => c.id !== condId) });
  };

  // ── Action helpers ────────────────────────────────────────────────────────

  const addAction = () => {
    const newAction: LogicAction = {
      id: nanoid(8),
      action: 'show',
      targetBlockId: allBlocks[0]?.id ?? '',
      targetLabel: allBlocks[0] ? blockLabel(allBlocks[0]) : '',
    };
    upd({ actions: [...rule.actions, newAction] });
  };

  const updateAction = (actId: string, patch: Partial<LogicAction>) => {
    upd({
      actions: rule.actions.map((a) => a.id === actId ? { ...a, ...patch } : a),
    });
  };

  const removeAction = (actId: string) => {
    upd({ actions: rule.actions.filter((a) => a.id !== actId) });
  };

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className={`rounded-xl border transition-colors ${
      validationErrors.length > 0
        ? 'border-red-200 bg-red-50/30'
        : rule.enabled
          ? 'border-slate-200 bg-white'
          : 'border-slate-100 bg-slate-50 opacity-60'
    }`}>
      {/* Rule header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-100">
        <GripVertical size={12} className="text-slate-300 flex-shrink-0" />
        <button
          onClick={() => setCollapsed((v) => !v)}
          className="flex-1 text-left"
        >
          <p className="text-xs font-semibold text-slate-700 truncate">
            {rule.description || autoDescription(rule)}
          </p>
        </button>
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {validationErrors.length > 0 && (
            <AlertTriangle size={12} className="text-red-400" title={validationErrors.join('\n')} />
          )}
          {/* Enable toggle */}
          <button
            onClick={() => upd({ enabled: !rule.enabled })}
            title={rule.enabled ? 'Disable rule' : 'Enable rule'}
            className="text-slate-400 hover:text-primary transition-colors"
          >
            {rule.enabled
              ? <ToggleRight size={16} className="text-primary" />
              : <ToggleLeft size={16} />}
          </button>
          {/* Delete */}
          <button
            onClick={() => removeLogicRule(rule.id)}
            className="text-slate-300 hover:text-red-400 transition-colors"
            title="Delete rule"
          >
            <Trash2 size={12} />
          </button>
          {/* Collapse */}
          <button
            onClick={() => setCollapsed((v) => !v)}
            className="text-slate-300 hover:text-slate-500 transition-colors"
          >
            <ChevronDown size={12} className={`transition-transform ${collapsed ? '-rotate-90' : ''}`} />
          </button>
        </div>
      </div>

      {!collapsed && (
        <div className="p-3 flex flex-col gap-3">
          {/* Validation errors */}
          {validationErrors.length > 0 && (
            <div className="flex flex-col gap-0.5 px-2 py-1.5 bg-red-50 border border-red-200 rounded-lg">
              {validationErrors.map((e, i) => (
                <p key={i} className="text-[10px] text-red-600 flex items-start gap-1">
                  <AlertTriangle size={10} className="mt-0.5 flex-shrink-0" />
                  {e}
                </p>
              ))}
            </div>
          )}

          {/* ── IF section ─────────────────────────────────────────────────── */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-[10px] font-bold text-primary uppercase tracking-widest">IF</span>
              {rule.conditions.length > 1 && (
                <div className="flex items-center gap-1">
                  {(['AND','OR'] as const).map((m) => (
                    <button
                      key={m}
                      onClick={() => upd({ conditionMode: m })}
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
              {rule.conditions.map((cond, idx) => (
                <ConditionRow
                  key={cond.id}
                  cond={cond}
                  idx={idx}
                  fieldBlocks={fieldBlocks}
                  onChange={(patch) => updateCondition(cond.id, patch)}
                  onRemove={() => removeCondition(cond.id)}
                  canRemove={rule.conditions.length > 1}
                />
              ))}
            </div>

            <button
              onClick={addCondition}
              className="mt-2 flex items-center gap-1 text-[10px] font-semibold text-primary hover:text-orange-600 transition-colors"
            >
              <Plus size={10} /> Add condition
            </button>
          </div>

          {/* ── THEN section ───────────────────────────────────────────────── */}
          <div>
            <span className="text-[10px] font-bold text-slate-500 uppercase tracking-widest block mb-2">THEN</span>

            <div className="flex flex-col gap-2">
              {rule.actions.map((action) => (
                <ActionRow
                  key={action.id}
                  action={action}
                  allBlocks={allBlocks}
                  onChange={(patch) => updateAction(action.id, patch)}
                  onRemove={() => removeAction(action.id)}
                  canRemove={rule.actions.length > 1}
                />
              ))}
            </div>

            <button
              onClick={addAction}
              className="mt-2 flex items-center gap-1 text-[10px] font-semibold text-primary hover:text-orange-600 transition-colors"
            >
              <Plus size={10} /> Add action
            </button>
          </div>

          {/* Description override */}
          <div>
            <label className={`${lbl} block mb-1`}>Rule description (optional)</label>
            <input
              type="text"
              value={rule.description ?? ''}
              onChange={(e) => upd({ description: e.target.value })}
              placeholder={autoDescription(rule)}
              className={inp}
            />
          </div>
        </div>
      )}
    </div>
  );
}

// ── Condition row ─────────────────────────────────────────────────────────────

interface ConditionRowProps {
  cond: LogicCondition;
  idx: number;
  fieldBlocks: DocumentBlock[];
  onChange: (patch: Partial<LogicCondition>) => void;
  onRemove: () => void;
  canRemove: boolean;
}

function ConditionRow({ cond, idx, fieldBlocks, onChange, onRemove, canRemove }: ConditionRowProps) {
  const needsValue = !NO_VALUE_OPS.includes(cond.operator);
  const isOneOf = cond.operator === 'one_of' || cond.operator === 'not_one_of';

  return (
    <div className="flex flex-col gap-1.5 p-2 bg-slate-50 rounded-lg border border-slate-100">
      {/* Source + field */}
      <div className="flex items-center gap-1.5">
        <select
          value={cond.source}
          onChange={(e) => onChange({ source: e.target.value as ConditionSource, fieldId: '', fieldLabel: '' })}
          className={`${sel} w-24 flex-shrink-0`}
        >
          <option value="field">Field</option>
          <option value="system_field">System field</option>
          <option value="static">Always</option>
        </select>

        {cond.source === 'field' && (
          <select
            value={cond.fieldId}
            onChange={(e) => {
              const b = fieldBlocks.find((fb) => fb.id === e.target.value);
              onChange({ fieldId: e.target.value, fieldLabel: b ? blockLabel(b) : e.target.value });
            }}
            className={`${sel} flex-1 min-w-0`}
          >
            <option value="">— select field —</option>
            {fieldBlocks.map((b) => (
              <option key={b.id} value={b.id}>{blockLabel(b)}</option>
            ))}
          </select>
        )}

        {cond.source === 'system_field' && (
          <input
            type="text"
            value={cond.fieldId}
            onChange={(e) => onChange({ fieldId: e.target.value, fieldLabel: e.target.value })}
            placeholder="e.g. job.risk_rating"
            className={`${inp} flex-1 min-w-0 font-mono`}
          />
        )}

        {cond.source === 'static' && (
          <span className="text-xs text-slate-400 italic flex-1">Always triggers</span>
        )}

        {canRemove && (
          <button onClick={onRemove} className="text-slate-300 hover:text-red-400 transition-colors flex-shrink-0">
            <Trash2 size={11} />
          </button>
        )}
      </div>

      {/* Operator */}
      {cond.source !== 'static' && (
        <select
          value={cond.operator}
          onChange={(e) => onChange({ operator: e.target.value as LogicOperator })}
          className={sel}
        >
          {(Object.entries(OPERATOR_LABELS) as [LogicOperator, string][]).map(([op, label]) => (
            <option key={op} value={op}>{label}</option>
          ))}
        </select>
      )}

      {/* Value */}
      {cond.source !== 'static' && needsValue && (
        isOneOf ? (
          <input
            type="text"
            value={Array.isArray(cond.value) ? (cond.value as string[]).join(', ') : String(cond.value ?? '')}
            onChange={(e) => onChange({ value: e.target.value.split(',').map((v) => v.trim()) })}
            placeholder="value1, value2, value3"
            className={inp}
          />
        ) : (
          <input
            type="text"
            value={String(cond.value ?? '')}
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

interface ActionRowProps {
  action: LogicAction;
  allBlocks: DocumentBlock[];
  onChange: (patch: Partial<LogicAction>) => void;
  onRemove: () => void;
  canRemove: boolean;
}

function ActionRow({ action, allBlocks, onChange, onRemove, canRemove }: ActionRowProps) {
  const needsTarget = NEEDS_TARGET.includes(action.action);
  const needsValue  = action.action === 'set_value';
  const isBanner    = action.action === 'show_banner';
  const isPrevent   = action.action === 'prevent_submission';

  return (
    <div className="flex flex-col gap-1.5 p-2 bg-orange-50/40 rounded-lg border border-orange-100">
      <div className="flex items-center gap-1.5">
        <select
          value={action.action}
          onChange={(e) => onChange({ action: e.target.value as LogicActionType, targetBlockId: undefined, targetLabel: undefined })}
          className={`${sel} flex-1`}
        >
          {(Object.entries(ACTION_LABELS) as [LogicActionType, string][]).map(([act, label]) => (
            <option key={act} value={act}>{label}</option>
          ))}
        </select>
        {canRemove && (
          <button onClick={onRemove} className="text-slate-300 hover:text-red-400 transition-colors flex-shrink-0">
            <Trash2 size={11} />
          </button>
        )}
      </div>

      {/* Target block selector */}
      {needsTarget && (
        <select
          value={action.targetBlockId ?? ''}
          onChange={(e) => {
            const b = allBlocks.find((ab) => ab.id === e.target.value);
            onChange({ targetBlockId: e.target.value, targetLabel: b ? blockLabel(b) : e.target.value });
          }}
          className={sel}
        >
          <option value="">— select target block —</option>
          {allBlocks.map((b) => (
            <option key={b.id} value={b.id}>{blockLabel(b)}</option>
          ))}
        </select>
      )}

      {/* Set value */}
      {needsValue && (
        <input
          type="text"
          value={action.setValue ?? ''}
          onChange={(e) => onChange({ setValue: e.target.value })}
          placeholder="Value to set"
          className={inp}
        />
      )}

      {/* Banner config */}
      {isBanner && (
        <>
          <input
            type="text"
            value={action.bannerText ?? ''}
            onChange={(e) => onChange({ bannerText: e.target.value })}
            placeholder="Banner message text"
            className={inp}
          />
          <select
            value={action.bannerVariant ?? 'warning'}
            onChange={(e) => onChange({ bannerVariant: e.target.value as LogicAction['bannerVariant'] })}
            className={sel}
          >
            {['info','warning','danger','success','safety'].map((v) => (
              <option key={v} value={v}>{v.charAt(0).toUpperCase() + v.slice(1)}</option>
            ))}
          </select>
        </>
      )}

      {/* Prevent submission message */}
      {isPrevent && (
        <input
          type="text"
          value={action.preventMessage ?? ''}
          onChange={(e) => onChange({ preventMessage: e.target.value })}
          placeholder="Message shown to user"
          className={inp}
        />
      )}
    </div>
  );
}

// ── Auto-description generator ────────────────────────────────────────────────

function autoDescription(rule: LogicRule): string {
  if (rule.conditions.length === 0) return 'New rule';
  const cond = rule.conditions[0];
  const condStr = cond.source === 'static'
    ? 'Always'
    : `${cond.fieldLabel || cond.fieldId} ${OPERATOR_LABELS[cond.operator] ?? cond.operator}${
        cond.value !== undefined && !NO_VALUE_OPS.includes(cond.operator)
          ? ` "${Array.isArray(cond.value) ? (cond.value as string[]).join(', ') : cond.value}"`
          : ''
      }`;
  const extra = rule.conditions.length > 1 ? ` ${rule.conditionMode} ${rule.conditions.length - 1} more` : '';
  const actionStr = rule.actions[0]
    ? ` → ${ACTION_LABELS[rule.actions[0].action] ?? rule.actions[0].action}`
    : '';
  return `${condStr}${extra}${actionStr}`;
}
