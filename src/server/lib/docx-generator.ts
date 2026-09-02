/**
 * DOCX Generator — server-side Word document creation using the docx library.
 *
 * Generates:
 *  - SWMS Word document
 *  - Safety Plan Word document
 *  - Job Cost Report Word document
 */

// docx is loaded lazily (dynamic import) to keep it out of the main SSR
// bundle traversal — reduces Rollup peak memory by ~7 MB during publish.
import type { SwmsData, SafetyPlanData, CostReportData } from './pdf-generator.js';

type DocxLib = typeof import('docx');

async function getDocx(): Promise<DocxLib> {
  return import('docx') as Promise<DocxLib>;
}

// ── Colour constants (OOXML hex, no #) ────────────────────────────────────────
const ORANGE_HEX = '7C3AED';
const DARK_HEX   = '0F1117';
const SLATE_HEX  = '3E4452';
const LIGHT_HEX  = 'F2F3F5';
const MUTED_HEX  = '808890';
const WHITE_HEX  = 'FFFFFF';

// ── Helpers (all take docx lib as first arg) ───────────────────────────────────

function bold(d: DocxLib, text: string, size = 22, color = '000000') {
  return new d.TextRun({ text, bold: true, size, color });
}
function normal(d: DocxLib, text: string, size = 20, color = '000000') {
  return new d.TextRun({ text, size, color });
}
function muted(d: DocxLib, text: string, size = 18) {
  return new d.TextRun({ text, size, color: MUTED_HEX });
}

function heading1(d: DocxLib, text: string) {
  return new d.Paragraph({
    children: [new d.TextRun({ text, bold: true, size: 32, color: WHITE_HEX })],
    heading: d.HeadingLevel.HEADING_1,
    shading: { type: d.ShadingType.SOLID, color: DARK_HEX, fill: DARK_HEX },
    spacing: { before: 200, after: 100 },
  });
}

function sectionHead(d: DocxLib, text: string) {
  return new d.Paragraph({
    children: [new d.TextRun({ text: text.toUpperCase(), bold: true, size: 18, color: SLATE_HEX })],
    shading: { type: d.ShadingType.SOLID, color: LIGHT_HEX, fill: LIGHT_HEX },
    spacing: { before: 240, after: 80 },
  });
}

function labelPara(d: DocxLib, label: string, value: string) {
  return [
    new d.Paragraph({ children: [muted(d, label, 16)], spacing: { before: 80, after: 20 } }),
    new d.Paragraph({ children: [normal(d, value || '—')], spacing: { before: 0, after: 80 } }),
  ];
}

function divider(d: DocxLib) {
  return new d.Paragraph({
    children: [],
    border: { bottom: { color: LIGHT_HEX, space: 1, style: d.BorderStyle.SINGLE, size: 6 } },
    spacing: { before: 100, after: 100 },
  });
}

function docHeader(d: DocxLib, title: string, subtitle?: string) {
  return new d.Header({
    children: [
      new d.Paragraph({
        children: [
          new d.TextRun({ text: 'IWIllBUIlD  ', bold: true, size: 22, color: WHITE_HEX }),
          new d.TextRun({ text: `| ${title.toUpperCase()}`, size: 20, color: 'FFCCAA' }),
          ...(subtitle ? [new d.TextRun({ text: `  —  ${subtitle}`, size: 18, color: 'FFCCAA' })] : []),
        ],
        shading: { type: d.ShadingType.SOLID, color: ORANGE_HEX, fill: ORANGE_HEX },
        spacing: { before: 80, after: 80 },
      }),
    ],
  });
}

function docFooter(d: DocxLib) {
  return new d.Footer({
    children: [
      new d.Paragraph({
        children: [
          muted(d, 'IWIllBUIlD Portal — Confidential   |   Page ', 16),
          new d.TextRun({ children: [d.PageNumber.CURRENT], size: 16, color: MUTED_HEX }),
          muted(d, ' of ', 16),
          new d.TextRun({ children: [d.PageNumber.TOTAL_PAGES], size: 16, color: MUTED_HEX }),
          muted(d, `   |   Generated ${new Date().toLocaleDateString('en-AU')}`, 16),
        ],
        alignment: d.AlignmentType.CENTER,
        shading: { type: d.ShadingType.SOLID, color: DARK_HEX, fill: DARK_HEX },
        spacing: { before: 60, after: 60 },
      }),
    ],
  });
}

// ── SWMS DOCX ─────────────────────────────────────────────────────────────────

