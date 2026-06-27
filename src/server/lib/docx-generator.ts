/**
 * DOCX Generator — server-side Word document creation using the docx library.
 *
 * Generates:
 *  - SWMS Word document
 *  - Safety Plan Word document
 *  - Job Cost Report Word document
 */

import {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  HeadingLevel, AlignmentType, WidthType, BorderStyle, ShadingType,
  Header, Footer, PageNumber, NumberFormat,
} from 'docx';
import type { SwmsData, SafetyPlanData, CostReportData } from './pdf-generator.js';

// ── Colour constants (OOXML hex, no #) ────────────────────────────────────────
const ORANGE_HEX = 'F97316';
const DARK_HEX   = '0F1117';
const SLATE_HEX  = '3E4452';
const LIGHT_HEX  = 'F2F3F5';
const MUTED_HEX  = '808890';
const WHITE_HEX  = 'FFFFFF';

// ── Helpers ────────────────────────────────────────────────────────────────────

function bold(text: string, size = 22, color = '000000'): TextRun {
  return new TextRun({ text, bold: true, size, color });
}
function normal(text: string, size = 20, color = '000000'): TextRun {
  return new TextRun({ text, size, color });
}
function muted(text: string, size = 18): TextRun {
  return new TextRun({ text, size, color: MUTED_HEX });
}

function heading1(text: string): Paragraph {
  return new Paragraph({
    children: [new TextRun({ text, bold: true, size: 32, color: WHITE_HEX })],
    heading: HeadingLevel.HEADING_1,
    shading: { type: ShadingType.SOLID, color: DARK_HEX, fill: DARK_HEX },
    spacing: { before: 200, after: 100 },
  });
}

function sectionHead(text: string): Paragraph {
  return new Paragraph({
    children: [new TextRun({ text: text.toUpperCase(), bold: true, size: 18, color: SLATE_HEX })],
    shading: { type: ShadingType.SOLID, color: LIGHT_HEX, fill: LIGHT_HEX },
    spacing: { before: 240, after: 80 },
  });
}

function labelPara(label: string, value: string): Paragraph[] {
  return [
    new Paragraph({ children: [muted(label, 16)], spacing: { before: 80, after: 20 } }),
    new Paragraph({ children: [normal(value || '—')], spacing: { before: 0, after: 80 } }),
  ];
}

function divider(): Paragraph {
  return new Paragraph({
    children: [],
    border: { bottom: { color: LIGHT_HEX, space: 1, style: BorderStyle.SINGLE, size: 6 } },
    spacing: { before: 100, after: 100 },
  });
}

function docHeader(title: string, subtitle?: string): Header {
  return new Header({
    children: [
      new Paragraph({
        children: [
          new TextRun({ text: 'IWILLBUILD  ', bold: true, size: 22, color: WHITE_HEX }),
          new TextRun({ text: `| ${title.toUpperCase()}`, size: 20, color: 'FFCCAA' }),
          ...(subtitle ? [new TextRun({ text: `  —  ${subtitle}`, size: 18, color: 'FFCCAA' })] : []),
        ],
        shading: { type: ShadingType.SOLID, color: ORANGE_HEX, fill: ORANGE_HEX },
        spacing: { before: 80, after: 80 },
      }),
    ],
  });
}

function docFooter(): Footer {
  return new Footer({
    children: [
      new Paragraph({
        children: [
          muted('IWILLBUILD Portal — Confidential   |   Page ', 16),
          new TextRun({ children: [PageNumber.CURRENT], size: 16, color: MUTED_HEX }),
          muted(' of ', 16),
          new TextRun({ children: [PageNumber.TOTAL_PAGES], size: 16, color: MUTED_HEX }),
          muted(`   |   Generated ${new Date().toLocaleDateString('en-AU')}`, 16),
        ],
        alignment: AlignmentType.CENTER,
        shading: { type: ShadingType.SOLID, color: DARK_HEX, fill: DARK_HEX },
        spacing: { before: 60, after: 60 },
      }),
    ],
  });
}

// ── SWMS DOCX ─────────────────────────────────────────────────────────────────

