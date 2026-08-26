/**
 * GET /api/electrical-tests/export/:jobId/pdf
 * Export all test records for a job as a PDF register.
 * Uses pdf-lib (Alpine-safe, no native deps).
 */
import type { Request, Response } from 'express';
import { db } from '../../../../../db/client.js';
import { profiles } from '../../../../../db/schema.js';
import { eq, sql } from 'drizzle-orm';
import { getAuth } from '../../../../../../lib/auth/auth.js';
import { formatAuDate, formatAuDateTime } from '../../../../../../lib/electrical-test-calc.js';
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
      SELECT r.asset_id, r.template_name, r.circuit_feeder, r.phase,
             r.measured_value, r.unit, r.result, r.condition_class, r.standard_label,
             r.standard_ref, r.document_number, r.document_version,
             r.test_date, r.tester_name, r.status,
             r.notes, r.defect_action,
             r.checked_by_name, r.accepted_by_name,
             e.make_model AS equipment_make_model, e.serial_number AS equipment_serial,
             e.calibration_expiry AS equipment_cal_expiry
      FROM electrical_test_records r
      LEFT JOIN electrical_test_equipment e ON e.id = r.equipment_id
      WHERE r.job_id = ${jobId} AND r.company_id = ${profile.companyId} AND r.archived_at IS NULL
      ORDER BY r.test_date ASC, r.created_at ASC
    `)) as unknown as [Array<Record<string, unknown>>];

    // ── Build PDF ──────────────────────────────────────────────────────────────
    const pdfDoc = await PDFDocument.create();
    const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
    const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

    const PAGE_W = 841.89; // A4 landscape
    const PAGE_H = 595.28;
    const MARGIN = 36;
    const ROW_H = 18;

    let page = pdfDoc.addPage([PAGE_W, PAGE_H]);
    let y = PAGE_H - MARGIN;

    const drawText = (text: string, x: number, yPos: number, size = 8, bold = false, color = rgb(0, 0, 0)) => {
      page.drawText(String(text ?? ''), { x, y: yPos, size, font: bold ? fontBold : font, color });
    };

    // Header
    drawText('ELECTRICAL TEST REGISTER', MARGIN, y, 14, true);
    y -= 18;
    drawText(companyName, MARGIN, y, 9);
    y -= 14;
    drawText(`Job: ${job.job_number ?? ''} — ${job.name ?? ''}`, MARGIN, y, 9);
    if (job.address) { y -= 12; drawText(`Site: ${job.address}`, MARGIN, y, 8); }
    y -= 12;
    drawText(`Exported: ${new Date().toLocaleDateString('en-AU')}`, MARGIN, y, 8, false, rgb(0.4, 0.4, 0.4));
    y -= 16;

    // Safety notice
    drawText(
      'Electrical testing must only be performed by appropriately licensed and competent persons using an approved test procedure.',
      MARGIN, y, 7, false, rgb(0.5, 0.5, 0.5)
    );
    y -= 16;

    // Columns
    const cols = [
      { label: 'Asset/Connection ID', x: MARGIN,        w: 100 },
      { label: 'Test Type',           x: MARGIN + 100,  w: 100 },
      { label: 'Circuit/Phase',       x: MARGIN + 200,  w: 70  },
      { label: 'Measured',            x: MARGIN + 270,  w: 70  },
      { label: 'Result',              x: MARGIN + 340,  w: 70  },
      { label: 'Condition',           x: MARGIN + 410,  w: 60  },
      { label: 'Standard',            x: MARGIN + 470,  w: 100 },
      { label: 'Equipment',           x: MARGIN + 570,  w: 90  },
      { label: 'Date',                x: MARGIN + 660,  w: 70  },
      { label: 'Tester',              x: MARGIN + 730,  w: 70  },
    ];

    const drawTableHeader = () => {
      // Light grey header — dark text (printer-friendly)
      page.drawRectangle({ x: MARGIN, y: y - ROW_H + 4, width: PAGE_W - MARGIN * 2, height: ROW_H, color: rgb(0.88, 0.88, 0.88) });
      for (const col of cols) {
        drawText(col.label, col.x + 2, y - 10, 6.5, true, rgb(0.1, 0.1, 0.1));
      }
      y -= ROW_H;
    };

    drawTableHeader();

    let rowIdx = 0;
    for (const r of (rows ?? [])) {
      if (y < MARGIN + ROW_H + 20) {
        page = pdfDoc.addPage([PAGE_W, PAGE_H]);
        y = PAGE_H - MARGIN;
        drawTableHeader();
        rowIdx = 0;
      }

      const result = String(r['result'] ?? '');
      const condition = String(r['condition_class'] ?? '');
      const resultColor = result === 'PASS'   ? rgb(0.1, 0.5, 0.2)
        : result === 'FAIL'   ? rgb(0.7, 0.2, 0.2)
        : result === 'REVIEW' ? rgb(0.7, 0.5, 0.0)
        : rgb(0.4, 0.4, 0.4);

      if (rowIdx % 2 === 0) {
        page.drawRectangle({ x: MARGIN, y: y - ROW_H + 4, width: PAGE_W - MARGIN * 2, height: ROW_H, color: rgb(0.96, 0.96, 0.98) });
      }

      const trunc = (s: string, max: number) => s.length > max ? s.slice(0, max - 1) + '…' : s;
      const mv = r['measured_value'] !== null && r['measured_value'] !== undefined
        ? `${r['measured_value']} ${r['unit'] ?? ''}`.trim() : '—';
      const circuitPhase = [r['circuit_feeder'], r['phase']].filter(Boolean).join(' / ');
      const stdRef = r['document_number'] ? `${r['document_number']} ${r['document_version'] ?? ''}`.trim() : (r['standard_ref'] ? String(r['standard_ref']) : '—');
      const equip = r['equipment_make_model'] ? `${r['equipment_make_model']} ${r['equipment_serial'] ?? ''}`.trim() : '—';
      const testDate = r['test_date'] ? formatAuDate(String(r['test_date']).slice(0, 10)) : '—';

      drawText(trunc(String(r['asset_id'] ?? '—'), 16), cols[0].x + 2, y - 10, 7);
      drawText(trunc(String(r['template_name'] ?? ''), 16), cols[1].x + 2, y - 10, 7);
      drawText(trunc(circuitPhase, 11), cols[2].x + 2, y - 10, 7);
      drawText(trunc(mv, 11), cols[3].x + 2, y - 10, 7);
      drawText(result === 'MANUAL' ? 'Manual' : result, cols[4].x + 2, y - 10, 7, true, resultColor);
      drawText(condition || '—', cols[5].x + 2, y - 10, 7, !!condition, condition === 'C4' ? rgb(0.1, 0.5, 0.2) : condition === 'P1' ? rgb(0.7, 0.2, 0.2) : rgb(0, 0, 0));
      drawText(trunc(stdRef, 16), cols[6].x + 2, y - 10, 6.5);
      drawText(trunc(equip, 14), cols[7].x + 2, y - 10, 6.5);
      drawText(testDate, cols[8].x + 2, y - 10, 7);
      drawText(trunc(String(r['tester_name'] ?? ''), 11), cols[9].x + 2, y - 10, 7);

      y -= ROW_H;
      rowIdx++;
    }

    if ((rows ?? []).length === 0) {
      drawText('No test records for this job.', MARGIN, y - 10, 9, false, rgb(0.5, 0.5, 0.5));
    }

    const pdfBytes = await pdfDoc.save();
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="electrical-tests-job-${jobId}.pdf"`);
    res.setHeader('Content-Length', pdfBytes.length);
    return res.send(Buffer.from(pdfBytes));
  } catch (err) {
    console.error('GET /api/electrical-tests/export/:jobId/pdf error:', err);
    return res.status(500).json({ error: 'Failed to export PDF' });
  }
}
