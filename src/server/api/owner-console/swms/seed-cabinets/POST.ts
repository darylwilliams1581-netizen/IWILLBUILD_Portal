/**
 * POST /api/owner-console/swms/seed-cabinets
 * Pushes the Cabinets Installation structured SWMS to all active companies.
 * Platform owner only. Add ?replace=1 to overwrite existing records.
 */
import type { Request, Response } from 'express';
import { db } from '../../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getPlatformOwnerInfo } from '../../../../lib/platform-owner-guard.js';

const CABINETS_SWMS = {
  buildMode: 'advanced',
  documentType: 'swms',
  title: 'Cabinets Installation',
  category: 'Cabinetry / Joinery / Fit-Out',
  revisionNumber: '1',
  reviewDate: '2026-07-13',
  authorName: 'Site Supervisor / Williams Constructions NQ',
  approvedByName: 'Principal Contractor',
  status: 'draft',
  purpose:
    'This Safe Work Method Statement identifies the hazards, risks and control measures for cabinets installation works including materials handling, power tools, trimming, dust control and working at heights. It aims to eliminate or minimise risks so far as is reasonably practicable.',
  scope:
    'Applies to all workers undertaking cabinets, joinery and fit-out installation, materials layout and handling, use of power tools, trimming/in-situ modifications, dust control and working at heights on construction sites. Includes preparation, core installation activities and clean-up.',
  includedActivities: [
    'Toolbox talk and pre-start',
    'Pre-operational equipment checks',
    'Work zone management',
    'Materials layout and handling',
    'Trimming and in-situ modifications',
    'Power tool use',
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
    'Site-specific cabinet installation areas only. Coordinate with principal contractor for access and other trades. Stop work immediately if controls cannot be maintained.',
  hrcwApplies: 'yes',
  hrcwCategories: [
    {
      id: 'h1',
      category: 'Work on or near energised electrical installations or services',
      whyApplies: 'Possible work near electrical services during installation',
      linkedWorkStep: 'Work zone management',
      requiredPermit: '',
      relatedSwms: 'Working On or Near Exposed Live Parts',
    },
    {
      id: 'h2',
      category: 'Crystalline Silica (RCS) exposure',
      whyApplies: 'Possible cutting or grinding of materials that may contain crystalline silica',
      linkedWorkStep: 'Trimming and power tools',
      requiredPermit: 'Silica statement (Appendix 1)',
      relatedSwms: 'Silica Dust Exposure',
    },
    {
      id: 'h3',
      category: 'Risk of a person falling more than 2 metres',
      whyApplies: 'Working from trestles or elevated positions during installation',
      linkedWorkStep: 'Working at heights',
      requiredPermit: '',
      relatedSwms: 'Working at Heights',
    },
  ],
  criticalControls: [
    {
      id: 'cc1',
      criticalRisk: 'Fine MDF / wood dust exposure',
      possibleOutcome: 'Respiratory irritation, long-term lung disease',
      mandatoryControls:
        'P2 dust masks mandatory when generating dust. Vacuum extraction system must be in place. Work in well-ventilated area. Use filtered vacuum for clean-up of MDF particles. Eye and hearing protection.',
      verificationMethod: 'Dust control equipment + respirator check',
      responsibleRole: 'All Workers',
      flags: ['critical', 'mandatory'],
    },
    {
      id: 'cc2',
      criticalRisk: 'Injury from power tools / trimming',
      possibleOutcome: 'Laceration, eye injury, noise damage',
      mandatoryControls:
        'Competent operators only. All guarding in place and operational. Correct blades/bits/discs. Eye, hearing and hand protection. Surrounding area clear of other persons.',
      verificationMethod: 'Pre-use inspection',
      responsibleRole: 'Operator',
      flags: ['critical'],
    },
    {
      id: 'cc3',
      criticalRisk: 'Fall from heights',
      possibleOutcome: 'Serious injury or fatality',
      mandatoryControls:
        'Clear fall zone. Secure and stable scaffolding or trestles fit for purpose. Ladders for minor short-term works only.',
      verificationMethod: 'Pre-start inspection of access equipment',
      responsibleRole: 'Supervisor / All Workers',
      flags: ['critical', 'mandatory'],
    },
    {
      id: 'cc4',
      criticalRisk: 'Manual handling injury',
      possibleOutcome: 'Strain, sprain, crush injury',
      mandatoryControls:
        'Plan clear path. Correct lifting techniques. Team lift awkward or heavy items. Mechanical aids where practicable.',
      verificationMethod: 'Buddy observation',
      responsibleRole: 'All Workers',
      flags: ['critical'],
    },
  ],
  plantItems: [
    {
      id: 'p1',
      item: 'Circular Saw / Drill / Power Tools',
      requirement: 'Guards operational, dust extraction preferred, competent operators, P2 mask',
      inspectionRequired: 'Yes – before each use',
      notes: 'Vacuum extraction for MDF dust',
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
    { item: 'Safety glasses / goggles', requirement: 'When using power tools or generating dust' },
    { item: 'Hearing protection', requirement: 'When using power tools' },
    { item: 'Task-specific gloves', requirement: 'When handling materials or tools' },
    { item: 'P2 dust mask / respirator', requirement: 'When cutting, trimming or generating MDF/wood dust' },
    { item: 'Sunscreen + hat', requirement: 'Outdoor work if applicable' },
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
      hazardsAndRisks: 'Defective tools, missing guards, unsuitable access equipment',
      possibleConsequence: 'Laceration, fall, equipment failure',
      initialRisk: 'high',
      controlMeasures:
        'Inspect all power tools before use — guards in place, blades/bits correct and sharp, cords undamaged. Inspect trestles and scaffolding for stability and damage. Tag out and remove any defective equipment.',
      residualRisk: 'low',
      responsiblePerson: 'Operator / Supervisor',
      isCriticalControl: true,
      monitoringMethod: 'Pre-use checklist',
      stopWorkTrigger: 'Any defective tool or access equipment',
      linkedPermit: '',
      linkedSwms: '',
      evidenceRequired: 'Pre-start checklist completed',
      notes: '',
    },
    {
      id: 's3',
      sequenceNumber: 3,
      sequenceOfWork: 'Work zone management',
      hazardsAndRisks: 'Other trades, electrical services, trip hazards, falling objects',
      possibleConsequence: 'Collision, electrocution, trip/fall injury',
      initialRisk: 'high',
      controlMeasures:
        'Identify and mark electrical services before drilling or cutting. Isolate work zone from other trades where practicable. Maintain clear access and egress. Housekeeping maintained throughout. Hi-vis worn at all times.',
      residualRisk: 'low',
      responsiblePerson: 'Supervisor / All Workers',
      isCriticalControl: false,
      monitoringMethod: 'Ongoing observation',
      stopWorkTrigger: 'Uncontrolled access by other trades or unidentified services',
      linkedPermit: '',
      linkedSwms: 'Working On or Near Exposed Live Parts',
      evidenceRequired: '',
      notes: '',
    },
    {
      id: 's4',
      sequenceNumber: 4,
      sequenceOfWork: 'Materials layout and handling',
      hazardsAndRisks: 'Strain, sprain, crush injury from heavy or awkward cabinet panels',
      possibleConsequence: 'Musculoskeletal injury, crush injury',
      initialRisk: 'high',
      controlMeasures:
        'Plan clear path before moving materials. Use correct manual handling techniques — bend knees, keep load close. Team lift for heavy or awkward panels. Use trolleys or mechanical aids where practicable. Stack materials safely and securely.',
      residualRisk: 'low',
      responsiblePerson: 'All Workers',
      isCriticalControl: true,
      monitoringMethod: 'Buddy observation',
      stopWorkTrigger: 'Lift is too heavy or awkward for available team — stop and reassess',
      linkedPermit: '',
      linkedSwms: 'Manual Handling and Housekeeping',
      evidenceRequired: '',
      notes: '',
    },
    {
      id: 's5',
      sequenceNumber: 5,
      sequenceOfWork: 'Trimming and in-situ modifications (power tools)',
      hazardsAndRisks: 'Laceration, eye injury, noise, MDF/wood dust, silica dust',
      possibleConsequence: 'Serious laceration, respiratory disease, hearing damage',
      initialRisk: 'extreme',
      controlMeasures:
        'Competent operators only. Guards in place and operational. Correct blade/bit for material. P2 dust mask mandatory. Safety glasses and hearing protection mandatory. Vacuum extraction connected where possible. Surrounding area clear of other persons. Do not remove guards. Check for services before cutting.',
      residualRisk: 'low',
      responsiblePerson: 'Operator',
      isCriticalControl: true,
      monitoringMethod: 'Supervisor observation + PPE check',
      stopWorkTrigger: 'Guard removed, PPE not worn, or unidentified services in cut path',
      linkedPermit: '',
      linkedSwms: 'Silica Dust Exposure',
      evidenceRequired: '',
      notes: '',
    },
    {
      id: 's6',
      sequenceNumber: 6,
      sequenceOfWork: 'Working at heights (trestles / scaffolding)',
      hazardsAndRisks: 'Falls from elevated work positions',
      possibleConsequence: 'Serious injury or fatality',
      initialRisk: 'extreme',
      controlMeasures:
        'Use industrial-grade trestles or scaffolding — not domestic grade. Inspect before use. Ensure stable, level footing. Do not overreach — reposition platform instead. Ladders for minor short-term access only. Clear fall zone below work area.',
      residualRisk: 'low',
      responsiblePerson: 'Supervisor / All Workers',
      isCriticalControl: true,
      monitoringMethod: 'Pre-start inspection + ongoing observation',
      stopWorkTrigger: 'Unstable platform, overreaching or fall zone not clear',
      linkedPermit: '',
      linkedSwms: 'Working at Heights',
      evidenceRequired: 'Access equipment inspection record',
      notes: '',
    },
    {
      id: 's7',
      sequenceNumber: 7,
      sequenceOfWork: 'Spoils management and dust control',
      hazardsAndRisks: 'Trip hazards, dust inhalation, fire risk from sawdust accumulation',
      possibleConsequence: 'Trip/fall injury, respiratory irritation, fire',
      initialRisk: 'medium',
      controlMeasures:
        'Progressive clean-up throughout the day. Use filtered vacuum (not blower) to collect MDF and wood dust. Bag and remove waste regularly. Keep access ways clear. Ensure adequate ventilation in enclosed spaces.',
      residualRisk: 'low',
      responsiblePerson: 'All Workers',
      isCriticalControl: false,
      monitoringMethod: 'Ongoing housekeeping checks',
      stopWorkTrigger: 'Dust accumulation creating slip/fire risk',
      linkedPermit: '',
      linkedSwms: 'Manual Handling and Housekeeping',
      evidenceRequired: '',
      notes: '',
    },
    {
      id: 's8',
      sequenceNumber: 8,
      sequenceOfWork: 'Site clean-up and pack-up',
      hazardsAndRisks: 'Trip, slips, unsecured tools, residual dust',
      possibleConsequence: 'Injury, security risk',
      initialRisk: 'medium',
      controlMeasures:
        'Remove all tools and materials. Final vacuum of dust. Secure and store power tools. Remove waste to designated skip. Ensure work zone is left tidy. Report any damage or defects to supervisor.',
      residualRisk: 'low',
      responsiblePerson: 'All Workers',
      isCriticalControl: false,
      monitoringMethod: 'End-of-shift inspection',
      stopWorkTrigger: 'Unsecured tools or uncontrolled waste',
      linkedPermit: '',
      linkedSwms: '',
      evidenceRequired: '',
      notes: '',
    },
  ],
  taskRequirements: [
    {
      id: 'tr1',
      type: 'Dust control requirements',
      description: 'P2 respirator and vacuum extraction mandatory when cutting or trimming MDF, particleboard or any material that may contain silica',
    },
    {
      id: 'tr2',
      type: 'Service identification',
      description: 'Identify and mark all electrical, plumbing and gas services before drilling or cutting into walls, floors or ceilings',
    },
    {
      id: 'tr3',
      type: 'Access equipment requirements',
      description: 'Industrial-grade trestles or scaffolding required for elevated work — domestic-grade equipment not permitted on site',
    },
  ],
  envControls: [
    {
      type: 'Housekeeping',
      description: 'Progressive clean-up. Keep access ways clear of off-cuts and waste.',
      responsiblePerson: 'All Workers',
    },
    {
      type: 'Waste',
      description: 'Bag and remove timber off-cuts and MDF dust to designated skip. Do not blow dust with compressed air.',
      responsiblePerson: 'All Workers',
    },
    {
      type: 'Dust suppression',
      description: 'Vacuum extraction preferred over dry sweeping. Adequate ventilation in enclosed spaces.',
      responsiblePerson: 'Operator / Supervisor',
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
    { requirement: 'Competency in power tool use', applies: true, evidenceOrAuth: 'Demonstrated or supervised' },
    { requirement: 'Working at heights awareness', applies: true, evidenceOrAuth: '' },
    { requirement: 'Manual handling training', applies: true, evidenceOrAuth: '' },
    { requirement: 'First aid', applies: false, evidenceOrAuth: 'At least one first aider on site preferred' },
  ],
  definitions: [
    {
      id: 'd1',
      term: 'MDF',
      definition: 'Medium Density Fibreboard — contains fine wood fibres and resin binders; dust is a respiratory hazard requiring P2 protection',
    },
    {
      id: 'd2',
      term: 'RCS',
      definition: 'Respirable Crystalline Silica — fine particles released when cutting silica-containing materials; causes silicosis with repeated exposure',
    },
  ],
  relatedDocs: [
    { id: 'rd1', type: 'Related SWMS', document: 'Working at Heights', revision: 'Current', status: 'current' },
    { id: 'rd2', type: 'Related SWMS', document: 'Silica Dust Exposure', revision: 'Current', status: 'current' },
    { id: 'rd3', type: 'Related SWMS', document: 'Manual Handling and Housekeeping', revision: 'Current', status: 'current' },
    { id: 'rd4', type: 'Related SWMS', document: 'Working On or Near Exposed Live Parts', revision: 'Current', status: 'current' },
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
    const title = CABINETS_SWMS.title;
    const swmsBodyJson = JSON.stringify(CABINETS_SWMS);
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
        'Site Supervisor / IWIIlBUILD',
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
