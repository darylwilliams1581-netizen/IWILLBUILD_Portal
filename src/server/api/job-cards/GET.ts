/**
 * GET /api/job-cards
 * List Job Cards for the authenticated user's company.
 *
 * Query params:
 *   status        — draft | complete | invoiced | converted | all (default: all)
 *   customerId    — filter by customer
 *   invoiceStatus — not_invoiced | invoiced | all (default: all)
 *   search        — free-text search on card_number, customer_name, work_description
 *   limit         — default 50
 *   offset        — default 0
 */
import type { Request, Response } from 'express';
import { db } from '../../db/client.js';
import { profiles } from '../../db/schema.js';
import { eq, sql } from 'drizzle-orm';
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
    if (!profile?.companyId) return res.json({ jobCards: [], total: 0 });

    const status = (req.query.status as string) || 'all';
    const invoiceStatus = (req.query.invoiceStatus as string) || 'all';
    const customerId = req.query.customerId ? Number(req.query.customerId) : null;
    const search = (req.query.search as string) || '';
    const limit = Math.min(Number(req.query.limit) || 50, 200);
    const offset = Number(req.query.offset) || 0;

    let query = sql`
      SELECT
        jc.*,
        c.name AS customer_name,
        c.phone AS customer_phone,
        c.email AS customer_email,
        (
          SELECT COALESCE(SUM(m.cost), 0)
          FROM job_card_materials m
          WHERE m.job_card_id = jc.id
        ) AS materials_total,
        (
          SELECT COUNT(*)
          FROM job_card_photos p
          WHERE p.job_card_id = jc.id
        ) AS photo_count
      FROM job_cards jc
      LEFT JOIN customers c ON c.id = jc.customer_id
      WHERE jc.company_id = ${profile.companyId}
    `;

    if (status !== 'all') {
      query = sql`${query} AND jc.status = ${status}`;
    }
    if (invoiceStatus === 'not_invoiced') {
      query = sql`${query} AND (jc.invoice_id IS NULL)`;
    } else if (invoiceStatus === 'invoiced') {
      query = sql`${query} AND (jc.invoice_id IS NOT NULL)`;
    }
    if (customerId) {
      query = sql`${query} AND jc.customer_id = ${customerId}`;
    }
    if (search.trim()) {
      const like = `%${search.trim()}%`;
      query = sql`${query} AND (
        jc.card_number LIKE ${like}
        OR jc.work_description LIKE ${like}
        OR jc.customer_name_override LIKE ${like}
        OR c.name LIKE ${like}
      )`;
    }

    // Count total
    const countQuery = sql`SELECT COUNT(*) AS cnt FROM (${query}) AS sub`;
    const [countRows] = await db.execute(countQuery) as unknown as [Array<{ cnt: number }>, unknown];
    const total = Number(countRows?.[0]?.cnt ?? 0);

    query = sql`${query} ORDER BY jc.created_at DESC LIMIT ${limit} OFFSET ${offset}`;
    const [rows] = await db.execute(query) as unknown as [Array<Record<string, unknown>>, unknown];

    res.json({ jobCards: rows ?? [], total });
  } catch (err) {
    console.error('GET /api/job-cards error:', err);
    res.status(500).json({ error: 'Failed to fetch job cards' });
  }
}
