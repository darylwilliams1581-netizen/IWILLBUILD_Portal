/**
 * StudioWidgetPanel
 * ─────────────────────────────────────────────────────────────────────────────
 * "Apply Widget" ribbon panel inside the Document Builder.
 *
 * Provides three widget choices:
 *   • SWMS Widget        — applies SWMS document structure + tables
 *   • Safety Plan Widget — applies WHS Plan structure (all sections)
 *   • Policy Widget      — applies policy title/purpose/scope/review structure
 *
 * Behaviour:
 *   - If the document already has blocks the user is warned and must confirm
 *     before the widget prepends its structure (existing content is preserved).
 *   - If the document is blank the widget replaces the empty state directly.
 *   - Sets templateType and templateName to match the chosen widget.
 *   - Does NOT request job details — those are added when attaching to a job.
 *   - Does NOT add sign-on controls — those live in Forms/Submissions.
 *
 * The panel is rendered as the left ribbon panel when activeTab === 'apply_widget'.
 */

import { useState } from 'react';
import { HardHat, ClipboardList, BookOpen, ChevronRight, AlertTriangle, CheckCircle2, Loader2, RefreshCw } from 'lucide-react';
import { useDocumentStore } from './useDocumentStore';
import type { DocumentBlock, AppliedWidgetMeta } from './types';

// ── Widget definitions ────────────────────────────────────────────────────────

type WidgetId = 'swms' | 'safety_plan' | 'policy';

interface WidgetDef {
  id: WidgetId;
  label: string;
  subtitle: string;
  icon: React.ReactNode;
  colour: string;        // Tailwind bg class for the icon tile
  textColour: string;    // Tailwind text class for the icon tile
  borderColour: string;  // Tailwind border class for hover ring
  sections: string[];
}

const WIDGETS: WidgetDef[] = [
  {
    id: 'swms',
    label: 'SWMS Widget',
    subtitle: 'Safe Work Method Statement',
    icon: <HardHat size={18} />,
    colour: 'bg-amber-50',
    textColour: 'text-amber-600',
    borderColour: 'hover:border-amber-400',
    sections: [
      'Document identity & revision table',
      'Scope of works',
      'High-risk construction work (HRCW)',
      'Sequence of work & risk control table',
      'Critical controls',
      'Plant & equipment register',
      'PPE requirements',
      'Risk matrix',
      'Emergency response',
      'Legislation & standards',
      'Review before issue banner',
      'Document-control footer',
    ],
  },
  {
    id: 'safety_plan',
    label: 'Safety Plan Widget',
    subtitle: 'WHS Management Plan',
    icon: <ClipboardList size={18} />,
    colour: 'bg-emerald-50',
    textColour: 'text-emerald-600',
    borderColour: 'hover:border-emerald-400',
    sections: [
      'Project identity & revision history',
      'Scope of works',
      'Principal contractor details',
      'Emergency planning & contacts',
      'Site rules & induction',
      'High-risk construction work',
      'Hazard register',
      'Consultation & communication',
      'Plant & equipment controls',
      'Electrical safety',
      'Traffic management',
      'Hazardous materials',
      'Site amenities',
      'Environmental controls',
      'Incident reporting',
      'Review & approval sign-off',
      'Appendices',
    ],
  },
  {
    id: 'policy',
    label: 'Policy Widget',
    subtitle: 'Company Policy Document',
    icon: <BookOpen size={18} />,
    colour: 'bg-violet-50',
    textColour: 'text-violet-600',
    borderColour: 'hover:border-violet-400',
    sections: [
      'Policy title & number',
      'Purpose',
      'Scope',
      'Definitions',
      'Responsibilities',
      'Requirements & procedures',
      'Related documents',
      'Review schedule',
      'Approval & sign-off',
    ],
  },
];

// ── Block generators ──────────────────────────────────────────────────────────

let _seq = 0;
function bid(prefix: string): string {
  _seq++;
  return `widget-${prefix}-${_seq}`;
}

