/**
 * POST /api/owner-console/swms/seed-ewp
 * Pushes the Elevated Work Platform (EWP) structured SWMS to all active companies.
 * Platform owner only. Add ?replace=1 to overwrite existing records.
 */
import type { Request, Response } from 'express';
import { db } from '../../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getPlatformOwnerInfo } from '../../../../lib/platform-owner-guard.js';

const EWP_SWMS = {
  buildMode: 'advanced',
  documentType: 'swms',
  title: 'Elevated Work Platform (EWP)',
  category: 'Working at Heights / Plant',
  revisionNumber: '1',
  reviewDate: '2026-07-13',
  authorName: 'Site Supervisor / Williams Constructions NQ',
  approvedByName: 'Principal Contractor',
  status: 'draft',
  purpose:
    'This Safe Work Method Statement identifies the hazards, risks and control measures for the operation and use of Elevated Work Platforms (EWPs) including scissor lifts, boom lifts and cherry pickers. It aims to eliminate or minimise risks of falls, tip-over, power line contact and other hazards so far as is reasonably practicable.',
  scope:
    'Applies to all workers operating, working from, spotting or supervising Elevated Work Platforms on construction sites. Includes pre-operational checks, positioning, operation, materials handling from the platform, rescue readiness and clean-up.',
  includedActivities: [
    'Toolbox talk and pre-start',
    'Pre-operational EWP checks',
    'Work zone management and barricading',
    'Ground and surface assessment',
    'Operation of EWP',
    'Working from the platform (including harness use)',
    'Materials handling to/from platform',
    'Rescue and emergency procedures',
    'Working near power lines',
    'Weather monitoring',
    'Clean-up and pack-up',
  ],
  excludedActivities: [
    'Use of EWP as a crane or for lifting suspended loads',
    'Operation by untrained or unauthorised persons',
    'Work in high winds or extreme weather without assessment',
  ],
  workBoundaries:
    'Site-specific locations only. Coordinate with principal contractor for access, exclusion zones, power lines and other trades. Stop work immediately if controls cannot be maintained or conditions change.',
  hrcwApplies: 'yes',
  hrcwCategories: [
    {
      id: 'h1',
      category: 'Risk of a person falling more than 2 metres',
      whyApplies: 'Working from elevated platform',
      linkedWorkStep: 'Working from the platform',
      requiredPermit: '',
      relatedSwms: 'Working at Heights',
    },
    {
      id: 'h2',
      category: 'Work in an area with movement of powered mobile plant',
      whyApplies: 'EWP is powered mobile plant and may interact with other plant',
      linkedWorkStep: 'Operation of EWP',
      requiredPermit: '',
      relatedSwms: 'Moving Powered Plant',
    },
    {
      id: 'h3',
      category: 'Work on or near energised electrical installations or services',
      whyApplies: 'Risk of boom or platform contacting overhead power lines',
      linkedWorkStep: 'Working near power lines',
      requiredPermit: 'Work permit from power company if within exclusion zone',
      relatedSwms: 'Working On or Near Exposed Live Parts',
    },
    {
      id: 'h4',
      category: 'Work on, in or adjacent to a road or other traffic corridor',
      whyApplies: 'Possible public or traffic interface',
      linkedWorkStep: 'Work zone management',
      requiredPermit: 'Traffic management if required',
      relatedSwms: 'Traffic Management / Working Near Roads',
    },
    {
      id: 'h5',
      category: 'Crystalline Silica (RCS) exposure',
      whyApplies: 'Possible dust-generating work performed from the platform',
      linkedWorkStep: 'Any cutting or grinding from platform',
      requiredPermit: 'Silica statement (Appendix 1) if applicable',
      relatedSwms: 'Silica Dust Exposure',
    },
  ],
  criticalControls: [
    {
      id: 'cc1',
      criticalRisk: 'Fall from EWP platform',
      possibleOutcome: 'Serious injury or fatality',
      mandatoryControls:
        'Safety harness worn correctly and lanyard secured to approved anchor point on the EWP at all times when in the basket. Correct length lanyard for the task (prevent free-fall). Do not climb safety cage to extend reach. At least one competent person on the ground who is inducted into the rescue procedure. First aid kit and first aider available.',
      verificationMethod: 'Harness inspection + visual confirmation of connection before elevation',
      responsibleRole: 'Operator / Ground Person / Supervisor',
      flags: ['critical', 'mandatory'],
    },
    {
      id: 'cc2',
      criticalRisk: 'EWP tip-over or instability',
      possibleOutcome: 'Serious injury or fatality',
      mandatoryControls:
        'Surface must be level, firm and able to support the EWP and load. Dry and free of oil, plant growth or soft spots. Check for pit lids, recent excavation, grates etc. Select correct machine type for the environment (all-terrain or all-wheel drive if required). Outriggers fully deployed where fitted. Never exceed manufacturer load capacity or slope limits.',
      verificationMethod: 'Ground assessment + pre-start checklist',
      responsibleRole: 'Operator / Supervisor',
      flags: ['critical', 'mandatory'],
    },
    {
      id: 'cc3',
      criticalRisk: 'Contact with overhead power lines',
      possibleOutcome: 'Electrocution or fatality',
      mandatoryControls:
        'Any work within 4.0 m horizontally and 5.0 m vertically of power lines requires a Work Permit from the power company and a dedicated spotter. Maintain required exclusion distances. Spotter must have clear view and communication with operator at all times.',
      verificationMethod: 'Power line clearance check + permit if required',
      responsibleRole: 'Supervisor / Spotter / Operator',
      flags: ['critical', 'mandatory'],
    },
    {
      id: 'cc4',
      criticalRisk: 'Inadequate rescue / isolation of worker',
      possibleOutcome: 'Delayed rescue leading to secondary injury or fatality',
      mandatoryControls:
        'At least one person on the ground at all times who is inducted into the EWP rescue procedure. Rescue plan discussed at pre-start. First aid kit and first aider as part of the team. Ground person must remain contactable while anyone is in the basket.',
      verificationMethod: 'Pre-start confirmation of ground person and rescue plan',
      responsibleRole: 'Supervisor / Ground Person',
      flags: ['critical', 'mandatory'],
    },
  ],
  plantItems: [
    {
      id: 'p1',
      item: 'Elevated Work Platform (Scissor / Boom / Cherry Picker)',
      requirement: 'Competent accredited operator, daily pre-start, harness + correct lanyard, ground person, suitable for terrain',
      inspectionRequired: 'Yes – daily pre-start checklist',
      notes: 'Select correct machine type for ground conditions (all-terrain if required)',
    },
  ],
  ppeRows: [
    { item: 'Safety helmet', requirement: 'At all times on site and in basket' },
    { item: 'Steel-capped safety boots', requirement: 'At all times on site' },
    { item: 'Hi-vis long-sleeve clothing', requirement: 'At all times on site' },
    { item: 'Safety glasses / goggles', requirement: 'As required by task' },
    { item: 'Task-specific gloves', requirement: 'When handling materials or tools' },
    { item: 'Safety harness + lanyard (correct length)', requirement: 'Mandatory when working from EWP basket – connected to approved anchor' },
    { item: 'Hearing protection', requirement: 'When plant or tools create noise' },
    { item: 'Sunscreen + hat', requirement: 'Outdoor work – reapply as required' },
  ],
  workSteps: [
    {
      id: 's1',
      sequenceNumber: 1,
      sequenceOfWork: 'Toolbox Talk & Pre-start',
      hazardsAndRisks: 'Workers unaware of risks, unfit for duty, no rescue plan, weather',
      possibleConsequence: 'Injury, delayed rescue, poor decisions',
      initialRisk: 'high',
      controlMeasures:
        'Stop-Plan-Do process. Fitness for work check. Confirm accredited EWP operator is part of the team. Review emergency and rescue procedure. Discuss weather, ground conditions and contingency plan. All workers (including ground person) sign onto SWMS and are inducted into the rescue procedure.',
      residualRisk: 'low',
      responsiblePerson: 'Supervisor / All Workers',
      isCriticalControl: true,
      monitoringMethod: 'Daily pre-start attendance + rescue plan confirmation',
      stopWorkTrigger: 'No accredited operator, no ground person or rescue plan incomplete',
      linkedPermit: '',
      linkedSwms: '',
      evidenceRequired: 'Signed SWMS and pre-start record',
      notes: '',
    },
    {
      id: 's2',
      sequenceNumber: 2,
      sequenceOfWork: 'Pre-operational check of EWP and equipment',
      hazardsAndRisks: 'Injury from equipment failure or unsuitable equipment',
      possibleConsequence: 'Tip-over, fall, mechanical failure',
      initialRisk: 'high',
      controlMeasures:
        'Complete full pre-check on EWP (as per manufacturer). Ensure machine is the correct type for the environment (all-terrain or all-wheel drive if required). Lanyard correct length for task and in good order. All tools for the task fit for purpose. Harness inspected and serviceable.',
      residualRisk: 'low',
      responsiblePerson: 'Operator',
      isCriticalControl: true,
      monitoringMethod: 'Pre-start checklist completed and signed',
      stopWorkTrigger: 'Any defect or incorrect machine type',
      linkedPermit: '',
      linkedSwms: 'Moving Powered Plant',
      evidenceRequired: 'Completed pre-start checklist',
      notes: '',
    },
    {
      id: 's3',
      sequenceNumber: 3,
      sequenceOfWork: 'Manage work zone & ground assessment',
      hazardsAndRisks: 'Injury from mechanical failure, trip/slip hazards, other trades, unstable surface, power lines',
      possibleConsequence: 'Tip-over, collision, electrocution',
      initialRisk: 'extreme',
      controlMeasures:
        'Consultation with other people on site. Isolate work zone from other persons (barricade). Ensure housekeeping is maintained. Hi-vis tops worn at all times. Hard hats when working below people above. Surface must be level and able to support EWP and load, dry and free of slippery materials. Look for pit lids, recent excavation, grates etc. Any work within 4.0 m horizontally and 5.0 m vertically of power lines requires Work Permit from power company and a dedicated spotter. Clear access ways and potential fall area.',
      residualRisk: 'low',
      responsiblePerson: 'Supervisor / Operator / Spotter',
      isCriticalControl: true,
      monitoringMethod: 'Ground assessment + exclusion zone + power line check',
      stopWorkTrigger: 'Unstable ground, people in zone or insufficient power line clearance',
      linkedPermit: 'Power company permit if in hot zone',
      linkedSwms: 'Traffic Management / Working Near Roads',
      evidenceRequired: 'Ground assessment recorded if required',
      notes: '',
    },
    {
      id: 's4',
      sequenceNumber: 4,
      sequenceOfWork: 'Rescue readiness and ground person',
      hazardsAndRisks: 'Falls, falling objects, person isolated or requiring assistance',
      possibleConsequence: 'Delayed rescue, secondary injury',
      initialRisk: 'high',
      controlMeasures:
        'At least one person on the ground at all times. All persons working on the EWP are inducted into the rescue procedure. First Aid Kit & First Aider as part of the team. Ground person remains contactable at all times whilst a person is in the basket.',
      residualRisk: 'low',
      responsiblePerson: 'Supervisor / Ground Person',
      isCriticalControl: true,
      monitoringMethod: 'Confirmation at pre-start and ongoing',
      stopWorkTrigger: 'No ground person available or loss of communication',
      linkedPermit: '',
      linkedSwms: '',
      evidenceRequired: 'Rescue plan discussed and understood',
      notes: '',
    },
    {
      id: 's5',
      sequenceNumber: 5,
      sequenceOfWork: 'Materials handling to/from platform',
      hazardsAndRisks: 'Strain, sprains, crushing, falling objects',
      possibleConsequence: 'Injury to persons in basket or below',
      initialRisk: 'high',
      controlMeasures:
        'Ensure pathways are clear. Safe access to work area. Materials placed in designated location that least impedes workflow and is isolated from passing trades. Mechanical equipment used whenever practicable. If lift is awkward or heavy do not perform task – refer to supervisor. Always pass components down/up carefully. Do not overload the platform.',
      residualRisk: 'low',
      responsiblePerson: 'All Workers',
      isCriticalControl: false,
      monitoringMethod: 'Observation',
      stopWorkTrigger: 'Overloading or uncontrolled materials',
      linkedPermit: '',
      linkedSwms: 'Manual Handling and Housekeeping',
      evidenceRequired: '',
      notes: '',
    },
    {
      id: 's6',
      sequenceNumber: 6,
      sequenceOfWork: 'Working from the platform (heights)',
      hazardsAndRisks: 'Falls from height',
      possibleConsequence: 'Serious injury or fatality',
      initialRisk: 'extreme',
      controlMeasures:
        'Safety harness worn correctly and lanyard secured to EWP approved anchor point (check free-fall distance is not too long). Do not climb safety cage to extend reach. Ensure person on ground is contactable at all times whilst a person is in the basket. Maintain three points of contact where possible when moving within basket.',
      residualRisk: 'low',
      responsiblePerson: 'Operator / Workers in basket',
      isCriticalControl: true,
      monitoringMethod: 'Visual confirmation of harness connection before and during elevation',
      stopWorkTrigger: 'Harness not connected, incorrect lanyard or loss of ground contact',
      linkedPermit: '',
      linkedSwms: 'Working at Heights',
      evidenceRequired: 'Harness inspection record',
      notes: '',
    },
    {
      id: 's7',
      sequenceNumber: 7,
      sequenceOfWork: 'Working conditions outside (weather)',
      hazardsAndRisks: 'Weather conditions, slips due to rain, burns, exhaustion due to heat, high winds',
      possibleConsequence: 'Tip-over, fall, heat illness',
      initialRisk: 'high',
      controlMeasures:
        'Correct PPE & safety equipment. Hats, sunscreen and plenty of fluids. Observe for extreme conditions and try to work indoors in severe conditions. Do not operate EWP in high winds exceeding manufacturer limits or in heavy rain. Stop work if weather deteriorates.',
      residualRisk: 'low',
      responsiblePerson: 'Supervisor / Operator',
      isCriticalControl: true,
      monitoringMethod: 'Weather monitoring throughout shift',
      stopWorkTrigger: 'High winds, heavy rain or extreme heat',
      linkedPermit: '',
      linkedSwms: 'Heat Stress, Remote Conditions & Fitness for Work',
      evidenceRequired: '',
      notes: '',
    },
    {
      id: 's8',
      sequenceNumber: 8,
      sequenceOfWork: 'Clean-up and pack-up',
      hazardsAndRisks: 'Trip, slips, falls, unsecured EWP, residual hazards',
      possibleConsequence: 'Injury, security risk',
      initialRisk: 'medium',
      controlMeasures:
        'Lower platform fully. Park EWP in safe designated area. Switch off and secure keys. Remove tools and materials. Ensure work zone is left tidy and barricades remain if required. Gates closed.',
      residualRisk: 'low',
      responsiblePerson: 'Operator / All Workers',
      isCriticalControl: false,
      monitoringMethod: 'End-of-shift inspection',
      stopWorkTrigger: 'Unsecured plant or uncontrolled waste',
      linkedPermit: '',
      linkedSwms: '',
      evidenceRequired: '',
      notes: '',
    },
  ],
  taskRequirements: [
    {
      id: 'tr1',
      type: 'Rescue readiness',
      description: 'Ground person + rescue procedure inducted + first aider available at all times while platform is elevated',
    },
    {
      id: 'tr2',
      type: 'Exclusion-zone requirements',
      description: 'Barricade work zone. Keep non-essential persons clear of EWP operating area and potential fall zone',
    },
    {
      id: 'tr3',
      type: 'Safety Observer requirements',
      description: 'Dedicated spotter required when working near power lines or in restricted areas',
    },
    {
      id: 'tr4',
      type: 'Permit requirements',
      description: 'Power company Work Permit required for work within 4 m horizontal / 5 m vertical of power lines',
    },
  ],
  envControls: [
    {
      type: 'Housekeeping',
      description: 'Progressive clean-up. Keep access ways and potential fall areas clear.',
      responsiblePerson: 'All Workers',
    },
    {
      type: 'Waste',
      description: 'Remove tools and materials. Leave area tidy and secure.',
      responsiblePerson: 'All Workers',
    },
    {
      type: 'Public protection',
      description: 'Barricade and isolate work zone from public and other trades.',
      responsiblePerson: 'Supervisor',
    },
  ],
  emergencyActions: [
    { id: 'e1', action: 'Stop work immediately' },
    { id: 'e2', action: 'Lower platform if safe to do so or implement rescue procedure' },
    { id: 'e3', action: 'Make the area safe if safe to do so' },
    { id: 'e4', action: 'Provide first aid / call 000 for serious injury or entrapment' },
    { id: 'e5', action: 'Notify Site Supervisor and Principal Contractor immediately' },
    { id: 'e6', action: 'For power line contact – do not approach until area confirmed safe; call 000 and electricity emergency 131 962' },
    { id: 'e7', action: 'Preserve the incident scene where required' },
    { id: 'e8', action: 'Do not restart work until controls reviewed and workers re-briefed' },
  ],
  emergencyModules: [],
  competencyRows: [
    { requirement: 'White Card / General Construction Induction', applies: true, evidenceOrAuth: 'Current card' },
    { requirement: 'Site induction', applies: true, evidenceOrAuth: 'Site-specific' },
    { requirement: 'EWP Operator competency / accreditation', applies: true, evidenceOrAuth: 'Current ticket / VOC' },
    { requirement: 'Working at heights awareness', applies: true, evidenceOrAuth: '' },
    { requirement: 'Harness use competency', applies: true, evidenceOrAuth: 'Trained in correct fit and use' },
    { requirement: 'First aid', applies: true, evidenceOrAuth: 'At least one first aider in team preferred' },
    { requirement: 'Rescue procedure induction', applies: true, evidenceOrAuth: 'Ground person and operators' },
  ],
  definitions: [
    {
      id: 'd1',
      term: 'Free-fall distance',
      definition: 'The distance a person can fall before the fall arrest system activates – must be controlled by correct lanyard length',
    },
    {
      id: 'd2',
      term: 'Hot zone (power lines)',
      definition: 'Area within 4.0 m horizontal and 5.0 m vertical of energised power lines requiring permit and spotter',
    },
  ],
  relatedDocs: [
    { id: 'rd1', type: 'Related SWMS', document: 'Working at Heights', revision: 'Current', status: 'current' },
    { id: 'rd2', type: 'Related SWMS', document: 'Moving Powered Plant', revision: 'Current', status: 'current' },
    { id: 'rd3', type: 'Related SWMS', document: 'Working On or Near Exposed Live Parts', revision: 'Current', status: 'current' },
    { id: 'rd4', type: 'Related SWMS', document: 'Heat Stress, Remote Conditions & Fitness for Work', revision: 'Current', status: 'current' },
    { id: 'rd5', type: 'Related SWMS', document: 'Manual Handling and Housekeeping', revision: 'Current', status: 'current' },
    { id: 'rd6', type: 'Other', document: 'High Risk Crystalline Silica Statement (Appendix 1)', revision: '2024', status: 'current' },
  ],
  workerSignOns: [],
  supervisorDeclaration: {
    name: '',
    position: 'Site Supervisor',
    date: '',
    signatureData: '',
    comments: 'I confirm this SWMS has been explained to all workers (including ground person) and controls will be complied with. Rescue procedure has been discussed.',
  },
};

export default async function handler(req: Request, res: Response) {
  const info = await getPlatformOwnerInfo(req);
  if (!info) return res.status(401).json({ error: 'Unauthorised' });
  if (!info.isPlatformOwner) return res.status(403).json({ error: 'Platform owner access required' });

  const replace = req.query.replace === '1' || req.body?.replace === true;

  try {
    const title = EWP_SWMS.title;
    const swmsBodyJson = JSON.stringify(EWP_SWMS);
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
