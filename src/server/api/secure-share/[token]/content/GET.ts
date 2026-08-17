/**
 * GET /api/secure-share/:token/content
 * ─────────────────────────────────────────────────────────────────────────────
 * Public endpoint — no login required.
 *
 * Resolves a secure share token and streams the actual document content:
 *   - estimate / invoice → PDF bytes (inline for view, attachment for download)
 *
 * Query params:
 *   ?action=view      → Content-Disposition: inline  (browser renders PDF)
 *   ?action=download  → Content-Disposition: attachment (forces save dialog)
 *   ?proof=TOKEN      → Required for password-protected links. The proof token
 *                       is issued by POST /api/secure-share/:token on successful
 *                       password validation. It is single-use, expires in 15 min,
 *                       and is scoped to this specific share link — a proof issued
 *                       for token A cannot unlock token B.
 *
 * Security:
 *   - Token resolved by hash — raw token never stored
 *   - Checks revoked, expiry, max_uses before any content is generated
 *   - Password-protected links require a valid, unexpired, unused proof token
 *   - Proof is consumed (used=1) atomically before PDF generation
 *   - Proof is bound to share_link_id — cross-token reuse is impossible
 *   - Verifies permission matches action (view requires 'view', download requires 'download')
 *   - Company-scoped DB lookup for the target record
 *   - use_count incremented once per successful content delivery
 *   - Internal DB IDs are never placed in the public URL
 */
import type { Request, Response } from 'express';
import { db } from '../../../../db/client.js';
import { sql } from 'drizzle-orm';
import { hashToken } from '../../../../lib/share-tokens.js';
import { buildEstimatePdfDocument } from '../../../../lib/estimate-pdf-document.js';
import { buildInvoicePdfDocument } from '../../../../lib/invoice-pdf-document.js';
import { buildFormPdfDocument } from '../../../../lib/form-pdf-document.js';

type ShareRow = {
  id: number;
  company_id: number;
  link_type: string;
  target_type: string;
  target_id: string;
  title: string;
  permissions_json: string | null;
  expires_at: string | null;
  password_hash: string | null;
  max_uses: number | null;
  use_count: number;
  revoked: number;
};

