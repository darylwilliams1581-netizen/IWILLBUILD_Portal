import type { Request, Response } from 'express';
import { db } from '../../db/client.js';
import { estimates, estimateLines, profiles, jobs } from '../../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { getAuth } from '../../../lib/auth/auth.js';

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

    const { jobId, title, status, markupPercent, gstMode, notes, lines } = req.body as {
      jobId: number;
      title: string;
      status?: string;
      markupPercent?: string;
      gstMode?: string;
      notes?: string;
      lines?: Array<{ description: string; quantity?: string; unit?: string; rate?: string; lineOrder?: number }>;
    };

    if (!jobId || !title?.trim()) return res.status(400).json({ error: 'jobId and title required' });

    // Verify job belongs to company
    const job = await db.query.jobs.findFirst({
      where: and(eq(jobs.id, jobId), eq(jobs.companyId, profile.companyId)),
    });
    if (!job) return res.status(404).json({ error: 'Job not found' });

    const [inserted] = await db.insert(estimates).values({
      jobId,
      companyId: profile.companyId,
      title: title.trim(),
      status: status ?? 'Draft',
      markupPercent: markupPercent ?? '0',
      gstMode: gstMode ?? 'No GST',
      notes: notes?.trim() ?? null,
    }).$returningId();

    // Insert lines if provided (used for duplicate)
    if (lines && lines.length > 0) {
      await db.insert(estimateLines).values(
        lines.map((l, i) => ({
          estimateId: inserted.id,
          description: l.description,
          quantity: l.quantity ?? '1',
          unit: l.unit ?? null,
          rate: l.rate ?? '0',
          lineOrder: l.lineOrder ?? i,
        }))
      );
    }

    const estimate = await db.query.estimates.findFirst({
      where: eq(estimates.id, inserted.id),
    });

    res.status(201).json({ estimate });
  } catch (error) {
    console.error('POST /api/estimates error:', error);
    res.status(500).json({ error: 'Failed to create estimate' });
  }
}