// ── Document colour tokens (print-safe, not brand palette) ───────────────────
// These are document-content colours used inside rich_text HTML blocks that
// will be printed / exported as PDF. They are intentionally fixed document
// colours (navy header bands, light-blue label cells, etc.) and are NOT
// UI/brand colours — they live inside HTML string content, not in Tailwind
// class names or CSS variables.
/* eslint-disable @typescript-eslint/no-inferrable-types */
const DOC_NAVY        = '#1a2744' as string;
const DOC_NAVY_TEXT   = '#ffffff' as string;
const DOC_LABEL_BG    = '#dbeafe' as string;
const DOC_LABEL_TEXT  = '#1e3a5f' as string;
const DOC_GUIDE_BG    = '#fefce8' as string;
const DOC_GUIDE_BDR   = '#fde68a' as string;
const DOC_GUIDE_TEXT  = '#713f12' as string;
const DOC_WARN_BG     = '#fef2f2' as string;
const DOC_WARN_BDR    = '#fecaca' as string;
const DOC_WARN_TEXT   = '#7f1d1d' as string;
const DOC_ROW_ALT     = '#f8fafc' as string;
const DOC_BORDER      = '#cbd5e1' as string;
const DOC_HDR_BORDER  = '#334155' as string;
/* eslint-enable @typescript-eslint/no-inferrable-types */

// ── Block helpers ─────────────────────────────────────────────────────────────

function h(level: 1 | 2 | 3 | 4, content: string): DocumentBlock {
  return { id: bid('h'), type: 'heading', content, level, align: 'left' } as DocumentBlock;
}
function p(content: string, bold = false): DocumentBlock {
  return { id: bid('p'), type: 'text', content, align: 'left', bold } as DocumentBlock;
}
function divider(): DocumentBlock {
  return { id: bid('d'), type: 'divider', style: 'solid', thickness: 1 } as DocumentBlock;
}
function spacer(height = 8): DocumentBlock {
  return { id: bid('sp'), type: 'spacer', height } as DocumentBlock;
}

/** Navy full-width section band */
function navyBand(title: string): DocumentBlock {
  const html = `<table class="not-prose" style="width:100%;border-collapse:collapse;margin:0;"><tr><td style="background:${DOC_NAVY} !important;color:${DOC_NAVY_TEXT} !important;font-weight:700;font-size:13px;padding:7px 12px;letter-spacing:0.04em;">${title}</td></tr></table>`;
  return { id: bid('band'), type: 'rich_text', html } as DocumentBlock;
}

/** Pale-yellow guidance callout */
function guidanceBox(text: string): DocumentBlock {
  const html = `<table class="not-prose" style="width:100%;border-collapse:collapse;"><tr><td style="background:${DOC_GUIDE_BG} !important;border:1px solid ${DOC_GUIDE_BDR};color:${DOC_GUIDE_TEXT} !important;font-size:11.5px;padding:8px 12px;border-radius:4px;">${text}</td></tr></table>`;
  return { id: bid('guide'), type: 'rich_text', html } as DocumentBlock;
}

/** Pale-red warning callout */
function warningBox(text: string): DocumentBlock {
  const html = `<table class="not-prose" style="width:100%;border-collapse:collapse;"><tr><td style="background:${DOC_WARN_BG} !important;border:1px solid ${DOC_WARN_BDR};color:${DOC_WARN_TEXT} !important;font-size:11.5px;padding:8px 12px;border-radius:4px;font-weight:600;">${text}</td></tr></table>`;
  return { id: bid('warn'), type: 'rich_text', html } as DocumentBlock;
}

