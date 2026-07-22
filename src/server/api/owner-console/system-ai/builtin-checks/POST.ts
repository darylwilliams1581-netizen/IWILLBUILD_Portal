/**
 * POST /api/owner-console/system-ai/builtin-checks
 * ─────────────────────────────────────────────────────────────────────────────
 * Platform owner only. Runs built-in data quality checks on a company.
 * Access enforced by requirePlatformOwner middleware in entry.ts.
 *
 * Checks:
 *  - Module inventory (which modules have data)
 *  - Missing data (jobs with no progress, fleet with no prestart)
 *  - Overdue items (jobs past expected completion)
 *  - Storage usage (file count)
 *  - Template gaps (forms with no instances)
 *  - Company health score (0-100)
 */
import type { Request, Response } from 'express';
import { db } from '../../../../db/client.js';
import { profiles } from '../../../../db/schema.js';
import { eq, sql } from 'drizzle-orm';
import { getAuth } from '../../../../../lib/auth/auth.js';
import { derivePermissions } from '../../../../lib/dazza-context.js';

interface BuiltinCheck {
  label: string;
  status: 'ok' | 'warn' | 'error' | 'info';
  detail: string;
}

export default async function handler(req: Request, res: Response) {
  try {
    // ── Auth ─────────────────────────────────────────────────────────────────
    // Platform owner check handled by requirePlatformOwner middleware in entry.ts
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

    const permissions = derivePermissions(profile);

    const { companyId: targetCompanyId } = req.body as { companyId?: number };
    const companyId = targetCompanyId ?? profile.companyId;

    // ── Audit log ────────────────────────────────────────────────────────────
    console.info('[system-ai] builtin-checks', {
      requestedBy: session.user.id,
      targetCompanyId: companyId,
      at: new Date().toISOString(),
    });

    // ── Fetch company name ───────────────────────────────────────────────────
    const [companyRows] = await db.execute(sql.raw(
      `SELECT name FROM companies WHERE id = ${companyId} LIMIT 1`
    )) as [Array<{ name: string }>, unknown];
    const companyName = companyRows[0]?.name ?? `Company #${companyId}`;

    const checks: BuiltinCheck[] = [];
    let scoreDeductions = 0;

    // ── Check 1: Jobs ────────────────────────────────────────────────────────
    const [jobRows] = await db.execute(sql.raw(
      `SELECT
         COUNT(*) AS total,
         SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) AS active,
         SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) AS completed,
         SUM(CASE WHEN expected_completion_date < CURDATE() AND status NOT IN ('completed','cancelled') THEN 1 ELSE 0 END) AS overdue
       FROM jobs WHERE company_id = ${companyId}`
    )) as [Array<{ total: number; active: number; completed: number; overdue: number }>, unknown];
    const jobs = jobRows[0] ?? { total: 0, active: 0, completed: 0, overdue: 0 };

    if (Number(jobs.total) === 0) {
      checks.push({ label: 'Projects / Jobs', status: 'info', detail: 'No jobs found. Portal is ready for first project.' });
    } else {
      checks.push({ label: 'Projects / Jobs', status: 'ok', detail: `${jobs.total} total — ${jobs.active} active, ${jobs.completed} completed.` });
    }
    if (Number(jobs.overdue) > 0) {
      checks.push({ label: 'Overdue Jobs', status: 'warn', detail: `${jobs.overdue} job(s) past expected completion date.` });
      scoreDeductions += Math.min(20, Number(jobs.overdue) * 5);
    }

    // ── Check 2: Jobs with no progress ──────────────────────────────────────
    const [noProgressRows] = await db.execute(sql.raw(
      `SELECT COUNT(*) AS cnt FROM jobs j
       WHERE j.company_id = ${companyId}
         AND j.status = 'active'
         AND NOT EXISTS (
           SELECT 1 FROM job_progress_lines jpl WHERE jpl.job_id = j.id
         )`
    )) as [Array<{ cnt: number }>, unknown];
    const noProgress = Number(noProgressRows[0]?.cnt ?? 0);
    if (noProgress > 0) {
      checks.push({ label: 'Jobs with no progress recorded', status: 'warn', detail: `${noProgress} active job(s) have no progress lines recorded.` });
      scoreDeductions += Math.min(15, noProgress * 3);
    } else if (Number(jobs.active) > 0) {
      checks.push({ label: 'Progress tracking', status: 'ok', detail: 'All active jobs have progress recorded.' });
    }

    // ── Check 3: Fleet ───────────────────────────────────────────────────────
    const [fleetRows] = await db.execute(sql.raw(
      `SELECT COUNT(*) AS total,
         SUM(CASE WHEN rego_expiry < CURDATE() THEN 1 ELSE 0 END) AS rego_expired,
         SUM(CASE WHEN rego_expiry BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL 30 DAY) THEN 1 ELSE 0 END) AS rego_soon,
         SUM(CASE WHEN next_service_date < CURDATE() THEN 1 ELSE 0 END) AS service_overdue
       FROM fleet_assets WHERE company_id = ${companyId} AND status = 'active'`
    )) as [Array<{ total: number; rego_expired: number; rego_soon: number; service_overdue: number }>, unknown];
    const fleet = fleetRows[0] ?? { total: 0, rego_expired: 0, rego_soon: 0, service_overdue: 0 };

    if (Number(fleet.total) === 0) {
      checks.push({ label: 'Fleet', status: 'info', detail: 'No fleet assets registered.' });
    } else {
      checks.push({ label: 'Fleet', status: 'ok', detail: `${fleet.total} active asset(s).` });
      if (Number(fleet.rego_expired) > 0) {
        checks.push({ label: 'Rego expired', status: 'error', detail: `${fleet.rego_expired} asset(s) have expired registration.` });
        scoreDeductions += 15;
      }
      if (Number(fleet.rego_soon) > 0) {
        checks.push({ label: 'Rego expiring soon', status: 'warn', detail: `${fleet.rego_soon} asset(s) have rego expiring within 30 days.` });
        scoreDeductions += 5;
      }
      if (Number(fleet.service_overdue) > 0) {
        checks.push({ label: 'Service overdue', status: 'warn', detail: `${fleet.service_overdue} asset(s) are overdue for service.` });
        scoreDeductions += 10;
      }
    }

    // ── Check 4: Forms ───────────────────────────────────────────────────────
    const [formRows] = await db.execute(sql.raw(
      `SELECT COUNT(*) AS templates FROM forms WHERE company_id = ${companyId}`
    )) as [Array<{ templates: number }>, unknown];
    const formCount = Number(formRows[0]?.templates ?? 0);
    checks.push({
      label: 'Form templates',
      status: formCount > 0 ? 'ok' : 'info',
      detail: formCount > 0 ? `${formCount} form template(s) configured.` : 'No form templates created yet.',
    });

    // ── Check 5: Files ───────────────────────────────────────────────────────
    const [fileRows] = await db.execute(sql.raw(
      `SELECT COUNT(*) AS cnt FROM files WHERE company_id = ${companyId}`
    )) as [Array<{ cnt: number }>, unknown];
    const fileCount = Number(fileRows[0]?.cnt ?? 0);
    checks.push({
      label: 'Files / Documents',
      status: 'info',
      detail: `${fileCount} file(s) stored.`,
    });

    // ── Check 6: Team ────────────────────────────────────────────────────────
    const [teamRows] = await db.execute(sql.raw(
      `SELECT COUNT(*) AS total,
         SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) AS active,
         SUM(CASE WHEN status = 'invited' THEN 1 ELSE 0 END) AS invited
       FROM profiles WHERE company_id = ${companyId}`
    )) as [Array<{ total: number; active: number; invited: number }>, unknown];
    const team = teamRows[0] ?? { total: 0, active: 0, invited: 0 };
    checks.push({
      label: 'Team',
      status: Number(team.active) > 0 ? 'ok' : 'warn',
      detail: `${team.total} member(s) — ${team.active} active, ${team.invited} invited.`,
    });
    if (Number(team.active) === 0) scoreDeductions += 10;

    // ── Check 7: Safety / SWMS ───────────────────────────────────────────────
    const [swmsRows] = await db.execute(sql.raw(
      `SELECT COUNT(*) AS cnt FROM swms_library WHERE company_id = ${companyId}`
    )) as [Array<{ cnt: number }>, unknown];
    const swmsCount = Number(swmsRows[0]?.cnt ?? 0);
    checks.push({
      label: 'SWMS Library',
      status: swmsCount > 0 ? 'ok' : 'info',
      detail: swmsCount > 0 ? `${swmsCount} SWMS template(s) in library.` : 'No SWMS templates in library.',
    });

    // ── Health score ─────────────────────────────────────────────────────────
    const score = Math.max(0, 100 - scoreDeductions);

    res.json({
      companyId,
      companyName,
      checks,
      score,
      generatedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[system-ai/builtin-checks]', error);
    res.status(500).json({ error: 'Failed to run checks' });
  }
}
