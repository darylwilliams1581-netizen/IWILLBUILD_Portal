/**
 * GET /api/estimates/:id/export-pdf
 * Generates and streams a PDF of the estimate using pdf-lib (Alpine-safe).
 * Fetches company profile, PDF branding settings, estimate + lines, and job details.
 */
import type { Request, Response } from 'express';
import { db } from '../../../../db/client.js';
import { estimates, estimateLines, profiles } from '../../../../db/schema.js';
import { eq, and, asc } from 'drizzle-orm';
import { sql } from 'drizzle-orm';
import { getAuth } from '../../../../../lib/auth/auth.js';
import { generateEstimatePdf } from '../../../../lib/pdf-generator.js';

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

    const estimateId = parseInt(String(req.params.id), 10);
    if (isNaN(estimateId)) return res.status(400).json({ error: 'Invalid estimate ID' });

    const estimate = await db.query.estimates.findFirst({
      where: and(eq(estimates.id, estimateId), eq(estimates.companyId, profile.companyId)),
    });
    if (!estimate) return res.status(404).json({ error: 'Estimate not found' });

    const lines = await db
      .select()
      .from(estimateLines)
      .where(eq(estimateLines.estimateId, estimateId))
      .orderBy(asc(estimateLines.lineOrder), asc(estimateLines.id));

    // Fetch company details
    const [companyRows] = await db.execute(
      sql`SELECT name, abn, phone, email, website, address FROM companies WHERE id = ${profile.companyId} LIMIT 1`
    ) as unknown as [Array<Record<string, string>>, unknown];
    const company = companyRows?.[0] ?? {};

    // Fetch PDF branding settings
    let pdfSettings: Record<string, string> = {};
    try {
      const [settingsRows] = await db.execute(
        sql`SELECT pdf_json FROM company_settings WHERE company_id = ${profile.companyId} LIMIT 1`
      ) as unknown as [Array<{ pdf_json?: string }>, unknown];
      const raw = settingsRows?.[0]?.pdf_json;
      if (raw) pdfSettings = JSON.parse(raw) as Record<string, string>;
    } catch { /* column missing or no settings row — proceed without branding */ }

    // Fetch job details if linked
    let jobName = '';
    let jobNumber = '';
    let jobAddress = '';
    let clientName = '';
    if (estimate.jobId) {
      const [jobRows] = await db.execute(
        sql`SELECT name, job_number, address, client FROM jobs WHERE id = ${estimate.jobId} AND company_id = ${profile.companyId} LIMIT 1`
      ) as unknown as [Array<Record<string, string>>, unknown];
      const job = jobRows?.[0];
      if (job) {
        jobName    = String(job.name ?? '');
        jobNumber  = String(job.job_number ?? '');
        jobAddress = String(job.address ?? '');
        clientName = String(job.client ?? '');
      }
    }

    const pdfBytes = await generateEstimatePdf({
      id:               estimate.id,
      title:            estimate.title,
      status:           estimate.status ?? 'draft',
      markup_percent:   estimate.markupPercent ?? 0,
      gst_mode:         estimate.gstMode ?? 'inclusive',
      notes:            (estimate as Record<string, unknown>).notes as string ?? '',
      valid_until:      (estimate as Record<string, unknown>).valid_until as string ?? '',
      company_name:     String(company.name ?? ''),
      company_abn:      String(company.abn ?? ''),
      company_phone:    String(company.phone ?? ''),
      company_email:    String(company.email ?? ''),
      company_address:  String(company.address ?? ''),
      job_name:         jobName,
      job_number:       jobNumber,
      job_address:      jobAddress,
      client_name:      clientName,
      header_text:      pdfSettings.headerText ?? '',
      footer_text:      pdfSettings.footerText ?? '',
      disclaimer:       pdfSettings.estimateDisclaimer ?? '',
      payment_terms:    pdfSettings.paymentTerms ?? '',
      acceptance_note:  pdfSettings.acceptanceNote ?? '',
      lines: lines.map((l) => ({
        category:    (l as Record<string, unknown>).category as string ?? '',
        description: l.description,
        quantity:    l.quantity,
        unit:        l.unit ?? '',
        rate:        l.rate,
        lineOrder:   l.lineOrder,
      })),
    });

    const filename = `estimate-${estimate.id}-${estimate.title.replace(/[^a-z0-9]/gi, '-').toLowerCase()}.pdf`;
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('Content-Length', pdfBytes.length);
    res.end(Buffer.from(pdfBytes));
  } catch (err) {
    console.error('GET /api/estimates/:id/export-pdf error:', err);
    res.status(500).json({ error: 'Failed to generate estimate PDF' });
  }
}
