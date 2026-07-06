import { readdirSync, readFileSync, writeFileSync } from 'fs';
import { join, relative } from 'path';

const base = 'src/server';

function fixFile(filePath) {
  const rel = relative(base, filePath);
  const depth = rel.split('/').length - 1;
  const prefix = '../'.repeat(depth);
  let content = readFileSync(filePath, 'utf8');
  content = content.replace(/from '(\.\.\/)+db\/client\.js'/g, `from '${prefix}db/client.js'`);
  content = content.replace(/from '(\.\.\/)+lib\/auth-middleware\.js'/g, `from '${prefix}lib/auth-middleware.js'`);
  content = content.replace(/from '(\.\.\/)+lib\/share-tokens\.js'/g, `from '${prefix}lib/share-tokens.js'`);
  content = content.replace(/from '(\.\.\/)+lib\/push-notifications\.js'/g, `from '${prefix}lib/push-notifications.js'`);
  writeFileSync(filePath, content);
}

function walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) walk(full);
    else if (entry.name.endsWith('.ts')) fixFile(full);
  }
}

walk('src/server/api/asset-manager');
console.log('done');
