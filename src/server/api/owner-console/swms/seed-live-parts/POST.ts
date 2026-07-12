/**
 * POST /api/owner-console/swms/seed-live-parts
 * Pushes the Working On or Near Exposed Live Parts SWMS to all active companies.
 * Platform owner only. Add ?replace=1 to overwrite existing records.
 */
import type { Request, Response } from 'express';
import { db } from '../../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getPlatformOwnerInfo } from '../../../../lib/platform-owner-guard.js';

const LIVE_PARTS_SWMS = {
  buildMode: 'advanced',
  documentType: 'swms',
  title: 'Working On or Near Exposed Live Parts',
  category: 'Electrical Safety / Live Work',
  revisionNumber: '1',
  reviewDate: '2026-07-13',
  authorName: 'Site Supervisor',
  approvedByName: 'Principal Contractor',
  status: 'draft',
  purpose:
    'This Safe Work Method Statement sets out the hazards, risks and controls for work on or near exposed live parts. It is designed for civil, earthworks, utility and substation environments where workers, plant, tools or materials may come within proximity of energised electrical equipment, underground or overhead electrical services, exposed conductors, switchboards, pillars, panels, substations or associated assets.',
  scope:
    'Applies to all workers working on, near, adjacent to, or in proximity to exposed live electrical parts, live substations, underground electrical services, switchboards, panels, conduits, pillars, overhead or underground assets. Includes job setup, work execution, monitoring, pack-up and completion activities.',
  includedActivities: [
    'Planning, preparation and authorisation',
    'Determine whether live work is justified',
    'Pre-start and consultation',
    'Identify exposed live parts and proximity hazards',
    'Establish exclusion zones and no-go zones',
    'Inspect tools, PPE and equipment',
    'Safety Observer / ESO controls',
    'Use of mobile plant near live parts',
    'Work near underground electrical services',
    'Work near panels, pillars, switchboards or exposed equipment',
    'Communication devices and site communications',
    'Performing the work',
    'Declared non-live or prohibited live tasks',
    'Emergency response and rescue readiness',
    'Task monitoring and changed conditions',
    'Pack up and completion',
  ],
  excludedActivities: [
    'Unauthorised live work',
    'Work on declared non-live tasks performed live',
    'Work alone where rescue or Safety Observer is required',
  ],
  workBoundaries:
    'Site-specific locations only. Live work must only proceed where criteria are met, authorised, and safer than de-energising or where de-energising is not reasonably practicable. Stop work immediately if controls cannot be maintained.',
  hrcwApplies: 'yes',
  hrcwCategories: [
    {
      id: 'h1',
      category: 'Work on or near energised electrical installations or services',
      whyApplies: 'Work near exposed live parts, substations, switchboards, pillars and underground electrical services',
      linkedWorkStep: 'Performing the work / Identify exposed live parts',
      requiredPermit: 'Access permit / Switching status confirmation',
      relatedSwms: 'Working Near Underground Services',
    },
    {
      id: 'h2',
      category: 'Work in an area with movement of powered mobile plant',
      whyApplies: 'Mobile plant operating near live assets',
      linkedWorkStep: 'Use of mobile plant near live parts',
      requiredPermit: '',
      relatedSwms: 'Moving Powered Plant',
    },
    {
      id: 'h3',
      category: 'Risk of a person falling more than 2 metres',
      whyApplies: 'Possible work at height near live parts',
      linkedWorkStep: 'Performing the work',
      requiredPermit: '',
      relatedSwms: 'Working at Heights',
    },
  ],
  criticalControls: [
    {
      id: 'cc1',
      criticalRisk: 'Electric shock / electrocution',
      possibleOutcome: 'Fatality, serious injury or burns',
      mandatoryControls:
        'Identify all exposed live parts. Maintain exclusion zones and minimum approach distances. Do not touch exposed or damaged conductors. Treat equipment as live until proven otherwise.',
      verificationMethod: 'Pre-start identification + exclusion zone confirmation',
      responsibleRole: 'Supervisor / ESO / All Workers',
      flags: ['critical', 'mandatory'],
    },
    {
      id: 'cc2',
      criticalRisk: 'Arc flash',
      possibleOutcome: 'Burns, eye injury, fatality',
      mandatoryControls:
        'Use arc flash PPE where required. Confirm fault level / risk where applicable. Keep workers outside arc flash boundary unless authorised and protected.',
      verificationMethod: 'Risk assessment + PPE check',
      responsibleRole: 'Supervisor / ESO',
      flags: ['critical', 'mandatory'],
    },
    {
      id: 'cc3',
      criticalRisk: 'Live electrical work without justification',
      possibleOutcome: 'Uncontrolled live work exposure',
      mandatoryControls:
        'Live work must only proceed where criteria are met, authorised, and safer than de-energising or where de-energising is not reasonably practicable. Apply the highest level of control required by the asset owner or site procedure.',
      verificationMethod: 'Authorisation and justification documented',
      responsibleRole: 'Supervisor / Principal Contractor',
      flags: ['critical', 'mandatory'],
    },
    {
      id: 'cc4',
      criticalRisk: 'Plant or tools entering exclusion zone',
      possibleOutcome: 'Contact with live assets or flashover',
      mandatoryControls:
        'Maintain no-go zones, use spotters or ESO, use limiters where required, maintain clear communication and stop work if distances cannot be maintained.',
      verificationMethod: 'Spotter / ESO continuous observation',
      responsibleRole: 'Operator / ESO / Spotter',
      flags: ['critical', 'mandatory'],
    },
    {
      id: 'cc5',
      criticalRisk: 'Emergency rescue not available',
      possibleOutcome: 'Delayed rescue or secondary injury',
      mandatoryControls:
        'Rescue equipment, trained persons, first aid and emergency access must be available before work starts.',
      verificationMethod: 'Rescue readiness confirmed at pre-start',
      responsibleRole: 'Supervisor / ESO',
      flags: ['critical', 'mandatory'],
    },
  ],
  plantItems: [
    {
      id: 'p1',
      item: 'Insulating mats, barriers and covers',
      requirement: 'Approved and rated for the task',
      inspectionRequired: 'Yes – before use',
      notes: '',
    },
    {
      id: 'p2',
      item: 'Approved insulated tools and rated test instruments',
      requirement: 'Test dates current where applicable',
      inspectionRequired: 'Yes – before use',
      notes: 'Remove defective equipment from service',
    },
    {
      id: 'p3',
      item: 'Rescue kit',
      requirement: 'Suitable for the task and available before work starts',
      inspectionRequired: 'Yes',
      notes: '',
    },
    {
      id: 'p4',
      item: 'Mobile plant (excavators, etc.)',
      requirement: 'Competent operators, spotter/ESO, exclusion zones, limiters where required',
      inspectionRequired: 'Yes – daily pre-start',
      notes: 'Trailing earths may be required as determined by ESO',
    },
  ],
  ppeRows: [
    { item: 'Safety helmet', requirement: 'At all times on site and when working near live assets, plant or overhead hazards' },
    { item: 'Steel-capped safety boots', requirement: 'At all times on site' },
    { item: 'Eye protection (medium impact minimum)', requirement: 'Arc flash face shield where required by risk assessment' },
    { item: 'General purpose gloves', requirement: 'For general handling tasks' },
    { item: 'Electrical / insulated gloves (1000V rated or task-specific)', requirement: 'Where required – inspect before use and confirm test date' },
    { item: 'Arc flash clothing', requirement: 'Where arc flash risk or client requirement applies' },
    { item: 'Hearing protection', requirement: 'Where noise exposure is present' },
    { item: 'Hi-vis long-sleeve cotton clothing', requirement: 'For visibility and reduced synthetic clothing risk' },
    { item: 'Fall arrest equipment', requirement: 'Where work at height risk exists' },
  ],
  workSteps: [
    {
      id: 's1',
      sequenceNumber: 1,
      sequenceOfWork: 'Planning, preparation and authorisation',
      hazardsAndRisks: 'Unauthorised work; incorrect method; workers not competent',
      possibleConsequence: 'Electrocution, serious injury',
      initialRisk: 'high',
      controlMeasures:
        'Review scope, drawings, site instructions, work permits, switching status and access requirements. Confirm the task is permitted and authorised by the principal contractor / asset owner. Verify worker competency, inductions and ESO requirements. Confirm emergency response, rescue kit, first aid and communication arrangements before work starts. Review related SWMS where underground services, plant or excavation is involved.',
      residualRisk: 'low',
      responsiblePerson: 'Supervisor',
      isCriticalControl: true,
      monitoringMethod: 'Permit and authorisation check',
      stopWorkTrigger: 'Missing authorisation or competency',
      linkedPermit: 'Access / switching permit',
      linkedSwms: 'Working Near Underground Services, Moving Powered Plant',
      evidenceRequired: 'Authorisation and competency records',
      notes: '',
    },
    {
      id: 's2',
      sequenceNumber: 2,
      sequenceOfWork: 'Determine whether live work is justified',
      hazardsAndRisks: 'Live work where de-energising is practicable',
      possibleConsequence: 'Unnecessary live work exposure',
      initialRisk: 'high',
      controlMeasures:
        'Confirm whether work can be completed de-energised. Live work must only proceed where approved criteria are met, documented and authorised. If controls cannot be applied or are not suitable, stop work and seek direction. Apply the highest level of control required by the asset owner or site procedure.',
      residualRisk: 'low',
      responsiblePerson: 'Supervisor / Principal Contractor',
      isCriticalControl: true,
      monitoringMethod: 'Justification documented',
      stopWorkTrigger: 'Live work not justified or authorised',
      linkedPermit: '',
      linkedSwms: '',
      evidenceRequired: 'Live work justification record',
      notes: '',
    },
    {
      id: 's3',
      sequenceNumber: 3,
      sequenceOfWork: 'Pre-start and consultation',
      hazardsAndRisks: 'Poor communication; changed conditions; unclear roles',
      possibleConsequence: 'Injury, uncontrolled approach',
      initialRisk: 'medium',
      controlMeasures:
        'Conduct daily pre-start before work commences. Discuss exposed live parts, exclusion zones, access paths, rescue arrangements, communication methods and stop-work triggers. Confirm who is the supervisor, ESO, spotter, operator and work party members. All workers must understand the work method and sign onto this SWMS.',
      residualRisk: 'low',
      responsiblePerson: 'Supervisor / All Workers',
      isCriticalControl: false,
      monitoringMethod: 'Daily pre-start',
      stopWorkTrigger: 'Unclear roles or incomplete briefing',
      linkedPermit: '',
      linkedSwms: '',
      evidenceRequired: 'Signed SWMS and pre-start record',
      notes: '',
    },
    {
      id: 's4',
      sequenceNumber: 4,
      sequenceOfWork: 'Identify exposed live parts and establish exclusion zones',
      hazardsAndRisks: 'Contact with exposed live parts; arc flash; step and touch potential',
      possibleConsequence: 'Electrocution, burns',
      initialRisk: 'extreme',
      controlMeasures:
        'Identify all exposed live parts and potential secondary points of contact. Mark, barricade or cover exposed parts where permitted and safe. Confirm minimum approach distances and exclusion zones before workers or plant enter the work area. Never assume equipment is de-energised unless verified by an authorised process. Establish exclusion zones for workers, plant, vehicles and the public. Use barricades, signage, spotters, barriers or insulating mats where required. Keep unauthorised workers out of the work area. Maintain clear access and emergency egress. Stop work immediately if any person, plant or tool breaches the exclusion zone.',
      residualRisk: 'low',
      responsiblePerson: 'Supervisor / ESO',
      isCriticalControl: true,
      monitoringMethod: 'Visual identification + exclusion zone setup',
      stopWorkTrigger: 'Unidentified live parts or breached exclusion zone',
      linkedPermit: '',
      linkedSwms: '',
      evidenceRequired: 'Marked exclusion zones',
      notes: '',
    },
    {
      id: 's5',
      sequenceNumber: 5,
      sequenceOfWork: 'Inspect tools, PPE and equipment + Safety Observer / ESO controls',
      hazardsAndRisks: 'Defective tools; failed PPE; delayed warning; uncontrolled approach',
      possibleConsequence: 'Electrocution, injury',
      initialRisk: 'high',
      controlMeasures:
        'Inspect PPE, insulated gloves, mats, barriers, rescue kit, test instruments and tools before use. Confirm test dates where applicable. Remove defective, damaged or out-of-date equipment from service. Use only approved and rated tools and instruments. Appoint an ESO or Safety Observer where required by the task, asset owner, exclusion zone or site procedure. ESO must understand the work method, exclusion distances and rescue requirements. ESO must maintain clear view and communication with workers / operator. If communication is lost or conditions change, work must stop immediately.',
      residualRisk: 'low',
      responsiblePerson: 'Supervisor / ESO / All Workers',
      isCriticalControl: true,
      monitoringMethod: 'Equipment inspection + ESO appointment',
      stopWorkTrigger: 'Defective equipment or loss of ESO communication',
      linkedPermit: '',
      linkedSwms: '',
      evidenceRequired: 'Inspection records and ESO confirmation',
      notes: '',
    },
    {
      id: 's6',
      sequenceNumber: 6,
      sequenceOfWork: 'Use of mobile plant near live parts',
      hazardsAndRisks: 'Plant contact; flashover; induced voltage',
      possibleConsequence: 'Electrocution, arc flash',
      initialRisk: 'extreme',
      controlMeasures:
        'Plant operators must be competent and authorised. Establish plant exclusion zones and minimum approach distances before plant operates. Use a spotter or ESO where plant can encroach on exclusion distances. Maintain positive communication between operator, spotter and ESO. Consider plant selection, boom limiters, trailing earths or grounding where required by the asset owner.',
      residualRisk: 'low',
      responsiblePerson: 'Operator / ESO / Spotter',
      isCriticalControl: true,
      monitoringMethod: 'Continuous spotter/ESO observation',
      stopWorkTrigger: 'Loss of communication or approach distance breach',
      linkedPermit: '',
      linkedSwms: 'Moving Powered Plant',
      evidenceRequired: '',
      notes: '',
    },
    {
      id: 's7',
      sequenceNumber: 7,
      sequenceOfWork: 'Work near underground electrical services / panels / pillars / switchboards',
      hazardsAndRisks: 'Cable strike; electrocution; arc flash; exposed live parts; faulty equipment',
      possibleConsequence: 'Serious injury or fatality',
      initialRisk: 'extreme',
      controlMeasures:
        'Review service drawings, DBYD and site records. Locate and positively identify services before excavation or ground disturbance. Pothole within required distances. Use insulated gloves, non-conductive tools and ESO where required. Stop work if unidentified services, marker tape, conduits or unexpected ground conditions are found. Inspect panels, covers, doors, hinges, locks and conductors for condition before work. Do not remove covers or barriers unless authorised and controlled. Use insulating barriers, mats and covers where required. Keep tools, body parts and materials clear of exposed live parts. Do not wear jewellery, watches or other conductive items.',
      residualRisk: 'low',
      responsiblePerson: 'Supervisor / ESO / All Workers',
      isCriticalControl: true,
      monitoringMethod: 'Service location + visual inspection',
      stopWorkTrigger: 'Unidentified services or damaged covers',
      linkedPermit: '',
      linkedSwms: 'Working Near Underground Services',
      evidenceRequired: 'Service location confirmation',
      notes: '',
    },
    {
      id: 's8',
      sequenceNumber: 8,
      sequenceOfWork: 'Performing the work + Declared non-live / prohibited live tasks',
      hazardsAndRisks: 'Electric shock; arc flash; contact with live assets; unauthorised live work',
      possibleConsequence: 'Electrocution, fatality',
      initialRisk: 'extreme',
      controlMeasures:
        'Work on one potential at a time where applicable. Cover or control secondary points of contact where required. Maintain body position outside exclusion zones and line-of-fire areas. Never work alone where live electrical risk requires rescue or observation. Do not rush the task. Stop and reassess if conditions change. Workers must not perform declared non-live tasks live. If a task is listed by the asset owner as not permitted live, work must be de-energised or alternative approved method used. Any uncertainty must be escalated before work proceeds. Do not bypass barriers, covers or guards without approval and controls. Do not cut, open or disturb conduits, cables, panels or pillars unless the status is confirmed and the method is authorised. Do not perform live work using uninsulated tools unless specifically permitted. Do not work alone where a rescue or Safety Observer requirement applies. Do not allow plant, ladders, tools or materials to enter exclusion zones without control and approval.',
      residualRisk: 'low',
      responsiblePerson: 'All Workers / Supervisor / ESO',
      isCriticalControl: true,
      monitoringMethod: 'Continuous observation + stop-work authority',
      stopWorkTrigger: 'Any uncertainty, unauthorised live work or control failure',
      linkedPermit: '',
      linkedSwms: '',
      evidenceRequired: '',
      notes: '',
    },
    {
      id: 's9',
      sequenceNumber: 9,
      sequenceOfWork: 'Emergency response, rescue readiness, monitoring and pack-up',
      hazardsAndRisks: 'Delayed rescue; secondary electrocution; work outside SWMS scope; new hazards; unsafe equipment left exposed',
      possibleConsequence: 'Serious injury or fatality',
      initialRisk: 'high',
      controlMeasures:
        'Rescue kit and first aid arrangements must be available before work starts where required. Confirm emergency contacts and access routes. Do not approach or touch a person in contact with energised equipment until the area is made safe. Call 000 for serious injury or electrical incident. Preserve the incident scene where required. Supervisor to monitor work activities and controls. All workers to monitor for new hazards. Review SWMS if conditions change, additional live parts are identified or work method changes. Stop work if controls cannot be maintained. Ensure covers, panels, doors, barriers and guards are reinstated and secured. Confirm work area is electrically and physically safe. Remove tools, waste, barriers and signage only when safe to do so. Close permits, sign off records and advise principal contractor of completion.',
      residualRisk: 'low',
      responsiblePerson: 'Supervisor / ESO / All Workers',
      isCriticalControl: true,
      monitoringMethod: 'Ongoing monitoring + final inspection',
      stopWorkTrigger: 'Control failure or incomplete reinstatement',
      linkedPermit: '',
      linkedSwms: '',
      evidenceRequired: 'Close-out records',
      notes: '',
    },
  ],
  taskRequirements: [
    {
      id: 'tr1',
      type: 'Safety Observer requirements',
      description: 'ESO or Safety Observer required where electrical risk or exclusion zones apply',
    },
    {
      id: 'tr2',
      type: 'Exclusion-zone requirements',
      description: 'Maintain minimum approach distances and no-go zones for workers, plant and tools',
    },
    {
      id: 'tr3',
      type: 'Rescue readiness',
      description: 'Rescue kit, trained persons, first aid and emergency access available before work starts',
    },
    {
      id: 'tr4',
      type: 'Permit requirements',
      description: 'Access permits, switching status and live work authorisation as required by asset owner',
    },
    {
      id: 'tr5',
      type: 'Declared non-live or prohibited live tasks',
      description: 'Do not perform tasks live where the asset owner or procedure requires de-energisation',
    },
  ],
  envControls: [
    {
      type: 'Housekeeping',
      description: 'Maintain good housekeeping and clear emergency access paths.',
      responsiblePerson: 'All Workers',
    },
    {
      type: 'Spill kits',
      description: 'Use spill kits where plant, fuel, oil or chemicals are present.',
      responsiblePerson: 'Supervisor',
    },
    {
      type: 'Waste',
      description: 'Control dust, waste and loose materials during works and pack up.',
      responsiblePerson: 'All Workers',
    },
  ],
  emergencyActions: [
    { id: 'e1', action: 'Stop work immediately' },
    { id: 'e2', action: 'Do not approach or touch energised equipment or a person in contact with energised equipment until the area is confirmed safe' },
    { id: 'e3', action: 'Call Emergency Services on 000 for serious injury, electric shock, fire or rescue response' },
    { id: 'e4', action: 'Contact electricity emergency on 131 962 where electrical assets may be involved' },
    { id: 'e5', action: 'Notify Site Supervisor and the principal contractor immediately' },
    { id: 'e6', action: 'Keep all workers, plant and public clear of the area' },
    { id: 'e7', action: 'Provide first aid only when safe to do so' },
    { id: 'e8', action: 'Preserve the incident scene where required' },
    { id: 'e9', action: 'Do not restart work until the hazard is controlled and the SWMS has been reviewed if required' },
  ],
  emergencyModules: [],
  competencyRows: [
    { requirement: 'White Card / General Construction Induction', applies: true, evidenceOrAuth: 'Current card' },
    { requirement: 'Site induction', applies: true, evidenceOrAuth: 'Site-specific' },
    { requirement: 'Electrical Safety Observer (ESO) competency', applies: true, evidenceOrAuth: 'Where required by task or site' },
    { requirement: 'Asset-owner authorisation / site authorisations', applies: true, evidenceOrAuth: 'As required' },
    { requirement: 'Plant competency / VOC', applies: true, evidenceOrAuth: 'Where plant is used' },
    { requirement: 'First aid', applies: false, evidenceOrAuth: '' },
  ],
  definitions: [
    {
      id: 'd1',
      term: 'Exposed live part',
      definition: 'A part that is bare, not effectively insulated, or not effectively guarded and may be energised',
    },
    {
      id: 'd2',
      term: 'Work on or near',
      definition: 'Work where a person, tool, plant or material may come within proximity of exposed live parts or conductive parts',
    },
    {
      id: 'd3',
      term: 'De-energised',
      definition: 'Separated from all sources of electricity and confirmed not energised by an approved test method',
    },
    {
      id: 'd4',
      term: 'Electrical Safety Observer / ESO',
      definition: 'A competent person appointed to observe and warn workers or operators where electrical risk or exclusion zones apply',
    },
    {
      id: 'd5',
      term: 'Minimum approach distance',
      definition: 'The closest distance a worker, plant, tool or material may approach an electrical asset under specified controls',
    },
  ],
  relatedDocs: [
    { id: 'rd1', type: 'Related SWMS', document: 'Working Near Underground Services', revision: 'Current', status: 'current' },
    { id: 'rd2', type: 'Related SWMS', document: 'Moving Powered Plant', revision: 'Current', status: 'current' },
    { id: 'rd3', type: 'Related SWMS', document: 'Vacuum Excavation', revision: 'Current', status: 'current' },
    { id: 'rd4', type: 'Related SWMS', document: 'Excavations in a Live Substation', revision: 'Current', status: 'current' },
    { id: 'rd5', type: 'Other', document: 'Electrical Safety Code of Practice – Working Near Overhead and Underground Electric Lines', revision: 'Current', status: 'current' },
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
    const title = LIVE_PARTS_SWMS.title;
    const swmsBodyJson = JSON.stringify(LIVE_PARTS_SWMS);
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
