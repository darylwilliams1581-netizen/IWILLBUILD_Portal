import type { Request, Response } from 'express';
import { db } from '../../db/client.js';
import { estimates, estimateLines, profiles } from '../../db/schema.js';
import { eq, and, desc, inArray } from 'drizzle-orm';
import { getAuth } from '../../../lib/auth/auth.js';

function computeTotal(
  lines: { quantity: string; rate: string }[],
  markupPercent: string,
  gstMode: string,
): number {
  const subtotal = lines.reduce((sum, l) => {
    return sum + (parseFloat(l.quantity) || 0) * (parseFloat(l.rate) || 0);
  }, 0);
  const markup = (parseFloat(markupPercent) || 0) / 100;
  const afterMarkup = subtotal * (1 + markup);
  const gst = gstMode === 'Add 10% GST' ? afterMarkup * 0.1 : 0;
  return afterMarkup + gst;
}

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

    const jobId = req.query.jobId ? parseInt(String(req.query.jobId), 10) : null;
    if (!jobId || isNaN(jobId)) return res.status(400).json({ error: 'jobId required' });

    const rows = await db
      .select()
      .from(estimates)
      .where(and(eq(estimates.jobId, jobId), eq(estimates.companyId, profile.companyId)))
      .orderBy(desc(estimates.createdAt));

    if (rows.length === 0) return res.json({ estimates: [] });

    // Fetch all lines for these estimates in one query
    const estimateIds = rows.map((r) => r.id);
    const allLines = await db
      .select({ estimateId: estimateLines.estimateId, quantity: estimateLines.quantity, rate: estimateLines.rate })
      .from(estimateLines)
      .where(inArray(estimateLines.estimateId, estimateIds));

    // Group lines by estimateId
    const linesByEstimate = new Map<number, { quantity: string; rate: string }[]>();
    for (const l of allLines) {
      const arr = linesByEstimate.get(l.estimateId) ?? [];
      arr.push({ quantity: l.quantity, rate: l.rate });
      linesByEstimate.set(l.estimateId, arr);
    }

    const result = rows.map((est) => ({
      ...est,
      total: computeTotal(
        linesByEstimate.get(est.id) ?? [],
        est.markupPercent,
        est.gstMode,
      ),
    }));

    res.json({ estimates: result });
  } catch (error) {
    console.error('GET /api/estimates error:', error);
    res.status(500).json({ error: 'Failed to fetch estimates' });
  }
}
