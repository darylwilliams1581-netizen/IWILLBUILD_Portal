/**
 * GET /api/dazza/context
 * Loads all data Dazza needs to answer questions — company-scoped, auth-protected.
 * Respects module permissions: only loads data the user is allowed to see.
 */
import type { Request, Response } from 'express';
import { db } from '../../../db/client.js';
import { profiles } from '../../../db/schema.js';
import { eq, sql } from 'drizzle-orm';
import { getAuth } from '../../../../lib/auth/auth.js';

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

    const companyId = profile.companyId;
    const role = profile.role ?? 'worker';

    // Read individual boolean permission columns
    const isOwner = role === 'owner';
    const isAdmin = isOwner || role === 'admin' || profile.permAdmin === true;
    const canJobs       = isAdmin || profile.permJobs       !== false;
    const canFleet      = isAdmin || profile.permFleet      !== false;
    const canForms      = isAdmin || profile.permForms      !== false;
    const canEstimating = isAdmin || profile.permEstimating !== false;
    const canFiles      = isAdmin || profile.permFiles      !== false;
    const seeDollars    = isAdmin || profile.permSeeDollars === true;

    const ctx: Record<string, unknown> = {
      user: { name: session.user.name, email: session.user.email, role },
      permissions: { canJobs, canFleet, canForms, canEstimating, canFiles, seeDollars, isAdmin },
    };

    // ── Company info ──────────────────────────────────────────────────────────
    const companyRows = await db.execute(
      sql`SELECT name FROM companies WHERE id = ${companyId} LIMIT 1`
    ) as unknown as Array<{ name: string }>;
    ctx.company = companyRows[0] ?? null;

    // ── Company knowledge (Dazza settings) ───────────────────────────────────
    const settingsRows = await db.execute(
      sql`SELECT dazza_json FROM company_settings WHERE company_id = ${companyId} LIMIT 1`
    ) as unknown as Array<{ dazza_json: string }>;
    const dazzaSettings = settingsRows[0]?.dazza_json ? JSON.parse(settingsRows[0].dazza_json) : {};
    ctx.companyKnowledge = {
      enabled: dazzaSettings.enabled ?? false,
      companyNotes: dazzaSettings.companyNotes ?? '',
      safetyNotes: dazzaSettings.safetyNotes ?? '',
      tone: dazzaSettings.tone ?? 'professional',
      disclaimer: dazzaSettings.disclaimer ?? '',
    };

    // ── Jobs ──────────────────────────────────────────────────────────────────
    if (canJobs) {
      const jobRows = await db.execute(
        sql`SELECT id, job_number, name, client, address, status, notes, created_at
            FROM jobs WHERE company_id = ${companyId}
            ORDER BY created_at DESC LIMIT 50`
      ) as unknown as Array<Record<string, unknown>>;
      ctx.jobs = jobRows;

      // Open to-dos across all jobs (status = 'Open')
      const todoRows = await db.execute(
        sql`SELECT t.id, t.job_id, t.title, t.status, t.due_date, t.notes, j.name as job_name
            FROM job_todos t
            JOIN jobs j ON j.id = t.job_id
            WHERE j.company_id = ${companyId} AND t.status = 'Open'
            ORDER BY t.due_date ASC LIMIT 100`
      ) as unknown as Array<Record<string, unknown>>;
      ctx.openTodos = todoRows;

      // Progress lines per job (aggregate percent per job)
      const progressRows = await db.execute(
        sql`SELECT p.job_id, j.name as job_name,
                   ROUND(AVG(p.percent_complete)) as avg_percent,
                   COUNT(*) as line_count
            FROM job_progress_lines p
            JOIN jobs j ON j.id = p.job_id
            WHERE j.company_id = ${companyId}
            GROUP BY p.job_id, j.name
            ORDER BY p.job_id DESC LIMIT 50`
      ) as unknown as Array<Record<string, unknown>>;
      ctx.jobProgress = progressRows;
    }

    // ── Fleet ─────────────────────────────────────────────────────────────────
    if (canFleet) {
      const fleetRows = await db.execute(
        sql`SELECT id, name, asset_type, rego, status, service_date, rego_expiry, rego_not_applicable, notes
            FROM fleet_assets WHERE company_id = ${companyId} AND archived = 0
            ORDER BY name ASC LIMIT 50`
      ) as unknown as Array<Record<string, unknown>>;
      ctx.fleet = fleetRows;

      // Fleet prestart attention flags
      const flagRows = await db.execute(
        sql`SELECT fp.asset_id, fa.name as asset_name, fp.issue_comment, fp.created_at
            FROM fleet_prestarts fp
            JOIN fleet_assets fa ON fa.id = fp.asset_id
            WHERE fa.company_id = ${companyId}
              AND fp.issue_needs_attention = 1
            ORDER BY fp.created_at DESC LIMIT 20`
      ) as unknown as Array<Record<string, unknown>>;
      ctx.fleetFlags = flagRows;

      // Assets with service/rego due within 14 days
      const in14 = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
      const dueDateRows = await db.execute(
        sql`SELECT id, name, service_date, rego_expiry, rego_not_applicable
            FROM fleet_assets
            WHERE company_id = ${companyId}
              AND archived = 0
              AND (
                (service_date IS NOT NULL AND service_date <= ${in14})
                OR (rego_not_applicable = 0 AND rego_expiry IS NOT NULL AND rego_expiry <= ${in14})
              )`
      ) as unknown as Array<Record<string, unknown>>;
      ctx.fleetDueDates = dueDateRows;
    }

    // ── Estimates ─────────────────────────────────────────────────────────────
    if (canEstimating) {
      let estRows: Array<Record<string, unknown>>;
      if (seeDollars) {
        // Include computed total from estimate lines
        estRows = await db.execute(
          sql`SELECT e.id, e.job_id, e.title, e.status, e.markup_percent, e.gst_mode, e.created_at, j.name as job_name,
                     COALESCE(SUM(CAST(el.quantity AS DECIMAL(15,4)) * CAST(el.rate AS DECIMAL(15,4))), 0) as subtotal
              FROM estimates e
              LEFT JOIN jobs j ON j.id = e.job_id
              LEFT JOIN estimate_lines el ON el.estimate_id = e.id
              WHERE e.company_id = ${companyId}
              GROUP BY e.id, e.job_id, e.title, e.status, e.markup_percent, e.gst_mode, e.created_at, j.name
              ORDER BY e.created_at DESC LIMIT 50`
        ) as unknown as Array<Record<string, unknown>>;
      } else {
        estRows = await db.execute(
          sql`SELECT e.id, e.job_id, e.title, e.status, e.created_at, j.name as job_name
              FROM estimates e
              LEFT JOIN jobs j ON j.id = e.job_id
              WHERE e.company_id = ${companyId}
              ORDER BY e.created_at DESC LIMIT 50`
        ) as unknown as Array<Record<string, unknown>>;
      }
      ctx.estimates = estRows;
    }

    // ── Forms ─────────────────────────────────────────────────────────────────
    if (canForms) {
      const templateRows = await db.execute(
        sql`SELECT id, name, category, created_at FROM form_templates WHERE company_id = ${companyId} ORDER BY name ASC LIMIT 50`
      ) as unknown as Array<Record<string, unknown>>;
      ctx.formTemplates = templateRows;

      const submissionRows = await db.execute(
        sql`SELECT s.id, s.job_id, s.template_id, s.status, s.created_at, s.updated_at,
                   j.name as job_name, ft.name as template_name
            FROM job_form_submissions s
            LEFT JOIN jobs j ON j.id = s.job_id
            LEFT JOIN form_templates ft ON ft.id = s.template_id
            WHERE s.company_id = ${companyId}
            ORDER BY s.updated_at DESC LIMIT 100`
      ) as unknown as Array<Record<string, unknown>>;
      ctx.formSubmissions = submissionRows;
    }

    // ── Files ─────────────────────────────────────────────────────────────────
    if (canFiles) {
      const fileRows = await db.execute(
        sql`SELECT id, original_name, label, job_id, created_at FROM company_files WHERE company_id = ${companyId} ORDER BY created_at DESC LIMIT 50`
      ) as unknown as Array<Record<string, unknown>>;
      ctx.files = fileRows;
    }

    res.json(ctx);
  } catch (error) {
    console.error('GET /api/dazza/context error:', error);
    res.status(500).json({ error: 'Failed to load Dazza context' });
  }
}
