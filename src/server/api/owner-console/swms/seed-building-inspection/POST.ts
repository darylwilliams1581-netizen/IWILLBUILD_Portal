/**
 * POST /api/owner-console/swms/seed-building-inspection
 * Pushes the "Building Inspection" SWMS to all active companies.
 * Platform owner only. Add ?replace=1 to overwrite existing records.
 */
import type { Request, Response } from 'express';
import { db } from '../../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getPlatformOwnerInfo } from '../../../../lib/platform-owner-guard.js';

const SWMS_DATA = {
  buildMode: 'advanced',
  documentType: 'swms',
  title: 'Building Inspection',
  category: 'Inspection / Make-Safe / Assessment',
  revisionNumber: '1',
  reviewDate: '2026-07-13',
  authorName: 'Site Supervisor',
  approvedByName: 'Principal Contractor',
  status: 'draft',
  purpose:
    'This Safe Work Method Statement identifies the hazards, risks and control measures for building inspections, defect inspections, pre-purchase inspections, make-safe works and site assessments. It aims to eliminate or minimise risks associated with incomplete structures, working at heights, voids, electrical hazards, plant and public interface so far as is reasonably practicable.',
  scope:
    'Applies to all workers undertaking building inspections, roof inspections, make-safe activities, site assessments, defect reporting and related tasks on construction sites, incomplete buildings or existing structures. Includes planning, site access, inspection activities, working at heights, temporary make-safe measures and clean-up.',
  includedActivities: [
    'Toolbox talk and pre-start',
    'Site access and induction',
    'Pre-inspection risk assessment',
    'Work zone management and exclusion zones',
    'External and internal building inspection',
    'Roof and height access inspections',
    'Make-safe works (temporary barriers, covers, isolation)',
    'Working near voids, edges and incomplete structures',
    'Electrical and service awareness during inspection',
    'Materials handling and temporary supports',
    'Documentation and photo recording',
    'Site clean-up and secure-up',
  ],
  excludedActivities: [
    'Structural repairs or demolition without separate SWMS',
    'Live electrical work or isolation without authorised electrician',
    'Confined space entry without additional controls',
  ],
  workBoundaries:
    'Site-specific inspection areas only. Coordinate with principal contractor / builder for access, incomplete works and other trades. Stop work immediately if controls cannot be maintained or conditions are unsafe.',
  hrcwApplies: 'yes',
  hrcwCategories: [
    {
      id: 'h1',
      category: 'Risk of a person falling more than 2 metres',
      whyApplies: 'Roof inspections, work near voids, edges, incomplete floors, stair voids and elevated areas',
      linkedWorkStep: 'Roof and height access inspections / Working near voids',
      requiredPermit: '',
      relatedSwms: 'Working at Heights',
    },
    {
      id: 'h2',
      category: 'Work on or near energised electrical installations or services',
      whyApplies: 'Inspection near incomplete electrical installations, temporary power, exposed wiring or services',
      linkedWorkStep: 'Electrical and service awareness',
      requiredPermit: '',
      relatedSwms: 'Working On or Near Exposed Live Parts',
    },
    {
      id: 'h3',
      category: 'Work in an area with movement of powered mobile plant',
      whyApplies: 'Possible plant, deliveries or other trades operating during inspection',
      linkedWorkStep: 'Work zone management',
      requiredPermit: '',
      relatedSwms: 'Moving Powered Plant',
    },
    {
      id: 'h4',
      category: 'Work on, in or adjacent to a road or other traffic corridor',
      whyApplies: 'Site access, public interface or work near roads',
      linkedWorkStep: 'Site access',
      requiredPermit: 'Traffic management if required',
      relatedSwms: 'Traffic Management / Working Near Roads',
    },
    {
      id: 'h5',
      category: 'Crystalline Silica (RCS) exposure',
      whyApplies: 'Possible dust from incomplete works, cutting or debris during make-safe',
      linkedWorkStep: 'Make-safe works',
      requiredPermit: 'Silica statement if applicable',
      relatedSwms: 'Silica Dust Exposure',
    },
  ],
  criticalControls: [
    {
      id: 'cc1',
      criticalRisk: 'Fall from heights / voids / incomplete floors',
      possibleOutcome: 'Serious injury or fatality',
      mandatoryControls:
        'Never access roofs or elevated areas without suitable fall protection (scaffold, EWP, harness + anchor, or edge protection). Void covers and temporary barriers must be in place and secure. Do not walk on incomplete floors, formwork or unsecured decking. Ladders industrial rated, set up correctly, three points of contact. Prefer EWP or scaffold for roof inspections. Inspect all access equipment before use.',
      verificationMethod: 'Pre-access inspection of fall protection, void covers and access equipment',
      responsibleRole: 'Supervisor / All Workers',
      flags: ['critical', 'mandatory'],
    },
    {
      id: 'cc2',
      criticalRisk: 'Collapse or instability of incomplete structures',
      possibleOutcome: 'Crush injury, entrapment or fatality',
      mandatoryControls:
        'Assess structural stability before entering incomplete buildings. Do not enter areas with temporary props, unsecured walls, incomplete bracing or obvious instability. Stay clear of active construction zones unless authorised and escorted. Report any structural concerns immediately and stop work.',
      verificationMethod: 'Visual structural assessment + builder / site supervisor confirmation if required',
      responsibleRole: 'Supervisor / All Workers',
      flags: ['critical', 'mandatory'],
    },
    {
      id: 'cc3',
      criticalRisk: 'Electric shock from incomplete or temporary electrical installations',
      possibleOutcome: 'Electrocution or serious injury',
      mandatoryControls:
        'Treat all electrical wiring and temporary power as live until proven otherwise. Do not touch exposed wiring, junction boxes or temporary installations. Maintain exclusion from live panels and switchboards. Report any damaged or exposed electrical services immediately.',
      verificationMethod: 'Visual electrical awareness check',
      responsibleRole: 'All Workers',
      flags: ['critical', 'mandatory'],
    },
    {
      id: 'cc4',
      criticalRisk: 'Plant / vehicle / other trades interaction',
      possibleOutcome: 'Crush or struck-by injury',
      mandatoryControls:
        'Establish exclusion zones around active plant and work areas. High-visibility clothing mandatory. Make positive communication with other trades and plant operators before entering shared zones. Spotter used where required. Stay clear of swing radii and load paths.',
      verificationMethod: 'Exclusion zone and communication confirmation',
      responsibleRole: 'Supervisor / All Workers',
      flags: ['critical'],
    },
  ],
  plantItems: [
    {
      id: 'p1',
      item: 'Elevated Work Platform / Scaffold / Industrial ladders',
      requirement: 'Competent operators / users, pre-use inspection, fall protection as required',
      inspectionRequired: 'Yes – before each use',
      notes: 'Preferred over ladders for roof access',
    },
    {
      id: 'p2',
      item: 'Temporary barriers, void covers, edge protection',
      requirement: 'Secure, fit for purpose, clearly marked',
      inspectionRequired: 'Yes – before use and after disturbance',
      notes: '',
    },
  ],
  ppeRows: [
    { item: 'Safety helmet', requirement: 'At all times on site and when working near incomplete structures or plant' },
    { item: 'Steel-capped safety boots', requirement: 'At all times on site' },
    { item: 'Hi-vis long-sleeve clothing', requirement: 'At all times on site' },
    { item: 'Safety glasses / goggles', requirement: 'As required by task and site conditions' },
    { item: 'Hearing protection', requirement: 'When plant or tools create noise' },
    { item: 'Task-specific gloves', requirement: 'When handling materials or temporary supports' },
    { item: 'P2 dust mask', requirement: 'When dust is present or make-safe generates dust' },
    {
      item: 'Safety harness + lanyard',
      requirement: 'Mandatory for roof / height access where fall protection cannot be eliminated',
    },
    { item: 'Sunscreen + hat', requirement: 'Outdoor work – reapply as required' },
  ],
  workSteps: [
    {
      id: 's1',
      sequenceNumber: 1,
      sequenceOfWork: 'Toolbox Talk & Pre-start',
      hazardsAndRisks: 'Workers unaware of site-specific risks, unfit for duty, incomplete structures',
      possibleConsequence: 'Injury, poor decisions',
      initialRisk: 'high',
      controlMeasures:
        'Stop-Plan-Do process. Fitness for work check. Review emergency response, site access rules, incomplete works, voids and heights. Discuss weather, other trades and contingency plan. All workers sign onto SWMS and receive site-specific induction / briefing.',
      residualRisk: 'low',
      responsiblePerson: 'Supervisor / All Workers',
      isCriticalControl: true,
      monitoringMethod: 'Daily pre-start attendance and sign-on',
      stopWorkTrigger: 'Any worker unfit or critical site risks not briefed',
      linkedPermit: '',
      linkedSwms: '',
      evidenceRequired: 'Signed SWMS and pre-start record',
      notes: '',
    },
    {
      id: 's2',
      sequenceNumber: 2,
      sequenceOfWork: 'Site access and pre-inspection risk assessment',
      hazardsAndRisks: 'Unauthorised access, unknown hazards, incomplete works, plant movement',
      possibleConsequence: 'Injury, structural instability',
      initialRisk: 'high',
      controlMeasures:
        'Confirm access authorisation with builder / principal contractor. Walk the site with site supervisor if required. Identify incomplete floors, voids, temporary supports, exposed services, plant areas and exclusion zones. Document key hazards before commencing detailed inspection. Do not enter areas of obvious structural concern.',
      residualRisk: 'low',
      responsiblePerson: 'Supervisor / Inspector',
      isCriticalControl: true,
      monitoringMethod: 'Site walk and hazard identification',
      stopWorkTrigger: 'Uncontrolled structural or access risks',
      linkedPermit: '',
      linkedSwms: 'Moving Powered Plant',
      evidenceRequired: 'Hazard notes / photos',
      notes: '',
    },
    {
      id: 's3',
      sequenceNumber: 3,
      sequenceOfWork: 'Work zone management and exclusion zones',
      hazardsAndRisks: 'Other trades, plant, public interface, falling objects',
      possibleConsequence: 'Struck-by or crush injury',
      initialRisk: 'high',
      controlMeasures:
        'Establish and maintain exclusion zones around inspection areas where required. High-visibility clothing mandatory. Positive communication with other trades and plant operators. Keep clear of active work zones, swing radii and load paths. Barricade temporary make-safe areas.',
      residualRisk: 'low',
      responsiblePerson: 'Supervisor / All Workers',
      isCriticalControl: true,
      monitoringMethod: 'Ongoing visual and communication check',
      stopWorkTrigger: 'Persons or plant entering exclusion zone without control',
      linkedPermit: '',
      linkedSwms: 'Moving Powered Plant, Traffic Management / Working Near Roads',
      evidenceRequired: '',
      notes: '',
    },
    {
      id: 's4',
      sequenceNumber: 4,
      sequenceOfWork: 'External and internal building inspection',
      hazardsAndRisks: 'Trips, slips, uneven surfaces, incomplete floors, debris, low light',
      possibleConsequence: 'Injury, falls',
      initialRisk: 'medium',
      controlMeasures:
        'Wear appropriate PPE. Use torch / lighting in low-light areas. Watch footing on incomplete floors, debris and temporary surfaces. Stay on designated walkways where provided. Do not force access into restricted or unstable areas. Take photos and notes systematically.',
      residualRisk: 'low',
      responsiblePerson: 'Inspector / All Workers',
      isCriticalControl: false,
      monitoringMethod: 'Buddy observation where required',
      stopWorkTrigger: 'Unsafe footing or unstable area',
      linkedPermit: '',
      linkedSwms: 'Manual Handling and Housekeeping',
      evidenceRequired: '',
      notes: '',
    },
    {
      id: 's5',
      sequenceNumber: 5,
      sequenceOfWork: 'Roof and height access inspections (HR)',
      hazardsAndRisks: 'Fall from roof, edges, voids or incomplete structure',
      possibleConsequence: 'Serious injury or fatality',
      initialRisk: 'extreme',
      controlMeasures:
        'Prefer EWP or scaffold for roof access. Where ladders used: industrial rated, set up 1:4 ratio, secured, three points of contact, do not stand on top two rungs. Harness + approved anchor required where edge protection is incomplete. Never access wet, fragile or unsecured roofing. Clear fall zone below. Spotter / ground person preferred.',
      residualRisk: 'low',
      responsiblePerson: 'Inspector / Supervisor',
      isCriticalControl: true,
      monitoringMethod: 'Access equipment and fall protection inspection before ascent',
      stopWorkTrigger: 'Missing fall protection, unstable roof or weather',
      linkedPermit: '',
      linkedSwms: 'Working at Heights, Elevated Work Platform',
      evidenceRequired: 'Harness and access equipment check',
      notes: '',
    },
    {
      id: 's6',
      sequenceNumber: 6,
      sequenceOfWork: 'Make-safe works (temporary barriers, covers, isolation)',
      hazardsAndRisks: 'Falls into voids, incomplete isolation, manual handling, dust',
      possibleConsequence: 'Injury to self or others',
      initialRisk: 'high',
      controlMeasures:
        'Install temporary void covers, barriers and edge protection that are secure and clearly marked. Isolate electrical or other services only if authorised and competent. Use correct PPE and dust controls for any cutting or drilling. Team lift awkward temporary materials. Document make-safe measures.',
      residualRisk: 'low',
      responsiblePerson: 'Supervisor / All Workers',
      isCriticalControl: true,
      monitoringMethod: 'Inspection of installed make-safe measures',
      stopWorkTrigger: 'Inadequate temporary protection or unauthorised isolation',
      linkedPermit: '',
      linkedSwms: 'Working at Heights, Silica Dust Exposure, Manual Handling and Housekeeping',
      evidenceRequired: 'Make-safe photos and notes',
      notes: '',
    },
    {
      id: 's7',
      sequenceNumber: 7,
      sequenceOfWork: 'Electrical and service awareness during inspection',
      hazardsAndRisks: 'Contact with live or temporary electrical installations, damaged services',
      possibleConsequence: 'Electric shock or electrocution',
      initialRisk: 'high',
      controlMeasures:
        'Treat all exposed wiring, temporary power and incomplete electrical work as live. Do not touch. Maintain distance from switchboards and panels. Report any damaged, exposed or unsafe electrical conditions immediately to site supervisor. Do not attempt repairs.',
      residualRisk: 'low',
      responsiblePerson: 'All Workers',
      isCriticalControl: true,
      monitoringMethod: 'Visual awareness throughout inspection',
      stopWorkTrigger: 'Exposed live electrical hazard without controls',
      linkedPermit: '',
      linkedSwms: 'Working On or Near Exposed Live Parts',
      evidenceRequired: '',
      notes: '',
    },
    {
      id: 's8',
      sequenceNumber: 8,
      sequenceOfWork: 'Documentation, clean-up and secure-up',
      hazardsAndRisks: 'Residual trip hazards, unsecured temporary works, incomplete records',
      possibleConsequence: 'Injury to others, incomplete information',
      initialRisk: 'medium',
      controlMeasures:
        'Complete inspection notes and photos. Remove personal tools and materials. Ensure any temporary make-safe measures remain secure and signed/labelled. Leave site tidy and secure. Close gates / barriers. Report any new hazards identified. Sign off SWMS.',
      residualRisk: 'low',
      responsiblePerson: 'Inspector / Supervisor',
      isCriticalControl: false,
      monitoringMethod: 'End-of-inspection inspection',
      stopWorkTrigger: 'Unsecured temporary works or residual hazards left for others',
      linkedPermit: '',
      linkedSwms: '',
      evidenceRequired: 'Inspection records and photos',
      notes: '',
    },
  ],
  taskRequirements: [
    {
      id: 'tr1',
      type: 'Rescue readiness',
      description: 'Communication and rescue plan for roof / height work. Ground person preferred for elevated inspections.',
    },
    {
      id: 'tr2',
      type: 'Exclusion-zone requirements',
      description: 'Establish exclusion zones around active plant, incomplete structures and temporary make-safe areas.',
    },
    {
      id: 'tr3',
      type: 'Permit requirements',
      description: 'Site access authorisation and any height / EWP permits as required by principal contractor.',
    },
  ],
  envControls: [
    {
      type: 'Housekeeping',
      description: 'Progressive clean-up. Keep access ways clear. Leave temporary make-safe measures secure and marked.',
      responsiblePerson: 'All Workers',
    },
    {
      type: 'Waste',
      description: 'Remove personal waste and packaging. Do not leave materials that create trip or public hazards.',
      responsiblePerson: 'All Workers',
    },
    {
      type: 'Dust',
      description: 'Minimise dust generation during make-safe works. Use extraction or wet methods and P2 mask where required.',
      responsiblePerson: 'Supervisor',
    },
    {
      type: 'Public protection',
      description: 'Maintain barriers and signage. Prevent public access to incomplete or make-safe areas.',
      responsiblePerson: 'Supervisor',
    },
  ],
  emergencyActions: [
    { id: 'e1', action: 'Stop work immediately' },
    { id: 'e2', action: 'Make the area safe if safe to do so' },
    { id: 'e3', action: 'Provide first aid / call 000 for serious injury or fall' },
    { id: 'e4', action: 'Notify Site Supervisor and Principal Contractor immediately' },
    { id: 'e5', action: 'For electrical incident – do not touch, call 000 and electricity emergency 131 962' },
    { id: 'e6', action: 'Preserve the incident scene where required' },
    { id: 'e7', action: 'Do not restart work until controls reviewed and workers re-briefed' },
  ],
  emergencyModules: [],
  competencyRows: [
    { requirement: 'White Card / General Construction Induction', applies: true, evidenceOrAuth: 'Current card' },
    { requirement: 'Site induction', applies: true, evidenceOrAuth: 'Site-specific' },
    {
      requirement: 'Working at heights awareness / competency',
      applies: true,
      evidenceOrAuth: 'As required for roof / height access',
    },
    { requirement: 'EWP operator competency', applies: false, evidenceOrAuth: 'If EWP is used' },
    { requirement: 'First aid', applies: false, evidenceOrAuth: '' },
    {
      requirement: 'Building inspection qualification / experience',
      applies: true,
      evidenceOrAuth: 'As required by role',
    },
  ],
  definitions: [
    {
      id: 'd1',
      term: 'Make-safe',
      definition:
        'Temporary measures (barriers, covers, isolation, props) installed to reduce immediate risk until permanent works are completed',
    },
    {
      id: 'd2',
      term: 'Void',
      definition: 'Openings in floors, roofs or walls that present a fall hazard – must be covered or protected',
    },
  ],
  relatedDocs: [
    { id: 'rd1', type: 'Related SWMS', document: 'Working at Heights', revision: 'Current', status: 'current' },
    { id: 'rd2', type: 'Related SWMS', document: 'Elevated Work Platform', revision: 'Current', status: 'current' },
    {
      id: 'rd3',
      type: 'Related SWMS',
      document: 'Working On or Near Exposed Live Parts',
      revision: 'Current',
      status: 'current',
    },
    { id: 'rd4', type: 'Related SWMS', document: 'Moving Powered Plant', revision: 'Current', status: 'current' },
    {
      id: 'rd5',
      type: 'Related SWMS',
      document: 'Manual Handling and Housekeeping',
      revision: 'Current',
      status: 'current',
    },
    { id: 'rd6', type: 'Related SWMS', document: 'Silica Dust Exposure', revision: 'Current', status: 'current' },
    {
      id: 'rd7',
      type: 'Related SWMS',
      document: 'Traffic Management / Working Near Roads',
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
      'I confirm this SWMS has been explained to all workers and the documented precautions, controls and work methods will be complied with.',
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

    let inserted = 0,
      updated = 0,
      skipped = 0;

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
              category        = 'Inspection / Make-Safe / Assessment',
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
              'Inspection / Make-Safe / Assessment',
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
    console.error('seed-building-inspection error:', err);
    return res.status(500).json({ error: String(err) });
  }
}
