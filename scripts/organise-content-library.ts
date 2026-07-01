#!/usr/bin/env tsx
/**
 * organise-content-library.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Tidies the docs/ and content/ directories by moving known old prompt files
 * and loose content into their canonical archive locations.
 *
 * RULES:
 *  - Never deletes anything.
 *  - Only moves files it explicitly knows about.
 *  - Unknown files are left untouched (or moved to docs/archive/review-needed/).
 *  - Prints a summary of every action taken.
 *  - Safe to run multiple times (skips files that are already in the right place).
 *
 * Usage:
 *   npx tsx scripts/organise-content-library.ts
 *   npx tsx scripts/organise-content-library.ts --dry-run
 */

import { existsSync, mkdirSync, readdirSync, statSync } from 'fs';
import { rename } from 'fs/promises';
import { resolve, join, basename } from 'path';

const ROOT = resolve(process.cwd());
const DRY_RUN = process.argv.includes('--dry-run');

// ── Helpers ───────────────────────────────────────────────────────────────────

function ensureDir(dir: string) {
  if (!existsSync(dir)) {
    if (!DRY_RUN) mkdirSync(dir, { recursive: true });
    console.log(`  [mkdir] ${dir.replace(ROOT + '/', '')}`);
  }
}

async function moveFile(from: string, toDir: string): Promise<'moved' | 'skipped' | 'missing'> {
  const src = resolve(ROOT, from);
  const dest = resolve(ROOT, toDir, basename(from));

  if (!existsSync(src)) return 'missing';
  if (existsSync(dest)) {
    console.log(`  [skip]  ${from} → already at destination`);
    return 'skipped';
  }

  ensureDir(resolve(ROOT, toDir));

  if (!DRY_RUN) await rename(src, dest);
  console.log(`  [move]  ${from} → ${toDir}/`);
  return 'moved';
}

// ── Move rules ────────────────────────────────────────────────────────────────

const COMPLETED_PROMPTS = [
  '02_Settings_User_Permissions_Notifications.txt',
  '03_Dashboard_Getting_Started_Wording.txt',
  '04_Files_Filter_Thumbnails_Shared_Viewer.txt',
  '05_Fleet_Files_Viewer_Actions.txt',
  '06_Job_Form_Instance_Actions.txt',
  '07_Job_Form_Scrolling_Print_PDF.txt',
  '08_Form_Signature_Canvas_Fix.txt',
  '09_Form_Signature_Multiple_Signers.txt',
  '10_Estimate_Quote_Print_Layout.txt',
  '11_Settings_PDF_Print_Style.txt',
  '12_Dashboard_Smart_Banner_Seasonal_Notices.txt',
  '13_Owner_Console_MVP.txt',
  '14_Owner_Support_Setup_Mode.txt',
];

const HTML_PROTOTYPES = [
  'Dazza_Full_v6_Compact.html',
  'Dazza_Full.html',
  'ME_MATE_Web_Portal_v75_Dazza_Link_Only.html',
  'iwillbuild-landing.html',
];

const REVIEW_NEEDED = [
  'IWILLBUILD_White_Paper_v1.docx',
  'dazza-annette.css',
  'POLISHED_CHANGES.md',
];

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\nIWILLBUILD Content Library Organiser${DRY_RUN ? ' [DRY RUN]' : ''}`);
  console.log('─'.repeat(60));

  const stats = { moved: 0, skipped: 0, missing: 0 };

  // Completed prompt files
  console.log('\n→ Completed prompt files → docs/archive/prompts/');
  for (const f of COMPLETED_PROMPTS) {
    const r = await moveFile(`docs/${f}`, 'docs/archive/prompts');
    stats[r]++;
  }

  // HTML prototypes
  console.log('\n→ HTML prototypes → docs/archive/html-prototypes/');
  for (const f of HTML_PROTOTYPES) {
    const r = await moveFile(`docs/${f}`, 'docs/archive/html-prototypes');
    stats[r]++;
  }

  // Review-needed files
  console.log('\n→ Review-needed files → docs/archive/review-needed/');
  for (const f of REVIEW_NEEDED) {
    const r = await moveFile(`docs/${f}`, 'docs/archive/review-needed');
    stats[r]++;
  }

  // SWMS DOCX
  console.log('\n→ SWMS DOCX → content/starter-packs/default/source-docx/swms/');
  const docsFiles = existsSync(join(ROOT, 'docs')) ? readdirSync(join(ROOT, 'docs')) : [];
  for (const f of docsFiles) {
    if (f.startsWith('MLCH-') && f.endsWith('.docx')) {
      const r = await moveFile(`docs/${f}`, 'content/starter-packs/default/source-docx/swms');
      stats[r]++;
    }
  }

  // Policy DOCX
  console.log('\n→ Policy DOCX → content/starter-packs/default/source-docx/policies/');
  for (const f of docsFiles) {
    if (f.startsWith('PP-') && f.endsWith('.docx')) {
      const r = await moveFile(`docs/${f}`, 'content/starter-packs/default/source-docx/policies');
      stats[r]++;
    }
  }

  // Austen form DOCX
  console.log('\n→ Austen form DOCX → content/starter-packs/default/source-docx/forms/');
  for (const f of docsFiles) {
    if (f.startsWith('Austen_') && f.endsWith('.docx')) {
      const r = await moveFile(`docs/${f}`, 'content/starter-packs/default/source-docx/forms');
      stats[r]++;
    }
  }

  // Dazza chat logs
  console.log('\n→ Dazza chat logs → docs/archive/review-needed/');
  for (const f of docsFiles) {
    if (f.startsWith('dazza-chat-') && f.endsWith('.txt')) {
      const r = await moveFile(`docs/${f}`, 'docs/archive/review-needed');
      stats[r]++;
    }
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  console.log('\n' + '─'.repeat(60));
  console.log(`Summary: ${stats.moved} moved, ${stats.skipped} already in place, ${stats.missing} not found`);

  if (DRY_RUN) {
    console.log('\n[DRY RUN] No files were actually moved. Remove --dry-run to apply.\n');
  } else {
    console.log('\nDone. All files archived — nothing was deleted.\n');
  }

  // ── Remaining docs/ files ─────────────────────────────────────────────────
  const remaining = existsSync(join(ROOT, 'docs'))
    ? readdirSync(join(ROOT, 'docs')).filter(f => {
        const full = join(ROOT, 'docs', f);
        return statSync(full).isFile();
      })
    : [];

  if (remaining.length > 0) {
    console.log('Files remaining in docs/ (not moved — review manually if needed):');
    for (const f of remaining) console.log(`  ${f}`);
    console.log();
  }
}

main().catch(e => {
  console.error('Error:', e);
  process.exit(1);
});
