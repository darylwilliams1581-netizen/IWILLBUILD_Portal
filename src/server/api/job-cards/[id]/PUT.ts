/**
 * PUT /api/job-cards/:id
 * Update a Job Card.
 * Accepts the same fields as POST plus:
 *   status — draft | complete | invoiced | converted
 *
 * Materials are replaced wholesale when the `materials` array is provided.
 * Omit `materials` to leave existing lines untouched.
 */
import type { Request, Response } from 'express';
import { db } from '../../../db/client.js';
import { profiles } from '../../../db/schema.js';
import { eq, sql } from 'drizzle-orm';
import { getAuth } from '../../../../lib/auth/auth.js';

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

    const id = Number(req.params.id);
    if (!id) return res.status(400).json({ error: 'Invalid id' });

    // Verify ownership
    const [existing] = await db.execute(
      sql`SELECT id, status FROM job_cards WHERE id = ${id} AND company_id = ${profile.companyId}`
    ) as unknown as [Array<{ id: number; status: string }>, unknown];
    if (!existing?.length) return res.status(404).json({ error: 'Job card not found' });

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
      workDescription?: string;
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

    const hrs = labourHours != null ? Number(labourHours) : undefined;
    const rate = labourRate != null ? Number(labourRate) : undefined;
    const computedLabour = labourAmount != null
      ? Number(labourAmount)
      : (hrs != null && rate != null && hrs > 0 && rate > 0)
        ? Math.round(hrs * rate * 100) / 100
        : undefined;

    await db.execute(sql`
      UPDATE job_cards SET
        customer_id            = COALESCE(${customerId ?? null}, customer_id),
        customer_name_override = ${customerNameOverride !== undefined ? (customerNameOverride?.trim() ?? null) : sql`customer_name_override`},
        site_address           = ${siteAddress !== undefined ? (siteAddress?.trim() ?? null) : sql`site_address`},
        contact_person         = ${contactPerson !== undefined ? (contactPerson?.trim() ?? null) : sql`contact_person`},
        contact_phone          = ${contactPhone !== undefined ? (contactPhone?.trim() ?? null) : sql`contact_phone`},
        po_number              = ${poNumber !== undefined ? (poNumber?.trim() ?? null) : sql`po_number`},
        service_date           = ${serviceDate !== undefined ? (serviceDate ?? null) : sql`service_date`},
        assigned_user_id       = ${assignedUserId !== undefined ? (assignedUserId ?? null) : sql`assigned_user_id`},
        assigned_name          = ${assignedName !== undefined ? (assignedName?.trim() ?? null) : sql`assigned_name`},
        work_description       = ${workDescription !== undefined ? workDescription.trim() : sql`work_description`},
        labour_hours           = ${hrs !== undefined ? (hrs || null) : sql`labour_hours`},
        labour_rate            = ${rate !== undefined ? (rate || null) : sql`labour_rate`},
        labour_amount          = ${computedLabour !== undefined ? (computedLabour || null) : sql`labour_amount`},
        notes                  = ${notes !== undefined ? (notes?.trim() ?? null) : sql`notes`},
        internal_notes         = ${internalNotes !== undefined ? (internalNotes?.trim() ?? null) : sql`internal_notes`},
        completion_summary     = ${completionSummary !== undefined ? (completionSummary?.trim() ?? null) : sql`completion_summary`},
        authorised_by          = ${authorisedBy !== undefined ? (authorisedBy?.trim() ?? null) : sql`authorised_by`},
        signature_data         = ${signatureData !== undefined ? (signatureData ?? null) : sql`signature_data`},
        approval_date          = ${approvalDate !== undefined ? (approvalDate ?? null) : sql`approval_date`},
        status                 = ${status !== undefined ? status : sql`status`},
        updated_at             = NOW()
      WHERE id = ${id} AND company_id = ${profile.companyId}
    `);

    // Replace materials if provided
    if (Array.isArray(materials)) {
      await db.execute(sql`DELETE FROM job_card_materials WHERE job_card_id = ${id}`);
      for (const m of materials) {
        if (!m.description?.trim()) continue;
        await db.execute(sql`
          INSERT INTO job_card_materials (job_card_id, company_id, description, cost)
          VALUES (${id}, ${profile.companyId}, ${m.description.trim()}, ${Number(m.cost ?? 0)})
        `);
      }
    }

    // Return updated record
    const [rows] = await db.execute(sql`
      SELECT jc.*, c.name AS customer_name
      FROM job_cards jc
      LEFT JOIN customers c ON c.id = jc.customer_id
      WHERE jc.id = ${id}
    `) as unknown as [Array<Record<string, unknown>>, unknown];
    const [matRows] = await db.execute(
      sql`SELECT * FROM job_card_materials WHERE job_card_id = ${id} ORDER BY id ASC`
    ) as unknown as [Array<Record<string, unknown>>, unknown];

    res.json({
      jobCard: { ...(rows?.[0] ?? {}), materials: matRows ?? [] },
    });
  } catch (err) {
    console.error('PUT /api/job-cards/:id error:', err);
    res.status(500).json({ error: 'Failed to update job card' });
  }
}
