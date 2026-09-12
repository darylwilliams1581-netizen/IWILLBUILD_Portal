/**
 * POST /api/developer/seed-safety-documents
 *
 * Platform-owner only (requirePlatformOwner middleware in entry.ts).
 * Target account is HARDCODED — darylwilliams1581@gmail.com.
 * No email accepted from the request body.
 *
 * What this does:
 *   1. Inserts 40 deduplicated SWMS drafts into document_templates
 *      (template_type = 'swms', doc_status = 'draft')
 *   2. Inserts 4 safety plan drafts into document_templates
 *      (template_type = 'safety_plan', doc_status = 'draft')
 *   3. Inserts 16 form templates into form_templates + form_template_fields
 *      (skip-if-name-exists — preserves any already-edited templates)
 *
 * What this does NOT do:
 *   - Does NOT touch swms_templates
 *   - Does NOT touch cost_guide_items
 *   - Does NOT touch any other company's data
 *   - Does NOT insert into the global library
 *   - Does NOT delete any existing document_templates or form_templates
 *
 * Semantic duplicate mapping (OC content wins over flat content):
 *   Bricklaying                          → replaces flat: Bricklaying
 *   Building Inspection                  → replaces flat: Building Inspection
 *   Cabinets Installation                → replaces flat: Cabinet and Joinery Installation
 *   Carpenter Fixing                     → replaces flat: Carpenter — Second Fix (Fixing)
 *   Carpenter Framing                    → replaces flat: Carpenter — Framing
 *   Carpenter Lockup                     → replaces flat: Carpenter — Lockup
 *   Ceramic Tiling                       → replaces flat: Ceramic and Stone Tiling
 *   Concreting Slab                      → replaces flat: Concreting — Slab on Ground
 *   Elevated Work Platform (EWP)         → replaces flat: Elevated Work Platform (EWP) Operations
 *   Landscaping & Maintenance            → replaces flat: Landscaping and Grounds Maintenance
 *   Painting Internal / External         → replaces flat: Painting — Internal and External
 *   Use of Power Tools                   → replaces flat: Using Power Tools
 *
 * All blocks use only DocumentBuilder block types defined in
 * src/components/DocumentBuilder/types.ts.
 */

import type { Request, Response } from 'express';
import { db } from '../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getAuth } from '../../../../lib/auth/auth.js';
import { readFile } from 'fs/promises';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import type { ResultSetHeader } from 'mysql2';

// ── Constants ─────────────────────────────────────────────────────────────────

const TARGET_EMAIL = 'darylwilliams1581@gmail.com';

// OC title → flat title it semantically replaces (flat entry is suppressed)
const OC_REPLACES_FLAT: Record<string, string> = {
  'Bricklaying':                                  'Bricklaying',
  'Building Inspection':                          'Building Inspection',
  'Cabinets Installation':                        'Cabinet and Joinery Installation',
  'Carpenter Fixing':                             'Carpenter — Second Fix (Fixing)',
  'Carpenter Framing':                            'Carpenter — Framing',
  'Carpenter Lockup':                             'Carpenter — Lockup',
  'Ceramic Tiling':                               'Ceramic and Stone Tiling',
  'Concreting Slab':                              'Concreting — Slab on Ground',
  'Elevated Work Platform (EWP)':                 'Elevated Work Platform (EWP) Operations',
  'Landscaping & Maintenance':                    'Landscaping and Grounds Maintenance',
  'Painting Internal / External':                 'Painting — Internal and External',
  'Use of Power Tools':                           'Using Power Tools',
};

// ── Seed directory ────────────────────────────────────────────────────────────

function seedDir(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  return resolve(here, '..', '..', '..', 'seed', 'starter-packs', 'default');
}

