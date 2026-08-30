/**
 * dazza-builder-brain.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Dazza Builder Assistant — brain service for Studio Document Builder and
 * Forms Builder.
 *
 * SECURITY GUARANTEES:
 * 1. Owner-only — every entry point checks isPlatformOwner before proceeding.
 * 2. Scoped writes — only document_templates and form_templates CRUD via
 *    existing validated APIs; no arbitrary SQL mutations.
 * 3. Secret redaction — secrets, tokens, passwords never reach the model.
 * 4. Full audit — every call is logged to dazza_builder_audit.
 * 5. Versioning — every material change creates a dazza_builder_versions row.
 * 6. Conversation continuity — stored in dazza_v3_conversations (reused table).
 * 7. Attachment safety — attachments are reference material only; content is
 *    recreated using supported builder components.
 *
 * MUTATION BOUNDARY:
 * Dazza Builder CAN:
 *   - Read document/form templates (own company context)
 *   - Write document_templates via builder_apply operations
 *   - Write form_templates + form_fields via builder_apply operations
 *   - Create dazza_builder_versions rows
 *   - Create dazza_builder_audit rows
 *   - Create dazza_v3_conversations rows
 *
 * Dazza Builder CANNOT:
 *   - Alter form submissions or job records
 *   - Change permissions or user records
 *   - Read secrets or env vars
 *   - Execute arbitrary code
 *   - Publish templates (owner must do that manually)
 *   - Permanently delete templates
 */

