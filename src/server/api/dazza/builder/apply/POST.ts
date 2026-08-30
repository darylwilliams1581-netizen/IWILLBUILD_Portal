/**
 * POST /api/dazza/builder/apply
 * ─────────────────────────────────────────────────────────────────────────────
 * Apply a set of structured builder operations proposed by Dazza.
 * Creates a version snapshot before applying.
 *
 * Body: {
 *   templateId: number | null,
 *   builderType: 'document' | 'form',
 *   operations: BuilderOperation[],
 *   instructionSummary: string,
 *   conversationId: string,
 * }
 *
 * Pre-apply checks (in order):
 * 1. Owner-only (isPlatformOwner).
 * 2. templateId must be a number or null.
 * 3. builderType must be 'document' or 'form'.
 * 4. operations array must be non-empty.
 * 5. instructionSummary and conversationId must be present.
 * 6. When templateId is null, first op must be createNewTemplate.
 * 7. When templateId is a number, the template must exist in the DB and its
 *    builder type must match the requested builderType.
 */
import type { Request, Response } from 'express';
import { getPlatformOwnerInfo } from '../../../../lib/platform-owner-guard.js';
import { applyBuilderOperations } from '../../../../lib/dazza-builder-brain.js';
import type { BuilderApplyRequest } from '../../../../lib/dazza-builder-brain.js';
import { db } from '../../../../db/client.js';
import { sql } from 'drizzle-orm';

export default async function handler(req: Request, res: Response) {
  try {
    const ownerInfo = await getPlatformOwnerInfo(req);
    if (!ownerInfo) return res.status(401).json({ error: 'Unauthorised' });
    if (!ownerInfo.isPlatformOwner) return res.status(403).json({ error: 'Owner access required.' });

    const { templateId, builderType, operations, instructionSummary, conversationId } = req.body as Partial<BuilderApplyRequest>;

    // 2. templateId type check
    if (templateId !== null && templateId !== undefined && typeof templateId !== 'number') {
      return res.status(400).json({ error: 'templateId must be a number or null' });
    }
    // 3. builderType
    if (!builderType || !['document', 'form'].includes(builderType)) {
      return res.status(400).json({ error: 'builderType must be "document" or "form"' });
    }
    // 4. operations
    if (!Array.isArray(operations) || operations.length === 0) {
      return res.status(400).json({ error: 'operations array required' });
    }
    // 5. summary + conversationId
    if (!instructionSummary?.trim()) return res.status(400).json({ error: 'instructionSummary required' });
    if (!conversationId?.trim()) return res.status(400).json({ error: 'conversationId required' });

    // 6. null templateId → must start with createNewTemplate
    if (templateId === null || templateId === undefined) {
      if (operations[0]?.op !== 'createNewTemplate') {
        return res.status(400).json({ error: 'When templateId is null, the first operation must be createNewTemplate' });
      }
    }

    // 7. Non-null templateId → verify the template exists and type matches.
    //    Use the same company_id tenant filter as the GET endpoint so the
    //    existence check is authoritative for this owner.
    if (typeof templateId === 'number') {
      // Resolve the owner's company_id for tenant isolation (mirrors GET path).
      const profileRows = await db.execute(sql`
        SELECT company_id FROM profiles WHERE user_id = ${ownerInfo.userId} LIMIT 1
      `);
      // db.execute returns [RowDataPacket[], FieldPacket[]] — rows are at index [0].
      const [profileData] = profileRows as unknown as [Array<Record<string, unknown>>, unknown];
      const companyId = profileData?.[0]?.company_id ? Number(profileData[0].company_id) : null;
      if (!companyId) {
        return res.status(403).json({ error: 'Owner has no company profile.' });
      }

      if (builderType === 'document') {
        const [docRows] = await db.execute(sql`
          SELECT id FROM document_templates
          WHERE id = ${templateId} AND company_id = ${companyId}
          LIMIT 1
        `) as unknown as [Array<Record<string, unknown>>, unknown];
        if (!docRows?.length) {
          return res.status(404).json({
            ok: false,
            code: 'TEMPLATE_NOT_FOUND',
            error: `TEMPLATE_NOT_FOUND: document template #${templateId} does not exist or has been deleted. Open an existing template and re-run your request.`,
          });
        }
      } else {
        const [formRows] = await db.execute(sql`
          SELECT id FROM form_templates
          WHERE id = ${templateId} AND company_id = ${companyId}
          LIMIT 1
        `) as unknown as [Array<Record<string, unknown>>, unknown];
        if (!formRows?.length) {
          return res.status(404).json({
            ok: false,
            code: 'TEMPLATE_NOT_FOUND',
            error: `TEMPLATE_NOT_FOUND: form template #${templateId} does not exist or has been deleted. Open an existing template and re-run your request.`,
          });
        }
      }
    }

    const result = await applyBuilderOperations(
      { templateId: templateId ?? null, builderType, operations, instructionSummary, conversationId },
      ownerInfo.userId,
    );

    if (!result.ok) {
      return res.status(422).json({ error: result.error, validationErrors: result.validationErrors });
    }

    res.json(result);
  } catch (e) {
    res.status(500).json({ error: e instanceof Error ? e.message : String(e) });
  }
}