async function loadJson<T>(filename: string): Promise<T> {
  const raw = await readFile(resolve(seedDir(), filename), 'utf-8');
  return JSON.parse(raw) as T;
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface FlatSwms {
  title: string;
  workActivity: string;
  hazards: string;
  risks: string;
  controls: string;
  ppe: string;
  plantEquipment: string;
  trainingCompetency: string;
  emergencyControls: string;
  environmentalControls: string;
  signOffRequirements: string;
  revisionNumber: string;
  status: string;
}

interface OcWorkStep {
  id: string;
  sequenceNumber?: number;
  sequenceOfWork: string;
  hazardsAndRisks: string;
  possibleConsequence?: string;
  initialRisk?: string;
  controlMeasures: string;
  residualRisk?: string;
  responsiblePerson?: string;
}

interface OcPpeRow {
  item: string;
  requirement: string;
}

interface OcPlantItem {
  id: string;
  item: string;
  requirement: string;
  inspectionRequired?: string;
  notes?: string;
}

interface OcCriticalControl {
  id: string;
  criticalRisk: string;
  possibleOutcome: string;
  mandatoryControls: string;
}

interface OcCompetencyRow {
  id: string;
  role: string;
  licenceOrCert: string;
  trainingRequired: string;
}

interface OcSwms {
  title: string;
  category?: string;
  revisionNumber?: string;
  reviewDate?: string;
  authorName?: string;
  approvedByName?: string;
  status?: string;
  purpose?: string;
  scope?: string;
  includedActivities?: string[];
  excludedActivities?: string[];
  criticalControls?: OcCriticalControl[];
  plantItems?: OcPlantItem[];
  ppeRows?: OcPpeRow[];
  workSteps?: OcWorkStep[];
  envControls?: string[];
  emergencyActions?: string[];
  competencyRows?: OcCompetencyRow[];
  definitions?: Array<{ term: string; definition: string }>;
  relatedDocs?: string[];
}

interface FieldDef {
  label: string;
  fieldType: string;
  required?: boolean;
  options?: string[];
}

interface FormTemplateDef {
  name: string;
  formType: string;
  category: string;
  description: string;
  onJobs: boolean;
  onFleet: boolean;
  onDashboard: boolean;
  fields: FieldDef[];
}

// ── Block helpers ─────────────────────────────────────────────────────────────

let _blockId = 1;
function bid(): string {
  return `b${String(_blockId++).padStart(4, '0')}`;
}

function headingBlock(content: string, level: 1 | 2 | 3 | 4 = 2): object {
  return { id: bid(), type: 'heading', content, level, align: 'left' };
}

function textBlock(content: string, bold = false): object {
  return { id: bid(), type: 'text', content, align: 'left', bold };
}

function dividerBlock(): object {
  return { id: bid(), type: 'divider', style: 'solid', thickness: 1 };
}

function spacerBlock(height = 8): object {
  return { id: bid(), type: 'spacer', height };
}

function bannerBlock(title: string, body: string, variant = 'safety'): object {
  return { id: bid(), type: 'banner', variant, title, body, size: 'compact', align: 'left', showOnExport: true };
}

// ── PPE → SafetyBadgeRow ──────────────────────────────────────────────────────

const PPE_BADGE_MAP: Record<string, string> = {
  'safety helmet': 'helmet',
  'hard hat': 'helmet',
  'helmet': 'helmet',
  'safety boots': 'footwear',
  'steel cap': 'footwear',
  'footwear': 'footwear',
  'safety glasses': 'eye_protection',
  'eye protection': 'eye_protection',
  'goggles': 'eye_protection',
  'gloves': 'gloves',
  'hi-vis': 'hi_vis',
  'hi vis': 'hi_vis',
  'high visibility': 'hi_vis',
  'hearing': 'hearing',
  'ear muffs': 'hearing',
  'ear plugs': 'hearing',
  'fall arrest': 'fall_arrest',
  'harness': 'fall_arrest',
  'electrical gloves': 'electrical_gloves',
};

function ppeItemToBadgeType(item: string): string {
  const lower = item.toLowerCase();
  for (const [key, val] of Object.entries(PPE_BADGE_MAP)) {
    if (lower.includes(key)) return val;
  }
  return 'ppe';
}

function ppeToBadgeRow(ppeRows: OcPpeRow[]): object {
  const badges = ppeRows.slice(0, 8).map((row) => ({
    id: bid(),
    badgeType: ppeItemToBadgeType(row.item),
    label: row.item,
    required: true,
  }));
  return { id: bid(), type: 'safety_badge_row', badges, size: 'md', align: 'left' };
}

function ppeTextToBadgeRow(ppeText: string): object {
  const items = ppeText
    .split(/[,;\n]+/)
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 8);
  const badges = items.map((item) => ({
    id: bid(),
    badgeType: ppeItemToBadgeType(item),
    label: item,
    required: true,
  }));
  return { id: bid(), type: 'safety_badge_row', badges, size: 'md', align: 'left' };
}

// ── Work steps → table block ──────────────────────────────────────────────────

function workStepsToTable(steps: OcWorkStep[]): object {
  const colStep   = bid();
  const colHazard = bid();
  const colCtrl   = bid();
  const colRisk   = bid();

  const columns = [
    { id: colStep,   header: 'Work Step',          cellType: 'text', width: 2 },
    { id: colHazard, header: 'Hazards & Risks',     cellType: 'text', width: 2 },
    { id: colCtrl,   header: 'Control Measures',    cellType: 'text', width: 3 },
    { id: colRisk,   header: 'Residual Risk',        cellType: 'text', width: 1 },
  ];

  const rows = steps.map((s) => ({
    id: bid(),
    cells: {
      [colStep]:   `${s.sequenceNumber ?? ''}. ${s.sequenceOfWork}`.trim(),
      [colHazard]: [s.hazardsAndRisks, s.possibleConsequence].filter(Boolean).join('\n'),
      [colCtrl]:   s.controlMeasures,
      [colRisk]:   s.residualRisk ?? '',
    },
  }));

  return {
    id: bid(),
    type: 'table',
    mode: 'static',
    columns,
    rows,
    headerBgColor: '#1e293b',
    headerTextColor: '#ffffff',
    stripedRows: true,
  };
}

