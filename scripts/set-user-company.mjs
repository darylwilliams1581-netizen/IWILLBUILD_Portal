// One-shot script: move a user to a different company with a specified role
// Usage: node scripts/set-user-company.mjs <email> [companyId] [role]
//   EMAIL        — required: user email address (CLI arg or SET_USER_EMAIL env var)
//   companyId    — optional: target company ID (default: 5)
//   role         — optional: target role (default: member)
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import mysql from 'mysql2/promise';

const EMAIL = process.argv[2] || process.env.SET_USER_EMAIL || '';
if (!EMAIL) {
  console.error('Usage: node scripts/set-user-company.mjs <email> [companyId] [role]');
  console.error('  or set SET_USER_EMAIL environment variable');
  process.exit(1);
}
const TARGET_COMPANY_ID = parseInt(process.argv[3] || process.env.SET_USER_COMPANY_ID || '5', 10);
const TARGET_ROLE = process.argv[4] || process.env.SET_USER_ROLE || 'member'; // no owner permissions

const configPath = join(process.env.NOMAD_TASK_DIR || '/local', 'config.json');
if (!existsSync(configPath)) {
  console.error('Config not found at', configPath);
  process.exit(1);
}

const config = JSON.parse(readFileSync(configPath, 'utf-8'));
const db = config.DATABASE?.VALUE;
if (!db) { console.error('No DATABASE.VALUE in config'); process.exit(1); }

const conn = await mysql.createConnection({
  host: db.HOST || db.IP,
  port: parseInt(db.PORT || '3306'),
  user: db.USERNAME,
  password: db.PASSWORD,
  database: db.NAME,
  ssl: { rejectUnauthorized: false },
});

// Find user
const [[user]] = await conn.execute('SELECT id, email FROM `user` WHERE email = ? LIMIT 1', [EMAIL]);
if (!user) { console.error('User not found:', EMAIL); await conn.end(); process.exit(1); }
console.log('Found user:', user.id, user.email);

// Find target company
const [[company]] = await conn.execute('SELECT id, name FROM companies WHERE id = ? LIMIT 1', [TARGET_COMPANY_ID]);
if (!company) { console.error('Company not found:', TARGET_COMPANY_ID); await conn.end(); process.exit(1); }
console.log('Target company:', company.id, company.name);

// Get current profile
const [[profile]] = await conn.execute('SELECT id, company_id, role FROM profiles WHERE user_id = ? LIMIT 1', [user.id]);
if (!profile) { console.error('Profile not found for user'); await conn.end(); process.exit(1); }
console.log('Current profile — company_id:', profile.company_id, 'role:', profile.role);

// Update
await conn.execute(
  'UPDATE profiles SET company_id = ?, role = ?, home_icon_permissions = NULL WHERE user_id = ?',
  [TARGET_COMPANY_ID, TARGET_ROLE, user.id]
);

console.log(`✅ Done — moved ${EMAIL} to company ${TARGET_COMPANY_ID} (${company.name}) as role="${TARGET_ROLE}"`);
await conn.end();
