import type { Request, Response } from 'express';
import { db } from '../../../db/client.js';
import { fleetAssets, fleetPrestarts, profiles } from '../../../db/schema.js';
import { eq, and, desc } from 'drizzle-orm';
import { getAuth } from '../../../../lib/auth/auth.js';

const DAYS_14 = 14 * 24 * 60 * 60 * 1000;

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

    const now = new Date();
    const in14 = new Date(now.getTime() + DAYS_14);

    // Active (non-archived) assets
    const assets = await db
      .select()
      .from(fleetAssets)
      .where(and(eq(fleetAssets.companyId, profile.companyId), eq(fleetAssets.archived, false)));

    // Latest prestart per asset that has an issue
    const attentionFlags: Array<{ assetId: number; assetName: string; comment: string | null; date: Date | null }> = [];
    const dueDateFlags: Array<{ assetId: number; assetName: string; type: 'service' | 'rego'; dueDate: Date }> = [];

    for (const asset of assets) {
      // Check for unresolved attention flag (most recent prestart with issue)
      const latestIssue = await db
        .select()
        .from(fleetPrestarts)
        .where(
          and(
            eq(fleetPrestarts.assetId, asset.id),
            eq(fleetPrestarts.companyId, profile.companyId),
            eq(fleetPrestarts.issueNeedsAttention, true),
          ),
        )
        .orderBy(desc(fleetPrestarts.createdAt))
        .limit(1);

      if (latestIssue.length > 0) {
        attentionFlags.push({
          assetId: asset.id,
          assetName: asset.name,
          comment: latestIssue[0].issueComment,
          date: latestIssue[0].createdAt,
        });
      }

      // Service due within 14 days
      if (asset.serviceDate && asset.serviceDate <= in14) {
        dueDateFlags.push({
          assetId: asset.id,
          assetName: asset.name,
          type: 'service',
          dueDate: asset.serviceDate,
        });
      }

      // Rego due within 14 days (only if rego is applicable)
      if (!asset.regoNotApplicable && asset.regoExpiry && asset.regoExpiry <= in14) {
        dueDateFlags.push({
          assetId: asset.id,
          assetName: asset.name,
          type: 'rego',
          dueDate: asset.regoExpiry,
        });
      }
    }

    const totalFlags = attentionFlags.length + dueDateFlags.length;

    res.json({
      totalFlags,
      attentionFlags,
      dueDateFlags,
      activeAssetCount: assets.length,
    });
  } catch (error) {
    console.error('GET /api/fleet/flags error:', error);
    res.status(500).json({ error: 'Failed to fetch fleet flags' });
  }
}
