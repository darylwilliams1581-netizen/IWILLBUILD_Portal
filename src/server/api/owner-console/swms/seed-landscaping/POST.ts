/**
 * POST /api/owner-console/swms/seed-landscaping
 * Pushes the Landscaping & Maintenance structured SWMS to all active companies.
 * Platform owner only. Add ?replace=1 to overwrite existing records.
 */
import type { Request, Response } from 'express';
import { db } from '../../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getSessionAndProfile } from '../../../../lib/auth-middleware.js';

const LANDSCAPING_SWMS = {
  buildMode: 'advanced',
  documentType: 'swms',
  title: 'Landscaping & Maintenance',
  category: 'Landscaping / Civil / Maintenance',
  revisionNumber: '1',
  reviewDate: '2026-07-13',
  authorName: 'Site Supervisor / Williams Constructions NQ',
  approvedByName: 'Principal Contractor',
  status: 'draft',
  purpose:
    'This Safe Work Method Statement identifies the hazards, risks and control measures for landscaping and maintenance works including site clearing, excavation, plant operation, materials handling, concrete works, weeding, fertilising and clean-up. It aims to eliminate or minimise risks so far as is reasonably practicable.',
  scope:
    'Applies to all workers undertaking landscaping, site levels and clearing, excavation and cultivation, installation of garden edging, pavers, soils, mulching, turf laying, concrete works, weeding, fertilising, watering and general site maintenance. Includes preparation, core activities and clean-up.',
  includedActivities: [
    'Toolbox talk and pre-start',
    'Site inspection',
    'Pre-operational plant and power tool checks',
    'Site levels & clearing',
    'Material handling, storage and relocation',
    'Excavation and cultivation',
    'Installation of garden edging, pavers, soils, mulching and turf',
    'Concrete works',
    'Weeding, fertilising & watering',
    'Working conditions outside',
    'Clean-up',
  ],
  excludedActivities: [
    'Deep excavation greater than 1.5 m without separate controls',
    'Live electrical work without isolation',
    'Dry cutting of high-silica materials without approved controls',
  ],
  workBoundaries:
    'Site-specific landscaping areas only. Coordinate with principal contractor for access, services, traffic management and other trades. Stop work immediately if controls cannot be maintained.',
  hrcwApplies: 'yes',
  hrcwCategories: [
    {
      id: 'h1',
      category: 'Work in or near a shaft or trench deeper than 1.5 m or a tunnel',
      whyApplies: 'Possible trenches and excavations for services or landscaping',
      linkedWorkStep: 'Site levels & clearing / Excavation',
      requiredPermit: 'Excavation permit if required',
      relatedSwms: 'Working Near Underground Services',
    },
    {
      id: 'h2',
      category: 'Work in an area with movement of powered mobile plant',
      whyApplies: 'Excavators, bobcats, trucks and other plant',
      linkedWorkStep: 'Site clearing and materials handling',
      requiredPermit: '',
      relatedSwms: 'Moving Powered Plant',
    },
    {
      id: 'h3',
      category: 'Work on or near energised electrical installations or services',
      whyApplies: 'Risk of striking underground or overhead services',
      linkedWorkStep: 'Site inspection and excavation',
      requiredPermit: 'Dial Before You Dig',
      relatedSwms: 'Working Near Underground Services',
    },
    {
      id: 'h4',
      category: 'Work on, in or adjacent to a road or other traffic corridor',
      whyApplies: 'Public interface, deliveries and road access',
      linkedWorkStep: 'Site inspection and clean-up',
      requiredPermit: 'Traffic management if required',
      relatedSwms: 'Traffic Management / Working Near Roads',
    },
    {
      id: 'h5',
      category: 'Work on or near a fall potential of 2 m or greater',
      whyApplies: 'Possible work near edges or elevated areas',
      linkedWorkStep: 'Working at heights if applicable',
      requiredPermit: '',
      relatedSwms: 'Working at Heights',
    },
    {
      id: 'h6',
      category: 'Crystalline Silica (RCS) exposure',
      whyApplies: 'Cutting, grinding or drilling of concrete, pavers, stone or cleaning silica-containing materials',
      linkedWorkStep: 'Concrete works and cutting',
      requiredPermit: 'Silica statement (Appendix 1)',
      relatedSwms: 'Silica Dust Exposure',
    },
  ],
  criticalControls: [
    {
      id: 'cc1',
      criticalRisk: 'Plant and pedestrian interaction / crush injury',
      possibleOutcome: 'Serious injury or fatality',
      mandatoryControls:
        'All personnel within 5 m of machinery must be in line of sight of the operator and wear a safety helmet. No person to be in swing zone or boom reach when machine is operating. Machine operator must not use a mobile phone or electronic device while machinery is moving. Isolate work area from public and other contractors. High visibility clothing mandatory.',
      verificationMethod: 'Spotter + exclusion zone + communication',
      responsibleRole: 'Operator / Spotter / Supervisor',
      flags: ['critical', 'mandatory'],
    },
    {
      id: 'cc2',
      criticalRisk: 'Underground service strike',
      possibleOutcome: 'Electrocution, explosion, service outage',
      mandatoryControls:
        'Ensure open trenches, services are exposed by hand digging or other non-destructive means and marked before machinery starts on site. Dial Before You Dig and service plans reviewed. Treat all services as live until proven otherwise.',
      verificationMethod: 'Service location and marking confirmation',
      responsibleRole: 'Supervisor / All Workers',
      flags: ['critical', 'mandatory'],
    },
    {
      id: 'cc3',
      criticalRisk: 'Silica dust from cutting pavers, concrete or stone',
      possibleOutcome: 'Silicosis, lung disease',
      mandatoryControls:
        'No dry cutting of any materials with silica content unless filtered extraction system or water suppression is in place. P2 dust mask mandatory. Dust extraction systems on equipment generating silica or wood dust. Complete silica statement (Appendix 1).',
      verificationMethod: 'Dust control equipment check',
      responsibleRole: 'All Workers',
      flags: ['critical', 'mandatory'],
    },
    {
      id: 'cc4',
      criticalRisk: 'Chemical exposure (herbicides, fertilisers, concrete, mulch)',
      possibleOutcome: 'Skin/eye irritation, respiratory issues, environmental harm',
      mandatoryControls:
        'SDS for mulch, herbicides, concrete, fertilisers or other chemicals must be read in conjunction with this SWMS. Correct PPE (gloves, long clothing, eye protection). Follow label and SDS directions. Have first aid protocol available.',
      verificationMethod: 'SDS available + PPE check',
      responsibleRole: 'All Workers',
      flags: ['mandatory'],
    },
    {
      id: 'cc5',
      criticalRisk: 'Heat stress and UV exposure',
      possibleOutcome: 'Heat illness, sunburn, dehydration',
      mandatoryControls:
        'Neck to toe coverage including hats, sunscreen and sunglasses. Regular hydration. Look out for colleagues – signs include confusion, slow or slurring speech, no sweat, nausea. Rotate tasks and use shade. Stop work in extreme conditions.',
      verificationMethod: 'Buddy checks + weather monitoring',
      responsibleRole: 'All Workers + Supervisor',
      flags: ['critical'],
    },
  ],
  plantItems: [
    {
      id: 'p1',
      item: 'Excavator / Bobcat / Trucks / Roller',
      requirement: 'Competent operator with VOC/licence, pre-start checklist, spotter, high-vis',
      inspectionRequired: 'Yes – daily pre-start',
      notes: 'No person in swing zone or boom reach',
    },
    {
      id: 'p2',
      item: 'Power tools / Grinders / Saws',
      requirement: 'Guards in place, dust extraction or wet methods, P2 mask, competent operators',
      inspectionRequired: 'Yes – before each use',
      notes: '9" grinders require work permit; no dry cutting of silica materials',
    },
  ],
  ppeRows: [
    { item: 'Safety helmet', requirement: 'At all times when near plant or overhead hazards' },
    { item: 'Steel-capped safety boots', requirement: 'At all times on site' },
    { item: 'Hi-vis long trousers and long-sleeve clothing', requirement: 'At all times on site' },
    { item: 'Safety glasses / goggles', requirement: 'When using tools, plant or generating dust/particles' },
    { item: 'Hearing protection', requirement: 'When plant or tools create noise' },
    { item: 'Task-specific gloves', requirement: 'When handling materials, chemicals or tools' },
    { item: 'P2 dust mask / respirator', requirement: 'When cutting, grinding or generating dust' },
    { item: 'Sunscreen + hat + sunglasses', requirement: 'Outdoor work – reapply as required' },
  ],
  workSteps: [
    {
      id: 's1',
      sequenceNumber: 1,
      sequenceOfWork: 'Toolbox Talk & Pre-start',
      hazardsAndRisks: 'Workers unaware of risks, unfit for duty, plant competency',
      possibleConsequence: 'Injury, poor decisions',
      initialRisk: 'high',
      controlMeasures:
        'Stop-Plan-Do process. Fitness for work check. Review emergency response. Ensure plant operators have correct certification/competency and pre-start checklist completed. All workers inducted (Epass) and site-specific induction. All workers sign onto SWMS.',
      residualRisk: 'low',
      responsiblePerson: 'Supervisor / All Workers',
      isCriticalControl: false,
      monitoringMethod: 'Daily pre-start attendance',
      stopWorkTrigger: 'Any worker unfit or missing plant competency',
      linkedPermit: '',
      linkedSwms: '',
      evidenceRequired: 'Signed SWMS and pre-start record',
      notes: '',
    },
    {
      id: 's2',
      sequenceNumber: 2,
      sequenceOfWork: 'Site inspection',
      hazardsAndRisks: 'Obstructed access, collision with vehicles/plant, falls into open trenches, uneven/slippery ground',
      possibleConsequence: 'Injury, plant collision',
      initialRisk: 'high',
      controlMeasures:
        'Ensure safe entry/egress to site. Ensure open trenches are barricaded. Be visible to other people and operators – wear high visibility vest/top. In wet conditions avoid working on slopes whilst operating powered equipment. Ensure traffic management is in place as required. Public safety controls (barricades, fencing, traffic management) must be in place.',
      residualRisk: 'low',
      responsiblePerson: 'Supervisor / All Workers',
      isCriticalControl: true,
      monitoringMethod: 'Site walk and visual check',
      stopWorkTrigger: 'Uncontrolled access, open trenches or public interface risks',
      linkedPermit: '',
      linkedSwms: 'Traffic Management / Working Near Roads',
      evidenceRequired: '',
      notes: '',
    },
    {
      id: 's3',
      sequenceNumber: 3,
      sequenceOfWork: 'Pre-operational check of plant equipment and power tools',
      hazardsAndRisks: 'Personal injury from equipment failure, unsuitable equipment, lacerations',
      possibleConsequence: 'Injury, equipment failure',
      initialRisk: 'high',
      controlMeasures:
        'Progressive visual inspections throughout the day. Service records up to date and accessible. Ensure all equipment is fit for purpose. Guarding on powered equipment. Handles in good condition. Nail guns set to sequential mode (no bump-fire). Test and tag of all tools and RCD. 9" grinders prohibited without work permit. No hot work (grinding/welding) on total fire-ban days. Shielding for metal welding and grinding. Fire extinguisher easily accessible. Filtered dust extraction or water suppression for any cutting or grinding of silica materials.',
      residualRisk: 'low',
      responsiblePerson: 'Operators / All Workers',
      isCriticalControl: true,
      monitoringMethod: 'Daily pre-start checklist',
      stopWorkTrigger: 'Defective equipment or missing controls',
      linkedPermit: 'Work permit for 9" grinders if required',
      linkedSwms: 'Use of Power Tools, Moving Powered Plant',
      evidenceRequired: 'Pre-start checklist',
      notes: '',
    },
    {
      id: 's4',
      sequenceNumber: 4,
      sequenceOfWork: 'Site levels & clearing / Plant operation',
      hazardsAndRisks: 'Persons falling into open trenches, crushing injuries, foot injuries from sharp objects, lacerations, UV exposure',
      possibleConsequence: 'Injury, plant strike',
      initialRisk: 'extreme',
      controlMeasures:
        'Isolate the work area from public and other contractors. Ensure open trenches and services are exposed by hand digging or non-destructive means and marked before machinery starts. All personnel within 5 m of machinery must be in line of sight of the operator and wear a safety helmet. No person in swing zone or boom reach when machine is operating. Machine operator must not use mobile phone or electronic device while machinery is moving. PPE always worn (safety boots, hi-vis, hand protection, sun smart, eye protection).',
      residualRisk: 'low',
      responsiblePerson: 'Operator / Spotter / Supervisor',
      isCriticalControl: true,
      monitoringMethod: 'Continuous spotter and communication',
      stopWorkTrigger: 'Loss of visual contact, people in exclusion zone or service strike risk',
      linkedPermit: '',
      linkedSwms: 'Moving Powered Plant, Working Near Underground Services',
      evidenceRequired: 'Service location confirmation',
      notes: '',
    },
    {
      id: 's5',
      sequenceNumber: 5,
      sequenceOfWork: 'Material handling, storage, excavation, edging, pavers, soils, mulching, turf, concrete works',
      hazardsAndRisks: 'Plant impact injuries, manual handling, eye damage, cuts, dust inhalation, concrete exposure, silica dust',
      possibleConsequence: 'Injury, respiratory disease, chemical burns',
      initialRisk: 'high',
      controlMeasures:
        'Use correct machinery for the task. Safe working distance from pedestrians and co-workers. Continued observation of surroundings. All safety guarding in place. Do not access steep slopes with machinery. Do not overload wheelbarrows (wheel pumped up). No dry cutting of silica materials unless filtered extraction or water suppression in place. Pathways clear. Materials in designated location. Mechanical equipment preferred. Plan clear path. Correct lifting techniques. Team lift awkward materials. SDS for mulch, herbicides, concrete, fertilisers must be read. Correct PPE for concrete (boots, long trousers, long sleeves, gloves, safety glasses, hard hat when pumping). Dust extraction on equipment generating silica or wood dust. Dust collection bag on wood plane. Min PPE includes hearing protection, safety glasses, P2 dust mask.',
      residualRisk: 'low',
      responsiblePerson: 'All Workers + Operators',
      isCriticalControl: true,
      monitoringMethod: 'Ongoing observation + SDS/PPE check',
      stopWorkTrigger: 'Uncontrolled dust, overload or people in plant zone',
      linkedPermit: '',
      linkedSwms: 'Manual Handling and Housekeeping, Silica Dust Exposure',
      evidenceRequired: 'SDS available',
      notes: '',
    },
    {
      id: 's6',
      sequenceNumber: 6,
      sequenceOfWork: 'Weeding, Fertilising & Watering',
      hazardsAndRisks: 'Manual handling – back, knee and muscle strain; contact or inhalation of chemicals; heat stress / sunburn / dehydration',
      possibleConsequence: 'Injury, chemical exposure, heat illness',
      initialRisk: 'medium',
      controlMeasures:
        'Change positions and vary tasks regularly. Stand & stretch regularly. Wear gloves when handling irritant weeds. Use PPE where required. Have available SDS for hazardous substances and be familiar with first aid protocol. Wear neck to toe coverage including hats, sun cream and sunglasses.',
      residualRisk: 'low',
      responsiblePerson: 'All Workers',
      isCriticalControl: false,
      monitoringMethod: 'Buddy observation + SDS check',
      stopWorkTrigger: 'Chemical exposure without PPE or signs of heat illness',
      linkedPermit: '',
      linkedSwms: 'Heat Stress, Remote Conditions & Fitness for Work',
      evidenceRequired: 'SDS available',
      notes: '',
    },
    {
      id: 's7',
      sequenceNumber: 7,
      sequenceOfWork: 'Working conditions outside & Clean-up',
      hazardsAndRisks: 'Weather (rain slip/trip, heat exhaustion), trip, slips, falls, manual handling, security',
      possibleConsequence: 'Injury, heat illness',
      initialRisk: 'high',
      controlMeasures:
        'Observe for extreme conditions and try to work indoors in severe conditions. Correct PPE: hats, sunscreen and plenty of fluids. On hot days regularly hydrate and lookout for work colleagues (confusion, slow/slurring speech, no sweat, nausea). Ensure all spoils are stacked into one pile, work zone cleaned including footpaths and road, and site gates are closed.',
      residualRisk: 'low',
      responsiblePerson: 'All Workers + Supervisor',
      isCriticalControl: false,
      monitoringMethod: 'Weather monitoring + end-of-day inspection',
      stopWorkTrigger: 'Extreme weather or uncontrolled waste',
      linkedPermit: '',
      linkedSwms: 'Heat Stress, Remote Conditions & Fitness for Work',
      evidenceRequired: '',
      notes: '',
    },
  ],
  taskRequirements: [
    {
      id: 'tr1',
      type: 'Plant separation requirements',
      description: 'Exclusion zone, spotter and positive communication when plant is operating. No one in swing/boom zone.',
    },
    {
      id: 'tr2',
      type: 'Dust-control requirements',
      description: 'No dry cutting of silica materials. Extraction or wet methods + P2 mask. Complete silica statement.',
    },
    {
      id: 'tr3',
      type: 'Exclusion-zone requirements',
      description: 'Isolate work area from public and other contractors. Barricade open trenches.',
    },
  ],
  envControls: [
    {
      type: 'Housekeeping',
      description: 'Progressive clean-up. Keep access ways and public areas clear.',
      responsiblePerson: 'All Workers',
    },
    {
      type: 'Waste',
      description: 'Spoils stacked neatly. Clean footpaths and roads. No waste left that creates public hazard.',
      responsiblePerson: 'All Workers',
    },
    {
      type: 'Dust',
      description: 'Minimise dust. Wet methods or extraction preferred. No dry cutting of silica materials.',
      responsiblePerson: 'Supervisor',
    },
    {
      type: 'Hazardous waste',
      description: 'Follow SDS for herbicides, fertilisers and chemicals. Correct disposal.',
      responsiblePerson: 'Supervisor',
    },
    {
      type: 'Biosecurity',
      description: 'Follow site weed hygiene requirements if applicable.',
      responsiblePerson: 'Supervisor',
    },
  ],
  emergencyActions: [
    { id: 'e1', action: 'Stop work immediately' },
    { id: 'e2', action: 'Make the area safe if safe to do so' },
    { id: 'e3', action: 'Provide first aid / call 000 for serious injury' },
    { id: 'e4', action: 'Notify Site Supervisor and Principal Contractor immediately' },
    { id: 'e5', action: 'For electrical or service strike – do not touch, call 000 and relevant utility emergency' },
    { id: 'e6', action: 'Preserve the incident scene where required' },
    { id: 'e7', action: 'Do not restart work until controls reviewed and workers re-briefed' },
  ],
  emergencyModules: [],
  competencyRows: [
    { requirement: 'White Card / General Construction Induction', applies: true, evidenceOrAuth: 'Current card' },
    { requirement: 'Site induction', applies: true, evidenceOrAuth: 'Site-specific / Epass' },
    { requirement: 'Plant competency / VOC', applies: true, evidenceOrAuth: 'As required for plant used' },
    { requirement: 'Power tool competency', applies: true, evidenceOrAuth: 'Trained/supervised' },
    { requirement: 'First aid', applies: false, evidenceOrAuth: '' },
    { requirement: 'Respirator fit testing', applies: false, evidenceOrAuth: 'If tight-fitting respirator required' },
  ],
  definitions: [
    {
      id: 'd1',
      term: 'Swing zone / boom reach',
      definition: 'The area that can be reached by the rotating upper structure or boom of excavator/plant – exclusion zone',
    },
  ],
  relatedDocs: [
    { id: 'rd1', type: 'Related SWMS', document: 'Manual Handling and Housekeeping', revision: 'Current', status: 'current' },
    { id: 'rd2', type: 'Related SWMS', document: 'Moving Powered Plant', revision: 'Current', status: 'current' },
    { id: 'rd3', type: 'Related SWMS', document: 'Working Near Underground Services', revision: 'Current', status: 'current' },
    { id: 'rd4', type: 'Related SWMS', document: 'Silica Dust Exposure', revision: 'Current', status: 'current' },
    { id: 'rd5', type: 'Related SWMS', document: 'Heat Stress, Remote Conditions & Fitness for Work', revision: 'Current', status: 'current' },
    { id: 'rd6', type: 'Related SWMS', document: 'Traffic Management / Working Near Roads', revision: 'Current', status: 'current' },
    { id: 'rd7', type: 'Other', document: 'High Risk Crystalline Silica Statement (Appendix 1)', revision: '2024', status: 'current' },
  ],
  workerSignOns: [],
  supervisorDeclaration: {
    name: '',
    position: 'Site Supervisor',
    date: '',
    signatureData: '',
    comments: 'I confirm this SWMS has been explained to all workers and controls will be complied with.',
  },
};

