/**
 * Activity tracking helpers.
 * Records login events and updates last_login_at / last_active_at on profiles.
 * All functions are fire-and-forget safe — errors are swallowed so they never
 * break the main request flow.
 */
import { db } from './db/client.js';
import { profiles, userActivityEvents } from './db/schema.js';
import { eq } from 'drizzle-orm';

export async function recordLoginEvent(userId: string): Promise<void> {
  try {
    const profile = await db.query.profiles.findFirst({
      where: eq(profiles.userId, userId),
    });
    if (!profile) return;

    const now = new Date();

    // Update last_login_at and last_active_at
    await db
      .update(profiles)
      .set({ lastLoginAt: now, lastActiveAt: now })
      .where(eq(profiles.userId, userId));

    // Insert activity event
    if (profile.companyId) {
      await db.insert(userActivityEvents).values({
        companyId: profile.companyId,
        userId,
        eventType: 'login',
        metadataJson: null,
      });
    }
  } catch (err) {
    console.error('recordLoginEvent error:', err);
  }
}

export async function recordLogoutEvent(userId: string): Promise<void> {
  try {
    const profile = await db.query.profiles.findFirst({
      where: eq(profiles.userId, userId),
    });
    if (!profile?.companyId) return;

    await db.insert(userActivityEvents).values({
      companyId: profile.companyId,
      userId,
      eventType: 'logout',
      metadataJson: null,
    });
  } catch (err) {
    console.error('recordLogoutEvent error:', err);
  }
}
