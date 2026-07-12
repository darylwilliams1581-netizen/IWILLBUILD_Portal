/**
 * POST /api/owner-console/swms/seed-environmental-spill
 * Pushes the "Environmental Controls & Spill Response" SWMS to all active companies.
 * Platform owner only. Add ?replace=1 to overwrite existing records.
 */
import type { Request, Response } from 'express';
import { db } from '../../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getSessionAndProfile } from '../../../../lib/auth-middleware.js';

const SWMS_DATA = {
  buildMode: 'advanced',
  documentType: 'swms',
  title: 'Environmental Controls & Spill Response',
  category: 'Environmental / Site Management',
  revisionNumber: '1',
  reviewDate: '2026-07-13',
  authorName: 'Site Supervisor',
  approvedByName: 'Principal Contractor',
  status: 'draft',
  purpose:
    'This Safe Work Method Statement sets out the hazards, risks and control measures for managing environmental impacts and responding to spills on construction sites. It aims to prevent pollution of land, stormwater, waterways and groundwater, and to ensure spills are contained and cleaned up promptly in compliance with environmental legislation.',
  scope:
    'Applies to all workers, subcontractors and visitors on site who handle, store, transfer or work near fuels, oils, chemicals, concrete, cement, paint, solvents, adhesives, contaminated water or other potentially polluting substances. Includes site establishment, daily operations, refuelling, concrete and paint works, washout, and site decommissioning.',
  includedActivities: [
    'Site establishment and environmental controls setup',
    'Fuel, oil and chemical storage and handling',
    'Refuelling of plant and equipment',
    'Concrete and cement works and washout',
    'Paint, solvent and adhesive handling',
    'Stormwater and sediment management',
    'Contaminated water management',
    'Spill prevention and containment',
    'Spill response and clean-up',
    'Waste management and disposal',
    'Site decommissioning and environmental reinstatement',
  ],
  excludedActivities: [
    'Remediation of pre-existing contaminated land (requires specialist contractor)',
    'Handling of asbestos or hazardous waste (refer to specific SWMS)',
    'Works in or adjacent to waterways without specific environmental permit',
  ],
  workBoundaries:
    'All site areas where fuels, chemicals, concrete, paint or other pollutants are stored, handled or used. Coordinate with principal contractor for environmental permit conditions and site-specific requirements. Stop work immediately if a spill cannot be contained or if a waterway or stormwater drain is threatened.',
  hrcwApplies: 'no',
  hrcwCategories: [],
  criticalControls: [
    {
      id: 'cc1',
      criticalRisk: 'Spill reaching stormwater drain or waterway',
      possibleOutcome: 'Environmental pollution, regulatory prosecution, significant fines',
      mandatoryControls:
        'Spill kits positioned at all fuel, chemical and concrete storage areas. Drains protected with drain guards or sand bags before works begin. Bunded storage for fuels and chemicals. Spill response initiated immediately — contain before clean-up. Never wash spills to drain.',
      verificationMethod: 'Daily site inspection — drain guards, bunding and spill kit check',
      responsibleRole: 'Supervisor / All Workers',
      flags: ['critical', 'mandatory'],
    },
    {
      id: 'cc2',
      criticalRisk: 'Fuel or chemical spill during refuelling or transfer',
      possibleOutcome: 'Soil and groundwater contamination, fire risk',
      mandatoryControls:
        'Refuel only in designated bunded areas. Drip trays under all refuelling points. Nozzle control and no overfilling. Spill kit within reach. Absorbent material deployed immediately on any spill. Contaminated soil removed and disposed of correctly.',
      verificationMethod: 'Refuelling procedure check + drip tray inspection',
      responsibleRole: 'Plant Operator / Supervisor',
      flags: ['critical', 'mandatory'],
    },
    {
      id: 'cc3',
      criticalRisk: 'Concrete or cement washout contaminating soil or waterway',
      possibleOutcome: 'Alkaline contamination of soil and water, environmental harm',
      mandatoryControls:
        'Designated washout area only — never wash concrete to ground, drain or waterway. Washout pit lined and bunded. Concrete trucks directed to washout area. Hardened concrete removed and disposed of as solid waste.',
      verificationMethod: 'Washout area inspection before concrete works',
      responsibleRole: 'Supervisor',
      flags: ['critical', 'mandatory'],
    },
    {
      id: 'cc4',
      criticalRisk: 'Sediment-laden stormwater leaving site',
      possibleOutcome: 'Waterway sedimentation, regulatory breach',
      mandatoryControls:
        'Sediment fences, rock check dams and inlet protection installed and maintained. Disturbed areas stabilised progressively. Inspect controls after every rain event. Repair damaged controls immediately.',
      verificationMethod: 'Post-rain inspection of sediment controls',
      responsibleRole: 'Supervisor',
      flags: ['critical', 'mandatory'],
    },
    {
      id: 'cc5',
      criticalRisk: 'Inadequate spill response — spill spreading or not reported',
      possibleOutcome: 'Increased contamination, regulatory non-compliance',
      mandatoryControls:
        'All workers trained in spill response procedure. Spill kits accessible and stocked. Any spill reported to supervisor immediately. Spill response record completed. Regulator notified if required by environmental permit or legislation.',
      verificationMethod: 'Spill kit inspection + worker awareness check',
      responsibleRole: 'All Workers / Supervisor',
      flags: ['critical', 'mandatory'],
    },
  ],
  plantItems: [
    {
      id: 'p1',
      item: 'Spill kits (absorbent pads, booms, granules, disposal bags)',
      requirement: 'Stocked and accessible at all fuel, chemical and concrete areas',
      inspectionRequired: 'Yes – daily and after any use',
      notes: 'Restock immediately after use',
    },
    {
      id: 'p2',
      item: 'Bunded storage pallets / drip trays',
      requirement: 'Under all fuel, oil and chemical containers',
      inspectionRequired: 'Yes – daily',
      notes: 'Empty accumulated liquid correctly — never to drain',
    },
    {
      id: 'p3',
      item: 'Drain guards / sand bags',
      requirement: 'Installed over all stormwater inlets in work area',
      inspectionRequired: 'Yes – before works and after rain',
      notes: 'Replace if damaged or saturated',
    },
    {
      id: 'p4',
      item: 'Sediment fences and erosion controls',
      requirement: 'Installed per site erosion and sediment control plan',
      inspectionRequired: 'Yes – after rain events',
      notes: 'Repair or replace damaged sections immediately',
    },
    {
      id: 'p5',
      item: 'Concrete washout pit',
      requirement: 'Lined, bunded and signed — designated area only',
      inspectionRequired: 'Yes – before concrete works',
      notes: 'Pump out and dispose of washout water correctly when full',
    },
  ],
  ppeRows: [
    { item: 'Safety helmet', requirement: 'At all times on site' },
    { item: 'Steel-capped safety boots', requirement: 'At all times on site' },
    { item: 'Hi-vis clothing', requirement: 'At all times on site' },
    {
      item: 'Chemical-resistant gloves',
      requirement: 'When handling fuels, oils, solvents, paints, adhesives or contaminated material',
    },
    {
      item: 'Safety glasses / goggles',
      requirement: 'When handling chemicals, fuels or during spill clean-up',
    },
    {
      item: 'Chemical-resistant apron',
      requirement: 'When handling bulk chemicals or during significant spill clean-up',
    },
    {
      item: 'Respirator (P2 or chemical cartridge)',
      requirement: 'Where solvent, paint or chemical vapours are present',
    },
  ],
  workSteps: [
    {
      id: 's1',
      sequenceNumber: 1,
      sequenceOfWork: 'Site establishment — environmental controls setup',
      hazardsAndRisks: 'Unprotected drains; no spill containment; no washout area',
      possibleConsequence: 'Pollution of stormwater or waterway before works begin',
      initialRisk: 'high',
      controlMeasures:
        'Install drain guards over all stormwater inlets in and around work area. Establish bunded fuel and chemical storage area. Set up designated concrete washout pit (lined and bunded). Install sediment fences and erosion controls per site plan. Position spill kits at storage areas. Brief all workers on environmental controls and spill response before works start.',
      residualRisk: 'low',
      responsiblePerson: 'Supervisor',
      isCriticalControl: true,
      monitoringMethod: 'Pre-works environmental controls inspection',
      stopWorkTrigger: 'Drains unprotected or no spill containment in place',
      linkedPermit: 'Environmental permit / development consent conditions',
      linkedSwms: '',
      evidenceRequired: 'Site establishment checklist',
      notes: '',
    },
    {
      id: 's2',
      sequenceNumber: 2,
      sequenceOfWork: 'Fuel, oil and chemical storage and handling',
      hazardsAndRisks: 'Leaking containers; overfilling; incompatible chemicals stored together',
      possibleConsequence: 'Soil and groundwater contamination, fire',
      initialRisk: 'high',
      controlMeasures:
        'Store all fuels, oils and chemicals in bunded areas on drip trays. Keep containers sealed when not in use. Segregate incompatible chemicals. Label all containers. Keep quantities on site to a minimum. Store away from drains, waterways and ignition sources. SDS available for all chemicals.',
      residualRisk: 'low',
      responsiblePerson: 'Supervisor / All Workers',
      isCriticalControl: true,
      monitoringMethod: 'Daily storage area inspection',
      stopWorkTrigger: 'Leaking container or bunding compromised',
      linkedPermit: '',
      linkedSwms: '',
      evidenceRequired: 'Chemical register and SDS folder',
      notes: '',
    },
    {
      id: 's3',
      sequenceNumber: 3,
      sequenceOfWork: 'Refuelling of plant and equipment',
      hazardsAndRisks: 'Fuel spill during refuelling; overfilling; drips from nozzle',
      possibleConsequence: 'Soil contamination, fire, stormwater pollution',
      initialRisk: 'high',
      controlMeasures:
        'Refuel only in designated bunded area or on drip tray. Confirm drain guards in place before refuelling. Use controlled nozzle — no overfilling. Attend nozzle at all times. Wipe drips immediately. Spill kit within reach. Any spill — stop, contain, clean up, report. Contaminated soil removed and disposed of correctly.',
      residualRisk: 'low',
      responsiblePerson: 'Plant Operator',
      isCriticalControl: true,
      monitoringMethod: 'Refuelling procedure observation',
      stopWorkTrigger: 'Spill not contained or drain guard not in place',
      linkedPermit: '',
      linkedSwms: '',
      evidenceRequired: '',
      notes: '',
    },
    {
      id: 's4',
      sequenceNumber: 4,
      sequenceOfWork: 'Concrete and cement works and washout',
      hazardsAndRisks: 'Concrete washout to ground or drain; alkaline runoff; truck washout off-site',
      possibleConsequence: 'Alkaline contamination of soil and waterway',
      initialRisk: 'high',
      controlMeasures:
        'Direct all concrete trucks to designated washout pit only. Never wash concrete to ground, drain or waterway. Contain any concrete spills immediately with absorbent material. Hardened concrete removed as solid waste. Washout pit pumped out and disposed of correctly when full. Concrete pump and chute washout in designated area only.',
      residualRisk: 'low',
      responsiblePerson: 'Supervisor',
      isCriticalControl: true,
      monitoringMethod: 'Washout area inspection before and during concrete works',
      stopWorkTrigger: 'Washout area full or concrete spill reaching drain',
      linkedPermit: '',
      linkedSwms: 'Concreting Slab',
      evidenceRequired: '',
      notes: '',
    },
    {
      id: 's5',
      sequenceNumber: 5,
      sequenceOfWork: 'Paint, solvent and adhesive handling',
      hazardsAndRisks: 'Spill of paint or solvent; solvent vapours; disposal of waste paint',
      possibleConsequence: 'Soil and stormwater contamination, health exposure',
      initialRisk: 'medium',
      controlMeasures:
        'Use drip trays under paint and solvent containers. Keep lids on when not in use. Minimise quantities opened at one time. Solvent waste in sealed labelled containers — never to drain. Waste paint disposed of via approved waste contractor. Ventilate enclosed areas. Wear chemical gloves and eye protection. SDS available.',
      residualRisk: 'low',
      responsiblePerson: 'Operator / Supervisor',
      isCriticalControl: false,
      monitoringMethod: 'Storage and handling inspection',
      stopWorkTrigger: 'Spill reaching drain or uncontrolled vapour exposure',
      linkedPermit: '',
      linkedSwms: 'Painting Internal/External',
      evidenceRequired: '',
      notes: '',
    },
    {
      id: 's6',
      sequenceNumber: 6,
      sequenceOfWork: 'Stormwater and sediment management',
      hazardsAndRisks: 'Sediment-laden runoff leaving site; damaged sediment controls',
      possibleConsequence: 'Waterway sedimentation, regulatory breach',
      initialRisk: 'high',
      controlMeasures:
        'Inspect sediment fences, rock check dams and inlet protection before works and after every rain event. Repair or replace damaged controls immediately. Stabilise disturbed areas progressively with mulch, hydroseed or erosion matting. Minimise the area of disturbance at any one time. Divert clean water around disturbed areas where possible.',
      residualRisk: 'low',
      responsiblePerson: 'Supervisor',
      isCriticalControl: true,
      monitoringMethod: 'Post-rain inspection and progressive stabilisation check',
      stopWorkTrigger: 'Sediment controls failed and rain forecast',
      linkedPermit: 'Erosion and sediment control plan',
      linkedSwms: '',
      evidenceRequired: 'Post-rain inspection record',
      notes: '',
    },
    {
      id: 's7',
      sequenceNumber: 7,
      sequenceOfWork: 'Spill response — contain, clean up, report',
      hazardsAndRisks: 'Spill spreading to drain, waterway or soil; delayed response',
      possibleConsequence: 'Environmental pollution, regulatory prosecution',
      initialRisk: 'extreme',
      controlMeasures:
        'Stop the source if safe to do so. Contain the spill immediately using booms, absorbent granules or pads from spill kit. Prevent spill from reaching any drain or waterway. Do not wash spill to drain. Clean up contaminated material and place in sealed labelled waste bags. Report to supervisor immediately. Complete spill response record. Notify regulator if required by permit or legislation. Contaminated soil removed and disposed of via approved contractor.',
      residualRisk: 'low',
      responsiblePerson: 'All Workers / Supervisor',
      isCriticalControl: true,
      monitoringMethod: 'Spill response drill + spill kit availability check',
      stopWorkTrigger: 'Spill cannot be contained or has reached a drain or waterway',
      linkedPermit: 'Environmental permit — notification obligations',
      linkedSwms: '',
      evidenceRequired: 'Spill response record',
      notes: '',
    },
    {
      id: 's8',
      sequenceNumber: 8,
      sequenceOfWork: 'Waste management and disposal',
      hazardsAndRisks: 'Incorrect disposal of contaminated waste, chemicals or liquid waste',
      possibleConsequence: 'Environmental contamination, regulatory breach',
      initialRisk: 'medium',
      controlMeasures:
        'Segregate waste — general, recyclable, contaminated and hazardous. Contaminated and hazardous waste in sealed labelled containers. Dispose of via approved waste contractor with waste tracking documentation. Never bury, burn or discharge liquid waste on site. Maintain waste register.',
      residualRisk: 'low',
      responsiblePerson: 'Supervisor / All Workers',
      isCriticalControl: false,
      monitoringMethod: 'Waste area inspection and disposal records',
      stopWorkTrigger: 'Contaminated waste not segregated or disposal records missing',
      linkedPermit: '',
      linkedSwms: '',
      evidenceRequired: 'Waste disposal dockets',
      notes: '',
    },
    {
      id: 's9',
      sequenceNumber: 9,
      sequenceOfWork: 'Site decommissioning and environmental reinstatement',
      hazardsAndRisks: 'Residual contamination; controls not removed correctly; site not reinstated',
      possibleConsequence: 'Ongoing environmental harm, regulatory non-compliance',
      initialRisk: 'medium',
      controlMeasures:
        'Remove all fuel, chemical and waste containers from site. Pump out and dispose of washout pit contents correctly. Remove drain guards, sediment fences and erosion controls. Stabilise all disturbed areas. Final environmental inspection. Report any residual contamination to principal contractor. Obtain sign-off from principal contractor on environmental reinstatement.',
      residualRisk: 'low',
      responsiblePerson: 'Supervisor',
      isCriticalControl: false,
      monitoringMethod: 'Final environmental inspection',
      stopWorkTrigger: 'Residual contamination identified',
      linkedPermit: '',
      linkedSwms: '',
      evidenceRequired: 'Final inspection record',
      notes: '',
    },
  ],
  taskRequirements: [
    {
      id: 'tr1',
      type: 'Environmental permit conditions',
      description:
        'Review and comply with all environmental permit and development consent conditions applicable to the site. Notify regulator if a spill reaches a waterway or stormwater system.',
    },
    {
      id: 'tr2',
      type: 'Spill kit requirements',
      description:
        'Spill kits must be positioned at all fuel, chemical and concrete storage areas and at refuelling points. Kits must be restocked immediately after use.',
    },
    {
      id: 'tr3',
      type: 'Concrete washout requirements',
      description:
        'A designated, lined and bunded washout area must be established before any concrete works commence. All concrete trucks must be directed to this area.',
    },
    {
      id: 'tr4',
      type: 'Sediment control requirements',
      description:
        'Sediment controls must be installed before ground disturbance begins and inspected after every rain event. Damaged controls must be repaired immediately.',
    },
  ],
  envControls: [
    {
      type: 'Spill containment',
      description:
        'Bunded storage, drip trays and drain guards in place at all times. Spill kits accessible and stocked.',
      responsiblePerson: 'Supervisor',
    },
    {
      type: 'Stormwater protection',
      description:
        'Drain guards over all inlets. Sediment fences and erosion controls installed and maintained. Inspect after rain.',
      responsiblePerson: 'Supervisor',
    },
    {
      type: 'Concrete and chemical washout',
      description:
        'Designated washout area only. No discharge to ground, drain or waterway. Washout pit pumped out and disposed of correctly.',
      responsiblePerson: 'Supervisor',
    },
    {
      type: 'Waste management',
      description:
        'Contaminated and hazardous waste segregated, labelled and disposed of via approved contractor with waste tracking documentation.',
      responsiblePerson: 'All Workers',
    },
    {
      type: 'Spill reporting',
      description:
        'All spills reported to supervisor immediately. Spill response record completed. Regulator notified if required.',
      responsiblePerson: 'All Workers / Supervisor',
    },
  ],
  emergencyActions: [
    { id: 'e1', action: 'Stop the source of the spill if safe to do so' },
    { id: 'e2', action: 'Contain the spill immediately — deploy booms and absorbent material from spill kit' },
    { id: 'e3', action: 'Prevent spill from reaching any stormwater drain or waterway' },
    { id: 'e4', action: 'Do not wash the spill to a drain — contain and absorb only' },
    { id: 'e5', action: 'Report to Site Supervisor immediately' },
    { id: 'e6', action: 'Complete spill response record' },
    {
      id: 'e7',
      action:
        'If spill has reached a waterway or stormwater system — notify principal contractor and regulator as required by permit',
    },
    { id: 'e8', action: 'Arrange disposal of contaminated material via approved waste contractor' },
    { id: 'e9', action: 'Do not restart work until spill is fully contained and cleaned up' },
  ],
  emergencyModules: [],
  competencyRows: [
    { requirement: 'White Card / General Construction Induction', applies: true, evidenceOrAuth: 'Current card' },
    { requirement: 'Site induction', applies: true, evidenceOrAuth: 'Site-specific' },
    {
      requirement: 'Environmental awareness training',
      applies: true,
      evidenceOrAuth: 'Site induction or toolbox talk',
    },
    {
      requirement: 'Spill response training',
      applies: true,
      evidenceOrAuth: 'Toolbox talk or drill record',
    },
    {
      requirement: 'Chemical handling / SDS awareness',
      applies: true,
      evidenceOrAuth: 'Where chemicals are handled',
    },
    { requirement: 'First aid', applies: false, evidenceOrAuth: '' },
  ],
  definitions: [
    {
      id: 'd1',
      term: 'Bunding',
      definition:
        'A containment wall or barrier around a storage area designed to hold the contents of the largest container plus 10% in the event of a spill or leak',
    },
    {
      id: 'd2',
      term: 'Drain guard',
      definition:
        'A cover or barrier placed over a stormwater inlet to prevent sediment, chemicals or pollutants from entering the stormwater system',
    },
    {
      id: 'd3',
      term: 'SDS',
      definition:
        'Safety Data Sheet — a document providing information on the properties, hazards, safe handling and emergency response for a chemical substance',
    },
    {
      id: 'd4',
      term: 'Sediment fence',
      definition:
        'A temporary barrier of geotextile fabric installed across a slope to intercept and slow sediment-laden runoff, allowing sediment to settle out',
    },
    {
      id: 'd5',
      term: 'Washout pit',
      definition:
        'A designated, lined and bunded area for washing out concrete trucks, pumps and tools — prevents alkaline concrete washwater from reaching soil or waterways',
    },
  ],
  relatedDocs: [
    {
      id: 'rd1',
      type: 'Related SWMS',
      document: 'Concreting Slab',
      revision: 'Current',
      status: 'current',
    },
    {
      id: 'rd2',
      type: 'Related SWMS',
      document: 'Painting Internal/External',
      revision: 'Current',
      status: 'current',
    },
    {
      id: 'rd3',
      type: 'Related SWMS',
      document: 'Landscaping & Maintenance',
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
      document: 'Site Erosion and Sediment Control Plan',
      revision: 'Site-specific',
      status: 'current',
    },
    {
      id: 'rd6',
      type: 'Other',
      document: 'Environmental Permit / Development Consent Conditions',
      revision: 'Site-specific',
      status: 'current',
    },
    {
      id: 'rd7',
      type: 'Other',
      document: 'Chemical Register and SDS Folder',
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
              category        = 'Environmental / Site Management',
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
              'Environmental / Site Management',
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
    console.error('seed-environmental-spill error:', err);
    return res.status(500).json({ error: String(err) });
  }
}
