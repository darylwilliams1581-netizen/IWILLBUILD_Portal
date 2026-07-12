import { readFileSync, writeFileSync, readdirSync } from 'fs';
import { join } from 'path';

const BASE = 'src/server/api/owner-console/swms';
const dirs = readdirSync(BASE).filter(d => d.startsWith('seed-'));

const OLD = `  const auth = await getSessionAndProfile(req, res);
  if (!auth) return;

  const [ownerCheck] = await db.execute(sql.raw(
    \`SELECT role FROM profiles WHERE user_id = '\${auth.session.user.id}' LIMIT 1\`
  )) as unknown as [Array<{ role: string }>, unknown];

  if (ownerCheck?.[0]?.role !== 'platform_owner') {
    return res.status(403).json({ error: 'Platform owner access required' });
  }`;

const NEW = `  const info = await getPlatformOwnerInfo(req);
  if (!info) return res.status(401).json({ error: 'Unauthorised' });
  if (!info.isPlatformOwner) return res.status(403).json({ error: 'Platform owner access required' });`;

// Also remove unused db/sql imports if they were only used for the auth check
let fixed = 0, skipped = 0;

for (const dir of dirs) {
  const file = join(BASE, dir, 'POST.ts');
  let src = readFileSync(file, 'utf8');

  if (!src.includes('const auth = await getSessionAndProfile')) {
    console.log(`SKIP (already fixed): ${file}`);
    skipped++;
    continue;
  }

  src = src.replace(OLD, NEW);

  // Remove the now-unused sql import line if sql is only used in the auth block
  // (keep it if it's used elsewhere in the file for actual queries)
  // Actually sql IS used for the seed queries, so leave it.

  writeFileSync(file, src, 'utf8');
  console.log(`FIXED: ${file}`);
  fixed++;
}

console.log(`\nDone. Fixed: ${fixed}, Skipped: ${skipped}`);
