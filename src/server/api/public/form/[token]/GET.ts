/**
 * GET /api/public/form/:token
 * Public endpoint — no auth required.
 * Returns form template fields for the public fill-out page.
 */
import type { Request, Response } from 'express';
import { db } from '../../../../db/client.js';
import { sql } from 'drizzle-orm';

export default async function handler(req: Request, res: Response) {
  try {
    const { token } = req.params;
    if (!token || token.length < 32) return res.status(400).json({ error: 'Invalid token' });

    const [tokenRows] = await db.execute(sql`
      SELECT t.template_id, t.company_id, t.revoked, t.expires_at
      FROM form_share_tokens t
      WHERE t.token = ${token} LIMIT 1
    `) as unknown as [Array<{ template_id: number; company_id: number; revoked: number; expires_at: string | null }>];

    if (!tokenRows?.length) return res.status(404).json({ error: 'Link not found' });
    if (tokenRows[0].revoked) return res.status(410).json({ error: 'This link has been revoked' });
    if (tokenRows[0].expires_at && new Date(tokenRows[0].expires_at) < new Date()) {
      return res.status(410).json({ error: 'This link has expired' });
    }

    const { template_id, company_id } = tokenRows[0];

    const [tplRows] = await db.execute(sql`
      SELECT ft.id, ft.name, ft.description, ft.form_type,
             c.name AS company_name, c.logo_url AS company_logo
      FROM form_templates ft
      JOIN companies c ON c.id = ft.company_id
      WHERE ft.id = ${template_id} AND ft.company_id = ${company_id} AND ft.is_active = 1
      LIMIT 1
    `) as unknown as [Array<Record<string, unknown>>];

    if (!tplRows?.length) return res.status(404).json({ error: 'Form not found or inactive' });

    const [fieldRows] = await db.execute(sql`
      SELECT id, field_type, label, required, options_json, sort_order, page_number,
             conditional_logic_json, instruction_text
      FROM form_fields
      WHERE template_id = ${template_id}
      ORDER BY sort_order ASC
    `) as unknown as [Array<Record<string, unknown>>];

    res.json({
      template: tplRows[0],
      fields: fieldRows ?? [],
    });
  } catch (err) {
    console.error('GET /api/public/form/:token error:', err);
    res.status(500).json({ error: 'Failed to load form' });
  }
}
