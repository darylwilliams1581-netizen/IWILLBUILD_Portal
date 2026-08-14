import fs from 'fs';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const JSZip = require('/app/node_modules/jszip');

const patch = new JSZip();

const patchFiles = [
  { src: '/app/src/server/lib/write-gate-apply.ts',                         dest: 'patch/src/server/lib/write-gate-apply.ts' },
  { src: '/app/src/server/lib/auth-middleware.ts',                          dest: 'patch/src/server/lib/auth-middleware.ts' },
  { src: '/app/src/server/api/secure-share/[token]/POST.ts',                dest: 'patch/src/server/api/secure-share/[token]/POST.ts' },
  { src: '/app/src/server/api/secure-share/[token]/content/GET.ts',         dest: 'patch/src/server/api/secure-share/[token]/content/GET.ts' },
  { src: '/app/src/server/api/developer/test-share-security/POST.ts',       dest: 'patch/src/server/api/developer/test-share-security/POST.ts' },
  { src: '/app/src/pages/share.tsx',                                        dest: 'patch/src/pages/share.tsx' },
];

const notes = `# Patch: Share Security — Access Proof System
# Date: 2026-08-14
# Environment tested: Airo preview https://f38wenbvln.preview.c36.airoapp.ai

## Changed files
1. src/server/lib/write-gate-apply.ts
   REWRITTEN: narrow exemptions replace broad prefix match.
   POST /api/secure-share (create link) remains subscription-gated.
   POST /api/secure-share/:token (password validate, token >= 20 chars) is exempt.
   Added developer prefix to exempt list.
   Added specific regex exemptions for SWMS signoff, form submit, external form, portal, contact.

2. src/server/lib/auth-middleware.ts
   Added POST /api/developer/test-share-security to public whitelist.

3. src/server/api/secure-share/[token]/POST.ts
   Now issues a short-lived access proof token on successful password validation.
   Proof stored as SHA-256 hash in secure_share_access_proofs table.
   Proof expires in 15 minutes, single-use, scoped to this share_link_id.
   Returns { ok: true, proof: '<raw-token>' }.

4. src/server/api/secure-share/[token]/content/GET.ts
   Password-protected links now require ?proof=TOKEN query parameter.
   Proof verified: must exist, match share_link_id, be unused, be unexpired.
   Proof consumed atomically (UPDATE ... WHERE used=0) before PDF generation.
   Error codes: PASSWORD_REQUIRED, PROOF_INVALID, PROOF_MISMATCH, PROOF_USED, PROOF_EXPIRED.

5. src/server/api/developer/test-share-security/POST.ts (NEW)
   Self-contained test runner: seeds rows, runs 18 tests, cleans up.

6. src/pages/share.tsx
   SecureShareViewer stores proof token from POST response in state.
   contentUrl() helper appends ?proof=TOKEN to View/Download URLs when present.

## DDL added to entry.ts
CREATE TABLE IF NOT EXISTS secure_share_access_proofs (
  id INT AUTO_INCREMENT PRIMARY KEY,
  share_link_id INT NOT NULL,
  proof_hash VARCHAR(64) NOT NULL UNIQUE,
  expires_at DATETIME NOT NULL,
  used TINYINT(1) NOT NULL DEFAULT 0,
  created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_link (share_link_id),
  INDEX idx_proof (proof_hash),
  INDEX idx_expires (expires_at)
)

## Test results (18/18 pass, Airo preview, 2026-08-14T07:22:50Z)
T01 Metadata loads without login                                200      PASS
T02 Content without proof on password-protected link            403 PASSWORD_REQUIRED PASS
T03 Incorrect password                                          401      PASS
T04 Correct password + proof token issued                       200+proof PASS
T05 Content with valid proof passes security gates              200      PASS
T06 Proof for token A cannot unlock token B                     403 PROOF_MISMATCH PASS
T07 Proof cannot be reused                                      403 PROOF_USED PASS
T08 Revoked link (metadata + content)                           410 REVOKED PASS
T09 Expired link (metadata + content)                           410 EXPIRED PASS
T10 Max-uses reached (metadata + content)                       410 MAX_USES PASS
T11 View-only link rejects download                             403 FORBIDDEN PASS
T12 Download-only link rejects view                             403 FORBIDDEN PASS
T13 Cross-company: company_id from token row, not URL           companyId=1 PASS
T14 use_count increments atomically (2 deliveries = 2)          2        PASS
T15 Expired proof                                               403 PROOF_EXPIRED PASS
T16 Revoked link blocks password validation                     410 REVOKED PASS
T17 Expired link blocks password validation                     410 EXPIRED PASS
T18 Max-uses reached blocks password validation                 410 MAX_USES PASS

## Build
npm run build -> exit 0, 2320.82 kB server bundle, 28.74s

## Tests requiring production publish
- Actual PDF generation (requires real estimate/invoice DB rows)
- Valid Quote View and Download (requires real estimate + share link)
- Valid Invoice View and Download (requires real invoice + share link)
- Form expiry and revoke (forms share system)
- SWMS expiry, revoke and Sign (/safety/sign/:token)
- Private browser / no-login PDF view on production domain
`;

patch.file('patch/PATCH-NOTES.md', notes);
for (const f of patchFiles) {
  patch.file(f.dest, fs.readFileSync(f.src));
}

const buf = await patch.generateAsync({ type: 'nodebuffer', compression: 'DEFLATE' });
fs.writeFileSync('/shared-storage/public/assets/patch-share-security-v2-20260814.zip', buf);
console.log('PATCH ZIP:', buf.length, 'bytes');
