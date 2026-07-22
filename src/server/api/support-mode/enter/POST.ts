/**
 * POST /api/support-mode/enter
 * Body: { companyId: number }
 * Owner only. Stores support context in the server-side session store
 * (we use a simple in-memory map keyed by session token — lightweight,
 * no extra DB table needed, clears on server restart which is fine).
 */
import type { Request, Response } from 'express';
import { db } from '../../../db/client.js';
import { profiles, companies, supportAuditEvents } from '../../../db/schema.js';
import { eq } from 'drizzle-orm';
import { getAuth } from '../../../../lib/auth/auth.js';
import { supportSessionStore } from '../../../support-session-store.js';

export default async function handler(req: Request, res: Response) {
  try {
    const auth = getAuth();
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) {
      if (v) headers.set(k, Array.isArray(v) ? v[0] : v);
    }
    const session = await auth.api.getSession({ headers });
    if (!session?.user) return res.status(401).json({ error: 'Unauthorised' });

    const callerProfile = await db.query.profiles.findFirst({
      where: eq(profiles.userId, session.user.id),
    });
    if (callerProfile?.role !== 'owner') {
      return res.status(403).json({ error: 'Owner access required' });
    }

    const { companyId } = req.body as { companyId: number };
    if (!companyId) return res.status(400).json({ error: 'companyId required' });

    const company = await db.query.companies.findFirst({
      where: eq(companies.id, companyId),
    });
    if (!company) return res.status(404).json({ error: 'Company not found' });

    // Store in session store
    const sessionToken = session.session.token;
    supportSessionStore.set(sessionToken, {
      companyId: company.id,
      companyName: company.name,
      enteredAt: new Date().toISOString(),
    });

    // Audit
    await db.insert(supportAuditEvents).values({
      ownerUserId: session.user.id,
      targetCompanyId: company.id,
      actionType: 'enter_support_mode',
      entityType: 'company',
      entityId: String(company.id),
      summary: `Owner entered support mode for company: ${company.name}`,
      metadataJson: null,
    });

    res.json({ ok: true, companyId: company.id, companyName: company.name });
  } catch (error) {
    console.error('POST /api/support-mode/enter error:', error);
    res.status(500).json({ error: 'Failed to enter support mode' });
  }
}
