/**
 * GET /api/me/2fa/qr?uri=<otpauth_uri>
 *
 * Generates a QR code data URL from an otpauth:// URI.
 * Used by the SecurityTab during TOTP enrolment to display the QR code
 * for the user to scan with their authenticator app.
 *
 * Security:
 *   - Requires an authenticated session
 *   - The URI is validated to start with otpauth:// before rendering
 *   - The QR code is generated server-side so no external service sees the secret
 */
import type { Request, Response } from 'express';
import QRCode from 'qrcode';
import { getSessionAndProfile } from '../../../../lib/auth-middleware.js';

export default async function handler(req: Request, res: Response) {
  try {
    const auth = await getSessionAndProfile(req, res);
    if (!auth) return;

    const uri = (req.query.uri as string | undefined) ?? '';
    if (!uri || !uri.startsWith('otpauth://')) {
      return res.status(400).json({ error: 'Invalid or missing otpauth URI.' });
    }

    const qrDataUrl = await QRCode.toDataURL(uri, {
      errorCorrectionLevel: 'M',
      margin: 2,
      width: 256,
    });

    return res.json({ qrDataUrl });
  } catch (err) {
    console.error('[2fa/qr] error:', err instanceof Error ? err.message : String(err));
    return res.status(500).json({ error: 'Failed to generate QR code.' });
  }
}
