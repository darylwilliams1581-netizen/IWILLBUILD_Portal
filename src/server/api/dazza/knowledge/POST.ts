/**
 * POST /api/dazza/knowledge
 * Creates a new knowledge entry for the authenticated user's company.
 * Admin/owner only. Wall 8 (Learn Gate) enforced.
 */
import type { Request, Response } from 'express';
import { db } from '../../../db/client.js';
import { profiles } from '../../../db/schema.js';
import { eq, sql } from 'drizzle-orm';
import { getAuth } from '../../../../lib/auth/auth.js';
import {
  wall8_learnGate,
  wall10_auditLog,
} from '../../../lib/dazza-walls.js';

const VALID_CATEGORIES = [
  'Company procedure',
  'Safety / WHS',
  'Estimating',
  'Forms',
  'Fleet',
  'Building standards',
  'Custom',
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

    const role = profile.role ?? 'worker';
    const isOwner = role === 'owner';
    const isAdmin = isOwner || role === 'admin' || profile.permAdmin === true;

    // ── Wall 8: Learn Gate — owner/admin only ─────────────────────────────────
    if (!isAdmin) {
      void wall10_auditLog({
        companyId: profile.companyId,
        userId: session.user.id,
        userName: session.user.name ?? session.user.email ?? 'Unknown',
        eventType: 'learn_upload_blocked',
        refusalReason: 'learn_no_permission',
        questionSummary: 'Learn upload attempt by non-admin',
      });
      return res.status(403).json({ error: 'Only Owner or Admin users can add knowledge to the Learn system.' });
    }

    const { title, category, content, source_name, active } = req.body as {
      title?: string;
      category?: string;
      content?: string;
      source_name?: string;
      active?: boolean;
    };

    if (!title?.trim()) return res.status(400).json({ error: 'Title is required' });
    if (!content?.trim()) return res.status(400).json({ error: 'Content is required' });

    // ── Wall 8: Code execution check + sanitise ───────────────────────────────
    const gateResult = wall8_learnGate(content.trim(), isAdmin, isOwner);
    if (!gateResult.allowed) {
      void wall10_auditLog({
        companyId: profile.companyId,
        userId: session.user.id,
        userName: session.user.name ?? session.user.email ?? 'Unknown',
        eventType: 'learn_upload_blocked',
        refusalReason: 'learn_code_blocked',
        questionSummary: `Learn upload blocked: ${title.trim().slice(0, 100)}`,
        metadata: { reason: gateResult.reason },
      });
      return res.status(400).json({ error: gateResult.reason });
    }

    const sanitisedContent = gateResult.sanitisedContent ?? content.trim();
    const cat = VALID_CATEGORIES.includes(category ?? '') ? (category ?? 'Company procedure') : 'Company procedure';
    const activeVal = active !== false ? 1 : 0;
    const createdBy = session.user.name ?? session.user.email ?? 'Unknown';
    const sourceName = source_name?.trim() ?? null;
    const uploadedBy = session.user.id;
    const version = 1;

    const [result] = await db.execute(
      sql`INSERT INTO dazza_knowledge
            (company_id, title, category, content, source_name, active, created_by)
          VALUES
            (${profile.companyId}, ${title.trim()}, ${cat}, ${sanitisedContent}, ${sourceName}, ${activeVal}, ${createdBy})`
    ) as unknown as [{ insertId: number }, unknown];

    const insertId = (result as unknown as { insertId: number }).insertId;

    // ── Wall 10: Audit successful Learn upload ────────────────────────────────
    void wall10_auditLog({
      companyId: profile.companyId,
      userId: session.user.id,
      userName: session.user.name ?? session.user.email ?? 'Unknown',
      eventType: 'learn_upload',
      questionSummary: `Learn upload: "${title.trim().slice(0, 100)}" (${cat})`,
      metadata: {
        entryId: insertId,
        title: title.trim(),
        category: cat,
        sourceName,
        uploadedBy,
        version,
        status: activeVal === 1 ? 'active' : 'disabled',
      },
    });

    const [rows] = await db.execute(
      sql`SELECT id, title, category, content, source_name, active, created_by, created_at, updated_at
          FROM dazza_knowledge WHERE id = ${insertId}`
    ) as unknown as [Array<Record<string, unknown>>, unknown];

    res.status(201).json({ entry: rows?.[0] ?? null });
  } catch (e) {
    res.status(500).json({ error: String((e as Error)?.message ?? e) });
  }
}
