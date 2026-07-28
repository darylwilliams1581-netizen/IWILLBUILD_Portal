/**
 * drayl/persona.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Dazza persona helpers — opening lines and smart follow-up suggestions.
 */

/**
 * Returns a Dazza-style opening line.
 * @param brief - if true, returns a short one-liner; otherwise a fuller greeting
 */
export function dazzaOpening(brief = false): string {
  if (brief) return "G'day — Dazza here.";
  return "G'day! Dazza here — your IWILLBUILD site intelligence. What do you need?";
}

/**
 * Smart follow-up suggestions shown after a Dazza response.
 */
export const DAZZA_SMART_FOLLOW_UPS: string[] = [
  'Run Annette health check',
  'What jobs are overdue?',
  'Any fleet service due?',
  'Show open to-dos',
  'Any missing SWMS?',
  'How many active jobs?',
  'Any prestart issues?',
];