export async function generateSwmsDocx(swms: SwmsData): Promise<Buffer> {
  const d = await getDocx();

  const sections = [
    heading1(d, swms.title),
    new d.Paragraph({ children: [muted(d, swms.work_activity ?? '')], spacing: { after: 200 } }),
    new d.Paragraph({
      children: [
        new d.TextRun({ text: (swms.status ?? 'draft').toUpperCase(), bold: true, size: 18, color: WHITE_HEX }),
      ],
      shading: { type: d.ShadingType.SOLID, color: swms.status === 'approved' ? '228B22' : ORANGE_HEX, fill: swms.status === 'approved' ? '228B22' : ORANGE_HEX },
      spacing: { after: 200 },
    }),
    sectionHead(d, 'Details'),
    ...labelPara(d, 'Work Activity', swms.work_activity ?? ''),
    ...labelPara(d, 'Scope of Work', swms.scope ?? ''),
    divider(d),
    sectionHead(d, 'Hazards Identified'),
    new d.Paragraph({ children: [normal(d, swms.hazards ?? 'None identified')], spacing: { after: 120 } }),
    divider(d),
    sectionHead(d, 'Risk Controls'),
    new d.Paragraph({ children: [normal(d, swms.controls ?? 'None specified')], spacing: { after: 120 } }),
    divider(d),
    sectionHead(d, 'PPE Required'),
    new d.Paragraph({ children: [normal(d, swms.ppe_required ?? 'Standard PPE')], spacing: { after: 120 } }),
  ];

  if (swms.legislation) {
    sections.push(divider(d), sectionHead(d, 'Legislation & Standards'));
    sections.push(new d.Paragraph({ children: [normal(d, swms.legislation)], spacing: { after: 120 } }));
  }
  if (swms.emergency_procedures) {
    sections.push(divider(d), sectionHead(d, 'Emergency Procedures'));
    sections.push(new d.Paragraph({ children: [normal(d, swms.emergency_procedures)], spacing: { after: 120 } }));
  }

  if (swms.signoffs?.length) {
    sections.push(divider(d), sectionHead(d, `Worker Sign-offs (${swms.signoffs.length})`));
    const tableRows = [
      new d.TableRow({
        children: ['Worker Name', 'White Card #', 'Signed At'].map(h =>
          new d.TableCell({
            children: [new d.Paragraph({ children: [bold(d, h, 18, WHITE_HEX)] })],
            shading: { type: d.ShadingType.SOLID, color: SLATE_HEX, fill: SLATE_HEX },
            width: { size: 33, type: d.WidthType.PERCENTAGE },
          })
        ),
        tableHeader: true,
      }),
      ...swms.signoffs.map((s, i) => new d.TableRow({
        children: [
          s.worker_name,
          s.white_card_number ?? '—',
          new Date(s.signed_at).toLocaleString('en-AU', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }),
        ].map(val => new d.TableCell({
          children: [new d.Paragraph({ children: [normal(d, val, 18)] })],
          shading: i % 2 === 0 ? { type: d.ShadingType.SOLID, color: LIGHT_HEX, fill: LIGHT_HEX } : undefined,
          width: { size: 33, type: d.WidthType.PERCENTAGE },
        })),
      })),
    ];
    sections.push(new d.Table({ rows: tableRows, width: { size: 100, type: d.WidthType.PERCENTAGE } }) as unknown as d.Paragraph);
  }

  const doc = new d.Document({
    numbering: { config: [] },
    sections: [{
      headers: { default: docHeader(d, 'Safe Work Method Statement', swms.company_name) },
      footers: { default: docFooter(d) },
      children: sections,
    }],
  });

  return d.Packer.toBuffer(doc);
}

// ── Safety Plan DOCX ──────────────────────────────────────────────────────────

