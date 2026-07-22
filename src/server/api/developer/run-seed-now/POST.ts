/**
 * POST /api/developer/run-seed-now
 * Internal-only: runs the developer account seed directly without auth check.
 * Uses batch inserts for speed. Public route (no auth) — dev use only.
 */
import type { Request, Response } from 'express';
import { db } from '../../../db/client.js';
import { sql } from 'drizzle-orm';
import { readFile } from 'fs/promises';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import type { ResultSetHeader } from 'mysql2';

function seedDir(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  return resolve(here, '..', '..', '..', 'seed', 'starter-packs', 'default');
}

async function loadJson<T>(filename: string): Promise<T> {
  const filePath = resolve(seedDir(), filename);
  const raw = await readFile(filePath, 'utf-8');
  return JSON.parse(raw) as T;
}

const s = (v: string) => String(v ?? '').replace(/'/g, "''");

interface SwmsTemplate {
  title: string; workActivity: string; hazards: string; risks: string;
  controls: string; ppe: string; plantEquipment: string;
  trainingCompetency: string; emergencyControls: string;
  environmentalControls: string; signOffRequirements: string;
  revisionNumber: string; status: string;
}

interface FieldDef {
  label: string; fieldType: string; required?: boolean; options?: string[];
}

interface FormTemplateDef {
  name: string; formType: string; category: string; description: string;
  onJobs: boolean; onFleet: boolean; onDashboard: boolean;
  fields: FieldDef[];
}

interface CostGuideItem {
  description: string; unit: string; rate: string; sortOrder: number;
}

export default async function handler(req: Request, res: Response) {
  const targetEmail = (req.body as { email?: string }).email ?? 'darylwilliams1581@gmail.com';

  try {
    // Find company
    const [userRows] = await db.execute(
      sql.raw(`
        SELECT u.id AS userId, p.company_id AS companyId, c.name AS companyName
        FROM user u
        JOIN profiles p ON p.user_id = u.id
        JOIN companies c ON c.id = p.company_id
        WHERE u.email = '${s(targetEmail)}'
        LIMIT 1
      `)
    ) as unknown as [Array<{ userId: string; companyId: number; companyName: string }>, unknown];

    if (!userRows?.[0]) {
      return res.status(404).json({ error: `No user found: ${targetEmail}` });
    }

    const { companyId, companyName } = userRows[0];

    // Load all seed files in parallel
    const [origSafety, extSafety, origForms, extForms, origCG, extCG] = await Promise.all([
      loadJson<{ swms: SwmsTemplate[] }>('safety.json'),
      loadJson<{ swms: SwmsTemplate[] }>('safety-extended.json'),
      loadJson<FormTemplateDef[]>('forms.json'),
      loadJson<FormTemplateDef[]>('forms-extended.json'),
      loadJson<CostGuideItem[]>('cost-guide.json'),
      loadJson<CostGuideItem[]>('cost-guide-extended.json'),
    ]);

    // Merge by key
    const swmsMap = new Map<string, SwmsTemplate>();
    for (const t of [...origSafety.swms, ...extSafety.swms]) swmsMap.set(t.title, t);
    const allSwms = Array.from(swmsMap.values());

    const formsMap = new Map<string, FormTemplateDef>();
    for (const f of [...origForms, ...extForms]) formsMap.set(f.name, f);
    const allForms = Array.from(formsMap.values());

    const cgMap = new Map<string, CostGuideItem>();
    for (const item of [...origCG, ...extCG]) cgMap.set(item.description, item);
    const allCG = Array.from(cgMap.values());

    // ── SWMS — batch insert ───────────────────────────────────────────────────
    await db.execute(sql.raw(`DELETE FROM swms_templates WHERE company_id = ${companyId}`));

    const swmsValues = allSwms.map(t =>
      `(${companyId},'${s(t.title)}','${s(t.workActivity)}','${s(t.hazards)}','${s(t.risks)}',` +
      `'${s(t.controls)}','${s(t.ppe)}','${s(t.plantEquipment)}','${s(t.trainingCompetency)}',` +
      `'${s(t.emergencyControls)}','${s(t.environmentalControls)}','${s(t.signOffRequirements)}',` +
      `'${s(t.revisionNumber)}','${s(t.status)}')`
    ).join(',');

    await db.execute(sql.raw(`
      INSERT INTO swms_templates
        (company_id, title, work_activity, hazards, risks, controls, ppe,
         plant_equipment, training_competency, emergency_controls,
         environmental_controls, sign_off_requirements, revision_number, status)
      VALUES ${swmsValues}
    `));

    // ── Forms — batch insert templates, then batch insert fields ─────────────
    const [existingTmpls] = await db.execute(
      sql.raw(`SELECT id FROM form_templates WHERE company_id = ${companyId}`)
    ) as unknown as [Array<{ id: number }>, unknown];

    if (existingTmpls.length > 0) {
      const ids = existingTmpls.map(t => t.id).join(',');
      await db.execute(sql.raw(`DELETE FROM form_template_fields WHERE template_id IN (${ids})`));
    }
    await db.execute(sql.raw(`DELETE FROM form_templates WHERE company_id = ${companyId}`));

    let formsCreated = 0;
    let fieldsCreated = 0;

    // Insert forms one at a time (need insertId for fields), but batch fields per form
    for (const t of allForms) {
      const [result] = await db.execute(sql.raw(`
        INSERT INTO form_templates
          (company_id, name, form_type, category, description, is_active, on_jobs, on_fleet, on_dashboard)
        VALUES (${companyId},'${s(t.name)}','${s(t.formType)}','${s(t.category)}',
          '${s(t.description)}',1,${t.onJobs?1:0},${t.onFleet?1:0},${t.onDashboard?1:0})
      `)) as unknown as [ResultSetHeader, unknown];

      const templateId = result.insertId;
      formsCreated++;

      if (t.fields.length > 0) {
        const fieldValues = t.fields.map((f, i) => {
          const optJson = f.options ? `'${JSON.stringify(f.options).replace(/'/g,"''")}'` : 'NULL';
          return `(${templateId},${companyId},'${s(f.label)}','${s(f.fieldType)}',${f.required?1:0},${optJson},${i})`;
        }).join(',');

        await db.execute(sql.raw(`
          INSERT INTO form_template_fields
            (template_id, company_id, label, field_type, required, options_json, field_order)
          VALUES ${fieldValues}
        `));
        fieldsCreated += t.fields.length;
      }
    }

    // ── Cost Guide — batch insert ─────────────────────────────────────────────
    await db.execute(sql.raw(`DELETE FROM cost_guide_items WHERE company_id = ${companyId}`));

    // Batch in chunks of 50 to avoid oversized queries
    const chunkSize = 50;
    let cgCreated = 0;
    for (let i = 0; i < allCG.length; i += chunkSize) {
      const chunk = allCG.slice(i, i + chunkSize);
      const cgValues = chunk.map(item =>
        `(${companyId},'${s(item.description)}','${s(item.unit)}','${s(item.rate)}',${item.sortOrder})`
      ).join(',');
      await db.execute(sql.raw(`
        INSERT INTO cost_guide_items (company_id, description, unit, rate, sort_order)
        VALUES ${cgValues}
      `));
      cgCreated += chunk.length;
    }

    console.log(`[run-seed-now] Done — SWMS: ${allSwms.length}, Forms: ${formsCreated} (${fieldsCreated} fields), Cost Guide: ${cgCreated}`);

    return res.json({
      ok: true,
      targetEmail,
      companyId,
      companyName,
      swms: { created: allSwms.length },
      forms: { created: formsCreated, fields: fieldsCreated },
      costGuide: { created: cgCreated },
      message: `Seeded ${allSwms.length} SWMS, ${formsCreated} forms (${fieldsCreated} fields), ${cgCreated} cost guide items for ${companyName}.`,
    });

  } catch (err) {
    console.error('[run-seed-now] Fatal:', err);
    return res.status(500).json({ error: String(err) });
  }
}
