/**
 * PUT /api/owner-console/companies/:id/limits
 * Set custom plan limits for a company (platform owner only).
 * Access enforced by requirePlatformOwner middleware in entry.ts.
 * Stores overrides in company_settings.custom_limits_json.
 */
import type { Request, Response } from 'express';
import { db } from '../../../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getAuth } from '../../../../../../lib/auth/auth.js';

export default async function handler(req: Request, res: Response) {
  try {
    const auth = getAuth();
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) {
      if (v) headers.set(k, Array.isArray(v) ? v[0] : v);
    }
    const session = await auth.api.getSession({ headers });
    if (!session?.user) return res.status(401).json({ error: 'Unauthorised' });
    // Platform owner check handled by requirePlatformOwner middleware in entry.ts

    const targetCompanyId = parseInt(String(req.params.id), 10);
    if (isNaN(targetCompanyId)) return res.status(400).json({ error: 'Invalid company ID' });

    const { limits } = req.body as { limits: Record<string, number> };
    if (!limits || typeof limits !== 'object') {
      return res.status(400).json({ error: 'limits object required' });
    }

    // Validate — only allow known limit keys, all must be positive integers
    const ALLOWED_KEYS = ['users', 'activeJobs', 'totalPhotos', 'storageBytes', 'costGuideItems', 'formTemplates', 'fleetAssets'];
    const sanitised: Record<string, number> = {};
    for (const key of ALLOWED_KEYS) {
      if (key in limits) {
        const v = Number(limits[key]);
        if (!isNaN(v) && v >= 0) sanitised[key] = Math.floor(v);
      }
    }

    const json = JSON.stringify(sanitised);
    await db.execute(sql`
      INSERT INTO company_settings (company_id, custom_limits_json)
      VALUES (${targetCompanyId}, ${json})
      ON DUPLICATE KEY UPDATE custom_limits_json = ${json}
    `);

    res.json({ ok: true, limits: sanitised });
  } catch (error) {
    console.error('PUT /api/owner-console/companies/:id/limits error:', error);
    res.status(500).json({ error: 'Failed to set custom limits' });
  }
}