export async function generateSafetyPlanDocx(plan: SafetyPlanData): Promise<Buffer> {
  const d = await getDocx();
  const jobLabel = plan.job_number ? `Job #${plan.job_number} — ${plan.job_name}` : (plan.job_name ?? '');

  const children = [
    heading1(d, plan.title),
    new d.Paragraph({ children: [muted(d, jobLabel)], spacing: { after: 120 } }),
    new d.Paragraph({
      children: [
        new d.TextRun({ text: (plan.status ?? 'draft').toUpperCase(), bold: true, size: 18, color: WHITE_HEX }),
        ...(plan.is_principal_contractor ? [new d.TextRun({ text: '   PRINCIPAL CONTRACTOR', bold: true, size: 18, color: WHITE_HEX })] : []),
      ],
      shading: { type: d.ShadingType.SOLID, color: plan.status === 'approved' ? '228B22' : ORANGE_HEX, fill: plan.status === 'approved' ? '228B22' : ORANGE_HEX },
      spacing: { after: 200 },
    }),
    sectionHead(d, 'Project Details'),
    ...labelPara(d, 'Site Address', plan.site_address ?? ''),
    ...labelPara(d, 'Project Value', plan.project_value ? `$${plan.project_value}` : ''),
    divider(d),
    sectionHead(d, 'Key Personnel'),
    ...labelPara(d, 'Site Supervisor', plan.site_supervisor ?? ''),
    ...labelPara(d, 'First Aid Officer', plan.first_aid_officer ?? ''),
    ...labelPara(d, 'Emergency Contact', plan.emergency_contact ?? ''),
    ...labelPara(d, 'Nearest Hospital', plan.nearest_hospital ?? ''),
    divider(d),
    sectionHead(d, 'Emergency Procedures'),
    ...labelPara(d, 'Assembly Point', plan.emergency_assembly_point ?? ''),
    ...labelPara(d, 'Evacuation Notes', plan.evacuation_notes ?? ''),
  ];

  if (plan.site_rules) {
    children.push(divider(d), sectionHead(d, 'Site Rules'));
    children.push(new d.Paragraph({ children: [normal(d, plan.site_rules)], spacing: { after: 120 } }));
  }
  if (plan.high_risk_activities) {
    children.push(divider(d), sectionHead(d, 'High Risk Activities'));
    children.push(new d.Paragraph({ children: [normal(d, plan.high_risk_activities)], spacing: { after: 120 } }));
  }
  if (plan.required_posters) {
    children.push(divider(d), sectionHead(d, 'Required Posters'));
    children.push(new d.Paragraph({ children: [normal(d, plan.required_posters)], spacing: { after: 120 } }));
  }

  const doc = new d.Document({
    numbering: { config: [] },
    sections: [{
      headers: { default: docHeader(d, 'Site Safety Plan', plan.company_name) },
      footers: { default: docFooter(d) },
      children,
    }],
  });

  return d.Packer.toBuffer(doc);
}

// ── Cost Report DOCX ──────────────────────────────────────────────────────────

export async function generateCostReportDocx(data: CostReportData): Promise<Buffer> {
  const d = await getDocx();
  const subtitle = data.job_number ? `Job #${data.job_number} — ${data.job_name}` : data.job_name;
  const totalCosts = data.costs.reduce((s, c) => s + Number(c.amount ?? 0), 0);
  const totalGst = data.costs.reduce((s, c) => s + Number(c.gst_amount ?? 0), 0);

  const children = [
    heading1(d, 'Job Cost Report'),
    new d.Paragraph({ children: [muted(d, subtitle)], spacing: { after: 120 } }),
    sectionHead(d, 'Summary'),
    ...labelPara(d, 'Total Costs (inc. GST)', `$${totalCosts.toFixed(2)}`),
    ...labelPara(d, 'Total GST', `$${totalGst.toFixed(2)}`),
    ...labelPara(d, 'Number of Entries', String(data.costs.length)),
    divider(d),
    sectionHead(d, 'Cost Entries'),
  ];

  if (data.costs.length === 0) {
    children.push(new d.Paragraph({ children: [muted(d, 'No cost entries recorded.')], spacing: { after: 120 } }));
  } else {
    const headerRow = new d.TableRow({
      children: ['Date', 'Merchant', 'Description', 'Category', 'Amount', 'GST'].map(h =>
        new d.TableCell({
          children: [new d.Paragraph({ children: [bold(d, h, 16, WHITE_HEX)] })],
          shading: { type: d.ShadingType.SOLID, color: SLATE_HEX, fill: SLATE_HEX },
        })
      ),
      tableHeader: true,
    });

    const dataRows = data.costs.map((c, i) => new d.TableRow({
      children: [
        c.purchase_date ? new Date(c.purchase_date).toLocaleDateString('en-AU', { day: '2-digit', month: 'short', year: '2-digit' }) : '—',
        String(c.merchant ?? ''),
        String(c.description ?? ''),
        String(c.category ?? ''),
        `$${Number(c.amount ?? 0).toFixed(2)}`,
        c.gst_included ? 'Yes' : 'No',
      ].map(val => new d.TableCell({
        children: [new d.Paragraph({ children: [normal(d, val, 16)] })],
        shading: i % 2 === 0 ? { type: d.ShadingType.SOLID, color: LIGHT_HEX, fill: LIGHT_HEX } : undefined,
      })),
    }));

    children.push(new d.Table({
      rows: [headerRow, ...dataRows],
      width: { size: 100, type: d.WidthType.PERCENTAGE },
    }) as unknown as d.Paragraph);
  }

  const doc = new d.Document({
    numbering: { config: [] },
    sections: [{
      headers: { default: docHeader(d, 'Job Cost Report', subtitle) },
      footers: { default: docFooter(d) },
      children,
    }],
  });

  return d.Packer.toBuffer(doc);
}
