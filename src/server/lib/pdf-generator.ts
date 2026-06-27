/**
 * PDF Generator — server-side PDF creation using pdf-lib (pure JS, Alpine-safe).
 *
 * Provides helpers for generating:
 *  - SWMS PDFs
 *  - Safety Plan PDFs
 *  - Job Cost Report PDFs
 *  - Safety Pack (combined multi-document PDF)
 */

import { PDFDocument, rgb, StandardFonts, PDFPage, PDFFont } from 'pdf-lib';

// ── Colour palette ─────────────────────────────────────────────────────────────
const ORANGE = rgb(0.976, 0.451, 0.086);   // #F97316
const DARK   = rgb(0.059, 0.067, 0.090);   // #0F1117
const SLATE  = rgb(0.243, 0.267, 0.322);   // #3E4452
const LIGHT  = rgb(0.949, 0.953, 0.961);   // #F2F3F5
const WHITE  = rgb(1, 1, 1);
const BLACK  = rgb(0, 0, 0);
const MUTED  = rgb(0.502, 0.533, 0.580);   // #808890

// ── Page helpers ───────────────────────────────────────────────────────────────

const PAGE_W = 595.28;  // A4 width  (pt)
const PAGE_H = 841.89;  // A4 height (pt)
const MARGIN = 40;

function addPage(doc: PDFDocument): PDFPage {
  return doc.addPage([PAGE_W, PAGE_H]);
}

function drawRect(page: PDFPage, x: number, y: number, w: number, h: number, color: ReturnType<typeof rgb>) {
  page.drawRectangle({ x, y, width: w, height: h, color });
}

function drawText(
  page: PDFPage, text: string, x: number, y: number,
  font: PDFFont, size: number, color = BLACK
) {
  page.drawText(text, { x, y, font, size, color });
}

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
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

function drawHeader(page: PDFPage, boldFont: PDFFont, regularFont: PDFFont, title: string, subtitle?: string) {
  // Orange header bar
  drawRect(page, 0, PAGE_H - 70, PAGE_W, 70, ORANGE);
  drawText(page, 'IWILLBUILD', MARGIN, PAGE_H - 30, boldFont, 14, WHITE);
  drawText(page, title.toUpperCase(), MARGIN, PAGE_H - 50, boldFont, 11, WHITE);
  if (subtitle) {
    drawText(page, subtitle, MARGIN, PAGE_H - 64, regularFont, 8, rgb(1, 0.9, 0.8));
  }
  // Date stamp top-right
  const dateStr = new Date().toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' });
  const dw = regularFont.widthOfTextAtSize(dateStr, 8);
  drawText(page, dateStr, PAGE_W - MARGIN - dw, PAGE_H - 30, regularFont, 8, WHITE);
}

function drawFooter(page: PDFPage, regularFont: PDFFont, pageNum: number, totalPages?: number) {
  drawRect(page, 0, 0, PAGE_W, 28, DARK);
  drawText(page, 'IWILLBUILD Portal — Confidential', MARGIN, 9, regularFont, 7, MUTED);
  const pg = totalPages ? `Page ${pageNum} of ${totalPages}` : `Page ${pageNum}`;
  const pw = regularFont.widthOfTextAtSize(pg, 7);
  drawText(page, pg, PAGE_W - MARGIN - pw, 9, regularFont, 7, MUTED);
}

function sectionHeading(page: PDFPage, boldFont: PDFFont, text: string, y: number): number {
  drawRect(page, MARGIN, y - 2, PAGE_W - MARGIN * 2, 18, LIGHT);
  drawText(page, text.toUpperCase(), MARGIN + 6, y + 3, boldFont, 8, SLATE);
  return y - 26;
}

function labelValue(
  page: PDFPage, boldFont: PDFFont, regularFont: PDFFont,
  label: string, value: string, x: number, y: number, colW = 240
): number {
  drawText(page, label, x, y, boldFont, 8, MUTED);
  const lines = wrapText(value || '—', regularFont, 9, colW - 10);
  lines.forEach((line, i) => drawText(page, line, x, y - 12 - i * 12, regularFont, 9, BLACK));
  return y - 12 - lines.length * 12;
}

// ── SWMS PDF ───────────────────────────────────────────────────────────────────

