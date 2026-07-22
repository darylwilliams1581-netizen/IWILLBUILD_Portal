/**
 * POST /api/portal/validate
 * Validates a portal token and returns customer + company info.
 * Body: { token: string }
 * Public — no staff auth required.
 */
import type { Request, Response } from 'express';
import { db } from '../../../db/client.js';
import { sql } from 'drizzle-orm';

export default async function handler(req: Request, res: Response) {
  try {
    const { token } = req.body;
    if (!token) return res.status(400).json({ error: 'token required' });

    const [rows] = await db.execute(sql`
      SELECT
        t.id AS token_id, t.company_id, t.customer_id, t.email, t.expires_at, t.used_at,
        c.name AS customer_name, c.contact_person, c.phone, c.mobile, c.address,
        co.name AS company_name, co.phone AS company_phone, co.email AS company_email
      FROM customer_portal_tokens t
      JOIN customers c ON c.id = t.customer_id
      JOIN companies co ON co.id = t.company_id
      WHERE t.token = ${token}
        AND t.expires_at > NOW()
      LIMIT 1
    `) as unknown as [Array<Record<string, unknown>>];

    if (!rows?.length) return res.status(401).json({ error: 'Invalid or expired link' });

    const row = rows[0];

    // Mark as used (first use only)
    if (!row.used_at) {
      await db.execute(sql`
        UPDATE customer_portal_tokens SET used_at = NOW() WHERE id = ${row.token_id}
      `);
    }

    res.json({
      valid: true,
      customerId: row.customer_id,
      companyId: row.company_id,
      customerName: row.customer_name,
      contactPerson: row.contact_person,
      companyName: row.company_name,
      companyPhone: row.company_phone,
      companyEmail: row.company_email,
      email: row.email,
    });
  } catch (err) {
    console.error('POST /api/portal/validate error:', err);
    res.status(500).json({ error: 'Validation failed' });
  }
}
