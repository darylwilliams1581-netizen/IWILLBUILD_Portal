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

/** Four-column form table: label | value | label | value (for document control rows) */
function fourColForm(rows: Array<[string, string, string, string]>): DocumentBlock {
  const rowsHtml = rows.map(([l1, v1, l2, v2], i) => {
    const bg = i % 2 === 0 ? '#ffffff' : DOC_ROW_ALT;
    return `<tr>
      <td style="background:${DOC_LABEL_BG} !important;color:${DOC_LABEL_TEXT} !important;font-weight:600;font-size:11.5px;padding:6px 10px;border:1px solid ${DOC_BORDER};width:20%;">${l1}</td>
      <td style="background:${bg} !important;font-size:11.5px;padding:6px 10px;border:1px solid ${DOC_BORDER};width:30%;">${v1}</td>
      <td style="background:${DOC_LABEL_BG} !important;color:${DOC_LABEL_TEXT} !important;font-weight:600;font-size:11.5px;padding:6px 10px;border:1px solid ${DOC_BORDER};width:20%;">${l2}</td>
      <td style="background:${bg} !important;font-size:11.5px;padding:6px 10px;border:1px solid ${DOC_BORDER};width:30%;">${v2}</td>
    </tr>`;
  }).join('');
  const html = `<table class="not-prose" style="width:100%;border-collapse:collapse;">${rowsHtml}</table>`;
  return { id: bid('4col'), type: 'rich_text', html } as DocumentBlock;
}


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
    // ── Cover / Title ──────────────────────────────────────────────────────────
    spacer(8),
    { id: bid('swms-title'), type: 'rich_text', html: `<table class="not-prose" style="width:100%;border-collapse:collapse;"><tr><td style="background:${DOC_NAVY} !important;color:${DOC_NAVY_TEXT} !important;font-weight:800;font-size:15px;padding:10px 14px;letter-spacing:0.02em;">SAFE WORK METHOD STATEMENT</td><td style="background:${DOC_NAVY} !important;color:#94a3b8 !important;font-size:11px;padding:10px 14px;text-align:right;white-space:nowrap;">High-risk construction work | WHS Regulation 2011 (Qld) | Template</td></tr></table>` } as DocumentBlock,
    warningBox('HOW TO USE THIS TEMPLATE — Replace every [bracketed] field with site-specific information. Delete unused rows. Consult workers who will do the work before work starts. A generic SWMS that is not tailored to the site, task and conditions is not compliant. This document is a starting point only and is not legal advice.'),
    spacer(4),

    // ── 1. Document Control ───────────────────────────────────────────────────
    navyBand('1. Document Control'),
    fourColForm([
      ['SWMS No.',      '[SWMS-XXX]',          'Revision',     '[00]'],
      ['Date prepared', '[DD/MM/YYYY]',         'Review date',  '[DD/MM/YYYY]'],
      ['Prepared by',   '[Name / position]',    'Approved by',  '[Name / position]'],
      ['Related WHS Management Plan', '[Plan ref / revision if on a construction project]', '', ''],
    ]),
    spacer(8),

    // ── 2. PCBU and Project Details ───────────────────────────────────────────
    navyBand('2. PCBU and Project Details'),
    twoColForm([
      ['PCBU name',                     '[Legal name of the business carrying out the work]'],
      ['ABN',                           '[XX XXX XXX XXX]'],
      ['Address',                       '[Business address]'],
      ['Principal Contractor',          '[Name of principal contractor if applicable]'],
      ['PC contact name',               '[Name / position]'],
      ['PC contact phone',              '[Phone number]'],
      ['Project name',                  '[Project / site name]'],
      ['Project address',               '[Full site address]'],
      ['Project number',                '[Project reference]'],
      ['Site supervisor',               '[Name / position]'],
      ['Supervisor phone',              '[Phone number]'],
    ]),
    spacer(8),

    // ── 3. Scope of Works ─────────────────────────────────────────────────────
    navyBand('3. Scope of Works'),
    guidanceBox('Describe the specific work activity, location on site, and the sequence of tasks covered by this SWMS. Include any limitations or exclusions.'),
    twoColForm([
      ['Work activity',         '[Describe the specific work activity covered by this SWMS]'],
      ['Location on site',      '[Where on site will this work be performed]'],
      ['Estimated duration',    '[Duration of this work activity]'],
      ['Number of workers',     '[Number of workers performing this activity]'],
      ['Exclusions',            '[Any work NOT covered by this SWMS]'],
    ]),
    spacer(8),

    // ── 4. High-Risk Construction Work (HRCW) ─────────────────────────────────
    navyBand('4. High-Risk Construction Work (HRCW)'),
    guidanceBox('Tick all HRCW categories that apply to this work activity under the Work Health and Safety Regulation 2011.'),
    navyTable(
      ['HRCW Category', 'Applies (Y/N)', 'Details / SWMS Reference'],
      [
        ['Risk of a person falling more than 2 metres', '', ''],
        ['Work on a telecommunication tower', '', ''],
        ['Demolition of load-bearing structure', '', ''],
        ['Disturbance of asbestos', '', ''],
        ['Work involving structural alterations requiring temporary support', '', ''],
        ['Work in or near a confined space', '', ''],
        ['Work in or near a shaft or trench deeper than 1.5 m', '', ''],
        ['Work involving use of explosives', '', ''],
        ['Work on or near pressurised gas distribution mains or piping', '', ''],
        ['Work on or near chemical, fuel or refrigerant lines', '', ''],
        ['Work on or near energised electrical installations or services', '', ''],
        ['Work in an area that may have a contaminated or flammable atmosphere', '', ''],
        ['Tilt-up or precast concrete work', '', ''],
        ['Work on, in or adjacent to a road, railway, shipping lane or other traffic corridor', '', ''],
        ['Work in an area at a workplace in which there is movement of powered mobile plant', '', ''],
        ['Work in areas with artificial extremes of temperature', '', ''],
        ['Work in or near water or other liquid that involves risk of drowning', '', ''],
        ['Diving work', '', ''],
      ]
    ),
    spacer(8),

    // ── 5. Sequence of Work & Risk Controls ───────────────────────────────────
    navyBand('5. Sequence of Work & Risk Controls'),
    guidanceBox('List each task step in sequence. For each step identify the hazards, assess the risk (L = Likelihood 1–5, C = Consequence 1–5, R = L×C), apply controls using the hierarchy of control, then re-assess the residual risk.'),
    navyTable(
      ['Step #', 'Task / Work Step', 'Hazard Identified', 'Who is at Risk', 'L', 'C', 'Initial Risk', 'Control Measures (Hierarchy of Control)', 'L', 'C', 'Residual Risk', 'Responsible Person'],
      [
        ['1', '', '', '', '', '', '', '', '', '', '', ''],
        ['2', '', '', '', '', '', '', '', '', '', '', ''],
        ['3', '', '', '', '', '', '', '', '', '', '', ''],
        ['4', '', '', '', '', '', '', '', '', '', '', ''],
        ['5', '', '', '', '', '', '', '', '', '', '', ''],
        ['6', '', '', '', '', '', '', '', '', '', '', ''],
      ]
    ),
    spacer(4),
    guidanceBox('Hierarchy of Control: 1. Eliminate  2. Substitute  3. Isolate  4. Engineering Controls  5. Administrative Controls  6. PPE'),
    spacer(8),

    // ── 6. Plant & Equipment ──────────────────────────────────────────────────
    navyBand('6. Plant & Equipment'),
    guidanceBox('List all plant, equipment and tools to be used. Confirm pre-start checks, registration/certification and operator competency requirements.'),
    navyTable(
      ['Plant / Equipment / Tool', 'Make / Model', 'Rego / Serial No.', 'Pre-start Check Required', 'Operator Competency Required', 'Inspection Current (Y/N)'],
      [
        ['', '', '', 'Yes / No', '', ''],
        ['', '', '', 'Yes / No', '', ''],
        ['', '', '', 'Yes / No', '', ''],
        ['', '', '', 'Yes / No', '', ''],
      ]
    ),
    spacer(8),

    // ── 7. Personal Protective Equipment (PPE) ────────────────────────────────
    ppeBannerImage(),
    navyBand('7. Personal Protective Equipment (PPE)'),
    guidanceBox('Tick all PPE required for this work activity. Ensure PPE meets the relevant Australian Standard and is in serviceable condition.'),
    ppeTable(),
    spacer(8),

    // ── 8. Risk Matrix ────────────────────────────────────────────────────────
    riskMatrixImage(),
    navyBand('8. Risk Matrix Reference'),
    guidanceBox('Use this matrix to determine the risk rating for each hazard. Likelihood (1 = Rare → 5 = Almost Certain) × Consequence (1 = Insignificant → 5 = Catastrophic).'),
    navyTable(
      ['Risk Rating', 'Score', 'Action Required'],
      [
        ['Extreme',  '15–25', 'Do not proceed — immediate action required. Senior management authorisation needed.'],
        ['High',     '10–14', 'Senior management attention required. Detailed action plan must be in place before work commences.'],
        ['Medium',   '5–9',   'Management responsibility must be specified. Corrective action plan required.'],
        ['Low',      '1–4',   'Manage by routine procedures. Monitor and review.'],
      ]
    ),
    spacer(8),

    // ── 9. Emergency Response ─────────────────────────────────────────────────
    navyBand('9. Emergency Response'),
    twoColForm([
      ['Emergency Services (Police / Fire / Ambulance)', '000'],
      ['Poison Information Centre',                      '13 11 26'],
      ['Site Emergency Contact / Name',                  ''],
      ['Site Emergency Contact / Phone',                 ''],
      ['Nearest Hospital',                               ''],
      ['Hospital Address',                               ''],
      ['Assembly Point',                                 ''],
      ['First Aid Officer',                              ''],
      ['First Aid Kit Location',                         ''],
      ['Incident Reporting Procedure',                   'Notify supervisor immediately. Preserve scene. Complete incident report within 24 hours.'],
      ['Regulator Notification Required',                'Yes — notify SafeWork QLD for serious incidents: 1300 362 128'],
    ]),
    spacer(8),

    // ── 10. Consultation ──────────────────────────────────────────────────────
    navyBand('10. Consultation'),
    guidanceBox('Record all persons consulted in the preparation of this SWMS. Workers must be consulted before the SWMS is finalised.'),
    navyTable(
      ['Name', 'Role / Trade', 'Company', 'Date Consulted', 'Method of Consultation'],
      [
        ['', '', '', '', ''],
        ['', '', '', '', ''],
        ['', '', '', '', ''],
      ]
    ),
    spacer(8),

    // ── 11. Legislation & Standards ───────────────────────────────────────────
    navyBand('11. Legislation & Standards'),
    navyTable(
      ['Document', 'Title', 'Relevance'],
      [
        ['Act',      'Work Health and Safety Act 2011 (Qld)',                  'Primary WHS legislation'],
        ['Reg',      'Work Health and Safety Regulation 2011 (Qld)',           'Prescriptive requirements including HRCW'],
        ['CoP',      'Code of Practice: Construction Work',                    'Guidance for construction activities'],
        ['CoP',      'Code of Practice: Managing the Risk of Falls at Workplaces', 'Fall prevention and control'],
        ['CoP',      'Code of Practice: Hazardous Manual Tasks',               'Manual handling risk management'],
        ['CoP',      'Code of Practice: Managing Noise and Preventing Hearing Loss', 'Noise controls'],
        ['AS/NZS',   'AS/NZS 1801 — Occupational protective helmets',         'Safety helmet standard'],
        ['AS/NZS',   'AS/NZS 2210.3 — Safety, protective and occupational footwear', 'Footwear standard'],
        ['AS/NZS',   'AS/NZS 4602.1 — High visibility safety garments',       'Hi-vis standard'],
        ['Other',    '',                                                        ''],
      ]
    ),
    spacer(8),

    // ── 12. Principal Contractor Authorisation ────────────────────────────────
    navyBand('12. Principal Contractor Authorisation'),
    guidanceBox('The Principal Contractor must review and authorise this SWMS before work commences on site.'),
    twoColForm([
      ['I confirm this SWMS has been reviewed and is approved for use on site.', ''],
      ['Name',       ''],
      ['Position',   'Principal Contractor / Site Manager'],
      ['Signature',  ''],
      ['Date',       ''],
    ]),
    spacer(8),

    // ── 13. Worker Sign-Off ───────────────────────────────────────────────────
    navyBand('13. Worker Sign-Off'),
    p('All workers must read and understand this SWMS before commencing work. By signing below you confirm you have been inducted against this SWMS, understand the hazards and controls, and agree to comply with all requirements.'),
    ((): DocumentBlock => {
      const colName = bid('col-name');
      const colRole = bid('col-role');
      const colSig  = bid('col-sig');
      const colDate = bid('col-date');
      const presetRoles = ['Supervisor / PCBU', 'Worker 1', 'Worker 2', 'Worker 3', 'Worker 4', 'Worker 5'];
      return {
        id: bid('signoff-tbl'),
        type: 'table',
        mode: 'fillable',
        headerBgColor: '#1a2744' as string,
        headerTextColor: '#ffffff' as string,
        stripedRows: false,
        repeatable: true,
        columns: [
          { id: colName, header: 'Name',      cellType: 'text',      width: 3 },
          { id: colRole, header: 'Role',      cellType: 'text',      width: 2 },
          { id: colSig,  header: 'Signature', cellType: 'signature', width: 3 },
          { id: colDate, header: 'Date',      cellType: 'date',      width: 2 },
        ],
        rows: presetRoles.map((role) => ({
          id: bid('srow'),
          cells: { [colName]: '', [colRole]: role, [colSig]: '', [colDate]: '' },
        })),
      } as DocumentBlock;
    })(),
    spacer(8),

    // ── Revision History ──────────────────────────────────────────────────────
    navyBand('Revision History'),
    revisionTable(),
    spacer(4),
    divider(),
    p('Document Control — this document is controlled. Printed copies are uncontrolled. Verify currency before use.', false),
  ];
}

