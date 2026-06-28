/**
 * plan-limits.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Single source of truth for per-plan resource limits.
 *
 * Usage:
 *   import { getPlanLimits, checkLimit, HARD_LIMITS } from './plan-limits.js';
 *
 * Hard limits apply regardless of plan (safety caps).
 * Plan limits are per-company and scale with the subscription tier.
 * Custom limits can be stored in company_settings.custom_limits_json and
 * override the plan defaults for that company.
 */

import { db } from '../db/client.js';
import { sql } from 'drizzle-orm';

// ── Hard safety limits (never overrideable) ───────────────────────────────────

export const HARD_LIMITS = {
  PHOTOS_PER_JOB:    200,   // max photos stored per individual job
  PHOTOS_BATCH:       10,   // max photos per upload batch
  ESTIMATE_LINES:    300,   // max lines per estimate
  RECIPE_LINES:      100,   // max lines per recipe
  FORM_FIELDS:       150,   // max fields per form template
} as const;

// ── Plan limit definitions ────────────────────────────────────────────────────

export interface PlanLimits {
  users:           number;
  activeJobs:      number;
  totalPhotos:     number;
  storageBytes:    number;   // total file storage in bytes
  costGuideItems:  number;
  formTemplates:   number;
  fleetAssets:     number;
}

const GB = 1024 * 1024 * 1024;

const PLAN_LIMITS: Record<string, PlanLimits> = {
  trial: {
    users:          2,
    activeJobs:     5,
    totalPhotos:    200,
    storageBytes:   0.5 * GB,
    costGuideItems: 50,
    formTemplates:  10,
    fleetAssets:    3,
  },
  solo: {
    users:          1,
    activeJobs:     10,
    totalPhotos:    500,
    storageBytes:   1 * GB,
    costGuideItems: 200,
    formTemplates:  20,
    fleetAssets:    5,
  },
  team: {
    users:          5,
    activeJobs:     50,
    totalPhotos:    2500,
    storageBytes:   5 * GB,
    costGuideItems: 500,
    formTemplates:  50,
    fleetAssets:    25,
  },
  business: {
    users:          10,
    activeJobs:     150,
    totalPhotos:    10000,
    storageBytes:   20 * GB,
    costGuideItems: 1000,
    formTemplates:  150,
    fleetAssets:    100,
  },
  // legacy alias
  pro: {
    users:          10,
    activeJobs:     150,
    totalPhotos:    10000,
    storageBytes:   20 * GB,
    costGuideItems: 1000,
    formTemplates:  150,
    fleetAssets:    100,
  },
  enterprise: {
    users:          9999,
    activeJobs:     9999,
    totalPhotos:    999999,
    storageBytes:   500 * GB,
    costGuideItems: 9999,
    formTemplates:  9999,
    fleetAssets:    9999,
  },
  // owner = platform owner, no limits
  owner: {
    users:          9999,
    activeJobs:     9999,
    totalPhotos:    999999,
    storageBytes:   500 * GB,
    costGuideItems: 9999,
    formTemplates:  9999,
    fleetAssets:    9999,
  },
};

/**
 * Get the effective plan limits for a company.
 * Checks company_settings for custom_limits_json overrides first.
 * Falls back to plan defaults, then trial defaults.
 */
export async function getPlanLimits(companyId: number, plan: string): Promise<PlanLimits> {
  const base: PlanLimits = PLAN_LIMITS[plan] ?? PLAN_LIMITS['trial'];

  // Check for custom limits override in company_settings
  try {
    const [rows] = await db.execute(
      sql`SELECT custom_limits_json FROM company_settings WHERE companyId = ${companyId} LIMIT 1`
    ) as unknown as [Array<{ custom_limits_json: string | null }>, unknown];

    const raw = rows?.[0]?.custom_limits_json;
    if (raw) {
      const custom = JSON.parse(raw) as Partial<PlanLimits>;
      return { ...base, ...custom };
    }
  } catch {
    // company_settings may not have the column yet — fall through to base
  }

  return base;
}

/**
 * Get plan limits synchronously from the plan name only (no DB lookup).
 * Use this when you don't need custom overrides (e.g. display purposes).
 */
export function getPlanLimitsSync(plan: string): PlanLimits {
  return PLAN_LIMITS[plan] ?? PLAN_LIMITS['trial'];
}

/**
 * Check whether a company is at or over a specific limit.
 * Returns { allowed: true } or { allowed: false, code, message }.
 */
export function checkLimit(
  current: number,
  limit: number,
  resourceName: string,
): { allowed: true } | { allowed: false; code: string; message: string } {
  if (current >= limit) {
    return {
      allowed: false,
      code: 'limit_reached',
      message: `Your plan limit has been reached (${resourceName}: ${limit}). Upgrade your plan or remove/archive old items.`,
    };
  }
  return { allowed: true };
}

/**
 * Get the company's current plan from the DB.
 * Returns 'trial' if not found.
 */
export async function getCompanyPlan(companyId: number): Promise<string> {
  try {
    const [rows] = await db.execute(
      sql`SELECT plan FROM companies WHERE id = ${companyId} LIMIT 1`
    ) as unknown as [Array<{ plan: string }>, unknown];
    return rows?.[0]?.plan ?? 'trial';
  } catch {
    return 'trial';
  }
}

export { PLAN_LIMITS };
