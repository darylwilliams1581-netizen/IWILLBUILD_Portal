import type { Request, Response } from 'express';
import { db } from '../../../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getAuth } from '../../../../../../lib/auth/auth.js';
import { profiles } from '../../../../../db/schema.js';
import { eq } from 'drizzle-orm';
import { createReadStream } from 'node:fs';
import { join } from 'node:path';

const POSTERS_DIR = '/shared-storage/public/assets/safety-posters';

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
    if (!profile?.companyId) return res.status(403).json({ error: 'No company' });

    const id = parseInt(req.params.id, 10);
    const [rows] = await db.execute(
      sql`SELECT * FROM safety_posters WHERE id = ${id} AND company_id = ${profile.companyId}`
    ) as unknown as [Array<Record<string, unknown>>, unknown];

    const poster = rows?.[0];
    if (!poster) return res.status(404).json({ error: 'Not found' });

    const filePath = join(POSTERS_DIR, poster.stored_name as string);
    res.setHeader('Content-Type', poster.mime_type as string);
    res.setHeader('Content-Disposition', `attachment; filename="${poster.original_name}"`);
    createReadStream(filePath).pipe(res);
  } catch (err) {
    console.error('GET /api/safety/posters/:id/download error:', err);
    res.status(500).json({ error: 'Failed to download poster' });
  }
}
