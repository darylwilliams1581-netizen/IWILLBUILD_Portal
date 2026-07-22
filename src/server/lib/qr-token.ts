/**
 * QR Token signing utility
 *
 * Uses HMAC-SHA256 over a JSON payload. No external JWT library needed.
 * Secret is derived from BETTER_AUTH_SECRET (already required by BetterAuth)
 * with a "qr:" prefix to namespace it.
 *
 * Token format (base64url): header.payload.signature
 *   header  : { alg: "HS256", typ: "QR" }
 *   payload : { jti, jobId, action, actorType, iat, exp }
 *   signature: HMAC-SHA256(header.payload, secret)
 *
 * TTL: 15 minutes by default.
 */
import { createHmac, randomBytes } from 'crypto';

const TOKEN_TTL_SECONDS = 15 * 60; // 15 minutes

function b64url(input: string): string {
  return Buffer.from(input).toString('base64url');
}

function getSecret(): string {
  const raw = process.env.BETTER_AUTH_SECRET ?? process.env.AUTH_SECRET;
  if (!raw) {
    throw new Error(
      'QR token signing requires BETTER_AUTH_SECRET or AUTH_SECRET to be set. ' +
      'Add the secret via the Airo Secrets panel.',
    );
  }
  return `qr:${raw}`;
}

export interface QrPayload {
  jti: string;
  jobId: number;
  action: 'signin' | 'signout';
  actorType: string;
  iat: number;
  exp: number;
}

export function signQrToken(
  jobId: number,
  action: 'signin' | 'signout',
  actorType: string,
  ttlSeconds = TOKEN_TTL_SECONDS,
): { token: string; payload: QrPayload } {
  const now = Math.floor(Date.now() / 1000);
  const payload: QrPayload = {
    jti: randomBytes(16).toString('hex'),
    jobId,
    action,
    actorType,
    iat: now,
    exp: now + ttlSeconds,
  };

  const header = b64url(JSON.stringify({ alg: 'HS256', typ: 'QR' }));
  const body   = b64url(JSON.stringify(payload));
  const sig    = createHmac('sha256', getSecret())
    .update(`${header}.${body}`)
    .digest('base64url');

  return { token: `${header}.${body}.${sig}`, payload };
}

export function verifyQrToken(token: string): QrPayload {
  const parts = token.split('.');
  if (parts.length !== 3) throw new Error('Malformed QR token');

  const [header, body, sig] = parts;
  const expected = createHmac('sha256', getSecret())
    .update(`${header}.${body}`)
    .digest('base64url');

  if (sig !== expected) throw new Error('Invalid QR token signature');

  let payload: QrPayload;
  try {
    payload = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as QrPayload;
  } catch {
    throw new Error('Malformed QR token payload');
  }

  const now = Math.floor(Date.now() / 1000);
  if (payload.exp < now) throw new Error('QR token expired');

  return payload;
}