export default async function handler(req: Request, res: Response) {
  const auth = await getSessionAndProfile(req, res);
  if (!auth) return;

  const [ownerCheck] = await db.execute(sql.raw(
    `SELECT role FROM profiles WHERE user_id = '${auth.session.user.id}' LIMIT 1`
  )) as unknown as [Array<{ role: string }>, unknown];

  if (ownerCheck?.[0]?.role !== 'platform_owner') {
    return res.status(403).json({ error: 'Platform owner access required' });
  }

  const replace = req.query.replace === '1' || req.body?.replace === true;

  try {
    const [companyRows] = await db.execute(sql.raw(
      `SELECT id FROM companies WHERE status != 'archived' ORDER BY id`
    )) as unknown as [Array<{ id: number }>, unknown];

    const companyIds = (companyRows ?? []).map((r) => r.id);
    const title = LANDSCAPING_SWMS.title;
    const swmsBodyJson = JSON.stringify(LANDSCAPING_SWMS);
    const safe = (s: string) => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");

    let inserted = 0, updated = 0, skipped = 0;

    for (const companyId of companyIds) {
      const [existing] = await db.execute(sql.raw(
        `SELECT id FROM swms_templates WHERE company_id = ${companyId} AND title = ${JSON.stringify(title)} LIMIT 1`
      )) as unknown as [Array<{ id: number }>, unknown];

      const existingId = existing?.[0]?.id;

      if (existingId && replace) {
        await db.execute(sql.raw(`
          UPDATE swms_templates SET
            swms_body       = '${safe(swmsBodyJson)}',
            build_mode      = 'advanced',
            document_type   = 'swms',
            category        = 'Landscaping / Civil / Maintenance',
            revision_number = '1',
            status          = 'draft',
            updated_at      = NOW()
          WHERE id = ${existingId}
        `));
        updated++;
      } else if (existingId) {
        skipped++;
      } else {
        await db.execute(sql.raw(`
          INSERT INTO swms_templates
            (company_id, title, category, revision_number, author_name, approved_by_name,
             status, build_mode, document_type, swms_body, created_at, updated_at)
          VALUES (
            ${companyId},
            '${safe(title)}',
            'Landscaping / Civil / Maintenance',
            '1',
            'Site Supervisor / Williams Constructions NQ',
            'Principal Contractor',
            'draft',
            'advanced',
            'swms',
            '${safe(swmsBodyJson)}',
            NOW(), NOW()
          )
        `));
        inserted++;
      }
    }

    return res.json({ ok: true, companies: companyIds.length, inserted, updated, skipped });
  } catch (err) {
    console.error('seed-landscaping error:', err);
    return res.status(500).json({ error: String(err) });
  }
}
