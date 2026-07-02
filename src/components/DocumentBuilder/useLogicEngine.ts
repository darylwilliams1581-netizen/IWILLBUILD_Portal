/**
 * Studio Conditional Logic Engine
 * ─────────────────────────────────────────────────────────────────────────────
 * Evaluates all LogicRules against the current fill-mode field values and
 * produces a per-block `BlockLogicState` map plus document-level flags.
 *
 * Usage (in fill/preview mode):
 *   const { blockStates, docFlags } = useLogicEngine(fieldValues);
 *   const state = blockStates[block.id] ?? DEFAULT_BLOCK_STATE;
 *   if (!state.visible) return null;
 *
 * `fieldValues` is a Record<blockId, string | string[] | boolean | undefined>
 * maintained by the fill-mode form state.
 *
 * The engine is pure — it never writes to the store. It re-runs synchronously
 * on every render when fieldValues or logicRules change.
 */

import { useMemo } from 'react';
import { useDocumentStore } from './useDocumentStore';
import type {
  LogicRule,
  LogicCondition,
  LogicAction,
  BlockLogicState,
  DocumentLogicFlags,
  DocumentBlock,
} from './types';

// ── Public types ──────────────────────────────────────────────────────────────

export type FieldValues = Record<string, string | string[] | boolean | undefined>;

export interface LogicEngineResult {
  /** Per-block computed state. Blocks not in this map use DEFAULT_BLOCK_STATE. */
  blockStates: Record<string, BlockLogicState>;
  /** Document-level flags (approval required, submission blocked). */
  docFlags: DocumentLogicFlags;
}

export const DEFAULT_BLOCK_STATE: BlockLogicState = {
  visible: true,
  required: undefined,
  disabled: false,
  forcedValue: undefined,
  injectedBanners: [],
};

// ── Hook ──────────────────────────────────────────────────────────────────────

export function useLogicEngine(fieldValues: FieldValues): LogicEngineResult {
  const { logicRules, blocks } = useDocumentStore();

  return useMemo(
    () => evaluateRules(logicRules, fieldValues, blocks),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [logicRules, fieldValues, blocks],
  );
}

// ── Core evaluator (pure function — safe to call outside React) ───────────────

export function evaluateRules(
  rules: LogicRule[],
  fieldValues: FieldValues,
  blocks: DocumentBlock[],
): LogicEngineResult {
  // Build a flat id→block map for system-field lookups
  const blockMap = new Map<string, DocumentBlock>();
  const collectBlocks = (bs: DocumentBlock[]) => {
    bs.forEach((b) => {
      blockMap.set(b.id, b);
      if (b.type === 'columns') b.columns.forEach((col) => collectBlocks(col.blocks));
    });
  };
  collectBlocks(blocks);

  // Start with all blocks visible, no overrides
  const states: Record<string, BlockLogicState> = {};
  const getState = (id: string): BlockLogicState => {
    if (!states[id]) {
      states[id] = {
        visible: true,
        required: undefined,
        disabled: false,
        forcedValue: undefined,
        injectedBanners: [],
      };
    }
    return states[id];
  };

  const docFlags: DocumentLogicFlags = {
    requiresApproval: false,
    submissionBlocked: false,
    submissionBlockedMessage: undefined,
  };

  // Evaluate each enabled rule
  for (const rule of rules) {
    if (!rule.enabled) continue;
    if (rule.conditions.length === 0) continue;

    const condResults = rule.conditions.map((c) => evaluateCondition(c, fieldValues, blockMap));
    const triggered =
      rule.conditionMode === 'AND'
        ? condResults.every(Boolean)
        : condResults.some(Boolean);

    if (!triggered) continue;

    // Apply actions
    for (const action of rule.actions) {
      applyAction(action, states, getState, docFlags);
    }
  }

  return { blockStates: states, docFlags };
}

// ── Condition evaluator ───────────────────────────────────────────────────────

