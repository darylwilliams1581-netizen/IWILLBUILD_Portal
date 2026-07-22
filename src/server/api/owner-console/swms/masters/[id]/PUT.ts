/**
 * PUT /api/owner-console/swms/masters/:id
 * Updates a platform master SWMS template.
 * Accepts both the metadata-only shape (from EditModal) and the full
 * SwmsBodyBuilder payload (title, category, workActivity, purposeScope,
 * authorName, approvedByName, revisionNumber, reviewDate, status,
 * hazards, controls, ppe, plantEquipment, emergencyControls,
 * swms_body (string or object), build_mode, document_type).
 * Platform owner only.
 */
import type { Request, Response } from 'express';
import { db } from '../../../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getPlatformOwnerInfo } from '../../../../../lib/platform-owner-guard.js';

export default async function handler(req: Request, res: Response) {
  const info = await getPlatformOwnerInfo(req);
  if (!info) return res.status(401).json({ error: 'Unauthorised' });
  if (!info.isPlatformOwner) return res.status(403).json({ error: 'Platform owner access required' });

  const id = parseInt(req.params.id, 10);
  if (!id) return res.status(400).json({ error: 'Invalid id' });

  try {
    // Accept both camelCase (SwmsBodyBuilder) and snake_case (EditModal) field names
    const b = req.body as Record<string, unknown>;

    const safe = (s: string) => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");
    const str  = (v: unknown) => (v !== undefined && v !== null ? String(v) : null);

    const title          = str(b.title);
    const category       = str(b.category);
    const buildMode      = str(b.build_mode ?? b.buildMode);
    const documentType   = str(b.document_type ?? b.documentType);
    const status         = str(b.status);
    const revision       = str(b.revision_number ?? b.revisionNumber);
    const reviewDate     = str(b.review_date ?? b.reviewDate);
    const authorName     = str(b.author_name ?? b.authorName);
    const approvedBy     = str(b.approved_by_name ?? b.approvedByName);
    const workActivity   = str(b.work_activity ?? b.workActivity);
    const purposeScope   = str(b.purpose_scope ?? b.purposeScope);
    const hazards        = str(b.hazards);
    const controls       = str(b.controls);
    const ppe            = str(b.ppe);
    const plantEquipment = str(b.plant_equipment ?? b.plantEquipment);
    const emergencyCtrl  = str(b.emergency_controls ?? b.emergencyControls);

    // swms_body may arrive as a pre-stringified JSON string or as an object
    let swmsBodyStr: string | null = null;
    if (b.swms_body !== undefined && b.swms_body !== null) {
      swmsBodyStr = typeof b.swms_body === 'string' ? b.swms_body : JSON.stringify(b.swms_body);
    }

    const setClauses: string[] = ['updated_at = NOW()'];

    if (title !== null)          setClauses.push(`title = '${safe(title)}'`);
    if (category !== null)       setClauses.push(`category = '${safe(category)}'`);
    if (buildMode !== null)      setClauses.push(`build_mode = '${safe(buildMode)}'`);
    if (documentType !== null)   setClauses.push(`document_type = '${safe(documentType)}'`);
    if (status !== null)         setClauses.push(`status = '${safe(status)}'`);
    if (revision !== null)       setClauses.push(`revision_number = '${safe(revision)}'`);
    if (reviewDate !== null)     setClauses.push(`review_date = '${safe(reviewDate)}'`);
    if (authorName !== null)     setClauses.push(`author_name = '${safe(authorName)}'`);
    if (approvedBy !== null)     setClauses.push(`approved_by_name = '${safe(approvedBy)}'`);
    if (workActivity !== null)   setClauses.push(`work_activity = '${safe(workActivity)}'`);
    if (purposeScope !== null)   setClauses.push(`purpose_scope = '${safe(purposeScope)}'`);
    if (hazards !== null)        setClauses.push(`hazards = '${safe(hazards)}'`);
    if (controls !== null)       setClauses.push(`controls = '${safe(controls)}'`);
    if (ppe !== null)            setClauses.push(`ppe = '${safe(ppe)}'`);
    if (plantEquipment !== null) setClauses.push(`plant_equipment = '${safe(plantEquipment)}'`);
    if (emergencyCtrl !== null)  setClauses.push(`emergency_controls = '${safe(emergencyCtrl)}'`);
    if (swmsBodyStr !== null)    setClauses.push(`swms_body = '${safe(swmsBodyStr)}'`);

    await db.execute(sql.raw(
      `UPDATE swms_templates SET ${setClauses.join(', ')} WHERE id = ${id} AND is_platform_master = 1`
    ));

    const [rows] = await db.execute(sql.raw(
      `SELECT * FROM swms_templates WHERE id = ${id} LIMIT 1`
    )) as unknown as [Array<Record<string, unknown>>, unknown];

    const record = rows?.[0] ?? { id };
    // Return both shapes so EditModal and SwmsBodyBuilder are both satisfied
    return res.json({ master: record, swms: record });
  } catch (err) {
    console.error('PUT /api/owner-console/swms/masters/:id error:', err);
    return res.status(500).json({ error: String(err) });
  }
}
