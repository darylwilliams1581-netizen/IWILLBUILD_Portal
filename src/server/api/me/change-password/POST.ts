import type { Request, Response } from 'express';
import { getAuth } from '../../../../lib/auth/auth.js';
import { logActivity, getIp, getUserAgent } from '../../../lib/activity-log.js';

export default async function handler(req: Request, res: Response) {
  try {
    const auth = getAuth();

    // Build a Headers object from the incoming request (needed for session + cookie forwarding)
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) {
      if (v) headers.set(k, (Array.isArray(v) ? v[0] : v) as string);
    }

    // Verify the user is authenticated
    const session = await auth.api.getSession({ headers });
    if (!session?.user) {
      return res.status(401).json({ error: 'Unauthorised' });
    }

    const { currentPassword, newPassword } = req.body as {
      currentPassword?: string;
      newPassword?: string;
    };

    // ── Server-side validation ────────────────────────────────────────────────
    if (!currentPassword || typeof currentPassword !== 'string' || !currentPassword.trim()) {
      return res.status(400).json({ error: 'Current password is required.' });
    }

    if (!newPassword || typeof newPassword !== 'string') {
      return res.status(400).json({ error: 'New password is required.' });
    }

    if (newPassword.length < 8) {
      return res.status(400).json({ error: 'New password must be at least 8 characters.' });
    }

    if (!/\d/.test(newPassword)) {
      return res.status(400).json({ error: 'New password must include at least one number.' });
    }

    if (!/[!@#$%^&*()_+\-=[\]{};':"\\|,.<>/?`~]/.test(newPassword)) {
      return res.status(400).json({ error: 'New password must include at least one symbol.' });
    }

    // ── Delegate to BetterAuth changePassword ────────────────────────────────
    // BetterAuth's changePassword verifies the current password internally
    // and hashes the new one — we never touch plain-text passwords.
    await auth.api.changePassword({
      body: {
        currentPassword,
        newPassword,
        revokeOtherSessions: false, // keep the current session alive
      },
      headers,
    });

    res.json({ ok: true, message: 'Password changed successfully.' });

    void logActivity({
      eventType: 'password_changed',
      success: true,
      userId: session.user.id,
      email: session.user.email ?? null,
      ipAddress: getIp(req as unknown as { headers: Record<string, string | string[] | undefined>; socket?: { remoteAddress?: string } }),
      userAgent: getUserAgent(req as unknown as { headers: Record<string, string | string[] | undefined> }),
      reason: 'user_initiated',
    });
  } catch (error) {
    const msg = String(error);

    // BetterAuth throws a specific error when the current password is wrong
    if (msg.toLowerCase().includes('invalid') || msg.toLowerCase().includes('incorrect') || msg.toLowerCase().includes('password')) {
      return res.status(400).json({ error: 'Current password is incorrect.' });
    }

    console.error('POST /api/me/change-password error:', error);
    res.status(500).json({ error: 'Failed to change password. Please try again.' });
  }
}
