import { createRequire } from 'module';
import fs from 'fs';
import path from 'path';
import https from 'https';
import { fileURLToPath } from 'url';

const require = createRequire(import.meta.url);
const { getSecret } = require('#airo/secrets');
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

const TOKEN = getSecret('GITHUB_WRITE_TOKEN');
const REPO = 'darylwilliams1581-netizen/IWILLBUILD_Portal';
const BRANCH = 'airo-export-2026-09-03';
const BASE_SHA = '3824b0c5c5b00e8e1aca7c99255e3f9eddeeb904';

function apiRequest(method, endpoint, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const options = {
      hostname: 'api.github.com',
      path: `/repos/${REPO}/${endpoint}`,
      method,
      headers: {
        'Authorization': `token ${TOKEN}`,
        'Accept': 'application/vnd.github.v3+json',
        'User-Agent': 'IWILLBUILD-cleanup',
        'Content-Type': 'application/json',
        ...(data ? { 'Content-Length': Buffer.byteLength(data) } : {}),
      },
    };
    const req = https.request(options, (res) => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try { resolve(JSON.parse(d)); }
        catch(e) { resolve(d); }
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

// Files changed in the two cleanup commits (020ae793 and e530a335)
const CHANGED = [
  'src/components/ImageSafeguardBatchModal.tsx',
  'src/components/ImageSafeguardNotice.tsx',
  'src/components/JobPhotos.tsx',
  'src/components/SendDocumentEmailModal.tsx',
  'src/components/dashboard/DashboardPhotoUploader.tsx',
  'src/components/job/FormFieldRenderers.tsx',
  'src/components/owner-console/ImageSafeguardTab.tsx',
  'src/components/owner-console/__tests__/ImageSafeguardTabCSV.test.tsx',
  'src/components/owner-console/__tests__/ImageSafeguardTabUX.test.tsx',
  'src/components/settings/CompanyTab.tsx',
  'src/components/settings/MyAccountTab.tsx',
  'src/hooks/useImageSafeguardBatch.ts',
  'src/lib/imageSafeguard/types.ts',
  'src/lib/imageSafety/types.ts',
  'src/pages/incident-detail.tsx',
  'src/pages/job-photos-page.tsx',
  'src/pages/owner-console.tsx',
  'src/server/__tests__/imageSafeguardCP12B5.test.ts',
  'src/server/api/asset-manager/assets/[id]/photos/POST.ts',
  'src/server/api/asset-manager/inspections/[id]/photos/POST.ts',
  'src/server/api/electrical-tests/[id]/photos/POST.ts',
  'src/server/api/form-attachments/POST.ts',
  'src/server/api/image-safety/batch-status/POST.ts',
  'src/server/api/incidents/[incidentId]/attachments/POST.ts',
  'src/server/api/job-cards/[id]/photos/POST.ts',
  'src/server/api/job-forms/[id]/send-email/POST.ts',
  'src/server/api/jobs/[id]/photos/POST.ts',
  'src/server/api/jobs/[id]/photos/share/POST.ts',
  'src/server/api/me/profile-attachments/POST.ts',
  'src/server/api/owner-console/image-safeguard/debug-runs/GET.ts',
  'src/server/api/owner-console/image-safeguard/findings/[id]/PATCH.ts',
  'src/server/api/owner-console/image-safeguard/findings/preview/GET.ts',
  'src/server/api/owner-console/image-safeguard/runs/DELETE.ts',
  'src/server/api/owner-console/image-safeguard/runs/GET.ts',
  'src/server/api/owner-console/image-safeguard/runs/[runId]/export-csv/GET.ts',
  'src/server/api/owner-console/image-safeguard/runs/[runId]/progress/GET.ts',
  'src/server/api/owner-console/image-safeguard/scan/POST.ts',
  'src/server/api/owner-console/image-safeguard/status/GET.ts',
  'src/server/db/migrations/image-safeguard-scan-runs.ts',
  'src/server/db/migrations/image-safeguard.ts',
  'src/server/db/schema.ts',
  'src/server/entry.ts',
  'src/server/lib/__tests__/imageSafeguard.test.ts',
  'src/server/lib/__tests__/imageSafeguardCP12A8.test.ts',
  'src/server/lib/__tests__/imageSafeguardCP12B1.test.ts',
  'src/server/lib/__tests__/imageSafeguardCP12B2.test.ts',
  'src/server/lib/__tests__/imageSafeguardCP12B3.test.ts',
  'src/server/lib/__tests__/imageSafeguardCP12B6.test.ts',
  'src/server/lib/__tests__/imageSafeguardDatetime.test.ts',
  'src/server/lib/imageSafeguard/imageClassifier.ts',
  'src/server/lib/imageSafeguard/r2ImageFetcher.ts',
  'src/server/lib/imageSafeguard/r2Scanner.ts',
  'src/server/lib/imageSafeguard/scanRunService.ts',
  'src/server/lib/imageSafeguard/scannerAdapter.ts',
  'src/server/lib/imageSafeguardCapability.ts',
  'src/server/lib/imageSafeguardService.ts',
];

const COMMIT_MESSAGE = `AIRO-IMAGE-SAFEGUARD-FINAL-REMOVAL — Complete removal of retired Image Safeguard feature

Remove all CP12A/CP12B Image Safeguard code from application runtime.
Image auditing runs separately outside the application.

Deleted: ImageSafeguardBatchModal, ImageSafeguardNotice, useImageSafeguardBatch,
imageSafeguard/types, 9 owner-console API handlers, 2 migration files (history
only — no DROP TABLE), 7 test files, 5 scanner lib files, imageSafeguardCapability,
imageSafeguardService, ImageSafeguardTab, 2 tab test files.

Modified: entry.ts (imports/startup/routes), schema.ts (Drizzle table defs),
batch-status/POST.ts (stubbed), 8 upload handlers (createPendingSafeguardRecord
removed), send-email/POST.ts (gate removed), share/POST.ts (gate removed),
JobPhotos.tsx, SendDocumentEmailModal.tsx, DashboardPhotoUploader.tsx,
FormFieldRenderers.tsx, CompanyTab.tsx, MyAccountTab.tsx, incident-detail.tsx,
job-photos-page.tsx, owner-console.tsx, imageSafety/types.ts (comment cleaned).

Preserved: magic-byte validation, MIME checks, upload size limits, ZIP bomb
guard, authentication, authorization, safe object-key generation, all normal
job-photo and document-image functionality.

Tests: 3753 passed, 4 failed (2 pre-existing unrelated failures only)
  - launch-cleanup.test.ts: 3 failures (seo-routes path count — separate issue)
  - recovery-email-security.test.ts: 1 failure (recoveryTokenLimiter — separate)
  - Zero Image Safeguard test failures
Build: clean. Credential scan: clean.`;

async function main() {
  console.log('Step 1: Getting base commit tree...');
  const baseCommit = await apiRequest('GET', `git/commits/${BASE_SHA}`);
  if (!baseCommit.tree) {
    console.error('Failed to get base commit:', JSON.stringify(baseCommit).substring(0, 200));
    process.exit(1);
  }
  const baseTreeSha = baseCommit.tree.sha;
  console.log('Base tree SHA:', baseTreeSha);

  console.log('Step 2: Building tree entries...');
  const treeEntries = [];
  let modified = 0, deleted = 0;
  for (const filePath of CHANGED) {
    const absPath = path.join(ROOT, filePath);
    if (fs.existsSync(absPath)) {
      const content = fs.readFileSync(absPath, 'utf8');
      treeEntries.push({ path: filePath, mode: '100644', type: 'blob', content });
      modified++;
    } else {
      // GitHub Trees API: to delete a file, include the path with sha explicitly null
      // Do NOT include content field when sha is null
      const entry = { path: filePath, mode: '100644', type: 'blob', sha: null };
      treeEntries.push(entry);
      deleted++;
    }
  }
  console.log(`  ${modified} modified/added, ${deleted} deleted`);

  console.log('Step 3: Creating tree...');
  const newTree = await apiRequest('POST', 'git/trees', { base_tree: baseTreeSha, tree: treeEntries });
  if (!newTree.sha) {
    console.error('Tree creation failed:', JSON.stringify(newTree).substring(0, 300));
    process.exit(1);
  }
  console.log('New tree SHA:', newTree.sha);

  console.log('Step 4: Creating commit...');
  const newCommit = await apiRequest('POST', 'git/commits', {
    message: COMMIT_MESSAGE,
    tree: newTree.sha,
    parents: [BASE_SHA],
  });
  if (!newCommit.sha) {
    console.error('Commit creation failed:', JSON.stringify(newCommit).substring(0, 300));
    process.exit(1);
  }
  console.log('New commit SHA:', newCommit.sha);

  console.log('Step 5: Updating branch ref...');
  const refUpdate = await apiRequest('PATCH', `git/refs/heads/${BRANCH}`, {
    sha: newCommit.sha,
    force: false,
  });
  if (refUpdate.object && refUpdate.object.sha) {
    console.log('SUCCESS — export branch updated to:', refUpdate.object.sha);
  } else {
    console.error('Ref update failed:', JSON.stringify(refUpdate).substring(0, 300));
    process.exit(1);
  }
}

main().catch(e => { console.error(e); process.exit(1); });
