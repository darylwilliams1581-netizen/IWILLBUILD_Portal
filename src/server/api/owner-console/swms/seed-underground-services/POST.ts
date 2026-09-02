/**
 * POST /api/owner-console/swms/seed-underground-services
 * Pushes the Working Near Underground Services SWMS to all active companies.
 * Platform owner only. Add ?replace=1 to overwrite existing records.
 */
import type { Request, Response } from 'express';
import { db } from '../../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getPlatformOwnerInfo } from '../../../../lib/platform-owner-guard.js';

const UNDERGROUND_SERVICES_SWMS = {
  buildMode: 'advanced',
  documentType: 'swms',
  title: 'Working Near Underground Services',
  category: 'Excavation / Underground Services',
  revisionNumber: '1',
  reviewDate: '2026-07-13',
  authorName: 'Site Supervisor',
  approvedByName: 'Principal Contractor',
  status: 'draft',
  purpose:
    'This Safe Work Method Statement sets out the hazards, risks and controls for identifying, locating, exposing, protecting and working near underground services. It is designed for civil, earthworks, utility and substation work environments where underground electrical, communications, gas, water, sewer, stormwater, earthing grids or other assets may be present.',
  scope:
    'Applies to all workers undertaking service locating, potholing, excavation, plant operation or work near underground services. Includes planning, pre-start, service information review, locating, potholing, hand and vacuum excavation, mechanical excavation near services, protection of exposed services, backfill and reinstatement.',
  includedActivities: [
    'Planning, preparation and competency',
    'Pre-start and consultation',
    'Review underground service information',
    'Site walkover and mark-up',
    'Service locating',
    'Potholing and positive identification',
    'Hand excavation near services',
    'Vacuum excavation near services',
    'Mechanical excavation near services',
    'Minimum approach controls for electrical services',
    'Working around non-electrical services',
    'Earthing grid and substation infrastructure',
    'Protecting exposed services',
    'Unexpected service or service damage',
    'Backfill and reinstatement',
    'Task observation and monitoring',
    'Completion and clean up',
  ],
  excludedActivities: [
    'Deep excavation greater than 1.5 m without additional controls',
    'Live electrical work on exposed conductors without separate authorisation',
  ],
  workBoundaries:
    'Site-specific work areas only. Coordinate with principal contractor and asset owners. Stop work immediately if controls cannot be maintained or conditions change.',
  hrcwApplies: 'yes',
  hrcwCategories: [
    {
      id: 'h1',
      category: 'Work on or near energised electrical installations or services',
      whyApplies: 'Work near live LV/HV underground cables and conduits',
      linkedWorkStep: 'Potholing / Mechanical excavation near services',
      requiredPermit: 'Excavation permit / Service location confirmation',
      relatedSwms: 'Working On or Near Exposed Live Parts',
    },
    {
      id: 'h2',
      category: 'Work in an area with movement of powered mobile plant',
      whyApplies: 'Excavators, vacuum trucks and plant operating near services',
      linkedWorkStep: 'Mechanical excavation near services',
      requiredPermit: '',
      relatedSwms: 'Moving Powered Plant',
    },
    {
      id: 'h3',
      category: 'Work in or near a shaft or trench deeper than 1.5 m or a tunnel',
      whyApplies: 'Possible deep excavation around services',
      linkedWorkStep: 'Mechanical excavation',
      requiredPermit: 'Excavation permit if required',
      relatedSwms: 'Excavations in a Live Substation',
    },
  ],
  criticalControls: [
    {
      id: 'cc1',
      criticalRisk: 'Underground service strike',
      possibleOutcome: 'Electric shock, explosion, fire, service outage or serious injury',
      mandatoryControls:
        'DBYD / service plans; site inspection; locating; potholing; no mechanical excavation until services are positively identified. Treat all services as live until proven otherwise.',
      verificationMethod: 'Service location confirmation + potholing records',
      responsibleRole: 'Supervisor / Competent Locator',
      flags: ['critical', 'mandatory'],
    },
    {
      id: 'cc2',
      criticalRisk: 'Live underground electrical services',
      possibleOutcome: 'Electrocution, arc flash, burns or fatality',
      mandatoryControls:
        'ESO where required; exclusion zones; insulated gloves and non-conductive tools; maintain required approach distances. No mechanical excavation within restricted distances of live cables.',
      verificationMethod: 'ESO appointment + approach distance confirmation',
      responsibleRole: 'Supervisor / ESO',
      flags: ['critical', 'mandatory'],
    },
    {
      id: 'cc3',
      criticalRisk: 'Unidentified or inaccurate service information',
      possibleOutcome: 'Unexpected contact with services',
      mandatoryControls:
        'Do not rely on plans alone. Verify with drawings, locating, potholing and consultation with asset owner / principal contractor. Treat all services as live.',
      verificationMethod: 'Positive identification before mechanical excavation',
      responsibleRole: 'Supervisor',
      flags: ['critical', 'mandatory'],
    },
    {
      id: 'cc4',
      criticalRisk: 'Mechanical excavation near services',
      possibleOutcome: 'Service damage, electrocution or asset failure',
      mandatoryControls:
        'Spotter, positive communication, clearance distances, controlled excavation method and stop work if marker tape, conduits or cables are found. No mechanical excavation below exposed services unless approved controls are in place.',
      verificationMethod: 'Spotter + communication check',
      responsibleRole: 'Operator / Spotter / Supervisor',
      flags: ['critical', 'mandatory'],
    },
  ],
  plantItems: [
    {
      id: 'p1',
      item: 'Excavator / Bobcat / Vacuum excavation truck',
      requirement: 'Competent operators, spotter, pre-start inspection, positive communication',
      inspectionRequired: 'Yes – daily pre-start',
      notes: 'No mechanical excavation until services positively located',
    },
    {
      id: 'p2',
      item: 'Cable locator',
      requirement: 'Used by competent person',
      inspectionRequired: 'Yes',
      notes: 'Do not assume absence of signal means absence of service',
    },
    {
      id: 'p3',
      item: 'Non-conductive shovels / insulated tools / 1000V insulated gloves',
      requirement: 'For hand excavation near live electrical services',
      inspectionRequired: 'Yes – before use (gloves test date)',
      notes: 'Inspect gloves for damage before use',
    },
  ],
  ppeRows: [
    { item: 'Safety helmet', requirement: 'At all times on site and when working near plant or excavations' },
    { item: 'Steel-capped safety boots', requirement: 'At all times on site' },
    { item: 'Hi-vis long-sleeve cotton clothing', requirement: 'At all times on site' },
    { item: 'Medium impact eye protection', requirement: 'For locating, excavation, potholing, cutting, digging and work near plant' },
    { item: 'Task-specific gloves (durable or 1000V insulated as required)', requirement: '1000V insulated gloves where live electrical services are identified or suspected' },
    { item: 'Hearing protection', requirement: 'Where plant, vacuum excavation or power tool noise is present' },
    { item: 'Respiratory protection', requirement: 'Where dust, silica, fumes or contaminated ground risk is present' },
    { item: 'UV protection and 30+ sunscreen', requirement: 'Outdoor works' },
  ],
  workSteps: [
    {
      id: 's1',
      sequenceNumber: 1,
      sequenceOfWork: 'Planning, preparation and competency',
      hazardsAndRisks: 'Legislation breach; untrained workers; incorrect method',
      possibleConsequence: 'Injury, non-compliance',
      initialRisk: 'high',
      controlMeasures:
        'All workers must hold current construction induction and complete the site induction. Supervisor to confirm worker competency, plant VOCs, permits and site requirements. Review all relevant SWMS including excavation, powered plant and working near live electrical assets. Confirm whether an Electrical Safety Observer (ESO) is required. Confirm emergency procedures, communication methods, first aid and rescue arrangements before work starts.',
      residualRisk: 'low',
      responsiblePerson: 'Supervisor',
      isCriticalControl: true,
      monitoringMethod: 'Competency and permit check',
      stopWorkTrigger: 'Missing competency, permits or ESO when required',
      linkedPermit: 'Excavation permit if required',
      linkedSwms: 'Moving Powered Plant, Working On or Near Exposed Live Parts',
      evidenceRequired: 'Induction records, VOCs, permits',
      notes: '',
    },
    {
      id: 's2',
      sequenceNumber: 2,
      sequenceOfWork: 'Pre-start and consultation',
      hazardsAndRisks: 'Poor communication; changed conditions; unclear work method',
      possibleConsequence: 'Injury, service strike',
      initialRisk: 'medium',
      controlMeasures:
        'Attend daily pre-start meeting before commencing work. Discuss known services, permit conditions, exclusion zones, plant movements and emergency response. Confirm who is supervising, spotting and operating plant. Identify additional hazards and implement controls before work starts. Stop work if the job changes or controls cannot be maintained.',
      residualRisk: 'low',
      responsiblePerson: 'Supervisor / All Workers',
      isCriticalControl: false,
      monitoringMethod: 'Daily pre-start',
      stopWorkTrigger: 'Unclear roles or uncontrolled hazards',
      linkedPermit: '',
      linkedSwms: '',
      evidenceRequired: 'Pre-start record',
      notes: '',
    },
    {
      id: 's3',
      sequenceNumber: 3,
      sequenceOfWork: 'Review underground service information',
      hazardsAndRisks: 'Inaccurate or incomplete service information',
      possibleConsequence: 'Service strike',
      initialRisk: 'high',
      controlMeasures:
        'Obtain and review DBYD / Before You Dig information and principal contractor service drawings. Review available as-built drawings, site plans, cable schedules and service records. Consult with the principal contractor, client or asset owner where service location is uncertain. Treat all services as live until positively identified and confirmed otherwise. Do not rely on plans alone; verify service locations onsite.',
      residualRisk: 'low',
      responsiblePerson: 'Supervisor',
      isCriticalControl: true,
      monitoringMethod: 'Document review + consultation',
      stopWorkTrigger: 'Incomplete or conflicting service information',
      linkedPermit: '',
      linkedSwms: '',
      evidenceRequired: 'DBYD and drawings on site',
      notes: '',
    },
    {
      id: 's4',
      sequenceNumber: 4,
      sequenceOfWork: 'Site walkover and mark-up',
      hazardsAndRisks: 'Unidentified pits, conduits, trenches, marker tape or service routes',
      possibleConsequence: 'Service strike',
      initialRisk: 'high',
      controlMeasures:
        'Walk the work area before excavation or ground disturbance. Inspect pits, cable trenches, foundations, marker posts, valves, conduits and surface signs of underground services. Mark known and suspected service locations using paint, pegs, flags or other approved marking methods. Take photos or measurements where required so marks can be reinstated if lost. Maintain service markings for the duration of the work.',
      residualRisk: 'low',
      responsiblePerson: 'Supervisor / All Workers',
      isCriticalControl: true,
      monitoringMethod: 'Visual walkover + marking',
      stopWorkTrigger: 'Unmarked or unclear service routes',
      linkedPermit: '',
      linkedSwms: '',
      evidenceRequired: 'Marked services and photos',
      notes: '',
    },
    {
      id: 's5',
      sequenceNumber: 5,
      sequenceOfWork: 'Service locating',
      hazardsAndRisks: 'Failure to locate underground assets',
      possibleConsequence: 'Service strike',
      initialRisk: 'high',
      controlMeasures:
        'Cable locating equipment shall be used by a competent person where required. Scan the proposed work area and mark detected services. Identify limitations of locating equipment and do not assume absence of a signal means absence of a service. Where services are suspected or records are uncertain, potholing or vacuum excavation must be used to confirm the service.',
      residualRisk: 'low',
      responsiblePerson: 'Competent Locator / Supervisor',
      isCriticalControl: true,
      monitoringMethod: 'Locator scan + marking',
      stopWorkTrigger: 'Uncertain service locations',
      linkedPermit: '',
      linkedSwms: '',
      evidenceRequired: 'Locator results marked',
      notes: '',
    },
    {
      id: 's6',
      sequenceNumber: 6,
      sequenceOfWork: 'Potholing and positive identification',
      hazardsAndRisks: 'Electric shock; service strike; conduit damage',
      possibleConsequence: 'Electrocution, injury',
      initialRisk: 'high',
      controlMeasures:
        'Services within the work area must be positively located before mechanical excavation proceeds. Services within 1000 mm of the excavation edge must be potholed to confirm exact location and depth. Potholing to be completed by hand or vacuum excavation as required. Use insulated gloves and non-conductive tools where live electrical services are identified or suspected. Do not use crowbars, picks or jackhammers near suspected live services unless specifically controlled and approved.',
      residualRisk: 'low',
      responsiblePerson: 'Supervisor / ESO / All Workers',
      isCriticalControl: true,
      monitoringMethod: 'Potholing records + ESO supervision',
      stopWorkTrigger: 'Unidentified services or tool damage risk',
      linkedPermit: '',
      linkedSwms: 'Vacuum Excavation',
      evidenceRequired: 'Potholing confirmation',
      notes: '',
    },
    {
      id: 's7',
      sequenceNumber: 7,
      sequenceOfWork: 'Hand excavation near services',
      hazardsAndRisks: 'Contact with live cables; hand injury; manual handling strain',
      possibleConsequence: 'Electrocution, injury',
      initialRisk: 'high',
      controlMeasures:
        'All hand excavation within 1000 mm of known or suspected live electrical services must be supervised by an ESO where required. Use fibreglass or non-conductive shovels and insulated tools where live electrical services may be present. Wear 1000V insulated gloves where required and inspect gloves before use. Shovels must not be taken above shoulder height near exposed live parts. Rotate workers and take breaks to manage manual handling and fatigue.',
      residualRisk: 'low',
      responsiblePerson: 'Supervisor / ESO / All Workers',
      isCriticalControl: true,
      monitoringMethod: 'ESO supervision + glove inspection',
      stopWorkTrigger: 'Damaged gloves or loss of ESO control',
      linkedPermit: '',
      linkedSwms: 'Manual Handling and Housekeeping',
      evidenceRequired: 'Glove inspection record',
      notes: '',
    },
    {
      id: 's8',
      sequenceNumber: 8,
      sequenceOfWork: 'Vacuum excavation near services',
      hazardsAndRisks: 'Service damage; high pressure water injury; contaminated material',
      possibleConsequence: 'Injury, contamination',
      initialRisk: 'high',
      controlMeasures:
        'Vacuum excavation to be undertaken by competent operators. ESO required where live underground electrical services are identified or suspected and required by site controls. Pressure settings must comply with equipment and site requirements. Water jet must be directed towards the ground and trigger must not be bypassed. Contaminated soils, asbestos, PCB or acid sulphate soil risks must be assessed before vacuum excavation is used.',
      residualRisk: 'low',
      responsiblePerson: 'Supervisor / ESO / Operator',
      isCriticalControl: true,
      monitoringMethod: 'Operator competency + ESO',
      stopWorkTrigger: 'Suspected contamination or uncontrolled pressure',
      linkedPermit: '',
      linkedSwms: 'Vacuum Excavation',
      evidenceRequired: '',
      notes: '',
    },
    {
      id: 's9',
      sequenceNumber: 9,
      sequenceOfWork: 'Mechanical excavation near services',
      hazardsAndRisks: 'Underground service strike; electrocution; plant contact',
      possibleConsequence: 'Serious injury or fatality',
      initialRisk: 'extreme',
      controlMeasures:
        'No mechanical excavation shall commence until services have been positively located. A spotter shall be used where plant operates near services, structures, workers or exclusion zones. Stop immediately if marker tape, bedding sand, conduits, unknown cables or unexpected ground conditions are encountered. Mechanical excavation must not occur below exposed services unless approved controls are in place. Maintain positive communication between operator, spotter and supervisor at all times.',
      residualRisk: 'low',
      responsiblePerson: 'Supervisor / Operator / Spotter',
      isCriticalControl: true,
      monitoringMethod: 'Spotter + continuous communication',
      stopWorkTrigger: 'Loss of visual/radio contact or unexpected services',
      linkedPermit: '',
      linkedSwms: 'Moving Powered Plant',
      evidenceRequired: '',
      notes: '',
    },
    {
      id: 's10',
      sequenceNumber: 10,
      sequenceOfWork: 'Minimum approach controls for electrical services',
      hazardsAndRisks: 'Electric shock; arc flash; damage to HV/LV cables',
      possibleConsequence: 'Electrocution, fatality',
      initialRisk: 'extreme',
      controlMeasures:
        'No mechanical excavation within 1000 mm of a live direct buried cable unless under ESO supervision and approved controls. For direct buried HV cables: no mechanical excavation within 500 mm either side or 500 mm above the cable unless mechanical protection is confirmed. For cables in conduit: no mechanical excavation within 300 mm either side or 300 mm above the conduit. At no stage is mechanical excavation permitted below a direct buried cable or exposed conduit containing cables. Manual or vacuum excavation must be used inside restricted distances.',
      residualRisk: 'low',
      responsiblePerson: 'Supervisor / ESO / Operator / Spotter',
      isCriticalControl: true,
      monitoringMethod: 'ESO supervision + measured clearances',
      stopWorkTrigger: 'Approach distance breached',
      linkedPermit: '',
      linkedSwms: 'Working On or Near Exposed Live Parts',
      evidenceRequired: '',
      notes: '',
    },
    {
      id: 's11',
      sequenceNumber: 11,
      sequenceOfWork: 'Unexpected service or service damage',
      hazardsAndRisks: 'Electric shock, explosion, outage, flooding or environmental harm',
      possibleConsequence: 'Serious injury, fatality, environmental harm',
      initialRisk: 'high',
      controlMeasures:
        'Stop work immediately if an unidentified service is found or a service is contacted. Move workers and plant away from the area where safe to do so. Do not touch exposed or damaged electrical services. Notify Site Supervisor and principal contractor immediately. Contact emergency services or utility emergency contacts where required. Preserve the scene and do not recommence until authorised and controls are reviewed.',
      residualRisk: 'low',
      responsiblePerson: 'Supervisor / All Workers',
      isCriticalControl: true,
      monitoringMethod: 'Immediate stop and notification',
      stopWorkTrigger: 'Any service contact or unidentified service',
      linkedPermit: '',
      linkedSwms: '',
      evidenceRequired: 'Incident report',
      notes: '',
    },
    {
      id: 's12',
      sequenceNumber: 12,
      sequenceOfWork: 'Backfill, reinstatement, observation and clean up',
      hazardsAndRisks: 'Damage to exposed services; poor compaction; remaining hazards; unsecured excavation',
      possibleConsequence: 'Future service risk, injury',
      initialRisk: 'medium',
      controlMeasures:
        'Backfill only after exposed services have been inspected and protection requirements confirmed. Use approved bedding, warning tape, marker tape or covers where required. Do not compact directly over exposed or unsupported services unless approved. Reinstate markings, barriers and surface controls as required. Remove tools, rubbish and trip hazards. Maintain barricades until area is safe. Secure loose materials. Return permits and records. Conduct final inspection before leaving site.',
      residualRisk: 'low',
      responsiblePerson: 'Supervisor / All Workers',
      isCriticalControl: false,
      monitoringMethod: 'Final inspection',
      stopWorkTrigger: 'Unprotected services or incomplete reinstatement',
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
      description: 'ESO required where live underground electrical services are identified or suspected',
    },
    {
      id: 'tr2',
      type: 'Exclusion-zone requirements',
      description: 'Establish exclusion zones for plant, workers and public around open excavations and exposed services',
    },
    {
      id: 'tr3',
      type: 'Permit requirements',
      description: 'Excavation permit and service location confirmation required before ground disturbance',
    },
  ],
  envControls: [
    {
      type: 'Housekeeping',
      description: 'Keep work areas clear of tools, rubbish and trip hazards. Maintain barricades and signage.',
      responsiblePerson: 'All Workers',
    },
    {
      type: 'Waste',
      description: 'Manage spoil and waste in accordance with site environmental requirements.',
      responsiblePerson: 'Supervisor',
    },
    {
      type: 'Spill kits',
      description: 'Spill kits must be available where plant, fuel, oil or chemicals are present.',
      responsiblePerson: 'Supervisor',
    },
    {
      type: 'Dust',
      description: 'Dust suppression must be used where locating, excavation or plant movement generates dust.',
      responsiblePerson: 'Supervisor',
    },
    {
      type: 'Erosion and sediment',
      description: 'Erosion and sediment controls must be maintained where ground disturbance occurs.',
      responsiblePerson: 'Supervisor',
    },
  ],
  emergencyActions: [
    { id: 'e1', action: 'Stop work immediately' },
    { id: 'e2', action: 'Make the area safe if it is safe to do so' },
    { id: 'e3', action: 'Keep all workers and plant clear of damaged or exposed services' },
    { id: 'e4', action: 'Do not touch any exposed or damaged electrical cable or conduit' },
    { id: 'e5', action: 'Notify Site Supervisor and the principal contractor immediately' },
    { id: 'e6', action: 'Contact Emergency Services on 000 where required' },
    { id: 'e7', action: 'Contact electricity emergency on 131 962 where electrical assets may be involved' },
    { id: 'e8', action: 'Preserve the incident scene where required' },
    { id: 'e9', action: 'Do not restart work until the hazard is controlled and the SWMS has been reviewed if required' },
  ],
  emergencyModules: [],
  competencyRows: [
    { requirement: 'White Card / General Construction Induction', applies: true, evidenceOrAuth: 'Current card' },
    { requirement: 'Site induction', applies: true, evidenceOrAuth: 'Site-specific' },
    { requirement: 'Plant competency / VOC', applies: true, evidenceOrAuth: 'As required for plant used' },
    { requirement: 'Service locating competency', applies: true, evidenceOrAuth: 'Competent locator' },
    { requirement: 'Electrical Safety Observer (ESO)', applies: true, evidenceOrAuth: 'Where required by task or site' },
    { requirement: 'First aid', applies: false, evidenceOrAuth: '' },
  ],
  definitions: [
    {
      id: 'd1',
      term: 'Positive identification',
      definition:
        'Service location and depth confirmed by potholing or vacuum excavation before mechanical excavation proceeds',
    },
    {
      id: 'd2',
      term: 'ESO',
      definition:
        'Electrical Safety Observer – competent person appointed to observe and warn workers or operators where electrical risk or exclusion zones apply',
    },
  ],
  relatedDocs: [
    { id: 'rd1', type: 'Related SWMS', document: 'Moving Powered Plant', revision: 'Current', status: 'current' },
    { id: 'rd2', type: 'Related SWMS', document: 'Working On or Near Exposed Live Parts', revision: 'Current', status: 'current' },
    { id: 'rd3', type: 'Related SWMS', document: 'Vacuum Excavation', revision: 'Current', status: 'current' },
    { id: 'rd4', type: 'Related SWMS', document: 'Manual Handling and Housekeeping', revision: 'Current', status: 'current' },
    { id: 'rd5', type: 'Related SWMS', document: 'Excavations in a Live Substation', revision: 'Current', status: 'current' },
    { id: 'rd6', type: 'Other', document: 'Dial Before You Dig / Before You Dig plans', revision: 'Current', status: 'current' },
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
    const title = UNDERGROUND_SERVICES_SWMS.title;
    const swmsBodyJson = JSON.stringify(UNDERGROUND_SERVICES_SWMS);
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
