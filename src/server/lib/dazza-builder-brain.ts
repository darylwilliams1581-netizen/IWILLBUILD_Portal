/**
 * dazza-builder-brain.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Compatibility shim — re-exports from the split dazza-builder/ modules.
 *
 * The implementation has been split into focused modules under:
 *   src/server/lib/dazza-builder/
 *     types.ts          — shared TypeScript types
 *     operations.ts     — validateOperations, buildBlock, sanitiseBlockUpdate
 *     document-adapter.ts — applyDocumentOperations
 *     form-adapter.ts   — applyFormOperations
 *     versioning.ts     — createBuilderVersion, restoreBuilderVersion
 *     audit.ts          — auditBuilder
 *     conversation.ts   — loadHistory, saveMessage
 *     context.ts        — buildSystemPrompt, BUILDER_TOOL_DEFINITIONS
 *     orchestrator.ts   — streamBuilderAssistant (main SSE loop)
 *     apply.ts          — applyBuilderOperations (entry point)
 *     index.ts          — public API surface
 *
 * Existing imports of this file continue to work unchanged.
 * New code should import from 'dazza-builder/index.js' directly.
 */

export type {
  BuilderType,
  BuilderOwnerContext,
  BuilderContext,
  BuilderOperation,
  BuilderApplyRequest,
  BuilderApplyResult,
  ProposedChange,
  BuilderStreamOptions,
} from './dazza-builder/types.js';

export { validateOperations } from './dazza-builder/operations.js';
export { createBuilderVersion, restoreBuilderVersion } from './dazza-builder/versioning.js';
export { applyBuilderOperations } from './dazza-builder/apply.js';
export { streamBuilderAssistant } from './dazza-builder/orchestrator.js';
