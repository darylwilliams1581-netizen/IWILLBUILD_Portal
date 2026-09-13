/**
 * POST /api/developer/repair-seeded-documents
 *
 * Platform-owner only (requirePlatformOwner middleware in entry.ts).
 * Target account is HARDCODED — darylwilliams1581@gmail.com.
 *
 * What this does:
 *   Finds every document_template that was inserted by the seed endpoint
 *   (matched by name against the canonical seed source) and detects whether
 *   its builder_json contains "[object Object]" — the symptom of the buggy
 *   converter that called .join('\n') on structured-object arrays.
 *
 *   ?dryRun=1  — reports which rows are damaged and what the repaired block
 *                count would be; zero DB writes.
 *   (no flag)  — rebuilds builder_json from the corrected converter and
 *                UPDATEs each damaged row inside a transaction.
 *
 * Only OC SWMS documents can be damaged (they have structured envControls,
 * emergencyActions, relatedDocs, competencyRows). Flat SWMS and safety plans
 * use only string fields and are reported as "clean" without touching them.
 */

import type { Request, Response } from 'express';
import mysql from 'mysql2/promise';
import { getDatabaseCredentials } from '../../../db/config.js';
import { readFile } from 'fs/promises';
import { existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

// Raw mysql2 pool — bypasses Drizzle's sql.raw() wrapper which mis-handles
// queries that contain no ? placeholders (driver treats them as parameterised
// and returns "Failed query … params:" with an empty params list).
// v2: force-republish to pick up this fix on the live bundle.
function getRawPool() {
  const cfg = getDatabaseCredentials();
  return mysql.createPool({
    host: cfg.host, port: cfg.port, user: cfg.user,
    password: cfg.password, database: cfg.database,
    ssl: { rejectUnauthorized: false },
    waitForConnections: true, connectionLimit: 3,
  });
}

// ── Seed directory (same dual-path logic as seed endpoint) ────────────────────

function seedDir(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  const prodPath = resolve(here, 'server', 'seed', 'starter-packs', 'default');
  if (existsSync(prodPath)) return prodPath;
  return resolve(here, '..', '..', '..', 'seed', 'starter-packs', 'default');
}

async function loadJson<T>(filename: string): Promise<T> {
  const raw = await readFile(resolve(seedDir(), filename), 'utf-8');
  return JSON.parse(raw) as T;
}

// ── Target ────────────────────────────────────────────────────────────────────

const TARGET_EMAIL = 'darylwilliams1581@gmail.com';

// ── Types (copied from seed endpoint — must stay in sync) ─────────────────────

interface OcWorkStep {
  id: string;
  sequenceNumber?: number;
  sequenceOfWork: string;
  hazardsAndRisks: string;
  possibleConsequence?: string;
  initialRisk?: string;
  controlMeasures: string;
  residualRisk?: string;
  responsiblePerson?: string;
}

interface OcPpeRow {
  item: string;
  requirement: string;
}

interface OcPlantItem {
  id: string;
  item: string;
  requirement: string;
  inspectionRequired?: string;
  notes?: string;
}

interface OcCriticalControl {
  id: string;
  criticalRisk: string;
  possibleOutcome: string;
  mandatoryControls: string;
}

interface OcCompetencyRow {
  requirement?: string;
  applies?: boolean;
  evidenceOrAuth?: string;
  id?: string;
  role?: string;
  licenceOrCert?: string;
  trainingRequired?: string;
}

interface OcEnvControl {
  type?: string;
  description?: string;
  responsiblePerson?: string;
}

interface OcEmergencyAction {
  id?: string;
  action?: string;
}

interface OcRelatedDoc {
  id?: string;
  type?: string;
  document?: string;
  revision?: string;
  status?: string;
}

interface OcSwms {
  title: string;
  category?: string;
  revisionNumber?: string;
  reviewDate?: string;
  authorName?: string;
  approvedByName?: string;
  status?: string;
  purpose?: string;
  scope?: string;
  includedActivities?: string[];
  excludedActivities?: string[];
  criticalControls?: OcCriticalControl[];
  plantItems?: OcPlantItem[];
  ppeRows?: OcPpeRow[];
  workSteps?: OcWorkStep[];
  envControls?: string[] | OcEnvControl[];
  emergencyActions?: string[] | OcEmergencyAction[];
  competencyRows?: OcCompetencyRow[];
  definitions?: Array<{ term: string; definition: string }>;
  relatedDocs?: string[] | OcRelatedDoc[];
}

// ── Block ID counter (reset per document) ────────────────────────────────────

let _blockId = 1;
function resetBid() { _blockId = 1; }
function bid(): string { return `b${String(_blockId++).padStart(4, '0')}`; }

// ── Block helpers (identical to seed endpoint) ────────────────────────────────

function headingBlock(content: string, level: 1 | 2 | 3 | 4 = 2): object {
  return { id: bid(), type: 'heading', content, level, align: 'left' };
}
function textBlock(content: string, bold = false): object {
  return { id: bid(), type: 'text', content, align: 'left', bold };
}
function dividerBlock(): object {
  return { id: bid(), type: 'divider', style: 'solid', thickness: 1 };
}
function spacerBlock(height = 8): object {
  return { id: bid(), type: 'spacer', height };
}
function bannerBlock(title: string, body: string, variant = 'safety'): object {
  return { id: bid(), type: 'banner', variant, title, body, size: 'compact', align: 'left', showOnExport: true };
}

const PPE_BADGE_MAP: Record<string, string> = {
  'safety helmet': 'helmet', 'hard hat': 'helmet', 'helmet': 'helmet',
  'safety boots': 'footwear', 'steel cap': 'footwear', 'footwear': 'footwear',
  'safety glasses': 'eye_protection', 'eye protection': 'eye_protection', 'goggles': 'eye_protection',
  'gloves': 'gloves', 'hi-vis': 'hi_vis', 'hi vis': 'hi_vis', 'high visibility': 'hi_vis',
  'hearing': 'hearing', 'ear muffs': 'hearing', 'ear plugs': 'hearing',
  'fall arrest': 'fall_arrest', 'harness': 'fall_arrest',
  'electrical gloves': 'electrical_gloves',
};
function ppeItemToBadgeType(item: string): string {
  const lower = item.toLowerCase();
  for (const [key, val] of Object.entries(PPE_BADGE_MAP)) {
    if (lower.includes(key)) return val;
  }
  return 'ppe';
}
function ppeToBadgeRow(ppeRows: OcPpeRow[]): object {
  const badges = ppeRows.slice(0, 8).map((row) => ({
    id: bid(), badgeType: ppeItemToBadgeType(row.item), label: row.item, required: true,
  }));
  return { id: bid(), type: 'safety_badge_row', badges, size: 'md', align: 'left' };
}

function workStepsToTable(steps: OcWorkStep[]): object {
  const colStep = bid(); const colHazard = bid(); const colCtrl = bid(); const colRisk = bid();
  const columns = [
    { id: colStep,   header: 'Work Step',         cellType: 'text', width: 2 },
    { id: colHazard, header: 'Hazards & Risks',    cellType: 'text', width: 2 },
    { id: colCtrl,   header: 'Control Measures',   cellType: 'text', width: 3 },
    { id: colRisk,   header: 'Residual Risk',       cellType: 'text', width: 1 },
  ];
  const rows = steps.map((s) => ({
    id: bid(),
    cells: {
      [colStep]:   `${s.sequenceNumber ?? ''}. ${s.sequenceOfWork}`.trim(),
      [colHazard]: [s.hazardsAndRisks, s.possibleConsequence].filter(Boolean).join('\n'),
      [colCtrl]:   s.controlMeasures,
      [colRisk]:   s.residualRisk ?? '',
    },
  }));
  return { id: bid(), type: 'table', mode: 'static', columns, rows, headerBgColor: '#1e293b', headerTextColor: '#ffffff', stripedRows: true };
}

function criticalControlsToTable(controls: OcCriticalControl[]): object {
  const colRisk = bid(); const colOutcome = bid(); const colCtrl = bid();
  const columns = [
    { id: colRisk,    header: 'Critical Risk',      cellType: 'text', width: 2 },
    { id: colOutcome, header: 'Possible Outcome',   cellType: 'text', width: 2 },
    { id: colCtrl,    header: 'Mandatory Controls', cellType: 'text', width: 3 },
  ];
  const rows = controls.map((c) => ({
    id: bid(),
    cells: { [colRisk]: c.criticalRisk, [colOutcome]: c.possibleOutcome, [colCtrl]: c.mandatoryControls },
  }));
  return { id: bid(), type: 'table', mode: 'static', columns, rows, headerBgColor: '#7f1d1d', headerTextColor: '#ffffff', stripedRows: false };
}

function plantItemsToTable(items: OcPlantItem[]): object {
  const colItem = bid(); const colReq = bid(); const colInspect = bid();
  const columns = [
    { id: colItem,    header: 'Plant / Equipment',  cellType: 'text', width: 2 },
    { id: colReq,     header: 'Requirement',         cellType: 'text', width: 3 },
    { id: colInspect, header: 'Inspection Required', cellType: 'text', width: 1 },
  ];
  const rows = items.map((p) => ({
    id: bid(),
    cells: {
      [colItem]:    p.item,
      [colReq]:     [p.requirement, p.notes].filter(Boolean).join(' — '),
      [colInspect]: p.inspectionRequired ?? '',
    },
  }));
  return { id: bid(), type: 'table', mode: 'static', columns, rows, headerBgColor: '#1e3a5f', headerTextColor: '#ffffff', stripedRows: true };
}

function competencyToTable(rows: OcCompetencyRow[]): object {
  const colReq = bid(); const colApplies = bid(); const colEvid = bid();
  const columns = [
    { id: colReq,     header: 'Requirement / Role',       cellType: 'text', width: 3 },
    { id: colApplies, header: 'Applies',                  cellType: 'text', width: 1 },
    { id: colEvid,    header: 'Evidence / Authorisation', cellType: 'text', width: 2 },
  ];
  const tableRows = rows.map((r) => {
    if (r.requirement !== undefined) {
      return { id: bid(), cells: { [colReq]: r.requirement, [colApplies]: r.applies ? 'Yes' : 'No', [colEvid]: r.evidenceOrAuth ?? '' } };
    }
    return { id: bid(), cells: { [colReq]: [r.role, r.licenceOrCert].filter(Boolean).join(' — '), [colApplies]: 'Yes', [colEvid]: r.trainingRequired ?? '' } };
  });
  return { id: bid(), type: 'table', mode: 'static', columns, rows: tableRows, headerBgColor: '#1e293b', headerTextColor: '#ffffff', stripedRows: true };
}

// ── OC SWMS → blocks (corrected converter — identical to current seed endpoint) ─

function ocSwmsToBlocks(t: OcSwms): object[] {
  const blocks: object[] = [];

  blocks.push(headingBlock(t.title, 1));
  if (t.category) blocks.push(textBlock(`Category: ${t.category}`, true));
  blocks.push(spacerBlock(4));

  if (t.purpose) {
    blocks.push(headingBlock('Purpose', 2));
    blocks.push(textBlock(t.purpose));
    blocks.push(spacerBlock(4));
  }
  if (t.scope) {
    blocks.push(headingBlock('Scope', 2));
    blocks.push(textBlock(t.scope));
    blocks.push(spacerBlock(4));
  }
  if (t.includedActivities?.length) {
    blocks.push(headingBlock('Included Activities', 2));
    blocks.push(textBlock(t.includedActivities.join('\n')));
    blocks.push(spacerBlock(4));
  }
  if (t.ppeRows?.length) {
    blocks.push(headingBlock('Personal Protective Equipment (PPE)', 2));
    blocks.push(ppeToBadgeRow(t.ppeRows));
    blocks.push(spacerBlock(4));
  }
  if (t.criticalControls?.length) {
    blocks.push(headingBlock('Critical Controls', 2));
    blocks.push(bannerBlock('Critical Risk Controls', 'The following controls are mandatory and must be in place before work commences.', 'danger'));
    blocks.push(criticalControlsToTable(t.criticalControls));
    blocks.push(spacerBlock(4));
  }
  if (t.workSteps?.length) {
    blocks.push(headingBlock('Work Steps — Hazards & Controls', 2));
    blocks.push(workStepsToTable(t.workSteps));
    blocks.push(spacerBlock(4));
  }
  if (t.plantItems?.length) {
    blocks.push(headingBlock('Plant & Equipment', 2));
    blocks.push(plantItemsToTable(t.plantItems));
    blocks.push(spacerBlock(4));
  }
  if (t.competencyRows?.length) {
    blocks.push(headingBlock('Training & Competency Requirements', 2));
    blocks.push(competencyToTable(t.competencyRows));
    blocks.push(spacerBlock(4));
  }
  if (t.envControls?.length) {
    blocks.push(headingBlock('Environmental Controls', 2));
    const envLines = (t.envControls as Array<string | OcEnvControl>).map((e) => {
      if (typeof e === 'string') return e;
      const parts: string[] = [];
      if (e.type) parts.push(e.type);
      if (e.description) parts.push(e.description);
      if (e.responsiblePerson) parts.push(`Responsible: ${e.responsiblePerson}`);
      return parts.join(' — ');
    });
    blocks.push(textBlock(envLines.join('\n')));
    blocks.push(spacerBlock(4));
  }
  if (t.emergencyActions?.length) {
    blocks.push(headingBlock('Emergency Response', 2));
    const actionLines = (t.emergencyActions as Array<string | OcEmergencyAction>).map((a) =>
      typeof a === 'string' ? a : (a.action ?? ''),
    ).filter(Boolean);
    blocks.push(bannerBlock('Emergency Actions', actionLines.join('\n'), 'emergency'));
    blocks.push(spacerBlock(4));
  }
  if (t.definitions?.length) {
    blocks.push(dividerBlock());
    blocks.push(headingBlock('Definitions', 3));
    for (const d of t.definitions) {
      blocks.push(textBlock(`${d.term}: ${d.definition}`));
    }
    blocks.push(spacerBlock(4));
  }
  if (t.relatedDocs?.length) {
    blocks.push(headingBlock('Related Documents', 3));
    const docLines = (t.relatedDocs as Array<string | OcRelatedDoc>).map((d) => {
      if (typeof d === 'string') return d;
      const parts: string[] = [];
      if (d.type) parts.push(d.type);
      if (d.document) parts.push(d.document);
      const meta: string[] = [];
      if (d.revision) meta.push(`Rev: ${d.revision}`);
      if (d.status) meta.push(d.status);
      if (meta.length) parts.push(`(${meta.join(', ')})`);
      return parts.join(' — ');
    });
    blocks.push(textBlock(docLines.join('\n')));
    blocks.push(spacerBlock(4));
  }

  blocks.push(dividerBlock());
  blocks.push(headingBlock('Worker Sign-on', 2));
  blocks.push(textBlock(
    'All workers must read, understand and sign onto this SWMS before commencing work. ' +
    'By signing, workers confirm they understand the hazards and controls described in this document.',
  ));

  return blocks;
}

function makeBuilderJson(blocks: object[]): string {
  return JSON.stringify({ blocks, systemFields: [], sourceAttachments: [], appliedWidgets: [] });
}

// ── Damage detection ──────────────────────────────────────────────────────────

function isDamaged(builderJsonStr: string): boolean {
  return builderJsonStr.includes('[object Object]');
}

// ── DB row type ───────────────────────────────────────────────────────────────

interface DbRow {
  id: number;
  name: string;
  template_type: string;
  builder_json: string;
}

// ── Handler ───────────────────────────────────────────────────────────────────

export default async function handler(req: Request, res: Response) {
  const dryRun = req.query['dryRun'] === '1';
  const pool = getRawPool();

  try {
    // Resolve target company using raw mysql2 (parameterised — safe)
    const [profileRows] = await pool.execute<mysql.RowDataPacket[]>(
      `SELECT p.company_id, c.name AS company_name
       FROM profiles p
       JOIN companies c ON c.id = p.company_id
       WHERE p.user_id = (SELECT id FROM users WHERE email = ? LIMIT 1)
       LIMIT 1`,
      [TARGET_EMAIL],
    );

    if (!profileRows.length) {
      return res.status(404).json({ error: 'Target user not found', detail: TARGET_EMAIL });
    }
    const companyId   = (profileRows[0] as { company_id: number; company_name: string }).company_id;
    const companyName = (profileRows[0] as { company_id: number; company_name: string }).company_name;

    // Load OC seed data
    const ocData = await loadJson<{ swms: OcSwms[] }>('swms-oc.json');
    const ocByTitle = new Map<string, OcSwms>(ocData.swms.map((s) => [s.title, s]));

    // Fetch all seeded OC SWMS rows for this company
    const ocTitles = [...ocByTitle.keys()];
    // mysql2 IN (?) with an array expands correctly
    const [dbRows] = await pool.execute<mysql.RowDataPacket[]>(
      `SELECT id, name, template_type, builder_json
       FROM document_templates
       WHERE company_id = ?
         AND template_type = 'swms'
         AND name IN (?)`,
      [companyId, ocTitles],
    );
    const typedDbRows = dbRows as DbRow[];

    // Classify each row
    interface RowReport {
      id: number;
      name: string;
      damaged: boolean;
      existingBlockCount: number;
      repairedBlockCount: number;
    }

    const reports: RowReport[] = [];

    for (const row of typedDbRows) {
      const seedEntry = ocByTitle.get(row.name);
      if (!seedEntry) continue;

      let existingBlockCount = 0;
      try {
        const parsed = JSON.parse(row.builder_json) as { blocks?: unknown[] };
        existingBlockCount = parsed.blocks?.length ?? 0;
      } catch { /* unparseable — treat as damaged */ }

      const damaged = isDamaged(row.builder_json);

      resetBid();
      const repairedBlocks = ocSwmsToBlocks(seedEntry);

      reports.push({
        id: row.id,
        name: row.name,
        damaged,
        existingBlockCount,
        repairedBlockCount: repairedBlocks.length,
      });
    }

    const damagedRows    = reports.filter((r) => r.damaged);
    const cleanRows      = reports.filter((r) => !r.damaged);
    const notFoundTitles = ocTitles.filter((t) => !typedDbRows.find((r) => r.name === t));

    // ── Dry-run response ──────────────────────────────────────────────────────

    if (dryRun) {
      return res.json({
        mode: 'dry-run',
        ok: true,
        targetEmail: TARGET_EMAIL,
        companyId,
        companyName,
        summary: {
          ocSwmsInSeed:  ocTitles.length,
          foundInDb:     typedDbRows.length,
          damaged:       damagedRows.length,
          clean:         cleanRows.length,
          notFoundInDb:  notFoundTitles.length,
        },
        damagedRows: damagedRows.map((r) => ({
          id: r.id,
          name: r.name,
          existingBlockCount: r.existingBlockCount,
          repairedBlockCount: r.repairedBlockCount,
        })),
        cleanRows: cleanRows.map((r) => ({
          id: r.id,
          name: r.name,
          blockCount: r.existingBlockCount,
        })),
        notFoundInDb: notFoundTitles,
        message: damagedRows.length === 0
          ? 'No damaged rows detected — all OC SWMS documents look clean.'
          : `${damagedRows.length} damaged row(s) detected. Run without ?dryRun=1 to repair.`,
      });
    }

    // ── Live repair ───────────────────────────────────────────────────────────

    if (damagedRows.length === 0) {
      return res.json({
        mode: 'live',
        ok: true,
        targetEmail: TARGET_EMAIL,
        companyId,
        companyName,
        repaired: [],
        skipped: cleanRows.map((r) => r.name),
        summary: { repaired: 0, skipped: cleanRows.length, errors: 0 },
        errors: [],
        message: 'Nothing to repair — all OC SWMS documents were already clean.',
      });
    }

    // Build repaired builder_json for each damaged row
    interface RepairItem {
      id: number;
      name: string;
      builderJson: string;
      blockCount: number;
    }
    const repairItems: RepairItem[] = [];

    for (const r of damagedRows) {
      const seedEntry = ocByTitle.get(r.name)!;
      resetBid();
      const blocks = ocSwmsToBlocks(seedEntry);
      repairItems.push({
        id: r.id,
        name: r.name,
        builderJson: makeBuilderJson(blocks),
        blockCount: blocks.length,
      });
    }

    // Execute all UPDATEs inside a single transaction
    const repaired: Array<{ id: number; name: string; blockCount: number }> = [];
    const errors: string[] = [];
    const conn = await pool.getConnection();

    try {
      await conn.beginTransaction();
      for (const item of repairItems) {
        await conn.execute(
          `UPDATE document_templates
           SET builder_json = ?, updated_at = NOW()
           WHERE id = ? AND company_id = ?`,
          [item.builderJson, item.id, companyId],
        );
        repaired.push({ id: item.id, name: item.name, blockCount: item.blockCount });
      }
      await conn.commit();
    } catch (err) {
      await conn.rollback();
      errors.push(String(err));
    } finally {
      conn.release();
    }

    return res.json({
      mode: 'live',
      ok: errors.length === 0,
      targetEmail: TARGET_EMAIL,
      companyId,
      companyName,
      repaired,
      skipped: cleanRows.map((r) => r.name),
      summary: {
        repaired: repaired.length,
        skipped:  cleanRows.length,
        errors:   errors.length,
      },
      errors,
      message: errors.length === 0
        ? `Repair complete — ${repaired.length} document(s) rebuilt from corrected converter.`
        : `Repair failed — transaction rolled back. ${errors.length} error(s).`,
    });

  } catch (err) {
    console.error('[repair-seeded-documents]', err);
    return res.status(500).json({ error: 'Internal server error', detail: String(err) });
  } finally {
    await pool.end();
  }
}