export interface SwmsData {
  id: number;
  title: string;
  work_activity?: string;
  scope?: string;
  hazards?: string;
  controls?: string;
  ppe_required?: string;
  legislation?: string;
  emergency_procedures?: string;
  status?: string;
  created_at?: string;
  company_name?: string;
  signoffs?: Array<{ worker_name: string; white_card_number?: string; signed_at: string }>;
}

export async function generateSwmsPdf(swms: SwmsData): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const boldFont = await doc.embedFont(StandardFonts.HelveticaBold);
  const regularFont = await doc.embedFont(StandardFonts.Helvetica);

  const page = addPage(doc);
  drawHeader(page, boldFont, regularFont, 'Safe Work Method Statement', swms.company_name);
  drawFooter(page, regularFont, 1);

  let y = PAGE_H - 90;

  // Title block
  drawRect(page, MARGIN, y - 30, PAGE_W - MARGIN * 2, 36, DARK);
  drawText(page, swms.title, MARGIN + 8, y - 10, boldFont, 13, WHITE);
  if (swms.work_activity) drawText(page, swms.work_activity, MARGIN + 8, y - 24, regularFont, 9, MUTED);
  y -= 50;

  // Status + ID row
  const statusColor = swms.status === 'approved' ? rgb(0.133, 0.545, 0.133) : ORANGE;
  drawRect(page, MARGIN, y - 16, 80, 18, statusColor);
  drawText(page, (swms.status ?? 'draft').toUpperCase(), MARGIN + 6, y - 10, boldFont, 8, WHITE);
  drawText(page, `SWMS #${swms.id}`, MARGIN + 90, y - 10, regularFont, 8, MUTED);
  y -= 30;

  // Details grid
  y = sectionHeading(page, boldFont, 'Details', y);
  const col2x = MARGIN + (PAGE_W - MARGIN * 2) / 2;
  const startY = y;
  labelValue(page, boldFont, regularFont, 'Work Activity', swms.work_activity ?? '', MARGIN, y, 240);
  y = labelValue(page, boldFont, regularFont, 'Scope of Work', swms.scope ?? '', col2x, startY, 240) - 10;

  y -= 10;
  y = sectionHeading(page, boldFont, 'Hazards Identified', y);
  const hazardLines = wrapText(swms.hazards ?? 'None identified', regularFont, 9, PAGE_W - MARGIN * 2 - 10);
  hazardLines.forEach((line, i) => drawText(page, line, MARGIN + 6, y - i * 13, regularFont, 9, BLACK));
  y -= hazardLines.length * 13 + 16;

  y = sectionHeading(page, boldFont, 'Risk Controls', y);
  const controlLines = wrapText(swms.controls ?? 'None specified', regularFont, 9, PAGE_W - MARGIN * 2 - 10);
  controlLines.forEach((line, i) => drawText(page, line, MARGIN + 6, y - i * 13, regularFont, 9, BLACK));
  y -= controlLines.length * 13 + 16;

  y = sectionHeading(page, boldFont, 'PPE Required', y);
  const ppeLines = wrapText(swms.ppe_required ?? 'Standard PPE', regularFont, 9, PAGE_W - MARGIN * 2 - 10);
  ppeLines.forEach((line, i) => drawText(page, line, MARGIN + 6, y - i * 13, regularFont, 9, BLACK));
  y -= ppeLines.length * 13 + 16;

  if (swms.legislation) {
    y = sectionHeading(page, boldFont, 'Legislation & Standards', y);
    const legLines = wrapText(swms.legislation, regularFont, 9, PAGE_W - MARGIN * 2 - 10);
    legLines.forEach((line, i) => drawText(page, line, MARGIN + 6, y - i * 13, regularFont, 9, BLACK));
    y -= legLines.length * 13 + 16;
  }

  if (swms.emergency_procedures) {
    y = sectionHeading(page, boldFont, 'Emergency Procedures', y);
    const epLines = wrapText(swms.emergency_procedures, regularFont, 9, PAGE_W - MARGIN * 2 - 10);
    epLines.forEach((line, i) => drawText(page, line, MARGIN + 6, y - i * 13, regularFont, 9, BLACK));
    y -= epLines.length * 13 + 16;
  }

  // Sign-offs
  if (swms.signoffs?.length) {
    // New page for signoffs if needed
    let sigPage = page;
    let sigY = y;
    if (sigY < 150) {
      sigPage = addPage(doc);
      drawHeader(sigPage, boldFont, regularFont, 'SWMS Sign-offs', swms.company_name);
      drawFooter(sigPage, regularFont, 2);
      sigY = PAGE_H - 90;
    }
    sigY = sectionHeading(sigPage, boldFont, `Worker Sign-offs (${swms.signoffs.length})`, sigY);
    // Table header
    drawRect(sigPage, MARGIN, sigY - 2, PAGE_W - MARGIN * 2, 16, SLATE);
    drawText(sigPage, 'Worker Name', MARGIN + 6, sigY + 1, boldFont, 8, WHITE);
    drawText(sigPage, 'White Card #', MARGIN + 200, sigY + 1, boldFont, 8, WHITE);
    drawText(sigPage, 'Signed At', MARGIN + 360, sigY + 1, boldFont, 8, WHITE);
    sigY -= 20;
    swms.signoffs.forEach((s, i) => {
      if (i % 2 === 0) drawRect(sigPage, MARGIN, sigY - 2, PAGE_W - MARGIN * 2, 16, LIGHT);
      drawText(sigPage, s.worker_name, MARGIN + 6, sigY + 1, regularFont, 8, BLACK);
      drawText(sigPage, s.white_card_number ?? '—', MARGIN + 200, sigY + 1, regularFont, 8, BLACK);
      const dt = new Date(s.signed_at).toLocaleString('en-AU', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
      drawText(sigPage, dt, MARGIN + 360, sigY + 1, regularFont, 8, BLACK);
      sigY -= 18;
    });
  }

  return doc.save();
}

