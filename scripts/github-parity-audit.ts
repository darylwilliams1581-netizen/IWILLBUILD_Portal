/**
 * scripts/github-parity-audit.ts
 * READ-ONLY GitHub production-parity audit for IWIllBUILD.
 * Compares GitHub main HEAD against the current Airo project source.
 * No writes, no pushes, no mutations.
 */
import { getSecret } from '#airo/secrets';
import { execSync } from 'child_process';
import { readFileSync, existsSync, statSync } from 'fs';
import { join } from 'path';

const TOKEN = getSecret('GITHUB_DAZZA_READ_TOKEN') as string;
const REPO  = 'darylwilliams1581-netizen/IWIllBUILD_Portal';
const BRANCH = 'main';

if (!TOKEN) { console.error('FATAL: GITHUB_DAZZA_READ_TOKEN not set'); process.exit(1); }

const PASS = '✅';
const FAIL = '❌';
const WARN = '⚠️ ';
const INFO = 'ℹ️ ';

// ── GitHub REST helpers ───────────────────────────────────────────────────────
async function ghGet(path: string): Promise<any> {
  const r = await fetch(`https://api.github.com${path}`, {
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });
  if (!r.ok) {
    const body = await r.text();
    throw new Error(`GitHub GET ${path} → ${r.status}: ${body.slice(0, 300)}`);
  }
  return r.json();
}

