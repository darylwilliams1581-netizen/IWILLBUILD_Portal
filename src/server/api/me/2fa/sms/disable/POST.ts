/**
 * POST /api/me/2fa/sms/disable
 * Body: { password: string }
 *
 * Disables SMS 2FA. Requires current password for confirmation.
 *
 * Security fix: parameterised queries (no sql.raw interpolation).
 */
import type { Request, Response } from 'express';
import { db } from '../../../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getAuth } from '../../../../../../lib/auth/auth.js';

export default async function handler(req: Request, res: Response) {
  try {
    const auth = getAuth();
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) {
      if (v) headers.set(k, Array.isArray(v) ? v[0] : v);
    }
    const session = await auth.api.getSession({ headers });
    if (!session?.user) return res.status(401).json({ error: 'Unauthorised' });

    const userId = session.user.id;
    const { password } = req.body as { password?: string };
    if (!password) return res.status(400).json({ error: 'Current password is required.' });

    const rows = (await db.execute(
      sql`SELECT password, sms_2fa_enabled FROM \`user\` WHERE id = ${userId} LIMIT 1`,
    )) as unknown as [Array<{ password: string | null; sms_2fa_enabled: number }>, unknown];

    const userRow = rows[0]?.[0];
    if (!userRow) return res.status(404).json({ error: 'User not found.' });
    if (!userRow.sms_2fa_enabled) return res.status(400).json({ error: 'SMS 2FA is not enabled.' });

    const { default: bcrypt } = await import('bcryptjs');
    const pwOk = userRow.password ? await bcrypt.compare(password, userRow.password) : false;
    if (!pwOk) return res.status(400).json({ error: 'Incorrect password.' });

    await db.execute(
      sql`UPDATE \`user\` SET sms_2fa_enabled = 0, sms_2fa_phone = NULL WHERE id = ${userId}`,
    );

    return res.json({ ok: true });
  } catch (err) {
    console.error('[2fa/sms/disable] error (details redacted)');
    return res.status(500).json({ error: 'Failed to disable SMS 2FA.' });
  }
}
