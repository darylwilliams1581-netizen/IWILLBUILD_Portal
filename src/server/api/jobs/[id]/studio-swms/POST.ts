/**
 * POST /api/jobs/:id/studio-swms
 * ─────────────────────────────────────────────────────────────────────────────
 * Attaches a Studio document (document_templates) to a job.
 *
 * Behaviour:
 *   1. Loads the master document_templates row and its builder_json.
 *   2. Captures an immutable content snapshot (builder_json at this moment).
 *   3. Captures job fields (title, number, site_address, client, supervisor)
 *      from the jobs table for PDF merge.
 *   4. Inserts a job_studio_documents row.
 *   5. If the document templateType is 'swms' or 'safety_plan':
 *      - Creates a synthetic swms_templates row (title = doc title, status = 'active')
 *        so the existing sign-on workflow can reference it.
 *      - Creates a job_swms row linking the job to the synthetic template,
 *        with studio_doc_id pointing back to the job_studio_documents row.
 *   6. Returns the new job_studio_documents row.
 *
 * Body:
 *   studioDocId  number   — document_templates.id
 *   docNumber    string?  — optional document number override
 *   revision     string?  — optional revision override (default '1')
 *
 * Idempotency:
 *   A second attachment of the same studioDocId to the same job creates a
 *   new revision row (the snapshot captures the current master state).
 *   This is intentional — each attachment is a point-in-time snapshot.
 */
import type { Request, Response } from 'express';
import { db } from '../../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getAuth } from '../../../../../lib/auth/auth.js';
import { profiles } from '../../../../db/schema.js';
import { eq } from 'drizzle-orm';
import type { ResultSetHeader } from 'mysql2';

