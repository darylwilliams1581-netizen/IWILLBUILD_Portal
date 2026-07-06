/**
 * POST /api/safety/swms/seed
 * Seeds a single starter SWMS template for the company.
 * Additional templates should be imported via POST /api/safety/swms/import-docx.
 */
import type { Request, Response } from 'express';
import { db } from '../../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getAuth } from '../../../../../lib/auth/auth.js';
import { profiles } from '../../../../db/schema.js';
import { eq } from 'drizzle-orm';
import type { ResultSetHeader } from 'mysql2';

// ── Single starter template ────────────────────────────────────────────────────

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
• Install traffic control devices (signs, cones, barriers, delineators) in accordance with the approved TMP
• Conduct pre-start briefing with all workers covering TMP, emergency procedures, and escape routes
• Ensure all workers wear high-visibility PPE at all times within the work zone
• Establish a safe exclusion zone between workers and live traffic lanes
• Use spotters where line of sight is limited
• Conduct regular reviews of TMP if conditions change (weather, traffic volume, scope changes)
• Limit work hours to reduce fatigue; rotate workers on traffic control duties`,
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
        ? `Starter template already exists.`
        : `Starter template added. Import your own SWMS via DOCX upload.`,
    });
  } catch (err) {
    console.error('POST /api/safety/swms/seed error:', err);
    res.status(500).json({ error: 'Failed to seed template' });
  }
}
