/**
 * dazza-builder/context.ts
 * System prompt builder and tool definitions for the Dazza Builder Assistant.
 *
 * SECURITY:
 * - The system prompt explicitly forbids reading secrets, tokens, or passwords.
 * - The tool list is a closed allowlist — no dynamic tool registration.
 * - Template IDs and owner IDs are resolved server-side; the AI only sees
 *   the context it needs to answer the current request.
 */
import type { BuilderContext } from './types.js';

// ── Tool definitions (closed allowlist) ───────────────────────────────────────

export const BUILDER_TOOL_DEFINITIONS = [
  {
    type: 'function' as const,
    name: 'builder_get_template',
    description: 'Load the full current template (document or form) by ID. Returns blocks/fields, settings, and current version.',
    parameters: {
      type: 'object',
      properties: {
        templateId: { type: 'number', description: 'Template ID to load' },
        builderType: { type: 'string', enum: ['document', 'form'], description: 'Builder type' },
      },
      required: ['templateId', 'builderType'],
    },
  },
  {
    type: 'function' as const,
    name: 'builder_list_templates',
    description: 'List available templates of the given type.',
    parameters: {
      type: 'object',
      properties: {
        builderType: { type: 'string', enum: ['document', 'form'] },
        limit: { type: 'number', description: 'Max results (default 20, max 50)' },
      },
      required: ['builderType'],
    },
  },
  {
    type: 'function' as const,
    name: 'builder_get_versions',
    description: 'List version history for a template.',
    parameters: {
      type: 'object',
      properties: {
        templateId: { type: 'number' },
        builderType: { type: 'string', enum: ['document', 'form'] },
        limit: { type: 'number', description: 'Max versions to return (default 10)' },
      },
      required: ['templateId', 'builderType'],
    },
  },
  {
    type: 'function' as const,
    name: 'builder_propose_changes',
    description: 'Propose a set of structured builder operations to the owner. The owner can then Apply or Undo. Always call this before applying changes — never apply without proposing first.',
    parameters: {
      type: 'object',
      properties: {
        summary: { type: 'string', description: 'Concise plain-English summary of what will change' },
        affectedSections: { type: 'array', items: { type: 'string' }, description: 'Pages or sections affected' },
        affectedItems: { type: 'array', items: { type: 'string' }, description: 'Block or field labels/IDs affected' },
        validationImpact: { type: 'string', description: 'Any validation concerns' },
        operations: {
          type: 'array',
          description: 'Structured operations to perform. When creating a new template from the list page (no template open), the FIRST operation MUST be createNewTemplate with name and templateType. All subsequent addBlock/addField operations in the same batch will be applied to the newly created template.',
          items: {
            type: 'object',
            properties: {
              op: {
                type: 'string',
                enum: [
                  'createNewTemplate',
                  'addBlock', 'updateBlock', 'moveBlock', 'removeBlock',
                  'addField', 'updateField', 'moveField', 'removeField',
                  'addSection', 'updateTemplateSettings',
                ],
              },
            },
            required: ['op'],
          },
        },
      },
      required: ['summary', 'affectedSections', 'affectedItems', 'validationImpact', 'operations'],
    },
  },
  {
    type: 'function' as const,
    name: 'builder_validate_operations',
    description: 'Validate a set of proposed operations against the current template schema without applying them.',
    parameters: {
      type: 'object',
      properties: {
        templateId: { type: 'number' },
        builderType: { type: 'string', enum: ['document', 'form'] },
        operations: { type: 'array', items: { type: 'object' } },
      },
      required: ['templateId', 'builderType', 'operations'],
    },
  },
];

// ── Tool labels (safe for SSE — never include args or results) ────────────────

export const TOOL_LABELS: Record<string, string> = {
  builder_get_template:        'Loading template…',
  builder_list_templates:      'Searching templates…',
  builder_get_versions:        'Loading version history…',
  builder_propose_changes:     'Preparing proposed changes…',
  builder_validate_operations: 'Validating operations…',
};

