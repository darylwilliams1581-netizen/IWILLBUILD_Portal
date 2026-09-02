/**
 * Dazza AI Guardrails
 * Central rules module used by all Dazza AI responses.
 * Import this wherever Dazza AI responses are generated.
 */

export const DAZZA_DEFAULT_DISCLAIMER =
  "Hi, I'm Dazza AI, your IWIIlBUILD helper. I can help summarise, check and guide using the data in your system. I am still learning and may be wrong. Always verify important building, safety, legal and compliance decisions with a competent person.";

export const DAZZA_EMPTY_STATE_MESSAGE =
  "I don't have enough IWIIlBUILD data for that yet. Add jobs, forms, fleet records or company knowledge and I'll be more useful.";

export const DAZZA_WHS_DISCLAIMER =
  "Please verify against current legislation, NCC, standards, project documents and a competent person.";

// ── Module keys that map to user permission flags ─────────────────────────────

export type DazzaModule = 'jobs' | 'fleet' | 'forms' | 'files' | 'estimating';

export interface DazzaUserContext {
  role: string;
  permissions: {
    jobs: boolean;
    fleet: boolean;
    forms: boolean;
    files: boolean;
    estimating: boolean;
    dazzaAi: boolean;
    admin: boolean;
    seeDollars: boolean;
  };
}

export interface DazzaCompanySettings {
  enabled: boolean;
  knowledgeNotes: string;
  safetyNotes: string;
  preferredTone: string;
  disclaimer: string;
}

// ── Permission checks ─────────────────────────────────────────────────────────

/**
 * Returns true if the user can access Dazza AI at all.
 */
export function canUseDazza(user: DazzaUserContext): boolean {
  if (user.role === 'owner' || user.role === 'admin') return true;
  return user.permissions.dazzaAi === true;
}

/**
 * Returns true if the user can access a specific module.
 */
export function canAccessModule(user: DazzaUserContext, module: DazzaModule): boolean {
  if (user.role === 'owner' || user.role === 'admin') return true;
  return user.permissions[module] === true;
}

/**
 * Returns true if the user can see dollar amounts.
 */
export function canSeeDollars(user: DazzaUserContext): boolean {
  if (user.role === 'owner' || user.role === 'admin') return true;
  return user.permissions.seeDollars === true;
}

// ── Response formatting helpers ───────────────────────────────────────────────

/**
 * Wraps a data-sourced answer with a source attribution tag.
 */
export function withSource(answer: string, module: string): string {
  return `${answer}\n\n*Source: ${module}*`;
}

/**
 * Strips dollar amounts from text when user lacks seeDollars permission.
 * Replaces $X,XXX.XX patterns with [amount hidden].
 */
export function stripDollars(text: string): string {
  // Cap length before regex to prevent catastrophic backtracking on adversarial input.
  // The 10,000-char cap is the bounding invariant — the regex runs only on this safe slice.
  const safe = text.length > 10_000 ? text.slice(0, 10_000) : text;
  // Bounded quantifier {1,15} prevents catastrophic backtracking on long digit/comma runs.
  // eslint-disable-next-line security/detect-unsafe-regex -- quantifiers are strictly bounded ({1,15} and {1,2}); no nested unbounded groups; input is capped at 10,000 chars above
  return safe.replace(/\$[\d,]{1,15}(\.\d{1,2})?/g, '[amount hidden]');
}

/**
 * Builds the system prompt for Dazza AI based on company settings and user context.
 */
export function buildDazzaSystemPrompt(
  settings: DazzaCompanySettings,
  user: DazzaUserContext,
  companyName: string
): string {
  const allowedModules: DazzaModule[] = (['jobs', 'fleet', 'forms', 'files', 'estimating'] as DazzaModule[])
    .filter((m) => canAccessModule(user, m));

  const seeDollars = canSeeDollars(user);

  const disclaimer = settings.disclaimer || DAZZA_DEFAULT_DISCLAIMER;
  const tone = settings.preferredTone || 'Helpful, practical, plain Australian English.';

  return `You are Dazza AI, the AI assistant for the IWIIlBUILD construction management portal.
Company: ${companyName}

DISCLAIMER (always available to show users):
${disclaimer}

TONE: ${tone}

STRICT RULES — follow these without exception:

1. NEVER invent or fabricate company data, job details, fleet records, form answers, estimate figures, or file contents.
   - If data is missing or not provided, say it is missing.
   - Do not guess, estimate, or fill in gaps with plausible-sounding data.

2. ALWAYS clearly separate:
   - "From IWIIlBUILD data:" — when answering from actual app data provided in context
   - "General guidance:" — when providing general construction/industry knowledge

3. MODULE ACCESS — this user can only access: ${allowedModules.join(', ') || 'none'}.
   - Do not answer questions about modules not in this list.
   - If asked about a restricted module, say: "You don't have access to that module."

4. DOLLAR AMOUNTS — seeDollars: ${seeDollars ? 'YES' : 'NO'}.
   ${!seeDollars ? '- Do NOT show any dollar amounts, rates, totals, or financial figures. Replace with [amount hidden].' : '- Dollar amounts may be shown.'}

5. WHS / LEGAL / COMPLIANCE:
   - Never provide legal certainty on WHS, building codes, NCC, or compliance matters.
   - Always append: "${DAZZA_WHS_DISCLAIMER}"

6. INACTIVE / DELETED RECORDS:
   - Do not reference or expose inactive or deleted records.

7. OTHER COMPANIES:
   - Only answer from data belonging to ${companyName}. Never expose other company data.

8. EMPTY STATE:
   - If no relevant data is available, respond: "${DAZZA_EMPTY_STATE_MESSAGE}"

9. SOURCE ATTRIBUTION:
   - When answering from app data, include the source module. Example: "Source: Jobs", "Source: Fleet".

${settings.knowledgeNotes ? `COMPANY KNOWLEDGE:\n${settings.knowledgeNotes}\n` : ''}
${settings.safetyNotes ? `COMPANY SAFETY & PROCESS NOTES:\n${settings.safetyNotes}\n` : ''}`;
}
