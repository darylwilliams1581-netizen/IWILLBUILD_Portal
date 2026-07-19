/**
 * GET /api/me/profile-extras
 * Returns the extended profile fields: licenses, notes, emergency contact, attachments.
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

    // Read extra columns via raw SQL (late-added, not in Drizzle schema)
    const [rows] = await db.execute(
      sql`SELECT licenses, profile_notes, emergency_contact_name, emergency_contact_phone, profile_attachments
          FROM profiles WHERE user_id = ${session.user.id} LIMIT 1`
    ) as unknown as [Array<Record<string, unknown>>, unknown];

    const row = rows?.[0] ?? {};
    let attachments: unknown[] = [];
    try {
      const raw = row.profile_attachments;
      if (raw && typeof raw === 'string') attachments = JSON.parse(raw) as unknown[];
    } catch { /* ignore */ }

    return res.json({
      licenses:              row.licenses ?? '',
      profile_notes:         row.profile_notes ?? '',
      emergency_contact_name:  row.emergency_contact_name ?? '',
      emergency_contact_phone: row.emergency_contact_phone ?? '',
      attachments,
    });
  } catch (err) {
    console.error('GET /api/me/profile-extras error:', err);
    return res.status(500).json({ error: 'Failed to load profile extras' });
  }
}
