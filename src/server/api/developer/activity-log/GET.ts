/**
 * GET /api/developer/activity-log
 * Platform developer only — returns the cross-company activity log.
 *
 * Query params:
 *   limit        (default 100, max 500)
 *   offset       (default 0)
 *   eventType    filter by event_type
 *   success      '1' | '0' | '' (all)
 *   email        partial match on email
 *   companyId    filter by company_id
 *   dateFrom     ISO date string (inclusive)
 *   dateTo       ISO date string (inclusive)
 */
import type { Request, Response } from 'express';
import { db } from '../../../db/client.js';
import { getAuth } from '../../../../lib/auth/auth.js';
import { PLATFORM_OWNER_EMAILS } from '../../../lib/platform-owner-guard.js';
import { sql } from 'drizzle-orm';

async function getDevSession(req: Request) {
  const auth = getAuth();
  const headers = new Headers();
  for (const [k, v] of Object.entries(req.headers)) {
    if (v) headers.set(k, Array.isArray(v) ? v[0] : v);
  }
  return auth.api.getSession({ headers });
}

async function isPlatformDev(userId: string, email: string): Promise<boolean> {
  if (PLATFORM_OWNER_EMAILS.has(email.toLowerCase())) return true;
  try {
    const [rows] = await db.execute(
      sql`SELECT platform_role FROM profiles WHERE user_id = ${userId} LIMIT 1`
    ) as unknown as [Array<{ platform_role: string | null }>, unknown];
    return rows?.[0]?.platform_role === 'developer';
  } catch { return false; }
}

export default async function handler(req: Request, res: Response) {
  try {
    const session = await getDevSession(req);
    if (!session?.user) return res.status(401).json({ error: 'Unauthorised' });
    if (!await isPlatformDev(session.user.id, session.user.email ?? '')) {
      return res.status(403).json({ error: 'Platform developer access required.' });
    }

    const limit  = Math.min(Number(req.query.limit  ?? 100), 500);
    const offset = Number(req.query.offset ?? 0);
    const eventType = (req.query.eventType as string | undefined)?.trim() || null;
    const successFilter = req.query.success as string | undefined;
    const emailFilter   = (req.query.email as string | undefined)?.trim() || null;
    const companyId     = req.query.companyId ? Number(req.query.companyId) : null;
    const dateFrom      = (req.query.dateFrom as string | undefined)?.trim() || null;
    const dateTo        = (req.query.dateTo   as string | undefined)?.trim() || null;

    // Build WHERE clauses dynamically using raw SQL with parameterised values
    const conditions: string[] = ['1=1'];
    const params: unknown[] = [];

    if (eventType) {
      conditions.push('event_type = ?');
      params.push(eventType);
    }
    if (successFilter === '1') {
      conditions.push('success = 1');
    } else if (successFilter === '0') {
      conditions.push('success = 0');
    }
    if (emailFilter) {
      conditions.push('email LIKE ?');
      params.push(`%${emailFilter}%`);
    }
    if (companyId) {
      conditions.push('company_id = ?');
      params.push(companyId);
    }
    if (dateFrom) {
      conditions.push('created_at >= ?');
      params.push(`${dateFrom} 00:00:00`);
    }
    if (dateTo) {
      conditions.push('created_at <= ?');
      params.push(`${dateTo} 23:59:59`);
    }

    const where = conditions.join(' AND ');

    // Count total matching rows for pagination
    const countSql = `SELECT COUNT(*) as total FROM platform_activity_log WHERE ${where}`;
    const dataSql  = `SELECT * FROM platform_activity_log WHERE ${where} ORDER BY created_at DESC LIMIT ${limit} OFFSET ${offset}`;

    // Execute with parameterised values using Drizzle's raw execute
    // We build the SQL string with ? placeholders and pass params separately
    // Drizzle's sql.raw doesn't support ? params, so we use a prepared approach
    const [countRows] = await db.execute(
      buildParameterisedSql(countSql, params)
    ) as unknown as [Array<{ total: number }>, unknown];

    const [rows] = await db.execute(
      buildParameterisedSql(dataSql, params)
    ) as unknown as [Array<Record<string, unknown>>, unknown];

    const total = Number(countRows?.[0]?.total ?? 0);

    return res.json({
      events: rows ?? [],
      total,
      limit,
      offset,
    });
  } catch (err) {
    console.error('developer/activity-log error:', err);
    return res.status(500).json({ error: 'Failed to fetch activity log.' });
  }
}

/**
 * Build a Drizzle sql template from a raw SQL string with ? placeholders.
 * Replaces each ? with the corresponding param value using sql interpolation.
 */
function buildParameterisedSql(query: string, params: unknown[]) {
  // Split on ? and interleave with params
  const parts = query.split('?');
  if (parts.length === 1) return sql.raw(query);

  // Build using sql template tag for safe parameterisation
  let result = sql.raw(parts[0]);
  for (let i = 0; i < params.length; i++) {
    result = sql`${result}${params[i]}${sql.raw(parts[i + 1] ?? '')}`;
  }
  return result;
}
