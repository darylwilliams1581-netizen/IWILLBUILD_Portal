/**
 * POST /api/owner-console/swms/seed-fencing
 * One-time seed: pushes the Fencing Installation structured SWMS to all companies.
 * Platform owner only. Safe to re-run (skips if already exists, or replaces if ?replace=1).
 */
import type { Request, Response } from 'express';
import { db } from '../../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getPlatformOwnerInfo } from '../../../../lib/platform-owner-guard.js';

const FENCING_SWMS = {
  buildMode: 'advanced',
  documentType: 'swms',
  title: 'Fencing Installation',
  category: 'General Construction / Site Works',
  revisionNumber: '1',
  reviewDate: '2026-07-13',
  authorName: 'Site Supervisor / Williams Constructions NQ',
  approvedByName: 'Principal Contractor',
  status: 'draft',
  purpose: 'This Safe Work Method Statement (SWMS) identifies the hazards, risks and control measures for fencing installation works including post-hole digging, materials handling, power tools, air nail guns and working at heights. It is designed to eliminate or minimise risks to workers, other site personnel and the public so far as is reasonably practicable.',
  scope: 'Applies to all workers undertaking temporary or permanent fencing installation, post-hole digging (manual or mechanical), materials layout and handling, trimming/modifications, use of power tools and air nail guns, and working at heights on construction sites. Includes preparation, core works and clean-up.',
  includedActivities: [
    'Toolbox talk and pre-start',
    'Pre-operational equipment checks',
    'Work zone management and exclusion zones',
    'Materials layout and handling',
    'Post-hole digging (manual or mechanical digger)',
    'Use of circular saws, drills and grinders',
    'Air nail gun operation',
    'Trimming and in-situ modifications',
    'Spoils management',
    'Working at heights (trestles / scaffolding / balconies)',
    'Site clean-up and pack-up',
  ],
  excludedActivities: [
    'Deep excavation greater than 1.5 m',
    'Live electrical work',
    'High-risk silica work on engineered stone without separate controls',
  ],
  workBoundaries: 'Site-specific fencing locations only. Coordinate with principal contractor for access, underground services and other trades. Do not commence if controls cannot be maintained.',
  hrcwApplies: 'yes',
  hrcwCategories: [
    {
      id: 'h1',
      category: 'Risk of a person falling more than 2 metres',
      whyApplies: 'Installation of uprights and handrails from trestles, scaffolding or balconies',
      linkedWorkStep: 'Working at heights',
      requiredPermit: '',
      relatedSwms: 'Working at Heights controls',
    },
    {
      id: 'h2',
      category: 'Work in an area with movement of powered mobile plant',
      whyApplies: 'Possible use of mechanical post-hole digger or plant for materials',
      linkedWorkStep: 'Post-hole digging',
      requiredPermit: '',
      relatedSwms: 'Moving Powered Plant',
    },
    {
      id: 'h3',
      category: 'Crystalline Silica (RCS) exposure',
      whyApplies: 'Possible cutting, grinding or drilling of concrete or masonry products',
      linkedWorkStep: 'Trimming and power tools',
      requiredPermit: 'Silica statement (Appendix 1)',
      relatedSwms: 'Silica Dust Exposure',
    },
  ],
  criticalControls: [
    {
      id: 'cc1',
      criticalRisk: 'Fall from heights',
      possibleOutcome: 'Serious injury or fatality',
      mandatoryControls: 'Use only secure and stable scaffolding, trestles or walking boards fit for purpose. Ladders for minor short-term work only. Clear fall zone. Harness with correct lanyard and approved anchor point + second person for recovery when working from balcony. No working alone at height.',
      verificationMethod: 'Pre-start inspection of access equipment + supervisor visual check',
      responsibleRole: 'Supervisor / All Workers',
      flags: ['critical', 'mandatory'],
    },
    {
      id: 'cc2',
      criticalRisk: 'Unintended nail gun discharge',
      possibleOutcome: 'Penetrating injury to self or others',
      mandatoryControls: 'Bump-fire mode prohibited. Trigger lock activated when not in use. Airline disconnected or battery removed during maintenance or movement. Safety glasses worn at all times when operating, reloading or servicing.',
      verificationMethod: 'Pre-use check of gun mode and PPE',
      responsibleRole: 'Operator',
      flags: ['critical', 'mandatory'],
    },
    {
      id: 'cc3',
      criticalRisk: 'Entanglement / injury from post-hole digger',
      possibleOutcome: 'Sprain, entanglement, crushing or vibration injury',
      mandatoryControls: 'Team lift into position and when removing. Ear protection. Only used in well-ventilated areas. Safety recoil mechanism fitted and functional. Gloves worn. Check soil type/density/rock before use.',
      verificationMethod: 'Pre-start equipment checklist',
      responsibleRole: 'Operator / Spotter',
      flags: ['critical'],
    },
    {
      id: 'cc4',
      criticalRisk: 'Silica dust exposure',
      possibleOutcome: 'Silicosis, lung disease',
      mandatoryControls: 'Wet methods or Class H extraction preferred. Minimum P2 respirator when dust is generated. Dry cutting of engineered stone banned. Complete silica statement (Appendix 1) if applicable.',
      verificationMethod: 'Dust control equipment check + respirator fit',
      responsibleRole: 'Supervisor / All Workers',
      flags: ['mandatory'],
    },
  ],
  plantItems: [
    { id: 'p1', item: 'Mechanical Post Hole Digger', requirement: 'Team lift, ear protection, recoil mechanism, well ventilated, gloves', inspectionRequired: 'Yes – daily pre-start', notes: 'Check soil conditions first' },
    { id: 'p2', item: 'Circular Saw / Drill / Angle Grinder', requirement: 'Guards in place and operational, correct blades/discs, competent operators', inspectionRequired: 'Yes – before each use', notes: 'Eye and hearing protection mandatory' },
    { id: 'p3', item: 'Air Nail Gun', requirement: 'Sequential trigger only (no bump fire), trigger lock, safety glasses', inspectionRequired: 'Yes – before each use', notes: 'Airline/battery isolated when not in use' },
  ],
  ppeRows: [
    { item: 'Safety helmet', requirement: 'At all times on site' },
    { item: 'Steel-capped safety boots', requirement: 'At all times on site' },
    { item: 'Hi-vis long-sleeve clothing', requirement: 'At all times on site' },
    { item: 'Safety glasses / goggles', requirement: 'When using power tools, nail guns or generating dust' },
    { item: 'Hearing protection', requirement: 'When using power tools or post-hole digger' },
    { item: 'Task-specific gloves', requirement: 'When handling materials, tools or sheet metal' },
    { item: 'P2 dust mask / respirator', requirement: 'When cutting, grinding or generating dust' },
    { item: 'Safety harness + lanyard', requirement: 'When working at heights from balcony or where fall risk cannot be eliminated' },
    { item: 'Sunscreen + hat', requirement: 'Outdoor work – reapply as required' },
  ],
  workSteps: [
    { id: 's1', sequenceNumber: 1, sequenceOfWork: 'Toolbox Talk & Pre-start', hazardsAndRisks: 'Workers unaware of risks, unfit for duty, weather extremes', possibleConsequence: 'Injury, heat illness, poor decision making', initialRisk: 'high', controlMeasures: 'Stop-Plan-Do process. Fitness for work check. Review emergency response. Discuss weather, manual handling and contingency plan. All workers sign onto SWMS.', residualRisk: 'low', responsiblePerson: 'Supervisor / All Workers', isCriticalControl: false, monitoringMethod: 'Daily pre-start attendance', stopWorkTrigger: 'Any worker unfit or controls cannot be applied', linkedPermit: '', linkedSwms: '', evidenceRequired: 'Signed SWMS and pre-start record', notes: '' },
    { id: 's2', sequenceNumber: 2, sequenceOfWork: 'Pre-operational equipment checks', hazardsAndRisks: 'Faulty tools, untagged electrical equipment, failed safety devices', possibleConsequence: 'Electrocution, laceration, equipment failure', initialRisk: 'high', controlMeasures: 'All electrical equipment current test & tag. Hand tools and mechanical equipment in good condition. Guards fitted. PPE serviceable. Lead stands used. Service logs for pneumatic tools. Manufacturer instructions followed.', residualRisk: 'low', responsiblePerson: 'All Workers', isCriticalControl: true, monitoringMethod: 'Visual inspection + checklist', stopWorkTrigger: 'Any defective equipment', linkedPermit: '', linkedSwms: 'Use of Power Tools', evidenceRequired: 'Pre-start checklist', notes: '' },
    { id: 's3', sequenceNumber: 3, sequenceOfWork: 'Manage work zone & materials layout', hazardsAndRisks: 'Trips, slips, crushing, obstruction of access, other trades', possibleConsequence: 'Injury, plant interaction', initialRisk: 'medium', controlMeasures: 'Communicate with other trades. Clear pathways. Site trade-ready. Barricade drop zones. Materials not placed in access paths or doorways. Coordinate placement with site supervisor.', residualRisk: 'low', responsiblePerson: 'Supervisor / All Workers', isCriticalControl: false, monitoringMethod: 'Ongoing visual', stopWorkTrigger: 'Blocked access or uncontrolled hazards', linkedPermit: '', linkedSwms: '', evidenceRequired: '', notes: '' },
    { id: 's4', sequenceNumber: 4, sequenceOfWork: 'Materials handling', hazardsAndRisks: 'Strain, sprain, crush, laceration from sheet or metal materials', possibleConsequence: 'Musculoskeletal injury', initialRisk: 'high', controlMeasures: 'Plan clear path. Correct lifting technique. Team lift awkward or heavy items. Use clamps for extended holding. Gloves for all sheet/metal. Mechanical aids where practicable.', residualRisk: 'low', responsiblePerson: 'All Workers', isCriticalControl: false, monitoringMethod: 'Buddy observation', stopWorkTrigger: 'Excessive force or awkward posture required', linkedPermit: '', linkedSwms: 'Manual Handling and Housekeeping', evidenceRequired: '', notes: '' },
    { id: 's5', sequenceNumber: 5, sequenceOfWork: 'Post-hole digging (manual or mechanical)', hazardsAndRisks: 'Sprain, entanglement, noise, vibration, fumes, soil collapse', possibleConsequence: 'Injury, hearing damage', initialRisk: 'high', controlMeasures: 'Assess soil type/density/rock. Team lift digger into and out of position. Ear protection. Well-ventilated area only. Recoil mechanism fitted. Gloves. Progressive spoil management.', residualRisk: 'low', responsiblePerson: 'Operator + Spotter', isCriticalControl: true, monitoringMethod: 'Operator + supervisor observation', stopWorkTrigger: 'Hard rock, underground services or equipment fault', linkedPermit: 'Excavation permit if >200 mm', linkedSwms: 'Working Near Underground Services, Moving Powered Plant', evidenceRequired: 'Service location confirmation', notes: 'Treat all services as live until proven otherwise' },
    { id: 's6', sequenceNumber: 6, sequenceOfWork: 'Power tools, circular saw, drill, grinders & nail guns', hazardsAndRisks: 'Cuts, laceration, noise, flying particles, unintended discharge', possibleConsequence: 'Injury, eye damage, penetrating wound', initialRisk: 'high', controlMeasures: 'Competent operators only. All guards in place. Correct blades/bits/discs. Eye + hearing protection always. Surrounding area clear of others. Nail gun: sequential trigger only, lock when not in use, isolate air/battery for maintenance.', residualRisk: 'low', responsiblePerson: 'Operator', isCriticalControl: true, monitoringMethod: 'Pre-use check + observation', stopWorkTrigger: 'Damaged guard, wrong mode or persons in line of fire', linkedPermit: '', linkedSwms: 'Use of Power Tools', evidenceRequired: 'Competency confirmation', notes: '' },
    { id: 's7', sequenceNumber: 7, sequenceOfWork: 'Working at heights – uprights and handrail installation', hazardsAndRisks: 'Fall from height, falling objects', possibleConsequence: 'Serious injury or fatality', initialRisk: 'extreme', controlMeasures: 'Prefer install uprights from trestle at ground level where practicable. When working from balcony: safety harness + correct lanyard on approved anchor + second person for recovery. Secure and stable scaffolding/trestles. Clear fall zone. Ladders for minor short-term works only.', residualRisk: 'low', responsiblePerson: 'All Workers + Supervisor', isCriticalControl: true, monitoringMethod: 'Visual check of access equipment + harness', stopWorkTrigger: 'Unstable access, missing fall protection or weather', linkedPermit: '', linkedSwms: 'Working at Heights', evidenceRequired: 'Harness inspection record if used', notes: '' },
    { id: 's8', sequenceNumber: 8, sequenceOfWork: 'Spoils management & clean-up', hazardsAndRisks: 'Trips, slips, manual handling, unsecured materials', possibleConsequence: 'Injury, security risk', initialRisk: 'medium', controlMeasures: 'Pick up spoils progressively into cage/bins. Lightweight waste bagged. Spoils kept outside fall zones. Gates closed. Area left tidy and secure.', residualRisk: 'low', responsiblePerson: 'All Workers', isCriticalControl: false, monitoringMethod: 'End-of-day inspection', stopWorkTrigger: 'Uncontrolled waste or blocked egress', linkedPermit: '', linkedSwms: '', evidenceRequired: '', notes: '' },
  ],
  taskRequirements: [
    { id: 'tr1', type: 'Exclusion-zone requirements', description: 'Barricade potential drop zones and keep other trades clear of active fencing works' },
    { id: 'tr2', type: 'Dust-control requirements', description: 'Wet methods or extraction preferred; P2 minimum when dust generated; complete silica statement if cutting concrete/masonry' },
    { id: 'tr3', type: 'Plant separation requirements', description: 'Spotter and exclusion zone when mechanical post-hole digger or plant is operating' },
  ],
  envControls: [
    { type: 'Housekeeping', description: 'Progressive clean-up of spoils and offcuts. Keep access ways clear at all times.', responsiblePerson: 'All Workers' },
    { type: 'Waste', description: 'Lightweight waste into bins/cages. Spoil managed so it does not enter drains or leave site.', responsiblePerson: 'All Workers' },
    { type: 'Dust', description: 'Minimise dust generation. Use wet methods or extraction where practicable.', responsiblePerson: 'Supervisor' },
  ],
  emergencyActions: [
    { id: 'e1', action: 'Stop work immediately' },
    { id: 'e2', action: 'Make the area safe if safe to do so' },
    { id: 'e3', action: 'Provide first aid / call 000 for serious injury' },
    { id: 'e4', action: 'Notify Site Supervisor and Principal Contractor immediately' },
    { id: 'e5', action: 'Preserve the incident scene where required' },
    { id: 'e6', action: 'Do not restart work until controls reviewed and workers re-briefed' },
  ],
  emergencyModules: [],
  competencyRows: [
    { requirement: 'White Card / General Construction Induction', applies: true, evidenceOrAuth: 'Current card' },
    { requirement: 'Site induction', applies: true, evidenceOrAuth: 'Site-specific' },
    { requirement: 'Power tool competency', applies: true, evidenceOrAuth: 'Trained/supervised' },
    { requirement: 'Working at heights awareness', applies: true, evidenceOrAuth: '' },
    { requirement: 'Plant competency / VOC (Post-hole digger)', applies: true, evidenceOrAuth: 'If mechanical digger used' },
    { requirement: 'First aid', applies: false, evidenceOrAuth: '' },
    { requirement: 'Respirator fit testing', applies: false, evidenceOrAuth: 'If tight-fitting respirator required' },
  ],
  definitions: [
    { id: 'd1', term: 'Bump fire', definition: 'Contact-trip / sequential mode disabled so nail discharges on contact without trigger pull – prohibited' },
    { id: 'd2', term: 'Class H extraction', definition: 'High-efficiency vacuum system for silica dust (or Class M if manufacturer approved)' },
  ],
  relatedDocs: [
    { id: 'rd1', type: 'Related SWMS', document: 'Manual Handling and Housekeeping', revision: 'Current', status: 'current' },
    { id: 'rd2', type: 'Related SWMS', document: 'Moving Powered Plant', revision: 'Current', status: 'current' },
    { id: 'rd3', type: 'Related SWMS', document: 'Silica Dust Exposure', revision: 'Current', status: 'current' },
    { id: 'rd4', type: 'Related SWMS', document: 'Use of Power Tools', revision: 'Current', status: 'current' },
    { id: 'rd5', type: 'Other', document: 'High Risk Crystalline Silica Statement (Appendix 1)', revision: '2024', status: 'current' },
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
  const info = await getPlatformOwnerInfo(req);
  if (!info) return res.status(401).json({ error: 'Unauthorised' });
  if (!info.isPlatformOwner) return res.status(403).json({ error: 'Platform owner access required' });

  const replace = req.query.replace === '1' || req.body?.replace === true;

  try {
    const title = FENCING_SWMS.title;
    const swmsBodyJson = JSON.stringify(FENCING_SWMS);
    const safe = (s) => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");

    // Check if a platform master already exists for this title
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

    // Insert new platform master (company_id = NULL)
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
