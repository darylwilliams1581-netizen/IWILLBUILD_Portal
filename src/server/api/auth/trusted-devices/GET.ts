/**
 * GET /api/auth/trusted-devices
 * Returns the list of trusted devices for the current user.
 */
import type { Request, Response } from 'express';
import { db } from '../../../db/client.js';
import { trustedDevices } from '../../../db/schema.js';
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

    const devices = await db
      .select({
        id: trustedDevices.id,
        deviceName: trustedDevices.deviceName,
        deviceFingerprint: trustedDevices.deviceFingerprint,
        hasPin: trustedDevices.pinHash,
        pinAttempts: trustedDevices.pinAttempts,
        pinLockedUntil: trustedDevices.pinLockedUntil,
        lastUsedAt: trustedDevices.lastUsedAt,
        createdAt: trustedDevices.createdAt,
      })
      .from(trustedDevices)
      .where(eq(trustedDevices.userId, session.user.id));

    return res.json({
      devices: devices.map((d) => ({
        ...d,
        hasPin: !!d.hasPin,
        isLocked: d.pinLockedUntil ? new Date(d.pinLockedUntil) > new Date() : false,
      })),
    });
  } catch (err) {
    console.error('GET /api/auth/trusted-devices error:', err);
    return res.status(500).json({ error: 'Failed to fetch trusted devices.' });
  }
}
