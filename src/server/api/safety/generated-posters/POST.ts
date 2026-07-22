import type { Request, Response } from 'express';
import { db } from '../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getAuth } from '../../../../lib/auth/auth.js';
import { profiles } from '../../../db/schema.js';
import { eq } from 'drizzle-orm';
import type { ResultSetHeader } from 'mysql2';

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

    const { posterType, title, data } = req.body as {
      posterType?: string;
      title?: string;
      data?: Record<string, unknown>;
    };

    if (!posterType || !title) return res.status(400).json({ error: 'posterType and title are required' });

    const [result] = await db.execute(sql`
      INSERT INTO safety_generated_posters (company_id, poster_type, title, data_json, created_by_user_id)
      VALUES (${profile.companyId}, ${posterType}, ${title}, ${JSON.stringify(data ?? {})}, ${session.user.id})
    `) as unknown as [ResultSetHeader, unknown];

    const [rows] = await db.execute(
      sql`SELECT * FROM safety_generated_posters WHERE id = ${result.insertId}`
    ) as unknown as [Array<Record<string, unknown>>, unknown];

    res.status(201).json({ poster: rows?.[0] ?? null });
  } catch (err) {
    console.error('POST /api/safety/generated-posters error:', err);
    res.status(500).json({ error: 'Failed to save poster' });
  }
}
