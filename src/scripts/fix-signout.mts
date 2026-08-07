import { db } from '../server/db/client.js';
import { sql } from 'drizzle-orm';

// Show all stuck open sign-ins
const stuck = await db.execute(sql.raw(`
  SELECT 
    ja.user_id,
    ja.job_id,
    j.name as job_name,
    SUM(CASE WHEN ja.action = 'signin' THEN 1 ELSE 0 END) AS ins,
    SUM(CASE WHEN ja.action = 'signout' THEN 1 ELSE 0 END) AS outs,
    MAX(CASE WHEN ja.action = 'signin' THEN ja.created_at END) AS last_signin
  FROM job_attendance ja
  LEFT JOIN jobs j ON j.id = ja.job_id
  GROUP BY ja.user_id, ja.job_id, j.name
  HAVING ins > outs
  ORDER BY last_signin DESC
  LIMIT 20
`)) as unknown as [Array<Record<string,unknown>>, unknown];

const rows = stuck[0];
console.log('Open sign-ins found:', rows.length);
console.log(JSON.stringify(rows, null, 2));

// Force sign-out all of them
for (const row of rows) {
  const userId = String(row.user_id).replace(/'/g, '');
  const jobId = Number(row.job_id);
  console.log(`\nForce signing out user ${userId} from job ${jobId} (${row.job_name})...`);
  
  const ins = Number(row.ins);
  const outs = Number(row.outs);
  const needed = ins - outs;
  
  for (let i = 0; i < needed; i++) {
    await db.execute(sql.raw(`
      INSERT INTO job_attendance (company_id, job_id, user_id, action, source, actor_type, notes)
      SELECT company_id, ${jobId}, '${userId}', 'signout', 'admin_script', 'system', 'Manual force sign-out via admin script'
      FROM jobs WHERE id = ${jobId} LIMIT 1
    `));
  }
  console.log(`  ✓ Inserted ${needed} signout record(s)`);
}

console.log('\nDone. All stuck sign-ins cleared.');
process.exit(0);
