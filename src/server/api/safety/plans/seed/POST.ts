import type { Request, Response } from 'express';
import { db } from '../../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getAuth } from '../../../../../lib/auth/auth.js';
import { profiles } from '../../../../db/schema.js';
import { eq } from 'drizzle-orm';
import type { ResultSetHeader } from 'mysql2';

// ── Generic Safety Plan templates derived from WHS & Environmental Management
//    Plan reference material. No company names, branding, or project-specific
//    references. All content is industry-standard and jurisdiction-neutral.
// ─────────────────────────────────────────────────────────────────────────────

const TEMPLATES = [
  {
    title: 'Construction Site Safety Management Plan',
    isPrincipalContractor: true,
    siteRules: `SITE RULES — ALL PERSONS ON SITE MUST COMPLY

1. INDUCTION
   • All workers, visitors, and contractors must complete a site induction before entering the work area.
   • Induction records must be signed and retained on site.

2. PERSONAL PROTECTIVE EQUIPMENT (PPE)
   • Hard hat (safety helmet) must be worn at all times in designated areas.
   • High-visibility vest or clothing must be worn at all times on site.
   • Safety footwear (steel-capped boots) must be worn at all times.
   • Additional PPE (gloves, eye protection, hearing protection, respiratory protection) must be worn as required by the task or SWMS.

3. ALCOHOL AND DRUGS
   • No person is permitted on site under the influence of alcohol or drugs (including prescription medication that impairs performance).
   • Random drug and alcohol testing may be conducted.

4. MOBILE PHONES
   • Mobile phone use while operating plant, equipment, or vehicles is prohibited.
   • Hands-free use only while driving on site.

5. SMOKING
   • Smoking is permitted in designated areas only.
   • No smoking within 10 metres of any flammable materials, fuel storage, or plant.

6. SPEED LIMITS
   • Maximum site speed limit: 10 km/h unless otherwise posted.
   • Pedestrians have right of way at all times.

7. PLANT AND EQUIPMENT
   • Only licensed and competent operators may operate plant and equipment.
   • Pre-start inspections must be completed and recorded before operating any plant.
   • Defective plant must be tagged out and reported immediately.

8. HAZARD REPORTING
   • All hazards, near misses, and incidents must be reported to the site supervisor immediately.
   • Do not leave a hazard unattended — isolate and report.

9. HOUSEKEEPING
   • Work areas must be kept clean and tidy at all times.
   • Materials must be stored in designated areas.
   • Walkways and emergency exits must remain clear at all times.

10. EMERGENCY PROCEDURES
    • Familiarise yourself with emergency assembly points and evacuation routes on arrival.
    • In an emergency: stop work, alert others, evacuate to assembly point, call 000 if required.
    • Do not re-enter the site until the all-clear is given by the site supervisor.

11. VISITORS
    • All visitors must sign in at the site office and be accompanied by a site representative at all times.
    • Visitors must wear appropriate PPE.

12. ENVIRONMENTAL
    • No materials, waste, or chemicals are to be discharged to stormwater drains or waterways.
    • Spills must be contained and reported immediately.
    • Waste must be disposed of in designated bins and removed from site regularly.`,

    highRiskActivities: `HIGH RISK CONSTRUCTION WORK — APPLICABLE ACTIVITIES

The following high risk construction work activities have been identified for this project. A Safe Work Method Statement (SWMS) must be prepared and implemented before commencing each activity.

☐ Work involving a risk of a person falling more than 2 metres
☐ Work on a telecommunication tower
☐ Demolition of load-bearing structure
☐ Work involving disturbance of asbestos
☐ Work involving structural alterations requiring temporary support
☐ Work in or adjacent to a road or railway corridor used by traffic
☐ Work in an area with a contaminated or flammable atmosphere
☐ Tilt-up or precast concrete work
☐ Work on or near pressurised gas distribution mains or piping
☐ Work on or near chemical, fuel, or refrigerant lines
☐ Work on or near energised electrical installations or services
☐ Work in an area where there are artificial extremes of temperature
☐ Work in or around water or other liquid where there is a risk of drowning
☐ Work involving diving
☐ Work in a confined space
☐ Work involving explosives
☐ Work using a crane, hoist, or other powered mobile plant
☐ Work involving excavation deeper than 1.5 metres
☐ Tunnelling work`,

    evacuationNotes: `EMERGENCY EVACUATION PROCEDURE

1. RAISE THE ALARM
   • Upon discovering an emergency (fire, explosion, serious injury, gas leak, structural failure), immediately raise the alarm by calling out loudly and activating the nearest alarm point if available.
   • Call 000 for fire, ambulance, or police as required.

2. STOP WORK AND EVACUATE
   • All workers must immediately stop work and move to the designated Emergency Assembly Point.
   • Do not stop to collect personal belongings.
   • Do not use lifts (if applicable).
   • Assist any injured or mobility-impaired persons to evacuate.

3. ASSEMBLY POINT
   • Proceed to the designated Emergency Assembly Point as shown on the site plan.
   • Do not block access routes for emergency services.

4. ROLL CALL
   • The site supervisor or designated warden will conduct a roll call of all persons.
   • Report any missing persons to the site supervisor immediately.

5. DO NOT RE-ENTER
   • No person is to re-enter the site until the all-clear is given by the site supervisor or emergency services.

6. INCIDENT REPORTING
   • All emergencies must be recorded in the site incident register.
   • Notify the relevant authority (SafeWork/WorkSafe) if required under applicable legislation.

FIRST AID
   • First aid kit location: Site office / site amenities area.
   • Trained first aider on site at all times during work hours.
   • Nearest hospital and emergency services details displayed at site entry.`,

    siteAddress: null,
    siteSupervisor: null,
    firstAidOfficer: null,
    emergencyContact: '000 (Police / Fire / Ambulance)',
    nearestHospital: null,
    emergencyAssemblyPoint: null,
    projectValue: null,
    requiredPosters: `• Safe Work Australia — Work Health and Safety Act obligations
• Workers' Compensation — your rights and obligations
• Emergency contacts and evacuation plan
• Site rules and induction requirements
• Asbestos register (if applicable)
• Hazardous chemicals register / SDS index
• First aid kit location
• Incident reporting procedure`,
    status: 'draft',
  },

  {
    title: 'WHS & Environmental Management Plan — Civil Works',
    isPrincipalContractor: true,
    siteRules: `SITE RULES — CIVIL WORKS

1. INDUCTION & AUTHORISATION
   • All personnel must complete site-specific induction before commencing work.
   • Subcontractors must provide evidence of current licences, tickets, and insurances before starting.
   • Visitors must sign in and be escorted at all times.

2. PPE REQUIREMENTS
   • Hard hat, high-visibility clothing, and steel-capped boots are mandatory at all times.
   • Task-specific PPE (eye protection, hearing protection, gloves, respiratory protection) must be worn as required.
   • PPE must be maintained in good condition; damaged PPE must be replaced immediately.

3. PLANT, EQUIPMENT & VEHICLES
   • All plant operators must hold current licences/tickets for the equipment being operated.
   • Pre-start inspections are mandatory for all plant and vehicles.
   • No unauthorised persons within the swing radius or travel path of operating plant.
   • Spotters must be used for all reversing movements where visibility is limited.
   • Vehicle speed limit on site: 10 km/h.

4. EXCAVATION & UNDERGROUND SERVICES
   • Dial Before You Dig (DBYD) must be completed before any excavation.
   • Underground service plans must be on site and reviewed before excavation commences.
   • Hand excavation required within 300mm of any located service.
   • Excavations deeper than 1.5m require a SWMS and appropriate shoring or batter.

5. TRAFFIC MANAGEMENT
   • A Traffic Management Plan (TMP) must be in place before any works affecting public roads or footpaths.
   • Traffic controllers must hold current certification.
   • All traffic control devices must comply with applicable standards.

6. ENVIRONMENTAL CONTROLS
   • Sediment and erosion controls must be installed and maintained throughout the works.
   • No materials, concrete washout, or chemicals to enter stormwater drains or waterways.
   • Spill kits must be available at all fuel storage and plant refuelling points.
   • Dust suppression measures must be implemented as required.

7. HAZARD & INCIDENT REPORTING
   • All hazards, near misses, and incidents must be reported to the site supervisor immediately.
   • Serious incidents must be reported to the relevant authority (SafeWork/WorkSafe) as required.

8. HOUSEKEEPING
   • Site to be maintained in a clean and tidy condition at all times.
   • Waste to be segregated and removed from site regularly.`,

    highRiskActivities: `HIGH RISK ACTIVITIES — CIVIL WORKS

The following high risk activities are anticipated for this project:

☐ Excavation deeper than 1.5 metres (trenching, bulk earthworks)
☐ Work in or adjacent to a road or railway corridor
☐ Work on or near underground services (water, gas, electrical, telecommunications)
☐ Operation of heavy plant (excavators, graders, rollers, trucks)
☐ Concrete placement and finishing
☐ Pipe laying and installation
☐ Work near or over water (drainage, culverts, waterways)
☐ Confined space entry (pits, manholes, culverts)
☐ Work involving temporary traffic management
☐ Demolition of existing structures
☐ Work involving hazardous materials (asbestos, contaminated soil)
☐ Night works or works in low-visibility conditions

A SWMS must be prepared and implemented for each applicable high risk activity before work commences.`,

    evacuationNotes: `EMERGENCY RESPONSE PROCEDURE — CIVIL WORKS

MEDICAL EMERGENCY
• Call 000 immediately for serious injuries.
• Do not move an injured person unless they are in immediate danger.
• Trained first aider to attend and administer first aid until emergency services arrive.
• Clear access route for ambulance.

FIRE / EXPLOSION
• Evacuate all personnel from the immediate area.
• Call 000.
• Do not attempt to fight a fire unless trained and it is safe to do so.
• Isolate fuel and ignition sources if safe.

UNDERGROUND SERVICE STRIKE
• Stop work immediately.
• Evacuate the area.
• For gas: call the gas network emergency line and 000. Do not use mobile phones near the strike.
• For electrical: call the electricity network emergency line and 000. Do not approach or touch.
• For water/sewer: isolate if possible, notify the relevant authority.

ENVIRONMENTAL SPILL
• Contain the spill using spill kit materials.
• Prevent entry to stormwater drains and waterways.
• Notify site supervisor immediately.
• Report to relevant environmental authority if required.

ASSEMBLY POINT
• All personnel to proceed to the designated Emergency Assembly Point.
• Site supervisor to conduct roll call.
• Do not re-enter until all-clear given.`,

    siteAddress: null,
    siteSupervisor: null,
    firstAidOfficer: null,
    emergencyContact: '000 (Police / Fire / Ambulance)',
    nearestHospital: null,
    emergencyAssemblyPoint: null,
    projectValue: null,
    requiredPosters: `• Emergency contacts and evacuation plan
• Site rules and induction requirements
• Traffic Management Plan (displayed at site entry)
• Underground services plan
• Hazardous chemicals register / SDS index
• First aid kit location
• Incident reporting procedure
• Environmental management controls`,
    status: 'draft',
  },

  {
    title: 'Subcontractor Safety Management Plan',
    isPrincipalContractor: false,
    siteRules: `SUBCONTRACTOR SITE RULES

As a subcontractor on this project, you are required to comply with:
• The principal contractor's site rules and safety management plan
• All applicable WHS/OHS legislation and regulations
• Your own company's safety management system
• Any SWMS or safe work procedures applicable to your scope of work

KEY OBLIGATIONS

1. INDUCTION
   • All your workers must complete the principal contractor's site induction before starting work.
   • Provide evidence of relevant licences, tickets, and insurances to the principal contractor before commencing.

2. SWMS
   • Prepare and implement a SWMS for all high risk construction work within your scope.
   • SWMS must be reviewed and signed by all workers before commencing the relevant work.
   • Notify the principal contractor of any changes to your SWMS.

3. SUPERVISION
   • Ensure adequate supervision of all your workers at all times.
   • Your supervisor must be contactable during all work hours.

4. INCIDENTS & HAZARDS
   • Report all incidents, near misses, and hazards to the principal contractor's site supervisor immediately.
   • Do not alter or disturb the scene of a serious incident.

5. PPE
   • Ensure all your workers wear appropriate PPE at all times.
   • You are responsible for providing PPE to your workers.

6. PLANT & EQUIPMENT
   • All plant and equipment brought to site must be in safe working condition.
   • Pre-start inspection records must be available on request.
   • Provide evidence of current registration, inspection, and operator licences.

7. ENVIRONMENTAL
   • Comply with all environmental controls on site.
   • You are responsible for managing waste generated by your work.`,

    highRiskActivities: `HIGH RISK ACTIVITIES — SUBCONTRACTOR SCOPE

Identify and list all high risk construction work activities within your scope of work. A SWMS must be prepared for each:

☐ Work at heights (falls > 2 metres)
☐ Excavation (> 1.5 metres depth)
☐ Confined space entry
☐ Work near energised electrical installations
☐ Work near underground services
☐ Work in or adjacent to a road corridor
☐ Operation of cranes or hoists
☐ Demolition work
☐ Work with hazardous substances
☐ Other (specify in SWMS register)`,

    evacuationNotes: `EMERGENCY PROCEDURE — SUBCONTRACTOR

In the event of an emergency:
1. Stop work immediately and raise the alarm.
2. Evacuate all your workers to the designated Emergency Assembly Point.
3. Call 000 if required.
4. Notify the principal contractor's site supervisor immediately.
5. Account for all your workers in the roll call.
6. Do not re-enter the site until the all-clear is given.
7. Cooperate fully with emergency services and the principal contractor.
8. Record the incident in your own incident register and report to the principal contractor.`,

    siteAddress: null,
    siteSupervisor: null,
    firstAidOfficer: null,
    emergencyContact: '000 (Police / Fire / Ambulance)',
    nearestHospital: null,
    emergencyAssemblyPoint: null,
    projectValue: null,
    requiredPosters: `• Principal contractor's site rules (displayed at site entry)
• Emergency contacts and evacuation plan
• SWMS register for your scope of work
• Licences and tickets for your workers
• First aid kit location (your own kit on site)`,
    status: 'draft',
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
      // Skip if a plan with this title already exists for this company
      const [existing] = await db.execute(sql`
        SELECT id FROM safety_plans
        WHERE company_id = ${profile.companyId} AND title = ${t.title}
        LIMIT 1
      `) as unknown as [Array<{ id: number }>, unknown];

      if (existing && existing.length > 0) {
        skipped.push(t.title);
        continue;
      }

      const [result] = await db.execute(sql`
        INSERT INTO safety_plans
          (company_id, job_id, title, project_value, is_principal_contractor,
           site_address, site_supervisor, first_aid_officer, emergency_contact,
           nearest_hospital, emergency_assembly_point, evacuation_notes,
           site_rules, high_risk_activities, required_posters,
           status, created_by_user_id)
        VALUES
          (${profile.companyId}, NULL, ${t.title}, ${t.projectValue},
           ${t.isPrincipalContractor ? 1 : 0},
           ${t.siteAddress}, ${t.siteSupervisor}, ${t.firstAidOfficer},
           ${t.emergencyContact}, ${t.nearestHospital},
           ${t.emergencyAssemblyPoint}, ${t.evacuationNotes},
           ${t.siteRules}, ${t.highRiskActivities}, ${t.requiredPosters},
           ${t.status}, ${session.user.id})
      `) as unknown as [ResultSetHeader, unknown];

      inserted.push(result.insertId);
    }

    res.json({
      ok: true,
      inserted: inserted.length,
      skipped: skipped.length,
      skippedTitles: skipped,
      message: skipped.length > 0
        ? `${inserted.length} plan(s) added. ${skipped.length} already existed and were skipped.`
        : `${inserted.length} plan(s) added successfully.`,
    });
  } catch (err) {
    console.error('POST /api/safety/plans/seed error:', err);
    res.status(500).json({ error: 'Failed to seed safety plans' });
  }
}
