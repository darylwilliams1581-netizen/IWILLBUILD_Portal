/**
 * POST /api/safety/documents/new
 * Create a new policy/procedure document record from scratch (no file upload).
 * Stores a minimal text stub so the record is immediately downloadable/viewable.
 */
import type { Request, Response } from 'express';
import { db } from '../../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getAuth } from '../../../../../lib/auth/auth.js';
import { profiles } from '../../../../db/schema.js';
import { eq } from 'drizzle-orm';
import { writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { ResultSetHeader } from 'mysql2';

const SAFETY_DIR = '/shared-storage/public/assets/safety-docs';

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

    const { title, docType, reviewDate, notes } = req.body as Record<string, string>;
    if (!title?.trim()) return res.status(400).json({ error: 'Title is required' });

    // Write a minimal plain-text stub so the record has a downloadable file
    const storedName = `${randomUUID()}.txt`;
    const originalName = `${title.trim()}.txt`;
    const content = [
      title.trim(),
      docType ? `Type: ${docType}` : '',
      reviewDate ? `Review date: ${reviewDate}` : '',
      notes ? `\n${notes}` : '',
    ].filter(Boolean).join('\n');

    await mkdir(SAFETY_DIR, { recursive: true });
    await writeFile(join(SAFETY_DIR, storedName), content, 'utf8');

    const [result] = await db.execute(sql`
      INSERT INTO safety_documents
        (company_id, title, doc_type, original_name, stored_name, mime_type,
         size_bytes, review_date, notes, uploaded_by_user_id)
      VALUES
        (${profile.companyId}, ${title.trim()}, ${docType ?? 'policy'},
         ${originalName}, ${storedName}, ${'text/plain'},
         ${Buffer.byteLength(content, 'utf8')}, ${reviewDate ?? null},
         ${notes ?? null}, ${session.user.id})
    `) as unknown as [ResultSetHeader, unknown];

    const [rows] = await db.execute(
      sql`SELECT * FROM safety_documents WHERE id = ${result.insertId}`
    ) as unknown as [Array<Record<string, unknown>>, unknown];

    res.status(201).json({ document: rows?.[0] ?? null });
  } catch (err) {
    console.error('POST /api/safety/documents/new error:', err);
    res.status(500).json({ error: 'Failed to create document' });
  }
}
