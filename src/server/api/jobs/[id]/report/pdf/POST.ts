/**
 * POST /api/jobs/:id/report/pdf
 *
 * Generates a photo report PDF server-side using pdf-lib.
 * Embeds compressed preview images (not full originals) with captions
 * and categories. Returns the PDF as application/pdf.
 *
 * Body:
 *   photoIds:    number[]   — ordered list of photo IDs to include
 *   captions:    Record<number, string>  — per-photo caption overrides
 *   categories:  Record<number, string>  — per-photo category overrides
 *   title:       string     — report title (defaults to job name)
 *   dateRange:   string     — optional date range label
 *   layout:      'grid' | 'single'  — 2-up grid (default) or 1-per-page
 */
import type { Request, Response } from 'express';
import { PDFDocument, rgb, StandardFonts, PageSizes } from 'pdf-lib';
import { db } from '../../../../../db/client.js';
import { jobPhotos, profiles, jobs, companies } from '../../../../../db/schema.js';
import { eq, and, inArray } from 'drizzle-orm';
import { getAuth } from '../../../../../../lib/auth/auth.js';
import { getDownloadBuffer } from '../../../../../storage/storage-service.js';

const PHOTO_BUCKET = 'job-photos';

// ── Layout constants ──────────────────────────────────────────────────────────
const PAGE_W = PageSizes.A4[0];   // 595.28 pt
const PAGE_H = PageSizes.A4[1];   // 841.89 pt
const MARGIN = 36;
const HEADER_H = 72;
const FOOTER_H = 28;
const CONTENT_W = PAGE_W - MARGIN * 2;
const CONTENT_TOP = PAGE_H - MARGIN - HEADER_H;
const CONTENT_BOTTOM = MARGIN + FOOTER_H;
const CONTENT_H = CONTENT_TOP - CONTENT_BOTTOM;

// Grid: 2 columns, 3 rows = 6 photos per page
const GRID_COLS = 2;
const GRID_ROWS = 3;
const GRID_GAP = 12;
const CELL_W = (CONTENT_W - GRID_GAP * (GRID_COLS - 1)) / GRID_COLS;
const CAPTION_H = 28; // space below each image for caption text
const CELL_H = (CONTENT_H - GRID_GAP * (GRID_ROWS - 1)) / GRID_ROWS;
const IMG_H = CELL_H - CAPTION_H;

// Single layout: 1 photo per page, larger
const SINGLE_IMG_H = CONTENT_H - 48;

// ── Colour palette ────────────────────────────────────────────────────────────
const COL_ORANGE = rgb(0.976, 0.451, 0.086);  // #7C3AED
const COL_DARK   = rgb(0.216, 0.255, 0.318);  // #374151
const COL_GREY   = rgb(0.557, 0.600, 0.647);  // #8E99A5
const COL_LIGHT  = rgb(0.949, 0.953, 0.957);  // #F2F3F4
const COL_WHITE  = rgb(1, 1, 1);

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Clamp a string to maxLen chars with ellipsis */
function truncate(s: string, maxLen: number): string {
  return s.length <= maxLen ? s : s.slice(0, maxLen - 1) + '…';
}

/** Compute image draw dimensions preserving aspect ratio within a box */
function fitImage(imgW: number, imgH: number, boxW: number, boxH: number) {
  const scale = Math.min(boxW / imgW, boxH / imgH);
  return { w: imgW * scale, h: imgH * scale };
}

