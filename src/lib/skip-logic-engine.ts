/**
 * Skip Logic Engine
 * ─────────────────────────────────────────────────────────────────────────────
 * Pure functions — no React, no side effects.
 *
 * evaluateSkipRules():
 *   Given the current field, its skip rules, and the current answers map,
 *   returns the first matching rule's jump target (or null if none match).
 *
 * detectCycles():
 *   Given all fields and their skip rules, detects circular routes
 *   (A → B → A) using DFS. Returns the cycle path if found.
 *
 * buildSkipGraph():
 *   Builds a directed adjacency map for cycle detection and preview.
 */

import type { FormField } from '@/components/FormFieldBuilder';
import {
  type SkipRule,
  type SkipCondition,
  type SkipEngineResult,
  type CycleCheckResult,
  SKIP_NO_VALUE_OPS,
  parseSkipRules,
} from './skip-logic-types';

// ── Answer value type (mirrors FormRunner) ────────────────────────────────────

type AnswerValue = string | string[] | boolean | null | undefined | Record<string, unknown>;

// ── Condition evaluator ───────────────────────────────────────────────────────

function evaluateSkipCondition(
  cond: SkipCondition,
  answers: Record<number, AnswerValue>,
): boolean {
  const raw = answers[cond.fieldId];
  const op = cond.operator;

  // Boolean shorthand
  if (op === 'is_true')  return raw === true || raw === 'true' || raw === 'yes' || raw === 'Yes';
  if (op === 'is_false') return raw === false || raw === 'false' || raw === 'no' || raw === 'No';

  // Emptiness
  const isEmpty = raw === undefined || raw === null || raw === '' || (Array.isArray(raw) && raw.length === 0);
  if (op === 'is_empty')     return isEmpty;
  if (op === 'is_not_empty') return !isEmpty;

  // Normalise to string
  const lhs = Array.isArray(raw) ? raw.join(',') : String(raw ?? '');
  const rhs = cond.value ?? '';

  switch (op) {
    case 'equals':               return lhs.toLowerCase() === rhs.toLowerCase();
    case 'not_equals':           return lhs.toLowerCase() !== rhs.toLowerCase();
    case 'contains':             return lhs.toLowerCase().includes(rhs.toLowerCase());
    case 'not_contains':         return !lhs.toLowerCase().includes(rhs.toLowerCase());
    case 'greater_than':         return parseFloat(lhs) > parseFloat(rhs);
    case 'less_than':            return parseFloat(lhs) < parseFloat(rhs);
    case 'greater_than_or_equal':return parseFloat(lhs) >= parseFloat(rhs);
    case 'less_than_or_equal':   return parseFloat(lhs) <= parseFloat(rhs);
    case 'before_date':          return new Date(lhs) < new Date(rhs);
    case 'after_date':           return new Date(lhs) > new Date(rhs);
    default:                     return false;
  }
}

// ── Rule evaluator ────────────────────────────────────────────────────────────

/**
 * Evaluate all skip rules for a single field.
 * Returns the first matching rule's result, or a null result if none match.
 *
 * @param fieldId   The field whose rules are being evaluated
 * @param rules     The skip rules attached to this field
 * @param answers   Current answers map (fieldId → value)
 */
export function evaluateSkipRules(
  fieldId: number,
  rules: SkipRule[],
  answers: Record<number, AnswerValue>,
): SkipEngineResult {
  const NULL_RESULT: SkipEngineResult = {
    jumpTo: null,
    firedRule: null,
    sourceFieldId: null,
    triggerValue: '',
  };

  for (const rule of rules) {
    if (!rule.enabled) continue;
    if (rule.conditions.length === 0) continue;

    const condResults = rule.conditions.map((c) => evaluateSkipCondition(c, answers));
    const triggered =
      rule.conditionMode === 'AND'
        ? condResults.every(Boolean)
        : condResults.some(Boolean);

    if (!triggered) continue;

    // Determine jump target
    const { targetType, targetFieldId } = rule.action;
    const jumpTo: number | 'end' | null =
      targetType === 'end'
        ? 'end'
        : typeof targetFieldId === 'number'
          ? targetFieldId
          : null;

    if (jumpTo === null) continue; // misconfigured rule — skip

    // Build trigger value string for audit log
    const firstCond = rule.conditions[0];
    const rawVal = answers[firstCond?.fieldId ?? fieldId];
    const triggerValue = Array.isArray(rawVal)
      ? rawVal.join(', ')
      : String(rawVal ?? '');

    return {
      jumpTo,
      firedRule: rule,
      sourceFieldId: fieldId,
      triggerValue,
    };
  }

  return NULL_RESULT;
}

