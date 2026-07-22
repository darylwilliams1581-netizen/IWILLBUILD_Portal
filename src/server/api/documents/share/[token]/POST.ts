/**
 * POST /api/documents/share/:token
 * ─────────────────────────────────────────────────────────────────────────────
 * Public endpoint — no login required.
 * Handles external form completion (save_draft or submit).
 * Only valid for shareMode = 'complete'.
 *
 * Body: { action: 'save_draft'|'submit', answers: object, submitterName?: string, submitterEmail?: string }
 */
import type { Request, Response } from 'express';
import { db } from '../../../../db/client.js';
import { sql } from 'drizzle-orm';
import { resolveShare, logEvent, updateDocument, revokeShare } from '../../../../lib/document-engine.js';
import { hashToken } from '../../../../lib/share-tokens.js';

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

    const result = await resolveShare(token);

    if (!result) return res.status(404).json({ error: 'Link not found.' });
    if ('error' in result) return res.status(410).json({ error: result.error });

    const { share, document } = result;

    if (share.shareMode !== 'complete') {
      return res.status(403).json({ error: 'This link does not allow form completion.' });
    }

    if (document.isLocked || document.status === 'submitted') {
      return res.status(409).json({ error: 'This form has already been submitted and cannot be changed.' });
    }

    const submissionId = parseInt(document.sourceId, 10);
    if (isNaN(submissionId)) return res.status(400).json({ error: 'Invalid form reference.' });

    const answersJson = JSON.stringify(answers);

    if (action === 'save_draft') {
      await db.execute(
        sql`UPDATE job_form_submissions
            SET answers_json = ${answersJson},
                status = 'in_progress',
                external_submitter_name = ${submitterName ?? null},
                external_submitter_email = ${submitterEmail ?? null},
                updated_at = NOW()
            WHERE id = ${submissionId} AND company_id = ${document.companyId}`
      );

      await logEvent(document.id, document.companyId, 'updated', {
        eventNote: 'External draft saved',
        externalName: submitterName ?? null,
        ipAddress: req.ip ?? null,
      });

      return res.json({ ok: true, status: 'in_progress' });
    }

    // Submit — lock the form and document
    await db.execute(
      sql`UPDATE job_form_submissions
          SET answers_json = ${answersJson},
              status = 'submitted',
              submitted_at = NOW(),
              external_submitter_name = ${submitterName ?? null},
              external_submitter_email = ${submitterEmail ?? null},
              updated_at = NOW()
          WHERE id = ${submissionId} AND company_id = ${document.companyId}`
    );

    // Lock the document
    await updateDocument(document.companyId, document.id, {
      status: 'submitted',
      isLocked: true,
      lockedAt: new Date(),
      completedAt: new Date(),
    });

    // Revoke the share token so it can't be resubmitted
    await revokeShare(document.id, document.companyId, 'complete');

    // Mark submitted_at on the share record
    const tokenHash = hashToken(token);
    await db.execute(
      sql`UPDATE document_shares SET submitted_at = NOW(), updated_at = NOW()
          WHERE token_hash = ${tokenHash}`
    );

    await logEvent(document.id, document.companyId, 'submitted', {
      eventNote: submitterName ? `Submitted by ${submitterName}` : 'Submitted externally',
      externalName: submitterName ?? null,
      ipAddress: req.ip ?? null,
    });

    // Best-effort notification
    void notifySubmitted(document.companyId, submissionId, document.id, submitterName ?? null).catch(() => {});

    return res.json({ ok: true, status: 'submitted' });
  } catch (err) {
    console.error('POST /api/documents/share/:token error:', err);
    res.status(500).json({ error: 'Failed to save form' });
  }
}

async function notifySubmitted(
  companyId: number,
  submissionId: number,
  documentId: number,
  submitterName: string | null,
): Promise<void> {
  try {
    const [rows] = await db.execute(
      sql`SELECT jfs.job_id, ft.name as form_name, j.name as job_name, j.job_number,
                 p.user_id as owner_user_id
          FROM job_form_submissions jfs
          JOIN form_templates ft ON ft.id = jfs.template_id
          JOIN jobs j ON j.id = jfs.job_id
          JOIN profiles p ON p.company_id = jfs.company_id AND p.role = 'owner'
          WHERE jfs.id = ${submissionId} AND jfs.company_id = ${companyId}
          LIMIT 1`
    ) as unknown as [Array<{
      job_id: number;
      form_name: string;
      job_name: string;
      job_number: string;
      owner_user_id: string;
    }>, unknown];

    const row = rows?.[0];
    if (!row) return;

    await db.execute(
      sql`INSERT INTO notifications (company_id, user_id, type, title, body, link, created_at)
          VALUES (${companyId}, ${row.owner_user_id}, 'form_submitted',
                  ${'External form submitted'},
                  ${`"${row.form_name}" on job ${row.job_number} "${row.job_name}" was submitted${submitterName ? ` by ${submitterName}` : ''}.`},
                  ${`/documents/${documentId}`},
                  NOW())`
    );
  } catch {
    // Non-fatal
  }
}
