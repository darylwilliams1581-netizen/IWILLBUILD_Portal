import type { Request, Response } from 'express';
import { db } from '../../../db/client.js';
import { profiles, companies, supportAuditEvents } from '../../../db/schema.js';
import { eq, sql } from 'drizzle-orm';
import { getAuth } from '../../../../lib/auth/auth.js';
import { DEFAULT_CHECKLIST } from '../../../support-checklist.js';

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

    const { companyId, itemId, completed } = req.body as {
      companyId: number;
      itemId: string;
      completed: boolean;
    };
    if (!companyId || !itemId) return res.status(400).json({ error: 'companyId and itemId required' });

    const company = await db.query.companies.findFirst({
      where: eq(companies.id, companyId),
    });
    if (!company) return res.status(404).json({ error: 'Company not found' });

    // Load current checklist
    let checklist = DEFAULT_CHECKLIST.map((item) => ({ ...item }));
    const stored = (company as unknown as { setupChecklistJson?: string }).setupChecklistJson;
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as typeof checklist;
        checklist = DEFAULT_CHECKLIST.map((def) => {
          const found = parsed.find((s) => s.id === def.id);
          return found ? { ...def, completed: found.completed } : { ...def };
        });
      } catch { /* use defaults */ }
    }

    // Update the item
    const item = checklist.find((i) => i.id === itemId);
    if (!item) return res.status(404).json({ error: 'Checklist item not found' });
    item.completed = completed;

    // Save back
    await db.execute(
      sql`UPDATE companies SET setup_checklist_json = ${JSON.stringify(checklist)} WHERE id = ${companyId}`
    );

    // Audit
    await db.insert(supportAuditEvents).values({
      ownerUserId: session.user.id,
      targetCompanyId: companyId,
      actionType: 'update_setup_checklist',
      entityType: 'checklist_item',
      entityId: itemId,
      summary: `Marked "${item.label}" as ${completed ? 'complete' : 'incomplete'} for company ${company.name}`,
      metadataJson: null,
    });

    res.json({ ok: true });
  } catch (error) {
    console.error('PUT /api/support-mode/checklist error:', error);
    res.status(500).json({ error: 'Failed to update checklist' });
  }
}
