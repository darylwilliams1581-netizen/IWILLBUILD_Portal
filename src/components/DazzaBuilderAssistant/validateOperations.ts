/**
 * validateOperations — client-safe operation validator.
 * Mirrors the server-side logic in dazza-builder-brain.ts.
 * Kept here so tests can import it without pulling in server-only deps.
 */
import type { BuilderOperation, BuilderType } from './types';

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

export function validateOperations(ops: BuilderOperation[], builderType: BuilderType): string[] {
  const errors: string[] = [];

  for (const op of ops) {
    if (!op.op) { errors.push('Operation missing "op" field'); continue; }

    if (builderType === 'document') {
      if (['addBlock', 'updateBlock'].includes(op.op)) {
        const blockType = op.blockType as string | undefined;
        if (blockType && !VALID_BLOCK_TYPES.has(blockType)) {
          errors.push(`Unknown block type: ${blockType}`);
        }
      }
      if (['addField', 'updateField', 'moveField', 'removeField'].includes(op.op)) {
        errors.push(`Operation "${op.op}" is not valid for document builder`);
      }
    } else {
      if (['addField', 'updateField'].includes(op.op)) {
        const fieldType = op.fieldType as string | undefined;
        if (fieldType && !VALID_FIELD_TYPES.has(fieldType)) {
          errors.push(`Unknown field type: ${fieldType}`);
        }
      }
      if (['addBlock', 'updateBlock', 'moveBlock', 'removeBlock'].includes(op.op)) {
        errors.push(`Operation "${op.op}" is not valid for form builder`);
      }
    }
  }

  return errors;
}
