/**
 * POST /api/jobs/:id/signout
 *
 * Signs the current portal user out of a job.
 * Closes the latest open sign-in. If not signed in, returns a clear status.
 *
 * Body: { notes?: string; clientId?: string; occurredAt?: string }
 * Headers: X-Client-Id (used when body.clientId is absent)
 * Returns: { ok, action, attendanceId, notSignedIn?, idempotent? }
 *
 * Idempotency: if a row with the same (company_id, user_id, client_id) already
 * exists the existing row is returned with idempotent:true — no duplicate insert.
 */
import type { Request, Response } from 'express';
import { db } from '../../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getSessionAndProfile } from '../../../../lib/auth-middleware.js';
import { toMySQLDatetime } from '../../../../lib/datetime.js';
import type { ResultSetHeader } from 'mysql2';

/** Accept only safe alphanumeric + hyphen client IDs, 8–64 chars. */
const CLIENT_ID_RE = /^[A-Za-z0-9-]{8,64}$/;

function resolveClientId(body: Record<string, unknown>, req: Request): string | null {
  const raw = (body.clientId ?? req.headers['x-client-id']) as string | undefined;
  if (!raw) return null;
  return CLIENT_ID_RE.test(raw) ? raw : null;
}

export default async function handler(req: Request, res: Response) {
  const auth = await getSessionAndProfile(req, res);
  if (!auth) return;

  const jobId = parseInt(req.params.id);
  if (!jobId) return res.status(400).json({ error: 'Invalid job id' });

  const body = (req.body ?? {}) as Record<string, unknown>;
  const { notes, occurredAt } = body as { notes?: string; occurredAt?: string };
  const userId    = auth.session.user.id;
  const companyId = auth.profile.companyId;
  const clientId  = resolveClientId(body, req);

  // Convert occurredAt to MySQL datetime; fall back to null (DB uses CURRENT_TIMESTAMP)
  const createdAtMysql = toMySQLDatetime(occurredAt as string | undefined);

  try {
    // ── Verify job belongs to company ─────────────────────────────────────
    const [jobRows] = (await db.execute(
      sql`SELECT id FROM jobs WHERE id = ${jobId} AND company_id = ${companyId} LIMIT 1`
    ) as unknown as [Array<{ id: number }>, unknown]);
    if (!jobRows?.[0]) return res.status(404).json({ error: 'Job not found' });

    // ── Idempotency check — same clientId already recorded? ───────────────
    if (clientId) {
      const [idempRows] = (await db.execute(
        sql`SELECT id FROM job_attendance
            WHERE company_id = ${companyId}
              AND user_id    = ${userId}
              AND client_id  = ${clientId}
            LIMIT 1`
      ) as unknown as [Array<{ id: number }>, unknown]);

      if (idempRows?.[0]) {
        return res.json({
          ok: true,
          idempotent: true,
          action: 'signout',
          attendanceId: idempRows[0].id,
        });
      }
    }

    // ── Check open sign-in ────────────────────────────────────────────────
    const [countRows] = (await db.execute(
      sql`SELECT
            SUM(CASE WHEN action = 'signin'  THEN 1 ELSE 0 END) AS ins,
            SUM(CASE WHEN action = 'signout' THEN 1 ELSE 0 END) AS outs
          FROM job_attendance
          WHERE job_id = ${jobId} AND user_id = ${userId}`
    ) as unknown as [Array<{ ins: number; outs: number }>, unknown]);

    const ins  = Number(countRows?.[0]?.ins  ?? 0);
    const outs = Number(countRows?.[0]?.outs ?? 0);

    if (ins <= outs) {
      return res.json({
        ok: true,
        notSignedIn: true,
        message: 'You are not currently signed in to this job.',
      });
    }

    // ── Record sign-out ───────────────────────────────────────────────────
    // Use parameterised sql`` template — never sql.raw for user input.
    let insertResult: unknown;
    if (createdAtMysql) {
      insertResult = await db.execute(
        sql`INSERT INTO job_attendance
              (company_id, job_id, user_id, action, source, actor_type, notes, client_id, created_at)
            VALUES
              (${companyId}, ${jobId}, ${userId}, 'signout', 'portal',
               'employee', ${notes ?? null}, ${clientId}, ${createdAtMysql})`
      );
    } else {
      insertResult = await db.execute(
        sql`INSERT INTO job_attendance
              (company_id, job_id, user_id, action, source, actor_type, notes, client_id)
            VALUES
              (${companyId}, ${jobId}, ${userId}, 'signout', 'portal',
               'employee', ${notes ?? null}, ${clientId})`
      );
    }

    const header = (insertResult as [ResultSetHeader, unknown])[0] ?? (insertResult as ResultSetHeader);
    return res.status(201).json({
      ok: true,
      notSignedIn: false,
      action: 'signout',
      attendanceId: header.insertId,
      message: 'Signed out successfully.',
    });
  } catch (err) {
    console.error('POST /api/jobs/:id/signout error:', err);
    return res.status(500).json({ error: 'Failed to sign out' });
  }
}
