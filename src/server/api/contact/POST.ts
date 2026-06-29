import type { Request, Response } from 'express';
import { sendEmail } from '../../email.js';

// Simple honeypot + timing check to block bots
const MIN_FORM_TIME_MS = 3_000;

export default async function handler(req: Request, res: Response) {
  try {
    const { name, email, phone, message, _hp, _t } = req.body as {
      name?: string;
      email?: string;
      phone?: string;
      message?: string;
      _hp?: string;      // honeypot — must be empty
      _t?: number;       // form load timestamp
    };

    // Honeypot — bots fill hidden fields
    if (_hp && _hp.trim() !== '') {
      return res.status(200).json({ ok: true }); // silent discard
    }

    // Timing check — humans take > 3 s to fill a form
    if (_t && Date.now() - Number(_t) < MIN_FORM_TIME_MS) {
      return res.status(200).json({ ok: true }); // silent discard
    }

    // Validate required fields
    if (!name?.trim() || !email?.trim() || !message?.trim()) {
      return res.status(400).json({ error: 'Name, email and message are required.' });
    }

    // Basic email format check
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      return res.status(400).json({ error: 'Please enter a valid email address.' });
    }

    const senderName = name.trim();
    const senderEmail = email.trim();
    const senderPhone = phone?.trim() || 'Not provided';
    const senderMessage = message.trim();

    // Send notification to the business owner — destination is private
    await sendEmail({
      to: 'darylwilliams1581@gmail.com',
      replyTo: senderEmail,           // replies go straight back to the enquirer
      fromName: 'IWILLBUILD Website',
      subject: `New enquiry from ${senderName}`,
      html: `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;background:#f8fafc;border-radius:8px;">
          <div style="background:#0f172a;padding:20px 24px;border-radius:6px 6px 0 0;margin-bottom:0;">
            <span style="color:#f97316;font-size:20px;font-weight:700;letter-spacing:-0.5px;">IWILLBUILD</span>
            <span style="color:#94a3b8;font-size:14px;margin-left:12px;">New Website Enquiry</span>
          </div>
          <div style="background:#ffffff;padding:24px;border-radius:0 0 6px 6px;border:1px solid #e2e8f0;border-top:none;">
            <table style="width:100%;border-collapse:collapse;">
              <tr>
                <td style="padding:8px 0;color:#64748b;font-size:13px;width:100px;vertical-align:top;">Name</td>
                <td style="padding:8px 0;color:#0f172a;font-size:14px;font-weight:600;">${senderName}</td>
              </tr>
              <tr>
                <td style="padding:8px 0;color:#64748b;font-size:13px;vertical-align:top;">Email</td>
                <td style="padding:8px 0;color:#0f172a;font-size:14px;"><a href="mailto:${senderEmail}" style="color:#f97316;">${senderEmail}</a></td>
              </tr>
              <tr>
                <td style="padding:8px 0;color:#64748b;font-size:13px;vertical-align:top;">Phone</td>
                <td style="padding:8px 0;color:#0f172a;font-size:14px;">${senderPhone}</td>
              </tr>
              <tr>
                <td style="padding:8px 0;color:#64748b;font-size:13px;vertical-align:top;border-top:1px solid #f1f5f9;padding-top:16px;">Message</td>
                <td style="padding:8px 0;color:#0f172a;font-size:14px;white-space:pre-wrap;border-top:1px solid #f1f5f9;padding-top:16px;">${senderMessage}</td>
              </tr>
            </table>
            <div style="margin-top:20px;padding:12px 16px;background:#f1f5f9;border-radius:4px;font-size:12px;color:#64748b;">
              Hit <strong>Reply</strong> to respond directly to ${senderName} at ${senderEmail}
            </div>
          </div>
        </div>
      `,
      text: `New enquiry from ${senderName}\n\nEmail: ${senderEmail}\nPhone: ${senderPhone}\n\nMessage:\n${senderMessage}\n\n---\nReply to this email to respond directly to the enquirer.`,
    });

    // Send auto-reply to the enquirer so they know it landed
    await sendEmail({
      to: senderEmail,
      replyTo: 'hello@iwillbuild.com',
      fromName: 'IWILLBUILD',
      subject: "We've received your enquiry",
      html: `
        <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:24px;background:#f8fafc;border-radius:8px;">
          <div style="background:#0f172a;padding:20px 24px;border-radius:6px 6px 0 0;">
            <span style="color:#f97316;font-size:20px;font-weight:700;letter-spacing:-0.5px;">IWILLBUILD</span>
          </div>
          <div style="background:#ffffff;padding:28px 24px;border-radius:0 0 6px 6px;border:1px solid #e2e8f0;border-top:none;">
            <p style="color:#0f172a;font-size:16px;font-weight:600;margin:0 0 12px;">Hi ${senderName},</p>
            <p style="color:#475569;font-size:14px;line-height:1.6;margin:0 0 16px;">
              Thanks for reaching out. We've received your message and will get back to you shortly.
            </p>
            <p style="color:#475569;font-size:14px;line-height:1.6;margin:0 0 24px;">
              In the meantime, feel free to explore the portal or start your free 30-day trial.
            </p>
            <a href="https://iwillbuild.com/signup" style="display:inline-block;background:#f97316;color:#ffffff;font-size:14px;font-weight:600;padding:12px 24px;border-radius:6px;text-decoration:none;">
              Start Free Trial
            </a>
            <hr style="border:none;border-top:1px solid #f1f5f9;margin:28px 0 16px;" />
            <p style="color:#94a3b8;font-size:12px;margin:0;">
              IWILLBUILD &nbsp;·&nbsp; hello@iwillbuild.com &nbsp;·&nbsp; +61 498 350 566<br/>
              ABN 89 791 350 823
            </p>
          </div>
        </div>
      `,
      text: `Hi ${senderName},\n\nThanks for reaching out. We've received your message and will get back to you shortly.\n\nIWILLBUILD\nhello@iwillbuild.com\n+61 498 350 566`,
    });

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error('[contact] email send failed:', err);
    return res.status(500).json({ error: 'Failed to send message. Please try again.' });
  }
}
