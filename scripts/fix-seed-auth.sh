#!/bin/sh
# Fix broken platform-owner auth in all 24 seed endpoints
DIR="src/server/api/owner-console/swms"

for f in $DIR/seed-*/POST.ts; do
  # 1. Fix import
  sed -i "s|import { getSessionAndProfile } from '../../../../lib/auth-middleware.js';|import { getPlatformOwnerInfo } from '../../../../lib/platform-owner-guard.js';|g" "$f"

  # 2. Fix handler body — replace old 8-line auth block with 3-line correct version
  perl -i -0pe '
    s/const auth = await getSessionAndProfile\(req, res\);\n  if \(!auth\) return;\n\n  const \[ownerCheck\] = await db\.execute\(sql\.raw\(\n    `SELECT role FROM profiles WHERE user_id = '"'"'\$\{auth\.session\.user\.id\}'"'"' LIMIT 1`\n  \)\) as unknown as \[Array<\{ role: string \}>, unknown\];\n\n  if \(ownerCheck\?\.\[0\]\?\.role !== '"'"'platform_owner'"'"'\) \{\n    return res\.status\(403\)\.json\(\{ error: '"'"'Platform owner access required'"'"' \}\);\n  \}/const info = await getPlatformOwnerInfo(req);\n  if (!info) return res.status(401).json({ error: '"'"'Unauthorised'"'"' });\n  if (!info.isPlatformOwner) return res.status(403).json({ error: '"'"'Platform owner access required'"'"' });/g
  ' "$f"

  echo "Fixed: $f"
done
echo "Done."
