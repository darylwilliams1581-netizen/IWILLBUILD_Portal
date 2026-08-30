/**
 * dazza-builder/versioning.ts
 * Version creation and restore for Dazza Builder.
 *
 * INVARIANTS:
 * - Every material change creates a new version row (never overwrites).
 * - Restore creates a NEW version rather than deleting history.
 * - Version IDs are UUIDs; version numbers are sequential per template+type.
 */
import { db } from '../../db/client.js';
import { sql } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';
import type { BuilderType, BuilderOperation } from './types.js';
import { auditBuilder } from './audit.js';

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
    }
    // Form restore: snapshot stored for reference; full field-row restore is a follow-up.

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
