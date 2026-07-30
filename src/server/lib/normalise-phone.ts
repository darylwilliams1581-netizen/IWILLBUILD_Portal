/**
 * normalisePhone — convert a local-format mobile number to E.164.
 *
 * Supported local formats:
 *   Australia  04xx xxx xxx  →  +614xxxxxxxx  (country code +61)
 *   New Zealand  02x xxx xxxx  →  +642xxxxxxxx  (country code +64)
 *
 * Numbers already in E.164 (starting with +) are returned unchanged.
 * Anything else is returned as-is and Twilio will reject it with a clear error.
 *
 * Spaces and hyphens are stripped before matching.
 */
export function normalisePhone(raw: string): string {
  const stripped = raw.trim().replace(/[\s\-]/g, '');

  // Already E.164
  if (stripped.startsWith('+')) return stripped;

  // Australian mobile: 04xx xxxxxxx  (10 digits starting with 04)
  if (/^04\d{8}$/.test(stripped)) {
    return `+61${stripped.slice(1)}`; // drop leading 0, prepend +61
  }

  // New Zealand mobile: 02x xxxxxxx  (9–10 digits starting with 02)
  if (/^02\d{7,8}$/.test(stripped)) {
    return `+64${stripped.slice(1)}`; // drop leading 0, prepend +64
  }

  // Unknown format — return as-is; Twilio will surface a clear error
  return stripped;
}