/** Two-column form table: light-blue label | white/alt value cell */
function twoColForm(rows: Array<[string, string]>): DocumentBlock {
  const rowsHtml = rows.map(([label, value], i) => {
    const bg = i % 2 === 0 ? '#ffffff' : DOC_ROW_ALT;
    return `<tr>
      <td style="background:${DOC_LABEL_BG} !important;color:${DOC_LABEL_TEXT} !important;font-weight:600;font-size:11.5px;padding:6px 10px;border:1px solid ${DOC_BORDER};width:38%;">${label}</td>
      <td style="background:${bg} !important;font-size:11.5px;padding:6px 10px;border:1px solid ${DOC_BORDER};width:62%;">${value}</td>
    </tr>`;
  }).join('');
  const html = `<table class="not-prose" style="width:100%;border-collapse:collapse;">${rowsHtml}</table>`;
  return { id: bid('form'), type: 'rich_text', html } as DocumentBlock;
}

/** Data table with navy header row */
function navyTable(headers: string[], rows: string[][]): DocumentBlock {
  const headerHtml = headers.map(hdr =>
    `<th style="background:${DOC_NAVY} !important;color:${DOC_NAVY_TEXT} !important;font-weight:700;font-size:11.5px;padding:6px 8px;border:1px solid ${DOC_HDR_BORDER};text-align:left;">${hdr}</th>`
  ).join('');
  const rowsHtml = rows.map((cells, ri) => {
    const bg = ri % 2 === 0 ? '#ffffff' : DOC_ROW_ALT;
    const cellsHtml = cells.map(c =>
      `<td style="background:${bg} !important;font-size:11.5px;padding:6px 8px;border:1px solid ${DOC_BORDER};">${c}</td>`
    ).join('');
    return `<tr>${cellsHtml}</tr>`;
  }).join('');
  const html = `<table class="not-prose" style="width:100%;border-collapse:collapse;"><thead><tr>${headerHtml}</tr></thead><tbody>${rowsHtml}</tbody></table>`;
  return { id: bid('ntbl'), type: 'rich_text', html } as DocumentBlock;
}

/** Sign-off / authorisation table */
function signoffTable(roles: string[]): DocumentBlock {
  const rowsHtml = roles.map((role, i) => {
    const bg = i % 2 === 0 ? '#ffffff' : DOC_ROW_ALT;
    return `<tr>
      <td style="background:${DOC_LABEL_BG} !important;color:${DOC_LABEL_TEXT} !important;font-weight:600;font-size:11.5px;padding:6px 10px;border:1px solid ${DOC_BORDER};width:22%;">${role}</td>
      <td style="background:${bg} !important;font-size:11.5px;padding:6px 10px;border:1px solid ${DOC_BORDER};width:26%;">Name: ___________________</td>
      <td style="background:${bg} !important;font-size:11.5px;padding:6px 10px;border:1px solid ${DOC_BORDER};width:26%;">Signature: _______________</td>
      <td style="background:${bg} !important;font-size:11.5px;padding:6px 10px;border:1px solid ${DOC_BORDER};width:26%;">Date: ___________________</td>
    </tr>`;
  }).join('');
  const html = `<table class="not-prose" style="width:100%;border-collapse:collapse;">${rowsHtml}</table>`;
  return { id: bid('soff'), type: 'rich_text', html } as DocumentBlock;
}

/** Revision history table */
function revisionTable(): DocumentBlock {
  return navyTable(
    ['Rev', 'Date', 'Description of Change', 'Prepared By', 'Approved By'],
    [
      ['1', '', 'Initial issue', '', ''],
      ['', '', '', '', ''],
    ]
  );
}

/** Alias kept for backward compat — now renders as twoColForm */
function infoTable(rows: Array<[string, string]>): DocumentBlock {
  return twoColForm(rows);
}

function riskTable(): DocumentBlock {
  return navyTable(
    ['#', 'Sequence of Work / Task Step', 'Hazard / Risk', 'Consequence', 'Initial Risk', 'Control Measures (Hierarchy)', 'Residual Risk', 'Responsible Person'],
    [
      ['1', '', '', '', '', '', '', ''],
      ['2', '', '', '', '', '', '', ''],
      ['3', '', '', '', '', '', '', ''],
      ['4', '', '', '', '', '', '', ''],
    ]
  );
}

