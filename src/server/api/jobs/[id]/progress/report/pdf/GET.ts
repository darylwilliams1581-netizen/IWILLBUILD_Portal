/**
 * GET /api/jobs/:id/progress/report/pdf
 * Generates a Progress Report PDF for the job.
 */
import type { Request, Response } from 'express';
import { db } from '../../../../../../db/client.js';
import { jobs, profiles } from '../../../../../../db/schema.js';
import { jobProgressLines } from '../../../../../../db/schema.js';
import { eq, and, asc } from 'drizzle-orm';
import { getAuth } from '../../../../../../../lib/auth/auth.js';
import { sql } from 'drizzle-orm';

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

    const jobId = parseInt(String(req.params.id), 10);
    if (isNaN(jobId)) return res.status(400).json({ error: 'Invalid job ID' });

    const job = await db.query.jobs.findFirst({ where: and(eq(jobs.id, jobId), eq(jobs.companyId, profile.companyId)) });
    if (!job) return res.status(404).json({ error: 'Job not found' });

    const lines = await db
      .select()
      .from(jobProgressLines)
      .where(and(eq(jobProgressLines.jobId, jobId), eq(jobProgressLines.companyId, profile.companyId)))
      .orderBy(asc(jobProgressLines.id));

    const reportRows = await db.execute(sql`
      SELECT * FROM job_progress_reports
      WHERE company_id = ${profile.companyId} AND job_id = ${jobId}
      LIMIT 1
    `);
    const report = ((reportRows as unknown as { rows?: Record<string, unknown>[] }).rows?.[0]) ?? {};

    // ── Build PDF ──────────────────────────────────────────────────────────────
    const { PDFDocument, rgb, StandardFonts } = await import('pdf-lib');

    const pdfDoc = await PDFDocument.create();
    const boldFont   = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const regularFont = await pdfDoc.embedFont(StandardFonts.Helvetica);

    const PAGE_W = 595.28;
    const PAGE_H = 841.89;
    const MARGIN = 40;
    const CONTENT_W = PAGE_W - MARGIN * 2;

    const ORANGE = rgb(0.976, 0.451, 0.086); // #F97316
    const WHITE  = rgb(1, 1, 1);
    const DARK   = rgb(0.1, 0.1, 0.1);
    const MUTED  = rgb(0.45, 0.45, 0.45);
    const LIGHT  = rgb(0.96, 0.96, 0.96);
    const CYAN   = rgb(0.063, 0.725, 0.506);
    const RED    = rgb(0.85, 0.2, 0.2);

    function addPage() {
      const p = pdfDoc.addPage([PAGE_W, PAGE_H]);
      return p;
    }

    function drawRect(page: ReturnType<typeof addPage>, x: number, y: number, w: number, h: number, color: ReturnType<typeof rgb>) {
      page.drawRectangle({ x, y, width: w, height: h, color });
    }

    function drawText(page: ReturnType<typeof addPage>, text: string, x: number, y: number, font: typeof boldFont, size: number, color: ReturnType<typeof rgb>) {
      page.drawText(String(text ?? ''), { x, y, font, size, color });
    }

    function wrapText(text: string, font: typeof regularFont, size: number, maxWidth: number): string[] {
      const words = String(text ?? '').split(' ');
      const lines: string[] = [];
      let current = '';
      for (const word of words) {
        const test = current ? `${current} ${word}` : word;
        if (font.widthOfTextAtSize(test, size) <= maxWidth) {
          current = test;
        } else {
          if (current) lines.push(current);
          current = word;
        }
      }
      if (current) lines.push(current);
      return lines.length ? lines : [''];
    }

    function sectionHeader(page: ReturnType<typeof addPage>, y: number, label: string) {
      drawRect(page, MARGIN, y - 2, CONTENT_W, 18, LIGHT);
      drawText(page, label.toUpperCase(), MARGIN + 6, y + 3, boldFont, 8, MUTED);
      return y - 22;
    }

    function textBlock(page: ReturnType<typeof addPage>, y: number, text: string, maxW: number): number {
      if (!text) return y;
      const wrapped = wrapText(text, regularFont, 9, maxW);
      for (const line of wrapped) {
        if (y < 60) break;
        drawText(page, line, MARGIN + 6, y, regularFont, 9, DARK);
        y -= 13;
      }
      return y;
    }

    // ── Page 1 ─────────────────────────────────────────────────────────────────
    const page = addPage();
    let y = PAGE_H - MARGIN;

    // Header banner
    drawRect(page, 0, PAGE_H - 70, PAGE_W, 70, ORANGE);
    drawText(page, 'PROGRESS REPORT', MARGIN, PAGE_H - 28, boldFont, 18, WHITE);
    drawText(page, `Generated ${new Date().toLocaleDateString('en-AU', { day: '2-digit', month: 'long', year: 'numeric' })}`, MARGIN, PAGE_H - 46, regularFont, 9, WHITE);

    y = PAGE_H - 90;

    // Job info block
    const jobInfoItems: [string, string][] = [
      ['Job',        `${job.jobNumber ? `#${job.jobNumber} — ` : ''}${job.name}`],
      ['Client',     job.client ?? '—'],
      ['Address',    job.address ?? '—'],
      ['Status',     job.status ?? '—'],
    ];
    if (job.scheduledStartDate) jobInfoItems.push(['Start Date', new Date(job.scheduledStartDate).toLocaleDateString('en-AU')]);
    if (job.expectedCompletionDate) jobInfoItems.push(['Expected Completion', new Date(job.expectedCompletionDate).toLocaleDateString('en-AU')]);

    for (const [label, value] of jobInfoItems) {
      drawText(page, label + ':', MARGIN, y, boldFont, 9, MUTED);
      drawText(page, value, MARGIN + 110, y, regularFont, 9, DARK);
      y -= 14;
    }

    y -= 6;

    // Report meta
    const reportMeta: [string, string][] = [
      ['Prepared By',  String(report.prepared_by ?? '—')],
      ['Report Date',  report.report_date ? new Date(String(report.report_date)).toLocaleDateString('en-AU') : '—'],
      ['Period',       (report.period_from && report.period_to)
        ? `${new Date(String(report.period_from)).toLocaleDateString('en-AU')} — ${new Date(String(report.period_to)).toLocaleDateString('en-AU')}`
        : '—'],
    ];
    for (const [label, value] of reportMeta) {
      drawText(page, label + ':', MARGIN, y, boldFont, 9, MUTED);
      drawText(page, value, MARGIN + 110, y, regularFont, 9, DARK);
      y -= 14;
    }

    y -= 10;

    // Overall progress
    const overallPct = lines.length
      ? Math.round(lines.reduce((s, l) => s + (l.percentComplete ?? 0), 0) / lines.length)
      : 0;

    y = sectionHeader(page, y, 'Overall Progress');
    const barW = CONTENT_W - 60;
    drawRect(page, MARGIN + 6, y - 2, barW, 10, LIGHT);
    drawRect(page, MARGIN + 6, y - 2, barW * overallPct / 100, 10, overallPct === 100 ? CYAN : ORANGE);
    drawText(page, `${overallPct}%`, MARGIN + barW + 12, y + 1, boldFont, 10, DARK);
    drawText(page, `${lines.length} lines · ${lines.filter(l => l.percentComplete === 100).length} complete`, MARGIN + 6, y - 16, regularFont, 8, MUTED);
    y -= 32;

    // Achievements
    if (report.achievements) {
      y = sectionHeader(page, y, 'Achievements');
      y = textBlock(page, y, String(report.achievements), CONTENT_W - 12);
      y -= 6;
    }

    // Planned Next
    if (report.planned_next) {
      y = sectionHeader(page, y, 'Planned Next');
      y = textBlock(page, y, String(report.planned_next), CONTENT_W - 12);
      y -= 6;
    }

    // Outstanding Issues
    if (report.outstanding_issues) {
      y = sectionHeader(page, y, 'Outstanding Issues');
      // Red tint for issues
      drawRect(page, MARGIN, y - 2, CONTENT_W, 14 * (String(report.outstanding_issues).split('\n').length + 1), rgb(1, 0.95, 0.95));
      y = textBlock(page, y, String(report.outstanding_issues), CONTENT_W - 12);
      y -= 6;
    }

    // ── Progress Lines table ───────────────────────────────────────────────────
    y -= 4;
    y = sectionHeader(page, y, 'Scope Progress');

    // Table header
    const COL_DESC = MARGIN + 6;
    const COL_PCT  = MARGIN + CONTENT_W - 80;
    const COL_NOTE = MARGIN + CONTENT_W - 200;

    drawRect(page, MARGIN, y - 2, CONTENT_W, 14, rgb(0.88, 0.88, 0.88));
    drawText(page, 'Description', COL_DESC, y + 1, boldFont, 8, DARK);
    drawText(page, 'Note', COL_NOTE, y + 1, boldFont, 8, DARK);
    drawText(page, '%', COL_PCT, y + 1, boldFont, 8, DARK);
    y -= 16;

    let currentPage = page;

    for (let i = 0; i < lines.length; i++) {
      const l = lines[i];
      if (y < 60) {
        currentPage = addPage();
        y = PAGE_H - MARGIN;
        // Continuation header
        drawRect(currentPage, 0, PAGE_H - 30, PAGE_W, 30, ORANGE);
        drawText(currentPage, 'PROGRESS REPORT (continued)', MARGIN, PAGE_H - 18, boldFont, 10, WHITE);
        y = PAGE_H - 50;
        drawRect(currentPage, MARGIN, y - 2, CONTENT_W, 14, rgb(0.88, 0.88, 0.88));
        drawText(currentPage, 'Description', COL_DESC, y + 1, boldFont, 8, DARK);
        drawText(currentPage, 'Note', COL_NOTE, y + 1, boldFont, 8, DARK);
        drawText(currentPage, '%', COL_PCT, y + 1, boldFont, 8, DARK);
        y -= 16;
      }

      if (i % 2 === 0) drawRect(currentPage, MARGIN, y - 3, CONTENT_W, 13, LIGHT);

      // Truncate description to fit
      const maxDescW = COL_NOTE - COL_DESC - 8;
      let desc = l.description ?? '';
      while (desc.length > 0 && regularFont.widthOfTextAtSize(desc, 8) > maxDescW) desc = desc.slice(0, -1);
      if (desc.length < (l.description ?? '').length) desc += '…';

      drawText(currentPage, desc, COL_DESC, y, regularFont, 8, DARK);

      // Note
      const maxNoteW = COL_PCT - COL_NOTE - 8;
      let note = String(l.progressNote ?? '');
      while (note.length > 0 && regularFont.widthOfTextAtSize(note, 8) > maxNoteW) note = note.slice(0, -1);
      if (note.length < String(l.progressNote ?? '').length) note += '…';
      drawText(currentPage, note, COL_NOTE, y, regularFont, 8, MUTED);

      // % with colour
      const pct = l.percentComplete ?? 0;
      const pctColor = pct === 100 ? CYAN : pct >= 50 ? ORANGE : RED;
      drawText(currentPage, `${pct}%`, COL_PCT, y, boldFont, 8, pctColor);

      y -= 13;
    }

    // Footer on last page
    drawText(currentPage, `IWILLBUILD · Progress Report · ${new Date().toLocaleDateString('en-AU')}`, MARGIN, 25, regularFont, 7, MUTED);

    const pdfBytes = await pdfDoc.save();
    const filename = `progress-report-job-${jobId}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.send(Buffer.from(pdfBytes));
  } catch (err) {
    console.error('GET /api/jobs/:id/progress/report/pdf error:', err);
    return res.status(500).json({ error: 'PDF generation failed' });
  }
}
