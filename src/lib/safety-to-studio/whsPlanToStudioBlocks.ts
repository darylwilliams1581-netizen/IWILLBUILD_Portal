/**
 * whsPlanToStudioBlocks
 * ─────────────────────────────────────────────────────────────────────────────
 * Converts a completed WHS_PlanData into an array of DocumentBlock objects
 * suitable for creating a Studio document.
 *
 * Rules:
 * - No live Yes/No fields, submission controls, or sign-on controls.
 * - Worker acknowledgement and signatures remain in Forms/Submissions.
 * - Covers all 21 sections of the WHS Plan builder.
 */

import type { DocumentBlock, HeadingBlock, TextBlock, TableBlock, BannerBlock, DividerBlock, SpacerBlock } from '@/components/DocumentBuilder/types';
import type { WHS_PlanData, WHS_Contact, WHS_HazardRow, WHS_ConsultationRow, WHS_EnvControlRow, WHS_AppendixRow, WHS_RevisionRow } from '@/components/safety/safety-types';

// ── ID generator ──────────────────────────────────────────────────────────────
let _seq = 0;
function bid(prefix: string): string {
  _seq++;
  return `whs-gen-${prefix}-${_seq}`;
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
function yesNo(v: boolean | undefined): string {
  return v ? 'Yes' : 'No';
}
function infoTable(rows: Array<[string, string]>): TableBlock {
  return {
    id: bid('tbl'),
    type: 'table',
    mode: 'static',
    columns: [
      { id: 'field', header: 'Field', cellType: 'text', width: 1 },
      { id: 'value', header: 'Value', cellType: 'text', width: 2 },
    ],
    rows: rows.map(([field, value]) => ({ id: bid('r'), cells: { field, value: safeText(value) || '—' } })),
    stripedRows: true,
  };
}

// ── Main converter ────────────────────────────────────────────────────────────
export function whsPlanToStudioBlocks(d: WHS_PlanData, planTitle: string): DocumentBlock[] {
  _seq = 0;
  const blocks: DocumentBlock[] = [];

  // ── Cover / Identity ──────────────────────────────────────────────────────
  blocks.push(h(1, safeText(planTitle) || 'WHS Management Plan'));
  blocks.push(p(safeText(d.planType) || 'WHS Management Plan', true));
  blocks.push(spacer(4));
  blocks.push(infoTable([
    ['Plan Number',    d.planNumber],
    ['Revision',       d.revisionNumber],
    ['Status',         d.status],
    ['Date Prepared',  d.datePrepared],
    ['Review Date',    d.reviewDate],
    ['Prepared By',    d.preparedBy],
    ['Reviewed By',    d.reviewedBy],
    ['Approved By',    d.approvedBy],
  ]));
  blocks.push(spacer());

  // ── Revision History ──────────────────────────────────────────────────────
  if (d.revisionHistory?.length) {
    blocks.push(divider());
    blocks.push(h(2, 'Revision History'));
    const revTable: TableBlock = {
      id: bid('tbl-rev'),
      type: 'table',
      mode: 'static',
      columns: [
        { id: 'rev',  header: 'Rev',         cellType: 'text', width: 1 },
        { id: 'date', header: 'Date',         cellType: 'text', width: 1 },
        { id: 'desc', header: 'Description',  cellType: 'text', width: 3 },
        { id: 'prep', header: 'Prepared By',  cellType: 'text', width: 1 },
        { id: 'appr', header: 'Approved By',  cellType: 'text', width: 1 },
      ],
      rows: d.revisionHistory.map((r: WHS_RevisionRow) => ({
        id: bid('r'),
        cells: { rev: safeText(r.revision), date: safeText(r.date), desc: safeText(r.description), prep: safeText(r.preparedBy), appr: safeText(r.approvedBy) },
      })),
      stripedRows: true,
    };
    blocks.push(revTable);
    blocks.push(spacer());
  }

  // ── Section 1: Project Information ───────────────────────────────────────
  blocks.push(divider());
  blocks.push(h(2, '1. Project Information'));
  blocks.push(infoTable([
    ['Project Name',        d.projectName],
    ['Project Number',      d.projectNumber],
    ['Site Address',        d.siteAddress],
    ['Client',              d.clientName],
    ['Builder / Contractor',d.builderContractor],
    ['QBCC Licence',        d.qbccLicenceNumber],
    ['Start Date',          d.startDate],
    ['Expected Completion', d.expectedCompletion],
    ['Working Hours',       d.normalWorkingHours],
    ['Project Value',       d.projectValue],
    ['Principal Contractor',d.principalContractorName],
  ]));
  if (d.projectDescription) { blocks.push(p('Project Description', true)); blocks.push(p(safeText(d.projectDescription))); }
  if (d.scopeOfWorks)       { blocks.push(p('Scope of Works', true)); blocks.push(p(safeText(d.scopeOfWorks))); }
  blocks.push(spacer());

  // ── Section 2: Contacts & Responsibilities ────────────────────────────────
  if (d.contacts?.length) {
    blocks.push(divider());
    blocks.push(h(2, '2. Contacts & Responsibilities'));
    const contactTable: TableBlock = {
      id: bid('tbl-contacts'),
      type: 'table',
      mode: 'static',
      columns: [
        { id: 'role',  header: 'Role',            cellType: 'text', width: 2 },
        { id: 'name',  header: 'Name',            cellType: 'text', width: 2 },
        { id: 'co',    header: 'Company',         cellType: 'text', width: 2 },
        { id: 'phone', header: 'Phone',           cellType: 'text', width: 1 },
        { id: 'resp',  header: 'Responsibilities',cellType: 'text', width: 3 },
      ],
      rows: d.contacts.map((c: WHS_Contact) => ({
        id: bid('r'),
        cells: { role: safeText(c.role), name: safeText(c.name), co: safeText(c.company), phone: safeText(c.phone), resp: safeText(c.responsibilities) },
      })),
      stripedRows: true,
    };
    blocks.push(contactTable);
    blocks.push(spacer());
  }

  // ── Section 3: Emergency Arrangements ────────────────────────────────────
  blocks.push(divider());
  blocks.push(h(2, '3. Emergency Arrangements'));
  blocks.push(banner('Emergency Response', 'In the event of an emergency, follow the procedures below. Call 000 for life-threatening emergencies.', 'danger'));
  blocks.push(infoTable([
    ['Emergency Services',      d.emergencyServicesNumber || '000'],
    ['Site Address',            d.siteAddressForEmergency],
    ['GPS Location',            d.gpsLocation],
    ['Assembly Point',          d.assemblyPointDescription],
    ['Alarm Method',            d.alarmMethod],
    ['First Aid Kit Location',  d.firstAidKitLocation],
    ['AED Location',            d.aedLocation],
    ['Nearest Hospital',        d.nearestHospital],
    ['Hospital Address',        d.hospitalAddress],
    ['Hospital Phone',          d.hospitalPhone],
    ['Travel Time',             d.estimatedTravelTime],
  ]));
  if (d.evacuationProcedure) { blocks.push(p('Evacuation Procedure', true)); blocks.push(p(safeText(d.evacuationProcedure))); }
  blocks.push(spacer());

  // ── Section 4: Site Rules & Induction ────────────────────────────────────
  blocks.push(divider());
  blocks.push(h(2, '4. Site Rules & Induction'));
  if (d.selectedSiteRules?.length) {
    blocks.push(p('Site Rules', true));
    blocks.push(p(d.selectedSiteRules.map(r => `• ${r}`).join('\n')));
  }
  if (d.additionalSiteRules) { blocks.push(p('Additional Rules', true)); blocks.push(p(safeText(d.additionalSiteRules))); }
  if (d.selectedInductionTypes?.length) {
    blocks.push(p('Induction Requirements', true));
    blocks.push(p(d.selectedInductionTypes.map(i => `• ${i}`).join('\n')));
  }
  blocks.push(spacer());

  // ── Section 5: High-Risk Construction Work ────────────────────────────────
  blocks.push(divider());
  blocks.push(h(2, '5. High-Risk Construction Work'));
  if (d.selectedHRCW?.length) {
    const hrcwTable: TableBlock = {
      id: bid('tbl-hrcw'),
      type: 'table',
      mode: 'static',
      columns: [
        { id: 'activity',    header: 'HRCW Activity',      cellType: 'text', width: 3 },
        { id: 'swms',        header: 'Linked SWMS',        cellType: 'text', width: 2 },
        { id: 'contractor',  header: 'Responsible',        cellType: 'text', width: 2 },
        { id: 'permit',      header: 'Permit Required',    cellType: 'text', width: 1 },
        { id: 'status',      header: 'Status',             cellType: 'text', width: 1 },
      ],
      rows: d.selectedHRCW.map(activity => {
        const det = d.hrcwDetails?.[activity];
        return {
          id: bid('r'),
          cells: {
            activity,
            swms:       safeText(det?.linkedSwms) || '—',
            contractor: safeText(det?.responsibleContractor) || '—',
            permit:     det?.permitRequired ? 'Yes' : 'No',
            status:     safeText(det?.status) || '—',
          },
        };
      }),
      stripedRows: true,
      headerBgColor: '#7c3aed',
      headerTextColor: '#ffffff',
    };
    blocks.push(hrcwTable);
  } else {
    blocks.push(p('No High-Risk Construction Work activities identified.'));
  }
  blocks.push(spacer());

  // ── Section 6: Hazard Register ────────────────────────────────────────────
  if (d.hazardRegister?.length) {
    blocks.push(divider());
    blocks.push(h(2, '6. Hazard Register'));
    const hazTable: TableBlock = {
      id: bid('tbl-haz'),
      type: 'table',
      mode: 'static',
      columns: [
        { id: 'hazard',   header: 'Hazard',            cellType: 'text', width: 2 },
        { id: 'location', header: 'Location',          cellType: 'text', width: 1 },
        { id: 'people',   header: 'People Exposed',    cellType: 'text', width: 1 },
        { id: 'initRisk', header: 'Initial Risk',      cellType: 'text', width: 1 },
        { id: 'controls', header: 'Controls',          cellType: 'text', width: 3 },
        { id: 'resp',     header: 'Responsible',       cellType: 'text', width: 1 },
        { id: 'residual', header: 'Residual Risk',     cellType: 'text', width: 1 },
        { id: 'status',   header: 'Status',            cellType: 'text', width: 1 },
      ],
      rows: d.hazardRegister.map((row: WHS_HazardRow) => ({
        id: bid('r'),
        cells: {
          hazard:   safeText(row.hazard),
          location: safeText(row.location),
          people:   safeText(row.peopleExposed),
          initRisk: safeText(row.initialRisk),
          controls: safeText(row.controls),
          resp:     safeText(row.responsiblePerson),
          residual: safeText(row.residualRisk),
          status:   safeText(row.status),
        },
      })),
      stripedRows: true,
      headerBgColor: '#1e293b',
      headerTextColor: '#ffffff',
    };
    blocks.push(hazTable);
    blocks.push(spacer());
  }

  // ── Section 7: Consultation ───────────────────────────────────────────────
  if (d.consultationActivities?.length) {
    blocks.push(divider());
    blocks.push(h(2, '7. Consultation'));
    const consTable: TableBlock = {
      id: bid('tbl-cons'),
      type: 'table',
      mode: 'static',
      columns: [
        { id: 'activity', header: 'Activity',          cellType: 'text', width: 2 },
        { id: 'freq',     header: 'Frequency',         cellType: 'text', width: 1 },
        { id: 'parts',    header: 'Participants',      cellType: 'text', width: 2 },
        { id: 'resp',     header: 'Responsible',       cellType: 'text', width: 1 },
        { id: 'record',   header: 'Record Generated',  cellType: 'text', width: 1 },
      ],
      rows: d.consultationActivities.map((c: WHS_ConsultationRow) => ({
        id: bid('r'),
        cells: { activity: safeText(c.activity), freq: safeText(c.frequency), parts: safeText(c.participants), resp: safeText(c.responsiblePerson), record: safeText(c.recordGenerated) },
      })),
      stripedRows: true,
    };
    blocks.push(consTable);
    blocks.push(spacer());
  }

  // ── Section 8: Plant & Equipment ─────────────────────────────────────────
  blocks.push(divider());
  blocks.push(h(2, '8. Plant & Equipment'));
  blocks.push(infoTable([
    ['Plant Register Required',        yesNo(d.plantRegisterRequired)],
    ['Pre-Start Inspections Required', yesNo(d.preStartInspectionsRequired)],
    ['Operator Competency Verified',   yesNo(d.operatorCompetencyVerified)],
    ['VOC Required',                   yesNo(d.vocRequired)],
    ['Spotters Required',              yesNo(d.spottersRequired)],
    ['Lifting Equipment Register',     yesNo(d.liftingEquipmentRegister)],
  ]));
  if (d.plantIsolationProcedure) { blocks.push(p('Isolation Procedure', true)); blocks.push(p(safeText(d.plantIsolationProcedure))); }
  blocks.push(spacer());

  // ── Section 9: Electrical Safety ─────────────────────────────────────────
  blocks.push(divider());
  blocks.push(h(2, '9. Electrical Safety'));
  blocks.push(infoTable([
    ['Temporary Switchboard',           yesNo(d.temporarySwitchboard)],
    ['RCD Protection',                  yesNo(d.rcdProtection)],
    ['Electrical Inspection/Testing',   d.electricalInspectionTesting],
    ['Overhead Electrical Services',    d.overheadElectricalServices],
    ['Underground Electrical Services', d.undergroundElectricalServices],
    ['Safety Observer Required',        yesNo(d.safetyObserverRequired)],
    ['Electrical Permit Required',      yesNo(d.electricalPermitRequired)],
  ]));
  blocks.push(spacer());

  // ── Section 10: Traffic & Access ──────────────────────────────────────────
  blocks.push(divider());
  blocks.push(h(2, '10. Traffic & Access'));
  blocks.push(infoTable([
    ['Site Speed Limit',                d.siteSpeedLimit],
    ['Vehicle Entry',                   d.vehicleEntry],
    ['Vehicle Exit',                    d.vehicleExit],
    ['Delivery Area',                   d.deliveryArea],
    ['Pedestrian Route',                d.pedestrianRoute],
    ['Traffic Management Plan Required',yesNo(d.trafficManagementPlanRequired)],
    ['Public Road Affected',            yesNo(d.publicRoadAffected)],
    ['Footpath Affected',               yesNo(d.footpathAffected)],
  ]));
  blocks.push(spacer());

  // ── Section 11: Hazardous Materials ──────────────────────────────────────
  blocks.push(divider());
  blocks.push(h(2, '11. Hazardous Materials'));
  if (d.selectedHazMat?.length) {
    blocks.push(p('Identified Hazardous Materials', true));
    blocks.push(p(d.selectedHazMat.map(m => `• ${m}`).join('\n')));
  }
  blocks.push(infoTable([
    ['Chemical Register',          yesNo(d.chemicalRegister)],
    ['SDS Register',               yesNo(d.sdsRegister)],
    ['Storage Location',           d.storageLocation],
    ['Health Monitoring Required', yesNo(d.healthMonitoringRequired)],
    ['Respiratory Protection',     yesNo(d.respiratoryProtectionRequired)],
    ['Waste Disposal Method',      d.wasteDisposalMethod],
    ['Responsible Person',         d.hazMatResponsiblePerson],
  ]));
  blocks.push(spacer());

  // ── Section 12: Environmental Controls ───────────────────────────────────
  if (d.envControlDetails?.length) {
    blocks.push(divider());
    blocks.push(h(2, '12. Environmental Controls'));
    const envTable: TableBlock = {
      id: bid('tbl-env'),
      type: 'table',
      mode: 'static',
      columns: [
        { id: 'item',    header: 'Control Item',        cellType: 'text', width: 2 },
        { id: 'measure', header: 'Control Measures',    cellType: 'text', width: 3 },
        { id: 'freq',    header: 'Inspection Frequency',cellType: 'text', width: 1 },
        { id: 'resp',    header: 'Responsible',         cellType: 'text', width: 1 },
      ],
      rows: d.envControlDetails.map((e: WHS_EnvControlRow) => ({
        id: bid('r'),
        cells: { item: safeText(e.item), measure: safeText(e.controlMeasures), freq: safeText(e.inspectionFrequency), resp: safeText(e.responsiblePerson) },
      })),
      stripedRows: true,
    };
    blocks.push(envTable);
    blocks.push(spacer());
  }

  // ── Section 13: Incident Reporting ───────────────────────────────────────
  blocks.push(divider());
  blocks.push(h(2, '13. Incident Reporting & Investigation'));
  blocks.push(infoTable([
    ['Reporting Method',                d.incidentReportingMethod],
    ['Immediate Notification Contact',  d.immediateNotificationContact],
    ['PC Notification Contact',         d.pcNotificationContact],
    ['Investigation Responsibility',    d.incidentInvestigationResponsibility],
    ['Notifiable Incident Responsibility', d.notifiableIncidentResponsibility],
    ['Corrective Action Register',      yesNo(d.correctiveActionRegisterRequired)],
  ]));
  blocks.push(spacer());

  // ── Section 14: Appendices ────────────────────────────────────────────────
  if (d.appendices?.length) {
    blocks.push(divider());
    blocks.push(h(2, '14. Appendices'));
    const appTable: TableBlock = {
      id: bid('tbl-app'),
      type: 'table',
      mode: 'static',
      columns: [
        { id: 'label',    header: 'Appendix',  cellType: 'text', width: 1 },
        { id: 'title',    header: 'Title',     cellType: 'text', width: 3 },
        { id: 'attached', header: 'Attached',  cellType: 'text', width: 1 },
      ],
      rows: d.appendices.map((a: WHS_AppendixRow) => ({
        id: bid('r'),
        cells: { label: safeText(a.label), title: safeText(a.title), attached: a.attached ? 'Yes' : 'No' },
      })),
      stripedRows: true,
    };
    blocks.push(appTable);
    blocks.push(spacer());
  }

  // ── Review Notice ─────────────────────────────────────────────────────────
  blocks.push(divider());
  blocks.push(banner(
    'Review Before Issue',
    'This document has been generated from the WHS Plan builder. Review all sections carefully before issuing. Worker acknowledgement and sign-on are managed through Forms/Submissions.',
    'warning',
  ));

  return blocks;
}