// ── Critical controls → table ─────────────────────────────────────────────────

function criticalControlsToTable(controls: OcCriticalControl[]): object {
  const colRisk    = bid();
  const colOutcome = bid();
  const colCtrl    = bid();

  const columns = [
    { id: colRisk,    header: 'Critical Risk',       cellType: 'text', width: 2 },
    { id: colOutcome, header: 'Possible Outcome',    cellType: 'text', width: 2 },
    { id: colCtrl,    header: 'Mandatory Controls',  cellType: 'text', width: 3 },
  ];

  const rows = controls.map((c) => ({
    id: bid(),
    cells: {
      [colRisk]:    c.criticalRisk,
      [colOutcome]: c.possibleOutcome,
      [colCtrl]:    c.mandatoryControls,
    },
  }));

  return {
    id: bid(),
    type: 'table',
    mode: 'static',
    columns,
    rows,
    headerBgColor: '#7f1d1d',
    headerTextColor: '#ffffff',
    stripedRows: false,
  };
}

// ── Plant items → table ───────────────────────────────────────────────────────

function plantItemsToTable(items: OcPlantItem[]): object {
  const colItem    = bid();
  const colReq     = bid();
  const colInspect = bid();

  const columns = [
    { id: colItem,    header: 'Plant / Equipment',   cellType: 'text', width: 2 },
    { id: colReq,     header: 'Requirement',          cellType: 'text', width: 3 },
    { id: colInspect, header: 'Inspection Required',  cellType: 'text', width: 1 },
  ];

  const rows = items.map((p) => ({
    id: bid(),
    cells: {
      [colItem]:    p.item,
      [colReq]:     [p.requirement, p.notes].filter(Boolean).join(' — '),
      [colInspect]: p.inspectionRequired ?? '',
    },
  }));

  return {
    id: bid(),
    type: 'table',
    mode: 'static',
    columns,
    rows,
    headerBgColor: '#1e3a5f',
    headerTextColor: '#ffffff',
    stripedRows: true,
  };
}

// ── Competency rows → table ───────────────────────────────────────────────────

function competencyToTable(rows: OcCompetencyRow[]): object {
  const colRole    = bid();
  const colLicence = bid();
  const colTrain   = bid();

  const columns = [
    { id: colRole,    header: 'Role',                 cellType: 'text', width: 2 },
    { id: colLicence, header: 'Licence / Certificate', cellType: 'text', width: 2 },
    { id: colTrain,   header: 'Training Required',    cellType: 'text', width: 2 },
  ];

  const tableRows = rows.map((r) => ({
    id: bid(),
    cells: {
      [colRole]:    r.role,
      [colLicence]: r.licenceOrCert,
      [colTrain]:   r.trainingRequired,
    },
  }));

  return {
    id: bid(),
    type: 'table',
    mode: 'static',
    columns,
    rows: tableRows,
    headerBgColor: '#1e293b',
    headerTextColor: '#ffffff',
    stripedRows: true,
  };
}

// ── Flat SWMS → DocumentBuilder blocks ───────────────────────────────────────

function flatSwmsToBlocks(t: FlatSwms): object[] {
  const blocks: object[] = [];

  blocks.push(headingBlock(t.title, 1));
  blocks.push(spacerBlock(4));

  if (t.workActivity) {
    blocks.push(headingBlock('Scope of Work', 2));
    blocks.push(textBlock(t.workActivity));
    blocks.push(spacerBlock(4));
  }

  if (t.hazards || t.risks) {
    blocks.push(headingBlock('Hazards & Risks', 2));
    if (t.hazards) blocks.push(textBlock(t.hazards));
    if (t.risks && t.risks !== t.hazards) blocks.push(textBlock(t.risks));
    blocks.push(spacerBlock(4));
  }

  if (t.controls) {
    blocks.push(headingBlock('Control Measures', 2));
    blocks.push(textBlock(t.controls));
    blocks.push(spacerBlock(4));
  }

  if (t.ppe) {
    blocks.push(headingBlock('Personal Protective Equipment (PPE)', 2));
    blocks.push(ppeTextToBadgeRow(t.ppe));
    blocks.push(spacerBlock(4));
  }

  if (t.plantEquipment) {
    blocks.push(headingBlock('Plant & Equipment', 2));
    blocks.push(textBlock(t.plantEquipment));
    blocks.push(spacerBlock(4));
  }

  if (t.trainingCompetency) {
    blocks.push(headingBlock('Training & Competency', 2));
    blocks.push(textBlock(t.trainingCompetency));
    blocks.push(spacerBlock(4));
  }

  if (t.environmentalControls) {
    blocks.push(headingBlock('Environmental Controls', 2));
    blocks.push(textBlock(t.environmentalControls));
    blocks.push(spacerBlock(4));
  }

  if (t.emergencyControls) {
    blocks.push(headingBlock('Emergency Controls', 2));
    blocks.push(bannerBlock('Emergency Response', t.emergencyControls, 'emergency'));
    blocks.push(spacerBlock(4));
  }

  if (t.signOffRequirements) {
    blocks.push(dividerBlock());
    blocks.push(headingBlock('Sign-off Requirements', 2));
    blocks.push(textBlock(t.signOffRequirements));
  }

  return blocks;
}

