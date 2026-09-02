import { readFileSync, writeFileSync, readdirSync } from 'fs';
import { join } from 'path';

const BASE = 'src/server/api/owner-console/swms';
const dirs = readdirSync(BASE).filter(d => d.startsWith('seed-'));

function newBody(titleExpr, swmsVar) {
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

  const authEnd = src.indexOf('if (!info.isPlatformOwner)');
  if (authEnd === -1) { console.log(`SKIP: ${file}`); continue; }
  const authLineEnd = src.indexOf('\n', authEnd) + 1;

  // Find the SWMS data variable name — handles FENCING_SWMS, SWMS_DATA, MANUAL_HANDLING_SWMS etc.
  const swmsVarMatch = src.match(/^const (SWMS_DATA|[A-Z_]+_SWMS)\s*=/m);
  const swmsVar = swmsVarMatch ? swmsVarMatch[1] : null;
  if (!swmsVar) { console.log(`SKIP (no swms var): ${file}`); continue; }

  const newSrc = src.slice(0, authLineEnd) + '\n' + newBody(`${swmsVar}.title`, swmsVar) + '\n';
  writeFileSync(file, newSrc, 'utf8');
  console.log(`FIXED: ${dir} (${swmsVar})`);
  fixed++;
}

console.log(`\nDone. Fixed: ${fixed}`);
