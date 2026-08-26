/**
 * GET /api/rl-register/:jobId/export/pdf
 * Export all RL points for a job as a PDF register.
 * Uses pdf-lib (Alpine-safe, no native deps).
 * Signed differences always include explicit + or − sign.
 */
import type { Request, Response } from 'express';
import { db } from '../../../../../db/client.js';
import { profiles } from '../../../../../db/schema.js';
import { eq, sql } from 'drizzle-orm';
import { getAuth } from '../../../../../../lib/auth/auth.js';
import { calcDiffFromTarget, formatDiffShort, formatMmShort, evalTolerance } from '../../../../../../lib/rl-calc.js';
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';

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

    const jobId = parseInt(req.params['jobId'] as string, 10);
    if (isNaN(jobId)) return res.status(400).json({ error: 'Invalid jobId' });

    const [jobRows] = await db.execute(sql.raw(
      `SELECT id, name, job_number, address FROM jobs WHERE id = ${jobId} AND company_id = ${profile.companyId} LIMIT 1`
    )) as unknown as [Array<{ id: number; name: string; job_number: string; address: string }>];
    if (!jobRows?.length) return res.status(404).json({ error: 'Job not found' });
    const job = jobRows[0];

    const [companyRows] = await db.execute(sql.raw(
      `SELECT name FROM companies WHERE id = ${profile.companyId} LIMIT 1`
    )) as unknown as [Array<{ name: string }>];
    const companyName = companyRows?.[0]?.name ?? '';

    const [rows] = await db.execute(sql.raw(`
      SELECT
        b.name              AS benchmarkName,
        b.rl                AS benchmarkRl,
        b.location          AS benchmarkLocation,
        p.point_name        AS pointName,
        p.location,
        p.measured_rl       AS measuredRl,
        p.target_rl         AS targetRl,
        p.tolerance_mm      AS toleranceMm,
        p.rise_fall         AS riseFall,
        p.measurement_date  AS measurementDate,
        p.entered_by        AS enteredBy,
        p.method,
        p.notes
      FROM rl_points p
      JOIN rl_benchmarks b ON b.id = p.benchmark_id
      WHERE p.job_id = ${jobId}
        AND p.company_id = ${profile.companyId}
        AND p.archived_at IS NULL
      ORDER BY b.name ASC, p.created_at ASC
    `)) as unknown as [Array<Record<string, unknown>>];

    // ── Build PDF ──────────────────────────────────────────────────────────────
    const pdfDoc = await PDFDocument.create();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    const PAGE_W = 841.89; // A4 landscape
    const PAGE_H = 595.28;
    const MARGIN = 36;
    const ROW_H = 18;
    const HEADER_H = 80;

    let page = pdfDoc.addPage([PAGE_W, PAGE_H]);
    let y = PAGE_H - MARGIN;

    const drawText = (text: string, x: number, yPos: number, size = 8, bold = false, color = rgb(0, 0, 0)) => {
      page.drawText(String(text ?? ''), { x, y: yPos, size, font: bold ? fontBold : font, color });
    };

    // Header
    drawText('JOB SITE RL REGISTER', MARGIN, y, 14, true);
    y -= 18;
    drawText(`${companyName}`, MARGIN, y, 9);
    y -= 14;
    drawText(`Job: ${job.job_number ?? ''} — ${job.name ?? ''}`, MARGIN, y, 9);
    if (job.address) { y -= 12; drawText(`Site: ${job.address}`, MARGIN, y, 8); }
    y -= 12;
    drawText(`Exported: ${new Date().toLocaleDateString('en-AU')}`, MARGIN, y, 8, false, rgb(0.4, 0.4, 0.4));
    y -= 20;

    // Disclaimer
    drawText(
      'Calculation and record-keeping tool only. Accuracy depends on the measuring equipment and procedure used.',
      MARGIN, y, 7, false, rgb(0.5, 0.5, 0.5)
    );
    y -= 10;
    drawText(
      'Do not use phone GPS or AR measurements for survey, structural or compliance-critical set-out.',
      MARGIN, y, 7, false, rgb(0.5, 0.5, 0.5)
    );
    y -= 16;

    // Column definitions
    const cols = [
      { label: 'Benchmark', x: MARGIN,       w: 90 },
      { label: 'BM RL (m)', x: MARGIN + 90,  w: 62 },
      { label: 'Point',     x: MARGIN + 152, w: 80 },
      { label: 'Location',  x: MARGIN + 232, w: 100 },
      { label: 'Meas. RL',  x: MARGIN + 332, w: 62 },
      { label: 'Target RL', x: MARGIN + 394, w: 62 },
      { label: 'Diff (m)',  x: MARGIN + 456, w: 68 },
      { label: 'Diff (mm)', x: MARGIN + 524, w: 60 },
      { label: 'Result',    x: MARGIN + 584, w: 68 },
      { label: 'Date',      x: MARGIN + 652, w: 70 },
      { label: 'By',        x: MARGIN + 722, w: 60 },
    ];

    // Table header row — light grey, dark text (printer-friendly)
    page.drawRectangle({ x: MARGIN, y: y - ROW_H + 4, width: PAGE_W - MARGIN * 2, height: ROW_H, color: rgb(0.88, 0.88, 0.88) });
    for (const col of cols) {
      drawText(col.label, col.x + 2, y - 10, 7, true, rgb(0.1, 0.1, 0.1));
    }
    y -= ROW_H;

    // Data rows
    let rowIdx = 0;
    for (const r of (rows ?? [])) {
      if (y < MARGIN + ROW_H + 20) {
        // New page
        page = pdfDoc.addPage([PAGE_W, PAGE_H]);
        y = PAGE_H - MARGIN;
        page.drawRectangle({ x: MARGIN, y: y - ROW_H + 4, width: PAGE_W - MARGIN * 2, height: ROW_H, color: rgb(0.88, 0.88, 0.88) });
        for (const col of cols) {
          drawText(col.label, col.x + 2, y - 10, 7, true, rgb(0.1, 0.1, 0.1));
        }
        y -= ROW_H;
        rowIdx = 0;
      }

      const measured = parseFloat(String(r['measuredRl'] ?? '0'));
      const target = r['targetRl'] !== null && r['targetRl'] !== undefined && r['targetRl'] !== ''
        ? parseFloat(String(r['targetRl'])) : null;
      const tolMm = r['toleranceMm'] !== null && r['toleranceMm'] !== undefined
        ? parseInt(String(r['toleranceMm']), 10) : 0;

      const diffM = target !== null ? calcDiffFromTarget(measured, target) : null;
      const diffStr = diffM !== null ? formatDiffShort(diffM) : '—';
      const mmStr = diffM !== null ? formatMmShort(diffM) : '—';
      const result = diffM !== null ? evalTolerance(measured, target!, tolMm) : '—';

      const resultColor = result === 'HIGH' ? rgb(0.7, 0.2, 0.2)
        : result === 'LOW' ? rgb(0.1, 0.3, 0.7)
        : result === 'ON_LEVEL' ? rgb(0.1, 0.5, 0.2)
        : rgb(0, 0, 0);

      if (rowIdx % 2 === 0) {
        page.drawRectangle({ x: MARGIN, y: y - ROW_H + 4, width: PAGE_W - MARGIN * 2, height: ROW_H, color: rgb(0.96, 0.96, 0.98) });
      }

      const trunc = (s: string, max: number) => s.length > max ? s.slice(0, max - 1) + '…' : s;

      drawText(trunc(String(r['benchmarkName'] ?? ''), 14), cols[0].x + 2, y - 10, 7);
      drawText(parseFloat(String(r['benchmarkRl'] ?? '0')).toFixed(3), cols[1].x + 2, y - 10, 7);
      drawText(trunc(String(r['pointName'] ?? ''), 13), cols[2].x + 2, y - 10, 7);
      drawText(trunc(String(r['location'] ?? ''), 16), cols[3].x + 2, y - 10, 7);
      drawText(measured.toFixed(3), cols[4].x + 2, y - 10, 7);
      drawText(target !== null ? target.toFixed(3) : '—', cols[5].x + 2, y - 10, 7);
      drawText(diffStr, cols[6].x + 2, y - 10, 7);
      drawText(mmStr, cols[7].x + 2, y - 10, 7);
      drawText(result === 'ON_LEVEL' ? 'ON LEVEL' : String(result), cols[8].x + 2, y - 10, 7, true, resultColor);
      drawText(String(r['measurementDate'] ?? '').slice(0, 10), cols[9].x + 2, y - 10, 7);
      drawText(trunc(String(r['enteredBy'] ?? ''), 10), cols[10].x + 2, y - 10, 7);

      y -= ROW_H;
      rowIdx++;
    }

    if ((rows ?? []).length === 0) {
      drawText('No RL points recorded for this job.', MARGIN, y - 10, 9, false, rgb(0.5, 0.5, 0.5));
    }

    const pdfBytes = await pdfDoc.save();
    const filename = `rl-register-job-${jobId}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', pdfBytes.length);
    return res.send(Buffer.from(pdfBytes));
  } catch (err) {
    console.error('GET /api/rl-register/:jobId/export/pdf error:', err);
    return res.status(500).json({ error: 'Failed to export PDF' });
  }
}
