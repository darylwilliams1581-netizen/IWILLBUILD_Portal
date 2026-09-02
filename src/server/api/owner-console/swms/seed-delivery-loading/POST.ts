/**
 * POST /api/owner-console/swms/seed-delivery-loading
 * Pushes the "Delivery, Loading & Unloading" SWMS to all active companies.
 * Platform owner only. Add ?replace=1 to overwrite existing records.
 */
import type { Request, Response } from 'express';
import { db } from '../../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getPlatformOwnerInfo } from '../../../../lib/platform-owner-guard.js';

const SWMS_DATA = {
  buildMode: 'advanced',
  documentType: 'swms',
  title: 'Delivery, Loading & Unloading',
  category: 'Logistics / Site Access / Plant Interface',
  revisionNumber: '1',
  reviewDate: '2026-07-13',
  authorName: 'Site Supervisor',
  approvedByName: 'Principal Contractor',
  status: 'draft',
  purpose:
    'This Safe Work Method Statement sets out the hazards, risks and control measures for delivery, loading and unloading of materials, plant and equipment on construction sites. It aims to eliminate or minimise risks of crush injuries, vehicle/plant interaction, falling loads, manual handling and traffic conflicts so far as is reasonably practicable.',
  scope:
    'Applies to all workers involved in receiving deliveries, directing vehicles, spotting, loading, unloading, securing loads and managing delivery interfaces on construction sites. Includes planning, vehicle arrival, reverse movements, exclusion zones, material handling, securing loads and clean-up.',
  includedActivities: [
    'Planning, preparation and competency verification',
    'Pre-start and consultation',
    'Review of delivery schedule and vehicle routes',
    'Site access and entry control for delivery vehicles',
    'Establishment of exclusion zones and loading areas',
    'Vehicle arrival, parking and reverse movements',
    'Spotting and positive communication',
    'Loading and unloading of materials and plant',
    'Securing loads before travel',
    'Manual handling support during unloading',
    'Work near public roads or site traffic',
    'Task observation and monitoring',
    'Clean-up and pack-up',
  ],
  excludedActivities: [
    'Crane lifting or multi-crane operations without separate SWMS',
    'Loading of dangerous goods without specialised controls',
  ],
  workBoundaries:
    'Site-specific delivery and loading areas only. Coordinate with principal contractor for access, traffic management and other trades. Stop work immediately if controls cannot be maintained or conditions change.',
  hrcwApplies: 'yes',
  hrcwCategories: [
    {
      id: 'h1',
      category: 'Work in an area with movement of powered mobile plant',
      whyApplies: 'Delivery vehicles, trucks, forklifts and plant operating during loading/unloading',
      linkedWorkStep: 'Vehicle movements / Loading and unloading',
      requiredPermit: '',
      relatedSwms: 'Moving Powered Plant',
    },
    {
      id: 'h2',
      category: 'Work on, in or adjacent to a road or other traffic corridor',
      whyApplies: 'Deliveries may interface with public roads or site access roads',
      linkedWorkStep: 'Site access and entry control',
      requiredPermit: 'Traffic Management Plan if required',
      relatedSwms: 'Traffic Management / Working Near Roads',
    },
    {
      id: 'h3',
      category: 'Risk of a person falling more than 2 metres',
      whyApplies: 'Possible work on truck trays, elevated plant or near edges during unloading',
      linkedWorkStep: 'Loading and unloading',
      requiredPermit: '',
      relatedSwms: 'Working at Heights',
    },
    {
      id: 'h4',
      category: 'Crystalline Silica (RCS) exposure',
      whyApplies: 'Possible dust from materials (concrete, pavers, soils) during unloading',
      linkedWorkStep: 'Unloading of dusty materials',
      requiredPermit: 'Silica statement if applicable',
      relatedSwms: 'Silica Dust Exposure',
    },
  ],
  criticalControls: [
    {
      id: 'cc1',
      criticalRisk: 'Vehicle or plant striking worker during delivery/loading',
      possibleOutcome: 'Crush injury or fatality',
      mandatoryControls:
        'Establish and maintain exclusion zones around delivery vehicles and loading areas. Spotter mandatory for reverse movements and when visibility is restricted. Positive communication (radio or agreed hand signals) between driver, spotter and ground workers. High-visibility clothing mandatory. Workers must never stand between vehicles or between vehicles and fixed objects. Do not cross vehicle paths unless safe and communication confirmed.',
      verificationMethod: 'Exclusion zone setup + spotter confirmation + communication check',
      responsibleRole: 'Supervisor / Spotter / Delivery Driver',
      flags: ['critical', 'mandatory'],
    },
    {
      id: 'cc2',
      criticalRisk: 'Falling loads or unsecured materials',
      possibleOutcome: 'Crush injury, struck-by injury or fatality',
      mandatoryControls:
        'Loads must be secured before any vehicle movement. Use appropriate restraints, straps, chains or packing. Never stand under suspended or unsecured loads. Keep workers clear of the load path during unloading. Tag lines used where required for control of awkward loads.',
      verificationMethod: 'Load security check before travel + exclusion during unloading',
      responsibleRole: 'Driver / Spotter / Supervisor',
      flags: ['critical', 'mandatory'],
    },
    {
      id: 'cc3',
      criticalRisk: 'Reversing vehicles and plant in congested areas',
      possibleOutcome: 'Crush injury or fatality',
      mandatoryControls:
        'Avoid reversing where practical by planning one-way routes and turning areas. Spotter required for reverse movements in congested or restricted areas. Operator/driver must stop immediately if visual or radio contact with the spotter is lost. Spotter must never place themselves in the line of fire.',
      verificationMethod: 'Spotter appointment + communication method confirmed',
      responsibleRole: 'Driver / Spotter',
      flags: ['critical', 'mandatory'],
    },
    {
      id: 'cc4',
      criticalRisk: 'Manual handling injury during unloading',
      possibleOutcome: 'Musculoskeletal injury',
      mandatoryControls:
        'Plan the unload. Use mechanical aids (forklift, excavator, crane) where practicable. Team lift heavy or awkward items. Keep loads close to the body. Avoid twisting. Rotate tasks and take breaks for repetitive unloading.',
      verificationMethod: 'Pre-unload assessment + observation',
      responsibleRole: 'All Workers / Supervisor',
      flags: ['critical'],
    },
    {
      id: 'cc5',
      criticalRisk: 'Public traffic interface during delivery',
      possibleOutcome: 'Collision with public vehicles or pedestrians',
      mandatoryControls:
        'Traffic Management Plan (TMP) implemented where deliveries affect public roads. Correct signage, cones and barriers. Control entry points. Keep public clear of loading zones. Coordinate delivery timing to minimise public interface.',
      verificationMethod: 'TMP compliance + access control confirmation',
      responsibleRole: 'Supervisor / Traffic Controller',
      flags: ['critical', 'mandatory'],
    },
  ],
  plantItems: [
    {
      id: 'p1',
      item: 'Delivery trucks / semi-trailers / flatbeds / tippers',
      requirement: 'Competent drivers, reversing alarms, beacons, secure load restraints, spotter for reverse movements',
      inspectionRequired: 'Yes – vehicle pre-start by driver',
      notes: 'Loads secured before any movement',
    },
    {
      id: 'p2',
      item: 'Forklift / excavator / bobcat / crane (for unloading)',
      requirement: 'Competent operators with VOC/licence, exclusion zones, positive communication',
      inspectionRequired: 'Yes – daily pre-start',
      notes: 'Never use plant beyond rated capacity',
    },
  ],
  ppeRows: [
    { item: 'Safety helmet', requirement: 'At all times on site and when working near plant or vehicles' },
    { item: 'Steel-capped safety boots', requirement: 'At all times on site' },
    {
      item: 'Hi-vis long-sleeve clothing (Class D/N or equivalent)',
      requirement: 'At all times on site – mandatory near vehicles and plant',
    },
    {
      item: 'Safety glasses / goggles',
      requirement: 'As required by task (especially when unloading dusty materials)',
    },
    { item: 'Hearing protection', requirement: 'When plant or vehicle noise requires it' },
    { item: 'Task-specific gloves', requirement: 'When handling materials, straps or tools' },
    { item: 'P2 respirator', requirement: 'When unloading dusty materials (silica, soil, cement etc.)' },
    { item: 'Sunscreen + hat', requirement: 'Outdoor work – reapply as required' },
  ],
  workSteps: [
    {
      id: 's1',
      sequenceNumber: 1,
      sequenceOfWork: 'Planning, preparation and competency verification',
      hazardsAndRisks: 'Unplanned deliveries; untrained spotters; missing TMP or access controls',
      possibleConsequence: 'Collision, crush injury, non-compliance',
      initialRisk: 'high',
      controlMeasures:
        'Confirm delivery schedule, vehicle type, load type and preferred access route. Review Traffic Management Plan if deliveries affect public roads. Confirm spotter and plant operator competencies. Review related SWMS for plant, traffic and manual handling. Confirm emergency access remains available.',
      residualRisk: 'low',
      responsiblePerson: 'Supervisor',
      isCriticalControl: true,
      monitoringMethod: 'Delivery plan and competency check',
      stopWorkTrigger: 'Missing TMP where required or untrained personnel',
      linkedPermit: 'Traffic Management Plan if required',
      linkedSwms: 'Moving Powered Plant, Traffic Management / Working Near Roads',
      evidenceRequired: 'Delivery plan / TMP / competency records',
      notes: '',
    },
    {
      id: 's2',
      sequenceNumber: 2,
      sequenceOfWork: 'Pre-start and consultation',
      hazardsAndRisks: 'Poor communication; unclear roles; changed conditions',
      possibleConsequence: 'Uncontrolled vehicle/pedestrian interaction',
      initialRisk: 'high',
      controlMeasures:
        'Daily pre-start covering expected deliveries, exclusion zones, reverse procedures, spotting method, load types, manual handling expectations and emergency response. Confirm who is supervisor, spotter, plant operator and delivery contact. All workers sign onto this SWMS.',
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
      sequenceOfWork: 'Site access, entry control and exclusion zone setup',
      hazardsAndRisks: 'Unauthorised entry; vehicle conflict at access points; public exposure',
      possibleConsequence: 'Collision, crush injury',
      initialRisk: 'extreme',
      controlMeasures:
        'Control entry points with signage, barricades and designated routes. Establish clear exclusion zones for loading/unloading areas. Keep public and non-essential workers out of the loading zone. Maintain clear sight lines. Coordinate arrival timing with other site traffic. Emergency access must remain clear at all times.',
      residualRisk: 'low',
      responsiblePerson: 'Supervisor / Spotter',
      isCriticalControl: true,
      monitoringMethod: 'Access control and exclusion zone confirmation',
      stopWorkTrigger: 'Uncontrolled access or blocked emergency route',
      linkedPermit: '',
      linkedSwms: 'Traffic Management / Working Near Roads',
      evidenceRequired: '',
      notes: '',
    },
    {
      id: 's4',
      sequenceNumber: 4,
      sequenceOfWork: 'Vehicle arrival, reverse movements and spotting',
      hazardsAndRisks: 'Reverse blind spots; vehicle striking workers; collision with fixed objects',
      possibleConsequence: 'Crush injury or fatality',
      initialRisk: 'extreme',
      controlMeasures:
        'Plan one-way routes and turning areas to minimise reversing. Spotter mandatory for reverse movements in congested or restricted areas. Positive radio or agreed hand-signal communication. Driver/operator must stop immediately if contact with the spotter is lost. Spotter must never stand in the line of fire or between vehicle and fixed objects. High-visibility clothing and exclusion zones maintained. Reversing alarms and beacons operational.',
      residualRisk: 'low',
      responsiblePerson: 'Driver / Spotter / Supervisor',
      isCriticalControl: true,
      monitoringMethod: 'Continuous spotter observation + communication',
      stopWorkTrigger: 'Loss of communication or persons in path',
      linkedPermit: '',
      linkedSwms: 'Moving Powered Plant',
      evidenceRequired: '',
      notes: '',
    },
    {
      id: 's5',
      sequenceNumber: 5,
      sequenceOfWork: 'Loading and unloading of materials and plant',
      hazardsAndRisks: 'Falling loads; crush injury; plant/vehicle interaction; struck-by',
      possibleConsequence: 'Serious injury or fatality',
      initialRisk: 'extreme',
      controlMeasures:
        'Keep workers clear of the load path and exclusion zone during unloading. Use mechanical aids (forklift, excavator, crane) where practicable. Never stand under suspended or unsecured loads. Tag lines used for control of awkward loads. Positive communication between plant operator, spotter and ground workers. Secure all loads before any vehicle movement. Do not overload vehicles or plant.',
      residualRisk: 'low',
      responsiblePerson: 'Spotter / Plant Operator / Driver / Supervisor',
      isCriticalControl: true,
      monitoringMethod: 'Continuous observation of exclusion zone and load path',
      stopWorkTrigger: 'Workers in load path or unsecured load',
      linkedPermit: '',
      linkedSwms: 'Moving Powered Plant, Manual Handling and Housekeeping',
      evidenceRequired: '',
      notes: '',
    },
    {
      id: 's6',
      sequenceNumber: 6,
      sequenceOfWork: 'Manual handling support during unloading',
      hazardsAndRisks: 'Heavy or awkward lifting; repetitive strain; crush from shifting loads',
      possibleConsequence: 'Musculoskeletal injury',
      initialRisk: 'high',
      controlMeasures:
        'Plan the unload sequence. Use mechanical aids first. Team lift heavy or awkward items. Keep loads close to the body and avoid twisting. Rotate workers for repetitive tasks. Take breaks. Report discomfort early. Do not attempt to catch or stop shifting loads manually.',
      residualRisk: 'low',
      responsiblePerson: 'All Workers',
      isCriticalControl: false,
      monitoringMethod: 'Buddy observation',
      stopWorkTrigger: 'Excessive force or awkward posture required',
      linkedPermit: '',
      linkedSwms: 'Manual Handling and Housekeeping',
      evidenceRequired: '',
      notes: '',
    },
    {
      id: 's7',
      sequenceNumber: 7,
      sequenceOfWork: 'Securing loads and vehicle departure',
      hazardsAndRisks: 'Unsecured loads falling during travel; vehicle departing while workers still in zone',
      possibleConsequence: 'Crush injury, public hazard',
      initialRisk: 'high',
      controlMeasures:
        'All loads must be secured with appropriate restraints, straps, chains or packing before any vehicle movement. Final visual check of load security. Confirm exclusion zone is clear before vehicle departs. Spotter remains in place until vehicle has left the loading area safely. Do not leave vehicles unattended in a way that obstructs traffic or emergency access.',
      residualRisk: 'low',
      responsiblePerson: 'Driver / Spotter / Supervisor',
      isCriticalControl: true,
      monitoringMethod: 'Load security check + clear-zone confirmation',
      stopWorkTrigger: 'Unsecured load or workers still in departure path',
      linkedPermit: '',
      linkedSwms: '',
      evidenceRequired: '',
      notes: '',
    },
    {
      id: 's8',
      sequenceNumber: 8,
      sequenceOfWork: 'Task observation, clean-up and pack-up',
      hazardsAndRisks: 'Residual materials creating trip hazards; uncontrolled access; incomplete clean-up',
      possibleConsequence: 'Injury, public hazard',
      initialRisk: 'medium',
      controlMeasures:
        'Supervisor monitors delivery activities and exclusion zones. Progressive clean-up of packaging, straps, dunnage and spilled materials. Keep access ways and emergency routes clear. Reinstate barriers and signage. Final inspection of loading area. Report any near misses, damage or defects. Do not leave residual hazards for other trades or the public.',
      residualRisk: 'low',
      responsiblePerson: 'Supervisor / All Workers',
      isCriticalControl: false,
      monitoringMethod: 'Ongoing observation + end-of-delivery inspection',
      stopWorkTrigger: 'Uncontrolled residual hazards',
      linkedPermit: '',
      linkedSwms: 'Manual Handling and Housekeeping',
      evidenceRequired: '',
      notes: '',
    },
  ],
  taskRequirements: [
    {
      id: 'tr1',
      type: 'Plant separation requirements',
      description:
        'Exclusion zones, spotter and positive communication mandatory for reverse movements and loading/unloading. No person between vehicles or vehicles and fixed objects.',
    },
    {
      id: 'tr2',
      type: 'Safety Observer requirements',
      description: 'Spotter required for reverse movements, deliveries and when visibility is restricted.',
    },
    {
      id: 'tr3',
      type: 'Exclusion-zone requirements',
      description:
        'Clear exclusion zones around delivery vehicles and loading areas. Keep public and non-essential workers clear.',
    },
    {
      id: 'tr4',
      type: 'Permit requirements',
      description: 'Traffic Management Plan required where deliveries affect public roads or traffic.',
    },
  ],
  envControls: [
    {
      type: 'Housekeeping',
      description:
        'Progressive clean-up of packaging, straps, dunnage and spilled materials. Keep access ways and emergency routes clear.',
      responsiblePerson: 'All Workers',
    },
    {
      type: 'Waste',
      description:
        'Dispose of packaging and waste correctly. Do not leave materials that create trip hazards or obstruct traffic.',
      responsiblePerson: 'All Workers',
    },
    {
      type: 'Public protection',
      description: 'Maintain TMP devices, signage and barriers. Prevent public access to loading zones.',
      responsiblePerson: 'Supervisor',
    },
    {
      type: 'Dust',
      description:
        'Dust suppression or respiratory protection when unloading dusty materials (soils, concrete products, etc.).',
      responsiblePerson: 'Supervisor',
    },
    {
      type: 'Spill kits',
      description: 'Spill kits available where fuel, oil or chemicals may be present during deliveries.',
      responsiblePerson: 'Supervisor',
    },
  ],
  emergencyActions: [
    { id: 'e1', action: 'Stop work immediately' },
    { id: 'e2', action: 'Make the area safe if it is safe to do so (stop vehicles, secure loads)' },
    { id: 'e3', action: 'Call Emergency Services on 000 for serious injury, crush injury or vehicle incident' },
    { id: 'e4', action: 'Notify Site Supervisor and principal contractor immediately' },
    { id: 'e5', action: 'Maintain clear emergency access for emergency vehicles' },
    { id: 'e6', action: 'Preserve the incident scene where required' },
    {
      id: 'e7',
      action: 'Do not restart work until the hazard is controlled and the SWMS has been reviewed if required',
    },
  ],
  emergencyModules: [],
  competencyRows: [
    { requirement: 'White Card / General Construction Induction', applies: true, evidenceOrAuth: 'Current card' },
    { requirement: 'Site induction', applies: true, evidenceOrAuth: 'Site-specific' },
    {
      requirement: 'Plant competency / VOC / licence',
      applies: true,
      evidenceOrAuth: 'Where plant is used for unloading',
    },
    { requirement: 'Spotter awareness', applies: true, evidenceOrAuth: 'As required' },
    {
      requirement: 'Traffic controller competency',
      applies: false,
      evidenceOrAuth: 'Where TMP requires it',
    },
    { requirement: 'First aid', applies: false, evidenceOrAuth: '' },
  ],
  definitions: [
    {
      id: 'd1',
      term: 'Exclusion zone (loading)',
      definition:
        'Defined area around a delivery vehicle or loading operation from which unauthorised persons are excluded to prevent crush or struck-by injuries',
    },
    {
      id: 'd2',
      term: 'Positive communication',
      definition:
        'Confirmed two-way radio or agreed hand signals between driver/operator, spotter and ground workers at all times during vehicle movement and unloading',
    },
  ],
  relatedDocs: [
    { id: 'rd1', type: 'Related SWMS', document: 'Moving Powered Plant', revision: 'Current', status: 'current' },
    {
      id: 'rd2',
      type: 'Related SWMS',
      document: 'Traffic Management / Working Near Roads',
      revision: 'Current',
      status: 'current',
    },
    {
      id: 'rd3',
      type: 'Related SWMS',
      document: 'Manual Handling and Housekeeping',
      revision: 'Current',
      status: 'current',
    },
    { id: 'rd4', type: 'Related SWMS', document: 'Silica Dust Exposure', revision: 'Current', status: 'current' },
    { id: 'rd5', type: 'Related SWMS', document: 'Working at Heights', revision: 'Current', status: 'current' },
    {
      id: 'rd6',
      type: 'Other',
      document: 'Traffic Management Plan (site-specific)',
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
      'I confirm this SWMS has been explained to all workers (including spotters and delivery drivers) and the documented precautions, controls and work methods will be complied with.',
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
