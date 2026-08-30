/**
 * dazza-builder/form-adapter.ts
 * Applies Dazza Builder operations to form_templates and form_fields.
 *
 * SECURITY:
 * - Template ID is resolved server-side; never trusted from AI output.
 * - Historical submissions (form_submissions) are never touched.
 * - Template identifiers and reporting links remain intact.
 * - Conditional rules and validation are preserved unless explicitly targeted.
 * - company_id is inherited from the template row — never supplied by AI.
 *
 * CREATE-NEW FLOW:
 * - When templateId is null, the first operation MUST be createNewTemplate.
 * - The adapter inserts a new form_templates row and threads the new ID through
 *   all subsequent operations in the same batch.
 */
import { db } from '../../db/client.js';
import { sql, eq } from 'drizzle-orm';
import type { BuilderOperation, BuilderApplyResult } from './types.js';
import { createBuilderVersion } from './versioning.js';
import { auditBuilder } from './audit.js';
import { profiles } from '../../db/schema.js';

export async function applyFormOperations(
  templateId: number | null,
  operations: BuilderOperation[],
  ownerUserId: string,
  instructionSummary: string,
  conversationId: string,
): Promise<BuilderApplyResult> {

  // ── Create-new path ────────────────────────────────────────────────────────
  let resolvedTemplateId = templateId;
  let newTemplateName: string | undefined;

  if (resolvedTemplateId === null) {
    const createOp = operations[0];
    if (!createOp || createOp.op !== 'createNewTemplate') {
      return { ok: false, versionId: '', versionNumber: 0, operationsApplied: 0, validationErrors: [], error: 'createNewTemplate must be the first operation when templateId is null' };
    }

    const name = String(createOp.name ?? 'Untitled Form').slice(0, 255);
    const formType = String(createOp.formType ?? 'General').slice(0, 100);
    const category = String(createOp.category ?? 'General').slice(0, 100);
    newTemplateName = name;

    // Look up the owner's company_id — required NOT NULL on form_templates.
    const [ownerProfile] = await db.select().from(profiles).where(eq(profiles.userId, ownerUserId)).limit(1);
    if (!ownerProfile?.companyId) {
      return { ok: false, versionId: '', versionNumber: 0, operationsApplied: 0, validationErrors: [], error: 'Owner has no company profile — cannot create template.' };
    }
    const companyId = ownerProfile.companyId;

    const insertResult = await db.execute(sql`
      INSERT INTO form_templates
        (company_id, name, form_type, category, is_active, created_at, updated_at)
      VALUES
        (${companyId}, ${name}, ${formType}, ${category}, 0, NOW(), NOW())
    `);

    const insertId = (insertResult as { insertId?: number | bigint }).insertId;
    if (!insertId) {
      return { ok: false, versionId: '', versionNumber: 0, operationsApplied: 0, validationErrors: [], error: 'Failed to create new form template' };
    }
    resolvedTemplateId = Number(insertId);

    // Remove the createNewTemplate op — remaining ops are applied to the new template.
    operations = operations.slice(1);

    void auditBuilder(ownerUserId, 'builder_create_form_template', {
      newTemplateId: resolvedTemplateId, name, formType, category, conversationId,
    });
  }
  // Load current fields for snapshot — before any mutations
  const fieldRows = await db.execute(sql`
    SELECT * FROM form_fields WHERE template_id = ${resolvedTemplateId} ORDER BY field_order ASC
  `);
  const previousSnapshot = JSON.stringify((fieldRows as { rows: unknown[] }).rows ?? []);
  let applied = 0;

  for (const op of operations) {
    switch (op.op) {
      case 'addField': {
        const maxOrderRows = await db.execute(sql`
          SELECT COALESCE(MAX(field_order), 0) AS max_o FROM form_fields WHERE template_id = ${resolvedTemplateId}
        `);
        const maxOrder = Number(((maxOrderRows as { rows: unknown[] }).rows?.[0] as Record<string, unknown>)?.max_o ?? 0);
        const afterOrder = op.afterFieldId
          ? await getFieldOrder(resolvedTemplateId, op.afterFieldId as string)
          : null;
        const newOrder = afterOrder !== null ? afterOrder + 1 : maxOrder + 1;

        // Shift existing fields if inserting in middle
        if (afterOrder !== null) {
          await db.execute(sql`
            UPDATE form_fields SET field_order = field_order + 1
            WHERE template_id = ${resolvedTemplateId} AND field_order > ${afterOrder}
          `);
        }

        // company_id is inherited from the template — never from AI input
        await db.execute(sql`
          INSERT INTO form_fields
            (template_id, company_id, label, field_type, required, options_json,
             settings_json, logic_json, field_order, created_at, updated_at)
          SELECT ${resolvedTemplateId}, company_id,
                 ${String(op.label ?? 'New Field').slice(0, 255)},
                 ${String(op.fieldType ?? 'text')},
                 ${op.required ? 1 : 0},
                 ${op.optionsJson ? JSON.stringify(op.optionsJson) : null},
                 ${op.settingsJson ? JSON.stringify(op.settingsJson) : null},
                 ${op.logicJson ? JSON.stringify(op.logicJson) : null},
                 ${newOrder}, NOW(), NOW()
          FROM form_templates WHERE id = ${resolvedTemplateId}
          LIMIT 1
        `);
        applied++;
        break;
      }
      case 'updateField': {
        const fieldId = Number(op.fieldId);
        if (!fieldId) break;
        let touched = false;
        if (op.label !== undefined) {
          await db.execute(sql`UPDATE form_fields SET label = ${String(op.label).slice(0, 255)} WHERE id = ${fieldId} AND template_id = ${resolvedTemplateId}`);
          touched = true;
        }
        if (op.required !== undefined) {
          await db.execute(sql`UPDATE form_fields SET required = ${op.required ? 1 : 0} WHERE id = ${fieldId} AND template_id = ${resolvedTemplateId}`);
          touched = true;
        }
        if (op.optionsJson !== undefined) {
          await db.execute(sql`UPDATE form_fields SET options_json = ${JSON.stringify(op.optionsJson)} WHERE id = ${fieldId} AND template_id = ${resolvedTemplateId}`);
          touched = true;
        }
        if (op.logicJson !== undefined) {
          await db.execute(sql`UPDATE form_fields SET logic_json = ${JSON.stringify(op.logicJson)} WHERE id = ${fieldId} AND template_id = ${resolvedTemplateId}`);
          touched = true;
        }
        if (touched) {
          await db.execute(sql`UPDATE form_fields SET updated_at = NOW() WHERE id = ${fieldId} AND template_id = ${resolvedTemplateId}`);
          applied++;
        }
        break;
      }
      case 'moveField': {
        const fieldId = Number(op.fieldId);
        const toOrder = Number(op.toIndex ?? 0);
        if (!fieldId) break;
        await db.execute(sql`UPDATE form_fields SET field_order = ${toOrder}, updated_at = NOW() WHERE id = ${fieldId} AND template_id = ${resolvedTemplateId}`);
        applied++;
        break;
      }
      case 'removeField': {
        const fieldId = Number(op.fieldId);
        if (!fieldId) break;
        await db.execute(sql`DELETE FROM form_fields WHERE id = ${fieldId} AND template_id = ${resolvedTemplateId}`);
        applied++;
        break;
      }
      case 'updateTemplateSettings': {
        if (op.name) {
          await db.execute(sql`UPDATE form_templates SET name = ${String(op.name).slice(0, 255)}, updated_at = NOW() WHERE id = ${resolvedTemplateId}`);
          applied++;
        }
        if (op.description !== undefined) {
          await db.execute(sql`UPDATE form_templates SET description = ${String(op.description).slice(0, 500)}, updated_at = NOW() WHERE id = ${resolvedTemplateId}`);
          applied++;
        }
        break;
      }
    }
  }

  // Load new snapshot after all mutations
  const newFieldRows = await db.execute(sql`
    SELECT * FROM form_fields WHERE template_id = ${resolvedTemplateId} ORDER BY field_order ASC
  `);
  const newSnapshot = JSON.stringify((newFieldRows as { rows: unknown[] }).rows ?? []);

  const { versionId, versionNumber } = await createBuilderVersion(
    resolvedTemplateId, 'form', ownerUserId,
    previousSnapshot, newSnapshot,
    instructionSummary, operations, conversationId, 'valid',
  );

  void auditBuilder(ownerUserId, 'builder_apply_form', {
    templateId: resolvedTemplateId, versionId, versionNumber, operationsApplied: applied, instructionSummary,
  });

  return {
    ok: true, versionId, versionNumber, operationsApplied: applied, validationErrors: [],
    ...(templateId === null ? { newTemplateId: resolvedTemplateId, newTemplateName } : {}),
  };
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
