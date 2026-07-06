/**
 * better-auth-client-stub.ts
 *
 * SSR stub for better-auth/react (client-side auth hooks).
 *
 * During SSR build, routes.tsx → auth-client.tsx imports better-auth/react
 * (createAuthClient, useSession, etc.). These hooks use browser APIs and
 * session state that don't exist during server-side rendering. Stubbing them
 * during SSR build:
 *   1. Removes better-auth/react from the entry-server dynamic chunk
 *   2. Eliminates the duplicate better-auth chunk that Rollup creates when
 *      the same package appears in both the static API handler graph AND
 *      the dynamic entry-server graph
 *   3. Saves ~250 KB of better-auth/react AST from the SSR render phase
 *
 * The ProtectedRoute component in auth-client.tsx uses useSession() to check
 * auth state. During SSR, we render all routes as if unauthenticated — the
 * client hydration handles the actual auth redirect. This is safe because:
 *   - SSR output is only used for initial HTML (crawlers, social previews)
 *   - Protected pages behind ProtectedRoute are noindex anyway
 *   - Client-side auth check runs immediately on hydration
 */

import React from 'react';

// createAuthClient — returns a stub client with no-op hooks
export const createAuthClient = (_opts?: unknown) => ({
  useSession: () => ({ data: null, isPending: false, error: null }),
  signIn: { email: async () => ({ error: null }) },
  signOut: async () => ({ error: null }),
  $fetch: async () => ({ data: null, error: null }),
});

// Individual hook exports (some codebases import these directly)
export const useSession = () => ({ data: null, isPending: false, error: null });
export const signIn = { email: async () => ({ error: null }) };
export const signOut = async () => ({ error: null });

export default { createAuthClient, useSession, signIn, signOut };
