/**
 * POST /api/auth/apple
 * Signs in an existing company user with a native Sign in with Apple identity token.
 * Apple's own Apple ID check replaces the password and the app text-code step.
 * It does not create a new company.
 */
import { createHash, createPublicKey, createVerify, randomUUID } from 'crypto';
import type { Request, Response } from 'express';
import { and, eq, sql } from 'drizzle-orm';
import { db } from '../../../db/client.js';
import { account, user } from '../../../db/schema.js';
import { getAuth } from '../../../../lib/auth/auth.js';

const APPLE_KEYS_URL = 'https://appleid.apple.com/auth/keys';
const APPLE_ISSUER = 'https://appleid.apple.com';
const APPLE_AUDIENCE = 'com.iwillbuild.portal';

type AppleKey = { kid: string; kty: string; n: string; e: string; alg?: string };
let cachedKeys: { keys: AppleKey[]; fetchedAt: number } | null = null;

function decode(value: string): Buffer {
  return Buffer.from(value.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}

async function appleKeys(): Promise<AppleKey[]> {
  if (cachedKeys && Date.now() - cachedKeys.fetchedAt < 60 * 60 * 1000) return cachedKeys.keys;
  const response = await fetch(APPLE_KEYS_URL);
  if (!response.ok) throw new Error('Apple signing keys are unavailable.');
  const body = await response.json() as { keys?: AppleKey[] };
  const keys = body.keys ?? [];
  if (!keys.length) throw new Error('Apple signing keys are unavailable.');
  cachedKeys = { keys, fetchedAt: Date.now() };
  return keys;
}

async function verifyIdentityToken(token: string, rawNonce: string): Promise<{ sub: string; email: string }> {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('Invalid Apple identity token.');
  const [encodedHeader, encodedPayload, encodedSignature] = parts;
  const header = JSON.parse(decode(encodedHeader).toString('utf8')) as { kid?: string; alg?: string };
  const payload = JSON.parse(decode(encodedPayload).toString('utf8')) as Record<string, unknown>;
  if (header.alg !== 'RS256' || !header.kid) throw new Error('Invalid Apple identity token.');
  const key = (await appleKeys()).find((item) => item.kid === header.kid);
  if (!key) throw new Error('Apple signing key was not found.');
  const verifier = createVerify('RSA-SHA256');
  verifier.update(`${encodedHeader}.${encodedPayload}`);
  verifier.end();
  const publicKey = createPublicKey({ key, format: 'jwk' });
  if (!verifier.verify(publicKey, decode(encodedSignature))) throw new Error('Apple identity token failed verification.');

  const audience = payload.aud;
  const audiences = Array.isArray(audience) ? audience.map(String) : [String(audience ?? '')];
  if (payload.iss !== APPLE_ISSUER || !audiences.includes(APPLE_AUDIENCE)) {
    throw new Error('This Apple token is for a different app.');
  }
  if (Number(payload.exp ?? 0) * 1000 <= Date.now()) throw new Error('Apple sign-in expired. Try again.');
  const expectedNonce = createHash('sha256').update(rawNonce).digest('hex');
  if (!rawNonce || payload.nonce !== expectedNonce) throw new Error('Apple sign-in could not be matched to this device.');
  return {
    sub: String(payload.sub ?? ''),
    email: String(payload.email ?? '').trim().toLowerCase(),
  };
}

async function setSessionCookie(res: Response, userId: string): Promise<void> {
  const auth = getAuth();
  const ctx = await (auth as unknown as { $context: Promise<{
    internalAdapter: { createSession: (userId: string, dontRememberMe?: boolean) => Promise<Record<string, unknown>> };
    authCookies: { sessionToken: { name: string } };
    secret: string;
  }> }).$context;
  const sessionRow = await ctx.internalAdapter.createSession(userId, false);
  const token = sessionRow?.token;
  if (typeof token !== 'string' || !token) throw new Error('Session was not created.');
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(ctx.secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(token));
  const signed = btoa(String.fromCharCode(...new Uint8Array(signature)));
  const cookieName = ctx.authCookies.sessionToken.name;
  const parts = [
    `${cookieName}=${encodeURIComponent(`${token}.${signed}`)}`,
    'Path=/',
    'HttpOnly',
    'SameSite=None',
    'Secure',
    `Max-Age=${7 * 24 * 60 * 60}`,
  ];
  res.setHeader('Set-Cookie', parts.join('; '));
}

export default async function handler(req: Request, res: Response) {
  try {
    const identityToken = typeof req.body?.identityToken === 'string' ? req.body.identityToken : '';
    const nonce = typeof req.body?.nonce === 'string' ? req.body.nonce : '';
    if (!identityToken || !nonce) return res.status(400).json({ error: 'Missing Apple sign-in.' });

    let identity: { sub: string; email: string };
    try {
      identity = await verifyIdentityToken(identityToken, nonce);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Apple sign-in failed.';
      return res.status(401).json({ error: message });
    }
    if (!identity.sub) return res.status(401).json({ error: 'Apple did not identify this user.' });

    const [linked] = await db.select().from(account).where(and(
      eq(account.providerId, 'apple'),
      eq(account.accountId, identity.sub),
    )).limit(1);

    let userId = linked?.userId ?? '';
    if (!userId && identity.email) {
      const [existing] = await db.select().from(user).where(sql`lower(${user.email}) = ${identity.email}`).limit(1);
      if (!existing) {
        return res.status(404).json({
          error: 'No IWILLBUILD account uses this Apple ID. Create the company account first, with the same email.',
        });
      }
      userId = existing.id;
      await db.insert(account).values({
        id: randomUUID(),
        accountId: identity.sub,
        providerId: 'apple',
        issuer: APPLE_ISSUER,
        userId,
        idToken: identityToken,
      });
      await db.update(user).set({ emailVerified: true }).where(eq(user.id, userId));
    }
    if (!userId) {
      return res.status(404).json({
        error: 'Apple did not share an email. Create the company account first, then try Sign in with Apple again.',
      });
    }

    await setSessionCookie(res, userId);
    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error('[auth/apple]', error instanceof Error ? error.message : error);
    return res.status(500).json({ error: 'Apple sign-in could not start a session.' });
  }
}
