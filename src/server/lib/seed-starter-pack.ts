/**
 * seedStarterPack — Company Starter Pack Auto-Load
 * ─────────────────────────────────────────────────────────────────────────────
 * Seeds a brand-new company with ready-to-use starter content so the portal
 * is never empty on first login.
 *
 * RULES:
 *  - Company-scoped: every INSERT uses the target companyId.
 *  - Once-only guard: checks companies.starter_pack_loaded before running.
 *  - Idempotent: each section skips rows that already exist (by name/title).
 *  - Never copies data from another company.
 *  - No destructive operations.
 *  - Safe to call fire-and-forget (errors are caught and logged, not thrown).
 *
 * SECTIONS:
 *  1. Test project
 *  2. Default stakeholders (customers)
 *  3. Form templates (8 starter templates with fields)
 *  4. Safety SWMS library (3 starter templates)
 *  5. Safety plan template
 *  6. Cost guide items (starter rows)
 *  7. Starter fleet asset
 */

import { db } from '../db/client.js';
import { sql } from 'drizzle-orm';
import type { ResultSetHeader } from 'mysql2';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SeedResult {
  ok: boolean;
  companyId: number;
  sections: Record<string, string>;
  errors: string[];
  alreadyLoaded: boolean;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

// Parameterised existence check
async function exists(table: string, companyId: number, nameCol: string, name: string): Promise<boolean> {
  const [rows] = await db.execute(
    sql`SELECT id FROM ${sql.raw('`' + table + '`')} WHERE company_id = ${companyId} AND ${sql.raw('`' + nameCol + '`')} = ${name} LIMIT 1`
  ) as unknown as [Array<{ id: number }>, unknown];
  return rows.length > 0;
}

// ── Section 1: Test Project ───────────────────────────────────────────────────

async function seedProject(companyId: number): Promise<string> {
  const already = await exists('jobs', companyId, 'job_number', 'TEST-001');
  if (already) return 'skipped (already exists)';

  await db.execute(sql`
    INSERT INTO jobs (company_id, job_number, name, client, address, status, notes)
    VALUES (
      ${companyId},
      'TEST-001',
      'Test Project',
      'Test Client',
      'Test Site Address',
      'Active',
      'This is a sample project to help you test IWILLBUILD. You can delete it when ready.'
    )
  `);
  return 'created';
}

// ── Section 2: Default Stakeholders (customers table) ────────────────────────

async function seedStakeholders(companyId: number): Promise<string> {
  const stakeholders = [
    { name: 'Test Client',        type: 'Customer' },
    { name: 'Test Subcontractor', type: 'Subcontractor' },
  ];

  let created = 0;
  let skipped = 0;

  for (const s of stakeholders) {
    const already = await exists('customers', companyId, 'name', s.name);
    if (already) { skipped++; continue; }

    await db.execute(sql`
      INSERT INTO customers (company_id, name, type)
      VALUES (${companyId}, ${s.name}, ${s.type})
    `);
    created++;
  }

  return `${created} created, ${skipped} skipped`;
}

// ── Section 3: Form Templates ─────────────────────────────────────────────────

type FieldDef = {
  label: string;
  fieldType: string;
  required?: boolean;
  optionsJson?: string | null;
};

type TemplateDef = {
  name: string;
  formType: string;
  category: string;
  description: string;
  onJobs: boolean;
  onFleet: boolean;
  onDashboard: boolean;
  fields: FieldDef[];
};

const FORM_TEMPLATES: TemplateDef[] = [
  {
    name: 'Daily Prestart',
    formType: 'Fleet',
    category: 'Fleet',
    description: 'Daily vehicle and equipment prestart check.',
    onJobs: false,
    onFleet: true,
    onDashboard: true,
    fields: [
      { label: 'Date', fieldType: 'date', required: true },
      { label: 'Operator Name', fieldType: 'short_text', required: true },
      { label: 'Vehicle / Equipment', fieldType: 'short_text', required: true },
      { label: 'Odometer / Hours', fieldType: 'short_text' },
      { label: 'Brakes OK', fieldType: 'single_choice', required: true, optionsJson: JSON.stringify(['Yes', 'No', 'N/A']) },
      { label: 'Lights OK', fieldType: 'single_choice', required: true, optionsJson: JSON.stringify(['Yes', 'No', 'N/A']) },
      { label: 'Tyres OK', fieldType: 'single_choice', required: true, optionsJson: JSON.stringify(['Yes', 'No', 'N/A']) },
      { label: 'Fluids OK (oil, water, fuel)', fieldType: 'single_choice', required: true, optionsJson: JSON.stringify(['Yes', 'No', 'N/A']) },
      { label: 'Any defects or issues?', fieldType: 'long_text' },
      { label: 'Safe to operate?', fieldType: 'single_choice', required: true, optionsJson: JSON.stringify(['Yes — safe to operate', 'No — take out of service']) },
      { label: 'Operator Signature', fieldType: 'signature', required: true },
    ],
  },
  {
    name: 'Toolbox Talk',
    formType: 'Job',
    category: 'Safety',
    description: 'Record toolbox talk / safety briefing attendance and topics.',
    onJobs: true,
    onFleet: false,
    onDashboard: false,
    fields: [
      { label: 'Date', fieldType: 'date', required: true },
      { label: 'Project / Job', fieldType: 'short_text', required: true },
      { label: 'Conducted By', fieldType: 'short_text', required: true },
      { label: 'Topics Discussed', fieldType: 'long_text', required: true },
      { label: 'Actions Required', fieldType: 'long_text' },
      { label: 'Attendee 1 — Name', fieldType: 'short_text' },
      { label: 'Attendee 1 — Signature', fieldType: 'signature' },
      { label: 'Attendee 2 — Name', fieldType: 'short_text' },
      { label: 'Attendee 2 — Signature', fieldType: 'signature' },
      { label: 'Attendee 3 — Name', fieldType: 'short_text' },
      { label: 'Attendee 3 — Signature', fieldType: 'signature' },
      { label: 'Attendee 4 — Name', fieldType: 'short_text' },
      { label: 'Attendee 4 — Signature', fieldType: 'signature' },
      { label: 'Supervisor Signature', fieldType: 'signature', required: true },
    ],
  },
  {
    name: 'Incident / Injury / Near Miss Report',
    formType: 'Job',
    category: 'Safety',
    description: 'Record incidents, injuries, near misses, and hazard reports on site.',
    onJobs: true,
    onFleet: false,
    onDashboard: false,
    fields: [
      { label: 'Date of Incident', fieldType: 'date', required: true },
      { label: 'Time of Incident', fieldType: 'short_text', required: true },
      { label: 'Project / Job', fieldType: 'short_text', required: true },
      { label: 'Location on Site', fieldType: 'short_text', required: true },
      { label: 'Reported By', fieldType: 'short_text', required: true },
      { label: 'Incident Type', fieldType: 'single_choice', required: true,
        optionsJson: JSON.stringify(['Injury / Illness', 'Near Miss', 'Property Damage', 'Hazard Report', 'Vehicle / Plant Incident', 'Environmental Incident', 'Other']) },
      { label: 'Description of Incident', fieldType: 'long_text', required: true },
      { label: 'Persons Involved', fieldType: 'long_text' },
      { label: 'Immediate Actions Taken', fieldType: 'long_text', required: true },
      { label: 'Corrective Actions Required', fieldType: 'long_text' },
      { label: 'Photos / Evidence', fieldType: 'photo' },
      { label: 'Reported to Supervisor?', fieldType: 'single_choice', required: true, optionsJson: JSON.stringify(['Yes', 'No']) },
      { label: 'Reporter Signature', fieldType: 'signature', required: true },
    ],
  },
  {
    name: 'Site Inspection',
    formType: 'Job',
    category: 'Safety',
    description: 'Regular site safety and compliance inspection checklist.',
    onJobs: true,
    onFleet: false,
    onDashboard: false,
    fields: [
      { label: 'Date', fieldType: 'date', required: true },
      { label: 'Project / Job', fieldType: 'short_text', required: true },
      { label: 'Inspected By', fieldType: 'short_text', required: true },
      { label: 'PPE being worn correctly?', fieldType: 'single_choice', required: true, optionsJson: JSON.stringify(['Yes', 'No', 'N/A']) },
      { label: 'Housekeeping satisfactory?', fieldType: 'single_choice', required: true, optionsJson: JSON.stringify(['Yes', 'No', 'N/A']) },
      { label: 'Walkways and access clear?', fieldType: 'single_choice', required: true, optionsJson: JSON.stringify(['Yes', 'No', 'N/A']) },
      { label: 'Plant and equipment in good condition?', fieldType: 'single_choice', required: true, optionsJson: JSON.stringify(['Yes', 'No', 'N/A']) },
      { label: 'First aid kit accessible and stocked?', fieldType: 'single_choice', required: true, optionsJson: JSON.stringify(['Yes', 'No', 'N/A']) },
      { label: 'Emergency contacts displayed?', fieldType: 'single_choice', required: true, optionsJson: JSON.stringify(['Yes', 'No', 'N/A']) },
      { label: 'SWMS available and signed?', fieldType: 'single_choice', required: true, optionsJson: JSON.stringify(['Yes', 'No', 'N/A']) },
      { label: 'Hazards identified', fieldType: 'long_text' },
      { label: 'Actions required', fieldType: 'long_text' },
      { label: 'Photos', fieldType: 'photo' },
      { label: 'Inspector Signature', fieldType: 'signature', required: true },
    ],
  },
  {
    name: 'Worker Sign On / Attendance Register',
    formType: 'Job',
    category: 'Safety',
    description: 'Daily worker sign-on and attendance register for site induction and attendance tracking.',
    onJobs: true,
    onFleet: false,
    onDashboard: true,
    fields: [
      { label: 'Date', fieldType: 'date', required: true },
      { label: 'Project / Job', fieldType: 'short_text', required: true },
      { label: 'Site Supervisor', fieldType: 'short_text', required: true },
      { label: 'Worker Name', fieldType: 'short_text', required: true },
      { label: 'Company', fieldType: 'short_text' },
      { label: 'Role / Trade', fieldType: 'short_text' },
      { label: 'White Card Number', fieldType: 'short_text' },
      { label: 'Site induction completed?', fieldType: 'single_choice', required: true, optionsJson: JSON.stringify(['Yes', 'No']) },
      { label: 'Time In', fieldType: 'short_text', required: true },
      { label: 'Time Out', fieldType: 'short_text' },
      { label: 'Worker Signature', fieldType: 'signature', required: true },
    ],
  },
  {
    name: 'Photo Record',
    formType: 'Job',
    category: 'General',
    description: 'Capture and label site photos for progress, defects, or documentation.',
    onJobs: true,
    onFleet: false,
    onDashboard: false,
    fields: [
      { label: 'Date', fieldType: 'date', required: true },
      { label: 'Project / Job', fieldType: 'short_text', required: true },
      { label: 'Recorded By', fieldType: 'short_text', required: true },
      { label: 'Photo Category', fieldType: 'single_choice',
        optionsJson: JSON.stringify(['Progress', 'Defect / Issue', 'Before', 'After', 'Safety', 'Damage', 'Other']) },
      { label: 'Description', fieldType: 'long_text', required: true },
      { label: 'Photos', fieldType: 'photo', required: true },
      { label: 'Notes', fieldType: 'long_text' },
    ],
  },
  {
    name: 'Variation Request',
    formType: 'Job',
    category: 'Commercial',
    description: 'Document and approve variations to scope, cost, or programme.',
    onJobs: true,
    onFleet: false,
    onDashboard: false,
    fields: [
      { label: 'Date', fieldType: 'date', required: true },
      { label: 'Project / Job', fieldType: 'short_text', required: true },
      { label: 'Variation Number', fieldType: 'short_text', required: true },
      { label: 'Requested By', fieldType: 'short_text', required: true },
      { label: 'Description of Variation', fieldType: 'long_text', required: true },
      { label: 'Reason for Variation', fieldType: 'long_text', required: true },
      { label: 'Estimated Cost Impact', fieldType: 'short_text' },
      { label: 'Estimated Time Impact', fieldType: 'short_text' },
      { label: 'Supporting Photos / Documents', fieldType: 'photo' },
      { label: 'Client Approval', fieldType: 'single_choice', optionsJson: JSON.stringify(['Approved', 'Rejected', 'Pending']) },
      { label: 'Client Signature', fieldType: 'signature' },
      { label: 'Contractor Signature', fieldType: 'signature', required: true },
    ],
  },
  {
    name: 'Completion Sign Off',
    formType: 'Job',
    category: 'General',
    description: 'Practical completion and handover sign-off record.',
    onJobs: true,
    onFleet: false,
    onDashboard: false,
    fields: [
      { label: 'Date', fieldType: 'date', required: true },
      { label: 'Project / Job', fieldType: 'short_text', required: true },
      { label: 'Completed By', fieldType: 'short_text', required: true },
      { label: 'Scope of Works Completed', fieldType: 'long_text', required: true },
      { label: 'Outstanding Items / Defects', fieldType: 'long_text' },
      { label: 'Site clean and tidy?', fieldType: 'single_choice', required: true, optionsJson: JSON.stringify(['Yes', 'No']) },
      { label: 'All waste removed?', fieldType: 'single_choice', required: true, optionsJson: JSON.stringify(['Yes', 'No']) },
      { label: 'Client satisfied with works?', fieldType: 'single_choice', required: true, optionsJson: JSON.stringify(['Yes', 'No', 'Pending review']) },
      { label: 'Completion Photos', fieldType: 'photo' },
      { label: 'Client Signature', fieldType: 'signature', required: true },
      { label: 'Contractor Signature', fieldType: 'signature', required: true },
    ],
  },
];

async function seedFormTemplates(companyId: number): Promise<string> {
  let created = 0;
  let skipped = 0;

  for (const t of FORM_TEMPLATES) {
    const already = await exists('form_templates', companyId, 'name', t.name);
    if (already) { skipped++; continue; }

    const [result] = await db.execute(sql`
      INSERT INTO form_templates
        (company_id, name, form_type, category, description, is_active, on_jobs, on_fleet, on_dashboard)
      VALUES
        (${companyId}, ${t.name}, ${t.formType}, ${t.category}, ${t.description},
         1, ${t.onJobs ? 1 : 0}, ${t.onFleet ? 1 : 0}, ${t.onDashboard ? 1 : 0})
    `) as unknown as [ResultSetHeader, unknown];

    const templateId = result.insertId;

    // Insert fields
    for (let i = 0; i < t.fields.length; i++) {
      const f = t.fields[i];
      await db.execute(sql`
        INSERT INTO form_template_fields
          (template_id, company_id, label, field_type, required, options_json, field_order)
        VALUES
          (${templateId}, ${companyId}, ${f.label}, ${f.fieldType},
           ${f.required ? 1 : 0}, ${f.optionsJson ?? null}, ${i})
      `);
    }

    created++;
  }

  return `${created} created, ${skipped} skipped`;
}

// ── Section 4: Safety SWMS Library ───────────────────────────────────────────

const SWMS_TEMPLATES = [
  {
    title: 'General Site Safety — High Risk Construction Work',
    workActivity: 'General construction site activities including earthworks, structural work, fit-out, and site establishment.',
    hazards: `• Falls from height\n• Being struck by plant or equipment\n• Manual handling injuries\n• Electrical hazards\n• Silica dust exposure\n• Noise\n• UV radiation\n• Slips, trips and falls`,
    risks: `• Fall from height — HIGH\n• Struck by plant — HIGH\n• Manual handling injury — MEDIUM\n• Electric shock — HIGH\n• Silicosis — HIGH`,
    controls: `• Implement fall prevention measures (guardrails, safety mesh, harness systems) for all work at height above 2 metres\n• Establish exclusion zones around operating plant\n• Use mechanical aids for heavy lifts\n• Isolate electrical hazards before work commences\n• Use wet cutting methods and on-tool extraction for silica-generating tasks\n• Provide and enforce use of appropriate PPE\n• Conduct daily pre-start briefings\n• Maintain site induction records for all workers`,
    ppe: `• Safety helmet\n• High-visibility vest\n• Steel-capped safety boots\n• Safety glasses\n• Hearing protection (where required)\n• P2 respirator (for dust-generating tasks)\n• Gloves (task-appropriate)`,
    plantEquipment: `• Scaffolding and elevated work platforms\n• Excavators, loaders, and site vehicles\n• Power tools and hand tools\n• Lifting equipment`,
    trainingCompetency: `• Site induction\n• Working at heights training\n• Plant operator licences (where applicable)\n• First aid (at least one trained first aider on site)`,
    emergencyControls: `• Emergency contacts displayed at site entry\n• First aid kit accessible at all times\n• Emergency assembly point established and communicated\n• Incident reporting procedure communicated to all workers`,
    environmentalControls: `• Contain and manage spills immediately\n• Install sediment controls where required\n• Dispose of waste in accordance with applicable regulations`,
    signOffRequirements: `All workers must sign on to this SWMS prior to commencing work.`,
    revisionNumber: '1',
    status: 'active',
  },
  {
    title: 'Working at Heights',
    workActivity: 'Any work performed at a height of 2 metres or more above ground or floor level, including roof work, scaffolding, elevated platforms, and ladder use.',
    hazards: `• Falls from height\n• Falling objects striking workers below\n• Unstable or inadequate work platforms\n• Ladder misuse or failure\n• Adverse weather conditions\n• Fatigue at height`,
    risks: `• Fatal or serious injury from fall — CRITICAL\n• Struck by falling object — HIGH\n• Ladder fall — HIGH`,
    controls: `• Eliminate work at height where possible through design or pre-fabrication at ground level\n• Use scaffolding with full guardrail systems (top rail, mid rail, kickboard) for sustained work at height\n• Use elevated work platforms (EWP) for mobile or short-duration tasks\n• Use fall arrest harness systems where collective protection is not practicable\n• Inspect all scaffolding and EWPs before use\n• Establish exclusion zones below work at height areas\n• Secure all tools and materials to prevent falling\n• Do not work at height in high winds or adverse weather\n• Ensure ladders are secured, on stable footing, and at correct angle (1:4 ratio)\n• Maintain three points of contact on ladders at all times`,
    ppe: `• Safety helmet\n• Full-body harness and lanyard (where required)\n• Safety footwear\n• High-visibility vest\n• Gloves`,
    plantEquipment: `• Scaffolding systems\n• Elevated work platforms (scissor lifts, boom lifts)\n• Extension ladders and step ladders\n• Safety nets and catch platforms`,
    trainingCompetency: `• Working at heights training (nationally recognised)\n• EWP operator training (where applicable)\n• Scaffolding licence (where applicable)\n• Site induction`,
    emergencyControls: `• Emergency rescue plan for suspended workers\n• First aid kit accessible at all times\n• Emergency contacts displayed at site entry\n• Call 000 immediately for any fall incident`,
    environmentalControls: `• Secure materials to prevent wind-blown debris\n• Collect and dispose of waste from elevated areas safely`,
    signOffRequirements: `All workers must sign on to this SWMS prior to commencing any work at height.`,
    revisionNumber: '1',
    status: 'active',
  },
  {
    title: 'Excavation and Trenching',
    workActivity: 'Excavation, trenching, and earthworks activities including machine excavation, hand digging, and installation of services in trenches.',
    hazards: `• Trench collapse and engulfment\n• Underground services (gas, electrical, water, telecommunications)\n• Plant and vehicle movement near excavations\n• Falls into excavations\n• Flooding or water ingress\n• Unstable spoil heaps\n• Confined space conditions in deep excavations`,
    risks: `• Engulfment from trench collapse — CRITICAL\n• Utility strike — CRITICAL\n• Fall into excavation — HIGH\n• Struck by plant — HIGH`,
    controls: `• Conduct Dial Before You Dig (DBYD) search and obtain service plans before any excavation\n• Use cable/service locator to identify underground services before and during excavation\n• Hand dig within 300mm of identified services\n• Implement trench support (shoring, battering, or benching) for excavations deeper than 1.5 metres\n• Inspect trench walls daily and after rain or vibration events\n• Establish exclusion zones around excavations; barricade open excavations\n• Position spoil heaps at least 1 metre from trench edge\n• Provide safe means of entry and exit (ladder) for all trenches deeper than 1.5 metres\n• Monitor for hazardous atmospheres in deep excavations\n• Manage surface water to prevent flooding`,
    ppe: `• Safety helmet\n• High-visibility vest\n• Safety footwear\n• Safety glasses\n• Gloves`,
    plantEquipment: `• Excavators and backhoes (licensed operators)\n• Trench shoring systems\n• Cable/service locators\n• Pumps for dewatering`,
    trainingCompetency: `• Excavator operator licence (where applicable)\n• Trenching and excavation safety training\n• DBYD awareness\n• Site induction`,
    emergencyControls: `• Emergency rescue plan for trench collapse\n• Call 000 immediately for any engulfment or utility strike\n• First aid kit accessible at all times\n• Emergency contacts displayed at site entry`,
    environmentalControls: `• Manage sediment and erosion from excavations\n• Prevent spoil and water from entering stormwater drains\n• Dispose of contaminated soil in accordance with applicable regulations`,
    signOffRequirements: `All workers must sign on to this SWMS prior to commencing any excavation or trenching work.`,
    revisionNumber: '1',
    status: 'active',
  },
];

async function seedSwmsLibrary(companyId: number): Promise<string> {
  let created = 0;
  let skipped = 0;

  for (const t of SWMS_TEMPLATES) {
    const already = await exists('swms_templates', companyId, 'title', t.title);
    if (already) { skipped++; continue; }

    await db.execute(sql`
      INSERT INTO swms_templates
        (company_id, title, work_activity, hazards, risks, controls, ppe,
         plant_equipment, training_competency, emergency_controls,
         environmental_controls, sign_off_requirements,
         revision_number, status)
      VALUES
        (${companyId}, ${t.title}, ${t.workActivity}, ${t.hazards},
         ${t.risks}, ${t.controls}, ${t.ppe}, ${t.plantEquipment},
         ${t.trainingCompetency}, ${t.emergencyControls},
         ${t.environmentalControls}, ${t.signOffRequirements},
         ${t.revisionNumber}, ${t.status})
    `);
    created++;
  }

  return `${created} created, ${skipped} skipped`;
}

// ── Section 5: Safety Plan Template ──────────────────────────────────────────

async function seedSafetyPlan(companyId: number): Promise<string> {
  const already = await exists('safety_plans', companyId, 'title', 'Site Safety Management Plan — Starter Template');
  if (already) return 'skipped (already exists)';

  await db.execute(sql`
    INSERT INTO safety_plans
      (company_id, title, is_principal_contractor, site_rules, emergency_procedures,
       first_aid_arrangements, incident_reporting, hazard_management, status)
    VALUES (
      ${companyId},
      'Site Safety Management Plan — Starter Template',
      1,
      'All workers must complete a site induction before entering the work area.\nPPE (hard hat, hi-vis vest, steel-capped boots) must be worn at all times.\nNo alcohol or drugs on site.\nAll hazards and incidents must be reported to the site supervisor immediately.\nMobile phones must not be used while operating plant or equipment.',
      'In an emergency: call 000 immediately.\nEvacuate to the designated assembly point.\nDo not re-enter the site until the all-clear is given.\nNotify the site supervisor and complete an incident report.',
      'A first aid kit is maintained on site at all times.\nAt least one trained first aider must be present on site during work hours.\nThe nearest hospital and emergency services are identified in the site induction.',
      'All incidents, near misses, and hazards must be reported to the site supervisor immediately.\nComplete an Incident Report form for all incidents.\nSerious incidents must be reported to the relevant WHS regulator.',
      'Conduct a Job Safety Analysis (JSA) or SWMS for all high-risk construction work.\nConduct daily pre-start briefings to identify and address hazards.\nAll workers are empowered to stop work if they identify an unsafe condition.',
      'active'
    )
  `);
  return 'created';
}

// ── Section 6: Cost Guide Items ───────────────────────────────────────────────

const COST_GUIDE_ITEMS = [
  // Labour
  { description: 'Labour — General Labourer',       unit: 'hr',  rate: '45.00',  sortOrder: 10 },
  { description: 'Labour — Tradesperson',           unit: 'hr',  rate: '85.00',  sortOrder: 11 },
  { description: 'Labour — Supervisor',             unit: 'hr',  rate: '95.00',  sortOrder: 12 },
  { description: 'Labour — Apprentice',             unit: 'hr',  rate: '28.00',  sortOrder: 13 },
  // Carpentry
  { description: 'Carpentry — Framing Timber',      unit: 'lm',  rate: '12.00',  sortOrder: 20 },
  { description: 'Carpentry — Structural Framing',  unit: 'hr',  rate: '90.00',  sortOrder: 21 },
  { description: 'Carpentry — Formwork',            unit: 'm2',  rate: '65.00',  sortOrder: 22 },
  { description: 'Carpentry — Decking Boards',      unit: 'lm',  rate: '18.00',  sortOrder: 23 },
  // Painting
  { description: 'Painting — Interior Walls',       unit: 'm2',  rate: '18.00',  sortOrder: 30 },
  { description: 'Painting — Exterior Walls',       unit: 'm2',  rate: '22.00',  sortOrder: 31 },
  { description: 'Painting — Ceilings',             unit: 'm2',  rate: '20.00',  sortOrder: 32 },
  { description: 'Painting — Prep and Prime',       unit: 'm2',  rate: '12.00',  sortOrder: 33 },
  // Materials
  { description: 'Materials — Concrete (ready mix)', unit: 'm3', rate: '220.00', sortOrder: 40 },
  { description: 'Materials — Reinforcing Steel',   unit: 'tonne', rate: '1800.00', sortOrder: 41 },
  { description: 'Materials — Bricks (standard)',   unit: '1000', rate: '850.00', sortOrder: 42 },
  { description: 'Materials — Plasterboard 10mm',   unit: 'sheet', rate: '28.00', sortOrder: 43 },
  { description: 'Materials — Insulation Batts',    unit: 'm2',  rate: '14.00',  sortOrder: 44 },
  // Plant / Equipment
  { description: 'Plant — Excavator (1.5t)',        unit: 'day', rate: '650.00', sortOrder: 50 },
  { description: 'Plant — Excavator (5t)',          unit: 'day', rate: '950.00', sortOrder: 51 },
  { description: 'Plant — Bobcat / Skid Steer',     unit: 'day', rate: '550.00', sortOrder: 52 },
  { description: 'Plant — Concrete Pump',           unit: 'day', rate: '1200.00', sortOrder: 53 },
  { description: 'Plant — Scissor Lift',            unit: 'day', rate: '350.00', sortOrder: 54 },
  { description: 'Plant — Boom Lift',               unit: 'day', rate: '550.00', sortOrder: 55 },
  // Site Setup
  { description: 'Site Setup — Site Shed (monthly)', unit: 'month', rate: '450.00', sortOrder: 60 },
  { description: 'Site Setup — Portable Toilet',    unit: 'month', rate: '180.00', sortOrder: 61 },
  { description: 'Site Setup — Skip Bin (4m3)',     unit: 'each', rate: '380.00', sortOrder: 62 },
  { description: 'Site Setup — Temporary Fencing',  unit: 'panel', rate: '12.00', sortOrder: 63 },
  { description: 'Site Setup — Safety Signage',     unit: 'allow', rate: '250.00', sortOrder: 64 },
];

async function seedCostGuide(companyId: number): Promise<string> {
  let created = 0;
  let skipped = 0;

  for (const item of COST_GUIDE_ITEMS) {
    const already = await exists('cost_guide_items', companyId, 'description', item.description);
    if (already) { skipped++; continue; }

    await db.execute(sql`
      INSERT INTO cost_guide_items (company_id, description, unit, rate, sort_order)
      VALUES (${companyId}, ${item.description}, ${item.unit}, ${item.rate}, ${item.sortOrder})
    `);
    created++;
  }

  return `${created} created, ${skipped} skipped`;
}

// ── Section 7: Starter Fleet Asset ───────────────────────────────────────────

async function seedFleetAsset(companyId: number): Promise<string> {
  const already = await exists('fleet_assets', companyId, 'name', 'Test Vehicle');
  if (already) return 'skipped (already exists)';

  await db.execute(sql`
    INSERT INTO fleet_assets (company_id, name, type, rego, status, notes)
    VALUES (
      ${companyId},
      'Test Vehicle',
      'Vehicle',
      'TEST123',
      'Active',
      'Sample fleet asset. You can delete this when you add your real vehicles.'
    )
  `);
  return 'created';
}

// ── Main export ───────────────────────────────────────────────────────────────

export async function seedStarterPack(
  companyId: number,
  runByUserId?: string | null,
): Promise<SeedResult> {
  const result: SeedResult = {
    ok: false,
    companyId,
    sections: {},
    errors: [],
    alreadyLoaded: false,
  };

  try {
    // ── Once-only guard ───────────────────────────────────────────────────────
    const [companyRows] = await db.execute(
      sql`SELECT starter_pack_loaded FROM companies WHERE id = ${companyId} LIMIT 1`
    ) as unknown as [Array<{ starter_pack_loaded: number | boolean }>, unknown];

    if (!companyRows || companyRows.length === 0) {
      result.errors.push('Company not found');
      return result;
    }

    const alreadyLoaded = Boolean(companyRows[0].starter_pack_loaded);
    if (alreadyLoaded) {
      result.alreadyLoaded = true;
      result.ok = true;
      return result;
    }

    // ── Log run start ─────────────────────────────────────────────────────────
    let runId: number | null = null;
    try {
      const [runResult] = await db.execute(sql`
        INSERT INTO starter_pack_runs (company_id, run_by_user_id, status, notes)
        VALUES (${companyId}, ${runByUserId ?? null}, 'pending', 'Auto-seeding started')
      `) as unknown as [ResultSetHeader, unknown];
      runId = runResult.insertId;
    } catch (e) {
      // starter_pack_runs table may not exist yet on first deploy — non-fatal
      console.warn('[starter-pack] Could not log run start:', String(e));
    }

    // ── Run each section ──────────────────────────────────────────────────────
    const sections: Record<string, () => Promise<string>> = {
      project:       () => seedProject(companyId),
      stakeholders:  () => seedStakeholders(companyId),
      form_templates: () => seedFormTemplates(companyId),
      swms_library:  () => seedSwmsLibrary(companyId),
      safety_plan:   () => seedSafetyPlan(companyId),
      cost_guide:    () => seedCostGuide(companyId),
      fleet_asset:   () => seedFleetAsset(companyId),
    };

    for (const [key, fn] of Object.entries(sections)) {
      try {
        result.sections[key] = await fn();
      } catch (e) {
        const msg = String((e as Error)?.message ?? e);
        result.sections[key] = `ERROR: ${msg.slice(0, 200)}`;
        result.errors.push(`${key}: ${msg.slice(0, 200)}`);
        console.error(`[starter-pack] Section ${key} failed for company ${companyId}:`, e);
      }
    }

    // ── Mark company as seeded ────────────────────────────────────────────────
    const hasErrors = result.errors.length > 0;
    const finalStatus = hasErrors ? 'partial' : 'success';

    try {
      await db.execute(sql`
        UPDATE companies
        SET starter_pack_loaded = 1, starter_pack_loaded_at = NOW()
        WHERE id = ${companyId}
      `);
    } catch (e) {
      // Column may not exist yet if migration hasn't run — non-fatal
      console.warn('[starter-pack] Could not mark starter_pack_loaded:', String(e));
    }

    // ── Update run log ────────────────────────────────────────────────────────
    if (runId !== null) {
      try {
        const notes = JSON.stringify({ sections: result.sections, errors: result.errors });
        await db.execute(sql`
          UPDATE starter_pack_runs
          SET status = ${finalStatus}, notes = ${notes}
          WHERE id = ${runId}
        `);
      } catch (e) {
        console.warn('[starter-pack] Could not update run log:', String(e));
      }
    }

    result.ok = true;
    console.log(`[starter-pack] Company ${companyId} seeded — status: ${finalStatus}`, result.sections);
    return result;

  } catch (e) {
    const msg = String((e as Error)?.message ?? e);
    result.errors.push(`Fatal: ${msg}`);
    console.error(`[starter-pack] Fatal error for company ${companyId}:`, e);
    return result;
  }
}