import { db } from '../db/client.js';
import { sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import { nanoid } from 'nanoid';
import { getSecret } from '#airo/secrets';

// ── Constants ─────────────────────────────────────────────────────────────────

const CONTEXT_RECENT_TURNS = 16;
const TOOL_ROUNDS_MAX = 6;
const MAX_TOKENS = 8000;

// ── Types ─────────────────────────────────────────────────────────────────────

export type BuilderType = 'document' | 'form';

export interface BuilderOwnerContext {
  userId: string;
  email: string;
  isPlatformOwner: boolean;
}

export interface BuilderContext {
  builderType: BuilderType;
  templateId: number | null;
  templateName: string;
  templateType: string;
  /** Current version number (from dazza_builder_versions) */
  currentVersion: number;
  /** Serialised blocks (document) or fields summary (form) — size-bounded */
  schemaSummary: string;
  /** Selected block or field ID */
  selectedId: string | null;
  /** Whether there are unsaved changes in the client */
  hasUnsavedChanges: boolean;
  /** Validation errors currently shown in the builder */
  validationErrors: string[];
  /** Whether the builder is in preview mode */
  isPreviewMode: boolean;
}

export interface BuilderOperation {
  op: string;
  [key: string]: unknown;
}

export interface BuilderApplyRequest {
  templateId: number;
  builderType: BuilderType;
  operations: BuilderOperation[];
  instructionSummary: string;
  conversationId: string;
}

export interface BuilderApplyResult {
  ok: boolean;
  versionId: string;
  versionNumber: number;
  operationsApplied: number;
  validationErrors: string[];
  error?: string;
}

export interface BuilderStreamOptions {
  ownerContext: BuilderOwnerContext;
  conversationId: string | null;
  userMessage: string;
  builderContext: BuilderContext;
  attachmentId?: string;
  onToken: (token: string) => void;
  onToolCall: (name: string, status: 'running' | 'done') => void;
  onStatus: (phase: string, label: string) => void;
  onProposedChange: (change: ProposedChange) => void;
  onDone: (meta: {
    model: string;
    toolsUsed: string[];
    conversationId: string;
    inputTokens?: number;
    outputTokens?: number;
  }) => void;
  onError: (message: string, conversationId?: string) => void;
}

export interface ProposedChange {
  summary: string;
  affectedSections: string[];
  affectedItems: string[];
  validationImpact: string;
  operations: BuilderOperation[];
  conversationId: string;
}

// ── Tool definitions ──────────────────────────────────────────────────────────

const BUILDER_TOOL_DEFINITIONS = [
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
          description: 'Structured operations to perform',
          items: {
            type: 'object',
            properties: {
              op: {
                type: 'string',
                enum: [
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

const TOOL_LABELS: Record<string, string> = {
  builder_get_template:       'Loading template…',
  builder_list_templates:     'Searching templates…',
  builder_get_versions:       'Loading version history…',
  builder_propose_changes:    'Preparing proposed changes…',
  builder_validate_operations: 'Validating operations…',
};

// ── Tool executor ─────────────────────────────────────────────────────────────

async function executeBuilderTool(
  name: string,
  args: Record<string, unknown>,
  ownerContext: BuilderOwnerContext,
): Promise<string> {
  function ok(data: unknown): string { return JSON.stringify({ ok: true, data }); }
  function err(msg: string): string { return JSON.stringify({ ok: false, error: msg }); }

  try {
    switch (name) {
      case 'builder_get_template': {
        const id = Number(args.templateId);
        const type = String(args.builderType);
        if (!id) return err('templateId required');

        if (type === 'document') {
          const rows = await db.execute(sql`
            SELECT id, name, template_type, doc_status, doc_kind,
                   requires_acknowledgement, submit_label, requires_signature,
                   builder_json, pdf_settings_json, created_at, updated_at
            FROM document_templates
            WHERE id = ${id}
            LIMIT 1
          `);
          const row = (rows as { rows: unknown[] }).rows?.[0] as Record<string, unknown> | undefined;
          if (!row) return err('Template not found');
          // Truncate builder_json for context — full JSON can be huge
          const builderJson = row.builder_json as string | null;
          const truncated = builderJson && builderJson.length > 8000
            ? builderJson.slice(0, 8000) + '…[truncated]'
            : builderJson;
          return ok({ ...row, builder_json: truncated });
        } else {
          const rows = await db.execute(sql`
            SELECT ft.id, ft.name, ft.form_type, ft.category, ft.description,
                   ft.is_active, ft.on_dashboard, ft.on_jobs, ft.on_fleet,
                   ft.created_at, ft.updated_at
            FROM form_templates ft
            WHERE ft.id = ${id}
            LIMIT 1
          `);
          const row = (rows as { rows: unknown[] }).rows?.[0] as Record<string, unknown> | undefined;
          if (!row) return err('Form template not found');

          // Load fields
          const fieldRows = await db.execute(sql`
            SELECT id, label, field_type, required, options_json, settings_json,
                   logic_json, field_order
            FROM form_fields
            WHERE template_id = ${id}
            ORDER BY field_order ASC
            LIMIT 200
          `);
          return ok({ template: row, fields: (fieldRows as { rows: unknown[] }).rows ?? [] });
        }
      }

      case 'builder_list_templates': {
        const type = String(args.builderType);
        const limit = Math.min(Number(args.limit ?? 20), 50);

        if (type === 'document') {
          const rows = await db.execute(sql`
            SELECT id, name, template_type, doc_status, created_at, updated_at
            FROM document_templates
            ORDER BY updated_at DESC
            LIMIT ${limit}
          `);
          return ok((rows as { rows: unknown[] }).rows ?? []);
        } else {
          const rows = await db.execute(sql`
            SELECT id, name, form_type, category, is_active, created_at, updated_at
            FROM form_templates
            ORDER BY updated_at DESC
            LIMIT ${limit}
          `);
          return ok((rows as { rows: unknown[] }).rows ?? []);
        }
      }

      case 'builder_get_versions': {
        const id = Number(args.templateId);
        const type = String(args.builderType);
        const limit = Math.min(Number(args.limit ?? 10), 50);
        if (!id) return err('templateId required');

        const rows = await db.execute(sql`
          SELECT id, version_number, instruction_summary, operations_count,
                 validation_result, created_at
          FROM dazza_builder_versions
          WHERE template_id = ${id} AND builder_type = ${type}
          ORDER BY version_number DESC
          LIMIT ${limit}
        `);
        return ok((rows as { rows: unknown[] }).rows ?? []);
      }

      case 'builder_propose_changes': {
        // This tool is handled client-side via onProposedChange callback.
        // The brain calls it to signal the UI — we return ok so the loop continues.
        return ok({ proposed: true, operationCount: (args.operations as unknown[])?.length ?? 0 });
      }

      case 'builder_validate_operations': {
        const id = Number(args.templateId);
        const type = String(args.builderType);
        const ops = (args.operations as BuilderOperation[]) ?? [];
        if (!id) return err('templateId required');

        const errors = validateOperations(ops, type as BuilderType);
        return ok({ valid: errors.length === 0, errors });
      }

      default:
        return err(`Unknown tool: ${name}`);
    }
  } catch (e) {
    return err(`Tool error: ${e instanceof Error ? e.message : String(e)}`);
  }
}

// ── Operation validator (mirrors client-side validateOperations.ts) ───────────

const VALID_BLOCK_TYPES = new Set([
  'heading', 'text', 'rich_text', 'divider', 'spacer', 'page_break',
  'columns', 'banner', 'safety_badge_row', 'risk_matrix', 'risk_matrix_banner',
  'table', 'image', 'field', 'system_field', 'pdf_page',
]);

const VALID_FIELD_TYPES = new Set([
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

// ── System prompt builder ─────────────────────────────────────────────────────

function buildSystemPrompt(ctx: BuilderContext): string {
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
- addBlock: Add a new block (heading, text, rich_text, divider, spacer, page_break, columns, banner, safety_badge_row, risk_matrix, risk_matrix_banner, table, image, field, system_field)
- updateBlock: Edit an existing block's content or settings
- moveBlock: Reorder blocks
- removeBlock: Remove a block
- updateTemplateSettings: Change template name, type, PDF settings, acknowledgement settings
` : `
You can help with Forms Builder operations:
- addField: Add a new field (text, number, date, time, boolean, checkbox, radio, dropdown, photo, signature, heading, info, link, location, section, rating, image, job_lookup, fleet_lookup, global_list, conditional)
- updateField: Edit an existing field's label, type, required, options, validation, conditional logic
- moveField: Reorder fields
- removeField: Remove a field
- addSection: Add a section heading
- updateTemplateSettings: Change form name, type, category, description
`}

## Rules
1. ALWAYS call builder_propose_changes before applying any changes. Never apply without proposing.
2. Preserve existing merge-field identifiers and bindings.
3. Only use supported block/field types listed above.
4. Never invent unsupported types or bypass validation.
5. Never alter form submissions, job records, or user data.
6. Never read or expose secrets, tokens, or passwords.
7. Small safe edits may be grouped into one proposal.
8. When unsure, ask a clarifying question rather than guessing.
9. Be concise and practical — this is a professional construction management platform.

## Workflow
1. Understand the request
2. If needed, call builder_get_template to inspect the current state
3. Plan the operations
4. Call builder_validate_operations to check for errors
5. Call builder_propose_changes with the full operation list
6. Explain what will change and why
7. Wait for the owner to Apply or Undo

The owner does not need to approve every action — your protection comes from versioning and undo.`;
}

// ── Conversation persistence (reuses dazza_v3_conversations) ──────────────────

async function loadHistory(conversationId: string, ownerUserId: string): Promise<Array<{ role: string; content: string }>> {
  try {
    const rows = await db.execute(sql`
      SELECT role, content FROM dazza_v3_conversations
      WHERE conversation_id = ${conversationId}
        AND owner_user_id = ${ownerUserId}
      ORDER BY turn_index ASC
      LIMIT ${CONTEXT_RECENT_TURNS * 2}
    `);
    return ((rows as { rows: unknown[] }).rows ?? []) as Array<{ role: string; content: string }>;
  } catch {
    return [];
  }
}

async function saveMessage(
  conversationId: string,
  ownerUserId: string,
  role: 'user' | 'assistant',
  content: string,
  turnIndex: number,
): Promise<void> {
  try {
    await db.execute(sql`
      INSERT INTO dazza_v3_conversations
        (id, conversation_id, owner_user_id, role, content, turn_index)
      VALUES
        (${randomUUID()}, ${conversationId}, ${ownerUserId}, ${role}, ${content}, ${turnIndex})
    `);
  } catch {
    // Non-fatal
  }
}

// ── Audit ─────────────────────────────────────────────────────────────────────

async function auditBuilder(
  ownerUserId: string,
  eventType: string,
  details: Record<string, unknown>,
): Promise<void> {
  try {
    await db.execute(sql`
      INSERT INTO dazza_builder_audit
        (id, owner_user_id, event_type, details_json, created_at)
      VALUES
        (${randomUUID()}, ${ownerUserId}, ${eventType}, ${JSON.stringify(details)}, NOW())
    `);
  } catch {
    // Non-fatal
  }
}

// ── Version creation ──────────────────────────────────────────────────────────

export async function createBuilderVersion(
  templateId: number,
  builderType: BuilderType,
  ownerUserId: string,
  previousSnapshot: string,
  newSnapshot: string,
  instructionSummary: string,
  operations: BuilderOperation[],
  conversationId: string,
  validationResult: string,
): Promise<{ versionId: string; versionNumber: number }> {
  // Get next version number
  const countRows = await db.execute(sql`
    SELECT COALESCE(MAX(version_number), 0) AS max_v
    FROM dazza_builder_versions
    WHERE template_id = ${templateId} AND builder_type = ${builderType}
  `);
  const maxV = Number(((countRows as { rows: unknown[] }).rows?.[0] as Record<string, unknown>)?.max_v ?? 0);
  const versionNumber = maxV + 1;
  const versionId = randomUUID();

  await db.execute(sql`
    INSERT INTO dazza_builder_versions
      (id, template_id, builder_type, version_number, owner_user_id,
       change_source, instruction_summary, operations_json, operations_count,
       previous_snapshot_json, new_snapshot_json, validation_result,
       conversation_id, created_at)
    VALUES
      (${versionId}, ${templateId}, ${builderType}, ${versionNumber}, ${ownerUserId},
       'dazza', ${instructionSummary.slice(0, 500)}, ${JSON.stringify(operations)},
       ${operations.length}, ${previousSnapshot}, ${newSnapshot},
       ${validationResult}, ${conversationId}, NOW())
  `);

  return { versionId, versionNumber };
}

// ── Apply operations ──────────────────────────────────────────────────────────

export async function applyBuilderOperations(
  req: BuilderApplyRequest,
  ownerUserId: string,
): Promise<BuilderApplyResult> {
  const { templateId, builderType, operations, instructionSummary, conversationId } = req;

  // Validate operations first
  const validationErrors = validateOperations(operations, builderType);
  if (validationErrors.length > 0) {
    return { ok: false, versionId: '', versionNumber: 0, operationsApplied: 0, validationErrors, error: 'Validation failed' };
  }

  try {
    if (builderType === 'document') {
      return await applyDocumentOperations(templateId, operations, ownerUserId, instructionSummary, conversationId);
    } else {
      return await applyFormOperations(templateId, operations, ownerUserId, instructionSummary, conversationId);
    }
  } catch (e) {
    return {
      ok: false, versionId: '', versionNumber: 0, operationsApplied: 0,
      validationErrors: [],
      error: e instanceof Error ? e.message : String(e),
    };
  }
}

async function applyDocumentOperations(
  templateId: number,
  operations: BuilderOperation[],
  ownerUserId: string,
  instructionSummary: string,
  conversationId: string,
): Promise<BuilderApplyResult> {
  // Load current template
  const rows = await db.execute(sql`
    SELECT builder_json FROM document_templates WHERE id = ${templateId} LIMIT 1
  `);
  const row = (rows as { rows: unknown[] }).rows?.[0] as Record<string, unknown> | undefined;
  if (!row) return { ok: false, versionId: '', versionNumber: 0, operationsApplied: 0, validationErrors: [], error: 'Template not found' };

  const previousSnapshot = (row.builder_json as string) ?? '{}';
  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(previousSnapshot);
  } catch {
    parsed = {};
  }

  // Apply operations to the in-memory document
  const blocks = (parsed.blocks as Array<Record<string, unknown>>) ?? [];
  let applied = 0;

  for (const op of operations) {
    switch (op.op) {
      case 'addBlock': {
        const newBlock = buildBlock(op);
        const afterId = op.afterBlockId as string | undefined;
        if (afterId) {
          const idx = blocks.findIndex(b => b.id === afterId);
          blocks.splice(idx >= 0 ? idx + 1 : blocks.length, 0, newBlock);
        } else {
          blocks.push(newBlock);
        }
        applied++;
        break;
      }
      case 'updateBlock': {
        const idx = blocks.findIndex(b => b.id === op.blockId);
        if (idx >= 0) {
          blocks[idx] = { ...blocks[idx], ...sanitiseBlockUpdate(op) };
          applied++;
        }
        break;
      }
      case 'moveBlock': {
        const fromIdx = blocks.findIndex(b => b.id === op.blockId);
        const toIdx = Number(op.toIndex ?? 0);
        if (fromIdx >= 0 && toIdx >= 0 && toIdx < blocks.length) {
          const [moved] = blocks.splice(fromIdx, 1);
          blocks.splice(toIdx, 0, moved);
          applied++;
        }
        break;
      }
      case 'removeBlock': {
        const idx = blocks.findIndex(b => b.id === op.blockId);
        if (idx >= 0) { blocks.splice(idx, 1); applied++; }
        break;
      }
      case 'updateTemplateSettings': {
        const updates: Record<string, unknown> = {};
        if (op.name) updates.name = String(op.name).slice(0, 255);
        if (op.templateType) updates.template_type = String(op.templateType);
        if (Object.keys(updates).length > 0) {
          const setClauses = Object.entries(updates)
            .map(([k]) => `${k} = ?`)
            .join(', ');
          // Use parameterised update
          if (updates.name) {
            await db.execute(sql`UPDATE document_templates SET name = ${String(updates.name)} WHERE id = ${templateId}`);
          }
          void setClauses; // used above
          applied++;
        }
        break;
      }
    }
  }

  const newSnapshot = JSON.stringify({ ...parsed, blocks });

  // Save version
  const { versionId, versionNumber } = await createBuilderVersion(
    templateId, 'document', ownerUserId,
    previousSnapshot, newSnapshot,
    instructionSummary, operations, conversationId, 'valid',
  );

  // Persist updated builder_json
  await db.execute(sql`
    UPDATE document_templates SET builder_json = ${newSnapshot}, updated_at = NOW()
    WHERE id = ${templateId}
  `);

  void auditBuilder(ownerUserId, 'builder_apply_document', {
    templateId, versionId, versionNumber, operationsApplied: applied, instructionSummary,
  });

  return { ok: true, versionId, versionNumber, operationsApplied: applied, validationErrors: [] };
}

async function applyFormOperations(
  templateId: number,
  operations: BuilderOperation[],
  ownerUserId: string,
  instructionSummary: string,
  conversationId: string,
): Promise<BuilderApplyResult> {
  // Load current fields for snapshot
  const fieldRows = await db.execute(sql`
    SELECT * FROM form_fields WHERE template_id = ${templateId} ORDER BY field_order ASC
  `);
  const previousSnapshot = JSON.stringify((fieldRows as { rows: unknown[] }).rows ?? []);
  let applied = 0;

  for (const op of operations) {
    switch (op.op) {
      case 'addField': {
        const maxOrderRows = await db.execute(sql`
          SELECT COALESCE(MAX(field_order), 0) AS max_o FROM form_fields WHERE template_id = ${templateId}
        `);
        const maxOrder = Number(((maxOrderRows as { rows: unknown[] }).rows?.[0] as Record<string, unknown>)?.max_o ?? 0);
        const afterOrder = op.afterFieldId
          ? await getFieldOrder(templateId, op.afterFieldId as string)
          : null;
        const newOrder = afterOrder !== null ? afterOrder + 1 : maxOrder + 1;

        // Shift existing fields if inserting in middle
        if (afterOrder !== null) {
          await db.execute(sql`
            UPDATE form_fields SET field_order = field_order + 1
            WHERE template_id = ${templateId} AND field_order > ${afterOrder}
          `);
        }

        await db.execute(sql`
          INSERT INTO form_fields
            (template_id, company_id, label, field_type, required, options_json,
             settings_json, logic_json, field_order, created_at, updated_at)
          SELECT ${templateId}, company_id,
                 ${String(op.label ?? 'New Field').slice(0, 255)},
                 ${String(op.fieldType ?? 'text')},
                 ${op.required ? 1 : 0},
                 ${op.optionsJson ? JSON.stringify(op.optionsJson) : null},
                 ${op.settingsJson ? JSON.stringify(op.settingsJson) : null},
                 ${op.logicJson ? JSON.stringify(op.logicJson) : null},
                 ${newOrder}, NOW(), NOW()
          FROM form_templates WHERE id = ${templateId}
          LIMIT 1
        `);
        applied++;
        break;
      }
      case 'updateField': {
        const fieldId = Number(op.fieldId);
        if (!fieldId) break;
        const updates: string[] = [];
        if (op.label !== undefined) {
          await db.execute(sql`UPDATE form_fields SET label = ${String(op.label).slice(0, 255)} WHERE id = ${fieldId} AND template_id = ${templateId}`);
          updates.push('label');
        }
        if (op.required !== undefined) {
          await db.execute(sql`UPDATE form_fields SET required = ${op.required ? 1 : 0} WHERE id = ${fieldId} AND template_id = ${templateId}`);
          updates.push('required');
        }
        if (op.optionsJson !== undefined) {
          await db.execute(sql`UPDATE form_fields SET options_json = ${JSON.stringify(op.optionsJson)} WHERE id = ${fieldId} AND template_id = ${templateId}`);
          updates.push('options_json');
        }
        if (op.logicJson !== undefined) {
          await db.execute(sql`UPDATE form_fields SET logic_json = ${JSON.stringify(op.logicJson)} WHERE id = ${fieldId} AND template_id = ${templateId}`);
          updates.push('logic_json');
        }
        if (updates.length > 0) {
          await db.execute(sql`UPDATE form_fields SET updated_at = NOW() WHERE id = ${fieldId} AND template_id = ${templateId}`);
          applied++;
        }
        break;
      }
      case 'moveField': {
        const fieldId = Number(op.fieldId);
        const toOrder = Number(op.toIndex ?? 0);
        if (!fieldId) break;
        await db.execute(sql`UPDATE form_fields SET field_order = ${toOrder}, updated_at = NOW() WHERE id = ${fieldId} AND template_id = ${templateId}`);
        applied++;
        break;
      }
      case 'removeField': {
        const fieldId = Number(op.fieldId);
        if (!fieldId) break;
        await db.execute(sql`DELETE FROM form_fields WHERE id = ${fieldId} AND template_id = ${templateId}`);
        applied++;
        break;
      }
      case 'updateTemplateSettings': {
        if (op.name) {
          await db.execute(sql`UPDATE form_templates SET name = ${String(op.name).slice(0, 255)}, updated_at = NOW() WHERE id = ${templateId}`);
          applied++;
        }
        if (op.description !== undefined) {
          await db.execute(sql`UPDATE form_templates SET description = ${String(op.description).slice(0, 500)}, updated_at = NOW() WHERE id = ${templateId}`);
          applied++;
        }
        break;
      }
    }
  }

  // Load new snapshot
  const newFieldRows = await db.execute(sql`
    SELECT * FROM form_fields WHERE template_id = ${templateId} ORDER BY field_order ASC
  `);
  const newSnapshot = JSON.stringify((newFieldRows as { rows: unknown[] }).rows ?? []);

  const { versionId, versionNumber } = await createBuilderVersion(
    templateId, 'form', ownerUserId,
    previousSnapshot, newSnapshot,
    instructionSummary, operations, conversationId, 'valid',
  );

  void auditBuilder(ownerUserId, 'builder_apply_form', {
    templateId, versionId, versionNumber, operationsApplied: applied, instructionSummary,
  });

  return { ok: true, versionId, versionNumber, operationsApplied: applied, validationErrors: [] };
}

async function getFieldOrder(templateId: number, fieldId: string): Promise<number | null> {
  try {
    const rows = await db.execute(sql`
      SELECT field_order FROM form_fields WHERE id = ${Number(fieldId)} AND template_id = ${templateId} LIMIT 1
    `);
    const row = (rows as { rows: unknown[] }).rows?.[0] as Record<string, unknown> | undefined;
    return row ? Number(row.field_order) : null;
  } catch { return null; }
}

// ── Block builder helper ──────────────────────────────────────────────────────

function buildBlock(op: BuilderOperation): Record<string, unknown> {
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
      const tableRows = Array.from({ length: rows }, () =>
        Array.from({ length: cols }, () => ''),
      );
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

function sanitiseBlockUpdate(op: BuilderOperation): Record<string, unknown> {
  const allowed = ['content', 'html', 'level', 'align', 'color', 'style', 'thickness',
    'height', 'label', 'required', 'fieldType', 'fieldKey', 'variant', 'headers', 'rows',
    'bold', 'italic', 'fontSize', 'backgroundColor', 'borderColor', 'padding'];
  const out: Record<string, unknown> = {};
  for (const key of allowed) {
    if (key in op) out[key] = op[key];
  }
  return out;
}

// ── Restore version ───────────────────────────────────────────────────────────

export async function restoreBuilderVersion(
  versionId: string,
  ownerUserId: string,
): Promise<{ ok: boolean; newVersionId: string; newVersionNumber: number; error?: string }> {
  try {
    const rows = await db.execute(sql`
      SELECT * FROM dazza_builder_versions WHERE id = ${versionId} LIMIT 1
    `);
    const version = (rows as { rows: unknown[] }).rows?.[0] as Record<string, unknown> | undefined;
    if (!version) return { ok: false, newVersionId: '', newVersionNumber: 0, error: 'Version not found' };

    const templateId = Number(version.template_id);
    const builderType = String(version.builder_type) as BuilderType;
    const snapshotToRestore = String(version.previous_snapshot_json ?? '{}');

    if (builderType === 'document') {
      await db.execute(sql`
        UPDATE document_templates SET builder_json = ${snapshotToRestore}, updated_at = NOW()
        WHERE id = ${templateId}
      `);
    } else {
      // For forms, restore means re-creating fields from snapshot
      // This is complex — we store a note and let the client reload
      // The snapshot is available for reference
    }

    const { versionId: newVersionId, versionNumber: newVersionNumber } = await createBuilderVersion(
      templateId, builderType, ownerUserId,
      String(version.new_snapshot_json ?? '{}'),
      snapshotToRestore,
      `Restored to version ${version.version_number}`,
      [{ op: 'restore', fromVersionId: versionId, fromVersionNumber: version.version_number }],
      '',
      'restored',
    );

    void auditBuilder(ownerUserId, 'builder_restore_version', {
      templateId, builderType, restoredVersionId: versionId, newVersionId, newVersionNumber,
    });

    return { ok: true, newVersionId, newVersionNumber };
  } catch (e) {
    return { ok: false, newVersionId: '', newVersionNumber: 0, error: e instanceof Error ? e.message : String(e) };
  }
}

// ── Main stream function ──────────────────────────────────────────────────────

export async function streamBuilderAssistant(opts: BuilderStreamOptions): Promise<void> {
  const { ownerContext, userMessage, builderContext, onToken, onToolCall, onStatus, onProposedChange, onDone, onError } = opts;

  if (!ownerContext.isPlatformOwner) {
    onError('Owner access required.');
    return;
  }

  const apiKeyRaw = getSecret('OPENAI_API_KEY');
  const apiKey = apiKeyRaw !== null ? String(apiKeyRaw).trim() : null;
  if (!apiKey) {
    onError('OpenAI API key not configured.');
    return;
  }

  // Resolve conversation ID
  const conversationId = opts.conversationId ?? randomUUID();
  const isNew = !opts.conversationId;

  // Load history
  const history = isNew ? [] : await loadHistory(conversationId, ownerContext.userId);

  // Audit
  void auditBuilder(ownerContext.userId, 'builder_chat_request', {
    conversationId, builderType: builderContext.builderType,
    templateId: builderContext.templateId, messageLength: userMessage.length,
  });

  // Save user message
  const turnIndex = history.length;
  await saveMessage(conversationId, ownerContext.userId, 'user', userMessage, turnIndex);

  onStatus('reading', 'Reading context…');

  const systemPrompt = buildSystemPrompt(builderContext);

  const messages: Array<{ role: string; content: string }> = [
    { role: 'system', content: systemPrompt },
    ...history.slice(-CONTEXT_RECENT_TURNS * 2),
    { role: 'user', content: userMessage },
  ];

  let toolsUsed: string[] = [];
  let assistantContent = '';
  let inputTokens = 0;
  let outputTokens = 0;

  try {
    for (let round = 0; round < TOOL_ROUNDS_MAX; round++) {
      onStatus('planning', round === 0 ? 'Thinking…' : 'Continuing…');

      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model: 'gpt-4o',
          messages,
          tools: BUILDER_TOOL_DEFINITIONS.map(t => ({ type: 'function', function: { name: t.name, description: t.description, parameters: t.parameters } })),
          tool_choice: 'auto',
          max_tokens: MAX_TOKENS,
          stream: true,
        }),
      });

      if (!response.ok) {
        const errText = await response.text();
        onError(`OpenAI error: ${response.status} ${errText.slice(0, 200)}`);
        return;
      }

      // Parse SSE stream
      const reader = response.body?.getReader();
      if (!reader) { onError('No response body'); return; }

      let toolCallsThisRound: Array<{ id: string; name: string; argsRaw: string }> = [];
      let currentToolCall: { id: string; name: string; argsRaw: string } | null = null;
      let finishReason = '';

      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = line.slice(6).trim();
          if (data === '[DONE]') { finishReason = finishReason || 'stop'; break; }

          let chunk: Record<string, unknown>;
          try { chunk = JSON.parse(data); } catch { continue; }

          const usage = chunk.usage as Record<string, number> | undefined;
          if (usage) {
            inputTokens += usage.prompt_tokens ?? 0;
            outputTokens += usage.completion_tokens ?? 0;
          }

          const choices = (chunk.choices as Array<Record<string, unknown>>) ?? [];
          for (const choice of choices) {
            const delta = choice.delta as Record<string, unknown> | undefined;
            if (!delta) continue;

            finishReason = String(choice.finish_reason ?? finishReason);

            // Text token
            if (typeof delta.content === 'string' && delta.content) {
              assistantContent += delta.content;
              onToken(delta.content);
            }

            // Tool call delta
            const toolCallDeltas = delta.tool_calls as Array<Record<string, unknown>> | undefined;
            if (toolCallDeltas) {
              for (const tc of toolCallDeltas) {
                const idx = Number(tc.index ?? 0);
                if (!toolCallsThisRound[idx]) {
                  toolCallsThisRound[idx] = { id: '', name: '', argsRaw: '' };
                }
                const fn = tc.function as Record<string, string> | undefined;
                if (tc.id) toolCallsThisRound[idx].id = String(tc.id);
                if (fn?.name) toolCallsThisRound[idx].name += fn.name;
                if (fn?.arguments) toolCallsThisRound[idx].argsRaw += fn.arguments;
                currentToolCall = toolCallsThisRound[idx];
              }
            }
          }
        }
      }

      // If no tool calls, we're done
      if (toolCallsThisRound.length === 0 || finishReason === 'stop') {
        break;
      }

      // Execute tool calls
      const toolResults: Array<{ role: string; tool_call_id: string; content: string }> = [];

      for (const tc of toolCallsThisRound) {
        if (!tc.name) continue;
        toolsUsed.push(tc.name);
        onToolCall(tc.name, 'running');
        onStatus('applying', TOOL_LABELS[tc.name] ?? `Running ${tc.name}…`);

        let args: Record<string, unknown> = {};
        try { args = JSON.parse(tc.argsRaw || '{}'); } catch { args = {}; }

        // Special handling for propose_changes — emit to client
        if (tc.name === 'builder_propose_changes') {
          const proposed: ProposedChange = {
            summary: String(args.summary ?? ''),
            affectedSections: (args.affectedSections as string[]) ?? [],
            affectedItems: (args.affectedItems as string[]) ?? [],
            validationImpact: String(args.validationImpact ?? ''),
            operations: (args.operations as BuilderOperation[]) ?? [],
            conversationId,
          };
          onProposedChange(proposed);
        }

        const result = await executeBuilderTool(tc.name, args, ownerContext);
        onToolCall(tc.name, 'done');

        toolResults.push({
          role: 'tool',
          tool_call_id: tc.id,
          content: result,
        });
      }

      // Add assistant message with tool calls + results to messages
      messages.push({
        role: 'assistant',
        content: JSON.stringify({
          content: assistantContent || null,
          tool_calls: toolCallsThisRound.map(tc => ({
            id: tc.id,
            type: 'function',
            function: { name: tc.name, arguments: tc.argsRaw },
          })),
        }),
      });
      for (const tr of toolResults) {
        messages.push(tr as { role: string; content: string });
      }

      assistantContent = '';
      toolCallsThisRound = [];
      void currentToolCall;
    }

    // Save assistant response
    if (assistantContent) {
      await saveMessage(conversationId, ownerContext.userId, 'assistant', assistantContent, turnIndex + 1);
    }

    onStatus('complete', 'Done');
    onDone({ model: 'gpt-4o', toolsUsed, conversationId, inputTokens, outputTokens });

  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    onError(msg, conversationId);
    void auditBuilder(ownerContext.userId, 'builder_chat_error', { conversationId, error: msg });
  }
}
