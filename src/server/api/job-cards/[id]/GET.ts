/**
 * GET /api/job-cards/:id
 * Return a single Job Card with its materials and photos.
 */
import type { Request, Response } from 'express';
import { db } from '../../../db/client.js';
import { profiles } from '../../../db/schema.js';
import { eq, sql } from 'drizzle-orm';
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

    const profile = await db.query.profiles.findFirst({
      where: eq(profiles.userId, session.user.id),
    });
    if (!profile?.companyId) return res.status(403).json({ error: 'No company' });

    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid id' });

    const [rows] = await db.execute(sql`
      SELECT jc.*,
             c.name AS customer_name,
             c.phone AS customer_phone,
             c.email AS customer_email,
             c.address AS customer_address
      FROM job_cards jc
      LEFT JOIN customers c ON c.id = jc.customer_id
      WHERE jc.id = ${id} AND jc.company_id = ${profile.companyId}
    `) as unknown as [Array<Record<string, unknown>>, unknown];

    if (!rows?.length) return res.status(404).json({ error: 'Job card not found' });

    const [matRows] = await db.execute(
      sql`SELECT * FROM job_card_materials WHERE job_card_id = ${id} ORDER BY id ASC`
    ) as unknown as [Array<Record<string, unknown>>, unknown];

    const [photoRows] = await db.execute(
      sql`SELECT * FROM job_card_photos WHERE job_card_id = ${id} ORDER BY id ASC`
    ) as unknown as [Array<Record<string, unknown>>, unknown];

    res.json({
      jobCard: {
        ...rows[0],
        materials: matRows ?? [],
        photos: photoRows ?? [],
      },
    });
  } catch (err) {
    console.error('GET /api/job-cards/:id error:', err);
    res.status(500).json({ error: 'Failed to fetch job card' });
  }
}
