/**
 * swmsBodyToStudioBlocks
 * ─────────────────────────────────────────────────────────────────────────────
 * Converts a completed SwmsBodyData (from SwmsBodyBuilder) into an array of
 * DocumentBlock objects suitable for creating a Studio document.
 *
 * Rules:
 * - No live Yes/No fields, submission controls, or sign-on controls.
 * - Worker acknowledgement and signatures remain in Forms/Submissions.
 * - Uses heading, text, rich_text, table, banner, divider, and spacer blocks.
 * - Generates stable block IDs using a deterministic prefix + index.
 * - All content is sanitised (plain text — no raw HTML injection).
 */

import type { DocumentBlock, HeadingBlock, TextBlock, TableBlock, BannerBlock, DividerBlock, SpacerBlock } from '@/components/DocumentBuilder/types';
import type { SwmsBodyData, WorkStep, CriticalControl, PlantItem, PpeRow, HRCWEntry, EnvControl, EmergencyAction } from '@/components/safety/swms-body-types';
import { DOCUMENT_TYPE_LABELS } from '@/components/safety/swms-body-types';

// ── ID generator ──────────────────────────────────────────────────────────────
let _seq = 0;
function bid(prefix: string): string {
  _seq++;
  return `swms-gen-${prefix}-${_seq}`;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function h(level: 1 | 2 | 3 | 4, content: string): HeadingBlock {
  return { id: bid('h'), type: 'heading', content, level, align: 'left' };
}
function p(content: string, bold = false): TextBlock {
  return { id: bid('p'), type: 'text', content, align: 'left', bold };
}
function divider(): DividerBlock {
  return { id: bid('div'), type: 'divider', style: 'solid', thickness: 1 };
}
function spacer(height = 8): SpacerBlock {
  return { id: bid('sp'), type: 'spacer', height };
}
function banner(title: string, body: string, variant: BannerBlock['variant'] = 'info'): BannerBlock {
  return { id: bid('ban'), type: 'banner', variant, title, body, size: 'compact', align: 'left', showOnExport: true };
}

function safeText(v: unknown): string {
  if (v == null) return '';
  return String(v).replace(/<[^>]*>/g, '').trim();
}

function riskLabel(r: string): string {
  const map: Record<string, string> = { extreme: 'Extreme', high: 'High', medium: 'Medium', low: 'Low', '': '—' };
  return map[r] ?? r;
}

// ── Main converter ────────────────────────────────────────────────────────────
export function swmsBodyToStudioBlocks(d: SwmsBodyData, swmsTitle: string): DocumentBlock[] {
  _seq = 0; // reset per call so IDs are stable for the same input
  const blocks: DocumentBlock[] = [];

  // ── Cover / Identity ──────────────────────────────────────────────────────
  const docTypeLabel = d.documentType ? (DOCUMENT_TYPE_LABELS[d.documentType] ?? d.documentType) : 'Safe Work Method Statement (SWMS)';
  blocks.push(h(1, safeText(swmsTitle) || 'Safe Work Method Statement'));
  blocks.push(p(docTypeLabel, true));
  blocks.push(spacer(4));

  // Identity table
  const identityTable: TableBlock = {
    id: bid('tbl-identity'),
    type: 'table',
    mode: 'static',
    columns: [
      { id: 'field', header: 'Field', cellType: 'text', width: 1 },
      { id: 'value', header: 'Value', cellType: 'text', width: 2 },
    ],
    rows: [
      { id: bid('r'), cells: { field: 'Document Type', value: docTypeLabel } },
      { id: bid('r'), cells: { field: 'Revision', value: safeText(d.revisionNumber) || '1' } },
      { id: bid('r'), cells: { field: 'Status', value: safeText(d.status) } },
      { id: bid('r'), cells: { field: 'Review Date', value: safeText(d.reviewDate) } },
      { id: bid('r'), cells: { field: 'Prepared By', value: safeText(d.authorName) } },
      { id: bid('r'), cells: { field: 'Approved By', value: safeText(d.approvedByName) } },
    ],
    stripedRows: true,
  };
  blocks.push(identityTable);
  blocks.push(spacer());

  // ── Purpose & Scope ───────────────────────────────────────────────────────
  blocks.push(divider());
  blocks.push(h(2, '1. Purpose & Scope'));
  if (d.purpose) { blocks.push(p('Purpose')); blocks.push(p(safeText(d.purpose))); }
  if (d.scope)   { blocks.push(p('Scope', true)); blocks.push(p(safeText(d.scope))); }
  if (d.includedActivities?.filter(Boolean).length) {
    blocks.push(p('Included Activities', true));
    blocks.push(p(d.includedActivities.filter(Boolean).map(a => `• ${safeText(a)}`).join('\n')));
  }
  if (d.excludedActivities?.filter(Boolean).length) {
    blocks.push(p('Excluded Activities', true));
    blocks.push(p(d.excludedActivities.filter(Boolean).map(a => `• ${safeText(a)}`).join('\n')));
  }
  if (d.workBoundaries) { blocks.push(p('Work Boundaries', true)); blocks.push(p(safeText(d.workBoundaries))); }
  blocks.push(spacer());

  // ── High-Risk Construction Work ───────────────────────────────────────────
  blocks.push(divider());
  blocks.push(h(2, '2. High-Risk Construction Work'));
  if (d.hrcwApplies === 'no') {
    blocks.push(banner('No Statutory HRCW', 'This document does not involve High-Risk Construction Work as defined under the WHS Regulation.', 'info'));
  } else if (d.hrcwApplies === 'yes' && d.hrcwCategories?.length) {
    blocks.push(p('The following HRCW categories apply:', true));
    const hrcwTable: TableBlock = {
      id: bid('tbl-hrcw'),
      type: 'table',
      mode: 'static',
      columns: [
        { id: 'cat',    header: 'HRCW Category',       cellType: 'text', width: 3 },
        { id: 'why',    header: 'Why It Applies',       cellType: 'text', width: 2 },
        { id: 'permit', header: 'Permit Required',      cellType: 'text', width: 1 },
      ],
      rows: d.hrcwCategories.map((e: HRCWEntry) => ({
        id: bid('r'),
        cells: {
          cat:    safeText(e.category),
          why:    safeText(e.whyApplies),
          permit: safeText(e.requiredPermit) || '—',
        },
      })),
      stripedRows: true,
    };
    blocks.push(hrcwTable);
  } else {
    blocks.push(p('HRCW applicability not confirmed.'));
  }
  blocks.push(spacer());

  // ── Critical Controls ─────────────────────────────────────────────────────
  if (d.criticalControls?.length) {
    blocks.push(divider());
    blocks.push(h(2, '3. Fatal Hazards & Critical Controls'));
    const ccTable: TableBlock = {
      id: bid('tbl-cc'),
      type: 'table',
      mode: 'static',
      columns: [
        { id: 'risk',     header: 'Critical Risk',       cellType: 'text', width: 2 },
        { id: 'outcome',  header: 'Possible Outcome',    cellType: 'text', width: 2 },
        { id: 'controls', header: 'Mandatory Controls',  cellType: 'text', width: 3 },
        { id: 'verify',   header: 'Verification',        cellType: 'text', width: 2 },
      ],
      rows: d.criticalControls.map((c: CriticalControl) => ({
        id: bid('r'),
        cells: {
          risk:     safeText(c.criticalRisk),
          outcome:  safeText(c.possibleOutcome),
          controls: safeText(c.mandatoryControls),
          verify:   safeText(c.verificationMethod),
        },
      })),
      stripedRows: true,
      headerBgColor: '#7c3aed',
      headerTextColor: '#ffffff',
    };
    blocks.push(ccTable);
    blocks.push(spacer());
  }

  // ── Plant & Equipment ─────────────────────────────────────────────────────
  if (d.plantItems?.length) {
    blocks.push(divider());
    blocks.push(h(2, '4. Plant, Tools & Safety Equipment'));
    const plantTable: TableBlock = {
      id: bid('tbl-plant'),
      type: 'table',
      mode: 'static',
      columns: [
        { id: 'item',    header: 'Item',                  cellType: 'text', width: 2 },
        { id: 'req',     header: 'Requirement',           cellType: 'text', width: 2 },
        { id: 'inspect', header: 'Inspection Required',   cellType: 'text', width: 1 },
        { id: 'notes',   header: 'Notes',                 cellType: 'text', width: 2 },
      ],
      rows: d.plantItems.map((pi: PlantItem) => ({
        id: bid('r'),
        cells: {
          item:    safeText(pi.item),
          req:     safeText(pi.requirement),
          inspect: safeText(pi.inspectionRequired) || '—',
          notes:   safeText(pi.notes),
        },
      })),
      stripedRows: true,
    };
    blocks.push(plantTable);
    blocks.push(spacer());
  }

  // ── PPE Requirements ──────────────────────────────────────────────────────
  if (d.ppeRows?.length) {
    blocks.push(divider());
    blocks.push(h(2, '5. PPE Requirements'));
    const ppeTable: TableBlock = {
      id: bid('tbl-ppe'),
      type: 'table',
      mode: 'static',
      columns: [
        { id: 'item', header: 'PPE Item',    cellType: 'text', width: 2 },
        { id: 'req',  header: 'Requirement', cellType: 'text', width: 3 },
      ],
      rows: d.ppeRows.map((pr: PpeRow) => ({
        id: bid('r'),
        cells: { item: safeText(pr.item), req: safeText(pr.requirement) },
      })),
      stripedRows: true,
    };
    blocks.push(ppeTable);
    blocks.push(spacer());
  }

  // ── Sequence of Work ──────────────────────────────────────────────────────
  blocks.push(divider());
  blocks.push(h(2, '6. Sequence of Work'));
  if (d.workSteps?.length) {
    const seqTable: TableBlock = {
      id: bid('tbl-seq'),
      type: 'table',
      mode: 'static',
      columns: [
        { id: 'seq',      header: '#',                  cellType: 'text', width: 1 },
        { id: 'work',     header: 'Work Step',          cellType: 'text', width: 3 },
        { id: 'hazard',   header: 'Hazards & Risks',    cellType: 'text', width: 2 },
        { id: 'conseq',   header: 'Possible Consequence', cellType: 'text', width: 2 },
        { id: 'initRisk', header: 'Initial Risk',       cellType: 'text', width: 1 },
        { id: 'controls', header: 'Control Measures',   cellType: 'text', width: 3 },
        { id: 'residual', header: 'Residual Risk',      cellType: 'text', width: 1 },
        { id: 'resp',     header: 'Responsible',        cellType: 'text', width: 1 },
      ],
      rows: d.workSteps.map((ws: WorkStep) => ({
        id: bid('r'),
        cells: {
          seq:      String(ws.sequenceNumber),
          work:     safeText(ws.sequenceOfWork),
          hazard:   safeText(ws.hazardsAndRisks),
          conseq:   safeText(ws.possibleConsequence),
          initRisk: riskLabel(ws.initialRisk),
          controls: safeText(ws.controlMeasures),
          residual: riskLabel(ws.residualRisk),
          resp:     safeText(ws.responsiblePerson),
        },
      })),
      stripedRows: true,
      headerBgColor: '#1e293b',
      headerTextColor: '#ffffff',
    };
    blocks.push(seqTable);
  } else {
    blocks.push(p('No work steps recorded.'));
  }
  blocks.push(spacer());

  // ── Environmental Controls ────────────────────────────────────────────────
  if (d.envControls?.length) {
    blocks.push(divider());
    blocks.push(h(2, '7. Environmental Controls'));
    const envTable: TableBlock = {
      id: bid('tbl-env'),
      type: 'table',
      mode: 'static',
      columns: [
        { id: 'type', header: 'Control Type',  cellType: 'text', width: 1 },
        { id: 'desc', header: 'Description',   cellType: 'text', width: 3 },
        { id: 'resp', header: 'Responsible',   cellType: 'text', width: 1 },
      ],
      rows: d.envControls.map((ec: EnvControl) => ({
        id: bid('r'),
        cells: { type: safeText(ec.type), desc: safeText(ec.description), resp: safeText(ec.responsiblePerson) },
      })),
      stripedRows: true,
    };
    blocks.push(envTable);
    blocks.push(spacer());
  }

  // ── Emergency Response ────────────────────────────────────────────────────
  blocks.push(divider());
  blocks.push(h(2, '8. Emergency & Incident Response'));
  blocks.push(banner('Emergency Response', 'In the event of an emergency, follow the actions below. Do not restart work until controls are reviewed.', 'danger'));
  if (d.emergencyActions?.length) {
    blocks.push(p(d.emergencyActions.map((ea: EmergencyAction, i) => `${i + 1}. ${safeText(ea.action)}`).join('\n')));
  }
  blocks.push(spacer());

  // ── Review Notice ─────────────────────────────────────────────────────────
  blocks.push(divider());
  blocks.push(banner(
    'Review Before Issue',
    'This document has been generated from the SWMS builder. Review all sections carefully before issuing to workers. Worker acknowledgement and sign-on are managed through Forms/Submissions.',
    'warning',
  ));

  return blocks;
}