// ── Safety Plan PDF ────────────────────────────────────────────────────────────

export interface SafetyPlanData {
  id: number;
  title: string;
  job_name?: string;
  job_number?: string;
  site_address?: string;
  project_value?: string;
  is_principal_contractor?: number | boolean;
  site_supervisor?: string;
  first_aid_officer?: string;
  emergency_contact?: string;
  nearest_hospital?: string;
  emergency_assembly_point?: string;
  evacuation_notes?: string;
  site_rules?: string;
  high_risk_activities?: string;
  required_posters?: string;
  status?: string;
  company_name?: string;
}

export async function generateSafetyPlanPdf(plan: SafetyPlanData): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const boldFont = await doc.embedFont(StandardFonts.HelveticaBold);
  const regularFont = await doc.embedFont(StandardFonts.Helvetica);

  const page = addPage(doc);
  drawHeader(page, boldFont, regularFont, 'Site Safety Plan', plan.company_name);
  drawFooter(page, regularFont, 1);

  let y = PAGE_H - 90;

  // Title block
  drawRect(page, MARGIN, y - 30, PAGE_W - MARGIN * 2, 36, DARK);
  drawText(page, plan.title, MARGIN + 8, y - 10, boldFont, 13, WHITE);
  if (plan.job_name) drawText(page, `Job: ${plan.job_number ? `#${plan.job_number} — ` : ''}${plan.job_name}`, MARGIN + 8, y - 24, regularFont, 9, MUTED);
  y -= 50;

  // Status
  const statusColor = plan.status === 'approved' ? rgb(0.133, 0.545, 0.133) : ORANGE;
  drawRect(page, MARGIN, y - 16, 80, 18, statusColor);
  drawText(page, (plan.status ?? 'draft').toUpperCase(), MARGIN + 6, y - 10, boldFont, 8, WHITE);
  if (plan.is_principal_contractor) {
    drawRect(page, MARGIN + 90, y - 16, 130, 18, SLATE);
    drawText(page, 'PRINCIPAL CONTRACTOR', MARGIN + 96, y - 10, boldFont, 7, WHITE);
  }
  y -= 34;

  // Project details
  y = sectionHeading(page, boldFont, 'Project Details', y);
  const col2x = MARGIN + (PAGE_W - MARGIN * 2) / 2;
  let leftY = y, rightY = y;
  leftY = labelValue(page, boldFont, regularFont, 'Site Address', plan.site_address ?? '', MARGIN, leftY, 240) - 8;
  rightY = labelValue(page, boldFont, regularFont, 'Project Value', plan.project_value ? `$${plan.project_value}` : '', col2x, rightY, 240) - 8;
  y = Math.min(leftY, rightY) - 8;

  // Personnel
  y = sectionHeading(page, boldFont, 'Key Personnel', y);
  leftY = y; rightY = y;
  leftY = labelValue(page, boldFont, regularFont, 'Site Supervisor', plan.site_supervisor ?? '', MARGIN, leftY, 240) - 8;
  rightY = labelValue(page, boldFont, regularFont, 'First Aid Officer', plan.first_aid_officer ?? '', col2x, rightY, 240) - 8;
  y = Math.min(leftY, rightY) - 8;
  leftY = y; rightY = y;
  leftY = labelValue(page, boldFont, regularFont, 'Emergency Contact', plan.emergency_contact ?? '', MARGIN, leftY, 240) - 8;
  rightY = labelValue(page, boldFont, regularFont, 'Nearest Hospital', plan.nearest_hospital ?? '', col2x, rightY, 240) - 8;
  y = Math.min(leftY, rightY) - 8;

  // Emergency
  y = sectionHeading(page, boldFont, 'Emergency Procedures', y);
  leftY = y; rightY = y;
  leftY = labelValue(page, boldFont, regularFont, 'Assembly Point', plan.emergency_assembly_point ?? '', MARGIN, leftY, 240) - 8;
  rightY = labelValue(page, boldFont, regularFont, 'Evacuation Notes', plan.evacuation_notes ?? '', col2x, rightY, 240) - 8;
  y = Math.min(leftY, rightY) - 8;

  // Site rules — may need new page
  if (plan.site_rules) {
    if (y < 150) {
      const p2 = addPage(doc);
      drawHeader(p2, boldFont, regularFont, 'Site Safety Plan (cont.)', plan.company_name);
      drawFooter(p2, regularFont, 2);
      y = PAGE_H - 90;
      const ruleLines = wrapText(plan.site_rules, regularFont, 9, PAGE_W - MARGIN * 2 - 10);
      y = sectionHeading(p2, boldFont, 'Site Rules', y);
      ruleLines.forEach((line, i) => drawText(p2, line, MARGIN + 6, y - i * 13, regularFont, 9, BLACK));
    } else {
      y = sectionHeading(page, boldFont, 'Site Rules', y);
      const ruleLines = wrapText(plan.site_rules, regularFont, 9, PAGE_W - MARGIN * 2 - 10);
      ruleLines.forEach((line, i) => drawText(page, line, MARGIN + 6, y - i * 13, regularFont, 9, BLACK));
      y -= ruleLines.length * 13 + 16;
    }
  }

  if (plan.high_risk_activities) {
    y = sectionHeading(page, boldFont, 'High Risk Activities', y);
    const hraLines = wrapText(plan.high_risk_activities, regularFont, 9, PAGE_W - MARGIN * 2 - 10);
    hraLines.forEach((line, i) => drawText(page, line, MARGIN + 6, y - i * 13, regularFont, 9, BLACK));
  }

  return doc.save();
}

