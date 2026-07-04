/**
 * POST /api/public/form/:token/submit
 * Public endpoint — no auth required.
 * Submits a completed form response.
 * Body: { submitterName?, submitterEmail?, answers: Record<string, unknown> }
 */
import type { Request, Response } from 'express';
import { db } from '../../../../../db/client.js';
import { sql } from 'drizzle-orm';

export default async function handler(req: Request, res: Response) {
  try {
    const { token } = req.params;
    if (!token || token.length < 32) return res.status(400).json({ error: 'Invalid token' });

    const [tokenRows] = await db.execute(sql`
      SELECT template_id, company_id, revoked, expires_at
      FROM form_share_tokens
      WHERE token = ${token} LIMIT 1
    `) as unknown as [Array<{ template_id: number; company_id: number; revoked: number; expires_at: string | null }>];

    if (!tokenRows?.length) return res.status(404).json({ error: 'Link not found' });
    if (tokenRows[0].revoked) return res.status(410).json({ error: 'This link has been revoked' });
    if (tokenRows[0].expires_at && new Date(tokenRows[0].expires_at) < new Date()) {
      return res.status(410).json({ error: 'This link has expired' });
    }

    const { template_id, company_id } = tokenRows[0];

    const { submitterName, submitterEmail, answers } = req.body as {
      submitterName?: string;
      submitterEmail?: string;
      answers?: Record<string, unknown>;
    };

    const answersJson = answers ? JSON.stringify(answers) : null;
    const ip = (req.headers['x-forwarded-for'] as string | undefined)?.split(',')[0]?.trim() ?? req.ip ?? null;

    const [result] = await db.execute(sql`
      INSERT INTO form_public_submissions
        (company_id, template_id, token, submitter_name, submitter_email, answers_json, status, submitted_at, ip_address)
      VALUES
        (${company_id}, ${template_id}, ${token},
         ${submitterName?.trim() ?? null}, ${submitterEmail?.trim() ?? null},
         ${answersJson}, 'submitted', NOW(), ${ip})
    `) as unknown as [{ insertId: number }];

    const insertId = (result as unknown as { insertId: number }).insertId;

    res.status(201).json({ submissionId: insertId, ok: true });
  } catch (err) {
    console.error('POST /api/public/form/:token/submit error:', err);
    res.status(500).json({ error: 'Failed to submit form' });
  }
}
