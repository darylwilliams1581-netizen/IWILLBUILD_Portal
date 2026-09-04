/**
 * GET /api/plan-manager/jobs/:jobId/drawings-zip
 * Download all PDFs for a job as a single ZIP archive.
 *
 * - Scoped to the authenticated user's company
 * - Only includes drawings that have a PDF uploaded (source_file_path set)
 * - Archived drawings are excluded (status = 'active' only)
 * - Each PDF is named: {sort_order}-{safe_title}.pdf
 * - A manifest.csv is included listing all drawings (including those without PDFs)
 * - Role: any authenticated member of the company
 */
import type { Request, Response } from 'express';
import { db } from '../../../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getAuth } from '../../../../../../lib/auth/auth.js';
import { profiles } from '../../../../../db/schema.js';
import { eq } from 'drizzle-orm';
import fs from 'fs/promises';
import path from 'path';

const DRAWINGS_DIR = '/shared-storage/public/assets/drawings';

function safeName(title: string, idx: number): string {
  const slug = title.replace(/[^a-zA-Z0-9\-_ ]/g, '').replace(/\s+/g, '-').slice(0, 60) || `drawing-${idx}`;
  return `${String(idx).padStart(2, '0')}-${slug}.pdf`;
}

function toCsv(rows: Record<string, unknown>[]): string {
  if (!rows.length) return '';
  const headers = Object.keys(rows[0]);
  const escape = (v: unknown) => {
    const s = v == null ? '' : String(v);
    return s.includes(',') || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [
    headers.join(','),
    ...rows.map(r => headers.map(h => escape(r[h])).join(',')),
  ].join('\n');
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

    const profile = await db.query.profiles.findFirst({ where: eq(profiles.userId, session.user.id) });
    if (!profile?.companyId) return res.status(403).json({ error: 'No company' });

    const jobId = parseInt(String(req.params.jobId), 10);
    if (isNaN(jobId)) return res.status(400).json({ error: 'Invalid job ID' });

    // Verify job belongs to company
    const [jobRows] = await db.execute(sql`
      SELECT id, name, job_number FROM jobs
      WHERE id = ${jobId} AND company_id = ${profile.companyId}
      LIMIT 1
    `) as unknown as [Array<{ id: number; name: string; job_number: string }>];

    if (!jobRows?.length) return res.status(404).json({ error: 'Job not found' });
    const job = jobRows[0];

    // Fetch all active drawings linked to this job, in sort order
    const [drawingRows] = await db.execute(sql`
      SELECT
        pd.id,
        pd.title,
        pd.source_file_path,
        pd.source_file_name,
        pd.page_count,
        pd.updated_at,
        dr.name AS revision_name,
        dr.revision_no,
        jdl.sort_order
      FROM project_drawings pd
      JOIN job_drawing_links jdl ON jdl.drawing_id = pd.id AND jdl.job_id = ${jobId}
      LEFT JOIN drawing_revisions dr ON dr.id = pd.current_revision_id
      WHERE pd.company_id = ${profile.companyId}
        AND pd.status = 'active'
      ORDER BY jdl.sort_order ASC, pd.id ASC
    `) as unknown as [Array<{
      id: number;
      title: string;
      source_file_path: string | null;
      source_file_name: string | null;
      page_count: number | null;
      updated_at: string;
      revision_name: string | null;
      revision_no: number | null;
      sort_order: number;
    }>];

    const drawings = drawingRows ?? [];

    if (!drawings.length) {
      return res.status(404).json({ error: 'No drawings found for this job' });
    }

    const { default: JSZip } = await import('jszip');
    const zip = new JSZip();

    const dateStr = new Date().toISOString().slice(0, 10);
    const jobLabel = job.job_number ? `${job.job_number} — ${job.name}` : job.name;

    // README
    const readme = [
      `IWIllBUIlD — Drawing Set Export`,
      `═══════════════════════════════`,
      `Job:       ${jobLabel}`,
      `Exported:  ${dateStr}`,
      `Drawings:  ${drawings.length} total`,
      ``,
      `FILES IN THIS ZIP`,
      `─────────────────`,
      `manifest.csv   — Full list of drawings with revision and page info`,
      `*.pdf          — PDF files for each drawing (where uploaded)`,
      ``,
      `Note: Drawings without a PDF uploaded are listed in the manifest`,
      `but do not have a corresponding PDF file in this archive.`,
    ].join('\n');

    zip.file('README.txt', readme);

    // Manifest CSV
    const manifestRows = drawings.map((d, i) => ({
      '#': i + 1,
      title: d.title,
      revision: d.revision_name ?? '',
      revision_no: d.revision_no ?? '',
      pages: d.page_count ?? '',
      has_pdf: d.source_file_path ? 'Yes' : 'No',
      original_filename: d.source_file_name ?? '',
      updated_at: d.updated_at ? String(d.updated_at).slice(0, 10) : '',
    }));
    zip.file('manifest.csv', toCsv(manifestRows as Record<string, unknown>[]));

    // Add PDFs
    let pdfCount = 0;
    for (let i = 0; i < drawings.length; i++) {
      const d = drawings[i];
      if (!d.source_file_path) continue;

      // source_file_path is like /airo-assets/uploads/drawings/drawing-123-abc.pdf
      // Map to filesystem: /shared-storage/public/assets/drawings/<filename>
      const filename = path.basename(d.source_file_path);
      const filePath = path.join(DRAWINGS_DIR, filename);

      try {
        const buffer = await fs.readFile(filePath);
        zip.file(safeName(d.title, i + 1), buffer);
        pdfCount++;
      } catch {
        // File missing from storage — skip silently, it's noted in manifest
      }
    }

    if (pdfCount === 0) {
      return res.status(404).json({ error: 'No PDF files found for this job. Upload PDFs to drawings first.' });
    }

    const zipBuffer = await zip.generateAsync({
      type: 'nodebuffer',
      compression: 'DEFLATE',
      compressionOptions: { level: 6 },
    });

    const safeJobName = job.name.replace(/[^a-zA-Z0-9-_]/g, '-').replace(/-+/g, '-').slice(0, 40);
    const safeJobNum = job.job_number ? `${job.job_number.replace(/[^a-zA-Z0-9]/g, '')}-` : '';
    const zipName = `drawings-${safeJobNum}${safeJobName}-${dateStr}.zip`;

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${zipName}"`);
    res.setHeader('Content-Length', String(zipBuffer.length));
    res.send(zipBuffer);

  } catch (err) {
    console.error('GET /api/plan-manager/jobs/:jobId/drawings-zip error:', err);
    if (!res.headersSent) res.status(500).json({ error: 'Export failed' });
  }
}