function ppeTable(): DocumentBlock {
  return navyTable(
    ['PPE Item', 'Requirement', 'Standard / AS', 'Condition Check'],
    [
      ['Safety Helmet', 'Mandatory', 'AS/NZS 1801', ''],
      ['Safety Footwear', 'Mandatory', 'AS/NZS 2210.3', ''],
      ['High-Visibility Vest', 'Mandatory', 'AS/NZS 4602.1', ''],
      ['Safety Glasses / Goggles', 'Task dependent', 'AS/NZS 1337', ''],
      ['Hearing Protection', 'Task dependent', 'AS/NZS 1270', ''],
      ['Gloves', 'Task dependent', '', ''],
      ['Respiratory Protection', 'Task dependent', 'AS/NZS 1716', ''],
      ['', '', '', ''],
    ]
  );
}

function hazardTable(): DocumentBlock {
  return navyTable(
    ['Ref', 'Hazard / Risk', 'Likelihood', 'Consequence', 'Risk Rating', 'Control Measures', 'Residual Rating', 'Owner'],
    [
      ['1', '', '', '', '', '', '', ''],
      ['2', '', '', '', '', '', '', ''],
      ['3', '', '', '', '', '', '', ''],
    ]
  );
}

function swmsRegisterTable(): DocumentBlock {
  return navyTable(
    ['SWMS Ref', 'Work Activity', 'SWMS Author', 'Rev', 'Date Approved', 'Status', 'Location on Site'],
    [
      ['', '', '', '', '', '', ''],
      ['', '', '', '', '', '', ''],
      ['', '', '', '', '', '', ''],
    ]
  );
}

function inductionRegisterTable(): DocumentBlock {
  return navyTable(
    ['Name', 'Company / Trade', 'Date Inducted', 'Inducted By', 'Signature'],
    [
      ['', '', '', '', ''],
      ['', '', '', '', ''],
      ['', '', '', '', ''],
      ['', '', '', '', ''],
    ]
  );
}

/** PPE banner strip image — full-width above the PPE table */
function ppeBannerImage(): DocumentBlock {
  return {
    id: bid('ppe-img'),
    type: 'image',
    src: '/airo-assets/images/safety-badges/ppe-banner-strip',
    alt: 'Required PPE for this work activity',
    size: 'full',
    align: 'center',
    preserveAspectRatio: true,
  } as DocumentBlock;
}

/** Risk assessment banner — full-width above the risk control table */
function riskAssessmentBannerImage(): DocumentBlock {
  return {
    id: bid('risk-img'),
    type: 'image',
    src: '/airo-assets/images/safety-badges/risk-assessment-banner',
    alt: 'Risk assessment matrix',
    size: 'full',
    align: 'center',
    preserveAspectRatio: true,
  } as DocumentBlock;
}

/** Risk Matrix polished image — full-width above the risk matrix section */
function riskMatrixImage(): DocumentBlock {
  return {
    id: bid('risk-matrix-img'),
    type: 'image',
    src: '/airo-assets/images/safety-badges/risk-matrix',
    alt: 'Risk Matrix — consequence, likelihood and degree of control',
    size: 'full',
    align: 'center',
    preserveAspectRatio: true,
  } as DocumentBlock;
}

/** Safety icons sheet — full-width above hazard/safety sections */
function safetyIconsImage(): DocumentBlock {
  return {
    id: bid('icons-img'),
    type: 'image',
    src: '/airo-assets/images/safety-badges/icons-sheet',
    alt: 'Safety hazard icons reference',
    size: 'full',
    align: 'center',
    preserveAspectRatio: true,
  } as DocumentBlock;
}

