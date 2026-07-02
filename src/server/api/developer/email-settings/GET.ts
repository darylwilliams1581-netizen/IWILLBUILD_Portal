/**
 * GET /api/developer/email-settings
 * Platform developer only — returns all platform email settings.
 */
import type { Request, Response } from 'express';
import { db } from '../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getAuth } from '../../../../lib/auth/auth.js';
import { PLATFORM_OWNER_EMAILS } from '../../../lib/platform-owner-guard.js';

async function getDevSession(req: Request) {
  const auth = getAuth();
  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) {
    if (v) headers.set(k, Array.isArray(v) ? v[0] : v);
  }
  return auth.api.getSession({ headers });
}

async function isPlatformDev(userId: string, email: string): Promise<boolean> {
  if (PLATFORM_OWNER_EMAILS.has(email.toLowerCase())) return true;
  try {
    const [rows] = await db.execute(
      sql`SELECT platform_role FROM profiles WHERE user_id = ${userId} LIMIT 1`
    ) as unknown as [Array<{ platform_role: string | null }>, unknown];
    return rows?.[0]?.platform_role === 'developer';
  } catch { return false; }
}

export default async function handler(req: Request, res: Response) {
  try {
    const session = await getDevSession(req);
    if (!session?.user) return res.status(401).json({ error: 'Unauthorised' });
    if (!(await isPlatformDev(session.user.id, session.user.email))) {
      return res.status(403).json({ error: 'Developer access required' });
    }

    const [rows] = await db.execute(
      sql`SELECT setting_key, setting_value, updated_at FROM platform_email_settings ORDER BY setting_key`
    ) as unknown as [Array<{ setting_key: string; setting_value: string | null; updated_at: string }>, unknown];

    // Return as a flat object for easy consumption
    const settings: Record<string, string> = {};
    for (const row of rows ?? []) {
      settings[row.setting_key] = row.setting_value ?? '';
    }

    return res.json({ settings });
  } catch (err) {
    console.error('GET /api/developer/email-settings error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
}
