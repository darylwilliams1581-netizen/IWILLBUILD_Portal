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

import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { twoFactor } from 'better-auth/plugins';

import { db } from '@/server/db/client';
import { user, session, account, verification, twoFactor as twoFactorTable } from '@/server/db/schema';
import { getSecret } from '#airo/secrets';

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
