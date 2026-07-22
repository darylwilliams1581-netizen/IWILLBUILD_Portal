/**
 * POST /api/external/form/:token
 * ─────────────────────────────────────────────────────────────────────────────
 * Public endpoint — no login required.
 * Saves answers (draft) or submits (final) an external form.
 *
 * Body: { action: 'save_draft' | 'submit', answers: object, submitterName?: string, submitterEmail?: string }
 *
 * Security:
 * - Token validated before any write
 * - Once submitted, form is locked — further writes rejected
 * - No financial data written or read
 */
import type { Request, Response } from 'express';
import { db } from '../../../../db/client.js';
import { sql } from 'drizzle-orm';
import { hashToken } from '../../../../lib/share-tokens.js';
import { sendPushToCompany } from '../../../../lib/push-notifications.js';

export default async function handler(req: Request, res: Response) {
  try {
    const { token } = req.params as { token: string };
    if (!token || token.length < 20) {
      return res.status(400).json({ error: 'Invalid token' });
    }

    const { action, answers, submitterName, submitterEmail } = req.body as {
      action: 'save_draft' | 'submit';
      answers: Record<string, unknown>;
      submitterName?: string;
      submitterEmail?: string;
    };

    if (!action || !['save_draft', 'submit'].includes(action)) {
      return res.status(400).json({ error: 'action must be save_draft or submit' });
    }
    if (!answers || typeof answers !== 'object') {
      return res.status(400).json({ error: 'answers is required' });
    }

    const tokenHash = hashToken(token);

    // Validate link
    const [rows] = await db.execute(
      sql`SELECT id, company_id, target_id, expires_at, revoked_at
          FROM shared_links
          WHERE token_hash = ${tokenHash}
            AND target_type = 'external_form'
          LIMIT 1`
    ) as unknown as [Array<{
      id: number;
      company_id: number;
      target_id: string;
      expires_at: string;
      revoked_at: string | null;
    }>, unknown];

    const link = rows?.[0];
    if (!link) return res.status(404).json({ error: 'Link not found.' });
    if (link.revoked_at) return res.status(410).json({ error: 'This link has been revoked.' });
    if (new Date(link.expires_at) < new Date()) return res.status(410).json({ error: 'This link has expired.' });

    const submissionId = parseInt(link.target_id, 10);
    if (isNaN(submissionId)) return res.status(400).json({ error: 'Invalid form reference.' });

    // Check current status — reject if already submitted/locked
    const [statusRows] = await db.execute(
      sql`SELECT id, status FROM job_form_submissions
          WHERE id = ${submissionId} AND company_id = ${link.company_id}
          LIMIT 1`
    ) as unknown as [Array<{ id: number; status: string }>, unknown];

    const submission = statusRows?.[0];
    if (!submission) return res.status(404).json({ error: 'Form not found.' });

    if (submission.status === 'submitted' || submission.status === 'locked') {
      return res.status(409).json({ error: 'This form has already been submitted and cannot be changed.' });
    }

    const answersJson = JSON.stringify(answers);

    if (action === 'save_draft') {
      await db.execute(
        sql`UPDATE job_form_submissions
            SET answers_json = ${answersJson},
                status = 'in_progress',
                external_submitter_name = ${submitterName ?? null},
                external_submitter_email = ${submitterEmail ?? null},
                updated_at = NOW()
            WHERE id = ${submissionId} AND company_id = ${link.company_id}`
      );

      await db.execute(
        sql`INSERT INTO share_audit_log (shared_link_id, company_id, event_type, ip_address, user_agent, created_at)
            VALUES (${link.id}, ${link.company_id}, 'form_draft_saved',
                    ${req.ip ?? null}, ${(req.headers['user-agent'] ?? '').slice(0, 500)}, NOW())`
      );

      return res.json({ ok: true, status: 'in_progress' });
    }

    // Submit — lock the form
    await db.execute(
      sql`UPDATE job_form_submissions
          SET answers_json = ${answersJson},
              status = 'submitted',
              submitted_at = NOW(),
              external_submitter_name = ${submitterName ?? null},
              external_submitter_email = ${submitterEmail ?? null},
              updated_at = NOW()
          WHERE id = ${submissionId} AND company_id = ${link.company_id}`
    );

    // Lock the share link so it can't be resubmitted
    await db.execute(
      sql`UPDATE shared_links SET revoked_at = NOW(), updated_at = NOW() WHERE id = ${link.id}`
    );

    // Audit log
    await db.execute(
      sql`INSERT INTO share_audit_log (shared_link_id, company_id, event_type, ip_address, user_agent, created_at)
          VALUES (${link.id}, ${link.company_id}, 'form_submitted',
                  ${req.ip ?? null}, ${(req.headers['user-agent'] ?? '').slice(0, 500)}, NOW())`
    );

    // Notify job owner/admin — best-effort, non-blocking
    void notifyFormSubmitted(link.company_id, submissionId, submitterName ?? null).catch(() => {});

    return res.json({ ok: true, status: 'submitted' });

  } catch (err) {
    console.error('POST /api/external/form/:token error:', err);
    res.status(500).json({ error: 'Failed to save form' });
  }
}

/** Best-effort internal notification — does not block the response. */
async function notifyFormSubmitted(
  companyId: number,
  submissionId: number,
  submitterName: string | null,
): Promise<void> {
  try {
    // Fetch submission + job info for notification
    const [rows] = await db.execute(
      sql`SELECT jfs.id, jfs.job_id, ft.name as form_name, j.name as job_name, j.job_number,
                 p.user_id as owner_user_id
          FROM job_form_submissions jfs
          JOIN form_templates ft ON ft.id = jfs.template_id
          JOIN jobs j ON j.id = jfs.job_id
          JOIN profiles p ON p.company_id = jfs.company_id AND p.role = 'owner'
          WHERE jfs.id = ${submissionId} AND jfs.company_id = ${companyId}
          LIMIT 1`
    ) as unknown as [Array<{
      id: number;
      job_id: number;
      form_name: string;
      job_name: string;
      job_number: string;
      owner_user_id: string;
    }>, unknown];

    const row = rows?.[0];
    if (!row) return;

    // Insert a portal notification
    await db.execute(
      sql`INSERT INTO notifications (company_id, user_id, type, title, body, link, created_at)
          VALUES (${companyId}, ${row.owner_user_id}, 'form_submitted',
                  ${'External form submitted'},
                  ${`"${row.form_name}" on job ${row.job_number} "${row.job_name}" was submitted${submitterName ? ` by ${submitterName}` : ''}.`},
                  ${`/jobs/${row.job_id}`},
                  NOW())`
    );

    // Push notification to all company devices
    void sendPushToCompany(companyId, {
      title: 'Form Submitted',
      body: `"${row.form_name}" submitted${submitterName ? ` by ${submitterName}` : ''} on job "${row.job_name}"`,
      url: `/jobs/${row.job_id}`,
      tag: `form-submitted-${submissionId}`,
    });
  } catch {
    // Non-fatal — notification failure must not affect the submission response
  }
}
