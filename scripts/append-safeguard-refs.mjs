import { appendFileSync } from 'fs';

const additions = `
// ── CP12A7: Server-side image reference resolution ────────────────────────────

/**
 * Resolve the exact storage refs for all photos belonging to a job.
 * Returns job_photo:{id} strings matching the format written on upload.
 * Scoped to companyId. Returns empty array on DB failure (fail-closed).
 */
export async function resolveJobPhotoRefs(
  companyId,
  jobId,
) {
  try {
    const rows = await db.execute(sql\`
      SELECT id FROM job_photos
      WHERE job_id = \${jobId} AND company_id = \${companyId}
      ORDER BY id ASC
    \`);
    return rows.map(r => \`job_photo:\${r.id}\`);
  } catch (err) {
    console.error('[imageSafeguard] resolveJobPhotoRefs failed:', err instanceof Error ? err.message : err);
    return [];
  }
}
`;

appendFileSync('src/server/lib/imageSafeguardService.ts', additions);
console.log('done');
