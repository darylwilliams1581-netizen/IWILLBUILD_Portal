/**
 * string-scanners.ts
 * Pure linear string scanners replacing regex patterns flagged by
 * security/detect-unsafe-regex. Every function runs in O(n) time with no
 * backtracking, no nested quantifiers, and no regex on untrusted input.
 */

// ── File API URL validation ───────────────────────────────────────────────────

/**
 * Returns true when `url` is a valid app file-API path:
 *   /api/files/<numeric-id>/<alpha-type>[?<query>]
 *
 * Replaces: /^\/api\/files\/\d+\/[a-z]+(\?.*)?$/
 * Used by: photo-url-utils.ts, form-pdf-document.ts
 */
export function isFileApiUrl(url: unknown): url is string {
  if (!url || typeof url !== 'string') return false;
  const s = url.trim();

  const PREFIX = '/api/files/';
  if (!s.startsWith(PREFIX)) return false;

  let pos = PREFIX.length;

  // One or more decimal digits (numeric file id)
  if (pos >= s.length) return false;
  const idStart = pos;
  while (pos < s.length) {
    const c = s.charCodeAt(pos);
    if (c < 48 || c > 57) break;
    pos++;
  }
  if (pos === idStart) return false;

  // Slash separator
  if (pos >= s.length || s.charCodeAt(pos) !== 47) return false;
  pos++;

  // One or more lowercase alpha chars (type segment)
  if (pos >= s.length) return false;
  const typeStart = pos;
  while (pos < s.length) {
    const c = s.charCodeAt(pos);
    if (c < 97 || c > 122) break;
    pos++;
  }
  if (pos === typeStart) return false;

  // End of string, or '?' starting query string
  if (pos === s.length) return true;
  if (s.charCodeAt(pos) === 63) return true;

  return false;
}

// ── RL (Reduced Level) value validation ──────────────────────────────────────

/**
 * Returns true when `value` (trimmed) is a valid RL string:
 *   optional minus, one+ digits, optional dot + 1-3 digits, nothing else.
 *
 * Replaces: /^-?\d+(\.\d{1,3})?$/
 * Used by: rl-calc.ts
 */
export function isValidRLValue(value: string): boolean {
  const s = value.trim();
  if (s.length === 0) return false;

  let pos = 0;

  // Optional leading minus
  if (s.charCodeAt(0) === 45) pos++;

  // One or more integer digits
  const intStart = pos;
  while (pos < s.length) {
    const c = s.charCodeAt(pos);
    if (c < 48 || c > 57) break;
    pos++;
  }
  if (pos === intStart) return false;

  // Optional decimal part
  if (pos < s.length && s.charCodeAt(pos) === 46) {
    pos++;
    const fracStart = pos;
    while (pos < s.length) {
      const c = s.charCodeAt(pos);
      if (c < 48 || c > 57) break;
      pos++;
    }
    const fracLen = pos - fracStart;
    if (fracLen < 1 || fracLen > 3) return false;
  }

  return pos === s.length;
}

// ── Leading emoji extraction ──────────────────────────────────────────────────

/**
 * Returns the first Unicode code point from `head` if it is an emoji in the
 * ranges used by the app's markdown renderer, otherwise returns ''.
 *
 * Ranges: U+1F300-U+1FFFF, U+2600-U+27BF, U+1F004, U+1F0CF
 *
 * Replaces: /^[\u{1F300}-\u{1FFFF}\u2600-\u27BF\u{1F004}\u{1F0CF}]/u
 * Used by: annette.tsx, owner-console.tsx
 *
 * `head` must be a short prefix (caller bounds to 8 chars).
 */
export function extractLeadingEmoji(head: string): string {
  if (!head) return '';
  const cp = head.codePointAt(0);
  if (cp === undefined) return '';

  if (
    (cp >= 0x1F300 && cp <= 0x1FFFF) ||
    (cp >= 0x2600  && cp <= 0x27BF)  ||
    cp === 0x1F004 ||
    cp === 0x1F0CF
  ) {
    return String.fromCodePoint(cp);
  }

  return '';
}