// ── Job Cost Report PDF ────────────────────────────────────────────────────────

export interface CostEntry {
  purchase_date?: string;
  merchant?: string;
  description?: string;
  category?: string;
  amount?: number | string;
  gst_included?: number | boolean;
  gst_amount?: number | string;
  amount_ex_gst?: number | string;
  notes?: string;
}

export interface CostReportData {
  job_name: string;
  job_number?: string;
  company_name?: string;
  approved_estimate?: number;
  costs: CostEntry[];
}

export async function generateCostReportPdf(data: CostReportData): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const boldFont = await doc.embedFont(StandardFonts.HelveticaBold);
  const regularFont = await doc.embedFont(StandardFonts.Helvetica);

  const page = addPage(doc);
  const subtitle = data.job_number ? `Job #${data.job_number} — ${data.job_name}` : data.job_name;
  drawHeader(page, boldFont, regularFont, 'Job Cost Report', subtitle);
  drawFooter(page, regularFont, 1);

  let y = PAGE_H - 90;

  // Summary cards
  const totalCosts = data.costs.reduce((s, c) => s + Number(c.amount ?? 0), 0);
  const totalGst = data.costs.reduce((s, c) => s + Number(c.gst_amount ?? 0), 0);
  const cardW = (PAGE_W - MARGIN * 2 - 20) / 3;

  const cards = [
    { label: 'Total Costs (inc. GST)', value: `$${totalCosts.toFixed(2)}` },
    { label: 'Total GST', value: `$${totalGst.toFixed(2)}` },
    { label: 'Entries', value: String(data.costs.length) },
  ];
  cards.forEach((card, i) => {
    const cx = MARGIN + i * (cardW + 10);
    drawRect(page, cx, y - 44, cardW, 48, DARK);
    drawText(page, card.label, cx + 8, y - 14, regularFont, 7, MUTED);
    drawText(page, card.value, cx + 8, y - 32, boldFont, 13, WHITE);
  });
  y -= 60;

  // Table
  y = sectionHeading(page, boldFont, 'Cost Entries', y);
  const cols = [
    { label: 'Date', x: MARGIN + 4, w: 60 },
    { label: 'Merchant', x: MARGIN + 68, w: 100 },
    { label: 'Description', x: MARGIN + 172, w: 140 },
    { label: 'Category', x: MARGIN + 316, w: 80 },
    { label: 'Amount', x: MARGIN + 400, w: 70 },
    { label: 'GST', x: MARGIN + 474, w: 40 },
  ];

  // Header row
  drawRect(page, MARGIN, y - 2, PAGE_W - MARGIN * 2, 16, SLATE);
  cols.forEach(col => drawText(page, col.label, col.x, y + 1, boldFont, 7, WHITE));
  y -= 20;

  let currentPage = page;
  let pageNum = 1;

  for (let i = 0; i < data.costs.length; i++) {
    if (y < 60) {
      pageNum++;
      currentPage = addPage(doc);
      drawHeader(currentPage, boldFont, regularFont, 'Job Cost Report (cont.)', subtitle);
      drawFooter(currentPage, regularFont, pageNum);
      y = PAGE_H - 90;
      drawRect(currentPage, MARGIN, y - 2, PAGE_W - MARGIN * 2, 16, SLATE);
      cols.forEach(col => drawText(currentPage, col.label, col.x, y + 1, boldFont, 7, WHITE));
      y -= 20;
    }

    const c = data.costs[i];
    if (i % 2 === 0) drawRect(currentPage, MARGIN, y - 2, PAGE_W - MARGIN * 2, 16, LIGHT);

    const dateStr = c.purchase_date ? new Date(c.purchase_date).toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: '2-digit' }) : '—';
    drawText(currentPage, dateStr, cols[0].x, y + 1, regularFont, 7, BLACK);
    drawText(currentPage, String(c.merchant ?? '').substring(0, 16), cols[1].x, y + 1, regularFont, 7, BLACK);
    drawText(currentPage, String(c.description ?? '').substring(0, 22), cols[2].x, y + 1, regularFont, 7, BLACK);
    drawText(currentPage, String(c.category ?? '').substring(0, 12), cols[3].x, y + 1, regularFont, 7, BLACK);
    drawText(currentPage, `$${Number(c.amount ?? 0).toFixed(2)}`, cols[4].x, y + 1, regularFont, 7, BLACK);
    drawText(currentPage, c.gst_included ? 'Yes' : 'No', cols[5].x, y + 1, regularFont, 7, BLACK);
    y -= 18;
  }

  return doc.save();
}

// ── Safety Pack (combined PDF) ─────────────────────────────────────────────────

export async function generateSafetyPackPdf(
  plan: SafetyPlanData,
  swmsList: SwmsData[]
): Promise<Uint8Array> {
  // Generate each document then merge
  const planBytes = await generateSafetyPlanPdf(plan);
  const planDoc = await PDFDocument.load(planBytes);

  const merged = await PDFDocument.create();

  // Copy plan pages
  const planPages = await merged.copyPages(planDoc, planDoc.getPageIndices());
  planPages.forEach(p => merged.addPage(p));

  // Copy each SWMS
  for (const swms of swmsList) {
    const swmsBytes = await generateSwmsPdf({ ...swms, company_name: plan.company_name });
    const swmsDoc = await PDFDocument.load(swmsBytes);
    const swmsPages = await merged.copyPages(swmsDoc, swmsDoc.getPageIndices());
    swmsPages.forEach(p => merged.addPage(p));
  }

  return merged.save();
}
