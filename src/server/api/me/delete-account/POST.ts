/**
 * POST /api/me/delete-account
 *
 * Permanently deletes the authenticated login after BetterAuth verifies the
 * current password. Team members delete only their own account. A sole company
 * owner also deletes the company and its company-scoped records. Owners with
 * other active members must transfer ownership first so the company is not
 * stranded. Active Stripe subscriptions are cancelled before company deletion.
 */
import type { Request, Response } from 'express';
import { eq, ne, and } from 'drizzle-orm';
import { db } from '../../../db/client.js';
import { profiles } from '../../../db/schema.js';
import { createAccountDeletionAuthorization, getAuth } from '../../../../lib/auth/auth.js';
import { getPlatformOwnerInfo } from '../../../lib/platform-owner-guard.js';

function requestHeaders(req: Request): Headers {
  const headers = new Headers();
  for (const [key, value] of Object.entries(req.headers)) {
    if (value) headers.set(key, Array.isArray(value) ? value[0] : value);
  }
  return headers;
}

export default async function handler(req: Request, res: Response) {
  const headers = requestHeaders(req);
  try {
    const auth = getAuth();
    const authSession = await auth.api.getSession({ headers });
    if (!authSession?.user) return res.status(401).json({ error: 'Unauthorised' });

    const ownerInfo = await getPlatformOwnerInfo(req);
    if (ownerInfo?.isPlatformOwner) {
      return res.status(403).json({
        error: 'platform_account_protected',
        message: 'The platform developer account cannot be deleted here.',
      });
    }

    const body = req.body as {
      password?: string;
      confirmation?: string;
      deleteCompanyData?: boolean;
    };
    if (body.confirmation !== 'DELETE') {
      return res.status(400).json({ error: 'Type DELETE to confirm.' });
    }
    if (!body.password?.trim()) {
      return res.status(400).json({ error: 'Current password is required.' });
    }

    const profile = await db.query.profiles.findFirst({
      where: eq(profiles.userId, authSession.user.id),
    });

    if (profile?.role === 'owner' && profile.companyId) {
      const remainingMembers = await db.query.profiles.findMany({
        where: and(
          eq(profiles.companyId, profile.companyId),
          ne(profiles.userId, authSession.user.id),
          ne(profiles.status, 'inactive'),
        ),
        columns: { id: true },
      });
      if (remainingMembers.length > 0) {
        return res.status(409).json({
          error: 'ownership_transfer_required',
          message: 'Transfer company ownership to another active team member before deleting your account.',
        });
      }
      if (body.deleteCompanyData !== true) {
        return res.status(400).json({
          error: 'company_confirmation_required',
          message: 'Confirm that the company and its data will also be permanently deleted.',
        });
      }

    }

    headers.set('x-iwb-account-delete-authorization', createAccountDeletionAuthorization(authSession.user.id));

    await auth.api.deleteUser({
      body: { password: body.password },
      headers,
    });

    console.info(JSON.stringify({
      event: 'account.deleted',
      userId: authSession.user.id,
      companyId: profile?.companyId ?? null,
      companyDeleted: profile?.role === 'owner',
      ts: Date.now(),
    }));
    return res.json({ ok: true });
  } catch (error) {
    const message = String((error as Error)?.message ?? error);
    if (/password|credential|session expired/i.test(message)) {
      return res.status(400).json({ error: 'Current password is incorrect.' });
    }
    if (/transfer company ownership/i.test(message)) {
      return res.status(409).json({ error: 'ownership_transfer_required', message: 'Transfer company ownership to another active team member before deleting your account.' });
    }
    if (/cancel the linked subscription/i.test(message)) {
      return res.status(502).json({ error: 'subscription_cancellation_failed', message: 'We could not cancel the linked subscription. No account data was deleted. Please try again or contact support@iwillbuild.com.' });
    }
    console.error('POST /api/me/delete-account error:', error);
    return res.status(500).json({
      error: 'Account deletion failed. No further action was taken. Please try again.',
    });
  }
}