export default async function handler(req: Request, res: Response) {
  try {
    const auth = getAuth();
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) {
      if (v) headers.set(k, Array.isArray(v) ? v[0] : v);
    }
    const session = await auth.api.getSession({ headers });
    if (!session?.user) return res.status(401).json({ error: 'Unauthorised' });

    const [profile] = await db.select().from(profiles).where(eq(profiles.userId, session.user.id)).limit(1);
    if (!profile?.companyId) return res.status(403).json({ error: 'No company' });

    const jobId = parseInt(req.params.id, 10);
    if (!jobId) return res.status(400).json({ error: 'Invalid job ID' });

    const { studioDocId, docNumber, revision } = req.body as {
      studioDocId: number;
      docNumber?: string;
      revision?: string;
    };
    if (!studioDocId) return res.status(400).json({ error: 'studioDocId required' });

    const companyId = profile.companyId;

    // ── 1. Load master document ───────────────────────────────────────────────
    const [docRows] = await db.execute(sql.raw(
      `SELECT id, name, template_type, builder_json
       FROM document_templates
       WHERE id = ${studioDocId} AND company_id = ${companyId}
       LIMIT 1`
    )) as unknown as [Array<Record<string, unknown>>, unknown];

    const doc = Array.isArray(docRows) ? docRows[0] : null;
    if (!doc) return res.status(404).json({ error: 'Studio document not found' });

    // ── 2. Load job fields ────────────────────────────────────────────────────
    const [jobRows] = await db.execute(sql.raw(
      `SELECT id, name, job_number, site_address, client_name, supervisor_name
       FROM jobs
       WHERE id = ${jobId} AND company_id = ${companyId}
       LIMIT 1`
    )) as unknown as [Array<Record<string, unknown>>, unknown];

    const job = Array.isArray(jobRows) ? jobRows[0] : null;
    if (!job) return res.status(404).json({ error: 'Job not found' });

    // ── 3. Build immutable snapshot ───────────────────────────────────────────
    const contentSnapshot = JSON.stringify({
      masterDocId: studioDocId,
      masterDocName: String(doc.name ?? ''),
      templateType: String(doc.template_type ?? ''),
      builderJson: doc.builder_json,
      snapshotAt: new Date().toISOString(),
      jobId,
      jobTitle: String(job.name ?? ''),
      jobNumber: String(job.job_number ?? ''),
      siteAddress: String(job.site_address ?? ''),
      clientName: String(job.client_name ?? ''),
      supervisorName: String(job.supervisor_name ?? ''),
      docNumber: docNumber ?? '',
      revision: revision ?? '1',
    });

    const dateAttached = new Date().toISOString().slice(0, 10); // YYYY-MM-DD

    // ── 4. Insert job_studio_documents ────────────────────────────────────────
    let jsdId: number;
    try {
      const [result] = await db.execute(sql.raw(
        `INSERT INTO job_studio_documents
           (company_id, job_id, studio_doc_id, content_snapshot_json,
            job_title, job_number, site_address, client_name, supervisor_name,
            doc_title, doc_number, revision, date_attached, attached_by_user_id)
         VALUES
           (${companyId}, ${jobId}, ${studioDocId}, ${JSON.stringify(contentSnapshot)},
            ${JSON.stringify(String(job.name ?? ''))},
            ${JSON.stringify(String(job.job_number ?? ''))},
            ${JSON.stringify(String(job.site_address ?? ''))},
            ${JSON.stringify(String(job.client_name ?? ''))},
            ${JSON.stringify(String(job.supervisor_name ?? ''))},
            ${JSON.stringify(String(doc.name ?? ''))},
            ${JSON.stringify(docNumber ?? '')},
            ${JSON.stringify(revision ?? '1')},
            ${JSON.stringify(dateAttached)},
            ${JSON.stringify(session.user.id)})`
      )) as unknown as [ResultSetHeader, unknown];
      jsdId = result.insertId;
    } catch (insertErr: unknown) {
      const msg = String((insertErr as { message?: string }).message ?? insertErr);
      // Graceful fallback if job_studio_documents table doesn't exist yet
      if (msg.includes("doesn't exist") || msg.includes('ER_NO_SUCH_TABLE')) {
        return res.status(503).json({
          error: 'Migration required. Run POST /api/migrate-studio-phase2 first.',
          migrationRequired: true,
        });
      }
      throw insertErr;
    }

    // ── 5. Sign-on bridge for SWMS / Safety Plan ──────────────────────────────
    const templateType = String(doc.template_type ?? '');
    let bridgeSwmsTemplateId: number | null = null;
    let bridgeJobSwmsId: number | null = null;

    if (templateType === 'swms' || templateType === 'safety_plan') {
      try {
        // Create a synthetic swms_templates row so swms_signoffs can reference it
        const syntheticTitle = `[Studio] ${String(doc.name ?? 'SWMS')}`;
        const [stResult] = await db.execute(sql.raw(
          `INSERT INTO swms_templates
             (company_id, title, status, created_by_user_id)
           VALUES
             (${companyId}, ${JSON.stringify(syntheticTitle)}, 'active', ${JSON.stringify(session.user.id)})`
        )) as unknown as [ResultSetHeader, unknown];
        bridgeSwmsTemplateId = stResult.insertId;

        // Create a job_swms row linking the job to the synthetic template
        const [jsResult] = await db.execute(sql.raw(
          `INSERT INTO job_swms
             (company_id, job_id, swms_template_id, assigned_by_user_id, studio_doc_id)
           VALUES
             (${companyId}, ${jobId}, ${bridgeSwmsTemplateId}, ${JSON.stringify(session.user.id)}, ${jsdId})`
        )) as unknown as [ResultSetHeader, unknown];
        bridgeJobSwmsId = jsResult.insertId;

        // Update job_studio_documents with the bridge IDs
        await db.execute(sql.raw(
          `UPDATE job_studio_documents
           SET bridge_swms_template_id = ${bridgeSwmsTemplateId}
           WHERE id = ${jsdId}`
        ));
      } catch (bridgeErr: unknown) {
        const msg = String((bridgeErr as { message?: string }).message ?? bridgeErr);
        // studio_doc_id column may not exist yet on job_swms — non-fatal, log and continue
        console.warn('[studio-swms attach] sign-on bridge failed (non-fatal):', msg);
      }
    }

    // ── 6. Return result ──────────────────────────────────────────────────────
    return res.status(201).json({
      ok: true,
      jobStudioDocumentId: jsdId,
      bridgeSwmsTemplateId,
      bridgeJobSwmsId,
      jobId,
      studioDocId,
      docTitle: String(doc.name ?? ''),
      dateAttached,
    });
  } catch (err) {
    console.error('POST /api/jobs/:id/studio-swms error:', err);
    return res.status(500).json({ error: 'Failed to attach Studio document to job' });
  }
}