// ── OC SWMS → DocumentBuilder blocks ─────────────────────────────────────────

function ocSwmsToBlocks(t: OcSwms): object[] {
  const blocks: object[] = [];

  blocks.push(headingBlock(t.title, 1));
  if (t.category) blocks.push(textBlock(`Category: ${t.category}`, true));
  blocks.push(spacerBlock(4));

  if (t.purpose) {
    blocks.push(headingBlock('Purpose', 2));
    blocks.push(textBlock(t.purpose));
    blocks.push(spacerBlock(4));
  }

  if (t.scope) {
    blocks.push(headingBlock('Scope', 2));
    blocks.push(textBlock(t.scope));
    blocks.push(spacerBlock(4));
  }

  if (t.includedActivities?.length) {
    blocks.push(headingBlock('Included Activities', 2));
    blocks.push(textBlock(t.includedActivities.join('\n')));
    blocks.push(spacerBlock(4));
  }

  if (t.ppeRows?.length) {
    blocks.push(headingBlock('Personal Protective Equipment (PPE)', 2));
    blocks.push(ppeToBadgeRow(t.ppeRows));
    blocks.push(spacerBlock(4));
  }

  if (t.criticalControls?.length) {
    blocks.push(headingBlock('Critical Controls', 2));
    blocks.push(bannerBlock(
      'Critical Risk Controls',
      'The following controls are mandatory and must be in place before work commences.',
      'danger',
    ));
    blocks.push(criticalControlsToTable(t.criticalControls));
    blocks.push(spacerBlock(4));
  }

  if (t.workSteps?.length) {
    blocks.push(headingBlock('Work Steps — Hazards & Controls', 2));
    blocks.push(workStepsToTable(t.workSteps));
    blocks.push(spacerBlock(4));
  }

  if (t.plantItems?.length) {
    blocks.push(headingBlock('Plant & Equipment', 2));
    blocks.push(plantItemsToTable(t.plantItems));
    blocks.push(spacerBlock(4));
  }

  if (t.competencyRows?.length) {
    blocks.push(headingBlock('Training & Competency Requirements', 2));
    blocks.push(competencyToTable(t.competencyRows));
    blocks.push(spacerBlock(4));
  }

  if (t.envControls?.length) {
    blocks.push(headingBlock('Environmental Controls', 2));
    blocks.push(textBlock(t.envControls.join('\n')));
    blocks.push(spacerBlock(4));
  }

  if (t.emergencyActions?.length) {
    blocks.push(headingBlock('Emergency Response', 2));
    blocks.push(bannerBlock(
      'Emergency Actions',
      t.emergencyActions.join('\n'),
      'emergency',
    ));
    blocks.push(spacerBlock(4));
  }

  if (t.definitions?.length) {
    blocks.push(dividerBlock());
    blocks.push(headingBlock('Definitions', 3));
    for (const d of t.definitions) {
      blocks.push(textBlock(`${d.term}: ${d.definition}`));
    }
    blocks.push(spacerBlock(4));
  }

  if (t.relatedDocs?.length) {
    blocks.push(headingBlock('Related Documents', 3));
    blocks.push(textBlock(t.relatedDocs.join('\n')));
    blocks.push(spacerBlock(4));
  }

  // Sign-on section
  blocks.push(dividerBlock());
  blocks.push(headingBlock('Worker Sign-on', 2));
  blocks.push(textBlock(
    'All workers must read, understand and sign onto this SWMS before commencing work. ' +
    'By signing, workers confirm they understand the hazards and controls described in this document.',
  ));

  return blocks;
}

// ── Safety plan blocks ────────────────────────────────────────────────────────

interface SafetyPlanDef {
  name: string;
  description: string;
  sections: Array<{ heading: string; body: string }>;
}

