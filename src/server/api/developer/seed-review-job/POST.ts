/**
 * POST /api/developer/seed-review-job
 *
 * Platform-owner only.
 *
 * Idempotently seeds one Apple App Review demo job into the reviewer's
 * own company.  The company is resolved exclusively through the chain:
 *
 *   user (email = REVIEWER_EMAIL)
 *     → profiles (user_id = user.id)          ← company_id lives here
 *       → companies (id = profiles.company_id) ← verified to belong to that user
 *
 * The company name constant is used only for the 404 error message — it is
 * never used as a lookup key.  This prevents any cross-tenant targeting even
 * if another company happened to share the same display name.
 *
 * Seeds (all idempotent):
 *   1. Job — "Bathroom Renovation — 12 Maple Street" (job_number DEMO-001)
 *   2. Form template — "Site Inspection Checklist" (onJobs=true, 6 simple fields)
 *   3. One in-progress form submission on that job so the Forms tab is non-empty
 *
 * No placeholder photo records are inserted — a broken image is worse UX
 * than the "no photos yet" empty state.
 */

import type { Request, Response } from 'express';
import { db } from '../../../db/client.js';
import { sql } from 'drizzle-orm';
import type { ResultSetHeader } from 'mysql2';

const REVIEWER_EMAIL = 'support@iwillbuild.com';

// ── Demo job definition ───────────────────────────────────────────────────────
const DEMO_JOB = {
  jobNumber: 'DEMO-001',
  name:      'Bathroom Renovation — 12 Maple Street',
  client:    'Sarah & Tom Mitchell',
  address:   '12 Maple Street, Brisbane QLD 4000',
  status:    'Active',
  notes:     'Full bathroom renovation including tiling, vanity, and plumbing fixtures. Apple App Review demo job — safe to explore.',
};

// ── Demo form template definition ────────────────────────────────────────────
const DEMO_FORM = {
  name:        'Site Inspection Checklist',
  formType:    'Job',
  category:    'Safety',
  description: 'Quick site inspection checklist for job start and end of day.',
  onJobs:      true,
  onFleet:     false,
  onDashboard: false,
  fields: [
    { label: 'Date',                    fieldType: 'date',          required: true,  order: 0 },
    { label: 'Inspector Name',          fieldType: 'short_text',    required: true,  order: 1 },
    { label: 'Site is safe to work on', fieldType: 'single_choice', required: true,  order: 2, options: ['Yes', 'No — stop work'] },
    { label: 'PPE in use',              fieldType: 'single_choice', required: true,  order: 3, options: ['Yes', 'Partial', 'No'] },
    { label: 'Hazards identified',      fieldType: 'long_text',     required: false, order: 4 },
    { label: 'Inspector Signature',     fieldType: 'signature',     required: true,  order: 5 },
  ],
};

