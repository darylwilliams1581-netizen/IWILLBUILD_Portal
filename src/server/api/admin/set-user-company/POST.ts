import type { Request, Response } from 'express';
import { db } from '@/server/db/client';
import { sql } from 'drizzle-orm';

export default async function handler(req: Request, res: Response) {
  try {
    const { email, companyId, role } = req.body as {
      email: string;
      companyId: number;
      role: string;
    };

    if (!email || !companyId || !role) {
      return res.status(400).json({ error: 'email, companyId and role required' });
    }

    const [userRows] = await db.execute(
      sql`SELECT id FROM \`user\` WHERE email = ${email} LIMIT 1`
    ) as any;
    const user = Array.isArray(userRows) ? userRows[0] : null;
    if (!user) return res.status(404).json({ error: 'User not found', email });

    const [companyRows] = await db.execute(
      sql`SELECT id, name FROM companies WHERE id = ${companyId} LIMIT 1`
    ) as any;
    const company = Array.isArray(companyRows) ? companyRows[0] : null;
    if (!company) return res.status(404).json({ error: 'Company not found', companyId });

    const [profileRows] = await db.execute(
      sql`SELECT id, company_id, role FROM profiles WHERE user_id = ${user.id} LIMIT 1`
    ) as any;
    const profile = Array.isArray(profileRows) ? profileRows[0] : null;
    if (!profile) return res.status(404).json({ error: 'Profile not found for user' });

    await db.execute(sql`
      UPDATE profiles
      SET company_id = ${companyId},
          role = ${role},
          home_icon_permissions = NULL
      WHERE user_id = ${user.id}
    `);

    return res.json({
      ok: true,
      userId: user.id,
      previousCompanyId: profile.company_id,
      previousRole: profile.role,
      newCompanyId: companyId,
      newCompanyName: company.name,
      newRole: role,
    });
  } catch (err) {
    console.error('[admin/set-user-company] Unhandled error:', err);
    res.status(500).json({ error: 'Failed to update user company' });
  }
}
