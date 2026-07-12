/**
 * POST /api/owner-console/swms/seed-excavations-substation
 * Pushes the "Excavations in a Live Substation" SWMS to all active companies.
 * Platform owner only. Add ?replace=1 to overwrite existing records.
 */
import type { Request, Response } from 'express';
import { db } from '../../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getSessionAndProfile } from '../../../../lib/auth-middleware.js';

const SWMS_DATA = {
  buildMode: 'advanced',
  documentType: 'swms',
  title: 'Excavations in a Live Substation',
  category: 'Excavation / Electrical / Substation',
  revisionNumber: '1',
  reviewDate: '2026-07-13',
  authorName: 'Site Supervisor',
  approvedByName: 'Principal Contractor',
  status: 'draft',
  purpose:
    'This Safe Work Method Statement sets out the hazards, risks and controls for trenching and excavation works inside or immediately adjacent to live substations and around live underground electrical services. It is designed for civil, utility and substation environments where workers, plant and tools may come into proximity with energised assets, earthing grids and high-voltage infrastructure.',
  scope:
    'Applies to all workers undertaking excavation, trenching, potholing, vacuum excavation, hand excavation, plant operation or work near live underground electrical services, earthing grids, HV/LV cables, conduits or substation infrastructure. Includes planning, service location, positive identification, controlled excavation, protection of exposed assets, earthing grid works, backfill and completion.',
  includedActivities: [
    'Planning, preparation and competency verification',
    'Pre-start and consultation',
    'Review of service drawings and DBYD',
    'Site walkover, mark-up and exclusion zones',
    'Service locating and potholing',
    'Hand excavation near live services',
    'Vacuum / hydro excavation near live services',
    'Mechanical excavation near live services',
    'Working around earthing grids',
    'Minimum approach distances and ESO controls',
    'Protection of exposed services and cables',
    'Unexpected service strike or damage response',
    'Backfill, reinstatement and clean-up',
    'Task observation and monitoring',
  ],
  excludedActivities: [
    'Work on exposed live conductors without separate live-work authorisation',
    'Deep excavation greater than 1.5 m without additional trench support controls',
    'Unauthorised entry into substation switchyards',
  ],
  workBoundaries:
    'Site-specific live substation and underground service areas only. All work must be authorised by the asset owner / principal contractor. Stop work immediately if controls cannot be maintained or conditions change.',
  hrcwApplies: 'yes',
  hrcwCategories: [
    {
      id: 'h1',
      category: 'Work on or near energised electrical installations or services',
      whyApplies: 'Excavation inside or adjacent to live substations and around live HV/LV underground cables and earthing grids',
      linkedWorkStep: 'Mechanical excavation near live services / Hand excavation',
      requiredPermit: 'Access / excavation permit + service location confirmation',
      relatedSwms: 'Working On or Near Exposed Live Parts',
    },
    {
      id: 'h2',
      category: 'Work in an area with movement of powered mobile plant',
      whyApplies: 'Excavators, vacuum trucks and plant operating near live assets',
      linkedWorkStep: 'Mechanical excavation / Vacuum excavation',
      requiredPermit: '',
      relatedSwms: 'Moving Powered Plant',
    },
    {
      id: 'h3',
      category: 'Work in or near a shaft or trench deeper than 1.5 m or a tunnel',
      whyApplies: 'Possible deep trenches around services and earthing',
      linkedWorkStep: 'Mechanical excavation',
      requiredPermit: 'Excavation permit if required',
      relatedSwms: 'Working Near Underground Services',
    },
    {
      id: 'h4',
      category: 'Risk of a person falling more than 2 metres',
      whyApplies: 'Open excavations and work near edges',
      linkedWorkStep: 'Site setup and excavation',
      requiredPermit: '',
      relatedSwms: 'Working at Heights',
    },
  ],
  criticalControls: [
    {
      id: 'cc1',
      criticalRisk: 'Electric shock / electrocution from live underground cables or earthing',
      possibleOutcome: 'Fatality, serious burns or arc flash',
      mandatoryControls:
        'All services positively identified by potholing before any mechanical excavation. Treat all cables and earthing as live until proven otherwise. ESO required for work within restricted approach distances. Insulated gloves and non-conductive tools mandatory near live assets. No mechanical excavation within restricted clearances of live direct-buried cables.',
      verificationMethod: 'Potholing records + ESO appointment + approach distance confirmation',
      responsibleRole: 'Supervisor / ESO / All Workers',
      flags: ['critical', 'mandatory'],
    },
    {
      id: 'cc2',
      criticalRisk: 'Damage to earthing grid or induced voltage hazards',
      possibleOutcome: 'Rise of earth potential, shock, equipment damage',
      mandatoryControls:
        'Locate and mark earthing grid before excavation. Do not cut or disturb earthing cables without authorised repair method. Maintain equipotential bonding where required. Use insulating mats / gloves when working near earthing.',
      verificationMethod: 'Earthing grid mark-up + ESO supervision',
      responsibleRole: 'Supervisor / ESO',
      flags: ['critical', 'mandatory'],
    },
    {
      id: 'cc3',
      criticalRisk: 'Mechanical excavation striking live services',
      possibleOutcome: 'Electrocution, arc flash, service outage',
      mandatoryControls:
        'No mechanical excavation until all services within 1000 mm have been positively potholed. No mechanical excavation within 500 mm either side or 500 mm above a live direct-buried cable without ESO supervision and approved method. Prefer vacuum or hand excavation inside restricted zones. Spotter + positive communication at all times.',
      verificationMethod: 'Positive identification records + continuous ESO / spotter',
      responsibleRole: 'Operator / ESO / Spotter / Supervisor',
      flags: ['critical', 'mandatory'],
    },
    {
      id: 'cc4',
      criticalRisk: 'Inadequate rescue or delayed emergency response',
      possibleOutcome: 'Secondary injury or fatality',
      mandatoryControls:
        'Rescue kit, first aid and trained personnel available before work starts. Clear emergency access. Do not approach a person in contact with energised equipment until confirmed safe. Emergency contacts (including electricity emergency 131 962) known to all workers.',
      verificationMethod: 'Rescue readiness confirmed at pre-start',
      responsibleRole: 'Supervisor / ESO',
      flags: ['critical', 'mandatory'],
    },
  ],
  plantItems: [
    {
      id: 'p1',
      item: 'Excavator / Bobcat',
      requirement: 'Competent operator with VOC, daily pre-start, spotter / ESO, exclusion zones',
      inspectionRequired: 'Yes – daily pre-start',
      notes: 'No mechanical excavation until services positively located',
    },
    {
      id: 'p2',
      item: 'Vacuum / hydro excavation unit',
      requirement: 'Competent operators, ESO where live services present, pressure settings controlled',
      inspectionRequired: 'Yes – before use',
      notes: 'Preferred method near live cables',
    },
    {
      id: 'p3',
      item: 'Cable locator + non-conductive shovels + 1000 V insulated gloves',
      requirement: 'Competent locator, gloves within test date and inspected before use',
      inspectionRequired: 'Yes – before each use',
      notes: 'Gloves must be air-tested (rolled) before use',
    },
  ],
  ppeRows: [
    { item: 'Safety helmet', requirement: 'At all times on site and when working near plant or excavations' },
    { item: 'Steel-capped safety boots', requirement: 'At all times on site' },
    { item: 'Hi-vis long-sleeve cotton clothing', requirement: 'At all times on site' },
    { item: 'Medium impact eye protection', requirement: 'For excavation, locating, potholing and plant work' },
    { item: '1000 V insulated gloves (with leather outers)', requirement: 'Mandatory when working near live or suspected live services – inspect and air-test before use' },
    { item: 'Hearing protection', requirement: 'When plant or vacuum equipment creates noise' },
    { item: 'Respiratory protection', requirement: 'Where dust, silica or contaminated ground risk exists' },
    { item: 'UV protection and 30+ sunscreen', requirement: 'Outdoor works' },
  ],
  workSteps: [
    {
      id: 's1',
      sequenceNumber: 1,
      sequenceOfWork: 'Planning, preparation and competency verification',
      hazardsAndRisks: 'Unauthorised access; untrained workers; missing permits or ESO',
      possibleConsequence: 'Electrocution, non-compliance',
      initialRisk: 'high',
      controlMeasures:
        'Confirm access authorisation and excavation permit. All workers hold current construction induction and site induction. Supervisor confirms plant VOCs, ESO competency and rescue arrangements. Review related SWMS (underground services, live parts, powered plant). Confirm emergency contacts and electricity emergency number 131 962.',
      residualRisk: 'low',
      responsiblePerson: 'Supervisor',
      isCriticalControl: true,
      monitoringMethod: 'Permit, VOC and ESO check',
      stopWorkTrigger: 'Missing authorisation, ESO or competency',
      linkedPermit: 'Access / excavation permit',
      linkedSwms: 'Working On or Near Exposed Live Parts, Working Near Underground Services, Moving Powered Plant',
      evidenceRequired: 'Permits, VOCs, induction records',
      notes: '',
    },
    {
      id: 's2',
      sequenceNumber: 2,
      sequenceOfWork: 'Pre-start and consultation',
      hazardsAndRisks: 'Poor communication; unclear exclusion zones; changed conditions',
      possibleConsequence: 'Uncontrolled approach to live assets',
      initialRisk: 'high',
      controlMeasures:
        'Daily pre-start covering known services, earthing grid, exclusion zones, ESO role, communication methods, rescue plan and stop-work triggers. Confirm who is supervisor, ESO, spotter and operators. All workers sign onto this SWMS and understand the live substation rules.',
      residualRisk: 'low',
      responsiblePerson: 'Supervisor / All Workers',
      isCriticalControl: true,
      monitoringMethod: 'Pre-start attendance and sign-on',
      stopWorkTrigger: 'Incomplete briefing or missing ESO',
      linkedPermit: '',
      linkedSwms: '',
      evidenceRequired: 'Signed SWMS and pre-start record',
      notes: '',
    },
    {
      id: 's3',
      sequenceNumber: 3,
      sequenceOfWork: 'Review drawings, DBYD, walkover and mark-up',
      hazardsAndRisks: 'Inaccurate or incomplete service information; unmarked earthing',
      possibleConsequence: 'Service strike',
      initialRisk: 'high',
      controlMeasures:
        'Obtain and review DBYD, as-built drawings, cable schedules and earthing plans. Walk the area and mark all known/suspected services, pits, conduits and earthing grid. Do not rely on drawings alone. Photograph marks for reinstatement. Maintain markings for the duration of works.',
      residualRisk: 'low',
      responsiblePerson: 'Supervisor / Competent Locator',
      isCriticalControl: true,
      monitoringMethod: 'Document review + marked services',
      stopWorkTrigger: 'Incomplete or conflicting information',
      linkedPermit: '',
      linkedSwms: 'Working Near Underground Services',
      evidenceRequired: 'Marked drawings / photos',
      notes: '',
    },
    {
      id: 's4',
      sequenceNumber: 4,
      sequenceOfWork: 'Service locating and positive identification (potholing)',
      hazardsAndRisks: 'Failure to locate live cables; false negatives from locator',
      possibleConsequence: 'Electrocution',
      initialRisk: 'extreme',
      controlMeasures:
        'Competent person uses cable locator and marks detections. All services within 1000 mm of excavation must be positively identified by hand or vacuum potholing before mechanical excavation. Use insulated gloves and non-conductive tools. Treat every service as live until proven otherwise.',
      residualRisk: 'low',
      responsiblePerson: 'Competent Locator / ESO / Supervisor',
      isCriticalControl: true,
      monitoringMethod: 'Potholing records + visual confirmation',
      stopWorkTrigger: 'Unidentified services within 1000 mm',
      linkedPermit: '',
      linkedSwms: 'Working Near Underground Services, Vacuum Excavation',
      evidenceRequired: 'Potholing confirmation',
      notes: '',
    },
    {
      id: 's5',
      sequenceNumber: 5,
      sequenceOfWork: 'Hand excavation near live services',
      hazardsAndRisks: 'Contact with live cables; glove failure; manual handling',
      possibleConsequence: 'Electrocution, injury',
      initialRisk: 'extreme',
      controlMeasures:
        'ESO supervision mandatory within restricted distances. Use only non-conductive (fibreglass) shovels and 1000 V insulated gloves (air-tested before use). Inspect gloves for damage and discard if defective. Rotate workers to manage fatigue. Keep tools below shoulder height near exposed live parts.',
      residualRisk: 'low',
      responsiblePerson: 'ESO / All Workers',
      isCriticalControl: true,
      monitoringMethod: 'ESO continuous supervision + glove inspection',
      stopWorkTrigger: 'Damaged gloves or loss of ESO control',
      linkedPermit: '',
      linkedSwms: 'Manual Handling and Housekeeping',
      evidenceRequired: 'Glove inspection record',
      notes: '',
    },
    {
      id: 's6',
      sequenceNumber: 6,
      sequenceOfWork: 'Vacuum / hydro excavation near live services',
      hazardsAndRisks: 'Service damage; high-pressure injury; contamination',
      possibleConsequence: 'Injury, contamination',
      initialRisk: 'high',
      controlMeasures:
        'Competent vacuum operators only. ESO required where live services are present. Pressure settings controlled and directed toward the ground. Trigger must not be bypassed. Assess for contaminated ground, asbestos or acid sulphate soils before use. Preferred method inside restricted zones.',
      residualRisk: 'low',
      responsiblePerson: 'Operator / ESO / Supervisor',
      isCriticalControl: true,
      monitoringMethod: 'Operator competency + ESO',
      stopWorkTrigger: 'Uncontrolled pressure or suspected contamination',
      linkedPermit: '',
      linkedSwms: 'Vacuum Excavation',
      evidenceRequired: '',
      notes: '',
    },
    {
      id: 's7',
      sequenceNumber: 7,
      sequenceOfWork: 'Mechanical excavation near live services',
      hazardsAndRisks: 'Strike of live cable; arc flash; plant contact',
      possibleConsequence: 'Electrocution, fatality',
      initialRisk: 'extreme',
      controlMeasures:
        'No mechanical excavation until all services within 1000 mm positively potholed. No mechanical excavation within 500 mm either side or 500 mm above a live direct-buried cable without ESO and approved method. Spotter + positive communication mandatory. Stop immediately if marker tape, bedding, conduits or unexpected cables are found. Never excavate below exposed live cables or conduits.',
      residualRisk: 'low',
      responsiblePerson: 'Operator / ESO / Spotter / Supervisor',
      isCriticalControl: true,
      monitoringMethod: 'Continuous ESO / spotter observation',
      stopWorkTrigger: 'Approach distance breach or unexpected service',
      linkedPermit: '',
      linkedSwms: 'Moving Powered Plant',
      evidenceRequired: '',
      notes: '',
    },
    {
      id: 's8',
      sequenceNumber: 8,
      sequenceOfWork: 'Working around earthing grids',
      hazardsAndRisks: 'Cutting earthing; rise of earth potential; induced voltages',
      possibleConsequence: 'Shock, equipment damage',
      initialRisk: 'high',
      controlMeasures:
        'Locate and mark earthing grid before excavation. Do not cut or disconnect earthing cables without authorised repair method and bonding. Maintain equipotential where required. Use insulating PPE. All earthing repairs must restore continuity and be inspected before backfill.',
      residualRisk: 'low',
      responsiblePerson: 'Supervisor / ESO',
      isCriticalControl: true,
      monitoringMethod: 'Earthing mark-up + inspection',
      stopWorkTrigger: 'Uncontrolled earthing disturbance',
      linkedPermit: '',
      linkedSwms: 'Working On or Near Exposed Live Parts',
      evidenceRequired: 'Earthing repair record if applicable',
      notes: '',
    },
    {
      id: 's9',
      sequenceNumber: 9,
      sequenceOfWork: 'Unexpected service or damage response + backfill and clean-up',
      hazardsAndRisks: 'Service strike; incomplete protection; residual electrical hazard',
      possibleConsequence: 'Electrocution, future asset failure',
      initialRisk: 'high',
      controlMeasures:
        'Stop work immediately on any contact or unidentified service. Keep clear of damaged cables. Do not touch. Notify supervisor, principal contractor and electricity emergency 131 962 if electrical assets involved. Preserve scene. Backfill only after exposed services inspected and protected (warning tape, covers, bedding as required). Reinstate barriers and markings. Final inspection before leaving site.',
      residualRisk: 'low',
      responsiblePerson: 'Supervisor / All Workers',
      isCriticalControl: true,
      monitoringMethod: 'Immediate stop + final inspection',
      stopWorkTrigger: 'Any service contact or incomplete protection',
      linkedPermit: '',
      linkedSwms: '',
      evidenceRequired: 'Incident report and close-out records',
      notes: '',
    },
  ],
  taskRequirements: [
    {
      id: 'tr1',
      type: 'Safety Observer requirements',
      description: 'ESO mandatory for work within restricted approach distances of live services or inside live substations',
    },
    {
      id: 'tr2',
      type: 'Exclusion-zone requirements',
      description: 'Establish and maintain exclusion zones for plant, workers and public around open excavations and live assets',
    },
    {
      id: 'tr3',
      type: 'Rescue readiness',
      description: 'Rescue kit, first aid and emergency access available before work starts. Electricity emergency 131 962 known to all',
    },
    {
      id: 'tr4',
      type: 'Permit requirements',
      description: 'Access and excavation permits required. Service location confirmation before ground disturbance',
    },
    {
      id: 'tr5',
      type: 'Plant separation requirements',
      description: 'Spotter + positive communication for all plant movement near live assets. No mechanical excavation inside restricted clearances without ESO',
    },
  ],
  envControls: [
    { type: 'Housekeeping', description: 'Keep access ways and emergency routes clear. Progressive clean-up of spoil and tools.', responsiblePerson: 'All Workers' },
    { type: 'Waste', description: 'Manage spoil in accordance with site environmental requirements. Secure lightweight materials.', responsiblePerson: 'Supervisor' },
    { type: 'Spill kits', description: 'Spill kits available where plant, fuel or oil present.', responsiblePerson: 'Supervisor' },
    { type: 'Dust', description: 'Dust suppression where excavation or plant movement generates dust.', responsiblePerson: 'Supervisor' },
    { type: 'Erosion and sediment', description: 'Maintain erosion and sediment controls where ground disturbance occurs.', responsiblePerson: 'Supervisor' },
  ],
  emergencyActions: [
    { id: 'e1', action: 'Stop work immediately' },
    { id: 'e2', action: 'Do not approach or touch any damaged cable, conduit or person in contact with energised equipment until the area is confirmed safe' },
    { id: 'e3', action: 'Call Emergency Services on 000 for serious injury, electric shock, fire or rescue' },
    { id: 'e4', action: 'Contact electricity emergency on 131 962 where electrical assets may be involved' },
    { id: 'e5', action: 'Notify Site Supervisor and principal contractor immediately' },
    { id: 'e6', action: 'Keep all workers, plant and public clear of the area' },
    { id: 'e7', action: 'Provide first aid only when safe to do so' },
    { id: 'e8', action: 'Preserve the incident scene where required' },
    { id: 'e9', action: 'Do not restart work until the hazard is controlled and the SWMS has been reviewed if required' },
  ],
  emergencyModules: [],
  competencyRows: [
    { requirement: 'White Card / General Construction Induction', applies: true, evidenceOrAuth: 'Current card' },
    { requirement: 'Site induction (including live substation access)', applies: true, evidenceOrAuth: 'Site-specific' },
    { requirement: 'Plant competency / VOC', applies: true, evidenceOrAuth: 'As required for plant used' },
    { requirement: 'Electrical Safety Observer (ESO) competency', applies: true, evidenceOrAuth: 'Where required by task or asset owner' },
    { requirement: 'Service locating competency', applies: true, evidenceOrAuth: 'Competent locator' },
    { requirement: 'First aid', applies: false, evidenceOrAuth: '' },
  ],
  definitions: [
    {
      id: 'd1',
      term: 'Positive identification',
      definition: 'Service location and depth confirmed by potholing or vacuum excavation before any mechanical excavation proceeds',
    },
    {
      id: 'd2',
      term: 'ESO',
      definition: 'Electrical Safety Observer – competent person appointed to observe, warn and stop work where electrical risk or exclusion zones apply',
    },
    {
      id: 'd3',
      term: 'Restricted approach distance',
      definition: 'The closest distance a worker, plant or tool may approach a live asset under specified controls (typically 500–1000 mm depending on asset type)',
    },
  ],
  relatedDocs: [
    { id: 'rd1', type: 'Related SWMS', document: 'Working On or Near Exposed Live Parts', revision: 'Current', status: 'current' },
    { id: 'rd2', type: 'Related SWMS', document: 'Working Near Underground Services', revision: 'Current', status: 'current' },
    { id: 'rd3', type: 'Related SWMS', document: 'Moving Powered Plant', revision: 'Current', status: 'current' },
    { id: 'rd4', type: 'Related SWMS', document: 'Vacuum Excavation', revision: 'Current', status: 'current' },
    { id: 'rd5', type: 'Related SWMS', document: 'Manual Handling and Housekeeping', revision: 'Current', status: 'current' },
    { id: 'rd6', type: 'Other', document: 'Dial Before You Dig / Before You Dig plans', revision: 'Current', status: 'current' },
    { id: 'rd7', type: 'Other', document: 'Electrical Safety Code of Practice – Working Near Overhead and Underground Electric Lines', revision: 'Current', status: 'current' },
  ],
  workerSignOns: [],
  supervisorDeclaration: {
    name: '',
    position: 'Site Supervisor',
    date: '',
    signatureData: '',
    comments:
      'I confirm this SWMS has been explained to all workers (including ESO and plant operators) and the documented precautions, controls and work methods will be complied with.',
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
    const title = SWMS_DATA.title;
    const swmsBodyJson = JSON.stringify(SWMS_DATA);
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
              category        = 'Excavation / Electrical / Substation',
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
              'Excavation / Electrical / Substation',
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
    console.error('seed-excavations-substation error:', err);
    return res.status(500).json({ error: String(err) });
  }
}
