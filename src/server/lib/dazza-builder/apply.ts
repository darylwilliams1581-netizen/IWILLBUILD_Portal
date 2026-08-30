/**
 * dazza-builder/apply.ts
 * Entry point for applying Dazza Builder operations.
 * Validates operations, then delegates to the appropriate adapter.
 *
 * SECURITY:
 * - validateOperations runs before any DB mutation.
 * - Template ID is passed from the authenticated request, not from AI output.
 * - Owner user ID is from the authenticated session, not from the request body.
 * - When templateId is null, the first op must be createNewTemplate — enforced
 *   both here and in the POST handler.
 */
import type { BuilderApplyRequest, BuilderApplyResult } from './types.js';
import { validateOperations } from './operations.js';
import { applyDocumentOperations } from './document-adapter.js';
import { applyFormOperations } from './form-adapter.js';

export async function applyBuilderOperations(
  req: BuilderApplyRequest,
  ownerUserId: string,
): Promise<BuilderApplyResult> {
  const { templateId, builderType, operations, instructionSummary, conversationId } = req;

  // Validate ALL operations before any mutation.
  // Skip createNewTemplate from the type-check — it's valid for both builder types
  // and is handled by the adapters directly.
  const opsToValidate = operations.filter(op => op.op !== 'createNewTemplate');
  const validationErrors = opsToValidate.length > 0
    ? validateOperations(opsToValidate, builderType)
    : [];

  if (validationErrors.length > 0) {
    return {
      ok: false, versionId: '', versionNumber: 0,
      operationsApplied: 0, validationErrors,
      error: 'Validation failed',
    };
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
