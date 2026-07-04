/**
 * GET /api/dashboard/kpi
 * ─────────────────────────────────────────────────────────────────────────────
 * Returns KPI data for the dashboard:
 *   - Revenue MTD (sum of paid invoice amounts this calendar month)
 *   - Revenue last month (for trend %)
 *   - Open jobs count (active statuses)
 *   - Outstanding invoices (count + total balance due)
 *   - Fleet utilisation % (active / total assets)
 *   - 30-day daily revenue sparkline (for the revenue card)
 */
import type { Request, Response } from 'express';
import { db } from '../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getAuth } from '../../../../lib/auth/auth.js';
import { profiles } from '../../../db/schema.js';
import { eq } from 'drizzle-orm';

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
    if (!profile?.companyId) return res.status(403).json({ error: 'No company' });

    const companyId = profile.companyId;

    // ── Date boundaries ───────────────────────────────────────────────────────
    const now = new Date();
    const mtdStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
    const thirtyDaysAgo = new Date(now); thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 29);

    const fmt = (d: Date) => d.toISOString().slice(0, 19).replace('T', ' ');

    // ── Revenue MTD (paid invoices) ───────────────────────────────────────────
    const [revMtdRows] = await db.execute(sql`
      SELECT COALESCE(SUM(total_amount), 0) AS revenue
      FROM invoices
      WHERE company_id = ${companyId}
        AND status IN ('paid', 'partially_paid')
        AND updated_at >= ${fmt(mtdStart)}
    `);
    const revMtd = parseFloat(String((revMtdRows as { revenue: string }[])[0]?.revenue ?? '0'));

    // ── Revenue last month ────────────────────────────────────────────────────
    const [revLastRows] = await db.execute(sql`
      SELECT COALESCE(SUM(total_amount), 0) AS revenue
      FROM invoices
      WHERE company_id = ${companyId}
        AND status IN ('paid', 'partially_paid')
        AND updated_at >= ${fmt(lastMonthStart)}
        AND updated_at <= ${fmt(lastMonthEnd)}
    `);
    const revLastMonth = parseFloat(String((revLastRows as { revenue: string }[])[0]?.revenue ?? '0'));

    // ── Revenue trend % ───────────────────────────────────────────────────────
    let revTrend: number | null = null;
    if (revLastMonth > 0) {
      revTrend = Math.round(((revMtd - revLastMonth) / revLastMonth) * 100);
    } else if (revMtd > 0) {
      revTrend = 100;
    }

    // ── Open jobs ─────────────────────────────────────────────────────────────
    const [openJobRows] = await db.execute(sql`
      SELECT COUNT(*) AS cnt
      FROM jobs
      WHERE company_id = ${companyId}
        AND status IN ('New','Quoting','Submitted','Awaiting Approval','Works Approved','Ready to Start','Works in Progress')
    `);
    const openJobs = parseInt(String((openJobRows as { cnt: string }[])[0]?.cnt ?? '0'), 10);

    // ── Jobs last 30 days (for trend) ─────────────────────────────────────────
    const [newJobRows] = await db.execute(sql`
      SELECT COUNT(*) AS cnt
      FROM jobs
      WHERE company_id = ${companyId}
        AND created_at >= ${fmt(thirtyDaysAgo)}
    `);
    const newJobsLast30 = parseInt(String((newJobRows as { cnt: string }[])[0]?.cnt ?? '0'), 10);

    // ── Outstanding invoices ──────────────────────────────────────────────────
    const [outstandingRows] = await db.execute(sql`
      SELECT
        COUNT(*) AS cnt,
        COALESCE(SUM(balance_due), 0) AS total_balance
      FROM invoices
      WHERE company_id = ${companyId}
        AND status IN ('sent', 'partially_paid', 'overdue')
    `);
    const outstandingCount = parseInt(String((outstandingRows as { cnt: string }[])[0]?.cnt ?? '0'), 10);
    const outstandingBalance = parseFloat(String((outstandingRows as { total_balance: string }[])[0]?.total_balance ?? '0'));

    // ── Overdue invoices ──────────────────────────────────────────────────────
    const [overdueRows] = await db.execute(sql`
      SELECT COUNT(*) AS cnt
      FROM invoices
      WHERE company_id = ${companyId}
        AND status = 'overdue'
    `);
    const overdueCount = parseInt(String((overdueRows as { cnt: string }[])[0]?.cnt ?? '0'), 10);

    // ── Fleet utilisation ─────────────────────────────────────────────────────
    const [fleetRows] = await db.execute(sql`
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN status = 'Active' THEN 1 ELSE 0 END) AS active
      FROM fleet_assets
      WHERE company_id = ${companyId}
        AND archived = 0
    `);
    const fleetTotal = parseInt(String((fleetRows as { total: string }[])[0]?.total ?? '0'), 10);
    const fleetActive = parseInt(String((fleetRows as { active: string }[])[0]?.active ?? '0'), 10);
    const fleetUtil = fleetTotal > 0 ? Math.round((fleetActive / fleetTotal) * 100) : 0;

    // ── 30-day daily revenue sparkline ────────────────────────────────────────
    const [sparkRows] = await db.execute(sql`
      SELECT
        DATE(updated_at) AS day,
        COALESCE(SUM(total_amount), 0) AS revenue
      FROM invoices
      WHERE company_id = ${companyId}
        AND status IN ('paid', 'partially_paid')
        AND updated_at >= ${fmt(thirtyDaysAgo)}
      GROUP BY DATE(updated_at)
      ORDER BY day ASC
    `);

    // Build a 30-slot array (one per day, 0 if no revenue)
    const sparkMap = new Map<string, number>();
    for (const row of sparkRows as { day: string; revenue: string }[]) {
      sparkMap.set(row.day, parseFloat(row.revenue));
    }
    const sparkline: number[] = [];
    for (let i = 29; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      sparkline.push(sparkMap.get(key) ?? 0);
    }

    res.json({
      revenueMtd: revMtd,
      revenueLastMonth: revLastMonth,
      revenueTrend: revTrend,
      openJobs,
      newJobsLast30,
      outstandingCount,
      outstandingBalance,
      overdueCount,
      fleetTotal,
      fleetActive,
      fleetUtilisation: fleetUtil,
      sparkline,
    });
  } catch (error) {
    console.error('GET /api/dashboard/kpi error:', error);
    res.status(500).json({ error: 'Failed to fetch KPI data' });
  }
}
