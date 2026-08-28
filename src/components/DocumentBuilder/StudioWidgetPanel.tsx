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
import { HardHat, ClipboardList, BookOpen, ChevronRight, AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react';
import { useDocumentStore } from './useDocumentStore';
import type { DocumentBlock } from './types';

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
function banner(title: string, body: string, variant: 'info' | 'warning' | 'success' | 'danger' = 'info'): DocumentBlock {
  return { id: bid('ban'), type: 'banner', variant, title, body, size: 'compact', align: 'left', showOnExport: true } as DocumentBlock;
}
function infoTable(rows: Array<[string, string]>): DocumentBlock {
  return {
    id: bid('tbl'),
    type: 'table',
    mode: 'static',
    columns: [
      { id: 'field', header: 'Field', cellType: 'text', width: 1 },
      { id: 'value', header: 'Value', cellType: 'text', width: 2 },
    ],
    rows: rows.map(([field, value]) => ({ id: bid('r'), cells: { field, value } })),
    stripedRows: true,
  } as DocumentBlock;
}
function riskTable(): DocumentBlock {
  return {
    id: bid('tbl-risk'),
    type: 'table',
    mode: 'static',
    columns: [
      { id: 'seq',         header: '#',                  cellType: 'text', width: 0.5 },
      { id: 'work',        header: 'Sequence of Work',   cellType: 'text', width: 2 },
      { id: 'hazard',      header: 'Hazard / Risk',      cellType: 'text', width: 2 },
      { id: 'consequence', header: 'Consequence',        cellType: 'text', width: 1.5 },
      { id: 'initial',     header: 'Initial Risk',       cellType: 'text', width: 1 },
      { id: 'controls',    header: 'Control Measures',   cellType: 'text', width: 2.5 },
      { id: 'residual',    header: 'Residual Risk',      cellType: 'text', width: 1 },
      { id: 'person',      header: 'Responsible Person', cellType: 'text', width: 1.5 },
    ],
    rows: [
      { id: bid('r'), cells: { seq: '1', work: '', hazard: '', consequence: '', initial: '', controls: '', residual: '', person: '' } },
      { id: bid('r'), cells: { seq: '2', work: '', hazard: '', consequence: '', initial: '', controls: '', residual: '', person: '' } },
      { id: bid('r'), cells: { seq: '3', work: '', hazard: '', consequence: '', initial: '', controls: '', residual: '', person: '' } },
    ],
    stripedRows: true,
  } as DocumentBlock;
}
function ppeTable(): DocumentBlock {
  return {
    id: bid('tbl-ppe'),
    type: 'table',
    mode: 'static',
    columns: [
      { id: 'item',        header: 'PPE Item',       cellType: 'text', width: 2 },
      { id: 'requirement', header: 'Requirement',    cellType: 'text', width: 2 },
      { id: 'standard',    header: 'Standard / AS',  cellType: 'text', width: 2 },
    ],
    rows: [
      { id: bid('r'), cells: { item: 'Safety Helmet', requirement: 'Mandatory', standard: 'AS/NZS 1801' } },
      { id: bid('r'), cells: { item: 'Safety Footwear', requirement: 'Mandatory', standard: 'AS/NZS 2210' } },
      { id: bid('r'), cells: { item: 'High-Visibility Vest', requirement: 'Mandatory', standard: 'AS/NZS 4602' } },
      { id: bid('r'), cells: { item: '', requirement: '', standard: '' } },
    ],
    stripedRows: true,
  } as DocumentBlock;
}
function hazardTable(): DocumentBlock {
  return {
    id: bid('tbl-haz'),
    type: 'table',
    mode: 'static',
    columns: [
      { id: 'ref',      header: 'Ref',           cellType: 'text', width: 0.5 },
      { id: 'hazard',   header: 'Hazard',         cellType: 'text', width: 2 },
      { id: 'risk',     header: 'Risk',           cellType: 'text', width: 2 },
      { id: 'controls', header: 'Controls',       cellType: 'text', width: 3 },
      { id: 'rating',   header: 'Risk Rating',    cellType: 'text', width: 1 },
      { id: 'owner',    header: 'Owner',          cellType: 'text', width: 1.5 },
    ],
    rows: [
      { id: bid('r'), cells: { ref: '1', hazard: '', risk: '', controls: '', rating: '', owner: '' } },
      { id: bid('r'), cells: { ref: '2', hazard: '', risk: '', controls: '', rating: '', owner: '' } },
    ],
    stripedRows: true,
  } as DocumentBlock;
}

function buildSwmsBlocks(docTitle: string): DocumentBlock[] {
  _seq = 0;
  return [
    banner('Review Before Issue', 'This document must be reviewed and approved before being issued to workers. All workers must be inducted against this SWMS before commencing work.', 'warning'),
    spacer(4),
    h(1, docTitle || 'Safe Work Method Statement'),
    p('Safe Work Method Statement (SWMS)', true),
    spacer(4),
    h(2, '1. Document Identity'),
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
    h(2, '2. Scope of Works'),
    p('Describe the scope of works, location, and activities covered by this SWMS.'),
    spacer(8),
    h(2, '3. High-Risk Construction Work (HRCW)'),
    p('Identify any high-risk construction work activities applicable to this SWMS.'),
    infoTable([
      ['HRCW Applies', 'Yes / No'],
      ['HRCW Categories', ''],
    ]),
    spacer(8),
    h(2, '4. Sequence of Work & Risk Controls'),
    p('Complete the table below for each step in the sequence of work.'),
    riskTable(),
    spacer(8),
    h(2, '5. Plant & Equipment'),
    infoTable([
      ['Item', 'Inspection Required'],
      ['', ''],
    ]),
    spacer(8),
    h(2, '6. Personal Protective Equipment (PPE)'),
    ppeTable(),
    spacer(8),
    h(2, '7. Risk Matrix'),
    infoTable([
      ['Likelihood × Consequence', 'Risk Rating'],
      ['Almost Certain × Catastrophic', 'Extreme'],
      ['Likely × Major', 'High'],
      ['Possible × Moderate', 'Medium'],
      ['Unlikely × Minor', 'Low'],
    ]),
    spacer(8),
    h(2, '8. Emergency Response'),
    infoTable([
      ['Emergency Services', '000'],
      ['Site Emergency Contact', ''],
      ['Assembly Point', ''],
      ['First Aid Officer', ''],
      ['First Aid Kit Location', ''],
    ]),
    spacer(8),
    h(2, '9. Legislation & Standards'),
    p('Work Health and Safety Act 2011 (Qld) | Work Health and Safety Regulation 2011 (Qld) | Code of Practice: Construction Work | Relevant Australian Standards'),
    spacer(8),
    divider(),
    p('Document Control — this document is controlled. Printed copies are uncontrolled. Verify currency before use.', false),
  ];
}

function buildSafetyPlanBlocks(docTitle: string): DocumentBlock[] {
  _seq = 0;
  return [
    banner('Review Before Issue', 'This WHS Management Plan must be reviewed and approved before works commence. Keep this document on site at all times.', 'warning'),
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
  const store = useDocumentStore();  const [selected, setSelected] = useState<WidgetId | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [applying, setApplying] = useState(false);
  const [applied, setApplied] = useState<WidgetId | null>(null);

  const hasBlocks = store.blocks.length > 0;

  function handleSelect(id: WidgetId) {
    if (applying) return;
    setSelected(id);
    setApplied(null);
    if (hasBlocks) {
      setConfirming(true);
    } else {
      void applyWidget(id);
    }
  }

  async function applyWidget(id: WidgetId) {
    setApplying(true);
    setConfirming(false);
    try {
      const blocks = BLOCK_BUILDERS[id](store.templateName || '');
      const def = WIDGETS.find((w) => w.id === id)!;

      // If blank doc — prepend (which effectively replaces since there's nothing)
      // If has content — prepend so widget structure leads the document
      store.prependBlocks(blocks);

      // Set template type to match widget
      store.setTemplateType(TEMPLATE_TYPES[id] as Parameters<typeof store.setTemplateType>[0]);

      // If doc has no name yet, set a sensible default
      if (!store.templateName || store.templateName === 'Untitled document') {
        store.setTemplateName(def.label.replace(' Widget', ''));
      }

      setApplied(id);
    } finally {
      setApplying(false);
      setSelected(null);
    }
  }

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

      {/* Confirm overwrite warning */}
      {confirming && selected && (
        <div className="mx-3 mt-3 flex-shrink-0 bg-amber-50 border border-amber-200 rounded-lg p-3">
          <div className="flex items-start gap-2 mb-2">
            <AlertTriangle size={13} className="text-amber-600 shrink-0 mt-0.5" />
            <p className="text-xs text-amber-800 leading-snug">
              This document already has content. The widget will be <strong>prepended</strong> — your existing blocks are preserved below.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => void applyWidget(selected)}
              className="flex-1 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold transition-colors"
            >
              Apply Anyway
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
        {WIDGETS.map((w) => (
          <button
            key={w.id}
            onClick={() => handleSelect(w.id)}
            disabled={applying}
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
                  <ChevronRight size={12} className="text-slate-400 shrink-0" />
                </div>
                <p className="text-[11px] text-slate-500 mt-0.5">{w.subtitle}</p>
              </div>
            </div>
            {/* Section list */}
            <ul className="mt-2.5 space-y-0.5 pl-12">
              {w.sections.map((s) => (
                <li key={s} className="text-[10px] text-slate-400 leading-snug">• {s}</li>
              ))}
            </ul>
          </button>
        ))}
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