function buildSwmsBlocks(docTitle: string): DocumentBlock[] {
  _seq = 0;
  return [
    warningBox('⚠ Review Before Issue — This document must be reviewed and approved before being issued to workers. All workers must be inducted against this SWMS before commencing work.'),
    spacer(4),
    h(1, docTitle || 'Safe Work Method Statement'),
    p('Safe Work Method Statement (SWMS)', true),
    spacer(4),
    navyBand('1. Document Identity'),
    infoTable([
      ['Document Type', 'Safe Work Method Statement (SWMS)'],
      ['Document Number', ''],
      ['Revision', '1'],
      ['Status', 'Draft'],
      ['Date Prepared', ''],
      ['Review Date', ''],
      ['Prepared By', ''],
      ['Approved By', ''],
    ]),
    spacer(8),
    navyBand('2. Scope of Works'),
    p('Describe the scope of works, location, and activities covered by this SWMS.'),
    spacer(8),
    navyBand('3. High-Risk Construction Work (HRCW)'),
    p('Identify any high-risk construction work activities applicable to this SWMS.'),
    infoTable([
      ['HRCW Applies', 'Yes / No'],
      ['HRCW Categories', ''],
    ]),
    spacer(8),
    navyBand('4. Sequence of Work & Risk Controls'),
    p('Complete the table below for each step in the sequence of work.'),
    riskAssessmentBannerImage(),
    riskTable(),
    spacer(8),
    navyBand('5. Plant & Equipment'),
    infoTable([
      ['Item', 'Inspection Required'],
      ['', ''],
    ]),
    spacer(8),
    ppeBannerImage(),
    navyBand('6. Personal Protective Equipment (PPE)'),
    ppeTable(),
    spacer(8),
    riskMatrixImage(),
    navyBand('7. Risk Matrix'),
    infoTable([
      ['Likelihood × Consequence', 'Risk Rating'],
      ['Almost Certain × Catastrophic', 'Extreme'],
      ['Likely × Major', 'High'],
      ['Possible × Moderate', 'Medium'],
      ['Unlikely × Minor', 'Low'],
    ]),
    spacer(8),
    navyBand('8. Emergency Response'),
    infoTable([
      ['Emergency Services', '000'],
      ['Site Emergency Contact', ''],
      ['Assembly Point', ''],
      ['First Aid Officer', ''],
      ['First Aid Kit Location', ''],
    ]),
    spacer(8),
    navyBand('9. Legislation & Standards'),
    p('Work Health and Safety Act 2011 (Qld) | Work Health and Safety Regulation 2011 (Qld) | Code of Practice: Construction Work | Relevant Australian Standards'),
    spacer(8),
    navyBand('10. Worker Sign-Off'),
    p('All workers must read and understand this SWMS before commencing work. Sign below to confirm.'),
    signoffTable(['Supervisor / PCBU', 'Worker 1', 'Worker 2', 'Worker 3', 'Worker 4', 'Worker 5']),
    spacer(8),
    divider(),
    p('Document Control — this document is controlled. Printed copies are uncontrolled. Verify currency before use.', false),
  ];
}

