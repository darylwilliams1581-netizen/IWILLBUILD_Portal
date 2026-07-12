/**
 * POST /api/owner-console/swms/seed-moving-plant
 * Pushes the Moving Powered Plant SWMS to all active companies.
 * Platform owner only. Add ?replace=1 to overwrite existing records.
 */
import type { Request, Response } from 'express';
import { db } from '../../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getSessionAndProfile } from '../../../../lib/auth-middleware.js';

const MOVING_PLANT_SWMS = {
  buildMode: 'advanced',
  documentType: 'swms',
  title: 'Moving Powered Plant',
  category: 'Plant / Powered Mobile Plant',
  revisionNumber: '1',
  reviewDate: '2026-07-13',
  authorName: 'Site Supervisor',
  approvedByName: 'Principal Contractor',
  status: 'draft',
  purpose:
    'This Safe Work Method Statement sets out the hazards, risks and controls for operating, directing, spotting and working near powered mobile plant. It is designed for civil, earthworks, utility and substation work environments where workers, vehicles, services and plant may interact.',
  scope:
    'Applies to all workers operating, directing, spotting or working near powered mobile plant including excavators, bobcats, loaders, trucks, rollers, vacuum trucks and other mobile plant. Includes planning, pre-start, plant movement, exclusion zones, spotting, reverse movements, work near services and pack-up.',
  includedActivities: [
    'Planning, preparation and competency verification',
    'Pre-start and consultation',
    'Plant pre-operational checks',
    'Establish exclusion zones and work area controls',
    'Plant movement and travel',
    'Spotting and positive communication',
    'Reverse and blind-spot movements',
    'Working near plant and swing radius',
    'Plant operation near services, structures or overhead lines',
    'Loading / unloading and material handling with plant',
    'Task observation and monitoring',
    'Pack-up, parking and completion',
  ],
  excludedActivities: [
    'Operation of plant by unlicensed or non-competent persons',
    'Use of plant as a crane for suspended loads without separate controls',
  ],
  workBoundaries:
    'Site-specific work areas only. Coordinate with principal contractor for access, traffic management and other trades. Stop work immediately if controls cannot be maintained or conditions change.',
  hrcwApplies: 'yes',
  hrcwCategories: [
    {
      id: 'h1',
      category: 'Work in an area with movement of powered mobile plant',
      whyApplies: 'Operation and movement of excavators, bobcats, trucks and other powered mobile plant',
      linkedWorkStep: 'Plant movement and travel / Working near plant',
      requiredPermit: '',
      relatedSwms: 'Traffic Management / Working Near Roads',
    },
    {
      id: 'h2',
      category: 'Work on or near energised electrical installations or services',
      whyApplies: 'Plant may operate near overhead or underground electrical services',
      linkedWorkStep: 'Plant operation near services or overhead lines',
      requiredPermit: 'Power company permit if within exclusion zone',
      relatedSwms: 'Working On or Near Exposed Live Parts, Working Near Underground Services',
    },
    {
      id: 'h3',
      category: 'Work on, in or adjacent to a road or other traffic corridor',
      whyApplies: 'Plant may interact with public roads or site traffic',
      linkedWorkStep: 'Plant movement and travel',
      requiredPermit: 'Traffic management if required',
      relatedSwms: 'Traffic Management / Working Near Roads',
    },
    {
      id: 'h4',
      category: 'Risk of a person falling more than 2 metres',
      whyApplies: 'Climbing on/off plant and work near excavations',
      linkedWorkStep: 'Plant pre-operational checks / Pack-up',
      requiredPermit: '',
      relatedSwms: 'Working at Heights',
    },
  ],
  criticalControls: [
    {
      id: 'cc1',
      criticalRisk: 'Plant and pedestrian interaction / crush injury',
      possibleOutcome: 'Serious injury or fatality',
      mandatoryControls:
        'Exclusion zones established and maintained. Spotter used for reverse, tight or blind movements. Positive communication between operator, spotter and ground workers. All personnel within plant operating area must wear high-visibility clothing and remain in line of sight of the operator. No person to enter swing radius or exclusion zone without authorisation and positive communication. Operator must not use mobile phone or electronic devices while plant is moving.',
      verificationMethod: 'Exclusion zone setup + spotter confirmation + communication check',
      responsibleRole: 'Operator / Spotter / Supervisor',
      flags: ['critical', 'mandatory'],
    },
    {
      id: 'cc2',
      criticalRisk: 'Plant tip-over or loss of control',
      possibleOutcome: 'Serious injury or fatality',
      mandatoryControls:
        'Operate within manufacturer load charts, slope limits and rated capacity. Assess ground conditions before travel or operation. Use appropriate plant for the terrain. Lower attachments when travelling. Never overload plant.',
      verificationMethod: 'Pre-start ground assessment + load chart check',
      responsibleRole: 'Operator / Supervisor',
      flags: ['critical', 'mandatory'],
    },
    {
      id: 'cc3',
      criticalRisk: 'Contact with overhead or underground services',
      possibleOutcome: 'Electrocution, service strike, explosion',
      mandatoryControls:
        'Confirm service locations and overhead clearances before plant movement. Maintain required approach distances. Use spotter / ESO where plant can encroach on exclusion zones. Stop work if marker tape, conduits or unexpected services are found.',
      verificationMethod: 'Service location confirmation + approach distance check',
      responsibleRole: 'Supervisor / Operator / Spotter',
      flags: ['critical', 'mandatory'],
    },
    {
      id: 'cc4',
      criticalRisk: 'Reverse collision or blind-spot strike',
      possibleOutcome: 'Crush injury or fatality',
      mandatoryControls:
        'Spotter required for reverse movements in congested or restricted areas. Agreed hand signals or radio communication. Operator must stop immediately if visual or radio contact with spotter is lost. Spotter must not place themselves in the line of fire or between plant and fixed objects.',
      verificationMethod: 'Spotter appointment + communication method confirmed',
      responsibleRole: 'Operator / Spotter',
      flags: ['critical', 'mandatory'],
    },
  ],
  plantItems: [
    {
      id: 'p1',
      item: 'Excavator / Bobcat / Loader / Roller / Vacuum Truck / Truck',
      requirement:
        'Competent operator with current VOC / licence, daily pre-start checklist, spotter for restricted movements, high-visibility clothing',
      inspectionRequired: 'Yes – daily pre-start',
      notes: 'Manufacturer operating manuals, load charts and data plates must be available and readable',
    },
  ],
  ppeRows: [
    { item: 'Safety helmet', requirement: 'At all times when near plant or overhead hazards' },
    { item: 'Steel-capped safety boots', requirement: 'At all times on site' },
    { item: 'Hi-vis long-sleeve clothing', requirement: 'At all times on site and when working near plant' },
    { item: 'Safety glasses / goggles', requirement: 'As required by task and plant operation' },
    { item: 'Hearing protection', requirement: 'When plant noise levels require it' },
    { item: 'Task-specific gloves', requirement: 'When handling attachments, tools or materials' },
    { item: 'Sunscreen + hat', requirement: 'Outdoor work – reapply as required' },
  ],
  workSteps: [
    {
      id: 's1',
      sequenceNumber: 1,
      sequenceOfWork: 'Planning, preparation and competency verification',
      hazardsAndRisks: 'Unlicensed operators; incorrect plant selection; missing VOCs',
      possibleConsequence: 'Injury, non-compliance',
      initialRisk: 'high',
      controlMeasures:
        'All operators must hold current construction induction and relevant plant VOC / licence. Confirm operator competency before allocation of plant. Review manufacturer manuals, load charts and site requirements. Relevant SWMS must be reviewed where plant interfaces with excavation, underground services, traffic or live electrical assets. Confirm emergency procedures and communication methods.',
      residualRisk: 'low',
      responsiblePerson: 'Supervisor',
      isCriticalControl: true,
      monitoringMethod: 'VOC and licence check',
      stopWorkTrigger: 'Missing competency or unsuitable plant',
      linkedPermit: '',
      linkedSwms: 'Working Near Underground Services, Working On or Near Exposed Live Parts',
      evidenceRequired: 'VOC / licence records',
      notes: '',
    },
    {
      id: 's2',
      sequenceNumber: 2,
      sequenceOfWork: 'Pre-start and consultation',
      hazardsAndRisks: 'Poor communication; unclear roles; changed conditions',
      possibleConsequence: 'Injury, uncontrolled plant movement',
      initialRisk: 'medium',
      controlMeasures:
        'Attend daily pre-start meeting before commencing work. Discuss plant movements, exclusion zones, travel routes, reverse movements, spotters, services and emergency response. Confirm who is operating, spotting and supervising. Identify additional hazards and implement controls before work starts. All workers must sign onto this SWMS.',
      residualRisk: 'low',
      responsiblePerson: 'Supervisor / All Workers',
      isCriticalControl: false,
      monitoringMethod: 'Daily pre-start attendance',
      stopWorkTrigger: 'Unclear roles or incomplete briefing',
      linkedPermit: '',
      linkedSwms: '',
      evidenceRequired: 'Signed SWMS and pre-start record',
      notes: '',
    },
    {
      id: 's3',
      sequenceNumber: 3,
      sequenceOfWork: 'Plant pre-operational checks',
      hazardsAndRisks: 'Faulty plant; incomplete checks; unreported defects',
      possibleConsequence: 'Plant failure, injury',
      initialRisk: 'high',
      controlMeasures:
        'Complete daily pre-start checklist for the plant. Check brakes, steering, hydraulics, lights, reverse alarm, mirrors, seats, seatbelts, attachments, tracks/tyres and fluid levels. Confirm load charts and data plates are readable. Report and tag out any defects. Do not operate plant with unresolved critical defects. Manufacturer operating manuals must be available.',
      residualRisk: 'low',
      responsiblePerson: 'Operator',
      isCriticalControl: true,
      monitoringMethod: 'Completed pre-start checklist',
      stopWorkTrigger: 'Defective plant or incomplete checklist',
      linkedPermit: '',
      linkedSwms: '',
      evidenceRequired: 'Pre-start checklist',
      notes: '',
    },
    {
      id: 's4',
      sequenceNumber: 4,
      sequenceOfWork: 'Establish exclusion zones and work area controls',
      hazardsAndRisks: 'Pedestrians entering plant operating area; uncontrolled access',
      possibleConsequence: 'Crush injury',
      initialRisk: 'extreme',
      controlMeasures:
        'Establish and maintain exclusion zones around operating plant. Use barricades, signage, cones or spotters as required. Keep non-essential personnel clear of plant operating areas. High-visibility clothing mandatory for all persons near plant. Maintain clear travel routes free of rubbish, materials and other hazards. Coordinate with other trades to prevent conflicting movements.',
      residualRisk: 'low',
      responsiblePerson: 'Supervisor / Operator / Spotter',
      isCriticalControl: true,
      monitoringMethod: 'Visual confirmation of exclusion zones',
      stopWorkTrigger: 'Unauthorised persons in exclusion zone',
      linkedPermit: '',
      linkedSwms: 'Traffic Management / Working Near Roads',
      evidenceRequired: '',
      notes: '',
    },
    {
      id: 's5',
      sequenceNumber: 5,
      sequenceOfWork: 'Plant movement, travel and reverse movements',
      hazardsAndRisks: 'Collision with persons, vehicles, plant or structures; reverse blind spots',
      possibleConsequence: 'Crush injury or fatality',
      initialRisk: 'extreme',
      controlMeasures:
        'Travel at safe speed for conditions. Lower attachments when travelling. Use reverse alarm and mirrors. Spotter required for reverse movements in congested, restricted or blind areas. Positive radio or hand-signal communication must be maintained. Operator must stop immediately if visual or radio contact with the spotter is lost. Spotter must never stand in the line of fire or between plant and fixed objects. Agreed hand signals or communication method confirmed before work starts.',
      residualRisk: 'low',
      responsiblePerson: 'Operator / Spotter',
      isCriticalControl: true,
      monitoringMethod: 'Continuous spotter observation + communication',
      stopWorkTrigger: 'Loss of communication or persons in path',
      linkedPermit: '',
      linkedSwms: '',
      evidenceRequired: '',
      notes: '',
    },
    {
      id: 's6',
      sequenceNumber: 6,
      sequenceOfWork: 'Working near plant and swing radius',
      hazardsAndRisks: 'Crush injury from swing radius, boom or attachments',
      possibleConsequence: 'Serious injury or fatality',
      initialRisk: 'extreme',
      controlMeasures:
        'Personnel working near excavators must remain outside the swing radius and exclusion zone unless authorised and under positive communication. Maintain a minimum distance of 1.5 times the radius of the excavator boom or as directed by the supervisor. Never walk under a raised boom or load. Operator must not swing over personnel. Ground workers must make eye contact with the operator before approaching plant.',
      residualRisk: 'low',
      responsiblePerson: 'Operator / Spotter / All Workers',
      isCriticalControl: true,
      monitoringMethod: 'Continuous visual control',
      stopWorkTrigger: 'Person inside swing radius without authorisation',
      linkedPermit: '',
      linkedSwms: '',
      evidenceRequired: '',
      notes: '',
    },
    {
      id: 's7',
      sequenceNumber: 7,
      sequenceOfWork: 'Plant operation near services, structures or overhead lines',
      hazardsAndRisks: 'Service strike; overhead power line contact; structural collision',
      possibleConsequence: 'Electrocution, explosion, structural damage',
      initialRisk: 'extreme',
      controlMeasures:
        'Confirm underground service locations and overhead clearances before plant operates. Maintain required approach distances to overhead power lines. Use spotter / ESO where plant can encroach on exclusion zones. Stop work immediately if marker tape, conduits, cables or unexpected ground conditions are encountered. Do not operate plant below overhead lines without confirmed clearance and controls.',
      residualRisk: 'low',
      responsiblePerson: 'Supervisor / Operator / Spotter',
      isCriticalControl: true,
      monitoringMethod: 'Service location + clearance check',
      stopWorkTrigger: 'Insufficient clearance or unexpected services',
      linkedPermit: 'Power company permit if required',
      linkedSwms: 'Working Near Underground Services, Working On or Near Exposed Live Parts',
      evidenceRequired: 'Service location confirmation',
      notes: '',
    },
    {
      id: 's8',
      sequenceNumber: 8,
      sequenceOfWork: 'Loading / unloading and material handling with plant',
      hazardsAndRisks: 'Overloading; unstable loads; falling material; crush injury',
      possibleConsequence: 'Injury, plant tip-over',
      initialRisk: 'high',
      controlMeasures:
        'Operate within manufacturer load charts and rated capacity. Secure loads before travel. Never swing loads over personnel. Use tag lines where required for control of suspended or awkward loads. Ground workers must remain clear of the load path. Do not use plant as a crane for suspended loads unless specifically rated and controlled.',
      residualRisk: 'low',
      responsiblePerson: 'Operator / Spotter',
      isCriticalControl: true,
      monitoringMethod: 'Load chart compliance + observation',
      stopWorkTrigger: 'Overloaded plant or unsecured load',
      linkedPermit: '',
      linkedSwms: 'Manual Handling and Housekeeping',
      evidenceRequired: '',
      notes: '',
    },
    {
      id: 's9',
      sequenceNumber: 9,
      sequenceOfWork: 'Task observation, monitoring and pack-up',
      hazardsAndRisks: 'Changed conditions; work outside SWMS; unsecured plant; residual hazards',
      possibleConsequence: 'Injury, security risk',
      initialRisk: 'medium',
      controlMeasures:
        'Supervisor to monitor plant activities and exclusion zones regularly. All workers to monitor for new hazards. Stop work if controls cannot be maintained. Park plant in designated safe area, lower attachments, switch off, remove keys and secure against unauthorised use. Complete final inspection of work area. Remove temporary barriers only when safe. Report any defects or incidents.',
      residualRisk: 'low',
      responsiblePerson: 'Supervisor / Operator / All Workers',
      isCriticalControl: false,
      monitoringMethod: 'Ongoing observation + end-of-shift inspection',
      stopWorkTrigger: 'Uncontrolled hazards or unsecured plant',
      linkedPermit: '',
      linkedSwms: '',
      evidenceRequired: 'Defect reports if any',
      notes: '',
    },
  ],
  taskRequirements: [
    {
      id: 'tr1',
      type: 'Plant separation requirements',
      description:
        'Exclusion zones, spotter and positive communication mandatory for reverse, restricted or blind movements. No person in swing radius without authorisation.',
    },
    {
      id: 'tr2',
      type: 'Safety Observer requirements',
      description: 'Spotter required for reverse movements and where plant may encroach on services, structures or people',
    },
    {
      id: 'tr3',
      type: 'Exclusion-zone requirements',
      description: 'Establish and maintain exclusion zones around operating plant. Keep non-essential persons clear.',
    },
  ],
  envControls: [
    {
      type: 'Housekeeping',
      description: 'Keep travel routes and exclusion zones clear of materials, tools and rubbish.',
      responsiblePerson: 'All Workers',
    },
    {
      type: 'Spill kits',
      description: 'Spill kits must be available where plant, fuel or oil is present.',
      responsiblePerson: 'Supervisor',
    },
    {
      type: 'Dust',
      description: 'Dust suppression must be used where plant movement generates dust.',
      responsiblePerson: 'Supervisor',
    },
    {
      type: 'Noise',
      description: 'Hearing protection and noise controls as required by plant operation.',
      responsiblePerson: 'All Workers',
    },
  ],
  emergencyActions: [
    { id: 'e1', action: 'Stop work immediately' },
    { id: 'e2', action: 'Make the area safe if it is safe to do so' },
    { id: 'e3', action: 'Notify Site Supervisor and principal contractor immediately' },
    { id: 'e4', action: 'Provide first aid / call 000 for serious injury' },
    { id: 'e5', action: 'For plant contact with power lines – do not approach until area confirmed safe; call 000 and electricity emergency 131 962' },
    { id: 'e6', action: 'Preserve the incident scene where required' },
    { id: 'e7', action: 'Do not restart work until the hazard is controlled and the SWMS has been reviewed if required' },
  ],
  emergencyModules: [],
  competencyRows: [
    { requirement: 'White Card / General Construction Induction', applies: true, evidenceOrAuth: 'Current card' },
    { requirement: 'Site induction', applies: true, evidenceOrAuth: 'Site-specific' },
    { requirement: 'Plant competency / VOC / licence', applies: true, evidenceOrAuth: 'Current for plant type operated' },
    { requirement: 'Spotter training / awareness', applies: true, evidenceOrAuth: 'As required' },
    { requirement: 'First aid', applies: false, evidenceOrAuth: '' },
  ],
  definitions: [
    {
      id: 'd1',
      term: 'Swing radius / exclusion zone',
      definition:
        'The area that can be reached by the rotating upper structure, boom or attachments of plant – no unauthorised entry',
    },
    {
      id: 'd2',
      term: 'Positive communication',
      definition:
        'Confirmed two-way radio or agreed hand signals between operator and spotter / ground workers at all times during plant movement',
    },
  ],
  relatedDocs: [
    { id: 'rd1', type: 'Related SWMS', document: 'Working Near Underground Services', revision: 'Current', status: 'current' },
    { id: 'rd2', type: 'Related SWMS', document: 'Working On or Near Exposed Live Parts', revision: 'Current', status: 'current' },
    { id: 'rd3', type: 'Related SWMS', document: 'Manual Handling and Housekeeping', revision: 'Current', status: 'current' },
    { id: 'rd4', type: 'Related SWMS', document: 'Traffic Management / Working Near Roads', revision: 'Current', status: 'current' },
    { id: 'rd5', type: 'Related SWMS', document: 'Vacuum Excavation', revision: 'Current', status: 'current' },
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

export default async function handler(req: Request, res: Response) {
  const auth = await getSessionAndProfile(req, res);
  if (!auth) return;

  const [ownerCheck] = (await db.execute(
    sql.raw(`SELECT role FROM profiles WHERE user_id = '${auth.session.user.id}' LIMIT 1`)
  )) as unknown as [Array<{ role: string }>, unknown];

  if (ownerCheck?.[0]?.role !== 'platform_owner') {
    return res.status(403).json({ error: 'Platform owner access required' });
  }

  const replace = req.query.replace === '1' || req.body?.replace === true;

  try {
    const [companyRows] = (await db.execute(
      sql.raw(`SELECT id FROM companies WHERE status != 'archived' ORDER BY id`)
    )) as unknown as [Array<{ id: number }>, unknown];

    const companyIds = (companyRows ?? []).map((r) => r.id);
    const title = MOVING_PLANT_SWMS.title;
    const swmsBodyJson = JSON.stringify(MOVING_PLANT_SWMS);
    const safe = (s: string) => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");

    let inserted = 0, updated = 0, skipped = 0;

    for (const companyId of companyIds) {
      const [existing] = (await db.execute(
        sql.raw(
          `SELECT id FROM swms_templates WHERE company_id = ${companyId} AND title = ${JSON.stringify(title)} LIMIT 1`
        )
      )) as unknown as [Array<{ id: number }>, unknown];

      const existingId = existing?.[0]?.id;

      if (existingId && replace) {
        await db.execute(
          sql.raw(`
            UPDATE swms_templates SET
              swms_body       = '${safe(swmsBodyJson)}',
              build_mode      = 'advanced',
              document_type   = 'swms',
              category        = 'Plant / Powered Mobile Plant',
              revision_number = '1',
              status          = 'draft',
              updated_at      = NOW()
            WHERE id = ${existingId}
          `)
        );
        updated++;
      } else if (existingId) {
        skipped++;
      } else {
        await db.execute(
          sql.raw(`
            INSERT INTO swms_templates
              (company_id, title, category, revision_number, author_name, approved_by_name,
               status, build_mode, document_type, swms_body, created_at, updated_at)
            VALUES (
              ${companyId},
              '${safe(title)}',
              'Plant / Powered Mobile Plant',
              '1',
              'Site Supervisor',
              'Principal Contractor',
              'draft',
              'advanced',
              'swms',
              '${safe(swmsBodyJson)}',
              NOW(), NOW()
            )
          `)
        );
        inserted++;
      }
    }

    return res.json({ ok: true, companies: companyIds.length, inserted, updated, skipped });
  } catch (err) {
    console.error('seed-moving-plant error:', err);
    return res.status(500).json({ error: String(err) });
  }
}
