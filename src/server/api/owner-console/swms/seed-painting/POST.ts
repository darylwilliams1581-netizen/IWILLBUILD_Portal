/**
 * POST /api/owner-console/swms/seed-painting
 * Pushes the Painting Internal / External structured SWMS to all active companies.
 * Platform owner only. Add ?replace=1 to overwrite existing records.
 */
import type { Request, Response } from 'express';
import { db } from '../../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getPlatformOwnerInfo } from '../../../../lib/platform-owner-guard.js';

const PAINTING_SWMS = {
  buildMode: 'advanced',
  documentType: 'swms',
  title: 'Painting Internal / External',
  category: 'Painting / Finishes',
  revisionNumber: '1',
  reviewDate: '2026-07-13',
  authorName: 'Site Supervisor / Williams Constructions NQ',
  approvedByName: 'Principal Contractor',
  status: 'draft',
  purpose:
    'This Safe Work Method Statement identifies the hazards, risks and control measures for internal and external painting works including surface preparation, painting, spray application, materials handling, power tools and working at heights. It aims to eliminate or minimise risks so far as is reasonably practicable.',
  scope:
    'Applies to all workers undertaking internal and external painting, surface preparation, sanding, spray painting, use of extension poles, trestles and scaffolds, materials handling and clean-up on construction sites. Includes preparation, core painting activities and clean-up.',
  includedActivities: [
    'Toolbox talk and pre-start',
    'Pre-operational equipment checks',
    'Work zone management',
    'Using powered equipment (mixing, sanding, spray)',
    'Materials handling',
    'Working at heights',
    'Paints clean-up',
    'Site clean-up',
  ],
  excludedActivities: [
    'Deep excavation',
    'Live electrical work without isolation',
    'Hot work without permit',
  ],
  workBoundaries:
    'Site-specific painting areas only. Coordinate with principal contractor for access, other trades and void protection. Stop work immediately if controls cannot be maintained.',
  hrcwApplies: 'yes',
  hrcwCategories: [
    {
      id: 'h1',
      category: 'Risk of a person falling more than 2 metres',
      whyApplies: 'Painting from trestles, scaffolds, ladders or in stairwells and voids',
      linkedWorkStep: 'Working at heights',
      requiredPermit: '',
      relatedSwms: 'Working at Heights',
    },
    {
      id: 'h2',
      category: 'Work on or near energised electrical installations or services',
      whyApplies: 'Possible contact with electrical fittings or wiring during painting',
      linkedWorkStep: 'Work zone management',
      requiredPermit: '',
      relatedSwms: 'Working On or Near Exposed Live Parts',
    },
    {
      id: 'h3',
      category: 'Work on, in or adjacent to a road or other traffic corridor',
      whyApplies: 'External painting near traffic or public areas',
      linkedWorkStep: 'Work zone management',
      requiredPermit: 'Traffic management if required',
      relatedSwms: 'Traffic Management / Working Near Roads',
    },
    {
      id: 'h4',
      category: 'Crystalline Silica (RCS) exposure',
      whyApplies: 'Possible sanding of surfaces or cutting that generates silica dust',
      linkedWorkStep: 'Powered equipment / sanding',
      requiredPermit: 'Silica statement (Appendix 1) if applicable',
      relatedSwms: 'Silica Dust Exposure',
    },
  ],
  criticalControls: [
    {
      id: 'cc1',
      criticalRisk: 'Fall from heights',
      possibleOutcome: 'Serious injury or fatality',
      mandatoryControls:
        'Use extension poles where practicable so work can be performed from ground level. Scaffolding or trestles preferred. Ladders secured and extend 900 mm past top of anchor point; do not use top two rungs. Do not carry paint tins while climbing ladders. All work in void areas including stairwells must be completed from a scaffold system (void platform or scaffold). Check all scaffold systems before use – any missing components or if it feels unsafe do not use and report to site supervisor.',
      verificationMethod: 'Pre-start inspection of access equipment and void protection',
      responsibleRole: 'Supervisor / All Workers',
      flags: ['critical', 'mandatory'],
    },
    {
      id: 'cc2',
      criticalRisk: 'Electric shock from electrical fittings or wiring',
      possibleOutcome: 'Electrocution or serious injury',
      mandatoryControls:
        'Do not remove any electrical fittings. Isolate any loose wiring and report to site supervisors. Treat all electrical wiring as live – do not touch.',
      verificationMethod: 'Visual check and report of any loose wiring',
      responsibleRole: 'All Workers',
      flags: ['critical', 'mandatory'],
    },
    {
      id: 'cc3',
      criticalRisk: 'Exposure to paint mist, vapours and chemicals',
      possibleOutcome: 'Respiratory irritation, skin/eye injury, fire risk',
      mandatoryControls:
        'Work in adequately ventilated areas. Use low mist/vapour release paints and cleaners where practicable. Water wash-up preferred. Ensure air filters operational on face mask and mask correctly fitted when spraying. Caution: airless paint sprayers can cause significant hydro-injection injuries. Fire extinguisher available for spray work.',
      verificationMethod: 'Ventilation check + PPE and SDS',
      responsibleRole: 'All Workers',
      flags: ['critical'],
    },
    {
      id: 'cc4',
      criticalRisk: 'Injury from powered spray or sanding equipment',
      possibleOutcome: 'Hydro-injection injury, laceration, dust exposure',
      mandatoryControls:
        'Trained personnel only for mechanical equipment. All guarding and locking mechanisms remain in place. Disconnect air lines when moving equipment. Battery operated equipment preferred where available. Ensure air filters operational.',
      verificationMethod: 'Pre-use inspection',
      responsibleRole: 'Operator',
      flags: ['critical'],
    },
  ],
  plantItems: [
    {
      id: 'p1',
      item: 'Airless Paint Sprayer / Spray Equipment',
      requirement: 'Trained operators only, air filters operational, disconnect air lines when moving, fire extinguisher available',
      inspectionRequired: 'Yes – before each use',
      notes: 'Hydro-injection injury risk – never point at body',
    },
    {
      id: 'p2',
      item: 'Sanders / Power Tools / Generators',
      requirement: 'Guards and locking mechanisms in place, battery preferred, trained operators',
      inspectionRequired: 'Yes – before each use',
      notes: '',
    },
    {
      id: 'p3',
      item: 'Trestles / Scaffold / Extension Poles',
      requirement: 'Industrial grade, fit for purpose, void platforms locked in place',
      inspectionRequired: 'Yes – before use',
      notes: 'Prefer extension poles and ground-level work',
    },
  ],
  ppeRows: [
    { item: 'Safety helmet', requirement: 'At all times on site' },
    { item: 'Steel-capped safety boots', requirement: 'At all times on site' },
    { item: 'Hi-vis long-sleeve clothing', requirement: 'At all times on site' },
    { item: 'Safety glasses / goggles', requirement: 'When spraying, sanding or mixing' },
    { item: 'Hearing protection', requirement: 'When using noisy power tools' },
    { item: 'Task-specific gloves', requirement: 'When handling paints, solvents or tools' },
    { item: 'Respiratory protection (P2 or higher / air-fed as required)', requirement: 'When spraying or sanding' },
    { item: 'Sunscreen + hat', requirement: 'Outdoor work – reapply as required' },
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
        'Stop-Plan-Do process. Fitness for work check. Review emergency response. Discuss weather, manual handling, chemical hazards and contingency plan. All workers sign onto SWMS.',
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
      hazardsAndRisks: 'Injury from equipment failure or unsuitable equipment',
      possibleConsequence: 'Injury, equipment failure',
      initialRisk: 'high',
      controlMeasures:
        'Ensure all equipment is fit for purpose (ladders, powered equipment, electrical leads tested and tagged, filters in place and clean). All pressure lines and connections in good condition.',
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
      hazardsAndRisks: 'Injury from mechanical failure, trip, slip, crushing hazards, spills, exposure to spray/paint mist, electric shock',
      possibleConsequence: 'Injury, chemical exposure, electrocution',
      initialRisk: 'high',
      controlMeasures:
        'Clear work zone of debris. Isolate work zone from other people. Work in adequately vented areas. Use low mist/vapour release paints and cleaners. Water wash-up where practical. Ensure housekeeping is in place and maintained. Do not remove electrical fittings. Isolate any loose wiring and report to site supervisors. Treat all electrical wiring as live – do not touch.',
      residualRisk: 'low',
      responsiblePerson: 'Supervisor / All Workers',
      isCriticalControl: true,
      monitoringMethod: 'Ongoing visual + ventilation check',
      stopWorkTrigger: 'Poor ventilation, people in spray zone or loose wiring',
      linkedPermit: '',
      linkedSwms: '',
      evidenceRequired: '',
      notes: '',
    },
    {
      id: 's4',
      sequenceNumber: 4,
      sequenceOfWork: 'Using powered equipment (mixing, sanding, spray equipment)',
      hazardsAndRisks: 'Electrocution, entanglement, hydro-injection injury, dust, paint mist',
      possibleConsequence: 'Injury, chemical exposure',
      initialRisk: 'high',
      controlMeasures:
        'Use battery operated equipment where available. All guarding and locking mechanisms remain in place and operational. Trained personnel only for mechanical equipment. Where spray equipment is used disconnect air lines when moving equipment around. Ensure air filters are operational on face mask and mask is correctly fitted. Caution: airless paint sprayers can cause significant hydro-injection injuries into soft tissue. Never point spray gun at body.',
      residualRisk: 'low',
      responsiblePerson: 'Operator',
      isCriticalControl: true,
      monitoringMethod: 'Pre-use check + observation',
      stopWorkTrigger: 'Damaged equipment or missing PPE',
      linkedPermit: '',
      linkedSwms: 'Use of Power Tools',
      evidenceRequired: 'Competency confirmation',
      notes: '',
    },
    {
      id: 's5',
      sequenceNumber: 5,
      sequenceOfWork: 'Materials handling',
      hazardsAndRisks: 'Strain & sprains',
      possibleConsequence: 'Musculoskeletal injury',
      initialRisk: 'medium',
      controlMeasures:
        'Plan clear path to transfer materials. Correct lifting techniques as required. Team lift awkward materials.',
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
      id: 's6',
      sequenceNumber: 6,
      sequenceOfWork: 'Working at heights',
      hazardsAndRisks: 'Falls from height',
      possibleConsequence: 'Serious injury or fatality',
      initialRisk: 'extreme',
      controlMeasures:
        'Use extension poles where practicable so work can be performed from ground level. Scaffolding or trestles to be used. Ensure ladders are secured and extend 900 mm past top of anchor point or rung above 2nd from top is not used. Do not carry paint tins whilst climbing ladders. Ensure void protection and handrails are in place where required. All work in void areas including stairwells must be completed from a scaffold system (void platform or scaffold). Check all scaffold systems before use – any missing components or if it feels unsafe do not use and report to site supervisor.',
      residualRisk: 'low',
      responsiblePerson: 'All Workers + Supervisor',
      isCriticalControl: true,
      monitoringMethod: 'Access equipment and void protection inspection',
      stopWorkTrigger: 'Unstable access, missing components or weather',
      linkedPermit: '',
      linkedSwms: 'Working at Heights',
      evidenceRequired: '',
      notes: '',
    },
    {
      id: 's7',
      sequenceNumber: 7,
      sequenceOfWork: 'Paints clean-up and site clean-up',
      hazardsAndRisks: 'Health effects from substance exposure, trip, slips, falls, manual handling, security, environmental harm',
      possibleConsequence: 'Injury, pollution',
      initialRisk: 'medium',
      controlMeasures:
        'Use water-based paints as first preference. Clean up on site away from footpath and driveway areas. Do not clean painting equipment into storm water drains or allow paint washout to run off site. Ensure gates are closed. Area left tidy and secure.',
      residualRisk: 'low',
      responsiblePerson: 'All Workers',
      isCriticalControl: false,
      monitoringMethod: 'End-of-day inspection',
      stopWorkTrigger: 'Uncontrolled waste or runoff risk',
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
      description: 'Isolate work zone from other people during spraying or sanding',
    },
    {
      id: 'tr2',
      type: 'Dust-control requirements',
      description: 'Adequate ventilation and respiratory protection when sanding or spraying',
    },
  ],
  envControls: [
    {
      type: 'Housekeeping',
      description: 'Progressive clean-up. Keep access ways and fall zones clear.',
      responsiblePerson: 'All Workers',
    },
    {
      type: 'Waste',
      description: 'Do not clean equipment into stormwater drains. Prevent paint washout running off site.',
      responsiblePerson: 'All Workers',
    },
    {
      type: 'Hazardous waste',
      description: 'Dispose of paint waste and solvent containers correctly. Prefer water-based products.',
      responsiblePerson: 'Supervisor',
    },
  ],
  emergencyActions: [
    { id: 'e1', action: 'Stop work immediately' },
    { id: 'e2', action: 'Make the area safe if safe to do so' },
    { id: 'e3', action: 'Provide first aid / call 000 for serious injury or hydro-injection injury' },
    { id: 'e4', action: 'Notify Site Supervisor and Principal Contractor immediately' },
    { id: 'e5', action: 'Preserve the incident scene where required' },
    { id: 'e6', action: 'Do not restart work until controls reviewed and workers re-briefed' },
  ],
  emergencyModules: [],
  competencyRows: [
    { requirement: 'White Card / General Construction Induction', applies: true, evidenceOrAuth: 'Current card' },
    { requirement: 'Site induction', applies: true, evidenceOrAuth: 'Site-specific' },
    { requirement: 'Power tool / spray equipment competency', applies: true, evidenceOrAuth: 'Trained/supervised' },
    { requirement: 'Working at heights awareness', applies: true, evidenceOrAuth: '' },
    { requirement: 'First aid', applies: false, evidenceOrAuth: '' },
    { requirement: 'Respirator fit testing', applies: false, evidenceOrAuth: 'If tight-fitting respirator required' },
  ],
  definitions: [
    {
      id: 'd1',
      term: 'Hydro-injection injury',
      definition: 'High-pressure paint injection into soft tissue from airless sprayer – medical emergency',
    },
  ],
  relatedDocs: [
    { id: 'rd1', type: 'Related SWMS', document: 'Manual Handling and Housekeeping', revision: 'Current', status: 'current' },
    { id: 'rd2', type: 'Related SWMS', document: 'Use of Power Tools', revision: 'Current', status: 'current' },
    { id: 'rd3', type: 'Related SWMS', document: 'Working at Heights', revision: 'Current', status: 'current' },
    { id: 'rd4', type: 'Related SWMS', document: 'Silica Dust Exposure', revision: 'Current', status: 'current' },
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
    const title = PAINTING_SWMS.title;
    const swmsBodyJson = JSON.stringify(PAINTING_SWMS);
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