function buildSafetyPlanBlocks(docTitle: string): DocumentBlock[] {
  _seq = 0;
  return [
    warningBox('⚠ Review Before Issue — This WHS Management Plan must be reviewed and approved before works commence. Keep this document on site at all times.'),
    spacer(4),
    h(1, docTitle || 'WHS Management Plan'),
    p('Work Health & Safety Management Plan', true),
    spacer(4),
    h(2, '1. Document Identity'),
    infoTable([
      ['Plan Type', 'Site Safety Plan'],
      ['Plan Number', ''],
      ['Revision', '1'],
      ['Status', 'Draft'],
      ['Date Prepared', ''],
      ['Review Date', ''],
      ['Prepared By', ''],
      ['Approved By', ''],
    ]),
    spacer(8),
    h(2, '2. Project Details'),
    infoTable([
      ['Project Name', ''],
      ['Project Number', ''],
      ['Site Address', ''],
      ['Client', ''],
      ['Start Date', ''],
      ['Expected Completion', ''],
      ['Project Value', ''],
      ['Principal Contractor', ''],
    ]),
    spacer(8),
    h(2, '3. Scope of Works'),
    p('Describe the scope of works and activities covered by this plan.'),
    spacer(8),
    h(2, '4. Emergency Planning'),
    infoTable([
      ['Emergency Services', '000'],
      ['Site Emergency Contact', ''],
      ['Assembly Point', ''],
      ['Nearest Hospital', ''],
      ['First Aid Officer', ''],
      ['First Aid Kit Location', ''],
    ]),
    spacer(8),
    h(2, '5. Site Rules & Induction'),
    p('List site rules and induction requirements applicable to this project.'),
    spacer(8),
    h(2, '6. High-Risk Construction Work (HRCW)'),
    p('Identify HRCW activities and the SWMS documents that control them.'),
    spacer(8),
    h(2, '7. Hazard Register'),
    safetyIconsImage(),
    hazardTable(),
    spacer(8),
    h(2, '8. Consultation & Communication'),
    p('Describe how workers will be consulted and how safety information will be communicated.'),
    spacer(8),
    h(2, '9. Plant & Equipment Controls'),
    p('Describe plant inspection, operator competency and maintenance requirements.'),
    spacer(8),
    h(2, '10. Electrical Safety'),
    p('Describe electrical safety controls including RCD protection, isolation and testing.'),
    spacer(8),
    h(2, '11. Traffic Management'),
    p('Describe vehicle and pedestrian separation, speed limits and delivery controls.'),
    spacer(8),
    h(2, '12. Hazardous Materials'),
    p('List hazardous substances, SDS register location and storage/disposal requirements.'),
    spacer(8),
    h(2, '13. Environmental Controls'),
    p('Describe controls for dust, noise, stormwater, waste and heritage protection.'),
    spacer(8),
    h(2, '14. Incident Reporting'),
    p('Describe the incident reporting process, investigation responsibilities and regulator notification requirements.'),
    spacer(8),
    h(2, '15. Review & Approval'),
    infoTable([
      ['Prepared By', ''],
      ['Position', ''],
      ['Date', ''],
      ['Reviewed By', ''],
      ['Position', ''],
      ['Date', ''],
      ['Approved By', ''],
      ['Position', ''],
      ['Date', ''],
    ]),
    spacer(8),
    divider(),
    p('Document Control — this document is controlled. Printed copies are uncontrolled. Verify currency before use.', false),
  ];
}

function buildPolicyBlocks(docTitle: string): DocumentBlock[] {
  _seq = 0;
  return [
    h(1, docTitle || 'Company Policy'),
    spacer(4),
    infoTable([
      ['Policy Number', ''],
      ['Version', '1.0'],
      ['Status', 'Draft'],
      ['Date Issued', ''],
      ['Review Date', ''],
      ['Policy Owner', ''],
      ['Approved By', ''],
    ]),
    spacer(8),
    h(2, '1. Purpose'),
    p('State the purpose and intent of this policy.'),
    spacer(8),
    h(2, '2. Scope'),
    p('Define who and what this policy applies to.'),
    spacer(8),
    h(2, '3. Definitions'),
    infoTable([
      ['Term', 'Definition'],
      ['', ''],
    ]),
    spacer(8),
    h(2, '4. Responsibilities'),
    p('Describe the responsibilities of management, supervisors and workers under this policy.'),
    spacer(8),
    h(2, '5. Requirements & Procedures'),
    p('Detail the specific requirements, rules or procedures that must be followed.'),
    spacer(8),
    h(2, '6. Related Documents'),
    p('List related policies, procedures, legislation and standards.'),
    spacer(8),
    h(2, '7. Review Schedule'),
    infoTable([
      ['Review Frequency', 'Annually or after an incident'],
      ['Next Review Date', ''],
      ['Responsible Person', ''],
    ]),
    spacer(8),
    h(2, '8. Approval'),
    infoTable([
      ['Approved By', ''],
      ['Position', ''],
      ['Signature', ''],
      ['Date', ''],
    ]),
    spacer(8),
    divider(),
    p('Document Control — this document is controlled. Printed copies are uncontrolled. Verify currency before use.', false),
  ];
}