function buildSafetyPlanBlocks(docTitle: string): DocumentBlock[] {
  _seq = 0;
  return [
    // ── Header banner ─────────────────────────────────────────────────────────
    { id: bid('whs-title'), type: 'rich_text', html: `<table class="not-prose" style="width:100%;border-collapse:collapse;"><tr><td style="background:${DOC_NAVY} !important;color:${DOC_NAVY_TEXT} !important;font-weight:800;font-size:15px;padding:10px 14px;letter-spacing:0.02em;">WHS MANAGEMENT PLAN</td><td style="background:${DOC_NAVY} !important;color:#94a3b8 !important;font-size:11px;padding:10px 14px;text-align:right;white-space:nowrap;">Work Health &amp; Safety | WHS Act 2011 (Qld) | Template</td></tr></table>` } as DocumentBlock,
    warningBox('HOW TO USE THIS TEMPLATE — Replace every [bracketed] field with site-specific information. Delete unused rows. Consult workers before the plan is finalised. A generic WHS Management Plan that is not tailored to the site and project is not compliant. This document is a starting point only and is not legal advice.'),
    spacer(4),

    // ── 1. Document Control ───────────────────────────────────────────────────
    navyBand('1. Document Control'),
    fourColForm([
      ['Plan No.',      '[WHS-XXX]',       'Revision',     '[00]'],
      ['Date prepared', '[DD/MM/YYYY]',    'Review date',  '[DD/MM/YYYY]'],
      ['Prepared by',   '[Name / position]', 'Approved by', '[Name / position]'],
    ]),
    spacer(8),

    // ── 2. PCBU and Project Details ───────────────────────────────────────────
    navyBand('2. PCBU and Project Details'),
    twoColForm([
      ['PCBU name',                     '[Legal name of the business carrying out the work]'],
      ['ABN',                           '[XX XXX XXX XXX]'],
      ['Address',                       '[Business address]'],
      ['Principal Contractor',          '[Name of principal contractor if applicable]'],
      ['PC contact name',               '[Name / position]'],
      ['PC contact phone',              '[Phone number]'],
      ['Project name',                  '[Project / site name]'],
      ['Project address',               '[Full site address]'],
      ['Project number',                '[Project reference]'],
      ['Contract value',                '[$ value]'],
      ['Planned start date',            '[DD/MM/YYYY]'],
      ['Planned completion date',       '[DD/MM/YYYY]'],
      ['Site supervisor',               '[Name / position]'],
      ['Supervisor phone',              '[Phone number]'],
      ['Related SWMS documents',        '[List SWMS references applicable to this project]'],
    ]),
    spacer(8),

    // ── 3. Scope of Works ─────────────────────────────────────────────────────
    navyBand('3. Scope of Works'),
    guidanceBox('Describe the work activities, trades, and construction phases covered by this plan. Include any exclusions or limitations.'),
    twoColForm([
      ['Description of works', '[Describe the scope of construction works]'],
      ['Work activities / trades', '[List all trades and work activities on site]'],
      ['Exclusions', '[Any work not covered by this plan]'],
    ]),
    spacer(8),

    // ── 4. Emergency Planning ─────────────────────────────────────────────────
    navyBand('4. Emergency Planning'),
    twoColForm([
      ['Emergency services (Police / Fire / Ambulance)', '000'],
      ['Poison Information Centre',                      '13 11 26'],
      ['Site emergency contact',                         '[Name]'],
      ['Site emergency phone',                           '[Phone number]'],
      ['Nearest hospital',                               '[Hospital name]'],
      ['Hospital address',                               '[Address]'],
      ['Assembly point',                                 '[Location on site]'],
      ['Muster warden',                                  '[Name / position]'],
      ['First aid officer',                              '[Name]'],
      ['First aid kit location',                         '[Location on site]'],
      ['Defibrillator location',                         '[Location or N/A]'],
      ['Incident reporting procedure',                   'Notify supervisor immediately. Preserve scene. Complete incident report within 24 hours. Notify regulator for serious incidents.'],
      ['Regulator notification',                         'SafeWork QLD: 1300 362 128 (serious incidents, dangerous incidents, fatalities)'],
    ]),
    spacer(8),

    // ── 5. Site Rules & Induction ─────────────────────────────────────────────
    navyBand('5. Site Rules & Induction'),
    guidanceBox('All workers must be inducted before commencing work. Record inductions in the site induction register.'),
    navyTable(
      ['Site Rule', 'Requirement'],
      [
        ['Site access',             '[Describe access control, sign-in/out procedure]'],
        ['PPE minimum standard',    'Safety helmet, safety footwear, hi-vis vest at all times on site'],
        ['Alcohol and drugs',       'Zero tolerance — no alcohol or drugs on site'],
        ['Smoking',                 '[Designated smoking area only / No smoking on site]'],
        ['Speed limit',             '[XX km/h on site]'],
        ['Housekeeping',            'Keep work areas clean and tidy at all times'],
        ['Reporting hazards',       'Report all hazards, near misses and incidents to the supervisor immediately'],
        ['Induction requirement',   'All workers must complete site induction before commencing work'],
        ['Visitor management',      '[Describe visitor sign-in and escort requirements]'],
      ]
    ),
    spacer(8),

    // ── 6. High-Risk Construction Work (HRCW) ─────────────────────────────────
    navyBand('6. High-Risk Construction Work (HRCW)'),
    guidanceBox('Identify all HRCW activities on this project. A SWMS must be prepared for each HRCW activity before work commences (WHS Regulation 2011, s291).'),
    navyTable(
      ['HRCW Activity', 'Applies (Y/N)', 'SWMS Reference', 'Responsible Person'],
      [
        ['Risk of a person falling more than 2 metres',                                    '', '[SWMS-XXX]', ''],
        ['Work on a telecommunication tower',                                               '', '',           ''],
        ['Demolition of a load-bearing structure',                                          '', '',           ''],
        ['Disturbance of asbestos',                                                         '', '',           ''],
        ['Work involving structural alterations requiring temporary support',               '', '',           ''],
        ['Work in or near a confined space',                                                '', '',           ''],
        ['Work in or near a shaft or trench deeper than 1.5 m',                            '', '',           ''],
        ['Work on or near energised electrical installations or services',                  '', '',           ''],
        ['Work on, in or adjacent to a road, railway or other traffic corridor',           '', '',           ''],
        ['Work in an area with movement of powered mobile plant',                           '', '',           ''],
        ['Work in or near water involving risk of drowning',                                '', '',           ''],
        ['Other HRCW (specify)',                                                            '', '',           ''],
      ]
    ),
    spacer(8),

    // ── 7. Hazard Register ────────────────────────────────────────────────────
    navyBand('7. Hazard Register'),
    safetyIconsImage(),
    guidanceBox('List all foreseeable hazards for this project. Use the risk matrix to rate each hazard before and after controls are applied.'),
    navyTable(
      ['Ref', 'Hazard / Risk', 'Who is at Risk', 'Likelihood', 'Consequence', 'Initial Risk Rating', 'Control Measures', 'Residual Risk Rating', 'Responsible Person'],
      [
        ['1', '[Describe hazard]', '', 'L / M / H', 'L / M / H', '', '[Describe controls]', '', ''],
        ['2', '', '', '', '', '', '', '', ''],
        ['3', '', '', '', '', '', '', '', ''],
        ['4', '', '', '', '', '', '', '', ''],
        ['5', '', '', '', '', '', '', '', ''],
      ]
    ),
    spacer(8),

    // ── 8. Consultation & Communication ───────────────────────────────────────
    navyBand('8. Consultation & Communication'),
    guidanceBox('The PCBU must consult with workers on WHS matters. Record how consultation will be conducted on this project.'),
    twoColForm([
      ['Consultation method',         '[Toolbox talks / safety meetings / direct consultation]'],
      ['Meeting frequency',           '[Weekly / fortnightly / as required]'],
      ['Safety notice board location','[Location on site]'],
      ['WHS representative',          '[Name / position or N/A]'],
      ['Issue resolution process',    '[Describe how WHS issues raised by workers will be resolved]'],
    ]),
    spacer(8),

    // ── 9. Plant & Equipment Controls ─────────────────────────────────────────
    navyBand('9. Plant & Equipment Controls'),
    guidanceBox('List all plant and equipment on site. Confirm registration, pre-start checks and operator competency requirements.'),
    navyTable(
      ['Plant / Equipment', 'Make / Model', 'Rego / Serial No.', 'Pre-start Check', 'Operator Licence / Competency Required', 'Inspection Current'],
      [
        ['[Item]', '', '', 'Yes / No', '', 'Yes / No'],
        ['', '', '', 'Yes / No', '', 'Yes / No'],
        ['', '', '', 'Yes / No', '', 'Yes / No'],
      ]
    ),
    spacer(8),

    // ── 10. Electrical Safety ─────────────────────────────────────────────────
    navyBand('10. Electrical Safety'),
    twoColForm([
      ['RCD protection',              '[All portable electrical equipment protected by RCD]'],
      ['Electrical isolation procedure', '[Describe lockout/tagout procedure]'],
      ['Testing and tagging',         '[Frequency and responsible person]'],
      ['Underground services',        '[Dial Before You Dig reference number]'],
      ['Overhead powerlines',         '[Describe exclusion zone controls or N/A]'],
      ['Electrical contractor',       '[Name / licence number]'],
    ]),
    spacer(8),

    // ── 11. Traffic Management ────────────────────────────────────────────────
    navyBand('11. Traffic Management'),
    twoColForm([
      ['Traffic management plan',     '[Ref / attached / N/A]'],
      ['Vehicle / pedestrian separation', '[Describe controls]'],
      ['Speed limit on site',         '[XX km/h]'],
      ['Delivery management',         '[Describe delivery booking and unloading procedure]'],
      ['Traffic controller required', 'Yes / No'],
    ]),
    spacer(8),

    // ── 12. Hazardous Materials ───────────────────────────────────────────────
    navyBand('12. Hazardous Materials'),
    twoColForm([
      ['SDS register location',       '[Location on site / electronic system]'],
      ['Hazardous substances on site','[List substances or refer to SDS register]'],
      ['Storage requirements',        '[Describe storage controls — bunding, segregation, labelling]'],
      ['Disposal requirements',       '[Describe waste disposal procedure]'],
      ['Asbestos',                    '[Asbestos register ref / N/A]'],
    ]),
    spacer(8),

    // ── 13. Environmental Controls ────────────────────────────────────────────
    navyBand('13. Environmental Controls'),
    navyTable(
      ['Environmental Aspect', 'Control Measure', 'Responsible Person'],
      [
        ['Dust',          '[Water cart / dust suppression / hoarding]',         ''],
        ['Noise',         '[Restricted hours / barriers / community notification]', ''],
        ['Stormwater',    '[Silt fences / sediment traps / spill kits]',        ''],
        ['Waste',         '[Segregated bins / licensed waste contractor]',       ''],
        ['Contamination', '[Describe controls or N/A]',                          ''],
        ['Heritage',      '[Describe controls or N/A]',                          ''],
      ]
    ),
    spacer(8),

    // ── 14. Incident Reporting ────────────────────────────────────────────────
    navyBand('14. Incident Reporting'),
    twoColForm([
      ['Incident report form location',  '[Location on site / electronic system]'],
      ['Reporting timeframe',            'Immediate verbal notification to supervisor; written report within 24 hours'],
      ['Investigation responsibility',   '[Name / position]'],
      ['Corrective action tracking',     '[Describe how corrective actions are tracked to close-out]'],
      ['Notifiable incidents',           'Fatality, serious injury/illness, dangerous incident — notify SafeWork QLD immediately: 1300 362 128'],
      ['Workers compensation insurer',   '[Insurer name and policy number]'],
    ]),
    spacer(8),

    // ── 15. Review & Approval ─────────────────────────────────────────────────
    navyBand('15. Review & Approval'),
    guidanceBox('This plan must be reviewed and updated whenever there is a change to the work, after an incident, or at least annually.'),
    navyTable(
      ['Role', 'Name', 'Position', 'Signature', 'Date'],
      [
        ['Prepared by',  '', '[Position]', '', '[DD/MM/YYYY]'],
        ['Reviewed by',  '', '[Position]', '', '[DD/MM/YYYY]'],
        ['Approved by',  '', '[Position]', '', '[DD/MM/YYYY]'],
      ]
    ),
    spacer(8),

    // ── Revision History ──────────────────────────────────────────────────────
    navyBand('Revision History'),
    revisionTable(),
    spacer(4),
    divider(),
    p('Document Control — this document is controlled. Printed copies are uncontrolled. Verify currency before use.', false),
  ];
}

