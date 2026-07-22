import type { Request, Response } from 'express';
import { db } from '../../../db/client.js';
import { profiles, companies, user } from '../../../db/schema.js';
import { eq, sql } from 'drizzle-orm';
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

    // ── Normal users: have a profile ─────────────────────────────────────────
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

    const normalUsers = rows.map((r) => ({
      id: r.profileId,
      userId: r.userId,
      name: r.userName ?? 'Unknown',
      email: r.userEmail,
      emailVerified: r.emailVerified ?? false,
      company: r.companyName ?? '—',
      companyId: r.companyId,
      role: r.role,
      status: r.status,
      lastLoginAt: r.lastLoginAt,
      lastActiveAt: r.lastActiveAt,
      onlineNow: r.lastActiveAt ? new Date(r.lastActiveAt) >= fiveMinAgo : false,
      createdAt: r.createdAt,
      isOrphan: false,
      orphanReason: null as string | null,
    }));

    // ── Orphaned auth users: exist in `user` table but have no profile ────────
    // These are users where signup failed partway through (auth created, profile/company not).
    const profiledUserIds = new Set(normalUsers.map((u) => u.userId));

    let orphanUsers: typeof normalUsers = [];
    try {
      const [allAuthRows] = await db.execute(
        sql`SELECT id, name, email, email_verified, created_at FROM user ORDER BY created_at DESC LIMIT 500`
      ) as unknown as [Array<{ id: string; name: string | null; email: string; email_verified: number | boolean; created_at: Date | string }>, unknown];

      orphanUsers = (allAuthRows ?? [])
        .filter((r) => !profiledUserIds.has(r.id))
        .map((r) => ({
          id: -1, // no profile id
          userId: r.id,
          name: r.name ?? 'Unknown',
          email: r.email,
          emailVerified: Boolean(r.email_verified),
          company: '—',
          companyId: null,
          role: '—',
          status: 'orphan',
          lastLoginAt: null,
          lastActiveAt: null,
          onlineNow: false,
          createdAt: r.created_at instanceof Date ? r.created_at : new Date(r.created_at),
          isOrphan: true,
          orphanReason: 'Signup incomplete — auth user exists but no profile or company was created.',
        }));
    } catch (e) {
      console.warn('[owner-console/users] orphan detection failed:', (e as Error)?.message?.slice(0, 120));
    }

    res.json({ users: [...normalUsers, ...orphanUsers] });
  } catch (error) {
    console.error('GET /api/owner-console/users error:', error);
    res.status(500).json({ error: 'Failed to fetch users' });
  }
}
