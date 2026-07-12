/**
 * POST /api/owner-console/swms/seed-concreting-slab
 * One-time seed: pushes the Concreting Slab structured SWMS to all companies.
 * Platform owner only. Safe to re-run (skips if already exists, or replaces if ?replace=1).
 */
import type { Request, Response } from 'express';
import { db } from '../../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getSessionAndProfile } from '../../../../lib/auth-middleware.js';

const CONCRETING_SLAB_SWMS = {
  buildMode: 'advanced',
  documentType: 'swms',
  title: 'Concreting Slab',
  category: 'Concreting / Civil Works',
  revisionNumber: '1',
  reviewDate: '2026-07-13',
  authorName: 'Site Supervisor / Williams Constructions NQ',
  approvedByName: 'Principal Contractor',
  status: 'draft',
  purpose:
    'This Safe Work Method Statement identifies the hazards, risks and control measures for concreting slab works including formwork, reinforcement, concrete placement, pumping, finishing, materials handling and associated plant. It aims to eliminate or minimise risks so far as is reasonably practicable.',
  scope:
    'Applies to all workers undertaking slab preparation, formwork (boxing), waffle pods, reinforcement, concrete delivery and pumping, placement, finishing, materials handling and clean-up on construction sites. Includes coordination with pump operators and other trades.',
  includedActivities: [
    'Toolbox talk and pre-start',
    'Pre-operational equipment checks',
    'Consultation with concrete pump operator',
    'Identification of underground services',
    'Work zone management',
    'Materials handling (boxing, waffle pods, reo, disassembly)',
    'Manual handling and concrete exposure',
    'Spoils management',
    'Site clean-up',
  ],
  excludedActivities: [
    'Deep excavation greater than 1.5 m without separate SWMS',
    'Live electrical work without isolation',
    'Dry cutting of concrete without approved controls',
  ],
  workBoundaries:
    'Site-specific slab locations only. Coordinate with principal contractor for access, services, pump placement and other trades. Stop work immediately if controls cannot be maintained.',
  hrcwApplies: 'yes',
  hrcwCategories: [
    {
      id: 'h1',
      category: 'Work in or near a shaft or trench deeper than 1.5 m or a tunnel',
      whyApplies: 'Possible trenches or edge formwork adjacent to excavations',
      linkedWorkStep: 'Work zone management',
      requiredPermit: 'Excavation permit if applicable',
      relatedSwms: 'Working Near Underground Services',
    },
    {
      id: 'h2',
      category: 'Work on or near energised electrical installations or services (above or underground)',
      whyApplies: 'Risk of striking services or working near overhead lines during pumping',
      linkedWorkStep: 'Identify services / Pump vehicle placement',
      requiredPermit: 'Dial Before You Dig / Service location',
      relatedSwms: 'Working Near Underground Services',
    },
    {
      id: 'h3',
      category: 'Work on, in or adjacent to a road or other traffic corridor',
      whyApplies: 'Concrete trucks and pump vehicles accessing site',
      linkedWorkStep: 'Work zone management',
      requiredPermit: 'Traffic management if required',
      relatedSwms: 'Traffic Management / Working Near Roads',
    },
    {
      id: 'h4',
      category: 'Work in an area with movement of powered mobile plant',
      whyApplies: 'Concrete pump, trucks, excavators and compactors',
      linkedWorkStep: 'Materials handling and placement',
      requiredPermit: '',
      relatedSwms: 'Moving Powered Plant',
    },
    {
      id: 'h5',
      category: 'Crystalline Silica (RCS) exposure',
      whyApplies: 'Cutting, grinding or drilling concrete; exposure to cement dust',
      linkedWorkStep: 'Trimming / finishing / clean-up',
      requiredPermit: 'Silica statement (Appendix 1)',
      relatedSwms: 'Silica Dust Exposure',
    },
  ],
  criticalControls: [
    {
      id: 'cc1',
      criticalRisk: 'Concrete pump / boom contact with overhead power lines or instability',
      possibleOutcome: 'Electrocution, boom collapse, serious injury or fatality',
      mandatoryControls:
        'Pump vehicle placed at least 6.4 m from overhead power lines (use spotter if closer). Pump vehicle and delivery trucks on level ground with outriggers fully extended. Distance from power lines checked for boom clearance. Traffic management plan in place. Line pump preferred if overhead lines are present along access.',
      verificationMethod: 'Pre-pour checklist + spotter confirmation',
      responsibleRole: 'Supervisor / Pump Operator',
      flags: ['critical', 'mandatory'],
    },
    {
      id: 'cc2',
      criticalRisk: 'Underground service strike',
      possibleOutcome: 'Electrocution, explosion, service outage, injury',
      mandatoryControls:
        'Refer to project drawings and Dial Before You Dig report. Hand dig / pothole within 500 mm of any service. Identify and mark all services before excavation or formwork. Treat all services as live until proven otherwise.',
      verificationMethod: 'Service location confirmation before ground disturbance',
      responsibleRole: 'Supervisor / All Workers',
      flags: ['critical', 'mandatory'],
    },
    {
      id: 'cc3',
      criticalRisk: 'Exposure to wet concrete / cement',
      possibleOutcome: 'Chemical burns, dermatitis, eye injury',
      mandatoryControls:
        'Boots, long trousers, long-sleeve tops and gloves when handling concrete. Safety glasses and hard hat when pumping with boom. Take precautions as per SDS. Wash off concrete immediately. First aid available for cement burns.',
      verificationMethod: 'PPE check + SDS available',
      responsibleRole: 'All Workers',
      flags: ['critical', 'mandatory'],
    },
    {
      id: 'cc4',
      criticalRisk: 'Silica dust from cutting / grinding concrete',
      possibleOutcome: 'Silicosis, lung disease',
      mandatoryControls:
        'Dry cutting of concrete banned unless approved wet suppression or Class H extraction in place. Minimum P2 mask. Complete silica statement (Appendix 1). Prefer wet methods.',
      verificationMethod: 'Dust control equipment check',
      responsibleRole: 'Supervisor / Operator',
      flags: ['critical', 'mandatory'],
    },
    {
      id: 'cc5',
      criticalRisk: 'Manual handling of reo, formwork and materials',
      possibleOutcome: 'Strain, sprain, crush injury',
      mandatoryControls:
        'Plan clear path. Correct lifting technique. Team lift awkward materials. Mechanical equipment preferred. Crushed rock bed across work zone. Timber stakes preferred; steel pickets capped. Designated access/egress ramps. Reo cut with mechanical cutters (no grinder for cutting reo where possible).',
      verificationMethod: 'Observation of lifting methods',
      responsibleRole: 'All Workers',
      flags: ['critical'],
    },
  ],
  plantItems: [
    {
      id: 'p1',
      item: 'Concrete Pump (boom or line)',
      requirement: 'Competent operator, outriggers fully extended, level ground, spotter near power lines',
      inspectionRequired: 'Yes – pre-pour checklist',
      notes: 'Minimum 6.4 m from overhead lines',
    },
    {
      id: 'p2',
      item: 'Concrete Trucks / Agitators',
      requirement: 'Level ground, outriggers if fitted, traffic management',
      inspectionRequired: 'Yes',
      notes: 'Follow same positioning rules as pump',
    },
    {
      id: 'p3',
      item: 'Formwork / Boxing / Waffle Pods / Reo',
      requirement: 'Correct installation, capped pickets, stable platforms',
      inspectionRequired: 'Yes – before pour',
      notes: 'Walkways planked where required',
    },
  ],
  ppeRows: [
    { item: 'Safety helmet', requirement: 'At all times on site and when pumping' },
    { item: 'Steel-capped safety boots', requirement: 'At all times on site' },
    { item: 'Hi-vis long trousers and long-sleeve clothing', requirement: 'At all times – essential for concrete protection' },
    { item: 'Safety glasses / goggles', requirement: 'When pumping, cutting or generating splash/dust' },
    { item: 'Task-specific gloves', requirement: 'When handling concrete, reo or materials' },
    { item: 'Hearing protection', requirement: 'When plant or tools create noise' },
    { item: 'P2 dust mask / respirator', requirement: 'When cutting concrete or generating dust' },
    { item: 'Sunscreen + hat', requirement: 'Outdoor work – reapply as required' },
  ],
  workSteps: [
    {
      id: 's1',
      sequenceNumber: 1,
      sequenceOfWork: 'Toolbox Talk & Pre-start',
      hazardsAndRisks: 'Workers unaware of risks, unfit for duty, weather, pump coordination',
      possibleConsequence: 'Injury, heat exhaustion, poor decisions',
      initialRisk: 'high',
      controlMeasures:
        'Stop-Plan-Do process. Fitness for work check. Review emergency response. Discuss weather, manual handling, concrete burns and contingency plan. All workers (including pump operator) sign onto SWMS. Concrete pump operator discusses and signs onto concreters SWMS.',
      residualRisk: 'low',
      responsiblePerson: 'Supervisor / All Workers / Pump Operator',
      isCriticalControl: false,
      monitoringMethod: 'Daily pre-start attendance',
      stopWorkTrigger: 'Any worker unfit or pump operator not briefed',
      linkedPermit: '',
      linkedSwms: '',
      evidenceRequired: 'Signed SWMS and pre-start record',
      notes: '',
    },
    {
      id: 's2',
      sequenceNumber: 2,
      sequenceOfWork: 'Pre-operational equipment checks',
      hazardsAndRisks: 'Rupture of pipework, collapse of ramp, equipment failure',
      possibleConsequence: 'Injury, equipment failure',
      initialRisk: 'high',
      controlMeasures:
        'Inspection of all equipment using checklists. If in doubt tag out of service. Distance from power lines checked for boom clearance. Traffic management plan in place. If overhead powerlines along access line, line pump must be used.',
      residualRisk: 'low',
      responsiblePerson: 'Supervisor / Operators',
      isCriticalControl: true,
      monitoringMethod: 'Pre-pour checklist',
      stopWorkTrigger: 'Defective equipment or insufficient clearance',
      linkedPermit: '',
      linkedSwms: 'Moving Powered Plant',
      evidenceRequired: 'Checklist completed',
      notes: '',
    },
    {
      id: 's3',
      sequenceNumber: 3,
      sequenceOfWork: 'Identify services in excavation / formwork area',
      hazardsAndRisks: 'Electrocution, pressure injury, gas explosion',
      possibleConsequence: 'Serious injury or fatality',
      initialRisk: 'extreme',
      controlMeasures:
        'Refer to project managers drawings and Dial Before You Dig report. Hand digging (potholing). Ensure discovery of underground services is completed within any excavation within 500 mm of any service. Mark all services. Treat as live until proven otherwise.',
      residualRisk: 'low',
      responsiblePerson: 'Supervisor / All Workers',
      isCriticalControl: true,
      monitoringMethod: 'Service location confirmation',
      stopWorkTrigger: 'Unidentified services or no DBYD',
      linkedPermit: 'Excavation / service location permit',
      linkedSwms: 'Working Near Underground Services',
      evidenceRequired: 'DBYD and marked services',
      notes: '',
    },
    {
      id: 's4',
      sequenceNumber: 4,
      sequenceOfWork: 'Manage work zone',
      hazardsAndRisks: 'Injury from mechanical failure, trip, slip, crushing, electrocution from overhead lines, pump vehicle destabilisation',
      possibleConsequence: 'Injury, electrocution, boom collapse',
      initialRisk: 'high',
      controlMeasures:
        'Communicate task and area hazards to other people on site. Ensure pathways clear. Site trade ready. Barricade potential drop/hazard zones. All metal pickets capped. For concrete pump: place at least 6.4 m from overhead power line (spotter if closer). Pump vehicle and delivery trucks on level ground with outriggers in place. UV protection, hats, sunscreen, fluids and shade breaks in hot weather.',
      residualRisk: 'low',
      responsiblePerson: 'Supervisor / All Workers',
      isCriticalControl: true,
      monitoringMethod: 'Ongoing visual + weather monitoring',
      stopWorkTrigger: 'People in exclusion zone, unstable ground or extreme weather',
      linkedPermit: '',
      linkedSwms: 'Traffic Management / Working Near Roads',
      evidenceRequired: '',
      notes: '',
    },
    {
      id: 's5',
      sequenceNumber: 5,
      sequenceOfWork: 'Materials handling – Boxing / Waffle Pods / Reo / Disassembly',
      hazardsAndRisks: 'Strain, sprains, crush type injuries',
      possibleConsequence: 'Musculoskeletal or crush injury',
      initialRisk: 'high',
      controlMeasures:
        'Plan clear path. Correct lifting techniques. Team lift awkward materials. Mechanical equipment used where practicable. Crushed rock bed across complete work zone. Timber stakes preferred. Steel pickets capped. Designated access/egress point ramped onto slab. Reo mesh and bar cut with mechanical cutters (grinder not preferred).',
      residualRisk: 'low',
      responsiblePerson: 'All Workers',
      isCriticalControl: false,
      monitoringMethod: 'Buddy observation',
      stopWorkTrigger: 'Manual lifting of heavy reo or unstable formwork',
      linkedPermit: '',
      linkedSwms: 'Manual Handling and Housekeeping',
      evidenceRequired: '',
      notes: '',
    },
    {
      id: 's6',
      sequenceNumber: 6,
      sequenceOfWork: 'Manual handling, digging, laying materials and concrete exposure',
      hazardsAndRisks: 'Strain, sprains, crushing, cuts, slips, health effects from concrete',
      possibleConsequence: 'Injury, chemical burns, dermatitis',
      initialRisk: 'high',
      controlMeasures:
        'Secure handling techniques. Team lift for awkward materials. Rotation of tasks where sustained vibration or forces used. Mechanical equipment as first option. Correct PPE to manage residual risk (boots, long trousers, long sleeves, gloves). Safety glasses and hard hat when pumping. Set up walkway planks where necessary for stable pathways. Take SDS precautions.',
      residualRisk: 'low',
      responsiblePerson: 'All Workers',
      isCriticalControl: true,
      monitoringMethod: 'PPE and handling observation',
      stopWorkTrigger: 'Inadequate PPE or excessive manual force',
      linkedPermit: '',
      linkedSwms: 'Manual Handling and Housekeeping',
      evidenceRequired: 'SDS available',
      notes: '',
    },
    {
      id: 's7',
      sequenceNumber: 7,
      sequenceOfWork: 'Spoils management and clean-up',
      hazardsAndRisks: 'Slip/trip from split concrete, environmental harm, security',
      possibleConsequence: 'Injury, pollution, public hazard',
      initialRisk: 'medium',
      controlMeasures:
        'All spoils cleared in a timely manner to ensure safe transit areas. No spoils allowed to leave site (footpaths, roadway, drains or water courses). Lightweight waste into cage/bins. Spoils outside transit zones. Fences in place and gates closed. Mud/waste cleaned from footpath and road. Public safety not at risk.',
      residualRisk: 'low',
      responsiblePerson: 'All Workers',
      isCriticalControl: false,
      monitoringMethod: 'End-of-pour and end-of-day inspection',
      stopWorkTrigger: 'Uncontrolled spoils or runoff',
      linkedPermit: '',
      linkedSwms: '',
      evidenceRequired: '',
      notes: '',
    },
  ],
  taskRequirements: [
    {
      id: 'tr1',
      type: 'Exclusion-zone requirements',
      description: 'Barricade hazard zones around pump, trucks and pour area. Keep non-essential workers clear.',
    },
    {
      id: 'tr2',
      type: 'Plant separation requirements',
      description: 'Spotter and exclusion zones for pump boom, trucks and plant movement',
    },
    {
      id: 'tr3',
      type: 'Dust-control requirements',
      description: 'Wet methods or Class H extraction for any concrete cutting/grinding. Complete silica statement.',
    },
    {
      id: 'tr4',
      type: 'Permit requirements',
      description: 'Dial Before You Dig and excavation/service location permits as required',
    },
  ],
  envControls: [
    {
      type: 'Housekeeping',
      description: 'Progressive clean-up of concrete, reo offcuts and formwork. Keep access ways clear.',
      responsiblePerson: 'All Workers',
    },
    {
      type: 'Waste',
      description: 'No concrete or spoils to leave site onto footpaths, roads or drains. Clean mud and waste from public areas.',
      responsiblePerson: 'All Workers',
    },
    {
      type: 'Stormwater',
      description: 'Prevent concrete slurry and sediment entering drains or waterways.',
      responsiblePerson: 'Supervisor',
    },
    {
      type: 'Dust',
      description: 'Minimise dust. Wet methods preferred for any cutting or grinding.',
      responsiblePerson: 'Supervisor',
    },
  ],
  emergencyActions: [
    { id: 'e1', action: 'Stop work immediately' },
    { id: 'e2', action: 'Make the area safe if safe to do so' },
    { id: 'e3', action: 'Provide first aid / call 000 for serious injury or chemical burn' },
    { id: 'e4', action: 'Notify Site Supervisor and Principal Contractor immediately' },
    { id: 'e5', action: 'For electrical incident – do not approach until area confirmed safe; call 000 and electricity emergency 131 962 if assets involved' },
    { id: 'e6', action: 'Preserve the incident scene where required' },
    { id: 'e7', action: 'Do not restart work until controls reviewed and workers re-briefed' },
  ],
  emergencyModules: [],
  competencyRows: [
    { requirement: 'White Card / General Construction Induction', applies: true, evidenceOrAuth: 'Current card' },
    { requirement: 'Site induction', applies: true, evidenceOrAuth: 'Site-specific' },
    { requirement: 'Power tool competency', applies: true, evidenceOrAuth: 'Trained/supervised' },
    { requirement: 'Plant competency / VOC (if operating plant)', applies: true, evidenceOrAuth: 'As required' },
    { requirement: 'Concrete pump operator competency', applies: true, evidenceOrAuth: 'Pump operator only' },
    { requirement: 'First aid', applies: false, evidenceOrAuth: '' },
    { requirement: 'Respirator fit testing', applies: false, evidenceOrAuth: 'If tight-fitting respirator required' },
  ],
  definitions: [
    {
      id: 'd1',
      term: 'Outriggers',
      definition: 'Stabilising legs on concrete pump or crane that must be fully extended on level ground before operation',
    },
  ],
  relatedDocs: [
    { id: 'rd1', type: 'Related SWMS', document: 'Manual Handling and Housekeeping', revision: 'Current', status: 'current' },
    { id: 'rd2', type: 'Related SWMS', document: 'Moving Powered Plant', revision: 'Current', status: 'current' },
    { id: 'rd3', type: 'Related SWMS', document: 'Working Near Underground Services', revision: 'Current', status: 'current' },
    { id: 'rd4', type: 'Related SWMS', document: 'Silica Dust Exposure', revision: 'Current', status: 'current' },
    { id: 'rd5', type: 'Related SWMS', document: 'Traffic Management / Working Near Roads', revision: 'Current', status: 'current' },
    { id: 'rd6', type: 'Other', document: 'High Risk Crystalline Silica Statement (Appendix 1)', revision: '2024', status: 'current' },
  ],
  workerSignOns: [],
  supervisorDeclaration: {
    name: '',
    position: 'Site Supervisor',
    date: '',
    signatureData: '',
    comments: 'I confirm this SWMS has been explained to all workers (including pump operator) and controls will be complied with.',
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
    const title = CONCRETING_SLAB_SWMS.title;
    const swmsBodyJson = JSON.stringify(CONCRETING_SLAB_SWMS);

    let inserted = 0, updated = 0, skipped = 0;

    for (const companyId of companyIds) {
      const [existing] = await db.execute(sql.raw(
        `SELECT id FROM swms_templates WHERE company_id = ${companyId} AND title = ${JSON.stringify(title)} LIMIT 1`
      )) as unknown as [Array<{ id: number }>, unknown];

      const existingId = existing?.[0]?.id;
      const safe = (s: string) => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");

      if (existingId && replace) {
        await db.execute(sql.raw(`
          UPDATE swms_templates SET
            swms_body       = '${safe(swmsBodyJson)}',
            build_mode      = 'advanced',
            document_type   = 'swms',
            category        = 'Concreting / Civil Works',
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
            'Concreting / Civil Works',
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
    console.error('seed-concreting-slab error:', err);
    return res.status(500).json({ error: String(err) });
  }
}
