/**
 * dazza-builder/index.ts
 * Public API surface for the Dazza Builder Assistant.
 * Import from this file — not from individual modules.
 */

// Types
export type {
  BuilderType,
  BuilderOwnerContext,
  BuilderContext,
  BuilderOperation,
  BuilderApplyRequest,
  BuilderApplyResult,
  ProposedChange,
  BuilderStreamOptions,
} from './types.js';

// Operations
export { validateOperations } from './operations.js';

// Versioning
export { createBuilderVersion, restoreBuilderVersion } from './versioning.js';

// Apply entry point
export { applyBuilderOperations } from './apply.js';

// Stream entry point
export { streamBuilderAssistant } from './orchestrator.js';
