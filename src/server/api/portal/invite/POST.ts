/**
 * POST /api/portal/invite
 * Issues a magic-link token for a customer and emails it.
 * Body: { customerId: number }
 * Requires staff auth.
 */
import type { Request, Response } from 'express';
import { db } from '../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getAuth } from '../../../../lib/auth/auth.js';
import { profiles } from '../../../db/schema.js';
import { eq } from 'drizzle-orm';
import { sendEmail } from '../../../email.js';

export default async function handler(req: Request, res: Response) {
  try {
    const auth = getAuth();
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) {
      if (v) headers.set(k, Array.isArray(v) ? v[0] : v);
    }
    const session = await auth.api.getSession({ headers });
    if (!session?.user) return res.status(401).json({ error: 'Unauthorised' });

    const profile = await db.query.profiles.findFirst({ where: eq(profiles.userId, session.user.id) });
    if (!profile?.companyId) return res.status(403).json({ error: 'No company' });

    const { customerId } = req.body;
    if (!customerId) return res.status(400).json({ error: 'customerId required' });

    // Fetch customer
    const [custRows] = await db.execute(
      sql`SELECT * FROM customers WHERE id = ${parseInt(String(customerId), 10)} AND company_id = ${profile.companyId} LIMIT 1`
    ) as unknown as [Array<Record<string, unknown>>];

    const customer = custRows?.[0];
    if (!customer) return res.status(404).json({ error: 'Customer not found' });
    if (!customer.email) return res.status(400).json({ error: 'Customer has no email address' });

    // Generate token (64-char hex)
    const token = Array.from(crypto.getRandomValues(new Uint8Array(32)))
      .map(b => b.toString(16).padStart(2, '0')).join('');

    // Expires in 7 days
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      .toISOString().slice(0, 19).replace('T', ' ');

    // Upsert token (replace any existing for this customer)
    await db.execute(sql`
      INSERT INTO customer_portal_tokens (company_id, customer_id, token, email, expires_at)
      VALUES (${profile.companyId}, ${parseInt(String(customerId), 10)}, ${token}, ${String(customer.email)}, ${expiresAt})
      ON DUPLICATE KEY UPDATE token = VALUES(token), expires_at = VALUES(expires_at), used_at = NULL
    `);

    // Fetch company name
    const [compRows] = await db.execute(
      sql`SELECT name FROM companies WHERE id = ${profile.companyId} LIMIT 1`
    ) as unknown as [Array<Record<string, unknown>>];
    const companyName = String(compRows?.[0]?.name ?? 'IWIllBUILD');

    const portalUrl = `${process.env.APP_URL ?? 'https://iwillbuild.com'}/portal/login?token=${token}`;

    // Send email
    try {
      await sendEmail({
        to: String(customer.email),
        subject: `Your client portal access — ${companyName}`,
        html: `
          <div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:32px 24px;background:#fff">
            <h2 style="font-size:20px;font-weight:700;color:#1e293b;margin:0 0 8px">Your client portal is ready</h2>
            <p style="color:#475569;font-size:15px;margin:0 0 24px">
              Hi ${String(customer.contact_person ?? customer.name)},<br><br>
              ${companyName} has given you access to your client portal where you can view your jobs, review estimates, and pay invoices.
            </p>
            <a href="${portalUrl}" style="display:inline-block;background:#7c3aed;color:#fff;font-weight:700;font-size:15px;padding:14px 28px;border-radius:10px;text-decoration:none">
              Access your portal
            </a>
            <p style="color:#94a3b8;font-size:13px;margin:24px 0 0">
              This link expires in 7 days. If you didn't expect this email, you can safely ignore it.
            </p>
          </div>
        `,
        text: `Hi ${String(customer.contact_person ?? customer.name)},\n\n${companyName} has given you access to your client portal.\n\nAccess it here: ${portalUrl}\n\nThis link expires in 7 days.`,
      });
    } catch (emailErr) {
      console.warn('Portal invite email failed (non-fatal):', emailErr);
    }

    res.json({ ok: true, token, portalUrl });
  } catch (err) {
    console.error('POST /api/portal/invite error:', err);
    res.status(500).json({ error: 'Failed to send invite' });
  }
}
