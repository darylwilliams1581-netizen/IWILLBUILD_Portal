import type { Request, Response } from 'express';
import { db } from '../../db/client.js';
import { profiles, user } from '../../db/schema.js';
import { eq } from 'drizzle-orm';
import { getAuth } from '../../../lib/auth/auth.js';

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
    if (!callerProfile?.companyId) {
      return res.status(403).json({ error: 'No company associated with your account' });
    }

    // Allow: owner, admin role, OR perm_admin = true
    const canManageTeam =
      callerProfile.role === 'owner' ||
      callerProfile.role === 'admin' ||
      callerProfile.permAdmin === true;

    if (!canManageTeam) {
      return res.status(403).json({ error: 'Admin access required' });
    }

    const rows = await db
      .select({
        profileId: profiles.id,
        userId: profiles.userId,
        role: profiles.role,
        status: profiles.status,
        phone: profiles.phone,
        permJobs: profiles.permJobs,
        permFleet: profiles.permFleet,
        permForms: profiles.permForms,
        permFiles: profiles.permFiles,
        permEstimating: profiles.permEstimating,
        permDazzaAi: profiles.permDazzaAi,
        permAdmin: profiles.permAdmin,
        permSeeDollars: profiles.permSeeDollars,
        permInviteUsers: profiles.permInviteUsers,
        permDeleteRecords: profiles.permDeleteRecords,
        createdAt: profiles.createdAt,
        userName: user.name,
        userEmail: user.email,
      })
      .from(profiles)
      .innerJoin(user, eq(profiles.userId, user.id))
      .where(eq(profiles.companyId, callerProfile.companyId));

    const members = rows.map((r) => ({
      id: r.profileId,
      userId: r.userId,
      name: r.userName ?? 'Unknown',
      email: r.userEmail,
      phone: r.phone ?? '',
      role: r.role,
      status: r.status,
      permissions: {
        jobs: r.permJobs,
        fleet: r.permFleet,
        forms: r.permForms,
        files: r.permFiles,
        estimating: r.permEstimating,
        dazzaAi: r.permDazzaAi,
        admin: r.permAdmin,
        seeDollars: r.permSeeDollars,
        inviteUsers: r.permInviteUsers,
        deleteRecords: r.permDeleteRecords,
      },
      joinedAt: r.createdAt,
    }));

    res.json({ members });
  } catch (error) {
    console.error('GET /api/team error:', error);
    res.status(500).json({ error: 'Failed to fetch team' });
  }
}
