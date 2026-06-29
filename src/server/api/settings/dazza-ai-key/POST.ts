/**
 * POST /api/settings/dazza-ai-key
 * Save or remove the company's own OpenAI API key.
 * Owner only. Body: { key: string } to save, { key: "" } to remove.
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

    const { key } = req.body as { key?: string };
    const trimmedKey = (key ?? '').trim();

    // Validate format if a key is being saved (must start with sk-)
    if (trimmedKey && !trimmedKey.startsWith('sk-')) {
      return res.status(400).json({ error: 'Invalid OpenAI API key format — must start with sk-' });
    }

    const keyToStore = trimmedKey || null;

    // Upsert into company_settings
    await db.execute(
      sql`INSERT INTO company_settings (company_id, openai_api_key)
          VALUES (${profile.companyId}, ${keyToStore})
          ON DUPLICATE KEY UPDATE openai_api_key = ${keyToStore}`
    );

    const configured = !!keyToStore;
    const maskedKey = keyToStore
      ? `${keyToStore.slice(0, 7)}...${keyToStore.slice(-4)}`
      : null;

    console.log(`[dazza-ai-key] Company ${profile.companyId} key ${configured ? 'saved' : 'removed'}`);
    res.json({ ok: true, configured, maskedKey });
  } catch (error) {
    console.error('POST /api/settings/dazza-ai-key error:', error);
    res.status(500).json({ error: 'Failed to save key' });
  }
}
