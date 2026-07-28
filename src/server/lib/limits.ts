/**
 * Platform safety limits — single source of truth.
 * Import from here in both API handlers and (via re-export in src/lib/) the frontend.
 */

export const LIMITS = {
  /** Max photos stored per job */
  PHOTOS_PER_JOB: 200,

  /** Max files per upload batch (multer files: N) */
  PHOTOS_BATCH: 10,

  /** Max cost guide items per company */
  COST_GUIDE_ITEMS: 200,

  /** Max lines per recipe */
  RECIPE_LINES: 100,

  /** Max lines per estimate */
  ESTIMATE_LINES: 300,

  /** Max fields per form template */
  FORM_FIELDS: 100,

  /** Max file upload size in bytes (20 MB) */
  FILE_BYTES: 20 * 1024 * 1024,

  /** Max CSV import size in bytes (2 MB) */
  CSV_BYTES: 2 * 1024 * 1024,
} as const;

export type LimitKey = keyof typeof LIMITS;
