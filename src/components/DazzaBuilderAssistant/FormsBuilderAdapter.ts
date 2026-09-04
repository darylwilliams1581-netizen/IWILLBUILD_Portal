/**
 * FormsBuilderAdapter
 * ─────────────────────────────────────────────────────────────────────────────
 * Extracts BuilderContext from the Forms Builder's state.
 * Called by forms.tsx to pass context to DazzaBuilderAssistant.
 */
import type { BuilderContext } from './types';

export interface FormField {
  id: number;
  label: string;
  fieldType: string;
  required: boolean;
  fieldOrder: number;
  optionsJson?: string | null;
  logicJson?: string | null;
}

export interface FormTemplate {
  id: number;
  name: string;
  formType: string;
  category?: string | null;
  description?: string | null;
}

/**
 * Build a size-bounded schema summary for the AI context.
 */
function buildFormSchemaSummary(template: FormTemplate | null, fields: FormField[]): string {
  if (!template) return 'No form template loaded.';

  const fieldSummary = fields.slice(0, 80).map((f, i) =>
    `  ${i + 1}. [${f.fieldType}] id=${f.id} "${f.label}"${f.required ? ' (required)' : ''}`,
  ).join('\n');

  const truncated = fields.length > 80 ? `\n  …and ${fields.length - 80} more fields` : '';

  return [
    `Form type: ${template.formType}${template.category ? `, category: ${template.category}` : ''}`,
    `Total fields: ${fields.length}`,
    '',
    'Fields:',
    fieldSummary + truncated || '  (empty)',
  ].join('\n');
}

export function buildFormsBuilderContext(
  template: FormTemplate | null,
  fields: FormField[],
  selectedFieldId: number | null,
  currentVersion: number,
  hasUnsavedChanges = false,
  validationErrors: string[] = [],
  canonicalTemplateId: number | null = null,
): BuilderContext {
  return {
    builderType: 'form',
    templateId: template?.id ?? null,
    templateName: template?.name ?? '',
    templateType: template?.formType ?? '',
    currentVersion,
    schemaSummary: buildFormSchemaSummary(template, fields),
    selectedId: selectedFieldId !== null ? String(selectedFieldId) : null,
    hasUnsavedChanges,
    validationErrors,
    isPreviewMode: false,
    canonicalTemplateId: canonicalTemplateId ?? template?.id ?? null,
  };
}
