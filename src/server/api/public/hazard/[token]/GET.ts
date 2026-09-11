import { createHash } from 'node:crypto';
import type { Request, Response } from 'express';
import { sql } from 'drizzle-orm';

import { db } from '../../../../db/client.js';
import { BUCKET_HAZARD_PHOTOS, getSignedUrl } from '../../../../storage/storage-service.js';

export default async function handler(req: Request, res: Response) {
  const token = String(req.params.token ?? '');
  if (!/^[a-f0-9]{96}$/i.test(token)) return res.status(404).json({ error: 'Link not found' });
  const tokenHash = createHash('sha256').update(token).digest('hex');

  const [rows] = await db.execute(sql`
    SELECT st.revoked,
      r.id, r.company_id, r.title, r.description, r.category,
      r.hazard_source, r.who_is_at_risk, r.existing_controls,
      r.additional_controls, r.likelihood, r.consequence, r.risk_level,
      r.status, r.identified_date, r.photo_path,
      c.name AS company_name
    FROM hazard_share_tokens st
    INNER JOIN risk_register r ON r.id = st.hazard_id AND r.company_id = st.company_id
    INNER JOIN companies c ON c.id = r.company_id
    WHERE st.token_hash = ${tokenHash}
    LIMIT 1
  `) as unknown as [Array<Record<string, unknown>>, unknown];
  const row = rows?.[0];
  if (!row) return res.status(404).json({ error: 'Link not found' });
  if (Number(row.revoked) === 1) return res.status(410).json({ error: 'This link has been revoked' });

  let photoUrl: string | null = null;
  if (row.photo_path) photoUrl = await getSignedUrl(String(row.photo_path), BUCKET_HAZARD_PHOTOS, 3600);
  return res.json({
    company: { name: String(row.company_name ?? 'IWILLBUILD') },
    hazard: {
      id: Number(row.id),
      title: String(row.title ?? ''),
      description: row.description ?? null,
      category: row.category ?? null,
      hazard_source: row.hazard_source ?? null,
      who_is_at_risk: row.who_is_at_risk ?? null,
      existing_controls: row.existing_controls ?? null,
      additional_controls: row.additional_controls ?? null,
      likelihood: row.likelihood,
      consequence: row.consequence,
      risk_level: row.risk_level,
      status: row.status,
      identified_date: row.identified_date,
      photo_url: photoUrl,
    },
  });
}