// ── Skip graph builder ────────────────────────────────────────────────────────

/**
 * Build a directed adjacency map: fieldId → Set<fieldId | 'end'>
 * Used for cycle detection and preview rendering.
 */
export function buildSkipGraph(
  fields: FormField[],
): Map<number, Set<number | 'end'>> {
  const graph = new Map<number, Set<number | 'end'>>();

  for (const field of fields) {
    const rules = parseSkipRules(field.logicJson);
    for (const rule of rules) {
      if (!rule.enabled) continue;
      const { targetType, targetFieldId } = rule.action;
      const target: number | 'end' =
        targetType === 'end' ? 'end' : (targetFieldId ?? 'end');

      if (!graph.has(field.id)) graph.set(field.id, new Set());
      graph.get(field.id)!.add(target);
    }
  }

  return graph;
}

// ── Cycle detector ────────────────────────────────────────────────────────────

/**
 * Detect cycles in the skip graph using iterative DFS.
 * Returns the first cycle found, or { hasCycle: false, cyclePath: [] }.
 *
 * Only numeric field ids are checked — 'end' is a terminal node.
 */
export function detectCycles(
  graph: Map<number, Set<number | 'end'>>,
): CycleCheckResult {
  const visited = new Set<number>();
  const stack = new Set<number>();

  function dfs(node: number, path: number[]): number[] | null {
    if (stack.has(node)) return [...path, node]; // cycle found
    if (visited.has(node)) return null;

    visited.add(node);
    stack.add(node);

    const neighbours = graph.get(node) ?? new Set();
    for (const neighbour of neighbours) {
      if (neighbour === 'end') continue;
      const cycle = dfs(neighbour, [...path, node]);
      if (cycle) return cycle;
    }

    stack.delete(node);
    return null;
  }

  for (const node of graph.keys()) {
    if (!visited.has(node)) {
      const cycle = dfs(node, []);
      if (cycle) {
        return { hasCycle: true, cyclePath: cycle };
      }
    }
  }

  return { hasCycle: false, cyclePath: [] };
}

/**
 * Check if adding a new skip rule from `sourceFieldId` to `targetFieldId`
 * would create a cycle. Used in the builder to block invalid saves.
 */
export function wouldCreateCycle(
  fields: FormField[],
  sourceFieldId: number,
  targetFieldId: number | 'end',
): CycleCheckResult {
  if (targetFieldId === 'end') return { hasCycle: false, cyclePath: [] };

  const graph = buildSkipGraph(fields);

  // Temporarily add the proposed edge
  if (!graph.has(sourceFieldId)) graph.set(sourceFieldId, new Set());
  graph.get(sourceFieldId)!.add(targetFieldId);

  return detectCycles(graph);
}

// ── Back-stack helpers ────────────────────────────────────────────────────────

/**
 * Given the ordered list of fields and a back-stack of visited field ids,
 * return the previous field id to navigate to when the user presses Back.
 *
 * The back-stack records only fields the user actually saw (not skipped ones).
 * Pressing Back pops the stack and returns to the previous visible field.
 */
export function popBackStack(backStack: number[]): {
  previousFieldId: number | null;
  newStack: number[];
} {
  if (backStack.length <= 1) {
    return { previousFieldId: null, newStack: backStack };
  }
  const newStack = backStack.slice(0, -1);
  return { previousFieldId: newStack[newStack.length - 1] ?? null, newStack };
}

// ── Operator validation ───────────────────────────────────────────────────────

/**
 * Returns the operators valid for a given field type.
 * Numeric/date operators are only valid for number/date/datetime fields.
 */
export function validOperatorsForFieldType(fieldType: string): SkipOperator[] {
  const numericOps: SkipOperator[] = [
    'greater_than', 'less_than', 'greater_than_or_equal', 'less_than_or_equal',
  ];
  const dateOps: SkipOperator[] = ['before_date', 'after_date'];
  const boolOps: SkipOperator[] = ['is_true', 'is_false'];
  const textOps: SkipOperator[] = [
    'equals', 'not_equals', 'contains', 'not_contains', 'is_empty', 'is_not_empty',
  ];

  switch (fieldType) {
    case 'number':
    case 'linear_scale':
    case 'rating':
      return [...textOps, ...numericOps];
    case 'date':
    case 'datetime':
      return [...textOps, ...dateOps];
    case 'yes_no':
    case 'checkbox':
      return ['equals', 'not_equals', 'is_empty', 'is_not_empty', ...boolOps];
    default:
      return textOps;
  }
}

/** True if the operator needs a right-hand value input */
export function operatorNeedsValue(op: SkipOperator): boolean {
  return !SKIP_NO_VALUE_OPS.includes(op);
}
