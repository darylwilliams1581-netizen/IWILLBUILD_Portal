// One-shot: promote daryl to owner at IOR + create dummy member for testing
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import mysql from 'mysql2/promise';

const configPath = join(process.env.NOMAD_TASK_DIR || '/local', 'config.json');
const config = JSON.parse(readFileSync(configPath, 'utf-8'));
const db = config.DATABASE.VALUE;

const conn = await mysql.createConnection({
  host: db.HOST || db.IP,
  port: parseInt(db.PORT || '3306'),
  user: db.USERNAME,
  password: db.PASSWORD,
  database: db.NAME,
  ssl: { rejectUnauthorized: false },
});

// 1. Promote Daryl to owner at IOR, grant all perms, clear icon perms so they re-seed as full set
await conn.execute(
  `UPDATE profiles SET role='owner', perm_admin=1, perm_jobs=1, perm_fleet=1, perm_forms=1,
   perm_files=1, perm_estimating=1, perm_dazza_ai=1, perm_see_dollars=1, perm_invite_users=1,
   perm_delete_records=1, perm_invoices=1, home_icon_permissions=NULL WHERE user_id=?`,
  ['Oe5rznU69wcQHY6nD1LqseCAz6mXD5qe']
);
console.log('✅ Daryl promoted to owner at IOR (company 5)');

// 2. Check if dummy user already exists
const [[existing]] = await conn.execute(
  'SELECT id FROM `user` WHERE email=? LIMIT 1',
  ['dummy.employee@ior.test']
);

if (existing) {
  console.log('Dummy user already exists, skipping creation');
} else {
  // 3. Create dummy user
  const dummyId = 'DUMMYIOR0000000000000000000000001';
  await conn.execute(
    'INSERT INTO `user` (id, email, name, email_verified, created_at, updated_at) VALUES (?,?,?,1,NOW(),NOW())',
    [dummyId, 'dummy.employee@ior.test', 'Test Employee']
  );
  console.log('✅ Dummy user created: dummy.employee@ior.test');

  // 4. Create profile for dummy at IOR as member with minimal permissions
  await conn.execute(
    `INSERT INTO profiles (user_id, company_id, role, perm_admin, perm_jobs, perm_fleet, perm_forms,
     perm_files, perm_estimating, perm_dazza_ai, perm_see_dollars, perm_invite_users,
     perm_delete_records, perm_invoices, home_icon_permissions, created_at, updated_at)
     VALUES (?,5,'member',0,0,0,0,0,0,0,0,0,0,0,NULL,NOW(),NOW())`,
    [dummyId]
  );
  console.log('✅ Dummy profile created as member at IOR');
}

// 5. Show all IOR members
const [all] = await conn.execute(
  `SELECT u.email, p.role, p.perm_admin FROM profiles p
   JOIN \`user\` u ON u.id=p.user_id
   JOIN companies c ON c.id=p.company_id
   WHERE p.company_id=5`
);
console.log('IOR members:', JSON.stringify(all, null, 2));

await conn.end();