const SAFETY_PLANS: SafetyPlanDef[] = [
  {
    name: 'Site Safety Management Plan — Starter Template',
    description: 'A starter site safety management plan covering key WHS obligations for construction projects.',
    sections: [
      {
        heading: 'Purpose & Scope',
        body: 'This Site Safety Management Plan (SSMP) establishes the safety management framework for this project. It applies to all workers, subcontractors, visitors and others who may be affected by the work.',
      },
      {
        heading: 'Principal Contractor Responsibilities',
        body: 'The Principal Contractor is responsible for managing the work health and safety of all workers on site. This includes inductions, SWMS review, hazard identification, incident reporting and consultation with workers.',
      },
      {
        heading: 'Site Rules',
        body: 'All persons on site must:\n• Hold a valid White Card (Construction Induction)\n• Wear minimum PPE at all times (hard hat, safety boots, hi-vis vest)\n• Not attend site under the influence of alcohol or drugs\n• Report all hazards, near misses and incidents immediately\n• Follow all SWMS and safe work procedures',
      },
      {
        heading: 'Hazard Identification & Risk Management',
        body: 'Hazards must be identified before work commences. All high-risk construction work (HRCW) requires a SWMS. Risks are assessed using the hierarchy of controls: Eliminate → Substitute → Isolate → Engineer → Administrative → PPE.',
      },
      {
        heading: 'Emergency Procedures',
        body: 'In the event of an emergency:\n1. Call 000 immediately for life-threatening situations\n2. Notify the site supervisor\n3. Evacuate to the designated muster point\n4. Do not re-enter the site until cleared by emergency services\n5. Record all details and report to the relevant authority',
      },
      {
        heading: 'Incident Reporting',
        body: 'All incidents, injuries and near misses must be reported to the site supervisor immediately. Serious incidents must be notified to SafeWork (or equivalent state regulator) as required by law. Records must be retained for a minimum of 5 years.',
      },
    ],
  },
  {
    name: 'Construction Site Safety Management Plan',
    description: 'Comprehensive safety management plan for medium to large construction projects.',
    sections: [
      {
        heading: 'Project Overview',
        body: 'This Construction Site Safety Management Plan (CSSMP) documents the safety management system for this construction project. It must be read in conjunction with all applicable SWMS, Safe Work Procedures and legislative requirements.',
      },
      {
        heading: 'Legislative Framework',
        body: 'This plan is prepared in accordance with:\n• Work Health and Safety Act 2011 (Cth) and applicable state/territory WHS legislation\n• Work Health and Safety Regulation 2017\n• Code of Practice: Construction Work\n• Code of Practice: Managing the Work Environment and Facilities',
      },
      {
        heading: 'Roles & Responsibilities',
        body: 'Principal Contractor: Overall site safety management, SWMS review, inductions, consultation.\nSite Supervisor: Day-to-day safety oversight, toolbox talks, hazard management.\nSubcontractors: Comply with site rules, provide SWMS for HRCW, report hazards.\nWorkers: Follow safe work procedures, use PPE, report hazards and incidents.',
      },
      {
        heading: 'High Risk Construction Work',
        body: 'The following HRCW categories may apply to this project:\n• Work at heights > 2m\n• Excavation > 1.5m deep\n• Demolition of load-bearing structures\n• Work near energised electrical installations\n• Confined space entry\n• Use of explosives\n• Work on or near pressurised gas distribution mains\nA SWMS must be prepared for each applicable HRCW category before work commences.',
      },
      {
        heading: 'Subcontractor Management',
        body: 'All subcontractors must:\n• Be inducted before commencing work\n• Provide current SWMS for all HRCW\n• Maintain current insurance (public liability, workers compensation)\n• Comply with this CSSMP and all site rules\n• Attend toolbox talks as required',
      },
      {
        heading: 'WHS Consultation',
        body: 'Workers must be consulted on matters that affect their health and safety. Consultation mechanisms include:\n• Toolbox talks (minimum weekly)\n• Pre-start meetings\n• Safety committee meetings (if applicable)\n• Direct consultation with the site supervisor\nAll consultation must be documented.',
      },
    ],
  },
  {
    name: 'WHS & Environmental Management Plan — Civil Works',
    description: 'Integrated WHS and environmental management plan for civil construction and infrastructure projects.',
    sections: [
      {
        heading: 'Purpose',
        body: 'This WHS & Environmental Management Plan (WHEMP) establishes the framework for managing work health, safety and environmental risks on civil construction projects. It applies to all personnel, subcontractors and visitors.',
      },
      {
        heading: 'Environmental Obligations',
        body: 'All works must comply with applicable environmental legislation including:\n• Protection of the Environment Operations Act 1997 (NSW) or equivalent\n• Environmental Protection Act 1994 (QLD) or equivalent\n• Relevant development consent conditions and environmental approvals\nKey environmental risks include: sediment and erosion, dust, noise, contaminated materials, and protection of flora and fauna.',
      },
      {
        heading: 'Erosion & Sediment Control',
        body: 'Prior to earthworks commencing:\n• Install sediment fencing along all drainage lines and site boundaries\n• Establish stabilised site entry/exit points\n• Protect existing stormwater infrastructure\n• Implement dust suppression measures\n• Inspect controls after each rainfall event and maintain as required',
      },
      {
        heading: 'Contaminated Materials Management',
        body: 'If potentially contaminated material is encountered:\n• Stop work immediately\n• Notify the site supervisor and project manager\n• Do not disturb or spread the material\n• Engage a qualified environmental consultant to assess and advise\n• Document all findings and actions taken',
      },
      {
        heading: 'Noise & Vibration Management',
        body: 'Construction noise must comply with applicable EPA guidelines and development consent conditions. Standard construction hours apply unless otherwise approved. Vibration-sensitive structures must be monitored where required. Complaints must be recorded and responded to promptly.',
      },
      {
        heading: 'Emergency Environmental Response',
        body: 'In the event of a spill or environmental incident:\n1. Stop the source of the spill if safe to do so\n2. Contain the spill using available materials (absorbent, bunding)\n3. Notify the site supervisor immediately\n4. Do not allow spilled material to enter stormwater drains or waterways\n5. Report to the relevant environmental regulator if required\n6. Document the incident and corrective actions',
      },
    ],
  },
  {
    name: 'Subcontractor Safety Management Plan',
    description: 'Safety management plan template for subcontractors working under a principal contractor.',
    sections: [
      {
        heading: 'Purpose & Application',
        body: 'This Subcontractor Safety Management Plan (SSMP) documents the safety management obligations of the subcontractor when working on projects under a principal contractor. It must be read in conjunction with the principal contractor\'s site safety management plan.',
      },
      {
        heading: 'Subcontractor Obligations',
        body: 'As a subcontractor, we are responsible for:\n• Providing SWMS for all high-risk construction work\n• Ensuring all workers hold current White Cards and relevant licences\n• Maintaining current public liability and workers compensation insurance\n• Conducting pre-start safety checks on all plant and equipment\n• Reporting all hazards, incidents and near misses to the principal contractor',
      },
      {
        heading: 'Worker Induction',
        body: 'All workers must complete the principal contractor\'s site induction before commencing work. Workers must also complete our company induction covering:\n• Emergency procedures\n• Hazard reporting\n• PPE requirements\n• SWMS review and sign-on\n• Drug and alcohol policy',
      },
      {
        heading: 'SWMS Management',
        body: 'A Safe Work Method Statement (SWMS) must be prepared for all high-risk construction work. SWMS must be:\n• Prepared before work commences\n• Reviewed and signed by all workers before starting the relevant task\n• Reviewed when there is a change to the work or work environment\n• Retained for the duration of the project plus 2 years',
      },
      {
        heading: 'Plant & Equipment',
        body: 'All plant and equipment must be:\n• Registered and maintained in accordance with manufacturer requirements\n• Inspected before each use using a pre-start checklist\n• Operated only by competent, licenced persons\n• Tagged out of service if defects are identified\n• Covered by current plant registration (where applicable)',
      },
      {
        heading: 'Incident Reporting',
        body: 'All incidents must be reported to the principal contractor\'s site supervisor immediately. Serious incidents (notifiable incidents) must also be reported to the relevant state/territory WHS regulator. Our company incident register must be updated within 24 hours of any incident.',
      },
    ],
  },
];

