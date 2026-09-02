/**
 * POST /api/owner-console/swms/seed-heat-stress
 * Pushes the "Heat Stress, Remote Conditions & Fitness for Work" SWMS to all active companies.
 * Platform owner only. Add ?replace=1 to overwrite existing records.
 */
import type { Request, Response } from 'express';
import { db } from '../../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getPlatformOwnerInfo } from '../../../../lib/platform-owner-guard.js';

const SWMS_DATA = {
  buildMode: 'advanced',
  documentType: 'swms',
  title: 'Heat Stress, Remote Conditions & Fitness for Work',
  category: 'Heat Stress / Fitness for Work / Remote Work',
  revisionNumber: '1',
  reviewDate: '2026-07-13',
  authorName: 'Site Supervisor',
  approvedByName: 'Principal Contractor',
  status: 'draft',
  purpose:
    'This Safe Work Method Statement identifies the hazards, risks and control measures for heat stress, working in remote or isolated conditions, and fitness for work. It aims to eliminate or minimise the risk of heat-related illness, dehydration, fatigue, medical emergency in remote areas and impaired fitness so far as is reasonably practicable.',
  scope:
    'Applies to all workers undertaking outdoor work, work in hot environments, remote or isolated locations, or any activity where heat, weather, fatigue or fitness for work may affect safety. Includes planning, monitoring, hydration, rest breaks, emergency response, fitness checks and clean-up.',
  includedActivities: [
    'Planning, preparation and competency verification',
    'Pre-start and consultation (including fitness for work check)',
    'Weather and heat risk assessment',
    'Hydration and rest break scheduling',
    'Work scheduling and task rotation',
    'Personal protective equipment and clothing for heat',
    'Monitoring workers for signs of heat illness',
    'Working in remote or isolated conditions',
    'Emergency response and rescue readiness in remote areas',
    'Fitness for work assessment and ongoing monitoring',
    'Task observation and monitoring',
    'Completion and clean-up',
  ],
  excludedActivities: [
    'Work in extreme heat where controls cannot be maintained',
    'Working alone in remote high-risk environments without communication and rescue plan',
  ],
  workBoundaries:
    'Site-specific and remote work areas only. Coordinate with principal contractor for access, communication and emergency support. Stop work immediately if heat controls cannot be maintained or a worker shows signs of heat illness or impaired fitness.',
  hrcwApplies: 'yes',
  hrcwCategories: [
    {
      id: 'h1',
      category: 'Work in an area with movement of powered mobile plant',
      whyApplies: 'Heat stress and fatigue increase risk when working near plant',
      linkedWorkStep: 'Monitoring workers / Task observation',
      requiredPermit: '',
      relatedSwms: 'Moving Powered Plant',
    },
    {
      id: 'h2',
      category: 'Risk of a person falling more than 2 metres',
      whyApplies: 'Heat and fatigue increase fall risk when working at heights',
      linkedWorkStep: 'Work scheduling and task rotation',
      requiredPermit: '',
      relatedSwms: 'Working at Heights',
    },
    {
      id: 'h3',
      category: 'Work on or near energised electrical installations or services',
      whyApplies: 'Heat and dehydration can impair concentration near electrical hazards',
      linkedWorkStep: 'Fitness for work assessment',
      requiredPermit: '',
      relatedSwms: 'Working On or Near Exposed Live Parts',
    },
  ],
  criticalControls: [
    {
      id: 'cc1',
      criticalRisk: 'Heat-related illness (heat stress, heat exhaustion, heat stroke)',
      possibleOutcome: 'Heat exhaustion, heat stroke, organ failure or fatality',
      mandatoryControls:
        'Monitor weather (temperature, humidity, WBGT if available). Provide cool drinking water at all times. Schedule regular rest breaks in shade. Rotate tasks and limit heavy work during peak heat. Provide cooling measures (shade, fans, cooling towels, ice). Stop work if conditions become extreme or workers show symptoms. Buddy system mandatory.',
      verificationMethod: 'Weather monitoring + hydration check + worker observation',
      responsibleRole: 'Supervisor / All Workers',
      flags: ['critical', 'mandatory'],
    },
    {
      id: 'cc2',
      criticalRisk: 'Dehydration and electrolyte imbalance',
      possibleOutcome: 'Impaired performance, heat illness, medical emergency',
      mandatoryControls:
        'Cool drinking water available at all times and within easy reach. Encourage regular drinking (not just when thirsty). Provide electrolyte replacement drinks for prolonged heavy work in heat. Monitor urine colour as a simple indicator. Never rely on caffeinated or sugary drinks as primary hydration.',
      verificationMethod: 'Water availability check + observation of drinking',
      responsibleRole: 'Supervisor / All Workers',
      flags: ['critical', 'mandatory'],
    },
    {
      id: 'cc3',
      criticalRisk: 'Impaired fitness for work (fatigue, illness, medication, drugs/alcohol)',
      possibleOutcome: 'Poor decision-making, injury to self or others',
      mandatoryControls:
        'Fitness for work check at pre-start. Workers must declare any illness, medication, fatigue or impairment. No work under the influence of alcohol or drugs. Supervisor has authority to remove any worker who appears unfit. Self-declaration and buddy observation.',
      verificationMethod: 'Pre-start fitness declaration + ongoing observation',
      responsibleRole: 'Supervisor / All Workers',
      flags: ['critical', 'mandatory'],
    },
    {
      id: 'cc4',
      criticalRisk: 'Delayed emergency response in remote or isolated conditions',
      possibleOutcome: 'Worsening medical emergency or fatality due to delayed rescue',
      mandatoryControls:
        'Communication plan (radio, satellite phone, mobile coverage check) confirmed before work. Emergency contacts known. Rescue plan and first aid kit available. No lone working in high-risk remote conditions without check-in procedure. Location and expected return time known to supervisor.',
      verificationMethod: 'Communication check + rescue plan confirmation at pre-start',
      responsibleRole: 'Supervisor',
      flags: ['critical', 'mandatory'],
    },
  ],
  plantItems: [
    {
      id: 'p1',
      item: 'Cool water supply / water coolers / ice',
      requirement: 'Available at all times within easy reach of work areas',
      inspectionRequired: 'Yes – daily',
      notes: 'Replenish as required throughout the day',
    },
    {
      id: 'p2',
      item: 'Shade structures / portable shade / cooling fans / cooling towels',
      requirement: 'Available for rest breaks in hot conditions',
      inspectionRequired: 'Yes – before use',
      notes: '',
    },
    {
      id: 'p3',
      item: 'Communication devices (two-way radio, satellite phone, mobile)',
      requirement: 'Tested and operational for remote work',
      inspectionRequired: 'Yes – before remote work',
      notes: 'Coverage confirmed',
    },
  ],
  ppeRows: [
    { item: 'Safety helmet (with brim or neck flap preferred)', requirement: 'At all times on site' },
    { item: 'Steel-capped safety boots', requirement: 'At all times on site' },
    {
      item: 'Hi-vis long-sleeve lightweight clothing',
      requirement: 'At all times – light colours preferred for heat reflection',
    },
    { item: 'Wide-brim hat or neck flap', requirement: 'Outdoor work in sun' },
    { item: 'Sunglasses (UV protection)', requirement: 'Outdoor work' },
    { item: 'Sunscreen 30+ (or higher)', requirement: 'Apply and reapply as required' },
    { item: 'Cooling towels / ice packs', requirement: 'Available for rest breaks in extreme heat' },
  ],
  workSteps: [
    {
      id: 's1',
      sequenceNumber: 1,
      sequenceOfWork: 'Planning, preparation and competency verification',
      hazardsAndRisks: 'Inadequate planning for heat or remote conditions; no communication plan',
      possibleConsequence: 'Heat illness, delayed emergency response',
      initialRisk: 'high',
      controlMeasures:
        'Review weather forecast and heat risk for the day. Confirm water, shade, rest areas and communication devices are available. Confirm first aid and emergency contacts. For remote work confirm check-in procedure and expected return. All workers hold construction induction and site induction. Brief workers on heat illness symptoms and stop-work authority.',
      residualRisk: 'low',
      responsiblePerson: 'Supervisor',
      isCriticalControl: true,
      monitoringMethod: 'Weather forecast + resource availability check',
      stopWorkTrigger: 'Extreme forecast with no controls available or missing communication plan',
      linkedPermit: '',
      linkedSwms: 'Moving Powered Plant, Working at Heights',
      evidenceRequired: 'Weather check and resource confirmation',
      notes: '',
    },
    {
      id: 's2',
      sequenceNumber: 2,
      sequenceOfWork: 'Pre-start and fitness for work check',
      hazardsAndRisks: 'Workers starting work while unfit, fatigued, ill or impaired',
      possibleConsequence: 'Injury to self or others, heat illness',
      initialRisk: 'high',
      controlMeasures:
        'Daily pre-start including fitness for work declaration. Workers must declare any illness, medication, fatigue, alcohol/drugs or other impairment. Supervisor observes for signs of unfitness. Buddy system reinforced. All workers sign onto this SWMS and understand heat symptoms and stop-work authority. Confirm communication method and emergency plan.',
      residualRisk: 'low',
      responsiblePerson: 'Supervisor / All Workers',
      isCriticalControl: true,
      monitoringMethod: 'Fitness declaration + visual observation',
      stopWorkTrigger: 'Any worker appearing unfit or failing to declare',
      linkedPermit: '',
      linkedSwms: '',
      evidenceRequired: 'Signed SWMS and pre-start record',
      notes: '',
    },
    {
      id: 's3',
      sequenceNumber: 3,
      sequenceOfWork: 'Weather and heat risk assessment',
      hazardsAndRisks: 'Underestimated heat risk; sudden weather change',
      possibleConsequence: 'Heat illness',
      initialRisk: 'high',
      controlMeasures:
        'Assess temperature, humidity, radiant heat, wind and workload. Use WBGT or simple heat index if available. Adjust work/rest ratios based on conditions (e.g. more frequent breaks as temperature rises). Schedule heavy work for cooler parts of the day. Monitor continuously and reassess if conditions worsen.',
      residualRisk: 'low',
      responsiblePerson: 'Supervisor',
      isCriticalControl: true,
      monitoringMethod: 'Ongoing weather and heat monitoring',
      stopWorkTrigger: 'Extreme heat where controls cannot keep workers safe',
      linkedPermit: '',
      linkedSwms: '',
      evidenceRequired: '',
      notes: '',
    },
    {
      id: 's4',
      sequenceNumber: 4,
      sequenceOfWork: 'Hydration, rest breaks and task rotation',
      hazardsAndRisks: 'Dehydration; continuous heavy work without rest; electrolyte loss',
      possibleConsequence: 'Heat exhaustion or heat stroke',
      initialRisk: 'extreme',
      controlMeasures:
        'Cool drinking water available at all times within easy reach. Encourage drinking every 15–20 minutes in heat (not only when thirsty). Provide electrolyte drinks for prolonged heavy work. Scheduled rest breaks in shade. Rotate workers between heavy and lighter tasks. Use cooling towels, ice or fans during rest. Never skip rest breaks in hot conditions.',
      residualRisk: 'low',
      responsiblePerson: 'Supervisor / All Workers',
      isCriticalControl: true,
      monitoringMethod: 'Water availability + observation of drinking and rest compliance',
      stopWorkTrigger: 'Water unavailable or workers refusing rest breaks in heat',
      linkedPermit: '',
      linkedSwms: '',
      evidenceRequired: '',
      notes: '',
    },
    {
      id: 's5',
      sequenceNumber: 5,
      sequenceOfWork: 'Monitoring workers for signs of heat illness',
      hazardsAndRisks: 'Unrecognised early symptoms; delayed intervention',
      possibleConsequence: 'Progression to heat stroke',
      initialRisk: 'extreme',
      controlMeasures:
        'Buddy system – workers watch each other. Look for: excessive sweating or no sweating, headache, dizziness, nausea, confusion, irritability, rapid pulse, hot dry skin, loss of coordination, collapse. Immediately move affected worker to shade, cool them, give water if conscious, call 000 for heat stroke. Supervisor has stop-work authority at any time.',
      residualRisk: 'low',
      responsiblePerson: 'All Workers / Supervisor',
      isCriticalControl: true,
      monitoringMethod: 'Continuous buddy observation',
      stopWorkTrigger: 'Any signs of heat illness',
      linkedPermit: '',
      linkedSwms: '',
      evidenceRequired: 'Incident report if heat illness occurs',
      notes: 'Heat stroke is a medical emergency – cool and call 000',
    },
    {
      id: 's6',
      sequenceNumber: 6,
      sequenceOfWork: 'Working in remote or isolated conditions',
      hazardsAndRisks: 'Delayed rescue; loss of communication; isolation during medical emergency',
      possibleConsequence: 'Worsening emergency or fatality',
      initialRisk: 'high',
      controlMeasures:
        'Confirm communication method (radio, satellite phone, mobile coverage) before departure. Establish check-in times and expected return. Location known to supervisor. First aid kit and emergency contacts carried. No lone working in high-risk remote heat conditions without approved check-in procedure. Rescue plan discussed at pre-start.',
      residualRisk: 'low',
      responsiblePerson: 'Supervisor / Workers in remote areas',
      isCriticalControl: true,
      monitoringMethod: 'Communication check + check-in confirmation',
      stopWorkTrigger: 'Loss of communication or no check-in procedure',
      linkedPermit: '',
      linkedSwms: '',
      evidenceRequired: 'Check-in log if required',
      notes: '',
    },
    {
      id: 's7',
      sequenceNumber: 7,
      sequenceOfWork: 'Fitness for work ongoing monitoring and completion',
      hazardsAndRisks: 'Fatigue building during shift; residual heat stress; incomplete recovery',
      possibleConsequence: 'Injury on subsequent tasks or next day',
      initialRisk: 'medium',
      controlMeasures:
        'Supervisor continues to monitor workers throughout the shift for fatigue or heat effects. Workers must self-report any developing symptoms. End-of-shift review of any heat-related issues. Ensure workers rehydrate and cool down before leaving site. Report any heat incidents. Review controls for next day if heat is forecast again.',
      residualRisk: 'low',
      responsiblePerson: 'Supervisor / All Workers',
      isCriticalControl: false,
      monitoringMethod: 'Ongoing observation + end-of-shift review',
      stopWorkTrigger: 'Any worker still showing residual heat effects',
      linkedPermit: '',
      linkedSwms: '',
      evidenceRequired: 'Incident or near-miss report if applicable',
      notes: '',
    },
  ],
  taskRequirements: [
    {
      id: 'tr1',
      type: 'Rescue readiness',
      description:
        'Communication plan, first aid kit, emergency contacts and rescue procedure confirmed before remote or high-heat work. Buddy system mandatory.',
    },
    {
      id: 'tr2',
      type: 'Exclusion-zone / protection requirements',
      description:
        'Shade and rest areas provided. Work/rest ratios adjusted for heat. Stop-work authority for any heat illness symptoms.',
    },
    {
      id: 'tr3',
      type: 'Fitness for work requirements',
      description:
        'Pre-start fitness declaration. Ongoing observation. No work under influence of alcohol, drugs or significant impairment.',
    },
  ],
  envControls: [
    {
      type: 'Housekeeping',
      description: 'Keep rest areas clean, shaded and free of trip hazards. Maintain clear access to water and first aid.',
      responsiblePerson: 'All Workers',
    },
    {
      type: 'Waste',
      description: 'Dispose of drink containers and waste correctly. Do not leave litter that creates hazards.',
      responsiblePerson: 'All Workers',
    },
    {
      type: 'Dust',
      description: 'Dust suppression where dusty conditions combine with heat stress.',
      responsiblePerson: 'Supervisor',
    },
  ],
  emergencyActions: [
    { id: 'e1', action: 'Stop work immediately if heat illness is suspected' },
    { id: 'e2', action: 'Move affected worker to shade / cool area immediately' },
    { id: 'e3', action: 'Cool the person (remove excess clothing, apply cool water/ice, fan them)' },
    { id: 'e4', action: 'Give cool water only if the person is conscious and able to swallow' },
    {
      id: 'e5',
      action: 'Call Emergency Services on 000 for heat stroke, collapse, confusion or if symptoms worsen',
    },
    { id: 'e6', action: 'Notify Site Supervisor and principal contractor immediately' },
    { id: 'e7', action: 'Do not leave the affected person alone' },
    { id: 'e8', action: 'Preserve the incident scene where required' },
    {
      id: 'e9',
      action: 'Do not restart work until the person has recovered and controls have been reviewed',
    },
  ],
  emergencyModules: [],
  competencyRows: [
    { requirement: 'White Card / General Construction Induction', applies: true, evidenceOrAuth: 'Current card' },
    { requirement: 'Site induction', applies: true, evidenceOrAuth: 'Site-specific' },
    { requirement: 'Heat stress awareness', applies: true, evidenceOrAuth: 'Toolbox / pre-start briefing' },
    {
      requirement: 'First aid',
      applies: true,
      evidenceOrAuth: 'At least one first aider preferred on team',
    },
    {
      requirement: 'Remote work / communication awareness',
      applies: true,
      evidenceOrAuth: 'Where remote work is undertaken',
    },
  ],
  definitions: [
    {
      id: 'd1',
      term: 'Heat exhaustion',
      definition:
        'Condition caused by loss of water and salt through sweating – symptoms include heavy sweating, weakness, dizziness, nausea, headache, cool clammy skin',
    },
    {
      id: 'd2',
      term: 'Heat stroke',
      definition:
        'Life-threatening medical emergency – body temperature rises dangerously high, sweating may stop, person becomes confused or unconscious – call 000 immediately',
    },
    {
      id: 'd3',
      term: 'WBGT',
      definition:
        'Wet Bulb Globe Temperature – a measure of heat stress that combines temperature, humidity, wind and radiant heat',
    },
  ],
  relatedDocs: [
    { id: 'rd1', type: 'Related SWMS', document: 'Moving Powered Plant', revision: 'Current', status: 'current' },
    { id: 'rd2', type: 'Related SWMS', document: 'Working at Heights', revision: 'Current', status: 'current' },
    {
      id: 'rd3',
      type: 'Related SWMS',
      document: 'Working On or Near Exposed Live Parts',
      revision: 'Current',
      status: 'current',
    },
    {
      id: 'rd4',
      type: 'Related SWMS',
      document: 'Manual Handling and Housekeeping',
      revision: 'Current',
      status: 'current',
    },
    {
      id: 'rd5',
      type: 'Other',
      document: 'Managing the risks of working in heat (Code of Practice)',
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
      'I confirm this SWMS has been explained to all workers and the documented heat controls, fitness for work requirements and emergency procedures will be complied with.',
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
        'Site Supervisor / IWIllBUILD',
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
