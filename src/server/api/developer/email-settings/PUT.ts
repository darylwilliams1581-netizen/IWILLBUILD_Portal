/**
 * PUT /api/developer/email-settings
 * Platform developer only — upserts one or more platform email settings.
 * Body: { settings: { contact_notification_email?: string; support_reply_to?: string; from_name?: string } }
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

const ALLOWED_KEYS = new Set(['contact_notification_email', 'support_reply_to', 'from_name']);
const EMAIL_KEYS   = new Set(['contact_notification_email', 'support_reply_to']);

function isValidEmail(v: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
}

export default async function handler(req: Request, res: Response) {
  try {
    const session = await getDevSession(req);
    if (!session?.user) return res.status(401).json({ error: 'Unauthorised' });
    if (!(await isPlatformDev(session.user.id, session.user.email))) {
      return res.status(403).json({ error: 'Developer access required' });
    }

    const { settings } = req.body as { settings?: Record<string, string> };
    if (!settings || typeof settings !== 'object') {
      return res.status(400).json({ error: 'settings object required' });
    }

    const errors: string[] = [];
    const updates: Array<{ key: string; value: string }> = [];

    for (const [key, value] of Object.entries(settings)) {
      if (!ALLOWED_KEYS.has(key)) {
        errors.push(`Unknown setting key: ${key}`);
        continue;
      }
      const v = String(value ?? '').trim();
      if (EMAIL_KEYS.has(key) && v && !isValidEmail(v)) {
        errors.push(`${key}: "${v}" is not a valid email address`);
        continue;
      }
      updates.push({ key, value: v });
    }

    if (errors.length) return res.status(400).json({ error: errors.join('; ') });
    if (!updates.length) return res.status(400).json({ error: 'No valid settings to update' });

    for (const { key, value } of updates) {
      await db.execute(sql`
        INSERT INTO platform_email_settings (setting_key, setting_value, updated_by_user_id)
        VALUES (${key}, ${value}, ${session.user.id})
        ON DUPLICATE KEY UPDATE
          setting_value = VALUES(setting_value),
          updated_by_user_id = VALUES(updated_by_user_id),
          updated_at = CURRENT_TIMESTAMP
      `);
    }

    console.log(`[email-settings] Updated by ${session.user.email}:`, updates.map(u => u.key).join(', '));
    return res.json({ ok: true, updated: updates.map(u => u.key) });
  } catch (err) {
    console.error('PUT /api/developer/email-settings error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
}
