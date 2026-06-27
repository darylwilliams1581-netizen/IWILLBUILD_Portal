import type { Request, Response } from 'express';
import { db } from '../../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getAuth } from '../../../../../lib/auth/auth.js';
import { profiles } from '../../../../db/schema.js';
import { eq } from 'drizzle-orm';
import type { ResultSetHeader } from 'mysql2';

// ── Generic SWMS templates derived from industry reference material ────────────
// No company names, branding, or project-specific references.

const TEMPLATES = [
  {
    title: 'Traffic Management — Working Near Roads',
    workActivity: 'Works conducted adjacent to or within road corridors, including installation, maintenance, and inspection activities requiring traffic control measures.',
    hazards: `• Moving vehicles (including heavy vehicles)
• Inadequate traffic control setup
• Distracted or non-compliant road users
• Inadequate lighting or visibility
• Fatigue from extended roadside work
• Pedestrians and cyclists in work zone
• Uneven or unstable ground near road edge
• Noise from traffic`,
    risks: `• Being struck by a vehicle — HIGH
• Slips, trips and falls on road surface — MEDIUM
• Hearing damage from traffic noise — MEDIUM
• Fatigue-related incidents — MEDIUM
• Pedestrian/cyclist conflict — MEDIUM`,
    controls: `• Prepare and implement a Traffic Management Plan (TMP) approved by the relevant road authority prior to commencing work
• Engage a qualified Traffic Controller (TC) holding current certification
• Install traffic control devices (signs, cones, barriers, delineators) in accordance with the approved TMP and applicable traffic management standards
• Conduct pre-start briefing with all workers covering TMP, emergency procedures, and escape routes
• Ensure all workers wear high-visibility PPE at all times within the work zone
• Establish a safe exclusion zone between workers and live traffic lanes
• Use spotters where line of sight is limited
• Conduct regular reviews of TMP if conditions change (weather, traffic volume, scope changes)
• Limit work hours to reduce fatigue; rotate workers on traffic control duties
• Ensure all plant and equipment is positioned to provide maximum protection to workers`,
    ppe: `• Class 3 high-visibility vest or clothing (day and night)
• Safety helmet (hard hat)
• Safety footwear (steel-capped boots)
• Safety glasses or goggles
• Hearing protection where noise exceeds 85 dB(A)
• Gloves (task-appropriate)
• Sun protection (hat, sunscreen, long sleeves) for outdoor work`,
    plantEquipment: `• Traffic control signs (Stop/Slow bats, regulatory signs)
• Traffic cones, delineators, and barriers
• Variable message signs (VMS) where required
• Arrow boards and attenuator vehicles where required
• Two-way radios for communication between traffic controllers
• Vehicles with flashing amber lights`,
    trainingCompetency: `• Traffic Controller certification (current and valid)
• Traffic Management Implementer (TMI) qualification where required
• Site induction completed
• Emergency response procedures briefing
• Relevant licences for plant and equipment operation`,
    emergencyControls: `• Emergency contact numbers displayed at site entry
• First aid kit accessible at all times
• Nearest hospital and emergency services identified in pre-start briefing
• Emergency assembly point established and communicated to all workers
• Incident reporting procedure communicated to all workers
• In the event of a vehicle incursion: workers to move to designated safe refuge immediately`,
    environmentalControls: `• Contain and manage any spills from plant or equipment immediately
• Avoid disturbing vegetation or drainage infrastructure beyond the approved work zone
• Manage dust and noise in accordance with site conditions and local requirements
• Dispose of waste materials in accordance with applicable regulations`,
    signOffRequirements: `All workers must sign on to this SWMS prior to commencing work. Workers must confirm they have read, understood, and agree to comply with all controls listed. Supervisor to verify sign-on before work begins.`,
    revisionNumber: '1',
    status: 'active',
  },
  {
    title: 'Manual Handling & Housekeeping',
    workActivity: 'Manual handling tasks including lifting, carrying, pushing, pulling, and positioning of materials, equipment, and components. General site housekeeping activities.',
    hazards: `• Lifting heavy or awkward loads
• Repetitive manual handling tasks
• Twisting or bending while handling loads
• Slips, trips and falls from poor housekeeping
• Falling objects from unsecured materials
• Pinch points and crush injuries
• Fatigue from sustained manual handling
• Inadequate lighting in work areas`,
    risks: `• Musculoskeletal injury (back, shoulder, knee) — HIGH
• Slip, trip or fall — MEDIUM
• Struck by falling object — MEDIUM
• Crush injury — MEDIUM
• Fatigue-related incident — LOW`,
    controls: `• Assess all manual handling tasks before commencing; eliminate or minimise manual handling where possible through use of mechanical aids
• Use mechanical lifting aids (trolleys, pallet jacks, forklifts, hoists) for loads exceeding 16 kg or where awkward postures are required
• Where manual handling cannot be eliminated, use team lifts for loads between 16–55 kg
• Plan the lift: clear path, stable footing, load within body's centre of gravity
• Maintain good posture: bend knees, keep back straight, hold load close to body
• Avoid twisting while carrying a load; reposition feet instead
• Rotate workers on repetitive manual handling tasks to reduce fatigue
• Maintain clear, unobstructed walkways and work areas at all times
• Store materials in designated areas; do not leave materials in walkways or access routes
• Secure all materials and equipment to prevent falling
• Conduct daily housekeeping inspections; address hazards immediately
• Report any pain or discomfort from manual handling tasks immediately`,
    ppe: `• Safety footwear (steel-capped boots)
• Safety helmet (hard hat) where overhead hazards exist
• Gloves (task-appropriate, e.g. cut-resistant, grip)
• High-visibility vest
• Back support belt (where assessed as appropriate — not a substitute for correct technique)`,
    plantEquipment: `• Hand trolleys and sack trucks
• Pallet jacks (manual and powered)
• Forklifts and telehandlers (licensed operators only)
• Hoists and chain blocks
• Mechanical lifting attachments`,
    trainingCompetency: `• Manual handling training (correct technique)
• Forklift/plant licence where applicable
• Site induction completed
• Hazard identification and reporting`,
    emergencyControls: `• First aid kit accessible at all times
• Trained first aider on site
• Incident and near-miss reporting procedure communicated to all workers
• Emergency contacts displayed at site entry
• Workers to report any pain or discomfort immediately — do not continue if injured`,
    environmentalControls: `• Dispose of waste materials in designated bins; do not leave waste in work areas
• Segregate recyclable materials from general waste
• Prevent materials from entering stormwater drains`,
    signOffRequirements: `All workers must sign on to this SWMS prior to commencing work. Workers must confirm they have read, understood, and agree to comply with all controls listed.`,
    revisionNumber: '1',
    status: 'active',
  },
  {
    title: 'Silica Dust Exposure — Cutting, Grinding & Drilling',
    workActivity: 'Tasks involving cutting, grinding, drilling, or otherwise disturbing materials that contain crystalline silica, including concrete, masonry, stone, and engineered stone products.',
    hazards: `• Inhalation of respirable crystalline silica (RCS) dust
• Dust accumulation creating slip hazard
• Noise from cutting and grinding equipment
• Flying debris from cutting operations
• Vibration from power tools
• Eye injury from airborne particles
• Skin irritation from dust contact`,
    risks: `• Silicosis (irreversible lung disease) from RCS inhalation — CRITICAL
• Hearing damage from noise — HIGH
• Eye injury from flying particles — HIGH
• Slip from dust accumulation — MEDIUM
• Hand-arm vibration syndrome — MEDIUM`,
    controls: `• Eliminate or substitute: use pre-cut materials where possible to avoid on-site cutting
• Engineering controls (preferred): use wet cutting methods to suppress dust at source; use on-tool dust extraction (vacuum with H-class filter) for all dry cutting, grinding, and drilling operations
• Enclose or screen cutting areas to prevent dust spread to other workers
• Establish exclusion zones around cutting operations; only essential personnel within zone
• Conduct air monitoring where required to verify dust controls are effective
• Rotate workers to limit individual exposure duration
• Prohibit dry sweeping of silica dust — use wet methods or vacuum only
• Provide and maintain respiratory protective equipment (RPE): minimum P2 respirator; powered air-purifying respirator (PAPR) for high-exposure tasks
• Conduct face-fit testing for all workers required to wear tight-fitting respirators
• Provide health monitoring (lung function testing) for workers with regular silica exposure
• Ensure all workers are trained in silica dust hazards and controls before commencing work`,
    ppe: `• P2 or P3 respirator (fit-tested) — mandatory for all silica dust-generating tasks
• Safety glasses or goggles (full seal for grinding)
• Face shield for cutting operations
• Hearing protection (earmuffs or earplugs) — mandatory
• Safety helmet (hard hat)
• Safety footwear (steel-capped boots)
• High-visibility vest
• Gloves (cut-resistant for cutting tasks)
• Coveralls or disposable overalls for high-exposure tasks`,
    plantEquipment: `• Angle grinders with dust shroud and extraction attachment
• Core drills with water suppression or vacuum extraction
• Wet-cutting saws
• Industrial vacuum (H-class filter) for dust collection
• Water supply for wet cutting methods
• Enclosed cutting booths where available`,
    trainingCompetency: `• Silica dust awareness training (mandatory)
• Correct use and maintenance of RPE (including fit-test record)
• Operation of dust extraction equipment
• Site induction completed
• Health monitoring enrolment where required`,
    emergencyControls: `• In the event of suspected overexposure: remove worker from area, provide fresh air, seek medical attention
• First aid kit accessible at all times
• Emergency contacts displayed at site entry
• Incident reporting procedure communicated to all workers
• Contaminated clothing to be removed and bagged before leaving site`,
    environmentalControls: `• Contain silica dust waste; do not allow to enter stormwater drains
• Dispose of silica dust waste as controlled waste in accordance with applicable regulations
• Wet down work area after completion to prevent dust resuspension`,
    signOffRequirements: `All workers must sign on to this SWMS prior to commencing work. Workers must confirm they have read, understood, and agree to comply with all controls listed. Supervisor to verify RPE fit-test records before sign-on.`,
    revisionNumber: '1',
    status: 'active',
  },
  {
    title: 'Use of Power Tools — Portable & Handheld',
    workActivity: 'Operation of portable and handheld power tools including angle grinders, drills, circular saws, reciprocating saws, nail guns, and similar equipment for construction and maintenance tasks.',
    hazards: `• Contact with rotating or moving parts (blades, discs, bits)
• Flying debris and projectiles
• Electric shock from damaged tools or leads
• Noise from power tool operation
• Vibration (hand-arm vibration syndrome)
• Dust generation
• Fire from sparks (near flammable materials)
• Kickback from saws and grinders
• Eye injury from particles
• Fatigue from sustained tool use`,
    risks: `• Laceration or amputation from blade/disc contact — HIGH
• Eye injury from flying debris — HIGH
• Electric shock — HIGH
• Hearing damage — HIGH
• Hand-arm vibration syndrome — MEDIUM
• Fire from sparks — MEDIUM
• Dust inhalation — MEDIUM`,
    controls: `• Inspect all power tools before use; remove from service any tool that is damaged, has a damaged lead, or is missing guards
• Use the correct tool for the task; do not use tools for purposes other than their design intent
• Ensure all guards are in place and functioning before use
• Use double-insulated tools or tools connected to a residual current device (RCD/safety switch)
• Conduct regular RCD testing in accordance with applicable standards
• Secure workpiece before cutting or drilling — do not hold workpiece by hand
• Maintain firm two-handed grip on tools where required
• Keep bystanders and other workers clear of the work zone
• Disconnect power before changing blades, bits, or attachments
• Store tools safely when not in use; do not leave running tools unattended
• Rotate workers on vibrating tools to limit exposure duration
• Use anti-vibration gloves where assessed as appropriate
• Ensure adequate lighting in work area
• Keep leads and hoses clear of work area to prevent trip hazards`,
    ppe: `• Safety glasses or goggles (mandatory for all power tool use)
• Face shield for grinding and cutting operations
• Hearing protection (earmuffs or earplugs) — mandatory
• Safety footwear (steel-capped boots)
• Safety helmet (hard hat) where overhead hazards exist
• Gloves (task-appropriate; note: not for rotating tools where entanglement risk exists)
• High-visibility vest
• Dust mask (P2 minimum) where dust is generated`,
    plantEquipment: `• Portable power tools (grinders, drills, saws, nail guns, etc.)
• Extension leads (heavy-duty, industrial rated)
• RCD/safety switch (portable)
• Workbenches and clamps for securing workpieces
• Dust extraction equipment where required`,
    trainingCompetency: `• Competency in operation of specific tools being used
• Electrical safety awareness
• Site induction completed
• Hazard identification and reporting`,
    emergencyControls: `• First aid kit accessible at all times; trained first aider on site
• In the event of a laceration: apply direct pressure, call for first aider, call 000 if severe
• In the event of electric shock: do not touch the person — isolate power source first, then call 000
• Emergency contacts displayed at site entry
• Incident reporting procedure communicated to all workers`,
    environmentalControls: `• Collect and dispose of offcuts and waste materials in designated bins
• Prevent dust and debris from entering stormwater drains
• Manage sparks near flammable materials — establish hot work permit if required`,
    signOffRequirements: `All workers must sign on to this SWMS prior to commencing work. Workers must confirm they have read, understood, and agree to comply with all controls listed.`,
    revisionNumber: '1',
    status: 'active',
  },
  {
    title: 'Delivery, Loading & Unloading Operations',
    workActivity: 'Receiving, loading, and unloading of materials, equipment, and plant from delivery vehicles including trucks, semi-trailers, and rigid vehicles at site and depot locations.',
    hazards: `• Being struck by moving vehicles (delivery trucks, forklifts, site vehicles)
• Falling loads during loading/unloading
• Overturning of loads or vehicles
• Crush injuries from unsecured loads shifting
• Slips, trips and falls on loading dock or yard
• Manual handling injuries when unloading by hand
• Inadequate lighting in loading areas
• Reversing vehicles with limited visibility
• Unsecured loads on vehicles
• Pedestrians in vehicle movement areas`,
    risks: `• Struck by vehicle — HIGH
• Crush from falling or shifting load — HIGH
• Forklift/plant incident — HIGH
• Manual handling injury — MEDIUM
• Slip, trip or fall — MEDIUM
• Pedestrian/vehicle conflict — HIGH`,
    controls: `• Establish and enforce a traffic management plan for the loading/unloading area; separate pedestrian and vehicle movements
• Designate a spotter/dogman for all crane and forklift loading/unloading operations
• Ensure delivery vehicles are chocked and engine off before loading/unloading commences
• Verify load is secured before vehicle moves; conduct pre-departure load check
• Only licensed operators to operate forklifts, cranes, and other plant
• Maintain exclusion zones around operating plant; no pedestrians within swing radius or travel path
• Use reversing alarms and spotters for all reversing vehicle movements
• Inspect all lifting equipment (chains, slings, shackles) before use; remove defective equipment from service
• Ensure loads are within rated capacity of lifting equipment and plant
• Communicate with delivery driver before commencing unloading; confirm load details and any hazards
• Conduct pre-start inspection of forklift and other plant before use
• Ensure adequate lighting in loading area for night or low-light operations
• Use mechanical aids for manual unloading; limit manual handling where possible`,
    ppe: `• Safety helmet (hard hat) — mandatory in loading/unloading areas
• High-visibility vest (Class 2 minimum)
• Safety footwear (steel-capped boots)
• Gloves (task-appropriate)
• Safety glasses where required`,
    plantEquipment: `• Forklifts (licensed operators only)
• Pallet jacks (manual and powered)
• Cranes and lifting equipment (certified and inspected)
• Lifting slings, chains, shackles (rated and inspected)
• Wheel chocks
• Loading dock levellers and dock plates`,
    trainingCompetency: `• Forklift licence (LF) for forklift operators
• Dogman/rigger licence where crane operations are involved
• Manual handling training
• Site induction completed
• Traffic management awareness`,
    emergencyControls: `• First aid kit accessible at all times; trained first aider on site
• Emergency contacts displayed at site entry
• In the event of a vehicle or plant incident: isolate area, call 000, do not move injured person unless in immediate danger
• Incident reporting procedure communicated to all workers`,
    environmentalControls: `• Contain and manage any spills from delivery vehicles or plant immediately
• Dispose of packaging and waste materials in designated areas
• Prevent materials from entering stormwater drains`,
    signOffRequirements: `All workers and delivery drivers must sign on to this SWMS prior to commencing loading/unloading operations. Supervisor to verify sign-on and confirm all controls are in place before work begins.`,
    revisionNumber: '1',
    status: 'active',
  },
  {
    title: 'Environmental Controls & Spill Response',
    workActivity: 'Management of environmental hazards on site including spill prevention, spill response, management of hazardous substances, and protection of stormwater, waterways, and surrounding environment.',
    hazards: `• Spill of fuels, oils, hydraulic fluids, or chemicals
• Contamination of stormwater drains and waterways
• Uncontrolled release of sediment or concrete washout
• Improper storage of hazardous substances
• Inadequate labelling of chemicals
• Skin and eye contact with hazardous substances
• Inhalation of chemical vapours
• Fire or explosion from flammable substances
• Environmental harm from uncontrolled waste disposal`,
    risks: `• Environmental contamination of waterways — HIGH
• Regulatory non-compliance and prosecution — HIGH
• Skin/eye injury from chemical contact — MEDIUM
• Fire from flammable substance spill — HIGH
• Inhalation of vapours — MEDIUM`,
    controls: `• Maintain a current register of all hazardous substances on site; ensure Safety Data Sheets (SDS) are accessible to all workers
• Store all hazardous substances in appropriate bunded storage areas; bunding capacity to be at least 110% of the largest container
• Label all containers clearly; never store substances in unlabelled containers
• Inspect plant and equipment regularly for fuel, oil, and hydraulic fluid leaks; repair immediately
• Position drip trays under stationary plant and equipment
• Keep spill kits stocked and accessible at all fuel storage areas and plant refuelling points
• Establish concrete washout areas away from stormwater drains and waterways; never wash concrete into drains
• Install sediment controls (silt fences, sediment basins) where required to prevent sediment runoff
• Conduct daily site inspections to identify and address environmental hazards
• Brief all workers on spill response procedures during site induction
• In the event of a spill: stop the source if safe to do so, contain the spill using spill kit materials, prevent spill from reaching drains or waterways, report to supervisor immediately
• Report all spills (regardless of size) to supervisor; significant spills to be reported to the relevant environmental authority
• Dispose of contaminated spill materials as hazardous waste in accordance with applicable regulations`,
    ppe: `• Chemical-resistant gloves when handling hazardous substances
• Safety glasses or goggles when handling chemicals
• Chemical-resistant apron or coveralls for high-exposure tasks
• Safety footwear (chemical-resistant where required)
• Respiratory protection where vapour inhalation risk exists (refer to SDS)`,
    plantEquipment: `• Spill kits (absorbent pads, booms, granules, disposal bags)
• Bunded storage containers and pallets
• Drip trays for plant and equipment
• Sediment control devices (silt fences, hay bales, sediment basins)
• Concrete washout facilities
• Waste disposal containers (labelled)`,
    trainingCompetency: `• Hazardous substances handling training
• Spill response procedures training
• Site induction (including environmental requirements)
• SDS interpretation`,
    emergencyControls: `• In the event of a significant spill: contain immediately, prevent entry to drains/waterways, notify supervisor, contact environmental authority if required
• In the event of chemical contact with skin or eyes: flush with water for at least 15 minutes, refer to SDS, seek medical attention
• Emergency contacts (including environmental authority hotline) displayed at site entry
• First aid kit accessible at all times`,
    environmentalControls: `• All controls in this SWMS are environmental controls — refer to controls section above
• Conduct post-work environmental inspection to confirm no residual contamination
• Document all spills and environmental incidents in the site register`,
    signOffRequirements: `All workers must sign on to this SWMS prior to commencing work. Workers must confirm they have read, understood, and agree to comply with all controls listed. Supervisor to confirm spill kits are stocked and accessible before sign-on.`,
    revisionNumber: '1',
    status: 'active',
  },
];

