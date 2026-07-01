/**
 * GET /api/owner-console/form-templates?companyId=N
 * Returns form template counts and list for a company.
 * Access enforced by requirePlatformOwner middleware in entry.ts.
 */
import type { Request, Response } from 'express';
import { db } from '../../../db/client.js';
import { sql } from 'drizzle-orm';
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
    // Platform developer check handled by requirePlatformOwner middleware

    const companyId = parseInt(req.query.companyId as string);
    if (!companyId) return res.status(400).json({ error: 'companyId required' });

    const [rows] = await db.execute(
      sql`SELECT id, name, form_type, category, description, is_active, on_jobs, on_fleet, on_dashboard, created_at
          FROM form_templates
          WHERE company_id = ${companyId}
          ORDER BY category, name`
    ) as unknown as [Array<{
      id: number;
      name: string;
      form_type: string;
      category: string;
      description: string | null;
      is_active: number;
      on_jobs: number;
      on_fleet: number;
      on_dashboard: number;
      created_at: string;
    }>, unknown];

    const templates = (rows ?? []).map(r => ({
      id: r.id,
      name: r.name,
      formType: r.form_type,
      category: r.category,
      description: r.description,
      isActive: Boolean(r.is_active),
      onJobs: Boolean(r.on_jobs),
      onFleet: Boolean(r.on_fleet),
      onDashboard: Boolean(r.on_dashboard),
      createdAt: r.created_at,
    }));

    return res.json({ ok: true, templates, total: templates.length });
  } catch (err) {
    console.error('GET /api/owner-console/form-templates error:', err);
    return res.status(500).json({ error: 'Failed to fetch form templates' });
  }
}
