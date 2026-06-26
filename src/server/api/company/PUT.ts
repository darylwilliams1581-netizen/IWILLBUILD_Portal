import type { Request, Response } from 'express';
import { db } from '../../db/client.js';
import { companies, profiles } from '../../db/schema.js';
import { eq } from 'drizzle-orm';
import { getAuth } from '../../../lib/auth/auth.js';

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
    if (!profile?.companyId) return res.status(404).json({ error: 'No company found' });

    // Only admin can update company
    if (profile.role !== 'admin' && profile.role !== 'owner') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const { name, abn, phone, email, website, address } = req.body as {
      name?: string;
      abn?: string;
      phone?: string;
      email?: string;
      website?: string;
      address?: string;
    };

    if (!name?.trim()) return res.status(400).json({ error: 'Company name is required' });

    await db.update(companies)
      .set({
        name: name.trim(),
        abn: abn?.trim() ?? null,
        phone: phone?.trim() ?? null,
        email: email?.trim() ?? null,
        website: website?.trim() ?? null,
        address: address?.trim() ?? null,
      })
      .where(eq(companies.id, profile.companyId));

    const updated = await db.query.companies.findFirst({
      where: eq(companies.id, profile.companyId),
    });

    res.json({ company: updated });
  } catch (error) {
    console.error('PUT /api/company error:', error);
    res.status(500).json({ error: 'Failed to update company' });
  }
}