function safetyPlanToBlocks(plan: SafetyPlanDef): object[] {
  const blocks: object[] = [];
  blocks.push(headingBlock(plan.name, 1));
  blocks.push(textBlock(plan.description));
  blocks.push(spacerBlock(8));

  for (const section of plan.sections) {
    blocks.push(headingBlock(section.heading, 2));
    blocks.push(textBlock(section.body));
    blocks.push(spacerBlock(6));
  }

  blocks.push(dividerBlock());
  blocks.push(headingBlock('Document Control', 3));
  blocks.push(textBlock('This document must be reviewed annually or when there is a change to the work, legislation, or site conditions.'));

  return blocks;
}

// ── builder_json wrapper ──────────────────────────────────────────────────────

function makeBuilderJson(blocks: object[]): string {
  return JSON.stringify({
    blocks,
    systemFields: [],
    sourceAttachments: [],
    appliedWidgets: [],
  });
}

// ── Insert one document_template ──────────────────────────────────────────────

async function insertDocTemplate(
  companyId: number,
  name: string,
  templateType: string,
  blocks: object[],
): Promise<number> {
  const builderJson = makeBuilderJson(blocks);
  const pageLayoutJson = JSON.stringify({});
  const themeJson = JSON.stringify({});

  const [result] = await db.execute(sql.raw(
    `INSERT INTO document_templates
       (company_id, name, template_type, builder_json, page_layout_json, theme_json,
        doc_status, is_active, doc_kind)
     VALUES (
       ${companyId},
       ${JSON.stringify(name)},
       ${JSON.stringify(templateType)},
       ${JSON.stringify(builderJson)},
       ${JSON.stringify(pageLayoutJson)},
       ${JSON.stringify(themeJson)},
       'draft',
       1,
       'doc'
     )`
  )) as unknown as [ResultSetHeader, unknown];

  return result.insertId;
}

// ── Seed SWMS into document_templates ────────────────────────────────────────

