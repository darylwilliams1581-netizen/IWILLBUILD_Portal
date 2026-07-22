/**
 * GET /api/developer/email-log
 * Platform developer only — paginated email delivery log.
 * Query: ?page=1&limit=50&email=xxx&type=xxx&status=sent|failed
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
    if (!await isPlatformDev(session.user.id, session.user.email ?? '')) {
      return res.status(403).json({ error: 'Platform developer access required.' });
    }

    const page = Math.max(1, parseInt(String(req.query.page ?? '1'), 10));
    const limit = Math.min(100, Math.max(10, parseInt(String(req.query.limit ?? '50'), 10)));
    const offset = (page - 1) * limit;
    const emailFilter = req.query.email ? String(req.query.email).trim() : null;
    const typeFilter = req.query.type ? String(req.query.type).trim() : null;
    const statusFilter = req.query.status ? String(req.query.status).trim() : null;

    type EmailLogRow = {
      id: number;
      email_type: string;
      recipient_email: string;
      recipient_user_id: string | null;
      subject: string | null;
      status: string;
      provider_message_id: string | null;
      error_message: string | null;
      company_id: number | null;
      created_at: string;
    };

    // Build query with parameterized conditions (no sql.raw interpolation)
    const emailPat = emailFilter ? `%${emailFilter}%` : null;

    const [rows] = await db.execute(
      sql`SELECT id, email_type, recipient_email, recipient_user_id, subject, status,
                 provider_message_id, error_message, company_id, created_at
          FROM email_delivery_log
          WHERE (${emailPat} IS NULL OR recipient_email LIKE ${emailPat})
            AND (${typeFilter} IS NULL OR email_type = ${typeFilter})
            AND (${statusFilter} IS NULL OR status = ${statusFilter})
          ORDER BY created_at DESC
          LIMIT ${limit} OFFSET ${offset}`
    ) as unknown as [EmailLogRow[], unknown];

    const [countRows] = await db.execute(
      sql`SELECT COUNT(*) as total FROM email_delivery_log
          WHERE (${emailPat} IS NULL OR recipient_email LIKE ${emailPat})
            AND (${typeFilter} IS NULL OR email_type = ${typeFilter})
            AND (${statusFilter} IS NULL OR status = ${statusFilter})`
    ) as unknown as [Array<{ total: number }>, unknown];

    return res.json({
      logs: rows ?? [],
      total: Number(countRows?.[0]?.total ?? 0),
      page,
      limit,
    });
  } catch (err) {
    console.error('developer/email-log GET error:', err);
    return res.status(500).json({ error: 'Failed to fetch email log.' });
  }
}
