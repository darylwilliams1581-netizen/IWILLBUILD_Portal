/**
 * dazza-builder/document-adapter.ts
 * Applies Dazza Builder operations to document_templates.
 *
 * SECURITY:
 * - Template ID is resolved server-side from the DB; never trusted from AI output.
 * - Only builder_json is mutated; no other columns are touched except name/template_type via updateTemplateSettings.
 * - Existing merge-field identifiers and block IDs are preserved unless explicitly targeted.
 * - Unknown blocks in the existing template are preserved (pass-through).
 */
import { db } from '../../db/client.js';
import { sql } from 'drizzle-orm';
import type { BuilderOperation, BuilderApplyResult } from './types.js';
import { buildBlock, sanitiseBlockUpdate } from './operations.js';
import { createBuilderVersion } from './versioning.js';
import { auditBuilder } from './audit.js';

export async function applyDocumentOperations(
  templateId: number,
  operations: BuilderOperation[],
  ownerUserId: string,
  instructionSummary: string,
  conversationId: string,
): Promise<BuilderApplyResult> {
  // Load current template — server-side resolution, not from AI
  const rows = await db.execute(sql`
    SELECT builder_json FROM document_templates WHERE id = ${templateId} LIMIT 1
  `);
  const row = (rows as { rows: unknown[] }).rows?.[0] as Record<string, unknown> | undefined;
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
        if (op.name) {
          await db.execute(sql`
            UPDATE document_templates SET name = ${String(op.name).slice(0, 255)} WHERE id = ${templateId}
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
