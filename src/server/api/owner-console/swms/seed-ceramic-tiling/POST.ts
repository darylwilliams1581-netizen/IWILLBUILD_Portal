/**
 * POST /api/owner-console/swms/seed-ceramic-tiling
 * Pushes the Ceramic Tiling structured SWMS to all active companies.
 * Platform owner only. Add ?replace=1 to overwrite existing records.
 */
import type { Request, Response } from 'express';
import { db } from '../../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getPlatformOwnerInfo } from '../../../../lib/platform-owner-guard.js';

const CERAMIC_TILING_SWMS = {
  buildMode: 'advanced',
  documentType: 'swms',
  title: 'Ceramic Tiling',
  category: 'Tiling / Finishes',
  revisionNumber: '1',
  reviewDate: '2026-07-13',
  authorName: 'Site Supervisor / Williams Constructions NQ',
  approvedByName: 'Principal Contractor',
  status: 'draft',
  purpose:
    'This Safe Work Method Statement identifies the hazards, risks and control measures for ceramic tiling works including floor and wall tiling, cutting of tiles, adhesives and grout mixing, materials handling, power tools and working at heights. It aims to eliminate or minimise risks so far as is reasonably practicable.',
  scope:
    'Applies to all workers undertaking ceramic, porcelain and similar tiling works (floor and wall), tile cutting, adhesive and grout application, materials handling, use of grinders and power tools, and working at heights on construction sites. Includes preparation, core tiling activities and clean-up.',
  includedActivities: [
    'Toolbox talk and pre-start',
    'Pre-operational equipment checks',
    'Work zone management',
    'Materials layout and handling',
    'Use of fixing adhesives and grout',
    'Trimming / in-situ modifications and grinder use',
    'Working at heights',
    'Work environment (heat)',
    'Spoils management',
    'Site clean-up',
  ],
  excludedActivities: [
    'Deep excavation',
    'Live electrical work without isolation',
    'Dry cutting of engineered stone',
  ],
  workBoundaries:
    'Site-specific tiling areas only. Coordinate with principal contractor for access and other trades. Stop work immediately if controls cannot be maintained.',
  hrcwApplies: 'yes',
  hrcwCategories: [
    {
      id: 'h1',
      category: 'Risk of a person falling more than 2 metres',
      whyApplies: 'Wall tiling and work from trestles or elevated platforms',
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
      whyApplies: 'Cutting, grinding or drilling of tiles, pavers and cement-based products',
      linkedWorkStep: 'Trimming and grinder use',
      requiredPermit: 'Silica statement (Appendix 1)',
      relatedSwms: 'Silica Dust Exposure',
    },
  ],
  criticalControls: [
    {
      id: 'cc1',
      criticalRisk: 'Silica dust from tile cutting and grinding',
      possibleOutcome: 'Silicosis, lung disease',
      mandatoryControls:
        'Dry tile cutter preferred as first option where practicable. P2 dust mask mandatory for any tile grinding or dust generation. Vacuum extraction system in place. Grinders no bigger than 4 inch. Wet methods or Class H extraction preferred. Complete silica statement (Appendix 1). Work in well-ventilated area.',
      verificationMethod: 'Dust control equipment + respirator check',
      responsibleRole: 'All Workers',
      flags: ['critical', 'mandatory'],
    },
    {
      id: 'cc2',
      criticalRisk: 'Fall from heights',
      possibleOutcome: 'Serious injury or fatality',
      mandatoryControls:
        'Clear fall zone. Secure and stable scaffolding or trestles fit for purpose. Prefer trestles or platforms. Ladders for minor short-term works only.',
      verificationMethod: 'Pre-start inspection of access equipment',
      responsibleRole: 'Supervisor / All Workers',
      flags: ['critical', 'mandatory'],
    },
    {
      id: 'cc3',
      criticalRisk: 'Chemical exposure from adhesives and grout',
      possibleOutcome: 'Skin irritation, respiratory irritation, eye injury',
      mandatoryControls:
        'Follow SDS precautions. Minimum gloves and eye protection. Mix adhesives and grout in well-ventilated area. P2 mask when mixing dry ingredients. Use water-based products where practicable.',
      verificationMethod: 'SDS available + PPE check',
      responsibleRole: 'All Workers',
      flags: ['mandatory'],
    },
    {
      id: 'cc4',
      criticalRisk: 'Injury from power tools / grinders',
      possibleOutcome: 'Laceration, eye injury, noise damage',
      mandatoryControls:
        'Competent operators only. All guarding in place and operational. Correct blades/discs. Eye, hearing, hand and P2 protection at all times when using grinders. Surrounding area clear of other persons. Grinders limited to 4 inch maximum.',
      verificationMethod: 'Pre-use inspection',
      responsibleRole: 'Operator',
      flags: ['critical'],
    },
  ],
  plantItems: [
    {
      id: 'p1',
      item: 'Tile Cutter (dry preferred) / Angle Grinder (max 4 inch)',
      requirement: 'Guards operational, P2 mask + extraction or wet methods, competent operators',
      inspectionRequired: 'Yes – before each use',
      notes: 'Dry tile cutter first option; grinders limited to 4 inch',
    },
    {
      id: 'p2',
      item: 'Trestles / Scaffolding',
      requirement: 'Industrial grade, fit for purpose, stable',
      inspectionRequired: 'Yes – before use',
      notes: 'Preferred over ladders',
    },
  ],
  ppeRows: [
    { item: 'Safety helmet', requirement: 'At all times on site' },
    { item: 'Steel-capped safety boots', requirement: 'At all times on site' },
    { item: 'Hi-vis long-sleeve clothing', requirement: 'At all times on site' },
    { item: 'Safety glasses / goggles', requirement: 'When using power tools, grinding or mixing' },
    { item: 'Hearing protection', requirement: 'When using grinders or power tools' },
    { item: 'Task-specific gloves', requirement: 'When handling tiles, adhesives or tools' },
    { item: 'P2 dust mask / respirator', requirement: 'When cutting, grinding or mixing dry products' },
    { item: 'Sunscreen + hat', requirement: 'Outdoor work – reapply as required' },
  ],
  workSteps: [
    {
      id: 's1',
      sequenceNumber: 1,
      sequenceOfWork: 'Toolbox Talk & Pre-start',
      hazardsAndRisks: 'Workers unaware of risks, unfit for duty, weather',
      possibleConsequence: 'Injury, heat illness, poor decisions',
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
      hazardsAndRisks: 'Faulty tools, untagged electrical equipment, missing guards, fall from heights',
      possibleConsequence: 'Electrocution, laceration, fall',
      initialRisk: 'high',
      controlMeasures:
        'Check all electrical equipment tagged & tested and in date. Tools in good condition. PPE in good order. Checklist completed for mechanical equipment. Prefer battery-powered tools. All guarding in place and operational. Trestles and ladders industrial grade and in good condition.',
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
        'Communicate with other people on site. Ensure pathways are clear. Site is trade ready. Dry tile cutter used as first option. P2 dust mask for any tile grinding and vacuum extraction system in place.',
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
      hazardsAndRisks: 'Obstruction to access, slip & trip hazards, materials release, crush injury, lacerations',
      possibleConsequence: 'Injury',
      initialRisk: 'high',
      controlMeasures:
        'Coordinate with site supervisor. Avoid placement of materials in access paths. Plan clear path to transfer materials. Correct lifting techniques. Monitor lifting loads. Take regular breaks and stretches when repetitive lifting. When working off ground use trestles or platform ladder.',
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
      sequenceOfWork: 'Using fixing adhesives and grout',
      hazardsAndRisks: 'Physical reaction from exposure to chemical adhesives',
      possibleConsequence: 'Skin/eye irritation, respiratory irritation',
      initialRisk: 'medium',
      controlMeasures:
        'Use precautions in accordance with Material Safety Data Sheet and required PPE (minimum gloves, eye protection). Mix adhesives and grout in well-ventilated area. Use a P2 mask when mixing dry ingredients.',
      residualRisk: 'low',
      responsiblePerson: 'All Workers',
      isCriticalControl: false,
      monitoringMethod: 'SDS and PPE check',
      stopWorkTrigger: 'Inadequate ventilation or missing PPE',
      linkedPermit: '',
      linkedSwms: '',
      evidenceRequired: 'SDS available',
      notes: '',
    },
    {
      id: 's6',
      sequenceNumber: 6,
      sequenceOfWork: 'Trimming, in-situ modifications / Use of a Grinder',
      hazardsAndRisks: 'Health effects from fine dust exposure, noise and lacerations from machinery',
      possibleConsequence: 'Silicosis, hearing damage, laceration',
      initialRisk: 'high',
      controlMeasures:
        'All persons competent in the use of all power tools. All guarding in place and operational. Ensure blades/bits/disks are fit for purpose. Eye, Hearing, Hand & P2 Dust Masks Protection must be worn at all times. Check surrounding for other persons in work zone. Work in well-ventilated area. Grinders no bigger than 4 inch can be used. Vacuum extraction preferred.',
      residualRisk: 'low',
      responsiblePerson: 'Operator',
      isCriticalControl: true,
      monitoringMethod: 'Pre-use check + dust control verification',
      stopWorkTrigger: 'No extraction, damaged guard or uncontrolled dust',
      linkedPermit: '',
      linkedSwms: 'Use of Power Tools, Silica Dust Exposure',
      evidenceRequired: 'Competency confirmation',
      notes: '',
    },
    {
      id: 's7',
      sequenceNumber: 7,
      sequenceOfWork: 'Working at heights >2 m',
      hazardsAndRisks: 'Fall from heights',
      possibleConsequence: 'Serious injury or fatality',
      initialRisk: 'extreme',
      controlMeasures:
        'Ensure clear area in fall zone. Secure and stable scaffolding/trestles are used and are fit for purpose.',
      residualRisk: 'low',
      responsiblePerson: 'All Workers + Supervisor',
      isCriticalControl: true,
      monitoringMethod: 'Access equipment inspection',
      stopWorkTrigger: 'Unstable access or missing fall protection',
      linkedPermit: '',
      linkedSwms: 'Working at Heights',
      evidenceRequired: '',
      notes: '',
    },
    {
      id: 's8',
      sequenceNumber: 8,
      sequenceOfWork: 'Work environment – high heat',
      hazardsAndRisks: 'Heat stress, exhaustion, dehydration',
      possibleConsequence: 'Heat illness, collapse',
      initialRisk: 'high',
      controlMeasures:
        'Correct PPE & safety equipment. Drink plenty of fluids and take regular breaks. On hot days regularly hydrate. Be aware of heat health signs (confusion, slow or slurring speech, no sweat, nausea etc.). Rotate tasks and use shade where possible.',
      residualRisk: 'low',
      responsiblePerson: 'All Workers + Supervisor',
      isCriticalControl: false,
      monitoringMethod: 'Buddy checks + weather monitoring',
      stopWorkTrigger: 'Signs of heat illness or extreme conditions',
      linkedPermit: '',
      linkedSwms: 'Heat Stress, Remote Conditions & Fitness for Work',
      evidenceRequired: '',
      notes: '',
    },
    {
      id: 's9',
      sequenceNumber: 9,
      sequenceOfWork: 'Spoils management & clean-up',
      hazardsAndRisks: 'Trip hazards, residual dust',
      possibleConsequence: 'Injury, secondary dust exposure',
      initialRisk: 'medium',
      controlMeasures:
        'Pick up larger trimmed pieces and dispose into spoils cage. Sweep work zone area. Put lightweight waste into cage/bins. Ensure spoils are outside fall zones. Gates closed. Area left tidy and secure.',
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
      type: 'Dust-control requirements',
      description: 'Dry tile cutter preferred. P2 mask + vacuum extraction for grinding. Grinders max 4 inch. Complete silica statement.',
    },
    {
      id: 'tr2',
      type: 'Exclusion-zone requirements',
      description: 'Keep other trades clear of active cutting and grinding areas',
    },
  ],
  envControls: [
    {
      type: 'Housekeeping',
      description: 'Progressive clean-up of tile offcuts and spoils. Keep access ways clear.',
      responsiblePerson: 'All Workers',
    },
    {
      type: 'Waste',
      description: 'Lightweight waste into bins/cages. Spoils managed so they do not enter drains or leave site.',
      responsiblePerson: 'All Workers',
    },
    {
      type: 'Dust',
      description: 'Minimise dust. Prefer dry tile cutter or wet methods + extraction. P2 mask mandatory for dust-generating tasks.',
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
      term: 'Dry tile cutter',
      definition: 'Preferred method for cutting tiles that generates less respirable dust than grinding when used correctly',
    },
  ],
  relatedDocs: [
    { id: 'rd1', type: 'Related SWMS', document: 'Manual Handling and Housekeeping', revision: 'Current', status: 'current' },
    { id: 'rd2', type: 'Related SWMS', document: 'Use of Power Tools', revision: 'Current', status: 'current' },
    { id: 'rd3', type: 'Related SWMS', document: 'Silica Dust Exposure', revision: 'Current', status: 'current' },
    { id: 'rd4', type: 'Related SWMS', document: 'Working at Heights', revision: 'Current', status: 'current' },
    { id: 'rd5', type: 'Related SWMS', document: 'Heat Stress, Remote Conditions & Fitness for Work', revision: 'Current', status: 'current' },
    { id: 'rd6', type: 'Other', document: 'High Risk Crystalline Silica Statement (Appendix 1)', revision: '2024', status: 'current' },
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
    const title = CERAMIC_TILING_SWMS.title;
    const swmsBodyJson = JSON.stringify(CERAMIC_TILING_SWMS);
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
        'Site Supervisor / IWIllBUIlD',
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