async function seedSwmsDocuments(companyId: number): Promise<{
  inserted: string[];
  skipped: string[];
  errors: string[];
}> {
  const inserted: string[] = [];
  const skipped: string[] = [];
  const errors: string[] = [];

  // Load seed files
  const [s1, s2, ocData] = await Promise.all([
    loadJson<{ swms: FlatSwms[] }>('safety.json'),
    loadJson<{ swms: FlatSwms[] }>('safety-extended.json'),
    loadJson<{ swms: OcSwms[] }>('swms-oc.json'),
  ]);

  // Build flat map (extended overrides original by title)
  const flatMap = new Map<string, FlatSwms>();
  for (const t of [...s1.swms, ...s2.swms]) flatMap.set(t.title, t);

  // Flat titles suppressed by OC equivalents
  const suppressedFlatTitles = new Set(Object.values(OC_REPLACES_FLAT));

  // Fetch existing document_template names for this company to skip duplicates
  const [existingRows] = await db.execute(
    sql.raw(`SELECT name FROM document_templates WHERE company_id = ${companyId} AND template_type = 'swms'`)
  ) as unknown as [Array<{ name: string }>, unknown];
  const existingNames = new Set(existingRows.map((r) => r.name));

  // Reset block ID counter for deterministic IDs
  _blockId = 1;

  // 1. Insert flat SWMS that are NOT suppressed by OC equivalents
  for (const [title, t] of flatMap) {
    if (suppressedFlatTitles.has(title)) continue;
    if (existingNames.has(title)) { skipped.push(`[flat] ${title} (already exists)`); continue; }
    try {
      const blocks = flatSwmsToBlocks(t);
      await insertDocTemplate(companyId, title, 'swms', blocks);
      inserted.push(`[flat] ${title}`);
    } catch (e) {
      errors.push(`[flat] ${title}: ${String(e).slice(0, 120)}`);
    }
  }

  // 2. Insert OC SWMS (richer content — replaces flat equivalents)
  for (const t of ocData.swms) {
    if (existingNames.has(t.title)) { skipped.push(`[oc] ${t.title} (already exists)`); continue; }
    try {
      const blocks = ocSwmsToBlocks(t);
      await insertDocTemplate(companyId, t.title, 'swms', blocks);
      const replaces = OC_REPLACES_FLAT[t.title];
      inserted.push(`[oc] ${t.title}${replaces ? ` (replaces flat: ${replaces})` : ''}`);
    } catch (e) {
      errors.push(`[oc] ${t.title}: ${String(e).slice(0, 120)}`);
    }
  }

  return { inserted, skipped, errors };
}

// ── Seed safety plans into document_templates ─────────────────────────────────

async function seedSafetyPlans(companyId: number): Promise<{
  inserted: string[];
  skipped: string[];
  errors: string[];
}> {
  const inserted: string[] = [];
  const skipped: string[] = [];
  const errors: string[] = [];

  const [existingRows] = await db.execute(
    sql.raw(`SELECT name FROM document_templates WHERE company_id = ${companyId} AND template_type = 'safety_plan'`)
  ) as unknown as [Array<{ name: string }>, unknown];
  const existingNames = new Set(existingRows.map((r) => r.name));

  for (const plan of SAFETY_PLANS) {
    if (existingNames.has(plan.name)) { skipped.push(plan.name + ' (already exists)'); continue; }
    try {
      const blocks = safetyPlanToBlocks(plan);
      await insertDocTemplate(companyId, plan.name, 'safety_plan', blocks);
      inserted.push(plan.name);
    } catch (e) {
      errors.push(`${plan.name}: ${String(e).slice(0, 120)}`);
    }
  }

  return { inserted, skipped, errors };
}

// ── Seed form templates ───────────────────────────────────────────────────────

