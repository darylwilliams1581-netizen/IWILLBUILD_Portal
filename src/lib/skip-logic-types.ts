/**
 * Skip Logic — Type Definitions
 * ─────────────────────────────────────────────────────────────────────────────
 * Skip rules live in `FormField.logicJson` alongside the existing show/hide
 * FieldLogic, serialised as `skipRules: SkipRule[]`.
 *
 * A skip rule says:
 *   IF <conditions> THEN jump to <target>
 *
 * Targets:
 *   - field:<id>   → jump to a specific field (by numeric id)
 *   - section:<id> → jump to the first field inside a section (by section field id)
 *   - end          → jump to the form end / thank-you screen
 *
 * Evaluation order: rules are evaluated in array order; first match wins.
 * Existing show/hide logic is evaluated independently and is not affected.
 */

// ── Operators (subset of DocumentBuilder LogicOperator, adapted for FormField) ─

export type SkipOperator =
  | 'equals'
  | 'not_equals'
  | 'contains'
  | 'not_contains'
  | 'is_empty'
  | 'is_not_empty'
  | 'greater_than'
  | 'less_than'
  | 'greater_than_or_equal'
  | 'less_than_or_equal'
  | 'before_date'
  | 'after_date'
  | 'is_true'
  | 'is_false';

export const SKIP_OPERATOR_LABELS: Record<SkipOperator, string> = {
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
  is_true:              'is Yes / true',
  is_false:             'is No / false',
};

/** Operators that don't need a right-hand value */
export const SKIP_NO_VALUE_OPS: SkipOperator[] = [
  'is_empty', 'is_not_empty', 'is_true', 'is_false',
];

// ── Condition ─────────────────────────────────────────────────────────────────

export interface SkipCondition {
  /** Unique id within the rule */
  id: string;
  /** The field whose answer is tested (numeric FormField.id) */
  fieldId: number;
  /** Human-readable label (auto-populated, for display only) */
  fieldLabel: string;
  operator: SkipOperator;
  /** Right-hand comparison value (undefined for no-value operators) */
  value?: string;
}

// ── Action ────────────────────────────────────────────────────────────────────

export type SkipTargetType = 'field' | 'section' | 'end';

export interface SkipAction {
  targetType: SkipTargetType;
  /** For targetType=field|section: the numeric FormField.id of the target */
  targetFieldId?: number;
  /** Human-readable label of the target (auto-populated) */
  targetLabel?: string;
}

// ── Rule ──────────────────────────────────────────────────────────────────────

export interface SkipRule {
  /** Unique id within the field's rule list */
  id: string;
  /** Human-readable description (auto-generated or user-edited) */
  description?: string;
  /** How multiple conditions are combined */
  conditionMode: 'AND' | 'OR';
  conditions: SkipCondition[];
  action: SkipAction;
  /** Disabled rules are stored but never evaluated */
  enabled: boolean;
}

// ── Audit entry (stored in form_skip_audit_log) ───────────────────────────────

export interface SkipAuditEntry {
  submissionId: number;
  templateId: number;
  jobId: number | null;
  userId: number | null;
  ruleId: string;
  /** The field that owned the rule */
  sourceFieldId: number;
  sourceFieldLabel: string;
  /** The value that triggered the rule */
  triggerValue: string;
  /** Where the form jumped to */
  targetType: SkipTargetType;
  targetFieldId: number | null;
  targetFieldLabel: string | null;
  /** ISO timestamp */
  triggeredAt: string;
}

// ── Runtime result ────────────────────────────────────────────────────────────

export interface SkipEngineResult {
  /**
   * The field id to jump to, or 'end' to end the form.
   * null = no skip rule fired.
   */
  jumpTo: number | 'end' | null;
  /** The rule that fired (for audit logging) */
  firedRule: SkipRule | null;
  /** The field that owned the fired rule */
  sourceFieldId: number | null;
  /** The raw trigger value */
  triggerValue: string;
}

// ── Cycle detection result ────────────────────────────────────────────────────

export interface CycleCheckResult {
  hasCycle: boolean;
  /** The cycle path as field ids, e.g. [3, 7, 3] */
  cyclePath: number[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Parse skipRules from a field's logicJson (safe, never throws) */
export function parseSkipRules(logicJson: string | null): SkipRule[] {
  if (!logicJson) return [];
  try {
    const parsed = JSON.parse(logicJson) as Record<string, unknown>;
    if (!Array.isArray(parsed.skipRules)) return [];
    return parsed.skipRules as SkipRule[];
  } catch {
    return [];
  }
}

/** Serialise updated skipRules back into an existing logicJson blob */
export function serializeSkipRules(
  existingLogicJson: string | null,
  skipRules: SkipRule[],
): string {
  let base: Record<string, unknown> = {};
  if (existingLogicJson) {
    try { base = JSON.parse(existingLogicJson) as Record<string, unknown>; } catch { /* ignore */ }
  }
  return JSON.stringify({ ...base, skipRules });
}

/** Auto-generate a human-readable description for a skip rule */
export function autoSkipDescription(rule: SkipRule): string {
  if (rule.conditions.length === 0) return 'New skip rule';
  const cond = rule.conditions[0];
  const condStr = `${cond.fieldLabel || `Field #${cond.fieldId}`} ${SKIP_OPERATOR_LABELS[cond.operator] ?? cond.operator}${
    cond.value !== undefined && !SKIP_NO_VALUE_OPS.includes(cond.operator)
      ? ` "${cond.value}"`
      : ''
  }`;
  const extra = rule.conditions.length > 1 ? ` ${rule.conditionMode} ${rule.conditions.length - 1} more` : '';
  const targetStr = rule.action.targetType === 'end'
    ? '→ End form'
    : rule.action.targetLabel
      ? `→ ${rule.action.targetLabel}`
      : `→ ${rule.action.targetType}`;
  return `If ${condStr}${extra} ${targetStr}`;
}
