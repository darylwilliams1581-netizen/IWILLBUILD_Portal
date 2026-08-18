/**
 * GET /api/job-forms/:id/export-pdf
 * ─────────────────────────────────────────────────────────────────────────────
 * Authenticated endpoint — returns the completed-form PDF as a binary stream.
 *
 * Query params:
 *   ?action=view      → Content-Disposition: inline  (browser renders PDF)
 *   ?action=download  → Content-Disposition: attachment (forces save dialog)
 *
 * Security:
 *   - Requires a valid session (401 if missing)
 *   - Requires the user to belong to the same company as the submission (404 if not)
 *   - Requires forms permission (403 if missing)
 *   - Cross-company access is impossible — buildFormPdfDocument() is company-scoped
 */
import type { Request, Response } from 'express';
import { eq } from 'drizzle-orm';
import { db } from '../../../../db/client.js';
import { profiles } from '../../../../db/schema.js';
import { buildFormPdfDocument } from '../../../../lib/form-pdf-document.js';
import { getAuth } from '../../../../../lib/auth/auth.js';

export default async function handler(req: Request, res: Response) {
  try {
    const auth = getAuth();
    const headers = new Headers();
    for (const [key, value] of Object.entries(req.headers)) {
      if (value) headers.set(key, Array.isArray(value) ? value[0] : value);
    }
    const session = await auth.api.getSession({ headers });
    if (!session?.user) return res.status(401).json({ error: 'Unauthorised' });

    const profile = await db.query.profiles.findFirst({ where: eq(profiles.userId, session.user.id) });
    if (!profile?.companyId) return res.status(403).json({ error: 'No company' });
    if (profile.permForms === false && profile.role !== 'owner' && profile.role !== 'admin') {
      return res.status(403).json({ error: 'No forms permission' });
    }

    const submissionId = Number(req.params.id);
    if (!Number.isInteger(submissionId) || submissionId <= 0) {
      return res.status(400).json({ error: 'Invalid submission ID' });
    }

    const action = (req.query.action as string | undefined) ?? 'download';
    if (action !== 'view' && action !== 'download') {
      return res.status(400).json({ error: 'action must be view or download' });
    }

    // Build PDF — company-scoped, returns null if not found or wrong company
    const doc = await buildFormPdfDocument(profile.companyId, submissionId);
    if (!doc) return res.status(404).json({ error: 'Submission not found' });

    const disposition = action === 'view'
      ? `inline; filename="${doc.filename}"`
      : `attachment; filename="${doc.filename}"`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', disposition);
    res.setHeader('Content-Length', doc.pdfBytes.length);
    res.setHeader('Cache-Control', 'no-store');
    return res.end(Buffer.from(doc.pdfBytes));
  } catch (error) {
    console.error('GET /api/job-forms/:id/export-pdf error:', error);
    if (!res.headersSent) return res.status(500).json({ error: 'Failed to generate PDF' });
  }
}
