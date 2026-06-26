/**
 * Frontend re-export of platform safety limits.
 * Keep in sync with src/server/lib/limits.ts
 */
export const LIMITS = {
  PHOTOS_PER_JOB: 200,
  PHOTOS_BATCH: 10,
  COST_GUIDE_ITEMS: 200,
  RECIPE_LINES: 100,
  ESTIMATE_LINES: 300,
  FORM_FIELDS: 100,
  FILE_BYTES: 20 * 1024 * 1024,
  CSV_BYTES: 2 * 1024 * 1024,
} as const;
