/**
 * POST /api/team/schedule/migrate
 * Creates the team_shifts and team_time_entries tables if they don't exist.
 * Idempotent — safe to call multiple times.
 */
import type { Request, Response } from 'express';
import { db } from '../../../../db/client.js';
import { sql } from 'drizzle-orm';
import { getAuth } from '../../../../../lib/auth/auth.js';
import { profiles } from '../../../../db/schema.js';
import { eq } from 'drizzle-orm';

export default async function handler(req: Request, res: Response) {
  try {
    const auth = getAuth();
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) {
      if (v) headers.set(k, Array.isArray(v) ? v[0] : v);
    }
    const session = await auth.api.getSession({ headers });
    if (!session?.user) return res.status(401).json({ error: 'Unauthorised' });

    const profile = await db.query.profiles.findFirst({ where: eq(profiles.userId, session.user.id) });
    if (!profile?.companyId) return res.status(403).json({ error: 'No company' });

    // Only owner/admin can run migrations
    if (!['owner', 'admin'].includes(profile.role ?? '')) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS team_shifts (
        id              INT AUTO_INCREMENT PRIMARY KEY,
        company_id      INT NOT NULL,
        profile_id      INT NOT NULL,
        job_id          INT,
        title           VARCHAR(255) NOT NULL DEFAULT 'Shift',
        shift_date      DATE NOT NULL,
        start_time      TIME NOT NULL,
        end_time        TIME NOT NULL,
        break_minutes   INT NOT NULL DEFAULT 0,
        status          ENUM('scheduled','confirmed','completed','cancelled') NOT NULL DEFAULT 'scheduled',
        notes           TEXT,
        created_by      INT,
        created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_ts_company (company_id),
        INDEX idx_ts_profile (profile_id),
        INDEX idx_ts_date (shift_date)
      )
    `);

    await db.execute(sql`
      CREATE TABLE IF NOT EXISTS team_time_entries (
        id              INT AUTO_INCREMENT PRIMARY KEY,
        company_id      INT NOT NULL,
        profile_id      INT NOT NULL,
        shift_id        INT,
        job_id          INT,
        entry_date      DATE NOT NULL,
        clock_in        DATETIME NOT NULL,
        clock_out       DATETIME,
        break_minutes   INT NOT NULL DEFAULT 0,
        total_minutes   INT GENERATED ALWAYS AS (
          CASE WHEN clock_out IS NOT NULL
            THEN TIMESTAMPDIFF(MINUTE, clock_in, clock_out) - break_minutes
            ELSE NULL
          END
        ) STORED,
        hourly_rate     DECIMAL(10,2),
        notes           TEXT,
        approved_by     INT,
        approved_at     DATETIME,
        status          ENUM('pending','approved','rejected') NOT NULL DEFAULT 'pending',
        created_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        updated_at      DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_tte_company (company_id),
        INDEX idx_tte_profile (profile_id),
        INDEX idx_tte_date (entry_date)
      )
    `);

    res.json({ ok: true, message: 'Team scheduling tables ready' });
  } catch (err) {
    console.error('Team schedule migrate error:', err);
    res.status(500).json({ error: 'Migration failed', detail: String(err) });
  }
}