// ── System prompt ─────────────────────────────────────────────────────────────

export function buildSystemPrompt(ctx: BuilderContext): string {
  const builderLabel = ctx.builderType === 'document' ? 'Studio Document Builder' : 'Forms Builder';
  const templateInfo = ctx.templateId
    ? `Template: "${ctx.templateName}" (ID: ${ctx.templateId}, type: ${ctx.templateType}, version: ${ctx.currentVersion})`
    : 'No template currently open';

  return `You are the Dazza Builder Assistant — an expert AI assistant integrated into the IWILLBUILD ${builderLabel}.

You help the platform owner (Daryl) create, edit and improve ${ctx.builderType === 'document' ? 'document templates' : 'form templates'} using natural language.

## Current Context
${templateInfo}
${ctx.selectedId ? `Selected item: ${ctx.selectedId}` : 'No item selected'}
${ctx.hasUnsavedChanges ? '⚠️ There are unsaved changes in the builder.' : ''}
${ctx.validationErrors.length > 0 ? `Validation errors: ${ctx.validationErrors.join('; ')}` : ''}
${ctx.isPreviewMode ? 'Builder is in preview mode.' : ''}

## Schema Summary
${ctx.schemaSummary || 'No schema loaded.'}

## Your Capabilities
${ctx.builderType === 'document' ? `
You can help with Studio Document Builder operations:
- createNewTemplate: Create a brand-new document template (MUST be first op when no template is open). Required fields: name (string), templateType (string, e.g. "swms", "policy", "procedure", "emp", "generic"), docStatus ("draft"), docKind ("doc").
- addBlock: Add a new block (heading, text, rich_text, divider, spacer, page_break, columns, banner, safety_badge_row, risk_matrix, risk_matrix_banner, table, image, field, system_field)
- updateBlock: Edit an existing block's content or settings
- moveBlock: Reorder blocks
- removeBlock: Remove a block
- updateTemplateSettings: Change template name, type, PDF settings, acknowledgement settings
` : `
You can help with Forms Builder operations:
- createNewTemplate: Create a brand-new form template (MUST be first op when no template is open). Required fields: name (string), formType (string, e.g. "Job", "Safety", "Inspection", "General"), category (string).
- addField: Add a new field (text, number, date, time, boolean, checkbox, radio, dropdown, photo, signature, heading, info, link, location, section, rating, image, job_lookup, fleet_lookup, global_list, conditional)
- updateField: Edit an existing field's label, type, required, options, validation, conditional logic
- moveField: Reorder fields
- removeField: Remove a field
- addSection: Add a section heading
- updateTemplateSettings: Change form name, type, category, description
`}

## Rules
1. ALWAYS call builder_propose_changes before applying any changes. Never apply without proposing.
2. When NO template is open (templateId is null), you MUST include createNewTemplate as the FIRST operation in your proposal. Do NOT attempt to use addBlock/addField without a template.
3. Preserve existing merge-field identifiers and bindings.
4. Only use supported block/field types listed above.
5. Never invent unsupported types or bypass validation.
6. Never alter form submissions, job records, or user data.
7. Never read or expose secrets, tokens, or passwords.
8. Small safe edits may be grouped into one proposal.
9. When unsure, ask a clarifying question rather than guessing.
10. Be concise and practical — this is a professional construction management platform.

## Workflow
1. Understand the request
2. If a template is open, call builder_get_template to inspect the current state
3. If NO template is open and the user wants to create one, plan createNewTemplate + all content operations as a single batch
4. Call builder_validate_operations to check for errors (skip if templateId is null — validation runs server-side on apply)
5. Call builder_propose_changes with the full operation list (createNewTemplate first if creating new)
6. Explain what will change and why
7. Wait for the owner to Apply or Undo

The owner does not need to approve every action — your protection comes from versioning and undo.`;
}
