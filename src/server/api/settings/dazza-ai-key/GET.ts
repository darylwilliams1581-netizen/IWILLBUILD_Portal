/**
 * GET /api/settings/dazza-ai-key
 * Returns whether a company OpenAI key is saved — never returns the raw key.
 * Owner only.
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
    if (profile.role !== 'owner') return res.status(403).json({ error: 'Owner only' });

    const [rows] = await db.execute(
      sql`SELECT openai_api_key FROM company_settings WHERE company_id = ${profile.companyId} LIMIT 1`
    ) as unknown as [Array<{ openai_api_key: string | null }>, unknown];

    const key = rows?.[0]?.openai_api_key ?? null;
    const configured = !!(key && key.trim().length > 0);
    // Return masked key hint so UI can show "sk-...abc" without exposing full key
    const maskedKey = configured && key
      ? `${key.slice(0, 7)}...${key.slice(-4)}`
      : null;

    res.json({ configured, maskedKey });
  } catch (error) {
    console.error('GET /api/settings/dazza-ai-key error:', error);
    res.status(500).json({ error: 'Failed to load key status' });
  }
}
