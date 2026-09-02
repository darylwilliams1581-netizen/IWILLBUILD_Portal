/**
 * fix-seed-remaining.mjs
 * Fixes the 13 remaining seed endpoints that have a different auth block format.
 * Replaces the entire handler function body.
 */
import { readFileSync, writeFileSync, readdirSync } from 'fs';
import { join } from 'path';

const BASE = 'src/server/api/owner-console/swms';
const dirs = readdirSync(BASE).filter(d => d.startsWith('seed-'));

function newHandlerBody(titleExpr, swmsVar) {
  return `export default async function handler(req, res) {
  const info = await getPlatformOwnerInfo(req);
  if (!info) return res.status(401).json({ error: 'Unauthorised' });
  if (!info.isPlatformOwner) return res.status(403).json({ error: 'Platform owner access required' });

  const replace = req.query.replace === '1' || req.body?.replace === true;

  try {
    const title = ${titleExpr};
    const swmsBodyJson = JSON.stringify(${swmsVar});
    const safe = (s) => s.replace(/\\\\/g, '\\\\\\\\').replace(/'/g, "\\\\'");

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

    const [result] = await db.execute(sql.raw(\`
      INSERT INTO swms_templates
        (company_id, title, category, revision_number, author_name, approved_by_name,
         status, build_mode, document_type, swms_body, is_platform_master, created_at, updated_at)
      VALUES (
        NULL,
        '\${safe(title)}',
        'General Construction / Site Works',
        '1',
        'Site Supervisor / IWIllBUIlD',
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

let fixed = 0;

for (const dir of dirs) {
  const file = join(BASE, dir, 'POST.ts');
  let src = readFileSync(file, 'utf8');

  // Only process files that still have the old auth pattern
  if (!src.includes('const auth = await getSessionAndProfile') && !src.includes("role !== 'platform_owner'")) {
    // Already fixed
    continue;
  }

  // Fix import
  src = src.replace(
    `import { getSessionAndProfile } from '../../../../lib/auth-middleware.js';`,
    `import { getPlatformOwnerInfo } from '../../../../lib/platform-owner-guard.js';`
  );

  // Find SWMS variable
  const swmsVarMatch = src.match(/^const (SWMS_DATA|[A-Z_]+_SWMS)\s*=/m);
  const swmsVar = swmsVarMatch ? swmsVarMatch[1] : null;
  if (!swmsVar) {
    console.log(`SKIP (no swms var): ${dir}`);
    writeFileSync(file, src, 'utf8');
    continue;
  }

  // Find the handler function start and replace everything from there to end of file
  const handlerIdx = src.indexOf('\nexport default async function handler');
  if (handlerIdx === -1) {
    console.log(`SKIP (no handler): ${dir}`);
    writeFileSync(file, src, 'utf8');
    continue;
  }

  // Keep everything before the handler (imports + data constant)
  const before = src.slice(0, handlerIdx + 1); // +1 to keep the \n

  src = before + newHandlerBody(`${swmsVar}.title`, swmsVar) + '\n';

  writeFileSync(file, src, 'utf8');
  console.log(`FIXED: ${dir} (${swmsVar})`);
  fixed++;
}

console.log(`\nDone. Fixed: ${fixed}`);
