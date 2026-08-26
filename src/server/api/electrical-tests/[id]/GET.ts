/**
 * GET /api/electrical-tests/:id
 * Get a single test record with photos, equipment, audit trail and retest chain.
 */
import type { Request, Response } from 'express';
import { db } from '../../../db/client.js';
import { profiles } from '../../../db/schema.js';
import { eq, sql } from 'drizzle-orm';
import { getAuth } from '../../../../lib/auth/auth.js';
import { getSignedUrl, providerSupportsSignedUrls, BUCKET_COMPANY_FILES } from '../../../storage/storage-service.js';

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

    const id = parseInt(req.params['id'] as string, 10);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid id' });

    const [rows] = await db.execute(sql.raw(`
      SELECT r.*,
        e.owner AS equipment_owner, e.equipment_type, e.make_model AS equipment_make_model,
        e.serial_number AS equipment_serial, e.calibration_date AS equipment_cal_date,
        e.calibration_expiry AS equipment_cal_expiry, e.cal_cert_storage_key
      FROM electrical_test_records r
      LEFT JOIN electrical_test_equipment e ON e.id = r.equipment_id
      WHERE r.id = ${id} AND r.company_id = ${profile.companyId}
      LIMIT 1
    `)) as unknown as [Array<Record<string, unknown>>];

    if (!rows?.length) return res.status(404).json({ error: 'Record not found' });
    const record = rows[0];

    // Photos
    const [photoRows] = await db.execute(sql.raw(`
      SELECT id, photo_type, caption, storage_key, original_name, uploaded_by_name, uploaded_at
      FROM electrical_test_photos
      WHERE test_record_id = ${id}
      ORDER BY photo_type ASC, uploaded_at ASC
    `)) as unknown as [Array<Record<string, unknown>>];

    // Add signed URLs for photos
    const photos = await Promise.all((photoRows ?? []).map(async (p) => {
      let url: string | null = null;
      if (p['storage_key'] && providerSupportsSignedUrls()) {
        try { url = await getSignedUrl(String(p['storage_key']), BUCKET_COMPANY_FILES, 3600); } catch { /* ignore */ }
      }
      if (!url && p['storage_key']) {
        url = `/api/electrical-tests/photos/${p['id']}/view`;
      }
      return { ...p, url };
    }));

    // Audit trail
    const [auditRows] = await db.execute(sql.raw(`
      SELECT id, event_type, event_note, user_name, created_at
      FROM electrical_test_audit
      WHERE test_record_id = ${id}
      ORDER BY created_at ASC
    `)) as unknown as [Array<Record<string, unknown>>];

    // Retest chain (parent + siblings)
    let retestChain: Array<Record<string, unknown>> = [];
    const parentId = record['parent_test_id'];
    if (parentId) {
      const [chainRows] = await db.execute(sql.raw(`
        SELECT id, result, condition_class, test_date, tester_name, status, notes
        FROM electrical_test_records
        WHERE (id = ${parentId} OR parent_test_id = ${parentId})
          AND company_id = ${profile.companyId}
        ORDER BY test_date ASC, created_at ASC
      `)) as unknown as [Array<Record<string, unknown>>];
      retestChain = chainRows ?? [];
    } else {
      const [childRows] = await db.execute(sql.raw(`
        SELECT id, result, condition_class, test_date, tester_name, status, notes
        FROM electrical_test_records
        WHERE parent_test_id = ${id} AND company_id = ${profile.companyId}
        ORDER BY test_date ASC, created_at ASC
      `)) as unknown as [Array<Record<string, unknown>>];
      retestChain = childRows ?? [];
    }

    return res.json({ record, photos, audit: auditRows ?? [], retestChain });
  } catch (err) {
    console.error('GET /api/electrical-tests/:id error:', err);
    return res.status(500).json({ error: 'Failed to load record' });
  }
}
