/**
 * POST /api/dazza/v3/incidents
 * ─────────────────────────────────────────────────────────────────────────────
 * Ingest an incident event. Fingerprints and deduplicates.
 * Can be called from:
 *   - Frontend error boundary (authenticated users)
 *   - Server-side error handlers
 *   - Bug report auto-analysis
 *
 * Auth: any authenticated user (incidents are platform-wide).
 * The caller's company/user is recorded but NOT used to filter — incidents
 * are platform-level, not company-level.
 *
 * Body: V3IncidentInput
 */
import type { Request, Response } from 'express';
import { getPlatformOwnerInfo } from '../../../../lib/platform-owner-guard.js';
import { getAuth } from '../../../../../lib/auth/auth.js';
import { ingestIncident, notifyOwnerOfIncident } from '../../../../lib/dazza-v3-brain.js';
import type { V3IncidentInput } from '../../../../lib/dazza-v3-brain.js';

export default async function handler(req: Request, res: Response) {
  try {
    // Auth — any authenticated user can report an incident
    const auth = getAuth();
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) {
      if (v) headers.set(k, Array.isArray(v) ? v[0] : v);
    }
    const session = await auth.api.getSession({ headers });
    if (!session?.user) return res.status(401).json({ error: 'Unauthorised' });

    const body = req.body as Partial<V3IncidentInput>;

    if (!body.incidentType || !body.title || !body.description) {
      return res.status(400).json({ error: 'incidentType, title, and description are required.' });
    }

    const severity = (['critical', 'high', 'medium', 'low'] as const).includes(body.severity as never)
      ? body.severity!
      : 'medium';

    const input: V3IncidentInput = {
      incidentType: String(body.incidentType).slice(0, 100),
      severity,
      title: String(body.title).slice(0, 200),
      affectedRoute: body.affectedRoute ? String(body.affectedRoute).slice(0, 300) : undefined,
      affectedCompanyId: body.affectedCompanyId ? Number(body.affectedCompanyId) : undefined,
      affectedUserId: session.user.id,
      affectedUserName: session.user.name ?? session.user.email ?? 'Unknown',
      affectedUserEmail: session.user.email ?? '',
      affectedUserPhone: body.affectedUserPhone,
      description: String(body.description).slice(0, 2000),
      evidenceJson: body.evidenceJson,
      platform: body.platform ?? 'web',
      appVersion: body.appVersion,
      customerRecovered: body.customerRecovered ?? false,
      dataLossRisk: body.dataLossRisk ?? false,
      attemptedAction: body.attemptedAction,
    };

    const result = await ingestIncident(input);

    // Notify owner for new critical/high incidents
    if (result.isNew && (result.severity === 'critical' || result.severity === 'high')) {
      void notifyOwnerOfIncident(
        result.incidentId,
        result.severity,
        input.title,
        input.description,
        input.affectedUserName,
        undefined, // company name resolved async
      );
    }

    return res.status(result.isNew ? 201 : 200).json({
      ok: true,
      incidentId: result.incidentId,
      isNew: result.isNew,
      severity: result.severity,
    });
  } catch (err) {
    console.error('[dazza/v3/incidents POST]', err);
    return res.status(500).json({ error: 'Failed to ingest incident.' });
  }
}
