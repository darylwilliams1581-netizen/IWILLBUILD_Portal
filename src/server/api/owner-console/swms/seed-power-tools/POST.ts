/**
 * POST /api/owner-console/swms/seed-power-tools
 * Pushes the "Use of Power Tools" SWMS to all active companies.
 * Platform owner only. Add ?replace=1 to overwrite existing records.
 */
import type { Request, Response } from 'express';
import { db } from '../../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getPlatformOwnerInfo } from '../../../../lib/platform-owner-guard.js';

const SWMS_DATA = {
  buildMode: 'advanced',
  documentType: 'swms',
  title: 'Use of Power Tools',
  category: 'Power Tools / Plant & Equipment',
  revisionNumber: '1',
  reviewDate: '2026-07-13',
  authorName: 'Site Supervisor',
  approvedByName: 'Principal Contractor',
  status: 'draft',
  purpose:
    'This Safe Work Method Statement sets out the hazards, risks and control measures for the use of portable power tools and small powered equipment. It aims to eliminate or minimise risks of electric shock, laceration, flying particles, dust, noise, vibration and fire so far as is reasonably practicable.',
  scope:
    'Applies to all workers using, assisting with, inspecting, maintaining or working near portable power tools and small powered equipment including grinders, saws, drills, nail guns, sanders, routers, generators and battery tools. Includes planning, pre-start, inspection, operation, changing accessories, clean-up and pack-up.',
  includedActivities: [
    'Planning, preparation and competency verification',
    'Pre-start and consultation',
    'Pre-use inspection of tools and leads',
    'Work zone setup and exclusion zones',
    'Electrical safety and RCD protection',
    'Changing blades, discs, bits and accessories',
    'Operation of grinders, saws, drills and nail guns',
    'Dust, silica and fume controls',
    'Noise and vibration management',
    'Battery tool and charger safety',
    'Hot work and spark control',
    'Task observation and monitoring',
    'Clean-up and pack-up',
  ],
  excludedActivities: [
    'Use of 9-inch grinders without specific work permit and controls',
    'Hot work without hot work permit where required',
    'Operation of tools by untrained or non-competent persons',
  ],
  workBoundaries:
    'Site-specific work areas only. Coordinate with principal contractor for access and other trades. Stop work immediately if controls cannot be maintained or conditions change.',
  hrcwApplies: 'yes',
  hrcwCategories: [
    {
      id: 'h1',
      category: 'Work on or near energised electrical installations or services',
      whyApplies: 'Power tools may be used near electrical services or in wet conditions',
      linkedWorkStep: 'Electrical safety and RCD protection',
      requiredPermit: '',
      relatedSwms: 'Working On or Near Exposed Live Parts',
    },
    {
      id: 'h2',
      category: 'Crystalline Silica (RCS) exposure',
      whyApplies: 'Cutting, grinding or drilling materials that contain crystalline silica',
      linkedWorkStep: 'Dust, silica and fume controls',
      requiredPermit: 'Silica statement (Appendix 1) if applicable',
      relatedSwms: 'Silica Dust Exposure',
    },
    {
      id: 'h3',
      category: 'Work in an area with movement of powered mobile plant',
      whyApplies: 'Possible plant interaction during tool use or materials handling',
      linkedWorkStep: 'Work zone setup',
      requiredPermit: '',
      relatedSwms: 'Moving Powered Plant',
    },
    {
      id: 'h4',
      category: 'Risk of a person falling more than 2 metres',
      whyApplies: 'Power tools may be used at height or near edges',
      linkedWorkStep: 'Operation of tools at height',
      requiredPermit: '',
      relatedSwms: 'Working at Heights',
    },
  ],
  criticalControls: [
    {
      id: 'cc1',
      criticalRisk: 'Electric shock / electrocution',
      possibleOutcome: 'Shock, burns, electrocution or fatality',
      mandatoryControls:
        'Use only tested and tagged electrical equipment. Inspect leads and tools before every use. Use RCD protection. Keep tools and leads dry and protected from damage. Remove damaged tools from service immediately. Prefer battery-powered tools where practicable.',
      verificationMethod: 'Pre-use inspection + test & tag currency check',
      responsibleRole: 'All Workers / Supervisor',
      flags: ['critical', 'mandatory'],
    },
    {
      id: 'cc2',
      criticalRisk: 'Contact with moving parts / blades / discs',
      possibleOutcome: 'Cuts, amputations, lacerations or entanglement',
      mandatoryControls:
        'Guards fitted and operational at all times. Keep hands and body clear of rotating parts. Secure workpiece. Do not bypass safety devices. Isolate power / remove battery before changing blades, discs or bits. Never leave a running tool unattended.',
      verificationMethod: 'Pre-use guard and safety device check',
      responsibleRole: 'Operator',
      flags: ['critical', 'mandatory'],
    },
    {
      id: 'cc3',
      criticalRisk: 'Flying particles / projectiles / disc failure',
      possibleOutcome: 'Eye injury, facial injury or cuts',
      mandatoryControls:
        'Wear medium-impact eye protection (face shield for grinding/cutting). Use correct disc/blade for the material and speed rating. Inspect accessories for cracks or damage before use. Establish exclusion zones where projectiles are possible. Never force a tool.',
      verificationMethod: 'PPE check + accessory inspection',
      responsibleRole: 'Operator / All Workers',
      flags: ['critical', 'mandatory'],
    },
    {
      id: 'cc4',
      criticalRisk: 'Dust and silica exposure',
      possibleOutcome: 'Respiratory illness or long-term lung disease',
      mandatoryControls:
        'Use wet cutting, on-tool dust extraction or HEPA vacuum where required. Wear P2/P3 respirator where dust is not fully controlled. Follow Silica Dust Exposure SWMS. No dry sweeping of silica dust.',
      verificationMethod: 'Dust control equipment + respirator check',
      responsibleRole: 'Operator / Supervisor',
      flags: ['critical', 'mandatory'],
    },
    {
      id: 'cc5',
      criticalRisk: 'Noise, vibration and fire',
      possibleOutcome: 'Hearing loss, hand-arm vibration, burns or fire',
      mandatoryControls:
        'Hearing protection mandatory for noisy tools. Limit exposure time and rotate tasks. Maintain tools and select low-vibration equipment where practicable. Hot work permit where required. Fire extinguisher available. Remove flammable materials from spark path.',
      verificationMethod: 'PPE and fire control check',
      responsibleRole: 'Operator / Supervisor',
      flags: ['critical'],
    },
  ],
  plantItems: [
    {
      id: 'p1',
      item: 'Angle grinders, cut-off saws, circular saws, drills, nail guns, sanders, routers',
      requirement: 'Guards operational, correct accessories, competent operators, current test & tag',
      inspectionRequired: 'Yes – before each use',
      notes: '9-inch grinders require work permit',
    },
    {
      id: 'p2',
      item: 'Generators and extension leads',
      requirement: 'Tested & tagged, RCD protected, leads elevated or protected',
      inspectionRequired: 'Yes – before each use',
      notes: 'Keep dry and clear of traffic',
    },
    {
      id: 'p3',
      item: 'Battery tools and chargers',
      requirement: 'Manufacturer approved batteries and chargers only',
      inspectionRequired: 'Yes – inspect for damage/swelling before use',
      notes: 'Do not charge in direct sun, wet areas or near flammables',
    },
  ],
  ppeRows: [
    { item: 'Safety helmet', requirement: 'At all times on site and where overhead or falling-object hazards exist' },
    { item: 'Steel-capped safety boots', requirement: 'At all times on site' },
    { item: 'Hi-vis long-sleeve cotton clothing', requirement: 'At all times on site' },
    {
      item: 'Medium impact eye protection / face shield',
      requirement: 'Mandatory when using or working near power tools – face shield for grinding/cutting',
    },
    { item: 'Hearing protection', requirement: 'When using noisy tools or working near noisy equipment' },
    {
      item: 'Task-specific gloves',
      requirement: 'Where safe for task – do not wear loose gloves near rotating equipment',
    },
    { item: 'P2 / P3 respirator', requirement: 'Where dust, silica or fumes are not adequately controlled' },
    { item: 'UV protection and sunscreen', requirement: 'Outdoor works' },
  ],
  workSteps: [
    {
      id: 's1',
      sequenceNumber: 1,
      sequenceOfWork: 'Planning, preparation and competency verification',
      hazardsAndRisks: 'Untrained operators; incorrect tool selection; missing permits',
      possibleConsequence: 'Injury, non-compliance',
      initialRisk: 'high',
      controlMeasures:
        'All workers hold current construction induction and site induction. Confirm competency for the specific tools to be used. Review related SWMS for silica, electrical, heights and plant. Confirm hot work permit if required. Select the correct tool and accessory for the task.',
      residualRisk: 'low',
      responsiblePerson: 'Supervisor',
      isCriticalControl: true,
      monitoringMethod: 'Competency and permit check',
      stopWorkTrigger: 'Missing competency or unsuitable tool',
      linkedPermit: 'Hot work / 9-inch grinder permit if required',
      linkedSwms: 'Silica Dust Exposure, Working On or Near Exposed Live Parts',
      evidenceRequired: 'Competency records',
      notes: '',
    },
    {
      id: 's2',
      sequenceNumber: 2,
      sequenceOfWork: 'Pre-start and consultation',
      hazardsAndRisks: 'Poor communication; unclear exclusion zones; changed conditions',
      possibleConsequence: 'Injury, uncontrolled tool use',
      initialRisk: 'medium',
      controlMeasures:
        'Daily pre-start covering tools to be used, exclusion zones, dust controls, electrical hazards, noise and emergency response. Confirm who is operating tools and supervising. All workers sign onto this SWMS.',
      residualRisk: 'low',
      responsiblePerson: 'Supervisor / All Workers',
      isCriticalControl: false,
      monitoringMethod: 'Daily pre-start attendance',
      stopWorkTrigger: 'Incomplete briefing',
      linkedPermit: '',
      linkedSwms: '',
      evidenceRequired: 'Signed SWMS and pre-start record',
      notes: '',
    },
    {
      id: 's3',
      sequenceNumber: 3,
      sequenceOfWork: 'Pre-use inspection of tools, leads and accessories',
      hazardsAndRisks: 'Faulty tools; damaged leads; cracked discs; missing guards',
      possibleConsequence: 'Electric shock, laceration, projectile injury',
      initialRisk: 'high',
      controlMeasures:
        'Inspect every tool, lead, plug, switch, guard and accessory before use. Check test & tag currency. Check discs/blades for cracks, correct rating and correct mounting. Remove damaged or untagged equipment from service immediately. Prefer battery tools where practicable.',
      residualRisk: 'low',
      responsiblePerson: 'Operator',
      isCriticalControl: true,
      monitoringMethod: 'Visual and functional pre-use check',
      stopWorkTrigger: 'Any defective tool, lead or accessory',
      linkedPermit: '',
      linkedSwms: '',
      evidenceRequired: 'Pre-use inspection',
      notes: '',
    },
    {
      id: 's4',
      sequenceNumber: 4,
      sequenceOfWork: 'Work zone setup and exclusion zones',
      hazardsAndRisks: 'Flying particles; other workers entering line of fire; trip hazards from leads',
      possibleConsequence: 'Eye injury, laceration, trip injury',
      initialRisk: 'high',
      controlMeasures:
        'Establish exclusion zones for grinding, cutting and nail gun use. Keep non-essential persons clear. Elevate or protect leads with stands or covers. Keep work area clear of trip hazards, flammable materials and wet surfaces. Good lighting required.',
      residualRisk: 'low',
      responsiblePerson: 'Operator / Supervisor',
      isCriticalControl: true,
      monitoringMethod: 'Visual exclusion zone confirmation',
      stopWorkTrigger: 'Persons in line of fire or uncontrolled leads',
      linkedPermit: '',
      linkedSwms: '',
      evidenceRequired: '',
      notes: '',
    },
    {
      id: 's5',
      sequenceNumber: 5,
      sequenceOfWork: 'Electrical safety, RCD protection and wet conditions',
      hazardsAndRisks: 'Electric shock from damaged leads, wet conditions or faulty tools',
      possibleConsequence: 'Electrocution',
      initialRisk: 'extreme',
      controlMeasures:
        'Use RCD protection on all mains-powered tools. Keep tools and leads dry. Do not use electrical tools in wet conditions unless specifically controlled and suitable. Protect leads from sharp edges, vehicle traffic and water. Use lead stands. Battery tools preferred in wet or high-risk electrical environments.',
      residualRisk: 'low',
      responsiblePerson: 'Operator / Supervisor',
      isCriticalControl: true,
      monitoringMethod: 'RCD and lead condition check',
      stopWorkTrigger: 'Wet conditions without controls or damaged leads',
      linkedPermit: '',
      linkedSwms: 'Working On or Near Exposed Live Parts',
      evidenceRequired: '',
      notes: '',
    },
    {
      id: 's6',
      sequenceNumber: 6,
      sequenceOfWork: 'Changing blades, discs, bits and accessories',
      hazardsAndRisks: 'Contact with rotating parts; incorrect accessory; residual energy',
      possibleConsequence: 'Laceration, disc failure',
      initialRisk: 'high',
      controlMeasures:
        'Isolate power or remove battery before changing any accessory. Allow rotating parts to stop completely. Use correct tool and method for changing accessories. Fit correct rated disc/blade for the material and tool speed. Re-fit guards before restarting. Inspect new accessory for damage.',
      residualRisk: 'low',
      responsiblePerson: 'Operator',
      isCriticalControl: true,
      monitoringMethod: 'Isolation confirmation before accessory change',
      stopWorkTrigger: 'Guards not re-fitted or incorrect accessory',
      linkedPermit: '',
      linkedSwms: '',
      evidenceRequired: '',
      notes: '',
    },
    {
      id: 's7',
      sequenceNumber: 7,
      sequenceOfWork: 'Operation of grinders, saws, drills, nail guns and other power tools',
      hazardsAndRisks: 'Kickback; uncontrolled tool movement; flying particles; nail gun discharge; dust',
      possibleConsequence: 'Laceration, eye injury, penetrating injury, respiratory exposure',
      initialRisk: 'extreme',
      controlMeasures:
        'Competent operators only. Secure workpiece. Maintain firm grip and balanced stance. Use two hands where designed. Never force the tool. Keep guards in place. For nail guns: sequential trigger preferred; bump-fire only where authorised; trigger lock when not in use; never point at people. Dust controls (wet or extraction) operating. Eye, hearing and respiratory protection worn. Exclusion zone maintained.',
      residualRisk: 'low',
      responsiblePerson: 'Operator',
      isCriticalControl: true,
      monitoringMethod: 'Continuous observation of safe technique and controls',
      stopWorkTrigger: 'Uncontrolled dust, missing PPE, or persons in exclusion zone',
      linkedPermit: '',
      linkedSwms: 'Silica Dust Exposure, Manual Handling and Housekeeping',
      evidenceRequired: 'Competency confirmation',
      notes: '',
    },
    {
      id: 's8',
      sequenceNumber: 8,
      sequenceOfWork: 'Battery tool and charger safety + hot work / spark control',
      hazardsAndRisks: 'Battery fire; overheating; chemical exposure; sparks igniting flammables',
      possibleConsequence: 'Burns, fire, chemical injury',
      initialRisk: 'high',
      controlMeasures:
        'Use only manufacturer-approved batteries and chargers. Inspect batteries for cracks, swelling, overheating or leakage before use. Do not charge in direct sun, wet areas or near flammable materials. For hot work or spark-producing tools: hot work permit where required; remove flammable materials; fire extinguisher available; fire watch if specified.',
      residualRisk: 'low',
      responsiblePerson: 'Operator / Supervisor',
      isCriticalControl: true,
      monitoringMethod: 'Battery inspection + hot work controls',
      stopWorkTrigger: 'Damaged battery or uncontrolled sparks near flammables',
      linkedPermit: 'Hot work permit if required',
      linkedSwms: '',
      evidenceRequired: '',
      notes: '',
    },
    {
      id: 's9',
      sequenceNumber: 9,
      sequenceOfWork: 'Task observation, clean-up and pack-up',
      hazardsAndRisks: 'Residual dust; damaged tools left in service; trip hazards; incomplete clean-up',
      possibleConsequence: 'Secondary injury or exposure',
      initialRisk: 'medium',
      controlMeasures:
        'Supervisor monitors tool use and controls. Stop work if any control fails. Clean tools and work area. Vacuum (not dry sweep) silica dust. Remove and quarantine damaged tools. Secure leads and battery tools. Dispose of used discs, blades and waste correctly. Final inspection of work area. Report any defects or near misses.',
      residualRisk: 'low',
      responsiblePerson: 'Supervisor / All Workers',
      isCriticalControl: false,
      monitoringMethod: 'Ongoing observation + end-of-shift inspection',
      stopWorkTrigger: 'Uncontrolled residual hazards',
      linkedPermit: '',
      linkedSwms: 'Manual Handling and Housekeeping, Silica Dust Exposure',
      evidenceRequired: 'Defect reports if any',
      notes: '',
    },
  ],
  taskRequirements: [
    {
      id: 'tr1',
      type: 'Dust-control requirements',
      description:
        'Wet methods or on-tool extraction mandatory for silica-generating tasks. P2/P3 respirator where dust not fully controlled. Complete silica statement if applicable.',
    },
    {
      id: 'tr2',
      type: 'Exclusion-zone requirements',
      description:
        'Establish exclusion zones for grinding, cutting and nail-gun work. Keep non-essential persons clear of line of fire.',
    },
    {
      id: 'tr3',
      type: 'Permit requirements',
      description: 'Hot work permit and/or 9-inch grinder permit required where applicable.',
    },
  ],
  envControls: [
    {
      type: 'Housekeeping',
      description: 'Progressive clean-up. Keep access ways clear of leads, offcuts and tools.',
      responsiblePerson: 'All Workers',
    },
    {
      type: 'Waste',
      description: 'Dispose of used discs, blades and contaminated waste correctly. No dry sweeping of silica dust.',
      responsiblePerson: 'All Workers',
    },
    {
      type: 'Dust',
      description: 'Minimise dust at source. Wet methods or extraction preferred. Vacuum clean-up.',
      responsiblePerson: 'Supervisor',
    },
    {
      type: 'Fire prevention',
      description:
        'Remove flammables from spark path. Fire extinguisher available for hot work or spark-producing tasks.',
      responsiblePerson: 'Supervisor',
    },
  ],
  emergencyActions: [
    { id: 'e1', action: 'Stop work immediately' },
    { id: 'e2', action: 'Make the area safe if it is safe to do so (isolate power / remove battery)' },
    { id: 'e3', action: 'Provide first aid / call 000 for serious injury, electric shock or eye injury' },
    {
      id: 'e4',
      action: 'For electric shock – do not touch the person until power is isolated and area confirmed safe',
    },
    { id: 'e5', action: 'Notify Site Supervisor and principal contractor immediately' },
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
      requirement: 'Power tool competency',
      applies: true,
      evidenceOrAuth: 'Trained/supervised for tools used',
    },
    {
      requirement: 'Silica awareness / respirator use',
      applies: true,
      evidenceOrAuth: 'Where silica dust is generated',
    },
    {
      requirement: 'Hot work competency',
      applies: false,
      evidenceOrAuth: 'Where hot work permit is required',
    },
    { requirement: 'First aid', applies: false, evidenceOrAuth: '' },
  ],
  definitions: [
    {
      id: 'd1',
      term: 'RCD',
      definition:
        'Residual Current Device – safety device that quickly switches off power when it detects earth leakage, reducing electric shock risk',
    },
    {
      id: 'd2',
      term: 'Sequential trigger (nail gun)',
      definition:
        'Nail gun mode that requires the trigger to be depressed before the contact tip is pressed – preferred safer mode',
    },
  ],
  relatedDocs: [
    { id: 'rd1', type: 'Related SWMS', document: 'Silica Dust Exposure', revision: 'Current', status: 'current' },
    {
      id: 'rd2',
      type: 'Related SWMS',
      document: 'Manual Handling and Housekeeping',
      revision: 'Current',
      status: 'current',
    },
    {
      id: 'rd3',
      type: 'Related SWMS',
      document: 'Working On or Near Exposed Live Parts',
      revision: 'Current',
      status: 'current',
    },
    { id: 'rd4', type: 'Related SWMS', document: 'Working at Heights', revision: 'Current', status: 'current' },
    { id: 'rd5', type: 'Related SWMS', document: 'Moving Powered Plant', revision: 'Current', status: 'current' },
    {
      id: 'rd6',
      type: 'Other',
      document: 'High Risk Crystalline Silica Statement (Appendix 1)',
      revision: '2024',
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
      'I confirm this SWMS has been explained to all workers and the documented precautions, controls and work methods will be complied with.',
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
