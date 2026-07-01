/**
 * POST /api/owner-console/starter-pack
 * Owner-only: manually trigger starter pack seeding for a company.
 * Idempotent — respects the once-only guard unless force=true is passed.
 */
import type { Request, Response } from 'express';
import { db } from '../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getAuth } from '../../../../lib/auth/auth.js';
import { profiles } from '../../../db/schema.js';
import { eq } from 'drizzle-orm';
import { seedStarterPack } from '../../../lib/seed-starter-pack.js';

export default async function handler(req: Request, res: Response) {
  try {
    // ── Auth: owner only ──────────────────────────────────────────────────────
    const auth = getAuth();
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) {
      if (v) headers.set(k, Array.isArray(v) ? v[0] : v);
    }
    const session = await auth.api.getSession({ headers });
    if (!session?.user) return res.status(401).json({ error: 'Unauthorised' });

    const profile = await db.query.profiles.findFirst({ where: eq(profiles.userId, session.user.id) });
    if (profile?.role !== 'owner') return res.status(403).json({ error: 'Owner access required' });

    const { companyId, force } = req.body as { companyId?: number; force?: boolean };
    if (!companyId || typeof companyId !== 'number') {
      return res.status(400).json({ error: 'companyId is required' });
    }

    // ── If force=true, reset the guard so seeding runs again ─────────────────
    if (force) {
      try {
        await db.execute(sql`
          UPDATE companies
          SET starter_pack_loaded = 0, starter_pack_loaded_at = NULL
          WHERE id = ${companyId}
        `);
      } catch (e) {
        console.warn('[starter-pack] Could not reset guard:', String(e));
      }
    }

    const result = await seedStarterPack(companyId, session.user.id);

    return res.json({
      ok: result.ok,
      alreadyLoaded: result.alreadyLoaded,
      sections: result.sections,
      errors: result.errors,
      message: result.alreadyLoaded && !force
        ? 'Starter pack was already loaded for this company. Use force=true to re-run.'
        : result.errors.length > 0
          ? `Seeding completed with ${result.errors.length} error(s).`
          : 'Starter pack loaded successfully.',
    });
  } catch (err) {
    console.error('POST /api/owner-console/starter-pack error:', err);
    return res.status(500).json({ error: 'Failed to load starter pack' });
  }
}
