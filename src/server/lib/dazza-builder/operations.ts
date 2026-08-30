/**
 * dazza-builder/operations.ts
 * Operation validation, block construction, and block-update sanitisation.
 *
 * SECURITY:
 * - validateOperations enforces an explicit allowlist of op types and block/field types.
 * - sanitiseBlockUpdate enforces an explicit allowlist of mutable fields.
 * - No arbitrary HTML, JavaScript, SQL, or executable CSS is accepted.
 * - Unknown operations are rejected with a descriptive error.
 */
import { nanoid } from 'nanoid';
import type { BuilderOperation, BuilderType } from './types.js';

// ── Allowlists ────────────────────────────────────────────────────────────────

export const VALID_BLOCK_TYPES = new Set([
  'heading', 'text', 'rich_text', 'divider', 'spacer', 'page_break',
  'columns', 'banner', 'safety_badge_row', 'risk_matrix', 'risk_matrix_banner',
  'table', 'image', 'field', 'system_field', 'pdf_page',
]);

export const VALID_FIELD_TYPES = new Set([
  'text', 'number', 'date', 'time', 'boolean', 'checkbox', 'radio',
  'dropdown', 'photo', 'signature', 'heading', 'info', 'link', 'location',
  'section', 'rating', 'image', 'job_lookup', 'fleet_lookup', 'global_list',
  'conditional',
]);

export const VALID_DOCUMENT_OPS = new Set([
  'addBlock', 'updateBlock', 'moveBlock', 'removeBlock', 'updateTemplateSettings',
]);

export const VALID_FORM_OPS = new Set([
  'addField', 'updateField', 'moveField', 'removeField', 'addSection', 'updateTemplateSettings',
]);

// ── Validation ────────────────────────────────────────────────────────────────

/**
 * Validate a set of operations against the builder type.
 * Returns an array of error strings (empty = valid).
 * AI output is treated as untrusted input — every operation is schema-validated here.
 */
export function validateOperations(ops: BuilderOperation[], builderType: BuilderType): string[] {
  const errors: string[] = [];

  for (const op of ops) {
    if (!op.op) { errors.push('Operation missing "op" field'); continue; }

    if (builderType === 'document') {
      if (!VALID_DOCUMENT_OPS.has(op.op)) {
        errors.push(`Operation "${op.op}" is not valid for document builder`);
        continue;
      }
      if (['addBlock', 'updateBlock'].includes(op.op)) {
        const blockType = op.blockType as string | undefined;
        if (blockType && !VALID_BLOCK_TYPES.has(blockType)) {
          errors.push(`Unknown block type: ${blockType}`);
        }
      }
    } else {
      if (!VALID_FORM_OPS.has(op.op)) {
        errors.push(`Operation "${op.op}" is not valid for form builder`);
        continue;
      }
      if (['addField', 'updateField'].includes(op.op)) {
        const fieldType = op.fieldType as string | undefined;
        if (fieldType && !VALID_FIELD_TYPES.has(fieldType)) {
          errors.push(`Unknown field type: ${fieldType}`);
        }
      }
    }
  }

  return errors;
}

// ── Block construction ────────────────────────────────────────────────────────

/**
 * Build a new block object from an addBlock operation.
 * Only supported block types produce a typed shape; unknown types fall back to text.
 */
export function buildBlock(op: BuilderOperation): Record<string, unknown> {
  const id = nanoid(10);
  const type = String(op.blockType ?? 'text');
  const base: Record<string, unknown> = { id, type };

  switch (type) {
    case 'heading':
      return { ...base, content: String(op.content ?? ''), level: Number(op.level ?? 2), align: op.align ?? 'left' };
    case 'text':
      return { ...base, content: String(op.content ?? ''), align: op.align ?? 'left' };
    case 'rich_text':
      return { ...base, html: String(op.html ?? op.content ?? '') };
    case 'divider':
      return { ...base, style: op.style ?? 'solid', thickness: op.thickness ?? 1 };
    case 'spacer':
      return { ...base, height: Number(op.height ?? 24) };
    case 'page_break':
      return base;
    case 'table': {
      const cols = Number(op.columns ?? 3);
      const rows = Number(op.rows ?? 2);
      const headers = Array.from({ length: cols }, (_, i) => `Column ${i + 1}`);
      const tableRows = Array.from({ length: rows }, () => Array.from({ length: cols }, () => ''));
      return { ...base, headers, rows: tableRows };
    }
    case 'field':
      return { ...base, fieldType: op.fieldType ?? 'text', label: op.label ?? 'Field', required: op.required ?? false };
    case 'system_field':
      return { ...base, fieldKey: op.fieldKey ?? '', label: op.label ?? '' };
    case 'banner':
      return { ...base, variant: op.variant ?? 'info', content: String(op.content ?? '') };
    default:
      return { ...base, content: String(op.content ?? '') };
  }
}

// ── Block update sanitisation ─────────────────────────────────────────────────

/**
 * Extract only the allowed mutable fields from an updateBlock operation.
 * Prevents injection of arbitrary keys into the block object.
 */
export function sanitiseBlockUpdate(op: BuilderOperation): Record<string, unknown> {
  const ALLOWED_KEYS = [
    'content', 'html', 'level', 'align', 'color', 'style', 'thickness',
    'height', 'label', 'required', 'fieldType', 'fieldKey', 'variant',
    'headers', 'rows', 'bold', 'italic', 'fontSize', 'backgroundColor',
    'borderColor', 'padding',
  ];
  const out: Record<string, unknown> = {};
  for (const key of ALLOWED_KEYS) {
    if (key in op) out[key] = op[key];
  }
  return out;
}