function buildPolicyBlocks(docTitle: string): DocumentBlock[] {
  _seq = 0;
  return [
    // ── Header banner ─────────────────────────────────────────────────────────
    { id: bid('pol-title'), type: 'rich_text', html: `<table class="not-prose" style="width:100%;border-collapse:collapse;"><tr><td style="background:${DOC_NAVY} !important;color:${DOC_NAVY_TEXT} !important;font-weight:800;font-size:15px;padding:10px 14px;letter-spacing:0.02em;">${(docTitle || 'COMPANY POLICY').toUpperCase()}</td><td style="background:${DOC_NAVY} !important;color:#94a3b8 !important;font-size:11px;padding:10px 14px;text-align:right;white-space:nowrap;">WHS Policy | Template</td></tr></table>` } as DocumentBlock,
    spacer(4),

    // ── Document Control ──────────────────────────────────────────────────────
    navyBand('Document Control'),
    fourColForm([
      ['Policy No.',    '[POL-XXX]',           'Version',      '[1.0]'],
      ['Date issued',   '[DD/MM/YYYY]',         'Review date',  '[DD/MM/YYYY]'],
      ['Policy owner',  '[Name / position]',    'Approved by',  '[Name / position]'],
      ['Status',        'Draft',                '',             ''],
    ]),
    spacer(8),

    // ── 1. Purpose ────────────────────────────────────────────────────────────
    navyBand('1. Purpose'),
    guidanceBox('State the intent of this policy — what it is designed to achieve and why it exists.'),
    twoColForm([
      ['Purpose', '[Describe the purpose and intent of this policy]'],
    ]),
    spacer(8),

    // ── 2. Scope ──────────────────────────────────────────────────────────────
    navyBand('2. Scope'),
    twoColForm([
      ['This policy applies to', '[All workers / specific roles / specific sites / all operations]'],
      ['Exclusions',             '[Any persons or activities not covered by this policy, or N/A]'],
    ]),
    spacer(8),

    // ── 3. Definitions ────────────────────────────────────────────────────────
    navyBand('3. Definitions'),
    navyTable(
      ['Term', 'Definition'],
      [
        ['PCBU',    'Person Conducting a Business or Undertaking — as defined in the WHS Act 2011'],
        ['Worker',  'Any person who carries out work for the PCBU, including employees, contractors and subcontractors'],
        ['[Term]',  '[Definition]'],
        ['[Term]',  '[Definition]'],
      ]
    ),
    spacer(8),

    // ── 4. Responsibilities ───────────────────────────────────────────────────
    navyBand('4. Responsibilities'),
    navyTable(
      ['Role', 'Responsibilities'],
      [
        ['PCBU / Management',  '[Describe management responsibilities under this policy]'],
        ['Supervisors',        '[Describe supervisor responsibilities]'],
        ['Workers',            '[Describe worker responsibilities]'],
        ['[Other role]',       '[Describe responsibilities]'],
      ]
    ),
    spacer(8),

    // ── 5. Requirements & Procedures ─────────────────────────────────────────
    navyBand('5. Requirements & Procedures'),
    guidanceBox('Detail the specific requirements, rules and procedures that must be followed. Add rows as needed.'),
    navyTable(
      ['Requirement', 'Procedure / Detail', 'Responsible Person'],
      [
        ['[Requirement 1]', '[Describe the procedure or rule]', ''],
        ['[Requirement 2]', '[Describe the procedure or rule]', ''],
        ['[Requirement 3]', '[Describe the procedure or rule]', ''],
        ['[Requirement 4]', '[Describe the procedure or rule]', ''],
      ]
    ),
    spacer(8),

    // ── 6. Related Documents ──────────────────────────────────────────────────
    navyBand('6. Related Documents'),
    navyTable(
      ['Document Type', 'Title / Reference'],
      [
        ['Legislation',  'Work Health and Safety Act 2011 (Qld)'],
        ['Regulation',   'Work Health and Safety Regulation 2011 (Qld)'],
        ['Policy',       '[Related policy reference]'],
        ['Procedure',    '[Related procedure reference]'],
        ['Form',         '[Related form reference]'],
      ]
    ),
    spacer(8),

    // ── 7. Review Schedule ────────────────────────────────────────────────────
    navyBand('7. Review Schedule'),
    twoColForm([
      ['Review frequency',    'Annually, or after an incident, regulatory change, or significant organisational change'],
      ['Next review date',    '[DD/MM/YYYY]'],
      ['Responsible person',  '[Name / position]'],
    ]),
    spacer(8),

    // ── 8. Approval ───────────────────────────────────────────────────────────
    navyBand('8. Approval'),
    navyTable(
      ['Role', 'Name', 'Position', 'Signature', 'Date'],
      [
        ['Prepared by',  '[Name]', '[Position]', '', '[DD/MM/YYYY]'],
        ['Reviewed by',  '[Name]', '[Position]', '', '[DD/MM/YYYY]'],
        ['Approved by',  '[Name]', '[Position]', '', '[DD/MM/YYYY]'],
      ]
    ),
    spacer(8),

    // ── Revision History ──────────────────────────────────────────────────────
    navyBand('Revision History'),
    revisionTable(),
    spacer(4),
    divider(),
    p('Document Control — this document is controlled. Printed copies are uncontrolled. Verify currency before use.', false),
  ];
}

const BLOCK_BUILDERS: Record<WidgetId, (title: string) => DocumentBlock[]> = {
  swms:        buildSwmsBlocks,
  safety_plan: buildSafetyPlanBlocks,
  policy:      buildPolicyBlocks,
};

// Block builders are used internally via BLOCK_BUILDERS map — not exported.

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