export default async function handler(req: Request, res: Response) {
  try {
    // ── 1. Resolve reviewer user ──────────────────────────────────────────────
    const [userRows] = await db.execute(
      sql`SELECT id FROM \`user\` WHERE email = ${REVIEWER_EMAIL} LIMIT 1`
    ) as unknown as [Array<{ id: string }>, unknown];

    const userId = userRows?.[0]?.id;
    if (!userId) {
      return res.status(404).json({
        error: 'Reviewer account not found. Run provision-apple-review-account first.',
      });
    }

    // ── 2. Resolve company via user → profile (never by company name) ─────────
    // This is the canonical lookup path.  The company name constant is used
    // only in the error message below — never as a WHERE clause.
    const [profileRows] = await db.execute(
      sql`SELECT company_id FROM profiles WHERE user_id = ${userId} LIMIT 1`
    ) as unknown as [Array<{ company_id: number }>, unknown];

    const companyId = profileRows?.[0]?.company_id;
    if (!companyId) {
      return res.status(404).json({
        error: 'Reviewer profile / company not found. Run provision-apple-review-account first.',
      });
    }

    // ── 3. Verify the company row actually exists and belongs to this user ─────
    // Guards against a stale profile pointing at a deleted company.
    const [companyRows] = await db.execute(
      sql`SELECT id FROM companies WHERE id = ${companyId} LIMIT 1`
    ) as unknown as [Array<{ id: number }>, unknown];

    if (!companyRows?.[0]) {
      return res.status(404).json({
        error: `Company id=${companyId} not found. Run provision-apple-review-account first.`,
      });
    }

    const log: string[] = [];

    // ── 4. Seed demo job (idempotent by job_number + company_id) ─────────────
    const [existingJob] = await db.execute(
      sql`SELECT id FROM jobs
          WHERE company_id = ${companyId} AND job_number = ${DEMO_JOB.jobNumber}
          LIMIT 1`
    ) as unknown as [Array<{ id: number }>, unknown];

    let jobId: number;

    if (existingJob?.[0]) {
      jobId = existingJob[0].id;
      log.push(`job: existing (id=${jobId})`);
    } else {
      const [jobResult] = await db.execute(sql`
        INSERT INTO jobs
          (company_id, job_number, name, client, address, status, notes,
           scheduled_start_date, expected_completion_date,
           created_at, updated_at)
        VALUES
          (${companyId}, ${DEMO_JOB.jobNumber}, ${DEMO_JOB.name},
           ${DEMO_JOB.client}, ${DEMO_JOB.address}, ${DEMO_JOB.status}, ${DEMO_JOB.notes},
           CURDATE(), DATE_ADD(CURDATE(), INTERVAL 14 DAY),
           NOW(), NOW())
      `) as unknown as [ResultSetHeader, unknown];
      jobId = jobResult.insertId;
      log.push(`job: created (id=${jobId})`);
    }

    // ── 5. Seed form template (idempotent by name + company_id) ──────────────
    const [existingTemplate] = await db.execute(
      sql`SELECT id FROM form_templates
          WHERE company_id = ${companyId} AND name = ${DEMO_FORM.name}
          LIMIT 1`
    ) as unknown as [Array<{ id: number }>, unknown];

    let templateId: number;

    if (existingTemplate?.[0]) {
      templateId = existingTemplate[0].id;
      log.push(`form template: existing (id=${templateId})`);
    } else {
      const [tmplResult] = await db.execute(sql`
        INSERT INTO form_templates
          (company_id, name, form_type, category, description,
           is_active, on_jobs, on_fleet, on_dashboard,
           created_at, updated_at)
        VALUES
          (${companyId}, ${DEMO_FORM.name}, ${DEMO_FORM.formType},
           ${DEMO_FORM.category}, ${DEMO_FORM.description},
           1,
           ${DEMO_FORM.onJobs    ? 1 : 0},
           ${DEMO_FORM.onFleet   ? 1 : 0},
           ${DEMO_FORM.onDashboard ? 1 : 0},
           NOW(), NOW())
      `) as unknown as [ResultSetHeader, unknown];
      templateId = tmplResult.insertId;

      for (const f of DEMO_FORM.fields) {
        const optionsJson = 'options' in f && (f as typeof f & { options?: string[] }).options
          ? JSON.stringify((f as typeof f & { options: string[] }).options)
          : null;
        await db.execute(sql`
          INSERT INTO form_template_fields
            (template_id, company_id, label, field_type, required, options_json, field_order,
             created_at, updated_at)
          VALUES
            (${templateId}, ${companyId}, ${f.label}, ${f.fieldType}, ${f.required ? 1 : 0},
             ${optionsJson}, ${f.order},
             NOW(), NOW())
        `);
      }
      log.push(`form template: created (id=${templateId}, ${DEMO_FORM.fields.length} fields)`);
    }

    // ── 6. Seed one in-progress form submission (idempotent by job+template+company) ──
    const [existingSubmission] = await db.execute(
      sql`SELECT id FROM job_form_submissions
          WHERE job_id = ${jobId} AND template_id = ${templateId} AND company_id = ${companyId}
          LIMIT 1`
    ) as unknown as [Array<{ id: number }>, unknown];

    let submissionId: number;

    if (existingSubmission?.[0]) {
      submissionId = existingSubmission[0].id;
      log.push(`form submission: existing (id=${submissionId})`);
    } else {
      const prefilled: Record<string, string> = {
        Date: new Date().toISOString().slice(0, 10),
        'Inspector Name': 'Apple Reviewer',
      };
      const [subResult] = await db.execute(sql`
        INSERT INTO job_form_submissions
          (job_id, company_id, template_id,
           completed_by_user_id, completed_by_name,
           status, answers_json,
           created_at, updated_at)
        VALUES
          (${jobId}, ${companyId}, ${templateId},
           ${userId}, 'Apple Reviewer',
           'in_progress', ${JSON.stringify(prefilled)},
           NOW(), NOW())
      `) as unknown as [ResultSetHeader, unknown];
      submissionId = subResult.insertId;
      log.push(`form submission: created (id=${submissionId})`);
    }

    // ── 7. Read-back verify ───────────────────────────────────────────────────
    const [verifyJob] = await db.execute(
      sql`SELECT id, job_number, name, status FROM jobs WHERE id = ${jobId} LIMIT 1`
    ) as unknown as [Array<{ id: number; job_number: string; name: string; status: string }>, unknown];

    const [verifyTemplate] = await db.execute(
      sql`SELECT id, name FROM form_templates WHERE id = ${templateId} LIMIT 1`
    ) as unknown as [Array<{ id: number; name: string }>, unknown];

    return res.json({
      ok: true,
      log,
      job:              verifyJob?.[0]      ?? null,
      formTemplate:     verifyTemplate?.[0] ?? null,
      formSubmissionId: submissionId,
      message: `Demo job seeded for ${REVIEWER_EMAIL}. Open job "${DEMO_JOB.name}" to test forms and photos.`,
    });

  } catch (err) {
    console.error('[seed-review-job] error:', err);
    return res.status(500).json({ error: 'Seed failed', detail: String(err) });
  }
}
