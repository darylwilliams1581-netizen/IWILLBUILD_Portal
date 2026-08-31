/**
 * delete-user.mjs
 * Usage: node scripts/delete-user.mjs <email>
 * Removes a user and all their related records from the platform.
 * Safe to run multiple times (idempotent).
 */
import { readFileSync } from 'node:fs';
import mysql from 'mysql2/promise';

const email = process.argv[2];
if (!email) {
  console.error('Usage: node scripts/delete-user.mjs <email>');
  process.exit(1);
}

const config = JSON.parse(readFileSync('/local/config.json', 'utf-8'));
const db = config.DATABASE.VALUE;
const conn = await mysql.createConnection({
  host: db.HOST || db.IP, port: parseInt(db.PORT || '3306'),
  user: db.USERNAME, password: db.PASSWORD, database: db.NAME,
  ssl: { rejectUnauthorized: false },
});

// 1. Find the user
const [[user]] = await conn.execute('SELECT id, name, email FROM `user` WHERE email = ? LIMIT 1', [email]);
if (!user) {
  console.log(`❌ No user found with email: ${email}`);
  await conn.end();
  process.exit(0);
}
console.log(`Found user: ${user.name} (${user.email}) — id: ${user.id}`);

const uid = user.id;

// 2. Delete child records in dependency order
const steps = [
  // Auth / session tables
  ['session',                   'user_id'],
  ['account',                   'user_id'],
  ['verification',              'identifier'],   // identifier = email for email-based verification
  ['trusted_devices',           'user_id'],
  ['sms_verification_codes',    'user_id'],
  ['password_reset_tokens',     'user_id'],
  ['manual_verification_log',   'user_id'],
  ['push_subscriptions',        'user_id'],
  // Profile / company membership
  ['profiles',                  'user_id'],
  ['company_members',           'user_id'],
  ['company_invites',           'invited_by'],
  // Activity / audit
  ['user_activity_events',      'user_id'],
  ['platform_activity_log',     'user_id'],
  ['dazza_audit_log',           'user_id'],
  ['developer_audit_log',       'user_id'],
  ['support_audit_events',      'user_id'],
  // Notifications
  ['notifications',             'user_id'],
  // Dazza / AI
  ['dazza_threads',             'user_id'],
  ['dazza_brain_entries',       'user_id'],
  ['dazza_brain_interactions',  'user_id'],
  ['dazza_hive_pending',        'user_id'],
];

for (const [table, col] of steps) {
  try {
    const [res] = await conn.execute(`DELETE FROM \`${table}\` WHERE \`${col}\` = ?`, [uid]);
    if (res.affectedRows > 0) console.log(`  ✓ Deleted ${res.affectedRows} row(s) from ${table}`);
  } catch (e) {
    // Column may not exist on this table — skip silently
    if (e.code !== 'ER_BAD_FIELD_ERROR') console.warn(`  ⚠ ${table}: ${e.message}`);
  }
}

// verification table uses email as identifier
try {
  const [res] = await conn.execute('DELETE FROM `verification` WHERE `identifier` = ?', [email]);
  if (res.affectedRows > 0) console.log(`  ✓ Deleted ${res.affectedRows} row(s) from verification (by email)`);
} catch (_) {}

// 3. Delete the user record itself
const [final] = await conn.execute('DELETE FROM `user` WHERE id = ?', [uid]);
console.log(`\n✅ User deleted: ${user.name} (${email}) — ${final.affectedRows} user row removed`);

await conn.end();
