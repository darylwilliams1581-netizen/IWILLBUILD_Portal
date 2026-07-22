/**
 * POST /api/auth/trusted-devices
 * Body: { deviceFingerprint: string; deviceName?: string; pin: string }
 *
 * Registers the current device as trusted and sets a PIN.
 * Only available to verified users who have logged in normally.
 * PIN is 4–6 digits. Stored as bcrypt hash.
 */
import type { Request, Response } from 'express';
import { randomBytes } from 'node:crypto';
import { db } from '../../../db/client.js';
import { trustedDevices, user } from '../../../db/schema.js';
import { eq, and } from 'drizzle-orm';
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

    // Only verified users can set up PIN
    const [u] = await db
      .select({ emailVerified: user.emailVerified })
      .from(user)
      .where(eq(user.id, session.user.id))
      .limit(1);

    if (!u?.emailVerified) {
      return res.status(403).json({ error: 'Your account must be verified before setting up PIN login.' });
    }

    const { deviceFingerprint, deviceName, pin } = req.body as {
      deviceFingerprint?: string;
      deviceName?: string;
      pin?: string;
    };

    if (!deviceFingerprint) return res.status(400).json({ error: 'Device fingerprint is required.' });
    if (!pin) return res.status(400).json({ error: 'PIN is required.' });
    if (!/^\d{4,6}$/.test(pin)) return res.status(400).json({ error: 'PIN must be 4–6 digits.' });

    const { hash } = await import('bcryptjs');
    const pinHash = await hash(pin, 12);
    const id = randomBytes(18).toString('hex');

    // Upsert — update if device already registered, insert if new
    const [existing] = await db
      .select({ id: trustedDevices.id })
      .from(trustedDevices)
      .where(
        and(
          eq(trustedDevices.userId, session.user.id),
          eq(trustedDevices.deviceFingerprint, deviceFingerprint),
        ),
      )
      .limit(1);

    if (existing) {
      await db
        .update(trustedDevices)
        .set({
          pinHash,
          pinAttempts: 0,
          pinLockedUntil: null,
          deviceName: deviceName ?? null,
          lastUsedAt: new Date(),
        })
        .where(eq(trustedDevices.id, existing.id));
    } else {
      await db.insert(trustedDevices).values({
        id,
        userId: session.user.id,
        deviceFingerprint,
        deviceName: deviceName ?? null,
        pinHash,
        pinAttempts: 0,
        lastUsedAt: new Date(),
      });
    }

    return res.json({ ok: true, message: 'PIN set up successfully on this device.' });
  } catch (err) {
    console.error('POST /api/auth/trusted-devices error:', err);
    return res.status(500).json({ error: 'Failed to set up PIN.' });
  }
}
