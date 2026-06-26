import type { Request, Response } from 'express';
import { db } from '../../../db/client.js';
import { estimates, estimateLines, profiles } from '../../../db/schema.js';
import { eq, and, asc } from 'drizzle-orm';
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

    const estimateId = parseInt(String(req.params.id), 10);
    if (isNaN(estimateId)) return res.status(400).json({ error: 'Invalid estimate ID' });

    const existing = await db.query.estimates.findFirst({
      where: and(eq(estimates.id, estimateId), eq(estimates.companyId, profile.companyId)),
    });
    if (!existing) return res.status(404).json({ error: 'Estimate not found' });

    // Approved estimates are locked — only status changes allowed
    if (existing.status === 'Approved') {
      const { status } = req.body as { status?: string };
      if (status && status !== 'Approved') {
        await db.update(estimates).set({ status }).where(eq(estimates.id, estimateId));
      }
      const updated = await db.query.estimates.findFirst({ where: eq(estimates.id, estimateId) });
      const lines = await db.select().from(estimateLines).where(eq(estimateLines.estimateId, estimateId)).orderBy(asc(estimateLines.lineOrder), asc(estimateLines.id));
      return res.json({ estimate: updated, lines });
    }

    const { title, status, markupPercent, gstMode, notes, lines } = req.body as {
      title?: string;
      status?: string;
      markupPercent?: string;
      gstMode?: string;
      notes?: string;
      lines?: Array<{ id?: number; description: string; quantity?: string; unit?: string; rate?: string; lineOrder?: number }>;
    };

    // Update estimate header
    const updateData: Record<string, unknown> = {};
    if (title !== undefined) updateData.title = title.trim();
    if (status !== undefined) updateData.status = status;
    if (markupPercent !== undefined) updateData.markupPercent = markupPercent;
    if (gstMode !== undefined) updateData.gstMode = gstMode;
    if (notes !== undefined) updateData.notes = notes?.trim() ?? null;

    if (Object.keys(updateData).length > 0) {
      await db.update(estimates).set(updateData).where(eq(estimates.id, estimateId));
    }

    // Replace all lines if provided
    if (lines !== undefined) {
      await db.delete(estimateLines).where(eq(estimateLines.estimateId, estimateId));
      if (lines.length > 0) {
        await db.insert(estimateLines).values(
          lines.map((l, i) => ({
            estimateId,
            description: l.description,
            quantity: l.quantity ?? '1',
            unit: l.unit ?? null,
            rate: l.rate ?? '0',
            lineOrder: l.lineOrder ?? i,
          }))
        );
      }
    }

    const updated = await db.query.estimates.findFirst({ where: eq(estimates.id, estimateId) });
    const updatedLines = await db.select().from(estimateLines).where(eq(estimateLines.estimateId, estimateId)).orderBy(asc(estimateLines.lineOrder), asc(estimateLines.id));

    res.json({ estimate: updated, lines: updatedLines });
  } catch (error) {
    console.error('PUT /api/estimates/:id error:', error);
    res.status(500).json({ error: 'Failed to update estimate' });
  }
}
