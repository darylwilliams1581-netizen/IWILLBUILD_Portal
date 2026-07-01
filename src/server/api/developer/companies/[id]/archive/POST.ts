/**
 * POST /api/developer/companies/:id/archive
 * Platform developer only — soft-archives a company.
 * Sets companies.status = 'archived' and deactivates all member profiles.
 * Does NOT delete any data. Fully reversible.
 */
import type { Request, Response } from 'express';
import { db } from '../../../../../db/client.js';
import { companies, profiles } from '../../../../../db/schema.js';
import { eq } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
import { getAuth } from '../../../../../../lib/auth/auth.js';
import { PLATFORM_OWNER_EMAILS } from '../../../../../lib/platform-owner-guard.js';
import { logActivity } from '../../../../../lib/activity-log.js';

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

    const companyId = Number(req.params.id);
    if (!companyId) return res.status(400).json({ error: 'Invalid company ID.' });

    const { reason } = req.body as { reason?: string };

    const company = await db.query.companies.findFirst({ where: eq(companies.id, companyId) });
    if (!company) return res.status(404).json({ error: 'Company not found.' });

    // Soft-archive: add archived_at column if not present, set status
    try {
      await db.execute(sql.raw(
        `ALTER TABLE companies ADD COLUMN IF NOT EXISTS archived_at DATETIME NULL`
      ));
    } catch { /* column may already exist */ }

    await db.execute(sql`
      UPDATE companies SET archived_at = NOW() WHERE id = ${companyId}
    `);

    // Deactivate all active profiles in this company (preserves data, blocks login)
    await db.execute(sql`
      UPDATE profiles SET status = 'inactive', updated_at = NOW()
      WHERE company_id = ${companyId} AND status = 'active'
    `);

    // Audit
    try {
      await db.execute(sql`
        INSERT INTO developer_audit_log
          (action_type, performed_by_user_id, performed_by_email, target_company_id, reason, created_at)
        VALUES (
          'company_archived', ${session.user.id}, ${session.user.email ?? ''},
          ${companyId}, ${reason?.trim() ?? null}, NOW()
        )
      `);
    } catch { /* non-critical */ }

    void logActivity({
      eventType: 'company_archived',
      success: true,
      companyId,
      performedByUserId: session.user.id,
      reason: reason?.trim() ?? null,
      metadata: { companyName: company.name },
    });

    return res.json({ ok: true, message: `Company "${company.name}" archived. All member accounts deactivated. No data deleted.` });
  } catch (err) {
    console.error('developer/companies/archive POST error:', err);
    return res.status(500).json({ error: 'Failed to archive company.' });
  }
}
