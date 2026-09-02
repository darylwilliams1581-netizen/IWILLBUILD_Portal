/**
 * POST /api/owner-console/swms/seed-vacuum-excavation
 * Pushes the "Vacuum Excavation" SWMS to all active companies.
 * Platform owner only. Add ?replace=1 to overwrite existing records.
 */
import type { Request, Response } from 'express';
import { db } from '../../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getPlatformOwnerInfo } from '../../../../lib/platform-owner-guard.js';

const SWMS_DATA = {
  buildMode: 'advanced',
  documentType: 'swms',
  title: 'Vacuum Excavation',
  category: 'Excavation / Utility / Non-Destructive Digging',
  revisionNumber: '1',
  reviewDate: '2026-07-13',
  authorName: 'Site Supervisor',
  approvedByName: 'Principal Contractor',
  status: 'draft',
  purpose:
    'This Safe Work Method Statement sets out the hazards, risks and controls for vacuum excavation (hydro excavation / soft digging) works. It is designed for civil, utility, substation and general construction environments where non-destructive excavation is required near underground services, in congested areas or where traditional mechanical excavation presents unacceptable risk.',
  scope:
    'Applies to all workers operating, assisting with, spotting or working near vacuum excavation equipment. Includes planning, pre-start, equipment checks, setup, potholing, hydro excavation, spoil management, work near services, and clean-up.',
  includedActivities: [
    'Planning, preparation and competency verification',
    'Pre-start and consultation',
    'Vacuum excavation unit pre-operational checks',
    'Work zone setup and exclusion zones',
    'Service location confirmation',
    'Hydro / vacuum excavation operation',
    'Potholing and positive identification of services',
    'Spoil management and disposal',
    'Work near live or underground services',
    'High-pressure water jetting controls',
    'Task observation and monitoring',
    'Pack-up and clean-up',
  ],
  excludedActivities: [
    'Use of vacuum excavation as a means of bulk earthmoving without controls',
    'Operation by untrained or non-competent persons',
    'Work in confined spaces without additional SWMS',
  ],
  workBoundaries:
    'Site-specific work areas only. Coordinate with principal contractor for access, services and other trades. Stop work immediately if controls cannot be maintained or conditions change.',
  hrcwApplies: 'yes',
  hrcwCategories: [
    {
      id: 'h1',
      category: 'Work in an area with movement of powered mobile plant',
      whyApplies: 'Vacuum excavation unit and support plant operating on site',
      linkedWorkStep: 'Vacuum excavation unit setup and operation',
      requiredPermit: '',
      relatedSwms: 'Moving Powered Plant',
    },
    {
      id: 'h2',
      category: 'Work on or near energised electrical installations or services',
      whyApplies: 'Vacuum excavation frequently used to expose live underground electrical services',
      linkedWorkStep: 'Potholing and work near services',
      requiredPermit: 'Service location confirmation / excavation permit',
      relatedSwms: 'Working Near Underground Services, Working On or Near Exposed Live Parts',
    },
    {
      id: 'h3',
      category: 'Work in or near a shaft or trench deeper than 1.5 m or a tunnel',
      whyApplies: 'Possible deep potholes or trenches created by vacuum excavation',
      linkedWorkStep: 'Vacuum excavation operation',
      requiredPermit: 'Excavation permit if required',
      relatedSwms: 'Working Near Underground Services',
    },
    {
      id: 'h4',
      category: 'Crystalline Silica (RCS) exposure',
      whyApplies: 'Possible generation of silica dust from spoil or ground materials',
      linkedWorkStep: 'Spoil management',
      requiredPermit: 'Silica statement (Appendix 1) if applicable',
      relatedSwms: 'Silica Dust Exposure',
    },
  ],
  criticalControls: [
    {
      id: 'cc1',
      criticalRisk: 'High-pressure water / air injection injury',
      possibleOutcome: 'Severe tissue damage, amputation risk or fatality',
      mandatoryControls:
        'Never point the high-pressure lance at any person, body part or soft tissue. Trigger must not be bypassed. Lance must be directed toward the ground at all times. Only trained operators to use the high-pressure system. Keep bystanders outside the exclusion zone.',
      verificationMethod: 'Pre-use equipment check + operator competency confirmation',
      responsibleRole: 'Operator / Supervisor',
      flags: ['critical', 'mandatory'],
    },
    {
      id: 'cc2',
      criticalRisk: 'Underground service strike',
      possibleOutcome: 'Electric shock, explosion, service outage or serious injury',
      mandatoryControls:
        'DBYD / service plans reviewed. Services positively located and marked before vacuum excavation proceeds. Treat all services as live until proven otherwise. ESO required where live electrical services are identified or suspected. Stop work immediately if unidentified services or marker tape are found.',
      verificationMethod: 'Service location confirmation + potholing records',
      responsibleRole: 'Supervisor / Competent Locator / ESO',
      flags: ['critical', 'mandatory'],
    },
    {
      id: 'cc3',
      criticalRisk: 'Plant and pedestrian interaction / crush injury',
      possibleOutcome: 'Serious injury or fatality',
      mandatoryControls:
        'Exclusion zones established around the vacuum unit and support plant. Spotter used for plant movements. Positive communication between operator, spotter and ground workers. High-visibility clothing mandatory. No person to enter the operating area without authorisation and positive communication.',
      verificationMethod: 'Exclusion zone setup + communication check',
      responsibleRole: 'Operator / Spotter / Supervisor',
      flags: ['critical', 'mandatory'],
    },
    {
      id: 'cc4',
      criticalRisk: 'Contaminated spoil or hazardous materials',
      possibleOutcome: 'Health effects, environmental harm',
      mandatoryControls:
        'Assess ground conditions for asbestos, contaminated soil, acid sulphate soils or other hazards before excavation. Contaminated spoil must be managed and disposed of in accordance with site environmental requirements and SDS. PPE upgraded as required.',
      verificationMethod: 'Pre-start ground assessment + SDS review',
      responsibleRole: 'Supervisor',
      flags: ['critical'],
    },
  ],
  plantItems: [
    {
      id: 'p1',
      item: 'Vacuum Excavation Unit (Hydrovac / Soft Dig)',
      requirement: 'Competent operators only, daily pre-start, pressure settings controlled, exclusion zones, ESO where live services present',
      inspectionRequired: 'Yes – daily pre-start',
      notes: 'High-pressure lance trigger must not be bypassed; directed to ground only',
    },
    {
      id: 'p2',
      item: 'Support plant (excavator, truck, bobcat)',
      requirement: 'Competent operators, spotter for restricted movements',
      inspectionRequired: 'Yes – daily pre-start',
      notes: '',
    },
    {
      id: 'p3',
      item: 'Cable locator + non-conductive tools + 1000 V insulated gloves',
      requirement: 'Competent locator, gloves within test date and inspected before use',
      inspectionRequired: 'Yes – before use',
      notes: 'Gloves must be air-tested before use when working near electrical services',
    },
  ],
  ppeRows: [
    { item: 'Safety helmet', requirement: 'At all times on site and when working near plant or excavations' },
    { item: 'Steel-capped safety boots', requirement: 'At all times on site' },
    { item: 'Hi-vis long-sleeve cotton clothing', requirement: 'At all times on site' },
    { item: 'Medium impact eye protection / face shield', requirement: 'Mandatory when operating high-pressure lance or near spoil discharge' },
    { item: 'Hearing protection', requirement: 'When vacuum unit or plant creates noise' },
    { item: 'Task-specific gloves (or 1000 V insulated gloves near live services)', requirement: 'As required by task – insulated gloves inspected and air-tested before use' },
    { item: 'Respiratory protection', requirement: 'Where dust, silica or contaminated spoil risk is present' },
    { item: 'UV protection and 30+ sunscreen', requirement: 'Outdoor works' },
  ],
  workSteps: [
    {
      id: 's1',
      sequenceNumber: 1,
      sequenceOfWork: 'Planning, preparation and competency verification',
      hazardsAndRisks: 'Untrained operators; missing permits; incorrect method',
      possibleConsequence: 'Injury, non-compliance, service strike',
      initialRisk: 'high',
      controlMeasures:
        'All operators and support workers hold current construction induction and site induction. Confirm vacuum excavation competency / VOC. Review DBYD, service drawings and excavation permit. Confirm whether ESO is required. Review related SWMS (underground services, live parts, powered plant). Confirm emergency contacts and electricity emergency number 131 962.',
      residualRisk: 'low',
      responsiblePerson: 'Supervisor',
      isCriticalControl: true,
      monitoringMethod: 'Competency, permit and service information check',
      stopWorkTrigger: 'Missing competency, permits or service information',
      linkedPermit: 'Excavation permit if required',
      linkedSwms: 'Working Near Underground Services, Moving Powered Plant, Working On or Near Exposed Live Parts',
      evidenceRequired: 'VOC, permits, DBYD',
      notes: '',
    },
    {
      id: 's2',
      sequenceNumber: 2,
      sequenceOfWork: 'Pre-start and consultation',
      hazardsAndRisks: 'Poor communication; unclear exclusion zones; changed conditions',
      possibleConsequence: 'Injury, uncontrolled plant movement',
      initialRisk: 'medium',
      controlMeasures:
        'Daily pre-start covering known services, exclusion zones, high-pressure risks, ESO role, communication methods, spoil management and emergency response. Confirm who is operator, spotter, ESO and supervisor. All workers sign onto this SWMS.',
      residualRisk: 'low',
      responsiblePerson: 'Supervisor / All Workers',
      isCriticalControl: false,
      monitoringMethod: 'Daily pre-start attendance',
      stopWorkTrigger: 'Incomplete briefing or missing ESO when required',
      linkedPermit: '',
      linkedSwms: '',
      evidenceRequired: 'Signed SWMS and pre-start record',
      notes: '',
    },
    {
      id: 's3',
      sequenceNumber: 3,
      sequenceOfWork: 'Vacuum excavation unit pre-operational checks',
      hazardsAndRisks: 'Faulty equipment; uncontrolled high pressure; leaks',
      possibleConsequence: 'High-pressure injury, equipment failure',
      initialRisk: 'high',
      controlMeasures:
        'Complete daily pre-start checklist. Check high-pressure system, hose condition, couplings, trigger mechanism, vacuum system, filters, spoil tank and safety devices. Confirm pressure settings are correct for the task and ground conditions. Trigger must not be bypassed. Report and tag out any defects. Do not operate defective equipment.',
      residualRisk: 'low',
      responsiblePerson: 'Operator',
      isCriticalControl: true,
      monitoringMethod: 'Completed pre-start checklist',
      stopWorkTrigger: 'Any defective high-pressure or vacuum component',
      linkedPermit: '',
      linkedSwms: '',
      evidenceRequired: 'Pre-start checklist',
      notes: '',
    },
    {
      id: 's4',
      sequenceNumber: 4,
      sequenceOfWork: 'Work zone setup and exclusion zones',
      hazardsAndRisks: 'Pedestrians entering operating area; uncontrolled access; high-pressure line of fire',
      possibleConsequence: 'High-pressure injury, crush injury',
      initialRisk: 'extreme',
      controlMeasures:
        'Establish and maintain exclusion zones around the vacuum unit, high-pressure lance operating area and spoil discharge. Use barricades, cones and signage. Keep non-essential personnel clear. High-visibility clothing mandatory. Maintain clear emergency access routes. Coordinate with other trades.',
      residualRisk: 'low',
      responsiblePerson: 'Supervisor / Operator / Spotter',
      isCriticalControl: true,
      monitoringMethod: 'Visual confirmation of exclusion zones',
      stopWorkTrigger: 'Unauthorised persons in exclusion zone',
      linkedPermit: '',
      linkedSwms: 'Moving Powered Plant',
      evidenceRequired: '',
      notes: '',
    },
    {
      id: 's5',
      sequenceNumber: 5,
      sequenceOfWork: 'Service location confirmation and potholing',
      hazardsAndRisks: 'Service strike; electric shock; inaccurate location',
      possibleConsequence: 'Electrocution, service damage',
      initialRisk: 'extreme',
      controlMeasures:
        'Review DBYD and drawings. Mark known and suspected services. Use cable locator where required. Positively identify services by vacuum or hand potholing before bulk excavation. Treat all services as live until proven otherwise. ESO required where live electrical services are present. Stop work immediately if unidentified services or marker tape are found.',
      residualRisk: 'low',
      responsiblePerson: 'Supervisor / Competent Locator / ESO',
      isCriticalControl: true,
      monitoringMethod: 'Service location confirmation + potholing records',
      stopWorkTrigger: 'Unidentified services or loss of ESO control',
      linkedPermit: '',
      linkedSwms: 'Working Near Underground Services, Working On or Near Exposed Live Parts',
      evidenceRequired: 'Potholing confirmation',
      notes: '',
    },
    {
      id: 's6',
      sequenceNumber: 6,
      sequenceOfWork: 'Vacuum / hydro excavation operation',
      hazardsAndRisks: 'High-pressure injection injury; service damage; plant interaction; contaminated spoil',
      possibleConsequence: 'Severe injury, electrocution, contamination',
      initialRisk: 'extreme',
      controlMeasures:
        'Only trained operators use the high-pressure lance. Lance directed toward the ground at all times. Never point at people or soft tissue. Trigger not bypassed. Maintain exclusion zone. Positive communication with spotter and ESO. Control pressure settings for ground conditions and service proximity. Assess for contaminated ground before and during excavation. Upgrade PPE if contamination is identified.',
      residualRisk: 'low',
      responsiblePerson: 'Operator / Spotter / ESO',
      isCriticalControl: true,
      monitoringMethod: 'Continuous observation + communication',
      stopWorkTrigger: 'Loss of communication, persons in line of fire, or unexpected services',
      linkedPermit: '',
      linkedSwms: '',
      evidenceRequired: '',
      notes: '',
    },
    {
      id: 's7',
      sequenceNumber: 7,
      sequenceOfWork: 'Spoil management and disposal',
      hazardsAndRisks: 'Contaminated spoil; dust; environmental harm; trip hazards',
      possibleConsequence: 'Health effects, pollution, injury',
      initialRisk: 'high',
      controlMeasures:
        'Spoil managed in accordance with site environmental requirements. Contaminated spoil segregated and disposed of correctly. Dust suppressed where required. Keep spoil piles clear of access ways and fall zones. Complete silica statement if applicable. Use appropriate PPE for spoil handling.',
      residualRisk: 'low',
      responsiblePerson: 'Supervisor / All Workers',
      isCriticalControl: false,
      monitoringMethod: 'Visual inspection + environmental compliance',
      stopWorkTrigger: 'Uncontrolled contaminated spoil or dust',
      linkedPermit: '',
      linkedSwms: 'Silica Dust Exposure, Environmental Controls / Spill Response',
      evidenceRequired: 'Disposal records if contaminated',
      notes: '',
    },
    {
      id: 's8',
      sequenceNumber: 8,
      sequenceOfWork: 'Task observation, monitoring and pack-up',
      hazardsAndRisks: 'Changed conditions; residual high-pressure hazards; unsecured equipment',
      possibleConsequence: 'Injury, security risk',
      initialRisk: 'medium',
      controlMeasures:
        'Supervisor monitors work activities and controls. All workers monitor for new hazards. Stop work if controls cannot be maintained. Depressurise and secure high-pressure system. Park vacuum unit in designated safe area, switch off and secure against unauthorised use. Complete final inspection of work area. Reinstate barriers and markings. Report any defects or incidents.',
      residualRisk: 'low',
      responsiblePerson: 'Supervisor / Operator / All Workers',
      isCriticalControl: false,
      monitoringMethod: 'Ongoing observation + end-of-shift inspection',
      stopWorkTrigger: 'Uncontrolled hazards or unsecured equipment',
      linkedPermit: '',
      linkedSwms: '',
      evidenceRequired: 'Defect reports if any',
      notes: '',
    },
  ],
  taskRequirements: [
    {
      id: 'tr1',
      type: 'Safety Observer requirements',
      description: 'ESO required where live electrical services are identified or suspected. Spotter for plant movements.',
    },
    {
      id: 'tr2',
      type: 'Exclusion-zone requirements',
      description: 'Exclusion zones around vacuum unit, high-pressure lance operating area and spoil discharge. Keep non-essential persons clear.',
    },
    {
      id: 'tr3',
      type: 'Plant separation requirements',
      description: 'Positive communication and spotter for all plant movements. No unauthorised entry into operating area.',
    },
    {
      id: 'tr4',
      type: 'Dust-control requirements',
      description: 'Dust suppression and respiratory protection where silica or contaminated spoil risk exists. Complete silica statement if applicable.',
    },
  ],
  envControls: [
    { type: 'Housekeeping', description: 'Keep access ways and exclusion zones clear. Progressive clean-up of spoil and tools.', responsiblePerson: 'All Workers' },
    { type: 'Waste', description: 'Manage spoil in accordance with site environmental requirements. Contaminated spoil segregated and disposed of correctly.', responsiblePerson: 'Supervisor' },
    { type: 'Spill kits', description: 'Spill kits available where plant, fuel or oil present.', responsiblePerson: 'Supervisor' },
    { type: 'Dust', description: 'Dust suppression where spoil handling or plant movement generates dust.', responsiblePerson: 'Supervisor' },
    { type: 'Erosion and sediment', description: 'Maintain erosion and sediment controls where ground disturbance occurs.', responsiblePerson: 'Supervisor' },
  ],
  emergencyActions: [
    { id: 'e1', action: 'Stop work immediately' },
    { id: 'e2', action: 'Make the area safe if it is safe to do so' },
    { id: 'e3', action: 'For high-pressure injection injury – seek immediate medical attention (medical emergency)' },
    { id: 'e4', action: 'Do not approach or touch damaged electrical services or a person in contact with energised equipment until confirmed safe' },
    { id: 'e5', action: 'Call Emergency Services on 000 for serious injury, electric shock, fire or rescue' },
    { id: 'e6', action: 'Contact electricity emergency on 131 962 where electrical assets may be involved' },
    { id: 'e7', action: 'Notify Site Supervisor and principal contractor immediately' },
    { id: 'e8', action: 'Preserve the incident scene where required' },
    { id: 'e9', action: 'Do not restart work until the hazard is controlled and the SWMS has been reviewed if required' },
  ],
  emergencyModules: [],
  competencyRows: [
    { requirement: 'White Card / General Construction Induction', applies: true, evidenceOrAuth: 'Current card' },
    { requirement: 'Site induction', applies: true, evidenceOrAuth: 'Site-specific' },
    { requirement: 'Vacuum excavation operator competency', applies: true, evidenceOrAuth: 'Trained / VOC as required' },
    { requirement: 'Plant competency / VOC', applies: true, evidenceOrAuth: 'Where support plant is used' },
    { requirement: 'Electrical Safety Observer (ESO) competency', applies: true, evidenceOrAuth: 'Where live services present' },
    { requirement: 'Service locating competency', applies: true, evidenceOrAuth: 'Competent locator' },
    { requirement: 'First aid', applies: false, evidenceOrAuth: '' },
  ],
  definitions: [
    {
      id: 'd1',
      term: 'Hydro excavation / soft digging',
      definition: 'Non-destructive excavation using high-pressure water and vacuum to remove soil while minimising risk of damage to underground services',
    },
    {
      id: 'd2',
      term: 'High-pressure injection injury',
      definition: 'Severe injury caused by high-pressure fluid penetrating soft tissue – medical emergency requiring immediate treatment',
    },
  ],
  relatedDocs: [
    { id: 'rd1', type: 'Related SWMS', document: 'Working Near Underground Services', revision: 'Current', status: 'current' },
    { id: 'rd2', type: 'Related SWMS', document: 'Working On or Near Exposed Live Parts', revision: 'Current', status: 'current' },
    { id: 'rd3', type: 'Related SWMS', document: 'Moving Powered Plant', revision: 'Current', status: 'current' },
    { id: 'rd4', type: 'Related SWMS', document: 'Manual Handling and Housekeeping', revision: 'Current', status: 'current' },
    { id: 'rd5', type: 'Related SWMS', document: 'Silica Dust Exposure', revision: 'Current', status: 'current' },
    { id: 'rd6', type: 'Related SWMS', document: 'Environmental Controls / Spill Response', revision: 'Current', status: 'current' },
    { id: 'rd7', type: 'Other', document: 'Dial Before You Dig / Before You Dig plans', revision: 'Current', status: 'current' },
    { id: 'rd8', type: 'Other', document: 'High Risk Crystalline Silica Statement (Appendix 1)', revision: '2024', status: 'current' },
  ],
  workerSignOns: [],
  supervisorDeclaration: {
    name: '',
    position: 'Site Supervisor',
    date: '',
    signatureData: '',
    comments:
      'I confirm this SWMS has been explained to all workers (including operators, spotters and ESO) and the documented precautions, controls and work methods will be complied with.',
  },
};

export default async function handler(req, res) {
  const info = await getPlatformOwnerInfo(req);
  if (!info) return res.status(401).json({ error: 'Unauthorised' });
  if (!info.isPlatformOwner) return res.status(403).json({ error: 'Platform owner access required' });

  const replace = req.query.replace === '1' || req.body?.replace === true;

  try {
    const title = SWMS_DATA.title;
    const swmsBodyJson = JSON.stringify(SWMS_DATA);
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
