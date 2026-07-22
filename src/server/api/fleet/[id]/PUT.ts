import type { Request, Response } from 'express';
import { db } from '../../../db/client.js';
import { fleetAssets, profiles } from '../../../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { getAuth } from '../../../../lib/auth/auth.js';

export default async function handler(req: Request, res: Response) {
  try {
    const auth = getAuth();
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) {
      if (v) headers.set(k, Array.isArray(v) ? v[0] : v);
    }
    const session = await auth.api.getSession({ headers });
    if (!session?.user) return res.status(401).json({ error: 'Unauthorised' });

    const profile = await db.query.profiles.findFirst({
      where: eq(profiles.userId, session.user.id),
    });
    if (!profile?.companyId) return res.status(403).json({ error: 'No company' });

    const id = parseInt(String(req.params.id), 10);
    if (isNaN(id)) return res.status(400).json({ error: 'Invalid ID' });

    const existing = await db.query.fleetAssets.findFirst({
      where: and(eq(fleetAssets.id, id), eq(fleetAssets.companyId, profile.companyId)),
    });
    if (!existing) return res.status(404).json({ error: 'Asset not found' });

    const {
      name, assetNumber, type, makeModel, rego, regoNotApplicable,
      serviceDate, regoExpiry, status, notes, archived,
    } = req.body as Record<string, string | boolean | undefined>;

    await db.update(fleetAssets).set({
      name: name ? String(name).trim() : existing.name,
      assetNumber: assetNumber !== undefined ? (String(assetNumber).trim() || null) : existing.assetNumber,
      type: type ? String(type).trim() : existing.type,
      makeModel: makeModel !== undefined ? (String(makeModel).trim() || null) : existing.makeModel,
      rego: rego !== undefined ? (String(rego).trim() || null) : existing.rego,
      regoNotApplicable: regoNotApplicable !== undefined ? Boolean(regoNotApplicable) : existing.regoNotApplicable,
      serviceDate: serviceDate !== undefined ? (serviceDate ? new Date(String(serviceDate)) : null) : existing.serviceDate,
      regoExpiry: regoExpiry !== undefined ? (regoExpiry ? new Date(String(regoExpiry)) : null) : existing.regoExpiry,
      status: status ? String(status).trim() : existing.status,
      notes: notes !== undefined ? (String(notes).trim() || null) : existing.notes,
      archived: archived !== undefined ? Boolean(archived) : existing.archived,
    }).where(and(eq(fleetAssets.id, id), eq(fleetAssets.companyId, profile.companyId)));

    const updated = await db.query.fleetAssets.findFirst({
      where: eq(fleetAssets.id, id),
    });

    res.json({ asset: updated });
  } catch (error) {
    console.error('PUT /api/fleet/:id error:', error);
    res.status(500).json({ error: 'Failed to update asset' });
  }
}
