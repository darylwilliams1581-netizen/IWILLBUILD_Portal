/**
 * POST /api/owner-console/swms/seed-manual-handling
 * Pushes the Manual Handling and Housekeeping SWMS to all active companies.
 * Platform owner only. Add ?replace=1 to overwrite existing records.
 */
import type { Request, Response } from 'express';
import { db } from '../../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getPlatformOwnerInfo } from '../../../../lib/platform-owner-guard.js';

const MANUAL_HANDLING_SWMS = {
  buildMode: 'advanced',
  documentType: 'swms',
  title: 'Manual Handling and Housekeeping',
  category: 'Manual Handling / Site Housekeeping',
  revisionNumber: '1',
  reviewDate: '2026-07-13',
  authorName: 'Site Supervisor',
  approvedByName: 'Principal Contractor',
  status: 'draft',
  purpose:
    'This Safe Work Method Statement sets out the hazards, risks and controls for manual handling and housekeeping activities. It is designed to be practical, easy to follow and suitable for civil, earthworks, utility and general construction environments.',
  scope:
    'Applies to all workers undertaking manual handling, material movement, clean-up and housekeeping tasks on construction sites. Includes planning, lifting and carrying, repetitive tasks, climbing in/out of plant or trucks, housekeeping during works, and completion clean-up.',
  includedActivities: [
    'Planning, preparation and verification of competency',
    'Pre-start and consultation',
    'Assess the manual handling task',
    'Lifting and carrying',
    'Repetitive tasks and awkward postures',
    'Climbing in and out of trucks or plant',
    'Housekeeping during works',
    'Completion and clean up',
    'Task observation and monitoring',
  ],
  excludedActivities: [
    'High-risk lifting requiring crane or specialised plant without separate controls',
    'Work in confined spaces without additional SWMS',
  ],
  workBoundaries:
    'Site-specific work areas only. Coordinate with principal contractor for access and other trades. Stop work immediately if controls cannot be maintained or conditions change.',
  hrcwApplies: 'yes',
  hrcwCategories: [
    {
      id: 'h1',
      category: 'Work in an area with movement of powered mobile plant',
      whyApplies: 'Manual handling and housekeeping often occur near plant and vehicles',
      linkedWorkStep: 'Climbing in and out of trucks or plant / Housekeeping',
      requiredPermit: '',
      relatedSwms: 'Moving Powered Plant',
    },
    {
      id: 'h2',
      category: 'Risk of a person falling more than 2 metres',
      whyApplies: 'Climbing in/out of plant or trucks and working near edges or excavations',
      linkedWorkStep: 'Climbing in and out of trucks or plant',
      requiredPermit: '',
      relatedSwms: 'Working at Heights',
    },
  ],
  criticalControls: [
    {
      id: 'cc1',
      criticalRisk: 'Heavy or awkward lifting',
      possibleOutcome: 'Back, shoulder, knee or hand injuries',
      mandatoryControls:
        'Plan the lift. Use mechanical aids where possible. Team lift heavy or awkward items. Keep loads close to the body. Avoid twisting while lifting or carrying.',
      verificationMethod: 'Pre-lift assessment + observation',
      responsibleRole: 'All Workers / Supervisor',
      flags: ['critical', 'mandatory'],
    },
    {
      id: 'cc2',
      criticalRisk: 'Repetitive manual tasks',
      possibleOutcome: 'Muscle strain and overuse injuries',
      mandatoryControls:
        'Rotate tasks. Take breaks. Avoid repeated twisting, shovelling or lifting above shoulder height. Use long-handled tools where suitable.',
      verificationMethod: 'Task rotation monitoring',
      responsibleRole: 'Supervisor / All Workers',
      flags: ['critical'],
    },
    {
      id: 'cc3',
      criticalRisk: 'Poor housekeeping',
      possibleOutcome: 'Slips, trips, falls, cuts and falling into excavations',
      mandatoryControls:
        'Keep access ways clear. Remove rubbish progressively. Maintain barricades. Store materials securely. Do not leave tools, hoses, leads or materials across walkways.',
      verificationMethod: 'Ongoing visual inspection',
      responsibleRole: 'All Workers / Supervisor',
      flags: ['critical', 'mandatory'],
    },
    {
      id: 'cc4',
      criticalRisk: 'Climbing in/out of plant or trucks',
      possibleOutcome: 'Falls, sprains or strains',
      mandatoryControls:
        'Use three points of contact. Check steps and handholds are secure and free from mud, grease or water. Do not jump from plant, trays or equipment. Avoid twisting while climbing.',
      verificationMethod: 'Pre-use visual check of access points',
      responsibleRole: 'All Workers',
      flags: ['critical', 'mandatory'],
    },
  ],
  plantItems: [
    {
      id: 'p1',
      item: 'Trolleys, forklifts, cranes, excavators, bobcats and other mechanical aids',
      requirement: 'Use mechanical assistance where possible for heavy or awkward loads',
      inspectionRequired: 'Yes – as per plant pre-start requirements',
      notes: 'Preferred over manual lifting',
    },
  ],
  ppeRows: [
    { item: 'Safety helmet', requirement: 'As applicable to the task and site conditions' },
    { item: 'Steel-capped safety boots', requirement: 'At all times on site' },
    { item: 'Hi-vis long-sleeve cotton clothing', requirement: 'As applicable to the task and site conditions' },
    { item: 'Medium impact eye protection', requirement: 'As applicable to the task and site conditions' },
    { item: 'Task-specific gloves (durable nitrile or rigger)', requirement: 'As applicable to the task and site conditions' },
    { item: 'Hearing protection', requirement: 'As per task risk assessment' },
    { item: 'UV protection and 30+ sunscreen', requirement: 'As applicable to the task and site conditions' },
  ],
  workSteps: [
    {
      id: 's1',
      sequenceNumber: 1,
      sequenceOfWork: 'Planning, preparation and verification of competency',
      hazardsAndRisks: 'Legislation breach; workers not inducted or trained',
      possibleConsequence: 'Injury, non-compliance',
      initialRisk: 'medium',
      controlMeasures:
        'All workers must hold a current construction induction card and complete the site induction. Workers must read, understand and sign onto this SWMS before starting work. Supervisor to confirm relevant training, competency and site requirements. Workers must wear site PPE and task-specific PPE as required. Relevant SWMS must be reviewed where manual handling occurs around plant, excavations or live electrical assets.',
      residualRisk: 'low',
      responsiblePerson: 'Supervisor',
      isCriticalControl: false,
      monitoringMethod: 'Induction and SWMS sign-on records',
      stopWorkTrigger: 'Workers not inducted or SWMS not signed',
      linkedPermit: '',
      linkedSwms: '',
      evidenceRequired: 'Signed SWMS and induction records',
      notes: '',
    },
    {
      id: 's2',
      sequenceNumber: 2,
      sequenceOfWork: 'Pre-start and consultation',
      hazardsAndRisks: 'Untrained workers; poor communication; unclear work method',
      possibleConsequence: 'Injury, poor coordination',
      initialRisk: 'medium',
      controlMeasures:
        'Attend daily pre-start meeting before commencing work. Discuss manual handling tasks, loads, access ways, plant movement and housekeeping expectations. Identify additional hazards and implement controls before work starts. Supervisor to monitor workers and inspect work areas during the task. Workers must report hazards and stop work if unsafe conditions arise.',
      residualRisk: 'low',
      responsiblePerson: 'Supervisor / All Workers',
      isCriticalControl: false,
      monitoringMethod: 'Daily pre-start attendance',
      stopWorkTrigger: 'Unclear method or additional hazards not controlled',
      linkedPermit: '',
      linkedSwms: '',
      evidenceRequired: 'Pre-start record',
      notes: '',
    },
    {
      id: 's3',
      sequenceNumber: 3,
      sequenceOfWork: 'Assess the manual handling task',
      hazardsAndRisks: 'Muscle strain; incorrect lifting method; lack of mechanical assistance',
      possibleConsequence: 'Musculoskeletal injury',
      initialRisk: 'medium',
      controlMeasures:
        'Assess the load before lifting – weight, size, shape, stability, distance and access route. Check work area layout, posture, frequency, duration and environmental conditions. Store heavy or frequently used items between waist and chest height where practicable. Use mechanical assistance such as trolley, forklift, crane or plant where possible. Use team lifting for heavy, long or awkward items.',
      residualRisk: 'low',
      responsiblePerson: 'All Workers',
      isCriticalControl: true,
      monitoringMethod: 'Pre-lift assessment',
      stopWorkTrigger: 'Load too heavy or awkward for safe manual handling',
      linkedPermit: '',
      linkedSwms: '',
      evidenceRequired: '',
      notes: '',
    },
    {
      id: 's4',
      sequenceNumber: 4,
      sequenceOfWork: 'Lifting and carrying',
      hazardsAndRisks: 'Back strain; shoulder, knee or hand injury; dropped loads',
      possibleConsequence: 'Musculoskeletal injury',
      initialRisk: 'medium',
      controlMeasures:
        'Plan the lift and route before lifting. Keep feet stable, bend knees and hips, keep back and neck straight. Hold the load close to the body and avoid twisting while lifting or carrying. Do not lift above shoulder height unless unavoidable and controlled. Use smooth movements and avoid sudden jerking or overreaching.',
      residualRisk: 'low',
      responsiblePerson: 'All Workers',
      isCriticalControl: true,
      monitoringMethod: 'Buddy observation',
      stopWorkTrigger: 'Twisting, overreaching or excessive force required',
      linkedPermit: '',
      linkedSwms: '',
      evidenceRequired: '',
      notes: '',
    },
    {
      id: 's5',
      sequenceNumber: 5,
      sequenceOfWork: 'Repetitive tasks and awkward postures',
      hazardsAndRisks: 'Overuse injuries; muscle fatigue; strain from shovelling or twisting',
      possibleConsequence: 'Musculoskeletal injury',
      initialRisk: 'medium',
      controlMeasures:
        'Rotate workers through repetitive tasks where practicable. Take regular rest breaks and stretch before or during extended manual tasks. Avoid prolonged awkward postures where possible. Use long-handled tools where suitable to reduce bending. Report discomfort early so the task can be reviewed.',
      residualRisk: 'low',
      responsiblePerson: 'All Workers',
      isCriticalControl: false,
      monitoringMethod: 'Task rotation and worker feedback',
      stopWorkTrigger: 'Persistent discomfort or fatigue',
      linkedPermit: '',
      linkedSwms: '',
      evidenceRequired: '',
      notes: '',
    },
    {
      id: 's6',
      sequenceNumber: 6,
      sequenceOfWork: 'Climbing in and out of trucks or plant',
      hazardsAndRisks: 'Slips, trips, falls, strains and sprains',
      possibleConsequence: 'Fall or sprain injury',
      initialRisk: 'medium',
      controlMeasures:
        'Use three points of contact when accessing or exiting plant and trucks. Check steps, footholds and grab rails are secure and free from mud, grease or water. Do not jump from plant, trays or equipment. Avoid twisting while climbing or reaching for the seat. Report damaged steps, handrails or access points.',
      residualRisk: 'low',
      responsiblePerson: 'All Workers',
      isCriticalControl: true,
      monitoringMethod: 'Visual check of access points',
      stopWorkTrigger: 'Damaged or slippery access points',
      linkedPermit: '',
      linkedSwms: 'Moving Powered Plant',
      evidenceRequired: '',
      notes: '',
    },
    {
      id: 's7',
      sequenceNumber: 7,
      sequenceOfWork: 'Housekeeping during works',
      hazardsAndRisks: 'Slips, trips, falls; cuts; blocked access; falling into excavations',
      possibleConsequence: 'Injury',
      initialRisk: 'medium',
      controlMeasures:
        'Keep work areas, walkways and access routes clear. Remove rubbish, offcuts and unused materials progressively. Maintain barricades, signs and exclusion zones where required. Do not leave tools, hoses, leads or materials across walkways. Place waste in correct bins or designated disposal areas.',
      residualRisk: 'low',
      responsiblePerson: 'Supervisor / All Workers',
      isCriticalControl: true,
      monitoringMethod: 'Ongoing visual inspection',
      stopWorkTrigger: 'Blocked access or uncontrolled hazards',
      linkedPermit: '',
      linkedSwms: '',
      evidenceRequired: '',
      notes: '',
    },
    {
      id: 's8',
      sequenceNumber: 8,
      sequenceOfWork: 'Completion and clean up',
      hazardsAndRisks: 'Poor housekeeping; unsecured materials; environmental harm; incomplete permits',
      possibleConsequence: 'Injury, environmental incident',
      initialRisk: 'medium',
      controlMeasures:
        'Correctly pack and store tools and equipment. Secure loose materials against wind, weather or unauthorised movement. Switch off generators and isolate power where applicable. Ensure tie-downs, braces, barriers and covers are secure. Complete, close out and return permits where required.',
      residualRisk: 'low',
      responsiblePerson: 'Supervisor / All Workers',
      isCriticalControl: false,
      monitoringMethod: 'End-of-shift inspection',
      stopWorkTrigger: 'Unsecured materials or incomplete clean-up',
      linkedPermit: '',
      linkedSwms: '',
      evidenceRequired: '',
      notes: '',
    },
    {
      id: 's9',
      sequenceNumber: 9,
      sequenceOfWork: 'Task observation and monitoring',
      hazardsAndRisks: 'Unidentified hazards; changed conditions; work outside SWMS scope',
      possibleConsequence: 'Injury',
      initialRisk: 'medium',
      controlMeasures:
        'Supervisor to monitor work activities and inspect work areas regularly. All workers to monitor for additional hazards. If a hazard is identified, stop work, make safe and notify supervisor. Review and update controls if work conditions change. Do not recommence work until hazards are controlled.',
      residualRisk: 'low',
      responsiblePerson: 'Supervisor / All Workers',
      isCriticalControl: false,
      monitoringMethod: 'Regular field inspections',
      stopWorkTrigger: 'New or uncontrolled hazards',
      linkedPermit: '',
      linkedSwms: '',
      evidenceRequired: '',
      notes: '',
    },
  ],
  taskRequirements: [
    {
      id: 'tr1',
      type: 'Plant separation requirements',
      description: 'Maintain exclusion zones and positive communication when working near plant',
    },
  ],
  envControls: [
    {
      type: 'Housekeeping',
      description: 'Keep access ways clear. Remove rubbish progressively. Maintain barricades and store materials securely.',
      responsiblePerson: 'All Workers',
    },
    {
      type: 'Waste',
      description: 'Place waste in correct bins or approved disposal areas. Secure lightweight waste from wind.',
      responsiblePerson: 'All Workers',
    },
    {
      type: 'Spill kits',
      description: 'Maintain access to spill kits where plant, fuel, oil or chemicals are present.',
      responsiblePerson: 'Supervisor',
    },
    {
      type: 'Dust',
      description: 'Use dust suppression where dust is generated during clean-up or material movement.',
      responsiblePerson: 'Supervisor',
    },
  ],
  emergencyActions: [
    { id: 'e1', action: 'Stop work immediately' },
    { id: 'e2', action: 'Make the area safe if it is safe to do so' },
    { id: 'e3', action: 'Notify the Site Supervisor' },
    { id: 'e4', action: 'Provide first aid or contact emergency services if required' },
    { id: 'e5', action: 'Report all incidents, hazards, injuries and near misses immediately' },
    {
      id: 'e6',
      action:
        'Do not restart work until the hazard is controlled and the SWMS has been reviewed if required',
    },
  ],
  emergencyModules: [],
  competencyRows: [
    { requirement: 'White Card / General Construction Induction', applies: true, evidenceOrAuth: 'Current card' },
    { requirement: 'Site induction', applies: true, evidenceOrAuth: 'Site-specific' },
    { requirement: 'Task instruction', applies: true, evidenceOrAuth: '' },
    { requirement: 'First aid', applies: false, evidenceOrAuth: '' },
  ],
  definitions: [],
  relatedDocs: [
    { id: 'rd1', type: 'Related SWMS', document: 'Moving Powered Plant', revision: 'Current', status: 'current' },
    { id: 'rd2', type: 'Related SWMS', document: 'Working at Heights', revision: 'Current', status: 'current' },
    {
      id: 'rd3',
      type: 'Related SWMS',
      document: 'Heat Stress, Remote Conditions & Fitness for Work',
      revision: 'Current',
      status: 'current',
    },
  ],
  workerSignOns: [],
  supervisorDeclaration: {
    name: '',
    position: 'Site Supervisor',
    date: '',
    signatureData: '',
    comments:
      'I confirm this SWMS has been explained to all workers and the documented precautions, controls and work methods will be complied with.',
  },
};

export default async function handler(req, res) {
  const info = await getPlatformOwnerInfo(req);
  if (!info) return res.status(401).json({ error: 'Unauthorised' });
  if (!info.isPlatformOwner) return res.status(403).json({ error: 'Platform owner access required' });

  const replace = req.query.replace === '1' || req.body?.replace === true;

  try {
    const title = MANUAL_HANDLING_SWMS.title;
    const swmsBodyJson = JSON.stringify(MANUAL_HANDLING_SWMS);
    const safe = (s) => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");

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
