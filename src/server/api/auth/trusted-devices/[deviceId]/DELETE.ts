/**
 * DELETE /api/auth/trusted-devices/:deviceId
 * Revokes a trusted device. User can only revoke their own devices.
 */
import type { Request, Response } from 'express';
import { db } from '../../../../db/client.js';
import { trustedDevices } from '../../../../db/schema.js';
import { eq, and } from 'drizzle-orm';
import { getAuth } from '../../../../../lib/auth/auth.js';

export default async function handler(req: Request, res: Response) {
  try {
    const auth = getAuth();
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) {
      if (v) headers.set(k, Array.isArray(v) ? v[0] : v);
    }
    const session = await auth.api.getSession({ headers });
    if (!session?.user) return res.status(401).json({ error: 'Unauthorised' });

    const { deviceId } = req.params;
    if (!deviceId) return res.status(400).json({ error: 'Device ID is required.' });

    await db
      .delete(trustedDevices)
      .where(
        and(
          eq(trustedDevices.id, deviceId),
          eq(trustedDevices.userId, session.user.id),
        ),
      );

    return res.json({ ok: true, message: 'Trusted device removed.' });
  } catch (err) {
    console.error('DELETE /api/auth/trusted-devices/:deviceId error:', err);
    return res.status(500).json({ error: 'Failed to remove device.' });
  }
}
