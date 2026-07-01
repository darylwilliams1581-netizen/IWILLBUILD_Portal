/**
 * seedStarterPack — Company Starter Pack Auto-Load
 * ─────────────────────────────────────────────────────────────────────────────
 * Seeds a brand-new company with ready-to-use starter content so the portal
 * is never empty on first login.
 *
 * RULES:
 *  - Company-scoped: every INSERT uses the target companyId.
 *  - Once-only guard: checks companies.starter_pack_loaded before running.
 *  - Idempotent: each section skips rows that already exist (by name/title).
 *  - Never copies data from another company.
 *  - No destructive operations.
 *  - Safe to call fire-and-forget (errors are caught and logged, not thrown).
 *
 * DATA:
 *  All seed content lives in JSON files under
 *  src/server/seed/starter-packs/default/ (copied to dist/ at build time).
 *  This keeps large template strings out of the server bundle.
 */

import { db } from '../db/client.js';
import { sql } from 'drizzle-orm';
import type { ResultSetHeader } from 'mysql2';
import { readFile } from 'fs/promises';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

// ── Types ─────────────────────────────────────────────────────────────────────

export interface SeedResult {
  ok: boolean;
  companyId: number;
  sections: Record<string, string>;
  errors: string[];
  alreadyLoaded: boolean;
}

// ── Resolve seed data directory ───────────────────────────────────────────────
// Works in both dev (src/) and production (dist/ after copy step).

function seedDir(): string {
  // __dirname equivalent for ESM
  const here = dirname(fileURLToPath(import.meta.url));
  // In dev:  src/server/lib  → up two → src/server/seed/starter-packs/default
  // In prod: dist/server/lib → up two → dist/server/seed/starter-packs/default
  return resolve(here, '..', 'seed', 'starter-packs', 'default');
}