const BLOCK_BUILDERS: Record<WidgetId, (title: string) => DocumentBlock[]> = {
  swms:        buildSwmsBlocks,
  safety_plan: buildSafetyPlanBlocks,
  policy:      buildPolicyBlocks,
};

export { buildSwmsBlocks, buildSafetyPlanBlocks, buildPolicyBlocks };

const TEMPLATE_TYPES: Record<WidgetId, string> = {
  swms:        'swms',
  safety_plan: 'safety_plan',
  policy:      'policy',
};

// ── Component ─────────────────────────────────────────────────────────────────

export default function StudioWidgetPanel() {
  const store = useDocumentStore();
  const [selected, setSelected] = useState<WidgetId | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [confirmMode, setConfirmMode] = useState<'prepend' | 'update'>('prepend');
  const [applying, setApplying] = useState(false);
  const [applied, setApplied] = useState<WidgetId | null>(null);

  const hasBlocks = store.blocks.length > 0;

  function getExistingMeta(id: WidgetId): AppliedWidgetMeta | undefined {
    return (store.appliedWidgets ?? []).find((w) => w.widgetId === id);
  }

  function handleSelect(id: WidgetId) {
    if (applying) return;
    setSelected(id);
    setApplied(null);
    const existing = getExistingMeta(id);
    if (existing) {
      setConfirmMode('update');
      setConfirming(true);
    } else if (hasBlocks) {
      setConfirmMode('prepend');
      setConfirming(true);
    } else {
      void applyWidget(id, false);
    }
  }

  async function applyWidget(id: WidgetId, isUpdate: boolean) {
    setApplying(true);
    setConfirming(false);
    try {
      const def = WIDGETS.find((w) => w.id === id)!;
      const existing = getExistingMeta(id);

      if (isUpdate && existing) {
        // Remove old widget blocks (identified by "widget-" id prefix) then prepend fresh
        const filtered = store.blocks.filter((b) => !b.id.startsWith('widget-'));
        store.reorderBlocks(filtered);
      }

      const blocks = BLOCK_BUILDERS[id](store.templateName || '');
      store.prependBlocks(blocks);

      const meta: AppliedWidgetMeta = {
        widgetId: id,
        version: existing ? existing.version + 1 : 1,
        appliedAt: new Date().toISOString(),
        blockCount: blocks.length,
      };
      store.recordWidgetApplied(meta);
      store.setTemplateType(TEMPLATE_TYPES[id] as Parameters<typeof store.setTemplateType>[0]);

      if (!store.templateName || store.templateName === 'Untitled document' || store.templateName === 'Untitled Document') {
        store.setTemplateName(def.label.replace(' Widget', ''));
      }

      setApplied(id);
    } finally {
      setApplying(false);
      setSelected(null);
    }
  }

  const selectedDef = WIDGETS.find((w) => w.id === selected);

  return (
    <div className="w-72 flex-shrink-0 border-r border-slate-200 bg-white flex flex-col overflow-y-auto">
      {/* Header */}
      <div className="px-4 pt-4 pb-3 border-b border-slate-100 flex-shrink-0">
        <h3 className="text-xs font-bold text-slate-800 uppercase tracking-widest">Apply Widget</h3>
        <p className="text-[11px] text-slate-400 mt-0.5 leading-snug">
          Choose a widget to apply document structure, tables and sections to this document.
        </p>
      </div>

      {/* Applied success banner */}
      {applied && (
        <div className="mx-3 mt-3 flex items-start gap-2 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2.5 text-xs text-emerald-700 flex-shrink-0">
          <CheckCircle2 size={13} className="shrink-0 mt-0.5" />
          <span>
            <span className="font-semibold">{WIDGETS.find((w) => w.id === applied)?.label}</span> applied.
            Scroll up to see the new sections. Undo (Ctrl+Z) to revert.
          </span>
        </div>
      )}

      {/* Confirm dialog */}
      {confirming && selected && selectedDef && (
        <div className="mx-3 mt-3 flex-shrink-0 bg-amber-50 border border-amber-200 rounded-lg p-3">
          <div className="flex items-start gap-2 mb-2.5">
            <AlertTriangle size={13} className="text-amber-600 shrink-0 mt-0.5" />
            {confirmMode === 'update' ? (
              <p className="text-xs text-amber-800 leading-snug">
                <span className="font-semibold">{selectedDef.label}</span> has already been applied
                (v{getExistingMeta(selected)?.version ?? 1}). Updating will remove the old widget
                structure and prepend a fresh one. Your own content blocks are preserved.
              </p>
            ) : (
              <p className="text-xs text-amber-800 leading-snug">
                This document already has content. The widget will be{' '}
                <strong>prepended</strong> — your existing blocks are preserved below.
              </p>
            )}
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => void applyWidget(selected, confirmMode === 'update')}
              className="flex-1 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold transition-colors flex items-center justify-center gap-1.5"
            >
              {confirmMode === 'update' ? (
                <><RefreshCw size={11} /> Update Structure</>
              ) : (
                'Apply Anyway'
              )}
            </button>
            <button
              onClick={() => { setConfirming(false); setSelected(null); }}
              className="flex-1 py-1.5 rounded-lg border border-slate-200 text-slate-600 text-xs font-semibold hover:bg-slate-50 transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Widget cards */}
      <div className="flex flex-col gap-2 p-3 flex-1">
        {WIDGETS.map((w) => {
          const existingMeta = getExistingMeta(w.id);
          return (
            <button
              key={w.id}
              onClick={() => handleSelect(w.id)}
              disabled={applying}
              data-testid={`widget-card-${w.id}`}
              className={[
                'w-full text-left rounded-xl border-2 border-slate-200 p-3 transition-all duration-150',
                w.borderColour,
                'hover:shadow-sm disabled:opacity-50',
                selected === w.id && applying ? 'opacity-60' : '',
              ].join(' ')}
            >
              <div className="flex items-start gap-3">
                <div className={`w-9 h-9 rounded-lg ${w.colour} ${w.textColour} flex items-center justify-center shrink-0`}>
                  {applying && selected === w.id ? <Loader2 size={16} className="animate-spin" /> : w.icon}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-1">
                    <p className="text-xs font-bold text-slate-800">{w.label}</p>
                    {existingMeta ? (
                      <span className="text-[9px] font-bold bg-emerald-100 text-emerald-700 border border-emerald-200 rounded px-1.5 py-0.5 shrink-0">
                        v{existingMeta.version} applied
                      </span>
                    ) : (
                      <ChevronRight size={12} className="text-slate-400 shrink-0" />
                    )}
                  </div>
                  <p className="text-[11px] text-slate-500 mt-0.5">{w.subtitle}</p>
                  {existingMeta && (
                    <p className="text-[10px] text-emerald-600 mt-0.5 flex items-center gap-1">
                      <RefreshCw size={9} />
                      Click to update structure
                    </p>
                  )}
                </div>
              </div>
              <ul className="mt-2.5 space-y-0.5 pl-12">
                {w.sections.map((s) => (
                  <li key={s} className="text-[10px] text-slate-400 leading-snug">• {s}</li>
                ))}
              </ul>
            </button>
          );
        })}
      </div>

      {/* Footer note */}
      <div className="px-4 py-3 border-t border-slate-100 flex-shrink-0">
        <p className="text-[10px] text-slate-400 leading-snug">
          Job details (site address, client, supervisor) are merged automatically when this document is attached to a job. Worker sign-on is handled through the job sign-on workflow.
        </p>
      </div>
    </div>
  );
}
