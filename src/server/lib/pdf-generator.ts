/**
 * PDF Generator — server-side PDF creation using pdf-lib (pure JS, Alpine-safe).
 *
 * Provides helpers for generating:
 *  - SWMS PDFs
 *  - Safety Plan PDFs
 *  - Job Cost Report PDFs
 *  - Safety Pack (combined multi-document PDF)
 */

// pdf-lib is loaded lazily (dynamic import) to keep it out of the main SSR
// bundle traversal — this reduces Rollup peak memory by ~23 MB during publish.
import type { PDFDocument as PDFDocumentType, PDFPage as PDFPageType, PDFFont as PDFFontType, RGB } from 'pdf-lib';

type PdfLib = typeof import('pdf-lib');

async function getPdfLib(): Promise<PdfLib> {
  return import('pdf-lib') as Promise<PdfLib>;
}

// ── Colour palette ─────────────────────────────────────────────────────────────
// Colours are created lazily inside functions that already have pdfLib in scope.

// ── Page helpers ───────────────────────────────────────────────────────────────

const PAGE_W = 595.28;  // A4 width  (pt)
const PAGE_H = 841.89;  // A4 height (pt)
const MARGIN = 40;

function addPage(doc: PDFDocumentType): PDFPageType {
  return doc.addPage([PAGE_W, PAGE_H]);
}

function drawRect(page: PDFPageType, x: number, y: number, w: number, h: number, color: RGB) {
  page.drawRectangle({ x, y, width: w, height: h, color });
}

function drawText(
  page: PDFPageType, text: string, x: number, y: number,
  font: PDFFontType, size: number, color: RGB
) {
  page.drawText(text, { x, y, font, size, color });
}

