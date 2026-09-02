/**
 * fix-seed-all.mjs
 * Full fix for all 24 seed endpoints:
 * 1. Fix import (getSessionAndProfile → getPlatformOwnerInfo)
 * 2. Fix auth block
 * 3. Fix handler body (company loop → single platform master insert)
 */
import { readFileSync, writeFileSync, readdirSync } from 'fs';
import { join } from 'path';

const BASE = 'src/server/api/owner-console/swms';
const dirs = readdirSync(BASE).filter(d => d.startsWith('seed-'));

function newHandlerBody(titleExpr, swmsVar) {
  return `  const replace = req.query.replace === '1' || req.body?.replace === true;

  try {
    const title = ${titleExpr};
    const swmsBodyJson = JSON.stringify(${swmsVar});
    const safe = (s) => s.replace(/\\\\/g, '\\\\\\\\').replace(/'/g, "\\\\'");

    // Check if a platform master already exists for this title
    const [existing] = await db.execute(sql.raw(
      \`SELECT id FROM swms_templates WHERE company_id IS NULL AND is_platform_master = 1 AND title = \${JSON.stringify(title)} LIMIT 1\`
    ));

    const existingId = existing?.[0]?.id;

    if (existingId && replace) {
      await db.execute(sql.raw(\`
        UPDATE swms_templates SET
          swms_body = '\${safe(swmsBodyJson)}',
          build_mode = 'advanced',
          document_type = 'swms',
          is_platform_master = 1,
          status = 'draft',
          updated_at = NOW()
        WHERE id = \${existingId}
      \`));
      return res.json({ ok: true, action: 'updated', id: existingId });
    }

    if (existingId) {
      return res.json({ ok: true, action: 'skipped', id: existingId });
    }

    // Insert new platform master (company_id = NULL)
    const [result] = await db.execute(sql.raw(\`
      INSERT INTO swms_templates
        (company_id, title, category, revision_number, author_name, approved_by_name,
         status, build_mode, document_type, swms_body, is_platform_master, created_at, updated_at)
      VALUES (
        NULL,
        '\${safe(title)}',
        'General Construction / Site Works',
        '1',
        'Site Supervisor / IWIllBUILD',
        'Principal Contractor',
        'draft',
        'advanced',
        'swms',
        '\${safe(swmsBodyJson)}',
        1,
        NOW(), NOW()
      )
    \`));

    return res.json({ ok: true, action: 'inserted', id: result?.insertId ?? null });
  } catch (err) {
    console.error('seed error:', err);
    return res.status(500).json({ error: String(err) });
  }
}`;
}

const CORRECT_IMPORT = `import { getPlatformOwnerInfo } from '../../../../lib/platform-owner-guard.js';`;
const OLD_IMPORT = `import { getSessionAndProfile } from '../../../../lib/auth-middleware.js';`;

// Old auth block (still present in 13 files)
const OLD_AUTH_BLOCK = `  const auth = await getSessionAndProfile(req, res);
  if (!auth) return;

  const [ownerCheck] = await db.execute(sql.raw(
    \`SELECT role FROM profiles WHERE user_id = '\${auth.session.user.id}' LIMIT 1\`
  )) as unknown as [Array<{ role: string }>, unknown];

  if (ownerCheck?.[0]?.role !== 'platform_owner') {
    return res.status(403).json({ error: 'Platform owner access required' });
  }`;

const NEW_AUTH_BLOCK = `  const info = await getPlatformOwnerInfo(req);
  if (!info) return res.status(401).json({ error: 'Unauthorised' });
  if (!info.isPlatformOwner) return res.status(403).json({ error: 'Platform owner access required' });`;

let fixed = 0;

for (const dir of dirs) {
  const file = join(BASE, dir, 'POST.ts');
  let src = readFileSync(file, 'utf8');

  // Step 1: Fix import
  if (src.includes(OLD_IMPORT)) {
    src = src.replace(OLD_IMPORT, CORRECT_IMPORT);
  }

  // Step 2: Fix old auth block if still present
  if (src.includes('const auth = await getSessionAndProfile')) {
    src = src.replace(OLD_AUTH_BLOCK, NEW_AUTH_BLOCK);
  }

  // Step 3: Find the SWMS data variable name
  const swmsVarMatch = src.match(/^const (SWMS_DATA|[A-Z_]+_SWMS)\s*=/m);
  const swmsVar = swmsVarMatch ? swmsVarMatch[1] : null;
  if (!swmsVar) {
    console.log(`SKIP (no swms var): ${dir}`);
    writeFileSync(file, src, 'utf8'); // still save import/auth fixes
    continue;
  }

  // Step 4: Find the end of the auth check line and replace everything after it
  const authCheckStr = 'if (!info.isPlatformOwner)';
  const authPos = src.indexOf(authCheckStr);
  if (authPos === -1) {
    console.log(`SKIP (no auth check after fix): ${dir}`);
    writeFileSync(file, src, 'utf8');
    continue;
  }
  const authLineEnd = src.indexOf('\n', authPos) + 1;

  // Replace everything from after the auth line to end of file
  src = src.slice(0, authLineEnd) + '\n' + newHandlerBody(`${swmsVar}.title`, swmsVar) + '\n';

  writeFileSync(file, src, 'utf8');
  console.log(`FIXED: ${dir} (${swmsVar})`);
  fixed++;
}

console.log(`\nDone. Fixed: ${fixed} / ${dirs.length}`);
