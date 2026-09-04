/**
 * POST /api/owner-console/swms/seed-silica-dust
 * Pushes the "Silica Dust Exposure" SWMS to all active companies.
 * Platform owner only. Add ?replace=1 to overwrite existing records.
 */
import type { Request, Response } from 'express';
import { db } from '../../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getPlatformOwnerInfo } from '../../../../lib/platform-owner-guard.js';

const SWMS_DATA = {
  buildMode: 'advanced',
  documentType: 'swms',
  title: 'Silica Dust Exposure',
  category: 'Dust / Crystalline Silica / Respiratory Health',
  revisionNumber: '1',
  reviewDate: '2026-07-13',
  authorName: 'Site Supervisor',
  approvedByName: 'Principal Contractor',
  status: 'draft',
  purpose:
    'This Safe Work Method Statement identifies the hazards, risks and control measures for work that may generate respirable crystalline silica (RCS) dust. It aims to eliminate or minimise the risk of silicosis, lung disease and other health effects so far as is reasonably practicable.',
  scope:
    'Applies to all workers undertaking cutting, grinding, drilling, polishing, demolition, excavation or any activity that may generate crystalline silica dust from concrete, masonry, brick, pavers, stone, engineered stone, fibre-cement, mortar or similar materials. Includes planning, wet methods, extraction, PPE, monitoring, housekeeping and clean-up.',
  includedActivities: [
    'Planning, preparation and competency verification',
    'Pre-start and consultation',
    'Identification of silica-containing materials',
    'Selection and verification of dust controls',
    'Wet methods / water suppression',
    'On-tool extraction and vacuum systems',
    'Respiratory protection (P2 / higher)',
    'Work zone isolation and exclusion zones',
    'Cutting, grinding, drilling and power tool use',
    'Housekeeping and vacuum clean-up',
    'Health monitoring and exposure assessment',
    'Task observation and monitoring',
    'Completion and clean-up',
  ],
  excludedActivities: [
    'Dry cutting of high-silica materials without approved engineering controls',
    'Work with engineered stone without full compliance to high-risk silica requirements',
  ],
  workBoundaries:
    'Site-specific work areas only. Coordinate with principal contractor for access and other trades. Stop work immediately if dust controls cannot be maintained or conditions change.',
  hrcwApplies: 'yes',
  hrcwCategories: [
    {
      id: 'h1',
      category: 'Crystalline Silica (RCS) exposure',
      whyApplies: 'Cutting, grinding, drilling or processing of materials containing crystalline silica',
      linkedWorkStep: 'Cutting, grinding, drilling and power tool use',
      requiredPermit: 'Silica statement (Appendix 1) / High Risk Crystalline Silica Statement',
      relatedSwms: 'Use of Power Tools',
    },
    {
      id: 'h2',
      category: 'Work in an area with movement of powered mobile plant',
      whyApplies: 'Possible plant interaction during material handling or clean-up',
      linkedWorkStep: 'Work zone management',
      requiredPermit: '',
      relatedSwms: 'Moving Powered Plant',
    },
    {
      id: 'h3',
      category: 'Risk of a person falling more than 2 metres',
      whyApplies: 'Possible work at heights while generating dust',
      linkedWorkStep: 'Working at heights if applicable',
      requiredPermit: '',
      relatedSwms: 'Working at Heights',
    },
  ],
  criticalControls: [
    {
      id: 'cc1',
      criticalRisk: 'Respirable crystalline silica (RCS) dust inhalation',
      possibleOutcome: 'Silicosis, lung cancer, chronic obstructive pulmonary disease, death',
      mandatoryControls:
        'Eliminate dry cutting wherever reasonably practicable. Prefer wet methods or on-tool extraction with H-class or M-class vacuum. P2 (or higher) respirator mandatory for all dust-generating tasks. No dry sweeping or compressed air cleaning. Complete High Risk Crystalline Silica Statement (Appendix 1) for high-risk work.',
      verificationMethod: 'Dust control equipment check + respirator fit / condition + silica statement completed',
      responsibleRole: 'Supervisor / All Workers',
      flags: ['critical', 'mandatory'],
    },
    {
      id: 'cc2',
      criticalRisk: 'Failure of engineering controls (wet method or extraction)',
      possibleOutcome: 'Uncontrolled dust generation and high RCS exposure',
      mandatoryControls:
        'Water suppression systems must be operational and correctly directed. On-tool extraction systems must be H-class or M-class, filters clean and hoses free of blockages. Stop work immediately if water supply fails or extraction is not working. Do not continue with dry methods.',
      verificationMethod: 'Pre-use check of water supply / extraction system',
      responsibleRole: 'Operator / Supervisor',
      flags: ['critical', 'mandatory'],
    },
    {
      id: 'cc3',
      criticalRisk: 'Secondary dust exposure from poor housekeeping',
      possibleOutcome: 'Ongoing inhalation of settled silica dust',
      mandatoryControls:
        'Use industrial vacuum (H-class preferred) for clean-up. No dry sweeping or blowing with compressed air. Progressive clean-up of dust and slurry. Wet methods preferred for floor cleaning. Contaminated clothing must be managed to prevent take-home dust.',
      verificationMethod: 'End-of-task and end-of-shift inspection',
      responsibleRole: 'All Workers / Supervisor',
      flags: ['critical', 'mandatory'],
    },
    {
      id: 'cc4',
      criticalRisk: 'Inadequate respiratory protection',
      possibleOutcome: 'Breakthrough exposure leading to long-term lung disease',
      mandatoryControls:
        'P2 half-face respirator minimum for silica dust tasks (higher level or powered air if required by risk assessment or client). Workers must be clean-shaven where tight-fitting respirators are used. Fit testing preferred. Inspect and clean respirators daily. Replace filters as per manufacturer or when breathing resistance increases.',
      verificationMethod: 'Respirator inspection + fit check before use',
      responsibleRole: 'All Workers / Supervisor',
      flags: ['critical', 'mandatory'],
    },
  ],
  plantItems: [
    {
      id: 'p1',
      item: 'Angle grinders / cut-off saws / wall chasers / core drills / polishers',
      requirement: 'Guards operational, water suppression or on-tool extraction fitted and working, competent operators',
      inspectionRequired: 'Yes – before each use',
      notes: 'Prefer wet cutting or extraction; no dry cutting of high-silica materials without approved controls',
    },
    {
      id: 'p2',
      item: 'H-class or M-class industrial vacuum / on-tool extraction system',
      requirement: 'Filters clean and correctly fitted, hoses free of blockages, appropriate for silica',
      inspectionRequired: 'Yes – before each use',
      notes: 'H-class preferred for high-risk silica work',
    },
    {
      id: 'p3',
      item: 'Water suppression systems / hose attachments',
      requirement: 'Adequate water supply and flow directed at the cutting/grinding point',
      inspectionRequired: 'Yes – before each use',
      notes: 'Stop work if water supply fails',
    },
  ],
  ppeRows: [
    { item: 'Safety helmet', requirement: 'At all times on site' },
    { item: 'Steel-capped safety boots', requirement: 'At all times on site' },
    { item: 'Hi-vis long-sleeve clothing', requirement: 'At all times on site' },
    { item: 'Safety glasses / goggles', requirement: 'When generating dust or using power tools' },
    { item: 'Hearing protection', requirement: 'When using power tools' },
    { item: 'Task-specific gloves', requirement: 'When handling materials or tools' },
    {
      item: 'P2 (or higher) respirator',
      requirement: 'Mandatory for all silica dust-generating tasks – clean-shaven for tight-fitting, fit-checked before use',
    },
    { item: 'Disposable coveralls or washable workwear', requirement: 'Preferred to reduce take-home dust' },
    { item: 'Sunscreen + hat', requirement: 'Outdoor work – reapply as required' },
  ],
  workSteps: [
    {
      id: 's1',
      sequenceNumber: 1,
      sequenceOfWork: 'Planning, preparation and competency verification',
      hazardsAndRisks: 'Workers unaware of silica risk; missing silica statement; incorrect controls selected',
      possibleConsequence: 'High RCS exposure, non-compliance',
      initialRisk: 'high',
      controlMeasures:
        'Identify all materials that may contain crystalline silica. Complete High Risk Crystalline Silica Statement (Appendix 1) where required. Confirm wet methods or extraction systems are available and suitable. All workers hold construction induction and site induction. Confirm respirator fit and competency. Review related SWMS for power tools and housekeeping.',
      residualRisk: 'low',
      responsiblePerson: 'Supervisor',
      isCriticalControl: true,
      monitoringMethod: 'Silica statement completed + equipment availability check',
      stopWorkTrigger: 'Silica statement missing or no suitable dust controls available',
      linkedPermit: 'High Risk Crystalline Silica Statement',
      linkedSwms: 'Use of Power Tools, Manual Handling and Housekeeping',
      evidenceRequired: 'Completed silica statement and competency records',
      notes: '',
    },
    {
      id: 's2',
      sequenceNumber: 2,
      sequenceOfWork: 'Pre-start and consultation',
      hazardsAndRisks: 'Poor communication; workers not understanding controls; changed conditions',
      possibleConsequence: 'Uncontrolled dust generation',
      initialRisk: 'high',
      controlMeasures:
        'Daily pre-start covering silica hazards, wet methods / extraction requirements, respirator use, exclusion zones, clean-up method and stop-work triggers. Confirm who is operating tools, monitoring water/extraction and supervising. All workers sign onto this SWMS and understand the silica controls.',
      residualRisk: 'low',
      responsiblePerson: 'Supervisor / All Workers',
      isCriticalControl: true,
      monitoringMethod: 'Pre-start attendance and sign-on',
      stopWorkTrigger: 'Incomplete briefing or missing controls',
      linkedPermit: '',
      linkedSwms: '',
      evidenceRequired: 'Signed SWMS and pre-start record',
      notes: '',
    },
    {
      id: 's3',
      sequenceNumber: 3,
      sequenceOfWork: 'Selection and verification of dust controls',
      hazardsAndRisks: 'Ineffective or failed engineering controls',
      possibleConsequence: 'High RCS exposure',
      initialRisk: 'extreme',
      controlMeasures:
        'Prefer wet methods (water suppression directed at the point of dust generation). Where wet methods are not reasonably practicable, use on-tool extraction connected to H-class or M-class vacuum. Verify water flow or extraction performance before starting. Stop work immediately if water supply fails or extraction is blocked / not working. Do not resort to dry cutting.',
      residualRisk: 'low',
      responsiblePerson: 'Operator / Supervisor',
      isCriticalControl: true,
      monitoringMethod: 'Pre-use equipment function check',
      stopWorkTrigger: 'Water or extraction system not operating correctly',
      linkedPermit: '',
      linkedSwms: '',
      evidenceRequired: 'Equipment check record',
      notes: '',
    },
    {
      id: 's4',
      sequenceNumber: 4,
      sequenceOfWork: 'Work zone isolation and respiratory protection',
      hazardsAndRisks: 'Dust migration to other workers; inadequate respirator use',
      possibleConsequence: 'Secondary exposure, breakthrough exposure',
      initialRisk: 'high',
      controlMeasures:
        'Isolate the work zone where practicable (barricades, signage, exclusion of non-essential personnel). All persons in the dust generation zone must wear P2 (or higher) respirator. Clean-shaven requirement for tight-fitting respirators. Perform positive/negative pressure fit check before each use. Inspect respirator for damage and replace filters as required.',
      residualRisk: 'low',
      responsiblePerson: 'All Workers / Supervisor',
      isCriticalControl: true,
      monitoringMethod: 'Visual exclusion zone + respirator fit check',
      stopWorkTrigger: 'Persons without respirator in dust zone or failed fit check',
      linkedPermit: '',
      linkedSwms: '',
      evidenceRequired: '',
      notes: '',
    },
    {
      id: 's5',
      sequenceNumber: 5,
      sequenceOfWork: 'Cutting, grinding, drilling and power tool use',
      hazardsAndRisks: 'High generation of respirable crystalline silica dust; tool failure; noise and vibration',
      possibleConsequence: 'Silicosis, lung disease, injury',
      initialRisk: 'extreme',
      controlMeasures:
        'Only competent operators. Water suppression or extraction operating at all times. P2 respirator worn correctly. Eye and hearing protection. Keep non-essential workers outside the exclusion zone. Minimise cutting time. Use lowest dust-generating method and equipment available. Stop work if dust becomes uncontrolled or controls fail.',
      residualRisk: 'low',
      responsiblePerson: 'Operator / Supervisor',
      isCriticalControl: true,
      monitoringMethod: 'Continuous observation of dust control effectiveness',
      stopWorkTrigger: 'Visible uncontrolled dust cloud or control failure',
      linkedPermit: '',
      linkedSwms: 'Use of Power Tools',
      evidenceRequired: 'Competency confirmation',
      notes: '',
    },
    {
      id: 's6',
      sequenceNumber: 6,
      sequenceOfWork: 'Housekeeping and vacuum clean-up',
      hazardsAndRisks: 'Secondary dust exposure from settled silica; take-home dust',
      possibleConsequence: 'Ongoing RCS exposure, family exposure',
      initialRisk: 'high',
      controlMeasures:
        'Use H-class or M-class industrial vacuum for dry dust. No dry sweeping or compressed air. Wet clean floors and surfaces where practicable. Progressive clean-up during the shift. Contaminated clothing removed or cleaned before leaving site. Do not take dusty clothes home. Dispose of vacuum bags and contaminated waste correctly.',
      residualRisk: 'low',
      responsiblePerson: 'All Workers / Supervisor',
      isCriticalControl: true,
      monitoringMethod: 'End-of-task and end-of-shift visual inspection',
      stopWorkTrigger: 'Dry sweeping or uncontrolled dust residue',
      linkedPermit: '',
      linkedSwms: 'Manual Handling and Housekeeping',
      evidenceRequired: '',
      notes: '',
    },
    {
      id: 's7',
      sequenceNumber: 7,
      sequenceOfWork: 'Health monitoring, observation and completion',
      hazardsAndRisks: 'Unidentified high exposures; work outside SWMS scope; residual dust hazards',
      possibleConsequence: 'Long-term health effects',
      initialRisk: 'medium',
      controlMeasures:
        'Supervisor monitors dust control effectiveness throughout the shift. Workers report any dust control failures immediately. Health monitoring arranged where required by legislation or risk assessment. Final clean-up completed. All tools and equipment cleaned of dust. Contaminated PPE managed correctly. Area left free of residual silica dust. Complete any required silica exposure records.',
      residualRisk: 'low',
      responsiblePerson: 'Supervisor / All Workers',
      isCriticalControl: false,
      monitoringMethod: 'Ongoing observation + final inspection',
      stopWorkTrigger: 'Uncontrolled residual dust or incomplete clean-up',
      linkedPermit: '',
      linkedSwms: '',
      evidenceRequired: 'Silica statement close-out if required',
      notes: '',
    },
  ],
  taskRequirements: [
    {
      id: 'tr1',
      type: 'Dust-control requirements',
      description:
        'Wet methods or on-tool H/M-class extraction mandatory. No dry cutting of high-silica materials without approved engineering controls. Complete High Risk Crystalline Silica Statement.',
    },
    {
      id: 'tr2',
      type: 'Exclusion-zone requirements',
      description:
        'Isolate dust generation zone. Keep non-essential persons clear. All persons in zone must wear P2 (or higher) respirator.',
    },
    {
      id: 'tr3',
      type: 'Respiratory protection requirements',
      description:
        'P2 minimum (higher or powered air as required). Clean-shaven for tight-fitting respirators. Daily inspection and fit check.',
    },
  ],
  envControls: [
    {
      type: 'Housekeeping',
      description: 'Progressive clean-up with H/M-class vacuum. No dry sweeping or compressed air. Wet methods preferred for floors.',
      responsiblePerson: 'All Workers',
    },
    {
      type: 'Waste',
      description: 'Silica-contaminated waste and vacuum bags disposed of correctly. Do not leave dust that can become airborne.',
      responsiblePerson: 'Supervisor',
    },
    {
      type: 'Dust',
      description: 'Minimise generation at source. Wet methods or extraction. Suppress any residual dust. Prevent dust leaving the work area.',
      responsiblePerson: 'Supervisor',
    },
    {
      type: 'Water / slurry',
      description: 'Manage slurry from wet cutting to prevent run-off into drains or waterways. Collect and dispose of correctly.',
      responsiblePerson: 'All Workers',
    },
  ],
  emergencyActions: [
    { id: 'e1', action: 'Stop work immediately if dust controls fail' },
    { id: 'e2', action: 'Make the area safe and evacuate non-essential persons if high dust levels occur' },
    { id: 'e3', action: 'Provide first aid / call 000 for serious injury or acute respiratory distress' },
    { id: 'e4', action: 'Notify Site Supervisor and principal contractor immediately' },
    { id: 'e5', action: 'Preserve the incident scene where required' },
    { id: 'e6', action: 'Do not restart work until dust controls are restored and workers re-briefed' },
  ],
  emergencyModules: [],
  competencyRows: [
    { requirement: 'White Card / General Construction Induction', applies: true, evidenceOrAuth: 'Current card' },
    { requirement: 'Site induction', applies: true, evidenceOrAuth: 'Site-specific' },
    { requirement: 'Power tool competency', applies: true, evidenceOrAuth: 'Trained/supervised' },
    {
      requirement: 'Respiratory protection training and fit testing',
      applies: true,
      evidenceOrAuth: 'Fit testing preferred; daily fit check mandatory',
    },
    {
      requirement: 'Silica awareness training',
      applies: true,
      evidenceOrAuth: 'As required by site or legislation',
    },
    { requirement: 'First aid', applies: false, evidenceOrAuth: '' },
  ],
  definitions: [
    {
      id: 'd1',
      term: 'Respirable crystalline silica (RCS)',
      definition:
        'Very fine crystalline silica dust particles that can be inhaled deep into the lungs and cause silicosis and other serious lung diseases',
    },
    {
      id: 'd2',
      term: 'H-class vacuum',
      definition:
        'High-efficiency vacuum suitable for hazardous dusts including silica (preferred for high-risk silica work)',
    },
    {
      id: 'd3',
      term: 'On-tool extraction',
      definition:
        'Dust extraction system attached directly to the power tool that captures dust at the source',
    },
  ],
  relatedDocs: [
    { id: 'rd1', type: 'Related SWMS', document: 'Use of Power Tools', revision: 'Current', status: 'current' },
    { id: 'rd2', type: 'Related SWMS', document: 'Manual Handling and Housekeeping', revision: 'Current', status: 'current' },
    { id: 'rd3', type: 'Related SWMS', document: 'Working at Heights', revision: 'Current', status: 'current' },
    { id: 'rd4', type: 'Related SWMS', document: 'Moving Powered Plant', revision: 'Current', status: 'current' },
    {
      id: 'rd5',
      type: 'Other',
      document: 'High Risk Crystalline Silica Statement (Appendix 1)',
      revision: '2024',
      status: 'current',
    },
    {
      id: 'rd6',
      type: 'Other',
      document:
        'Managing the risks of respirable crystalline silica from engineered stone in the workplace (Code of Practice)',
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
      'I confirm this SWMS has been explained to all workers and the documented dust controls, PPE and work methods will be complied with. High Risk Crystalline Silica Statement completed where required.',
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
        'Site Supervisor / IWIllBUIlD',
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
