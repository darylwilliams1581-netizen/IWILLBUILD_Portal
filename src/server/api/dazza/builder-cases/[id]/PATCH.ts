/**
 * PATCH /api/dazza/builder-cases/:id
 * ─────────────────────────────────────────────────────────────────────────────
 * Update a builder case. Platform owner only.
 *
 * Accepts any subset of updatable fields.
 * Status transitions are validated server-side.
 *
 * SECURITY:
 *   - Marking sent_to_airo does NOT resolve the linked bug.
 *   - Marking verified requires a resolutionNote.
 *   - No secrets, credentials, or API keys may be stored in case fields.
 *
 * Special action: action=generate_airo_prompt
 *   Regenerates the airo_prompt field from the current case data and saves it.
 */

import type { Request, Response } from 'express';
import { getPlatformOwnerInfo } from '../../../../lib/platform-owner-guard.js';
import {
  getBuilderCase,
  updateBuilderCase,
  generateAiroPrompt,
  type BuilderCaseStatus,
  type BuilderCaseRisk,
  type BuilderCaseUpdateInput,
} from '../../../../lib/builder-case-service.js';

// Valid status transitions
const VALID_TRANSITIONS: Record<BuilderCaseStatus, BuilderCaseStatus[]> = {
  draft:                  ['analysing', 'closed'],
  analysing:              ['diagnosis_ready', 'draft', 'failed'],
  diagnosis_ready:        ['patch_ready', 'analysing', 'awaiting_daryl_review'],
  patch_ready:            ['awaiting_daryl_review', 'diagnosis_ready'],
  awaiting_daryl_review:  ['sent_to_airo', 'patch_ready', 'draft'],
  sent_to_airo:           ['awaiting_verification', 'patch_ready'],
  awaiting_verification:  ['verified', 'failed', 'sent_to_airo'],
  verified:               ['closed'],
  failed:                 ['draft', 'analysing', 'closed'],
  closed:                 [],
};

export default async function handler(req: Request, res: Response) {
  try {
    const ownerInfo = await getPlatformOwnerInfo(req);
    if (!ownerInfo) return res.status(401).json({ error: 'Unauthorised' });
    if (!ownerInfo.isPlatformOwner) return res.status(403).json({ error: 'Owner access required.' });

    const { id } = req.params;
    if (!id?.trim()) return res.status(400).json({ error: 'id is required' });

    const existing = await getBuilderCase(id, ownerInfo.userId);
    if (!existing) return res.status(403).json({ error: 'Not found or access denied.' });

    const body = req.body as Record<string, unknown>;

    // ── Special action: generate_airo_prompt ──────────────────────────────────
    if (body.action === 'generate_airo_prompt') {
      const prompt = generateAiroPrompt(existing);
      const updated = await updateBuilderCase(id, ownerInfo.userId, {
        airoPrompt: prompt,
        status: existing.status === 'diagnosis_ready' ? 'patch_ready' : existing.status,
      });
      return res.json({ ok: true, case: updated, airoPrompt: prompt });
    }

    // ── Build update input ────────────────────────────────────────────────────
    const update: BuilderCaseUpdateInput = {};

    if (typeof body.title === 'string') update.title = body.title.trim();
    if ('requestedResult' in body) update.requestedResult = body.requestedResult as string | null;
    if ('linkedBugId' in body) update.linkedBugId = body.linkedBugId as string | null;
    if ('conversationId' in body) update.conversationId = body.conversationId as string | null;
    if ('sourceVersion' in body) update.sourceVersion = body.sourceVersion as string | null;
    if ('riskLevel' in body) update.riskLevel = body.riskLevel as BuilderCaseRisk | null;
    if ('confirmedSymptom' in body) update.confirmedSymptom = body.confirmedSymptom as string | null;
    if ('rootCause' in body) update.rootCause = body.rootCause as string | null;
    if ('evidence' in body) update.evidence = body.evidence as string | null;
    if ('filesInspected' in body) update.filesInspected = body.filesInspected as string | null;
    if ('assumptions' in body) update.assumptions = body.assumptions as string | null;
    if ('unknowns' in body) update.unknowns = body.unknowns as string | null;
    if ('proposedFiles' in body) update.proposedFiles = body.proposedFiles as string | null;
    if ('changeSummary' in body) update.changeSummary = body.changeSummary as string | null;
    if ('dbRouteImpact' in body) update.dbRouteImpact = body.dbRouteImpact as string | null;
    if ('securityConsiderations' in body) update.securityConsiderations = body.securityConsiderations as string | null;
    if ('rollbackInstructions' in body) update.rollbackInstructions = body.rollbackInstructions as string | null;
    if ('proposedPatch' in body) update.proposedPatch = body.proposedPatch as string | null;
    if ('airoPrompt' in body) update.airoPrompt = body.airoPrompt as string | null;
    if ('testPlan' in body) update.testPlan = body.testPlan as string | null;
    if ('runtimeChecks' in body) update.runtimeChecks = body.runtimeChecks as string | null;
    if ('verificationNotes' in body) update.verificationNotes = body.verificationNotes as string | null;
    if ('resolutionNote' in body) update.resolutionNote = body.resolutionNote as string | null;

    // ── Status transition validation ──────────────────────────────────────────
    if (typeof body.status === 'string') {
      const newStatus = body.status as BuilderCaseStatus;
      const allowed = VALID_TRANSITIONS[existing.status] ?? [];

      if (!allowed.includes(newStatus)) {
        return res.status(400).json({
          error: `Invalid status transition: ${existing.status} → ${newStatus}`,
          allowedTransitions: allowed,
        });
      }

      // Verified requires a resolution note
      if (newStatus === 'verified' && !update.resolutionNote && !existing.resolution_note) {
        return res.status(400).json({
          error: 'resolutionNote is required to mark a case verified.',
        });
      }

      update.status = newStatus;
    }

    const updated = await updateBuilderCase(id, ownerInfo.userId, update);
    return res.json({ ok: true, case: updated });
  } catch (err) {
    console.error('[builder-cases/:id/PATCH]', err);
    return res.status(500).json({ error: 'Failed to update builder case.' });
  }
}
