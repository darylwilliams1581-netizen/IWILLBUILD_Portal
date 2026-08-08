/**
 * GET /api/developer/media-backfill-report
 * ─────────────────────────────────────────────────────────────────────────────
 * Read-only report of existing upload rows across all destination tables that
 * have NOT yet been backfilled into media_assets / media_asset_links.
 *
 * Platform owner only. Does NOT modify any data.
 *
 * Returns:
 *   {
 *     summary: { table, total, backfilled, pending }[],
 *     unmappable: { table, id, companyId, reason }[],
 *     samplePending: { table, id, companyId, storageKey, mimeType, originalName, destinationMapping }[]
 *   }
 */
import type { Request, Response } from 'express';
import { db } from '../../../db/client.js';
import { sql } from 'drizzle-orm';
import { platformOwnerGuard } from '../../../lib/platform-owner-guard.js';

interface TableReport {
  table: string;
  total: number;
  backfilled: number;
  pending: number;
}

interface UnmappableRow {
  table: string;
  id: number;
  companyId: number | null;
  reason: string;
}

interface SampleRow {
  table: string;
  id: number;
  companyId: number | null;
  storageKey: string | null;
  mimeType: string | null;
  originalName: string | null;
  destinationMapping: string;
}

export default async function handler(req: Request, res: Response) {
  const guard = await platformOwnerGuard(req, res);
  if (!guard) return;

  try {
    const summary: TableReport[] = [];
    const unmappable: UnmappableRow[] = [];
    const samplePending: SampleRow[] = [];

    // ── Helper: count rows in a table ────────────────────────────────────────
    async function countTable(table: string): Promise<number> {
      try {
        const result = await db.execute(sql.raw(`SELECT COUNT(*) as cnt FROM \`${table}\``)) as unknown as [Array<{ cnt: number }>, unknown];
        return Number(result[0]?.[0]?.cnt ?? 0);
      } catch { return -1; }
    }

    // ── Helper: count backfilled rows (have a media_asset_links entry) ────────
    async function countBackfilled(table: string, destType: string, idCol: string): Promise<number> {
      try {
        const result = await db.execute(sql.raw(`
          SELECT COUNT(*) as cnt FROM \`${table}\` t
          WHERE EXISTS (
            SELECT 1 FROM media_asset_links mal
            WHERE mal.destination_type = '${destType}'
              AND mal.destination_id = t.${idCol}
          )
        `)) as unknown as [Array<{ cnt: number }>, unknown];
        return Number(result[0]?.[0]?.cnt ?? 0);
      } catch { return 0; }
    }

    // ── Helper: sample pending rows ───────────────────────────────────────────
    async function samplePendingRows(
      table: string,
      destType: string,
      idCol: string,
      storageKeyCol: string,
      mimeCol: string,
      nameCol: string,
      companyCol: string,
      limit = 5,
    ): Promise<void> {
      try {
        const rows = await db.execute(sql.raw(`
          SELECT t.${idCol} as id, t.${companyCol} as company_id,
                 t.${storageKeyCol} as storage_key,
                 t.${mimeCol} as mime_type,
                 t.${nameCol} as original_name
          FROM \`${table}\` t
          WHERE NOT EXISTS (
            SELECT 1 FROM media_asset_links mal
            WHERE mal.destination_type = '${destType}'
              AND mal.destination_id = t.${idCol}
          )
          LIMIT ${limit}
        `)) as unknown as [Array<Record<string, unknown>>, unknown];

        for (const row of rows[0] ?? []) {
          const storageKey = String(row.storage_key ?? '');
          const mimeType   = String(row.mime_type ?? '');
          const origName   = String(row.original_name ?? '');
          const id         = Number(row.id ?? 0);
          const companyId  = row.company_id != null ? Number(row.company_id) : null;

          // Flag rows that cannot be mapped safely
          if (!storageKey || storageKey === 'null') {
            unmappable.push({ table, id, companyId, reason: 'missing storage_key' });
            continue;
          }
          if (!mimeType || mimeType === 'null') {
            unmappable.push({ table, id, companyId, reason: 'missing mime_type' });
            continue;
          }

          samplePending.push({
            table,
            id,
            companyId,
            storageKey,
            mimeType,
            originalName: origName || null,
            destinationMapping: destType,
          });
        }
      } catch { /* table may not exist */ }
    }

    // ── Scan each destination table ───────────────────────────────────────────

    const tables: Array<{
      table: string;
      destType: string;
      idCol: string;
      storageKeyCol: string;
      mimeCol: string;
      nameCol: string;
      companyCol: string;
    }> = [
      { table: 'job_photos',            destType: 'job_photo',              idCol: 'id', storageKeyCol: 'filename',     mimeCol: 'mime_type', nameCol: 'original_name', companyCol: 'company_id' },
      { table: 'job_card_photos',       destType: 'job_card_photo',         idCol: 'id', storageKeyCol: 'file_path',    mimeCol: 'mime_type', nameCol: 'file_name',     companyCol: 'company_id' },
      { table: 'company_files',         destType: 'company_file',           idCol: 'id', storageKeyCol: 'stored_name',  mimeCol: 'mime_type', nameCol: 'original_name', companyCol: 'company_id' },
      { table: 'incident_attachments',  destType: 'incident_attachment',    idCol: 'id', storageKeyCol: 'storage_key',  mimeCol: 'mime_type', nameCol: 'original_name', companyCol: 'company_id' },
      { table: 'am_asset_photos',       destType: 'fleet_asset_photo',      idCol: 'id', storageKeyCol: 'file_path',    mimeCol: 'mime_type', nameCol: 'file_name',     companyCol: 'company_id' },
      { table: 'am_media',              destType: 'fleet_inspection_media', idCol: 'id', storageKeyCol: 'file_path',    mimeCol: 'mime_type', nameCol: 'file_name',     companyCol: 'company_id' },
    ];

    for (const t of tables) {
      const total       = await countTable(t.table);
      if (total < 0) continue; // table doesn't exist
      const backfilled  = await countBackfilled(t.table, t.destType, t.idCol);
      const pending     = total - backfilled;
      summary.push({ table: t.table, total, backfilled, pending });
      if (pending > 0) {
        await samplePendingRows(t.table, t.destType, t.idCol, t.storageKeyCol, t.mimeCol, t.nameCol, t.companyCol);
      }
    }

    // ── media_assets coverage ─────────────────────────────────────────────────
    const maTotal = await countTable('media_assets');
    const malTotal = await countTable('media_asset_links');

    return res.json({
      generatedAt: new Date().toISOString(),
      mediaAssetsTotal: maTotal,
      mediaAssetLinksTotal: malTotal,
      summary,
      unmappable,
      samplePending,
      note: 'This is a read-only report. No data has been modified. Review before running any backfill.',
    });
  } catch (err) {
    console.error('[media-backfill-report]', err);
    return res.status(500).json({ error: 'Report failed' });
  }
}
