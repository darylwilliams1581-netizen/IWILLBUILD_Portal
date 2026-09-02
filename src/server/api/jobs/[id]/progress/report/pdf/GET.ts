/**
 * GET /api/jobs/:id/progress/report/pdf
 * Generates a Program of Works Progress Report PDF.
 * Columns: Seq, Section, Activity, Start, Finish, Duration, Progress %, Status
 * Financial fields (Qty, Unit, Rate) are excluded.
 */
import type { Request, Response } from 'express';
import { db } from '../../../../../../db/client.js';
import { jobs, profiles, jobProgressLines, jobProgressSections } from '../../../../../../db/schema.js';
import { eq, and, asc, sql } from 'drizzle-orm';
import { getAuth } from '../../../../../../../lib/auth/auth.js';
import { calcStatus, calcDuration, todayISO } from '../../../../../../../lib/pow-types.js';

const PAGE_W = 595.28;
const PAGE_H = 841.89;
const MARGIN = 40;
const CONTENT_W = PAGE_W - MARGIN * 2;

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

    const [sections, lines] = await Promise.all([
      db.select().from(jobProgressSections)
        .where(and(eq(jobProgressSections.jobId, jobId), eq(jobProgressSections.companyId, profile.companyId)))
        .orderBy(asc(jobProgressSections.sortOrder), asc(jobProgressSections.id)),
      db.select().from(jobProgressLines)
        .where(and(eq(jobProgressLines.jobId, jobId), eq(jobProgressLines.companyId, profile.companyId)))
        .orderBy(asc(jobProgressLines.sortOrder), asc(jobProgressLines.id)),
    ]);
    const sectionMap = new Map(sections.map((s) => [s.id, s.title]));

    // Correct destructuring: db.execute returns [rows, fields]
    const [reportRows] = await db.execute(sql`
      SELECT * FROM job_progress_reports
      WHERE company_id = ${profile.companyId} AND job_id = ${jobId}
      LIMIT 1
    `);
    const report = ((reportRows as unknown as Record<string, unknown>[])[0]) ?? {} as Record<string, unknown>;

    // ── Build PDF ──────────────────────────────────────────────────────────────
    const pdfLib = await import('pdf-lib');
    const { PDFDocument, rgb, StandardFonts } = pdfLib;

    const pdfDoc = await PDFDocument.create();
    const boldFont    = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
    const regularFont = await pdfDoc.embedFont(StandardFonts.Helvetica);

    const ORANGE = rgb(0.976, 0.451, 0.086);
    const WHITE  = rgb(1, 1, 1);
    const DARK   = rgb(0.1, 0.1, 0.1);
    const MUTED  = rgb(0.45, 0.45, 0.45);
    const LIGHT  = rgb(0.96, 0.96, 0.96);
    const CYAN   = rgb(0.063, 0.725, 0.506);
    const RED    = rgb(0.85, 0.2, 0.2);
    const LIGHT_RED = rgb(1, 0.95, 0.95);
    const GRAY_HEADER = rgb(0.88, 0.88, 0.88);
    const LIGHT_GRAY  = rgb(0.94, 0.94, 0.94);

    type Page = ReturnType<typeof pdfDoc.addPage>;
    type Font = typeof boldFont;
    type Color = ReturnType<typeof rgb>;

    function newPage(): Page {
      return pdfDoc.addPage([PAGE_W, PAGE_H]);
    }

    function rect(p: Page, x: number, y: number, w: number, h: number, color: Color) {
      p.drawRectangle({ x, y, width: w, height: h, color });
    }

    function text(p: Page, t: string, x: number, y: number, font: Font, size: number, color: Color) {
      p.drawText(String(t ?? ''), { x, y, font, size, color });
    }

    function wrap(t: string, font: Font, size: number, maxW: number): string[] {
      const words = String(t ?? '').split(' ');
      const out: string[] = [];
      let cur = '';
      for (const w of words) {
        const test = cur ? `${cur} ${w}` : w;
        if (font.widthOfTextAtSize(test, size) <= maxW) { cur = test; }
        else { if (cur) out.push(cur); cur = w; }
      }
      if (cur) out.push(cur);
      return out.length ? out : [''];
    }

    function sectionHead(p: Page, y: number, label: string): number {
      rect(p, MARGIN, y - 2, CONTENT_W, 18, LIGHT);
      text(p, label.toUpperCase(), MARGIN + 6, y + 3, boldFont, 8, MUTED);
      return y - 22;
    }

    function textBlock(p: Page, y: number, t: string, maxW: number): number {
      if (!t) return y;
      for (const line of wrap(t, regularFont, 9, maxW)) {
        if (y < 60) break;
        text(p, line, MARGIN + 6, y, regularFont, 9, DARK);
        y -= 13;
      }
      return y;
    }

    // ── Page 1 ─────────────────────────────────────────────────────────────────
    let page = newPage();
    let y = PAGE_H - MARGIN;

    // Printer-friendly header: 3pt accent rule + plain dark text on white
    rect(page, 0, PAGE_H - 3, PAGE_W, 3, ORANGE);
    text(page, 'PROGRESS REPORT', MARGIN, PAGE_H - 22, boldFont, 16, DARK);
    text(page, `Generated ${new Date().toLocaleDateString('en-AU', { day: '2-digit', month: 'long', year: 'numeric' })}`, MARGIN, PAGE_H - 38, regularFont, 9, MUTED);
    // Thin separator rule
    page.drawLine({ start: { x: MARGIN, y: PAGE_H - 50 }, end: { x: PAGE_W - MARGIN, y: PAGE_H - 50 }, thickness: 0.5, color: GRAY_HEADER });

    y = PAGE_H - 68;

    // Job info
    const jobRows: [string, string][] = [
      ['Job',     `${job.jobNumber ? `#${job.jobNumber} — ` : ''}${job.name}`],
      ['Client',  job.client ?? '—'],
      ['Address', job.address ?? '—'],
      ['Status',  job.status ?? '—'],
    ];
    if (job.scheduledStartDate) {
      jobRows.push(['Start Date', new Date(String(job.scheduledStartDate)).toLocaleDateString('en-AU')]);
    }
    if (job.expectedCompletionDate) {
      jobRows.push(['Expected Completion', new Date(String(job.expectedCompletionDate)).toLocaleDateString('en-AU')]);
    }
    for (const [label, val] of jobRows) {
      text(page, `${label}:`, MARGIN, y, boldFont, 9, MUTED);
      text(page, val, MARGIN + 120, y, regularFont, 9, DARK);
      y -= 14;
    }
    y -= 6;

    // Report meta
    const metaRows: [string, string][] = [
      ['Prepared By', String(report.prepared_by ?? '—')],
      ['Report Date', report.report_date ? new Date(String(report.report_date)).toLocaleDateString('en-AU') : '—'],
      ['Period', (report.period_from && report.period_to)
        ? `${new Date(String(report.period_from)).toLocaleDateString('en-AU')} — ${new Date(String(report.period_to)).toLocaleDateString('en-AU')}`
        : '—'],
    ];
    for (const [label, val] of metaRows) {
      text(page, `${label}:`, MARGIN, y, boldFont, 9, MUTED);
      text(page, val, MARGIN + 120, y, regularFont, 9, DARK);
      y -= 14;
    }
    y -= 10;

    // Overall progress bar
    const overallPct = lines.length
      ? Math.round(lines.reduce((s, l) => s + (l.percentComplete ?? 0), 0) / lines.length)
      : 0;

    y = sectionHead(page, y, 'Overall Progress');
    const barW = CONTENT_W - 60;
    rect(page, MARGIN + 6, y - 2, barW, 10, LIGHT);
    rect(page, MARGIN + 6, y - 2, barW * overallPct / 100, 10, overallPct === 100 ? CYAN : ORANGE);
    text(page, `${overallPct}%`, MARGIN + barW + 12, y + 1, boldFont, 10, DARK);
    text(page, `${lines.length} activities · ${lines.filter(l => l.percentComplete === 100).length} complete`, MARGIN + 6, y - 16, regularFont, 8, MUTED);
    y -= 32;

    // Achievements
    if (report.achievements) {
      y = sectionHead(page, y, 'Achievements');
      y = textBlock(page, y, String(report.achievements), CONTENT_W - 12);
      y -= 8;
    }

    // Planned Next
    if (report.planned_next) {
      y = sectionHead(page, y, 'Planned Next');
      y = textBlock(page, y, String(report.planned_next), CONTENT_W - 12);
      y -= 8;
    }

    // Outstanding Issues
    if (report.outstanding_issues) {
      y = sectionHead(page, y, 'Outstanding Issues');
      const issueLines = wrap(String(report.outstanding_issues), regularFont, 9, CONTENT_W - 12);
      rect(page, MARGIN, y - 4, CONTENT_W, issueLines.length * 13 + 8, LIGHT_RED);
      y = textBlock(page, y, String(report.outstanding_issues), CONTENT_W - 12);
      y -= 8;
    }

    // ── Program of Works table ─────────────────────────────────────────────────
    y -= 4;
    y = sectionHead(page, y, 'Program of Works');

    const today = todayISO();
    const COL_SEQ   = MARGIN + 6;
    const COL_SEC   = MARGIN + 24;
    const COL_DESC  = MARGIN + 90;
    const COL_START = PAGE_W - MARGIN - 200;
    const COL_FIN   = PAGE_W - MARGIN - 150;
    const COL_DUR   = PAGE_W - MARGIN - 100;
    const COL_PCT   = PAGE_W - MARGIN - 55;
    const COL_STAT  = PAGE_W - MARGIN - 30;

    // Table header row
    rect(page, MARGIN, y - 2, CONTENT_W, 14, GRAY_HEADER);
    text(page, '#',        COL_SEQ,   y + 1, boldFont, 7, DARK);
    text(page, 'Section',  COL_SEC,   y + 1, boldFont, 7, DARK);
    text(page, 'Activity', COL_DESC,  y + 1, boldFont, 7, DARK);
    text(page, 'Start',    COL_START, y + 1, boldFont, 7, DARK);
    text(page, 'Finish',   COL_FIN,   y + 1, boldFont, 7, DARK);
    text(page, 'Dur',      COL_DUR,   y + 1, boldFont, 7, DARK);
    text(page, '%',        COL_PCT,   y + 1, boldFont, 7, DARK);
    text(page, 'Status',   COL_STAT,  y + 1, boldFont, 7, DARK);
    y -= 16;

    for (let i = 0; i < lines.length; i++) {
      // New page if needed
      if (y < 60) {
        page = newPage();
        y = PAGE_H - MARGIN;
        // Continuation header — 3pt rule + plain text
        rect(page, 0, PAGE_H - 3, PAGE_W, 3, ORANGE);
        text(page, 'PROGRESS REPORT (continued)', MARGIN, PAGE_H - 22, boldFont, 10, DARK);
        page.drawLine({ start: { x: MARGIN, y: PAGE_H - 34 }, end: { x: PAGE_W - MARGIN, y: PAGE_H - 34 }, thickness: 0.5, color: GRAY_HEADER });
        y = PAGE_H - 50;
        rect(page, MARGIN, y - 2, CONTENT_W, 14, GRAY_HEADER);
        text(page, '#',        COL_SEQ,   y + 1, boldFont, 7, DARK);
        text(page, 'Section',  COL_SEC,   y + 1, boldFont, 7, DARK);
        text(page, 'Activity', COL_DESC,  y + 1, boldFont, 7, DARK);
        text(page, 'Start',    COL_START, y + 1, boldFont, 7, DARK);
        text(page, 'Finish',   COL_FIN,   y + 1, boldFont, 7, DARK);
        text(page, 'Dur',      COL_DUR,   y + 1, boldFont, 7, DARK);
        text(page, '%',        COL_PCT,   y + 1, boldFont, 7, DARK);
        text(page, 'Status',   COL_STAT,  y + 1, boldFont, 7, DARK);
        y -= 16;
      }

      if (i % 2 === 0) rect(page, MARGIN, y - 3, CONTENT_W, 13, LIGHT_GRAY);

      const a = lines[i];
      const sectionTitle = a.sectionId ? (sectionMap.get(a.sectionId) ?? '') : '';
      const dur = calcDuration(a.startDate, a.endDate);
      const durStr = dur !== null ? `${dur}d` : '';
      const status = calcStatus(a.percentComplete, a.endDate, today);
      const pct = a.percentComplete ?? 0;
      const pctColor = pct === 100 ? CYAN : pct >= 50 ? ORANGE : RED;
      const statusColor = status === 'Complete' ? CYAN : status === 'Overdue' ? RED : DARK;

      text(page, String(i + 1), COL_SEQ, y, regularFont, 7, MUTED);

      // Truncate section
      let sec = sectionTitle;
      const maxSecW = COL_DESC - COL_SEC - 4;
      while (sec.length > 0 && regularFont.widthOfTextAtSize(sec, 7) > maxSecW) sec = sec.slice(0, -1);
      if (sec.length < sectionTitle.length) sec += '…';
      text(page, sec, COL_SEC, y, regularFont, 7, MUTED);

      // Truncate description
      const maxDescW = COL_START - COL_DESC - 4;
      let desc = String(a.description ?? '');
      while (desc.length > 0 && regularFont.widthOfTextAtSize(desc, 7) > maxDescW) desc = desc.slice(0, -1);
      if (desc.length < String(a.description ?? '').length) desc += '…';
      text(page, desc, COL_DESC, y, regularFont, 7, DARK);

      text(page, a.startDate ?? '', COL_START, y, regularFont, 7, MUTED);
      text(page, a.endDate ?? '',   COL_FIN,   y, regularFont, 7, MUTED);
      text(page, durStr,            COL_DUR,   y, regularFont, 7, MUTED);
      text(page, `${pct}%`,         COL_PCT,   y, boldFont,    7, pctColor);
      text(page, status,            COL_STAT,  y, boldFont,    7, statusColor);

      y -= 13;
    }

    // Footer
    text(page, `IWIIlBUILD · Progress Report · ${new Date().toLocaleDateString('en-AU')}`, MARGIN, 25, regularFont, 7, MUTED);

    const pdfBytes = await pdfDoc.save();
    const filename = `progress-report-job-${jobId}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    return res.send(Buffer.from(pdfBytes));

  } catch (err) {
    console.error('PDF report error:', String(err), err instanceof Error ? err.stack : '');
    return res.status(500).json({ error: 'PDF generation failed', detail: String(err) });
  }
}
