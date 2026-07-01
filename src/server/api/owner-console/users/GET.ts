import type { Request, Response } from 'express';
import { db } from '../../../db/client.js';
import { profiles, companies, user } from '../../../db/schema.js';
import { eq } from 'drizzle-orm';
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
    // Platform owner check handled by requirePlatformOwner middleware in entry.ts

    const rows = await db
      .select({
        profileId: profiles.id,
        userId: profiles.userId,
        role: profiles.role,
        status: profiles.status,
        companyId: profiles.companyId,
        lastLoginAt: profiles.lastLoginAt,
        lastActiveAt: profiles.lastActiveAt,
        createdAt: profiles.createdAt,
        userName: user.name,
        userEmail: user.email,
        emailVerified: user.emailVerified,
        companyName: companies.name,
      })
      .from(profiles)
      .innerJoin(user, eq(profiles.userId, user.id))
      .leftJoin(companies, eq(profiles.companyId, companies.id));

    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);

    const result = rows.map((r) => ({
      id: r.profileId,
      userId: r.userId,
      name: r.userName ?? 'Unknown',
      email: r.userEmail,
      emailVerified: r.emailVerified ?? false,
      verificationMethod: (r as unknown as { verificationMethod?: string }).verificationMethod ?? null,
      company: r.companyName ?? '—',
      companyId: r.companyId,
      role: r.role,
      status: r.status,
      lastLoginAt: r.lastLoginAt,
      lastActiveAt: r.lastActiveAt,
      onlineNow: r.lastActiveAt ? new Date(r.lastActiveAt) >= fiveMinAgo : false,
      createdAt: r.createdAt,
    }));

    res.json({ users: result });
  } catch (error) {
    console.error('GET /api/owner-console/users error:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
}
