/**
 * POST /api/dazza/builder/apply
 * ─────────────────────────────────────────────────────────────────────────────
 * Apply a set of structured builder operations proposed by Dazza.
 * Creates a version snapshot before applying.
 *
 * Body: {
 *   templateId: number,
 *   builderType: 'document' | 'form',
 *   operations: BuilderOperation[],
 *   instructionSummary: string,
 *   conversationId: string,
 * }
 */
import type { Request, Response } from 'express';
import { getPlatformOwnerInfo } from '../../../../lib/platform-owner-guard.js';
import { applyBuilderOperations } from '../../../../lib/dazza-builder-brain.js';
import type { BuilderApplyRequest } from '../../../../lib/dazza-builder-brain.js';

export default async function handler(req: Request, res: Response) {
  try {
    const ownerInfo = await getPlatformOwnerInfo(req);
    if (!ownerInfo) return res.status(401).json({ error: 'Unauthorised' });
    if (!ownerInfo.isPlatformOwner) return res.status(403).json({ error: 'Owner access required.' });

    const { templateId, builderType, operations, instructionSummary, conversationId } = req.body as Partial<BuilderApplyRequest>;

    if (!templateId || typeof templateId !== 'number') return res.status(400).json({ error: 'templateId (number) required' });
    if (!builderType || !['document', 'form'].includes(builderType)) return res.status(400).json({ error: 'builderType must be "document" or "form"' });
    if (!Array.isArray(operations) || operations.length === 0) return res.status(400).json({ error: 'operations array required' });
    if (!instructionSummary?.trim()) return res.status(400).json({ error: 'instructionSummary required' });
    if (!conversationId?.trim()) return res.status(400).json({ error: 'conversationId required' });

    const result = await applyBuilderOperations(
      { templateId, builderType, operations, instructionSummary, conversationId },
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
