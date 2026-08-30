/**
 * dazza-builder/document-adapter.ts
 * Applies Dazza Builder operations to document_templates.
 *
 * SECURITY:
 * - Template ID is resolved server-side from the DB; never trusted from AI output.
 * - Only builder_json is mutated; no other columns are touched except name/template_type via updateTemplateSettings.
 * - Existing merge-field identifiers and block IDs are preserved unless explicitly targeted.
 * - Unknown blocks in the existing template are preserved (pass-through).
 *
 * CREATE-NEW FLOW:
 * - When templateId is null, the first operation MUST be createNewTemplate.
 * - The adapter inserts a new document_templates row and threads the new ID
 *   through all subsequent operations in the same batch.
 * - The response includes newTemplateId and newTemplateName so the client can
 *   navigate to the new template.
 */
import { db } from '../../db/client.js';
import { sql, eq } from 'drizzle-orm';
import type { BuilderOperation, BuilderApplyResult } from './types.js';
import { buildBlock, sanitiseBlockUpdate } from './operations.js';
import { createBuilderVersion } from './versioning.js';
import { auditBuilder } from './audit.js';
import { profiles } from '../../db/schema.js';

export async function applyDocumentOperations(
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

    const name = String(createOp.name ?? 'Untitled Document').slice(0, 255);
    const templateType = String(createOp.templateType ?? 'generic').slice(0, 100);
    const docStatus = String(createOp.docStatus ?? 'draft').slice(0, 50);
    const docKind = String(createOp.docKind ?? 'doc').slice(0, 50);
    newTemplateName = name;

    // Look up the owner's company_id — required NOT NULL on document_templates.
    const [ownerProfile] = await db.select().from(profiles).where(eq(profiles.userId, ownerUserId)).limit(1);
    if (!ownerProfile?.companyId) {
      return { ok: false, versionId: '', versionNumber: 0, operationsApplied: 0, validationErrors: [], error: 'Owner has no company profile — cannot create template.' };
    }
    const companyId = ownerProfile.companyId;

    const emptyJson = JSON.stringify({ blocks: [], pageLayout: { paperSize: 'A4', orientation: 'portrait', margins: 'standard' }, theme: { backgroundColor: '#ffffff', accentColor: '#1e3a5f', textColor: '#1a1a1a', tableHeaderColor: '#1e3a5f', tableHeaderTextColor: '#ffffff' }, systemFields: [], sourceAttachments: [], requiresAcknowledgement: false, acknowledgementLabel: '', acknowledgementText: '' });

    const [insertHeader] = await db.execute(sql`
      INSERT INTO document_templates
        (company_id, name, template_type, doc_status, doc_kind, builder_json, is_active, created_by_user_id, created_at, updated_at)
      VALUES
        (${companyId}, ${name}, ${templateType}, ${docStatus}, ${docKind}, ${emptyJson}, 1, ${ownerUserId}, NOW(), NOW())
    `) as unknown as [{ insertId?: number | bigint }, unknown];

    const insertId = insertHeader?.insertId;
    if (!insertId) {
      return { ok: false, versionId: '', versionNumber: 0, operationsApplied: 0, validationErrors: [], error: 'Failed to create new template' };
    }
    resolvedTemplateId = Number(insertId);

    // Remove the createNewTemplate op — remaining ops are applied to the new template.
    operations = operations.slice(1);

    void auditBuilder(ownerUserId, 'builder_create_document_template', {
      newTemplateId: resolvedTemplateId, name, templateType, docStatus, docKind, conversationId,
    });
  }

  // ── Load current template ──────────────────────────────────────────────────
  // db.execute returns [RowDataPacket[], FieldPacket[]] — rows are at index [0].
  const [templateRows] = await db.execute(sql`
    SELECT builder_json FROM document_templates WHERE id = ${resolvedTemplateId} LIMIT 1
  `) as unknown as [Array<Record<string, unknown>>, unknown];
  const row = templateRows?.[0];
  if (!row) {
    return { ok: false, versionId: '', versionNumber: 0, operationsApplied: 0, validationErrors: [], error: 'Template not found' };
  }

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
        const beforeId = op.beforeBlockId as string | undefined;
        const insertPosition = op.insertPosition as string | undefined; // 'top' | 'bottom' (default)

        if (afterId) {
          const idx = blocks.findIndex(b => b.id === afterId);
          blocks.splice(idx >= 0 ? idx + 1 : blocks.length, 0, newBlock);
        } else if (beforeId) {
          const idx = blocks.findIndex(b => b.id === beforeId);
          blocks.splice(idx >= 0 ? idx : 0, 0, newBlock);
        } else if (insertPosition === 'top') {
          blocks.unshift(newBlock);
        } else {
          // Default: append to end
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
        if (op.name) {
          await db.execute(sql`
            UPDATE document_templates SET name = ${String(op.name).slice(0, 255)} WHERE id = ${resolvedTemplateId}
          `);
          applied++;
        }
        break;
      }
    }
  }

  const newSnapshot = JSON.stringify({ ...parsed, blocks });

  // Create version snapshot BEFORE persisting (so previous_snapshot is accurate)
  const { versionId, versionNumber } = await createBuilderVersion(
    resolvedTemplateId, 'document', ownerUserId,
    previousSnapshot, newSnapshot,
    instructionSummary, operations, conversationId, 'valid',
  );

  // Persist updated builder_json
  await db.execute(sql`
    UPDATE document_templates SET builder_json = ${newSnapshot}, updated_at = NOW()
    WHERE id = ${resolvedTemplateId}
  `);

  void auditBuilder(ownerUserId, 'builder_apply_document', {
    templateId: resolvedTemplateId, versionId, versionNumber, operationsApplied: applied, instructionSummary,
  });

  return {
    ok: true, versionId, versionNumber, operationsApplied: applied, validationErrors: [],
    ...(templateId === null ? { newTemplateId: resolvedTemplateId, newTemplateName } : {}),
  };
}