async function seedFormTemplates(companyId: number): Promise<{
  inserted: string[];
  skipped: string[];
  errors: string[];
}> {
  const inserted: string[] = [];
  const skipped: string[] = [];
  const errors: string[] = [];

  const [f1, f2] = await Promise.all([
    loadJson<FormTemplateDef[]>('forms.json'),
    loadJson<FormTemplateDef[]>('forms-extended.json'),
  ]);

  const allForms = new Map<string, FormTemplateDef>();
  for (const f of [...f1, ...f2]) allForms.set(f.name, f);

  // Fetch existing form template names for this company
  const [existingRows] = await db.execute(
    sql.raw(`SELECT name FROM form_templates WHERE company_id = ${companyId}`)
  ) as unknown as [Array<{ name: string }>, unknown];
  const existingNames = new Set(existingRows.map((r) => r.name));

  for (const [, t] of allForms) {
    if (existingNames.has(t.name)) { skipped.push(t.name + ' (already exists)'); continue; }
    try {
      const s = (v: string) => v.replace(/'/g, "''");
      const [result] = await db.execute(sql.raw(
        `INSERT INTO form_templates
           (company_id, name, form_type, category, description, is_active, on_jobs, on_fleet, on_dashboard)
         VALUES (
           ${companyId},
           '${s(t.name)}',
           '${s(t.formType)}',
           '${s(t.category)}',
           '${s(t.description)}',
           1,
           ${t.onJobs ? 1 : 0},
           ${t.onFleet ? 1 : 0},
           ${t.onDashboard ? 1 : 0}
         )`
      )) as unknown as [ResultSetHeader, unknown];

      const templateId = result.insertId;

      if (t.fields.length > 0) {
        const fieldValues = t.fields.map((f, i) => {
          const optJson = f.options
            ? `'${JSON.stringify(f.options).replace(/'/g, "''")}'`
            : 'NULL';
          return `(${templateId}, ${companyId}, '${s(f.label)}', '${s(f.fieldType)}', ${f.required ? 1 : 0}, ${optJson}, ${i})`;
        }).join(',');

        await db.execute(sql.raw(
          `INSERT INTO form_template_fields
             (template_id, company_id, label, field_type, required, options_json, field_order)
           VALUES ${fieldValues}`
        ));
      }

      inserted.push(t.name);
    } catch (e) {
      errors.push(`${t.name}: ${String(e).slice(0, 120)}`);
    }
  }

  return { inserted, skipped, errors };
}

// ── Main handler ──────────────────────────────────────────────────────────────

export default async function handler(req: Request, res: Response) {
  try {
    // Auth — session must exist (requirePlatformOwner middleware handles role check)
    const auth = getAuth();
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) {
      if (v) headers.set(k, Array.isArray(v) ? v[0] : v);
    }
    const session = await auth.api.getSession({ headers });
    if (!session?.user) return res.status(401).json({ error: 'Unauthorised' });

    // Target is hardcoded — no email accepted from request body
    const [userRows] = await db.execute(sql.raw(
      `SELECT u.id AS userId, p.company_id AS companyId, c.name AS companyName
       FROM user u
       JOIN profiles p ON p.user_id = u.id
       JOIN companies c ON c.id = p.company_id
       WHERE u.email = ${JSON.stringify(TARGET_EMAIL)}
       LIMIT 1`
    )) as unknown as [Array<{ userId: string; companyId: number; companyName: string }>, unknown];

    if (!userRows?.[0]) {
      return res.status(404).json({ error: `Target account not found: ${TARGET_EMAIL}` });
    }

    const { companyId, companyName } = userRows[0];
    console.log(`[seed-safety-documents] Seeding company ${companyId} (${companyName})`);

    // Run all three sections sequentially (block IDs must be deterministic)
    const swmsResult  = await seedSwmsDocuments(companyId);
    const plansResult = await seedSafetyPlans(companyId);
    const formsResult = await seedFormTemplates(companyId);

    const allErrors = [...swmsResult.errors, ...plansResult.errors, ...formsResult.errors];
    const totalInserted = swmsResult.inserted.length + plansResult.inserted.length + formsResult.inserted.length;
    const totalSkipped  = swmsResult.skipped.length  + plansResult.skipped.length  + formsResult.skipped.length;

    console.log(
      `[seed-safety-documents] Done — ` +
      `SWMS docs: ${swmsResult.inserted.length} inserted / ${swmsResult.skipped.length} skipped, ` +
      `Safety plans: ${plansResult.inserted.length} inserted / ${plansResult.skipped.length} skipped, ` +
      `Forms: ${formsResult.inserted.length} inserted / ${formsResult.skipped.length} skipped, ` +
      `Errors: ${allErrors.length}`
    );

    return res.json({
      ok: allErrors.length === 0,
      targetEmail: TARGET_EMAIL,
      companyId,
      companyName,
      destination: {
        swms:        'document_templates (template_type=swms, doc_status=draft)',
        safetyPlans: 'document_templates (template_type=safety_plan, doc_status=draft)',
        forms:       'form_templates + form_template_fields',
      },
      results: {
        swmsDocuments: {
          inserted: swmsResult.inserted.length,
          skipped:  swmsResult.skipped.length,
          errors:   swmsResult.errors,
          titles:   swmsResult.inserted,
          skippedTitles: swmsResult.skipped,
        },
        safetyPlans: {
          inserted: plansResult.inserted.length,
          skipped:  plansResult.skipped.length,
          errors:   plansResult.errors,
          titles:   plansResult.inserted,
          skippedTitles: plansResult.skipped,
        },
        formTemplates: {
          inserted: formsResult.inserted.length,
          skipped:  formsResult.skipped.length,
          errors:   formsResult.errors,
          titles:   formsResult.inserted,
          skippedTitles: formsResult.skipped,
        },
      },
      summary: {
        totalInserted,
        totalSkipped,
        totalErrors: allErrors.length,
      },
      errors: allErrors,
      message: allErrors.length === 0
        ? `Seeded ${swmsResult.inserted.length} SWMS + ${plansResult.inserted.length} safety plans into document_templates, ` +
          `${formsResult.inserted.length} forms into form_templates for ${companyName}. ` +
          `${totalSkipped} skipped (already existed).`
        : `Seeding completed with ${allErrors.length} error(s). Check results.errors for details.`,
    });

  } catch (err) {
    console.error('[seed-safety-documents] Fatal:', err);
    return res.status(500).json({ error: 'Seed failed', detail: String(err) });
  }
}
