/**
 * Push cleanup changes to airo-export-2026-09-03 using the GitHub Contents API.
 * Uses PUT for modified/added files and DELETE for removed files.
 * This avoids the GitRPC::BadObjectState issue with sha:null in Trees API.
 */
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
        try { resolve({ status: res.statusCode, body: JSON.parse(d) }); }
        catch(e) { resolve({ status: res.statusCode, body: d }); }
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

async function getFileSha(filePath) {
  const r = await apiRequest('GET', `contents/${filePath}?ref=${BRANCH}`);
  if (r.status === 200 && r.body.sha) return r.body.sha;
  if (r.status === 404) return null; // file doesn't exist on branch
  throw new Error(`getFileSha(${filePath}) → ${r.status}: ${JSON.stringify(r.body).substring(0,100)}`);
}

async function putFile(filePath, content, existingSha, message) {
  const body = {
    message,
    content: Buffer.from(content, 'utf8').toString('base64'),
    branch: BRANCH,
  };
  if (existingSha) body.sha = existingSha;
  const r = await apiRequest('PUT', `contents/${encodeURIComponent(filePath).replace(/%2F/g,'/')}`, body);
  if (r.status === 200 || r.status === 201) return r.body.commit?.sha;
  throw new Error(`PUT ${filePath} → ${r.status}: ${JSON.stringify(r.body).substring(0,200)}`);
}

async function deleteFile(filePath, existingSha, message) {
  if (!existingSha) { console.log(`  SKIP (not on branch): ${filePath}`); return null; }
  const body = { message, sha: existingSha, branch: BRANCH };
  const r = await apiRequest('DELETE', `contents/${encodeURIComponent(filePath).replace(/%2F/g,'/')}`, body);
  if (r.status === 200) return r.body.commit?.sha;
  throw new Error(`DELETE ${filePath} → ${r.status}: ${JSON.stringify(r.body).substring(0,200)}`);
}

// Files changed in the two cleanup commits
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

const COMMIT_MSG = 'AIRO-IMAGE-SAFEGUARD-FINAL-REMOVAL: Remove retired Image Safeguard feature from runtime';

async function main() {
  let lastCommitSha = null;
  let done = 0;

  for (const filePath of CHANGED) {
    const absPath = path.join(ROOT, filePath);
    const exists = fs.existsSync(absPath);
    process.stdout.write(`[${++done}/${CHANGED.length}] ${exists ? 'PUT' : 'DEL'} ${filePath} ... `);

    const existingSha = await getFileSha(filePath);

    if (exists) {
      const content = fs.readFileSync(absPath, 'utf8');
      lastCommitSha = await putFile(filePath, content, existingSha, COMMIT_MSG);
      console.log('ok');
    } else {
      lastCommitSha = await deleteFile(filePath, existingSha, COMMIT_MSG);
      console.log(existingSha ? 'deleted' : 'skipped');
    }

    // Small delay to avoid rate limiting
    await new Promise(r => setTimeout(r, 200));
  }

  console.log('\nAll files processed.');
  console.log('Final commit SHA on export branch:', lastCommitSha);
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