export default async function handler(req: Request, res: Response) {
  try {
    const auth = getAuth();
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) {
      if (v) headers.set(k, Array.isArray(v) ? v[0] : v);
    }
    const session = await auth.api.getSession({ headers });
    if (!session?.user) return res.status(401).json({ error: 'Unauthorised' });

    const profile = await db.query.profiles.findFirst({ where: eq(profiles.userId, session.user.id) });
    if (!profile?.companyId) return res.status(403).json({ error: 'No company' });

    const inserted: number[] = [];
    const skipped: string[] = [];

    for (const t of TEMPLATES) {
      // Check if a template with this title already exists for this company
      const [existing] = await db.execute(sql`
        SELECT id FROM swms_templates
        WHERE company_id = ${profile.companyId} AND title = ${t.title}
        LIMIT 1
      `) as unknown as [Array<{ id: number }>, unknown];

      if (existing && existing.length > 0) {
        skipped.push(t.title);
        continue;
      }

      const [result] = await db.execute(sql`
        INSERT INTO swms_templates
          (company_id, title, work_activity, hazards, risks, controls, ppe,
           plant_equipment, training_competency, emergency_controls,
           environmental_controls, sign_off_requirements,
           revision_number, status, created_by_user_id)
        VALUES
          (${profile.companyId}, ${t.title}, ${t.workActivity}, ${t.hazards},
           ${t.risks}, ${t.controls}, ${t.ppe}, ${t.plantEquipment},
           ${t.trainingCompetency}, ${t.emergencyControls},
           ${t.environmentalControls}, ${t.signOffRequirements},
           ${t.revisionNumber}, ${t.status}, ${session.user.id})
      `) as unknown as [ResultSetHeader, unknown];

      inserted.push(result.insertId);
    }

    res.json({
      ok: true,
      inserted: inserted.length,
      skipped: skipped.length,
      skippedTitles: skipped,
      message: skipped.length > 0
        ? `${inserted.length} template(s) added. ${skipped.length} already existed and were skipped.`
        : `${inserted.length} template(s) added successfully.`,
    });
  } catch (err) {
    console.error('POST /api/safety/swms/seed error:', err);
    res.status(500).json({ error: 'Failed to seed templates' });
  }
}
