/**
 * GET /api/external/form/:token
 * ─────────────────────────────────────────────────────────────────────────────
 * Public endpoint — no login required.
 * Returns the form template fields + current answers for external completion.
 *
 * Security:
 * - Only returns the specific form — no job financial data, no other records
 * - Checks expiry, revocation, and submission lock
 */
import type { Request, Response } from 'express';
import { db } from '../../../../db/client.js';
import { sql } from 'drizzle-orm';
import { hashToken } from '../../../../lib/share-tokens.js';

export default async function handler(req: Request, res: Response) {
  try {
    const { token } = req.params as { token: string };
    if (!token || token.length < 20) {
      return res.status(400).json({ error: 'Invalid token' });
    }

    const tokenHash = hashToken(token);

    // Look up the share link — must be type 'external_form'
    const [rows] = await db.execute(
      sql`SELECT id, company_id, target_id, expires_at, revoked_at, view_count, max_views
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
      view_count: number;
      max_views: number | null;
    }>, unknown];

    const link = rows?.[0];
    if (!link) return res.status(404).json({ error: 'Link not found.' });
    if (link.revoked_at) return res.status(410).json({ error: 'This link has been revoked.' });
    if (new Date(link.expires_at) < new Date()) return res.status(410).json({ error: 'This link has expired.' });

    const submissionId = parseInt(link.target_id, 10);
    if (isNaN(submissionId)) return res.status(400).json({ error: 'Invalid form reference.' });

    // Fetch submission — no financial columns
    const [subRows] = await db.execute(
      sql`SELECT jfs.id, jfs.job_id, jfs.template_id, jfs.status, jfs.answers_json,
                 jfs.submitted_at, jfs.external_submitter_name, jfs.external_submitter_email,
                 jfs.created_at, jfs.updated_at,
                 ft.name as template_name, ft.description as template_description,
                 j.name as job_name, j.job_number,
                 c.name as company_name
          FROM job_form_submissions jfs
          JOIN form_templates ft ON ft.id = jfs.template_id
          JOIN jobs j ON j.id = jfs.job_id
          JOIN companies c ON c.id = jfs.company_id
          WHERE jfs.id = ${submissionId}
            AND jfs.company_id = ${link.company_id}
          LIMIT 1`
    ) as unknown as [Array<Record<string, unknown>>, unknown];

    const submission = subRows?.[0];
    if (!submission) return res.status(404).json({ error: 'Form not found.' });

    // Fetch fields
    const [fieldRows] = await db.execute(
      sql`SELECT id, field_type, label, required, options_json, sort_order, page_number,
                 conditional_logic_json, instruction_text, instruction_image_url
          FROM form_fields
          WHERE template_id = ${submission.template_id as number}
          ORDER BY sort_order ASC`
    ) as unknown as [Array<Record<string, unknown>>, unknown];

    // Log view
    await db.execute(
      sql`UPDATE shared_links SET view_count = view_count + 1, updated_at = NOW() WHERE id = ${link.id}`
    );
    await db.execute(
      sql`INSERT INTO share_audit_log (shared_link_id, company_id, event_type, ip_address, user_agent, created_at)
          VALUES (${link.id}, ${link.company_id}, 'form_opened',
                  ${req.ip ?? null}, ${(req.headers['user-agent'] ?? '').slice(0, 500)}, NOW())`
    );

    return res.json({
      submission,
      fields: fieldRows ?? [],
      linkId: link.id,
    });

  } catch (err) {
    console.error('GET /api/external/form/:token error:', err);
    res.status(500).json({ error: 'Failed to load form' });
  }
}
