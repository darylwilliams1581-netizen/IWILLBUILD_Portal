import { readFileSync } from 'node:fs';
import mysql from 'mysql2/promise';
const config = JSON.parse(readFileSync('/local/config.json', 'utf-8'));
const db = config.DATABASE.VALUE;
const conn = await mysql.createConnection({
  host: db.HOST || db.IP, port: parseInt(db.PORT || '3306'),
  user: db.USERNAME, password: db.PASSWORD, database: db.NAME,
  ssl: { rejectUnauthorized: false },
});
const [userCols] = await conn.execute('SHOW COLUMNS FROM `user`');
console.log('user cols:', userCols.map(r => r.Field).join(', '));
const [tables] = await conn.execute('SHOW TABLES');
console.log('tables:', tables.map(r => Object.values(r)[0]).join(', '));
await conn.end();
