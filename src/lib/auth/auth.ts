/**
 * BetterAuth Server Configuration
 *
 * Supports both Email/Password and OAuth authentication.
 * Enable/disable methods by uncommenting the relevant sections.
 *
 * Secrets (via getSecret from #airo/secrets):
 * - BETTER_AUTH_SECRET: Session encryption key (auto-generated during install)
 * - OAuth credentials (GOOGLE_CLIENT_ID, etc.) for social login
 *
 * CORS/Trusted Origins:
 * - Only trusts origins matching the server's hostname
 */

import { APIError, betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { twoFactor } from 'better-auth/plugins';

import { db } from '@/server/db/client';
import { user, session, account, verification, twoFactor as twoFactorTable, profiles, companyFiles, companies } from '@/server/db/schema';
import { getSecret } from '#airo/secrets';
import { getStripe } from '@/server/lib/stripe-client';
import { and, eq, ne, sql } from 'drizzle-orm';
import { createHmac, timingSafeEqual } from 'node:crypto';

const ACCOUNT_DELETE_HEADER = 'x-iwb-account-delete-authorization';

export function createAccountDeletionAuthorization(userId: string): string {
  const secretValue = getSecret('BETTER_AUTH_SECRET');
  const secret = typeof secretValue === 'string' ? secretValue : '';
  return createHmac('sha256', secret).update(`owner-delete:${userId}`).digest('hex');
}

function validAccountDeletionAuthorization(userId: string, request?: Request): boolean {
  const received = request?.headers.get(ACCOUNT_DELETE_HEADER) ?? '';
  const expected = createAccountDeletionAuthorization(userId);
  if (!received || received.length !== expected.length) return false;
  return timingSafeEqual(Buffer.from(received), Buffer.from(expected));
}

// Lazy singleton — betterAuth() must NOT run at module init time.
//
// The BETTER_AUTH_SECRET is loaded from the alloc config at runtime, so the
// auth instance must be constructed after the secrets are available (i.e. on
// the first HTTP request, not at import time).
//
// Pattern mirrors how db/client.ts defers the actual MySQL connection — the
// pool object is safe to create at init, but anything that reads schema state
// or secrets must be deferred to request time.
let _auth: ReturnType<typeof betterAuth> | null = null;

export function getAuth() {
  if (_auth) return _auth;

  const authSecret = getSecret('BETTER_AUTH_SECRET');
  if (!authSecret || typeof authSecret !== 'string') {
    throw new Error('BETTER_AUTH_SECRET is not set or invalid — run requestSecrets() first');
  }

  if (!db) {
    throw new Error('Database not configured. Install the database skill first, then configure auth.');
  }

  const auth = betterAuth({
    // Schema passed explicitly — avoids BetterAuth's runtime schema inference.
    database: drizzleAdapter(db, {
      provider: 'mysql',
      schema: { user, session, account, verification, twoFactor: twoFactorTable },
    }),

    secret: authSecret,

    // Derive baseURL from the environment so BetterAuth can build callback URLs correctly.
    // BETTER_AUTH_URL is set in production; fall back to localhost for dev.
    baseURL: process.env.BETTER_AUTH_URL || process.env.AIRO_PREVIEW_URL || 'http://localhost:5173',

    // Protect admin status field from user input
    user: {
      deleteUser: {
        enabled: true,
        beforeDelete: async (currentUser, request) => {
          // The platform developer account is operational infrastructure and
          // must never be removable through the customer self-service flow.
          const configuredOwnerValue = getSecret('PLATFORM_OWNER_EMAIL');
          const configuredOwners = (typeof configuredOwnerValue === 'string' ? configuredOwnerValue : '')
            .split(',')
            .map((email: string) => email.trim().toLowerCase())
            .filter(Boolean);
          if (configuredOwners.includes(currentUser.email.toLowerCase())) {
            throw new APIError('FORBIDDEN', {
              message: 'The platform developer account cannot be deleted here.',
            });
          }

          try {
            const [platformRows] = await db.execute(sql`
              SELECT platform_role FROM profiles WHERE user_id = ${currentUser.id} LIMIT 1
            `) as unknown as [Array<{ platform_role: string | null }>, unknown];
            if (platformRows?.[0]?.platform_role === 'developer') {
              throw new APIError('FORBIDDEN', {
                message: 'The platform developer account cannot be deleted here.',
              });
            }
          } catch (error) {
            if (error instanceof APIError) throw error;
            // Older databases may not have platform_role. The configured email
            // fallback above remains active in that case.
          }

          const profile = await db.query.profiles.findFirst({
            where: eq(profiles.userId, currentUser.id),
          });

          // All self-service deletions must pass through the Settings endpoint,
          // which validates the typed confirmation and mints this server-only
          // HMAC. This prevents bypassing the confirmation via BetterAuth's
          // lower-level /api/auth/delete-user endpoint.
          if (!validAccountDeletionAuthorization(currentUser.id, request)) {
            throw new APIError('FORBIDDEN', {
              message: 'Delete this account from Settings.',
            });
          }

          if (profile?.role === 'owner') {
            if (!profile.companyId) {
              throw new APIError('BAD_REQUEST', { message: 'No company is linked to this owner account.' });
            }

            const remainingMembers = await db.query.profiles.findMany({
              where: and(
                eq(profiles.companyId, profile.companyId),
                ne(profiles.userId, currentUser.id),
                ne(profiles.status, 'inactive'),
              ),
              columns: { id: true },
            });
            if (remainingMembers.length > 0) {
              throw new APIError('CONFLICT', {
                message: 'Transfer company ownership to another active team member before deleting your account.',
              });
            }

            const company = await db.query.companies.findFirst({
              where: eq(companies.id, profile.companyId),
            });
            if (company?.stripeSubscriptionId) {
              try {
                const stripe = await getStripe();
                await stripe.subscriptions.cancel(company.stripeSubscriptionId);
              } catch (error) {
                console.error('account.delete.stripe_failed', error);
                throw new APIError('BAD_GATEWAY', {
                  message: 'We could not cancel the linked subscription. No account data was deleted. Please try again.',
                });
              }
            }

            // Company FKs cascade the sole owner's company data. BetterAuth then
            // removes the auth user, sessions, credentials and two-factor data.
            await db.delete(companies).where(eq(companies.id, profile.companyId));
            return;
          }

          // Keep company-owned files when a team member deletes their login.
          // Reassign uploader ownership to the active company owner before the
          // user FK is removed; personal sessions, 2FA and AI threads cascade.
          if (profile?.companyId) {
            const companyOwner = await db.query.profiles.findFirst({
              where: and(
                eq(profiles.companyId, profile.companyId),
                eq(profiles.role, 'owner'),
                eq(profiles.status, 'active'),
              ),
            });
            if (!companyOwner || companyOwner.userId === currentUser.id) {
              throw new APIError('CONFLICT', {
                message: 'The company needs an active owner before this account can be deleted.',
              });
            }
            await db
              .update(companyFiles)
              .set({ uploadedByUserId: companyOwner.userId })
              .where(eq(companyFiles.uploadedByUserId, currentUser.id));
          }
        },
      },
      additionalFields: {
        isAdmin: {
          type: 'boolean',
          defaultValue: false,
          input: false,  // Prevent clients from writing this field
          returned: true,
        },
        // twoFactorEnabled is managed by the twoFactor plugin — declared here
        // so the drizzle adapter maps it correctly to the two_factor_enabled column.
        twoFactorEnabled: {
          type: 'boolean',
          defaultValue: false,
          input: false,
          returned: true,
        },
      },
    },

    // CORS: Trusts .airoapp.ai subdomains, localhost, the custom domain from
    // BETTER_AUTH_URL, and any origins in BETTER_AUTH_TRUSTED_ORIGINS.
    // Also trusts Capacitor/Ionic WebView origins for the native iOS/Android app.
    trustedOrigins: (request?: Request) => {
      if (!request) return [];

      let origin = request.headers.get('origin');

      // Safari on desktop does NOT send an Origin header on same-origin POST
      // requests. When origin is missing, derive it from the Referer header,
      // then fall back to the Host header. This is safe because disableCSRFCheck
      // is already enabled — we just need trustedOrigins to return a non-empty
      // list so BetterAuth doesn't reject the request outright.
      if (!origin) {
        const referer = request.headers.get('referer');
        if (referer) {
          try { origin = new URL(referer).origin; } catch { /* ignore */ }
        }
        if (!origin) {
          const host = request.headers.get('host');
          if (host) {
            const proto = request.url.startsWith('https') ? 'https' : 'http';
            origin = `${proto}://${host}`;
          }
        }
        if (!origin) return [];
      }

      // Trust Capacitor and Ionic WebView origins (native iOS/Android app).
      // These use non-standard URL schemes that new URL() may not parse correctly,
      // so we check them as raw strings before attempting URL parsing.
      const nativeOrigins = [
        'capacitor://localhost',
        'ionic://localhost',
        'http://localhost',
        'https://localhost',
      ];
      if (nativeOrigins.includes(origin)) {
        return [origin];
      }

      try {
        const originUrl = new URL(origin);
        const hostname = originUrl.hostname;

        // Trust all airoapp.ai subdomains (preview / builder)
        if (hostname.endsWith('.airoapp.ai') || hostname.endsWith('.test-airoapp.ai')) {
          return [origin];
        }

        // Trust localhost for development
        if (hostname === 'localhost' || hostname === '127.0.0.1') {
          return [origin];
        }

        // Hardcoded production origins — always trusted regardless of env vars
        const hardcoded = [
          'iwillbuild.com',
          'www.iwillbuild.com',
          'f38wenbvln.c36.airoapp.ai',
        ];
        if (hardcoded.includes(hostname)) {
          return [origin];
        }

        // Trust the custom domain set via BETTER_AUTH_URL secret
        const customUrl = process.env.BETTER_AUTH_URL;
        if (customUrl) {
          try {
            const customHostname = new URL(customUrl).hostname;
            if (
              hostname === customHostname ||
              hostname === `www.${customHostname}` ||
              customHostname === `www.${hostname}`
            ) {
              return [origin];
            }
          } catch {
            // malformed BETTER_AUTH_URL — ignore
          }
        }

        // Trust any extra origins listed in BETTER_AUTH_TRUSTED_ORIGINS
        // (comma-separated, e.g. "https://app.iwillbuild.com,https://admin.iwillbuild.com")
        const extra = process.env.BETTER_AUTH_TRUSTED_ORIGINS;
        if (extra) {
          const trusted = extra.split(',').map((s) => s.trim()).filter(Boolean);
          if (trusted.some((t) => {
            try { return new URL(t).hostname === hostname; } catch { return false; }
          })) {
            return [origin];
          }
        }

        return [];
      } catch {
        return [];
      }
    },

    // CSRF + cookie strategy:
    //
    // disableCSRFCheck is scoped to AIRO_PREVIEW=true only (preview iframe sends
    // Origin: null which BetterAuth's CSRF guard rejects with MISSING_OR_NULL_ORIGIN
    // before trustedOrigins runs).
    //
    // In production (AIRO_PREVIEW unset), CSRF check is ENABLED. The Capacitor
    // native app no longer needs disableCSRFCheck because CapacitorHttp routes
    // requests through NSURLSession which does not send an Origin header at all —
    // BetterAuth's CSRF guard only fires when Origin is present and untrusted.
    //
    // Cookie attributes — SameSite=None + Secure everywhere:
    //   - Preview: Required for cross-site iframe access (CHIPS/Partitioned).
    //   - Production web: Required for Safari "Add to Home Screen" (PWA standalone mode).
    //     iOS Safari standalone runs in a separate process with its own cookie jar.
    //     Apple treats it as a different app context — SameSite=Lax cookies are NOT
    //     reliably persisted between sessions in standalone mode; they get wiped when
    //     the PWA is backgrounded. SameSite=None + Secure forces a proper persistent
    //     cookie that Safari standalone honours correctly.
    //   - Production native app (Capacitor): WebView makes requests to
    //     https://iwillbuild.com — SameSite=None + Secure works fine here too.
    advanced: {
      disableCSRFCheck: process.env.AIRO_PREVIEW === 'true',
      defaultCookieAttributes: {
        sameSite: 'none' as const,
        secure: true,
        // Partitioned (CHIPS) only in preview — production doesn't need it and
        // some older Safari versions don't handle it well outside iframe contexts.
        ...(process.env.AIRO_PREVIEW === 'true' && { partitioned: true }),
      },
    },

    emailAndPassword: { enabled: true },

    plugins: [
      twoFactor({
        issuer: 'IWIllBUIlD',
        // 10-minute window for the two_factor challenge cookie
        twoFactorCookieMaxAge: 600,
        // Account lockout: 10 failures → 15-minute lock (NIST SP 800-63B)
        accountLockout: {
          enabled: true,
          maxFailedAttempts: 10,
          durationSeconds: 900,
        },
      }),
    ],

    // socialProviders: {
    //   google: {
    //     clientId: getSecret('GOOGLE_CLIENT_ID') as string,
    //     clientSecret: getSecret('GOOGLE_CLIENT_SECRET') as string,
    //   },
    //   github: {
    //     clientId: getSecret('GITHUB_CLIENT_ID') as string,
    //     clientSecret: getSecret('GITHUB_CLIENT_SECRET') as string,
    //   },
    // },
  });

  _auth = auth as unknown as ReturnType<typeof betterAuth>;
  return auth;
}

export type Session = ReturnType<typeof getAuth>['$Infer']['Session'];
export type User = ReturnType<typeof getAuth>['$Infer']['Session']['user'];
