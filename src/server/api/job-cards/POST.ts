/**
 * POST /api/job-cards
 * Create a new Job Card.
 *
 * Body:
 *   customerId?          — existing customer ID
 *   customerNameOverride? — free-text customer name when no customer record exists
 *   siteAddress?
 *   contactPerson?
 *   contactPhone?
 *   poNumber?
 *   serviceDate?         — ISO date string
 *   assignedUserId?
 *   assignedName?
 *   workDescription      — required
 *   labourHours?
 *   labourRate?
 *   labourAmount?        — if provided, overrides hours × rate
 *   notes?
 *   internalNotes?
 *   completionSummary?
 *   authorisedBy?
 *   signatureData?       — base64 data URL
 *   approvalDate?
 *   status?              — draft (default)
 *   materials?           — Array<{ description, cost }>
 */
import type { Request, Response } from 'express';
import { db } from '../../db/client.js';
import { profiles } from '../../db/schema.js';
import { eq, sql } from 'drizzle-orm';
import { getAuth } from '../../../lib/auth/auth.js';
import type { ResultSetHeader } from 'mysql2';

async function getNextCardNumber(companyId: number): Promise<string> {
  const [rows] = await db.execute(
    sql`SELECT card_number FROM job_cards WHERE company_id = ${companyId} ORDER BY id DESC LIMIT 1`
  ) as unknown as [Array<{ card_number: string }>, unknown];
  if (!rows?.length) return 'JC-0001';
  const last = rows[0].card_number;
  const match = last.match(/(\d+)$/);
  if (!match) return 'JC-0001';
  const next = parseInt(match[1], 10) + 1;
  return `JC-${String(next).padStart(4, '0')}`;
}

export default async function handler(req: Request, res: Response) {
  try {
    const auth = getAuth();
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) {
      if (v) headers.set(k, Array.isArray(v) ? v[0] : v);
    }
    const session = await auth.api.getSession({ headers });
    if (!session?.user) return res.status(401).json({ error: 'Unauthorised' });

    const profile = await db.query.profiles.findFirst({
      where: eq(profiles.userId, session.user.id),
    });
    if (!profile?.companyId) return res.status(403).json({ error: 'No company' });

    const {
      customerId,
      customerNameOverride,
      siteAddress,
      contactPerson,
      contactPhone,
      poNumber,
      serviceDate,
      assignedUserId,
      assignedName,
      workDescription,
      labourHours,
      labourRate,
      labourAmount,
      notes,
      internalNotes,
      completionSummary,
      authorisedBy,
      signatureData,
      approvalDate,
      status,
      materials,
    } = req.body as {
      customerId?: number | null;
      customerNameOverride?: string;
      siteAddress?: string;
      contactPerson?: string;
      contactPhone?: string;
      poNumber?: string;
      serviceDate?: string;
      assignedUserId?: string;
      assignedName?: string;
      workDescription: string;
      labourHours?: number;
      labourRate?: number;
      labourAmount?: number;
      notes?: string;
      internalNotes?: string;
      completionSummary?: string;
      authorisedBy?: string;
      signatureData?: string;
      approvalDate?: string;
      status?: string;
      materials?: Array<{ description: string; cost: number }>;
    };

    if (!workDescription?.trim()) {
      return res.status(400).json({ error: 'Work description is required' });
    }

    const cardNumber = await getNextCardNumber(profile.companyId);

    // Compute labour amount: explicit override > hours × rate > 0
    const hrs = Number(labourHours ?? 0);
    const rate = Number(labourRate ?? 0);
    const computedLabour = labourAmount != null
      ? Number(labourAmount)
      : hrs > 0 && rate > 0 ? Math.round(hrs * rate * 100) / 100 : 0;

    const [result] = await db.execute(sql`
      INSERT INTO job_cards (
        company_id, card_number, status,
        customer_id, customer_name_override,
        site_address, contact_person, contact_phone,
        po_number, service_date,
        assigned_user_id, assigned_name,
        work_description,
        labour_hours, labour_rate, labour_amount,
        notes, internal_notes, completion_summary,
        authorised_by, signature_data, approval_date,
        created_by_user_id
      ) VALUES (
        ${profile.companyId}, ${cardNumber}, ${status ?? 'draft'},
        ${customerId ?? null}, ${customerNameOverride?.trim() ?? null},
        ${siteAddress?.trim() ?? null}, ${contactPerson?.trim() ?? null}, ${contactPhone?.trim() ?? null},
        ${poNumber?.trim() ?? null}, ${serviceDate ?? null},
        ${assignedUserId ?? null}, ${assignedName?.trim() ?? null},
        ${workDescription.trim()},
        ${hrs || null}, ${rate || null}, ${computedLabour || null},
        ${notes?.trim() ?? null}, ${internalNotes?.trim() ?? null}, ${completionSummary?.trim() ?? null},
        ${authorisedBy?.trim() ?? null}, ${signatureData ?? null}, ${approvalDate ?? null},
        ${session.user.id}
      )
    `) as unknown as [ResultSetHeader, unknown];

    const jobCardId = result.insertId;

    // Insert material lines
    const mats = materials ?? [];
    for (const m of mats) {
      if (!m.description?.trim()) continue;
      await db.execute(sql`
        INSERT INTO job_card_materials (job_card_id, company_id, description, cost)
        VALUES (${jobCardId}, ${profile.companyId}, ${m.description.trim()}, ${Number(m.cost ?? 0)})
      `);
    }

    // Return full record
    const [rows] = await db.execute(
      sql`SELECT * FROM job_cards WHERE id = ${jobCardId}`
    ) as unknown as [Array<Record<string, unknown>>, unknown];
    const [matRows] = await db.execute(
      sql`SELECT * FROM job_card_materials WHERE job_card_id = ${jobCardId} ORDER BY id ASC`
    ) as unknown as [Array<Record<string, unknown>>, unknown];

    res.status(201).json({
      jobCard: { ...(rows?.[0] ?? {}), materials: matRows ?? [] },
    });
  } catch (err) {
    console.error('POST /api/job-cards error:', err);
    res.status(500).json({ error: 'Failed to create job card' });
  }
}
