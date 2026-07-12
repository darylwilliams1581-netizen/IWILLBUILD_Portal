/**
 * POST /api/owner-console/swms/seed-carpenter-framing
 * One-time seed: pushes the Carpenter Framing structured SWMS to all companies.
 * Platform owner only. Safe to re-run (skips if already exists, or replaces if ?replace=1).
 */
import type { Request, Response } from 'express';
import { db } from '../../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getPlatformOwnerInfo } from '../../../../lib/platform-owner-guard.js';

const CARPENTER_FRAMING_SWMS = {
  buildMode: 'advanced',
  documentType: 'swms',
  title: 'Carpenter Framing',
  category: 'Carpentry / Structural Framing',
  revisionNumber: '1',
  reviewDate: '2026-07-13',
  authorName: 'Site Supervisor / Williams Constructions NQ',
  approvedByName: 'Principal Contractor',
  status: 'draft',
  purpose: 'This Safe Work Method Statement identifies the hazards, risks and control measures for carpenter framing works including floor, wall and roof framing, materials handling, nail guns, power tools and working at heights. It aims to eliminate or minimise risks so far as is reasonably practicable.',
  scope: 'Applies to all workers undertaking floor, wall and roof framing, installation of flooring, external wall frames, trusses, shaft liners and fire panels, use of air nail guns, power tools, materials handling and working at heights on residential and commercial construction sites. Includes preparation, core framing activities and clean-up.',
  includedActivities: [
    'Toolbox talk and pre-start',
    'Pre-operational equipment checks',
    'Work zone management',
    'Materials layout and handling',
    'Air nail gun use',
    'Power tool use and trimming',
    'Installation of flooring',
    'Installation of external wall frames',
    'Installation of shaft liner / fire panel',
    'Installation of trusses',
    'Working at heights',
    'Spoils management and clean-up',
  ],
  excludedActivities: [
    'Deep excavation',
    'Live electrical work without isolation',
    'High-risk silica cutting of engineered stone without separate controls',
  ],
  workBoundaries: 'Site-specific framing areas only. Coordinate with principal contractor for access, other trades and temporary works. Stop work immediately if controls cannot be maintained.',
  hrcwApplies: 'yes',
  hrcwCategories: [
    {
      id: 'h1',
      category: 'Risk of a person falling more than 2 metres',
      whyApplies: 'Flooring, wall frame and truss installation, working on top plates and open floors',
      linkedWorkStep: 'Working at heights / Installation of flooring / Installation of trusses',
      requiredPermit: '',
      relatedSwms: 'Working at Heights',
    },
    {
      id: 'h2',
      category: 'Work in an area with movement of powered mobile plant',
      whyApplies: 'Crane lifts for sheet flooring, walls and trusses',
      linkedWorkStep: 'Materials handling / Installation of trusses',
      requiredPermit: '',
      relatedSwms: 'Moving Powered Plant / Delivery Loading Unloading',
    },
    {
      id: 'h3',
      category: 'Crystalline Silica (RCS) exposure',
      whyApplies: 'Possible cutting or grinding of cement sheeting or concrete products',
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
      mandatoryControls: 'Progressive solid work platform for flooring. Void platforms in place before flooring. No walking external top plate without fall protection. Scaffolding or work platform with guardrail required where façade >3.4 m. Industrial ladders only (minimum 5-step), secured top or bottom. Clear fall zone. Prefer trestles or platforms over ladders.',
      verificationMethod: 'Pre-start inspection of platforms, voids and edge protection',
      responsibleRole: 'Supervisor / All Workers',
      flags: ['critical', 'mandatory'],
    },
    {
      id: 'cc2',
      criticalRisk: 'Unintended nail gun discharge',
      possibleOutcome: 'Penetrating injury',
      mandatoryControls: 'Bump-fire mode only permitted for flooring. Trigger lock activated when gun not in use. Airline or battery removed for maintenance or when moving between zones. Safety glasses worn when operating, reloading or servicing.',
      verificationMethod: 'Pre-use check of mode and lock',
      responsibleRole: 'Operator',
      flags: ['critical', 'mandatory'],
    },
    {
      id: 'cc3',
      criticalRisk: 'Collapse or uncontrolled movement of wall frames / trusses',
      possibleOutcome: 'Crush injury or fall',
      mandatoryControls: 'Install cleats as bottom plate anchors. Window guarding and temporary bracing installed. All persons stay behind frame when lifting. Minimum bracing at each window and maximum 3 m spacing. Crane lift sheet flooring, upper walls and trusses. Do not double-stack sheet flooring packs. Adequate bracing before release of crane.',
      verificationMethod: 'Supervisor check of bracing before crane release',
      responsibleRole: 'Supervisor / Leading Hand',
      flags: ['critical', 'mandatory'],
    },
    {
      id: 'cc4',
      criticalRisk: 'Silica / dust exposure',
      possibleOutcome: 'Respiratory disease',
      mandatoryControls: 'P2 dust mask + dust extraction preferred for cement sheeting or silica materials. Refer to manufacturer SDS. Wet methods where practicable. Complete silica statement if applicable.',
      verificationMethod: 'Dust control check',
      responsibleRole: 'All Workers',
      flags: ['mandatory'],
    },
  ],
  plantItems: [
    {
      id: 'p1',
      item: 'Air Nail Gun',
      requirement: 'Sequential / bump-fire as authorised only, trigger lock, safety glasses',
      inspectionRequired: 'Yes – before each use',
      notes: 'Bump fire restricted to flooring only',
    },
    {
      id: 'p2',
      item: 'Circular Saw / Power Tools',
      requirement: 'Guards operational, correct blades, competent operators',
      inspectionRequired: 'Yes – before each use',
      notes: 'Do not use on ladders – use trestles or platform',
    },
    {
      id: 'p3',
      item: 'Crane / Lifting Equipment',
      requirement: 'Competent dogman/rigger, exclusion zone, tag lines as required',
      inspectionRequired: 'Yes – lift plan',
      notes: 'Used for flooring packs, walls and trusses',
    },
  ],
  ppeRows: [
    { item: 'Safety helmet', requirement: 'At all times on site' },
    { item: 'Steel-capped safety boots', requirement: 'At all times on site' },
    { item: 'Hi-vis long-sleeve clothing', requirement: 'At all times on site' },
    { item: 'Safety glasses / goggles', requirement: 'When using power tools or nail guns' },
    { item: 'Hearing protection', requirement: 'When using power tools or nail guns' },
    { item: 'Task-specific gloves', requirement: 'When handling materials or tools' },
    { item: 'P2 dust mask', requirement: 'When cutting cement sheeting or generating dust' },
    { item: 'Safety harness + lanyard', requirement: 'When working at heights where fall protection cannot be eliminated' },
    { item: 'Sunscreen + hat', requirement: 'Outdoor work' },
  ],
  workSteps: [
    {
      id: 's1',
      sequenceNumber: 1,
      sequenceOfWork: 'Toolbox Talk & Pre-start',
      hazardsAndRisks: 'Workers unaware of risks, unfit for duty, weather, apprentices',
      possibleConsequence: 'Injury, poor decisions',
      initialRisk: 'high',
      controlMeasures: 'Stop-Plan-Do. Fitness check. Review emergency process. Adequate supervision for apprentices/young workers. All workers sign onto SWMS. Discuss wind, heat and contingency.',
      residualRisk: 'low',
      responsiblePerson: 'Supervisor / All Workers',
      isCriticalControl: false,
      monitoringMethod: 'Daily pre-start',
      stopWorkTrigger: 'Unfit workers or missing supervision',
      linkedPermit: '',
      linkedSwms: '',
      evidenceRequired: 'Signed SWMS',
      notes: '',
    },
    {
      id: 's2',
      sequenceNumber: 2,
      sequenceOfWork: 'Pre-operational equipment checks',
      hazardsAndRisks: 'Faulty tools, untagged leads, missing guards, bump-fire enabled incorrectly',
      possibleConsequence: 'Electrocution, laceration, nail injury',
      initialRisk: 'high',
      controlMeasures: 'All electrical equipment current test & tag. Tools in good condition. Guards fitted. Bump-fire disabled except for flooring. Lead stands used. PPE serviceable. Manufacturer instructions followed.',
      residualRisk: 'low',
      responsiblePerson: 'All Workers',
      isCriticalControl: true,
      monitoringMethod: 'Visual + checklist',
      stopWorkTrigger: 'Defective equipment',
      linkedPermit: '',
      linkedSwms: 'Use of Power Tools',
      evidenceRequired: 'Pre-start checklist',
      notes: '',
    },
    {
      id: 's3',
      sequenceNumber: 3,
      sequenceOfWork: 'Manage work zone & materials layout',
      hazardsAndRisks: 'Trips, slips, crushing, materials within 2 m of live edge, other trades',
      possibleConsequence: 'Injury, fall',
      initialRisk: 'high',
      controlMeasures: 'Communicate with other trades. Clear pathways. Barricade drop zones. Materials not placed within 2.0 m of live edge without fall protection. Site trade-ready. Coordinate with supervisor.',
      residualRisk: 'low',
      responsiblePerson: 'Supervisor / All Workers',
      isCriticalControl: false,
      monitoringMethod: 'Ongoing visual',
      stopWorkTrigger: 'Blocked access or materials near edge',
      linkedPermit: '',
      linkedSwms: '',
      evidenceRequired: '',
      notes: '',
    },
    {
      id: 's4',
      sequenceNumber: 4,
      sequenceOfWork: 'Materials handling & crane lifts',
      hazardsAndRisks: 'Strain, sprain, crush, falling materials, crane interaction',
      possibleConsequence: 'Musculoskeletal or crush injury',
      initialRisk: 'high',
      controlMeasures: 'Plan clear path. Correct lifting technique. Team lift awkward items. Crane for sheet flooring, upper walls and trusses. Do not double-stack sheet flooring packs. Adequate bracing in place. Exclusion zone during lifts.',
      residualRisk: 'low',
      responsiblePerson: 'All Workers + Crane Operator',
      isCriticalControl: true,
      monitoringMethod: 'Spotter + supervisor',
      stopWorkTrigger: 'Unstable load or high wind',
      linkedPermit: '',
      linkedSwms: 'Manual Handling and Housekeeping, Delivery Loading Unloading',
      evidenceRequired: 'Lift plan if required',
      notes: 'Avoid lifting walls or trusses on high wind days',
    },
    {
      id: 's5',
      sequenceNumber: 5,
      sequenceOfWork: 'Air nail gun use',
      hazardsAndRisks: 'Unintended discharge into person, piercing injury',
      possibleConsequence: 'Penetrating wound',
      initialRisk: 'high',
      controlMeasures: 'Bump-fire only for flooring. Trigger lock when not in use. Airline/battery removed for maintenance or zone change. Safety glasses always. Keep others clear of line of fire.',
      residualRisk: 'low',
      responsiblePerson: 'Operator',
      isCriticalControl: true,
      monitoringMethod: 'Pre-use check',
      stopWorkTrigger: 'Wrong mode or persons in line of fire',
      linkedPermit: '',
      linkedSwms: 'Use of Power Tools',
      evidenceRequired: '',
      notes: '',
    },
    {
      id: 's6',
      sequenceNumber: 6,
      sequenceOfWork: 'Installation of flooring',
      hazardsAndRisks: 'Falls through voids, nail discharge, manual handling',
      possibleConsequence: 'Fall, injury',
      initialRisk: 'extreme',
      controlMeasures: 'Lay flooring to create progressive solid work platform extending to outer perimeter. Void platform must be in place and not altered. Flooring checked out around cross bars. Safety glasses for nailing.',
      residualRisk: 'low',
      responsiblePerson: 'All Workers + Supervisor',
      isCriticalControl: true,
      monitoringMethod: 'Progressive inspection of platform',
      stopWorkTrigger: 'Missing void protection or unstable platform',
      linkedPermit: '',
      linkedSwms: 'Working at Heights',
      evidenceRequired: '',
      notes: '',
    },
    {
      id: 's7',
      sequenceNumber: 7,
      sequenceOfWork: 'Installation of external wall frames',
      hazardsAndRisks: 'Falls, frame collapse, nail injury, manual handling',
      possibleConsequence: 'Crush or fall injury',
      initialRisk: 'extreme',
      controlMeasures: 'Install cleats in floor joists as bottom plate anchors. Window guarding and brace points installed. All persons stay behind frame when lifting into position. Temporary bracing anchored immediately. Minimum bracing at each window and max 3 m from intersecting wall.',
      residualRisk: 'low',
      responsiblePerson: 'Supervisor / Framing Crew',
      isCriticalControl: true,
      monitoringMethod: 'Bracing check before release',
      stopWorkTrigger: 'Insufficient bracing or high wind',
      linkedPermit: '',
      linkedSwms: 'Working at Heights',
      evidenceRequired: '',
      notes: '',
    },
    {
      id: 's8',
      sequenceNumber: 8,
      sequenceOfWork: 'Installation of trusses',
      hazardsAndRisks: 'Falls, truss collapse, manual handling, crane interaction',
      possibleConsequence: 'Serious injury or fatality',
      initialRisk: 'extreme',
      controlMeasures: 'Truss pack crane-lifted onto load-bearing points. One person on trestle or internal wall plate + two persons manoeuvring trusses flat and overlapping for fall protection. Stand outer/main truss first, then sequential. Three workers: two with push sticks at ground level, one securing. Follow Fall Prevention Code of Practice.',
      residualRisk: 'low',
      responsiblePerson: 'Supervisor / Framing Crew + Crane',
      isCriticalControl: true,
      monitoringMethod: 'Supervisor observation + bracing',
      stopWorkTrigger: 'Unstable trusses, high wind or missing fall protection',
      linkedPermit: '',
      linkedSwms: 'Working at Heights, Moving Powered Plant',
      evidenceRequired: 'Bracing confirmation',
      notes: '',
    },
    {
      id: 's9',
      sequenceNumber: 9,
      sequenceOfWork: 'Working at heights (general)',
      hazardsAndRisks: 'Fall from height, falling objects',
      possibleConsequence: 'Serious injury or fatality',
      initialRisk: 'extreme',
      controlMeasures: 'Clear fall zone. Secure stable scaffolding/trestles/walking boards. Ladders industrial-rated, min 5-step, secured, not top two rungs. No three-step ladders. Work platform with guardrail where single-storey façade >3.4 m. No walking external top plate without fall protection.',
      residualRisk: 'low',
      responsiblePerson: 'All Workers + Supervisor',
      isCriticalControl: true,
      monitoringMethod: 'Access equipment inspection',
      stopWorkTrigger: 'Unstable access or missing edge protection',
      linkedPermit: '',
      linkedSwms: 'Working at Heights',
      evidenceRequired: '',
      notes: '',
    },
    {
      id: 's10',
      sequenceNumber: 10,
      sequenceOfWork: 'Spoils management & clean-up',
      hazardsAndRisks: 'Trips, slips, manual handling, unsecured materials',
      possibleConsequence: 'Injury, security risk',
      initialRisk: 'medium',
      controlMeasures: 'Progressive clean-up of spoils into cage/bins. Lightweight waste bagged. Spoils outside fall zones. Gates closed. Area left tidy and secure.',
      residualRisk: 'low',
      responsiblePerson: 'All Workers',
      isCriticalControl: false,
      monitoringMethod: 'End-of-day inspection',
      stopWorkTrigger: 'Uncontrolled waste or blocked egress',
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
      description: 'Barricade drop zones and keep non-essential workers clear during framing and crane lifts',
    },
    {
      id: 'tr2',
      type: 'Plant separation requirements',
      description: 'Exclusion zone and spotter during crane lifts of flooring, walls and trusses',
    },
    {
      id: 'tr3',
      type: 'Dust-control requirements',
      description: 'P2 mask + extraction preferred for cement sheeting; complete silica statement if required',
    },
  ],
  envControls: [
    {
      type: 'Housekeeping',
      description: 'Progressive clean-up of offcuts and spoils. Keep access ways and fall zones clear.',
      responsiblePerson: 'All Workers',
    },
    {
      type: 'Waste',
      description: 'Lightweight waste into bins/cages. Spoils managed so they do not enter drains or leave site.',
      responsiblePerson: 'All Workers',
    },
    {
      type: 'Dust',
      description: 'Minimise dust. Use extraction or wet methods where practicable.',
      responsiblePerson: 'Supervisor',
    },
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
    { requirement: 'Dogging / Rigging (if crane lifts)', applies: true, evidenceOrAuth: 'As required for lifts' },
    { requirement: 'Plant competency / VOC', applies: false, evidenceOrAuth: '' },
    { requirement: 'First aid', applies: false, evidenceOrAuth: '' },
    { requirement: 'Respirator fit testing', applies: false, evidenceOrAuth: 'If tight-fitting respirator required' },
  ],
  definitions: [
    {
      id: 'd1',
      term: 'Bump fire',
      definition: 'Contact-trip mode that discharges nail on contact without full trigger pull – restricted to flooring only',
    },
    {
      id: 'd2',
      term: 'Progressive solid work platform',
      definition: 'Flooring laid so workers always stand on a completed solid platform that extends to the outer perimeter',
    },
  ],
  relatedDocs: [
    { id: 'rd1', type: 'Related SWMS', document: 'Manual Handling and Housekeeping', revision: 'Current', status: 'current' },
    { id: 'rd2', type: 'Related SWMS', document: 'Use of Power Tools', revision: 'Current', status: 'current' },
    { id: 'rd3', type: 'Related SWMS', document: 'Silica Dust Exposure', revision: 'Current', status: 'current' },
    { id: 'rd4', type: 'Related SWMS', document: 'Working at Heights', revision: 'Current', status: 'current' },
    { id: 'rd5', type: 'Related SWMS', document: 'Moving Powered Plant', revision: 'Current', status: 'current' },
    { id: 'rd6', type: 'Other', document: 'High Risk Crystalline Silica Statement (Appendix 1)', revision: '2024', status: 'current' },
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
    const title = CARPENTER_FRAMING_SWMS.title;
    const swmsBodyJson = JSON.stringify(CARPENTER_FRAMING_SWMS);
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
