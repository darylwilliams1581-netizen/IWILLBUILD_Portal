/**
 * DEPRECATED SHIM — do not import this file.
 *
 * sanitiseHtmlServer has been moved to src/server/lib/sanitiseHtmlServer.ts
 * to make its server-only nature explicit in the module path.
 *
 * This shim exists only to produce a clear error if any code accidentally
 * imports from the old location. It intentionally throws rather than
 * silently returning unsanitised content (fail-closed).
 *
 * Import from: src/server/lib/sanitiseHtmlServer.ts
 */

export function sanitiseHtmlServer(_dirty: string): string {
  throw new Error(
    '[sanitiseHtmlServer] This module has moved to src/server/lib/sanitiseHtmlServer.ts. ' +
    'Update your import. This shim intentionally throws to prevent silent sanitisation bypass.',
  );
}
