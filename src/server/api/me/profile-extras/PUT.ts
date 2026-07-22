/**
 * PUT /api/me/profile-extras
 * Saves extended profile fields: licenses, notes, emergency contact.
 */
import type { Request, Response } from 'express';
import { db } from '../../../db/client.js';
import { profiles } from '../../../db/schema.js';
import { eq } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
import { getAuth } from '../../../../lib/auth/auth.js';

export default async function handler(req: Request, res: Response) {
  try {
    const auth = getAuth();
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) {
      if (v) headers.set(k, Array.isArray(v) ? v[0] : v);
    }
    const session = await auth.api.getSession({ headers });
    if (!session?.user) return res.status(401).json({ error: 'Unauthorised' });

    const profile = await db.query.profiles.findFirst({ where: eq(profiles.userId, session.user.id) });
    if (!profile) return res.status(404).json({ error: 'Profile not found' });

    const {
      licenses = '',
      profile_notes = '',
      emergency_contact_name = '',
      emergency_contact_phone = '',
    } = req.body as Record<string, string>;

    await db.execute(sql`
      UPDATE profiles SET
        licenses               = ${String(licenses).slice(0, 5000)},
        profile_notes          = ${String(profile_notes).slice(0, 5000)},
        emergency_contact_name = ${String(emergency_contact_name).slice(0, 255)},
        emergency_contact_phone= ${String(emergency_contact_phone).slice(0, 50)}
      WHERE user_id = ${session.user.id}
    `);

    return res.json({ ok: true });
  } catch (err) {
    console.error('PUT /api/me/profile-extras error:', err);
    return res.status(500).json({ error: 'Failed to save profile extras' });
  }
}
