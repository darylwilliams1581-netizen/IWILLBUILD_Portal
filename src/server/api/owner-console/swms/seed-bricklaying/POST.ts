/**
 * POST /api/owner-console/swms/seed-bricklaying
 * One-time seed: pushes the Bricklaying structured SWMS to all companies.
 * Platform owner only. Safe to re-run (skips if already exists, or replaces if ?replace=1).
 */
import type { Request, Response } from 'express';
import { db } from '../../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getSessionAndProfile } from '../../../../lib/auth-middleware.js';

const BRICKLAYING_SWMS = {
  buildMode: 'advanced',
  documentType: 'swms',
  title: 'Bricklaying',
  category: 'Bricklaying / Masonry',
  revisionNumber: '1',
  reviewDate: '2026-07-13',
  authorName: 'Site Supervisor / Williams Constructions NQ',
  approvedByName: 'Principal Contractor',
  status: 'draft',
  purpose:
    'This Safe Work Method Statement identifies the hazards, risks and control measures for bricklaying works including materials handling, mortar mixing, scaffold/trestle work, cutting of bricks, and working at heights. It aims to eliminate or minimise risks so far as is reasonably practicable.',
  scope:
    'Applies to all workers undertaking bricklaying, blockwork, materials handling, mortar mixing, use of brick elevators, cutting of bricks, scaffold and trestle work, and working at heights on construction sites. Includes preparation, core bricklaying activities and clean-up.',
  includedActivities: [
    'Toolbox talk and pre-start',
    'Pre-operational equipment and scaffold checks',
    'Work zone management',
    'Materials layout and handling',
    'Hazardous substance handling (cement, lime, plasticiser)',
    'Access to trestles and scaffold',
    'Working at heights',
    'Brick cutting and power tools',
    'Spoils management',
    'Site clean-up and pack-up',
  ],
  excludedActivities: [
    'Deep excavation greater than 1.5 m',
    'Live electrical work without isolation',
    'Dry cutting of engineered stone',
  ],
  workBoundaries:
    'Site-specific bricklaying areas only. Coordinate with principal contractor for access, scaffold and other trades. Stop work immediately if controls cannot be maintained.',
  hrcwApplies: 'yes',
  hrcwCategories: [
    {
      id: 'h1',
      category: 'Risk of a person falling more than 2 metres',
      whyApplies: 'Scaffold and trestle work for single and double storey bricklaying',
      linkedWorkStep: 'Working at heights / Access to trestles',
      requiredPermit: '',
      relatedSwms: 'Working at Heights',
    },
    {
      id: 'h2',
      category: 'Work in an area with movement of powered mobile plant',
      whyApplies: 'Brick elevator, materials movement and possible plant interface',
      linkedWorkStep: 'Materials handling',
      requiredPermit: '',
      relatedSwms: 'Moving Powered Plant',
    },
    {
      id: 'h3',
      category: 'Crystalline Silica (RCS) exposure',
      whyApplies: 'Cutting bricks, mixing mortar, cleaning, and handling silica-containing materials',
      linkedWorkStep: 'Brick cutting and mortar mixing',
      requiredPermit: 'Silica statement (Appendix 1)',
      relatedSwms: 'Silica Dust Exposure',
    },
  ],
  criticalControls: [
    {
      id: 'cc1',
      criticalRisk: 'Fall from heights',
      possibleOutcome: 'Serious injury or fatality',
      mandatoryControls:
        'Scaffold to be used where work zone is 3.4 m or greater from ground level. Trestles may be used up to this level. Clear fall zone. Secure and stable scaffolding/trestles with timber sole plates. Trestles minimum 4 planks wide and set up as per manufacturer specifications. Industrial ladders only for access to trestles (extend 900 mm above work floor, secured, 1:4 rake, firm level footing). No working off ladders.',
      verificationMethod: 'Pre-start scaffold/trestle walk and inspection (scaff tag in place)',
      responsibleRole: 'Supervisor / All Workers',
      flags: ['critical', 'mandatory'],
    },
    {
      id: 'cc2',
      criticalRisk: 'Silica dust exposure (bricks, mortar, cement)',
      possibleOutcome: 'Silicosis, lung disease',
      mandatoryControls:
        'No dry cutting of bricks. P2 dust mask mandatory when mixing mortar or generating dust. Class H extraction or wet suppression preferred for cutting. 9" grinders banned without permit. Complete silica statement (Appendix 1). Refer to SDS for cement, lime and plasticiser.',
      verificationMethod: 'Dust control equipment check + respirator',
      responsibleRole: 'All Workers',
      flags: ['critical', 'mandatory'],
    },
    {
      id: 'cc3',
      criticalRisk: 'Manual handling and falling materials',
      possibleOutcome: 'Strain, sprain, crush injury',
      mandatoryControls:
        'Use mechanical aid (brick elevator with bucket attachment) to shift mortar above shoulder height. Brick elevator used for all double-storey construction. Steel lintels/beams lifted by mechanical means (team lift only for window lintels <40 kg). Look before discarding material. Progressive housekeeping.',
      verificationMethod: 'Observation of lifting methods and elevator use',
      responsibleRole: 'Supervisor / All Workers',
      flags: ['critical'],
    },
    {
      id: 'cc4',
      criticalRisk: 'Scaffold / trestle failure or collapse',
      possibleOutcome: 'Fall or crush injury',
      mandatoryControls:
        'No modifications to scaffolding. Scaff tag in place. Walk scaffold to check fit for purpose. Trestles and planks fit for service. Report any issues immediately.',
      verificationMethod: 'Daily visual inspection + scaff tag',
      responsibleRole: 'Supervisor / Leading Hand',
      flags: ['critical', 'mandatory'],
    },
  ],
  plantItems: [
    {
      id: 'p1',
      item: 'Brick Elevator',
      requirement: 'Competent operator, bucket attachment for mortar, used for double storey',
      inspectionRequired: 'Yes – daily pre-start',
      notes: 'Mechanical aid for materials above shoulder height',
    },
    {
      id: 'p2',
      item: 'Scaffold / Trestles',
      requirement: 'Scaff tag current, no modifications, fit for purpose, timber sole plates',
      inspectionRequired: 'Yes – daily walk + visual',
      notes: 'Scaffold mandatory ≥3.4 m; trestles up to 3.4 m',
    },
    {
      id: 'p3',
      item: 'Angle Grinder / Brick Saw',
      requirement: 'Guards operational, wet methods or extraction preferred, P2 mask',
      inspectionRequired: 'Yes – before each use',
      notes: '9" grinders require work permit; no dry cutting',
    },
  ],
  ppeRows: [
    { item: 'Safety helmet', requirement: 'At all times on site' },
    { item: 'Steel-capped safety boots', requirement: 'At all times on site' },
    { item: 'Hi-vis long trousers and long-sleeve clothing', requirement: 'At all times on site' },
    { item: 'Safety glasses / goggles', requirement: 'When cutting, mixing or generating dust/particles' },
    { item: 'Hearing protection', requirement: 'When using power tools or elevators' },
    { item: 'Task-specific gloves', requirement: 'When handling materials, mortar or tools' },
    { item: 'P2 dust mask / respirator', requirement: 'When mixing mortar, cutting bricks or generating dust' },
    { item: 'Sunscreen + hat', requirement: 'Outdoor work – reapply as required' },
  ],
  workSteps: [
    {
      id: 's1',
      sequenceNumber: 1,
      sequenceOfWork: 'Toolbox Talk & Pre-start',
      hazardsAndRisks: 'Workers unaware of risks, unfit for duty, weather extremes',
      possibleConsequence: 'Injury, heat exhaustion, poor decisions',
      initialRisk: 'high',
      controlMeasures:
        'Stop-Plan-Do process. Fitness for work check. Review emergency response. Discuss weather, manual handling and contingency plan. All workers sign onto SWMS. Min PPE: safety glasses, gloves, safety boots, long trousers, polo top.',
      residualRisk: 'low',
      responsiblePerson: 'Supervisor / All Workers',
      isCriticalControl: false,
      monitoringMethod: 'Daily pre-start attendance',
      stopWorkTrigger: 'Any worker unfit or controls cannot be applied',
      linkedPermit: '',
      linkedSwms: '',
      evidenceRequired: 'Signed SWMS and pre-start record',
      notes: '',
    },
    {
      id: 's2',
      sequenceNumber: 2,
      sequenceOfWork: 'Pre-operational checks (scaffold, trestles, equipment)',
      hazardsAndRisks: 'Faulty equipment, unsafe scaffold/trestles, electrocution',
      possibleConsequence: 'Fall, injury, electrocution',
      initialRisk: 'high',
      controlMeasures:
        'All electrical equipment current test & tag. Hand tools in good condition. PPE serviceable. Check list completed for mechanical equipment. Elec lead stands used. Scaff tag in place. No modifications to scaffolding. Walk scaffold to check fit for purpose. Trestles and planks fit for service.',
      residualRisk: 'low',
      responsiblePerson: 'All Workers + Supervisor',
      isCriticalControl: true,
      monitoringMethod: 'Visual inspection + scaff tag',
      stopWorkTrigger: 'Missing scaff tag, damaged components or defective equipment',
      linkedPermit: '',
      linkedSwms: 'Working at Heights',
      evidenceRequired: 'Pre-start checklist and scaff tag',
      notes: '',
    },
    {
      id: 's3',
      sequenceNumber: 3,
      sequenceOfWork: 'Manage work zone',
      hazardsAndRisks: 'Objects falling from height, slip/trip hazards, other trades, weather',
      possibleConsequence: 'Injury from falling materials, slips',
      initialRisk: 'high',
      controlMeasures:
        'Communicate with other people on site. Do not work above other persons. Look before discarding material. Progressive housekeeping. Clear work area from slip and trip hazards. Plank out work zone if required. In warmer weather: rotate intense tasks, regular shade breaks, hats, sunscreen, plenty of fluids.',
      residualRisk: 'low',
      responsiblePerson: 'Supervisor / All Workers',
      isCriticalControl: false,
      monitoringMethod: 'Ongoing visual + weather monitoring',
      stopWorkTrigger: 'People below, blocked access or extreme heat',
      linkedPermit: '',
      linkedSwms: '',
      evidenceRequired: '',
      notes: '',
    },
    {
      id: 's4',
      sequenceNumber: 4,
      sequenceOfWork: 'Materials layout and handling',
      hazardsAndRisks: 'Obstruction to access, strain, sprains, crushing from falling objects',
      possibleConsequence: 'Musculoskeletal or crush injury',
      initialRisk: 'high',
      controlMeasures:
        'Coordinate with site supervisor. Avoid placement of materials in access paths or doorways. Use mechanical aid (brick elevator) to move materials and mortar above shoulder height. Brick elevator for all double-storey work. Steel lintels/beams lifted by mechanical means (team lift only for <40 kg window lintels). Progressive clean-up.',
      residualRisk: 'low',
      responsiblePerson: 'All Workers',
      isCriticalControl: true,
      monitoringMethod: 'Observation of lifting methods',
      stopWorkTrigger: 'Manual lifting of heavy items or unstable stacks',
      linkedPermit: '',
      linkedSwms: 'Manual Handling and Housekeeping',
      evidenceRequired: '',
      notes: '',
    },
    {
      id: 's5',
      sequenceNumber: 5,
      sequenceOfWork: 'Hazardous substance handling (cement, lime, plasticiser, silica)',
      hazardsAndRisks: 'Health effects from exposure to silica, cement dust and chemicals',
      possibleConsequence: 'Respiratory disease, skin irritation, eye damage',
      initialRisk: 'high',
      controlMeasures:
        'Used as directed and take precautions as on label and SDS. No dry cutting of bricks. P2 dust mask when mixing mortar. 9" grinders banned from site without work permit. Wet methods or extraction preferred. Gloves, eye protection and long clothing when handling cement products.',
      residualRisk: 'low',
      responsiblePerson: 'All Workers',
      isCriticalControl: true,
      monitoringMethod: 'SDS available + PPE check',
      stopWorkTrigger: 'Dry cutting or no P2 mask when dust generated',
      linkedPermit: '',
      linkedSwms: 'Silica Dust Exposure',
      evidenceRequired: 'SDS on site',
      notes: '',
    },
    {
      id: 's6',
      sequenceNumber: 6,
      sequenceOfWork: 'Access to trestles and working at heights',
      hazardsAndRisks: 'Slip or falls, access equipment slipping, fall from height',
      possibleConsequence: 'Serious injury or fatality',
      initialRisk: 'extreme',
      controlMeasures:
        'Only use ladders to access trestles (do not work off ladders). Industrial rated ladder, extends 900 mm above work floor, secured, 1:4 rake, firm level footing. Scaffold for work ≥3.4 m. Clear fall zone. Secure and stable platforms with timber sole plates. Trestles minimum 4 planks wide.',
      residualRisk: 'low',
      responsiblePerson: 'All Workers + Supervisor',
      isCriticalControl: true,
      monitoringMethod: 'Access equipment and edge protection inspection',
      stopWorkTrigger: 'Unstable access, missing components or weather',
      linkedPermit: '',
      linkedSwms: 'Working at Heights',
      evidenceRequired: 'Scaff tag / inspection record',
      notes: '',
    },
    {
      id: 's7',
      sequenceNumber: 7,
      sequenceOfWork: 'Spoils management (bricks, mortar)',
      hazardsAndRisks: 'Trip hazards, crushing from falling objects, runoff',
      possibleConsequence: 'Injury, environmental harm',
      initialRisk: 'medium',
      controlMeasures:
        'Keep spoils in allocated zones away from access areas. Set up barricaded drop zones. Look before discarding spoils from height. Set up silt control to prevent runoff onto footpaths or roadway. Progressive clean-up.',
      residualRisk: 'low',
      responsiblePerson: 'All Workers',
      isCriticalControl: false,
      monitoringMethod: 'Ongoing visual',
      stopWorkTrigger: 'Uncontrolled spoils or runoff risk',
      linkedPermit: '',
      linkedSwms: '',
      evidenceRequired: '',
      notes: '',
    },
    {
      id: 's8',
      sequenceNumber: 8,
      sequenceOfWork: 'Clean-up before leaving site',
      hazardsAndRisks: 'Trips, slips, falls, manual handling, security, site runoff',
      possibleConsequence: 'Injury, public hazard',
      initialRisk: 'medium',
      controlMeasures:
        'Scaffolding decks swept and clear of mortar. Lightweight waste into cage/bins. Spoils outside fall zones. Gates closed. Clean any site runoff from bricklaying tasks. Area left tidy and secure.',
      residualRisk: 'low',
      responsiblePerson: 'All Workers',
      isCriticalControl: false,
      monitoringMethod: 'End-of-day inspection',
      stopWorkTrigger: 'Uncontrolled waste or blocked egress',
      linkedPermit: '',
      linkedSwms: '',
      evidenceRequired: '',
      notes: '',
    },
  ],
  taskRequirements: [
    {
      id: 'tr1',
      type: 'Exclusion-zone requirements',
      description: 'Barricade drop zones and keep other trades clear of active bricklaying works',
    },
    {
      id: 'tr2',
      type: 'Dust-control requirements',
      description: 'No dry cutting of bricks. P2 mask + extraction/wet methods. Complete silica statement.',
    },
    {
      id: 'tr3',
      type: 'Plant separation requirements',
      description: 'Safe separation when brick elevator or plant is operating',
    },
  ],
  envControls: [
    {
      type: 'Housekeeping',
      description: 'Progressive clean-up of mortar, bricks and spoils. Keep access ways and fall zones clear.',
      responsiblePerson: 'All Workers',
    },
    {
      type: 'Waste',
      description: 'Lightweight waste into bins/cages. Spoils managed so they do not enter drains or leave site.',
      responsiblePerson: 'All Workers',
    },
    {
      type: 'Dust',
      description: 'No dry cutting. Minimise dust generation. Wet methods or extraction preferred.',
      responsiblePerson: 'Supervisor',
    },
    {
      type: 'Stormwater',
      description: 'Silt control to prevent mortar/brick runoff onto footpaths or roadway.',
      responsiblePerson: 'Supervisor',
    },
  ],
  emergencyActions: [
    { id: 'e1', action: 'Stop work immediately' },
    { id: 'e2', action: 'Make the area safe if safe to do so' },
    { id: 'e3', action: 'Provide first aid / call 000 for serious injury' },
    { id: 'e4', action: 'Notify Site Supervisor and Principal Contractor immediately' },
    { id: 'e5', action: 'Preserve the incident scene where required' },
    { id: 'e6', action: 'Do not restart work until controls reviewed and workers re-briefed' },
  ],
  emergencyModules: [],
  competencyRows: [
    { requirement: 'White Card / General Construction Induction', applies: true, evidenceOrAuth: 'Current card' },
    { requirement: 'Site induction', applies: true, evidenceOrAuth: 'Site-specific' },
    { requirement: 'Power tool competency', applies: true, evidenceOrAuth: 'Trained/supervised' },
    { requirement: 'Working at heights awareness', applies: true, evidenceOrAuth: '' },
    { requirement: 'Scaffold awareness / user', applies: true, evidenceOrAuth: 'As required' },
    { requirement: 'First aid', applies: false, evidenceOrAuth: '' },
    { requirement: 'Respirator fit testing', applies: false, evidenceOrAuth: 'If tight-fitting respirator required' },
  ],
  definitions: [
    {
      id: 'd1',
      term: 'Scaff tag',
      definition: 'Scaffold inspection tag confirming the scaffold is safe for use',
    },
  ],
  relatedDocs: [
    { id: 'rd1', type: 'Related SWMS', document: 'Manual Handling and Housekeeping', revision: 'Current', status: 'current' },
    { id: 'rd2', type: 'Related SWMS', document: 'Silica Dust Exposure', revision: 'Current', status: 'current' },
    { id: 'rd3', type: 'Related SWMS', document: 'Working at Heights', revision: 'Current', status: 'current' },
    { id: 'rd4', type: 'Related SWMS', document: 'Moving Powered Plant', revision: 'Current', status: 'current' },
    { id: 'rd5', type: 'Other', document: 'High Risk Crystalline Silica Statement (Appendix 1)', revision: '2024', status: 'current' },
  ],
  workerSignOns: [],
  supervisorDeclaration: {
    name: '',
    position: 'Site Supervisor',
    date: '',
    signatureData: '',
    comments: 'I confirm this SWMS has been explained to all workers and controls will be complied with.',
  },
};

