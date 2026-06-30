/**
 * Shared HTML escaping utilities for print/PDF templates.
 *
 * Use these whenever inserting user-supplied or database-sourced values into
 * document.write() / innerHTML template strings.  The functions are intentionally
 * simple and dependency-free so they can be imported in both client and server code.
 */

const HTML_ESCAPE_MAP: Record<string, string> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

/**
 * Escape a value for safe insertion as HTML text content.
 * Converts null/undefined to an empty string.
 */
export function escapeHtml(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value).replace(/[&<>"']/g, (c) => HTML_ESCAPE_MAP[c] ?? c);
}

/**
 * Escape a value for safe insertion inside an HTML attribute (already inside quotes).
 * Alias for escapeHtml — same character set is sufficient.
 */
export const escapeAttr = escapeHtml;

/**
 * Coerce to string and escape.  Convenience wrapper used in template literals.
 */
export function safeText(value: unknown): string {
  return escapeHtml(value);
}

/**
 * Validate and return a safe URL for use in src/href attributes.
 * Allows https://, http://, data:image/*, and relative paths.
 * Returns '' for anything else (javascript:, vbscript:, etc.).
 */
export function safeUrl(value: unknown): string {
  if (value === null || value === undefined) return '';
  const s = String(value).trim();
  if (
    s.startsWith('https://') ||
    s.startsWith('http://') ||
    s.startsWith('data:image/') ||
    s.startsWith('/') ||
    s.startsWith('./')
  ) {
    return escapeAttr(s);
  }
  return '';
}
