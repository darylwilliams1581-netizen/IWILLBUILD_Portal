/**
 * GET /api/safety/generated-posters/:id/pdf
 *
 * Generates and streams a real PDF for a saved safety poster.
 * Uses pdf-lib to build a clean A4 document from the stored data_json.
 */
import type { Request, Response } from 'express';
import { db } from '../../../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getSessionAndProfile } from '../../../../../lib/auth-middleware.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function safe(v: unknown): string {
  if (v == null) return '';
  return String(v)
    .replace(/[–—]/g, '-')
    .replace(/['']/g, "'")
    .replace(/[""]/g, '"')
    .replace(/…/g, '...')
    .replace(/[^\x20-\x7E\n]/g, '?');
}

function wrapText(text: string, font: { widthOfTextAtSize: (t: string, s: number) => number }, size: number, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const para of safe(text).split(/\r?\n/)) {
    const words = para.split(/\s+/).filter(Boolean);
    if (!words.length) { lines.push(''); continue; }
    let cur = '';
    for (const word of words) {
      const candidate = cur ? `${cur} ${word}` : word;
      if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
        cur = candidate;
      } else {
        if (cur) lines.push(cur);
        cur = word;
      }
    }
    if (cur) lines.push(cur);
  }
  return lines.length ? lines : [''];
}

// ── PDF builder ───────────────────────────────────────────────────────────────

async function buildPosterPdf(
  posterType: string,
  title: string,
  data: Record<string, unknown>,
): Promise<Uint8Array> {
  const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');

  const PAGE_W = 595.28;
  const PAGE_H = 841.89;
  const MARGIN = 48;
  const CONTENT_W = PAGE_W - MARGIN * 2;

  const PURPLE = rgb(0.486, 0.227, 0.929);
  const DARK   = rgb(0.059, 0.090, 0.165);
  const SLATE  = rgb(0.286, 0.333, 0.412);
  const MUTED  = rgb(0.502, 0.533, 0.580);
  const LIGHT  = rgb(0.949, 0.953, 0.961);
  const WHITE  = rgb(1, 1, 1);
  const RED    = rgb(0.863, 0.196, 0.184);
  const GREEN  = rgb(0.133, 0.545, 0.133);
  const AMBER  = rgb(0.961, 0.620, 0.043);

  const doc  = await PDFDocument.create();
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const reg  = await doc.embedFont(StandardFonts.Helvetica);

  const page = doc.addPage([PAGE_W, PAGE_H]);

  // ── Header band ──────────────────────────────────────────────────────────
  page.drawRectangle({ x: 0, y: PAGE_H - 72, width: PAGE_W, height: 72, color: PURPLE });
  page.drawText(safe(title).slice(0, 60), { x: MARGIN, y: PAGE_H - 34, font: bold, size: 18, color: WHITE });
  const sub = posterType.replace(/_/g, ' ').toUpperCase();
  page.drawText(sub, { x: MARGIN, y: PAGE_H - 54, font: reg, size: 9, color: rgb(0.85, 0.78, 1) });

  let y = PAGE_H - 90;

  // ── Body — render key/value pairs from data_json ──────────────────────────
  const entries = Object.entries(data).filter(([, v]) => v != null && String(v).trim() !== '');

  if (entries.length === 0) {
    page.drawText('No content data available for this poster.', {
      x: MARGIN, y, font: reg, size: 11, color: MUTED,
    });
  } else {
    for (const [key, value] of entries) {
      if (y < 80) break; // stop before footer

      const label = key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
      const valueStr = Array.isArray(value) ? value.join(', ') : String(value);

      // Section label
      page.drawRectangle({ x: MARGIN, y: y - 16, width: CONTENT_W, height: 20, color: LIGHT });
      page.drawText(label.toUpperCase(), { x: MARGIN + 6, y: y - 9, font: bold, size: 8, color: SLATE });
      y -= 26;

      // Value lines
      const lines = wrapText(valueStr, reg, 10.5, CONTENT_W - 12);
      for (const line of lines) {
        if (y < 80) break;
        page.drawText(line || ' ', { x: MARGIN + 6, y, font: reg, size: 10.5, color: DARK });
        y -= 15;
      }
      y -= 8;

      // Divider
      page.drawLine({ start: { x: MARGIN, y }, end: { x: PAGE_W - MARGIN, y }, thickness: 0.5, color: LIGHT });
      y -= 12;
    }
  }

  // ── Footer ────────────────────────────────────────────────────────────────
  page.drawLine({ start: { x: MARGIN, y: 30 }, end: { x: PAGE_W - MARGIN, y: 30 }, thickness: 0.5, color: LIGHT });
  page.drawText('IWIllBUILD — Safety Poster', { x: MARGIN, y: 16, font: reg, size: 7.5, color: MUTED });
  const dateStr = new Date().toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' });
  const dw = reg.widthOfTextAtSize(dateStr, 7.5);
  page.drawText(dateStr, { x: PAGE_W - MARGIN - dw, y: 16, font: reg, size: 7.5, color: MUTED });

  // Suppress unused variable warnings
  void RED; void GREEN; void AMBER;

  return doc.save();
}

// ── Handler ───────────────────────────────────────────────────────────────────

export default async function handler(req: Request, res: Response) {
  try {
    const auth = await getSessionAndProfile(req, res);
    if (!auth) return;

    const id = parseInt(String(req.params.id), 10);
    if (!Number.isInteger(id) || id <= 0) return res.status(400).json({ error: 'Invalid poster ID' });

    const [rows] = await db.execute(sql.raw(`
      SELECT id, poster_type, title, data_json
      FROM safety_generated_posters
      WHERE id = ${id} AND company_id = ${auth.profile.companyId}
      LIMIT 1
    `)) as unknown as [Array<{ id: number; poster_type: string; title: string; data_json: string | null }>, unknown];

    const poster = rows?.[0];
    if (!poster) return res.status(404).json({ error: 'Poster not found' });

    let data: Record<string, unknown> = {};
    try {
      if (poster.data_json) {
        const parsed = JSON.parse(poster.data_json) as unknown;
        if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
          data = parsed as Record<string, unknown>;
        }
      }
    } catch {
      // use empty data
    }

    const pdfBytes = await buildPosterPdf(poster.poster_type, poster.title, data);

    const filename = `${poster.title.replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', pdfBytes.length);
    res.end(Buffer.from(pdfBytes));
  } catch (err) {
    console.error('GET /api/safety/generated-posters/:id/pdf error:', err);
    res.status(500).json({ error: 'Failed to generate poster PDF' });
  }
}