export async function generateSwmsDocx(swms: SwmsData): Promise<Buffer> {
  const sections: Paragraph[] = [
    heading1(swms.title),
    new Paragraph({ children: [muted(swms.work_activity ?? '')], spacing: { after: 200 } }),
    new Paragraph({
      children: [
        new TextRun({ text: (swms.status ?? 'draft').toUpperCase(), bold: true, size: 18, color: WHITE_HEX }),
      ],
      shading: { type: ShadingType.SOLID, color: swms.status === 'approved' ? '228B22' : ORANGE_HEX, fill: swms.status === 'approved' ? '228B22' : ORANGE_HEX },
      spacing: { after: 200 },
    }),
    sectionHead('Details'),
    ...labelPara('Work Activity', swms.work_activity ?? ''),
    ...labelPara('Scope of Work', swms.scope ?? ''),
    divider(),
    sectionHead('Hazards Identified'),
    new Paragraph({ children: [normal(swms.hazards ?? 'None identified')], spacing: { after: 120 } }),
    divider(),
    sectionHead('Risk Controls'),
    new Paragraph({ children: [normal(swms.controls ?? 'None specified')], spacing: { after: 120 } }),
    divider(),
    sectionHead('PPE Required'),
    new Paragraph({ children: [normal(swms.ppe_required ?? 'Standard PPE')], spacing: { after: 120 } }),
  ];

  if (swms.legislation) {
    sections.push(divider(), sectionHead('Legislation & Standards'));
    sections.push(new Paragraph({ children: [normal(swms.legislation)], spacing: { after: 120 } }));
  }
  if (swms.emergency_procedures) {
    sections.push(divider(), sectionHead('Emergency Procedures'));
    sections.push(new Paragraph({ children: [normal(swms.emergency_procedures)], spacing: { after: 120 } }));
  }

  // Signoffs table
  if (swms.signoffs?.length) {
    sections.push(divider(), sectionHead(`Worker Sign-offs (${swms.signoffs.length})`));
    const tableRows = [
      new TableRow({
        children: ['Worker Name', 'White Card #', 'Signed At'].map(h =>
          new TableCell({
            children: [new Paragraph({ children: [bold(h, 18, WHITE_HEX)] })],
            shading: { type: ShadingType.SOLID, color: SLATE_HEX, fill: SLATE_HEX },
            width: { size: 33, type: WidthType.PERCENTAGE },
          })
        ),
        tableHeader: true,
      }),
      ...swms.signoffs.map((s, i) => new TableRow({
        children: [
          s.worker_name,
          s.white_card_number ?? '—',
          new Date(s.signed_at).toLocaleString('en-AU', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
        ].map(val => new TableCell({
          children: [new Paragraph({ children: [normal(val, 18)] })],
          shading: i % 2 === 0 ? { type: ShadingType.SOLID, color: LIGHT_HEX, fill: LIGHT_HEX } : undefined,
          width: { size: 33, type: WidthType.PERCENTAGE },
        })),
      })),
    ];
    sections.push(new Table({ rows: tableRows, width: { size: 100, type: WidthType.PERCENTAGE } }) as unknown as Paragraph);
  }

  const doc = new Document({
    numbering: { config: [] },
    sections: [{
      headers: { default: docHeader('Safe Work Method Statement', swms.company_name) },
      footers: { default: docFooter() },
      children: sections,
    }],
  });

  return Packer.toBuffer(doc);
}

// ── Safety Plan DOCX ──────────────────────────────────────────────────────────

export async function generateSafetyPlanDocx(plan: SafetyPlanData): Promise<Buffer> {
  const jobLabel = plan.job_number ? `Job #${plan.job_number} — ${plan.job_name}` : (plan.job_name ?? '');

  const children: Paragraph[] = [
    heading1(plan.title),
    new Paragraph({ children: [muted(jobLabel)], spacing: { after: 120 } }),
    new Paragraph({
      children: [
        new TextRun({ text: (plan.status ?? 'draft').toUpperCase(), bold: true, size: 18, color: WHITE_HEX }),
        ...(plan.is_principal_contractor ? [new TextRun({ text: '   PRINCIPAL CONTRACTOR', bold: true, size: 18, color: WHITE_HEX })] : []),
      ],
      shading: { type: ShadingType.SOLID, color: plan.status === 'approved' ? '228B22' : ORANGE_HEX, fill: plan.status === 'approved' ? '228B22' : ORANGE_HEX },
      spacing: { after: 200 },
    }),
    sectionHead('Project Details'),
    ...labelPara('Site Address', plan.site_address ?? ''),
    ...labelPara('Project Value', plan.project_value ? `$${plan.project_value}` : ''),
    divider(),
    sectionHead('Key Personnel'),
    ...labelPara('Site Supervisor', plan.site_supervisor ?? ''),
    ...labelPara('First Aid Officer', plan.first_aid_officer ?? ''),
    ...labelPara('Emergency Contact', plan.emergency_contact ?? ''),
    ...labelPara('Nearest Hospital', plan.nearest_hospital ?? ''),
    divider(),
    sectionHead('Emergency Procedures'),
    ...labelPara('Assembly Point', plan.emergency_assembly_point ?? ''),
    ...labelPara('Evacuation Notes', plan.evacuation_notes ?? ''),
  ];

  if (plan.site_rules) {
    children.push(divider(), sectionHead('Site Rules'));
    children.push(new Paragraph({ children: [normal(plan.site_rules)], spacing: { after: 120 } }));
  }
  if (plan.high_risk_activities) {
    children.push(divider(), sectionHead('High Risk Activities'));
    children.push(new Paragraph({ children: [normal(plan.high_risk_activities)], spacing: { after: 120 } }));
  }
  if (plan.required_posters) {
    children.push(divider(), sectionHead('Required Posters'));
    children.push(new Paragraph({ children: [normal(plan.required_posters)], spacing: { after: 120 } }));
  }

  const doc = new Document({
    numbering: { config: [] },
    sections: [{
      headers: { default: docHeader('Site Safety Plan', plan.company_name) },
      footers: { default: docFooter() },
      children,
    }],
  });

  return Packer.toBuffer(doc);
}

// ── Cost Report DOCX ──────────────────────────────────────────────────────────

export async function generateCostReportDocx(data: CostReportData): Promise<Buffer> {
  const subtitle = data.job_number ? `Job #${data.job_number} — ${data.job_name}` : data.job_name;
  const totalCosts = data.costs.reduce((s, c) => s + Number(c.amount ?? 0), 0);
  const totalGst = data.costs.reduce((s, c) => s + Number(c.gst_amount ?? 0), 0);

  const children: Paragraph[] = [
    heading1('Job Cost Report'),
    new Paragraph({ children: [muted(subtitle)], spacing: { after: 120 } }),
    sectionHead('Summary'),
    ...labelPara('Total Costs (inc. GST)', `$${totalCosts.toFixed(2)}`),
    ...labelPara('Total GST', `$${totalGst.toFixed(2)}`),
    ...labelPara('Number of Entries', String(data.costs.length)),
    divider(),
    sectionHead('Cost Entries'),
  ];

  if (data.costs.length === 0) {
    children.push(new Paragraph({ children: [muted('No cost entries recorded.')], spacing: { after: 120 } }));
  } else {
    const headerRow = new TableRow({
      children: ['Date', 'Merchant', 'Description', 'Category', 'Amount', 'GST'].map(h =>
        new TableCell({
          children: [new Paragraph({ children: [bold(h, 16, WHITE_HEX)] })],
          shading: { type: ShadingType.SOLID, color: SLATE_HEX, fill: SLATE_HEX },
        })
      ),
      tableHeader: true,
    });

    const dataRows = data.costs.map((c, i) => new TableRow({
      children: [
        c.purchase_date ? new Date(c.purchase_date).toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: '2-digit' }) : '—',
        String(c.merchant ?? ''),
        String(c.description ?? ''),
        String(c.category ?? ''),
        `$${Number(c.amount ?? 0).toFixed(2)}`,
        c.gst_included ? 'Yes' : 'No',
      ].map(val => new TableCell({
        children: [new Paragraph({ children: [normal(val, 16)] })],
        shading: i % 2 === 0 ? { type: ShadingType.SOLID, color: LIGHT_HEX, fill: LIGHT_HEX } : undefined,
      })),
    }));

    children.push(new Table({
      rows: [headerRow, ...dataRows],
      width: { size: 100, type: WidthType.PERCENTAGE },
    }) as unknown as Paragraph);
  }

  const doc = new Document({
    numbering: { config: [] },
    sections: [{
      headers: { default: docHeader('Job Cost Report', subtitle) },
      footers: { default: docFooter() },
      children,
    }],
  });

  return Packer.toBuffer(doc);
}
