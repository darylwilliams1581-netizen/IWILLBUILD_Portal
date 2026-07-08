/**
 * POST /api/emergency-alerts
 * Create a new emergency alert for a job.
 *
 * Body:
 * {
 *   jobId: number;
 *   reason: string;          // one of the VALID_REASONS
 *   note?: string;           // max 100 chars
 *   lat?: number;
 *   lng?: number;
 *   locationAccuracyM?: number;
 *   locationDenied?: boolean;
 *   offlineQueued?: boolean;  // true when synced from offline queue
 * }
 *
 * Access: any authenticated user who belongs to the same company as the job.
 */
import type { Request, Response } from 'express';
import { db } from '../../db/client.js';
import { sql } from 'drizzle-orm';
import { getSessionAndProfile } from '../../lib/auth-middleware.js';

const VALID_REASONS = [
  'snakebite',
  'injury',
  'medical',
  'missing_person',
  'evacuation_support',
  'other',
] as const;

export default async function handler(req: Request, res: Response) {
  const auth = await getSessionAndProfile(req, res);
  if (!auth) return;

  const companyId = auth.profile.companyId;
  const userId    = auth.session.user.id;
  const userName  = auth.session.user.name ?? auth.session.user.email ?? 'Unknown';

  const {
    jobId,
    reason,
    note,
    lat,
    lng,
    locationAccuracyM,
    locationDenied,
    offlineQueued,
  } = req.body as {
    jobId?: number;
    reason?: string;
    note?: string;
    lat?: number;
    lng?: number;
    locationAccuracyM?: number;
    locationDenied?: boolean;
    offlineQueued?: boolean;
  };

  // ── Validation ────────────────────────────────────────────────────────────
  if (!jobId || isNaN(Number(jobId))) {
    return res.status(400).json({ error: 'jobId is required' });
  }
  if (!reason || !VALID_REASONS.includes(reason as typeof VALID_REASONS[number])) {
    return res.status(400).json({ error: `reason must be one of: ${VALID_REASONS.join(', ')}` });
  }
  const cleanNote = note ? String(note).slice(0, 100) : null;

  // ── Verify job belongs to this company ───────────────────────────────────
  const [jobRows] = await db.execute(
    sql`SELECT id FROM jobs WHERE id = ${Number(jobId)} AND company_id = ${companyId} LIMIT 1`
  ) as unknown as [Array<{ id: number }>, unknown];

  if (!jobRows.length) {
    return res.status(404).json({ error: 'Job not found or access denied' });
  }

  // ── Location handling ─────────────────────────────────────────────────────
  // If location is required but denied, the client should have blocked the send.
  // We still accept the record but flag it.
  const latVal      = lat  != null ? parseFloat(String(lat))  : null;
  const lngVal      = lng  != null ? parseFloat(String(lng))  : null;
  const accuracyVal = locationAccuracyM != null ? parseFloat(String(locationAccuracyM)) : null;
  const deniedFlag  = locationDenied ? 1 : 0;
  const offlineFlag = offlineQueued  ? 1 : 0;

  try {
    const [result] = await db.execute(sql`
      INSERT INTO emergency_alerts
        (company_id, job_id, initiated_by, initiated_by_name, reason, note,
         status, lat, lng, location_accuracy_m, location_denied, offline_queued)
      VALUES
        (${companyId}, ${Number(jobId)}, ${userId}, ${userName}, ${reason}, ${cleanNote},
         'active', ${latVal}, ${lngVal}, ${accuracyVal}, ${deniedFlag}, ${offlineFlag})
    `) as unknown as [{ insertId: number }, unknown];

    const insertId = (result as { insertId: number }).insertId;

    // Fetch the created record to return
    const [rows] = await db.execute(
      sql`SELECT * FROM emergency_alerts WHERE id = ${insertId} LIMIT 1`
    ) as unknown as [Array<Record<string, unknown>>, unknown];

    return res.status(201).json({ ok: true, alert: rows[0] ?? null });
  } catch (err) {
    console.error('POST /api/emergency-alerts error:', err);
    return res.status(500).json({ error: 'Failed to create emergency alert' });
  }
}
