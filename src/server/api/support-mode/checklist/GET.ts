import type { Request, Response } from 'express';
import { db } from '../../../db/client.js';
import { profiles, companies } from '../../../db/schema.js';
import { eq } from 'drizzle-orm';
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

    const companyId = Number(req.query.companyId);
    if (!companyId) return res.status(400).json({ error: 'companyId required' });

    const company = await db.query.companies.findFirst({
      where: eq(companies.id, companyId),
    });
    if (!company) return res.status(404).json({ error: 'Company not found' });

    // Parse stored checklist or return defaults
    let checklist = DEFAULT_CHECKLIST.map((item) => ({ ...item }));
    if ((company as unknown as { setupChecklistJson?: string }).setupChecklistJson) {
      try {
        const stored = JSON.parse((company as unknown as { setupChecklistJson: string }).setupChecklistJson) as typeof checklist;
        // Merge: keep defaults for any new items, overlay stored completion state
        checklist = DEFAULT_CHECKLIST.map((def) => {
          const found = stored.find((s) => s.id === def.id);
          return found ? { ...def, completed: found.completed } : { ...def };
        });
      } catch {
        // use defaults
      }
    }

    const total = checklist.length;
    const done = checklist.filter((i) => i.completed).length;
    const percent = total > 0 ? Math.round((done / total) * 100) : 0;

    res.json({ checklist, percent, done, total });
  } catch (error) {
    console.error('GET /api/support-mode/checklist error:', error);
    res.status(500).json({ error: 'Failed to fetch checklist' });
  }
}
