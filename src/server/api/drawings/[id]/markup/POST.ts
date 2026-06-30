/**
 * POST /api/drawings/:id/markup
 * ─────────────────────────────────────────────────────────────────────────────
 * Accepts a base64-encoded marked-up PDF (produced by the client-side canvas
 * overlay baked into the PDF via pdf-lib), saves it as a new company_files
 * record, and updates drawing_records.marked_up_file_id.
 *
 * The original file (original_file_id) is NEVER modified.
 *
 * Body: { pdfBase64: string }  — the full PDF bytes as base64
 * Returns: { ok: true, markedUpFileId, fileUrl }
 */
import type { Request, Response } from 'express';
import { db } from '../../../../db/client.js';
import { companyFiles, profiles } from '../../../../db/schema.js';
import { eq, sql } from 'drizzle-orm';
import { getAuth } from '../../../../../lib/auth/auth.js';
import { saveFile, BUCKET_COMPANY_FILES } from '../../../../storage/storage-service.js';
import type { ResultSetHeader } from 'mysql2';

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

    const id = parseInt(req.params.id, 10);
    if (!id) return res.status(400).json({ error: 'Invalid drawing id' });

    // Verify drawing belongs to this company
    const [drawingRows] = await db.execute(sql`
      SELECT id, title, original_file_id FROM drawing_records
      WHERE id = ${id} AND company_id = ${profile.companyId}
    `) as unknown as [Array<{ id: number; title: string; original_file_id: number }>, unknown];

    if (!drawingRows.length) return res.status(404).json({ error: 'Drawing not found' });
    const drawing = drawingRows[0];

    const { pdfBase64 } = req.body as { pdfBase64?: string };
    if (!pdfBase64) return res.status(400).json({ error: 'pdfBase64 is required' });

    // Decode base64 → Buffer
    const buffer = Buffer.from(pdfBase64, 'base64');
    if (buffer.length < 100) return res.status(400).json({ error: 'Invalid PDF data' });

    // Save as new file
    const markedUpName = `${drawing.title.replace(/[^a-zA-Z0-9_-]/g, '_')}_markup_${Date.now()}.pdf`;
    const saved = await saveFile({
      buffer,
      originalName: markedUpName,
      mimeType: 'application/pdf',
      bucket: BUCKET_COMPANY_FILES,
    });

    // Insert company_files record for the marked-up copy
    const result = await db.insert(companyFiles).values({
      companyId: profile.companyId,
      jobId: null,
      uploadedByUserId: session.user.id,
      originalName: markedUpName,
      storedName: saved.storageKey,
      mimeType: 'application/pdf',
      sizeBytes: saved.sizeBytes,
      fileCategory: 'Job',
      label: `Marked-up: ${drawing.title}`,
      notes: null,
    });

    const header = result[0] as unknown as ResultSetHeader;
    const markedUpFileId = (header as ResultSetHeader).insertId;

    // Update drawing_records — set marked_up_file_id
    await db.execute(sql`
      UPDATE drawing_records
      SET marked_up_file_id = ${markedUpFileId}, updated_at = NOW()
      WHERE id = ${id} AND company_id = ${profile.companyId}
    `);

    res.json({ ok: true, markedUpFileId });
  } catch (err) {
    console.error('POST /api/drawings/:id/markup error:', err);
    res.status(500).json({ error: 'Failed to save markup' });
  }
}
