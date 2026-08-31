import { readFileSync } from 'fs';
import mysql from 'mysql2/promise';
import { hashPassword, verifyPassword } from 'better-auth/crypto';

const cfg = JSON.parse(readFileSync('/local/config.json', 'utf-8'));
const db = cfg.DATABASE.VALUE;

const conn = await mysql.createConnection({
  host: db.HOST, port: db.PORT, user: db.USERNAME,
  password: db.PASSWORD, database: db.NAME,
  ssl: { rejectUnauthorized: false },
});

// Check current hash in DB
// Usage: VERIFY_EMAIL=user@example.com npx tsx scripts/verify-and-fix-hash.ts
const targetEmail = process.env.VERIFY_EMAIL || process.argv[2] || '';
if (!targetEmail) {
  console.error('Usage: VERIFY_EMAIL=user@example.com npx tsx scripts/verify-and-fix-hash.ts');
  process.exit(1);
}

const [rows] = await conn.execute(
  `SELECT a.id, a.password, a.updated_at FROM account a
   JOIN user u ON u.id = a.user_id
   WHERE u.email = ? AND a.provider_id = 'credential'`,
  [targetEmail],
) as [Array<Record<string,unknown>>, unknown];

const row = rows[0];
if (!row) { console.log('NO ACCOUNT FOUND'); process.exit(1); }

const pw = row.password as string;
console.log('account_id:', row.id);
console.log('updated_at:', row.updated_at);
console.log('pw_prefix:', pw.substring(0, 15));
console.log('is_bcrypt:', pw.startsWith('$2'));
console.log('is_scrypt:', /^[0-9a-f]+:[0-9a-f]+$/.test(pw));

// If still bcrypt, force-write scrypt NOW
if (pw.startsWith('$2')) {
  console.log('\n[fix] Still bcrypt — force-writing scrypt hash now...');
  const tempPw = 'Temp7e3c1e47!';
  const hash = await hashPassword(tempPw);
  console.log('new hash prefix:', hash.substring(0, 15));
  
  const [r] = await conn.execute(
    `UPDATE account SET password = ?, updated_at = NOW() WHERE id = ?`,
    [hash, row.id]
  ) as [{ affectedRows: number }, unknown];
  console.log('rows updated:', r.affectedRows);

  // Verify immediately
  const [check] = await conn.execute(
    `SELECT LEFT(password,15) as prefix FROM account WHERE id = ?`, [row.id]
  ) as [Array<{prefix:string}>, unknown];
  console.log('verified prefix after write:', check[0]?.prefix);

  // Also verify the password works
  const [full] = await conn.execute(
    `SELECT password FROM account WHERE id = ?`, [row.id]
  ) as [Array<{password:string}>, unknown];
  const ok = await verifyPassword({ hash: full[0].password, password: tempPw });
  console.log('verifyPassword result:', ok);
} else {
  // Already scrypt — verify temp password works
  console.log('\n[check] Already scrypt — verifying temp password...');
  const ok = await verifyPassword({ hash: pw, password: 'Temp7e3c1e47!' });
  console.log('verifyPassword("Temp7e3c1e47!"):', ok);
}

await conn.end();