export default async function handler(req: Request, res: Response) {
  const auth = await getSessionAndProfile(req, res);
  if (!auth) return;

  const [ownerCheck] = await db.execute(sql.raw(
    `SELECT role FROM profiles WHERE user_id = '${auth.session.user.id}' LIMIT 1`
  )) as unknown as [Array<{ role: string }>, unknown];

  if (ownerCheck?.[0]?.role !== 'platform_owner') {
    return res.status(403).json({ error: 'Platform owner access required' });
  }

  const replace = req.query.replace === '1' || req.body?.replace === true;

  try {
    const [companyRows] = await db.execute(sql.raw(
      `SELECT id FROM companies WHERE status != 'archived' ORDER BY id`
    )) as unknown as [Array<{ id: number }>, unknown];

    const companyIds = (companyRows ?? []).map((r) => r.id);
    const title = BRICKLAYING_SWMS.title;
    const swmsBodyJson = JSON.stringify(BRICKLAYING_SWMS);

    let inserted = 0, updated = 0, skipped = 0;

    for (const companyId of companyIds) {
      const [existing] = await db.execute(sql.raw(
        `SELECT id FROM swms_templates WHERE company_id = ${companyId} AND title = ${JSON.stringify(title)} LIMIT 1`
      )) as unknown as [Array<{ id: number }>, unknown];

      const existingId = existing?.[0]?.id;
      const safe = (s: string) => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");

      if (existingId && replace) {
        await db.execute(sql.raw(`
          UPDATE swms_templates SET
            swms_body       = '${safe(swmsBodyJson)}',
            build_mode      = 'advanced',
            document_type   = 'swms',
            category        = 'Bricklaying / Masonry',
            revision_number = '1',
            status          = 'draft',
            updated_at      = NOW()
          WHERE id = ${existingId}
        `));
        updated++;
      } else if (existingId) {
        skipped++;
      } else {
        await db.execute(sql.raw(`
          INSERT INTO swms_templates
            (company_id, title, category, revision_number, author_name, approved_by_name,
             status, build_mode, document_type, swms_body, created_at, updated_at)
          VALUES (
            ${companyId},
            '${safe(title)}',
            'Bricklaying / Masonry',
            '1',
            'Site Supervisor / Williams Constructions NQ',
            'Principal Contractor',
            'draft',
            'advanced',
            'swms',
            '${safe(swmsBodyJson)}',
            NOW(), NOW()
          )
        `));
        inserted++;
      }
    }

    return res.json({ ok: true, companies: companyIds.length, inserted, updated, skipped });
  } catch (err) {
    console.error('seed-bricklaying error:', err);
    return res.status(500).json({ error: String(err) });
  }
}
