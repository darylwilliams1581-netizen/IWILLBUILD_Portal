/**
 * POST /api/owner-console/swms/seed-traffic-management
 * Pushes the "Traffic Management / Working Near Roads" SWMS to all active companies.
 * Platform owner only. Add ?replace=1 to overwrite existing records.
 */
import type { Request, Response } from 'express';
import { db } from '../../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getPlatformOwnerInfo } from '../../../../lib/platform-owner-guard.js';

const SWMS_DATA = {
  buildMode: 'advanced',
  documentType: 'swms',
  title: 'Traffic Management / Working Near Roads',
  category: 'Traffic Management / Site Access / Vehicle Interface',
  revisionNumber: '1',
  reviewDate: '2026-07-13',
  authorName: 'Site Supervisor',
  approvedByName: 'Principal Contractor',
  status: 'draft',
  purpose:
    'This Safe Work Method Statement sets out the hazards, risks and controls for traffic management, site access, vehicle movements, delivery activities and work near public roads or internal access routes. It is designed for civil, earthworks, utility and substation work environments where workers, mobile plant, public vehicles, delivery vehicles and pedestrians may interact.',
  scope:
    'Applies to all workers managing or working near traffic, site access points, delivery vehicles, public roads, internal access roads and plant/pedestrian interfaces. Includes establishment, maintenance and removal of traffic controls, vehicle movements, reversing, loading/unloading, emergency access and clean-up.',
  includedActivities: [
    'Planning, preparation and competency verification',
    'Pre-start and consultation',
    'Review of Traffic Management Plan (TMP) and permits',
    'Establishment of traffic controls (signs, cones, barriers, exclusion zones)',
    'Site access and entry control',
    'Vehicle and plant movements near workers',
    'Reversing vehicles and plant',
    'Delivery, loading and unloading interfaces',
    'Working near public roads and road reserves',
    'Pedestrian and plant separation',
    'Night / low visibility work',
    'Emergency access and egress',
    'Task observation and monitoring',
    'Removal of traffic controls and pack-up',
  ],
  excludedActivities: [
    'High-speed roadworks requiring full road authority TMP without separate authorisation',
    'Work on live traffic lanes without accredited traffic controllers where required',
  ],
  workBoundaries:
    'Site-specific access roads, public road interfaces and vehicle movement areas only. Coordinate with principal contractor and road authority as required. Stop work immediately if controls cannot be maintained or conditions change.',
  hrcwApplies: 'yes',
  hrcwCategories: [
    {
      id: 'h1',
      category: 'Work on, in or adjacent to a road or other traffic corridor',
      whyApplies: 'Work near public roads, access roads, driveways and vehicle movement areas',
      linkedWorkStep: 'Working near public roads / Site access control',
      requiredPermit: 'Traffic Management Plan / Road authority permit if required',
      relatedSwms: 'Moving Powered Plant',
    },
    {
      id: 'h2',
      category: 'Work in an area with movement of powered mobile plant',
      whyApplies: 'Plant, trucks and delivery vehicles operating near workers and public',
      linkedWorkStep: 'Vehicle and plant movements / Reversing',
      requiredPermit: '',
      relatedSwms: 'Moving Powered Plant',
    },
    {
      id: 'h3',
      category: 'Risk of a person falling more than 2 metres',
      whyApplies: 'Possible work near edges, excavations or elevated access points',
      linkedWorkStep: 'Site access and traffic control setup',
      requiredPermit: '',
      relatedSwms: 'Working at Heights',
    },
    {
      id: 'h4',
      category: 'Work on or near energised electrical installations or services',
      whyApplies: 'Possible interaction with underground or overhead services near roads',
      linkedWorkStep: 'Traffic control setup near services',
      requiredPermit: '',
      relatedSwms: 'Working Near Underground Services, Working On or Near Exposed Live Parts',
    },
  ],
  criticalControls: [
    {
      id: 'cc1',
      criticalRisk: 'Vehicle or plant striking worker',
      possibleOutcome: 'Serious injury or fatality',
      mandatoryControls:
        'Separate people from vehicles and plant. Establish and maintain exclusion zones. Use spotters and positive communication. High-visibility clothing mandatory. Workers must never stand between vehicles or between vehicles and fixed objects. Do not cross traffic paths unless it is safe and communication is confirmed.',
      verificationMethod: 'Exclusion zone setup + spotter confirmation + communication check',
      responsibleRole: 'Supervisor / Spotter / All Workers',
      flags: ['critical', 'mandatory'],
    },
    {
      id: 'cc2',
      criticalRisk: 'Public traffic interface / collision',
      possibleOutcome: 'Vehicle collision, public injury or property damage',
      mandatoryControls:
        'Traffic Management Plan (TMP) implemented where required. Correct signage, cones, barriers and speed control. Accredited traffic controllers / implementers used where specified by TMP or road authority. Maintain clear delineation between work area and public traffic.',
      verificationMethod: 'TMP compliance check + traffic controller confirmation',
      responsibleRole: 'Supervisor / Traffic Controller',
      flags: ['critical', 'mandatory'],
    },
    {
      id: 'cc3',
      criticalRisk: 'Reversing vehicles and plant',
      possibleOutcome: 'Crush injury or fatality',
      mandatoryControls:
        'Avoid reversing where practical by planning one-way routes and turning areas. Use spotters where visibility is restricted or people, services, structures or plant are nearby. Reversing alarms and beacons operational. Operator must stop immediately if visual or radio contact with spotter is lost. Spotter must never place themselves in the line of fire.',
      verificationMethod: 'Spotter appointment + communication method confirmed',
      responsibleRole: 'Operator / Spotter',
      flags: ['critical', 'mandatory'],
    },
    {
      id: 'cc4',
      criticalRisk: 'Uncontrolled site access or delivery interface',
      possibleOutcome: 'Unauthorised entry, vehicle conflict or public exposure',
      mandatoryControls:
        'Control entry points with signage, barricades and designated routes. Plan delivery routes and establish exclusion zones for loading/unloading. Use spotter during deliveries. Keep workers clear of loading/unloading zones. Sign-in requirements enforced where applicable.',
      verificationMethod: 'Access control and delivery plan confirmation',
      responsibleRole: 'Supervisor / Spotter',
      flags: ['critical', 'mandatory'],
    },
    {
      id: 'cc5',
      criticalRisk: 'Poor visibility / lighting',
      possibleOutcome: 'Collision, struck-by injury or pedestrian impact',
      mandatoryControls:
        'High-visibility clothing mandatory. Use beacons, lighting and reflective signage. Cease or modify work if visibility is unsafe. Additional lighting for night or low-visibility conditions.',
      verificationMethod: 'Visibility assessment + PPE check',
      responsibleRole: 'Supervisor / All Workers',
      flags: ['critical'],
    },
  ],
  plantItems: [
    {
      id: 'p1',
      item: 'Trucks / Delivery vehicles / Plant (excavators, bobcats, loaders)',
      requirement: 'Competent operators, reversing alarms, beacons, spotter for reverse or restricted movements, exclusion zones',
      inspectionRequired: 'Yes – daily pre-start for plant',
      notes: 'One-way routes preferred',
    },
    {
      id: 'p2',
      item: 'Traffic control devices (signs, cones, barriers, bollards, temporary fencing)',
      requirement: 'Compliant with TMP and AS 1742 series, correctly installed and maintained',
      inspectionRequired: 'Yes – daily and after weather/events',
      notes: 'Must not create additional hazards',
    },
  ],
  ppeRows: [
    { item: 'Safety helmet', requirement: 'At all times on site and when working near plant or traffic' },
    { item: 'Steel-capped safety boots', requirement: 'At all times on site' },
    { item: 'Hi-vis long-sleeve clothing (Class D/N or equivalent)', requirement: 'At all times on site – mandatory near traffic and plant' },
    { item: 'Safety glasses / goggles', requirement: 'As required by task' },
    { item: 'Hearing protection', requirement: 'When plant or traffic noise requires it' },
    { item: 'Task-specific gloves', requirement: 'When handling barriers, signs or materials' },
    { item: 'Sunscreen + hat', requirement: 'Outdoor work – reapply as required' },
  ],
  workSteps: [
    {
      id: 's1',
      sequenceNumber: 1,
      sequenceOfWork: 'Planning, preparation and competency verification',
      hazardsAndRisks: 'Untrained workers; missing TMP or permits; incorrect traffic control method',
      possibleConsequence: 'Collision, injury, non-compliance',
      initialRisk: 'high',
      controlMeasures:
        'Confirm Traffic Management Plan (TMP) and any road authority permits are current. All workers hold construction induction and site induction. Confirm accredited traffic controllers / implementers where required by TMP. Review related SWMS for plant, services and deliveries. Confirm emergency access routes and contacts.',
      residualRisk: 'low',
      responsiblePerson: 'Supervisor',
      isCriticalControl: true,
      monitoringMethod: 'TMP and competency check',
      stopWorkTrigger: 'Missing TMP, permits or required traffic controllers',
      linkedPermit: 'Traffic Management Plan / Road authority permit',
      linkedSwms: 'Moving Powered Plant, Delivery Loading Unloading',
      evidenceRequired: 'TMP, permits, competency records',
      notes: '',
    },
    {
      id: 's2',
      sequenceNumber: 2,
      sequenceOfWork: 'Pre-start and consultation',
      hazardsAndRisks: 'Poor communication; unclear roles; changed traffic conditions',
      possibleConsequence: 'Uncontrolled vehicle/pedestrian interaction',
      initialRisk: 'high',
      controlMeasures:
        'Daily pre-start covering TMP requirements, exclusion zones, vehicle routes, reversing procedures, delivery schedules, emergency access and stop-work triggers. Confirm who is supervisor, spotter, traffic controller and operators. All workers sign onto this SWMS and understand the traffic rules.',
      residualRisk: 'low',
      responsiblePerson: 'Supervisor / All Workers',
      isCriticalControl: true,
      monitoringMethod: 'Pre-start attendance and sign-on',
      stopWorkTrigger: 'Incomplete briefing or missing roles',
      linkedPermit: '',
      linkedSwms: '',
      evidenceRequired: 'Signed SWMS and pre-start record',
      notes: '',
    },
    {
      id: 's3',
      sequenceNumber: 3,
      sequenceOfWork: 'Establishment of traffic controls and exclusion zones',
      hazardsAndRisks: 'Incorrect setup; public entering work area; vehicle conflict',
      possibleConsequence: 'Collision, public injury',
      initialRisk: 'extreme',
      controlMeasures:
        'Install signs, cones, barriers and temporary fencing in accordance with the TMP and AS 1742. Establish clear exclusion zones between public traffic, site vehicles and workers. Maintain clear delineation of work area. Ensure devices do not create additional hazards (e.g. trip points, reduced visibility). Inspect controls daily and after weather events.',
      residualRisk: 'low',
      responsiblePerson: 'Supervisor / Traffic Controller',
      isCriticalControl: true,
      monitoringMethod: 'TMP compliance inspection',
      stopWorkTrigger: 'Controls not as per TMP or damaged',
      linkedPermit: '',
      linkedSwms: '',
      evidenceRequired: 'Daily inspection record',
      notes: '',
    },
    {
      id: 's4',
      sequenceNumber: 4,
      sequenceOfWork: 'Site access and entry control',
      hazardsAndRisks: 'Unauthorised entry; vehicle conflict at entry points; public exposure',
      possibleConsequence: 'Collision, unauthorised access',
      initialRisk: 'high',
      controlMeasures:
        'Control entry points with signage, barricades and designated routes. Enforce sign-in where required. Keep public and unauthorised vehicles out of the work area. Maintain clear sight lines at access points. Coordinate arrivals with deliveries and plant movements.',
      residualRisk: 'low',
      responsiblePerson: 'Supervisor / Gate person / Spotter',
      isCriticalControl: true,
      monitoringMethod: 'Access control observation',
      stopWorkTrigger: 'Uncontrolled access or blocked emergency route',
      linkedPermit: '',
      linkedSwms: '',
      evidenceRequired: '',
      notes: '',
    },
    {
      id: 's5',
      sequenceNumber: 5,
      sequenceOfWork: 'Vehicle and plant movements / Reversing',
      hazardsAndRisks: 'Plant or vehicle striking workers; reverse blind spots; collision with fixed objects',
      possibleConsequence: 'Crush injury or fatality',
      initialRisk: 'extreme',
      controlMeasures:
        'Plan one-way routes and turning areas to minimise reversing. Spotter required for reverse movements in congested or restricted areas. Positive radio or hand-signal communication. Operator stops immediately if contact with spotter is lost. Spotter never stands in line of fire or between vehicles/fixed objects. High-visibility clothing and exclusion zones maintained. Reversing alarms and beacons operational.',
      residualRisk: 'low',
      responsiblePerson: 'Operator / Spotter / Supervisor',
      isCriticalControl: true,
      monitoringMethod: 'Continuous spotter observation + communication',
      stopWorkTrigger: 'Loss of communication or persons in path',
      linkedPermit: '',
      linkedSwms: 'Moving Powered Plant',
      evidenceRequired: '',
      notes: '',
    },
    {
      id: 's6',
      sequenceNumber: 6,
      sequenceOfWork: 'Delivery, loading and unloading interfaces',
      hazardsAndRisks: 'Crush injury; dropped loads; traffic obstruction; workers in loading zone',
      possibleConsequence: 'Injury, collision',
      initialRisk: 'high',
      controlMeasures:
        'Plan delivery route and timing. Establish exclusion zone for loading/unloading. Use spotter. Keep workers clear of the loading zone and vehicle path. Secure loads before travel. Coordinate with other site traffic. Do not leave vehicles unattended in a way that obstructs traffic or emergency access.',
      residualRisk: 'low',
      responsiblePerson: 'Supervisor / Spotter / Delivery driver',
      isCriticalControl: true,
      monitoringMethod: 'Delivery plan + exclusion zone confirmation',
      stopWorkTrigger: 'Workers in loading zone or uncontrolled delivery',
      linkedPermit: '',
      linkedSwms: 'Delivery Loading Unloading, Moving Powered Plant',
      evidenceRequired: '',
      notes: '',
    },
    {
      id: 's7',
      sequenceNumber: 7,
      sequenceOfWork: 'Working near public roads and low-visibility conditions',
      hazardsAndRisks: 'Public vehicle collision; poor visibility; struck-by injury',
      possibleConsequence: 'Serious injury or fatality',
      initialRisk: 'extreme',
      controlMeasures:
        'Maintain TMP controls at all times. Hi-vis Class D/N or equivalent mandatory. Additional lighting, beacons and reflective devices for night or low-visibility work. Cease or modify work if visibility becomes unsafe. Keep workers as far as practicable from live traffic lanes. Monitor weather and traffic conditions continuously.',
      residualRisk: 'low',
      responsiblePerson: 'Supervisor / Traffic Controller / All Workers',
      isCriticalControl: true,
      monitoringMethod: 'Visibility and TMP compliance check',
      stopWorkTrigger: 'Unsafe visibility or TMP controls compromised',
      linkedPermit: '',
      linkedSwms: '',
      evidenceRequired: '',
      notes: '',
    },
    {
      id: 's8',
      sequenceNumber: 8,
      sequenceOfWork: 'Task observation, emergency access and pack-up',
      hazardsAndRisks: 'Changed conditions; blocked emergency access; residual traffic hazards; incomplete removal of controls',
      possibleConsequence: 'Injury, delayed emergency response',
      initialRisk: 'medium',
      controlMeasures:
        'Supervisor monitors traffic controls, exclusion zones and vehicle movements regularly. Maintain clear emergency access and egress at all times. All workers monitor for new hazards. Stop work if controls cannot be maintained. Remove traffic control devices in reverse order of installation and only when the area is safe. Reinstate any temporary access arrangements. Final inspection before leaving site.',
      residualRisk: 'low',
      responsiblePerson: 'Supervisor / Traffic Controller / All Workers',
      isCriticalControl: false,
      monitoringMethod: 'Ongoing observation + end-of-shift inspection',
      stopWorkTrigger: 'Blocked emergency access or uncontrolled residual hazards',
      linkedPermit: '',
      linkedSwms: '',
      evidenceRequired: 'Close-out inspection',
      notes: '',
    },
  ],
  taskRequirements: [
    {
      id: 'tr1',
      type: 'Plant separation requirements',
      description: 'Exclusion zones, spotters and positive communication mandatory for vehicle/plant movements near workers. No person between vehicles or vehicles and fixed objects.',
    },
    {
      id: 'tr2',
      type: 'Safety Observer requirements',
      description: 'Spotter required for reverse movements and deliveries. Accredited traffic controllers where specified by TMP.',
    },
    {
      id: 'tr3',
      type: 'Exclusion-zone requirements',
      description: 'Clear separation between public traffic, site vehicles and workers. Maintain exclusion zones at all times.',
    },
    {
      id: 'tr4',
      type: 'Permit requirements',
      description: 'Traffic Management Plan and any road authority permits required before work affecting public roads or traffic.',
    },
  ],
  envControls: [
    { type: 'Housekeeping', description: 'Keep access ways, emergency routes and exclusion zones clear of materials, tools and rubbish.', responsiblePerson: 'All Workers' },
    { type: 'Waste', description: 'Remove waste progressively. Do not leave materials that create trip hazards or obstruct traffic.', responsiblePerson: 'All Workers' },
    { type: 'Public protection', description: 'Maintain TMP devices, signage and barriers. Prevent public access to work areas.', responsiblePerson: 'Supervisor / Traffic Controller' },
    { type: 'Dust', description: 'Dust suppression where vehicle movements generate dust near public areas.', responsiblePerson: 'Supervisor' },
  ],
  emergencyActions: [
    { id: 'e1', action: 'Stop work immediately' },
    { id: 'e2', action: 'Make the area safe if it is safe to do so (e.g. stop traffic, secure plant)' },
    { id: 'e3', action: 'Call Emergency Services on 000 for serious injury, vehicle incident or rescue' },
    { id: 'e4', action: 'Notify Site Supervisor and principal contractor immediately' },
    { id: 'e5', action: 'Maintain clear emergency access for emergency vehicles' },
    { id: 'e6', action: 'Preserve the incident scene where required' },
    { id: 'e7', action: 'Do not restart work until the hazard is controlled and the SWMS / TMP has been reviewed if required' },
  ],
  emergencyModules: [],
  competencyRows: [
    { requirement: 'White Card / General Construction Induction', applies: true, evidenceOrAuth: 'Current card' },
    { requirement: 'Site induction', applies: true, evidenceOrAuth: 'Site-specific' },
    { requirement: 'Accredited Traffic Controller / Traffic Management Implementer', applies: true, evidenceOrAuth: 'Where required by TMP or road authority' },
    { requirement: 'Plant competency / VOC', applies: true, evidenceOrAuth: 'Where plant is operated' },
    { requirement: 'Spotter awareness', applies: true, evidenceOrAuth: 'As required' },
    { requirement: 'First aid', applies: false, evidenceOrAuth: '' },
  ],
  definitions: [
    {
      id: 'd1',
      term: 'TMP',
      definition: 'Traffic Management Plan – document that details how traffic will be managed around the worksite',
    },
    {
      id: 'd2',
      term: 'Exclusion zone',
      definition: 'Defined area from which unauthorised persons and vehicles are excluded to prevent interaction with plant, vehicles or live traffic',
    },
  ],
  relatedDocs: [
    { id: 'rd1', type: 'Related SWMS', document: 'Moving Powered Plant', revision: 'Current', status: 'current' },
    { id: 'rd2', type: 'Related SWMS', document: 'Delivery Loading Unloading', revision: 'Current', status: 'current' },
    { id: 'rd3', type: 'Related SWMS', document: 'Manual Handling and Housekeeping', revision: 'Current', status: 'current' },
    { id: 'rd4', type: 'Related SWMS', document: 'Working Near Underground Services', revision: 'Current', status: 'current' },
    { id: 'rd5', type: 'Related SWMS', document: 'Working On or Near Exposed Live Parts', revision: 'Current', status: 'current' },
    { id: 'rd6', type: 'Other', document: 'Traffic Management Plan (site-specific)', revision: 'Current', status: 'current' },
    { id: 'rd7', type: 'Other', document: 'AS 1742 Manual of Uniform Traffic Control Devices', revision: 'Current', status: 'current' },
  ],
  workerSignOns: [],
  supervisorDeclaration: {
    name: '',
    position: 'Site Supervisor',
    date: '',
    signatureData: '',
    comments:
      'I confirm this SWMS has been explained to all workers (including traffic controllers and spotters) and the documented precautions, controls and work methods will be complied with.',
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
              category        = 'Traffic Management / Site Access / Vehicle Interface',
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
              'Traffic Management / Site Access / Vehicle Interface',
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
    console.error('seed-traffic-management error:', err);
    return res.status(500).json({ error: String(err) });
  }
}
