/**
 * POST /api/owner-console/swms/seed-carpenter-lockup
 * Pushes the Carpenter Lockup structured SWMS to all active companies.
 * Platform owner only. Add ?replace=1 to overwrite existing records.
 */
import type { Request, Response } from 'express';
import { db } from '../../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getPlatformOwnerInfo } from '../../../../lib/platform-owner-guard.js';

const CARPENTER_LOCKUP_SWMS = {
  buildMode: 'advanced',
  documentType: 'swms',
  title: 'Carpenter Lockup',
  category: 'Carpentry / Lockup Stage',
  revisionNumber: '1',
  reviewDate: '2026-07-13',
  authorName: 'Site Supervisor / Williams Constructions NQ',
  approvedByName: 'Principal Contractor',
  status: 'draft',
  purpose:
    'This Safe Work Method Statement identifies the hazards, risks and control measures for carpenter lockup works including installation of doors, windows, external cladding elements, materials handling, nail guns, power tools and working at heights. It aims to eliminate or minimise risks so far as is reasonably practicable.',
  scope:
    'Applies to all workers undertaking carpenter lockup stage works (doors, windows, external lockup elements), materials layout and handling, use of air nail guns and power tools, trimming, dust control and working at heights on construction sites. Includes preparation, core activities and clean-up.',
  includedActivities: [
    'Toolbox talk and pre-start',
    'Pre-operational equipment checks',
    'Work zone management',
    'Materials layout and handling',
    'Air nail gun use',
    'Power tool use and trimming',
    'Working at heights',
    'Spoils management',
    'Site clean-up',
  ],
  excludedActivities: [
    'Structural framing',
    'Deep excavation',
    'Live electrical work without isolation',
    'High-risk silica cutting of engineered stone without separate controls',
  ],
  workBoundaries:
    'Site-specific lockup areas only. Coordinate with principal contractor for access, other trades and temporary works. Stop work immediately if controls cannot be maintained.',
  hrcwApplies: 'yes',
  hrcwCategories: [
    {
      id: 'h1',
      category: 'Risk of a person falling more than 2 metres',
      whyApplies: 'Working near voids, edges and from trestles/ladders during lockup',
      linkedWorkStep: 'Working at heights',
      requiredPermit: '',
      relatedSwms: 'Working at Heights',
    },
    {
      id: 'h2',
      category: 'Work in an area with movement of powered mobile plant',
      whyApplies: 'Possible plant or delivery movement near work zone',
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
      criticalRisk: 'Fall from heights / voids',
      possibleOutcome: 'Serious injury or fatality',
      mandatoryControls:
        'Ensure work near void areas are protected with void covers/platforms or fall guard rail in place. Clear fall zone. Secure and stable scaffolding/trestles. Ladders industrial rated and in good condition, set up on stable surface as per manufacturer instructions, do not stand on top two rungs. Prefer trestles or platforms over ladders.',
      verificationMethod: 'Pre-start inspection of void protection and access equipment',
      responsibleRole: 'Supervisor / All Workers',
      flags: ['critical', 'mandatory'],
    },
    {
      id: 'cc2',
      criticalRisk: 'Unintended nail gun discharge',
      possibleOutcome: 'Penetrating injury',
      mandatoryControls:
        'Bump-fire mode only used for flooring if applicable. Trigger lock in place when gun not in use. Airline disconnected or battery removed when moving from work zones or for maintenance. Safety glasses must be worn when operating, reloading or servicing.',
      verificationMethod: 'Pre-use check of mode and lock',
      responsibleRole: 'Operator',
      flags: ['critical', 'mandatory'],
    },
    {
      id: 'cc3',
      criticalRisk: 'Dust exposure (wood / cement sheeting)',
      possibleOutcome: 'Respiratory disease',
      mandatoryControls:
        'Correct dust mask and vacuum extraction system in place for cutting saw. Wood plane to have dust bag fitted when in use. Keep fingers/hands away from rotating parts. P2 mask when generating dust. Complete silica statement if applicable.',
      verificationMethod: 'Dust control equipment check',
      responsibleRole: 'All Workers',
      flags: ['mandatory'],
    },
    {
      id: 'cc4',
      criticalRisk: 'Injury from power tools',
      possibleOutcome: 'Laceration, eye injury, noise damage',
      mandatoryControls:
        'All electrical equipment tagged & tested. Tools in good condition. Guards in place and operational. Prefer battery powered tools. Eye and hearing protection. Competent operators only.',
      verificationMethod: 'Pre-use inspection',
      responsibleRole: 'Operator',
      flags: ['critical'],
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
      item: 'Circular Saw / Power Tools / Wood Plane',
      requirement: 'Guards operational, dust bag/extraction, competent operators',
      inspectionRequired: 'Yes – before each use',
      notes: 'Keep hands away from rotating parts',
    },
  ],
  ppeRows: [
    { item: 'Safety helmet', requirement: 'At all times on site' },
    { item: 'Steel-capped safety boots', requirement: 'At all times on site' },
    { item: 'Hi-vis long-sleeve clothing', requirement: 'At all times on site' },
    { item: 'Safety glasses / goggles', requirement: 'When using power tools or nail guns' },
    { item: 'Hearing protection', requirement: 'When using power tools or nail guns' },
    { item: 'Task-specific gloves', requirement: 'When handling materials or tools' },
    { item: 'P2 dust mask', requirement: 'When cutting or generating dust' },
    { item: 'Safety harness + lanyard', requirement: 'When working at heights where fall protection cannot be eliminated' },
    { item: 'Sunscreen + hat', requirement: 'Outdoor work' },
  ],
  workSteps: [
    {
      id: 's1',
      sequenceNumber: 1,
      sequenceOfWork: 'Toolbox Talk & Pre-start',
      hazardsAndRisks: 'Workers unaware of risks, unfit for duty, weather',
      possibleConsequence: 'Injury, poor decisions',
      initialRisk: 'high',
      controlMeasures:
        'Stop-Plan-Do process. Fitness for work check. Review emergency response. Discuss weather, manual handling and contingency plan. All workers sign onto SWMS.',
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
      hazardsAndRisks: 'Electrocution, slips, trips, lacerations, fall from heights, piercing from nail guns',
      possibleConsequence: 'Injury, electrocution',
      initialRisk: 'high',
      controlMeasures:
        'All electrical equipment tagged & tested. All hand tools in good condition. PPE in good order. Checklist completed for all mechanical equipment. Prefer battery powered tools. All guarding in place and operational. Trestles and ladders industrial grade.',
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
      sequenceOfWork: 'Manage work zone',
      hazardsAndRisks: 'Injury from mechanical failure, trip, slip, crushing hazards, inhaling fine dust',
      possibleConsequence: 'Injury, respiratory exposure',
      initialRisk: 'medium',
      controlMeasures:
        'Communicate with other people on site. Ensure pathways are clear. Site is trade ready. Correct dust mask and vacuum extraction system in place for cutting saw. Wood plane to have dust bag fitted when in use. Keep fingers/hands away from rotating parts.',
      residualRisk: 'low',
      responsiblePerson: 'Supervisor / All Workers',
      isCriticalControl: false,
      monitoringMethod: 'Ongoing visual',
      stopWorkTrigger: 'Blocked access or uncontrolled dust',
      linkedPermit: '',
      linkedSwms: '',
      evidenceRequired: '',
      notes: '',
    },
    {
      id: 's4',
      sequenceNumber: 4,
      sequenceOfWork: 'Materials layout and handling',
      hazardsAndRisks: 'Obstruction to access, slip & trip hazards, strain, sprains, crush type injuries',
      possibleConsequence: 'Injury',
      initialRisk: 'high',
      controlMeasures:
        'Coordinate with site supervisor. Avoid placement of materials in access paths or doorways. Plan clear path to transfer materials. Correct lifting techniques as required. Work on trestles not to exceed 2 m in height. Precautions when trimming cement sheeting products – refer to supplier SDS.',
      residualRisk: 'low',
      responsiblePerson: 'All Workers',
      isCriticalControl: false,
      monitoringMethod: 'Buddy observation',
      stopWorkTrigger: 'Excessive force or awkward posture',
      linkedPermit: '',
      linkedSwms: 'Manual Handling and Housekeeping',
      evidenceRequired: '',
      notes: '',
    },
    {
      id: 's5',
      sequenceNumber: 5,
      sequenceOfWork: 'Air nail gun use (HR)',
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
      sequenceOfWork: 'Working at heights (HR)',
      hazardsAndRisks: 'Fall from heights & Falls',
      possibleConsequence: 'Serious injury or fatality',
      initialRisk: 'extreme',
      controlMeasures:
        'Ensure work near void areas are protected and void covers/platforms or fall guard rail is in place. Ladders must be industrial rated and in good condition, set up on stable surface as per manufacturer\'s instructions, do not stand on top two rungs. Prefer trestles or platforms.',
      residualRisk: 'low',
      responsiblePerson: 'All Workers + Supervisor',
      isCriticalControl: true,
      monitoringMethod: 'Void protection and access equipment inspection',
      stopWorkTrigger: 'Missing void protection or unstable access',
      linkedPermit: '',
      linkedSwms: 'Working at Heights',
      evidenceRequired: '',
      notes: '',
    },
    {
      id: 's7',
      sequenceNumber: 7,
      sequenceOfWork: 'Spoils management & clean-up',
      hazardsAndRisks: 'Trip hazards, slips, falls, manual handling, security',
      possibleConsequence: 'Injury, security risk',
      initialRisk: 'medium',
      controlMeasures:
        'Pick up larger trimmed pieces and dispose into spoils cage. Wet sweep floor area. Put lightweight waste into cage/bins. Ensure spoils are outside fall zones. Gates closed. Area left tidy and secure.',
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
      description: 'Barricade potential drop zones and keep other trades clear of active lockup works',
    },
    {
      id: 'tr2',
      type: 'Dust-control requirements',
      description: 'Dust mask + extraction for cutting. Complete silica statement if cement sheeting is cut',
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
      description: 'Minimise dust. Vacuum extraction preferred. P2 mask when generating dust.',
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
  const info = await getPlatformOwnerInfo(req);
  if (!info) return res.status(401).json({ error: 'Unauthorised' });
  if (!info.isPlatformOwner) return res.status(403).json({ error: 'Platform owner access required' });

  const replace = req.query.replace === '1' || req.body?.replace === true;

  try {
    const title = CARPENTER_LOCKUP_SWMS.title;
    const swmsBodyJson = JSON.stringify(CARPENTER_LOCKUP_SWMS);
    const safe = (s) => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");

    // Check if a platform master already exists for this title
    const [existing] = await db.execute(sql.raw(
      `SELECT id FROM swms_templates WHERE company_id IS NULL AND is_platform_master = 1 AND title = ${JSON.stringify(title)} LIMIT 1`
    ));

    const existingId = existing?.[0]?.id;

    if (existingId && replace) {
      await db.execute(sql.raw(`
        UPDATE swms_templates SET
          swms_body = '${safe(swmsBodyJson)}',
          build_mode = 'advanced',
          document_type = 'swms',
          is_platform_master = 1,
          status = 'draft',
          updated_at = NOW()
        WHERE id = ${existingId}
      `));
      return res.json({ ok: true, action: 'updated', id: existingId });
    }

    if (existingId) {
      return res.json({ ok: true, action: 'skipped', id: existingId });
    }

    // Insert new platform master (company_id = NULL)
    const [result] = await db.execute(sql.raw(`
      INSERT INTO swms_templates
        (company_id, title, category, revision_number, author_name, approved_by_name,
         status, build_mode, document_type, swms_body, is_platform_master, created_at, updated_at)
      VALUES (
        NULL,
        '${safe(title)}',
        'General Construction / Site Works',
        '1',
        'Site Supervisor / IWILLBUILD',
        'Principal Contractor',
        'draft',
        'advanced',
        'swms',
        '${safe(swmsBodyJson)}',
        1,
        NOW(), NOW()
      )
    `));

    return res.json({ ok: true, action: 'inserted', id: result?.insertId ?? null });
  } catch (err) {
    console.error('seed error:', err);
    return res.status(500).json({ error: String(err) });
  }
}
