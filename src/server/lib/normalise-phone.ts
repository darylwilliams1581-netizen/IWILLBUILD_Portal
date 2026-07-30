/**
 * normalisePhone — ensure a phone number is in E.164 format.
 *
 * The frontend PhoneInput component always emits E.164 (+countryDialLocalNumber),
 * so this is primarily a safety net for direct API calls or legacy stored values.
 *
 * Supported local-format fallbacks (no leading +):
 *   Australia  04xx xxxxxxx  (10 digits, starts with 04)  →  +614xxxxxxxx
 *   New Zealand  02x xxxxxxx/xxxxxxxx  (9-10 digits, starts with 02)  →  +642xxxxxxx
 *
 * Everything else starting with 0 is left as-is — Twilio will surface a clear error
 * rather than silently misrouting to the wrong country.
 */
export function normalisePhone(raw: string): string {
  const stripped = raw.trim().replace(/[\s\-().]/g, '');

  // Already E.164
  if (stripped.startsWith('+')) return stripped;

  // Australian mobile: 04xx xxxxxxx (10 digits)
  if (/^04\d{8}$/.test(stripped)) {
    return `+61${stripped.slice(1)}`;
  }

  // New Zealand mobile: 02x xxxxxxx or 02x xxxxxxxx (9–10 digits)
  if (/^02\d{7,8}$/.test(stripped)) {
    return `+64${stripped.slice(1)}`;
  }

  // Unknown — return as-is
  return stripped;
}
