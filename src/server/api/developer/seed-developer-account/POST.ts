/**
 * POST /api/developer/seed-developer-account
 *
 * Platform owner only — seeds the developer account (darylwilliams1581@gmail.com)
 * with a comprehensive set of SWMS templates, form templates, and cost guide items
 * so they can be refined and published to the global library.
 *
 * This endpoint:
 *  - Finds the company belonging to the target email
 *  - Force-replaces SWMS templates (deletes existing, inserts full set)
 *  - Force-replaces form templates and their fields
 *  - Force-replaces cost guide items
 *  - Does NOT touch jobs, fleet, stakeholders, or safety plans
 *  - Does NOT set starter_pack_loaded (so normal new-user seeding still works)
 *
 * Access: requirePlatformOwner middleware in entry.ts
 */
import type { Request, Response } from 'express';
import { db } from '../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getAuth } from '../../../../lib/auth/auth.js';
import { readFile } from 'fs/promises';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import type { ResultSetHeader } from 'mysql2';

// ── Resolve seed data directory ───────────────────────────────────────────────

function seedDir(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  // dev:  src/server/api/developer/seed-developer-account → up 4 → src/server/seed/starter-packs/default
  // prod: dist/server/api/developer/seed-developer-account → up 4 → dist/server/seed/starter-packs/default
  return resolve(here, '..', '..', '..', 'seed', 'starter-packs', 'default');
}

async function loadJson<T>(filename: string): Promise<T> {
  const filePath = resolve(seedDir(), filename);
  const raw = await readFile(filePath, 'utf-8');
  return JSON.parse(raw) as T;
}

// ── Types ─────────────────────────────────────────────────────────────────────

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

// ── Seed SWMS ─────────────────────────────────────────────────────────────────

