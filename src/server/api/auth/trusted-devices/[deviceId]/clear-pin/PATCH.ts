/**
 * PATCH /api/auth/trusted-devices/:deviceId/clear-pin
 *
 * Clears the PIN hash on a trusted device without deleting the device record.
 * Used when the user disables PIN lock but wants to keep the device trusted.
 * User can only clear their own devices.
 */
import type { Request, Response } from 'express';
import { db } from '../../../../../db/client.js';
import { trustedDevices } from '../../../../../db/schema.js';
import { eq, and } from 'drizzle-orm';
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

    const { deviceId } = req.params;
    if (!deviceId) return res.status(400).json({ error: 'Device ID is required.' });

    const result = await db
      .update(trustedDevices)
      .set({
        pinHash: null,
        pinAttempts: 0,
        pinLockedUntil: null,
      })
      .where(
        and(
          eq(trustedDevices.id, deviceId),
          eq(trustedDevices.userId, session.user.id),
        ),
      );

    return res.json({ ok: true, message: 'PIN cleared from device.' });
  } catch (err) {
    console.error('PATCH /api/auth/trusted-devices/:deviceId/clear-pin error:', err);
    return res.status(500).json({ error: 'Failed to clear PIN.' });
  }
}
