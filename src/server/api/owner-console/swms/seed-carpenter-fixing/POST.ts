/**
 * POST /api/owner-console/swms/seed-carpenter-fixing
 * One-time seed: pushes the Carpenter Fixing (second fix) structured SWMS to all companies.
 * Platform owner only. Safe to re-run (skips if already exists, or replaces if ?replace=1).
 */
import type { Request, Response } from 'express';
import { db } from '../../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getSessionAndProfile } from '../../../../lib/auth-middleware.js';

const CARPENTER_FIXING_SWMS = {
  buildMode: 'advanced',
  documentType: 'swms',
  title: 'Carpenter Fixing',
  category: 'Carpentry / Fixing Out',
  revisionNumber: '1',
  reviewDate: '2026-07-13',
  authorName: 'Site Supervisor / Williams Constructions NQ',
  approvedByName: 'Principal Contractor',
  status: 'draft',
  purpose:
    'This Safe Work Method Statement identifies the hazards, risks and control measures for carpenter fixing works including installation of doors, windows, architraves, skirtings, hardware and related fixing activities, materials handling, nail guns, power tools and working at heights. It aims to eliminate or minimise risks so far as is reasonably practicable.',
  scope:
    'Applies to all workers undertaking carpenter fixing (second fix) works including doors, windows, architraves, skirtings, hardware, trimming, materials handling, use of air nail guns and power tools, and working at heights on construction sites. Includes preparation, core fixing activities and clean-up.',
  includedActivities: [
    'Toolbox talk and pre-start',
    'Pre-operational equipment checks',
    'Work zone management',
    'Materials layout and handling',
    'Air nail gun use',
    'Power tool use and trimming',
    'Working at heights',
    'Spoils management',
    'Site clean-up and pack-up',
  ],
  excludedActivities: [
    'Structural framing',
    'Deep excavation',
    'Live electrical work without isolation',
    'High-risk silica cutting of engineered stone without separate controls',
  ],
  workBoundaries:
    'Site-specific fixing areas only. Coordinate with principal contractor for access and other trades. Stop work immediately if controls cannot be maintained.',
  hrcwApplies: 'yes',
  hrcwCategories: [
    {
      id: 'h1',
      category: 'Risk of a person falling more than 2 metres',
      whyApplies: 'Working on upper levels, near edges, voids or using trestles/ladders for fixing',
      linkedWorkStep: 'Working at heights',
      requiredPermit: '',
      relatedSwms: 'Working at Heights',
    },
    {
      id: 'h2',
      category: 'Work in an area with movement of powered mobile plant',
      whyApplies: 'Possible plant movement or deliveries in work area',
      linkedWorkStep: 'Materials handling',
      requiredPermit: '',
      relatedSwms: 'Moving Powered Plant',
    },
    {
      id: 'h3',
      category: 'Crystalline Silica (RCS) exposure',
      whyApplies: 'Possible cutting or grinding of cement sheeting or masonry products',
      linkedWorkStep: 'Trimming and power tools',
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
        'Clear fall zone. Use only secure and stable scaffolding or trestles fit for purpose. Ladders for minor short-term works only (industrial rated, secured, do not stand on top two rungs). Do not walk top plate or work within 1.5 m of outer edge without fall protection. Prefer trestles or platforms over ladders.',
      verificationMethod: 'Pre-start inspection of access equipment and edge protection',
      responsibleRole: 'Supervisor / All Workers',
      flags: ['critical', 'mandatory'],
    },
    {
      id: 'cc2',
      criticalRisk: 'Unintended nail gun discharge',
      possibleOutcome: 'Penetrating injury',
      mandatoryControls:
        'Bump-fire mode only used for flooring (if applicable). Trigger lock activated when gun not in use. Airline disconnected or battery removed when moving between work zones or for maintenance. Safety glasses worn when operating, reloading or servicing.',
      verificationMethod: 'Pre-use check of mode and lock',
      responsibleRole: 'Operator',
      flags: ['critical', 'mandatory'],
    },
    {
      id: 'cc3',
      criticalRisk: 'Injury from power tools / trimming',
      possibleOutcome: 'Laceration, eye injury, noise-induced hearing loss',
      mandatoryControls:
        'Competent operators only. All guarding in place and operational. Correct blades/bits/discs. Eye and hearing protection at all times. Surrounding area clear of other persons. Do not use power tools on ladders – use trestles or work platforms.',
      verificationMethod: 'Pre-use inspection + observation',
      responsibleRole: 'Operator',
      flags: ['critical'],
    },
    {
      id: 'cc4',
      criticalRisk: 'Silica / dust exposure',
      possibleOutcome: 'Respiratory disease',
      mandatoryControls:
        'P2 dust mask + dust extraction preferred for cement sheeting. Refer to manufacturer SDS. Wet methods where practicable. Complete silica statement if applicable.',
      verificationMethod: 'Dust control check',
      responsibleRole: 'All Workers',
      flags: ['mandatory'],
    },
  ],
  plantItems: [
    {
      id: 'p1',
      item: 'Air Nail Gun',
      requirement: 'Sequential trigger preferred, bump-fire only where authorised, trigger lock, safety glasses',
      inspectionRequired: 'Yes – before each use',
      notes: 'Isolate air/battery when not in use or moving zones',
    },
    {
      id: 'p2',
      item: 'Circular Saw / Drill / Power Tools',
      requirement: 'Guards operational, correct blades, competent operators',
      inspectionRequired: 'Yes – before each use',
      notes: 'Do not use on ladders',
    },
  ],
  ppeRows: [
    { item: 'Safety helmet', requirement: 'At all times on site' },
    { item: 'Steel-capped safety boots', requirement: 'At all times on site' },
    { item: 'Hi-vis long-sleeve clothing', requirement: 'At all times on site' },
    { item: 'Safety glasses / goggles', requirement: 'When using power tools or nail guns' },
    { item: 'Hearing protection', requirement: 'When using power tools or nail guns' },
    { item: 'Task-specific gloves', requirement: 'When handling materials or tools' },
    { item: 'P2 dust mask', requirement: 'When cutting cement sheeting or generating dust' },
    { item: 'Safety harness + lanyard', requirement: 'When working at heights where fall protection cannot be eliminated' },
    { item: 'Sunscreen + hat', requirement: 'Outdoor work' },
  ],
  workSteps: [
    {
      id: 's1',
      sequenceNumber: 1,
      sequenceOfWork: 'Toolbox Talk & Pre-start',
      hazardsAndRisks: 'Workers unaware of risks, unfit for duty, weather, apprentices',
      possibleConsequence: 'Injury, poor decisions',
      initialRisk: 'high',
      controlMeasures:
        'Stop-Plan-Do process. Fitness for work check. Review emergency response. Adequate supervision for apprentices/young workers. All workers sign onto SWMS. Discuss weather, manual handling and contingency plan.',
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
      sequenceOfWork: 'Pre-operational equipment checks',
      hazardsAndRisks: 'Faulty tools, untagged electrical equipment, missing guards, incorrect nail gun mode',
      possibleConsequence: 'Electrocution, laceration, nail injury',
      initialRisk: 'high',
      controlMeasures:
        'All electrical equipment current test & tag. Hand tools and mechanical equipment in good condition. Guards fitted and operational. Bump-fire restricted as authorised. Lead stands used. PPE serviceable. Manufacturer instructions followed.',
      residualRisk: 'low',
      responsiblePerson: 'All Workers',
      isCriticalControl: true,
      monitoringMethod: 'Visual inspection + checklist',
      stopWorkTrigger: 'Any defective equipment',
      linkedPermit: '',
      linkedSwms: 'Use of Power Tools',
      evidenceRequired: 'Pre-start checklist',
      notes: '',
    },
    {
      id: 's3',
      sequenceNumber: 3,
      sequenceOfWork: 'Manage work zone & materials layout',
      hazardsAndRisks: 'Trips, slips, crushing, obstruction of access, other trades',
      possibleConsequence: 'Injury, plant interaction',
      initialRisk: 'medium',
      controlMeasures:
        'Communicate with other people on site. Ensure pathways are clear. Site is trade ready. Barricade potential drop zones. Coordinate materials placement with site supervisor. Avoid placement in access paths or doorways.',
      residualRisk: 'low',
      responsiblePerson: 'Supervisor / All Workers',
      isCriticalControl: false,
      monitoringMethod: 'Ongoing visual',
      stopWorkTrigger: 'Blocked access or uncontrolled hazards',
      linkedPermit: '',
      linkedSwms: '',
      evidenceRequired: '',
      notes: '',
    },
    {
      id: 's4',
      sequenceNumber: 4,
      sequenceOfWork: 'Materials handling',
      hazardsAndRisks: 'Strain, sprains, crush type injuries',
      possibleConsequence: 'Musculoskeletal injury',
      initialRisk: 'high',
      controlMeasures:
        'Plan clear path to transfer materials. Correct lifting techniques. Team lift awkward materials. Work on trestles not to exceed 2 m in height. Precautions when trimming cement sheeting products – refer to supplier SDS. Mechanical aids where practicable.',
      residualRisk: 'low',
      responsiblePerson: 'All Workers',
      isCriticalControl: false,
      monitoringMethod: 'Buddy observation',
      stopWorkTrigger: 'Excessive force or awkward posture required',
      linkedPermit: '',
      linkedSwms: 'Manual Handling and Housekeeping',
      evidenceRequired: '',
      notes: '',
    },
    {
      id: 's5',
      sequenceNumber: 5,
      sequenceOfWork: 'Air nail gun use',
      hazardsAndRisks: 'Laceration, piercing, unintended discharge',
      possibleConsequence: 'Penetrating injury',
      initialRisk: 'high',
      controlMeasures:
        'Bump-fire mode only used for flooring if applicable. Trigger lock in place when gun not in use. Airline disconnected (or battery removed) when moving from work zones or for maintenance. Safety glasses must be worn when operating, reloading or servicing.',
      residualRisk: 'low',
      responsiblePerson: 'Operator',
      isCriticalControl: true,
      monitoringMethod: 'Pre-use check',
      stopWorkTrigger: 'Wrong mode or persons in line of fire',
      linkedPermit: '',
      linkedSwms: 'Use of Power Tools',
      evidenceRequired: '',
      notes: '',
    },
    {
      id: 's6',
      sequenceNumber: 6,
      sequenceOfWork: 'Power tools, trimming and in-situ modifications',
      hazardsAndRisks: 'Injury from power/air/tool operation, dust, noise, flying particles',
      possibleConsequence: 'Laceration, eye injury, hearing damage',
      initialRisk: 'high',
      controlMeasures:
        'Eye protection, equipment guarded and maintained. All workers trained or supervised when using power tools. Do not use power tools on ladders – use trestles or mobile work platform. Surrounding area clear of other persons.',
      residualRisk: 'low',
      responsiblePerson: 'Operator',
      isCriticalControl: true,
      monitoringMethod: 'Pre-use check + observation',
      stopWorkTrigger: 'Damaged guard or persons in line of fire',
      linkedPermit: '',
      linkedSwms: 'Use of Power Tools',
      evidenceRequired: 'Competency confirmation',
      notes: '',
    },
    {
      id: 's7',
      sequenceNumber: 7,
      sequenceOfWork: 'Working at heights',
      hazardsAndRisks: 'Fall from heights',
      possibleConsequence: 'Serious injury or fatality',
      initialRisk: 'extreme',
      controlMeasures:
        'Ensure clear area in fall zone. Secure and stable scaffolding/trestles used and fit for purpose. Ladders only for minor short-term works. Do not walk top plate or work within 1.5 m of outer edge without fall protection.',
      residualRisk: 'low',
      responsiblePerson: 'All Workers + Supervisor',
      isCriticalControl: true,
      monitoringMethod: 'Access equipment and edge protection inspection',
      stopWorkTrigger: 'Unstable access or missing fall protection',
      linkedPermit: '',
      linkedSwms: 'Working at Heights',
      evidenceRequired: '',
      notes: '',
    },
    {
      id: 's8',
      sequenceNumber: 8,
      sequenceOfWork: 'Spoils management & clean-up',
      hazardsAndRisks: 'Trips, slips, falls, manual handling, security',
      possibleConsequence: 'Injury, security risk',
      initialRisk: 'medium',
      controlMeasures:
        'Pick up larger trimmed pieces into spoils cage. Wet sweep floor area where required. Put lightweight waste into cage/bins. Ensure spoils are outside fall zones. Gates closed. Area left tidy and secure.',
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
      description: 'Barricade potential drop zones and keep other trades clear of active fixing works',
    },
    {
      id: 'tr2',
      type: 'Dust-control requirements',
      description: 'P2 mask + extraction preferred for cement sheeting; complete silica statement if required',
    },
  ],
  envControls: [
    {
      type: 'Housekeeping',
      description: 'Progressive clean-up of offcuts and spoils. Keep access ways and fall zones clear.',
      responsiblePerson: 'All Workers',
    },
    {
      type: 'Waste',
      description: 'Lightweight waste into bins/cages. Spoils managed so they do not enter drains or leave site.',
      responsiblePerson: 'All Workers',
    },
    {
      type: 'Dust',
      description: 'Minimise dust generation. Use extraction or wet methods where practicable.',
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
    { requirement: 'First aid', applies: false, evidenceOrAuth: '' },
    { requirement: 'Respirator fit testing', applies: false, evidenceOrAuth: 'If tight-fitting respirator required' },
  ],
  definitions: [
    {
      id: 'd1',
      term: 'Bump fire',
      definition: 'Contact-trip mode that discharges nail on contact without full trigger pull – restricted use only',
    },
  ],
  relatedDocs: [
    { id: 'rd1', type: 'Related SWMS', document: 'Manual Handling and Housekeeping', revision: 'Current', status: 'current' },
    { id: 'rd2', type: 'Related SWMS', document: 'Use of Power Tools', revision: 'Current', status: 'current' },
    { id: 'rd3', type: 'Related SWMS', document: 'Silica Dust Exposure', revision: 'Current', status: 'current' },
    { id: 'rd4', type: 'Related SWMS', document: 'Working at Heights', revision: 'Current', status: 'current' },
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
    const title = CARPENTER_FIXING_SWMS.title;
    const swmsBodyJson = JSON.stringify(CARPENTER_FIXING_SWMS);

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
            category        = 'Carpentry / Fixing Out',
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
            'Carpentry / Fixing Out',
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
    console.error('seed-carpenter-fixing error:', err);
    return res.status(500).json({ error: String(err) });
  }
}