export default async function handler(req: Request, res: Response) {
  try {
    // ── Auth ──────────────────────────────────────────────────────────────────
    const auth = getAuth();
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) {
      if (v) headers.set(k, Array.isArray(v) ? v[0] : v);
    }
    const session = await auth.api.getSession({ headers });
    if (!session?.user) return res.status(401).json({ error: 'Unauthorised' });

    const profile = await db.query.profiles.findFirst({
      where: eq(profiles.userId, session.user.id),
    });
    if (!profile?.companyId) return res.status(403).json({ error: 'No company' });

    const jobId = parseInt(String(req.params.id), 10);
    if (isNaN(jobId)) return res.status(400).json({ error: 'Invalid job ID' });

    // ── Validate job ownership ────────────────────────────────────────────────
    const job = await db.query.jobs.findFirst({
      where: and(eq(jobs.id, jobId), eq(jobs.companyId, profile.companyId)),
    });
    if (!job) return res.status(404).json({ error: 'Job not found' });

    const company = await db.query.companies.findFirst({
      where: eq(companies.id, profile.companyId),
    });

    // ── Parse body ────────────────────────────────────────────────────────────
    const body = req.body as {
      photoIds?: number[];
      captions?: Record<string, string>;
      categories?: Record<string, string>;
      title?: string;
      dateRange?: string;
      layout?: 'grid' | 'single';
    };

    const photoIds = Array.isArray(body.photoIds) && body.photoIds.length > 0
      ? body.photoIds.map(Number).filter(n => !isNaN(n))
      : [];

    if (photoIds.length === 0) {
      return res.status(400).json({ error: 'No photos selected' });
    }
    if (photoIds.length > 100) {
      return res.status(400).json({ error: 'Maximum 100 photos per report' });
    }

    const captionMap: Record<number, string> = {};
    const categoryMap: Record<number, string> = {};
    if (body.captions) {
      for (const [k, v] of Object.entries(body.captions)) captionMap[Number(k)] = v;
    }
    if (body.categories) {
      for (const [k, v] of Object.entries(body.categories)) categoryMap[Number(k)] = v;
    }

    const reportTitle = body.title?.trim() || `${job.name ?? `Job #${job.jobNumber ?? jobId}`} — Site Photos`;
    const dateRange = body.dateRange?.trim() || '';
    const layout = body.layout === 'single' ? 'single' : 'grid';

    // ── Fetch photo rows ──────────────────────────────────────────────────────
    const rows = await db
      .select()
      .from(jobPhotos)
      .where(
        and(
          inArray(jobPhotos.id, photoIds),
          eq(jobPhotos.jobId, jobId),
          eq(jobPhotos.companyId, profile.companyId),
        )
      );

    // Preserve caller's ordering
    const rowMap = new Map(rows.map(r => [r.id, r]));
    const orderedRows = photoIds.map(id => rowMap.get(id)).filter(Boolean) as typeof rows;

    if (orderedRows.length === 0) {
      return res.status(404).json({ error: 'No matching photos found' });
    }

    // ── Build PDF ─────────────────────────────────────────────────────────────
    const pdfDoc = await PDFDocument.create();
    const fontBold   = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const fontReg    = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontObliq  = await pdfDoc.embedFont(StandardFonts.HelveticaOblique);

    // ── Helper: draw page header ──────────────────────────────────────────────
    function drawHeader(page: ReturnType<typeof pdfDoc.addPage>, pageNum: number, totalPages: number) {
      // Printer-friendly: 3pt accent rule + plain dark text on white
      page.drawLine({ start: { x: 0, y: PAGE_H - 3 }, end: { x: PAGE_W, y: PAGE_H - 3 }, thickness: 3, color: COL_ORANGE });
      // Title
      page.drawText(truncate(reportTitle, 60), {
        x: MARGIN, y: PAGE_H - MARGIN - 18,
        font: fontBold, size: 13, color: COL_DARK,
      });
      // Subtitle row
      const subtitle = [
        company?.name ?? '',
        job.jobNumber ? `Job #${job.jobNumber}` : '',
        dateRange,
      ].filter(Boolean).join('  ·  ');
      if (subtitle) {
        page.drawText(truncate(subtitle, 80), {
          x: MARGIN, y: PAGE_H - MARGIN - 32,
          font: fontReg, size: 8, color: COL_GREY,
        });
      }
      // Page number (right-aligned)
      const pageLabel = `${pageNum} / ${totalPages}`;
      const pageLabelW = fontReg.widthOfTextAtSize(pageLabel, 8);
      page.drawText(pageLabel, {
        x: PAGE_W - MARGIN - pageLabelW, y: PAGE_H - MARGIN - 18,
        font: fontReg, size: 8, color: COL_GREY,
      });
      // Photo count
      page.drawText(`${orderedRows.length} photo${orderedRows.length !== 1 ? 's' : ''}`, {
        x: MARGIN, y: PAGE_H - MARGIN - 46,
        font: fontReg, size: 7, color: COL_GREY,
      });
      // Thin separator rule
      page.drawLine({
        start: { x: MARGIN, y: PAGE_H - MARGIN - HEADER_H },
        end: { x: PAGE_W - MARGIN, y: PAGE_H - MARGIN - HEADER_H },
        thickness: 0.5, color: COL_LIGHT,
      });
    }

    // ── Helper: draw page footer ──────────────────────────────────────────────
    function drawFooter(page: ReturnType<typeof pdfDoc.addPage>) {
      page.drawLine({
        start: { x: MARGIN, y: MARGIN + FOOTER_H - 4 },
        end: { x: PAGE_W - MARGIN, y: MARGIN + FOOTER_H - 4 },
        thickness: 0.5, color: COL_LIGHT,
      });
      page.drawText('Site Photo Report — generated by IWILLBUILD', {
        x: MARGIN, y: MARGIN + 8,
        font: fontReg, size: 7, color: COL_GREY,
      });
      const now = new Date().toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' });
      const dateW = fontReg.widthOfTextAtSize(now, 7);
      page.drawText(now, {
        x: PAGE_W - MARGIN - dateW, y: MARGIN + 8,
        font: fontReg, size: 7, color: COL_GREY,
      });
    }

    // ── Embed images (fetch preview/thumbnail buffers) ────────────────────────
    type EmbedResult = {
      row: typeof orderedRows[0];
      image: Awaited<ReturnType<typeof pdfDoc.embedJpg>> | null;
      imgW: number;
      imgH: number;
    };

    const embeds: EmbedResult[] = await Promise.all(
      orderedRows.map(async (row) => {
        try {
          // Prefer preview (~1000px) → thumbnail (~300px) → original
          const storageKey = row.previewKey ?? row.thumbnailKey ?? row.filename;
          const { buffer } = await getDownloadBuffer(storageKey, PHOTO_BUCKET);

          // pdf-lib supports JPEG and PNG natively
          const mime = (row.previewKey ?? row.thumbnailKey)
            ? (row.previewMimeType ?? row.thumbnailMimeType ?? 'image/jpeg')
            : (row.mimeType ?? 'image/jpeg');

          let image;
          if (mime === 'image/png') {
            image = await pdfDoc.embedPng(buffer);
          } else {
            image = await pdfDoc.embedJpg(buffer);
          }
          return { row, image, imgW: image.width, imgH: image.height };
        } catch (err) {
          console.warn(`[report/pdf] Failed to embed photo ${row.id}:`, err);
          return { row, image: null, imgW: 0, imgH: 0 };
        }
      })
    );

    // ── Render pages ──────────────────────────────────────────────────────────
    if (layout === 'single') {
      // One photo per page
      for (let i = 0; i < embeds.length; i++) {
        const { row, image, imgW, imgH } = embeds[i];
        const page = pdfDoc.addPage(PageSizes.A4);
        // Headers/footers are drawn after all pages are created (need total count)
        // Store page ref for second pass
        void page; void row; void image; void imgW; void imgH;
      }
      // Second pass: draw content
      const pages = pdfDoc.getPages();
      const total = pages.length;
      for (let i = 0; i < embeds.length; i++) {
        const { row, image, imgW, imgH } = embeds[i];
        const page = pages[i];
        drawHeader(page, i + 1, total);
        drawFooter(page);

        const caption = captionMap[row.id] ?? row.caption ?? '';
        const category = categoryMap[row.id] ?? row.category ?? '';

        if (image && imgW > 0 && imgH > 0) {
          const { w, h } = fitImage(imgW, imgH, CONTENT_W, SINGLE_IMG_H);
          const x = MARGIN + (CONTENT_W - w) / 2;
          const y = CONTENT_BOTTOM + (SINGLE_IMG_H - h) / 2 + 32;
          page.drawImage(image, { x, y, width: w, height: h });
        } else {
          // Placeholder box
          page.drawRectangle({ x: MARGIN, y: CONTENT_BOTTOM + 32, width: CONTENT_W, height: SINGLE_IMG_H, color: COL_LIGHT });
          page.drawText('Image unavailable', { x: MARGIN + 8, y: CONTENT_BOTTOM + SINGLE_IMG_H / 2 + 32, font: fontReg, size: 10, color: COL_GREY });
        }

        // Caption / category below image
        let captionY = CONTENT_BOTTOM + 24;
        if (category) {
          const catLabel = category.toUpperCase();
          page.drawText(`[${catLabel}]`, { x: MARGIN, y: captionY + 2, font: fontBold, size: 7.5, color: COL_DARK });
          captionY -= 14;
        }
        if (caption) {
          page.drawText(truncate(caption, 120), { x: MARGIN, y: captionY, font: fontObliq, size: 9, color: COL_DARK });
        }
      }
    } else {
      // Grid layout: 2 cols × 3 rows = 6 per page
      const perPage = GRID_COLS * GRID_ROWS;
      const pageCount = Math.ceil(embeds.length / perPage);

      // First pass: create all pages
      for (let p = 0; p < pageCount; p++) pdfDoc.addPage(PageSizes.A4);

      // Second pass: draw
      const pages = pdfDoc.getPages();
      for (let p = 0; p < pageCount; p++) {
        const page = pages[p];
        drawHeader(page, p + 1, pageCount);
        drawFooter(page);

        const slice = embeds.slice(p * perPage, (p + 1) * perPage);
        for (let ci = 0; ci < slice.length; ci++) {
          const { row, image, imgW, imgH } = slice[ci];
          const col = ci % GRID_COLS;
          const rowIdx = Math.floor(ci / GRID_COLS);

          const cellX = MARGIN + col * (CELL_W + GRID_GAP);
          // Rows go top-to-bottom
          const cellY = CONTENT_TOP - (rowIdx + 1) * CELL_H - rowIdx * GRID_GAP;

          const caption = captionMap[row.id] ?? row.caption ?? '';
          const category = categoryMap[row.id] ?? row.category ?? '';

          // Image area (above caption strip)
          const imgBoxY = cellY + CAPTION_H;
          const imgBoxH = IMG_H;

          if (image && imgW > 0 && imgH > 0) {
            const { w, h } = fitImage(imgW, imgH, CELL_W, imgBoxH);
            const ix = cellX + (CELL_W - w) / 2;
            const iy = imgBoxY + (imgBoxH - h) / 2;
            page.drawImage(image, { x: ix, y: iy, width: w, height: h });
          } else {
            page.drawRectangle({ x: cellX, y: imgBoxY, width: CELL_W, height: imgBoxH, color: COL_LIGHT });
            page.drawText('Unavailable', { x: cellX + 4, y: imgBoxY + imgBoxH / 2, font: fontReg, size: 8, color: COL_GREY });
          }

          // Caption strip below image
          page.drawRectangle({ x: cellX, y: cellY, width: CELL_W, height: CAPTION_H, color: rgb(0.97, 0.97, 0.97) });

          let textX = cellX + 4;
          if (category) {
            const catLabel = `[${category.toUpperCase()}]`;
            page.drawText(catLabel, { x: textX, y: cellY + 10, font: fontBold, size: 6.5, color: COL_DARK });
            textX += fontBold.widthOfTextAtSize(catLabel, 6.5) + 4;
          }
          if (caption) {
            const maxCaptionW = CELL_W - (textX - cellX) - 4;
            const maxChars = Math.floor(maxCaptionW / fontObliq.widthOfTextAtSize('m', 7.5));
            page.drawText(truncate(caption, Math.max(maxChars, 12)), {
              x: textX, y: cellY + 10,
              font: fontObliq, size: 7.5, color: COL_DARK,
            });
          }
        }
      }
    }

    // ── Serialise and return ──────────────────────────────────────────────────
    const pdfBytes = await pdfDoc.save();
    const safeTitle = reportTitle.replace(/[^a-zA-Z0-9\s-]/g, '').replace(/\s+/g, '-').slice(0, 60);
    const filename = `${safeTitle}-photos.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', String(pdfBytes.length));
    res.end(Buffer.from(pdfBytes));
  } catch (error) {
    console.error('POST /api/jobs/:id/report/pdf error:', error);
    res.status(500).json({ error: 'Failed to generate PDF' });
  }
}
