import type { Request, Response } from 'express';
import { db } from '../../db/client.js';
import { getAuth } from '../../../lib/auth/auth.js';
import { profiles, companies } from '../../db/schema.js';
import { eq } from 'drizzle-orm';
import { sql } from 'drizzle-orm';

type SettingsRow = { structure_json: string; dazza_json: string; banner_json: string; pdf_json?: string };

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

    // db.execute returns [rowsArray, fields] — destructure to get rows
    let row: SettingsRow | null = null;
    try {
      const [rows] = await db.execute(
        sql`SELECT structure_json, dazza_json, banner_json, pdf_json FROM company_settings WHERE company_id = ${profile.companyId} LIMIT 1`
      ) as unknown as [SettingsRow[], unknown];
      row = rows?.[0] ?? null;
    } catch {
      // pdf_json column not yet migrated — fall back without it
      const [rows] = await db.execute(
        sql`SELECT structure_json, dazza_json, banner_json FROM company_settings WHERE company_id = ${profile.companyId} LIMIT 1`
      ) as unknown as [SettingsRow[], unknown];
      row = rows?.[0] ?? null;
    }

    const structure = row?.structure_json ? JSON.parse(row.structure_json) : {};
    const dazza     = row?.dazza_json     ? JSON.parse(row.dazza_json)     : {};
    const banner    = row?.banner_json    ? JSON.parse(row.banner_json)    : {};
    const pdf       = row?.pdf_json       ? JSON.parse(row.pdf_json)       : {};

    const company = await db.query.companies.findFirst({ where: eq(companies.id, profile.companyId) });

    res.json({ structure, dazza, banner, pdf, name: company?.name ?? '' });
  } catch (error) {
    console.error('GET /api/company-settings error:', error);
    res.status(500).json({ error: 'Failed to load settings' });
  }
}
