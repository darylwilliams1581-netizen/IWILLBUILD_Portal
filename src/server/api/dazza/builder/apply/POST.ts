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

    // 7. Non-null templateId → verify the template exists AND belongs to the
    //    authenticated owner's company.  This prevents a stale or crafted
    //    templateId from targeting a template owned by a different company.
    //
    //    Platform-owner access: the owner's company_id is resolved from their
    //    profiles row (same lookup used by document-adapter for createNewTemplate).
    //    This correctly resolves the developer company even when the platform owner
    //    is not a regular company member.
    //
    //    TENANT ISOLATION: a single WHERE id=? AND company_id=? query is used.
    //    We intentionally return the same HTTP 404 / code: TEMPLATE_NOT_FOUND for
    //    both "nonexistent" and "belongs to another company" — never reveal that a
    //    document exists in another tenant (information-disclosure prevention).
    //    No second "does it exist at all?" probe is performed.
    //
    //    MYSQL2 TUPLE: db.execute returns [rows, metadata].  Use destructuring:
    //      const [rows] = await db.execute(...) as unknown as [Array<T>, unknown]
    //    Never use (result as { rows: T[] }).rows — that property does not exist
    //    on the tuple and is always undefined, making every template appear missing.
    if (typeof templateId === 'number') {
      // Resolve the owner's company_id from their profile
      const [profileRows] = await db.execute(sql`
        SELECT company_id FROM profiles WHERE user_id = ${ownerInfo.userId} LIMIT 1
      `) as unknown as [Array<{ company_id: number | null }>, unknown];
      const ownerCompanyId = profileRows?.[0]?.company_id ?? null;

      if (!ownerCompanyId) {
        return res.status(403).json({ error: 'Owner has no company profile — cannot verify template ownership.' });
      }

      const table = builderType === 'document' ? sql`document_templates` : sql`form_templates`;
      const [existRows] = await db.execute(sql`
        SELECT id FROM ${table}
        WHERE id = ${templateId} AND company_id = ${ownerCompanyId}
        LIMIT 1
      `) as unknown as [Array<{ id: number }>, unknown];

      if (!existRows?.[0]) {
        // Same response for nonexistent and cross-tenant — never reveal cross-tenant existence.
        return res.status(404).json({
          code: 'TEMPLATE_NOT_FOUND',
          error: 'Template not found.',
        });
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
