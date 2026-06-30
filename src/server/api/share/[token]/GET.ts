/**
 * GET /api/share/:token
 * ─────────────────────────────────────────────────────────────────────────────
 * Public endpoint — no login required.
 * Validates a share token and returns the shared document metadata + content.
 * Increments view_count on each valid access.
 *
 * Security:
 * - Token is hashed before DB lookup (raw token never stored)
 * - Checks expiry, revocation, and max_views
 * - Only returns the specific document — no company-wide data
 */
import type { Request, Response } from 'express';
import { db } from '../../../db/client.js';
import { sql } from 'drizzle-orm';
import { hashToken } from '../../../lib/share-tokens.js';

export default async function handler(req: Request, res: Response) {
  try {
    const { token } = req.params as { token: string };
    if (!token || token.length < 20) {
      return res.status(400).json({ error: 'Invalid token' });
    }

    const tokenHash = hashToken(token);

    // Look up the share link
    const [rows] = await db.execute(
      sql`SELECT id, company_id, created_by_user_id, target_type, target_id,
                 expires_at, max_views, view_count, revoked_at, created_at
          FROM shared_links
          WHERE token_hash = ${tokenHash}
          LIMIT 1`
    ) as unknown as [Array<{
      id: number;
      company_id: number;
      created_by_user_id: string;
      target_type: string;
      target_id: string;
      expires_at: string;
      max_views: number | null;
      view_count: number;
      revoked_at: string | null;
      created_at: string;
    }>, unknown];

    const link = rows?.[0];
    if (!link) {
      return res.status(404).json({ error: 'Link not found or has expired.' });
    }

    // Check revoked
    if (link.revoked_at) {
      return res.status(410).json({ error: 'This link has been revoked.' });
    }

    // Check expiry
    if (new Date(link.expires_at) < new Date()) {
      return res.status(410).json({ error: 'This link has expired.' });
    }

    // Check max views
    if (link.max_views !== null && link.view_count >= link.max_views) {
      return res.status(410).json({ error: 'This link has reached its maximum number of views.' });
    }

    // Increment view count + log
    await db.execute(
      sql`UPDATE shared_links SET view_count = view_count + 1, updated_at = NOW() WHERE id = ${link.id}`
    );
    await db.execute(
      sql`INSERT INTO share_audit_log (shared_link_id, company_id, event_type, ip_address, user_agent, created_at)
          VALUES (${link.id}, ${link.company_id}, 'link_viewed',
                  ${req.ip ?? null}, ${(req.headers['user-agent'] ?? '').slice(0, 500)}, NOW())`
    );

    // Fetch the target document based on type
    const targetId = parseInt(link.target_id, 10);
    if (isNaN(targetId)) {
      return res.status(400).json({ error: 'Invalid target reference.' });
    }

    if (link.target_type === 'form_submission') {
      // Return form submission + template fields (no financial data)
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
            WHERE jfs.id = ${targetId}
              AND jfs.company_id = ${link.company_id}
            LIMIT 1`
      ) as unknown as [Array<Record<string, unknown>>, unknown];

      const submission = subRows?.[0];
      if (!submission) {
        return res.status(404).json({ error: 'Document not found.' });
      }

      // Fetch form fields (no financial fields)
      const [fieldRows] = await db.execute(
        sql`SELECT id, field_type, label, required, options_json, sort_order, page_number,
                   conditional_logic_json, instruction_text, instruction_image_url
            FROM form_fields
            WHERE template_id = ${submission.template_id as number}
            ORDER BY sort_order ASC`
      ) as unknown as [Array<Record<string, unknown>>, unknown];

      return res.json({
        type: 'form_submission',
        link: {
          id: link.id,
          expiresAt: link.expires_at,
          createdAt: link.created_at,
        },
        submission,
        fields: fieldRows ?? [],
      });
    }

    // Unknown type
    return res.status(400).json({ error: 'Unsupported document type.' });

  } catch (err) {
    console.error('GET /api/share/:token error:', err);
    res.status(500).json({ error: 'Failed to load shared document' });
  }
}