async function seedSwms(companyId: number): Promise<{ created: number; errors: string[] }> {
  const errors: string[] = [];
  let created = 0;

  // Load both the original and extended SWMS files
  const [original, extended] = await Promise.all([
    loadJson<{ swms: SwmsTemplate[] }>('safety.json'),
    loadJson<{ swms: SwmsTemplate[] }>('safety-extended.json'),
  ]);

  // Merge: extended overrides originals by title, then adds new ones
  const allByTitle = new Map<string, SwmsTemplate>();
  for (const s of original.swms) allByTitle.set(s.title, s);
  for (const s of extended.swms) allByTitle.set(s.title, s);
  const allSwms = Array.from(allByTitle.values());

  // Delete existing SWMS templates for this company
  await db.execute(sql.raw(`DELETE FROM swms_templates WHERE company_id = ${companyId}`));

  for (const t of allSwms) {
    try {
      const safeField = (v: string) => v.replace(/'/g, "''");
      await db.execute(sql.raw(`
        INSERT INTO swms_templates
          (company_id, title, work_activity, hazards, risks, controls, ppe,
           plant_equipment, training_competency, emergency_controls,
           environmental_controls, sign_off_requirements, revision_number, status)
        VALUES
          (${companyId},
           '${safeField(t.title)}',
           '${safeField(t.workActivity)}',
           '${safeField(t.hazards)}',
           '${safeField(t.risks)}',
           '${safeField(t.controls)}',
           '${safeField(t.ppe)}',
           '${safeField(t.plantEquipment)}',
           '${safeField(t.trainingCompetency)}',
           '${safeField(t.emergencyControls)}',
           '${safeField(t.environmentalControls)}',
           '${safeField(t.signOffRequirements)}',
           '${safeField(t.revisionNumber)}',
           '${safeField(t.status)}')
      `));
      created++;
    } catch (e) {
      errors.push(`SWMS "${t.title}": ${String(e).slice(0, 100)}`);
    }
  }

  return { created, errors };
}

// ── Seed Form Templates ───────────────────────────────────────────────────────

async function seedForms(companyId: number): Promise<{ created: number; errors: string[] }> {
  const errors: string[] = [];
  let created = 0;

  // Load both original and extended forms
  const [original, extended] = await Promise.all([
    loadJson<FormTemplateDef[]>('forms.json'),
    loadJson<FormTemplateDef[]>('forms-extended.json'),
  ]);

  // Merge by name
  const allByName = new Map<string, FormTemplateDef>();
  for (const f of original) allByName.set(f.name, f);
  for (const f of extended) allByName.set(f.name, f);
  const allForms = Array.from(allByName.values());

  // Delete existing form templates and their fields for this company
  // Fields have a FK to form_templates, so delete templates cascades or we delete fields first
  const [existingTemplates] = await db.execute(
    sql.raw(`SELECT id FROM form_templates WHERE company_id = ${companyId}`)
  ) as unknown as [Array<{ id: number }>, unknown];

  for (const tmpl of existingTemplates) {
    await db.execute(sql.raw(`DELETE FROM form_template_fields WHERE template_id = ${tmpl.id}`));
  }
  await db.execute(sql.raw(`DELETE FROM form_templates WHERE company_id = ${companyId}`));

  for (const t of allForms) {
    try {
      const safeStr = (v: string) => v.replace(/'/g, "''");
      const [result] = await db.execute(sql.raw(`
        INSERT INTO form_templates
          (company_id, name, form_type, category, description, is_active, on_jobs, on_fleet, on_dashboard)
        VALUES
          (${companyId},
           '${safeStr(t.name)}',
           '${safeStr(t.formType)}',
           '${safeStr(t.category)}',
           '${safeStr(t.description)}',
           1,
           ${t.onJobs ? 1 : 0},
           ${t.onFleet ? 1 : 0},
           ${t.onDashboard ? 1 : 0})
      `)) as unknown as [ResultSetHeader, unknown];

      const templateId = result.insertId;

      for (let i = 0; i < t.fields.length; i++) {
        const f = t.fields[i];
        const optionsJson = f.options ? `'${JSON.stringify(f.options).replace(/'/g, "''")}'` : 'NULL';
        await db.execute(sql.raw(`
          INSERT INTO form_template_fields
            (template_id, company_id, label, field_type, required, options_json, field_order)
          VALUES
            (${templateId}, ${companyId},
             '${safeStr(f.label)}',
             '${safeStr(f.fieldType)}',
             ${f.required ? 1 : 0},
             ${optionsJson},
             ${i})
        `));
      }

      created++;
    } catch (e) {
      errors.push(`Form "${t.name}": ${String(e).slice(0, 100)}`);
    }
  }

  return { created, errors };
}

// ── Seed Cost Guide ───────────────────────────────────────────────────────────

async function seedCostGuide(companyId: number): Promise<{ created: number; errors: string[] }> {
  const errors: string[] = [];
  let created = 0;

  // Load both original and extended cost guide
  const [original, extended] = await Promise.all([
    loadJson<CostGuideItem[]>('cost-guide.json'),
    loadJson<CostGuideItem[]>('cost-guide-extended.json'),
  ]);

  // Merge by description
  const allByDesc = new Map<string, CostGuideItem>();
  for (const item of original) allByDesc.set(item.description, item);
  for (const item of extended) allByDesc.set(item.description, item);
  const allItems = Array.from(allByDesc.values());

  // Delete existing cost guide items for this company
  await db.execute(sql.raw(`DELETE FROM cost_guide_items WHERE company_id = ${companyId}`));

  for (const item of allItems) {
    try {
      const safeStr = (v: string) => v.replace(/'/g, "''");
      await db.execute(sql.raw(`
        INSERT INTO cost_guide_items (company_id, description, unit, rate, sort_order)
        VALUES (${companyId}, '${safeStr(item.description)}', '${safeStr(item.unit)}', '${safeStr(item.rate)}', ${item.sortOrder})
      `));
      created++;
    } catch (e) {
      errors.push(`Cost guide "${item.description}": ${String(e).slice(0, 100)}`);
    }
  }

  return { created, errors };
}

// ── Main handler ──────────────────────────────────────────────────────────────

export default async function handler(req: Request, res: Response) {
  try {
    // Auth check
    const auth = getAuth();
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) {
      if (v) headers.set(k, Array.isArray(v) ? v[0] : v);
    }
    const session = await auth.api.getSession({ headers });
    if (!session?.user) return res.status(401).json({ error: 'Unauthorised' });
    // Platform owner check handled by requirePlatformOwner middleware in entry.ts

    const targetEmail = (req.body as { email?: string }).email ?? 'darylwilliams1581@gmail.com';

    // Find the target user's company
    const [userRows] = await db.execute(
      sql.raw(`
        SELECT u.id AS userId, p.company_id AS companyId, c.name AS companyName
        FROM user u
        JOIN profiles p ON p.user_id = u.id
        JOIN companies c ON c.id = p.company_id
        WHERE u.email = '${targetEmail.replace(/'/g, "''")}'
        LIMIT 1
      `)
    ) as unknown as [Array<{ userId: string; companyId: number; companyName: string }>, unknown];

    if (!userRows?.[0]) {
      return res.status(404).json({ error: `No user found with email: ${targetEmail}` });
    }

    const { companyId, companyName } = userRows[0];

    console.log(`[seed-developer] Seeding company ${companyId} (${companyName}) for ${targetEmail}`);

    // Run all three sections in parallel
    const [swmsResult, formsResult, costGuideResult] = await Promise.all([
      seedSwms(companyId),
      seedForms(companyId),
      seedCostGuide(companyId),
    ]);

    const allErrors = [
      ...swmsResult.errors,
      ...formsResult.errors,
      ...costGuideResult.errors,
    ];

    console.log(`[seed-developer] Done — SWMS: ${swmsResult.created}, Forms: ${formsResult.created}, Cost Guide: ${costGuideResult.created}`);

    return res.json({
      ok: true,
      targetEmail,
      companyId,
      companyName,
      results: {
        swms: { created: swmsResult.created, errors: swmsResult.errors },
        forms: { created: formsResult.created, errors: formsResult.errors },
        costGuide: { created: costGuideResult.created, errors: costGuideResult.errors },
      },
      totalErrors: allErrors.length,
      errors: allErrors,
      message: allErrors.length === 0
        ? `Seeded ${swmsResult.created} SWMS, ${formsResult.created} forms, ${costGuideResult.created} cost guide items for ${companyName}.`
        : `Seeding completed with ${allErrors.length} error(s). Check results for details.`,
    });

  } catch (err) {
    console.error('[seed-developer] Fatal error:', err);
    return res.status(500).json({ error: 'Seed failed', detail: String(err) });
  }
}