async function ghGetRaw(path: string): Promise<string> {
  const r = await fetch(`https://api.github.com${path}`, {
    headers: {
      Authorization: `Bearer ${TOKEN}`,
      Accept: 'application/vnd.github.raw+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });
  if (r.status === 404) return '__NOT_FOUND__';
  if (!r.ok) throw new Error(`GitHub raw GET ${path} → ${r.status}`);
  return r.text();
}

// ── Get GitHub main HEAD ──────────────────────────────────────────────────────
async function getGitHubHead() {
  const branch = await ghGet(`/repos/${REPO}/branches/${BRANCH}`);
  return {
    sha:     branch.commit.sha as string,
    message: branch.commit.commit.message as string,
    date:    branch.commit.commit.committer.date as string,
    author:  branch.commit.commit.author.name as string,
  };
}

// ── Get full tree from GitHub (recursive) ────────────────────────────────────
async function getGitHubTree(sha: string): Promise<Map<string, string>> {
  const tree = await ghGet(`/repos/${REPO}/git/trees/${sha}?recursive=1`);
  const map = new Map<string, string>();
  for (const item of tree.tree) {
    if (item.type === 'blob') map.set(item.path, item.sha);
  }
  return map;
}

// ── Get local git tree ────────────────────────────────────────────────────────
function getLocalTree(): Map<string, string> {
  // Use git ls-files to get all tracked files with their blob SHAs
  const out = execSync('git ls-files --format="%(objectname) %(path)"', { encoding: 'utf8' });
  const map = new Map<string, string>();
  for (const line of out.trim().split('\n')) {
    if (!line.trim()) continue;
    const spaceIdx = line.indexOf(' ');
    const sha  = line.slice(0, spaceIdx).trim();
    const path = line.slice(spaceIdx + 1).trim();
    map.set(path, sha);
  }
  return map;
}

// ── Files to skip in comparison (generated, deps, build artifacts) ────────────
function shouldSkip(path: string): boolean {
  const skip = [
    'node_modules/',
    'dist/',
    '.git/',
    'package-lock.json',
    'pnpm-lock.yaml',
    'yarn.lock',
    '.DS_Store',
    'scripts/stripe-tier-audit.ts',   // just created this session
    'scripts/stripe-tier-audit.mjs',  // just created this session
    'scripts/github-parity-audit.ts', // this script itself
  ];
  return skip.some(s => path.startsWith(s) || path === s.replace(/\/$/, ''));
}

// ── Key files to audit specifically (the CP2 checklist) ──────────────────────
const KEY_FILES: Array<{ label: string; paths: string[] }> = [
  {
    label: 'Billing hardening (cancel/reactivate Stripe-first)',
    paths: [
      'src/server/api/billing/cancel-subscription/POST.ts',
      'src/server/api/billing/reactivate-subscription/POST.ts',
      'src/server/lib/subscription-gate.ts',
    ],
  },
  {
    label: 'Billing reconcile endpoint',
    paths: ['src/server/api/developer/billing-reconcile/POST.ts'],
  },
  {
    label: '2FA — SMS challenge + TOTP',
    paths: [
      'src/server/api/auth/sms-challenge/POST.ts',
      'src/server/api/auth/verify-sms/POST.ts',
      'src/server/api/auth/totp/verify/POST.ts',
      'src/server/middleware/two-factor-intercept.ts',
    ],
  },
  {
    label: 'iPad/Capacitor responsive layout',
    paths: [
      'src/components/layout/DesktopTopBar.tsx',
      'src/components/layout/PortalSidebar.tsx',
      'src/components/layout/Dock.tsx',
    ],
  },
  {
    label: 'Finance shell integration (all 4 tabs)',
    paths: [
      'src/pages/finance.tsx',
      'src/components/finance/FinanceShell.tsx',
      'src/components/finance/LedgerTab.tsx',
      'src/components/finance/PurchaseOrdersTab.tsx',
      'src/components/finance/TimesheetsTab.tsx',
      'src/components/finance/FinanceSettingsTab.tsx',
    ],
  },
  {
    label: 'Timesheets redirect route',
    paths: ['src/pages/timesheets.tsx'],
  },
  {
    label: 'Studio / Dazza document builder',
    paths: [
      'src/pages/studio/builder.tsx',
      'src/components/studio/BlockCanvas.tsx',
      'src/components/dazza/DazzaSidebar.tsx',
    ],
  },
  {
    label: 'SEO route cleanup (seo-routes.ts)',
    paths: ['src/lib/seo-routes.ts'],
  },
  {
    label: 'Stripe canonical secret names in code',
    paths: [
      'src/server/api/subscription/create-checkout/POST.ts',
      'src/server/api/billing/upgrade-subscription/POST.ts',
      'src/server/api/dazza/secret-health/GET.ts',
    ],
  },
  {
    label: 'Logo dark-variant fix (PagedHomeScreen)',
    paths: ['src/pages/PagedHomeScreen.tsx'],
  },
  {
    label: 'Dazza UI selector fix (isPlatformOwner)',
    paths: ['src/components/dazza/DazzaButton.tsx'],
  },
];

// ── Main ──────────────────────────────────────────────────────────────────────
(async () => {
  console.log('\n══════════════════════════════════════════════════════════════════');
  console.log('  GITHUB PRODUCTION-PARITY AUDIT  (read-only)');
  console.log(`  Repo: ${REPO}  Branch: ${BRANCH}`);
  console.log('══════════════════════════════════════════════════════════════════\n');

  // 1. GitHub HEAD
  let ghHead: Awaited<ReturnType<typeof getGitHubHead>>;
  try {
    ghHead = await getGitHubHead();
  } catch (e: any) {
    console.error(`${FAIL} Could not reach GitHub: ${e.message}`);
    process.exit(1);
  }

  console.log('── GitHub main HEAD');
  console.log(`  SHA:     ${ghHead.sha}`);
  console.log(`  Date:    ${ghHead.date}`);
  console.log(`  Author:  ${ghHead.author}`);
  console.log(`  Message: ${ghHead.message.split('\n')[0]}`);
  console.log('');

  // 2. Local Airo HEAD
  const localSha     = execSync('git rev-parse HEAD', { encoding: 'utf8' }).trim();
  const localMessage = execSync('git log -1 --format="%s"', { encoding: 'utf8' }).trim();
  const localDate    = execSync('git log -1 --format="%ci"', { encoding: 'utf8' }).trim();

  console.log('── Airo local HEAD');
  console.log(`  SHA:     ${localSha}`);
  console.log(`  Date:    ${localDate}`);
  console.log(`  Message: ${localMessage}`);
  console.log('');

  // 3. Quick SHA match
  if (ghHead.sha === localSha) {
    console.log(`${PASS} GitHub main SHA matches Airo HEAD exactly — repositories are in sync.`);
    console.log('\n══════════════════════════════════════════════════════════════════');
    console.log(`${PASS} AUDIT COMPLETE — REPOSITORIES MATCH`);
    console.log('══════════════════════════════════════════════════════════════════\n');
    process.exit(0);
  }

  console.log(`${WARN} SHAs differ — performing file-level comparison…\n`);

  // 4. Get trees
  let ghTree: Map<string, string>;
  try {
    ghTree = await getGitHubTree(ghHead.sha);
  } catch (e: any) {
    console.error(`${FAIL} Could not fetch GitHub tree: ${e.message}`);
    process.exit(1);
  }

  const localTree = getLocalTree();

  // 5. Compare
  const onlyInAiro:   string[] = [];
  const onlyInGitHub: string[] = [];
  const different:    string[] = [];
  const identical:    string[] = [];

  const allPaths = new Set([...localTree.keys(), ...ghTree.keys()]);

  for (const path of allPaths) {
    if (shouldSkip(path)) continue;
    const localShaFile = localTree.get(path);
    const ghShaFile    = ghTree.get(path);

    if (localShaFile && !ghShaFile) {
      onlyInAiro.push(path);
    } else if (!localShaFile && ghShaFile) {
      onlyInGitHub.push(path);
    } else if (localShaFile !== ghShaFile) {
      different.push(path);
    } else {
      identical.push(path);
    }
  }

  // 6. Key-file audit
  console.log('── Key-file audit (CP2 checklist)\n');
  const keyFileMissing: string[] = [];
  const keyFileDifferent: string[] = [];

  for (const { label, paths } of KEY_FILES) {
    const results: string[] = [];
    let anyMissing = false;
    let anyDifferent = false;

    for (const p of paths) {
      if (!localTree.has(p)) {
        results.push(`    ${WARN} ${p} — not in Airo local tree (may be named differently)`);
        continue;
      }
      if (!ghTree.has(p)) {
        results.push(`    ${FAIL} ${p} — MISSING from GitHub`);
        anyMissing = true;
        keyFileMissing.push(p);
      } else if (localTree.get(p) !== ghTree.get(p)) {
        results.push(`    ${FAIL} ${p} — DIFFERENT (Airo is newer)`);
        anyDifferent = true;
        keyFileDifferent.push(p);
      } else {
        results.push(`    ${PASS} ${p}`);
      }
    }

    const icon = (anyMissing || anyDifferent) ? FAIL : PASS;
    console.log(`  ${icon} ${label}`);
    for (const r of results) console.log(r);
    console.log('');
  }

  // 7. Summary counts
  console.log('── File-level summary');
  console.log(`  ${PASS} Identical:          ${identical.length} files`);
  console.log(`  ${different.length > 0 ? FAIL : PASS} Changed in Airo:    ${different.length} files`);
  console.log(`  ${onlyInAiro.length > 0 ? FAIL : PASS} Only in Airo:       ${onlyInAiro.length} files`);
  console.log(`  ${onlyInGitHub.length > 0 ? WARN : PASS} Only in GitHub:     ${onlyInGitHub.length} files`);
  console.log('');

  if (different.length > 0) {
    console.log('── Files changed in Airo (not yet in GitHub):');
    for (const f of different.sort()) console.log(`    ${FAIL} ${f}`);
    console.log('');
  }

  if (onlyInAiro.length > 0) {
    console.log('── Files only in Airo (new, not yet pushed):');
    for (const f of onlyInAiro.sort()) console.log(`    ${FAIL} ${f}`);
    console.log('');
  }

  if (onlyInGitHub.length > 0) {
    console.log('── Files only in GitHub (deleted in Airo or diverged):');
    for (const f of onlyInGitHub.sort()) console.log(`    ${WARN} ${f}`);
    console.log('');
  }

  // 8. Proposed commit summary
  const allBehind = [...different, ...onlyInAiro].sort();
  if (allBehind.length > 0) {
    console.log('── Proposed commit (DO NOT PUSH — audit only)');
    console.log('');
    console.log('  Commit message:');
    console.log('  ┌─────────────────────────────────────────────────────────────');
    console.log('  │ chore: sync Airo production fixes to GitHub');
    console.log('  │');
    console.log('  │ Includes:');
    if (keyFileDifferent.some(f => f.includes('billing'))) console.log('  │ - Billing cancel/reactivate hardening (Stripe-first, no DB fallback)');
    if (keyFileDifferent.some(f => f.includes('auth') || f.includes('two-factor'))) console.log('  │ - 2FA SMS/TOTP middleware and challenge endpoints');
    if (keyFileDifferent.some(f => f.includes('DesktopTopBar') || f.includes('PortalSidebar') || f.includes('Dock'))) console.log('  │ - iPad/Capacitor responsive layout (safe-area, lg: breakpoint)');
    if (keyFileDifferent.some(f => f.includes('finance') || f.includes('Finance'))) console.log('  │ - Finance shell integration (Ledger, PO, Timesheets, Settings tabs)');
    if (keyFileDifferent.some(f => f.includes('studio') || f.includes('dazza') || f.includes('Dazza'))) console.log('  │ - Studio/Dazza document builder updates');
    if (keyFileDifferent.some(f => f.includes('seo-routes'))) console.log('  │ - SEO route cleanup (removed sitemap:false entries)');
    if (keyFileDifferent.some(f => f.includes('checkout') || f.includes('upgrade') || f.includes('secret-health'))) console.log('  │ - Stripe canonical price-secret names in code');
    if (keyFileDifferent.some(f => f.includes('PagedHomeScreen'))) console.log('  │ - Logo dark-variant fix (/logo/horizontal/dark)');
    if (keyFileDifferent.some(f => f.includes('DazzaButton'))) console.log('  │ - Dazza UI isPlatformOwner selector fix');
    console.log('  │');
    console.log(`  │ ${allBehind.length} file(s) updated`);
    console.log('  └─────────────────────────────────────────────────────────────');
    console.log('');
    console.log('  Files to include:');
    for (const f of allBehind) console.log(`    + ${f}`);
    console.log('');
    console.log(`  ${WARN} GitHub is BEHIND Airo. A write-scoped token is required to push.`);
    console.log(`  ${INFO} GITHUB_DAZZA_READ_TOKEN is read-only — no push attempted.`);
  }

  // 9. Final verdict
  const ghBehind = allBehind.length > 0;
  console.log('══════════════════════════════════════════════════════════════════');
  if (!ghBehind && onlyInGitHub.length === 0) {
    console.log(`${PASS} AUDIT COMPLETE — REPOSITORIES MATCH`);
  } else if (ghBehind) {
    console.log(`${FAIL} AUDIT COMPLETE — GITHUB IS BEHIND AIRO`);
    console.log(`     ${allBehind.length} file(s) need to be pushed to GitHub main.`);
    console.log(`     Awaiting approval and a write-scoped token before any push.`);
  } else {
    console.log(`${WARN} AUDIT COMPLETE — GITHUB HAS FILES NOT IN AIRO`);
  }
  console.log('══════════════════════════════════════════════════════════════════\n');

  process.exit(ghBehind ? 1 : 0);
})();