export default async function handler(req: Request, res: Response) {
  try {
    const { token } = req.params as { token: string };
    const action = (req.query.action as string | undefined) ?? 'view';
    const proofRaw = (req.query.proof as string | undefined) ?? '';

    if (!token || token.length < 20) {
      return res.status(400).json({ error: 'Invalid token', code: 'INVALID' });
    }
    if (action !== 'view' && action !== 'download') {
      return res.status(400).json({ error: 'action must be view or download' });
    }

    const tokenHash = hashToken(token);

    const [rows] = await db.execute(sql`
      SELECT id, company_id, link_type, target_type, target_id,
             title, permissions_json, expires_at, password_hash,
             max_uses, use_count, revoked
      FROM secure_share_links
      WHERE token_hash = ${tokenHash}
      LIMIT 1
    `) as unknown as [ShareRow[], unknown];

    const link = rows?.[0];

    if (!link) {
      return res.status(404).json({ error: 'This link does not exist or has been removed.', code: 'NOT_FOUND' });
    }
    if (link.revoked) {
      return res.status(410).json({ error: 'This link has been revoked.', code: 'REVOKED' });
    }
    if (link.expires_at && new Date(link.expires_at) < new Date()) {
      return res.status(410).json({ error: 'This link has expired.', code: 'EXPIRED' });
    }
    if (link.max_uses !== null && link.use_count >= link.max_uses) {
      return res.status(410).json({ error: 'This link has reached its maximum number of uses.', code: 'MAX_USES' });
    }

    // ── Password-protected link: verify access proof ──────────────────────────
    if (link.password_hash) {
      if (!proofRaw || proofRaw.length < 20) {
        return res.status(403).json({
          error: 'Password required. Validate the password first.',
          code: 'PASSWORD_REQUIRED',
        });
      }

      const proofHash = hashToken(proofRaw);

      // Look up the proof — must be for THIS share link, unexpired, and unused
      const [proofRows] = await db.execute(sql`
        SELECT id, share_link_id, expires_at, used
        FROM secure_share_access_proofs
        WHERE proof_hash = ${proofHash}
        LIMIT 1
      `) as unknown as [Array<{
        id: number;
        share_link_id: number;
        expires_at: string;
        used: number;
      }>, unknown];

      const proof = proofRows?.[0];

      if (!proof) {
        return res.status(403).json({ error: 'Invalid or expired access proof.', code: 'PROOF_INVALID' });
      }
      if (proof.share_link_id !== link.id) {
        // Proof was issued for a different share link — cross-token reuse attempt
        return res.status(403).json({ error: 'Access proof is not valid for this link.', code: 'PROOF_MISMATCH' });
      }
      if (proof.used) {
        return res.status(403).json({ error: 'Access proof has already been used.', code: 'PROOF_USED' });
      }
      if (new Date(proof.expires_at) < new Date()) {
        return res.status(403).json({ error: 'Access proof has expired. Please re-enter the password.', code: 'PROOF_EXPIRED' });
      }

      // Consume the proof atomically before generating the PDF
      const [consumeResult] = await db.execute(sql`
        UPDATE secure_share_access_proofs
        SET used = 1
        WHERE id = ${proof.id} AND used = 0
      `) as unknown as [{ affectedRows: number }, unknown];

      if ((consumeResult as { affectedRows: number }).affectedRows === 0) {
        // Race condition — another request consumed it first
        return res.status(403).json({ error: 'Access proof has already been used.', code: 'PROOF_USED' });
      }
    }

    // ── Verify the requested action is permitted ──────────────────────────────
    let permissions: string[] = ['view'];
    try {
      if (link.permissions_json) permissions = JSON.parse(link.permissions_json) as string[];
    } catch { /* use default */ }

    if (action === 'download' && !permissions.includes('download')) {
      return res.status(403).json({ error: 'Download not permitted for this link.', code: 'FORBIDDEN' });
    }
    if (action === 'view' && !permissions.includes('view')) {
      return res.status(403).json({ error: 'View not permitted for this link.', code: 'FORBIDDEN' });
    }

    const companyId = link.company_id;
    const targetId = Number(link.target_id);

    if (!Number.isInteger(targetId) || targetId <= 0) {
      return res.status(400).json({ error: 'Invalid target reference.' });
    }

    // ── Generate PDF based on target type ────────────────────────────────────
    let pdfBytes: Uint8Array;
    let filename: string;

    if (link.target_type === 'estimate') {
      const doc = await buildEstimatePdfDocument(companyId, targetId);
      if (!doc) return res.status(404).json({ error: 'Document not found or no longer available.' });
      pdfBytes = doc.pdfBytes;
      filename = doc.filename;
    } else if (link.target_type === 'invoice') {
      const doc = await buildInvoicePdfDocument(companyId, targetId);
      if (!doc) return res.status(404).json({ error: 'Document not found or no longer available.' });
      pdfBytes = doc.pdfBytes;
      filename = doc.filename;
    } else if (link.target_type === 'completed_form' || link.target_type === 'job_form') {
      // completed_form is the canonical type; job_form is the legacy alias
      const doc = await buildFormPdfDocument(companyId, targetId);
      if (!doc) return res.status(404).json({ error: 'Document not found or no longer available.' });
      pdfBytes = doc.pdfBytes;
      filename = doc.filename;
    } else {
      return res.status(422).json({ error: `Content delivery not supported for type: ${link.target_type}` });
    }

    // ── Increment use_count and log ───────────────────────────────────────────
    await db.execute(sql`
      UPDATE secure_share_links
      SET use_count = use_count + 1, updated_at = NOW()
      WHERE id = ${link.id}
    `);
    try {
      await db.execute(sql`
        INSERT INTO secure_share_events
          (share_link_id, company_id, event_type, ip_address, user_agent, created_at)
        VALUES
          (${link.id}, ${companyId}, ${action === 'download' ? 'downloaded' : 'viewed'},
           ${req.ip ?? null}, ${(req.headers['user-agent'] ?? '').slice(0, 500)}, NOW())
      `);
    } catch { /* best-effort */ }

    // ── Stream PDF ────────────────────────────────────────────────────────────
    const disposition = action === 'download'
      ? `attachment; filename="${filename}"`
      : `inline; filename="${filename}"`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', disposition);
    res.setHeader('Content-Length', pdfBytes.length);
    res.setHeader('Cache-Control', 'no-store');
    return res.end(Buffer.from(pdfBytes));
  } catch (e) {
    console.error('GET /api/secure-share/:token/content error:', e);
    return res.status(500).json({ error: 'Failed to load document' });
  }
}