function wrapText(text: string, font: PDFFontType, size: number, maxWidth: number): string[] {
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

function drawHeader(pdfLib: PdfLib, page: PDFPageType, boldFont: PDFFontType, regularFont: PDFFontType, title: string, subtitle?: string) {
  const { rgb } = pdfLib;
  const ORANGE = rgb(0.976, 0.451, 0.086);
  const WHITE  = rgb(1, 1, 1);
  drawRect(page, 0, PAGE_H - 70, PAGE_W, 70, ORANGE);
  drawText(page, 'IWILLBUILD', MARGIN, PAGE_H - 30, boldFont, 14, WHITE);
  drawText(page, title.toUpperCase(), MARGIN, PAGE_H - 50, boldFont, 11, WHITE);
  if (subtitle) {
    drawText(page, subtitle, MARGIN, PAGE_H - 64, regularFont, 8, rgb(1, 0.9, 0.8));
  }
  const dateStr = new Date().toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' });
  const dw = regularFont.widthOfTextAtSize(dateStr, 8);
  drawText(page, dateStr, PAGE_W - MARGIN - dw, PAGE_H - 30, regularFont, 8, WHITE);
}

function drawFooter(pdfLib: PdfLib, page: PDFPageType, regularFont: PDFFontType, pageNum: number, _totalPages?: number) {
  const { rgb } = pdfLib;
  const DARK  = rgb(0.059, 0.067, 0.090);
  const MUTED = rgb(0.502, 0.533, 0.580);
  drawRect(page, 0, 0, PAGE_W, 28, DARK);
  drawText(page, 'IWILLBUILD Portal — Confidential', MARGIN, 9, regularFont, 7, MUTED);
  const pg = _totalPages ? `Page ${pageNum} of ${_totalPages}` : `Page ${pageNum}`;
  const pw = regularFont.widthOfTextAtSize(pg, 7);
  drawText(page, pg, PAGE_W - MARGIN - pw, 9, regularFont, 7, MUTED);
}

function sectionHeading(pdfLib: PdfLib, page: PDFPageType, boldFont: PDFFontType, text: string, y: number): number {
  const { rgb } = pdfLib;
  const LIGHT = rgb(0.949, 0.953, 0.961);
  const SLATE = rgb(0.243, 0.267, 0.322);
  drawRect(page, MARGIN, y - 2, PAGE_W - MARGIN * 2, 18, LIGHT);
  drawText(page, text.toUpperCase(), MARGIN + 6, y + 3, boldFont, 8, SLATE);
  return y - 26;
}

function labelValue(
  pdfLib: PdfLib, page: PDFPageType, boldFont: PDFFontType, regularFont: PDFFontType,
  label: string, value: string, x: number, y: number, colW = 240
): number {
  const { rgb } = pdfLib;
  const BLACK = rgb(0, 0, 0);
  const MUTED = rgb(0.502, 0.533, 0.580);
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
  const pdfLib = await getPdfLib();
  const { PDFDocument, rgb, StandardFonts } = pdfLib;
  const BLACK = rgb(0, 0, 0);
  const WHITE = rgb(1, 1, 1);
  const ORANGE = rgb(0.976, 0.451, 0.086);
  const SLATE = rgb(0.243, 0.267, 0.322);
  const LIGHT = rgb(0.949, 0.953, 0.961);
  const MUTED = rgb(0.502, 0.533, 0.580);
  const doc = await PDFDocument.create();
  const boldFont = await doc.embedFont(StandardFonts.HelveticaBold);
  const regularFont = await doc.embedFont(StandardFonts.Helvetica);

  const page = addPage(doc);
  drawHeader(pdfLib, page, boldFont, regularFont, 'Safe Work Method Statement', swms.company_name);
  drawFooter(pdfLib, page, regularFont, 1);

  let y = PAGE_H - 90;

  // Title block
  drawRect(page, MARGIN, y - 30, PAGE_W - MARGIN * 2, 36, rgb(0.059, 0.067, 0.090));
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
  y = sectionHeading(pdfLib, page, boldFont, 'Details', y);
  const col2x = MARGIN + (PAGE_W - MARGIN * 2) / 2;
  const startY = y;
  labelValue(pdfLib, page, boldFont, regularFont, 'Work Activity', swms.work_activity ?? '', MARGIN, y, 240);
  y = labelValue(pdfLib, page, boldFont, regularFont, 'Scope of Work', swms.scope ?? '', col2x, startY, 240) - 10;

  y -= 10;
  y = sectionHeading(pdfLib, page, boldFont, 'Hazards Identified', y);
  const hazardLines = wrapText(swms.hazards ?? 'None identified', regularFont, 9, PAGE_W - MARGIN * 2 - 10);
  hazardLines.forEach((line, i) => drawText(page, line, MARGIN + 6, y - i * 13, regularFont, 9, BLACK));
  y -= hazardLines.length * 13 + 16;

  y = sectionHeading(pdfLib, page, boldFont, 'Risk Controls', y);
  const controlLines = wrapText(swms.controls ?? 'None specified', regularFont, 9, PAGE_W - MARGIN * 2 - 10);
  controlLines.forEach((line, i) => drawText(page, line, MARGIN + 6, y - i * 13, regularFont, 9, BLACK));
  y -= controlLines.length * 13 + 16;

  y = sectionHeading(pdfLib, page, boldFont, 'PPE Required', y);
  const ppeLines = wrapText(swms.ppe_required ?? 'Standard PPE', regularFont, 9, PAGE_W - MARGIN * 2 - 10);
  ppeLines.forEach((line, i) => drawText(page, line, MARGIN + 6, y - i * 13, regularFont, 9, BLACK));
  y -= ppeLines.length * 13 + 16;

  if (swms.legislation) {
    y = sectionHeading(pdfLib, page, boldFont, 'Legislation & Standards', y);
    const legLines = wrapText(swms.legislation, regularFont, 9, PAGE_W - MARGIN * 2 - 10);
    legLines.forEach((line, i) => drawText(page, line, MARGIN + 6, y - i * 13, regularFont, 9, BLACK));
    y -= legLines.length * 13 + 16;
  }

  if (swms.emergency_procedures) {
    y = sectionHeading(pdfLib, page, boldFont, 'Emergency Procedures', y);
    const epLines = wrapText(swms.emergency_procedures, regularFont, 9, PAGE_W - MARGIN * 2 - 10);
    epLines.forEach((line, i) => drawText(page, line, MARGIN + 6, y - i * 13, regularFont, 9, BLACK));
    y -= epLines.length * 13 + 16;
  }

  // Sign-offs
  if (swms.signoffs?.length) {
    let sigPage = page;
    let sigY = y;
    if (sigY < 150) {
      sigPage = addPage(doc);
      drawHeader(pdfLib, sigPage, boldFont, regularFont, 'SWMS Sign-offs', swms.company_name);
      drawFooter(pdfLib, sigPage, regularFont, 2);
      sigY = PAGE_H - 90;
    }
    sigY = sectionHeading(pdfLib, sigPage, boldFont, `Worker Sign-offs (${swms.signoffs.length})`, sigY);
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
  const pdfLib = await getPdfLib();
  const { PDFDocument, rgb, StandardFonts } = pdfLib;
  const BLACK = rgb(0, 0, 0);
  const WHITE = rgb(1, 1, 1);
  const ORANGE = rgb(0.976, 0.451, 0.086);
  const SLATE = rgb(0.243, 0.267, 0.322);
  const MUTED = rgb(0.502, 0.533, 0.580);
  const doc = await PDFDocument.create();
  const boldFont = await doc.embedFont(StandardFonts.HelveticaBold);
  const regularFont = await doc.embedFont(StandardFonts.Helvetica);

  const page = addPage(doc);
  drawHeader(pdfLib, page, boldFont, regularFont, 'Site Safety Plan', plan.company_name);
  drawFooter(pdfLib, page, regularFont, 1);

  let y = PAGE_H - 90;

  drawRect(page, MARGIN, y - 30, PAGE_W - MARGIN * 2, 36, rgb(0.059, 0.067, 0.090));
  drawText(page, plan.title, MARGIN + 8, y - 10, boldFont, 13, WHITE);
  if (plan.job_name) drawText(page, `Job: ${plan.job_number ? `#${plan.job_number} — ` : ''}${plan.job_name}`, MARGIN + 8, y - 24, regularFont, 9, MUTED);
  y -= 50;

  const statusColor = plan.status === 'approved' ? rgb(0.133, 0.545, 0.133) : ORANGE;
  drawRect(page, MARGIN, y - 16, 80, 18, statusColor);
  drawText(page, (plan.status ?? 'draft').toUpperCase(), MARGIN + 6, y - 10, boldFont, 8, WHITE);
  if (plan.is_principal_contractor) {
    drawRect(page, MARGIN + 90, y - 16, 130, 18, SLATE);
    drawText(page, 'PRINCIPAL CONTRACTOR', MARGIN + 96, y - 10, boldFont, 7, WHITE);
  }
  y -= 34;

  y = sectionHeading(pdfLib, page, boldFont, 'Project Details', y);
  const col2x = MARGIN + (PAGE_W - MARGIN * 2) / 2;
  let leftY = y, rightY = y;
  leftY = labelValue(pdfLib, page, boldFont, regularFont, 'Site Address', plan.site_address ?? '', MARGIN, leftY, 240) - 8;
  rightY = labelValue(pdfLib, page, boldFont, regularFont, 'Project Value', plan.project_value ? `$${plan.project_value}` : '', col2x, rightY, 240) - 8;
  y = Math.min(leftY, rightY) - 8;

  y = sectionHeading(pdfLib, page, boldFont, 'Key Personnel', y);
  leftY = y; rightY = y;
  leftY = labelValue(pdfLib, page, boldFont, regularFont, 'Site Supervisor', plan.site_supervisor ?? '', MARGIN, leftY, 240) - 8;
  rightY = labelValue(pdfLib, page, boldFont, regularFont, 'First Aid Officer', plan.first_aid_officer ?? '', col2x, rightY, 240) - 8;
  y = Math.min(leftY, rightY) - 8;
  leftY = y; rightY = y;
  leftY = labelValue(pdfLib, page, boldFont, regularFont, 'Emergency Contact', plan.emergency_contact ?? '', MARGIN, leftY, 240) - 8;
  rightY = labelValue(pdfLib, page, boldFont, regularFont, 'Nearest Hospital', plan.nearest_hospital ?? '', col2x, rightY, 240) - 8;
  y = Math.min(leftY, rightY) - 8;

  y = sectionHeading(pdfLib, page, boldFont, 'Emergency Procedures', y);
  leftY = y; rightY = y;
  leftY = labelValue(pdfLib, page, boldFont, regularFont, 'Assembly Point', plan.emergency_assembly_point ?? '', MARGIN, leftY, 240) - 8;
  rightY = labelValue(pdfLib, page, boldFont, regularFont, 'Evacuation Notes', plan.evacuation_notes ?? '', col2x, rightY, 240) - 8;
  y = Math.min(leftY, rightY) - 8;

  if (plan.site_rules) {
    if (y < 150) {
      const p2 = addPage(doc);
      drawHeader(pdfLib, p2, boldFont, regularFont, 'Site Safety Plan (cont.)', plan.company_name);
      drawFooter(pdfLib, p2, regularFont, 2);
      y = PAGE_H - 90;
      const ruleLines = wrapText(plan.site_rules, regularFont, 9, PAGE_W - MARGIN * 2 - 10);
      y = sectionHeading(pdfLib, p2, boldFont, 'Site Rules', y);
      ruleLines.forEach((line, i) => drawText(p2, line, MARGIN + 6, y - i * 13, regularFont, 9, BLACK));
    } else {
      y = sectionHeading(pdfLib, page, boldFont, 'Site Rules', y);
      const ruleLines = wrapText(plan.site_rules, regularFont, 9, PAGE_W - MARGIN * 2 - 10);
      ruleLines.forEach((line, i) => drawText(page, line, MARGIN + 6, y - i * 13, regularFont, 9, BLACK));
      y -= ruleLines.length * 13 + 16;
    }
  }

  if (plan.high_risk_activities) {
    y = sectionHeading(pdfLib, page, boldFont, 'High Risk Activities', y);
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
  const pdfLib = await getPdfLib();
  const { PDFDocument, rgb, StandardFonts } = pdfLib;
  const BLACK = rgb(0, 0, 0);
  const WHITE = rgb(1, 1, 1);
  const SLATE = rgb(0.243, 0.267, 0.322);
  const LIGHT = rgb(0.949, 0.953, 0.961);
  const MUTED = rgb(0.502, 0.533, 0.580);
  const doc = await PDFDocument.create();
  const boldFont = await doc.embedFont(StandardFonts.HelveticaBold);
  const regularFont = await doc.embedFont(StandardFonts.Helvetica);

  const page = addPage(doc);
  const subtitle = data.job_number ? `Job #${data.job_number} — ${data.job_name}` : data.job_name;
  drawHeader(pdfLib, page, boldFont, regularFont, 'Job Cost Report', subtitle);
  drawFooter(pdfLib, page, regularFont, 1);

  let y = PAGE_H - 90;

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
    drawRect(page, cx, y - 44, cardW, 48, rgb(0.059, 0.067, 0.090));
    drawText(page, card.label, cx + 8, y - 14, regularFont, 7, MUTED);
    drawText(page, card.value, cx + 8, y - 32, boldFont, 13, WHITE);
  });
  y -= 60;

  y = sectionHeading(pdfLib, page, boldFont, 'Cost Entries', y);
  const cols = [
    { label: 'Date', x: MARGIN + 4, w: 60 },
    { label: 'Merchant', x: MARGIN + 68, w: 100 },
    { label: 'Description', x: MARGIN + 172, w: 140 },
    { label: 'Category', x: MARGIN + 316, w: 80 },
    { label: 'Amount', x: MARGIN + 400, w: 70 },
    { label: 'GST', x: MARGIN + 474, w: 40 },
  ];

  drawRect(page, MARGIN, y - 2, PAGE_W - MARGIN * 2, 16, SLATE);
  cols.forEach(col => drawText(page, col.label, col.x, y + 1, boldFont, 7, WHITE));
  y -= 20;

  let currentPage = page;
  let pageNum = 1;

  for (let i = 0; i < data.costs.length; i++) {
    if (y < 60) {
      pageNum++;
      currentPage = addPage(doc);
      drawHeader(pdfLib, currentPage, boldFont, regularFont, 'Job Cost Report (cont.)', subtitle);
      drawFooter(pdfLib, currentPage, regularFont, pageNum);
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

// ── Estimate PDF ──────────────────────────────────────────────────────────────

export interface EstimateLine {
  category?: string;
  description: string;
  quantity: string | number;
  unit?: string;
  rate: string | number;
  lineOrder?: number;
}

export interface EstimateData {
  id: number;
  title: string;
  status?: string;
  markup_percent?: number | string;
  gst_mode?: string;
  notes?: string;
  valid_until?: string;
  company_name?: string;
  company_abn?: string;
  company_phone?: string;
  company_email?: string;
  company_address?: string;
  job_name?: string;
  job_number?: string;
  job_address?: string;
  client_name?: string;
  header_text?: string;
  footer_text?: string;
  disclaimer?: string;
  payment_terms?: string;
  acceptance_note?: string;
  lines: EstimateLine[];
}

function fmtMoney(v: number): string {
  return `$${v.toLocaleString('en-AU', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export async function generateEstimatePdf(data: EstimateData): Promise<Uint8Array> {
  const pdfLib = await getPdfLib();
  const { PDFDocument, rgb, StandardFonts } = pdfLib;
  const BLACK   = rgb(0, 0, 0);
  const GREY_HD = rgb(0.88, 0.88, 0.88);  // light grey — table header row
  const GREY_LN = rgb(0.96, 0.96, 0.96);  // very light grey — alternating row tint
  const MUTED   = rgb(0.45, 0.45, 0.45);  // mid-grey for secondary text
  const RULE    = rgb(0.80, 0.80, 0.80);  // horizontal rule colour

  const doc = await PDFDocument.create();
  const boldFont    = await doc.embedFont(StandardFonts.HelveticaBold);
  const regularFont = await doc.embedFont(StandardFonts.Helvetica);

  const subtitle = data.job_number
    ? `Job #${data.job_number} — ${data.job_name ?? ''}`
    : (data.job_name ?? '');

  const companyDisplay = data.company_name ?? 'IWILLBUILD';

  // ── helpers ───────────────────────────────────────────────────────────────────
  function hRule(pg: PDFPageType, yPos: number) {
    pg.drawLine({ start: { x: MARGIN, y: yPos }, end: { x: PAGE_W - MARGIN, y: yPos }, thickness: 0.5, color: RULE });
  }
  function tblHeader(pg: PDFPageType, yPos: number) {
    drawRect(pg, MARGIN, yPos - 3, PAGE_W - MARGIN * 2, 16, GREY_HD);
  }

  // ── Page 1 ───────────────────────────────────────────────────────────────────
  let page = addPage(doc);
  let y = PAGE_H - MARGIN;
  let pageNum = 1;

  // Document header — bold company name + date, no coloured background
  drawText(page, companyDisplay, MARGIN, y, boldFont, 16, BLACK);
  const dateStr = new Date().toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' });
  const dw = regularFont.widthOfTextAtSize(dateStr, 9);
  drawText(page, dateStr, PAGE_W - MARGIN - dw, y, regularFont, 9, MUTED);
  y -= 18;
  drawText(page, 'ESTIMATE', MARGIN, y, boldFont, 11, BLACK);
  y -= 12;
  hRule(page, y);
  y -= 16;

  // Estimate title + meta
  drawText(page, data.title, MARGIN, y, boldFont, 13, BLACK);
  y -= 14;
  if (subtitle) { drawText(page, subtitle, MARGIN, y, regularFont, 9, MUTED); y -= 12; }

  // Status + ID — plain text, no coloured pill
  drawText(page, (data.status ?? 'Draft').toUpperCase(), MARGIN, y, boldFont, 8, MUTED);
  const estLabel = `Estimate #${data.id}`;
  const elw = regularFont.widthOfTextAtSize(estLabel, 8);
  drawText(page, estLabel, PAGE_W - MARGIN - elw, y, regularFont, 8, MUTED);
  y -= 10;
  if (data.valid_until) {
    const vd = `Valid until: ${new Date(data.valid_until).toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' })}`;
    const vw = regularFont.widthOfTextAtSize(vd, 8);
    drawText(page, vd, PAGE_W - MARGIN - vw, y, regularFont, 8, MUTED);
    y -= 10;
  }
  y -= 8;
  hRule(page, y);
  y -= 18;

  // Prepared By / For — two-column
  drawText(page, 'PREPARED BY / FOR', MARGIN, y, boldFont, 7, MUTED);
  y -= 14;

  const col2x = MARGIN + (PAGE_W - MARGIN * 2) / 2;
  let leftY = y, rightY = y;

  if (data.company_name) { drawText(page, data.company_name, MARGIN, leftY, boldFont, 9, BLACK); leftY -= 13; }
  if (data.company_abn)     { drawText(page, `ABN: ${data.company_abn}`, MARGIN, leftY, regularFont, 8, MUTED); leftY -= 11; }
  if (data.company_phone)   { drawText(page, data.company_phone, MARGIN, leftY, regularFont, 8, MUTED); leftY -= 11; }
  if (data.company_email)   { drawText(page, data.company_email, MARGIN, leftY, regularFont, 8, MUTED); leftY -= 11; }
  if (data.company_address) { drawText(page, data.company_address, MARGIN, leftY, regularFont, 8, MUTED); leftY -= 11; }

  if (data.client_name) {
    drawText(page, 'Prepared for:', col2x, rightY, regularFont, 8, MUTED); rightY -= 12;
    drawText(page, data.client_name, col2x, rightY, boldFont, 9, BLACK); rightY -= 13;
  }
  if (data.job_address) { drawText(page, data.job_address, col2x, rightY, regularFont, 8, MUTED); rightY -= 11; }

  y = Math.min(leftY, rightY) - 14;
  hRule(page, y);
  y -= 18;

  // Optional header notes
  if (data.header_text) {
    drawText(page, 'NOTES', MARGIN, y, boldFont, 7, MUTED); y -= 12;
    const hl = wrapText(data.header_text, regularFont, 8, PAGE_W - MARGIN * 2);
    hl.forEach((l, i) => drawText(page, l, MARGIN, y - i * 12, regularFont, 8, BLACK));
    y -= hl.length * 12 + 12;
    hRule(page, y);
    y -= 18;
  }

  // ── Line items table ──────────────────────────────────────────────────────────
  drawText(page, 'LINE ITEMS', MARGIN, y, boldFont, 7, MUTED);
  y -= 14;

  const COL = {
    cat:  { x: MARGIN,        w: 70  },
    desc: { x: MARGIN + 74,   w: 200 },
    qty:  { x: MARGIN + 278,  w: 40  },
    unit: { x: MARGIN + 322,  w: 36  },
    rate: { x: MARGIN + 362,  w: 60  },
    amt:  { x: MARGIN + 426,  w: 69  },
  };

  // Table header — light grey, black text
  tblHeader(page, y);
  drawText(page, 'Category',    COL.cat.x + 2,  y + 1, boldFont, 7, BLACK);
  drawText(page, 'Description', COL.desc.x + 2, y + 1, boldFont, 7, BLACK);
  drawText(page, 'Qty',         COL.qty.x + 2,  y + 1, boldFont, 7, BLACK);
  drawText(page, 'Unit',        COL.unit.x + 2, y + 1, boldFont, 7, BLACK);
  drawText(page, 'Rate',        COL.rate.x + 2, y + 1, boldFont, 7, BLACK);
  const amtHW = boldFont.widthOfTextAtSize('Amount', 7);
  drawText(page, 'Amount', COL.amt.x + COL.amt.w - amtHW, y + 1, boldFont, 7, BLACK);
  y -= 20;

  const markup = Number(data.markup_percent ?? 0);
  const rawGstMode = String(data.gst_mode ?? 'inclusive').toLowerCase();
  const gstMode = rawGstMode === 'add 10% gst' ? 'exclusive'
    : rawGstMode === 'no gst' ? 'no_gst'
    : rawGstMode;
  let subtotalEx = 0;

  for (let i = 0; i < data.lines.length; i++) {
    if (y < 80) {
      pageNum++;
      page = addPage(doc);
      y = PAGE_H - MARGIN;
      drawText(page, companyDisplay, MARGIN, y, boldFont, 11, BLACK);
      drawText(page, `Estimate #${data.id} — continued`, MARGIN + boldFont.widthOfTextAtSize(companyDisplay, 11) + 10, y, regularFont, 9, MUTED);
      y -= 14; hRule(page, y); y -= 16;
      tblHeader(page, y);
      drawText(page, 'Category',    COL.cat.x + 2,  y + 1, boldFont, 7, BLACK);
      drawText(page, 'Description', COL.desc.x + 2, y + 1, boldFont, 7, BLACK);
      drawText(page, 'Qty',         COL.qty.x + 2,  y + 1, boldFont, 7, BLACK);
      drawText(page, 'Unit',        COL.unit.x + 2, y + 1, boldFont, 7, BLACK);
      drawText(page, 'Rate',        COL.rate.x + 2, y + 1, boldFont, 7, BLACK);
      const amtHW2 = boldFont.widthOfTextAtSize('Amount', 7);
      drawText(page, 'Amount', COL.amt.x + COL.amt.w - amtHW2, y + 1, boldFont, 7, BLACK);
      y -= 20;
    }

    const ln = data.lines[i];
    const qty  = Number(ln.quantity ?? 0);
    const rate = Number(ln.rate ?? 0);
    const withMarkup = markup > 0 ? qty * rate * (1 + markup / 100) : qty * rate;
    subtotalEx += withMarkup;

    const descLines = wrapText(ln.description ?? '', regularFont, 7, COL.desc.w);
    const rowH = Math.max(16, descLines.length * 11 + 4);

    if (i % 2 === 0) drawRect(page, MARGIN, y - rowH + 14, PAGE_W - MARGIN * 2, rowH, GREY_LN);

    drawText(page, String(ln.category ?? '').substring(0, 12), COL.cat.x + 2, y + 1, regularFont, 7, MUTED);
    descLines.forEach((dl, di) => drawText(page, dl, COL.desc.x + 2, y + 1 - di * 11, regularFont, 7, BLACK));
    drawText(page, String(qty),           COL.qty.x + 2,  y + 1, regularFont, 7, BLACK);
    drawText(page, String(ln.unit ?? ''), COL.unit.x + 2, y + 1, regularFont, 7, MUTED);
    drawText(page, fmtMoney(rate),        COL.rate.x + 2, y + 1, regularFont, 7, BLACK);
    const amtStr = fmtMoney(withMarkup);
    const amtW = boldFont.widthOfTextAtSize(amtStr, 7);
    drawText(page, amtStr, COL.amt.x + COL.amt.w - amtW, y + 1, boldFont, 7, BLACK);
    y -= rowH;
  }

  // ── Totals — right-aligned, plain black, no coloured backgrounds ──────────────
  y -= 10;
  if (y < 130) {
    pageNum++;
    page = addPage(doc);
    y = PAGE_H - MARGIN;
    drawText(page, companyDisplay, MARGIN, y, boldFont, 11, BLACK);
    y -= 14; hRule(page, y); y -= 16;
  }

  hRule(page, y);
  y -= 6;

  let gstAmount = 0;
  let totalInc  = 0;
  if (gstMode === 'inclusive') {
    totalInc  = subtotalEx;
    gstAmount = subtotalEx / 11;
  } else if (gstMode === 'exclusive') {
    gstAmount = subtotalEx * 0.1;
    totalInc  = subtotalEx + gstAmount;
  } else {
    totalInc  = subtotalEx;
  }

  const totalsRows: Array<{ label: string; value: string; isFinal?: boolean }> = [];
  if (markup > 0) {
    totalsRows.push({ label: `Subtotal (before ${markup}% markup)`, value: fmtMoney(subtotalEx / (1 + markup / 100)) });
    totalsRows.push({ label: `Markup (${markup}%)`, value: fmtMoney(subtotalEx - subtotalEx / (1 + markup / 100)) });
  }
  totalsRows.push({ label: gstMode === 'inclusive' ? 'Subtotal (ex. GST)' : 'Subtotal', value: fmtMoney(subtotalEx) });
  if (gstMode !== 'no_gst') totalsRows.push({ label: 'GST (10%)', value: fmtMoney(gstAmount) });
  totalsRows.push({ label: 'TOTAL', value: fmtMoney(totalInc), isFinal: true });

  const totalsLabelX = PAGE_W - MARGIN - 200;
  const totalsValueX = PAGE_W - MARGIN;

  totalsRows.forEach((row) => {
    const font = row.isFinal ? boldFont : regularFont;
    const size = row.isFinal ? 10 : 8;
    const color = row.isFinal ? BLACK : MUTED;
    if (row.isFinal) hRule(page, y + size + 3);
    const vw = font.widthOfTextAtSize(row.value, size);
    drawText(page, row.label, totalsLabelX, y, font, size, color);
    drawText(page, row.value, totalsValueX - vw, y, font, size, row.isFinal ? BLACK : MUTED);
    y -= 16;
  });

  y -= 16;

  // ── Disclaimer / terms ────────────────────────────────────────────────────────
  if (data.disclaimer || data.payment_terms || data.acceptance_note) {
    if (y < 100) {
      pageNum++;
      page = addPage(doc);
      y = PAGE_H - MARGIN;
      drawText(page, companyDisplay, MARGIN, y, boldFont, 11, BLACK);
      y -= 14; hRule(page, y); y -= 16;
    }
    if (data.disclaimer) {
      drawText(page, 'DISCLAIMER', MARGIN, y, boldFont, 7, MUTED); y -= 12;
      const dl = wrapText(data.disclaimer, regularFont, 8, PAGE_W - MARGIN * 2);
      dl.forEach((l, i) => drawText(page, l, MARGIN, y - i * 12, regularFont, 8, MUTED));
      y -= dl.length * 12 + 12;
    }
    if (data.payment_terms) {
      drawText(page, 'PAYMENT TERMS', MARGIN, y, boldFont, 7, MUTED); y -= 12;
      const pl = wrapText(data.payment_terms, regularFont, 8, PAGE_W - MARGIN * 2);
      pl.forEach((l, i) => drawText(page, l, MARGIN, y - i * 12, regularFont, 8, BLACK));
      y -= pl.length * 12 + 12;
    }
    if (data.acceptance_note) {
      drawText(page, 'ACCEPTANCE', MARGIN, y, boldFont, 7, MUTED); y -= 12;
      const al = wrapText(data.acceptance_note, regularFont, 8, PAGE_W - MARGIN * 2);
      al.forEach((l, i) => drawText(page, l, MARGIN, y - i * 12, regularFont, 8, BLACK));
    }
  }

  void pageNum; // used for continuation headers above
  return doc.save();
}

// ── Invoice PDF ────────────────────────────────────────────────────────────────

export interface InvoiceLineItem {
  description: string;
  quantity: string | number;
  unit_price: string | number;
  amount: string | number;
  gst_amount?: string | number;
  sort_order?: number;
}

export interface InvoiceData {
  id: number;
  invoice_number?: string;
  status?: string;
  issue_date?: string;
  due_date?: string;
  notes?: string;
  payment_terms?: string;
  stripe_payment_link?: string;
  company_name?: string;
  company_abn?: string;
  company_phone?: string;
  company_email?: string;
  company_address?: string;
  customer_name?: string;
  customer_email?: string;
  customer_phone?: string;
  customer_address?: string;
  customer_abn?: string;
  job_name?: string;
  job_number?: string;
  job_address?: string;
  subtotal?: string | number;
  gst_total?: string | number;
  total?: string | number;
  amount_paid?: string | number;
  amount_due?: string | number;
  lines: InvoiceLineItem[];
}

export async function generateInvoicePdf(data: InvoiceData): Promise<Uint8Array> {
  const pdfLib = await getPdfLib();
  const { PDFDocument, rgb, StandardFonts } = pdfLib;
  const BLACK  = rgb(0, 0, 0);
  const WHITE  = rgb(1, 1, 1);
  const PURPLE = rgb(0.486, 0.227, 0.929); // #7c3aed — system primary
  const SLATE  = rgb(0.243, 0.267, 0.322);
  const LIGHT  = rgb(0.949, 0.953, 0.961);
  const MUTED  = rgb(0.502, 0.533, 0.580);
  const GREEN  = rgb(0.133, 0.545, 0.133);
  const RED    = rgb(0.8, 0.1, 0.1);

  const doc = await PDFDocument.create();
  const boldFont    = await doc.embedFont(StandardFonts.HelveticaBold);
  const regularFont = await doc.embedFont(StandardFonts.Helvetica);

  const subtitle = data.job_number
    ? `Job #${data.job_number} — ${data.job_name ?? ''}`
    : (data.job_name ?? '');

  let page = addPage(doc);
  drawHeader(pdfLib, page, boldFont, regularFont, 'Tax Invoice', data.company_name);
  drawFooter(pdfLib, page, regularFont, 1);
  let y = PAGE_H - 90;
  let pageNum = 1;

  // Invoice title block
  drawRect(page, MARGIN, y - 30, PAGE_W - MARGIN * 2, 36, SLATE);
  const invNum = data.invoice_number ? `Invoice #${data.invoice_number}` : `Invoice #${data.id}`;
  drawText(page, invNum, MARGIN + 8, y - 10, boldFont, 13, WHITE);
  if (subtitle) drawText(page, subtitle, MARGIN + 8, y - 24, regularFont, 9, MUTED);
  y -= 50;

  // Status + dates
  const statusColor = data.status === 'paid' ? GREEN : (data.status === 'overdue' ? RED : (data.status === 'sent' ? PURPLE : SLATE));
  drawRect(page, MARGIN, y - 16, 80, 18, statusColor);
  drawText(page, (data.status ?? 'draft').toUpperCase(), MARGIN + 6, y - 10, boldFont, 8, WHITE);
  if (data.issue_date) {
    const id2 = `Issued: ${new Date(data.issue_date).toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' })}`;
    drawText(page, id2, MARGIN + 90, y - 10, regularFont, 8, MUTED);
  }
  if (data.due_date) {
    const dd = `Due: ${new Date(data.due_date).toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: 'numeric' })}`;
    const dw = regularFont.widthOfTextAtSize(dd, 8);
    drawText(page, dd, PAGE_W - MARGIN - dw, y - 10, regularFont, 8, data.status === 'overdue' ? RED : MUTED);
  }
  y -= 32;

  // Billed by / Billed to
  y = sectionHeading(pdfLib, page, boldFont, 'Billed By / Billed To', y);
  const col2x = MARGIN + (PAGE_W - MARGIN * 2) / 2;
  let leftY = y, rightY = y;

  if (data.company_name)   { drawText(page, data.company_name, MARGIN + 4, leftY, boldFont, 9, BLACK); leftY -= 14; }
  if (data.company_abn)    { drawText(page, `ABN: ${data.company_abn}`, MARGIN + 4, leftY, regularFont, 8, MUTED); leftY -= 12; }
  if (data.company_phone)  { drawText(page, data.company_phone, MARGIN + 4, leftY, regularFont, 8, MUTED); leftY -= 12; }
  if (data.company_email)  { drawText(page, data.company_email, MARGIN + 4, leftY, regularFont, 8, MUTED); leftY -= 12; }
  if (data.company_address){ drawText(page, data.company_address, MARGIN + 4, leftY, regularFont, 8, MUTED); leftY -= 12; }

  if (data.customer_name)   { drawText(page, data.customer_name, col2x + 4, rightY, boldFont, 9, BLACK); rightY -= 14; }
  if (data.customer_abn)    { drawText(page, `ABN: ${data.customer_abn}`, col2x + 4, rightY, regularFont, 8, MUTED); rightY -= 12; }
  if (data.customer_phone)  { drawText(page, data.customer_phone, col2x + 4, rightY, regularFont, 8, MUTED); rightY -= 12; }
  if (data.customer_email)  { drawText(page, data.customer_email, col2x + 4, rightY, regularFont, 8, MUTED); rightY -= 12; }
  if (data.customer_address){ drawText(page, data.customer_address, col2x + 4, rightY, regularFont, 8, MUTED); rightY -= 12; }

  y = Math.min(leftY, rightY) - 16;

  // Line items
  y = sectionHeading(pdfLib, page, boldFont, 'Line Items', y);

  const ICOL = {
    desc: { x: MARGIN + 4,   w: 240 },
    qty:  { x: MARGIN + 248, w: 40  },
    unit: { x: MARGIN + 292, w: 60  },
    gst:  { x: MARGIN + 356, w: 60  },
    amt:  { x: MARGIN + 420, w: 80  },
  };

  drawRect(page, MARGIN, y - 2, PAGE_W - MARGIN * 2, 16, SLATE);
  drawText(page, 'Description', ICOL.desc.x, y + 1, boldFont, 7, WHITE);
  drawText(page, 'Qty',         ICOL.qty.x,  y + 1, boldFont, 7, WHITE);
  drawText(page, 'Unit Price',  ICOL.unit.x, y + 1, boldFont, 7, WHITE);
  drawText(page, 'GST',         ICOL.gst.x,  y + 1, boldFont, 7, WHITE);
  drawText(page, 'Amount',      ICOL.amt.x,  y + 1, boldFont, 7, WHITE);
  y -= 20;

  for (let i = 0; i < data.lines.length; i++) {
    if (y < 60) {
      pageNum++;
      page = addPage(doc);
      drawHeader(pdfLib, page, boldFont, regularFont, 'Tax Invoice (cont.)', data.company_name);
      drawFooter(pdfLib, page, regularFont, pageNum);
      y = PAGE_H - 90;
      drawRect(page, MARGIN, y - 2, PAGE_W - MARGIN * 2, 16, SLATE);
      drawText(page, 'Description', ICOL.desc.x, y + 1, boldFont, 7, WHITE);
      drawText(page, 'Qty',         ICOL.qty.x,  y + 1, boldFont, 7, WHITE);
      drawText(page, 'Unit Price',  ICOL.unit.x, y + 1, boldFont, 7, WHITE);
      drawText(page, 'GST',         ICOL.gst.x,  y + 1, boldFont, 7, WHITE);
      drawText(page, 'Amount',      ICOL.amt.x,  y + 1, boldFont, 7, WHITE);
      y -= 20;
    }

    const ln = data.lines[i];
    const descLines = wrapText(ln.description ?? '', regularFont, 7, ICOL.desc.w);
    const rowH = Math.max(16, descLines.length * 11 + 4);
    if (i % 2 === 0) drawRect(page, MARGIN, y - rowH + 14, PAGE_W - MARGIN * 2, rowH, LIGHT);

    descLines.forEach((dl, di) => drawText(page, dl, ICOL.desc.x, y + 1 - di * 11, regularFont, 7, BLACK));
    const qtyVal = parseFloat(String(ln.quantity ?? '0'));
    const qtyStr = isNaN(qtyVal) ? String(ln.quantity ?? '') : qtyVal.toFixed(2);
    drawText(page, qtyStr,                                       ICOL.qty.x,  y + 1, regularFont, 7, BLACK);
    drawText(page, fmtMoney(Number(ln.unit_price ?? 0)),         ICOL.unit.x, y + 1, regularFont, 7, BLACK);
    drawText(page, fmtMoney(Number(ln.gst_amount ?? 0)),         ICOL.gst.x,  y + 1, regularFont, 7, MUTED);
    drawText(page, fmtMoney(Number(ln.amount ?? 0)),             ICOL.amt.x,  y + 1, boldFont,    7, BLACK);
    y -= rowH;
  }

  // Totals
  y -= 8;
  if (y < 140) {
    pageNum++;
    page = addPage(doc);
    drawHeader(pdfLib, page, boldFont, regularFont, 'Tax Invoice — Totals', data.company_name);
    drawFooter(pdfLib, page, regularFont, pageNum);
    y = PAGE_H - 90;
  }

  const totalsX = PAGE_W - MARGIN - 180;
  const totalsW = 180;
  const amtDue = Number(data.amount_due ?? data.total ?? 0);
  const amtPaid = Number(data.amount_paid ?? 0);

  const tRows: Array<{ label: string; value: string; bold?: boolean; highlight?: boolean; color?: typeof PURPLE }> = [
    { label: 'Subtotal (ex. GST)', value: fmtMoney(Number(data.subtotal ?? 0)) },
    { label: 'GST (10%)',          value: fmtMoney(Number(data.gst_total ?? 0)) },
    { label: 'Total (inc. GST)',   value: fmtMoney(Number(data.total ?? 0)), bold: true },
  ];
  if (amtPaid > 0) {
    tRows.push({ label: 'Amount Paid', value: fmtMoney(amtPaid), color: GREEN });
  }
  tRows.push({ label: 'AMOUNT DUE', value: fmtMoney(amtDue), bold: true, highlight: true });

  const blockH2 = tRows.length * 18 + 8;
  drawRect(page, totalsX - 8, y - blockH2 + 8, totalsW + 8, blockH2, LIGHT);

  tRows.forEach((row) => {
    if (row.highlight) drawRect(page, totalsX - 8, y - 14, totalsW + 8, 18, PURPLE);
    const vw = (row.bold ? boldFont : regularFont).widthOfTextAtSize(row.value, 9);
    const textColor = row.highlight ? WHITE : (row.color ?? BLACK);
    drawText(page, row.label, totalsX, y, row.bold ? boldFont : regularFont, 8, row.highlight ? WHITE : MUTED);
    drawText(page, row.value, totalsX + totalsW - vw, y, row.bold ? boldFont : regularFont, 9, textColor);
    y -= 18;
  });

  y -= 16;

  // Payment link notice
  if (data.stripe_payment_link) {
    if (y < 80) {
      pageNum++;
      page = addPage(doc);
      drawHeader(pdfLib, page, boldFont, regularFont, 'Tax Invoice — Payment', data.company_name);
      drawFooter(pdfLib, page, regularFont, pageNum);
      y = PAGE_H - 90;
    }
    drawRect(page, MARGIN, y - 28, PAGE_W - MARGIN * 2, 32, rgb(0.059, 0.067, 0.090));
    drawText(page, 'Pay online:', MARGIN + 8, y - 8, boldFont, 8, MUTED);
    drawText(page, data.stripe_payment_link, MARGIN + 8, y - 22, regularFont, 8, PURPLE);
    y -= 44;
  }

  // Notes / payment terms
  if (data.notes) {
    y = sectionHeading(pdfLib, page, boldFont, 'Notes', y);
    const nl = wrapText(data.notes, regularFont, 8, PAGE_W - MARGIN * 2 - 10);
    nl.forEach((l, i) => drawText(page, l, MARGIN + 4, y - i * 12, regularFont, 8, BLACK));
    y -= nl.length * 12 + 12;
  }
  if (data.payment_terms) {
    y = sectionHeading(pdfLib, page, boldFont, 'Payment Terms', y);
    const pl = wrapText(data.payment_terms, regularFont, 8, PAGE_W - MARGIN * 2 - 10);
    pl.forEach((l, i) => drawText(page, l, MARGIN + 4, y - i * 12, regularFont, 8, MUTED));
  }

  return doc.save();
}

// ── Safety Pack (combined PDF) ─────────────────────────────────────────────────

export async function generateSafetyPackPdf(
  plan: SafetyPlanData,
  swmsList: SwmsData[]
): Promise<Uint8Array> {
  const { PDFDocument } = await getPdfLib();
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
