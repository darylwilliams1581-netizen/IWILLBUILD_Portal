/**
 * POST /api/migrate-attendance
 * Platform owner only. Idempotent.
 *
 * Creates:
 *   - job_attendance   : portal user sign-in/out records
 *   - guest_checkins   : unauthenticated QR guest records
 *   - qr_tokens        : short-lived signed QR tokens (optional audit trail)
 */
import type { Request, Response } from 'express';
import { db } from '../../db/client.js';
import { sql } from 'drizzle-orm';

export default async function handler(_req: Request, res: Response) {
  const results: string[] = [];

  async function tryExec(label: string, query: string) {
    try {
      await db.execute(sql.raw(query));
      results.push(`✅ ${label}`);
    } catch (err) {
      const msg = String(err);
      if (
        msg.includes('Duplicate') ||
        msg.includes('already exists') ||
        msg.includes('Multiple primary key')
      ) {
        results.push(`⚠️  ${label}: already exists`);
      } else {
        results.push(`❌ ${label}: ${msg.slice(0, 300)}`);
      }
    }
  }

  // ── 1. job_attendance ─────────────────────────────────────────────────────
  await tryExec('Create job_attendance', `
    CREATE TABLE IF NOT EXISTS job_attendance (
      id            INT PRIMARY KEY AUTO_INCREMENT,
      company_id    INT          NOT NULL,
      job_id        INT          NOT NULL,
      user_id       VARCHAR(36)  NOT NULL,
      action        VARCHAR(20)  NOT NULL,
      source        VARCHAR(20)  NOT NULL DEFAULT 'portal',
      actor_type    VARCHAR(30)  NOT NULL DEFAULT 'employee',
      notes         TEXT         NULL,
      created_at    TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_ja_job       (job_id),
      INDEX idx_ja_user      (user_id),
      INDEX idx_ja_company   (company_id),
      INDEX idx_ja_created   (created_at),
      FOREIGN KEY (job_id)    REFERENCES jobs(id)      ON DELETE CASCADE,
      FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
    )
  `);

  // ── 2. guest_checkins ─────────────────────────────────────────────────────
  await tryExec('Create guest_checkins', `
    CREATE TABLE IF NOT EXISTS guest_checkins (
      id                  INT PRIMARY KEY AUTO_INCREMENT,
      company_id          INT          NOT NULL,
      job_id              INT          NOT NULL,
      session_id          VARCHAR(64)  NOT NULL,
      action              VARCHAR(20)  NOT NULL,
      actor_type          VARCHAR(30)  NOT NULL DEFAULT 'guest',
      full_name           VARCHAR(255) NOT NULL,
      phone_number        VARCHAR(50)  NOT NULL,
      email               VARCHAR(255) NULL,
      white_card_number   VARCHAR(100) NOT NULL,
      white_card_expiry   VARCHAR(20)  NOT NULL,
      contact_name        VARCHAR(255) NOT NULL,
      contact_phone       VARCHAR(50)  NOT NULL,
      reason_for_visit    TEXT         NOT NULL,
      qr_token_id         VARCHAR(64)  NULL,
      source              VARCHAR(20)  NOT NULL DEFAULT 'qr',
      created_at          TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_gc_job       (job_id),
      INDEX idx_gc_company   (company_id),
      INDEX idx_gc_session   (session_id),
      INDEX idx_gc_created   (created_at),
      FOREIGN KEY (job_id)     REFERENCES jobs(id)      ON DELETE CASCADE,
      FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
    )
  `);

  // ── 3. qr_tokens (audit trail — optional) ────────────────────────────────
  await tryExec('Create qr_tokens', `
    CREATE TABLE IF NOT EXISTS qr_tokens (
      id          VARCHAR(64)  PRIMARY KEY,
      company_id  INT          NOT NULL,
      job_id      INT          NOT NULL,
      action      VARCHAR(20)  NOT NULL,
      actor_type  VARCHAR(30)  NOT NULL DEFAULT 'guest',
      issued_by   VARCHAR(36)  NULL,
      expires_at  TIMESTAMP    NOT NULL,
      used_at     TIMESTAMP    NULL,
      revoked     TINYINT(1)   NOT NULL DEFAULT 0,
      created_at  TIMESTAMP    DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_qt_job     (job_id),
      INDEX idx_qt_company (company_id),
      INDEX idx_qt_expires (expires_at),
      FOREIGN KEY (job_id)     REFERENCES jobs(id)      ON DELETE CASCADE,
      FOREIGN KEY (company_id) REFERENCES companies(id) ON DELETE CASCADE
    )
  `);

  const ok = results.every((r) => !r.startsWith('❌'));
  res.json({ ok, results });
}
