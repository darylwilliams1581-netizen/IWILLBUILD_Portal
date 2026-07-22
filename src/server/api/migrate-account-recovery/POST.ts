/**
 * POST /api/migrate-account-recovery
 * Owner-only. Creates tables and columns needed for:
 *   - password_reset_tokens
 *   - sms_verification_codes
 *   - trusted_devices
 *   - phone_number column on user table
 *   - verification_method + verified_by + verified_at on user table
 *   - manual_verification_log table
 */
import type { Request, Response } from 'express';
import { db } from '../../db/client.js';
import { sql } from 'drizzle-orm';

export default async function handler(_req: Request, res: Response) {
  const results: string[] = [];

  async function run(label: string, query: string) {
    try {
      await db.execute(sql.raw(query));
      results.push(`✓ ${label}`);
    } catch (e: unknown) {
      const msg = String(e);
      if (
        msg.includes('Duplicate column') ||
        msg.includes('already exists') ||
        msg.includes('ER_DUP_FIELDNAME') ||
        msg.includes('ER_TABLE_EXISTS_ERROR')
      ) {
        results.push(`— ${label} (already exists)`);
      } else {
        results.push(`✗ ${label}: ${msg}`);
      }
    }
  }

  // ── password_reset_tokens ──────────────────────────────────────────────────
  await run('Create password_reset_tokens table', `
    CREATE TABLE IF NOT EXISTS password_reset_tokens (
      id VARCHAR(36) NOT NULL PRIMARY KEY,
      user_id VARCHAR(36) NOT NULL,
      token_hash VARCHAR(64) NOT NULL,
      expires_at TIMESTAMP NOT NULL,
      used_at TIMESTAMP NULL DEFAULT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_prt_user (user_id),
      INDEX idx_prt_hash (token_hash)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  // ── sms_verification_codes ─────────────────────────────────────────────────
  await run('Create sms_verification_codes table', `
    CREATE TABLE IF NOT EXISTS sms_verification_codes (
      id VARCHAR(36) NOT NULL PRIMARY KEY,
      user_id VARCHAR(36) NOT NULL,
      code_hash VARCHAR(64) NOT NULL,
      phone VARCHAR(30) NOT NULL,
      expires_at TIMESTAMP NOT NULL,
      attempts INT NOT NULL DEFAULT 0,
      verified_at TIMESTAMP NULL DEFAULT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_svc_user (user_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  // ── trusted_devices ────────────────────────────────────────────────────────
  await run('Create trusted_devices table', `
    CREATE TABLE IF NOT EXISTS trusted_devices (
      id VARCHAR(36) NOT NULL PRIMARY KEY,
      user_id VARCHAR(36) NOT NULL,
      device_name VARCHAR(255) NULL,
      device_fingerprint VARCHAR(255) NOT NULL,
      pin_hash VARCHAR(255) NULL,
      pin_attempts INT NOT NULL DEFAULT 0,
      pin_locked_until TIMESTAMP NULL DEFAULT NULL,
      last_used_at TIMESTAMP NULL DEFAULT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_td_user (user_id),
      INDEX idx_td_fingerprint (device_fingerprint)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  // ── manual_verification_log ────────────────────────────────────────────────
  await run('Create manual_verification_log table', `
    CREATE TABLE IF NOT EXISTS manual_verification_log (
      id INT NOT NULL AUTO_INCREMENT PRIMARY KEY,
      target_user_id VARCHAR(36) NOT NULL,
      verified_by_user_id VARCHAR(36) NOT NULL,
      method VARCHAR(30) NOT NULL DEFAULT 'manual_admin',
      note TEXT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_mvl_target (target_user_id),
      INDEX idx_mvl_verifier (verified_by_user_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4
  `);

  // ── Add phone_number to user table ─────────────────────────────────────────
  await run('Add phone_number to user', `
    ALTER TABLE user ADD COLUMN phone_number VARCHAR(30) NULL
  `);

  // ── Add verification_method to user table ──────────────────────────────────
  await run('Add verification_method to user', `
    ALTER TABLE user ADD COLUMN verification_method VARCHAR(30) NULL
  `);

  res.json({ ok: true, results });
}