async function loadJson<T>(filename: string): Promise<T> {
  const filePath = resolve(seedDir(), filename);
  const raw = await readFile(filePath, 'utf-8');
  return JSON.parse(raw) as T;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

async function exists(table: string, companyId: number, nameCol: string, name: string): Promise<boolean> {
  const [rows] = await db.execute(
    sql`SELECT id FROM ${sql.raw('`' + table + '`')} WHERE company_id = ${companyId} AND ${sql.raw('`' + nameCol + '`')} = ${name} LIMIT 1`
  ) as unknown as [Array<{ id: number }>, unknown];
  return rows.length > 0;
}

// ── Section 1: Test Project ───────────────────────────────────────────────────

async function seedProject(companyId: number): Promise<string> {
  const data = await loadJson<{
    jobNumber: string; name: string; client: string;
    address: string; status: string; notes: string;
  }>('project.json');

  const already = await exists('jobs', companyId, 'job_number', data.jobNumber);
  if (already) return 'skipped (already exists)';

  await db.execute(sql`
    INSERT INTO jobs (company_id, job_number, name, client, address, status, notes)
    VALUES (${companyId}, ${data.jobNumber}, ${data.name}, ${data.client}, ${data.address}, ${data.status}, ${data.notes})
  `);
  return 'created';
}

// ── Section 2: Stakeholders ───────────────────────────────────────────────────

async function seedStakeholders(companyId: number): Promise<string> {
  const stakeholders = await loadJson<Array<{ name: string; type: string }>>('stakeholders.json');

  let created = 0;
  let skipped = 0;
  for (const s of stakeholders) {
    const already = await exists('customers', companyId, 'name', s.name);
    if (already) { skipped++; continue; }
    await db.execute(sql`
      INSERT INTO customers (company_id, name, type)
      VALUES (${companyId}, ${s.name}, ${s.type})
    `);
    created++;
  }
  return `${created} created, ${skipped} skipped`;
}

// ── Section 3: Form Templates ─────────────────────────────────────────────────

interface FieldDef {
  label: string;
  fieldType: string;
  required?: boolean;
  options?: string[];
}

interface TemplateDef {
  name: string;
  formType: string;
  category: string;
  description: string;
  onJobs: boolean;
  onFleet: boolean;
  onDashboard: boolean;
  fields: FieldDef[];
}

async function seedFormTemplates(companyId: number): Promise<string> {
  const templates = await loadJson<TemplateDef[]>('forms.json');

  let created = 0;
  let skipped = 0;

  for (const t of templates) {
    const already = await exists('form_templates', companyId, 'name', t.name);
    if (already) { skipped++; continue; }

    const [result] = await db.execute(sql`
      INSERT INTO form_templates
        (company_id, name, form_type, category, description, is_active, on_jobs, on_fleet, on_dashboard)
      VALUES
        (${companyId}, ${t.name}, ${t.formType}, ${t.category}, ${t.description},
         1, ${t.onJobs ? 1 : 0}, ${t.onFleet ? 1 : 0}, ${t.onDashboard ? 1 : 0})
    `) as unknown as [ResultSetHeader, unknown];

    const templateId = result.insertId;

    for (let i = 0; i < t.fields.length; i++) {
      const f = t.fields[i];
      const optionsJson = f.options ? JSON.stringify(f.options) : null;
      await db.execute(sql`
        INSERT INTO form_template_fields
          (template_id, company_id, label, field_type, required, options_json, field_order)
        VALUES
          (${templateId}, ${companyId}, ${f.label}, ${f.fieldType},
           ${f.required ? 1 : 0}, ${optionsJson}, ${i})
      `);
    }

    created++;
  }

  return `${created} created, ${skipped} skipped`;
}

// ── Section 4: Safety SWMS Library ───────────────────────────────────────────

interface SwmsTemplate {
  title: string; workActivity: string; hazards: string; risks: string;
  controls: string; ppe: string; plantEquipment: string;
  trainingCompetency: string; emergencyControls: string;
  environmentalControls: string; signOffRequirements: string;
  revisionNumber: string; status: string;
}

interface SafetyPlanDef {
  title: string; isPrincipalContractor: boolean; siteRules: string;
  emergencyProcedures: string; firstAidArrangements: string;
  incidentReporting: string; hazardManagement: string; status: string;
}

interface SafetyData {
  swms: SwmsTemplate[];
  safetyPlan: SafetyPlanDef;
}

async function seedSwmsLibrary(companyId: number): Promise<string> {
  const { swms } = await loadJson<SafetyData>('safety.json');

  let created = 0;
  let skipped = 0;

  for (const t of swms) {
    const already = await exists('swms_templates', companyId, 'title', t.title);
    if (already) { skipped++; continue; }

    await db.execute(sql`
      INSERT INTO swms_templates
        (company_id, title, work_activity, hazards, risks, controls, ppe,
         plant_equipment, training_competency, emergency_controls,
         environmental_controls, sign_off_requirements,
         revision_number, status)
      VALUES
        (${companyId}, ${t.title}, ${t.workActivity}, ${t.hazards},
         ${t.risks}, ${t.controls}, ${t.ppe}, ${t.plantEquipment},
         ${t.trainingCompetency}, ${t.emergencyControls},
         ${t.environmentalControls}, ${t.signOffRequirements},
         ${t.revisionNumber}, ${t.status})
    `);
    created++;
  }

  return `${created} created, ${skipped} skipped`;
}

// ── Section 5: Safety Plan Template ──────────────────────────────────────────

async function seedSafetyPlan(companyId: number): Promise<string> {
  const { safetyPlan: p } = await loadJson<SafetyData>('safety.json');

  const already = await exists('safety_plans', companyId, 'title', p.title);
  if (already) return 'skipped (already exists)';

  await db.execute(sql`
    INSERT INTO safety_plans
      (company_id, title, is_principal_contractor, site_rules, emergency_procedures,
       first_aid_arrangements, incident_reporting, hazard_management, status)
    VALUES (
      ${companyId}, ${p.title}, ${p.isPrincipalContractor ? 1 : 0},
      ${p.siteRules}, ${p.emergencyProcedures}, ${p.firstAidArrangements},
      ${p.incidentReporting}, ${p.hazardManagement}, ${p.status}
    )
  `);
  return 'created';
}

// ── Section 6: Cost Guide Items ───────────────────────────────────────────────

async function seedCostGuide(companyId: number): Promise<string> {
  const items = await loadJson<Array<{
    description: string; unit: string; rate: string; sortOrder: number;
  }>>('cost-guide.json');

  let created = 0;
  let skipped = 0;

  for (const item of items) {
    const already = await exists('cost_guide_items', companyId, 'description', item.description);
    if (already) { skipped++; continue; }

    await db.execute(sql`
      INSERT INTO cost_guide_items (company_id, description, unit, rate, sort_order)
      VALUES (${companyId}, ${item.description}, ${item.unit}, ${item.rate}, ${item.sortOrder})
    `);
    created++;
  }

  return `${created} created, ${skipped} skipped`;
}

// ── Section 7: Starter Fleet Asset ───────────────────────────────────────────

async function seedFleetAsset(companyId: number): Promise<string> {
  const data = await loadJson<{
    name: string; type: string; rego: string; status: string; notes: string;
  }>('fleet.json');

  const already = await exists('fleet_assets', companyId, 'name', data.name);
  if (already) return 'skipped (already exists)';

  await db.execute(sql`
    INSERT INTO fleet_assets (company_id, name, type, rego, status, notes)
    VALUES (${companyId}, ${data.name}, ${data.type}, ${data.rego}, ${data.status}, ${data.notes})
  `);
  return 'created';
}

// ── Main export ───────────────────────────────────────────────────────────────

export async function seedStarterPack(
  companyId: number,
  runByUserId?: string | null,
): Promise<SeedResult> {
  const result: SeedResult = {
    ok: false,
    companyId,
    sections: {},
    errors: [],
    alreadyLoaded: false,
  };

  try {
    // ── Once-only guard ───────────────────────────────────────────────────────
    const [companyRows] = await db.execute(
      sql`SELECT starter_pack_loaded FROM companies WHERE id = ${companyId} LIMIT 1`
    ) as unknown as [Array<{ starter_pack_loaded: number | boolean }>, unknown];

    if (!companyRows || companyRows.length === 0) {
      result.errors.push('Company not found');
      return result;
    }

    const alreadyLoaded = Boolean(companyRows[0].starter_pack_loaded);
    if (alreadyLoaded) {
      result.alreadyLoaded = true;
      result.ok = true;
      return result;
    }

    // ── Log run start ─────────────────────────────────────────────────────────
    let runId: number | null = null;
    try {
      const [runResult] = await db.execute(sql`
        INSERT INTO starter_pack_runs (company_id, run_by_user_id, status, notes)
        VALUES (${companyId}, ${runByUserId ?? null}, 'pending', 'Auto-seeding started')
      `) as unknown as [ResultSetHeader, unknown];
      runId = runResult.insertId;
    } catch (e) {
      console.warn('[starter-pack] Could not log run start:', String(e));
    }

    // ── Run each section ──────────────────────────────────────────────────────
    const sections: Record<string, () => Promise<string>> = {
      project:        () => seedProject(companyId),
      stakeholders:   () => seedStakeholders(companyId),
      form_templates: () => seedFormTemplates(companyId),
      swms_library:   () => seedSwmsLibrary(companyId),
      safety_plan:    () => seedSafetyPlan(companyId),
      cost_guide:     () => seedCostGuide(companyId),
      fleet_asset:    () => seedFleetAsset(companyId),
    };

    for (const [key, fn] of Object.entries(sections)) {
      try {
        result.sections[key] = await fn();
      } catch (e) {
        const msg = String((e as Error)?.message ?? e);
        result.sections[key] = `ERROR: ${msg.slice(0, 200)}`;
        result.errors.push(`${key}: ${msg.slice(0, 200)}`);
        console.error(`[starter-pack] Section ${key} failed for company ${companyId}:`, e);
      }
    }

    // ── Mark company as seeded ────────────────────────────────────────────────
    const hasErrors = result.errors.length > 0;
    const finalStatus = hasErrors ? 'partial' : 'success';

    try {
      await db.execute(sql`
        UPDATE companies
        SET starter_pack_loaded = 1, starter_pack_loaded_at = NOW()
        WHERE id = ${companyId}
      `);
    } catch (e) {
      console.warn('[starter-pack] Could not mark starter_pack_loaded:', String(e));
    }

    // ── Update run log ────────────────────────────────────────────────────────
    if (runId !== null) {
      try {
        const notes = JSON.stringify({ sections: result.sections, errors: result.errors });
        await db.execute(sql`
          UPDATE starter_pack_runs
          SET status = ${finalStatus}, notes = ${notes}
          WHERE id = ${runId}
        `);
      } catch (e) {
        console.warn('[starter-pack] Could not update run log:', String(e));
      }
    }

    result.ok = true;
    console.log(`[starter-pack] Company ${companyId} seeded — status: ${finalStatus}`, result.sections);
    return result;

  } catch (e) {
    const msg = String((e as Error)?.message ?? e);
    result.errors.push(`Fatal: ${msg}`);
    console.error(`[starter-pack] Fatal error for company ${companyId}:`, e);
    return result;
  }
}
