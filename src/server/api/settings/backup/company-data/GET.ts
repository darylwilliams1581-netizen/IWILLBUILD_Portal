/**
 * GET /api/settings/backup/company-data
 * ─────────────────────────────────────────────────────────────────────────────
 * Exports company/system records only — no file blobs, no photos.
 * Auth required. Owner/Admin only.
 *
 * ZIP contents:
 *   company.json
 *   users.json
 *   fleet.json
 *   settings.json
 *   form-templates.json
 *   cost-guide.json
 */
import type { Request, Response } from 'express';
import { db } from '../../../../db/client.js';
import { profiles } from '../../../../db/schema.js';
import { eq, sql } from 'drizzle-orm';
import { getAuth } from '../../../../../lib/auth/auth.js';

export default async function handler(req: Request, res: Response) {
  try {
    const auth = getAuth();
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) {
      if (v) headers.set(k, Array.isArray(v) ? v[0] : v);
    }
    const session = await auth.api.getSession({ headers });
    if (!session?.user) return res.status(401).json({ error: 'Unauthorised' });

    const profile = await db.query.profiles.findFirst({ where: eq(profiles.userId, session.user.id) });
    if (!profile?.companyId) return res.status(403).json({ error: 'No company' });
    if (!['owner', 'admin'].includes(profile.role ?? '')) {
      return res.status(403).json({ error: 'Owner or Admin access required' });
    }

    const companyId = profile.companyId;

    const safeQuery = async <T>(q: ReturnType<typeof sql>): Promise<T[]> => {
      try {
        const [rows] = await db.execute(q) as unknown as [T[], unknown];
        return rows ?? [];
      } catch { return []; }
    };

    const [companyRows, userRows, fleetRows, settingsRows, formRows, costGuideRows] = await Promise.all([
      safeQuery(sql`SELECT * FROM companies WHERE id = ${companyId} LIMIT 1`),
      safeQuery(sql`SELECT p.id, p.role, p.status, p.created_at, u.name, u.email FROM profiles p JOIN \`user\` u ON u.id = p.user_id WHERE p.company_id = ${companyId}`),
      safeQuery(sql`SELECT * FROM fleet_assets WHERE company_id = ${companyId} ORDER BY id`),
      safeQuery(sql`SELECT structure_json, dazza_json, banner_json, pdf_json FROM company_settings WHERE company_id = ${companyId} LIMIT 1`),
      safeQuery(sql`SELECT * FROM form_templates WHERE company_id = ${companyId} ORDER BY id`),
      safeQuery(sql`SELECT * FROM cost_guide_items WHERE company_id = ${companyId} ORDER BY category, description`),
    ]);

    const exportedAt = new Date().toISOString();
    const { default: JSZip } = await import('jszip');
    const zip = new JSZip();
    zip.file('company.json', JSON.stringify({ exportedAt, company: companyRows[0] ?? {} }, null, 2));
    zip.file('users.json', JSON.stringify({ exportedAt, users: userRows }, null, 2));
    zip.file('fleet.json', JSON.stringify({ exportedAt, fleet: fleetRows }, null, 2));
    zip.file('settings.json', JSON.stringify({ exportedAt, settings: settingsRows[0] ?? {} }, null, 2));
    zip.file('form-templates.json', JSON.stringify({ exportedAt, templates: formRows }, null, 2));
    zip.file('cost-guide.json', JSON.stringify({ exportedAt, items: costGuideRows }, null, 2));

    const zipBuffer = await zip.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE', compressionOptions: { level: 6 } });
    const dateStr = new Date().toISOString().slice(0, 10);
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="iwillbuild-company-data-${dateStr}.zip"`);
    res.setHeader('Content-Length', String(zipBuffer.length));
    res.send(zipBuffer);
  } catch (error) {
    console.error('GET /api/settings/backup/company-data error:', error);
    if (!res.headersSent) res.status(500).json({ error: 'Export failed' });
  }
}