function evaluateCondition(
  cond: LogicCondition,
  fieldValues: FieldValues,
  blockMap: Map<string, DocumentBlock>,
): boolean {
  // Resolve the left-hand value
  let lhv: string | string[] | boolean | undefined;

  if (cond.source === 'field') {
    lhv = fieldValues[cond.fieldId];
  } else if (cond.source === 'system_field') {
    // System fields are resolved server-side; in the browser we treat them
    // as unknown unless the fill-mode form has injected them into fieldValues
    // under the system field key.
    lhv = fieldValues[cond.fieldId];
  } else {
    // static — always triggers (used for "always show" rules)
    return true;
  }

  const op = cond.operator;
  const rhv = cond.value;

  // Boolean shorthand operators
  if (op === 'is_true')  return lhv === true || lhv === 'true' || lhv === 'yes' || lhv === 'Yes';
  if (op === 'is_false') return lhv === false || lhv === 'false' || lhv === 'no' || lhv === 'No';

  // Emptiness operators
  if (op === 'is_empty')     return lhv === undefined || lhv === null || lhv === '' || (Array.isArray(lhv) && lhv.length === 0);
  if (op === 'is_not_empty') return !(lhv === undefined || lhv === null || lhv === '' || (Array.isArray(lhv) && lhv.length === 0));

  // Normalise to string for text comparisons
  const lhStr = Array.isArray(lhv) ? lhv.join(',') : String(lhv ?? '');
  const rhStr = Array.isArray(rhv) ? (rhv as string[]).join(',') : String(rhv ?? '');

  switch (op) {
    case 'equals':     return lhStr.toLowerCase() === rhStr.toLowerCase();
    case 'not_equals': return lhStr.toLowerCase() !== rhStr.toLowerCase();
    case 'contains':     return lhStr.toLowerCase().includes(rhStr.toLowerCase());
    case 'not_contains': return !lhStr.toLowerCase().includes(rhStr.toLowerCase());

    case 'greater_than':          return parseFloat(lhStr) > parseFloat(rhStr);
    case 'less_than':             return parseFloat(lhStr) < parseFloat(rhStr);
    case 'greater_than_or_equal': return parseFloat(lhStr) >= parseFloat(rhStr);
    case 'less_than_or_equal':    return parseFloat(lhStr) <= parseFloat(rhStr);

    case 'before_date': return new Date(lhStr) < new Date(rhStr);
    case 'after_date':  return new Date(lhStr) > new Date(rhStr);

    case 'one_of':
      return Array.isArray(rhv)
        ? (rhv as string[]).some((v) => v.toLowerCase() === lhStr.toLowerCase())
        : rhStr.split(',').some((v) => v.trim().toLowerCase() === lhStr.toLowerCase());

    case 'not_one_of':
      return Array.isArray(rhv)
        ? !(rhv as string[]).some((v) => v.toLowerCase() === lhStr.toLowerCase())
        : !rhStr.split(',').some((v) => v.trim().toLowerCase() === lhStr.toLowerCase());

    default:
      return false;
  }
}

// ── Action applier ────────────────────────────────────────────────────────────

function applyAction(
  action: LogicAction,
  states: Record<string, BlockLogicState>,
  getState: (id: string) => BlockLogicState,
  docFlags: DocumentLogicFlags,
): void {
  const tid = action.targetBlockId;

  switch (action.action) {
    case 'show':
      if (tid) getState(tid).visible = true;
      break;

    case 'hide':
      if (tid) getState(tid).visible = false;
      break;

    case 'insert_section':
      if (tid) getState(tid).visible = true;
      break;

    case 'require':
    case 'require_signature':
    case 'require_upload':
      if (tid) getState(tid).required = true;
      break;

    case 'unrequire':
      if (tid) getState(tid).required = false;
      break;

    case 'enable':
      if (tid) getState(tid).disabled = false;
      break;

    case 'disable':
      if (tid) getState(tid).disabled = true;
      break;

    case 'set_value':
      if (tid && action.setValue !== undefined) {
        getState(tid).forcedValue = action.setValue;
      }
      break;

    case 'clear_value':
      if (tid) getState(tid).forcedValue = '';
      break;

    case 'show_banner':
      if (action.bannerText) {
        // Banners are injected into the owning block's state — we use a
        // synthetic id "__banners__" to collect them at document level.
        const bs = getState('__banners__');
        bs.injectedBanners.push({
          text: action.bannerText,
          variant: action.bannerVariant ?? 'warning',
        });
      }
      break;

    case 'require_approval':
      docFlags.requiresApproval = true;
      break;

    case 'prevent_submission':
      docFlags.submissionBlocked = true;
      if (action.preventMessage) {
        docFlags.submissionBlockedMessage = action.preventMessage;
      }
      break;
  }
}
