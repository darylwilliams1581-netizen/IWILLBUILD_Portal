import type { Request, Response } from 'express';
import { db } from '../../../db/client.js';
import { profiles } from '../../../db/schema.js';
import { eq } from 'drizzle-orm';
import { getAuth } from '../../../../lib/auth/auth.js';

export default async function handler(req: Request, res: Response) {
  try {
    const auth = getAuth();
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) {
      if (v) headers.set(k, (Array.isArray(v) ? v[0] : v) as string);
    }
    const session = await auth.api.getSession({ headers });
    if (!session?.user) return res.status(401).json({ error: 'Unauthorised' });

    const callerProfile = await db.query.profiles.findFirst({
      where: eq(profiles.userId, session.user.id),
    });
    if (!callerProfile?.companyId) return res.status(403).json({ error: 'No company' });
    if (callerProfile.role !== 'admin' && callerProfile.role !== 'owner') {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const targetId = parseInt(req.params.id as string, 10);
    if (isNaN(targetId)) return res.status(400).json({ error: 'Invalid ID' });

    // Verify target belongs to same company
    const target = await db.query.profiles.findFirst({
      where: eq(profiles.id, targetId),
    });
    if (!target || target.companyId !== callerProfile.companyId) {
      return res.status(404).json({ error: 'Member not found' });
    }

    const {
      role, status, phone,
      permJobs, permFleet, permForms, permFiles, permEstimating,
      permDazzaAi, permAdmin, permSeeDollars, permInviteUsers, permDeleteRecords,
    } = req.body as {
      role?: string;
      status?: string;
      phone?: string;
      permJobs?: boolean;
      permFleet?: boolean;
      permForms?: boolean;
      permFiles?: boolean;
      permEstimating?: boolean;
      permDazzaAi?: boolean;
      permAdmin?: boolean;
      permSeeDollars?: boolean;
      permInviteUsers?: boolean;
      permDeleteRecords?: boolean;
    };

    const updates: Partial<typeof profiles.$inferInsert> = {};
    if (role !== undefined) updates.role = role;
    if (status !== undefined) updates.status = status;
    if (phone !== undefined) updates.phone = phone;
    if (permJobs !== undefined) updates.permJobs = permJobs;
    if (permFleet !== undefined) updates.permFleet = permFleet;
    if (permForms !== undefined) updates.permForms = permForms;
    if (permFiles !== undefined) updates.permFiles = permFiles;
    if (permEstimating !== undefined) updates.permEstimating = permEstimating;
    if (permDazzaAi !== undefined) updates.permDazzaAi = permDazzaAi;
    if (permAdmin !== undefined) updates.permAdmin = permAdmin;
    if (permSeeDollars !== undefined) updates.permSeeDollars = permSeeDollars;
    if (permInviteUsers !== undefined) updates.permInviteUsers = permInviteUsers;
    if (permDeleteRecords !== undefined) updates.permDeleteRecords = permDeleteRecords;

    if (Object.keys(updates).length === 0) {
      return res.status(400).json({ error: 'No fields to update' });
    }

    await db.update(profiles).set(updates).where(eq(profiles.id, targetId));

    const updated = await db.query.profiles.findFirst({ where: eq(profiles.id, targetId) });
    res.json({ profile: updated });
  } catch (error) {
    console.error('PUT /api/team/:id error:', error);
    res.status(500).json({ error: 'Failed to update member' });
  }
}
