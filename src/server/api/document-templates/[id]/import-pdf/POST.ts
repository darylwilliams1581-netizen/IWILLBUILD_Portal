/**
 * POST /api/document-templates/:id/import-pdf
 * Import a PDF into the document builder as image blocks (one per page).
 * Uses pdfjs-dist on the server to render each page to a PNG buffer,
 * saves them to shared storage, and returns image blocks.
 *
 * Multipart form: field "pdf" = the .pdf file
 * Returns: { blocks, sourceFileName, pageCount, warnings }
 */
import type { Request, Response } from 'express';
import { getAuth } from '../../../../../lib/auth/auth.js';
import { profiles } from '../../../../db/schema.js';
import { eq } from 'drizzle-orm';
import { db } from '../../../../db/client.js';
import { sql } from 'drizzle-orm';
import { parseMultipartForm } from '../../../../lib/file-upload.js';
import path from 'path';
import fs from 'fs/promises';
import crypto from 'crypto';
import type { DocumentBlock } from '../../../../../components/DocumentBuilder/types.js';

const UPLOAD_DIR = '/shared-storage/public/assets/studio-imports';

export default async function handler(req: Request, res: Response) {
  try {
    const auth = getAuth();
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) {
      if (v) headers.set(k, Array.isArray(v) ? v[0] : v);
    }
    const session = await auth.api.getSession({ headers });
    if (!session?.user) return res.status(401).json({ error: 'Unauthorised' });

    const [profile] = await db.select().from(profiles).where(eq(profiles.userId, session.user.id)).limit(1);
    if (!profile?.companyId) return res.status(403).json({ error: 'No company' });

    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid template ID' });

    // Verify template ownership
    const [rows] = await db.execute(sql.raw(
      `SELECT id FROM document_templates WHERE id = ${id} AND company_id = ${profile.companyId} LIMIT 1`
    )) as unknown as [Array<{ id: number }>, unknown];
    if (!rows?.[0]) return res.status(404).json({ error: 'Template not found' });

    // Parse multipart upload
    const { files } = await parseMultipartForm(req, { maxFileSize: 50 * 1024 * 1024 });
    const pdfFile = files.find((f) => f.fieldname === 'pdf' || f.originalname?.toLowerCase().endsWith('.pdf'));
    if (!pdfFile?.buffer) {
      return res.status(400).json({ error: 'No PDF file uploaded. Upload a .pdf file in the "pdf" field.' });
    }

    if (pdfFile.mimetype !== 'application/pdf' && !pdfFile.originalname?.toLowerCase().endsWith('.pdf')) {
      return res.status(400).json({ error: 'Only PDF files are supported.' });
    }

    await fs.mkdir(UPLOAD_DIR, { recursive: true });

    const blocks: DocumentBlock[] = [];
    const warnings: string[] = [];

    // Try to render PDF pages using pdfjs-dist (canvas-free, node-compatible)
    try {
      // Use dynamic import — pdfjs-dist is SSR-stubbed so we need the real module
      // We use the legacy build which works in Node without canvas
      const pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs' as string).catch(() => null);

      if (!pdfjsLib) {
        // Fallback: store the whole PDF as a single embedded-PDF block
        const safeName = `pdf-import-${crypto.randomBytes(8).toString('hex')}.pdf`;
        const filePath = path.join(UPLOAD_DIR, safeName);
        await fs.writeFile(filePath, pdfFile.buffer);
        const publicUrl = `/airo-assets/uploads/studio-imports/${safeName}`;

        blocks.push({
          id: crypto.randomUUID(),
          type: 'rich_text',
          html: `<p><a href="${publicUrl}" target="_blank" rel="noopener noreferrer">📄 ${pdfFile.originalname ?? 'document.pdf'}</a></p>`,
        });
        warnings.push('PDF rendering not available — stored as a download link instead.');
      } else {
        // Render each page to a PNG and create image blocks
        const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(pdfFile.buffer) });
        const pdfDoc = await loadingTask.promise;
        const pageCount = pdfDoc.numPages;

        // Cap at 20 pages to avoid huge imports
        const maxPages = Math.min(pageCount, 20);
        if (pageCount > 20) {
          warnings.push(`PDF has ${pageCount} pages — only the first 20 were imported.`);
        }

        for (let pageNum = 1; pageNum <= maxPages; pageNum++) {
          try {
            const page = await pdfDoc.getPage(pageNum);
            const viewport = page.getViewport({ scale: 1.5 });

            // Use pdfjs node canvas if available, otherwise skip rendering
            // and store a placeholder text block
            const { createCanvas } = await import('canvas' as string).catch(() => ({ createCanvas: null }));

            if (createCanvas) {
              const canvas = (createCanvas as (w: number, h: number) => { getContext: (t: string) => unknown; toBuffer: (t: string) => Buffer })(
                Math.round(viewport.width),
                Math.round(viewport.height)
              );
              const ctx = canvas.getContext('2d');
              await page.render({ canvasContext: ctx as unknown as CanvasRenderingContext2D, viewport }).promise;
              const imgBuffer = canvas.toBuffer('image/png');

              const safeName = `pdf-p${pageNum}-${crypto.randomBytes(6).toString('hex')}.png`;
              const filePath = path.join(UPLOAD_DIR, safeName);
              await fs.writeFile(filePath, imgBuffer);
              const publicUrl = `/airo-assets/uploads/studio-imports/${safeName}`;

              blocks.push({
                id: crypto.randomUUID(),
                type: 'image',
                src: publicUrl,
                alt: `Page ${pageNum}`,
                width: '100%',
                align: 'center',
              });
            } else {
              // No canvas — extract text content instead
              const textContent = await page.getTextContent();
              const pageText = textContent.items
                .map((item: unknown) => (item as { str?: string }).str ?? '')
                .join(' ')
                .trim();

              if (pageText) {
                blocks.push({
                  id: crypto.randomUUID(),
                  type: 'text',
                  content: pageText,
                  align: 'left',
                });
              }
            }
          } catch (pageErr) {
            warnings.push(`Page ${pageNum} could not be rendered: ${String(pageErr)}`);
          }
        }

        if (blocks.length === 0) {
          warnings.push('No content could be extracted from this PDF.');
          blocks.push({
            id: crypto.randomUUID(),
            type: 'text',
            content: `[PDF: ${pdfFile.originalname ?? 'document.pdf'} — ${pageCount} pages]`,
            align: 'left',
          });
        }
      }
    } catch (pdfErr) {
      console.error('PDF import error:', pdfErr);
      warnings.push(`PDF processing error: ${String(pdfErr)}`);
      // Fallback block
      blocks.push({
        id: crypto.randomUUID(),
        type: 'text',
        content: `[PDF: ${pdfFile.originalname ?? 'document.pdf'}]`,
        align: 'left',
      });
    }

    return res.json({
      blocks,
      sourceFileName: pdfFile.originalname ?? 'document.pdf',
      pageCount: blocks.length,
      warnings: warnings.slice(0, 10),
    });
  } catch (err) {
    console.error('POST /api/document-templates/:id/import-pdf error:', err);
    return res.status(500).json({ error: 'Failed to import PDF' });
  }
}
